begin;
-- Presentation only. Profile visibility remains governed by profiles_read.
alter table public.profiles add column avatar_url text;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create function private.profile_photo(metadata jsonb) returns text
language sql immutable set search_path = '' as $$
  select candidate from unnest(array[metadata->>'avatar_url', metadata->>'picture']) with ordinality as photos(candidate, position)
  where length(candidate) <= 2048
    and candidate ~ '^https://([a-zA-Z0-9-]+\.)*googleusercontent\.com/[^[:space:]\\]*$'
  order by position limit 1;
$$;
-- This trigger runs during the existing profile insert, regardless of auth
-- trigger ordering. It reads only the photo, never exposes auth metadata.
create function private.initial_profile_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select private.profile_photo(u.raw_user_meta_data) into new.avatar_url
    from auth.users u where u.id = new.id;
  return new;
end $$;
create trigger initial_profile_photo before insert on public.profiles
  for each row execute function private.initial_profile_photo();
create function private.sync_profile_photo() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.profiles set avatar_url = private.profile_photo(new.raw_user_meta_data)
    where id = new.id and avatar_url is distinct from private.profile_photo(new.raw_user_meta_data);
  return new;
end $$;
create trigger sync_profile_photo after update of raw_user_meta_data on auth.users
  for each row execute function private.sync_profile_photo();
revoke all on function private.profile_photo(jsonb), private.initial_profile_photo(), private.sync_profile_photo() from public, anon, authenticated;
update public.profiles p set avatar_url = private.profile_photo(u.raw_user_meta_data)
  from auth.users u where u.id = p.id;
commit;
