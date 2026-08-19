-- Multi-region map catalog foundation.
--
-- Phase 1 deliberately keeps every existing public RPC and Kakao collection
-- entry point Busan-scoped. Jeju is normalized in the database but remains
-- disabled for Kakao collection until a later rollout explicitly enables it.

create table public.regions (
  region_id text primary key check (region_id ~ '^[a-z][a-z0-9_-]*$'),
  display_name text not null unique check (length(btrim(display_name)) > 0),
  legal_dong_code text not null unique check (legal_dong_code ~ '^[0-9]{2}$'),
  kakao_collection_enabled boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.region_districts (
  region_id text not null references public.regions (region_id),
  district_code text not null check (district_code ~ '^[0-9]{3}$'),
  district_name text not null check (length(btrim(district_name)) > 0),
  created_at timestamptz not null default now(),
  primary key (region_id, district_code),
  constraint region_districts_region_name_key unique (region_id, district_name),
  constraint region_districts_region_code_name_key unique (
    region_id,
    district_code,
    district_name
  )
);

insert into public.regions (
  region_id,
  display_name,
  legal_dong_code,
  kakao_collection_enabled
) values
  ('busan', '부산', '26', true),
  ('jeju', '제주', '50', false);

insert into public.region_districts (
  region_id,
  district_code,
  district_name
) values
  ('busan', '110', '중구'),
  ('busan', '140', '서구'),
  ('busan', '170', '동구'),
  ('busan', '200', '영도구'),
  ('busan', '230', '부산진구'),
  ('busan', '260', '동래구'),
  ('busan', '290', '남구'),
  ('busan', '320', '북구'),
  ('busan', '350', '해운대구'),
  ('busan', '380', '사하구'),
  ('busan', '410', '금정구'),
  ('busan', '440', '강서구'),
  ('busan', '470', '연제구'),
  ('busan', '500', '수영구'),
  ('busan', '530', '사상구'),
  ('busan', '710', '기장군'),
  ('jeju', '110', '제주시'),
  ('jeju', '130', '서귀포시');

alter table public.map_places add column region_id text;
alter table public.map_ingest_runs add column region_id text;
alter table public.map_ingest_run_queries add column region_id text;
alter table public.map_place_query_hits add column region_id text;

-- Refuse the backfill if the current catalog is not exactly the inspected
-- Busan dataset. This is intentionally stricter than the steady-state shape
-- constraint so an unexpected production row cannot be silently mislabeled.
do $$
begin
  if exists (
    select 1
    from public.map_places as place
    left join public.region_districts as district
      on district.region_id = 'busan'
      and district.district_code = place.district_code
      and district.district_name = place.district_name
    where
      district.region_id is null
      or coalesce(
        nullif(btrim(place.road_address), ''),
        nullif(btrim(place.lot_address), '')
      ) is null
      or coalesce(
        nullif(btrim(place.road_address), ''),
        nullif(btrim(place.lot_address), '')
      ) !~ '^(부산|부산광역시)[[:space:]]'
      or (
        nullif(btrim(place.road_address), '') is not null
        and place.road_address !~ (
          '^(부산|부산광역시)[[:space:]]+'
          || place.district_name
          || '([[:space:]]|$)'
        )
      )
      or (
        nullif(btrim(place.lot_address), '') is not null
        and place.lot_address !~ (
          '^(부산|부산광역시)[[:space:]]+'
          || place.district_name
          || '([[:space:]]|$)'
        )
      )
      or extensions.st_x(place.location::extensions.geometry)
        not between 128.75 and 129.4
      or extensions.st_y(place.location::extensions.geometry)
        not between 34.95 and 35.5
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing map data is not exclusively Busan; region backfill aborted';
  end if;

  if exists (
    select 1
    from public.map_ingest_runs as run
    where
      (run.provider = 'kakao' and (
        run.registry_version is null
        or run.registry_version !~ '^kakao-busan-'
      ))
      or (run.provider = 'tour' and run.registry_version is not null)
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing ingestion runs are not exclusively Busan; region backfill aborted';
  end if;

  if exists (
    select 1
    from public.map_ingest_run_queries as query
    left join public.region_districts as district
      on district.region_id = 'busan'
      and district.district_code = query.district_code
      and district.district_name = query.district
    where
      district.region_id is null
      or query.query_key !~ '^kakao-busan-'
      or query.query_text !~ '^부산[[:space:]]'
  ) or exists (
    select 1
    from public.map_place_query_hits as hit
    left join public.region_districts as district
      on district.region_id = 'busan'
      and district.district_code = hit.district_code
      and district.district_name = hit.district
    where
      district.region_id is null
      or hit.query_key !~ '^kakao-busan-'
      or hit.query_text !~ '^부산[[:space:]]'
  ) then
    raise exception using
      errcode = '23514',
      message = 'existing ingestion checkpoints are not exclusively Busan; region backfill aborted';
  end if;
end;
$$;

update public.map_places set region_id = 'busan' where region_id is null;
update public.map_ingest_runs set region_id = 'busan' where region_id is null;
update public.map_ingest_run_queries set region_id = 'busan' where region_id is null;
update public.map_place_query_hits set region_id = 'busan' where region_id is null;

alter table public.map_places alter column region_id set not null;
alter table public.map_ingest_runs alter column region_id set not null;
alter table public.map_ingest_run_queries alter column region_id set not null;
alter table public.map_place_query_hits alter column region_id set not null;

alter table public.map_places
  drop constraint map_places_kakao_catalog_shape_check,
  drop constraint map_places_last_seen_run_fkey,
  drop constraint map_places_pending_publication_run_fkey;

alter table public.map_ingest_runs
  drop constraint map_ingest_runs_full_catalog_scope_check;

alter table public.map_ingest_run_queries
  drop constraint map_ingest_run_queries_collection_run_id_fkey,
  drop constraint map_ingest_run_queries_district_check,
  drop constraint map_ingest_run_queries_district_identity_check;

alter table public.map_place_query_hits
  drop constraint map_place_query_hits_candidate_id_fkey,
  drop constraint map_place_query_hits_query_fkey,
  drop constraint map_place_query_hits_district_check,
  drop constraint map_place_query_hits_district_identity_check;

alter table public.map_ingest_runs
  add constraint map_ingest_runs_region_fkey
    foreign key (region_id) references public.regions (region_id),
  add constraint map_ingest_runs_region_identity_key unique (region_id, id),
  add constraint map_ingest_runs_full_catalog_scope_check check (
    not is_full_catalog_run
    or (
      provider = 'kakao'
      and registry_version = 'kakao-' || region_id || '-query-registry-v1'
      and planned_query_count > 0
      and (region_id <> 'busan' or planned_query_count = 496)
    )
  );

alter table public.map_places
  add constraint map_places_region_fkey
    foreign key (region_id) references public.regions (region_id),
  add constraint map_places_region_identity_key unique (region_id, id),
  add constraint map_places_district_completeness_check check (
    (district_code is null) = (district_name is null)
  ),
  add constraint map_places_region_district_fkey foreign key (
    region_id,
    district_code,
    district_name
  ) references public.region_districts (
    region_id,
    district_code,
    district_name
  ),
  add constraint map_places_last_seen_run_fkey foreign key (
    region_id,
    last_seen_run_id
  ) references public.map_ingest_runs (region_id, id) on delete set null (last_seen_run_id),
  add constraint map_places_pending_publication_run_fkey foreign key (
    region_id,
    pending_publication_run_id
  ) references public.map_ingest_runs (region_id, id)
    on delete set null (pending_publication_run_id),
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
            else false
          end
        )
      )
    )
  );

alter table public.map_ingest_run_queries
  add constraint map_ingest_run_queries_region_fkey
    foreign key (region_id) references public.regions (region_id),
  add constraint map_ingest_run_queries_region_run_key unique (
    region_id,
    collection_run_id,
    query_key
  ),
  add constraint map_ingest_run_queries_region_run_fkey
    foreign key (region_id, collection_run_id)
    references public.map_ingest_runs (region_id, id) on delete cascade,
  add constraint map_ingest_run_queries_region_district_fkey foreign key (
    region_id,
    district_code,
    district
  ) references public.region_districts (
    region_id,
    district_code,
    district_name
  );

alter table public.map_place_query_hits
  add constraint map_place_query_hits_region_fkey
    foreign key (region_id) references public.regions (region_id),
  add constraint map_place_query_hits_candidate_region_fkey
    foreign key (region_id, candidate_id)
    references public.map_places (region_id, id) on delete cascade,
  add constraint map_place_query_hits_query_region_fkey foreign key (
    region_id,
    collection_run_id,
    query_key
  ) references public.map_ingest_run_queries (
    region_id,
    collection_run_id,
    query_key
  ) on delete cascade,
  add constraint map_place_query_hits_region_district_fkey foreign key (
    region_id,
    district_code,
    district
  ) references public.region_districts (
    region_id,
    district_code,
    district_name
  );

create or replace function public.set_map_ingest_run_region_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_kakao_collection_enabled boolean;
begin
  if new.region_id is null then
    if new.provider = 'kakao' and new.registry_version in (
      'kakao-busan-query-registry-v1',
      'kakao-busan-query-registry-v2'
    ) then
      new.region_id := 'busan';
    else
      raise exception using errcode = '23502', message = 'region_id is required for ingestion runs';
    end if;
  end if;

  select region.kakao_collection_enabled
  into v_kakao_collection_enabled
  from public.regions as region
  where region.region_id = new.region_id;

  if not found then
    raise exception using errcode = '23503', message = 'unknown ingestion region';
  end if;

  if new.provider = 'kakao' and not v_kakao_collection_enabled then
    raise exception using
      errcode = '55000',
      message = 'Kakao collection is disabled for region ' || new.region_id;
  end if;

  return new;
end;
$$;

create trigger map_ingest_runs_set_region_v1
before insert or update of region_id, provider, registry_version
on public.map_ingest_runs
for each row execute function public.set_map_ingest_run_region_v1();

create or replace function public.set_map_place_region_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_region_id text;
begin
  if new.last_seen_run_id is not null then
    select run.region_id into v_run_region_id
    from public.map_ingest_runs as run
    where run.id = new.last_seen_run_id;

    if not found then
      raise exception using errcode = '23503', message = 'last-seen ingestion run not found';
    end if;
  end if;

  if new.pending_publication_run_id is not null then
    if exists (
      select 1
      from public.map_ingest_runs as run
      where run.id = new.pending_publication_run_id
        and v_run_region_id is not null
        and run.region_id <> v_run_region_id
    ) then
      raise exception using errcode = '23514', message = 'place ingestion runs span multiple regions';
    end if;

    select run.region_id into v_run_region_id
    from public.map_ingest_runs as run
    where run.id = new.pending_publication_run_id;

    if not found then
      raise exception using errcode = '23503', message = 'publication ingestion run not found';
    end if;
  end if;

  if new.region_id is null then
    if v_run_region_id is null then
      raise exception using errcode = '23502', message = 'region_id is required for map places';
    end if;
    new.region_id := v_run_region_id;
  elsif v_run_region_id is not null and new.region_id <> v_run_region_id then
    raise exception using errcode = '23514', message = 'map place and ingestion run regions differ';
  end if;

  return new;
end;
$$;

create trigger map_places_set_region_v1
before insert or update of region_id, last_seen_run_id, pending_publication_run_id
on public.map_places
for each row execute function public.set_map_place_region_v1();

create or replace function public.set_map_ingest_query_region_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_run_region_id text;
begin
  select run.region_id into v_run_region_id
  from public.map_ingest_runs as run
  where run.id = new.collection_run_id;

  if not found then
    raise exception using errcode = '23503', message = 'query ingestion run not found';
  end if;

  if new.region_id is null then
    new.region_id := v_run_region_id;
  elsif new.region_id <> v_run_region_id then
    raise exception using errcode = '23514', message = 'query and ingestion run regions differ';
  end if;

  return new;
end;
$$;

create trigger map_ingest_run_queries_set_region_v1
before insert or update of region_id, collection_run_id
on public.map_ingest_run_queries
for each row execute function public.set_map_ingest_query_region_v1();

create or replace function public.set_map_query_hit_region_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_query_region_id text;
begin
  select query.region_id into v_query_region_id
  from public.map_ingest_run_queries as query
  where query.collection_run_id = new.collection_run_id
    and query.query_key = new.query_key;

  if not found then
    raise exception using errcode = '23503', message = 'query checkpoint not found';
  end if;

  if new.region_id is null then
    new.region_id := v_query_region_id;
  elsif new.region_id <> v_query_region_id then
    raise exception using errcode = '23514', message = 'query hit and checkpoint regions differ';
  end if;

  return new;
end;
$$;

create trigger map_place_query_hits_set_region_v1
before insert or update of region_id, collection_run_id, query_key
on public.map_place_query_hits
for each row execute function public.set_map_query_hit_region_v1();

revoke all on function public.set_map_ingest_run_region_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.set_map_place_region_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.set_map_ingest_query_region_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.set_map_query_hit_region_v1()
  from public, anon, authenticated, service_role;

drop index public.map_ingest_runs_provider_started_idx;
create index map_ingest_runs_provider_started_idx
  on public.map_ingest_runs (region_id, provider, started_at desc);

drop index public.map_ingest_runs_one_open_kakao_catalog_v1_idx;
create unique index map_ingest_runs_one_open_kakao_catalog_v1_idx
  on public.map_ingest_runs (region_id, provider)
  where
    provider = 'kakao'
    and registry_version = 'kakao-' || region_id || '-query-registry-v1'
    and status in ('planned', 'running', 'partial');

drop index public.map_places_provider_active_idx;
create index map_places_provider_active_idx
  on public.map_places (region_id, provider, is_active);

drop index public.map_places_active_category_idx;
create index map_places_active_category_idx
  on public.map_places (region_id, category_group, provider)
  where is_active;

drop index public.map_places_provider_visibility_active_idx;
create index map_places_provider_visibility_active_idx
  on public.map_places (region_id, provider, provider_visibility)
  where is_active;

drop index public.map_places_kakao_public_catalog_idx;
create index map_places_kakao_public_catalog_idx on public.map_places (
  region_id,
  candidate_kind,
  district_code,
  normalized_category,
  id
)
where
  provider = 'kakao'
  and is_active
  and public_visibility
  and pending_publication_run_id is null;

-- Finalization derives its scope from the run row. The explicit region
-- predicates are defense in depth on top of the composite region foreign keys.
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
  if p_completed_at is null then
    raise exception using errcode = '22004', message = 'completed_at is required';
  end if;

  if p_status not in ('completed', 'partial', 'failed') then
    raise exception using errcode = '22023', message = 'invalid final status';
  end if;

  if p_run_provider_call_count is not null and p_run_provider_call_count < 0 then
    raise exception using errcode = '22023', message = 'run provider call count is invalid';
  end if;

  if
    (p_run_provider_429_count is not null and p_run_provider_429_count < 0)
    or (p_run_timeout_count is not null and p_run_timeout_count < 0)
    or (p_run_provider_error_count is not null and p_run_provider_error_count < 0)
  then
    raise exception using errcode = '22023', message = 'run provider error counters are invalid';
  end if;

  if p_sanitized_error_summary is not null and length(p_sanitized_error_summary) > 1000 then
    raise exception using errcode = '22023', message = 'sanitized error summary is too long';
  end if;

  select run.*
  into v_run
  from public.map_ingest_runs as run
  where run.id = p_run_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'collection run not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('petpass:kakao-catalog-v1:' || v_run.region_id)
  );

  if v_run.provider <> 'kakao' then
    raise exception using errcode = '22023', message = 'run provider must be kakao';
  end if;

  if v_run.status = 'completed' and p_status = 'completed' then
    select count(distinct hit.candidate_id)::integer
    into v_unique
    from public.map_place_query_hits as hit
    where hit.collection_run_id = p_run_id
      and hit.region_id = v_run.region_id;

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
  where query.collection_run_id = p_run_id
    and query.region_id = v_run.region_id;

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
    where place.provider = 'kakao'
      and place.region_id = v_run.region_id
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
    where provider = 'kakao'
      and region_id = v_run.region_id
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
      where provider = 'kakao'
        and region_id = v_run.region_id
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
      and query.region_id = v_run.region_id
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
    join public.map_places as place
      on place.region_id = hit.region_id
      and place.id = hit.candidate_id
    where hit.collection_run_id = p_run_id
      and hit.region_id = v_run.region_id
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
  where map_ingest_runs.id = p_run_id
    and map_ingest_runs.region_id = v_run.region_id;

  v_unique := (
    select count(distinct hit.candidate_id)::integer
    from public.map_place_query_hits as hit
    where hit.collection_run_id = p_run_id
      and hit.region_id = v_run.region_id
  );

  return query
  select p_status, v_published, v_stale, v_completed_rows, v_unique;
end;
$$;

-- Existing public contracts remain Busan-only in Phase 1. Explicit predicates
-- prevent future Jeju rows from appearing before the UI rollout is authorized.
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
    join public.map_places as place
      on place.region_id = hit.region_id
      and place.id = hit.candidate_id
    where hit.region_id = 'busan'
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
      coalesce(
        nullif(btrim(place.road_address), ''),
        nullif(btrim(place.lot_address), '')
      ) as address,
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
    where place.region_id = 'busan'
      and place.provider = 'kakao'
      and place.is_active
      and place.public_visibility
      and place.pending_publication_run_id is null
      and (
        place.lifecycle_status = 'current'
        or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed')
      )
      and (p_candidate_kinds is null or place.candidate_kind = any(p_candidate_kinds))
      and (
        p_normalized_categories is null
        or place.candidate_kind <> 'pet_travel_candidate'
        or place.normalized_category = any(p_normalized_categories)
      )
      and (p_district_codes is null or place.district_code = any(p_district_codes))
      and case
        when p_south is null and p_west is null and p_north is null and p_east is null then true
        when
          p_south between -90 and 90
          and p_north between -90 and 90
          and p_west between -180 and 180
          and p_east between -180 and 180
          and p_south < p_north
          and p_west < p_east
        then extensions.st_intersects(
          place.location,
          extensions.st_makeenvelope(
            p_west,
            p_south,
            p_east,
            p_north,
            4326
          )::extensions.geography
        )
        else false
      end
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
    marked.category_group_code,
    marked.last_seen_at,
    marked.matched_query_count,
    marked.category_query_agreement_count,
    marked.total_count,
    marked.has_more
  from marked
  order by marked.id
  limit least(greatest(coalesce(p_result_limit, 500), 1), 1000);
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
  select
    place.id,
    place.provider_place_id,
    place.name,
    place.candidate_kind,
    place.normalized_category,
    place.district_code,
    place.district_name,
    place.address,
    place.latitude,
    place.longitude,
    place.phone,
    place.place_url,
    place.review_status,
    place.public_label,
    place.source,
    place.total_count,
    place.has_more
  from public.get_public_map_catalog_v2(
    p_south,
    p_west,
    p_north,
    p_east,
    p_candidate_kinds,
    p_normalized_categories,
    p_district_codes,
    p_after_id,
    p_result_limit
  ) as place;
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
  where place.region_id = 'busan'
    and place.provider = 'kakao'
    and place.provider_place_id = btrim(p_provider_place_id)
    and place.is_active
    and place.public_visibility
    and place.pending_publication_run_id is null
    and (
      place.lifecycle_status = 'current'
      or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed')
    )
  limit 1;
$$;

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
  where place.region_id = 'busan'
    and place.provider = 'kakao'
    and place.is_active
    and place.public_visibility
    and place.pending_publication_run_id is null
    and (
      place.lifecycle_status = 'current'
      or (place.lifecycle_status = 'stale' and place.review_status = 'confirmed')
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

alter table public.regions enable row level security;
alter table public.region_districts enable row level security;

create policy "map regions are service-readable"
  on public.regions
  for select
  to service_role
  using (true);

create policy "map region districts are service-readable"
  on public.region_districts
  for select
  to service_role
  using (true);

alter policy "sanitized public map catalog rows are readable"
  on public.map_places
  using (
    region_id = 'busan'
    and provider = 'kakao'
    and is_active
    and public_visibility
    and pending_publication_run_id is null
    and (
      lifecycle_status = 'current'
      or (lifecycle_status = 'stale' and review_status = 'confirmed')
    )
  );

revoke all on table public.regions from public, anon, authenticated, service_role;
revoke all on table public.region_districts from public, anon, authenticated, service_role;
grant select on table public.regions to service_role;
grant select on table public.region_districts to service_role;

comment on table public.regions is
  'Stable text region identities and explicit provider-collection rollout gates.';
comment on table public.region_districts is
  'Administrative district identity keyed by region; district codes are never globally unique.';

comment on column public.map_places.region_id is
  'Required catalog region. Existing rows were validated and backfilled as Busan.';
comment on column public.map_ingest_runs.region_id is
  'Required collection scope used by finalization and stale reconciliation.';
comment on column public.map_ingest_run_queries.region_id is
  'Required checkpoint scope, constrained to the parent run region.';
comment on column public.map_place_query_hits.region_id is
  'Required provenance scope, constrained to both query and place regions.';
