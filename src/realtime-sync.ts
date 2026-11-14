export const isSessionId=(value:unknown):value is string=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
import type {SupabaseClient} from '@supabase/supabase-js';
export type SyncKind='orders'|'catalog'|'images';
export type RealtimeStatus=Record<SyncKind,boolean>;
export const emptyRealtimeStatus=():RealtimeStatus=>({orders:false,catalog:false,images:false});
// Invalidations never carry business data. An event during a fetch stays dirty
// and causes a follow-up fetch; messages are not financial confirmations.
export function startRealtimeSync(client:SupabaseClient,images:boolean,options:{
 invalidate:(kinds:ReadonlySet<SyncKind>,sessionIds?:readonly string[])=>Promise<boolean|'busy'>;
 status:(status:RealtimeStatus)=>void;
}){
 let active=true,running=false,timer:ReturnType<typeof setTimeout>|undefined;
 const ready=emptyRealtimeStatus(),dirty=new Set<SyncKind>(),sessions=new Set<string>();let fullOrders=false;
 const visible=()=>typeof document==='undefined'||document.visibilityState==='visible';
 const schedule=(delay=180)=>{if(active&&visible()&&!timer&&!running)timer=setTimeout(()=>{timer=undefined;void flush();},delay);};
 const flush=async()=>{
  if(!active||!visible()||running||!dirty.size)return;
  const batch=new Set(dirty),scope=fullOrders?undefined:[...sessions];dirty.clear();sessions.clear();fullOrders=false;running=true;let ok=false,retryDelay=5000;
  try{const result=await options.invalidate(batch,scope);ok=result===true;if(result==='busy')retryDelay=180;}catch{/* Retain dirty work, fallback polling also recovers. */}
  finally{running=false;if(active){if(!ok){batch.forEach(kind=>dirty.add(kind));if(batch.has('orders')){if(scope===undefined)fullOrders=true;else scope.forEach(id=>sessions.add(id));}}if(sessions.size>30){fullOrders=true;sessions.clear();}if(dirty.size)schedule(ok?180:retryDelay);}}
 };
 const enqueue=(kind:SyncKind,payload?:unknown)=>{if(active){
  dirty.add(kind);
  if(kind==='orders'){
   const data=payload as {version?:unknown;session_id?:unknown}|undefined;
   if(data?.version===2&&isSessionId(data.session_id))sessions.add(data.session_id);else fullOrders=true;
   if(sessions.size>30){fullOrders=true;sessions.clear();}
  }
  schedule();
 }};
 const kinds:SyncKind[]=images?['orders','catalog','images']:['orders','catalog'];
 const channels=kinds.map(kind=>client.channel(`pos:${kind}`,{config:{private:true}})
  .on('broadcast',{event:'invalidate'},message=>enqueue(kind,message?.payload))
  .subscribe(status=>{
   if(!active)return;
   ready[kind]=status==='SUBSCRIBED';options.status({...ready});
   // Read after every join, including rejoin, to cover changes while disconnected.
   if(status==='SUBSCRIBED')enqueue(kind);
  }));
 const resume=()=>{if(visible()&&dirty.size)schedule(0);};
 if(typeof document!=='undefined')document.addEventListener('visibilitychange',resume);
 return()=>{if(typeof document!=='undefined')document.removeEventListener('visibilitychange',resume);active=false;if(timer)clearTimeout(timer);dirty.clear();channels.forEach(channel=>{void client.removeChannel(channel);});};
}
