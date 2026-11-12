import {createKitchenPushHandler,validPushEndpoint} from '../supabase/functions/kitchen-push/handler.ts';
import assert from 'node:assert/strict';
for(const url of ['http://fcm.googleapis.com/a','https://fcm.googleapis.com.evil.test/a','https://fcm.googleapis.com@127.0.0.1/a','https://fcm.googleapis.com:8443/a','https://web.push.apple.com/a#b','https://127.0.0.1/a'])assert.equal(validPushEndpoint(url),false,url);
for(const url of ['https://fcm.googleapis.com/fcm/send/a','https://web.push.apple.com/Q','https://updates.push.services.mozilla.com/wpush/v2/a','https://wns2.notify.windows.com/a'])assert.equal(validPushEndpoint(url),true,url);
const worker='a'.repeat(64),key='service-test-only',rpcCalls=[],pushCalls=[],acks=[];let status=201,unauthorized=false,bootstrap=false;
const job={id:'job',lease:'lease',device_id:'device',user_id:'user',event_id:'event',order_id:'order',title:'Bàn 5 · Có phiếu bếp mới',body:'2 phần · Bấm để xem phiếu',subscription:{endpoint:'https://fcm.googleapis.com/fcm/send/a',keys:{p256dh:'test',auth:'test'}}};
const options={url:'https://test.supabase.co',serviceKey:key,generateKeys:()=>({publicKey:'public',privateKey:'private'}),details:(s,p)=>({endpoint:s.endpoint,headers:{'Content-Type':'application/octet-stream'},body:new TextEncoder().encode('encrypted-test-placeholder')}),fetcher:async(url,init)=>{
 if(url.includes('/rest/v1/rpc/')){rpcCalls.push(url);assert.equal(init.headers.apikey,key);const name=url.split('/').at(-1);if(name==='kitchen_push_worker_config'){if(unauthorized)return new Response('{}',{status:403});return Response.json({public_key:bootstrap?null:'public',private_key:bootstrap?null:'private'});}if(name==='kitchen_push_set_keys'){bootstrap=false;return new Response(null,{status:204});}if(name==='kitchen_push_claim')return Response.json([job]);if(name==='kitchen_push_ack'){acks.push(JSON.parse(init.body).p_results);return new Response(null,{status:204});}throw Error(name);}
 pushCalls.push({url,init});assert.equal(init.headers.apikey,undefined,'never send database credentials to push service');assert.equal(init.redirect,'manual');return new Response(null,{status});
}};
const handler=createKitchenPushHandler(options),request=()=>new Request('https://test/functions/v1/kitchen-push',{method:'POST',headers:{'x-pos-push-worker':worker}});
assert.equal((await handler(new Request('https://test'))).status,405);assert.equal((await handler(new Request('https://test',{method:'POST'}))).status,401);assert.equal(rpcCalls.length,0);
unauthorized=true;assert.equal((await handler(request())).status,401);assert.equal(pushCalls.length,0);unauthorized=false;
for(const [code,result] of [[201,'sent'],[410,'gone'],[404,'gone'],[429,'retry'],[503,'retry'],[400,'failed'],[302,'failed']]){status=code;assert.equal((await handler(request())).status,200);assert.equal(acks.at(-1)[0].status,result);}
bootstrap=true;assert.equal((await handler(request())).status,200);assert.ok(rpcCalls.some(x=>x.endsWith('kitchen_push_set_keys')));
job.subscription.endpoint='https://127.0.0.1/private';const sent=pushCalls.length;await handler(request());assert.equal(pushCalls.length,sent);assert.equal(acks.at(-1)[0].code,'invalid_endpoint');
console.log('PASS kitchen push worker: auth, bootstrap, SSRF, status handling, credential isolation');
