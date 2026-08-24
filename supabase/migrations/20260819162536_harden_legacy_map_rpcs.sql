-- Harden only the legacy Busan RPCs still required by the application deployed
-- from main. They keep their existing signatures, return types, and Busan-only
-- predicates while switching from owner privileges to the caller's RLS scope.

alter function public.get_public_map_catalog_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
) security invoker;

alter function public.get_public_map_catalog_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
) set search_path = '';

alter function public.get_public_map_place_location_v1(text) security invoker;
alter function public.get_public_map_place_location_v1(text) set search_path = '';

revoke all on function public.get_public_map_catalog_v2(
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

revoke all on function public.get_public_map_place_location_v1(text)
  from public, anon, authenticated, service_role;

-- SECURITY INVOKER requires base-table privileges. Limit anon to the exact
-- columns referenced by the two compatibility functions; private evidence,
-- reviewer data, and ingestion ownership remain inaccessible.
revoke all on table public.map_places from public, anon, authenticated;
revoke all on table public.map_place_query_hits from public, anon, authenticated;

grant select (
  id,
  region_id,
  provider,
  provider_place_id,
  name,
  candidate_kind,
  normalized_category,
  district_code,
  district_name,
  road_address,
  lot_address,
  location,
  phone,
  source_url,
  review_status,
  lifecycle_status,
  category_group_code,
  last_seen_at,
  is_active,
  public_visibility,
  pending_publication_run_id
) on table public.map_places to anon;

grant select (
  region_id,
  candidate_id,
  query_key,
  category_group_code
) on table public.map_place_query_hits to anon;

drop policy if exists "published Busan query hits are anon-readable"
  on public.map_place_query_hits;

create policy "published Busan query hits are anon-readable"
  on public.map_place_query_hits
  for select
  to anon
  using (
    region_id = 'busan'
    and exists (
      select 1
      from public.map_places as place
      where place.region_id = 'busan'
        and place.region_id = map_place_query_hits.region_id
        and place.id = map_place_query_hits.candidate_id
        and place.provider = 'kakao'
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
    )
  );

grant execute on function public.get_public_map_catalog_v2(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
) to anon;

grant execute on function public.get_public_map_place_location_v1(text) to anon;

comment on function public.get_public_map_catalog_v2(
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
  'Legacy Busan/Kakao compatibility catalog. SECURITY INVOKER; anon-only until the region-aware application is promoted.';

comment on function public.get_public_map_place_location_v1(text) is
  'Legacy Busan/Kakao compatibility location lookup. SECURITY INVOKER; anon-only until the region-aware application is promoted.';

-- Repository-wide and deployed-main analysis proved these contracts unused.
-- Removing them closes obsolete browser-callable and service-only surfaces.
revoke all on function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
) from public, anon, authenticated, service_role;

drop function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
);

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

drop function public.get_public_map_catalog_v1(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
);

revoke all on function public.get_public_map_catalog_by_region_v1(
  text,
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

drop function public.get_public_map_catalog_by_region_v1(
  text,
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  text[],
  bigint,
  integer
);
