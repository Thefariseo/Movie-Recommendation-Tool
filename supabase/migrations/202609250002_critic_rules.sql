-- What the critic has learned about a member, in a form the recommender can
-- use: taste rules ("loves Kurosawa", "avoids gore", "prefers films under two
-- hours"), each resolved to a TMDB id. They live with the critic's notes, so
-- "Forget" and deleting the account remove them too.
begin;

alter table public.critic_memory add column if not exists rules jsonb not null default '[]'
  check (jsonb_typeof(rules) = 'array' and octet_length(rules::text) <= 12000);

commit;
