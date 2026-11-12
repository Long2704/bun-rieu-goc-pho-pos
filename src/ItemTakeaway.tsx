import {useRef,useState} from 'react';
import {supabase} from './supabase';
import type {OrderLine} from './order-model';
import POSIcon from './pos/POSIcon';
import './item-takeaway.css';
type Attempt={p_request_id:string;p_item_id:string;p_expected_version:number;p_expected_takeaway:boolean|null;p_takeaway:boolean};
export function TakeawayBadge({takeaway}:{takeaway?:boolean|null}){return takeaway?<span className="item-takeaway-badge"><POSIcon name="bag"/>Mang về</span>:null;}
export default function ItemTakeaway({item,kitchenCompleted=false,disabled,onBusy,onChanged}:{item:OrderLine;kitchenCompleted?:boolean;disabled:boolean;onBusy:(busy:boolean)=>void;onChanged:()=>Promise<void>}){
 const [busy,setBusy]=useState(false),[attempt,setAttempt]=useState<Attempt|null>(null),[error,setError]=useState(''),lock=useRef(false);
 if(item.paid||item.cancelled_at||item.takeaway_version===undefined)return <TakeawayBadge takeaway={item.is_takeaway}/>;
 async function save(){
  if(!supabase||disabled||kitchenCompleted||lock.current)return;
  const payload=attempt??{p_request_id:crypto.randomUUID(),p_item_id:item.id,p_expected_version:item.takeaway_version??0,p_expected_takeaway:item.is_takeaway??null,p_takeaway:!item.is_takeaway};
  lock.current=true;setBusy(true);onBusy(true);setError('');setAttempt(payload);
  try{
   const r=await supabase.rpc('set_order_item_takeaway',payload);
   if(r.error){if(['P0001','42501','23503'].includes(r.error.code)){setAttempt(null);await onChanged().catch(()=>{});throw Error(r.error.message);}throw Error('Chưa xác nhận dấu Mang về. Bấm Thử lại cùng yêu cầu.');}
   if(r.data?.ok!==true||r.data.item_id!==item.id)throw Error('Chưa xác nhận dấu Mang về. Thử lại cùng yêu cầu.');
   await onChanged();setAttempt(null);
  }catch(e){setError(e instanceof Error?e.message:'Chưa lưu được dấu Mang về.');}
  finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <span className="item-takeaway-control"><button type="button" className={`item-takeaway-button${item.is_takeaway?' is-selected':''}`} aria-label={kitchenCompleted?`Mang về ${item.name} · Đã khóa vì bếp đã ra món`:`${item.is_takeaway?'Bỏ dấu':'Đánh dấu'} Mang về ${item.name}`} aria-pressed={!!item.is_takeaway} title={kitchenCompleted?'Bếp đã ra món. Dấu Mang về đã khóa.':'Áp dụng cho toàn bộ số lượng của dòng món này'} disabled={disabled||busy||kitchenCompleted} onClick={()=>void save()}><POSIcon name="bag"/>{kitchenCompleted?'Mang về · Đã khóa':busy?'Đang lưu…':attempt?'Thử lại':'Mang về'}{item.is_takeaway&&!attempt&&<POSIcon name="check"/>}</button>{error&&<small role="alert">{error}</small>}</span>;
}
