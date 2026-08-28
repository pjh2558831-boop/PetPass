-- Expand the shared KTO-only map catalog to every areaCode2 top-level region.
-- Existing Busan, Jeju, Seoul, Incheon, and Gyeonggi rows remain in place.

do $$
begin
  if exists (
    select 1 from public.map_ingest_runs
    where provider = 'tour' and status in ('planned', 'running', 'partial')
  ) then
    raise exception using
      errcode = '55000',
      message = 'complete or fail open KTO runs before enabling nationwide coverage';
  end if;
end;
$$;

update public.regions
set kto_registry_version = case region_id
  when 'jeju' then 'tour-jeju-service2-v2'
  when 'seoul' then 'tour-seoul-service2-v3'
  when 'incheon' then 'tour-incheon-service2-v2'
  when 'gyeonggi' then 'tour-gyeonggi-service2-v2'
end,
kto_catalog_datasets = array['core', 'shopping']::text[],
kto_list_only_content_type_ids = array[38]::integer[]
where region_id in ('jeju', 'seoul', 'incheon', 'gyeonggi');

insert into public.regions (
  region_id, display_name, legal_dong_code, kakao_collection_enabled,
  kto_catalog_enabled, kto_collection_enabled, kto_registry_version,
  kto_collection_west, kto_collection_south,
  kto_collection_east, kto_collection_north,
  kto_catalog_datasets, kto_list_only_content_type_ids
) values
  ('daejeon', '대전', '30', false, true, true, 'tour-daejeon-service2-v1', 127.18, 36.14, 127.57, 36.52, array['core', 'shopping']::text[], array[38]::integer[]),
  ('daegu', '대구', '27', false, true, true, 'tour-daegu-service2-v1', 128.32, 35.55, 129.0, 36.1, array['core', 'shopping']::text[], array[38]::integer[]),
  ('gwangju', '광주', '29', false, true, true, 'tour-gwangju-service2-v1', 126.62, 34.95, 127.02, 35.35, array['core', 'shopping']::text[], array[38]::integer[]),
  ('ulsan', '울산', '31', false, true, true, 'tour-ulsan-service2-v1', 128.95, 35.3, 129.5, 35.75, array['core', 'shopping']::text[], array[38]::integer[]),
  ('sejong', '세종', '36', false, true, true, 'tour-sejong-service2-v1', 127.08, 36.34, 127.47, 36.72, array['core', 'shopping']::text[], array[38]::integer[]),
  ('gangwon', '강원', '51', false, true, true, 'tour-gangwon-service2-v1', 127.02, 36.85, 129.45, 38.7, array['core', 'shopping']::text[], array[38]::integer[]),
  ('chungbuk', '충북', '43', false, true, true, 'tour-chungbuk-service2-v1', 127.25, 36.0, 128.65, 37.25, array['core', 'shopping']::text[], array[38]::integer[]),
  ('chungnam', '충남', '44', false, true, true, 'tour-chungnam-service2-v1', 125.9, 35.95, 127.65, 37.05, array['core', 'shopping']::text[], array[38]::integer[]),
  ('gyeongbuk', '경북', '47', false, true, true, 'tour-gyeongbuk-service2-v1', 127.95, 35.5, 131.0, 37.55, array['core', 'shopping']::text[], array[38]::integer[]),
  ('gyeongnam', '경남', '48', false, true, true, 'tour-gyeongnam-service2-v1', 127.45, 34.55, 129.25, 35.95, array['core', 'shopping']::text[], array[38]::integer[]),
  ('jeonbuk', '전북', '52', false, true, true, 'tour-jeonbuk-service2-v1', 126.35, 35.25, 127.95, 36.25, array['core', 'shopping']::text[], array[38]::integer[]),
  ('jeonnam', '전남', '46', false, true, true, 'tour-jeonnam-service2-v1', 125.85, 33.85, 127.9, 35.5, array['core', 'shopping']::text[], array[38]::integer[]);

insert into public.region_districts (region_id, district_code, district_name) values
  ('daejeon', '001', '대덕구'), ('daejeon', '002', '동구'), ('daejeon', '003', '서구'), ('daejeon', '004', '유성구'), ('daejeon', '005', '중구'),
  ('daegu', '001', '남구'), ('daegu', '002', '달서구'), ('daegu', '003', '달성군'), ('daegu', '004', '동구'), ('daegu', '005', '북구'), ('daegu', '006', '서구'), ('daegu', '007', '수성구'), ('daegu', '008', '중구'), ('daegu', '009', '군위군'),
  ('gwangju', '001', '광산구'), ('gwangju', '002', '남구'), ('gwangju', '003', '동구'), ('gwangju', '004', '북구'), ('gwangju', '005', '서구'),
  ('ulsan', '001', '중구'), ('ulsan', '002', '남구'), ('ulsan', '003', '동구'), ('ulsan', '004', '북구'), ('ulsan', '005', '울주군'),
  ('sejong', '001', '세종특별자치시'),
  ('gangwon', '001', '강릉시'), ('gangwon', '002', '고성군'), ('gangwon', '003', '동해시'), ('gangwon', '004', '삼척시'), ('gangwon', '005', '속초시'), ('gangwon', '006', '양구군'), ('gangwon', '007', '양양군'), ('gangwon', '008', '영월군'), ('gangwon', '009', '원주시'), ('gangwon', '010', '인제군'), ('gangwon', '011', '정선군'), ('gangwon', '012', '철원군'), ('gangwon', '013', '춘천시'), ('gangwon', '014', '태백시'), ('gangwon', '015', '평창군'), ('gangwon', '016', '홍천군'), ('gangwon', '017', '화천군'), ('gangwon', '018', '횡성군'),
  ('chungbuk', '001', '괴산군'), ('chungbuk', '002', '단양군'), ('chungbuk', '003', '보은군'), ('chungbuk', '004', '영동군'), ('chungbuk', '005', '옥천군'), ('chungbuk', '006', '음성군'), ('chungbuk', '007', '제천시'), ('chungbuk', '008', '진천군'), ('chungbuk', '009', '청원군'), ('chungbuk', '010', '청주시'), ('chungbuk', '011', '충주시'), ('chungbuk', '012', '증평군'),
  ('chungnam', '001', '공주시'), ('chungnam', '002', '금산군'), ('chungnam', '003', '논산시'), ('chungnam', '004', '당진시'), ('chungnam', '005', '보령시'), ('chungnam', '006', '부여군'), ('chungnam', '007', '서산시'), ('chungnam', '008', '서천군'), ('chungnam', '009', '아산시'), ('chungnam', '011', '예산군'), ('chungnam', '012', '천안시'), ('chungnam', '013', '청양군'), ('chungnam', '014', '태안군'), ('chungnam', '015', '홍성군'), ('chungnam', '016', '계룡시'),
  ('gyeongbuk', '001', '경산시'), ('gyeongbuk', '002', '경주시'), ('gyeongbuk', '003', '고령군'), ('gyeongbuk', '004', '구미시'), ('gyeongbuk', '006', '김천시'), ('gyeongbuk', '007', '문경시'), ('gyeongbuk', '008', '봉화군'), ('gyeongbuk', '009', '상주시'), ('gyeongbuk', '010', '성주군'), ('gyeongbuk', '011', '안동시'), ('gyeongbuk', '012', '영덕군'), ('gyeongbuk', '013', '영양군'), ('gyeongbuk', '014', '영주시'), ('gyeongbuk', '015', '영천시'), ('gyeongbuk', '016', '예천군'), ('gyeongbuk', '017', '울릉군'), ('gyeongbuk', '018', '울진군'), ('gyeongbuk', '019', '의성군'), ('gyeongbuk', '020', '청도군'), ('gyeongbuk', '021', '청송군'), ('gyeongbuk', '022', '칠곡군'), ('gyeongbuk', '023', '포항시'),
  ('gyeongnam', '001', '거제시'), ('gyeongnam', '002', '거창군'), ('gyeongnam', '003', '고성군'), ('gyeongnam', '004', '김해시'), ('gyeongnam', '005', '남해군'), ('gyeongnam', '006', '마산시'), ('gyeongnam', '007', '밀양시'), ('gyeongnam', '008', '사천시'), ('gyeongnam', '009', '산청군'), ('gyeongnam', '010', '양산시'), ('gyeongnam', '012', '의령군'), ('gyeongnam', '013', '진주시'), ('gyeongnam', '014', '진해시'), ('gyeongnam', '015', '창녕군'), ('gyeongnam', '016', '창원시'), ('gyeongnam', '017', '통영시'), ('gyeongnam', '018', '하동군'), ('gyeongnam', '019', '함안군'), ('gyeongnam', '020', '함양군'), ('gyeongnam', '021', '합천군'),
  ('jeonbuk', '001', '고창군'), ('jeonbuk', '002', '군산시'), ('jeonbuk', '003', '김제시'), ('jeonbuk', '004', '남원시'), ('jeonbuk', '005', '무주군'), ('jeonbuk', '006', '부안군'), ('jeonbuk', '007', '순창군'), ('jeonbuk', '008', '완주군'), ('jeonbuk', '009', '익산시'), ('jeonbuk', '010', '임실군'), ('jeonbuk', '011', '장수군'), ('jeonbuk', '012', '전주시'), ('jeonbuk', '013', '정읍시'), ('jeonbuk', '014', '진안군'),
  ('jeonnam', '001', '강진군'), ('jeonnam', '002', '고흥군'), ('jeonnam', '003', '곡성군'), ('jeonnam', '004', '광양시'), ('jeonnam', '005', '구례군'), ('jeonnam', '006', '나주시'), ('jeonnam', '007', '담양군'), ('jeonnam', '008', '목포시'), ('jeonnam', '009', '무안군'), ('jeonnam', '010', '보성군'), ('jeonnam', '011', '순천시'), ('jeonnam', '012', '신안군'), ('jeonnam', '013', '여수시'), ('jeonnam', '016', '영광군'), ('jeonnam', '017', '영암군'), ('jeonnam', '018', '완도군'), ('jeonnam', '019', '장성군'), ('jeonnam', '020', '장흥군'), ('jeonnam', '021', '진도군'), ('jeonnam', '022', '함평군'), ('jeonnam', '023', '해남군'), ('jeonnam', '024', '화순군');

alter table public.map_places
  drop constraint map_places_tour_dataset_shape_check,
  add constraint map_places_tour_dataset_shape_check check (
    provider <> 'tour'
    or (catalog_dataset = 'core' and evidence_collection_mode = 'detailed')
    or (
      catalog_dataset = 'core' and evidence_collection_mode = 'list_only'
      and (content_type_id is null or content_type_id <> 38)
      and category_group = 'other'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    )
    or (
      catalog_dataset = 'shopping' and evidence_collection_mode = 'list_only'
      and content_type_id = 38 and category_group = 'shopping'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    )
  );

alter table public.map_tour_ingest_stage_places
  alter column content_type_id drop not null,
  drop constraint map_tour_ingest_stage_places_category_group_check,
  drop constraint map_tour_ingest_stage_places_content_type_id_check,
  drop constraint map_tour_ingest_stage_places_dataset_shape_check,
  add constraint map_tour_ingest_stage_places_category_group_check check (
    category_group in (
      'attraction', 'culture', 'festival', 'leisure',
      'accommodation', 'food', 'shopping', 'other'
    )
  ),
  add constraint map_tour_ingest_stage_places_content_type_id_check check (
    content_type_id is null or content_type_id > 0
  ),
  add constraint map_tour_ingest_stage_places_dataset_shape_check check (
    (
      catalog_dataset = 'core' and evidence_collection_mode = 'detailed'
      and content_type_id in (12, 14, 15, 28, 32, 39)
      and category_group <> 'shopping'
    )
    or (
      catalog_dataset = 'core' and evidence_collection_mode = 'list_only'
      and (content_type_id is null or content_type_id <> 38)
      and category_group = 'other'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    )
    or (
      catalog_dataset = 'shopping' and evidence_collection_mode = 'list_only'
      and content_type_id = 38 and category_group = 'shopping'
      and pet_evidence_status = 'official_unknown'
      and pet_evidence #>> '{assessment,verdict}' = 'unknown'
      and pet_evidence->>'verificationStatus' = 'verification_required'
    )
  );

create or replace function public.map_tour_stage_validate_region_v3()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_region public.regions%rowtype;
begin
  select region.* into v_region
  from public.regions as region
  where region.region_id = new.region_id;

  if not found or not v_region.kto_collection_enabled then
    raise exception using errcode = '55000',
      message = 'KTO collection is disabled for region ' || new.region_id;
  end if;
  if not (new.catalog_dataset = any(v_region.kto_catalog_datasets)) then
    raise exception using errcode = '23514',
      message = 'KTO catalog dataset is disabled for region';
  end if;
  if new.catalog_dataset = 'shopping' and (
    new.evidence_collection_mode <> 'list_only'
    or not (new.content_type_id = any(v_region.kto_list_only_content_type_ids))
  ) then
    raise exception using errcode = '23514',
      message = 'KTO Shopping evidence mode is not allowed by the region capability';
  end if;
  if new.catalog_dataset = 'core' and new.evidence_collection_mode = 'list_only'
    and new.category_group <> 'other'
  then
    raise exception using errcode = '23514',
      message = 'KTO unclassified core rows must use the other category';
  end if;
  if new.longitude not between v_region.kto_collection_west and v_region.kto_collection_east
    or new.latitude not between v_region.kto_collection_south and v_region.kto_collection_north
  then
    raise exception using errcode = '23514',
      message = 'KTO stage coordinates are outside the configured region bounds';
  end if;
  return new;
end;
$$;

create or replace function public.map_places_set_kto_other_category_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.provider = 'tour' and new.catalog_dataset = 'core'
    and new.evidence_collection_mode = 'list_only'
    and new.category_group = 'other'
  then
    new.normalized_category := 'other';
  end if;
  return new;
end;
$$;

create trigger map_places_set_kto_other_category_v1
before insert or update of
  provider, catalog_dataset, evidence_collection_mode, category_group
on public.map_places
for each row execute function public.map_places_set_kto_other_category_v1();

revoke all on function public.map_places_set_kto_other_category_v1()
  from public, anon, authenticated, service_role;

comment on function public.map_places_set_kto_other_category_v1() is
  'Trigger-only projection for unfamiliar or missing KTO content types retained as core 기타.';
