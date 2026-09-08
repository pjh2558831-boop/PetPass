-- Preserve the existing RPC contract and grants; evaluate search-hit aggregation once.
set lock_timeout = '5s';
do $migration$
declare
  v_definition text;
begin
  select pg_get_functiondef(oid) into strict v_definition
  from pg_proc where pronamespace='public'::regnamespace
    and proname='get_public_map_catalog_by_region_v4';
  if position('with hit_counts as (' in v_definition)=0 then
    raise exception 'Expected catalog hit-count query is missing';
  end if;
  execute replace(v_definition,'with hit_counts as (','with hit_counts as materialized (');
end;
$migration$;
