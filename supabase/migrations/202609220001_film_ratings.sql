-- IMDb and Rotten Tomatoes replace TMDB's own average as the reference for film
-- quality. Both come from OMDb, whose free tier allows about 1,000 requests a day
-- shared by every visitor, so each film is looked up once and cached here.
begin;

create table public.film_ratings (
  tmdb_id bigint primary key check (tmdb_id > 0),
  -- A row with no imdb_id records that TMDB knows no IMDb title for the film, so
  -- it is not looked up again until the row goes stale.
  imdb_id text check (imdb_id ~ '^tt[0-9]{5,10}$'),
  imdb_rating numeric(3,1) check (imdb_rating between 1 and 10),
  imdb_votes integer check (imdb_votes >= 0),
  rt_score smallint check (rt_score between 0 and 100),
  fetched_at timestamptz not null default now()
);
alter table public.film_ratings enable row level security;
-- Public reference data about films, never about members: anyone may read it,
-- only the server writes it.
create policy film_ratings_public on public.film_ratings for select to anon, authenticated using (true);

-- One row per UTC day. Claiming is atomic so concurrent requests cannot together
-- exceed the provider's allowance.
create table public.omdb_budget (
  day date primary key,
  used integer not null default 0 check (used >= 0)
);
alter table public.omdb_budget enable row level security;

create function public.claim_omdb_budget(wanted integer, daily_cap integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare spent integer; granted integer;
begin
  if wanted is null or wanted <= 0 or daily_cap is null or daily_cap <= 0 then return 0; end if;
  insert into public.omdb_budget(day) values (current_date) on conflict (day) do nothing;
  select used into spent from public.omdb_budget where day = current_date for update;
  granted := least(wanted, greatest(daily_cap - spent, 0));
  update public.omdb_budget set used = used + granted where day = current_date;
  return granted;
end $$;

revoke all on public.film_ratings, public.omdb_budget from anon, authenticated;
grant select on public.film_ratings to anon, authenticated;
grant all on public.film_ratings, public.omdb_budget to service_role;
revoke all on function public.claim_omdb_budget(integer, integer) from public, anon, authenticated;
grant execute on function public.claim_omdb_budget(integer, integer) to service_role;

commit;
