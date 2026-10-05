-- Cinema seasons: 8 to 12 films, one a week, introduced by the member's
-- critic, followed alone or with up to five friends. The season itself never
-- changes after it starts; each member writes their own note on each week's
-- film, which the others in the season can read.
begin;

create table public.cinema_seasons (
  id uuid primary key default gen_random_uuid(),
  host uuid not null references public.profiles(id) on delete cascade,
  members uuid[] not null check (cardinality(members) between 1 and 6),
  season jsonb not null check (jsonb_typeof(season) = 'object' and octet_length(season::text) <= 30000),
  started_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (host = any(members))
);
create index cinema_seasons_members on public.cinema_seasons using gin (members);

create table public.season_notes (
  season_id uuid not null references public.cinema_seasons(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check (movie_id > 0),
  note text not null check (length(note) between 1 and 600),
  updated_at timestamptz not null default now(),
  primary key (season_id, user_id, movie_id)
);

-- Parameters are named `target`: `season` is also a column of cinema_seasons.
-- Membership checks run as definer so the note policies do not recurse into
-- the seasons policy.
create function public.in_season(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.cinema_seasons s where s.id = target and auth.uid() = any(s.members))
$$;

-- A member who is not the host may leave a season.
create function public.leave_season(target uuid) returns void
language sql volatile security definer set search_path = '' as $$
  update public.cinema_seasons set members = array_remove(members, auth.uid())
  where id = target and auth.uid() = any(members) and host <> auth.uid();
  delete from public.season_notes where season_id = target and user_id = auth.uid();
$$;

alter table public.cinema_seasons enable row level security;
alter table public.season_notes enable row level security;
create policy seasons_read on public.cinema_seasons for select to authenticated using (auth.uid() = any(members));
-- Only mutual friends who share their activity can be invited, as for movie nights.
create policy seasons_create on public.cinema_seasons for insert to authenticated with check (
  host = auth.uid()
  and (select bool_and(m = auth.uid() or public.can_read_library(m)) from unnest(members) m)
  and cardinality(members) = (select count(distinct m) from unnest(members) m)
);
create policy seasons_delete on public.cinema_seasons for delete to authenticated using (host = auth.uid());
create policy season_notes_read on public.season_notes for select to authenticated using (public.in_season(season_id));
create policy season_notes_write on public.season_notes for insert to authenticated with check (user_id = auth.uid() and public.in_season(season_id));
create policy season_notes_change on public.season_notes for update to authenticated using (user_id = auth.uid() and public.in_season(season_id)) with check (user_id = auth.uid());
create policy season_notes_remove on public.season_notes for delete to authenticated using (user_id = auth.uid());

revoke all on public.cinema_seasons, public.season_notes from anon, authenticated;
grant select, insert, delete on public.cinema_seasons to authenticated;
grant select, insert, update, delete on public.season_notes to authenticated;
grant all on public.cinema_seasons, public.season_notes to service_role;
revoke all on function public.in_season(uuid) from public, anon;
grant execute on function public.in_season(uuid) to authenticated;
revoke all on function public.leave_season(uuid) from public, anon;
grant execute on function public.leave_season(uuid) to authenticated;

commit;
