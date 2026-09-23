\set ON_ERROR_STOP on
begin;
create function public.test_assert(ok boolean,message text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',message;end if;end$$;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222'),('33333333-3333-4333-8333-333333333333'),('44444444-4444-4444-8444-444444444444');
select public.test_assert((select count(*)=4 from public.profiles),'signup profile trigger');

-- Google sends the provider's own claims, never `display_name`. Each signup shape
-- must still reach the members' real name rather than the generic default.
insert into auth.users(id,email,raw_user_meta_data) values
  ('55555555-5555-4555-8555-555555555555','ada@example.com','{"display_name":"Ada"}'),
  ('66666666-6666-4666-8666-666666666666','grace@example.com','{"full_name":"Grace Hopper","name":"Grace","picture":"https://example.com/g.jpg"}'),
  ('77777777-7777-4777-8777-777777777777','alan@example.com','{"name":"Alan Turing"}'),
  ('88888888-8888-4888-8888-888888888888','edsger@example.com','{"given_name":"Edsger"}'),
  ('99999999-9999-4999-8999-999999999999','katherine@example.com','{}'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',null,'{"full_name":"   "}');
select public.test_assert((select display_name='Ada' from public.profiles where id='55555555-5555-4555-8555-555555555555'),'explicit display_name wins');
select public.test_assert((select display_name='Grace Hopper' from public.profiles where id='66666666-6666-4666-8666-666666666666'),'google full_name preferred over name');
select public.test_assert((select display_name='Alan Turing' from public.profiles where id='77777777-7777-4777-8777-777777777777'),'google name used when full_name absent');
select public.test_assert((select display_name='Edsger' from public.profiles where id='88888888-8888-4888-8888-888888888888'),'google given_name used as last claim');
select public.test_assert((select display_name='katherine' from public.profiles where id='99999999-9999-4999-8999-999999999999'),'email local part used without claims');
select public.test_assert((select display_name='Film lover' from public.profiles where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'blank claims fall back to the default');
select public.test_assert((select bool_and(length(display_name) between 1 and 60) from public.profiles),'derived names respect the length limit');
delete from auth.users where id >= '55555555-5555-4555-8555-555555555555';
select public.test_assert((select count(*)=4 from public.profiles),'profile fixtures restored');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.test_assert((select count(*)=1 from public.profiles),'private profiles are hidden');
select public.apply_library('[{"op":"put","movie_id":1,"kind":"watched","version":0,"rating":9,"movie":{"id":1,"title":"Film One"}}]');
select public.test_assert((select count(*)=1 from public.user_movies),'owner can read saved film');
-- A stale device cannot overwrite an existing rating. The batch rolls back.
do $$begin
 begin perform public.apply_library('[{"op":"rate","movie_id":1,"kind":"watched","version":0,"rating":1}]');raise exception 'Missing conflict';exception when serialization_failure then null;end;
end$$;
select public.test_assert((select rating=9 from public.user_movies where movie_id=1),'conflict preserves current rating');
select public.apply_library('[{"op":"remove","movie_id":1,"kind":"watched","version":1}]');
select public.apply_library('[{"op":"put","movie_id":1,"kind":"watched","version":0,"rating":1,"movie":{"title":"Old import"}}]',true);
select public.test_assert((select deleted and version=2 from public.user_movies where movie_id=1),'reimport cannot resurrect tombstone');
select public.apply_library('[{"op":"put","movie_id":2,"kind":"watched","version":0,"rating":2,"movie":{"title":"Film Two"}},{"op":"put","movie_id":3,"kind":"watched","version":0,"rating":5,"movie":{"title":"Film Three"}},{"op":"put","movie_id":4,"kind":"watched","version":0,"rating":8,"movie":{"title":"Film Four"}}]');
-- Direct writes are forbidden; all catalogue mutations use the versioned RPC.
do $$begin
 begin update public.user_movies set rating=1;raise exception 'Unexpected direct write';exception when insufficient_privilege then null;end;
 begin perform public.training_ratings(0);raise exception 'Dataset leaked';exception when insufficient_privilege then null;end;
 begin perform public.current_model();raise exception 'Model leaked';exception when insufficient_privilege then null;end;
 begin select encrypted_token from public.integration_tokens;raise exception 'Token leaked';exception when insufficient_privilege then null;end;
end$$;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.test_assert((select count(*)=0 from public.user_movies),'other account cannot read private catalogue');
update public.profiles set discoverable=true,share_activity=true where id=auth.uid();
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.profiles set discoverable=true,share_activity=true where id=auth.uid();
insert into public.follows values(auth.uid(),'22222222-2222-4222-8222-222222222222');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.test_assert((select count(*)=0 from public.user_movies),'one-way follow does not expose catalogue');
insert into public.follows values(auth.uid(),'11111111-1111-4111-8111-111111111111');
select public.test_assert((select count(*)=4 from public.user_movies),'mutual friends can read opted-in catalogue');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.create_shared_list('Friday films',array['22222222-2222-4222-8222-222222222222'::uuid]) as list_id \gset
insert into public.list_movies(list_id,movie_id,movie,added_by) values(:'list_id',55,'{"id":55,"title":"A shared film"}',auth.uid());
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.test_assert((select count(*)=1 from public.shared_lists),'member sees shared list');
insert into public.list_movies(list_id,movie_id,movie,added_by) values(:'list_id',56,'{"id":56,"title":"Another film"}',auth.uid());
select public.test_assert((select count(*)=2 from public.list_movies),'member can contribute');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select public.test_assert((select count(*)=0 from public.shared_lists),'stranger cannot read shared list');
select public.test_assert((select count(*)=0 from public.list_movies),'stranger cannot read list entries');
do $$begin
 begin perform public.create_shared_list('Bad',array['11111111-1111-4111-8111-111111111111'::uuid]);raise exception 'Non-friend added';exception when insufficient_privilege then null;end;
end$$;
insert into public.chat_sessions(user_id,title) values(auth.uid(),'Private conversation');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.test_assert((select count(*)=0 from public.chat_sessions),'other account cannot read chats');
-- Real collaborative rankings from consenting peers, without peer identity.
reset role;
update public.profiles set collaborative=true where id<>'11111111-1111-4111-8111-111111111111';
insert into public.user_movies(user_id,movie_id,kind,movie,rating)
select p.id,r.movie_id,'watched',jsonb_build_object('title','Rated film'),r.rating from public.profiles p cross join (values(2,2),(3,5),(4,8),(99,10))r(movie_id,rating) where p.collaborative;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select public.test_assert((select count(*)=1 from public.collaborative_candidates() where movie_id=99 and support=3),'collaborative unseen pick from three similar users');
reset role;
insert into public.recommendation_models(consent_epoch,artifact,metrics) select consent_epoch,'{}','{}' from public.learning_state;
set local role authenticated;
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
update public.profiles set collaborative=false where id=auth.uid();
reset role;
select public.test_assert((select count(*)=0 from public.recommendation_models),'consent revocation removes learned artifacts');
select public.test_assert((select count(*)=8 from public.training_ratings(0)),'training only includes two consenting peers');
set local role anon;
select set_config('request.jwt.claim.sub','',true);
do $$begin
 begin perform public.apply_library('[]');raise exception 'Anonymous write allowed';exception when insufficient_privilege then null;end;
 begin select count(*) from public.profiles;raise exception 'Anonymous read allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Film ratings are public reference data: readable by anyone, writable only by the server.
insert into public.film_ratings(tmdb_id,imdb_id,imdb_rating,imdb_votes,rt_score) values(27205,'tt1375666',8.8,2600000,87),(999001,null,null,null,null);
set local role anon;
select public.test_assert((select count(*)=2 from public.film_ratings),'anyone can read cached film ratings');
do $$begin
 begin insert into public.film_ratings(tmdb_id) values(5);raise exception 'Anonymous rating write allowed';exception when insufficient_privilege then null;end;
 begin perform public.claim_omdb_budget(1,10);raise exception 'Anonymous budget claim allowed';exception when insufficient_privilege then null;end;
 begin select count(*) from public.omdb_budget;raise exception 'Anonymous budget read allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$begin
 begin update public.film_ratings set imdb_rating=1 where tmdb_id=27205;raise exception 'Member rating write allowed';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- The daily allowance is never exceeded, however the claims are split.
select public.test_assert(public.claim_omdb_budget(6,10)=6,'budget grants a claim within the cap');
select public.test_assert(public.claim_omdb_budget(6,10)=4,'budget grants only what is left');
select public.test_assert(public.claim_omdb_budget(3,10)=0,'budget grants nothing once spent');
select public.test_assert(public.claim_omdb_budget(0,10)=0 and public.claim_omdb_budget(-2,10)=0,'budget ignores non-positive claims');
select public.test_assert((select used=10 from public.omdb_budget where day=current_date),'budget records exactly the cap');
do $$begin
 begin insert into public.film_ratings(tmdb_id,imdb_id) values(7,'not-an-id');raise exception 'Malformed IMDb id accepted';exception when check_violation then null;end;
 begin insert into public.film_ratings(tmdb_id,rt_score) values(8,101);raise exception 'Out-of-range RT score accepted';exception when check_violation then null;end;
end$$;
-- The critic's memory belongs to its member alone, and critic calls have their own limits.
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
insert into public.critic_memory(user_id,notes) values('11111111-1111-4111-8111-111111111111','["Loves slow cinema"]');
select public.test_assert((select count(*)=1 from public.critic_memory),'member reads own critic memory');
update public.critic_memory set rules='[{"kind":"person","id":5026,"name":"Akira Kurosawa","stance":"love"}]';
select public.test_assert((select jsonb_array_length(rules)=1 from public.critic_memory),'the critic keeps taste rules');
do $$begin
 begin update public.critic_memory set rules='{}';raise exception 'Non-array rules accepted';exception when check_violation then null;end;
end$$;
select public.test_assert((select bool_and(public.consume_limit('critic-minute',1000,1)) from generate_series(1,6)),'six critic calls a minute are allowed');
select public.test_assert((select bool_and(public.consume_limit('critic-day',1000,1)) from generate_series(1,15)),'fifteen critic questions a day are allowed');
select public.test_assert(not public.consume_limit('critic-day',1000,1),'the sixteenth critic question of the day is refused');
insert into public.critic_threads(user_id,title) values('11111111-1111-4111-8111-111111111111','My chat');
insert into public.taste_signals(user_id,movie_id,source,signal) values('11111111-1111-4111-8111-111111111111',278,'critic_warned',-2);
insert into public.critic_verdicts(user_id,movie_id,verdict) values('11111111-1111-4111-8111-111111111111',278,'{"verdict":"skip"}');
do $$begin
 begin insert into public.taste_signals(user_id,movie_id,source,signal) values(auth.uid(),1,'bogus',1);raise exception 'Unknown signal source accepted';exception when check_violation then null;end;
 begin insert into public.taste_signals(user_id,movie_id,source,signal) values(auth.uid(),1,'dismissed',0);raise exception 'Empty signal accepted';exception when check_violation then null;end;
end$$;
select public.test_assert(not public.consume_limit('critic-minute',1000,1),'the seventh critic call in a minute is refused');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.test_assert((select count(*)=0 from public.critic_memory),'another member cannot read the critic memory');
select public.test_assert((select count(*)=0 from public.critic_threads),'another member cannot read the critic chats');
select public.test_assert((select count(*)=0 from public.taste_signals) and (select count(*)=0 from public.critic_verdicts),'another member cannot read film signals or verdicts');
-- Followed journeys belong to their member only.
reset role;
insert into public.followed_journeys(user_id,id,journey) values('11111111-1111-4111-8111-111111111111','129-4-278','{"id":"129-4-278"}');
set local role authenticated;
select public.test_assert((select count(*)=0 from public.followed_journeys),'another member cannot read followed journeys');
do $$begin
 begin insert into public.followed_journeys(user_id,id,journey) values('11111111-1111-4111-8111-111111111111','1-2-3','{}');raise exception 'Followed a journey for someone else';exception when insufficient_privilege then null;end;
 begin insert into public.followed_journeys(user_id,id,journey) values(auth.uid(),'not an id','{}');raise exception 'Malformed journey id accepted';exception when check_violation then null;end;
 begin insert into public.followed_journeys(user_id,id,journey) values(auth.uid(),'1-2-3','[]');raise exception 'Non-object journey accepted';exception when check_violation then null;end;
end$$;
insert into public.followed_journeys(user_id,id,journey) values(auth.uid(),'1-2-3','{"id":"1-2-3"}');
select public.test_assert((select count(*)=1 from public.followed_journeys),'a member follows their own journey');
delete from public.followed_journeys;
do $$begin
 begin insert into public.critic_threads(user_id) values('11111111-1111-4111-8111-111111111111');raise exception 'Created a chat for another member';exception when insufficient_privilege then null;end;
end$$;
do $$begin
 begin insert into public.critic_memory(user_id) values('11111111-1111-4111-8111-111111111111');raise exception 'Wrote another member''s critic memory';exception when insufficient_privilege then null;end;
end$$;
update public.critic_memory set notes='[]';
reset role;
select public.test_assert((select notes='["Loves slow cinema"]'::jsonb from public.critic_memory),'another member cannot change the critic memory');
-- Movie nights: only mutual sharing friends can be invited, only members see and
-- vote, votes close once the host decides, and the ballot itself never changes.
insert into public.follows values('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222'),('22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111') on conflict do nothing;
update public.profiles set share_activity=true where id in ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222');
set local role authenticated;
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
do $$begin
 begin insert into public.tonight_sessions(host,members,films) values(auth.uid(),array[auth.uid(),'33333333-3333-4333-8333-333333333333'::uuid],'[{"id":1}]');raise exception 'Invited a stranger';exception when insufficient_privilege then null;end;
 begin insert into public.tonight_sessions(host,members,films) values('22222222-2222-4222-8222-222222222222',array[auth.uid(),'22222222-2222-4222-8222-222222222222'::uuid],'[{"id":1}]');raise exception 'Hosted as someone else';exception when insufficient_privilege then null;end;
end$$;
insert into public.tonight_sessions(id,host,members,films) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),array[auth.uid(),'22222222-2222-4222-8222-222222222222'::uuid],'[{"id":1},{"id":2}]');
insert into public.tonight_votes(session_id,user_id,movie_id,vote) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),1,2);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select public.test_assert((select count(*)=1 from public.tonight_sessions),'an invited friend sees the movie night');
select public.test_assert((select count(*)=1 from public.tonight_votes),'an invited friend sees the votes');
insert into public.tonight_votes(session_id,user_id,movie_id,vote) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),2,2);
do $$begin
 begin insert into public.tonight_votes(session_id,user_id,movie_id,vote) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111',2,-1);raise exception 'Voted for someone else';exception when insufficient_privilege then null;end;
 begin update public.tonight_sessions set films='[{"id":9}]';raise exception 'Ballot changed';exception when insufficient_privilege then null;end;
end$$;
update public.tonight_sessions set status='decided',winner=2,decided_at=now();
select public.test_assert((select status='open' from public.tonight_sessions),'only the host decides');
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select public.test_assert((select count(*)=0 from public.tonight_sessions) and (select count(*)=0 from public.tonight_votes),'strangers see nothing');
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
update public.tonight_sessions set status='decided',winner=2,decided_at=now();
select public.test_assert((select status='decided' and winner=2 from public.tonight_sessions),'the host decides');
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
do $$begin
 begin insert into public.tonight_votes(session_id,user_id,movie_id,vote) values('cccccccc-cccc-4ccc-8ccc-cccccccccccc',auth.uid(),1,2);raise exception 'Voted after the decision';exception when insufficient_privilege then null;end;
end$$;
reset role;
-- Friend photos sync without granting direct writes or exposing auth metadata.
select public.test_assert(private.profile_photo('{"picture":"https://lh3.googleusercontent.com/a/test"}') = 'https://lh3.googleusercontent.com/a/test', 'Google photo accepted');
select public.test_assert(private.profile_photo('{"picture":"https://googleusercontent.com@evil.test/a"}') is null, 'foreign photo host rejected');
update auth.users set raw_user_meta_data = jsonb_build_object('picture','https://lh3.googleusercontent.com/a/test') where id='11111111-1111-4111-8111-111111111111';
select public.test_assert((select avatar_url='https://lh3.googleusercontent.com/a/test' from public.profiles where id='11111111-1111-4111-8111-111111111111'), 'updated photo synced');
select public.test_assert(not has_column_privilege('authenticated','public.profiles','avatar_url','UPDATE'), 'members cannot overwrite photos');
select public.test_assert(not has_schema_privilege('authenticated','private','USAGE'), 'photo triggers are private');
update auth.users set raw_user_meta_data='{}' where id='11111111-1111-4111-8111-111111111111';
select public.test_assert((select avatar_url is null from public.profiles where id='11111111-1111-4111-8111-111111111111'), 'removed photo cleared');
reset role;
rollback;
\echo 'Database authorization, sync, social and learning tests passed.'
