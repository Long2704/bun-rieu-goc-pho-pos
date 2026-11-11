import type {SupabaseClient} from '@supabase/supabase-js';
export type SyncKind='orders'|'catalog'|'images';
export type RealtimeStatus=Record<SyncKind,boolean>;
export const emptyRealtimeStatus=():RealtimeStatus=>({orders:false,catalog:false,images:false});
// Invalidations never carry business data. An event during a fetch stays dirty
// and causes a follow-up fetch; messages are not financial confirmations.
export function startRealtimeSync(client:SupabaseClient,images:boolean,options:{
 invalidate:(kinds:ReadonlySet<SyncKind>)=>Promise<boolean>;
 status:(status:RealtimeStatus)=>void;
}){
 let active=true,running=false,timer:ReturnType<typeof setTimeout>|undefined;
 const ready=emptyRealtimeStatus(),dirty=new Set<SyncKind>();
 const schedule=(delay=180)=>{if(active&&!timer&&!running)timer=setTimeout(()=>{timer=undefined;void flush();},delay);};
 const flush=async()=>{
  if(!active||running||!dirty.size)return;
  const batch=new Set(dirty);dirty.clear();running=true;let ok=false;
  try{ok=await options.invalidate(batch);}catch{/* Retain dirty work, fallback polling also recovers. */}
  finally{running=false;if(active){if(!ok)batch.forEach(kind=>dirty.add(kind));if(dirty.size)schedule(ok?180:5000);}}
 };
 const enqueue=(kind:SyncKind)=>{if(active){dirty.add(kind);schedule();}};
 const kinds:SyncKind[]=images?['orders','catalog','images']:['orders','catalog'];
 const channels=kinds.map(kind=>client.channel(`pos:${kind}`,{config:{private:true}})
  .on('broadcast',{event:'invalidate'},()=>enqueue(kind))
  .subscribe(status=>{
   if(!active)return;
   ready[kind]=status==='SUBSCRIBED';options.status({...ready});
   // Read after every join, including rejoin, to cover changes while disconnected.
   if(status==='SUBSCRIBED')enqueue(kind);
  }));
 return()=>{active=false;if(timer)clearTimeout(timer);dirty.clear();channels.forEach(channel=>{void client.removeChannel(channel);});};
}
