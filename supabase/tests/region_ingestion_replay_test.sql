begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(42);

select extensions.is(
  (
    select prosecdef
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_catalog_by_region_v2(text,text[],text[],text[],text[],bigint,integer)'::regprocedure
  ),
  false,
  'region-aware catalog v2 uses SECURITY INVOKER'
);

select extensions.ok(
  (
    select array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_catalog_by_region_v2(text,text[],text[],text[],text[],bigint,integer)'::regprocedure
  ),
  'region-aware catalog v2 has an empty search_path'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.get_public_map_catalog_by_region_v2(text,text[],text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'service_role can execute region-aware catalog v2'
);

select extensions.ok(
  not has_function_privilege(
    'anon',
    'public.get_public_map_catalog_by_region_v2(text,text[],text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'anon cannot execute region-aware catalog v2 directly'
);

select extensions.ok(
  not has_function_privilege(
    'authenticated',
    'public.get_public_map_catalog_by_region_v2(text,text[],text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'authenticated cannot execute region-aware catalog v2 directly'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.regions', 'select')
  and not has_table_privilege('authenticated', 'public.region_districts', 'select'),
  'browser roles cannot read region lookup tables'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.map_tour_ingest_stage_places', 'select')
  and not has_table_privilege('authenticated', 'public.map_tour_ingest_checkpoints', 'select'),
  'browser roles cannot read KTO stage or checkpoint tables'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.map_tour_ingest_stage_places', 'select,insert,update,delete'),
  'service_role has the required stage-table privileges'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.map_tour_ingest_checkpoints', 'select,insert,update,delete'),
  'service_role has the required checkpoint-table privileges'
);

select extensions.ok(
  (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.map_tour_ingest_checkpoints'::regclass
  ) and (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'public.map_tour_ingest_stage_places'::regclass
  ),
  'KTO checkpoint and stage tables have RLS enabled'
);

select extensions.is(
  (
    select count(*)
    from public.region_districts
    where district_code = '110'
  ),
  2::bigint,
  'Busan Jung-gu and Jeju City retain separate composite district identities'
);

select extensions.throws_ok(
  $invalid_scope$
    select *
    from public.start_tour_catalog_run_v1(
      'jeju',
      'tour-jeju-service2-v1',
      'phase4-test',
      'full',
      array['110'],
      '2026-08-20T00:00:00Z'
    )
  $invalid_scope$,
  '23514',
  'invalid regional KTO district scope',
  'KTO runs require the complete Jeju administrative scope'
);

create temporary table phase4_baseline_counts (
  metric text primary key,
  value integer not null
) on commit drop;

insert into phase4_baseline_counts (metric, value)
select 'active_jeju_tour', count(*)::integer
from public.map_places
where region_id = 'jeju'
  and provider = 'tour'
  and is_active;

insert into phase4_baseline_counts (metric, value)
select 'active_busan_tour', count(*)::integer
from public.map_places
where region_id = 'busan'
  and provider = 'tour'
  and is_active;

insert into phase4_baseline_counts (metric, value)
select 'active_busan_kakao', count(*)::integer
from public.map_places
where region_id = 'busan'
  and provider = 'kakao'
  and is_active;

insert into phase4_baseline_counts (metric, value)
select 'active_busan_tour_110', count(*)::integer
from public.map_places
where region_id = 'busan'
  and provider = 'tour'
  and district_code = '110'
  and is_active;

insert into public.map_places (
  region_id,
  provider,
  provider_place_id,
  name,
  category_group,
  content_type_id,
  road_address,
  lot_address,
  district_code,
  district_name,
  location,
  source_url,
  provider_visibility,
  pet_evidence_status,
  pet_evidence,
  pet_notes,
  is_active
) values
  (
    'jeju', 'tour', '7710001', 'Jeju stale fixture', 'attraction', 12,
    '제주특별자치도 제주시 중앙로 1', null, '110', '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.53, 33.50), 4326)::extensions.geography,
    'https://korean.visitkorea.or.kr/detail/7710001', 'exposed', 'official_unknown',
    '{"assessment":{"verdict":"unknown"}}'::jsonb, '확인 필요', true
  ),
  (
    'jeju', 'tour', '7710002', 'Jeju retained fixture', 'attraction', 12,
    '제주특별자치도 제주시 중앙로 2', null, '110', '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.54, 33.51), 4326)::extensions.geography,
    'https://korean.visitkorea.or.kr/detail/7710002', 'exposed', 'official_verified',
    '{"assessment":{"verdict":"conditional"}}'::jsonb, '조건 확인', true
  ),
  (
    'busan', 'tour', '7799999', 'Busan collision sentinel', 'attraction', 12,
    '부산광역시 중구 중앙대로 1', '(중앙동)', '110', '중구',
    extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
    'https://korean.visitkorea.or.kr/detail/7799999', 'exposed', 'official_unknown',
    '{"assessment":{"verdict":"unknown"}}'::jsonb, '부산 유지', true
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
) values (
  'busan', 'kakao', '9799999', 'Busan Kakao sentinel', '카페', 'cafe',
  'pet_travel_candidate', '부산광역시 중구 중앙대로 2', '110', '중구',
  extensions.st_setsrid(extensions.st_makepoint(129.04, 35.11), 4326)::extensions.geography,
  'https://place.map.kakao.com/9799999', 'not_applicable', 'search_candidate',
  '{"source":"test","verification_required":true}'::jsonb, '확인 필요', true,
  'unreviewed', true, 'current', '{}'::jsonb, false
);

create temporary table phase4_runs (
  label text primary key,
  run_id bigint not null,
  planned_count integer not null
) on commit drop;

create temporary table phase4_finalize_results (
  label text primary key,
  run_status text not null,
  inserted_row_count integer not null,
  updated_row_count integer not null,
  deactivated_row_count integer not null
) on commit drop;

create temporary table phase4_rpc_counts (
  metric text primary key,
  value bigint not null
) on commit drop;

grant insert, select, update on table phase4_runs to service_role;
grant insert, select, update on table phase4_finalize_results to service_role;
grant insert, select, update on table phase4_rpc_counts to service_role;

set local role service_role;

insert into phase4_runs (label, run_id, planned_count)
select 'full', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'jeju',
  'tour-jeju-service2-v1',
  'phase4-test',
  'full',
  array['110', '130'],
  '2026-08-20T01:00:00Z'
);

reset role;

select extensions.is(
  (select planned_count from phase4_runs where label = 'full'),
  2,
  'full KTO run plans both Jeju districts'
);

select extensions.throws_ok(
  format(
    $out_of_bounds$
      select public.commit_tour_catalog_checkpoint_v1(
        %s,
        '110',
        jsonb_build_array(jsonb_build_object(
          'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7710090',
          'name', 'Out of bounds', 'category_group', 'attraction',
          'content_type_id', 12, 'road_address', '제주특별자치도 제주시 중앙로 90',
          'district_code', '110', 'district_name', '제주시',
          'longitude', 129.03, 'latitude', 35.10,
          'provider_visibility', 'exposed', 'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
          'pet_notes', '확인 필요', 'fetched_at', '2026-08-20T01:10:00Z'
        )),
        '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
        '2026-08-20T01:10:00Z'
      )
    $out_of_bounds$,
    (select run_id from phase4_runs where label = 'full')
  ),
  '23514',
  'KTO stage coordinates are outside the configured region bounds',
  'out-of-region KTO coordinates are rejected'
);

select extensions.is(
  (
    select count(*)
    from public.map_tour_ingest_checkpoints
    where collection_run_id = (select run_id from phase4_runs where label = 'full')
  ),
  0::bigint,
  'a failed checkpoint leaves no partial checkpoint mutation'
);

select extensions.throws_ok(
  format(
    $shopping$
      select public.commit_tour_catalog_checkpoint_v1(
        %s,
        '110',
        jsonb_build_array(jsonb_build_object(
          'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7710038',
          'name', 'Shopping excluded', 'category_group', 'attraction',
          'content_type_id', 38, 'road_address', '제주특별자치도 제주시 중앙로 38',
          'district_code', '110', 'district_name', '제주시',
          'longitude', 126.53, 'latitude', 33.50,
          'provider_visibility', 'exposed', 'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
          'pet_notes', '확인 필요', 'fetched_at', '2026-08-20T01:20:00Z'
        )),
        '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
        '2026-08-20T01:20:00Z'
      )
    $shopping$,
    (select run_id from phase4_runs where label = 'full')
  ),
  '23514',
  'new row for relation "map_tour_ingest_stage_places" violates check constraint "map_tour_ingest_stage_places_content_type_id_check"',
  'shopping content type 38 cannot enter KTO staging'
);

set local role service_role;

do $checkpoint_first$
begin
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'full'),
    '110',
    jsonb_build_array(jsonb_build_object(
      'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7710002',
      'name', 'Jeju first checkpoint', 'category_group', 'attraction',
      'content_type_id', 12, 'road_address', '제주특별자치도 제주시 중앙로 2',
      'district_code', '110', 'district_name', '제주시',
      'longitude', 126.54, 'latitude', 33.51,
      'source_url', 'https://korean.visitkorea.or.kr/detail/7710002',
      'provider_visibility', 'exposed', 'pet_evidence_status', 'official_verified',
      'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'conditional')),
      'pet_notes', '조건 확인', 'fetched_at', '2026-08-20T01:30:00Z'
    )),
    '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T01:30:00Z'
  );
end;
$checkpoint_first$;

do $checkpoint_resume$
begin
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'full'),
    '110',
    jsonb_build_array(jsonb_build_object(
      'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7710002',
      'name', 'Jeju resumed checkpoint', 'category_group', 'attraction',
      'content_type_id', 12, 'road_address', '제주특별자치도 제주시 중앙로 2',
      'district_code', '110', 'district_name', '제주시',
      'longitude', 126.54, 'latitude', 33.51,
      'source_url', 'https://korean.visitkorea.or.kr/detail/7710002',
      'provider_visibility', 'exposed', 'pet_evidence_status', 'official_verified',
      'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'conditional')),
      'pet_notes', '조건 확인', 'fetched_at', '2026-08-20T01:40:00Z'
    )),
    '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T01:40:00Z'
  );
end;
$checkpoint_resume$;

reset role;

select extensions.is(
  (
    select count(*)
    from public.map_tour_ingest_stage_places
    where collection_run_id = (select run_id from phase4_runs where label = 'full')
      and district_code = '110'
  ),
  1::bigint,
  'resuming a district checkpoint replaces rather than duplicates staged rows'
);

select extensions.is(
  (
    select name
    from public.map_tour_ingest_stage_places
    where collection_run_id = (select run_id from phase4_runs where label = 'full')
      and provider_place_id = '7710002'
  ),
  'Jeju resumed checkpoint',
  'resumed checkpoint data replaces the prior staged version'
);

set local role service_role;

do $checkpoint_130$
begin
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'full'),
    '130',
    jsonb_build_array(jsonb_build_object(
      'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7710003',
      'name', 'Seogwipo new fixture', 'category_group', 'food',
      'content_type_id', 39, 'road_address', '제주특별자치도 서귀포시 중앙로 3',
      'district_code', '130', 'district_name', '서귀포시',
      'longitude', 126.56, 'latitude', 33.25,
      'source_url', 'https://korean.visitkorea.or.kr/detail/7710003',
      'provider_visibility', 'exposed', 'pet_evidence_status', 'official_unknown',
      'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
      'pet_notes', '확인 필요', 'fetched_at', '2026-08-20T01:50:00Z'
    )),
    '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T01:50:00Z'
  );
end;
$checkpoint_130$;

reset role;

select extensions.is(
  (
    select count(*)
    from public.map_tour_ingest_checkpoints
    where collection_run_id = (select run_id from phase4_runs where label = 'full')
  ),
  2::bigint,
  'both Jeju KTO districts are checkpointed before full finalization'
);

set local role service_role;

insert into phase4_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'full', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase4_runs where label = 'full'),
  'completed',
  null,
  '2026-08-20T02:00:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase4_finalize_results where label = 'full'),
  'completed',
  'full KTO finalization completes atomically'
);

select extensions.is(
  (select inserted_row_count from phase4_finalize_results where label = 'full'),
  1,
  'full KTO finalization reports one inserted Jeju row'
);

select extensions.is(
  (select updated_row_count from phase4_finalize_results where label = 'full'),
  1,
  'full KTO finalization reports one updated Jeju row'
);

select extensions.is(
  (select deactivated_row_count from phase4_finalize_results where label = 'full'),
  (select value + 1 from phase4_baseline_counts where metric = 'active_jeju_tour'),
  'full KTO finalization reports the omitted sentinel and every pre-existing stale Jeju row'
);

select extensions.ok(
  not (select is_active from public.map_places where region_id = 'jeju' and provider_place_id = '7710001'),
  'full Jeju run deactivates an omitted Jeju KTO row'
);

select extensions.ok(
  (
    select is_active and name = 'Jeju resumed checkpoint'
    from public.map_places
    where region_id = 'jeju' and provider_place_id = '7710002'
  ),
  'full Jeju run updates and retains the checkpointed Jeju row'
);

select extensions.ok(
  (select is_active from public.map_places where region_id = 'jeju' and provider_place_id = '7710003'),
  'full Jeju run activates the new Seogwipo row'
);

select extensions.ok(
  (select is_active from public.map_places where region_id = 'busan' and provider_place_id = '7799999'),
  'Jeju full finalization leaves the Busan KTO row active'
);

select extensions.ok(
  (select is_active from public.map_places where region_id = 'busan' and provider_place_id = '9799999'),
  'Jeju full finalization leaves the Busan Kakao row active'
);

select extensions.is(
  (
    select count(*)::integer
    from public.map_places
    where region_id = 'busan'
      and provider = 'tour'
      and is_active
  ),
  (select value + 1 from phase4_baseline_counts where metric = 'active_busan_tour'),
  'Jeju full finalization deactivates zero pre-existing Busan KTO rows'
);

select extensions.is(
  (
    select count(*)::integer
    from public.map_places
    where region_id = 'busan'
      and provider = 'kakao'
      and is_active
  ),
  (select value + 1 from phase4_baseline_counts where metric = 'active_busan_kakao'),
  'Jeju full finalization deactivates zero pre-existing Busan Kakao rows'
);

select extensions.ok(
  (
    select completed_query_count = 2
      and accepted_result_count = 2
      and unique_place_count = 2
    from public.map_ingest_runs
    where id = (select run_id from phase4_runs where label = 'full')
  ),
  'full-run statistics remain scoped to its two Jeju checkpoints'
);

set local role service_role;

insert into phase4_rpc_counts (metric, value)
select 'busan_110', count(*)
from public.get_public_map_catalog_by_region_v2(
  'busan', array['tour'], null, null, array['110'], null, 200
);

insert into phase4_rpc_counts (metric, value)
select 'jeju_110', count(*)
from public.get_public_map_catalog_by_region_v2(
  'jeju', array['tour'], null, null, array['110'], null, 200
);

insert into phase4_rpc_counts (metric, value)
select 'jeju_busan_collision', count(*)
from public.get_public_map_catalog_by_region_v2(
  'jeju', array['tour'], null, null, array['110'], null, 200
)
where provider_place_id = '7799999';

reset role;

select extensions.is(
  (select value from phase4_rpc_counts where metric = 'busan_110'),
  (
    select (value + 1)::bigint
    from phase4_baseline_counts
    where metric = 'active_busan_tour_110'
  ),
  'Busan district 110 query preserves its baseline and adds only the Busan KTO sentinel'
);

select extensions.is(
  (select value from phase4_rpc_counts where metric = 'jeju_110'),
  1::bigint,
  'Jeju district 110 query returns only the active Jeju City row'
);

select extensions.is(
  (select value from phase4_rpc_counts where metric = 'jeju_busan_collision'),
  0::bigint,
  'region-aware v2 never leaks the Busan district-110 row into Jeju'
);

set local role service_role;

insert into phase4_runs (label, run_id, planned_count)
select 'delta', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'jeju',
  'tour-jeju-service2-v1',
  'phase4-test',
  'delta',
  array['110', '130'],
  '2026-08-20T03:00:00Z'
);

do $delta_110$
begin
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'delta'),
    '110',
    jsonb_build_array(jsonb_build_object(
      'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7710002',
      'name', 'Jeju delta checkpoint', 'category_group', 'attraction',
      'content_type_id', 12, 'road_address', '제주특별자치도 제주시 중앙로 2',
      'district_code', '110', 'district_name', '제주시',
      'longitude', 126.54, 'latitude', 33.51,
      'source_url', 'https://korean.visitkorea.or.kr/detail/7710002',
      'provider_visibility', 'exposed', 'pet_evidence_status', 'official_verified',
      'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'conditional')),
      'pet_notes', '조건 확인', 'fetched_at', '2026-08-20T03:10:00Z'
    )),
    '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T03:10:00Z'
  );
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'delta'),
    '130',
    '[]'::jsonb,
    '{"rawCount":0,"acceptedCount":0,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T03:20:00Z'
  );
end;
$delta_110$;

insert into phase4_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'delta', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase4_runs where label = 'delta'),
  'completed',
  null,
  '2026-08-20T03:30:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase4_finalize_results where label = 'delta'),
  'completed',
  'delta KTO finalization completes'
);

select extensions.is(
  (select deactivated_row_count from phase4_finalize_results where label = 'delta'),
  0,
  'delta KTO finalization performs no stale deactivation'
);

select extensions.ok(
  (select is_active from public.map_places where region_id = 'jeju' and provider_place_id = '7710003'),
  'delta run leaves an omitted Jeju row active'
);

select extensions.is(
  (select updated_row_count from phase4_finalize_results where label = 'delta'),
  1,
  'delta KTO finalization updates only its staged Jeju row'
);

set local role service_role;

insert into phase4_runs (label, run_id, planned_count)
select 'collision', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'jeju',
  'tour-jeju-service2-v1',
  'phase4-test',
  'delta',
  array['110', '130'],
  '2026-08-20T04:00:00Z'
);

do $collision_checkpoints$
begin
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'collision'),
    '110',
    jsonb_build_array(jsonb_build_object(
      'region_id', 'jeju', 'provider', 'tour', 'provider_place_id', '7799999',
      'name', 'Jeju collision attempt', 'category_group', 'attraction',
      'content_type_id', 12, 'road_address', '제주특별자치도 제주시 중앙로 99',
      'district_code', '110', 'district_name', '제주시',
      'longitude', 126.53, 'latitude', 33.50,
      'source_url', 'https://korean.visitkorea.or.kr/detail/7799999',
      'provider_visibility', 'exposed', 'pet_evidence_status', 'official_unknown',
      'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
      'pet_notes', '충돌 테스트', 'fetched_at', '2026-08-20T04:10:00Z'
    )),
    '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T04:10:00Z'
  );
  perform public.commit_tour_catalog_checkpoint_v1(
    (select run_id from phase4_runs where label = 'collision'),
    '130',
    '[]'::jsonb,
    '{"rawCount":0,"acceptedCount":0,"rejectedCount":0,"duplicateCount":0}'::jsonb,
    '2026-08-20T04:20:00Z'
  );
end;
$collision_checkpoints$;

reset role;

select extensions.throws_ok(
  format(
    $collision_finalize$
      select *
      from public.finalize_tour_catalog_run_v1(%s, 'completed', null, '2026-08-20T04:30:00Z')
    $collision_finalize$,
    (select run_id from phase4_runs where label = 'collision')
  ),
  '23514',
  'KTO provider identity belongs to another region',
  'cross-region provider-ID collision aborts finalization'
);

select extensions.ok(
  (
    select is_active and name = 'Busan collision sentinel'
    from public.map_places
    where region_id = 'busan' and provider = 'tour' and provider_place_id = '7799999'
  ),
  'cross-region collision leaves the Busan record unchanged'
);

select extensions.is(
  (
    select count(*)
    from public.map_places
    where region_id = 'jeju' and provider = 'tour' and provider_place_id = '7799999'
  ),
  0::bigint,
  'cross-region collision creates no Jeju catalog row'
);

select extensions.is(
  (
    select status
    from public.map_ingest_runs
    where id = (select run_id from phase4_runs where label = 'collision')
  ),
  'running',
  'failed collision finalization rolls back the run-status mutation'
);

select * from extensions.finish();

rollback;
