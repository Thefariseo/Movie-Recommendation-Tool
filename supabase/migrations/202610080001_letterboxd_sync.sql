-- Keeping a member's films in step with their Letterboxd diary. Letterboxd has
-- no public API, but every member's diary is a public RSS feed carrying the
-- TMDB id, the rating and the watch date of their latest entries. The server
-- reads it on a visit (at most every few hours), every night, and on request.
begin;

create table public.letterboxd_links (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  username text not null check (username ~ '^[A-Za-z0-9_]{1,40}$'),
  -- Publication time of the newest diary entry already applied: entries are
  -- read once, so a rating changed here later is not overwritten by an old one.
  cursor timestamptz,
  synced_at timestamptz,
  last_added integer not null default 0,
  last_rated integer not null default 0,
  last_error text check (length(last_error) <= 200),
  locked_until timestamptz,
  created_at timestamptz not null default now()
);
create index letterboxd_links_due on public.letterboxd_links(synced_at nulls first);

alter table public.letterboxd_links enable row level security;
create policy letterboxd_links_own on public.letterboxd_links for select to authenticated using (user_id = auth.uid());
revoke all on public.letterboxd_links from anon, authenticated;
grant select on public.letterboxd_links to authenticated;
grant all on public.letterboxd_links to service_role;

-- Applies diary entries for one member. It adds films and updates ratings and
-- never removes anything. A film the member removed here comes back only when
-- they log it on Letterboxd after removing it.
create function public.apply_letterboxd(actor uuid, entries jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e jsonb; existing public.user_movies; mid bigint; r smallint; seen timestamptz; added integer := 0; rated integer := 0;
begin
  if actor is null or jsonb_typeof(entries) <> 'array' or jsonb_array_length(entries) > 200 then raise exception 'Invalid batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  for e in select value from jsonb_array_elements(entries) loop
    mid := (e->>'movie_id')::bigint;
    r := (e->>'rating')::smallint;
    seen := coalesce((e->>'watched_at')::timestamptz, now());
    if mid is null or mid <= 0 or (r is not null and r not between 1 and 10)
       or jsonb_typeof(e->'movie') is distinct from 'object'
       or length(coalesce(e->'movie'->>'title','')) not between 1 and 300 then
      raise exception 'Invalid entry';
    end if;
    select * into existing from public.user_movies where user_id=actor and movie_id=mid and kind='watched';
    if existing.user_id is null then
      insert into public.user_movies(user_id,movie_id,kind,movie,rating,version) values(actor,mid,'watched',e->'movie',r,1);
      added := added + 1;
    elsif existing.deleted then
      if seen > existing.updated_at then
        update public.user_movies set movie=e->'movie',rating=r,deleted=false,version=version+1,updated_at=clock_timestamp()
          where user_id=actor and movie_id=mid and kind='watched';
        added := added + 1;
      end if;
    elsif r is not null and r is distinct from existing.rating then
      update public.user_movies set rating=r,version=version+1,updated_at=clock_timestamp()
        where user_id=actor and movie_id=mid and kind='watched';
      rated := rated + 1;
    end if;
  end loop;
  return jsonb_build_object('added',added,'rated',rated);
end $$;

-- One sync per member at a time, across visits, the button and the night run.
create function public.lock_letterboxd(actor uuid) returns boolean language sql security definer set search_path='' as $$
  with claimed as (update public.letterboxd_links set locked_until=now()+interval '90 seconds'
    where user_id=actor and (locked_until is null or locked_until<now()) returning user_id)
  select exists(select 1 from claimed)
$$;

revoke all on function public.apply_letterboxd(uuid,jsonb), public.lock_letterboxd(uuid) from public, anon, authenticated;
grant execute on function public.apply_letterboxd(uuid,jsonb), public.lock_letterboxd(uuid) to service_role;

-- Linking and "Sync now" read Letterboxd for the caller: a few times every ten minutes.
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
  elsif bucket_name='letterboxd' then max_calls:=6; seconds:=600;
  else return false; end if;
  insert into public.rate_limits values(auth.uid(),bucket_name,now(),1)
  on conflict(user_id,bucket) do update set
    count=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then 1 else public.rate_limits.count+1 end,
    window_start=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then now() else public.rate_limits.window_start end
  returning count into n;
  return n<=max_calls;
end $$;

commit;
