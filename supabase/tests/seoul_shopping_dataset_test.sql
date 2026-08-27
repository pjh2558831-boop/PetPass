begin;

create extension if not exists pgtap with schema extensions;
select extensions.plan(21);

select extensions.ok(
  (
    select
      kto_catalog_datasets = array['core', 'shopping']::text[]
      and kto_list_only_content_type_ids = array[38]::integer[]
      and kto_registry_version = 'tour-seoul-service2-v2'
    from public.regions
    where region_id = 'seoul'
  ),
  'Seoul declares core plus list-only shopping capability'
);

select extensions.ok(
  (
    select
      kto_catalog_datasets = array['core']::text[]
      and kto_list_only_content_type_ids = '{}'::integer[]
    from public.regions
    where region_id = 'jeju'
  ),
  'Jeju remains core-only'
);

select extensions.is(
  (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('map_places', 'map_tour_ingest_stage_places')
      and column_name in ('catalog_dataset', 'evidence_collection_mode')
  ),
  4::bigint,
  'published and staged KTO rows have explicit dataset and evidence mode'
);

select extensions.ok(
  not (select prosecdef from pg_catalog.pg_proc where oid =
    'public.get_public_map_catalog_by_region_v3(text,text,text[],text[],text[],text[],bigint,integer)'::regprocedure)
  and (
    select array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
    from pg_catalog.pg_proc
    where oid = 'public.get_public_map_catalog_by_region_v3(text,text,text[],text[],text[],text[],bigint,integer)'::regprocedure
  ),
  'dataset projection is SECURITY INVOKER with an empty search_path'
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
  'only the server role can execute the dataset projection'
);

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.map_tour_ingest_stage_places'::regclass)
  and not has_table_privilege('anon', 'public.map_tour_ingest_stage_places', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.map_tour_ingest_stage_places', 'select,insert,update,delete'),
  'staging remains RLS-protected and browser-inaccessible'
);

create temporary table shopping_test_runs (
  label text primary key,
  run_id bigint not null,
  planned_count integer not null
) on commit drop;

grant insert, select, update on table shopping_test_runs to service_role;

create or replace function pg_temp.checkpoint_seoul_datasets(p_run_id bigint)
returns void
language plpgsql
set search_path = ''
as $$
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
      v_count := 2;
      v_rows := jsonb_build_array(
        jsonb_build_object(
          'region_id', 'seoul', 'provider', 'tour',
          'provider_place_id', '88110001', 'catalog_dataset', 'core',
          'evidence_collection_mode', 'detailed', 'name', 'Seoul core fixture',
          'category_group', 'attraction', 'content_type_id', 12,
          'road_address', '서울특별시 종로구 검증로 1',
          'district_code', '110', 'district_name', '종로구',
          'longitude', 126.98, 'latitude', 37.57,
          'provider_visibility', 'unknown',
          'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
          'pet_notes', '확인 필요', 'fetched_at', '2026-08-27T00:10:00Z'
        ),
        jsonb_build_object(
          'region_id', 'seoul', 'provider', 'tour',
          'provider_place_id', '88380001', 'catalog_dataset', 'shopping',
          'evidence_collection_mode', 'list_only', 'name', 'Seoul shopping fixture',
          'category_group', 'shopping', 'content_type_id', 38,
          'road_address', '서울특별시 종로구 쇼핑로 1',
          'district_code', '110', 'district_name', '종로구',
          'longitude', 126.981, 'latitude', 37.571,
          'provider_visibility', 'unknown',
          'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object(
            'verificationStatus', 'verification_required',
            'collectionMode', 'list_only',
            'source', jsonb_build_object('operations', jsonb_build_array('areaBasedList2')),
            'assessment', jsonb_build_object('verdict', 'unknown')
          ),
          'pet_notes', '반려동물 동반 정책을 확인하지 못해 방문 전 확인이 필요합니다.',
          'fetched_at', '2026-08-27T00:10:00Z'
        )
      );
    else
      v_count := 0;
      v_rows := '[]'::jsonb;
    end if;

    perform public.commit_tour_catalog_checkpoint_v1(
      p_run_id,
      v_district.district_code,
      v_rows,
      jsonb_build_object(
        'districtCode', v_district.district_code,
        'districtName', v_district.district_name,
        'rawCount', v_count,
        'acceptedCount', v_count,
        'rejectedCount', 0,
        'duplicateCount', 0,
        'detailedRecordCount', case when v_count = 2 then 1 else 0 end,
        'listOnlyRecordCount', case when v_count = 2 then 1 else 0 end,
        'datasetCounts', jsonb_build_object(
          'core', case when v_count = 2 then 1 else 0 end,
          'shopping', case when v_count = 2 then 1 else 0 end
        )
      ),
      '2026-08-27T00:10:00Z'
    );
  end loop;
end;
$$;

insert into public.map_places (
  region_id, provider, provider_place_id, name, category_group, content_type_id,
  road_address, district_code, district_name, location, provider_visibility,
  pet_evidence_status, pet_evidence, pet_notes, is_active
) values
  (
    'jeju', 'tour', '88500001', 'Jeju dataset isolation sentinel', 'attraction', 12,
    '제주특별자치도 제주시 검증로 1', '110', '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.53, 33.50), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true
  ),
  (
    'busan', 'tour', '88260001', 'Busan dataset isolation sentinel', 'attraction', 12,
    '부산광역시 중구 검증로 1', '110', '중구',
    extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true
  );

set local role service_role;
insert into shopping_test_runs(label, run_id, planned_count)
select 'complete', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'shopping-dataset-test', 'full',
  (select array_agg(district_code order by district_code)
   from public.region_districts where region_id = 'seoul'),
  '2026-08-27T00:00:00Z'
);
reset role;

select extensions.is(
  (select planned_count from shopping_test_runs where label = 'complete'),
  25,
  'one Seoul full run plans all districts for both datasets'
);

set local role service_role;
select pg_temp.checkpoint_seoul_datasets(
  (select run_id from shopping_test_runs where label = 'complete')
);
reset role;

select extensions.is(
  (select count(*) from public.map_tour_ingest_checkpoints where collection_run_id =
    (select run_id from shopping_test_runs where label = 'complete')),
  25::bigint,
  'all district checkpoints complete before publication'
);

select extensions.is(
  (select count(*) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from shopping_test_runs where label = 'complete')),
  2::bigint,
  'the same run stages core and shopping rows'
);

select extensions.is(
  (select count(distinct catalog_dataset) from public.map_tour_ingest_stage_places where collection_run_id =
    (select run_id from shopping_test_runs where label = 'complete')),
  2::bigint,
  'staging retains both explicit dataset identities'
);

set local role service_role;
select public.finalize_tour_catalog_run_v1(
  (select run_id from shopping_test_runs where label = 'complete'),
  'completed', null, '2026-08-27T00:20:00Z'
);
reset role;

select extensions.is(
  (select status from public.map_ingest_runs where id =
    (select run_id from shopping_test_runs where label = 'complete')),
  'completed',
  'one finalization publishes both datasets atomically'
);

select extensions.is(
  (select count(*) from public.map_places where last_seen_run_id =
    (select run_id from shopping_test_runs where label = 'complete') and is_active),
  2::bigint,
  'both published rows share the same completed run identity'
);

select extensions.ok(
  (
    select
      catalog_dataset = 'shopping'
      and evidence_collection_mode = 'list_only'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    from public.map_places
    where provider = 'tour' and provider_place_id = '88380001'
  ),
  'shopping remains unknown and verification-required after publication'
);

set local role service_role;
select extensions.is(
  (select count(*) from public.get_public_map_catalog_by_region_v3(
    'seoul', 'core', array['tour'], null, null, null, null, 200
  )),
  1::bigint,
  'core projection excludes shopping before pagination'
);

select extensions.is(
  (select count(*) from public.get_public_map_catalog_by_region_v3(
    'seoul', 'shopping', array['tour'], null, null, null, null, 200
  )),
  1::bigint,
  'shopping projection returns only the shopping dataset'
);
reset role;

select extensions.ok(
  (select is_active from public.map_places where provider_place_id = '88500001')
  and (select is_active from public.map_places where provider_place_id = '88260001'),
  'Seoul full publication preserves Jeju and Busan rows'
);

set local role service_role;
insert into shopping_test_runs(label, run_id, planned_count)
select 'jeju-reject', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'jeju', 'tour-jeju-service2-v1', 'shopping-dataset-test', 'full',
  array['110', '130'], '2026-08-27T01:00:00Z'
);

select extensions.throws_ok(
  format(
    $reject$
      select public.commit_tour_catalog_checkpoint_v1(
        %s, '110',
        '[{"region_id":"jeju","provider":"tour","provider_place_id":"88389999","catalog_dataset":"shopping","evidence_collection_mode":"list_only","name":"Rejected shopping","category_group":"shopping","content_type_id":38,"road_address":"제주특별자치도 제주시","district_code":"110","district_name":"제주시","longitude":126.53,"latitude":33.50,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"verificationStatus":"verification_required","assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-27T01:01:00Z"}]'::jsonb,
        '{"districtCode":"110","districtName":"제주시","rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0,"detailedRecordCount":0,"listOnlyRecordCount":1,"datasetCounts":{"core":0,"shopping":1}}'::jsonb,
        '2026-08-27T01:01:00Z'
      )
    $reject$,
    (select run_id from shopping_test_runs where label = 'jeju-reject')
  ),
  '23514',
  'KTO catalog dataset is disabled for region',
  'Jeju rejects the undeclared shopping capability'
);
reset role;

select extensions.is(
  (select count(*) from public.map_tour_ingest_checkpoints where collection_run_id =
    (select run_id from shopping_test_runs where label = 'jeju-reject')),
  0::bigint,
  'a rejected capability checkpoint leaves no partial stage state'
);

set local role service_role;
select public.finalize_tour_catalog_run_v1(
  (select run_id from shopping_test_runs where label = 'jeju-reject'),
  'failed', '{"code":"CAPABILITY_REJECTED"}', '2026-08-27T01:02:00Z'
);

insert into shopping_test_runs(label, run_id, planned_count)
select 'missing-dataset', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'shopping-dataset-test', 'full',
  (select array_agg(district_code order by district_code)
   from public.region_districts where region_id = 'seoul'),
  '2026-08-27T01:10:00Z'
);

select pg_temp.checkpoint_seoul_datasets(
  (select run_id from shopping_test_runs where label = 'missing-dataset')
);

delete from public.map_tour_ingest_stage_places
where collection_run_id = (select run_id from shopping_test_runs where label = 'missing-dataset')
  and catalog_dataset = 'shopping';

select extensions.throws_ok(
  format(
    'select * from public.finalize_tour_catalog_run_v1(%s, %L, null, %L)',
    (select run_id from shopping_test_runs where label = 'missing-dataset'),
    'completed', '2026-08-27T01:20:00Z'
  ),
  '55000',
  'all configured KTO datasets must be staged before full finalization',
  'a full run cannot publish when one configured dataset is missing'
);

select public.finalize_tour_catalog_run_v1(
  (select run_id from shopping_test_runs where label = 'missing-dataset'),
  'failed', '{"code":"MISSING_DATASET"}', '2026-08-27T01:21:00Z'
);

insert into shopping_test_runs(label, run_id, planned_count)
select 'partial', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'shopping-dataset-test', 'full',
  (select array_agg(district_code order by district_code)
   from public.region_districts where region_id = 'seoul'),
  '2026-08-27T02:00:00Z'
);

select public.commit_tour_catalog_checkpoint_v1(
  (select run_id from shopping_test_runs where label = 'partial'),
  '110', '[]'::jsonb,
  '{"districtCode":"110","districtName":"종로구","rawCount":0,"acceptedCount":0,"rejectedCount":0,"duplicateCount":0,"detailedRecordCount":0,"listOnlyRecordCount":0,"datasetCounts":{"core":0,"shopping":0}}'::jsonb,
  '2026-08-27T02:01:00Z'
);

select extensions.throws_ok(
  format(
    'select * from public.finalize_tour_catalog_run_v1(%s, %L, null, %L)',
    (select run_id from shopping_test_runs where label = 'partial'),
    'completed', '2026-08-27T02:02:00Z'
  ),
  '55000',
  'all KTO districts must be checkpointed before finalization',
  'an incomplete full run cannot publish either dataset'
);

select public.finalize_tour_catalog_run_v1(
  (select run_id from shopping_test_runs where label = 'partial'),
  'failed', '{"code":"INCOMPLETE"}', '2026-08-27T02:03:00Z'
);
reset role;

select extensions.is(
  (select count(*) from public.map_places where last_seen_run_id =
    (select run_id from shopping_test_runs where label = 'partial')),
  0::bigint,
  'failed partial runs publish no rows'
);

select extensions.finish();
rollback;
