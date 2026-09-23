-- The critic keeps separate conversations, so a member can start a new chat
-- and come back to old ones. What it has learned about the member (notes) and
-- their portrait stay shared across chats in critic_memory. Critic questions
-- are capped at 15 a day per member.
begin;

create table public.critic_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'New chat' check (length(title) <= 100),
  messages jsonb not null default '[]' check (jsonb_typeof(messages) = 'array' and octet_length(messages::text) <= 200000),
  version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index critic_threads_user on public.critic_threads(user_id, updated_at desc);
alter table public.critic_threads enable row level security;
create policy critic_threads_own on public.critic_threads for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.critic_threads from anon, authenticated;
grant select, insert, update, delete on public.critic_threads to authenticated;
grant all on public.critic_threads to service_role;

-- The single conversation each member had so far becomes their first chat.
insert into public.critic_threads(user_id, title, messages, updated_at)
select user_id,
       coalesce(nullif(left(messages->0->>'content', 80), ''), 'Chat with your critic'),
       messages, updated_at
  from public.critic_memory
 where jsonb_array_length(messages) > 0;
update public.critic_memory set messages = '[]';

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
  elsif bucket_name='critic-day' then max_calls:=15; seconds:=86400;
  else return false; end if;
  insert into public.rate_limits values(auth.uid(),bucket_name,now(),1)
  on conflict(user_id,bucket) do update set
    count=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then 1 else public.rate_limits.count+1 end,
    window_start=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then now() else public.rate_limits.window_start end
  returning count into n;
  return n<=max_calls;
end $$;

commit;
