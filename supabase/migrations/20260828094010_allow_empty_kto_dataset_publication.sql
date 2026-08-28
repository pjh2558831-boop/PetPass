-- A fully traversed region may legitimately contain zero rows for one enabled
-- dataset. Require exact per-district dataset accounting instead of requiring
-- at least one staged row for every configured dataset.

create or replace function public.finalize_tour_catalog_run_v1(
  p_run_id bigint,
  p_status text,
  p_sanitized_error_summary text default null,
  p_completed_at timestamptz default now()
)
returns table (
  run_status text,
  inserted_row_count integer,
  updated_row_count integer,
  deactivated_row_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.map_ingest_runs%rowtype;
  v_checkpoint_count integer;
  v_stage_count integer;
  v_dataset_count integer;
  v_required_datasets text[];
  v_inserted integer := 0;
  v_updated integer := 0;
  v_deactivated integer := 0;
  v_upserted integer := 0;
begin
  if p_completed_at is null then
    raise exception using errcode = '22004', message = 'completed_at is required';
  end if;
  if p_status not in ('completed', 'failed') then
    raise exception using errcode = '22023', message = 'invalid KTO final status';
  end if;
  if p_sanitized_error_summary is not null and length(p_sanitized_error_summary) > 1000 then
    raise exception using errcode = '22023', message = 'error summary is too long';
  end if;

  select run.* into v_run
  from public.map_ingest_runs as run
  join public.regions as region
    on region.region_id = run.region_id
    and region.kto_collection_enabled
  where run.id = p_run_id
    and run.provider = 'tour'
  for update of run;
  if not found or v_run.status <> 'running' then
    raise exception using errcode = '55000', message = 'KTO run cannot be finalized';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:tour-catalog-v1:' || v_run.region_id)
  );

  if p_status = 'failed' then
    update public.map_ingest_runs as run
    set status = 'failed', completed_at = p_completed_at,
      sanitized_error_summary = p_sanitized_error_summary
    where run.id = v_run.id
      and run.region_id = v_run.region_id
      and run.provider = v_run.provider;
    return query select 'failed'::text, 0, 0, 0;
    return;
  end if;

  select count(*)::integer into v_checkpoint_count
  from public.map_tour_ingest_checkpoints as checkpoint
  where checkpoint.region_id = v_run.region_id
    and checkpoint.provider = v_run.provider
    and checkpoint.collection_run_id = v_run.id;
  if v_checkpoint_count <> v_run.planned_query_count then
    raise exception using errcode = '55000', message = 'all KTO districts must be checkpointed before finalization';
  end if;

  select count(*)::integer into v_stage_count
  from public.map_tour_ingest_stage_places as stage
  where stage.region_id = v_run.region_id
    and stage.provider = v_run.provider
    and stage.collection_run_id = v_run.id;
  if v_stage_count = 0 then
    raise exception using errcode = '55000', message = 'empty KTO staging catalog cannot be finalized';
  end if;

  select region.kto_catalog_datasets into v_required_datasets
  from public.regions as region
  where region.region_id = v_run.region_id;
  if v_run.is_full_catalog_run then
    if exists (
      select 1
      from public.map_tour_ingest_checkpoints as checkpoint
      cross join unnest(v_required_datasets) as required(dataset)
      where checkpoint.region_id = v_run.region_id
        and checkpoint.provider = v_run.provider
        and checkpoint.collection_run_id = v_run.id
        and (
          jsonb_typeof(checkpoint.audit->'datasetCounts') <> 'object'
          or coalesce(
            checkpoint.audit->'datasetCounts'->>required.dataset,
            ''
          ) !~ '^[0-9]+$'
        )
    ) then
      raise exception using
        errcode = '23514',
        message = 'KTO checkpoint dataset accounting is incomplete';
    end if;

    select coalesce(sum(
      (checkpoint.audit->'datasetCounts'->>required.dataset)::integer
    ), 0)::integer into v_dataset_count
    from public.map_tour_ingest_checkpoints as checkpoint
    cross join unnest(v_required_datasets) as required(dataset)
    where checkpoint.region_id = v_run.region_id
      and checkpoint.provider = v_run.provider
      and checkpoint.collection_run_id = v_run.id;
    if v_dataset_count <> v_stage_count then
      raise exception using
        errcode = '23514',
        message = 'KTO checkpoint dataset count does not match staging';
    end if;
  end if;

  if exists (
    select 1
    from public.map_tour_ingest_stage_places as stage
    join public.map_places as place
      on place.provider = stage.provider
      and place.provider_place_id = stage.provider_place_id
    where stage.region_id = v_run.region_id
      and stage.provider = v_run.provider
      and stage.collection_run_id = v_run.id
      and place.region_id <> v_run.region_id
  ) then
    raise exception using errcode = '23514', message = 'KTO provider identity belongs to another region';
  end if;

  select count(*)::integer into v_updated
  from public.map_tour_ingest_stage_places as stage
  join public.map_places as place
    on place.region_id = v_run.region_id
    and place.provider = v_run.provider
    and place.provider_place_id = stage.provider_place_id
  where stage.region_id = v_run.region_id
    and stage.provider = v_run.provider
    and stage.collection_run_id = v_run.id;
  v_inserted := v_stage_count - v_updated;

  insert into public.map_places (
    region_id, provider, provider_place_id, catalog_dataset,
    evidence_collection_mode, name, category_group, category_code,
    content_type_id, road_address, lot_address, district_code, district_name,
    location, phone, image_url, source_url, provider_visibility,
    pet_evidence_status, pet_evidence, pet_notes, is_active,
    last_seen_run_id, first_seen_at, last_seen_at, fetched_at, expires_at,
    created_at, updated_at
  )
  select
    stage.region_id, stage.provider, stage.provider_place_id,
    stage.catalog_dataset, stage.evidence_collection_mode, stage.name,
    stage.category_group, stage.category_code, stage.content_type_id,
    stage.road_address, stage.lot_address, stage.district_code,
    stage.district_name,
    extensions.st_setsrid(
      extensions.st_makepoint(stage.longitude, stage.latitude), 4326
    )::extensions.geography,
    stage.phone, stage.image_url, stage.source_url, stage.provider_visibility,
    stage.pet_evidence_status, stage.pet_evidence, stage.pet_notes, true,
    v_run.id, stage.fetched_at, stage.fetched_at, stage.fetched_at, null,
    stage.fetched_at, p_completed_at
  from public.map_tour_ingest_stage_places as stage
  where stage.region_id = v_run.region_id
    and stage.provider = v_run.provider
    and stage.collection_run_id = v_run.id
  on conflict (provider, provider_place_id) do update
  set
    region_id = excluded.region_id,
    catalog_dataset = excluded.catalog_dataset,
    evidence_collection_mode = excluded.evidence_collection_mode,
    name = excluded.name,
    category_group = excluded.category_group,
    category_code = excluded.category_code,
    content_type_id = excluded.content_type_id,
    road_address = excluded.road_address,
    lot_address = excluded.lot_address,
    district_code = excluded.district_code,
    district_name = excluded.district_name,
    location = excluded.location,
    phone = excluded.phone,
    image_url = excluded.image_url,
    source_url = excluded.source_url,
    provider_visibility = excluded.provider_visibility,
    pet_evidence_status = excluded.pet_evidence_status,
    pet_evidence = excluded.pet_evidence,
    pet_notes = excluded.pet_notes,
    is_active = true,
    last_seen_run_id = excluded.last_seen_run_id,
    last_seen_at = excluded.last_seen_at,
    fetched_at = excluded.fetched_at,
    expires_at = null,
    updated_at = excluded.updated_at
  where map_places.region_id = v_run.region_id
    and map_places.provider = v_run.provider;
  get diagnostics v_upserted = row_count;
  if v_upserted <> v_stage_count then
    raise exception using errcode = '23514', message = 'KTO finalization did not upsert every staged record';
  end if;

  if v_run.is_full_catalog_run then
    update public.map_places as place
    set is_active = false, updated_at = p_completed_at
    where place.region_id = v_run.region_id
      and place.provider = v_run.provider
      and place.is_active
      and not exists (
        select 1
        from public.map_tour_ingest_stage_places as stage
        where stage.region_id = v_run.region_id
          and stage.provider = v_run.provider
          and stage.collection_run_id = v_run.id
          and stage.provider_place_id = place.provider_place_id
      );
    get diagnostics v_deactivated = row_count;
  end if;

  update public.map_ingest_runs as run
  set status = 'completed', completed_at = p_completed_at,
    completed_query_count = v_checkpoint_count, unique_place_count = v_stage_count,
    inserted_row_count = v_inserted, updated_row_count = v_updated,
    deactivated_row_count = v_deactivated, sanitized_error_summary = null
  where run.id = v_run.id
    and run.region_id = v_run.region_id
    and run.provider = v_run.provider;

  return query select 'completed'::text, v_inserted, v_updated, v_deactivated;
end;
$$;
