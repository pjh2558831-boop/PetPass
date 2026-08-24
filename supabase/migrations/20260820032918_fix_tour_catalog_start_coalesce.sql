-- PostgreSQL implements COALESCE as SQL syntax rather than a pg_catalog
-- function. The original Phase 3 function therefore created successfully but
-- failed at runtime when validating the Jeju district array.

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
    v_district_count <> coalesce(pg_catalog.array_length(p_district_codes, 1), 0)
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

comment on function public.start_tour_catalog_run_v1(
  text,
  text,
  text,
  text,
  text[],
  timestamptz
) is
  'Service-only Jeju KTO run creation with runtime-safe full district-scope validation.';
