-- Personal lists of films ("Seventies horror", "For Ozu lovers"), with a link
-- anyone can open, signed in or not. The owner's name is kept on the list,
-- so a visitor never needs to read profiles.
begin;

create table public.film_lists (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.profiles(id) on delete cascade,
  owner_name text not null default '' check (length(owner_name) <= 60),
  title text not null check (length(btrim(title)) between 1 and 100),
  description text not null default '' check (length(description) <= 600),
  films jsonb not null default '[]' check (jsonb_typeof(films) = 'array' and jsonb_array_length(films) <= 200 and octet_length(films::text) <= 120000),
  public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index film_lists_owner on public.film_lists(owner, updated_at desc);

alter table public.film_lists enable row level security;
create policy film_lists_read on public.film_lists for select to anon, authenticated using (public or owner = auth.uid());
create policy film_lists_create on public.film_lists for insert to authenticated with check (owner = auth.uid());
create policy film_lists_change on public.film_lists for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());
create policy film_lists_remove on public.film_lists for delete to authenticated using (owner = auth.uid());

revoke all on public.film_lists from anon, authenticated;
grant select on public.film_lists to anon;
grant select, insert, update, delete on public.film_lists to authenticated;
grant all on public.film_lists to service_role;

commit;
