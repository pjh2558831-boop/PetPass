begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(17);

select extensions.is(
  (
    select count(*)
    from public.region_districts
    where district_code = '110'
  ),
  2::bigint,
  'Busan and Jeju district code 110 coexist'
);

select extensions.is(
  (
    select district_name
    from public.region_districts
    where region_id = 'busan' and district_code = '110'
  ),
  '중구',
  'Busan district 110 remains Jung-gu'
);

select extensions.is(
  (
    select district_name
    from public.region_districts
    where region_id = 'jeju' and district_code = '110'
  ),
  '제주시',
  'Jeju district 110 resolves to Jeju City'
);

select extensions.throws_ok(
  $invalid_pair$
    insert into public.map_places (
      region_id,
      provider,
      provider_place_id,
      name,
      road_address,
      district_code,
      district_name,
      location,
      provider_visibility,
      pet_evidence_status
    ) values (
      'busan',
      'tour',
      'invalid-region-district-pair',
      'invalid pair',
      '부산광역시 중구 중앙대로 1',
      '110',
      '제주시',
      extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
      'unknown',
      'official_unknown'
    )
  $invalid_pair$,
  '23503',
  'insert or update on table "map_places" violates foreign key constraint "map_places_region_district_fkey"',
  'invalid region and district pairs are rejected'
);

select extensions.throws_ok(
  $jeju_collection_disabled$
    insert into public.map_ingest_runs (
      region_id,
      provider,
      status,
      collector_version,
      registry_version,
      planned_query_count
    ) values (
      'jeju',
      'kakao',
      'running',
      'test-collector',
      'kakao-jeju-query-registry-v1',
      1
    )
  $jeju_collection_disabled$,
  '55000',
  'Kakao collection is disabled for region jeju',
  'Jeju Kakao collection remains disabled in Phase 1'
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
  requires_recheck,
  first_seen_at,
  last_seen_at,
  fetched_at,
  created_at,
  updated_at
) values
  (
    'busan', 'kakao', '900000001', 'Busan region test', '카페', 'cafe',
    'pet_travel_candidate', '부산광역시 중구 중앙대로 1', '110', '중구',
    extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
    'https://place.map.kakao.com/900000001', 'not_applicable', 'search_candidate',
    '{"source":"test","verification_required":true}'::jsonb,
    'test candidate', true, 'unreviewed', true, 'current', '{}'::jsonb, false,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  ),
  (
    'jeju', 'kakao', '900000002', 'Jeju region test', '카페', 'cafe',
    'pet_travel_candidate', '제주특별자치도 제주시 중앙로 1', '110', '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.53, 33.50), 4326)::extensions.geography,
    'https://place.map.kakao.com/900000002', 'not_applicable', 'search_candidate',
    '{"source":"test","verification_required":true}'::jsonb,
    'test candidate', true, 'unreviewed', true, 'current', '{}'::jsonb, false,
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z',
    '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'
  );

select extensions.is(
  (
    select count(*)
    from public.get_public_map_catalog_v2()
    where provider_place_id = '900000001'
  ),
  1::bigint,
  'the existing public catalog still returns Busan rows'
);

select extensions.is(
  (
    select count(*)
    from public.get_public_map_catalog_v2()
    where provider_place_id = '900000002'
  ),
  0::bigint,
  'a Jeju row is excluded from the Busan public catalog query'
);

create temporary table test_anon_region_visibility (
  region_id text primary key,
  visible_count bigint not null
) on commit drop;
grant insert, select on table test_anon_region_visibility to anon;

set local role anon;
insert into test_anon_region_visibility (region_id, visible_count)
select region_id, count(*)
from public.map_places
where provider_place_id in ('900000001', '900000002')
group by region_id;
reset role;

select extensions.is(
  (
    select visible_count
    from test_anon_region_visibility
    where region_id = 'busan'
  ),
  1::bigint,
  'anonymous direct reads retain the existing Busan RLS behavior'
);

select extensions.is(
  (
    select count(*)
    from test_anon_region_visibility
    where region_id = 'jeju'
  ),
  0::bigint,
  'anonymous direct reads cannot expose Jeju rows in Phase 1'
);

create temporary table test_region_runs (
  region_id text primary key,
  run_id bigint not null
) on commit drop;

with inserted_run as (
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
    'busan',
    'kakao',
    'running',
    '2026-08-01T00:00:00Z',
    'test-collector',
    'kakao-busan-query-registry-v1',
    true,
    496
  ) returning id
)
insert into test_region_runs (region_id, run_id)
select 'busan', id from inserted_run;

insert into public.map_ingest_run_queries (
  region_id,
  collection_run_id,
  query_key,
  query_text,
  district_code,
  district,
  candidate_kind,
  normalized_category,
  status,
  last_completed_page,
  provider_call_count,
  completed_at
)
select
  'busan',
  run.run_id,
  'test-busan-' || series.value,
  '부산 중구 test ' || series.value,
  '110',
  '중구',
  'pet_travel_candidate',
  'other',
  'completed',
  1,
  1,
  '2026-08-01T01:00:00Z'
from test_region_runs as run
cross join generate_series(1, 496) as series(value)
where run.region_id = 'busan';

do $finalize_busan$
begin
  perform *
  from public.finalize_kakao_catalog_run_v1(
    (select run_id from test_region_runs where region_id = 'busan'),
    'completed',
    p_completed_at => '2026-08-01T02:00:00Z'
  );
end;
$finalize_busan$;

select extensions.is(
  (select lifecycle_status from public.map_places where provider_place_id = '900000001'),
  'stale',
  'Busan full-run finalization stales an older Busan row'
);

select extensions.is(
  (select lifecycle_status from public.map_places where provider_place_id = '900000002'),
  'current',
  'Busan full-run finalization does not stale a Jeju row'
);

update public.map_places
set
  lifecycle_status = 'current',
  public_visibility = true,
  is_active = true,
  requires_recheck = false,
  last_seen_at = '2026-01-01T00:00:00Z'
where provider_place_id = '900000001';

update public.regions
set kakao_collection_enabled = true
where region_id = 'jeju';

with inserted_run as (
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
    'jeju',
    'kakao',
    'running',
    '2026-08-02T00:00:00Z',
    'test-collector',
    'kakao-jeju-query-registry-v1',
    true,
    1
  ) returning id
)
insert into test_region_runs (region_id, run_id)
select 'jeju', id from inserted_run;

insert into public.map_ingest_run_queries (
  region_id,
  collection_run_id,
  query_key,
  query_text,
  district_code,
  district,
  candidate_kind,
  normalized_category,
  status,
  last_completed_page,
  provider_call_count,
  completed_at
)
select
  'jeju',
  run_id,
  'test-jeju-1',
  '제주 제주시 test',
  '110',
  '제주시',
  'pet_travel_candidate',
  'other',
  'completed',
  1,
  1,
  '2026-08-02T01:00:00Z'
from test_region_runs
where region_id = 'jeju';

do $finalize_jeju$
begin
  perform *
  from public.finalize_kakao_catalog_run_v1(
    (select run_id from test_region_runs where region_id = 'jeju'),
    'completed',
    p_completed_at => '2026-08-02T02:00:00Z'
  );
end;
$finalize_jeju$;

select extensions.is(
  (select lifecycle_status from public.map_places where provider_place_id = '900000002'),
  'stale',
  'Jeju full-run finalization stales an older Jeju row when explicitly enabled'
);

select extensions.is(
  (select lifecycle_status from public.map_places where provider_place_id = '900000001'),
  'current',
  'Jeju full-run finalization does not stale a Busan row'
);

select extensions.ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.regions'::regclass
  ) and (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.region_districts'::regclass
  ),
  'new lookup tables have RLS enabled'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.regions', 'select')
  and not has_table_privilege('authenticated', 'public.region_districts', 'select'),
  'public roles cannot read internal lookup tables directly'
);

select extensions.ok(
  has_function_privilege(
    'anon',
    'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'anonymous public catalog RPC execution remains granted'
);

select extensions.ok(
  has_function_privilege(
    'authenticated',
    'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'authenticated public catalog RPC execution remains granted'
);

select * from extensions.finish();

rollback;
