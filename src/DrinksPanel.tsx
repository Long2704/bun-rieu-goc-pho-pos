import {useEffect,useRef,useState} from 'react';
import {TicketOrderLines} from './KitchenOrderLines';
import SwipeOrderCard from './SwipeOrderCard';
import type {CompletionMotion} from './SwipeOrderCard';
import {takeawayTitle} from './item-fulfillment';
import {supabase} from './supabase';
import {CATALOG_SYNC_MS,LIVE_SYNC_MS} from './sync-policy';

type DrinkTicket={
 id:string;place:string;queued_at:string;done_at:string|null;ordered_by_name:string|null;
 items:{id:string;name:string;qty:number;target_qty:number;note:string;is_takeaway:boolean|null}[];
};
function useDrinkList(history:boolean,enabled:boolean,realtimeReady:boolean,revision:number,visible:boolean){
 const [tickets,setTickets]=useState<DrinkTicket[]>();
 const [readError,setReadError]=useState(false);
 const visibleView=useRef(visible);
 visibleView.current=visible;

 useEffect(()=>{
  if(!supabase||!enabled)return;
  const client=supabase;
  const controller=new AbortController();
  let timer:ReturnType<typeof setTimeout>;
  const read=async()=>{
   let healthy=false;
   try{
    if(document.visibilityState==='visible'){
     const {data,error}=await client.rpc('list_drink_tickets',{p_history:history}).abortSignal(controller.signal);
     if(error||!Array.isArray(data))throw Error('Could not read drink tickets');
     if(!controller.signal.aborted){
      setTickets(data as DrinkTicket[]);
      setReadError(false);
     }
    }
    healthy=true;
   }catch{
    if(!controller.signal.aborted)setReadError(true);
   }finally{
    if(!controller.signal.aborted)timer=setTimeout(()=>void read(),!visibleView.current||realtimeReady&&healthy?CATALOG_SYNC_MS:LIVE_SYNC_MS);
   }
  };
  void read();
  return()=>{controller.abort();clearTimeout(timer);};
 },[enabled,history,realtimeReady,revision]);

 return {tickets,readError,setTickets};
}

export default function DrinksPanel({active,online,realtimeReady,revision,onQueueCount}:{
 active:boolean;online:boolean;realtimeReady:boolean;revision:number;onQueueCount:(count:number)=>void;
}){
 const [history,setHistory]=useState(false);
 const [completeError,setCompleteError]=useState(false);
 const [completing,setCompleting]=useState(false);
 const lock=useRef(false),mounted=useRef(false);
 const queue=useDrinkList(false,online&&!completing,realtimeReady,revision,active);
 const done=useDrinkList(true,active&&history&&online,realtimeReady,revision,active);
 const queueCount=queue.tickets?.length;
 const {tickets,readError}=history?done:queue;

 useEffect(()=>{
  mounted.current=true;
  return()=>{mounted.current=false;};
 },[]);
 useEffect(()=>{
  if(queueCount!==undefined)onQueueCount(queueCount);
 },[queueCount,onQueueCount]);

 async function complete(ticket:DrinkTicket,beforeRemove?:CompletionMotion){
  if(!supabase||lock.current||!navigator.onLine||history||readError)return false;
  lock.current=true;
  setCompleting(true);
  setCompleteError(false);
  try{
   const {error}=await supabase.rpc('complete_drink_ticket',{
    p_order_id:ticket.id,
    p_items:ticket.items.map(item=>({id:item.id,qty:item.target_qty}))
   });
   if(error)throw error;
   await beforeRemove?.();
   if(mounted.current)queue.setTickets(current=>current?.filter(item=>item.id!==ticket.id));
   return true;
  }catch{
   if(mounted.current)setCompleteError(true);
   return false;
  }finally{
   lock.current=false;
   if(mounted.current)setCompleting(false);
  }
 }

 if(!active)return null;

 return <div className="kitchen-page drinks-page">
  <nav className="kitchen-tabs" aria-label="Phiếu nước">
   <button aria-pressed={!history} disabled={completing} onClick={()=>{setHistory(false);setCompleteError(false);}}>
    Đang làm{queueCount!==undefined? ` (${queueCount})`:''}
   </button>
   <button aria-pressed={history} disabled={completing} onClick={()=>{setHistory(true);setCompleteError(false);}}>Lịch sử</button>
  </nav>
  {readError&&<p role="alert">Chưa đồng bộ được phiếu nước. App sẽ tự thử lại khi có kết nối.</p>}
  {completeError&&<p role="alert">Chưa xác nhận hoàn thành phiếu nước. Bạn có thể vuốt lại.</p>}
  {!history&&!!tickets?.length&&<p className="drinks-swipe-help" id="drink-swipe-help">Vuốt phiếu sang trái hoặc phải để hoàn thành.</p>}
  <section className="kitchen-grid" aria-label={history?'Phiếu nước đã hoàn thành':'Phiếu nước đang làm'}
   aria-describedby={!history&&tickets?.length?'drink-swipe-help':undefined}>
   {!tickets&&online&&!readError&&<p role="status">Đang tải phiếu nước…</p>}
   {tickets?.length===0&&!readError&&<p className="drinks-empty">{history?'Chưa có phiếu nước đã hoàn thành.':'Chưa có món nước đang làm.'}</p>}
   {tickets?.map((ticket,index)=>{
    const title=ticket.items.every(item=>item.is_takeaway)?takeawayTitle(ticket.place):ticket.place;
    const time=new Date((history&&ticket.done_at)||ticket.queued_at)
     .toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'});
    return <SwipeOrderCard key={ticket.id} disabled={history||!online||readError||completing}
     className={`kitchen-card${!history&&index===0?' first-order':''}`}
     onComplete={beforeRemove=>complete(ticket,beforeRemove)}>
     <div className="order-heading">
      <h2 className="kitchen-table-path">{title}</h2><span>{time}</span>
     </div>
     <TicketOrderLines lines={ticket.items} place={ticket.place} orderedBy={ticket.ordered_by_name}/>
     {!history&&<button type="button" className="drink-keyboard-complete" data-complete-ticket
      disabled={!online||readError||completing}>Hoàn thành phiếu nước {title}</button>}
    </SwipeOrderCard>;
   })}
  </section>
 </div>;
}
