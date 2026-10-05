-- A first visit's choices between two films ("this one or that one?") are kept
-- as signals of their own: they place a newcomer in the taste space until they
-- have rated films, and are never shown as ratings.
begin;

alter table public.taste_signals drop constraint if exists taste_signals_source_check;
alter table public.taste_signals add constraint taste_signals_source_check
  check (source in ('dismissed', 'critic_warned', 'critic_pick', 'verdict', 'onboarding'));

commit;
