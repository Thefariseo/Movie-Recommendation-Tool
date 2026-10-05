-- A member sees who follows them: the follower's name and photo, so the
-- notification can say who it is and the member can decide to follow back.
-- Before, a follower with a private profile showed as "A friend". Their
-- library and activity stay private (can_read_library is unchanged).
create or replace function public.follows_me(other_id uuid) returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(select 1 from public.follows where follower_id=other_id and followed_id=auth.uid())
$$;
revoke all on function public.follows_me(uuid) from public;
grant execute on function public.follows_me(uuid) to authenticated;

drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select to authenticated
  using (id=auth.uid() or discoverable or public.mutual_friend(id) or public.follows_me(id));
