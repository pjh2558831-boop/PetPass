-- Avoid evaluating the PostGIS viewport branch when no committed viewport was
-- supplied. PostgreSQL may evaluate both sides of a boolean OR, while CASE
-- preserves the required short-circuit and keeps the default catalog RPC well
-- below the API statement timeout.

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
      and case
        when p_south is null and p_west is null and p_north is null and p_east is null then true
        when
          p_south between -90 and 90 and p_north between -90 and 90
          and p_west between -180 and 180 and p_east between -180 and 180
          and p_south < p_north and p_west < p_east
        then extensions.st_intersects(
          place.location,
          extensions.st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::extensions.geography
        )
        else false
      end
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
