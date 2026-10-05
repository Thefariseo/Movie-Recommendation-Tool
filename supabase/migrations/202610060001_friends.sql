-- Friends, closer: a film recommended to a friend with a note, reactions to
-- what friends watched, and following back anyone who follows you.
begin;

-- Following back works even when the follower is not discoverable: they
-- already chose to follow you.
create or replace function public.can_follow(other_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and (
    exists(select 1 from public.profiles where id=other_id and discoverable)
    or exists(select 1 from public.follows where follower_id=other_id and followed_id=auth.uid())
  )
$$;

-- "You should see this": a film sent to a mutual friend, with an optional note.
create table public.film_recommendations (
  id uuid primary key default gen_random_uuid(),
  sender uuid not null references public.profiles(id) on delete cascade,
  recipient uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check (movie_id > 0),
  movie jsonb not null check (jsonb_typeof(movie) = 'object' and octet_length(movie::text) <= 4000),
  note text check (note is null or length(note) <= 280),
  created_at timestamptz not null default now(),
  seen_at timestamptz,
  unique (sender, recipient, movie_id),
  check (sender <> recipient)
);
create index film_recommendations_recipient on public.film_recommendations(recipient, created_at desc);

-- A reaction to a film a friend watched: one emoji per person and film.
create table public.activity_reactions (
  owner uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check (movie_id > 0),
  reactor uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('heart', 'fire', 'wow', 'laugh', 'sad', 'agree')),
  created_at timestamptz not null default now(),
  primary key (owner, movie_id, reactor),
  check (owner <> reactor)
);
create index activity_reactions_owner on public.activity_reactions(owner, created_at desc);

alter table public.film_recommendations enable row level security;
alter table public.activity_reactions enable row level security;
create policy recs_read on public.film_recommendations for select to authenticated using (sender = auth.uid() or recipient = auth.uid());
create policy recs_send on public.film_recommendations for insert to authenticated with check (sender = auth.uid() and public.mutual_friend(recipient) and seen_at is null);
create policy recs_seen on public.film_recommendations for update to authenticated using (recipient = auth.uid()) with check (recipient = auth.uid());
create policy recs_delete on public.film_recommendations for delete to authenticated using (sender = auth.uid() or recipient = auth.uid());
-- Reactions are seen by whoever can see the film they are about.
create policy reactions_read on public.activity_reactions for select to authenticated using (reactor = auth.uid() or public.can_read_library(owner));
create policy reactions_add on public.activity_reactions for insert to authenticated with check (reactor = auth.uid() and owner <> auth.uid() and public.can_read_library(owner));
create policy reactions_change on public.activity_reactions for update to authenticated using (reactor = auth.uid()) with check (reactor = auth.uid() and public.can_read_library(owner));
create policy reactions_remove on public.activity_reactions for delete to authenticated using (reactor = auth.uid());

revoke all on public.film_recommendations, public.activity_reactions from anon, authenticated;
grant select, insert, delete on public.film_recommendations to authenticated;
grant update (seen_at) on public.film_recommendations to authenticated;
grant select, insert, update, delete on public.activity_reactions to authenticated;
grant all on public.film_recommendations, public.activity_reactions to service_role;

commit;
