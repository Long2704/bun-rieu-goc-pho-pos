import {Fragment,useCallback,useEffect,useRef,useState,useSyncExternalStore} from 'react';
import type {ReactNode} from 'react';
import {supabase} from '../supabase';
import type {ImageTicketStore} from './ticket-store';
import KitchenImageUpload from './KitchenImageUpload';
import KitchenImageTicket from './KitchenImageTicket';
import {createPrivateImages} from './private-images';
import './kitchen-images.css';
type KitchenCard={id:string;created_at:string;content:ReactNode};
type Props={store:ImageTicketStore|null;scopeKey:string;realtimeReady?:boolean;userId:string;canRead:boolean;canUpload:boolean;canComplete:boolean;online:boolean;history:boolean;normalCards:KitchenCard[];tabs:ReactNode};
export default function KitchenImageArea(props:Props){
 // Remount on user/permission changes to dispose all private data and in-flight UI state.
 return props.canRead&&props.store?<AuthorizedImages key={props.scopeKey} {...props} store={props.store}/>:<><nav className="kitchen-tabs" aria-label="Đơn bếp">{props.tabs}</nav><section className="kitchen-grid" aria-describedby="kitchen-swipe-help">{props.normalCards.map(card=><Fragment key={`order:${card.id}`}>{card.content}</Fragment>)}{!props.normalCards.length&&<Empty history={props.history}/>}</section></>;
}
function Empty({history}:{history:boolean}){return <div className="empty-state"><h3>{history?'Chưa có đơn đã xong của các bàn đang mở.':'Chưa có món đang làm.'}</h3></div>;}
function AuthorizedImages({store,realtimeReady,userId,canUpload,canComplete,online,history,normalCards,tabs}:Props&{store:ImageTicketStore}){
 const {tickets,hasMore,ready,error}=useSyncExternalStore(store.subscribe,store.getSnapshot,store.getSnapshot);
 const [busy,setBusy]=useState(''),[completionError,setCompletionError]=useState('');
 const [cache]=useState(createPrivateImages);const alive=useRef(true),completeLock=useRef(false);
 const channelReady=useRef(realtimeReady);channelReady.current=realtimeReady;
 const onlineRef=useRef(online);onlineRef.current=online;
 useEffect(()=>{alive.current=true;cache.activate();return()=>{alive.current=false;cache.dispose();};},[cache]);
 const previousTickets=useRef(tickets);
 useEffect(()=>{const current=new Set(tickets.map(t=>t.id));for(const old of previousTickets.current)if(!current.has(old.id)){cache.remove(old.image_path);cache.remove(old.preview_path);}previousTickets.current=tickets;},[tickets,cache]);
 const reload=useCallback(()=>{setCompletionError('');store.invalidate();},[store]);
 useEffect(()=>{if(history)return;return store.watch({visible:()=>document.visibilityState==='visible',online:()=>onlineRef.current,healthy:()=>channelReady.current===true});},[store,history,online]);
 async function complete(id:string,beforeRemove?:()=>Promise<void>){
  if(completeLock.current||!online||!navigator.onLine||!supabase||!canComplete)return false;
  completeLock.current=true;const resume=store.pause();setBusy(id);setCompletionError('');
  try{
   const begun=await supabase.rpc('begin_kitchen_image_completion',{p_ticket_id:id});
   if(begun.error||!begun.data||begun.data.id!==id)throw new Error();
   if(!begun.data.purged){
    const paths=begun.data.paths;
    if(!Array.isArray(paths)||paths.length<2||paths.some(p=>typeof p!=='string'||!p))throw new Error();
    let storageError:unknown=null;
    for(let offset=0;offset<paths.length;offset+=100){const removed=await supabase.storage.from('kitchen-ticket-images').remove(paths.slice(offset,offset+100));if(removed.error)storageError=removed.error;}
    const finished=await supabase.rpc('complete_kitchen_image_ticket',{p_ticket_id:id});
    if(finished.error||finished.data?.id!==id||finished.data?.purged!==true)throw storageError??finished.error??new Error();
    paths.forEach((path:string)=>cache.remove(path));
   }
   await beforeRemove?.();
   store.confirmedDone(id);return true;
  }catch{if(alive.current)setCompletionError('Chưa xác nhận hoàn thành. Phiếu được giữ lại; thử lại khi có mạng.');return false;}
  finally{completeLock.current=false;resume();if(alive.current)setBusy('');}
 }
 const cards=[
  ...normalCards.map(card=>({key:`order:${card.id}`,created_at:card.created_at,content:card.content})),
  ...(history?[]:tickets).map(ticket=>({key:`image:${ticket.id}`,created_at:ticket.created_at,content:<KitchenImageTicket ticket={ticket} cache={cache} disabled={!online||!canComplete||!!busy||!!error||!!completionError||history} onComplete={beforeRemove=>complete(ticket.id,beforeRemove)}/>})),
 ];
 if(!history)cards.sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at)||a.key.localeCompare(b.key));
 return <>
  <nav className="kitchen-tabs" aria-label="Đơn bếp">{tabs}{canUpload&&<KitchenImageUpload userId={userId} online={online} onUploaded={reload}/>}</nav>
  {!history&&(error||completionError)&&<p className="image-ticket-error" role="alert">{completionError||error} <button onClick={reload} disabled={!online}>Thử đồng bộ ảnh</button></p>}
  <section className="kitchen-grid" aria-describedby="kitchen-swipe-help">
   {cards.map(card=><Fragment key={card.key}>{card.content}</Fragment>)}
   {!history&&!ready&&!error&&<p role="status">Đang tải phiếu ảnh…</p>}
   {!cards.length&&(history||ready)&&(!error||history)&&<Empty history={history}/>}
  </section>
  {!history&&hasMore&&<button className="image-load-more" disabled={!online} onClick={()=>store.more()}>Xem thêm phiếu ảnh</button>}
 </>;
}
