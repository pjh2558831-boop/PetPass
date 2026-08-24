alter table public.pet_profiles
  add column id uuid;

update public.pet_profiles
set id = gen_random_uuid()
where id is null;

alter table public.pet_profiles
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  add column image_path text,
  drop constraint pet_profiles_pkey,
  add constraint pet_profiles_pkey primary key (id),
  add constraint pet_profiles_image_path_owner_check check (
    image_path is null
    or split_part(image_path, '/', 1) = user_id::text
  );

create index pet_profiles_user_id_idx
  on public.pet_profiles (user_id, created_at);

drop policy "pet profile owners can read their profile" on public.pet_profiles;
drop policy "pet profile owners can insert their profile" on public.pet_profiles;
drop policy "pet profile owners can update their profile" on public.pet_profiles;

create policy "pet profile owners can read their pets"
on public.pet_profiles for select to authenticated
using ((select auth.uid()) = user_id);

create policy "pet profile owners can insert their pets"
on public.pet_profiles for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "pet profile owners can update their pets"
on public.pet_profiles for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "pet profile owners can delete their pets"
on public.pet_profiles for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.pet_profiles from anon, authenticated;
grant select, insert, delete on table public.pet_profiles to authenticated;
grant update (
  name,
  species,
  size,
  has_carrier,
  has_leash,
  has_muzzle,
  accepts_outdoor_only,
  image_path
) on table public.pet_profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pet-images',
  'pet-images',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "users can manage their own pet images"
on storage.objects for all to authenticated
using (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'pet-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

alter table public.profiles
  add column display_name_changed_at timestamptz;

create function public.enforce_profile_display_name_cooldown()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.display_name is distinct from old.display_name then
    if old.display_name_changed_at is not null
      and old.display_name_changed_at + interval '30 days' > now()
    then
      raise exception using
        errcode = 'P0001',
        message = 'display_name_change_cooldown';
    end if;

    new.display_name_changed_at = now();
  end if;

  return new;
end;
$$;

create trigger profiles_enforce_display_name_cooldown
before update of display_name on public.profiles
for each row execute function public.enforce_profile_display_name_cooldown();

revoke execute on function public.enforce_profile_display_name_cooldown() from public;
revoke update on table public.profiles from authenticated;
grant update (display_name, avatar_url, onboarding_completed) on table public.profiles to authenticated;
