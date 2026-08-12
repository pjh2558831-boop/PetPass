alter table public.map_places
  add column provider_visibility text not null default 'unknown'
  check (
    provider_visibility in (
      'exposed',
      'not_exposed',
      'unknown',
      'provider_unavailable',
      'not_applicable'
    )
  );

update public.map_places
set provider_visibility = 'not_applicable'
where provider = 'kakao';

alter table public.map_places
  add constraint map_places_provider_visibility_check check (
    (provider = 'tour' and provider_visibility <> 'not_applicable')
    or
    (provider = 'kakao' and provider_visibility = 'not_applicable')
  );

create index map_places_provider_visibility_active_idx
  on public.map_places (provider, provider_visibility)
  where is_active;

drop policy if exists "active map places are publicly readable"
  on public.map_places;

create policy "active current stored non-tour map places are publicly readable"
  on public.map_places
  for select
  to anon, authenticated
  using (
    is_active
    and provider <> 'tour'
    and expires_at > now()
  );

drop function if exists public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
);

create function public.get_map_places_in_bounds(
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
security invoker
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
    place.pet_evidence_status,
    place.pet_evidence,
    place.pet_notes,
    place.fetched_at,
    place.expires_at
  from public.map_places as place
  where
    place.is_active
    and place.provider <> 'tour'
    and place.expires_at > now()
    and p_south between -90 and 90
    and p_north between -90 and 90
    and p_west between -180 and 180
    and p_east between -180 and 180
    and p_south < p_north
    and p_west < p_east
    and extensions.st_intersects(place.location, extensions.st_makeenvelope(
      p_west,
      p_south,
      p_east,
      p_north,
      4326
    )::extensions.geography)
    and (p_providers is null or place.provider = any(p_providers))
    and (p_categories is null or place.category_group = any(p_categories))
  order by place.provider, place.name, place.id
  limit least(greatest(coalesce(p_result_limit, 500), 1), 1000);
$$;

revoke all on function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
) from public;

grant execute on function public.get_map_places_in_bounds(
  double precision,
  double precision,
  double precision,
  double precision,
  text[],
  text[],
  integer
) to anon, authenticated;
