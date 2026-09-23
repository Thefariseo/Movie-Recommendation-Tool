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
test('single-member cloud picks weigh signed director and theme evidence from full credits',async()=>{
  process.env.APP_URL='https://umbrify.test';process.env.SUPABASE_URL='https://db.test';process.env.SUPABASE_ANON_KEY='test';process.env.TMDB_KEY='test';delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Identical genre, decade and TMDB figures everywhere: only evidence can separate them.
  const full=(id,dir,keywords=[])=>({...movie(id,[18]),original_language:'en',credits:{crew:[{id:dir[0],name:dir[1],job:'Director'}],cast:[]},keywords:{keywords:keywords.map(([kid,name])=>({id:kid,name}))}});
  const LOVED=[10,'Alma Loved'], HATED=[20,'Bruno Disliked'], THEME=[500,'time travel'];
  const details=new Map([
    [1,full(1,LOVED,[THEME])],[2,full(2,LOVED,[THEME])],[3,full(3,HATED)],[4,full(4,HATED)],[5,full(5,[30,'Carla'])],
    [100,full(100,LOVED)],[200,full(200,HATED)],[300,full(300,[40,'Dario'],[THEME])],[400,full(400,[50,'Elena'])]
  ]);
  const rows=[[1,10],[2,9],[3,2],[4,1],[5,7]].map(([id,rating])=>({kind:'watched',movie_id:id,rating,movie:movie(id,[18])}));
  globalThis.fetch=async url=>{
    const u=new URL(url);
    if(u.pathname.endsWith('/user_movies')) return Response.json(rows);
    if(u.pathname.endsWith('collaborative_candidates')) return Response.json([]);
    if(u.pathname.endsWith('/recommendations')) return Response.json({results:[]});
    if(u.pathname.endsWith('/discover/movie')) return Response.json({results:[100,200,300,400].map(id=>movie(id,[18],{original_language:'en'}))});
    const m=u.pathname.match(/\/movie\/(\d+)$/);
    if(m&&details.has(Number(m[1]))) return Response.json(details.get(Number(m[1])));
    throw new Error(`Unexpected request: ${u.pathname}`);
  };
  const {movies}=await recommendations({user:{id:'11111111-1111-4111-8111-111111111111'},token:'test'});
  const rank=id=>movies.findIndex(m=>m.id===id);
  assert.equal(rank(100),0,'a director rated highly twice leads');
  assert(rank(300)<rank(400),'a loved theme beats a neutral film');
  assert.equal(rank(200),movies.length-1,'a disliked director sinks to the bottom');
  assert.equal(movies[0]._reason,'By Alma Loved — you gave "Film 1" 5★');
  assert.equal(movies[0]._reasonDetail,'By Alma Loved: you gave "Film 1" 5★ and "Film 2" 4.5★.');
  assert(!('credits' in movies[0]) && !('keywords' in movies[0]),'full credits are used for scoring, not sent to the browser');
});
