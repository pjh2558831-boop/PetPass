-- Server-controlled public catalog projection for the Phase 4 map-only Jeju
-- rollout. The frozen v1 RPC remains Busan/Kakao-only; this v2 contract adds
-- active KTO rows without granting browsers direct table or function access.

create function public.get_public_map_catalog_by_region_v2(
  p_region_id text,
  p_providers text[],
  p_candidate_kinds text[] default null,
  p_normalized_categories text[] default null,
  p_district_codes text[] default null,
  p_after_id bigint default null,
  p_result_limit integer default 200
)
returns table (
  id bigint,
  provider text,
  provider_place_id text,
  name text,
  candidate_kind text,
  normalized_category text,
  content_type_id integer,
  district_code text,
  district_name text,
  address text,
  latitude double precision,
  longitude double precision,
  phone text,
  image_url text,
  place_url text,
  review_status text,
  public_label text,
  source text,
  pet_access_verdict text,
  pet_evidence_status text,
  category_group_code text,
  last_seen_at timestamptz,
  matched_query_count bigint,
  category_query_agreement_count bigint,
  total_count bigint,
  has_more boolean
)
language sql
stable
security invoker
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
    join public.map_places as place
      on place.region_id = hit.region_id
      and place.id = hit.candidate_id
    where hit.region_id = btrim(p_region_id)
      and place.provider = 'kakao'
    group by hit.candidate_id
  ),
  projected as (
    select
      place.id,
      place.provider,
      place.provider_place_id,
      place.name,
      case
        when place.provider = 'tour' then 'tourism_place'
        else place.candidate_kind
      end as candidate_kind,
      case
        when place.provider = 'tour' and place.category_group in (
          'attraction', 'culture', 'festival', 'leisure'
        ) then 'attraction'
        when place.provider = 'tour' and place.category_group = 'accommodation' then 'accommodation'
        when place.provider = 'tour' and place.category_group = 'food' then 'food'
        else place.normalized_category
      end as normalized_category,
      place.content_type_id,
      place.district_code,
      place.district_name,
      coalesce(
        nullif(btrim(place.road_address), ''),
        nullif(btrim(place.lot_address), ''),
        '주소 확인 필요'
      ) as address,
      extensions.st_y(place.location::extensions.geometry) as latitude,
      extensions.st_x(place.location::extensions.geometry) as longitude,
      nullif(btrim(place.phone), '') as phone,
      place.image_url,
      case when place.provider = 'kakao' then place.source_url else null end as place_url,
      case when place.provider = 'tour' then 'confirmed' else place.review_status end as review_status,
      case
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' = 'allowed'
          then '반려동물 동반 가능'
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' = 'conditional'
          then '동반 조건 확인 필요'
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' = 'not_allowed'
          then '반려동물 동반 불가 안내'
        when place.provider = 'tour' then '동반 정보 확인 필요'
        when place.lifecycle_status = 'stale' and place.review_status = 'confirmed'
          then '재확인 필요'
        when place.candidate_kind = 'veterinary' then '동물병원'
        when place.candidate_kind = 'pet_shop' then '펫샵·용품점'
        else '동반 여부 확인 필요'
      end as public_label,
      case
        when place.provider = 'tour' then 'kto_official'::text
        else 'kakao_search_candidate'::text
      end as source,
      case
        when place.provider = 'tour' and place.pet_evidence #>> '{assessment,verdict}' in (
          'allowed', 'conditional', 'not_allowed', 'unknown'
        ) then place.pet_evidence #>> '{assessment,verdict}'
        else 'unknown'
      end as pet_access_verdict,
      place.pet_evidence_status,
      case
        when place.provider = 'tour' then place.category_code
        else place.category_group_code
      end as category_group_code,
      place.last_seen_at,
      coalesce(hit_counts.matched_query_count, 0) as matched_query_count,
      coalesce(hit_counts.category_query_agreement_count, 0) as category_query_agreement_count
    from public.map_places as place
    left join hit_counts on hit_counts.candidate_id = place.id
    where place.region_id = btrim(p_region_id)
      and cardinality(p_providers) between 1 and 2
      and p_providers <@ array['tour', 'kakao']::text[]
      and place.provider = any(p_providers)
      and place.is_active
      and (
        place.provider = 'tour'
        or (
          place.provider = 'kakao'
          and place.public_visibility
          and place.pending_publication_run_id is null
          and (
            place.lifecycle_status = 'current'
            or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed')
          )
        )
      )
  ),
  eligible as (
    select projected.*
    from projected
    where (
        p_candidate_kinds is null
        or projected.candidate_kind = any(p_candidate_kinds)
      )
      and (
        p_normalized_categories is null
        or projected.candidate_kind in ('veterinary', 'pet_shop')
        or projected.normalized_category = any(p_normalized_categories)
      )
      and (
        p_district_codes is null
        or projected.district_code = any(p_district_codes)
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
    limit least(greatest(coalesce(p_result_limit, 200), 1), 200) + 1
  ),
  marked as (
    select
      result_window.*,
      count(*) over () > least(
        greatest(coalesce(p_result_limit, 200), 1),
        200
      ) as has_more
    from result_window
  )
  select
    marked.id,
    marked.provider,
    marked.provider_place_id,
    marked.name,
    marked.candidate_kind,
    marked.normalized_category,
    marked.content_type_id,
    marked.district_code,
    marked.district_name,
    marked.address,
    marked.latitude,
    marked.longitude,
    marked.phone,
    marked.image_url,
    marked.place_url,
    marked.review_status,
    marked.public_label,
    marked.source,
    marked.pet_access_verdict,
    marked.pet_evidence_status,
    marked.category_group_code,
    marked.last_seen_at,
    marked.matched_query_count,
    marked.category_query_agreement_count,
    marked.total_count,
    marked.has_more
  from marked
  order by marked.id
  limit least(greatest(coalesce(p_result_limit, 200), 1), 200);
$$;

revoke all on function public.get_public_map_catalog_by_region_v2(
  text,
  text[],
  text[],
  text[],
  text[],
  bigint,
  integer
) from public, anon, authenticated;

grant execute on function public.get_public_map_catalog_by_region_v2(
  text,
  text[],
  text[],
  text[],
  text[],
  bigint,
  integer
) to service_role;

comment on function public.get_public_map_catalog_by_region_v2(
  text,
  text[],
  text[],
  text[],
  text[],
  bigint,
  integer
) is
  'Service-only public map projection scoped by explicit region and provider. Includes active official KTO records without exposing source tables.';
