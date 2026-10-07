-- Letterboxd film links (from an export) and the TMDB film each page names,
-- read once and kept for every member's import. Only the server touches it.
begin;

create table public.letterboxd_films (
  link text primary key check (link ~ '^https://(boxd\.it/[A-Za-z0-9]{1,12}|letterboxd\.com/film/[a-z0-9-]{1,200}/)$'),
  tmdb_id bigint check (tmdb_id > 0),
  fetched_at timestamptz not null default now()
);
alter table public.letterboxd_films enable row level security;
revoke all on public.letterboxd_films from anon, authenticated;
grant all on public.letterboxd_films to service_role;

commit;
