import type {ImageTicket} from './types';
export type TicketState={tickets:ImageTicket[];limit:number;hasMore:boolean;ready:boolean;error:string};
type Watch={visible:()=>boolean;online:()=>boolean;healthy:()=>boolean};
type Options={load:(limit:number)=>Promise<ImageTicket[]>;now?:()=>number;batchMs?:number;retryMs?:number;safetyMs?:number;tickMs?:number};
const empty=():TicketState=>({tickets:[],limit:40,hasMore:false,ready:false,error:''});
// One in-memory list per authenticated/authorized App scope. No localStorage or SW data.
export function createImageTicketStore(options:Options){
 const now=options.now??Date.now,batchMs=options.batchMs??250,retryMs=options.retryMs??5000,safetyMs=options.safetyMs??60000;
 let state=empty(),lastSuccess=0,dirty=true,revision=0,epoch=0,disposed=false,owners=0,paused=0;
 let watch:Watch|undefined,inFlight:Promise<void>|undefined,timer:ReturnType<typeof setTimeout>|undefined,interval:ReturnType<typeof setInterval>|undefined;
 const listeners=new Set<()=>void>(),done=new Set<string>();
 const notify=()=>listeners.forEach(listener=>listener());
 const set=(next:TicketState)=>{state=next;notify();};
 const allowed=()=>!disposed&&!!watch&&watch.visible()&&watch.online()&&!paused;
 const due=()=>dirty||!state.ready||!!state.error||!watch?.healthy()||!lastSuccess||now()<lastSuccess||now()-lastSuccess>=safetyMs;
 function schedule(delay=batchMs){if(allowed()&&due()&&!timer&&!inFlight)timer=setTimeout(()=>{timer=undefined;void flush();},delay);}
 async function flush(){
  if(!allowed()||!due()||inFlight)return;
  const capturedRevision=revision,capturedEpoch=epoch,limit=state.limit;let failed=false;
  const task=(async()=>{
   try{
    const rows=await options.load(limit);
    if(disposed||epoch!==capturedEpoch)return;
    if(revision!==capturedRevision)return; // A later invalidation requires a fresh read.
    if(!Array.isArray(rows)||rows.some(t=>!t||typeof t.id!=='string'||t.status!=='cooking'||typeof t.image_path!=='string'||typeof t.preview_path!=='string'||!Number.isFinite(Date.parse(t.created_at)))||new Set(rows.map(t=>t.id)).size!==rows.length)throw Error('Invalid image list');
    const tickets=rows.slice(0,limit).filter(t=>!done.has(t.id));
    lastSuccess=now();dirty=false;
    set({...state,tickets:JSON.stringify(state.tickets)===JSON.stringify(tickets)?state.tickets:tickets,hasMore:rows.length>limit,ready:true,error:''});
   }catch{if(!disposed&&epoch===capturedEpoch){failed=true;dirty=true;set({...state,error:'Chưa đồng bộ được phiếu ảnh. Đơn bếp thường vẫn hoạt động.'});}}
  })();
  inFlight=task;
  await task;
  if(inFlight===task)inFlight=undefined;
  if(!disposed&&epoch===capturedEpoch&&dirty)schedule(failed?retryMs:batchMs);
 }
 function dispose(){disposed=true;epoch++;dirty=true;lastSuccess=0;done.clear();if(timer)clearTimeout(timer);if(interval)clearInterval(interval);timer=undefined;interval=undefined;watch=undefined;set(empty());}
 return {
  getSnapshot:()=>state,
  subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};},
  retain(){owners++;return()=>{owners--;queueMicrotask(()=>{if(!owners)dispose();});};},
  watch(next:Watch){
   if(disposed)return()=>{};
   watch=next;schedule();
   if(interval)clearInterval(interval);
   interval=setInterval(()=>schedule(),options.tickMs??5000);
   const visible=()=>schedule();
   if(typeof document!=='undefined')document.addEventListener('visibilitychange',visible);
   if(typeof window!=='undefined')window.addEventListener('online',visible);
   return()=>{if(typeof document!=='undefined')document.removeEventListener('visibilitychange',visible);if(typeof window!=='undefined')window.removeEventListener('online',visible);if(watch===next){watch=undefined;if(timer)clearTimeout(timer);if(interval)clearInterval(interval);timer=undefined;interval=undefined;}};
  },
  invalidate(){if(disposed)return;revision++;dirty=true;schedule();},
  more(){if(disposed)return;set({...state,limit:state.limit+40});revision++;dirty=true;schedule();},
  confirmedDone(id:string){if(disposed)return;done.add(id);revision++;dirty=true;set({...state,tickets:state.tickets.filter(t=>t.id!==id)});schedule();},
  pause(){paused++;let released=false;return()=>{if(!released){released=true;paused=Math.max(0,paused-1);schedule();}};},
  dispose,
 };
}
export type ImageTicketStore=ReturnType<typeof createImageTicketStore>;
