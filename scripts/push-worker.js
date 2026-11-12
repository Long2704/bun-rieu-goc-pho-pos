// Push binding contains account/device IDs only. Never cache login tokens or order data.
const PUSH_META='goc-pho-push-binding-v1';
async function pushBinding(value){if(value===null){await caches.delete(PUSH_META);return null;}if(value===undefined&&!(await caches.keys()).includes(PUSH_META))return null;const cache=await caches.open(PUSH_META),key=new Request(self.location.origin+'/__push_binding__');if(value===undefined){const r=await cache.match(key);return r?r.json():null;}if(value)await cache.put(key,new Response(JSON.stringify(value)));else await cache.delete(key);return value;}
self.addEventListener('message',event=>{
 if(event.data?.type==='GET_PUSH_CAPABILITIES')event.ports?.[0]?.postMessage({version:1});
 if(event.data?.type==='SET_PUSH_BINDING')event.waitUntil((async()=>{const b=event.data.binding;await pushBinding(b&&typeof b.user==='string'&&typeof b.id==='string'?{user:b.user,id:b.id}:null);event.ports?.[0]?.postMessage({ok:true});})());
});
self.addEventListener('push',event=>event.waitUntil((async()=>{
 let p;try{p=event.data?.json();}catch{return;}if(!p||p.version!==1)return;
 const binding=await pushBinding();if(!binding||binding.user!==p.user_id||binding.id!==p.device_id)return;
 const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});
 const foreground=await Promise.all(windows.filter(c=>c.visibilityState==='visible').map(c=>new Promise(resolve=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();resolve(false);},350);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data?.active===true);};c.postMessage({type:'KITCHEN_PUSH_PRESENCE',device_id:p.device_id},[channel.port2]);})));
 await self.registration.showNotification(String(p.title??'Có phiếu bếp mới').slice(0,140),{body:String(p.body??'Bấm để xem phiếu').slice(0,240),icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:String(p.tag??'kitchen').slice(0,100),silent:foreground.some(Boolean),data:{url:'/?open=kitchen',user:binding.user,device:binding.id}});
})()));
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const b=await pushBinding(),d=event.notification.data;if(!b||b.user!==d?.user||b.id!==d?.device)return;const windows=await self.clients.matchAll({type:'window',includeUncontrolled:true});const client=windows.find(c=>new URL(c.url).origin===self.location.origin);if(client){await client.focus();client.postMessage({type:'OPEN_KITCHEN_PUSH'});}else await self.clients.openWindow('/?open=kitchen');})());});
