begin;

create extension if not exists pgtap with schema extensions;

select extensions.plan(46);

select extensions.is(
  (select display_name from public.regions where region_id = 'seoul'),
  '서울',
  'Seoul region metadata is seeded'
);

select extensions.is(
  (select legal_dong_code from public.regions where region_id = 'seoul'),
  '11',
  'Seoul uses the audited Service2 legal region code'
);

select extensions.ok(
  (
    select
      kto_catalog_enabled
      and kto_collection_enabled
      and not kakao_collection_enabled
      and kto_registry_version = 'tour-seoul-service2-v2'
    from public.regions
    where region_id = 'seoul'
  ),
  'Seoul has server KTO capability but no Kakao collection capability'
);

select extensions.is(
  (select count(*) from public.region_districts where region_id = 'seoul'),
  25::bigint,
  'all 25 audited Seoul districts are seeded'
);

select extensions.ok(
  (
    with expected(district_code, district_name) as (values
      ('110', '종로구'), ('140', '중구'), ('170', '용산구'), ('200', '성동구'),
      ('215', '광진구'), ('230', '동대문구'), ('260', '중랑구'), ('290', '성북구'),
      ('305', '강북구'), ('320', '도봉구'), ('350', '노원구'), ('380', '은평구'),
      ('410', '서대문구'), ('440', '마포구'), ('470', '양천구'), ('500', '강서구'),
      ('530', '구로구'), ('545', '금천구'), ('560', '영등포구'), ('590', '동작구'),
      ('620', '관악구'), ('650', '서초구'), ('680', '강남구'), ('710', '송파구'),
      ('740', '강동구')
    )
    select count(*) = 25
    from expected
    join public.region_districts using (district_code, district_name)
    where region_id = 'seoul'
  ),
  'every Seoul district code/name pair matches the authoritative audit'
);

select extensions.is(
  (select count(*) from public.region_districts where district_code = '110'),
  3::bigint,
  'district code 110 safely collides across Busan, Jeju, and Seoul'
);

select extensions.ok(
  exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = 'public.region_districts'::regclass
      and conname = 'region_districts_region_code_name_key'
  ),
  'composite region/district identity remains enforced'
);

select extensions.ok(
  (
    select kto_collection_enabled and not kakao_collection_enabled
    from public.regions
    where region_id = 'jeju'
  ),
  'Jeju remains KTO collection only'
);

select extensions.ok(
  (
    select kto_catalog_enabled and not kto_collection_enabled and kakao_collection_enabled
    from public.regions
    where region_id = 'busan'
  ),
  'Busan retains KTO catalog and Kakao collection without enabling the new KTO collector'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_proc
    where oid in (
      'public.start_tour_catalog_run_v1(text,text,text,text,text[],timestamptz)'::regprocedure,
      'public.commit_tour_catalog_checkpoint_v1(bigint,text,jsonb,jsonb,timestamptz)'::regprocedure,
      'public.finalize_tour_catalog_run_v1(bigint,text,text,timestamptz)'::regprocedure
    )
      and not prosecdef
  ),
  3::bigint,
  'all regional KTO write functions use SECURITY INVOKER'
);

select extensions.is(
  (
    select count(*)
    from pg_catalog.pg_proc
    where oid in (
      'public.start_tour_catalog_run_v1(text,text,text,text,text[],timestamptz)'::regprocedure,
      'public.commit_tour_catalog_checkpoint_v1(bigint,text,jsonb,jsonb,timestamptz)'::regprocedure,
      'public.finalize_tour_catalog_run_v1(bigint,text,text,timestamptz)'::regprocedure
    )
      and array_to_string(proconfig, ',') in ('search_path=', 'search_path=""')
  ),
  3::bigint,
  'all regional KTO write functions have an empty search_path'
);

select extensions.ok(
  has_function_privilege('service_role', 'public.start_tour_catalog_run_v1(text,text,text,text,text[],timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.commit_tour_catalog_checkpoint_v1(bigint,text,jsonb,jsonb,timestamptz)', 'execute')
  and has_function_privilege('service_role', 'public.finalize_tour_catalog_run_v1(bigint,text,text,timestamptz)', 'execute'),
  'service_role can execute every regional KTO write function'
);

select extensions.ok(
  not has_function_privilege('anon', 'public.start_tour_catalog_run_v1(text,text,text,text,text[],timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.commit_tour_catalog_checkpoint_v1(bigint,text,jsonb,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('anon', 'public.finalize_tour_catalog_run_v1(bigint,text,text,timestamptz)', 'execute'),
  'anon cannot execute regional KTO write functions'
);

select extensions.ok(
  not has_function_privilege('authenticated', 'public.start_tour_catalog_run_v1(text,text,text,text,text[],timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.commit_tour_catalog_checkpoint_v1(bigint,text,jsonb,jsonb,timestamptz)', 'execute')
  and not has_function_privilege('authenticated', 'public.finalize_tour_catalog_run_v1(bigint,text,text,timestamptz)', 'execute'),
  'authenticated cannot execute regional KTO write functions'
);

select extensions.ok(
  not has_function_privilege('anon', 'public.set_map_ingest_run_region_v1()', 'execute')
  and not has_function_privilege('authenticated', 'public.set_map_ingest_run_region_v1()', 'execute')
  and not has_function_privilege('anon', 'public.map_tour_stage_validate_region_v3()', 'execute')
  and not has_function_privilege('authenticated', 'public.map_tour_stage_validate_region_v3()', 'execute'),
  'browser roles cannot directly execute ingestion trigger functions'
);

select extensions.ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.map_tour_ingest_checkpoints'::regclass)
  and (select relrowsecurity from pg_catalog.pg_class where oid = 'public.map_tour_ingest_stage_places'::regclass),
  'KTO checkpoint and stage tables retain RLS'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.regions', 'select')
  and not has_table_privilege('authenticated', 'public.region_districts', 'select'),
  'browser roles cannot read region lookup tables'
);

select extensions.ok(
  not has_table_privilege('anon', 'public.map_tour_ingest_stage_places', 'select,insert,update,delete')
  and not has_table_privilege('authenticated', 'public.map_tour_ingest_checkpoints', 'select,insert,update,delete'),
  'browser roles cannot access KTO ingestion tables'
);

select extensions.ok(
  has_table_privilege('service_role', 'public.regions', 'select')
  and has_table_privilege('service_role', 'public.region_districts', 'select')
  and has_table_privilege('service_role', 'public.map_tour_ingest_stage_places', 'select,insert,update,delete'),
  'service_role has only the lookup and ingestion table access it needs'
);

select extensions.throws_ok(
  $kakao_seoul$
    insert into public.map_ingest_runs (
      region_id, provider, status, collector_version, registry_version,
      is_full_catalog_run, planned_query_count
    ) values (
      'seoul', 'kakao', 'running', 'phase2-test',
      'kakao-seoul-query-registry-v1', false, 1
    )
  $kakao_seoul$,
  '55000',
  'Kakao collection is disabled for region seoul',
  'a Seoul Kakao ingestion run is rejected by the provider capability gate'
);

select extensions.throws_ok(
  $invalid_seoul_scope$
    select * from public.start_tour_catalog_run_v1(
      'seoul', 'tour-seoul-service2-v2', 'phase2-test', 'full',
      array['110', '999'], '2026-08-26T01:00:00Z'
    )
  $invalid_seoul_scope$,
  '23514',
  'invalid regional KTO district scope',
  'invalid Seoul district pairs fail closed'
);

create temporary table phase2_runs (
  label text primary key,
  run_id bigint not null,
  planned_count integer not null
) on commit drop;

create temporary table phase2_finalize_results (
  label text primary key,
  run_status text not null,
  inserted_row_count integer not null,
  updated_row_count integer not null,
  deactivated_row_count integer not null
) on commit drop;

grant insert, select, update on table phase2_runs to service_role;
grant insert, select, update on table phase2_finalize_results to service_role;

create function pg_temp.checkpoint_region(
  p_run_id bigint,
  p_region_id text,
  p_selected_district_code text,
  p_provider_place_id text,
  p_name text,
  p_longitude double precision,
  p_latitude double precision
)
returns void
language plpgsql
security invoker
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
    where region_id = p_region_id
    order by district_code
  loop
    if v_district.district_code = p_selected_district_code then
      v_count := case when p_region_id = 'seoul' then 2 else 1 end;
      v_rows := jsonb_build_array(jsonb_build_object(
        'region_id', p_region_id,
        'provider', 'tour',
        'provider_place_id', p_provider_place_id,
        'catalog_dataset', 'core',
        'evidence_collection_mode', 'detailed',
        'name', p_name,
        'category_group', 'attraction',
        'content_type_id', 12,
        'road_address', p_name || ' address',
        'district_code', v_district.district_code,
        'district_name', v_district.district_name,
        'longitude', p_longitude,
        'latitude', p_latitude,
        'provider_visibility', 'unknown',
        'pet_evidence_status', 'official_unknown',
        'pet_evidence', jsonb_build_object('assessment', jsonb_build_object('verdict', 'unknown')),
        'pet_notes', '확인 필요',
        'fetched_at', '2026-08-26T01:10:00Z'
      ));

      if p_region_id = 'seoul' then
        v_rows := v_rows || jsonb_build_array(jsonb_build_object(
          'region_id', p_region_id,
          'provider', 'tour',
          'provider_place_id', p_provider_place_id || '38',
          'catalog_dataset', 'shopping',
          'evidence_collection_mode', 'list_only',
          'name', p_name || ' shopping',
          'category_group', 'shopping',
          'content_type_id', 38,
          'road_address', p_name || ' shopping address',
          'district_code', v_district.district_code,
          'district_name', v_district.district_name,
          'longitude', p_longitude + 0.001,
          'latitude', p_latitude + 0.001,
          'provider_visibility', 'unknown',
          'pet_evidence_status', 'official_unknown',
          'pet_evidence', jsonb_build_object(
            'verificationStatus', 'verification_required',
            'collectionMode', 'list_only',
            'source', jsonb_build_object('operations', jsonb_build_array('areaBasedList2')),
            'assessment', jsonb_build_object('verdict', 'unknown')
          ),
          'pet_notes', '반려동물 동반 정책을 확인하지 못해 방문 전 확인이 필요합니다.',
          'fetched_at', '2026-08-26T01:10:00Z'
        ));
      end if;
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
        'detailedRecordCount', case when v_count > 0 then 1 else 0 end,
        'listOnlyRecordCount', case when p_region_id = 'seoul' and v_count > 0 then 1 else 0 end,
        'datasetCounts', jsonb_build_object(
          'core', case when v_count > 0 then 1 else 0 end,
          'shopping', case when p_region_id = 'seoul' and v_count > 0 then 1 else 0 end
        )
      ),
      '2026-08-26T01:10:00Z'
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
    'seoul', 'tour', '99110001', 'Seoul stale sentinel', 'attraction', 12,
    '서울특별시 종로구 테스트로 1', '110', '종로구',
    extensions.st_setsrid(extensions.st_makepoint(126.98, 37.57), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true
  ),
  (
    'jeju', 'tour', '99500001', 'Jeju isolation sentinel', 'attraction', 12,
    '제주특별자치도 제주시 테스트로 1', '110', '제주시',
    extensions.st_setsrid(extensions.st_makepoint(126.53, 33.50), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true
  ),
  (
    'busan', 'tour', '99260001', 'Busan isolation sentinel', 'attraction', 12,
    '부산광역시 중구 테스트로 1', '110', '중구',
    extensions.st_setsrid(extensions.st_makepoint(129.03, 35.10), 4326)::extensions.geography,
    'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
    '확인 필요', true
  );

set local role service_role;

insert into phase2_runs (label, run_id, planned_count)
select 'seoul-full', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'phase2-test', 'full',
  (select array_agg(district_code order by district_code) from public.region_districts where region_id = 'seoul'),
  '2026-08-26T01:00:00Z'
);

reset role;

select extensions.is(
  (select planned_count from phase2_runs where label = 'seoul-full'),
  25,
  'a valid Seoul full run plans all 25 districts'
);

select extensions.throws_ok(
  format(
    $bad_coordinate$
      select public.commit_tour_catalog_checkpoint_v1(
        %s, '110',
        '[{"region_id":"seoul","provider":"tour","provider_place_id":"99110090","name":"Bad coordinate","category_group":"attraction","content_type_id":12,"district_code":"110","district_name":"종로구","longitude":126.53,"latitude":33.50,"provider_visibility":"unknown","pet_evidence_status":"official_unknown","pet_evidence":{"assessment":{"verdict":"unknown"}},"pet_notes":"확인 필요","fetched_at":"2026-08-26T01:05:00Z"}]'::jsonb,
        '{"districtCode":"110","districtName":"종로구","rawCount":1,"acceptedCount":1,"rejectedCount":0,"duplicateCount":0}'::jsonb,
        '2026-08-26T01:05:00Z'
      )
    $bad_coordinate$,
    (select run_id from phase2_runs where label = 'seoul-full')
  ),
  '23514',
  'KTO stage coordinates are outside the configured region bounds',
  'Seoul staging rejects coordinates from another region'
);

select extensions.is(
  (
    select count(*) from public.map_tour_ingest_checkpoints
    where collection_run_id = (select run_id from phase2_runs where label = 'seoul-full')
  ),
  0::bigint,
  'a rejected stage row leaves no partial checkpoint'
);

set local role service_role;

select pg_temp.checkpoint_region(
  (select run_id from phase2_runs where label = 'seoul-full'),
  'seoul', '110', '99110002', 'Seoul retained fixture', 126.98, 37.57
);

reset role;

select extensions.is(
  (
    select count(*) from public.map_tour_ingest_checkpoints
    where collection_run_id = (select run_id from phase2_runs where label = 'seoul-full')
  ),
  25::bigint,
  'all Seoul districts are checkpointed before full publication'
);

select extensions.is(
  (
    select count(*) from public.map_tour_ingest_stage_places
    where collection_run_id = (select run_id from phase2_runs where label = 'seoul-full')
  ),
  2::bigint,
  'accepted core and shopping projections enter the same Seoul staging run'
);

set local role service_role;

insert into phase2_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'seoul-full', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase2_runs where label = 'seoul-full'),
  'completed', null, '2026-08-26T01:20:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase2_finalize_results where label = 'seoul-full'),
  'completed',
  'Seoul full finalization completes atomically'
);

select extensions.ok(
  not (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99110001'),
  'Seoul full finalization deactivates an unseen Seoul KTO row'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99110002'),
  'Seoul full finalization publishes its staged Seoul row'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99500001'),
  'Seoul full finalization leaves Jeju KTO rows active'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99260001'),
  'Seoul full finalization leaves Busan KTO rows active'
);

select extensions.ok(
  (
    select completed_query_count = 25
      and unique_place_count = 2
      and accepted_result_count = 2
      and status = 'completed'
    from public.map_ingest_runs
    where id = (select run_id from phase2_runs where label = 'seoul-full')
  ),
  'Seoul run statistics remain scoped to its checkpoints and stage rows'
);

insert into public.map_places (
  region_id, provider, provider_place_id, name, category_group, content_type_id,
  road_address, district_code, district_name, location, provider_visibility,
  pet_evidence_status, pet_evidence, pet_notes, is_active
) values (
  'seoul', 'tour', '99110003', 'Seoul delta stale sentinel', 'attraction', 12,
  '서울특별시 종로구 테스트로 3', '110', '종로구',
  extensions.st_setsrid(extensions.st_makepoint(126.98, 37.57), 4326)::extensions.geography,
  'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
  '확인 필요', true
);

set local role service_role;

insert into phase2_runs (label, run_id, planned_count)
select 'seoul-collision', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'phase2-test', 'full',
  (select array_agg(district_code order by district_code) from public.region_districts where region_id = 'seoul'),
  '2026-08-26T02:00:00Z'
);

select pg_temp.checkpoint_region(
  (select run_id from phase2_runs where label = 'seoul-collision'),
  'seoul', '110', '99500001', 'Attempted cross-region update', 126.98, 37.57
);

reset role;

select extensions.throws_ok(
  format(
    $collision$
      select * from public.finalize_tour_catalog_run_v1(
        %s, 'completed', null, '2026-08-26T02:10:00Z'
      )
    $collision$,
    (select run_id from phase2_runs where label = 'seoul-collision')
  ),
  '23514',
  'KTO provider identity belongs to another region',
  'cross-region KTO provider identity collisions fail before publication'
);

select extensions.is(
  (select name from public.map_places where provider = 'tour' and provider_place_id = '99500001'),
  'Jeju isolation sentinel',
  'a rejected Seoul collision cannot update the existing Jeju row'
);

set local role service_role;

insert into phase2_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'seoul-collision-failed', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase2_runs where label = 'seoul-collision'),
  'failed', '{"code":"collision"}', '2026-08-26T02:11:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase2_finalize_results where label = 'seoul-collision-failed'),
  'failed',
  'a collision run can be safely closed as failed without publication'
);

set local role service_role;

insert into phase2_runs (label, run_id, planned_count)
select 'seoul-delta', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'phase2-test', 'delta',
  (select array_agg(district_code order by district_code) from public.region_districts where region_id = 'seoul'),
  '2026-08-26T03:00:00Z'
);

select pg_temp.checkpoint_region(
  (select run_id from phase2_runs where label = 'seoul-delta'),
  'seoul', '140', '99110004', 'Seoul delta fixture', 126.99, 37.56
);

insert into phase2_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'seoul-delta', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase2_runs where label = 'seoul-delta'),
  'completed', null, '2026-08-26T03:10:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase2_finalize_results where label = 'seoul-delta'),
  'completed',
  'Seoul delta finalization completes'
);

select extensions.is(
  (select deactivated_row_count from phase2_finalize_results where label = 'seoul-delta'),
  0,
  'Seoul delta finalization reports no stale deactivation'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99110003'),
  'Seoul delta finalization leaves unseen Seoul rows active'
);

set local role service_role;

insert into phase2_runs (label, run_id, planned_count)
select 'seoul-failed', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'phase2-test', 'full',
  (select array_agg(district_code order by district_code) from public.region_districts where region_id = 'seoul'),
  '2026-08-26T04:00:00Z'
);

insert into phase2_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'seoul-failed', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase2_runs where label = 'seoul-failed'),
  'failed', '{"code":"provider_failure"}', '2026-08-26T04:01:00Z'
) as result;

reset role;

select extensions.is(
  (select status from public.map_ingest_runs where id = (select run_id from phase2_runs where label = 'seoul-failed')),
  'failed',
  'a failed provider traversal is recorded as failed'
);

select extensions.ok(
  not exists (
    select 1 from public.map_places
    where last_seen_run_id = (select run_id from phase2_runs where label = 'seoul-failed')
  ),
  'a failed provider traversal publishes no rows'
);

set local role service_role;

insert into phase2_runs (label, run_id, planned_count)
select 'seoul-partial', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'seoul', 'tour-seoul-service2-v2', 'phase2-test', 'full',
  (select array_agg(district_code order by district_code) from public.region_districts where region_id = 'seoul'),
  '2026-08-26T05:00:00Z'
);

reset role;

update public.map_ingest_runs
set status = 'partial'
where id = (select run_id from phase2_runs where label = 'seoul-partial');

select extensions.throws_ok(
  format(
    $partial$
      select * from public.finalize_tour_catalog_run_v1(
        %s, 'completed', null, '2026-08-26T05:01:00Z'
      )
    $partial$,
    (select run_id from phase2_runs where label = 'seoul-partial')
  ),
  '55000',
  'KTO run cannot be finalized',
  'a partial traversal cannot be published as complete'
);

update public.map_ingest_runs
set status = 'running'
where id = (select run_id from phase2_runs where label = 'seoul-partial');

set local role service_role;

insert into phase2_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'seoul-partial-failed', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase2_runs where label = 'seoul-partial'),
  'failed', '{"code":"partial"}', '2026-08-26T05:02:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase2_finalize_results where label = 'seoul-partial-failed'),
  'failed',
  'the blocked partial run can be closed without publication'
);

insert into public.map_places (
  region_id, provider, provider_place_id, name, category_group, content_type_id,
  road_address, district_code, district_name, location, provider_visibility,
  pet_evidence_status, pet_evidence, pet_notes, is_active
) values (
  'seoul', 'tour', '99110005', 'Seoul reverse-isolation sentinel', 'attraction', 12,
  '서울특별시 종로구 테스트로 5', '110', '종로구',
  extensions.st_setsrid(extensions.st_makepoint(126.98, 37.57), 4326)::extensions.geography,
  'unknown', 'official_unknown', '{"assessment":{"verdict":"unknown"}}'::jsonb,
  '확인 필요', true
);

set local role service_role;

insert into phase2_runs (label, run_id, planned_count)
select 'jeju-full', run_id, planned_district_count
from public.start_tour_catalog_run_v1(
  'jeju', 'tour-jeju-service2-v1', 'phase2-test', 'full', array['110', '130'],
  '2026-08-26T06:00:00Z'
);

select pg_temp.checkpoint_region(
  (select run_id from phase2_runs where label = 'jeju-full'),
  'jeju', '110', '99500002', 'Jeju full fixture', 126.53, 33.50
);

insert into phase2_finalize_results (
  label, run_status, inserted_row_count, updated_row_count, deactivated_row_count
)
select 'jeju-full', result.*
from public.finalize_tour_catalog_run_v1(
  (select run_id from phase2_runs where label = 'jeju-full'),
  'completed', null, '2026-08-26T06:10:00Z'
) as result;

reset role;

select extensions.is(
  (select run_status from phase2_finalize_results where label = 'jeju-full'),
  'completed',
  'the generalized finalizer preserves the Jeju full-run workflow'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99110005'),
  'a Jeju full run cannot deactivate unseen Seoul KTO rows'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99260001'),
  'a Jeju full run still cannot deactivate Busan KTO rows'
);

select extensions.ok(
  (select is_active from public.map_places where provider = 'tour' and provider_place_id = '99500002'),
  'the Jeju regression run publishes its own staged row'
);

select extensions.finish();

rollback;
