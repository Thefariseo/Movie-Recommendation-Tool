-- The personal critic keeps one running conversation per member, plus the notes
-- it has learned about their taste ("finds slow films tedious") and the last
-- portrait it wrote, so it remembers across visits. Only the member can read
-- or change it; deleting the account deletes it.
begin;

create table public.critic_memory (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 100000),
  notes jsonb not null default '[]' check (jsonb_typeof(notes) = 'array' and octet_length(notes::text) <= 8000),
  portrait jsonb check (portrait is null or (jsonb_typeof(portrait) = 'object' and octet_length(portrait::text) <= 20000)),
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.critic_memory enable row level security;
create policy critic_own on public.critic_memory for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.critic_memory from anon, authenticated;
grant select, insert, update, delete on public.critic_memory to authenticated;
grant all on public.critic_memory to service_role;

-- Critic calls reach a paid language model, so they get their own, tighter limits.
create or replace function public.consume_limit(bucket_name text, max_calls integer, seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null then return false; end if;
  -- Caller cannot weaken limits through a public RPC.
  if bucket_name='chat-minute' then max_calls:=10; seconds:=60;
  elsif bucket_name='chat-day' then max_calls:=100; seconds:=86400;
  elsif bucket_name='recommend' then max_calls:=30; seconds:=60;
  elsif bucket_name='trakt' then max_calls:=6; seconds:=60;
  elsif bucket_name='critic-minute' then max_calls:=6; seconds:=60;
  elsif bucket_name='critic-day' then max_calls:=60; seconds:=86400;
  else return false; end if;
  insert into public.rate_limits values(auth.uid(),bucket_name,now(),1)
  on conflict(user_id,bucket) do update set
    count=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then 1 else public.rate_limits.count+1 end,
    window_start=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then now() else public.rate_limits.window_start end
  returning count into n;
  return n<=max_calls;
end $$;

commit;
