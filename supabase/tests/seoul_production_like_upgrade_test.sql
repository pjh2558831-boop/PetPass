begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(31);

select extensions.ok(
  (
    select kto_catalog_datasets = array['core', 'shopping']::text[]
      and kto_list_only_content_type_ids = array[38]::integer[]
    from public.regions
    where region_id = 'seoul'
  ),
  'Seoul production-like fixture uses the core and list-only shopping capability'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.map_places', 'select')
  and not has_table_privilege('authenticated', 'public.map_places', 'select')
  and not has_table_privilege('anon', 'public.map_tour_ingest_stage_places', 'select')
  and not has_table_privilege('authenticated', 'public.map_tour_ingest_checkpoints', 'select')
  and not has_table_privilege('anon', 'public.regions', 'select')
  and not has_table_privilege('authenticated', 'public.region_districts', 'select'),
  'browser roles cannot read raw catalog, stage, checkpoint, or registry tables'
);

select extensions.ok(
  has_function_privilege(
    'service_role',
    'public.get_public_map_catalog_by_region_v3(text,text,text[],text[],text[],text[],bigint,integer)',
    'execute'
  )
  and not has_function_privilege(
    'anon',
    'public.get_public_map_catalog_by_region_v3(text,text,text[],text[],text[],text[],bigint,integer)',
    'execute'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_public_map_catalog_by_region_v3(text,text,text[],text[],text[],text[],bigint,integer)',
    'execute'
  ),
  'dataset RPC V3 execution remains server-only'
);

select extensions.ok(
  (select prosecdef from pg_catalog.pg_proc where oid =
    'public.get_public_map_catalog_v2(double precision,double precision,double precision,double precision,text[],text[],text[],bigint,integer)'::regprocedure)
  and (select prosecdef from pg_catalog.pg_proc where oid =
    'public.get_public_map_place_location_v1(text)'::regprocedure),
  'legacy browser projections remain callable without raw table grants'
);

create temporary table production_like_runs (
  label text primary key,
  run_id bigint not null,
  planned_count integer not null
) on commit drop;

create temporary table production_like_finalize (
  label text primary key,
  run_status text not null,
  inserted_row_count integer not null,
  updated_row_count integer not null,
  deactivated_row_count integer not null
) on commit drop;

create temporary table production_like_page_batch (
  id bigint primary key,
  normalized_category text not null,
  total_count bigint not null,
  has_more boolean not null
) on commit drop;

create temporary table production_like_page_rows (
  id bigint primary key,
  normalized_category text not null,
  total_count bigint not null
) on commit drop;

create temporary table production_like_metrics (
  metric text primary key,
  value bigint not null
) on commit drop;

grant insert, select, update on table production_like_runs to service_role;
grant insert, select, update on table production_like_finalize to service_role;
grant insert, select, delete on table production_like_page_batch to service_role;
grant insert, select on table production_like_page_rows to service_role;
grant insert, select, update on table production_like_metrics to service_role;

insert into public.map_places (
  region_id, provider, provider_place_id, name, category_name,
  normalized_category, candidate_kind, road_address, district_code,
  district_name, location, source_url, provider_visibility,
  pet_evidence_status, pet_evidence, pet_notes, is_active, review_status,
  public_visibility, lifecycle_status, verification_evidence,
  requires_recheck, catalog_dataset, evidence_collection_mode
) values (
  'busan', 'kakao', '9600000001', 'Busan Kakao upgrade sentinel', '카페',
  'cafe', 'pet_travel_candidate', '부산광역시 중구 중앙대로 1', '110',
  '중구',
  extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
  'https://place.map.kakao.com/9600000001', 'not_applicable',
  'search_candidate', '{"source":"test","verification_required":true}'::jsonb,
  'test candidate', true, 'unreviewed', true, 'current', '{}'::jsonb,
  false, 'core', 'detailed'
);

insert into public.map_places (
  region_id, provider, provider_place_id, name, category_group,
  content_type_id, road_address, district_code, district_name, location,
  provider_visibility, pet_evidence_status, pet_evidence, pet_notes,
  is_active, catalog_dataset, evidence_collection_mode
) values
  (
    'busan', 'tour', '9600000002', 'Busan KTO upgrade sentinel', 'attraction',
    12, '부산광역시 중구 중앙대로 2', '110', '중구',
    extensions.st_setsrid(extensions.st_makepoint(129.031, 35.101), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true, 'core', 'detailed'
  ),
  (
    'jeju', 'tour', '9600000003', 'Jeju KTO upgrade sentinel', 'attraction',
    12, '제주특별자치도 제주시 중앙로 3', '110', '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.53, 33.50), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true, 'core', 'detailed'
  ),
  (
    'seoul', 'tour', '9600000004', 'Seoul stale core sentinel', 'attraction',
    12, '서울특별시 종로구 중앙로 4', '110', '종로구',
    extensions.st_setsrid(extensions.st_makepoint(126.98, 37.57), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true, 'core', 'detailed'
  ),
  (
    'seoul', 'tour', '9600000005', 'Seoul stale shopping sentinel', 'shopping',
    38, '서울특별시 종로구 쇼핑로 5', '110', '종로구',
    extensions.st_setsrid(extensions.st_makepoint(126.981, 37.571), 4326)::extensions.geography,
    'unknown', 'official_unknown',
    '{"verificationStatus":"verification_required","collectionMode":"list_only","source":{"operations":["areaBasedList2"]},"assessment":{"verdict":"unknown"}}'::jsonb,
    '반려동물 동반 정책을 확인하지 못해 방문 전 확인이 필요합니다.',
    true, 'shopping', 'list_only'
  );

set local role service_role;

insert into production_like_runs (label, run_id, planned_count)
select 'full', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'production-like-gate', 'full',
  (select array_agg(district_code order by district_code)
   from public.region_districts where region_id = 'seoul'),
  '2026-08-27T03:00:00Z'
);

reset role;

select extensions.is(
  (select planned_count from production_like_runs where label = 'full'),
  25,
  'production-like Seoul full run plans every district'
);

set local role service_role;

select extensions.throws_ok(
  format(
    $duplicate$
      select public.commit_tour_catalog_checkpoint_v1(
        %s, '110',
        '[{"region_id":"seoul","provider":"tour","provider_place_id":"9700000099","catalog_dataset":"core","evidence_collection_mode":"detailed","name":"duplicate one","category_group":"attraction","content_type_id":12,"road_address":"서울특별시 종로구 중복로 1","district_code":"110","district_name":"종로구","longitude":126.98,"latitude":37.57,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-27T03:01:00Z"},{"region_id":"seoul","provider":"tour","provider_place_id":"9700000099","catalog_dataset":"core","evidence_collection_mode":"detailed","name":"duplicate two","category_group":"attraction","content_type_id":12,"road_address":"서울특별시 종로구 중복로 2","district_code":"110","district_name":"종로구","longitude":126.981,"latitude":37.571,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-27T03:01:00Z"}]'::jsonb,
        '{"rawCount":2,"acceptedCount":2,"rejectedCount":0,"duplicateCount":0}'::jsonb,
        '2026-08-27T03:01:00Z'
      )
    $duplicate$,
    (select run_id from production_like_runs where label = 'full')
  ),
  '23514',
  'KTO checkpoint contains duplicate provider identities',
  'duplicate provider IDs are rejected before staging'
);

select extensions.throws_ok(
  format(
    $coordinate$
      select public.commit_tour_catalog_checkpoint_v1(
        %s, '110',
        '[{"region_id":"seoul","provider":"tour","provider_place_id":"9700000098","catalog_dataset":"core","evidence_collection_mode":"detailed","name":"invalid coordinate","category_group":"attraction","content_type_id":12,"road_address":"서울특별시 종로구 좌표로 1","district_code":"110","district_name":"종로구","longitude":126.53,"latitude":33.50,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-27T03:02:00Z"}]'::jsonb,
        '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
        '2026-08-27T03:02:00Z'
      )
    $coordinate$,
    (select run_id from production_like_runs where label = 'full')
  ),
  '23514',
  'KTO stage coordinates are outside the configured region bounds',
  'invalid coordinates are rejected before checkpoint publication'
);

select extensions.throws_ok(
  format(
    $district$
      select public.commit_tour_catalog_checkpoint_v1(
        %s, '110',
        '[{"region_id":"seoul","provider":"tour","provider_place_id":"9700000097","catalog_dataset":"core","evidence_collection_mode":"detailed","name":"invalid district","category_group":"attraction","content_type_id":12,"road_address":"서울특별시 종로구 구역로 1","district_code":"110","district_name":"중구","longitude":126.98,"latitude":37.57,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-27T03:03:00Z"}]'::jsonb,
        '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
        '2026-08-27T03:03:00Z'
      )
    $district$,
    (select run_id from production_like_runs where label = 'full')
  ),
  '23514',
  'KTO checkpoint row scope mismatch',
  'cross-region district-name collisions are rejected'
);

reset role;

select extensions.is(
  (select count(*) from public.map_tour_ingest_checkpoints where collection_run_id =
    (select run_id from production_like_runs where label = 'full')),
  0::bigint,
  'invalid checkpoint attempts leave no partial state'
);

set local role service_role;

do $checkpoint_all_districts$
declare
  v_district record;
  v_rows jsonb;
  v_accepted integer;
  v_raw integer;
  v_rejected integer;
  v_duplicate integer;
begin
  for v_district in
    select district_code, district_name
    from public.region_districts
    where region_id = 'seoul'
    order by district_code
  loop
    if v_district.district_code = '110' then
      select jsonb_agg(candidate order by candidate->>'provider_place_id')
      into v_rows
      from (
        select jsonb_build_object(
          'region_id', 'seoul', 'provider', 'tour',
          'provider_place_id', '9700000001', 'catalog_dataset', 'core',
          'evidence_collection_mode', 'detailed', 'name', 'Seoul production core',
          'category_group', 'attraction', 'content_type_id', 12,
          'road_address', '서울특별시 종로구 검증로 1',
          'district_code', '110', 'district_name', '종로구',
          'longitude', 126.98, 'latitude', 37.57,
          'phone', '02-0000-0001', 'image_url', 'https://example.invalid/core.jpg',
          'provider_visibility', 'unknown', 'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
          'pet_notes', '확인 필요', 'fetched_at', '2026-08-27T03:10:00Z'
        ) as candidate
        union all
        select jsonb_build_object(
          'region_id', 'seoul', 'provider', 'tour',
          'provider_place_id', (9701000000 + series.value)::text,
          'catalog_dataset', 'shopping', 'evidence_collection_mode', 'list_only',
          'name', 'Seoul production shopping ' || series.value,
          'category_group', 'shopping', 'content_type_id', 38,
          'road_address', '서울특별시 종로구 쇼핑로 ' || series.value,
          'district_code', '110', 'district_name', '종로구',
          'longitude', 126.98 + ((series.value % 100)::double precision / 10000),
          'latitude', 37.57 + ((series.value % 100)::double precision / 10000),
          'provider_visibility', 'unknown', 'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object(
            'verificationStatus', 'verification_required',
            'collectionMode', 'list_only',
            'source', jsonb_build_object('operations', jsonb_build_array('areaBasedList2')),
            'assessment', jsonb_build_object('verdict', 'unknown')
          ),
          'pet_notes', '반려동물 동반 정책을 확인하지 못해 방문 전 확인이 필요합니다.',
          'fetched_at', '2026-08-27T03:10:00Z'
        )
        from generate_series(1, 3101) as series(value)
      ) as candidates;
      v_accepted := 3102;
      v_rejected := 3;
      v_duplicate := 1;
      v_raw := 3106;
    else
      v_rows := '[]'::jsonb;
      v_accepted := 0;
      v_rejected := 0;
      v_duplicate := 0;
      v_raw := 0;
    end if;

    perform public.commit_tour_catalog_checkpoint_v1(
      (select run_id from production_like_runs where label = 'full'),
      v_district.district_code,
      v_rows,
      jsonb_build_object(
        'districtCode', v_district.district_code,
        'districtName', v_district.district_name,
        'rawCount', v_raw,
        'acceptedCount', v_accepted,
        'rejectedCount', v_rejected,
        'duplicateCount', v_duplicate,
        'detailedRecordCount', case when v_accepted > 0 then 1 else 0 end,
        'listOnlyRecordCount', case when v_accepted > 0 then 3101 else 0 end,
        'datasetCounts', jsonb_build_object(
          'core', case when v_accepted > 0 then 1 else 0 end,
          'shopping', case when v_accepted > 0 then 3101 else 0 end
        ),
        'rejectionReasons', case when v_accepted > 0 then jsonb_build_object(
          'invalid_coordinates', 1,
          'invalid_address', 1,
          'invalid_district', 1
        ) else '{}'::jsonb end,
        'detailCallCount', case when v_accepted > 0 then 1 else 0 end,
        'shoppingDetailCallCount', 0
      ),
      '2026-08-27T03:10:00Z'
    );
  end loop;
end;
$checkpoint_all_districts$;

reset role;

select extensions.is(
  (select count(*) from public.map_tour_ingest_checkpoints where collection_run_id =
    (select run_id from production_like_runs where label = 'full')),
  25::bigint,
  'all Seoul districts are checkpointed'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from production_like_runs where label = 'full')),
  3102::bigint,
  'one run stages 3,101 Shopping rows plus one core row'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from production_like_runs where label = 'full')
    and catalog_dataset = 'core'),
  1::bigint,
  'production-like staging keeps one detailed core record'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from production_like_runs where label = 'full')
    and catalog_dataset = 'shopping'),
  3101::bigint,
  'production-like staging retains more than 3,000 Shopping records'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from production_like_runs where label = 'full')
    and catalog_dataset = 'shopping' and evidence_collection_mode <> 'list_only'),
  0::bigint,
  'every Shopping row is list-only'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from production_like_runs where label = 'full')
    and catalog_dataset = 'shopping'
    and (pet_evidence_status <> 'official_unknown'
      or pet_evidence #>> '{assessment,verdict}' <> 'unknown'
      or pet_evidence->>'verificationStatus' <> 'verification_required')),
  0::bigint,
  'Shopping never claims official pet allowance'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from production_like_runs where label = 'full')
    and catalog_dataset = 'shopping'
    and (pet_evidence #> '{source,operations}') ?| array['detailCommon2', 'detailPetTour2']),
  0::bigint,
  'Shopping contains zero detail evidence'
);

select extensions.ok(
  (
    select completed_query_count = 25
      and provider_result_count = 3106
      and accepted_result_count = 3102
      and rejected_result_count = 3
      and duplicate_result_count = 1
      and unique_place_count = 3102
    from public.map_ingest_runs
    where id = (select run_id from production_like_runs where label = 'full')
  ),
  'run accounting exactly reconciles raw, accepted, rejected, and duplicate totals'
);

select extensions.ok(
  (
    select audit->'rejectionReasons' =
      '{"invalid_coordinates":1,"invalid_address":1,"invalid_district":1}'::jsonb
      and (audit->>'detailCallCount')::integer = 1
      and (audit->>'shoppingDetailCallCount')::integer = 0
    from public.map_tour_ingest_checkpoints
    where collection_run_id = (select run_id from production_like_runs where label = 'full')
      and district_code = '110'
  ),
  'rejection reasons and zero Shopping detail calls remain auditable'
);

set local role service_role;

insert into production_like_finalize (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'full', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from production_like_runs where label = 'full'),
  'completed', null, '2026-08-27T03:20:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from production_like_finalize where label = 'full'),
  'completed',
  'core and Shopping publish in one successful finalization'
);

select extensions.is(
  (select count(*) from public.map_places where last_seen_run_id =
    (select run_id from production_like_runs where label = 'full') and is_active),
  3102::bigint,
  'all accepted rows share one atomic publication identity'
);

select extensions.ok(
  not (select is_active from public.map_places where provider = 'tour' and provider_place_id = '9600000004')
  and not (select is_active from public.map_places where provider = 'tour' and provider_place_id = '9600000005'),
  'full finalization deactivates stale core and Shopping only inside Seoul tour data'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'kakao' and provider_place_id = '9600000001')
  and (select is_active from public.map_places where provider = 'tour' and provider_place_id = '9600000002')
  and (select is_active from public.map_places where provider = 'tour' and provider_place_id = '9600000003'),
  'Seoul publication leaves Busan Kakao, Busan KTO, and Jeju KTO rows unchanged'
);

set local role service_role;

select extensions.is(
  (select count(*) from public.get_public_map_catalog_by_region_v3(
    'seoul', 'core', array['tour'], null, null, null, null, 200
  )),
  1::bigint,
  'core RPC excludes every Shopping row'
);

select extensions.ok(
  (
    select count(*) = 200 and max(total_count) = 3101 and bool_and(normalized_category = 'shopping')
    from public.get_public_map_catalog_by_region_v3(
      'seoul', 'shopping', array['tour'], null, null, null, null, 200
    )
  ),
  'first Shopping page reports the complete total without mixing core rows'
);

do $page_all_shopping$
declare
  v_after bigint := null;
  v_next bigint;
  v_has_more boolean;
  v_page_count integer := 0;
begin
  loop
    delete from production_like_page_batch;

    insert into production_like_page_batch (id, normalized_category, total_count, has_more)
    select id, normalized_category, total_count, has_more
    from public.get_public_map_catalog_by_region_v3(
      'seoul', 'shopping', array['tour'], null, null, null, v_after, 200
    );

    select max(id), coalesce(bool_or(has_more), false)
    into v_next, v_has_more
    from production_like_page_batch;

    insert into production_like_page_rows (id, normalized_category, total_count)
    select id, normalized_category, total_count
    from production_like_page_batch;

    v_page_count := v_page_count + 1;
    exit when not v_has_more;
    if v_next is null or v_next is not distinct from v_after or v_page_count > 20 then
      raise exception 'Shopping pagination did not advance';
    end if;
    v_after := v_next;
  end loop;

  insert into production_like_metrics(metric, value)
  values ('shopping_rpc_calls', v_page_count);
end;
$page_all_shopping$;

reset role;

select extensions.is(
  (select count(*) from production_like_page_rows),
  3101::bigint,
  'all valid Shopping records are traversable without a silent cap'
);

select extensions.is(
  (select value from production_like_metrics where metric = 'shopping_rpc_calls'),
  16::bigint,
  '3,101 Shopping records require exactly sixteen 200-row RPC pages'
);

select extensions.is(
  (select count(*) from production_like_page_rows where normalized_category <> 'shopping'),
  0::bigint,
  'Shopping traversal never returns a core category'
);

set local role service_role;

insert into production_like_runs (label, run_id, planned_count)
select 'delta', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'production-like-gate', 'delta',
  (select array_agg(district_code order by district_code)
   from public.region_districts where region_id = 'seoul'),
  '2026-08-27T04:00:00Z'
);

do $checkpoint_delta$
declare
  v_district record;
  v_rows jsonb;
  v_count integer;
begin
  for v_district in
    select district_code, district_name
    from public.region_districts
    where region_id = 'seoul'
    order by district_code
  loop
    if v_district.district_code = '110' then
      v_count := 1;
      v_rows := '[{"region_id":"seoul","provider":"tour","provider_place_id":"9701000001","catalog_dataset":"shopping","evidence_collection_mode":"list_only","name":"Seoul production shopping updated","category_group":"shopping","content_type_id":38,"road_address":"서울특별시 종로구 쇼핑로 1","district_code":"110","district_name":"종로구","longitude":126.9801,"latitude":37.5701,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"verificationStatus":"verification_required","collectionMode":"list_only","source":{"operations":["areaBasedList2"]},"assessment":{"verdict":"unknown"}},"pet_notes":"반려동물 동반 정책을 확인하지 못해 방문 전 확인이 필요합니다.","fetched_at":"2026-08-27T04:01:00Z"}]'::jsonb;
    else
      v_count := 0;
      v_rows := '[]'::jsonb;
    end if;

    perform public.commit_tour_catalog_checkpoint_v1(
      (select run_id from production_like_runs where label = 'delta'),
      v_district.district_code,
      v_rows,
      jsonb_build_object(
        'districtCode', v_district.district_code,
        'districtName', v_district.district_name,
        'rawCount', v_count,
        'acceptedCount', v_count,
        'rejectedCount', 0,
        'duplicateCount', 0,
        'detailedRecordCount', 0,
        'listOnlyRecordCount', v_count,
        'datasetCounts', jsonb_build_object('core', 0, 'shopping', v_count)
      ),
      '2026-08-27T04:01:00Z'
    );
  end loop;
end;
$checkpoint_delta$;

insert into production_like_finalize (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'delta', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from production_like_runs where label = 'delta'),
  'completed', null, '2026-08-27T04:02:00Z'
) as result;

reset role;

select extensions.is(
  (select deactivated_row_count from production_like_finalize where label = 'delta'),
  0,
  'delta finalization is non-destructive'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '9700000001')
  and (select is_active from public.map_places where provider = 'tour' and provider_place_id = '9701000002'),
  'a Shopping-only delta checkpoint cannot deactivate core or unseen Shopping rows'
);

set local role service_role;

insert into production_like_runs (label, run_id, planned_count)
select 'failed', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'production-like-gate', 'full',
  (select array_agg(district_code order by district_code)
   from public.region_districts where region_id = 'seoul'),
  '2026-08-27T05:00:00Z'
);

select public.commit_tour_catalog_checkpoint_v1(
  (select run_id from production_like_runs where label = 'failed'),
  '110',
  '[{"region_id":"seoul","provider":"tour","provider_place_id":"9799999999","catalog_dataset":"core","evidence_collection_mode":"detailed","name":"failed staged core","category_group":"attraction","content_type_id":12,"road_address":"서울특별시 종로구 실패로 1","district_code":"110","district_name":"종로구","longitude":126.98,"latitude":37.57,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-27T05:01:00Z"}]'::jsonb,
  '{"rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0,"detailedRecordCount":1,"listOnlyRecordCount":0,"datasetCounts":{"core":1,"shopping":0}}'::jsonb,
  '2026-08-27T05:01:00Z'
);

insert into production_like_finalize (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'failed', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from production_like_runs where label = 'failed'),
  'failed', '{"code":"PROVIDER_FAILURE"}', '2026-08-27T05:02:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from production_like_finalize where label = 'failed'),
  'failed',
  'failed full runs are recorded without publication'
);

select extensions.is(
  (select count(*) from public.map_places where last_seen_run_id =
    (select run_id from production_like_runs where label = 'failed')),
  0::bigint,
  'failed staged rows never reach the published catalog'
);

select * from extensions.finish();

rollback;
