create table public.saved_itineraries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 150),
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);

create index saved_itineraries_user_created_idx
  on public.saved_itineraries (user_id, created_at desc);

alter table public.saved_itineraries enable row level security;

create policy "owners can read saved itineraries"
on public.saved_itineraries for select to authenticated
using ((select auth.uid()) = user_id);

create policy "owners can insert saved itineraries"
on public.saved_itineraries for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "owners can delete saved itineraries"
on public.saved_itineraries for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.saved_itineraries from anon, authenticated;
grant select, insert, delete on table public.saved_itineraries to authenticated;

create function public.enforce_saved_itineraries_limit()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));
  if (select count(*) from public.saved_itineraries where user_id = new.user_id) >= 5 then
    raise exception using errcode = 'P0001', message = 'saved_itineraries_limit';
  end if;
  return new;
end;
$$;

create trigger saved_itineraries_limit
before insert on public.saved_itineraries
for each row execute function public.enforce_saved_itineraries_limit();

revoke execute on function public.enforce_saved_itineraries_limit() from public, anon, authenticated, service_role;
