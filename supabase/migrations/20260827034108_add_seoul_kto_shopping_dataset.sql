-- Add the audited Seoul KTO shopping dataset without making it part of the
-- default public map payload. Core and shopping remain one atomic KTO catalog
-- run; dataset is a row attribute, never an independently finalized scope.

do $$
begin
  if exists (
    select 1
    from public.map_ingest_runs as run
    where run.region_id = 'seoul'
      and run.provider = 'tour'
      and run.status in ('planned', 'running', 'partial')
  ) then
    raise exception using
      errcode = '55000',
      message = 'complete or fail the open Seoul KTO run before enabling dataset v2';
  end if;
end;
$$;

alter table public.regions
  drop constraint regions_kto_collection_config_check,
  add column kto_catalog_datasets text[] not null default array['core']::text[],
  add column kto_list_only_content_type_ids integer[] not null default '{}'::integer[],
  add constraint regions_kto_catalog_datasets_check check (
    cardinality(kto_catalog_datasets) between 1 and 2
    and kto_catalog_datasets <@ array['core', 'shopping']::text[]
    and 'core' = any(kto_catalog_datasets)
  ),
  add constraint regions_kto_list_only_content_types_check check (
    kto_list_only_content_type_ids <@ array[38]::integer[]
    and (
      ('shopping' = any(kto_catalog_datasets)) =
      (38 = any(kto_list_only_content_type_ids))
    )
  ),
  add constraint regions_kto_collection_config_check check (
    (
      not kto_collection_enabled
      and kto_registry_version is null
      and kto_collection_west is null
      and kto_collection_south is null
      and kto_collection_east is null
      and kto_collection_north is null
    )
    or (
      kto_collection_enabled
      and kto_catalog_enabled
      and kto_registry_version ~ (
        '^tour-' || region_id || '-service2-v[1-9][0-9]*$'
      )
      and kto_collection_west between -180 and 180
      and kto_collection_east between -180 and 180
      and kto_collection_south between -90 and 90
      and kto_collection_north between -90 and 90
      and kto_collection_west < kto_collection_east
      and kto_collection_south < kto_collection_north
    )
  );

update public.regions
set
  kto_catalog_datasets = array['core', 'shopping']::text[],
  kto_list_only_content_type_ids = array[38]::integer[],
  kto_registry_version = 'tour-seoul-service2-v2'
where region_id = 'seoul'
  and kto_collection_enabled;

alter table public.map_ingest_runs
  drop constraint map_ingest_runs_full_catalog_scope_check;

alter table public.map_ingest_runs
  add constraint map_ingest_runs_full_catalog_scope_check check (
    not is_full_catalog_run
    or (
      provider = 'kakao'
      and registry_version = 'kakao-' || region_id || '-query-registry-v1'
      and planned_query_count > 0
      and (region_id <> 'busan' or planned_query_count = 496)
    )
    or (
      provider = 'tour'
      and registry_version ~ (
        '^tour-' || region_id || '-service2-v[1-9][0-9]*$'
      )
      and planned_query_count > 0
    )
  );

drop index public.map_ingest_runs_one_open_tour_catalog_v1_idx;
create unique index map_ingest_runs_one_open_tour_catalog_v2_idx
  on public.map_ingest_runs (region_id, provider)
  where provider = 'tour' and status in ('planned', 'running', 'partial');

alter table public.map_places
  add column catalog_dataset text not null default 'core',
  add column evidence_collection_mode text not null default 'detailed',
  add constraint map_places_catalog_dataset_check check (
    catalog_dataset in ('core', 'shopping')
  ),
  add constraint map_places_evidence_collection_mode_check check (
    evidence_collection_mode in ('detailed', 'list_only')
  ),
  add constraint map_places_tour_dataset_shape_check check (
    provider <> 'tour'
    or (
      catalog_dataset = 'core'
      and evidence_collection_mode = 'detailed'
    )
    or (
      catalog_dataset = 'shopping'
      and evidence_collection_mode = 'list_only'
      and content_type_id = 38
      and category_group = 'shopping'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    )
  );

alter table public.map_tour_ingest_stage_places
  drop constraint map_tour_ingest_stage_places_category_group_check,
  drop constraint map_tour_ingest_stage_places_content_type_id_check,
  add column catalog_dataset text not null default 'core',
  add column evidence_collection_mode text not null default 'detailed',
  add constraint map_tour_ingest_stage_places_category_group_check check (
    category_group in (
      'attraction', 'culture', 'festival', 'leisure', 'accommodation', 'food', 'shopping'
    )
  ),
  add constraint map_tour_ingest_stage_places_content_type_id_check check (
    content_type_id in (12, 14, 15, 28, 32, 38, 39)
  ),
  add constraint map_tour_ingest_stage_places_dataset_shape_check check (
    (
      catalog_dataset = 'core'
      and evidence_collection_mode = 'detailed'
      and content_type_id in (12, 14, 15, 28, 32, 39)
      and category_group <> 'shopping'
    )
    or (
      catalog_dataset = 'shopping'
      and evidence_collection_mode = 'list_only'
      and content_type_id = 38
      and category_group = 'shopping'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    )
  );

drop trigger map_tour_ingest_stage_places_validate_region_v2
  on public.map_tour_ingest_stage_places;

create or replace function public.map_tour_stage_validate_region_v3()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_region public.regions%rowtype;
begin
  select region.* into v_region
  from public.regions as region
  where region.region_id = new.region_id;

  if not found or not v_region.kto_collection_enabled then
    raise exception using
      errcode = '55000',
      message = 'KTO collection is disabled for region ' || new.region_id;
  end if;

  if not (new.catalog_dataset = any(v_region.kto_catalog_datasets)) then
    raise exception using
      errcode = '23514',
      message = 'KTO catalog dataset is disabled for region';
  end if;

  if
    (new.evidence_collection_mode = 'list_only') is distinct from
      (new.content_type_id = any(v_region.kto_list_only_content_type_ids))
  then
    raise exception using
      errcode = '23514',
      message = 'KTO evidence mode is not allowed by the region capability';
  end if;

  if
    new.longitude not between v_region.kto_collection_west and v_region.kto_collection_east
    or new.latitude not between v_region.kto_collection_south and v_region.kto_collection_north
  then
    raise exception using
      errcode = '23514',
      message = 'KTO stage coordinates are outside the configured region bounds';
  end if;

  return new;
end;
$$;

create trigger map_tour_ingest_stage_places_validate_region_v3
before insert or update of
  region_id,
  catalog_dataset,
  evidence_collection_mode,
  content_type_id,
  longitude,
  latitude
on public.map_tour_ingest_stage_places
for each row execute function public.map_tour_stage_validate_region_v3();

drop function public.map_tour_stage_validate_region_v2();

create or replace function public.commit_tour_catalog_checkpoint_v1(
  p_run_id bigint,
  p_district_code text,
  p_rows jsonb,
  p_audit jsonb,
  p_completed_at timestamptz default now()
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.map_ingest_runs%rowtype;
  v_district_name text;
  v_row_count integer;
begin
  if p_completed_at is null then
    raise exception using errcode = '22004', message = 'completed_at is required';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_typeof(p_audit) <> 'object' then
    raise exception using errcode = '22023', message = 'invalid checkpoint payload';
  end if;
  if
    (p_audit ? 'districtCode' and p_audit->>'districtCode' is distinct from p_district_code)
    or (p_audit->>'rawCount') !~ '^[0-9]+$'
    or (p_audit->>'acceptedCount') !~ '^[0-9]+$'
    or (p_audit->>'rejectedCount') !~ '^[0-9]+$'
    or (p_audit->>'duplicateCount') !~ '^[0-9]+$'
    or (p_audit->>'rawCount')::integer <>
      (p_audit->>'acceptedCount')::integer +
      (p_audit->>'rejectedCount')::integer +
      (p_audit->>'duplicateCount')::integer
    or (
      (p_audit ? 'detailedRecordCount' or p_audit ? 'listOnlyRecordCount')
      and (
        (p_audit->>'detailedRecordCount') !~ '^[0-9]+$'
        or (p_audit->>'listOnlyRecordCount') !~ '^[0-9]+$'
        or (p_audit->>'acceptedCount')::integer <>
          (p_audit->>'detailedRecordCount')::integer +
          (p_audit->>'listOnlyRecordCount')::integer
      )
    )
    or (
      p_audit ? 'datasetCounts'
      and (
        (p_audit #>> '{datasetCounts,core}') !~ '^[0-9]+$'
        or (p_audit #>> '{datasetCounts,shopping}') !~ '^[0-9]+$'
        or (p_audit->>'acceptedCount')::integer <>
          (p_audit #>> '{datasetCounts,core}')::integer +
          (p_audit #>> '{datasetCounts,shopping}')::integer
      )
    )
  then
    raise exception using errcode = '23514', message = 'invalid KTO checkpoint audit';
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
    raise exception using errcode = '55000', message = 'KTO run cannot accept a checkpoint';
  end if;

  select district.district_name into v_district_name
  from public.region_districts as district
  where district.region_id = v_run.region_id
    and district.district_code = p_district_code;
  if not found then
    raise exception using errcode = '23503', message = 'unknown KTO checkpoint district';
  end if;
  if p_audit ? 'districtName' and p_audit->>'districtName' is distinct from v_district_name then
    raise exception using errcode = '23514', message = 'KTO checkpoint audit district mismatch';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as candidate(value)
    where candidate.value->>'region_id' is distinct from v_run.region_id
      or candidate.value->>'provider' is distinct from v_run.provider
      or candidate.value->>'district_code' is distinct from p_district_code
      or candidate.value->>'district_name' is distinct from v_district_name
  ) then
    raise exception using errcode = '23514', message = 'KTO checkpoint row scope mismatch';
  end if;

  if (
    select count(*) <> count(distinct candidate.value->>'provider_place_id')
    from jsonb_array_elements(p_rows) as candidate(value)
  ) then
    raise exception using errcode = '23514', message = 'KTO checkpoint contains duplicate provider identities';
  end if;

  insert into public.map_tour_ingest_checkpoints (
    region_id, provider, collection_run_id, district_code, district_name,
    audit, completed_at, updated_at
  ) values (
    v_run.region_id, v_run.provider, v_run.id, p_district_code,
    v_district_name, p_audit, p_completed_at, p_completed_at
  )
  on conflict (region_id, provider, collection_run_id, district_code)
  do update set
    audit = excluded.audit,
    completed_at = excluded.completed_at,
    updated_at = excluded.updated_at;

  delete from public.map_tour_ingest_stage_places as stage
  where stage.region_id = v_run.region_id
    and stage.provider = v_run.provider
    and stage.collection_run_id = v_run.id
    and stage.district_code = p_district_code;

  insert into public.map_tour_ingest_stage_places (
    region_id, provider, collection_run_id, provider_place_id,
    catalog_dataset, evidence_collection_mode, name, category_group,
    category_code, content_type_id, road_address, lot_address,
    district_code, district_name, longitude, latitude, phone, image_url,
    source_url, provider_visibility, pet_evidence_status, pet_evidence,
    pet_notes, fetched_at, updated_at
  )
  select
    v_run.region_id, v_run.provider, v_run.id, candidate.provider_place_id,
    coalesce(candidate.catalog_dataset, 'core'),
    coalesce(candidate.evidence_collection_mode, 'detailed'),
    candidate.name, candidate.category_group,
    nullif(btrim(candidate.category_code), ''), candidate.content_type_id,
    nullif(btrim(candidate.road_address), ''), nullif(btrim(candidate.lot_address), ''),
    p_district_code, v_district_name, candidate.longitude, candidate.latitude,
    nullif(btrim(candidate.phone), ''), nullif(btrim(candidate.image_url), ''),
    nullif(btrim(candidate.source_url), ''), candidate.provider_visibility,
    candidate.pet_evidence_status, candidate.pet_evidence, candidate.pet_notes,
    candidate.fetched_at, p_completed_at
  from jsonb_to_recordset(p_rows) as candidate (
    region_id text, provider text, provider_place_id text,
    catalog_dataset text, evidence_collection_mode text, name text,
    category_group text, category_code text, content_type_id integer,
    road_address text, lot_address text, district_code text, district_name text,
    longitude double precision, latitude double precision, phone text,
    image_url text, source_url text, provider_visibility text,
    pet_evidence_status text, pet_evidence jsonb, pet_notes text,
    fetched_at timestamptz
  );
  get diagnostics v_row_count = row_count;
  if v_row_count <> (p_audit->>'acceptedCount')::integer then
    raise exception using errcode = '23514', message = 'KTO checkpoint accepted count mismatch';
  end if;

  update public.map_ingest_runs as run
  set
    completed_query_count = aggregate.completed_count,
    attempted_query_count = aggregate.completed_count,
    discovered_row_count = aggregate.raw_count,
    provider_result_count = aggregate.raw_count,
    accepted_result_count = aggregate.accepted_count,
    rejected_result_count = aggregate.rejected_count,
    duplicate_result_count = aggregate.duplicate_count,
    unique_place_count = aggregate.accepted_count
  from (
    select
      count(*)::integer as completed_count,
      coalesce(sum((checkpoint.audit->>'rawCount')::integer), 0)::integer as raw_count,
      coalesce(sum((checkpoint.audit->>'acceptedCount')::integer), 0)::integer as accepted_count,
      coalesce(sum((checkpoint.audit->>'rejectedCount')::integer), 0)::integer as rejected_count,
      coalesce(sum((checkpoint.audit->>'duplicateCount')::integer), 0)::integer as duplicate_count
    from public.map_tour_ingest_checkpoints as checkpoint
    where checkpoint.region_id = v_run.region_id
      and checkpoint.provider = v_run.provider
      and checkpoint.collection_run_id = v_run.id
  ) as aggregate
  where run.id = v_run.id
    and run.region_id = v_run.region_id
    and run.provider = v_run.provider;
end;
$$;

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
  if v_run.is_full_catalog_run and exists (
    select 1
    from unnest(v_required_datasets) as required(dataset)
    where not exists (
      select 1
      from public.map_tour_ingest_stage_places as stage
      where stage.region_id = v_run.region_id
        and stage.provider = v_run.provider
        and stage.collection_run_id = v_run.id
        and stage.catalog_dataset = required.dataset
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'all configured KTO datasets must be staged before full finalization';
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

create function public.get_public_map_catalog_by_region_v3(
  p_region_id text,
  p_catalog_dataset text,
  p_providers text[],
  p_candidate_kinds text[] default null,
  p_normalized_categories text[] default null,
  p_district_codes text[] default null,
  p_after_id bigint default null,
  p_result_limit integer default 200
)
returns table (
  id bigint, provider text, provider_place_id text, name text,
  candidate_kind text, normalized_category text, content_type_id integer,
  district_code text, district_name text, address text,
  latitude double precision, longitude double precision, phone text,
  image_url text, place_url text, review_status text, public_label text,
  source text, pet_access_verdict text, pet_evidence_status text,
  category_group_code text, last_seen_at timestamptz,
  matched_query_count bigint, category_query_agreement_count bigint,
  total_count bigint, has_more boolean
)
language sql
stable
security invoker
set search_path = ''
as $$
  with hit_counts as (
    select
      hit.candidate_id,
      count(distinct hit.query_key) as matched_query_count,
      count(distinct hit.query_key) filter (
        where
          (place.normalized_category = 'cafe' and hit.category_group_code = 'CE7')
          or (place.normalized_category = 'food' and hit.category_group_code = 'FD6')
          or (place.normalized_category = 'accommodation' and hit.category_group_code = 'AD5')
          or (place.normalized_category = 'attraction' and hit.category_group_code = 'AT4')
      ) as category_query_agreement_count
    from public.map_place_query_hits as hit
    join public.map_places as place
      on place.region_id = hit.region_id and place.id = hit.candidate_id
    where hit.region_id = btrim(p_region_id) and place.provider = 'kakao'
    group by hit.candidate_id
  ),
  projected as (
    select
      place.id, place.provider, place.provider_place_id, place.name,
      case when place.provider = 'tour' then 'tourism_place' else place.candidate_kind end as candidate_kind,
      case
        when place.provider = 'tour' and place.category_group in (
          'attraction', 'culture', 'festival', 'leisure'
        ) then 'attraction'
        when place.provider = 'tour' and place.category_group = 'accommodation' then 'accommodation'
        when place.provider = 'tour' and place.category_group = 'food' then 'food'
        when place.provider = 'tour' and place.category_group = 'shopping' then 'shopping'
        else place.normalized_category
      end as normalized_category,
      place.content_type_id, place.district_code, place.district_name,
      coalesce(nullif(btrim(place.road_address), ''), nullif(btrim(place.lot_address), ''), '주소 확인 필요') as address,
      extensions.st_y(place.location::extensions.geometry) as latitude,
      extensions.st_x(place.location::extensions.geometry) as longitude,
      nullif(btrim(place.phone), '') as phone, place.image_url,
      case when place.provider = 'kakao' then place.source_url else null end as place_url,
      case
        when place.provider = 'tour' and place.catalog_dataset = 'shopping' then 'needs_review'
        when place.provider = 'tour' then 'confirmed'
        else place.review_status
      end as review_status,
      case
        when place.provider = 'tour' and place.catalog_dataset = 'shopping' then '반려동물 동반 정보 확인 필요'
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' = 'allowed' then '반려동물 동반 가능'
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' = 'conditional' then '동반 조건 확인 필요'
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' = 'not_allowed' then '반려동물 동반 불가 안내'
        when place.provider = 'tour' then '동반 정보 확인 필요'
        when place.lifecycle_status = 'stale' and place.review_status = 'confirmed' then '재확인 필요'
        when place.candidate_kind = 'veterinary' then '동물병원'
        when place.candidate_kind = 'pet_shop' then '펫샵·용품점'
        else '동반 여부 확인 필요'
      end as public_label,
      case when place.provider = 'tour' then 'kto_official'::text else 'kakao_search_candidate'::text end as source,
      case
        when place.provider = 'tour' and place.catalog_dataset = 'shopping' then 'unknown'
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' in (
          'allowed', 'conditional', 'not_allowed', 'unknown'
        ) then place.pet_evidence #>> '{assessment,verdict}'
        else 'unknown'
      end as pet_access_verdict,
      place.pet_evidence_status,
      case when place.provider = 'tour' then place.category_code else place.category_group_code end as category_group_code,
      place.last_seen_at,
      coalesce(hit_counts.matched_query_count, 0) as matched_query_count,
      coalesce(hit_counts.category_query_agreement_count, 0) as category_query_agreement_count
    from public.map_places as place
    left join hit_counts on hit_counts.candidate_id = place.id
    where place.region_id = btrim(p_region_id)
      and place.catalog_dataset = p_catalog_dataset
      and exists (
        select 1
        from public.regions as region
        where region.region_id = btrim(p_region_id)
          and p_catalog_dataset = any(region.kto_catalog_datasets)
      )
      and cardinality(p_providers) between 1 and 2
      and p_providers <@ array['tour', 'kakao']::text[]
      and place.provider = any(p_providers)
      and place.is_active
      and (
        place.provider = 'tour'
        or (
          p_catalog_dataset = 'core'
          and place.provider = 'kakao'
          and place.public_visibility
          and place.pending_publication_run_id is null
          and (
            place.lifecycle_status = 'current'
            or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed')
          )
        )
      )
  ),
  eligible as (
    select projected.*
    from projected
    where (p_candidate_kinds is null or projected.candidate_kind = any(p_candidate_kinds))
      and (
        p_normalized_categories is null
        or projected.candidate_kind in ('veterinary', 'pet_shop')
        or projected.normalized_category = any(p_normalized_categories)
      )
      and (p_district_codes is null or projected.district_code = any(p_district_codes))
  ),
  counted as (
    select eligible.*, count(*) over () as total_count from eligible
  ),
  result_window as (
    select counted.*
    from counted
    where p_after_id is null or counted.id > p_after_id
    order by counted.id
    limit least(greatest(coalesce(p_result_limit, 200), 1), 200) + 1
  ),
  marked as (
    select result_window.*,
      count(*) over () > least(greatest(coalesce(p_result_limit, 200), 1), 200) as has_more
    from result_window
  )
  select
    marked.id, marked.provider, marked.provider_place_id, marked.name,
    marked.candidate_kind, marked.normalized_category, marked.content_type_id,
    marked.district_code, marked.district_name, marked.address,
    marked.latitude, marked.longitude, marked.phone, marked.image_url,
    marked.place_url, marked.review_status, marked.public_label, marked.source,
    marked.pet_access_verdict, marked.pet_evidence_status,
    marked.category_group_code, marked.last_seen_at, marked.matched_query_count,
    marked.category_query_agreement_count, marked.total_count, marked.has_more
  from marked
  order by marked.id
  limit least(greatest(coalesce(p_result_limit, 200), 1), 200);
$$;

alter table public.map_tour_ingest_stage_places enable row level security;
alter table public.map_places enable row level security;

revoke all on table public.regions from public, anon, authenticated;
revoke all on table public.map_places from public, anon, authenticated;
revoke all on table public.map_tour_ingest_checkpoints from public, anon, authenticated, service_role;
revoke all on table public.map_tour_ingest_stage_places from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.map_tour_ingest_checkpoints to service_role;
grant select, insert, update, delete on table public.map_tour_ingest_stage_places to service_role;

revoke all on function public.map_tour_stage_validate_region_v3()
  from public, anon, authenticated, service_role;
revoke all on function public.commit_tour_catalog_checkpoint_v1(bigint, text, jsonb, jsonb, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_tour_catalog_run_v1(bigint, text, text, timestamptz)
  from public, anon, authenticated, service_role;
revoke all on function public.get_public_map_catalog_by_region_v3(
  text, text, text[], text[], text[], text[], bigint, integer
) from public, anon, authenticated;

grant execute on function public.commit_tour_catalog_checkpoint_v1(bigint, text, jsonb, jsonb, timestamptz)
  to service_role;
grant execute on function public.finalize_tour_catalog_run_v1(bigint, text, text, timestamptz)
  to service_role;
grant execute on function public.get_public_map_catalog_by_region_v3(
  text, text, text[], text[], text[], text[], bigint, integer
) to service_role;

comment on column public.map_places.catalog_dataset is
  'Server-controlled KTO payload partition. core is default; shopping is fetched only on demand.';
comment on column public.map_places.evidence_collection_mode is
  'detailed uses KTO detail evidence; list_only preserves list metadata and requires verification.';
comment on function public.get_public_map_catalog_by_region_v3(
  text, text, text[], text[], text[], text[], bigint, integer
) is
  'Service-only public map projection that filters the regional catalog dataset before pagination.';
