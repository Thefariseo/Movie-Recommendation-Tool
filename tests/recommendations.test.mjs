import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {tasteProfile, tasteScore, qualityScore, diversePicks, seedMovies, hybridScore} from '../shared/taste.js';
import {recommendations} from '../server/recommendations.js';
const movie = (id, genres, extra = {}) => ({id, title: `Film ${id}`, genre_ids: genres, vote_average: 7, vote_count: 500, release_date: '2001-01-01', ...extra});
test('explicit dislikes lower matching candidates; unrated films add no preference', () => {
  const history = [movie(1,[35],{rated:9}), movie(2,[35],{rated:8}), movie(3,[27],{rated:2}), movie(4,[27],{rated:1})];
  const profile = tasteProfile(history);
  assert(tasteScore(movie(5,[35]),profile) > tasteScore(movie(6,[27]),profile) + 1);
  assert.deepEqual(tasteProfile([...history,...Array.from({length:100},(_,i)=>movie(100+i,[27]))]), profile);
  assert(tasteProfile([movie(1,[35],{rated:9})]).genres.get(35) < profile.genres.get(35));
});
test('Bayesian quality resists a perfect rating with very few votes', () => {
  assert(qualityScore(movie(1,[],{vote_average:10,vote_count:2})) < qualityScore(movie(2,[],{vote_average:8,vote_count:1000})));
  assert(Number.isFinite(tasteScore({id:1},tasteProfile([]))));
});
test('refresh prefers unseen suggestions but retains matches for a narrow filter', () => {
  const movies = [movie(1,[18],{_score:8}),movie(2,[18],{_score:7.9}),movie(3,[35],{_score:7.8})];
  const result = diversePicks(movies,3);
  assert.deepEqual(result.map(m=>m.id),[1,3,2]);
  assert.equal(diversePicks(movies,1,{recent:new Set([1,3])})[0].id,2);
  assert.equal(diversePicks([movies[0]],5,{recent:new Set([1])}).length,1);
  assert.deepEqual(diversePicks([...movies].reverse(),3).map(m=>m.id),result.map(m=>m.id));
});
test('seed selection represents different liked genres and never uses dislikes or unrated titles', () => {
  const seeds = seedMovies([movie(1,[18],{rated:10}),movie(2,[18],{rated:10}),movie(3,[35],{rated:9}),movie(4,[27],{rated:2}),movie(5,[878])],2);
  assert.deepEqual(seeds.map(m=>m.id),[1,3]);
});
test('weak collaborative evidence cannot replace the content score outright', () => {
  assert.equal(hybridScore(6,null,null),6);
  assert(hybridScore(4,null,{score:10,support:2}) < 6);
  assert(hybridScore(4,null,{score:10,support:20}) > hybridScore(4,null,{score:10,support:2}));
  assert(hybridScore(4,9,{score:10,support:20}) < 9.9);
});
const originalFetch = globalThis.fetch;
const savedEnv = {...process.env};
afterEach(()=>{globalThis.fetch=originalFetch; for(const k of ['APP_URL','SUPABASE_URL','SUPABASE_ANON_KEY','SUPABASE_SERVICE_ROLE_KEY','TMDB_KEY']) {if(savedEnv[k]===undefined) delete process.env[k]; else process.env[k]=savedEnv[k];}});
test('cloud discovery excludes watched/adult/future films, preserves runtime constraints and survives one failed source',async()=>{
  process.env.APP_URL='https://umbrify.test';process.env.SUPABASE_URL='https://db.test';process.env.SUPABASE_ANON_KEY='test';process.env.TMDB_KEY='test';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const catalog = Array.from({length:30},(_,i)=>movie(i+1,[35]));
  catalog.push(movie(50,[35],{adult:true}),movie(51,[35],{release_date:'2999-01-01'}),movie(52,[27]));
  globalThis.fetch=async url=>{
    const u=new URL(url); let data;
    if(u.pathname.endsWith('/user_movies')) data=[{kind:'watched',movie_id:1,rating:9,movie:catalog[0]}];
    else if(u.pathname.endsWith('collaborative_candidates')) data=[];
    else if(u.pathname.endsWith('/recommendations')) return new Response('{}',{status:503});
    else if(u.pathname.endsWith('/discover/movie')) data={results:catalog};
    else if(/\/movie\/\d+$/.test(u.pathname)) {const id=Number(u.pathname.split('/').pop());data={...catalog.find(m=>m.id===id),genres:[{id:35}],runtime:id<20?150:85};}
    else throw new Error(`Unexpected request: ${u.pathname}`);
    return Response.json(data);
  };
  const result=await recommendations({user:{id:'11111111-1111-4111-8111-111111111111'},token:'test'},[],{genre_ids:[35],max_runtime:90});
  assert(result.movies.length>0,'later runtime matches must not be hidden by an early batch');
  assert(result.movies.every(m=>m.id>=20 && m.id<=30 && m.runtime<=90));
});
