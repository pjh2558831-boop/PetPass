-- Adds Jeonbuk/Jeonnam only; preserves existing regions and evidence.
-- Version aligned with the applied Production migration.
-- Jeonbuk includes its historical address prefix; existing provider data is unchanged.
set lock_timeout = '5s';

alter table public.map_places drop constraint map_places_kakao_catalog_shape_check;
alter table public.map_places
  add constraint map_places_kakao_catalog_shape_check check (
    provider <> 'kakao'
    or (
      review_status is not null
      and public_visibility is not null
      and lifecycle_status is not null
      and verification_evidence is not null
      and requires_recheck is not null
      and (
        (
          review_status = 'needs_review'
          and not public_visibility
          and not is_active
          and lifecycle_status = 'stale'
        )
        or (
          candidate_kind is not null
          and category_name is not null
          and length(btrim(category_name)) > 0
          and (
            (candidate_kind = 'pet_travel_candidate' and normalized_category is not null)
            or (candidate_kind in ('veterinary', 'pet_shop') and normalized_category is null)
          )
          and provider_place_id ~ '^[0-9]+$'
          and source_url = 'https://place.map.kakao.com/' || provider_place_id
          and (
            nullif(btrim(road_address), '') is not null
            or nullif(btrim(lot_address), '') is not null
          )
          and case region_id
            when 'busan' then
              (nullif(btrim(road_address), '') is null or road_address ~ (
                '^(부산|부산광역시)[[:space:]]+' || district_name || '([[:space:]]|$)'
              ))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ (
                '^(부산|부산광역시)[[:space:]]+' || district_name || '([[:space:]]|$)'
              ))
              and extensions.st_x(location::extensions.geometry) between 128.75 and 129.4
              and extensions.st_y(location::extensions.geometry) between 34.95 and 35.5
            when 'jeju' then
              (nullif(btrim(road_address), '') is null or road_address ~ (
                '^(제주|제주특별자치도)[[:space:]]+' || district_name || '([[:space:]]|$)'
              ))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ (
                '^(제주|제주특별자치도)[[:space:]]+' || district_name || '([[:space:]]|$)'
              ))
              and extensions.st_x(location::extensions.geometry) between 125.9 and 127.1
              and extensions.st_y(location::extensions.geometry) between 33.0 and 34.0
            when 'seoul' then
              (nullif(btrim(road_address), '') is null or road_address ~ (
                '^(서울|서울특별시)[[:space:]]+' || district_name || '([[:space:]]|$)'
              ))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ (
                '^(서울|서울특별시)[[:space:]]+' || district_name || '([[:space:]]|$)'
              ))
              and extensions.st_x(location::extensions.geometry) between 126.75 and 127.2
              and extensions.st_y(location::extensions.geometry) between 37.4 and 37.72
            when 'gyeonggi' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(경기|경기도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(경기|경기도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 126.45 and 127.9
              and extensions.st_y(location::extensions.geometry) between 36.8 and 38.35
            when 'incheon' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(인천|인천광역시)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(인천|인천광역시)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 124.4 and 126.9
              and extensions.st_y(location::extensions.geometry) between 36.9 and 38
            when 'gangwon' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(강원|강원도|강원특별자치도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(강원|강원도|강원특별자치도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 127.02 and 129.45
              and extensions.st_y(location::extensions.geometry) between 36.85 and 38.7
            when 'chungbuk' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(충북|충청북도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(충북|충청북도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 127.25 and 128.65
              and extensions.st_y(location::extensions.geometry) between 36 and 37.25
            when 'chungnam' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(충남|충청남도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(충남|충청남도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 125.9 and 127.65
              and extensions.st_y(location::extensions.geometry) between 35.95 and 37.05
            when 'gyeongbuk' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(경북|경상북도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(경북|경상북도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 127.95 and 131
              and extensions.st_y(location::extensions.geometry) between 35.5 and 37.55
            when 'gyeongnam' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(경남|경상남도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(경남|경상남도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 127.45 and 129.25
              and extensions.st_y(location::extensions.geometry) between 34.55 and 35.95
            when 'jeonbuk' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(전북|전라북도|전북특별자치도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(전북|전라북도|전북특별자치도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 125.8 and 127.95
              and extensions.st_y(location::extensions.geometry) between 35.25 and 36.25
            when 'jeonnam' then
              (nullif(btrim(road_address), '') is null or road_address ~ ('^(전남|전라남도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and (nullif(btrim(lot_address), '') is null or lot_address ~ ('^(전남|전라남도)[[:space:]]+' || district_name || '([[:space:]]|$)'))
              and extensions.st_x(location::extensions.geometry) between 125 and 127.9
              and extensions.st_y(location::extensions.geometry) between 33.85 and 35.5
            else false
          end
        )
      )
    )
  );


create or replace function public.start_kakao_jeonbuk_catalog_run_v1(
  p_registry_version text,
  p_collector_version text,
  p_queries jsonb,
  p_is_full_catalog_run boolean default true,
  p_started_at timestamptz default now()
)
returns table (
  run_id bigint,
  planned_query_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_query_count integer;
  v_inserted_query_count integer;
  v_validated_full_query_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:kakao-catalog-v1')
  );

  if
    p_registry_version is null
    or btrim(p_registry_version) <> 'kakao-jeonbuk-query-registry-v1'
    or nullif(btrim(p_collector_version), '') is null
    or p_queries is null
    or pg_catalog.jsonb_typeof(p_queries) <> 'array'
    or p_is_full_catalog_run is null
    or p_started_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'run plan metadata is invalid';
  end if;

  v_query_count := pg_catalog.jsonb_array_length(p_queries);
  if
    v_query_count < 1
    or v_query_count > 434
    or (p_is_full_catalog_run and v_query_count <> 434)
  then
    raise exception using
      errcode = '22023',
      message = 'run plan query count is invalid';
  end if;

  if (
    select count(distinct query.query_key)
    from pg_catalog.jsonb_to_recordset(p_queries) as query (
      query_key text,
      query_text text,
      district_code text,
      district text,
      candidate_kind text,
      normalized_category text,
      category_group_code text
    )
  ) <> v_query_count then
    raise exception using
      errcode = '23505',
      message = 'query keys must be unique and non-null';
  end if;

  if p_is_full_catalog_run then
    with districts(district_code, district) as (
      select district_code, district_name from public.region_districts where region_id = 'jeonbuk'
    ),
    templates(
      family,
      template_index,
      query_suffix,
      candidate_kind,
      normalized_category,
      category_group_code
    ) as (
      values
        ('general', 0, '애견동반', 'pet_travel_candidate', 'other', null),
        ('general', 1, '반려견 동반', 'pet_travel_candidate', 'other', null),
        ('general', 2, '반려동물 동반', 'pet_travel_candidate', 'other', null),
        ('general', 3, '강아지 동반', 'pet_travel_candidate', 'other', null),
        ('general', 4, '펫프렌들리', 'pet_travel_candidate', 'other', null),
        ('cafe', 0, '애견동반 카페', 'pet_travel_candidate', 'cafe', 'CE7'),
        ('cafe', 1, '반려동물 동반 카페', 'pet_travel_candidate', 'cafe', 'CE7'),
        ('cafe', 2, '애견카페', 'pet_travel_candidate', 'cafe', 'CE7'),
        ('food', 0, '애견동반 식당', 'pet_travel_candidate', 'food', 'FD6'),
        ('food', 1, '반려동물 동반 식당', 'pet_travel_candidate', 'food', 'FD6'),
        ('food', 2, '애견동반 음식점', 'pet_travel_candidate', 'food', 'FD6'),
        ('accommodation', 0, '애견동반 숙소', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 1, '반려동물 동반 숙소', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 2, '애견펜션', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 3, '애견동반 호텔', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 4, '애견동반 캠핑장', 'pet_travel_candidate', 'camping', null),
        ('outdoor_leisure', 0, '애견동반 관광지', 'pet_travel_candidate', 'attraction', 'AT4'),
        ('outdoor_leisure', 1, '반려견 동반 공원', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 2, '애견동반 공원', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 3, '애견동반 해수욕장', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 4, '반려견 산책', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 5, '애견동반 레저', 'pet_travel_candidate', 'leisure', null),
        ('veterinary', 0, '동물병원', 'veterinary', null, null),
        ('veterinary', 1, '24시 동물병원', 'veterinary', null, null),
        ('veterinary', 2, '동물의료센터', 'veterinary', null, null),
        ('veterinary', 3, '응급 동물병원', 'veterinary', null, null),
        ('pet_shop', 0, '펫샵', 'pet_shop', null, null),
        ('pet_shop', 1, '애견용품', 'pet_shop', null, null),
        ('pet_shop', 2, '반려동물용품', 'pet_shop', null, null),
        ('pet_shop', 3, '펫용품', 'pet_shop', null, null),
        ('pet_shop', 4, '애완동물용품', 'pet_shop', null, null)
    ),
    expected as (
      select
        'kakao-jeonbuk-v1:'
          || districts.district_code
          || ':'
          || templates.family
          || ':'
          || templates.template_index::text as query_key,
        '전북 ' || districts.district || ' ' || templates.query_suffix as query_text,
        districts.district_code,
        districts.district,
        templates.candidate_kind,
        templates.normalized_category,
        templates.category_group_code
      from districts
      cross join templates
    ),
    supplied as (
      select query.*
      from pg_catalog.jsonb_to_recordset(p_queries) as query (
        query_key text,
        query_text text,
        district_code text,
        district text,
        candidate_kind text,
        normalized_category text,
        category_group_code text
      )
    )
    select count(*)::integer
    into v_validated_full_query_count
    from supplied
    join expected
      on expected.query_key = supplied.query_key
      and expected.query_text = supplied.query_text
      and expected.district_code = supplied.district_code
      and expected.district = supplied.district
      and expected.candidate_kind = supplied.candidate_kind
      and expected.normalized_category is not distinct from supplied.normalized_category
      and expected.category_group_code is not distinct from supplied.category_group_code;

    if v_validated_full_query_count <> 434 then
      raise exception using
        errcode = '22023',
        message = 'full run plan does not match kakao-jeonbuk-query-registry-v1';
    end if;
  end if;

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
    'jeonbuk',
    'kakao',
    'running',
    p_started_at,
    btrim(p_collector_version),
    btrim(p_registry_version),
    p_is_full_catalog_run,
    v_query_count
  )
  returning id into v_run_id;

  insert into public.map_ingest_run_queries (
    collection_run_id,
    query_key,
    query_text,
    district_code,
    district,
    candidate_kind,
    normalized_category,
    category_group_code,
    status,
    created_at,
    updated_at
  )
  select
    v_run_id,
    query.query_key,
    query.query_text,
    query.district_code,
    query.district,
    query.candidate_kind,
    query.normalized_category,
    query.category_group_code,
    'planned',
    p_started_at,
    p_started_at
  from pg_catalog.jsonb_to_recordset(p_queries) as query (
    query_key text,
    query_text text,
    district_code text,
    district text,
    candidate_kind text,
    normalized_category text,
    category_group_code text
  );

  get diagnostics v_inserted_query_count = row_count;
  if v_inserted_query_count <> v_query_count then
    raise exception using
      errcode = 'P0001',
      message = 'query plan insert was incomplete';
  end if;

  return query select v_run_id, v_query_count;
end;
$$;

create or replace function public.commit_kakao_jeonbuk_catalog_query_v1(
  p_run_id bigint,
  p_query_key text,
  p_candidates jsonb,
  p_last_completed_page integer,
  p_provider_call_count integer,
  p_provider_result_count integer,
  p_accepted_result_count integer,
  p_rejected_result_count integer,
  p_saturated boolean default false,
  p_duplicate_result_count integer default 0,
  p_out_of_district_result_count integer default 0,
  p_invalid_coordinate_result_count integer default 0,
  p_classification_rejection_count integer default 0,
  p_provider_429_count integer default 0,
  p_timeout_count integer default 0,
  p_provider_error_count integer default 0,
  p_run_provider_call_count integer default null,
  p_run_provider_429_count integer default null,
  p_run_timeout_count integer default null,
  p_run_provider_error_count integer default null,
  p_completed_at timestamptz default now()
)
returns table (
  already_completed boolean,
  inserted_row_count integer,
  updated_row_count integer,
  preserved_review_row_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.map_ingest_runs%rowtype;
  v_query public.map_ingest_run_queries%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_preserved integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:kakao-catalog-v1')
  );

  if p_completed_at is null then
    raise exception using
      errcode = '22004',
      message = 'completed_at is required';
  end if;

  if p_candidates is null or pg_catalog.jsonb_typeof(p_candidates) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'candidates must be a JSON array';
  end if;

  if
    p_last_completed_page is null
    or p_provider_call_count is null
    or p_provider_result_count is null
    or p_accepted_result_count is null
    or p_rejected_result_count is null
    or p_saturated is null
    or p_duplicate_result_count is null
    or p_out_of_district_result_count is null
    or p_invalid_coordinate_result_count is null
    or p_classification_rejection_count is null
    or p_provider_429_count is null
    or p_timeout_count is null
    or p_provider_error_count is null
    or (p_run_provider_call_count is not null and p_run_provider_call_count < 0)
    or (p_run_provider_429_count is not null and p_run_provider_429_count < 0)
    or (p_run_timeout_count is not null and p_run_timeout_count < 0)
    or (p_run_provider_error_count is not null and p_run_provider_error_count < 0)
    or p_last_completed_page < 1
    or p_last_completed_page > 3
    or p_provider_call_count < p_last_completed_page
    or p_provider_call_count > 9
    or p_provider_result_count < 0
    or p_provider_result_count > 45
    or p_accepted_result_count < 0
    or p_accepted_result_count > 45
    or p_rejected_result_count < 0
    or p_rejected_result_count > 45
    or p_duplicate_result_count < 0
    or p_out_of_district_result_count < 0
    or p_invalid_coordinate_result_count < 0
    or p_classification_rejection_count < 0
    or p_provider_429_count < 0
    or p_timeout_count < 0
    or p_provider_error_count < 0
    or pg_catalog.jsonb_array_length(p_candidates) > 45
    or p_provider_result_count <> (
      p_accepted_result_count::bigint + p_rejected_result_count::bigint
    )
    or p_accepted_result_count <> (
      pg_catalog.jsonb_array_length(p_candidates)::bigint
      + p_duplicate_result_count::bigint
    )
    or p_accepted_result_count < pg_catalog.jsonb_array_length(p_candidates)
  then
    raise exception using
      errcode = '22023',
      message = 'query counters are invalid';
  end if;

  select run.*
  into v_run
  from public.map_ingest_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'collection run not found';
  end if;

  if v_run.provider <> 'kakao' or v_run.region_id <> 'jeonbuk' then
    raise exception using errcode = '22023', message = 'run provider must be kakao';
  end if;

  if v_run.status not in ('running', 'partial', 'failed') then
    raise exception using
      errcode = '55000',
      message = 'collection run is not writable';
  end if;

  select query.*
  into v_query
  from public.map_ingest_run_queries as query
  where
    query.collection_run_id = p_run_id
    and query.query_key = p_query_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'planned query not found';
  end if;

  if v_query.status = 'completed' then
    return query
    select
      true,
      v_query.inserted_row_count,
      v_query.updated_row_count,
      v_query.preserved_review_row_count;
    return;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
    where
      nullif(btrim(candidate.provider_place_id), '') is null
      or candidate.provider_place_id !~ '^[0-9]+$'
      or nullif(btrim(candidate.name), '') is null
      or nullif(btrim(candidate.category_name), '') is null
      or nullif(btrim(candidate.source_url), '') is null
      or candidate.source_url !~ (
        '^https?://place[.]map[.]kakao[.]com/'
        || candidate.provider_place_id
        || '/?$'
      )
      or candidate.candidate_kind is distinct from v_query.candidate_kind
      or candidate.district_code is distinct from v_query.district_code
      or candidate.district_name is distinct from v_query.district
      or (
        candidate.candidate_kind = 'pet_travel_candidate'
        and candidate.normalized_category not in (
          'cafe',
          'food',
          'accommodation',
          'attraction',
          'park_walk',
          'leisure',
          'camping',
          'other'
        )
      )
      or (
        candidate.candidate_kind in ('veterinary', 'pet_shop')
        and candidate.normalized_category is not null
      )
      or candidate.category_group_code !~ '^[A-Z0-9]{2,10}$'
      or coalesce(
        nullif(btrim(candidate.road_address), ''),
        nullif(btrim(candidate.lot_address), '')
      ) is null
      or (
        nullif(btrim(candidate.road_address), '') is not null
        and candidate.road_address !~ (
          '^(전북|전라북도|전북특별자치도)[[:space:]]+'
          || candidate.district_name
          || '([[:space:]]|$)'
        )
      )
      or (
        nullif(btrim(candidate.lot_address), '') is not null
        and candidate.lot_address !~ (
          '^(전북|전라북도|전북특별자치도)[[:space:]]+'
          || candidate.district_name
          || '([[:space:]]|$)'
        )
      )
      or candidate.longitude is null
      or candidate.longitude < 125.8
      or candidate.longitude > 127.95
      or candidate.latitude is null
      or candidate.latitude < 35.25
      or candidate.latitude > 36.25
      or candidate.page is null
      or candidate.page < 1
      or candidate.page > p_last_completed_page
      or candidate.result_rank is null
      or candidate.result_rank < 1
      or candidate.result_rank > 15
  ) then
    raise exception using
      errcode = '22023',
      message = 'candidate payload violates the Kakao catalog contract';
  end if;

  with parsed as (
    select candidate.*
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
  ),
  deduplicated as (
    select distinct on (parsed.provider_place_id) parsed.*
    from parsed
    order by parsed.provider_place_id, parsed.page, parsed.result_rank
  )
  select
    count(*) filter (where place.id is null)::integer,
    count(*) filter (
      where place.id is not null
        and place.last_seen_run_id is distinct from p_run_id
    )::integer,
    count(*) filter (
      where place.id is not null
        and place.last_seen_run_id is distinct from p_run_id
        and (
          place.review_status <> 'unreviewed'
          or place.reviewed_at is not null
          or place.reviewed_by is not null
          or place.review_note is not null
          or place.verification_evidence <> '{}'::jsonb
        )
    )::integer
  into v_inserted, v_updated, v_preserved
  from deduplicated
  left join public.map_places as place
    on place.provider = 'kakao'
    and place.provider_place_id = deduplicated.provider_place_id;

  with parsed as (
    select candidate.*
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
  ),
  deduplicated as (
    select distinct on (parsed.provider_place_id) parsed.*
    from parsed
    order by parsed.provider_place_id, parsed.page, parsed.result_rank
  )
  insert into public.map_places (
    provider,
    provider_place_id,
    name,
    category_group,
    category_code,
    category_name,
    category_group_code,
    category_group_name,
    normalized_category,
    candidate_kind,
    road_address,
    lot_address,
    district_code,
    district_name,
    location,
    phone,
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
    last_seen_run_id,
    pending_publication_run_id,
    first_seen_at,
    last_seen_at,
    fetched_at,
    expires_at,
    created_at,
    updated_at
  )
  select
    'kakao',
    candidate.provider_place_id,
    candidate.name,
    case candidate.normalized_category
      when 'cafe' then 'food'
      when 'food' then 'food'
      when 'accommodation' then 'accommodation'
      when 'attraction' then 'attraction'
      when 'park_walk' then 'leisure'
      when 'leisure' then 'leisure'
      when 'camping' then 'leisure'
      else null
    end,
    candidate.category_name,
    candidate.category_name,
    candidate.category_group_code,
    candidate.category_group_name,
    candidate.normalized_category,
    candidate.candidate_kind,
    nullif(btrim(candidate.road_address), ''),
    nullif(btrim(candidate.lot_address), ''),
    candidate.district_code,
    candidate.district_name,
    extensions.st_setsrid(
      extensions.st_makepoint(candidate.longitude, candidate.latitude),
      4326
    )::extensions.geography,
    nullif(btrim(candidate.phone), ''),
    'https://place.map.kakao.com/' || candidate.provider_place_id,
    'not_applicable',
    'search_candidate',
    pg_catalog.jsonb_build_object(
      'source',
      'Kakao Local keyword search',
      'verification_required',
      true,
      'retrieved_at',
      coalesce(candidate.discovered_at, p_completed_at)
    ),
    '카카오 검색 후보 · 동반 여부 확인 필요',
    true,
    'unreviewed',
    true,
    'current',
    '{}'::jsonb,
    false,
    p_run_id,
    p_run_id,
    coalesce(candidate.discovered_at, p_completed_at),
    coalesce(candidate.discovered_at, p_completed_at),
    coalesce(candidate.discovered_at, p_completed_at),
    null,
    coalesce(candidate.discovered_at, p_completed_at),
    coalesce(candidate.discovered_at, p_completed_at)
  from deduplicated as candidate
  on conflict (provider, provider_place_id) do update
  set
    name = excluded.name,
    (
      category_group,
      category_code,
      category_name,
      category_group_code,
      category_group_name,
      normalized_category,
      candidate_kind
    ) = (
      select
        case
          when winner.candidate_kind in ('veterinary', 'pet_shop') then null
          else winner.category_group
        end,
        winner.category_code,
        winner.category_name,
        winner.category_group_code,
        winner.category_group_name,
        case
          when winner.candidate_kind in ('veterinary', 'pet_shop') then null
          else winner.normalized_category
        end,
        winner.candidate_kind
      from (
        values
          (
            false,
            map_places.category_group,
            map_places.category_code,
            map_places.category_name,
            map_places.category_group_code,
            map_places.category_group_name,
            map_places.normalized_category,
            map_places.candidate_kind
          ),
          (
            true,
            excluded.category_group,
            excluded.category_code,
            excluded.category_name,
            excluded.category_group_code,
            excluded.category_group_name,
            excluded.normalized_category,
            excluded.candidate_kind
          )
      ) as winner (
        is_incoming,
        category_group,
        category_code,
        category_name,
        category_group_code,
        category_group_name,
        normalized_category,
        candidate_kind
      )
      order by
        case
          when map_places.last_seen_run_id is distinct from p_run_id
            then case when winner.is_incoming then 1 else 0 end
          when winner.candidate_kind = 'veterinary' then 300
          when winner.candidate_kind = 'pet_shop' then 200
          else 100 + case winner.normalized_category
            when 'cafe' then 8
            when 'food' then 7
            when 'accommodation' then 6
            when 'attraction' then 5
            when 'park_walk' then 4
            when 'leisure' then 3
            when 'camping' then 2
            else 1
          end
        end desc,
        winner.is_incoming asc
      limit 1
    ),
    road_address = excluded.road_address,
    lot_address = excluded.lot_address,
    district_code = excluded.district_code,
    district_name = excluded.district_name,
    location = excluded.location,
    phone = excluded.phone,
    source_url = excluded.source_url,
    provider_visibility = 'not_applicable',
    pet_evidence_status = 'search_candidate',
    pet_evidence = map_places.pet_evidence,
    pet_notes = map_places.pet_notes,
    is_active = case
      when map_places.review_status = 'rejected' then false
      else map_places.is_active
    end,
    public_visibility = case
      when map_places.review_status = 'rejected' then false
      else map_places.public_visibility
    end,
    lifecycle_status = map_places.lifecycle_status,
    requires_recheck = map_places.requires_recheck,
    last_seen_run_id = p_run_id,
    pending_publication_run_id = case
      when map_places.pending_publication_run_id is null then null
      else p_run_id
    end,
    last_seen_at = greatest(map_places.last_seen_at, excluded.last_seen_at),
    fetched_at = excluded.fetched_at,
    -- Existing rows keep their legacy compatibility expiry during a partial
    -- run. New rows have NULL until successful run finalization publishes them.
    expires_at = map_places.expires_at,
    updated_at = excluded.updated_at;

  with parsed as (
    select candidate.*
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
  ),
  deduplicated as (
    select distinct on (parsed.provider_place_id) parsed.*
    from parsed
    order by parsed.provider_place_id, parsed.page, parsed.result_rank
  )
  insert into public.map_place_query_hits (
    candidate_id,
    collection_run_id,
    query_key,
    query_text,
    district_code,
    district,
    category_group_code,
    page,
    result_rank,
    discovered_at
  )
  select
    place.id,
    p_run_id,
    v_query.query_key,
    v_query.query_text,
    v_query.district_code,
    v_query.district,
    v_query.category_group_code,
    candidate.page,
    candidate.result_rank,
    coalesce(candidate.discovered_at, p_completed_at)
  from deduplicated as candidate
  join public.map_places as place
    on place.provider = 'kakao'
    and place.provider_place_id = candidate.provider_place_id
  on conflict (candidate_id, collection_run_id, query_key) do update
  set
    query_text = excluded.query_text,
    district_code = excluded.district_code,
    district = excluded.district,
    category_group_code = excluded.category_group_code,
    page = least(map_place_query_hits.page, excluded.page),
    result_rank = case
      when excluded.page < map_place_query_hits.page then excluded.result_rank
      when excluded.page = map_place_query_hits.page
        then least(map_place_query_hits.result_rank, excluded.result_rank)
      else map_place_query_hits.result_rank
    end,
    discovered_at = least(
      map_place_query_hits.discovered_at,
      excluded.discovered_at
    );

  update public.map_ingest_run_queries
  set
    status = 'completed',
    last_completed_page = p_last_completed_page,
    provider_call_count = p_provider_call_count,
    provider_result_count = p_provider_result_count,
    accepted_result_count = p_accepted_result_count,
    rejected_result_count = p_rejected_result_count,
    duplicate_result_count = p_duplicate_result_count,
    out_of_district_result_count = p_out_of_district_result_count,
    invalid_coordinate_result_count = p_invalid_coordinate_result_count,
    classification_rejection_count = p_classification_rejection_count,
    provider_429_count = p_provider_429_count,
    timeout_count = p_timeout_count,
    provider_error_count = p_provider_error_count,
    inserted_row_count = v_inserted,
    updated_row_count = v_updated,
    preserved_review_row_count = v_preserved,
    saturated = p_saturated,
    sanitized_error_summary = null,
    started_at = coalesce(started_at, p_completed_at),
    completed_at = p_completed_at,
    updated_at = p_completed_at
  where collection_run_id = p_run_id and query_key = p_query_key;

  with query_stats as (
    select
      count(*) filter (where query.status <> 'planned')::integer as attempted_count,
      count(*) filter (where query.status = 'completed')::integer as completed_count,
      coalesce(sum(query.provider_call_count), 0)::integer as call_count,
      coalesce(sum(query.provider_result_count), 0)::integer as provider_results,
      coalesce(sum(query.accepted_result_count), 0)::integer as accepted_results,
      coalesce(sum(query.rejected_result_count), 0)::integer as rejected_results,
      coalesce(sum(query.duplicate_result_count), 0)::integer as duplicate_results,
      coalesce(sum(query.out_of_district_result_count), 0)::integer as out_of_district_results,
      coalesce(sum(query.invalid_coordinate_result_count), 0)::integer as invalid_coordinate_results,
      coalesce(sum(query.classification_rejection_count), 0)::integer as classification_rejections,
      coalesce(sum(query.provider_429_count), 0)::integer as provider_429s,
      coalesce(sum(query.timeout_count), 0)::integer as timeouts,
      coalesce(sum(query.provider_error_count), 0)::integer as provider_errors,
      coalesce(sum(query.inserted_row_count), 0)::integer as inserted_rows,
      coalesce(sum(query.updated_row_count), 0)::integer as updated_rows,
      coalesce(sum(query.preserved_review_row_count), 0)::integer as preserved_rows,
      count(*) filter (where query.saturated)::integer as saturated_count
    from public.map_ingest_run_queries as query
    where query.collection_run_id = p_run_id
  ),
  place_stats as (
    select
      count(distinct hit.candidate_id)::integer as unique_places,
      count(distinct hit.candidate_id) filter (
        where place.candidate_kind = 'pet_travel_candidate'
      )::integer as pet_travel_places,
      count(distinct hit.candidate_id) filter (
        where place.candidate_kind = 'veterinary'
      )::integer as veterinary_places,
      count(distinct hit.candidate_id) filter (
        where place.candidate_kind = 'pet_shop'
      )::integer as pet_shop_places
    from public.map_place_query_hits as hit
    join public.map_places as place on place.id = hit.candidate_id
    where hit.collection_run_id = p_run_id
  )
  update public.map_ingest_runs
  set
    status = 'running',
    completed_at = null,
    completed_query_count = query_stats.completed_count,
    provider_call_count = greatest(
      map_ingest_runs.provider_call_count,
      query_stats.call_count,
      coalesce(p_run_provider_call_count, query_stats.call_count)
    ),
    attempted_query_count = query_stats.attempted_count,
    provider_result_count = query_stats.provider_results,
    accepted_result_count = query_stats.accepted_results,
    rejected_result_count = query_stats.rejected_results,
    duplicate_result_count = query_stats.duplicate_results,
    out_of_district_result_count = query_stats.out_of_district_results,
    invalid_coordinate_result_count = query_stats.invalid_coordinate_results,
    classification_rejection_count = query_stats.classification_rejections,
    provider_429_count = greatest(
      map_ingest_runs.provider_429_count,
      query_stats.provider_429s,
      coalesce(p_run_provider_429_count, query_stats.provider_429s)
    ),
    timeout_count = greatest(
      map_ingest_runs.timeout_count,
      query_stats.timeouts,
      coalesce(p_run_timeout_count, query_stats.timeouts)
    ),
    provider_error_count = greatest(
      map_ingest_runs.provider_error_count,
      query_stats.provider_errors,
      coalesce(p_run_provider_error_count, query_stats.provider_errors)
    ),
    inserted_row_count = query_stats.inserted_rows,
    updated_row_count = query_stats.updated_rows,
    preserved_review_row_count = query_stats.preserved_rows,
    saturated_query_count = query_stats.saturated_count,
    unique_place_count = place_stats.unique_places,
    discovered_row_count = place_stats.unique_places,
    pet_travel_count = place_stats.pet_travel_places,
    veterinary_count = place_stats.veterinary_places,
    pet_shop_count = place_stats.pet_shop_places,
    sanitized_error_summary = null
  from query_stats, place_stats
  where map_ingest_runs.id = p_run_id;

  return query select false, v_inserted, v_updated, v_preserved;
end;
$$;

revoke all on function public.start_kakao_jeonbuk_catalog_run_v1(text,text,jsonb,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.start_kakao_jeonbuk_catalog_run_v1(text,text,jsonb,boolean,timestamptz) to service_role;
revoke all on function public.commit_kakao_jeonbuk_catalog_query_v1(bigint,text,jsonb,integer,integer,integer,integer,integer,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_kakao_jeonbuk_catalog_query_v1(bigint,text,jsonb,integer,integer,integer,integer,integer,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,timestamptz) to service_role;

update public.regions set kakao_collection_enabled = true where region_id = 'jeonbuk';


create or replace function public.start_kakao_jeonnam_catalog_run_v1(
  p_registry_version text,
  p_collector_version text,
  p_queries jsonb,
  p_is_full_catalog_run boolean default true,
  p_started_at timestamptz default now()
)
returns table (
  run_id bigint,
  planned_query_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_query_count integer;
  v_inserted_query_count integer;
  v_validated_full_query_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:kakao-catalog-v1')
  );

  if
    p_registry_version is null
    or btrim(p_registry_version) <> 'kakao-jeonnam-query-registry-v1'
    or nullif(btrim(p_collector_version), '') is null
    or p_queries is null
    or pg_catalog.jsonb_typeof(p_queries) <> 'array'
    or p_is_full_catalog_run is null
    or p_started_at is null
  then
    raise exception using
      errcode = '22023',
      message = 'run plan metadata is invalid';
  end if;

  v_query_count := pg_catalog.jsonb_array_length(p_queries);
  if
    v_query_count < 1
    or v_query_count > 682
    or (p_is_full_catalog_run and v_query_count <> 682)
  then
    raise exception using
      errcode = '22023',
      message = 'run plan query count is invalid';
  end if;

  if (
    select count(distinct query.query_key)
    from pg_catalog.jsonb_to_recordset(p_queries) as query (
      query_key text,
      query_text text,
      district_code text,
      district text,
      candidate_kind text,
      normalized_category text,
      category_group_code text
    )
  ) <> v_query_count then
    raise exception using
      errcode = '23505',
      message = 'query keys must be unique and non-null';
  end if;

  if p_is_full_catalog_run then
    with districts(district_code, district) as (
      select district_code, district_name from public.region_districts where region_id = 'jeonnam'
    ),
    templates(
      family,
      template_index,
      query_suffix,
      candidate_kind,
      normalized_category,
      category_group_code
    ) as (
      values
        ('general', 0, '애견동반', 'pet_travel_candidate', 'other', null),
        ('general', 1, '반려견 동반', 'pet_travel_candidate', 'other', null),
        ('general', 2, '반려동물 동반', 'pet_travel_candidate', 'other', null),
        ('general', 3, '강아지 동반', 'pet_travel_candidate', 'other', null),
        ('general', 4, '펫프렌들리', 'pet_travel_candidate', 'other', null),
        ('cafe', 0, '애견동반 카페', 'pet_travel_candidate', 'cafe', 'CE7'),
        ('cafe', 1, '반려동물 동반 카페', 'pet_travel_candidate', 'cafe', 'CE7'),
        ('cafe', 2, '애견카페', 'pet_travel_candidate', 'cafe', 'CE7'),
        ('food', 0, '애견동반 식당', 'pet_travel_candidate', 'food', 'FD6'),
        ('food', 1, '반려동물 동반 식당', 'pet_travel_candidate', 'food', 'FD6'),
        ('food', 2, '애견동반 음식점', 'pet_travel_candidate', 'food', 'FD6'),
        ('accommodation', 0, '애견동반 숙소', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 1, '반려동물 동반 숙소', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 2, '애견펜션', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 3, '애견동반 호텔', 'pet_travel_candidate', 'accommodation', 'AD5'),
        ('accommodation', 4, '애견동반 캠핑장', 'pet_travel_candidate', 'camping', null),
        ('outdoor_leisure', 0, '애견동반 관광지', 'pet_travel_candidate', 'attraction', 'AT4'),
        ('outdoor_leisure', 1, '반려견 동반 공원', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 2, '애견동반 공원', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 3, '애견동반 해수욕장', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 4, '반려견 산책', 'pet_travel_candidate', 'park_walk', null),
        ('outdoor_leisure', 5, '애견동반 레저', 'pet_travel_candidate', 'leisure', null),
        ('veterinary', 0, '동물병원', 'veterinary', null, null),
        ('veterinary', 1, '24시 동물병원', 'veterinary', null, null),
        ('veterinary', 2, '동물의료센터', 'veterinary', null, null),
        ('veterinary', 3, '응급 동물병원', 'veterinary', null, null),
        ('pet_shop', 0, '펫샵', 'pet_shop', null, null),
        ('pet_shop', 1, '애견용품', 'pet_shop', null, null),
        ('pet_shop', 2, '반려동물용품', 'pet_shop', null, null),
        ('pet_shop', 3, '펫용품', 'pet_shop', null, null),
        ('pet_shop', 4, '애완동물용품', 'pet_shop', null, null)
    ),
    expected as (
      select
        'kakao-jeonnam-v1:'
          || districts.district_code
          || ':'
          || templates.family
          || ':'
          || templates.template_index::text as query_key,
        '전남 ' || districts.district || ' ' || templates.query_suffix as query_text,
        districts.district_code,
        districts.district,
        templates.candidate_kind,
        templates.normalized_category,
        templates.category_group_code
      from districts
      cross join templates
    ),
    supplied as (
      select query.*
      from pg_catalog.jsonb_to_recordset(p_queries) as query (
        query_key text,
        query_text text,
        district_code text,
        district text,
        candidate_kind text,
        normalized_category text,
        category_group_code text
      )
    )
    select count(*)::integer
    into v_validated_full_query_count
    from supplied
    join expected
      on expected.query_key = supplied.query_key
      and expected.query_text = supplied.query_text
      and expected.district_code = supplied.district_code
      and expected.district = supplied.district
      and expected.candidate_kind = supplied.candidate_kind
      and expected.normalized_category is not distinct from supplied.normalized_category
      and expected.category_group_code is not distinct from supplied.category_group_code;

    if v_validated_full_query_count <> 682 then
      raise exception using
        errcode = '22023',
        message = 'full run plan does not match kakao-jeonnam-query-registry-v1';
    end if;
  end if;

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
    'jeonnam',
    'kakao',
    'running',
    p_started_at,
    btrim(p_collector_version),
    btrim(p_registry_version),
    p_is_full_catalog_run,
    v_query_count
  )
  returning id into v_run_id;

  insert into public.map_ingest_run_queries (
    collection_run_id,
    query_key,
    query_text,
    district_code,
    district,
    candidate_kind,
    normalized_category,
    category_group_code,
    status,
    created_at,
    updated_at
  )
  select
    v_run_id,
    query.query_key,
    query.query_text,
    query.district_code,
    query.district,
    query.candidate_kind,
    query.normalized_category,
    query.category_group_code,
    'planned',
    p_started_at,
    p_started_at
  from pg_catalog.jsonb_to_recordset(p_queries) as query (
    query_key text,
    query_text text,
    district_code text,
    district text,
    candidate_kind text,
    normalized_category text,
    category_group_code text
  );

  get diagnostics v_inserted_query_count = row_count;
  if v_inserted_query_count <> v_query_count then
    raise exception using
      errcode = 'P0001',
      message = 'query plan insert was incomplete';
  end if;

  return query select v_run_id, v_query_count;
end;
$$;

create or replace function public.commit_kakao_jeonnam_catalog_query_v1(
  p_run_id bigint,
  p_query_key text,
  p_candidates jsonb,
  p_last_completed_page integer,
  p_provider_call_count integer,
  p_provider_result_count integer,
  p_accepted_result_count integer,
  p_rejected_result_count integer,
  p_saturated boolean default false,
  p_duplicate_result_count integer default 0,
  p_out_of_district_result_count integer default 0,
  p_invalid_coordinate_result_count integer default 0,
  p_classification_rejection_count integer default 0,
  p_provider_429_count integer default 0,
  p_timeout_count integer default 0,
  p_provider_error_count integer default 0,
  p_run_provider_call_count integer default null,
  p_run_provider_429_count integer default null,
  p_run_timeout_count integer default null,
  p_run_provider_error_count integer default null,
  p_completed_at timestamptz default now()
)
returns table (
  already_completed boolean,
  inserted_row_count integer,
  updated_row_count integer,
  preserved_review_row_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.map_ingest_runs%rowtype;
  v_query public.map_ingest_run_queries%rowtype;
  v_inserted integer := 0;
  v_updated integer := 0;
  v_preserved integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:kakao-catalog-v1')
  );

  if p_completed_at is null then
    raise exception using
      errcode = '22004',
      message = 'completed_at is required';
  end if;

  if p_candidates is null or pg_catalog.jsonb_typeof(p_candidates) <> 'array' then
    raise exception using
      errcode = '22023',
      message = 'candidates must be a JSON array';
  end if;

  if
    p_last_completed_page is null
    or p_provider_call_count is null
    or p_provider_result_count is null
    or p_accepted_result_count is null
    or p_rejected_result_count is null
    or p_saturated is null
    or p_duplicate_result_count is null
    or p_out_of_district_result_count is null
    or p_invalid_coordinate_result_count is null
    or p_classification_rejection_count is null
    or p_provider_429_count is null
    or p_timeout_count is null
    or p_provider_error_count is null
    or (p_run_provider_call_count is not null and p_run_provider_call_count < 0)
    or (p_run_provider_429_count is not null and p_run_provider_429_count < 0)
    or (p_run_timeout_count is not null and p_run_timeout_count < 0)
    or (p_run_provider_error_count is not null and p_run_provider_error_count < 0)
    or p_last_completed_page < 1
    or p_last_completed_page > 3
    or p_provider_call_count < p_last_completed_page
    or p_provider_call_count > 9
    or p_provider_result_count < 0
    or p_provider_result_count > 45
    or p_accepted_result_count < 0
    or p_accepted_result_count > 45
    or p_rejected_result_count < 0
    or p_rejected_result_count > 45
    or p_duplicate_result_count < 0
    or p_out_of_district_result_count < 0
    or p_invalid_coordinate_result_count < 0
    or p_classification_rejection_count < 0
    or p_provider_429_count < 0
    or p_timeout_count < 0
    or p_provider_error_count < 0
    or pg_catalog.jsonb_array_length(p_candidates) > 45
    or p_provider_result_count <> (
      p_accepted_result_count::bigint + p_rejected_result_count::bigint
    )
    or p_accepted_result_count <> (
      pg_catalog.jsonb_array_length(p_candidates)::bigint
      + p_duplicate_result_count::bigint
    )
    or p_accepted_result_count < pg_catalog.jsonb_array_length(p_candidates)
  then
    raise exception using
      errcode = '22023',
      message = 'query counters are invalid';
  end if;

  select run.*
  into v_run
  from public.map_ingest_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'collection run not found';
  end if;

  if v_run.provider <> 'kakao' or v_run.region_id <> 'jeonnam' then
    raise exception using errcode = '22023', message = 'run provider must be kakao';
  end if;

  if v_run.status not in ('running', 'partial', 'failed') then
    raise exception using
      errcode = '55000',
      message = 'collection run is not writable';
  end if;

  select query.*
  into v_query
  from public.map_ingest_run_queries as query
  where
    query.collection_run_id = p_run_id
    and query.query_key = p_query_key
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'planned query not found';
  end if;

  if v_query.status = 'completed' then
    return query
    select
      true,
      v_query.inserted_row_count,
      v_query.updated_row_count,
      v_query.preserved_review_row_count;
    return;
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
    where
      nullif(btrim(candidate.provider_place_id), '') is null
      or candidate.provider_place_id !~ '^[0-9]+$'
      or nullif(btrim(candidate.name), '') is null
      or nullif(btrim(candidate.category_name), '') is null
      or nullif(btrim(candidate.source_url), '') is null
      or candidate.source_url !~ (
        '^https?://place[.]map[.]kakao[.]com/'
        || candidate.provider_place_id
        || '/?$'
      )
      or candidate.candidate_kind is distinct from v_query.candidate_kind
      or candidate.district_code is distinct from v_query.district_code
      or candidate.district_name is distinct from v_query.district
      or (
        candidate.candidate_kind = 'pet_travel_candidate'
        and candidate.normalized_category not in (
          'cafe',
          'food',
          'accommodation',
          'attraction',
          'park_walk',
          'leisure',
          'camping',
          'other'
        )
      )
      or (
        candidate.candidate_kind in ('veterinary', 'pet_shop')
        and candidate.normalized_category is not null
      )
      or candidate.category_group_code !~ '^[A-Z0-9]{2,10}$'
      or coalesce(
        nullif(btrim(candidate.road_address), ''),
        nullif(btrim(candidate.lot_address), '')
      ) is null
      or (
        nullif(btrim(candidate.road_address), '') is not null
        and candidate.road_address !~ (
          '^(전남|전라남도)[[:space:]]+'
          || candidate.district_name
          || '([[:space:]]|$)'
        )
      )
      or (
        nullif(btrim(candidate.lot_address), '') is not null
        and candidate.lot_address !~ (
          '^(전남|전라남도)[[:space:]]+'
          || candidate.district_name
          || '([[:space:]]|$)'
        )
      )
      or candidate.longitude is null
      or candidate.longitude < 125
      or candidate.longitude > 127.9
      or candidate.latitude is null
      or candidate.latitude < 33.85
      or candidate.latitude > 35.5
      or candidate.page is null
      or candidate.page < 1
      or candidate.page > p_last_completed_page
      or candidate.result_rank is null
      or candidate.result_rank < 1
      or candidate.result_rank > 15
  ) then
    raise exception using
      errcode = '22023',
      message = 'candidate payload violates the Kakao catalog contract';
  end if;

  with parsed as (
    select candidate.*
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
  ),
  deduplicated as (
    select distinct on (parsed.provider_place_id) parsed.*
    from parsed
    order by parsed.provider_place_id, parsed.page, parsed.result_rank
  )
  select
    count(*) filter (where place.id is null)::integer,
    count(*) filter (
      where place.id is not null
        and place.last_seen_run_id is distinct from p_run_id
    )::integer,
    count(*) filter (
      where place.id is not null
        and place.last_seen_run_id is distinct from p_run_id
        and (
          place.review_status <> 'unreviewed'
          or place.reviewed_at is not null
          or place.reviewed_by is not null
          or place.review_note is not null
          or place.verification_evidence <> '{}'::jsonb
        )
    )::integer
  into v_inserted, v_updated, v_preserved
  from deduplicated
  left join public.map_places as place
    on place.provider = 'kakao'
    and place.provider_place_id = deduplicated.provider_place_id;

  with parsed as (
    select candidate.*
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
  ),
  deduplicated as (
    select distinct on (parsed.provider_place_id) parsed.*
    from parsed
    order by parsed.provider_place_id, parsed.page, parsed.result_rank
  )
  insert into public.map_places (
    provider,
    provider_place_id,
    name,
    category_group,
    category_code,
    category_name,
    category_group_code,
    category_group_name,
    normalized_category,
    candidate_kind,
    road_address,
    lot_address,
    district_code,
    district_name,
    location,
    phone,
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
    last_seen_run_id,
    pending_publication_run_id,
    first_seen_at,
    last_seen_at,
    fetched_at,
    expires_at,
    created_at,
    updated_at
  )
  select
    'kakao',
    candidate.provider_place_id,
    candidate.name,
    case candidate.normalized_category
      when 'cafe' then 'food'
      when 'food' then 'food'
      when 'accommodation' then 'accommodation'
      when 'attraction' then 'attraction'
      when 'park_walk' then 'leisure'
      when 'leisure' then 'leisure'
      when 'camping' then 'leisure'
      else null
    end,
    candidate.category_name,
    candidate.category_name,
    candidate.category_group_code,
    candidate.category_group_name,
    candidate.normalized_category,
    candidate.candidate_kind,
    nullif(btrim(candidate.road_address), ''),
    nullif(btrim(candidate.lot_address), ''),
    candidate.district_code,
    candidate.district_name,
    extensions.st_setsrid(
      extensions.st_makepoint(candidate.longitude, candidate.latitude),
      4326
    )::extensions.geography,
    nullif(btrim(candidate.phone), ''),
    'https://place.map.kakao.com/' || candidate.provider_place_id,
    'not_applicable',
    'search_candidate',
    pg_catalog.jsonb_build_object(
      'source',
      'Kakao Local keyword search',
      'verification_required',
      true,
      'retrieved_at',
      coalesce(candidate.discovered_at, p_completed_at)
    ),
    '카카오 검색 후보 · 동반 여부 확인 필요',
    true,
    'unreviewed',
    true,
    'current',
    '{}'::jsonb,
    false,
    p_run_id,
    p_run_id,
    coalesce(candidate.discovered_at, p_completed_at),
    coalesce(candidate.discovered_at, p_completed_at),
    coalesce(candidate.discovered_at, p_completed_at),
    null,
    coalesce(candidate.discovered_at, p_completed_at),
    coalesce(candidate.discovered_at, p_completed_at)
  from deduplicated as candidate
  on conflict (provider, provider_place_id) do update
  set
    name = excluded.name,
    (
      category_group,
      category_code,
      category_name,
      category_group_code,
      category_group_name,
      normalized_category,
      candidate_kind
    ) = (
      select
        case
          when winner.candidate_kind in ('veterinary', 'pet_shop') then null
          else winner.category_group
        end,
        winner.category_code,
        winner.category_name,
        winner.category_group_code,
        winner.category_group_name,
        case
          when winner.candidate_kind in ('veterinary', 'pet_shop') then null
          else winner.normalized_category
        end,
        winner.candidate_kind
      from (
        values
          (
            false,
            map_places.category_group,
            map_places.category_code,
            map_places.category_name,
            map_places.category_group_code,
            map_places.category_group_name,
            map_places.normalized_category,
            map_places.candidate_kind
          ),
          (
            true,
            excluded.category_group,
            excluded.category_code,
            excluded.category_name,
            excluded.category_group_code,
            excluded.category_group_name,
            excluded.normalized_category,
            excluded.candidate_kind
          )
      ) as winner (
        is_incoming,
        category_group,
        category_code,
        category_name,
        category_group_code,
        category_group_name,
        normalized_category,
        candidate_kind
      )
      order by
        case
          when map_places.last_seen_run_id is distinct from p_run_id
            then case when winner.is_incoming then 1 else 0 end
          when winner.candidate_kind = 'veterinary' then 300
          when winner.candidate_kind = 'pet_shop' then 200
          else 100 + case winner.normalized_category
            when 'cafe' then 8
            when 'food' then 7
            when 'accommodation' then 6
            when 'attraction' then 5
            when 'park_walk' then 4
            when 'leisure' then 3
            when 'camping' then 2
            else 1
          end
        end desc,
        winner.is_incoming asc
      limit 1
    ),
    road_address = excluded.road_address,
    lot_address = excluded.lot_address,
    district_code = excluded.district_code,
    district_name = excluded.district_name,
    location = excluded.location,
    phone = excluded.phone,
    source_url = excluded.source_url,
    provider_visibility = 'not_applicable',
    pet_evidence_status = 'search_candidate',
    pet_evidence = map_places.pet_evidence,
    pet_notes = map_places.pet_notes,
    is_active = case
      when map_places.review_status = 'rejected' then false
      else map_places.is_active
    end,
    public_visibility = case
      when map_places.review_status = 'rejected' then false
      else map_places.public_visibility
    end,
    lifecycle_status = map_places.lifecycle_status,
    requires_recheck = map_places.requires_recheck,
    last_seen_run_id = p_run_id,
    pending_publication_run_id = case
      when map_places.pending_publication_run_id is null then null
      else p_run_id
    end,
    last_seen_at = greatest(map_places.last_seen_at, excluded.last_seen_at),
    fetched_at = excluded.fetched_at,
    -- Existing rows keep their legacy compatibility expiry during a partial
    -- run. New rows have NULL until successful run finalization publishes them.
    expires_at = map_places.expires_at,
    updated_at = excluded.updated_at;

  with parsed as (
    select candidate.*
    from pg_catalog.jsonb_to_recordset(p_candidates) as candidate (
      provider_place_id text,
      name text,
      category_name text,
      category_group_code text,
      category_group_name text,
      normalized_category text,
      candidate_kind text,
      lot_address text,
      road_address text,
      district_code text,
      district_name text,
      longitude double precision,
      latitude double precision,
      phone text,
      source_url text,
      page integer,
      result_rank integer,
      discovered_at timestamptz
    )
  ),
  deduplicated as (
    select distinct on (parsed.provider_place_id) parsed.*
    from parsed
    order by parsed.provider_place_id, parsed.page, parsed.result_rank
  )
  insert into public.map_place_query_hits (
    candidate_id,
    collection_run_id,
    query_key,
    query_text,
    district_code,
    district,
    category_group_code,
    page,
    result_rank,
    discovered_at
  )
  select
    place.id,
    p_run_id,
    v_query.query_key,
    v_query.query_text,
    v_query.district_code,
    v_query.district,
    v_query.category_group_code,
    candidate.page,
    candidate.result_rank,
    coalesce(candidate.discovered_at, p_completed_at)
  from deduplicated as candidate
  join public.map_places as place
    on place.provider = 'kakao'
    and place.provider_place_id = candidate.provider_place_id
  on conflict (candidate_id, collection_run_id, query_key) do update
  set
    query_text = excluded.query_text,
    district_code = excluded.district_code,
    district = excluded.district,
    category_group_code = excluded.category_group_code,
    page = least(map_place_query_hits.page, excluded.page),
    result_rank = case
      when excluded.page < map_place_query_hits.page then excluded.result_rank
      when excluded.page = map_place_query_hits.page
        then least(map_place_query_hits.result_rank, excluded.result_rank)
      else map_place_query_hits.result_rank
    end,
    discovered_at = least(
      map_place_query_hits.discovered_at,
      excluded.discovered_at
    );

  update public.map_ingest_run_queries
  set
    status = 'completed',
    last_completed_page = p_last_completed_page,
    provider_call_count = p_provider_call_count,
    provider_result_count = p_provider_result_count,
    accepted_result_count = p_accepted_result_count,
    rejected_result_count = p_rejected_result_count,
    duplicate_result_count = p_duplicate_result_count,
    out_of_district_result_count = p_out_of_district_result_count,
    invalid_coordinate_result_count = p_invalid_coordinate_result_count,
    classification_rejection_count = p_classification_rejection_count,
    provider_429_count = p_provider_429_count,
    timeout_count = p_timeout_count,
    provider_error_count = p_provider_error_count,
    inserted_row_count = v_inserted,
    updated_row_count = v_updated,
    preserved_review_row_count = v_preserved,
    saturated = p_saturated,
    sanitized_error_summary = null,
    started_at = coalesce(started_at, p_completed_at),
    completed_at = p_completed_at,
    updated_at = p_completed_at
  where collection_run_id = p_run_id and query_key = p_query_key;

  with query_stats as (
    select
      count(*) filter (where query.status <> 'planned')::integer as attempted_count,
      count(*) filter (where query.status = 'completed')::integer as completed_count,
      coalesce(sum(query.provider_call_count), 0)::integer as call_count,
      coalesce(sum(query.provider_result_count), 0)::integer as provider_results,
      coalesce(sum(query.accepted_result_count), 0)::integer as accepted_results,
      coalesce(sum(query.rejected_result_count), 0)::integer as rejected_results,
      coalesce(sum(query.duplicate_result_count), 0)::integer as duplicate_results,
      coalesce(sum(query.out_of_district_result_count), 0)::integer as out_of_district_results,
      coalesce(sum(query.invalid_coordinate_result_count), 0)::integer as invalid_coordinate_results,
      coalesce(sum(query.classification_rejection_count), 0)::integer as classification_rejections,
      coalesce(sum(query.provider_429_count), 0)::integer as provider_429s,
      coalesce(sum(query.timeout_count), 0)::integer as timeouts,
      coalesce(sum(query.provider_error_count), 0)::integer as provider_errors,
      coalesce(sum(query.inserted_row_count), 0)::integer as inserted_rows,
      coalesce(sum(query.updated_row_count), 0)::integer as updated_rows,
      coalesce(sum(query.preserved_review_row_count), 0)::integer as preserved_rows,
      count(*) filter (where query.saturated)::integer as saturated_count
    from public.map_ingest_run_queries as query
    where query.collection_run_id = p_run_id
  ),
  place_stats as (
    select
      count(distinct hit.candidate_id)::integer as unique_places,
      count(distinct hit.candidate_id) filter (
        where place.candidate_kind = 'pet_travel_candidate'
      )::integer as pet_travel_places,
      count(distinct hit.candidate_id) filter (
        where place.candidate_kind = 'veterinary'
      )::integer as veterinary_places,
      count(distinct hit.candidate_id) filter (
        where place.candidate_kind = 'pet_shop'
      )::integer as pet_shop_places
    from public.map_place_query_hits as hit
    join public.map_places as place on place.id = hit.candidate_id
    where hit.collection_run_id = p_run_id
  )
  update public.map_ingest_runs
  set
    status = 'running',
    completed_at = null,
    completed_query_count = query_stats.completed_count,
    provider_call_count = greatest(
      map_ingest_runs.provider_call_count,
      query_stats.call_count,
      coalesce(p_run_provider_call_count, query_stats.call_count)
    ),
    attempted_query_count = query_stats.attempted_count,
    provider_result_count = query_stats.provider_results,
    accepted_result_count = query_stats.accepted_results,
    rejected_result_count = query_stats.rejected_results,
    duplicate_result_count = query_stats.duplicate_results,
    out_of_district_result_count = query_stats.out_of_district_results,
    invalid_coordinate_result_count = query_stats.invalid_coordinate_results,
    classification_rejection_count = query_stats.classification_rejections,
    provider_429_count = greatest(
      map_ingest_runs.provider_429_count,
      query_stats.provider_429s,
      coalesce(p_run_provider_429_count, query_stats.provider_429s)
    ),
    timeout_count = greatest(
      map_ingest_runs.timeout_count,
      query_stats.timeouts,
      coalesce(p_run_timeout_count, query_stats.timeouts)
    ),
    provider_error_count = greatest(
      map_ingest_runs.provider_error_count,
      query_stats.provider_errors,
      coalesce(p_run_provider_error_count, query_stats.provider_errors)
    ),
    inserted_row_count = query_stats.inserted_rows,
    updated_row_count = query_stats.updated_rows,
    preserved_review_row_count = query_stats.preserved_rows,
    saturated_query_count = query_stats.saturated_count,
    unique_place_count = place_stats.unique_places,
    discovered_row_count = place_stats.unique_places,
    pet_travel_count = place_stats.pet_travel_places,
    veterinary_count = place_stats.veterinary_places,
    pet_shop_count = place_stats.pet_shop_places,
    sanitized_error_summary = null
  from query_stats, place_stats
  where map_ingest_runs.id = p_run_id;

  return query select false, v_inserted, v_updated, v_preserved;
end;
$$;

revoke all on function public.start_kakao_jeonnam_catalog_run_v1(text,text,jsonb,boolean,timestamptz) from public, anon, authenticated;
grant execute on function public.start_kakao_jeonnam_catalog_run_v1(text,text,jsonb,boolean,timestamptz) to service_role;
revoke all on function public.commit_kakao_jeonnam_catalog_query_v1(bigint,text,jsonb,integer,integer,integer,integer,integer,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,timestamptz) from public, anon, authenticated;
grant execute on function public.commit_kakao_jeonnam_catalog_query_v1(bigint,text,jsonb,integer,integer,integer,integer,integer,boolean,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,integer,timestamptz) to service_role;

update public.regions set kakao_collection_enabled = true where region_id = 'jeonnam';
