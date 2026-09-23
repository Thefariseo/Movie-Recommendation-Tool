-- The journeys a member follows, so they are the same on every device. Each
-- is a short list of films on the way to a region of the taste map; only the
-- member can read or change theirs, and deleting the account deletes them.
begin;

create table public.followed_journeys (
  user_id uuid not null references public.profiles(id) on delete cascade,
  id text not null check (id ~ '^[0-9]+-[0-9]+-[0-9]+$'),
  journey jsonb not null check (jsonb_typeof(journey) = 'object' and octet_length(journey::text) <= 8000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

alter table public.followed_journeys enable row level security;
create policy followed_journeys_own on public.followed_journeys for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.followed_journeys from anon, authenticated;
grant select, insert, update, delete on public.followed_journeys to authenticated;
grant all on public.followed_journeys to service_role;

commit;
