-- "Tonight" with friends: a host proposes a handful of films picked for the whole
-- group, everyone votes from their own phone, and the host decides. Decided
-- sessions are the group's history, which is how Umbrify knows who compromised
-- last time and gives their vote a little more weight the next.
begin;

create table public.tonight_sessions (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles(id) on delete cascade,
  members uuid[] not null check (cardinality(members) between 2 and 4),
  films jsonb not null check (jsonb_typeof(films) = 'array' and jsonb_array_length(films) between 1 and 8 and octet_length(films::text) <= 60000),
  weights jsonb not null default '{}' check (jsonb_typeof(weights) = 'object'),
  status text not null default 'open' check (status in ('open', 'decided')),
  winner bigint,
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  check (host = any(members)),
  check ((status = 'decided') = (winner is not null))
);
create index tonight_sessions_members on public.tonight_sessions using gin (members);

create table public.tonight_votes (
  session_id uuid not null references public.tonight_sessions(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check (movie_id > 0),
  vote smallint not null check (vote between -1 and 2),
  updated_at timestamptz not null default now(),
  primary key (session_id, user_id, movie_id)
);

-- Membership checks run as definer so the vote policies do not recurse into
-- the sessions policy.
create function public.in_tonight(session uuid, open_only boolean default false) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.tonight_sessions s where s.id = session and auth.uid() = any(s.members) and (not open_only or s.status = 'open'))
$$;

alter table public.tonight_sessions enable row level security;
alter table public.tonight_votes enable row level security;
create policy tonight_read on public.tonight_sessions for select to authenticated using (auth.uid() = any(members));
-- A host may only invite mutual friends who share their activity, the same
-- rule as group recommendations.
create policy tonight_create on public.tonight_sessions for insert to authenticated with check (
  host = auth.uid() and status = 'open' and winner is null
  and (select bool_and(m = auth.uid() or public.can_read_library(m)) from unnest(members) m)
  and cardinality(members) = (select count(distinct m) from unnest(members) m)
);
create policy tonight_decide on public.tonight_sessions for update to authenticated using (host = auth.uid() and status = 'open') with check (host = auth.uid());
create policy tonight_delete on public.tonight_sessions for delete to authenticated using (host = auth.uid());
create policy votes_read on public.tonight_votes for select to authenticated using (public.in_tonight(session_id));
create policy votes_cast on public.tonight_votes for insert to authenticated with check (user_id = auth.uid() and public.in_tonight(session_id, true));
create policy votes_change on public.tonight_votes for update to authenticated using (user_id = auth.uid() and public.in_tonight(session_id, true)) with check (user_id = auth.uid());
create policy votes_remove on public.tonight_votes for delete to authenticated using (user_id = auth.uid() and public.in_tonight(session_id, true));

revoke all on public.tonight_sessions, public.tonight_votes from anon, authenticated;
grant select, insert, delete on public.tonight_sessions to authenticated;
-- Members, films and the host never change after creation; only the decision does.
grant update (status, winner, weights, decided_at) on public.tonight_sessions to authenticated;
grant select, insert, update, delete on public.tonight_votes to authenticated;
grant all on public.tonight_sessions, public.tonight_votes to service_role;
revoke all on function public.in_tonight(uuid, boolean) from public, anon;
grant execute on function public.in_tonight(uuid, boolean) to authenticated;

commit;
