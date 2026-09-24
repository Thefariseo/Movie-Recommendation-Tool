-- How a movie night was decided: the mode the host chose (the most wanted
-- film, a weighted draw, pure chance or a hidden wild card) and the odds every
-- film had, so everyone can see the draw was fair.
begin;

alter table public.tonight_sessions add column if not exists draw jsonb
  check (draw is null or (jsonb_typeof(draw) = 'object' and octet_length(draw::text) <= 4000));
grant update (draw) on public.tonight_sessions to authenticated;

commit;
