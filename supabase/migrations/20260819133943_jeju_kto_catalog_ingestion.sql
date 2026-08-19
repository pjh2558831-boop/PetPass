-- Jeju KTO Service2 catalog ingestion.
--
-- Collection remains server-only and Jeju remains absent from the public map
-- capability in this phase. Provider work is staged by region/provider/run and
-- becomes visible only inside the successful finalization transaction.

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
      and region_id = 'jeju'
      and registry_version = 'tour-' || region_id || '-service2-v1'
      and planned_query_count = 2
    )
  ),
  add constraint map_ingest_runs_region_provider_identity_key unique (
    region_id,
    provider,
    id
  );

create unique index map_ingest_runs_one_open_tour_catalog_v1_idx
  on public.map_ingest_runs (region_id, provider)
  where
    provider = 'tour'
    and registry_version = 'tour-' || region_id || '-service2-v1'
    and status in ('planned', 'running', 'partial');

create table public.map_tour_ingest_checkpoints (
  id bigint generated always as identity primary key,
  region_id text not null,
  provider text not null check (provider = 'tour'),
  collection_run_id bigint not null,
  district_code text not null,
  district_name text not null,
  audit jsonb not null check (jsonb_typeof(audit) = 'object'),
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_tour_ingest_checkpoints_region_check check (
    region_id = 'jeju'
  ),
  constraint map_tour_ingest_checkpoints_identity_key unique (
    region_id,
    provider,
    collection_run_id,
    district_code
  ),
  constraint map_tour_ingest_checkpoints_run_fkey foreign key (
    region_id,
    provider,
    collection_run_id
  ) references public.map_ingest_runs (
    region_id,
    provider,
    id
  ) on delete cascade,
  constraint map_tour_ingest_checkpoints_district_fkey foreign key (
    region_id,
    district_code,
    district_name
  ) references public.region_districts (
    region_id,
    district_code,
    district_name
  )
);

create table public.map_tour_ingest_stage_places (
  region_id text not null,
  provider text not null check (provider = 'tour'),
  collection_run_id bigint not null,
  provider_place_id text not null check (provider_place_id ~ '^[1-9][0-9]*$'),
  name text not null check (length(btrim(name)) > 0),
  category_group text not null check (
    category_group in (
      'attraction',
      'culture',
      'festival',
      'leisure',
      'accommodation',
      'food'
    )
  ),
  category_code text,
  content_type_id integer not null check (
    content_type_id in (12, 14, 15, 28, 32, 39)
  ),
  road_address text,
  lot_address text,
  district_code text not null,
  district_name text not null,
  longitude double precision not null check (longitude between -180 and 180),
  latitude double precision not null check (latitude between -90 and 90),
  phone text,
  image_url text,
  source_url text,
  provider_visibility text not null check (
    provider_visibility in (
      'exposed',
      'not_exposed',
      'unknown',
      'provider_unavailable'
    )
  ),
  pet_evidence_status text not null check (
    pet_evidence_status in ('official_verified', 'official_unknown')
  ),
  pet_evidence jsonb not null check (jsonb_typeof(pet_evidence) = 'object'),
  pet_notes text not null,
  fetched_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_tour_ingest_stage_places_region_check check (
    region_id = 'jeju'
  ),
  primary key (region_id, provider, collection_run_id, provider_place_id),
  constraint map_tour_ingest_stage_places_checkpoint_fkey foreign key (
    region_id,
    provider,
    collection_run_id,
    district_code
  ) references public.map_tour_ingest_checkpoints (
    region_id,
    provider,
    collection_run_id,
    district_code
  ) on delete cascade,
  constraint map_tour_ingest_stage_places_district_fkey foreign key (
    region_id,
    district_code,
    district_name
  ) references public.region_districts (
    region_id,
    district_code,
    district_name
  ),
  constraint map_tour_ingest_stage_places_region_bounds_check check (
    region_id <> 'jeju'
    or (
      longitude between 125.9 and 127.1
      and latitude between 33.0 and 34.0
    )
  )
);

alter table public.map_tour_ingest_checkpoints enable row level security;
alter table public.map_tour_ingest_stage_places enable row level security;

revoke all on table public.map_tour_ingest_checkpoints from public, anon, authenticated, service_role;
revoke all on table public.map_tour_ingest_stage_places from public, anon, authenticated, service_role;
revoke all on sequence public.map_tour_ingest_checkpoints_id_seq from public, anon, authenticated, service_role;

grant select, insert, update, delete on table public.map_tour_ingest_checkpoints to service_role;
grant select, insert, update, delete on table public.map_tour_ingest_stage_places to service_role;
grant usage, select on sequence public.map_tour_ingest_checkpoints_id_seq to service_role;

create or replace function public.start_tour_catalog_run_v1(
  p_region_id text,
  p_registry_version text,
  p_collector_version text,
  p_run_scope text,
  p_district_codes text[],
  p_started_at timestamptz default now()
)
returns table (
  run_id bigint,
  planned_district_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_district_count integer;
begin
  if p_region_id <> 'jeju' then
    raise exception using errcode = '22023', message = 'Jeju KTO collector requires region jeju';
  end if;
  if p_registry_version <> 'tour-' || p_region_id || '-service2-v1' then
    raise exception using errcode = '22023', message = 'invalid KTO registry version';
  end if;
  if p_collector_version is null or length(btrim(p_collector_version)) = 0 then
    raise exception using errcode = '22023', message = 'collector version is required';
  end if;
  if p_run_scope not in ('full', 'delta') then
    raise exception using errcode = '22023', message = 'invalid KTO run scope';
  end if;
  if p_started_at is null then
    raise exception using errcode = '22004', message = 'started_at is required';
  end if;

  select count(*)::integer
  into v_district_count
  from public.region_districts as district
  where district.region_id = p_region_id
    and district.district_code = any(p_district_codes);

  if
    v_district_count <> pg_catalog.coalesce(pg_catalog.array_length(p_district_codes, 1), 0)
    or v_district_count <> 2
    or pg_catalog.array_position(p_district_codes, '110') is null
    or pg_catalog.array_position(p_district_codes, '130') is null
  then
    raise exception using errcode = '23514', message = 'invalid Jeju KTO district scope';
  end if;

  insert into public.map_ingest_runs (
    region_id,
    provider,
    status,
    started_at,
    collector_version,
    registry_version,
    is_full_catalog_run,
    planned_query_count
  ) values (
    p_region_id,
    'tour',
    'running',
    p_started_at,
    p_collector_version,
    p_registry_version,
    p_run_scope = 'full',
    v_district_count
  )
  returning id into v_run_id;

  return query select v_run_id, v_district_count;
end;
$$;

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

  select run.* into v_run
  from public.map_ingest_runs as run
  where run.id = p_run_id
    and run.region_id = 'jeju'
    and run.provider = 'tour'
  for update;

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

  insert into public.map_tour_ingest_checkpoints (
    region_id,
    provider,
    collection_run_id,
    district_code,
    district_name,
    audit,
    completed_at,
    updated_at
  ) values (
    v_run.region_id,
    v_run.provider,
    v_run.id,
    p_district_code,
    v_district_name,
    p_audit,
    p_completed_at,
    p_completed_at
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
    region_id,
    provider,
    collection_run_id,
    provider_place_id,
    name,
    category_group,
    category_code,
    content_type_id,
    road_address,
    lot_address,
    district_code,
    district_name,
    longitude,
    latitude,
    phone,
    image_url,
    source_url,
    provider_visibility,
    pet_evidence_status,
    pet_evidence,
    pet_notes,
    fetched_at,
    updated_at
  )
  select
    v_run.region_id,
    v_run.provider,
    v_run.id,
    candidate.provider_place_id,
    candidate.name,
    candidate.category_group,
    nullif(btrim(candidate.category_code), ''),
    candidate.content_type_id,
    nullif(btrim(candidate.road_address), ''),
    nullif(btrim(candidate.lot_address), ''),
    p_district_code,
    v_district_name,
    candidate.longitude,
    candidate.latitude,
    nullif(btrim(candidate.phone), ''),
    nullif(btrim(candidate.image_url), ''),
    nullif(btrim(candidate.source_url), ''),
    candidate.provider_visibility,
    candidate.pet_evidence_status,
    candidate.pet_evidence,
    candidate.pet_notes,
    candidate.fetched_at,
    p_completed_at
  from jsonb_to_recordset(p_rows) as candidate (
    region_id text,
    provider text,
    provider_place_id text,
    name text,
    category_group text,
    category_code text,
    content_type_id integer,
    road_address text,
    lot_address text,
    district_code text,
    district_name text,
    longitude double precision,
    latitude double precision,
    phone text,
    image_url text,
    source_url text,
    provider_visibility text,
    pet_evidence_status text,
    pet_evidence jsonb,
    pet_notes text,
    fetched_at timestamptz
  );
  get diagnostics v_row_count = row_count;

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

  if v_row_count <> (p_audit->>'acceptedCount')::integer then
    raise exception using errcode = '23514', message = 'KTO checkpoint accepted count mismatch';
  end if;
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
  where run.id = p_run_id
    and run.region_id = 'jeju'
    and run.provider = 'tour'
  for update;
  if not found or v_run.status <> 'running' then
    raise exception using errcode = '55000', message = 'KTO run cannot be finalized';
  end if;

  if p_status = 'failed' then
    update public.map_ingest_runs as run
    set
      status = 'failed',
      completed_at = p_completed_at,
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
    region_id,
    provider,
    provider_place_id,
    name,
    category_group,
    category_code,
    content_type_id,
    road_address,
    lot_address,
    district_code,
    district_name,
    location,
    phone,
    image_url,
    source_url,
    provider_visibility,
    pet_evidence_status,
    pet_evidence,
    pet_notes,
    is_active,
    last_seen_run_id,
    first_seen_at,
    last_seen_at,
    fetched_at,
    expires_at,
    created_at,
    updated_at
  )
  select
    stage.region_id,
    stage.provider,
    stage.provider_place_id,
    stage.name,
    stage.category_group,
    stage.category_code,
    stage.content_type_id,
    stage.road_address,
    stage.lot_address,
    stage.district_code,
    stage.district_name,
    extensions.st_setsrid(
      extensions.st_makepoint(stage.longitude, stage.latitude),
      4326
    )::extensions.geography,
    stage.phone,
    stage.image_url,
    stage.source_url,
    stage.provider_visibility,
    stage.pet_evidence_status,
    stage.pet_evidence,
    stage.pet_notes,
    true,
    v_run.id,
    stage.fetched_at,
    stage.fetched_at,
    stage.fetched_at,
    null,
    stage.fetched_at,
    p_completed_at
  from public.map_tour_ingest_stage_places as stage
  where stage.region_id = v_run.region_id
    and stage.provider = v_run.provider
    and stage.collection_run_id = v_run.id
  on conflict (provider, provider_place_id) do update
  set
    region_id = excluded.region_id,
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
    raise exception using
      errcode = '23514',
      message = 'KTO finalization did not upsert every staged record';
  end if;

  if v_run.is_full_catalog_run then
    update public.map_places as place
    set
      is_active = false,
      updated_at = p_completed_at
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
  set
    status = 'completed',
    completed_at = p_completed_at,
    completed_query_count = v_checkpoint_count,
    unique_place_count = v_stage_count,
    inserted_row_count = v_inserted,
    updated_row_count = v_updated,
    deactivated_row_count = v_deactivated,
    sanitized_error_summary = null
  where run.id = v_run.id
    and run.region_id = v_run.region_id
    and run.provider = v_run.provider;

  return query select 'completed'::text, v_inserted, v_updated, v_deactivated;
end;
$$;

revoke all on function public.start_tour_catalog_run_v1(
  text,
  text,
  text,
  text,
  text[],
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.start_tour_catalog_run_v1(
  text,
  text,
  text,
  text,
  text[],
  timestamptz
) to service_role;

revoke all on function public.commit_tour_catalog_checkpoint_v1(
  bigint,
  text,
  jsonb,
  jsonb,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.commit_tour_catalog_checkpoint_v1(
  bigint,
  text,
  jsonb,
  jsonb,
  timestamptz
) to service_role;

revoke all on function public.finalize_tour_catalog_run_v1(
  bigint,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;
grant execute on function public.finalize_tour_catalog_run_v1(
  bigint,
  text,
  text,
  timestamptz
) to service_role;

comment on table public.map_tour_ingest_checkpoints is
  'Server-only KTO district checkpoints scoped by region, provider, and run.';
comment on table public.map_tour_ingest_stage_places is
  'Unpublished KTO catalog rows; successful atomic finalization is required before map activation.';
comment on function public.finalize_tour_catalog_run_v1(
  bigint,
  text,
  text,
  timestamptz
) is
  'Service-only KTO finalization. Upsert and full-run stale deactivation are restricted to the run region and tour provider.';
