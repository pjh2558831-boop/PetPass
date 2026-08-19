-- Kakao Busan catalog v1
--
-- This migration deliberately extends the existing shared map storage instead
-- of creating parallel kakao_place_candidates / kakao_collection_runs tables.
-- It is prepared for Stage 2, but must not be applied as part of Stage 1.

alter table public.map_ingest_runs
  drop constraint map_ingest_runs_status_check;

alter table public.map_ingest_runs
  add constraint map_ingest_runs_status_check check (
    status in ('planned', 'running', 'completed', 'partial', 'failed', 'cancelled')
  ),
  add column registry_version text,
  add column is_full_catalog_run boolean not null default false,
  add column planned_query_count integer not null default 0,
  add column completed_query_count integer not null default 0,
  add column provider_call_count integer not null default 0,
  add column unique_place_count integer not null default 0,
  add column pet_travel_count integer not null default 0,
  add column veterinary_count integer not null default 0,
  add column pet_shop_count integer not null default 0,
  add column preserved_review_row_count integer not null default 0,
  add column provider_result_count integer not null default 0,
  add column accepted_result_count integer not null default 0,
  add column rejected_result_count integer not null default 0,
  add column duplicate_result_count integer not null default 0,
  add column out_of_district_result_count integer not null default 0,
  add column invalid_coordinate_result_count integer not null default 0,
  add column classification_rejection_count integer not null default 0,
  add column provider_429_count integer not null default 0,
  add column timeout_count integer not null default 0,
  add column provider_error_count integer not null default 0;

update public.map_ingest_runs
set
  registry_version = case
    when provider = 'kakao' then collector_version
    else null
  end,
  provider_call_count = attempted_query_count,
  unique_place_count = discovered_row_count,
  pet_travel_count = case
    when provider = 'kakao' then discovered_row_count
    else 0
  end;

alter table public.map_ingest_runs
  add constraint map_ingest_runs_registry_version_check check (
    registry_version is null or length(btrim(registry_version)) > 0
  ),
  add constraint map_ingest_runs_query_counts_check check (
    planned_query_count >= 0
    and completed_query_count >= 0
    and completed_query_count <= planned_query_count
  ),
  add constraint map_ingest_runs_catalog_counts_check check (
    provider_call_count >= 0
    and unique_place_count >= 0
    and pet_travel_count >= 0
    and veterinary_count >= 0
    and pet_shop_count >= 0
    and preserved_review_row_count >= 0
    and provider_result_count >= 0
    and accepted_result_count >= 0
    and rejected_result_count >= 0
    and duplicate_result_count >= 0
    and out_of_district_result_count >= 0
    and invalid_coordinate_result_count >= 0
    and classification_rejection_count >= 0
    and provider_429_count >= 0
    and timeout_count >= 0
    and provider_error_count >= 0
  ),
  add constraint map_ingest_runs_full_catalog_scope_check check (
    not is_full_catalog_run
    or (
      provider = 'kakao'
      and registry_version = 'kakao-busan-query-registry-v1'
      and planned_query_count = 496
    )
  ),
  add constraint map_ingest_runs_error_summary_length_check check (
    sanitized_error_summary is null
    or length(sanitized_error_summary) <= 1000
  );

create unique index map_ingest_runs_one_open_kakao_catalog_v1_idx
  on public.map_ingest_runs (provider)
  where
    provider = 'kakao'
    and registry_version = 'kakao-busan-query-registry-v1'
    and status in ('planned', 'running', 'partial');

alter table public.map_places
  add column category_name text,
  add column category_group_code text,
  add column category_group_name text,
  add column normalized_category text,
  add column candidate_kind text,
  add column district_code text,
  add column review_status text,
  add column public_visibility boolean,
  add column lifecycle_status text,
  add column last_seen_run_id bigint,
  add column pending_publication_run_id bigint,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid,
  add column review_note text,
  add column verification_evidence jsonb,
  add column requires_recheck boolean;

with legacy_kakao as (
  select
    place.id,
    place.provider_place_id,
    nullif(btrim(place.road_address), '') as road_address,
    nullif(btrim(place.lot_address), '') as lot_address,
    extensions.st_x(place.location::extensions.geometry) as longitude,
    extensions.st_y(place.location::extensions.geometry) as latitude,
    place.category_code,
    place.category_group
  from public.map_places as place
  where place.provider = 'kakao'
),
classified_legacy_kakao as (
  select
    legacy.*,
    (pg_catalog.regexp_match(
      legacy.road_address,
      '^(부산|부산광역시)[[:space:]]+(강서구|금정구|기장군|남구|동구|동래구|부산진구|북구|사상구|사하구|서구|수영구|연제구|영도구|중구|해운대구)([[:space:]]|$)'
    ))[2] as road_district,
    (pg_catalog.regexp_match(
      legacy.lot_address,
      '^(부산|부산광역시)[[:space:]]+(강서구|금정구|기장군|남구|동구|동래구|부산진구|북구|사상구|사하구|서구|수영구|연제구|영도구|중구|해운대구)([[:space:]]|$)'
    ))[2] as lot_district
  from legacy_kakao as legacy
),
reconciled_legacy_kakao as (
  select
    classified.*,
    case
      when
        classified.road_address is not null
        and classified.lot_address is not null
        and classified.road_district = classified.lot_district
        then classified.road_district
      when classified.road_address is not null and classified.lot_address is null
        then classified.road_district
      when classified.road_address is null and classified.lot_address is not null
        then classified.lot_district
      else null
    end as validated_district
  from classified_legacy_kakao as classified
),
validated_legacy_kakao as (
  select
    reconciled.*,
    case reconciled.validated_district
      when '중구' then '110'
      when '서구' then '140'
      when '동구' then '170'
      when '영도구' then '200'
      when '부산진구' then '230'
      when '동래구' then '260'
      when '남구' then '290'
      when '북구' then '320'
      when '해운대구' then '350'
      when '사하구' then '380'
      when '금정구' then '410'
      when '강서구' then '440'
      when '연제구' then '470'
      when '수영구' then '500'
      when '사상구' then '530'
      when '기장군' then '710'
      else null
    end as validated_district_code,
    (
      reconciled.validated_district is not null
      and reconciled.provider_place_id ~ '^[0-9]+$'
      and reconciled.longitude between 128.75 and 129.4
      and reconciled.latitude between 34.95 and 35.5
    ) as is_valid
  from reconciled_legacy_kakao as reconciled
)
update public.map_places as place
set
  category_name = coalesce(nullif(btrim(validated.category_code), ''), '미분류'),
  normalized_category = case validated.category_group
    when 'food' then 'food'
    when 'accommodation' then 'accommodation'
    when 'attraction' then 'attraction'
    when 'culture' then 'attraction'
    when 'leisure' then 'leisure'
    else 'other'
  end,
  candidate_kind = 'pet_travel_candidate',
  district_code = validated.validated_district_code,
  district_name = validated.validated_district,
  source_url = case
    when validated.provider_place_id ~ '^[0-9]+$'
      then 'https://place.map.kakao.com/' || validated.provider_place_id
    else place.source_url
  end,
  review_status = case when validated.is_valid then 'unreviewed' else 'needs_review' end,
  public_visibility = validated.is_valid,
  lifecycle_status = case when validated.is_valid then 'current' else 'stale' end,
  verification_evidence = '{}'::jsonb,
  requires_recheck = false,
  is_active = validated.is_valid
from validated_legacy_kakao as validated
where place.id = validated.id;

update public.map_places
set district_code = case district_name
  when '중구' then '110'
  when '서구' then '140'
  when '동구' then '170'
  when '영도구' then '200'
  when '부산진구' then '230'
  when '동래구' then '260'
  when '남구' then '290'
  when '북구' then '320'
  when '해운대구' then '350'
  when '사하구' then '380'
  when '금정구' then '410'
  when '강서구' then '440'
  when '연제구' then '470'
  when '수영구' then '500'
  when '사상구' then '530'
  when '기장군' then '710'
  else null
end
where provider = 'tour';

alter table public.map_places
  add constraint map_places_candidate_kind_check check (
    candidate_kind is null
    or candidate_kind in ('pet_travel_candidate', 'veterinary', 'pet_shop')
  ),
  add constraint map_places_normalized_category_check check (
    normalized_category is null
    or normalized_category in (
      'cafe',
      'food',
      'accommodation',
      'attraction',
      'park_walk',
      'leisure',
      'camping',
      'other'
    )
  ),
  add constraint map_places_review_status_check check (
    review_status is null
    or review_status in ('unreviewed', 'confirmed', 'rejected', 'needs_review')
  ),
  add constraint map_places_lifecycle_status_check check (
    lifecycle_status is null or lifecycle_status in ('current', 'stale')
  ),
  add constraint map_places_category_group_code_check check (
    category_group_code is null
    or category_group_code ~ '^[A-Z0-9]{2,10}$'
  ),
  add constraint map_places_verification_evidence_object_check check (
    verification_evidence is null
    or jsonb_typeof(verification_evidence) = 'object'
  ),
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
            (
              candidate_kind = 'pet_travel_candidate'
              and normalized_category is not null
            )
            or (
              candidate_kind in ('veterinary', 'pet_shop')
              and normalized_category is null
            )
          )
          and (district_code, district_name) in (
            ('110', '중구'),
            ('140', '서구'),
            ('170', '동구'),
            ('200', '영도구'),
            ('230', '부산진구'),
            ('260', '동래구'),
            ('290', '남구'),
            ('320', '북구'),
            ('350', '해운대구'),
            ('380', '사하구'),
            ('410', '금정구'),
            ('440', '강서구'),
            ('470', '연제구'),
            ('500', '수영구'),
            ('530', '사상구'),
            ('710', '기장군')
          )
          and provider_place_id ~ '^[0-9]+$'
          and source_url = 'https://place.map.kakao.com/' || provider_place_id
          and (
            nullif(btrim(road_address), '') is not null
            or nullif(btrim(lot_address), '') is not null
          )
          and (
            nullif(btrim(road_address), '') is null
            or road_address ~ (
              '^(부산|부산광역시)[[:space:]]+'
              || district_name
              || '([[:space:]]|$)'
            )
          )
          and (
            nullif(btrim(lot_address), '') is null
            or lot_address ~ (
              '^(부산|부산광역시)[[:space:]]+'
              || district_name
              || '([[:space:]]|$)'
            )
          )
          and extensions.st_x(location::extensions.geometry) between 128.75 and 129.4
          and extensions.st_y(location::extensions.geometry) between 34.95 and 35.5
        )
      )
    )
  ),
  add constraint map_places_tour_candidate_kind_check check (
    provider <> 'tour'
    or (
      candidate_kind is null
      and normalized_category is null
      and review_status is null
      and public_visibility is null
      and lifecycle_status is null
      and pending_publication_run_id is null
      and reviewed_at is null
      and reviewed_by is null
      and review_note is null
      and verification_evidence is null
      and requires_recheck is null
    )
  ),
  add constraint map_places_rejected_visibility_check check (
    review_status is distinct from 'rejected' or not public_visibility
  ),
  add constraint map_places_requires_recheck_check check (
    requires_recheck is null
    or not requires_recheck
    or (review_status = 'confirmed' and lifecycle_status = 'stale')
  ),
  add constraint map_places_last_seen_run_fkey foreign key (last_seen_run_id)
    references public.map_ingest_runs (id) on delete set null,
  add constraint map_places_pending_publication_run_fkey
    foreign key (pending_publication_run_id)
    references public.map_ingest_runs (id) on delete set null,
  add constraint map_places_reviewed_by_fkey foreign key (reviewed_by)
    references auth.users (id) on delete set null;

create index map_places_kakao_public_catalog_idx
  on public.map_places (
    candidate_kind,
    district_code,
    district_name,
    normalized_category,
    id
  )
  where
    provider = 'kakao'
    and public_visibility
    and pending_publication_run_id is null;

create index map_places_kakao_review_lifecycle_idx
  on public.map_places (review_status, lifecycle_status, last_seen_at desc)
  where provider = 'kakao';

create index map_places_last_seen_run_idx
  on public.map_places (last_seen_run_id)
  where last_seen_run_id is not null;

create index map_places_pending_publication_run_idx
  on public.map_places (pending_publication_run_id)
  where pending_publication_run_id is not null;

create index map_places_reviewed_by_idx
  on public.map_places (reviewed_by)
  where reviewed_by is not null;

create table public.map_ingest_run_queries (
  id bigint generated always as identity primary key,
  collection_run_id bigint not null
    references public.map_ingest_runs (id) on delete cascade,
  query_key text not null check (length(btrim(query_key)) > 0),
  query_text text not null check (length(btrim(query_text)) > 0),
  district_code text not null,
  district text not null check (
    district in (
      '강서구',
      '금정구',
      '기장군',
      '남구',
      '동구',
      '동래구',
      '부산진구',
      '북구',
      '사상구',
      '사하구',
      '서구',
      '수영구',
      '연제구',
      '영도구',
      '중구',
      '해운대구'
    )
  ),
  candidate_kind text not null check (
    candidate_kind in ('pet_travel_candidate', 'veterinary', 'pet_shop')
  ),
  normalized_category text check (
    normalized_category is null
    or normalized_category in (
      'cafe',
      'food',
      'accommodation',
      'attraction',
      'park_walk',
      'leisure',
      'camping',
      'other'
    )
  ),
  category_group_code text check (
    category_group_code is null
    or category_group_code ~ '^[A-Z0-9]{2,10}$'
  ),
  status text not null default 'planned' check (
    status in ('planned', 'running', 'completed', 'failed')
  ),
  last_completed_page integer not null default 0
    check (last_completed_page >= 0 and last_completed_page <= 3),
  provider_call_count integer not null default 0
    check (provider_call_count >= 0 and provider_call_count <= 9),
  provider_result_count integer not null default 0
    check (provider_result_count >= 0 and provider_result_count <= 45),
  accepted_result_count integer not null default 0
    check (accepted_result_count >= 0 and accepted_result_count <= 45),
  rejected_result_count integer not null default 0
    check (rejected_result_count >= 0 and rejected_result_count <= 45),
  duplicate_result_count integer not null default 0 check (duplicate_result_count >= 0),
  out_of_district_result_count integer not null default 0
    check (out_of_district_result_count >= 0),
  invalid_coordinate_result_count integer not null default 0
    check (invalid_coordinate_result_count >= 0),
  classification_rejection_count integer not null default 0
    check (classification_rejection_count >= 0),
  provider_429_count integer not null default 0 check (provider_429_count >= 0),
  timeout_count integer not null default 0 check (timeout_count >= 0),
  provider_error_count integer not null default 0 check (provider_error_count >= 0),
  inserted_row_count integer not null default 0 check (inserted_row_count >= 0),
  updated_row_count integer not null default 0 check (updated_row_count >= 0),
  preserved_review_row_count integer not null default 0
    check (preserved_review_row_count >= 0),
  saturated boolean not null default false,
  sanitized_error_summary text check (
    sanitized_error_summary is null or length(sanitized_error_summary) <= 1000
  ),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_ingest_run_queries_identity_key unique (
    collection_run_id,
    query_key
  ),
  constraint map_ingest_run_queries_district_identity_check check (
    (district_code, district) in (
      ('110', '중구'),
      ('140', '서구'),
      ('170', '동구'),
      ('200', '영도구'),
      ('230', '부산진구'),
      ('260', '동래구'),
      ('290', '남구'),
      ('320', '북구'),
      ('350', '해운대구'),
      ('380', '사하구'),
      ('410', '금정구'),
      ('440', '강서구'),
      ('470', '연제구'),
      ('500', '수영구'),
      ('530', '사상구'),
      ('710', '기장군')
    )
  ),
  constraint map_ingest_run_queries_kind_category_check check (
    (
      candidate_kind = 'pet_travel_candidate'
      and normalized_category is not null
    )
    or (
      candidate_kind in ('veterinary', 'pet_shop')
      and normalized_category is null
    )
  ),
  constraint map_ingest_run_queries_completion_check check (
    status <> 'completed'
    or (
      completed_at is not null
      and last_completed_page >= 1
      and provider_call_count >= 1
    )
  )
);

create index map_ingest_run_queries_resume_idx
  on public.map_ingest_run_queries (collection_run_id, status, query_key);

create index map_ingest_run_queries_report_idx
  on public.map_ingest_run_queries (
    collection_run_id,
    district_code,
    district,
    candidate_kind,
    status
  );

create table public.map_place_query_hits (
  id bigint generated always as identity primary key,
  candidate_id bigint not null
    references public.map_places (id) on delete cascade,
  collection_run_id bigint not null,
  query_key text not null check (length(btrim(query_key)) > 0),
  query_text text not null check (length(btrim(query_text)) > 0),
  district_code text not null,
  district text not null check (
    district in (
      '강서구',
      '금정구',
      '기장군',
      '남구',
      '동구',
      '동래구',
      '부산진구',
      '북구',
      '사상구',
      '사하구',
      '서구',
      '수영구',
      '연제구',
      '영도구',
      '중구',
      '해운대구'
    )
  ),
  category_group_code text check (
    category_group_code is null
    or category_group_code ~ '^[A-Z0-9]{2,10}$'
  ),
  page integer not null check (page >= 1 and page <= 3),
  result_rank integer not null check (result_rank >= 1 and result_rank <= 15),
  discovered_at timestamptz not null default now(),
  constraint map_place_query_hits_identity_key unique (
    candidate_id,
    collection_run_id,
    query_key
  ),
  constraint map_place_query_hits_district_identity_check check (
    (district_code, district) in (
      ('110', '중구'),
      ('140', '서구'),
      ('170', '동구'),
      ('200', '영도구'),
      ('230', '부산진구'),
      ('260', '동래구'),
      ('290', '남구'),
      ('320', '북구'),
      ('350', '해운대구'),
      ('380', '사하구'),
      ('410', '금정구'),
      ('440', '강서구'),
      ('470', '연제구'),
      ('500', '수영구'),
      ('530', '사상구'),
      ('710', '기장군')
    )
  ),
  constraint map_place_query_hits_query_fkey foreign key (
    collection_run_id,
    query_key
  ) references public.map_ingest_run_queries (
    collection_run_id,
    query_key
  ) on delete cascade
);

create index map_place_query_hits_run_query_idx
  on public.map_place_query_hits (collection_run_id, query_key);

create index map_place_query_hits_run_candidate_idx
  on public.map_place_query_hits (collection_run_id, candidate_id);

comment on table public.map_ingest_run_queries is
  'Per-query durable checkpoints. A completed row with zero result counts is still complete and is skipped by --resume.';

comment on table public.map_place_query_hits is
  'Sanitized Kakao query provenance; never stores API keys, request URLs, or raw provider payloads.';

create or replace function public.start_kakao_catalog_run_v1(
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
    or btrim(p_registry_version) <> 'kakao-busan-query-registry-v1'
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
    or v_query_count > 496
    or (p_is_full_catalog_run and v_query_count <> 496)
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
      values
        ('110', '중구'),
        ('140', '서구'),
        ('170', '동구'),
        ('200', '영도구'),
        ('230', '부산진구'),
        ('260', '동래구'),
        ('290', '남구'),
        ('320', '북구'),
        ('350', '해운대구'),
        ('380', '사하구'),
        ('410', '금정구'),
        ('440', '강서구'),
        ('470', '연제구'),
        ('500', '수영구'),
        ('530', '사상구'),
        ('710', '기장군')
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
        'kakao-busan-v1:'
          || districts.district_code
          || ':'
          || templates.family
          || ':'
          || templates.template_index::text as query_key,
        '부산 ' || districts.district || ' ' || templates.query_suffix as query_text,
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

    if v_validated_full_query_count <> 496 then
      raise exception using
        errcode = '22023',
        message = 'full run plan does not match kakao-busan-query-registry-v1';
    end if;
  end if;

  insert into public.map_ingest_runs (
    provider,
    status,
    started_at,
    collector_version,
    registry_version,
    is_full_catalog_run,
    planned_query_count
  ) values (
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

create or replace function public.commit_kakao_catalog_query_v1(
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

  if v_run.provider <> 'kakao' then
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
          '^(부산|부산광역시)[[:space:]]+'
          || candidate.district_name
          || '([[:space:]]|$)'
        )
      )
      or (
        nullif(btrim(candidate.lot_address), '') is not null
        and candidate.lot_address !~ (
          '^(부산|부산광역시)[[:space:]]+'
          || candidate.district_name
          || '([[:space:]]|$)'
        )
      )
      or candidate.longitude is null
      or candidate.longitude < 128.75
      or candidate.longitude > 129.4
      or candidate.latitude is null
      or candidate.latitude < 34.95
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
    pet_evidence = excluded.pet_evidence,
    pet_notes = excluded.pet_notes,
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

create or replace function public.get_public_map_catalog_v1(
  p_south double precision default null,
  p_west double precision default null,
  p_north double precision default null,
  p_east double precision default null,
  p_candidate_kinds text[] default null,
  p_normalized_categories text[] default null,
  p_district_codes text[] default null,
  p_after_id bigint default null,
  p_result_limit integer default 500
)
returns table (
  id bigint,
  provider_place_id text,
  name text,
  candidate_kind text,
  normalized_category text,
  district_code text,
  district_name text,
  address text,
  latitude double precision,
  longitude double precision,
  phone text,
  place_url text,
  review_status text,
  public_label text,
  source text,
  total_count bigint,
  has_more boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select
      place.id,
      place.provider_place_id,
      place.name,
      place.candidate_kind,
      place.normalized_category,
      place.district_code,
      place.district_name,
      coalesce(
        nullif(btrim(place.road_address), ''),
        nullif(btrim(place.lot_address), '')
      ) as address,
      extensions.st_y(place.location::extensions.geometry) as latitude,
      extensions.st_x(place.location::extensions.geometry) as longitude,
      place.phone,
      place.source_url as place_url,
      'kakao_search_candidate'::text as source,
      place.review_status,
      case
        when
          place.provider = 'kakao'
          and place.lifecycle_status = 'stale'
          and place.review_status = 'confirmed'
          then '재확인 필요'
        when place.provider = 'kakao' and place.candidate_kind = 'veterinary'
          then '동물병원'
        when place.provider = 'kakao' and place.candidate_kind = 'pet_shop'
          then '펫샵·용품점'
        else '동반 여부 확인 필요'
      end as public_label
    from public.map_places as place
    where
      place.provider = 'kakao'
      and place.is_active
      and place.public_visibility
      and place.pending_publication_run_id is null
      and (
        place.lifecycle_status = 'current'
        or (
          place.lifecycle_status = 'stale'
          and place.review_status = 'confirmed'
        )
      )
      and (
        p_candidate_kinds is null
        or place.candidate_kind = any(p_candidate_kinds)
      )
      and (
        p_normalized_categories is null
        or place.candidate_kind <> 'pet_travel_candidate'
        or place.normalized_category = any(p_normalized_categories)
      )
      and (
        p_district_codes is null
        or place.district_code = any(p_district_codes)
      )
      and (
        (
          p_south is null
          and p_west is null
          and p_north is null
          and p_east is null
        )
        or (
          p_south between -90 and 90
          and p_north between -90 and 90
          and p_west between -180 and 180
          and p_east between -180 and 180
          and p_south < p_north
          and p_west < p_east
          and extensions.st_intersects(
            place.location,
            extensions.st_makeenvelope(
              p_west,
              p_south,
              p_east,
              p_north,
              4326
            )::extensions.geography
          )
        )
      )
  ),
  counted as (
    select eligible.*, count(*) over () as total_count
    from eligible
  ),
  result_window as (
    select counted.*
    from counted
    where p_after_id is null or counted.id > p_after_id
    order by counted.id
    limit least(greatest(coalesce(p_result_limit, 500), 1), 1000) + 1
  ),
  marked as (
    select
      result_window.*,
      count(*) over () > least(
        greatest(coalesce(p_result_limit, 500), 1),
        1000
      ) as has_more
    from result_window
  )
  select
    marked.id,
    marked.provider_place_id,
    marked.name,
    marked.candidate_kind,
    marked.normalized_category,
    marked.district_code,
    marked.district_name,
    marked.address,
    marked.latitude,
    marked.longitude,
    marked.phone,
    marked.place_url,
    marked.review_status,
    marked.public_label,
    marked.source,
    marked.total_count,
    marked.has_more
  from marked
  order by marked.id
  limit least(greatest(coalesce(p_result_limit, 500), 1), 1000);
$$;

-- Keep the existing RPC signature and row contract intact until the current
-- Production Route Handler moves to get_public_map_catalog_v1. The body now
-- follows persistent catalog lifecycle state; expires_at remains in the return
-- row solely for compatibility with the current TypeScript contract.
create or replace function public.get_map_places_in_bounds(
  p_south double precision,
  p_west double precision,
  p_north double precision,
  p_east double precision,
  p_providers text[] default null,
  p_categories text[] default null,
  p_result_limit integer default 500
)
returns table (
  id bigint,
  provider text,
  provider_place_id text,
  name text,
  category_group text,
  category_code text,
  content_type_id integer,
  road_address text,
  lot_address text,
  district_name text,
  latitude double precision,
  longitude double precision,
  phone text,
  image_url text,
  source_url text,
  provider_visibility text,
  pet_evidence_status text,
  pet_evidence jsonb,
  pet_notes text,
  fetched_at timestamptz,
  expires_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    place.id,
    place.provider,
    place.provider_place_id,
    place.name,
    place.category_group,
    place.category_code,
    place.content_type_id,
    place.road_address,
    place.lot_address,
    place.district_name,
    extensions.st_y(place.location::extensions.geometry) as latitude,
    extensions.st_x(place.location::extensions.geometry) as longitude,
    place.phone,
    place.image_url,
    place.source_url,
    place.provider_visibility,
    'search_candidate'::text as pet_evidence_status,
    '{"verification_required":true}'::jsonb as pet_evidence,
    '카카오 검색 후보 · 동반 여부 확인 필요'::text as pet_notes,
    place.fetched_at,
    place.expires_at
  from public.map_places as place
  where
    place.provider = 'kakao'
    and place.is_active
    and place.public_visibility
    and place.pending_publication_run_id is null
    and (
      place.lifecycle_status = 'current'
      or (
        place.lifecycle_status = 'stale'
        and place.review_status = 'confirmed'
      )
    )
    and p_south between -90 and 90
    and p_north between -90 and 90
    and p_west between -180 and 180
    and p_east between -180 and 180
    and p_south < p_north
    and p_west < p_east
    and extensions.st_intersects(
      place.location,
      extensions.st_makeenvelope(
        p_west,
        p_south,
        p_east,
        p_north,
        4326
      )::extensions.geography
    )
    and (p_providers is null or place.provider = any(p_providers))
    and (p_categories is null or place.category_group = any(p_categories))
  order by place.provider, place.name, place.id
  limit least(greatest(coalesce(p_result_limit, 500), 1), 1000);
$$;

alter table public.map_places enable row level security;
alter table public.map_ingest_runs enable row level security;
alter table public.map_ingest_run_queries enable row level security;
alter table public.map_place_query_hits enable row level security;

drop policy if exists "active map places are publicly readable"
  on public.map_places;
drop policy if exists "active current stored non-tour map places are publicly readable"
  on public.map_places;

create policy "sanitized public map catalog rows are readable"
  on public.map_places
  for select
  to anon, authenticated
  using (
    provider = 'kakao'
    and is_active
    and public_visibility
    and pending_publication_run_id is null
    and (
      lifecycle_status = 'current'
      or (lifecycle_status = 'stale' and review_status = 'confirmed')
    )
  );

revoke all on table public.map_places
  from public, anon, authenticated, service_role;
revoke all on table public.map_ingest_runs
  from public, anon, authenticated, service_role;
revoke all on table public.map_ingest_run_queries
  from public, anon, authenticated, service_role;
revoke all on table public.map_place_query_hits
  from public, anon, authenticated, service_role;

revoke all on sequence public.map_places_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence public.map_ingest_runs_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence public.map_ingest_run_queries_id_seq
  from public, anon, authenticated, service_role;
revoke all on sequence public.map_place_query_hits_id_seq
  from public, anon, authenticated, service_role;

grant select, insert, update on table public.map_places to service_role;
grant select, insert, update on table public.map_ingest_runs to service_role;
grant select, insert, update on table public.map_ingest_run_queries to service_role;
grant select, insert, update on table public.map_place_query_hits to service_role;

grant usage, select on sequence public.map_places_id_seq to service_role;
grant usage, select on sequence public.map_ingest_runs_id_seq to service_role;
grant usage, select on sequence public.map_ingest_run_queries_id_seq to service_role;
grant usage, select on sequence public.map_place_query_hits_id_seq to service_role;

create or replace function public.finalize_kakao_catalog_run_v1(
  p_run_id bigint,
  p_status text,
  p_sanitized_error_summary text default null,
  p_run_provider_call_count integer default null,
  p_run_provider_429_count integer default null,
  p_run_timeout_count integer default null,
  p_run_provider_error_count integer default null,
  p_completed_at timestamptz default now()
)
returns table (
  run_status text,
  published_row_count integer,
  stale_row_count integer,
  completed_query_count integer,
  unique_place_count integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run public.map_ingest_runs%rowtype;
  v_planned_rows integer := 0;
  v_completed_rows integer := 0;
  v_published integer := 0;
  v_stale integer := 0;
  v_unique integer := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:kakao-catalog-v1')
  );

  if p_completed_at is null then
    raise exception using errcode = '22004', message = 'completed_at is required';
  end if;

  if p_status not in ('completed', 'partial', 'failed') then
    raise exception using errcode = '22023', message = 'invalid final status';
  end if;

  if
    p_run_provider_call_count is not null
    and p_run_provider_call_count < 0
  then
    raise exception using
      errcode = '22023',
      message = 'run provider call count is invalid';
  end if;

  if
    (p_run_provider_429_count is not null and p_run_provider_429_count < 0)
    or (p_run_timeout_count is not null and p_run_timeout_count < 0)
    or (p_run_provider_error_count is not null and p_run_provider_error_count < 0)
  then
    raise exception using
      errcode = '22023',
      message = 'run provider error counters are invalid';
  end if;

  if
    p_sanitized_error_summary is not null
    and length(p_sanitized_error_summary) > 1000
  then
    raise exception using
      errcode = '22023',
      message = 'sanitized error summary is too long';
  end if;

  select run.*
  into v_run
  from public.map_ingest_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'collection run not found';
  end if;

  if v_run.provider <> 'kakao' then
    raise exception using errcode = '22023', message = 'run provider must be kakao';
  end if;

  if v_run.status = 'completed' and p_status = 'completed' then
    select count(distinct hit.candidate_id)::integer
    into v_unique
    from public.map_place_query_hits as hit
    where hit.collection_run_id = p_run_id;

    return query
    select
      v_run.status,
      0,
      v_run.deactivated_row_count,
      v_run.completed_query_count,
      v_unique;
    return;
  end if;

  if v_run.status not in ('planned', 'running', 'partial', 'failed') then
    raise exception using errcode = '55000', message = 'run cannot be finalized';
  end if;

  select
    count(*)::integer,
    count(*) filter (where query.status = 'completed')::integer
  into v_planned_rows, v_completed_rows
  from public.map_ingest_run_queries as query
  where query.collection_run_id = p_run_id;

  if p_status = 'completed' and (
    v_run.planned_query_count <= 0
    or v_planned_rows <> v_run.planned_query_count
    or v_completed_rows <> v_run.planned_query_count
  ) then
    raise exception using
      errcode = '55000',
      message = 'all planned queries must be completed before finalization';
  end if;

  if p_status = 'completed' then
    select count(*)::integer
    into v_published
    from public.map_places as place
    where
      place.provider = 'kakao'
      and place.last_seen_run_id = p_run_id
      and place.pending_publication_run_id = p_run_id;

    update public.map_places
    set
      pending_publication_run_id = null,
      lifecycle_status = 'current',
      public_visibility = case review_status
        when 'rejected' then false
        when 'confirmed' then coalesce(public_visibility, true)
        when 'unreviewed' then true
        when 'needs_review' then true
        else false
      end,
      is_active = case review_status
        when 'rejected' then false
        when 'confirmed' then coalesce(public_visibility, true)
        when 'unreviewed' then true
        when 'needs_review' then true
        else false
      end,
      requires_recheck = false,
      expires_at = p_completed_at + interval '24 hours',
      updated_at = p_completed_at
    where
      provider = 'kakao'
      and last_seen_run_id = p_run_id;

    if v_run.is_full_catalog_run then
      update public.map_places
      set
        pending_publication_run_id = null,
        lifecycle_status = 'stale',
        public_visibility = review_status = 'confirmed',
        is_active = review_status = 'confirmed',
        requires_recheck = review_status = 'confirmed',
        updated_at = p_completed_at
      where
        provider = 'kakao'
        and last_seen_run_id is distinct from p_run_id
        and last_seen_at < v_run.started_at
        and (
          pending_publication_run_id is not null
          or lifecycle_status is distinct from 'stale'
          or public_visibility is distinct from (review_status = 'confirmed')
          or is_active is distinct from (review_status = 'confirmed')
          or requires_recheck is distinct from (review_status = 'confirmed')
        );

      get diagnostics v_stale = row_count;
    end if;
  end if;

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
    status = p_status,
    completed_at = p_completed_at,
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
    deactivated_row_count = case
      when p_status = 'completed' and v_run.is_full_catalog_run then v_stale
      else map_ingest_runs.deactivated_row_count
    end,
    sanitized_error_summary = case
      when p_status = 'completed' then null
      else p_sanitized_error_summary
    end
  from query_stats, place_stats
  where map_ingest_runs.id = p_run_id;

  v_unique := (
    select count(distinct hit.candidate_id)::integer
    from public.map_place_query_hits as hit
    where hit.collection_run_id = p_run_id
  );

  return query
  select p_status, v_published, v_stale, v_completed_rows, v_unique;
end;
$$;

revoke all on function public.start_kakao_catalog_run_v1(
  text,
  text,
  jsonb,
  boolean,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.start_kakao_catalog_run_v1(
  text,
  text,
  jsonb,
  boolean,
  timestamptz
) to service_role;

revoke all on function public.commit_kakao_catalog_query_v1(
  bigint,
  text,
  jsonb,
  integer,
  integer,
  integer,
  integer,
  integer,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.commit_kakao_catalog_query_v1(
  bigint,
  text,
  jsonb,
  integer,
  integer,
  integer,
  integer,
  integer,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) to service_role;

revoke all on function public.finalize_kakao_catalog_run_v1(
  bigint,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.finalize_kakao_catalog_run_v1(
  bigint,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) to service_role;

revoke all on function public.get_public_map_catalog_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_public_map_catalog_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
) to anon, authenticated, service_role;

revoke all on function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
) to anon, authenticated, service_role;

comment on function public.start_kakao_catalog_run_v1(
  text,
  text,
  jsonb,
  boolean,
  timestamptz
) is
  'Service-only atomic creation of one Kakao run and all planned query checkpoints.';

comment on function public.commit_kakao_catalog_query_v1(
  bigint,
  text,
  jsonb,
  integer,
  integer,
  integer,
  integer,
  integer,
  boolean,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) is
  'Service-only atomic candidate upsert, provenance insert, and zero-result-safe query checkpoint commit.';

comment on function public.finalize_kakao_catalog_run_v1(
  bigint,
  text,
  text,
  integer,
  integer,
  integer,
  integer,
  timestamptz
) is
  'Service-only run finalization. Publishes pending rows only on completion and reconciles stale rows only for a complete full-catalog run.';

comment on function public.get_public_map_catalog_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
) is
  'Sanitized, Kakao-only public candidate catalog with keyset pagination and no reviewer or provider diagnostic fields.';

comment on function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
) is
  'Legacy bounds contract backed by sanitized Kakao-only catalog rows; stored evidence and notes are never returned.';
