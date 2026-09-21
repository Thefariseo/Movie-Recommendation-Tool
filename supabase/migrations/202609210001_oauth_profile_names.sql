-- Google (and any OAuth provider) never sends `display_name`: Supabase copies the
-- provider's own claims into raw_user_meta_data, so a Google signup arrived with
-- `full_name`/`name` and landed on the generic 'Film lover' default. Derive the
-- name from whichever claim is present, falling back to the email local part.
begin;

create or replace function public.profile_name(metadata jsonb, email text) returns text language sql immutable set search_path = '' as $$
  select coalesce(
    nullif(left(btrim(metadata->>'display_name'), 60), ''),
    nullif(left(btrim(metadata->>'full_name'), 60), ''),
    nullif(left(btrim(metadata->>'name'), 60), ''),
    nullif(left(btrim(metadata->>'given_name'), 60), ''),
    nullif(left(btrim(split_part(coalesce(email, ''), '@', 1)), 60), ''),
    'Film lover'
  )
$$;

create or replace function public.create_profile() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name) values(new.id, public.profile_name(new.raw_user_meta_data, new.email));
  return new;
end $$;

-- Existing rows keep whatever the member chose. Only profiles still sitting on the
-- untouched default are re-derived, and only when a provider claim can improve them.
update public.profiles p
   set display_name = public.profile_name(u.raw_user_meta_data, u.email)
  from auth.users u
 where u.id = p.id
   and p.display_name = 'Film lover'
   and public.profile_name(u.raw_user_meta_data, u.email) <> 'Film lover';

commit;
