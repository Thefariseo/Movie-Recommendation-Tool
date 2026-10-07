-- What people think of Umbrify, from the "Feedback" button on every page:
-- a message, the page it was written on, and, if they want a reply, how to
-- reach them. Guests can send it too. Nobody can read it back through the
-- API; the owner reads it in the Supabase dashboard.
begin;

create table public.feedback (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid references public.profiles(id) on delete set null,
  message text not null check (char_length(message) between 3 and 2000),
  page text check (char_length(page) <= 200),
  contact text check (char_length(contact) <= 200),
  lang text check (char_length(lang) <= 8)
);
alter table public.feedback enable row level security;
-- Anyone may write, as themselves or anonymously; nobody may read.
create policy feedback_write on public.feedback for insert to anon, authenticated
  with check (user_id is null or user_id = auth.uid());

revoke all on public.feedback from anon, authenticated;
grant insert (user_id, message, page, contact, lang) on public.feedback to anon, authenticated;
grant all on public.feedback to service_role;

commit;
