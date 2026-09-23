-- Signals about single films that are not ratings, so the recommender and the
-- critic agree: a film the critic warned against or judged "skip", or that the
-- member dismissed with "Not for me", is not recommended again, and a film the
-- critic recommended is favoured. The critic's verdicts are kept so they show
-- again whenever the film is opened.
begin;

create table public.taste_signals (
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check (movie_id > 0),
  source text not null check (source in ('dismissed', 'critic_warned', 'critic_pick', 'verdict')),
  -- -2 never again, -1 probably not, +1 worth a look, +2 made for them.
  signal smallint not null check (signal between -2 and 2 and signal <> 0),
  movie jsonb not null default '{}' check (jsonb_typeof(movie) = 'object' and octet_length(movie::text) <= 2000),
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id, source)
);
create index taste_signals_user on public.taste_signals(user_id, created_at desc);

create table public.critic_verdicts (
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check (movie_id > 0),
  verdict jsonb not null check (jsonb_typeof(verdict) = 'object' and octet_length(verdict::text) <= 6000),
  created_at timestamptz not null default now(),
  primary key (user_id, movie_id)
);

alter table public.taste_signals enable row level security;
alter table public.critic_verdicts enable row level security;
create policy taste_signals_own on public.taste_signals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy critic_verdicts_own on public.critic_verdicts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.taste_signals, public.critic_verdicts from anon, authenticated;
grant select, insert, update, delete on public.taste_signals, public.critic_verdicts to authenticated;
grant all on public.taste_signals, public.critic_verdicts to service_role;

commit;
