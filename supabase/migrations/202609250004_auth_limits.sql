-- Sign-in, sign-up and password recovery reach Supabase from Vercel's servers,
-- so Supabase's own per-IP limits see one address for everyone. Umbrify counts
-- attempts itself, per client IP and per email address, both kept only as
-- SHA-256 hashes. Only the server (service role) can read or count them.
begin;

create table if not exists public.auth_attempts (
  bucket text not null check (bucket ~ '^[a-z-]{1,40}$'),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  window_start timestamptz not null default now(),
  calls integer not null default 0,
  primary key (bucket, key_hash)
);
alter table public.auth_attempts enable row level security;
revoke all on public.auth_attempts from anon, authenticated;
grant all on public.auth_attempts to service_role;

create or replace function public.consume_auth_limit(bucket_name text, hashed text, max_calls integer, seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into public.auth_attempts as a (bucket, key_hash, window_start, calls) values (bucket_name, hashed, now(), 1)
  on conflict (bucket, key_hash) do update set
    calls = case when a.window_start < now() - make_interval(secs => seconds) then 1 else a.calls + 1 end,
    window_start = case when a.window_start < now() - make_interval(secs => seconds) then now() else a.window_start end
  returning calls into n;
  -- Old windows are cleared now and then, so the table stays small.
  if random() < 0.02 then delete from public.auth_attempts where window_start < now() - interval '1 day'; end if;
  return n <= max_calls;
end $$;
revoke all on function public.consume_auth_limit(text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_auth_limit(text, text, integer, integer) to service_role;

commit;
