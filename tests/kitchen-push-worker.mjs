import {runInNewContext} from 'node:vm';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const events={},cache=new Map(),shown=[],opened=[];let foreground=false;
const windowClient={url:'https://pos.test/',visibilityState:'visible',focus:async()=>{},postMessage:(data,ports)=>{if(ports)ports[0].postMessage({active:foreground});else opened.push(data);}};
const self={location:{origin:'https://pos.test'},registration:{showNotification:async(title,options)=>shown.push({title,options})},clients:{matchAll:async()=>[windowClient],openWindow:async url=>opened.push(url)},addEventListener:(type,handler)=>events[type]=handler};
const caches={keys:async()=>cache.size?['goc-pho-push-binding-v1']:[],delete:async()=>{cache.clear();return true;},open:async()=>({match:async request=>cache.get(request.url)?.clone(),put:async(request,response)=>cache.set(request.url,response),delete:async request=>cache.delete(request.url)})};
runInNewContext(readFileSync(new URL('../scripts/push-worker.js',import.meta.url),'utf8'),{self,caches,Request,Response,MessageChannel,URL,setTimeout,clearTimeout});
async function dispatch(type,event){const tasks=[];events[type]({...event,waitUntil:p=>tasks.push(p)});await Promise.all(tasks);}
const payload={version:1,user_id:'user',device_id:'device',title:'Bàn 5 · Có phiếu bếp mới',body:'2 phần',tag:'kitchen:order'};
await dispatch('push',{data:{json:()=>payload}});assert.equal(shown.length,0,'unregistered/logged-out device ignores stale push');
await dispatch('message',{data:{type:'SET_PUSH_BINDING',binding:{user:'user',id:'device'}}});
await dispatch('push',{data:{json:()=>payload}});assert.equal(shown.length,1);assert.equal(shown[0].options.silent,false);
foreground=true;await dispatch('push',{data:{json:()=>payload}});assert.equal(shown[1].options.silent,true,'foreground notification remains visible but silent');assert.equal(shown[1].options.tag,'kitchen:order');
await dispatch('notificationclick',{notification:{data:shown[0].options.data,close(){}}});assert.equal(opened[0].type,'OPEN_KITCHEN_PUSH');
await dispatch('message',{data:{type:'SET_PUSH_BINDING',binding:{user:'other',id:'device'}}});await dispatch('push',{data:{json:()=>payload}});assert.equal(shown.length,2,'wrong account blocked');
await dispatch('notificationclick',{notification:{data:shown[0].options.data,close(){}}});assert.equal(opened.length,1,'old account notification cannot open another account');
await dispatch('message',{data:{type:'SET_PUSH_BINDING',binding:null}});assert.equal(cache.size,0);
console.log('PASS push service worker: visible/silent foreground, click routing, stale/logout/account checks');
