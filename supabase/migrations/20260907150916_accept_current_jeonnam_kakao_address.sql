-- Accept the provider's current prefix only within the existing Jeonnam district whitelist.
set lock_timeout = '5s';
do $migration$
declare
  v_constraint text;
  v_function text;
begin
  select pg_get_constraintdef(oid) into strict v_constraint
  from pg_constraint where conrelid='public.map_places'::regclass and conname='map_places_kakao_catalog_shape_check';
  select pg_get_functiondef(p.oid) into strict v_function
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname='commit_kakao_jeonnam_catalog_query_v1';
  if position('전남|전라남도' in v_constraint)=0 or position('전남|전라남도' in v_function)=0 then
    raise exception 'Expected Jeonnam address contract is missing';
  end if;
  execute 'alter table public.map_places drop constraint map_places_kakao_catalog_shape_check';
  execute 'alter table public.map_places add constraint map_places_kakao_catalog_shape_check ' ||
    replace(v_constraint, '전남|전라남도', '전남|전라남도|전남광주통합특별시');
  execute replace(v_function, '전남|전라남도', '전남|전라남도|전남광주통합특별시');
end;
$migration$;
