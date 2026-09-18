begin;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Film lover' check (length(display_name) between 1 and 60),
  country text not null default 'IT' check (country ~ '^[A-Z]{2}$'),
  discoverable boolean not null default false,
  share_activity boolean not null default false,
  collaborative boolean not null default false,
  created_at timestamptz not null default now()
);
create function public.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values(new.id, coalesce(nullif(left(new.raw_user_meta_data->>'display_name',60),''),'Film lover'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile();
insert into public.profiles(id) select id from auth.users on conflict do nothing;

create table public.user_movies (
  user_id uuid not null references public.profiles(id) on delete cascade,
  movie_id bigint not null check(movie_id > 0),
  kind text not null check(kind in ('watched','watchlist')),
  movie jsonb not null check(jsonb_typeof(movie) = 'object' and octet_length(movie::text) <= 12000),
  rating smallint check(rating between 1 and 10),
  deleted boolean not null default false,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  primary key(user_id,movie_id,kind)
);
create index user_movies_neighbors on public.user_movies(movie_id,user_id) where kind='watched' and not deleted and rating is not null;
create index user_movies_activity on public.user_movies(user_id,updated_at desc);
create table public.follows (
  follower_id uuid not null references public.profiles(id) on delete cascade,
  followed_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(follower_id,followed_id), check(follower_id <> followed_id)
);
create index follows_reverse on public.follows(followed_id,follower_id);

create function public.mutual_friend(other_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.follows where follower_id=auth.uid() and followed_id=other_id)
    and exists(select 1 from public.follows where follower_id=other_id and followed_id=auth.uid())
$$;
create function public.can_follow(other_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.profiles where id=other_id and discoverable)
$$;
create function public.can_read_library(other_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select other_id=auth.uid() or (public.mutual_friend(other_id) and exists(select 1 from public.profiles where id=other_id and share_activity))
$$;

-- Per-film compare-and-swap prevents one device replacing another device's catalogue.
-- Tombstones are retained so an old import cannot resurrect a deleted entry.
create function public.apply_library(changes jsonb, importing boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c jsonb; existing public.user_movies; result jsonb := '[]'; actor uuid := auth.uid(); mid bigint; k text;
begin
  if actor is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes)>500 then raise exception 'Invalid batch'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor::text,0));
  for c in select value from jsonb_array_elements(changes) loop
    mid := (c->>'movie_id')::bigint; k := c->>'kind';
    if mid is null or mid<=0 or k is null or k not in ('watched','watchlist') or c->>'op' is null or c->>'op' not in ('put','remove','rate') then raise exception 'Invalid change'; end if;
    select * into existing from public.user_movies where user_id=actor and movie_id=mid and kind=k;
    if importing and existing.user_id is not null then continue; end if;
    if not importing and coalesce(existing.version,0) <> coalesce((c->>'version')::integer,-1) then
      raise exception 'Library changed on another device. Refresh and try again.' using errcode='40001';
    end if;
    if c->>'op'='put' then
      if jsonb_typeof(c->'movie') is distinct from 'object' or length(coalesce(c->'movie'->>'title','')) not between 1 and 300 then raise exception 'Movie title required'; end if;
      insert into public.user_movies(user_id,movie_id,kind,movie,rating,version)
      values(actor,mid,k,c->'movie',case when k='watched' then (c->>'rating')::smallint else null end,coalesce(existing.version,0)+1)
      on conflict(user_id,movie_id,kind) do update set movie=excluded.movie,rating=excluded.rating,deleted=false,version=excluded.version,updated_at=clock_timestamp();
    elsif existing.user_id is not null then
      update public.user_movies set deleted=case when c->>'op'='remove' then true else deleted end,
        rating=case when c->>'op'='rate' and k='watched' then (c->>'rating')::smallint else rating end,
        version=version+1,updated_at=clock_timestamp() where user_id=actor and movie_id=mid and kind=k;
    end if;
    select * into existing from public.user_movies where user_id=actor and movie_id=mid and kind=k;
    if existing.user_id is not null then result:=result||jsonb_build_array(to_jsonb(existing)); end if;
  end loop;
  return result;
end $$;

create table public.shared_lists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check(length(title) between 1 and 100),
  created_at timestamptz not null default now()
);
create table public.list_members (
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key(list_id,user_id)
);
create index list_members_user on public.list_members(user_id,list_id);
create table public.list_movies (
  list_id uuid not null references public.shared_lists(id) on delete cascade,
  movie_id bigint not null check(movie_id>0),
  movie jsonb not null check(jsonb_typeof(movie)='object' and octet_length(movie::text)<=12000),
  added_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(list_id,movie_id)
);
create function public.in_list(target uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.list_members where list_id=target and user_id=auth.uid())
$$;
create function public.create_shared_list(list_title text, members uuid[]) returns uuid language plpgsql security definer set search_path='' as $$
declare lid uuid; member uuid;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if cardinality(members)>10 then raise exception 'Maximum ten friends per list'; end if;
  insert into public.shared_lists(owner_id,title) values(auth.uid(),list_title) returning id into lid;
  insert into public.list_members values(lid,auth.uid());
  foreach member in array members loop
    if member <> auth.uid() then
      if not public.mutual_friend(member) then raise exception 'Lists can be shared with mutual followers only' using errcode='42501'; end if;
      insert into public.list_members values(lid,member) on conflict do nothing;
    end if;
  end loop;
  return lid;
end $$;

create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null default 'Movie night' check(length(title)<=100),
  messages jsonb not null default '[]' check(jsonb_typeof(messages)='array' and octet_length(messages::text)<=100000),
  constraints jsonb not null default '{}',
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
create index chat_sessions_user on public.chat_sessions(user_id,updated_at desc);
create table public.rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  bucket text not null,
  window_start timestamptz not null,
  count integer not null default 1,
  primary key(user_id,bucket)
);
create function public.consume_limit(bucket_name text, max_calls integer, seconds integer) returns boolean
language plpgsql security definer set search_path='' as $$
declare n integer;
begin
  if auth.uid() is null then return false; end if;
  -- Caller cannot weaken limits through a public RPC.
  if bucket_name='chat-minute' then max_calls:=10; seconds:=60;
  elsif bucket_name='chat-day' then max_calls:=100; seconds:=86400;
  elsif bucket_name='recommend' then max_calls:=30; seconds:=60;
  elsif bucket_name='trakt' then max_calls:=6; seconds:=60;
  else return false; end if;
  insert into public.rate_limits values(auth.uid(),bucket_name,now(),1)
  on conflict(user_id,bucket) do update set
    count=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then 1 else public.rate_limits.count+1 end,
    window_start=case when public.rate_limits.window_start < now()-make_interval(secs=>seconds) then now() else public.rate_limits.window_start end
  returning count into n;
  return n<=max_calls;
end $$;

-- No OAuth credentials or model factors are available to browser roles.
create table public.integration_tokens (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  encrypted_token text not null,
  updated_at timestamptz not null default now()
);
create table public.oauth_states (
  digest text primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null
);
create table public.learning_state (id integer primary key check(id=1), consent_epoch bigint not null default 0);
insert into public.learning_state values(1,0);
create table public.recommendation_models (
  id uuid primary key default gen_random_uuid(),
  consent_epoch bigint not null,
  artifact jsonb not null,
  metrics jsonb not null,
  created_at timestamptz not null default now()
);
create function public.invalidate_learning() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if TG_OP='DELETE' or (old.collaborative and not new.collaborative) then
    update public.learning_state set consent_epoch=consent_epoch+1 where id=1;
    delete from public.recommendation_models;
  end if;
  return coalesce(new,old);
end $$;
create trigger consent_changed after update of collaborative or delete on public.profiles for each row execute function public.invalidate_learning();

-- Pearson neighbours with overlap shrinkage. No peer identity or raw rating is returned.
create function public.collaborative_candidates() returns table(movie_id bigint,score double precision,support bigint)
language sql stable security definer set search_path='' set statement_timeout='5s' as $$
  with mine as (
    select movie_id,rating from public.user_movies where user_id=auth.uid() and kind='watched' and not deleted and rating is not null
  ), peers as (
    select m.user_id, corr(m.rating::double precision,t.rating::double precision)*count(*)/(count(*)+10.0) similarity
    from public.user_movies m join mine t using(movie_id) join public.profiles p on p.id=m.user_id and p.collaborative
    where m.user_id<>auth.uid() and m.kind='watched' and not m.deleted and m.rating is not null
    group by m.user_id having count(*)>=3 and corr(m.rating::double precision,t.rating::double precision)>0
    order by similarity desc limit 80
  ), averages as (
    select m.user_id,avg(m.rating) average from public.user_movies m join peers p on p.user_id=m.user_id
    where kind='watched' and not deleted and rating is not null group by m.user_id
  )
  select m.movie_id,
    greatest(1.0,least(10.0,(select avg(rating) from mine)+sum(p.similarity*(m.rating-a.average))/nullif(sum(abs(p.similarity)),0)))::double precision,
    count(*)
  from public.user_movies m join peers p on p.user_id=m.user_id join averages a on a.user_id=m.user_id
  where auth.uid() is not null and m.kind='watched' and not m.deleted and m.rating is not null
    and not exists(select 1 from public.user_movies seen where seen.user_id=auth.uid() and seen.movie_id=m.movie_id and seen.kind='watched' and not seen.deleted)
  group by m.movie_id having count(*)>=2 order by 2 desc,3 desc,m.movie_id limit 100
$$;
create function public.training_ratings(page_offset integer default 0) returns table(user_id uuid,movie_id bigint,rating smallint)
language sql stable security definer set search_path='' as $$
  select m.user_id,m.movie_id,m.rating from public.user_movies m join public.profiles p on p.id=m.user_id and p.collaborative
  where m.kind='watched' and not m.deleted and m.rating is not null order by m.user_id,m.movie_id limit 1000 offset greatest(0,page_offset)
$$;

alter table public.profiles enable row level security;
alter table public.user_movies enable row level security;
alter table public.follows enable row level security;
alter table public.shared_lists enable row level security;
alter table public.list_members enable row level security;
alter table public.list_movies enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.rate_limits enable row level security;
alter table public.integration_tokens enable row level security;
alter table public.oauth_states enable row level security;
alter table public.learning_state enable row level security;
alter table public.recommendation_models enable row level security;

create policy profiles_read on public.profiles for select to authenticated using(id=auth.uid() or discoverable or public.mutual_friend(id));
create policy profiles_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy movies_read on public.user_movies for select to authenticated using(public.can_read_library(user_id));
create policy follows_read on public.follows for select to authenticated using(follower_id=auth.uid() or followed_id=auth.uid());
create policy follows_insert on public.follows for insert to authenticated with check(follower_id=auth.uid() and public.can_follow(followed_id));
create policy follows_delete on public.follows for delete to authenticated using(follower_id=auth.uid());
create policy lists_read on public.shared_lists for select to authenticated using(public.in_list(id));
create policy lists_delete on public.shared_lists for delete to authenticated using(owner_id=auth.uid());
create policy members_read on public.list_members for select to authenticated using(public.in_list(list_id));
create policy members_leave on public.list_members for delete to authenticated using(user_id=auth.uid() and not exists(select 1 from public.shared_lists where id=list_id and owner_id=auth.uid()));
create policy list_movies_read on public.list_movies for select to authenticated using(public.in_list(list_id));
create policy list_movies_insert on public.list_movies for insert to authenticated with check(public.in_list(list_id) and added_by=auth.uid());
create policy list_movies_delete on public.list_movies for delete to authenticated using(public.in_list(list_id));
create policy chats_own on public.chat_sessions for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());

revoke all on public.profiles,public.user_movies,public.follows,public.shared_lists,public.list_members,public.list_movies,public.chat_sessions,public.rate_limits,public.integration_tokens,public.oauth_states,public.learning_state,public.recommendation_models from anon,authenticated;
grant select on public.profiles,public.user_movies,public.follows,public.shared_lists,public.list_members,public.list_movies,public.chat_sessions to authenticated;
grant update(display_name,country,discoverable,share_activity,collaborative) on public.profiles to authenticated;
grant insert,delete on public.follows,public.list_movies to authenticated;
grant delete on public.shared_lists,public.list_members to authenticated;
grant insert,update,delete on public.chat_sessions to authenticated;
grant all on public.profiles,public.user_movies,public.follows,public.shared_lists,public.list_members,public.list_movies,public.chat_sessions,public.rate_limits,public.integration_tokens,public.oauth_states,public.learning_state,public.recommendation_models to service_role;

revoke all on function public.create_profile(),public.mutual_friend(uuid),public.can_follow(uuid),public.can_read_library(uuid),public.apply_library(jsonb,boolean),public.in_list(uuid),public.create_shared_list(text,uuid[]),public.consume_limit(text,integer,integer),public.invalidate_learning(),public.collaborative_candidates(),public.training_ratings(integer) from public,anon,authenticated;
grant execute on function public.mutual_friend(uuid),public.can_follow(uuid),public.can_read_library(uuid),public.apply_library(jsonb,boolean),public.in_list(uuid),public.create_shared_list(text,uuid[]),public.consume_limit(text,integer,integer),public.collaborative_candidates() to authenticated;
grant execute on function public.training_ratings(integer) to service_role;

-- Atomic publication also closes the consent-revocation race during training.
create function public.publish_model(expected_epoch bigint, model jsonb, report jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare current_epoch bigint; mid uuid;
begin
  select consent_epoch into current_epoch from public.learning_state where id=1 for update;
  if current_epoch<>expected_epoch then raise exception 'Consent changed; retrain before publishing'; end if;
  if coalesce((report->>'validation_count')::integer,0)<20 or coalesce((report->>'rmse')::double precision >= (report->>'baseline_rmse')::double precision,true) then raise exception 'Model did not pass validation'; end if;
  delete from public.recommendation_models;
  insert into public.recommendation_models(consent_epoch,artifact,metrics) values(expected_epoch,model,report) returning id into mid;
  return mid;
end $$;
create function public.current_model() returns jsonb language sql stable security definer set search_path='' as $$
  select m.artifact from public.recommendation_models m join public.learning_state s on s.id=1 and s.consent_epoch=m.consent_epoch order by m.created_at desc limit 1
$$;
revoke all on function public.publish_model(bigint,jsonb,jsonb),public.current_model() from public,anon,authenticated;
grant execute on function public.publish_model(bigint,jsonb,jsonb),public.current_model() to service_role;

alter table public.integration_tokens add column locked_until timestamptz;
create function public.lock_integration(actor uuid) returns boolean language sql security definer set search_path='' as $$
  with claimed as (update public.integration_tokens set locked_until=now()+interval '90 seconds' where user_id=actor and (locked_until is null or locked_until<now()) returning user_id) select exists(select 1 from claimed)
$$;
revoke all on function public.lock_integration(uuid) from public,anon,authenticated;
grant execute on function public.lock_integration(uuid) to service_role;

-- Removing a contributed rating invalidates artifacts containing that data.
create function public.invalidate_removed_rating() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if old.kind='watched' and old.rating is not null and not old.deleted
     and (TG_OP='DELETE' or new.deleted or new.rating is null) then
    update public.learning_state set consent_epoch=consent_epoch+1 where id=1;
    delete from public.recommendation_models;
  end if;
  return coalesce(new,old);
end $$;
create trigger rating_removed after update or delete on public.user_movies for each row execute function public.invalidate_removed_rating();
revoke all on function public.invalidate_removed_rating() from public,anon,authenticated;
commit;
