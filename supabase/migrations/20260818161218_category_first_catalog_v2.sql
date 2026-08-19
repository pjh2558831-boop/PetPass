-- Category-first public catalog ranking metadata and the bounded Kakao V2 delta.

create or replace function public.start_kakao_catalog_delta_run_v2(
  p_registry_version text,
  p_collector_version text,
  p_queries jsonb,
  p_is_full_catalog_run boolean default false,
  p_started_at timestamptz default now()
)
returns table (run_id bigint, planned_query_count integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_id bigint;
  v_query_count integer;
  v_valid_count integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('petpass:kakao-catalog-v2-delta'));
  if btrim(coalesce(p_registry_version, '')) <> 'kakao-busan-query-registry-v2'
    or nullif(btrim(p_collector_version), '') is null
    or p_queries is null
    or pg_catalog.jsonb_typeof(p_queries) <> 'array'
    or p_is_full_catalog_run is distinct from false
    or p_started_at is null
  then
    raise exception using errcode = '22023', message = 'delta run metadata is invalid';
  end if;

  v_query_count := pg_catalog.jsonb_array_length(p_queries);
  if v_query_count < 1 or v_query_count > 32 then
    raise exception using errcode = '22023', message = 'delta query count is invalid';
  end if;

  with districts(district_code, district) as (
    values
      ('110', '중구'), ('140', '서구'), ('170', '동구'), ('200', '영도구'),
      ('230', '부산진구'), ('260', '동래구'), ('290', '남구'), ('320', '북구'),
      ('350', '해운대구'), ('380', '사하구'), ('410', '금정구'), ('440', '강서구'),
      ('470', '연제구'), ('500', '수영구'), ('530', '사상구'), ('710', '기장군')
  ),
  templates(family, suffix, normalized_category, category_group_code) as (
    values
      ('cafe', '반려동물동반 카페', 'cafe', 'CE7'),
      ('food', '반려동물동반 식당', 'food', 'FD6')
  ),
  expected as (
    select
      'kakao-busan-v2:' || district_code || ':' || family || ':0' as query_key,
      '부산 ' || district || ' ' || suffix as query_text,
      district_code,
      district,
      'pet_travel_candidate'::text as candidate_kind,
      normalized_category,
      category_group_code
    from districts cross join templates
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
  select count(*)::integer into v_valid_count
  from supplied
  join expected using (
    query_key,
    query_text,
    district_code,
    district,
    candidate_kind,
    normalized_category,
    category_group_code
  );

  if v_valid_count <> v_query_count or (
    select count(distinct query.query_key)
    from pg_catalog.jsonb_to_recordset(p_queries) as query (query_key text)
  ) <> v_query_count then
    raise exception using errcode = '22023', message = 'delta plan does not match registry v2';
  end if;

  insert into public.map_ingest_runs (
    provider, status, started_at, collector_version, registry_version,
    is_full_catalog_run, planned_query_count
  ) values (
    'kakao', 'running', p_started_at, btrim(p_collector_version),
    btrim(p_registry_version), false, v_query_count
  ) returning id into v_run_id;

  insert into public.map_ingest_run_queries (
    collection_run_id, query_key, query_text, district_code, district,
    candidate_kind, normalized_category, category_group_code, status,
    created_at, updated_at
  )
  select
    v_run_id, query.query_key, query.query_text, query.district_code,
    query.district, query.candidate_kind, query.normalized_category,
    query.category_group_code, 'planned', p_started_at, p_started_at
  from pg_catalog.jsonb_to_recordset(p_queries) as query (
    query_key text,
    query_text text,
    district_code text,
    district text,
    candidate_kind text,
    normalized_category text,
    category_group_code text
  );

  return query select v_run_id, v_query_count;
end;
$$;

create or replace function public.get_public_map_catalog_v2(
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
  category_group_code text,
  last_seen_at timestamptz,
  matched_query_count bigint,
  category_query_agreement_count bigint,
  total_count bigint,
  has_more boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with hit_counts as (
    select
      hit.candidate_id,
      count(distinct hit.query_key) as matched_query_count,
      count(distinct hit.query_key) filter (
        where
          (place.normalized_category = 'cafe' and hit.category_group_code = 'CE7')
          or (place.normalized_category = 'food' and hit.category_group_code = 'FD6')
          or (place.normalized_category = 'accommodation' and hit.category_group_code = 'AD5')
          or (place.normalized_category = 'attraction' and hit.category_group_code = 'AT4')
      ) as category_query_agreement_count
    from public.map_place_query_hits as hit
    join public.map_places as place on place.id = hit.candidate_id
    group by hit.candidate_id
  ),
  eligible as (
    select
      place.id,
      place.provider_place_id,
      place.name,
      place.candidate_kind,
      place.normalized_category,
      place.district_code,
      place.district_name,
      coalesce(nullif(btrim(place.road_address), ''), nullif(btrim(place.lot_address), '')) as address,
      extensions.st_y(place.location::extensions.geometry) as latitude,
      extensions.st_x(place.location::extensions.geometry) as longitude,
      place.phone,
      place.source_url as place_url,
      place.review_status,
      case
        when place.lifecycle_status = 'stale' and place.review_status = 'confirmed' then '재확인 필요'
        when place.candidate_kind = 'veterinary' then '동물병원'
        when place.candidate_kind = 'pet_shop' then '펫샵·용품점'
        else '동반 여부 확인 필요'
      end as public_label,
      'kakao_search_candidate'::text as source,
      place.category_group_code,
      place.last_seen_at,
      coalesce(hit_counts.matched_query_count, 0) as matched_query_count,
      coalesce(hit_counts.category_query_agreement_count, 0) as category_query_agreement_count
    from public.map_places as place
    left join hit_counts on hit_counts.candidate_id = place.id
    where place.provider = 'kakao'
      and place.is_active
      and place.public_visibility
      and place.pending_publication_run_id is null
      and (place.lifecycle_status = 'current' or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed'))
      and (p_candidate_kinds is null or place.candidate_kind = any(p_candidate_kinds))
      and (p_normalized_categories is null or place.candidate_kind <> 'pet_travel_candidate' or place.normalized_category = any(p_normalized_categories))
      and (p_district_codes is null or place.district_code = any(p_district_codes))
      and (
        (p_south is null and p_west is null and p_north is null and p_east is null)
        or (
          p_south between -90 and 90 and p_north between -90 and 90
          and p_west between -180 and 180 and p_east between -180 and 180
          and p_south < p_north and p_west < p_east
          and extensions.st_intersects(
            place.location,
            extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
          )
        )
      )
  ),
  counted as (select eligible.*, count(*) over () as total_count from eligible),
  result_window as (
    select counted.* from counted
    where p_after_id is null or counted.id > p_after_id
    order by counted.id
    limit least(greatest(coalesce(p_result_limit, 500), 1), 1000) + 1
  ),
  marked as (
    select result_window.*,
      count(*) over () > least(greatest(coalesce(p_result_limit, 500), 1), 1000) as has_more
    from result_window
  )
  select
    marked.id, marked.provider_place_id, marked.name, marked.candidate_kind,
    marked.normalized_category, marked.district_code, marked.district_name,
    marked.address, marked.latitude, marked.longitude, marked.phone,
    marked.place_url, marked.review_status, marked.public_label, marked.source,
    marked.category_group_code, marked.last_seen_at, marked.matched_query_count,
    marked.category_query_agreement_count, marked.total_count, marked.has_more
  from marked
  order by marked.id
  limit least(greatest(coalesce(p_result_limit, 500), 1), 1000);
$$;

create or replace function public.get_public_map_place_location_v1(
  p_provider_place_id text
)
returns table (
  provider_place_id text,
  latitude double precision,
  longitude double precision
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    place.provider_place_id,
    extensions.st_y(place.location::extensions.geometry),
    extensions.st_x(place.location::extensions.geometry)
  from public.map_places as place
  where place.provider = 'kakao'
    and place.provider_place_id = btrim(p_provider_place_id)
    and place.is_active
    and place.public_visibility
    and place.pending_publication_run_id is null
    and (place.lifecycle_status = 'current' or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed'))
  limit 1;
$$;

revoke all on function public.start_kakao_catalog_delta_run_v2(text, text, jsonb, boolean, timestamptz)
  from public, anon, authenticated, service_role;
grant execute on function public.start_kakao_catalog_delta_run_v2(text, text, jsonb, boolean, timestamptz)
  to service_role;

revoke all on function public.get_public_map_catalog_v2(double precision, double precision, double precision, double precision, text[], text[], text[], bigint, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_map_catalog_v2(double precision, double precision, double precision, double precision, text[], text[], text[], bigint, integer)
  to anon, authenticated, service_role;

revoke all on function public.get_public_map_place_location_v1(text)
  from public, anon, authenticated, service_role;
grant execute on function public.get_public_map_place_location_v1(text)
  to anon, authenticated, service_role;

comment on function public.start_kakao_catalog_delta_run_v2(text, text, jsonb, boolean, timestamptz) is
  'Service-only exact V2 compact-query delta plan. Full-catalog reconciliation is prohibited.';
comment on function public.get_public_map_catalog_v2(double precision, double precision, double precision, double precision, text[], text[], text[], bigint, integer) is
  'Sanitized public Kakao catalog with bounded query-hit and freshness ranking signals; reviewer fields remain private.';
comment on function public.get_public_map_place_location_v1(text) is
  'Sanitized known-place coordinate lookup for server-generated location thumbnails.';
