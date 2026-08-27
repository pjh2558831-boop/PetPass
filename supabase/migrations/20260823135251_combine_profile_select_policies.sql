drop policy "profile owners can read their profile" on public.profiles;
drop policy "authenticated users can read completed community profiles" on public.profiles;

create policy "authenticated profile visibility"
on public.profiles for select to authenticated
using (
  (select auth.uid()) = id
  or onboarding_completed = true
);

;
