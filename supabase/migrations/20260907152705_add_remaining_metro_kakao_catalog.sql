-- Reuse the established region-isolated collector contract, preserving all existing rows.
set lock_timeout = '5s';
set local search_path = public, extensions;
do $migration$
declare
  r record;
  v_constraint text;
  v_branches text := '';
  v_start text;
  v_commit text;
  v_sql text;
  v_address text;
  v_signature text;
begin
  select pg_get_constraintdef(oid) into strict v_constraint
  from pg_constraint where conrelid='public.map_places'::regclass and conname='map_places_kakao_catalog_shape_check';
  select pg_get_functiondef(oid) into strict v_start from pg_proc
  where pronamespace='public'::regnamespace and proname='start_kakao_jeonbuk_catalog_run_v1';
  select pg_get_functiondef(oid) into strict v_commit from pg_proc
  where pronamespace='public'::regnamespace and proname='commit_kakao_jeonbuk_catalog_query_v1';
  if position('ELSE false' in v_constraint)=0 or position('434' in v_start)=0
    or position('candidate.longitude < 125.8' in v_commit)=0 then
    raise exception 'Expected regional catalog template is missing';
  end if;

  for r in select * from (values
    ('daejeon','대전','대전|대전광역시',155,127.18,127.57,36.14,36.52),
    ('daegu','대구','대구|대구광역시',279,128.32,129.0,35.55,36.5),
    ('gwangju','광주','광주|광주광역시|전남광주통합특별시',155,126.62,127.02,34.95,35.35),
    ('ulsan','울산','울산|울산광역시',155,128.95,129.5,35.3,35.75),
    ('sejong','세종','세종|세종특별자치시',31,127.08,127.47,36.34,36.72)
  ) as regions(id,label,prefixes,queries,west,east,south,north) loop
    if exists(select 1 from public.map_places where provider='kakao' and region_id=r.id) then
      raise exception 'Expected an uncollected target region: %', r.id;
    end if;
    v_address := quote_literal('^(' || r.prefixes || ')[[:space:]]+') ||
      case when r.id='sejong' then ' || ''.+''' else ' || district_name || ''([[:space:]]|$)''' end;
    v_branches := v_branches || format(
      ' WHEN %L THEN ( (nullif(btrim(road_address), '''') is null or road_address ~ (%s))
      and (nullif(btrim(lot_address), '''') is null or lot_address ~ (%s))
      and extensions.st_x(location::extensions.geometry) between %s and %s
      and extensions.st_y(location::extensions.geometry) between %s and %s ) ',
      r.id,v_address,v_address,r.west,r.east,r.south,r.north);

    v_sql := replace(replace(replace(v_start,'jeonbuk',r.id),'434',r.queries::text),'전북 ',r.label || ' ');
    if r.id='sejong' then
      v_sql := replace(v_sql,'''세종 '' || districts.district || '' '' ||','''세종 '' ||');
    end if;
    execute v_sql;
    v_sql := replace(replace(v_commit,'jeonbuk',r.id),'전북|전라북도|전북특별자치도',r.prefixes);
    v_sql := replace(v_sql,'candidate.longitude < 125.8','candidate.longitude < ' || r.west);
    v_sql := replace(v_sql,'candidate.longitude > 127.95','candidate.longitude > ' || r.east);
    v_sql := replace(v_sql,'candidate.latitude < 35.25','candidate.latitude < ' || r.south);
    v_sql := replace(v_sql,'candidate.latitude > 36.25','candidate.latitude > ' || r.north);
    if r.id='sejong' then
      v_sql := replace(replace(v_sql,'|| candidate.district_name','|| '''''),'''([[:space:]]|$)''','''.+''');
    end if;
    execute v_sql;
    for v_signature in select p.oid::regprocedure::text from pg_proc p
      where p.pronamespace='public'::regnamespace and p.proname in
      ('start_kakao_' || r.id || '_catalog_run_v1','commit_kakao_' || r.id || '_catalog_query_v1') loop
      execute 'revoke all on function ' || v_signature || ' from public, anon, authenticated';
      execute 'grant execute on function ' || v_signature || ' to service_role';
    end loop;
  end loop;
  execute 'alter table public.map_places drop constraint map_places_kakao_catalog_shape_check';
  execute 'alter table public.map_places add constraint map_places_kakao_catalog_shape_check ' ||
    replace(v_constraint,'ELSE false',v_branches || ' ELSE false');
  update public.regions set kakao_collection_enabled=true
  where region_id in ('daejeon','daegu','gwangju','ulsan','sejong');
end;
$migration$;
