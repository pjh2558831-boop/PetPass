create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 24),
  avatar_url text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_display_name_case_insensitive_key
  on public.profiles (lower(display_name));

alter table public.profiles enable row level security;

create policy "profile owners can read their profile"
on public.profiles for select to authenticated
using ((select auth.uid()) = id);

create policy "profile owners can insert their profile"
on public.profiles for insert to authenticated
with check ((select auth.uid()) = id);

create policy "profile owners can update their profile"
on public.profiles for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

-- Community surfaces may read only completed profiles. This table contains no
-- authorization fields; authorization remains based on auth.uid() and RLS.
create policy "authenticated users can read completed community profiles"
on public.profiles for select to authenticated
using (onboarding_completed = true);

create function public.set_profile_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_profile_updated_at();

revoke execute on function public.set_profile_updated_at() from public;

insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', true);

create policy "users can manage their own profile avatar"
on storage.objects for all to authenticated
using (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text))
with check (bucket_id = 'profile-avatars' and (storage.foldername(name))[1] = (select auth.uid()::text));
