-- The Shopping migration removes browser access to the raw catalog, which is
-- the final intended access model. The two temporary deployed-main
-- compatibility RPCs must therefore execute through their narrowly scoped,
-- fully-qualified projections instead of inheriting anon table privileges.

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
) security definer;

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

alter function public.get_public_map_place_location_v1(text) security definer;
alter function public.get_public_map_place_location_v1(text) set search_path = '';

revoke all on table public.map_places from public, anon, authenticated;
revoke all on table public.map_place_query_hits from public, anon, authenticated;

drop policy if exists "published Busan query hits are anon-readable"
  on public.map_place_query_hits;

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
) from public, authenticated, service_role;

revoke all on function public.get_public_map_place_location_v1(text)
  from public, authenticated, service_role;

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
  'Legacy Busan/Kakao compatibility projection. SECURITY DEFINER with an empty search_path; anon receives projected rows without raw catalog grants.';

comment on function public.get_public_map_place_location_v1(text) is
  'Legacy Busan/Kakao compatibility location projection. SECURITY DEFINER with an empty search_path; anon receives only published coordinates.';

;
