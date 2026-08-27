begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(30);

select extensions.is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)'::regprocedure
  ),
  true,
  'legacy catalog v2 uses a constrained SECURITY DEFINER projection'
);

select extensions.ok(
  (
    select array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)'::regprocedure
  ),
  'legacy catalog v2 has an empty search_path'
);

select extensions.is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_place_location_v1(text)'::regprocedure
  ),
  true,
  'legacy location v1 uses a constrained SECURITY DEFINER projection'
);

select extensions.ok(
  (
    select array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_place_location_v1(text)'::regprocedure
  ),
  'legacy location v1 has an empty search_path'
);

select extensions.ok(
  has_function_privilege(
    'anon',
    'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'anon retains legacy catalog v2 execution for deployed-main compatibility'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'authenticated cannot execute legacy catalog v2'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'service_role does not retain the obsolete legacy catalog surface'
);

select extensions.ok(
  has_function_privilege(
    'anon',
    'public.get_public_map_place_location_v1(text)',
    'execute'
  ),
  'anon retains legacy location v1 execution for deployed-main compatibility'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.get_public_map_place_location_v1(text)',
    'execute'
  ),
  'authenticated cannot execute legacy location v1'
);

select extensions.ok(
  not has_function_privilege(
    'service_role',
    'public.get_public_map_place_location_v1(text)',
    'execute'
  ),
  'service_role does not retain the obsolete legacy location surface'
);

select extensions.is(
  to_regprocedure('public.get_map_places_in_bounds(double precision,double precision,double precision,double precision,text[],text[],integer)'),
  null::regprocedure,
  'unused legacy bounds RPC is removed'
);

select extensions.is(
  to_regprocedure('public.get_public_map_catalog_v1(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)'),
  null::regprocedure,
  'unused legacy catalog v1 RPC is removed'
);

select extensions.is(
  to_regprocedure('public.get_public_map_catalog_by_region_v1(text,double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)'),
  null::regprocedure,
  'unused region catalog v1 RPC is removed'
);

select extensions.ok(
  to_regprocedure('public.get_public_map_place_location_by_region_v1(text,text)') is not null,
  'region location v1 remains for the feature application'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.get_public_map_place_location_by_region_v1(text,text)',
    'execute'
  ),
  'service_role retains region location v1 execution'
);

select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.get_public_map_place_location_by_region_v1(text,text)',
    'execute'
  ),
  'anon cannot execute the server-only region location v1 RPC'
);

select extensions.ok(
  not has_column_privilege('anon', 'public.map_places', 'name', 'select'),
  'anon cannot read public catalog columns directly'
);

select extensions.ok(
  not has_column_privilege('anon', 'public.map_places', 'pet_evidence', 'select'),
  'anon cannot read private pet evidence directly'
);

select extensions.ok(
  not has_column_privilege('authenticated', 'public.map_places', 'name', 'select'),
  'authenticated has no direct map catalog column grant'
);

select extensions.ok(
  not has_column_privilege('anon', 'public.map_place_query_hits', 'query_key', 'select'),
  'anon cannot read query-hit columns directly'
);

select extensions.ok(
  not has_column_privilege('authenticated', 'public.map_place_query_hits', 'query_key', 'select'),
  'authenticated has no direct query-hit column grant'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_policy
    where polrelid = 'public.map_place_query_hits'::regclass
      and polname = 'published Busan query hits are anon-readable'
  ),
  0::bigint,
  'obsolete anon query-hit policy is removed with the raw grant'
);

select extensions.ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.map_places'::regclass
  ),
  'map_places RLS remains enabled'
);

select extensions.ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.map_place_query_hits'::regclass
  ),
  'map_place_query_hits RLS remains enabled'
);

insert into public.map_places (
  region_id,
  provider,
  provider_place_id,
  name,
  category_name,
  normalized_category,
  candidate_kind,
  road_address,
  district_code,
  district_name,
  location,
  source_url,
  provider_visibility,
  pet_evidence_status,
  pet_evidence,
  pet_notes,
  is_active,
  review_status,
  public_visibility,
  lifecycle_status,
  verification_evidence,
  requires_recheck
) values
  (
    'busan',
    'kakao',
    '980000001',
    'RPC security Busan fixture',
    '카페',
    'cafe',
    'pet_travel_candidate',
    '부산광역시 중구 중앙대로 1',
    '110',
    '중구',
    extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
    'https://place.map.kakao.com/980000001',
    'not_applicable',
    'search_candidate',
    '{"source":"test","verification_required":true}'::jsonb,
    'test candidate',
    true,
    'unreviewed',
    true,
    'current',
    '{}'::jsonb,
    false
  ),
  (
    'jeju',
    'kakao',
    '980000002',
    'RPC security Jeju fixture',
    '카페',
    'cafe',
    'pet_travel_candidate',
    '제주특별자치도 제주시 중앙로 1',
    '110',
    '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.53, 33.50), 4326)::extensions.geography,
    'https://place.map.kakao.com/980000002',
    'not_applicable',
    'search_candidate',
    '{"source":"test","verification_required":true}'::jsonb,
    'test candidate',
    true,
    'unreviewed',
    true,
    'current',
    '{}'::jsonb,
    false
  );

create temporary table rpc_role_results (
  metric text primary key,
  value bigint not null
) on commit drop;

create temporary table rpc_fixture_ids (
  provider_place_id text primary key,
  fixture_id bigint not null
) on commit drop;

insert into rpc_fixture_ids (provider_place_id, fixture_id)
select provider_place_id, id
from public.map_places
where provider = 'kakao'
  and provider_place_id in ('980000001', '980000002');

grant insert, select on table rpc_role_results to anon, service_role;
grant select on table rpc_fixture_ids to anon, service_role;

set local role anon;

insert into rpc_role_results (metric, value)
select
  'anon_busan_catalog',
  count(*)
from public.get_public_map_catalog_v2(
  p_after_id => (
    select fixture_id - 1
    from rpc_fixture_ids
    where provider_place_id = '980000001'
  )
)
where provider_place_id = '980000001';

insert into rpc_role_results (metric, value)
select
  'anon_jeju_catalog',
  count(*)
from public.get_public_map_catalog_v2(
  p_after_id => (
    select fixture_id - 1
    from rpc_fixture_ids
    where provider_place_id = '980000002'
  )
)
where provider_place_id = '980000002';

insert into rpc_role_results (metric, value)
select
  'anon_busan_location',
  count(*)
from public.get_public_map_place_location_v1('980000001');

insert into rpc_role_results (metric, value)
select
  'anon_jeju_location',
  count(*)
from public.get_public_map_place_location_v1('980000002');

select extensions.throws_ok(
  'select count(*) from public.map_place_query_hits',
  '42501',
  'permission denied for table map_place_query_hits',
  'anon direct query-hit reads fail closed'
);

reset role;

set local role service_role;

insert into rpc_role_results (metric, value)
select
  'service_region_location',
  count(*)
from public.get_public_map_place_location_by_region_v1('busan', '980000001');

reset role;

select extensions.is(
  (select value from rpc_role_results where metric = 'anon_busan_catalog'),
  1::bigint,
  'anon legacy catalog returns the published Busan fixture'
);

select extensions.is(
  (select value from rpc_role_results where metric = 'anon_jeju_catalog'),
  0::bigint,
  'anon legacy catalog cannot return the Jeju fixture'
);

select extensions.is(
  (select value from rpc_role_results where metric = 'anon_busan_location'),
  1::bigint,
  'anon legacy location returns the published Busan fixture'
);

select extensions.is(
  (select value from rpc_role_results where metric = 'anon_jeju_location'),
  0::bigint,
  'anon legacy location cannot return the Jeju fixture'
);

select extensions.is(
  (select value from rpc_role_results where metric = 'service_region_location'),
  1::bigint,
  'service_role region location v1 continues to work'
);

select * from extensions.finish();

rollback;
