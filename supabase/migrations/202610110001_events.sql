-- What people do on Umbrify, counted anonymously, to see where they get lost:
-- a random id per browser (never an account, an email or an IP address), the
-- name of what happened and when. Anyone may record events; nobody reads them
-- back through the API. The owner's summary (event_summary) is computed here
-- and only the server may ask for it.
begin;

create table public.events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  visitor text not null check (visitor ~ '^[a-z0-9-]{8,40}$'),
  name text not null check (name ~ '^[a-z0-9_]{2,40}$')
);
create index events_name_at on public.events (name, at);
create index events_visitor_at on public.events (visitor, at);
alter table public.events enable row level security;
create policy events_write on public.events for insert to anon, authenticated with check (true);
revoke all on public.events from anon, authenticated;
grant insert (visitor, name) on public.events to anon, authenticated;
grant all on public.events to service_role;

-- The last `days` days: visitors, how many reached each step (distinct
-- visitors per event), returns one and seven days after a first visit, and
-- visitors per day.
create function public.event_summary(days integer default 30) returns jsonb
language sql stable security definer set search_path = '' as $$
  with recent as (
    select visitor, name, at from public.events where at >= now() - make_interval(days => greatest(1, least(days, 365)))
  ),
  firsts as (
    select visitor, min(at) as first_at from public.events group by visitor
  ),
  cohort as (
    select f.visitor, f.first_at,
      exists(select 1 from public.events e where e.visitor = f.visitor and e.at >= f.first_at + interval '1 day') as back1,
      exists(select 1 from public.events e where e.visitor = f.visitor and e.at >= f.first_at + interval '7 days') as back7
    from firsts f where f.first_at >= now() - make_interval(days => greatest(1, least(days, 365)))
  )
  select jsonb_build_object(
    'days', days,
    'visitors', (select count(distinct visitor) from recent),
    'steps', coalesce((select jsonb_object_agg(name, n) from (select name, count(distinct visitor) as n from recent group by name) s), '{}'::jsonb),
    'returned_1', jsonb_build_object('eligible', (select count(*) from cohort where first_at <= now() - interval '1 day'), 'returned', (select count(*) from cohort where first_at <= now() - interval '1 day' and back1)),
    'returned_7', jsonb_build_object('eligible', (select count(*) from cohort where first_at <= now() - interval '7 days'), 'returned', (select count(*) from cohort where first_at <= now() - interval '7 days' and back7)),
    'daily', coalesce((select jsonb_agg(jsonb_build_object('day', d, 'visitors', n) order by d) from (select date_trunc('day', at)::date as d, count(distinct visitor) as n from recent group by 1) x), '[]'::jsonb)
  )
$$;
revoke all on function public.event_summary(integer) from public, anon, authenticated;
grant execute on function public.event_summary(integer) to service_role;

commit;
