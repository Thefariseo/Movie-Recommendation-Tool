import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { publicUser } from '../server/user-profile.js';
import { chat } from '../api/chat.js';
import { execute } from '../server/http.js';
import { parseConversation, emptyConstraints, guidedUnderstands, conversationItalian } from '../shared/conversation.js';

const user = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const originalFetch = globalThis.fetch;
const env = {...process.env};
let session, writes, discoverCalls;
const films = [18,35,9648,878].flatMap((genre,g)=>Array.from({length:9},(_,i)=>({id:g*100+i+1,title:`Film ${g}-${i}`,genre_ids:[genre],release_date:'2020-01-01',vote_average:8,vote_count:500,poster_path:'/poster.jpg'})));
beforeEach(()=>{
  Object.assign(process.env,{APP_URL:'https://umbrify.test',SUPABASE_URL:'https://db.test',SUPABASE_ANON_KEY:'public',TMDB_KEY:'catalogue'});
  delete process.env.OPENAI_API_KEY; delete process.env.OPENAI_CHAT_MODEL; delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  session = null; writes = []; discoverCalls=0;
  globalThis.fetch = async (url,init={})=>{
    const u = new URL(url); let data;
    if(u.pathname === '/auth/v1/user') data={id:user};
    else if(u.pathname.endsWith('consume_limit')) data=true;
    else if(u.pathname.endsWith('user_movies') || u.pathname.endsWith('collaborative_candidates')) data=[];
    else if(u.pathname.endsWith('chat_sessions')) {
      if(init.method === 'POST') { const body=JSON.parse(init.body); writes.push(body); session={id:sessionId,version:0,...body}; data=[session]; }
      else if(init.method === 'PATCH') { assert.equal(u.searchParams.get('version'),`eq.${session.version}`); const body=JSON.parse(init.body); writes.push(body); session={...session,...body}; data=[session]; }
      else data=session?[session]:[];
    } else if(u.pathname.endsWith('/discover/movie')) { discoverCalls++; data={results:films}; }
    else if(/\/movie\/\d+$/.test(u.pathname)) { const id=Number(u.pathname.split('/').at(-1)); const m=films.find(m=>m.id===id); data={...m,runtime:90,genres:m.genre_ids.map(id=>({id})),keywords:{keywords:[]}}; }
    else throw new Error(`Unexpected request ${u.pathname}`);
    return Response.json(data);
  };
});
afterEach(()=>{globalThis.fetch=originalFetch;for(const key of ['APP_URL','SUPABASE_URL','SUPABASE_ANON_KEY','TMDB_KEY','OPENAI_API_KEY','OPENAI_CHAT_MODEL','SUPABASE_SERVICE_ROLE_KEY']) {if(env[key]===undefined)delete process.env[key];else process.env[key]=env[key];}});
async function call(message, id) {
  return execute(new Request(`https://umbrify.test/api/chat${message===undefined?`?id=${sessionId}`:''}`,{
    method:message===undefined?'GET':'POST',headers:{Cookie:'umbrify_access=test',Origin:'https://umbrify.test','X-Umbrify-Request':'1','Content-Type':'application/json'},
    ...(message===undefined?{}:{body:JSON.stringify({message,id})})
  }),chat);
}
test('Google presentation fields are exposed without secrets, unsafe URLs or unrelated metadata',()=>{
  const result=publicUser({id:user,email:'test@example.com',identities:[{provider:'google',identity_data:{full_name:'Film Fan',picture:'https://lh3.googleusercontent.com/avatar',provider_token:'secret'}}],access_token:'secret'});
  assert.equal(result.avatar_url,'https://lh3.googleusercontent.com/avatar');assert.equal(result.provider,'google');assert(!JSON.stringify(result).includes('secret'));
  for(const url of ['javascript:alert(1)','http://lh3.googleusercontent.com/a','https://googleusercontent.com.evil.test/a','https://me:pass@lh3.googleusercontent.com/a']) assert.equal(publicUser({user_metadata:{picture:url}}).avatar_url,null);
  assert.equal(publicUser({user_metadata:{avatar_url:'bad',picture:'https://lh3.googleusercontent.com/a'}}).avatar_url,'https://lh3.googleusercontent.com/a');
});
test('Italian mood follow-ups change genres, preserve runtime and keep conversation language',()=>{
  const start=parseConversation('Una maratona di fantascienza sotto 2 ore');assert.equal(start.max_runtime,120);
  const deep=parseConversation('più deep',start);assert.deepEqual(deep.genre_ids,[18,9648]);assert.equal(deep.max_runtime,120);
  const funny=parseConversation('piu divertente',deep);assert.deepEqual(funny.genre_ids,[35]);assert.equal(funny.marathon_count,3);
  assert.equal(parseConversation('un solo film',funny).marathon_count,1);
  assert.equal(conversationItalian('deep',[{role:'user',content:'Una maratona di fantascienza'}]),true);
  assert.equal(guidedUnderstands('un film di un regista con tre Oscar',emptyConstraints()),false);
});
test('chat sends, refines and restores film cards without an AI key',async()=>{
  let response=await call('Una commedia sotto 100 minuti');assert.equal(response.status,200);let result=await response.json();
  assert(result.movies.length>0);assert(result.movies.every(m=>m.genre_ids.includes(35)));assert.equal(result.mode,'guided');
  const oldIds=result.movies.map(m=>m.id);
  response=await call('Più profondo',result.session.id);assert.equal(response.status,200);result=await response.json();
  assert(result.movies.every(m=>m.genre_ids.includes(18)||m.genre_ids.includes(9648)));assert(result.movies.every(m=>!oldIds.includes(m.id)));
  assert.equal(result.session.constraints.max_runtime,100);
  const restored=await (await call()).json();assert.deepEqual(restored.movies.map(m=>m.id),result.movies.map(m=>m.id));
  assert.equal(restored.session.messages.length,4);assert.equal(writes.length,2);
  assert(!('movies' in restored.session.messages[1]),'only the latest card snapshot is retained to bound storage');
});
test('unrecognized input does not claim to change picks or run recommendation discovery',async()=>{
  await call('Una commedia');const previous=session.messages.at(-1).movie_ids; const calls=discoverCalls;
  const result=await (await call('con un protagonista dai capelli viola',sessionId)).json();
  assert.equal(discoverCalls,calls);assert.match(result.session.messages.at(-1).content,/Non ho capito/);assert.deepEqual(result.movies.map(m=>m.id),previous);
});
test('old conversations containing only movie IDs recover posters when reopened',async()=>{
  session={id:sessionId,version:0,messages:[{role:'assistant',content:'Film',movie_ids:[1,101]}],constraints:{}};
  const response=await call();assert.equal(response.status,200);assert.deepEqual((await response.json()).movies.map(m=>m.id),[1,101]);
});
test('failed film discovery does not create an empty conversation',async()=>{
  const fake=globalThis.fetch;
  globalThis.fetch=(url,init)=>String(url).includes('/discover/movie') ? Promise.resolve(Response.json({message:'unavailable'},{status:503})) : fake(url,init);
  assert.equal((await call('Una commedia')).status,502);assert.equal(writes.length,0);
});
