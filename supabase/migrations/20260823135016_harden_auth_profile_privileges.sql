revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

revoke all on table public.pet_profiles from anon, authenticated;
grant select, insert, update on table public.pet_profiles to authenticated;
