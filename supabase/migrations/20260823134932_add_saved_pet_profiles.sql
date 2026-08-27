create table public.pet_profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  name text not null check (
    char_length(name) between 1 and 30
    and name = btrim(name)
  ),
  species text not null check (species in ('DOG', 'CAT', 'OTHER')),
  size text not null check (size in ('SMALL', 'MEDIUM', 'LARGE')),
  has_carrier boolean not null default false,
  has_leash boolean not null default false,
  has_muzzle boolean not null default false,
  accepts_outdoor_only boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pet_profiles enable row level security;

create policy "pet profile owners can read their profile"
on public.pet_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "pet profile owners can insert their profile"
on public.pet_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "pet profile owners can update their profile"
on public.pet_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create trigger pet_profiles_set_updated_at
before update on public.pet_profiles
for each row execute function public.set_profile_updated_at();

-- Data API exposure is explicit. RLS still owns row-level authorization.
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update on table public.pet_profiles to authenticated;
revoke all on table public.pet_profiles from anon;

;
