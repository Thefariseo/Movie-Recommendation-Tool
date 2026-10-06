-- A ceiling on language-model calls for the whole site per day, on top of each
-- member's own limits: many members (or many new accounts) together cannot run
-- up the bill. The server claims one call at a time before asking the model.
begin;

create table public.ai_budget (
  day date primary key,
  used integer not null default 0 check (used >= 0)
);
alter table public.ai_budget enable row level security;

create function public.claim_ai_budget(daily_cap integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare spent integer;
begin
  if daily_cap is null or daily_cap <= 0 then return false; end if;
  insert into public.ai_budget(day) values (current_date) on conflict (day) do nothing;
  update public.ai_budget set used = used + 1 where day = current_date and used < daily_cap returning used into spent;
  return spent is not null;
end $$;

revoke all on public.ai_budget from anon, authenticated;
grant all on public.ai_budget to service_role;
revoke all on function public.claim_ai_budget(integer) from public, anon, authenticated;
grant execute on function public.claim_ai_budget(integer) to service_role;

commit;
