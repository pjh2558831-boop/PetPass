-- Enable the one remaining registered region for the shared progressive KTO
-- catalog. Existing Busan publication rows remain active until a complete
-- staged run is atomically finalized by finalize_tour_catalog_run_v1.

do $$
declare
  v_updated_region_count integer;
  v_busan_district_count integer;
begin
  if exists (
    select 1
    from public.map_ingest_runs
    where provider = 'tour'
      and status in ('planned', 'running', 'partial')
  ) then
    raise exception using
      errcode = '55000',
      message = 'complete or fail open KTO runs before enabling Busan coverage';
  end if;

  select count(*)
  into v_busan_district_count
  from public.region_districts
  where region_id = 'busan';

  if v_busan_district_count <> 16 then
    raise exception using
      errcode = '23514',
      message = 'Busan must have exactly 16 registered districts';
  end if;

  update public.regions
  set kto_collection_enabled = true,
      kto_registry_version = 'tour-busan-service2-v1',
      kto_collection_west = 128.75,
      kto_collection_south = 34.95,
      kto_collection_east = 129.4,
      kto_collection_north = 35.5,
      kto_catalog_datasets = array['core', 'shopping']::text[],
      kto_list_only_content_type_ids = array[38]::integer[]
  where region_id = 'busan';

  get diagnostics v_updated_region_count = row_count;
  if v_updated_region_count <> 1 then
    raise exception using
      errcode = '23514',
      message = 'Busan region registry row is missing or duplicated';
  end if;
end;
$$;
