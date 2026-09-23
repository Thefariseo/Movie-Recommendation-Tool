import test, {afterEach} from 'node:test';
import assert from 'node:assert/strict';
import { discoveryConstraints, matchesDiscovery } from '../shared/discovery.js';
import { recommendations } from '../server/recommendations.js';
import { createNight } from '../server/tonight.js';
import { filmLook } from '../server/visual.js';
import sharp from 'sharp';
const A='11111111-1111-4111-8111-111111111111', B='22222222-2222-4222-8222-222222222222';
const ctx={user:{id:A},token:'test'};
const originalFetch=globalThis.fetch, env={...process.env};
afterEach(()=>{globalThis.fetch=originalFetch; process.env={...env};});
function fixture() {
  Object.assign(process.env,{APP_URL:'https://umbrify.test',SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'test',TMDB_KEY:'test'});
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const film = id => ({id,title:`Film ${id}`,backdrop_path:'/night-style.png',genre_ids:[35],genres:[{id:35}],release_date:'1994-01-01',original_language:'it',vote_average:8,vote_count:1000,runtime:85,production_countries:[{iso_3166_1:'IT'}],credits:{crew:[{id:10,job:'Director'}],cast:[{id:20}]}});
  const rows=id=>[{kind:'watched',movie_id:id===A?1:2,rating:9,movie:film(id===A?1:2)}, {kind:'watchlist',movie_id:id===A?30:31,movie:film(id===A?30:31)}];
  const queries=[];
  globalThis.fetch=async (url,options={})=>{
    const u=new URL(url); queries.push(u);
    if(u.pathname.endsWith('/can_read_library')) return Response.json(true);
    if(u.pathname.endsWith('/user_movies')) return Response.json(rows(u.searchParams.get('user_id').slice(3)));
    if(u.pathname.endsWith('/collaborative_candidates')) return Response.json([]);
    if(u.pathname.endsWith('/movie_credits')) return Response.json({crew:[{...film(30),job:'Director'}],cast:[film(30),film(31)]});
    if(u.pathname.endsWith('/recommendations') || u.pathname.endsWith('/discover/movie')) return Response.json({results:Array.from({length:35},(_,i)=>film(i+3))});
    if(/\/movie\/\d+$/.test(u.pathname)) return Response.json(film(Number(u.pathname.split('/').at(-1))));
    if(u.pathname.endsWith('/tonight_sessions')) return Response.json(options.method==='POST' ? [{id:'night',...JSON.parse(options.body)}] : []);
    throw new Error(`Unexpected: ${u.pathname}`);
  };
  return queries;
}
test('all Discover fields are validated and intersect; credits require the Director role',()=>{
  const f=discoveryConstraints({mood:'deep',decade:'1990s',country:'IT',director_id:10,actor_id:20,max_runtime:90});
  assert.deepEqual(f.genre_ids,[18,99,36]); assert.equal(f.decade,1990);
  const m={release_date:'1999-01-01',production_countries:[{iso_3166_1:'IT'}],credits:{crew:[{id:10,job:'Director'}],cast:[{id:20}]}};
  assert(matchesDiscovery(m,f)); assert(!matchesDiscovery({...m,release_date:'2000-01-01'},f));
  assert(!matchesDiscovery({...m,credits:{crew:[{id:10,job:'Producer'}],cast:[{id:20}]}},f));
  assert.equal(discoveryConstraints({director_id:-1,country:'bad',decade:'future'}).director_id,null);
});
test('Discover director, actor, decade and origin constrain cloud candidates together',async()=>{
  const queries=fixture();
  const result=await recommendations(ctx,[],discoveryConstraints({decade:'1990s',country:'IT',director_id:10,actor_id:20,max_runtime:90}));
  assert.deepEqual(result.movies.map(m=>m.id),[30]);
  const discover=queries.find(u=>u.pathname.endsWith('/discover/movie'));
  assert.equal(discover.searchParams.get('with_origin_country'),'IT');
  assert.equal(discover.searchParams.get('primary_release_date.gte'),'1990-01-01');
});
test('group watchlist filter includes either friend’s saved films and excludes unrelated films',async()=>{
  fixture();
  const {night}=await createNight(ctx,{members:[B],watchlistOnly:true,time:'short',era:'80s90s',language:'it'});
  assert.deepEqual(new Set(night.films.map(m=>m.id)),new Set([30,31]));
  assert.deepEqual(night.members,[A,B]);
});
test('Tonight refuses a host-only group and invalid visual choices',async()=>{
  await assert.rejects(createNight(ctx,{members:[A]}),/at least one friend/);
  await assert.rejects(createNight(ctx,{members:[B],look:'fake'}),/valid visual style/);
});
test('server look uses actual image pixels and rejects arbitrary image hosts',async()=>{
  const bytes=await sharp({create:{width:96,height:54,channels:3,background:{r:30,g:30,b:30}}}).png().toBuffer();
  globalThis.fetch=async url=>{ assert.equal(url,'https://image.tmdb.org/t/p/w300/test-look.png');return new Response(bytes); };
  const look=await filmLook({backdrop_path:'/test-look.png'});
  assert(look.brightness<.15); assert.equal(look.saturation,0);
  assert.equal(await filmLook({backdrop_path:'https://other.test/image.png'}),null);
});


test('group visual filter is enforced on the actual ballot, never silently dropped',async()=>{
  fixture();
  const normalFetch=globalThis.fetch;
  const still=await sharp({create:{width:96,height:54,channels:3,background:{r:30,g:30,b:30}}}).png().toBuffer();
  globalThis.fetch=async (url,options)=> new URL(url).hostname==='image.tmdb.org' ? new Response(still) : normalFetch(url,options);
  const {night}=await createNight(ctx,{members:[B],watchlistOnly:true,look:'bw'});
  assert(night.films.length>0);
  await assert.rejects(createNight(ctx,{members:[B],watchlistOnly:true,look:'vivid'}),/No picks matched/);
});

test('an empty group watchlist produces a useful no-matches result',async()=>{
  fixture(); const normalFetch=globalThis.fetch;
  globalThis.fetch=async (url,options)=>{
    const response=await normalFetch(url,options);
    if(new URL(url).pathname.endsWith('/user_movies')) return Response.json((await response.json()).filter(r=>r.kind!=='watchlist'));
    return response;
  };
  await assert.rejects(createNight(ctx,{members:[B],watchlistOnly:true}),/No picks matched/);
});

test('new group filters preserve permanent critic and Not for me exclusions',async()=>{
  for (const source of ['critic_warned','verdict','dismissed']) {
    fixture(); const normalFetch=globalThis.fetch;
    globalThis.fetch=async (url,options)=>new URL(url).pathname.endsWith('/taste_signals') ? Response.json([{movie_id:30,source,signal:-2}]) : normalFetch(url,options);
    const {night}=await createNight(ctx,{members:[B],watchlistOnly:true,time:'short'});
    assert.deepEqual(night.films.map(m=>m.id),[31],source);
  }
});

test('Other picks still excludes the previous round when Discover filters are active',async()=>{
  fixture(); const filters=discoveryConstraints({decade:'1990s',max_runtime:90});
  const first=await recommendations(ctx,[],filters);
  const next=await recommendations(ctx,[],filters,first.movies.map(m=>m.id));
  assert(first.movies.length && next.movies.length);
  assert(next.movies.every(m=>!first.movies.some(p=>p.id===m.id)));
});
