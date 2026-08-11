create extension if not exists postgis with schema extensions;

create table public.map_places (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('tour', 'kakao')),
  provider_place_id text not null check (length(btrim(provider_place_id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  category_group text,
  category_code text,
  content_type_id integer,
  road_address text,
  lot_address text,
  district_name text,
  location extensions.geography(Point, 4326) not null,
  phone text,
  image_url text,
  source_url text,
  pet_evidence_status text not null check (
    pet_evidence_status in ('official_verified', 'official_unknown', 'search_candidate')
  ),
  pet_evidence jsonb not null default '{}'::jsonb check (jsonb_typeof(pet_evidence) = 'object'),
  pet_notes text,
  is_active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint map_places_provider_evidence_check check (
    (provider = 'kakao' and pet_evidence_status = 'search_candidate')
    or
    (provider = 'tour' and pet_evidence_status in ('official_verified', 'official_unknown'))
  ),
  constraint map_places_location_bounds_check check (
    extensions.st_x(location::extensions.geometry) between -180 and 180
    and extensions.st_y(location::extensions.geometry) between -90 and 90
  ),
  constraint map_places_provider_identity_key unique (provider, provider_place_id)
);

create index map_places_location_gist
  on public.map_places using gist (location);

create index map_places_provider_active_idx
  on public.map_places (provider, is_active);

create index map_places_active_category_idx
  on public.map_places (category_group, provider)
  where is_active;

create table public.map_ingest_runs (
  id bigint generated always as identity primary key,
  provider text not null check (provider in ('tour', 'kakao')),
  status text not null check (status in ('running', 'completed', 'partial', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  attempted_query_count integer not null default 0 check (attempted_query_count >= 0),
  discovered_row_count integer not null default 0 check (discovered_row_count >= 0),
  inserted_row_count integer not null default 0 check (inserted_row_count >= 0),
  updated_row_count integer not null default 0 check (updated_row_count >= 0),
  deactivated_row_count integer not null default 0 check (deactivated_row_count >= 0),
  saturated_query_count integer not null default 0 check (saturated_query_count >= 0),
  sanitized_error_summary text,
  collector_version text not null,
  created_at timestamptz not null default now()
);

create index map_ingest_runs_provider_started_idx
  on public.map_ingest_runs (provider, started_at desc);

alter table public.map_places enable row level security;
alter table public.map_ingest_runs enable row level security;

revoke all on table public.map_places from anon, authenticated;
revoke all on table public.map_ingest_runs from anon, authenticated;
revoke all on sequence public.map_places_id_seq from anon, authenticated;
revoke all on sequence public.map_ingest_runs_id_seq from anon, authenticated;

grant select on table public.map_places to anon, authenticated;

create policy "active map places are publicly readable"
  on public.map_places
  for select
  to anon, authenticated
  using (is_active);

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
  pet_evidence_status text,
  pet_evidence jsonb,
  pet_notes text,
  fetched_at timestamptz
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
    place.pet_evidence_status,
    place.pet_evidence,
    place.pet_notes,
    place.fetched_at
  from public.map_places as place
  where
    place.is_active
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

