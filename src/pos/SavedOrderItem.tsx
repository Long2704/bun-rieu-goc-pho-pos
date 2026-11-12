import ItemTakeaway,{TakeawayBadge} from '../ItemTakeaway';
import {useState} from 'react';
import EditSentNote from '../EditSentNote';
import {CancelItem} from '../OperationsPanel';
import POSIcon from './POSIcon';
import QuantityControl from './QuantityControl';
import {formatMoney} from './types';
import type {DraftLine,Product} from './types';
import type {SavedGroup} from './saved-order-groups';
export default function SavedOrderItem({group,product,draft,disabled,awaiting,canCancel,onChange,onNote,onBusy,onSavedChanged,draftBillNo=group.billNo}:{
 draftBillNo?:number;group:SavedGroup;product?:Product;draft?:DraftLine;disabled:boolean;awaiting:boolean;canCancel:boolean;
 onChange:(delta:number)=>void;onNote:(note:string)=>void;onBusy:(value:boolean)=>void;onSavedChanged:()=>Promise<void>;
}){
 const [expanded,setExpanded]=useState(false),extra=draft?.qty??0;
 const notes=new Map<string,number>();for(const {line} of group.rows)if(line.note)notes.set(line.note,(notes.get(line.note)??0)+line.qty);
 const status=group.rows.some(row=>row.status==='cooking')?'Đang làm':'Đã ra món';
 const name=group.name;
 return <article className={`pos-saved-line${extra?' has-extra':''}`} data-product-id={group.productId??undefined}>
  <span className="pos-order-art"><POSIcon name={group.category==='do_uong'?'cup':'plate'}/></span>
  <div className="pos-order-item-body">
   <div className="pos-order-item-heading pos-saved-heading"><h3>{name} <TakeawayBadge takeaway={group.rows[0].line.is_takeaway}/></h3><small>{status}</small>{group.rows.length>1&&<button type="button" className="pos-line-more" aria-label={`Chi tiết lượt gọi ${name}`} aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}><POSIcon name="more"/></button>}</div>
   <div className="pos-order-item-bottom"><strong>{formatMoney(group.amount+(draft?draft.product.price*extra:0))}</strong>{product&&group.billNo===draftBillNo?<QuantityControl name={name} qty={group.qty+extra} disabled={disabled} decreaseDisabled={extra===0} increaseDisabled={product.is_out||extra>=99} maxQty={group.qty+99} onIncrease={()=>onChange(1)} onDecrease={()=>{if(extra>0)onChange(-1);}}/>:<span className="pos-saved-qty">{group.qty} món</span>}{product&&group.billNo!==draftBillNo&&<button className="pos-add-to-bill" disabled={disabled||product.is_out} aria-label={`Gọi thêm ${name} vào Bill ${draftBillNo}`} onClick={()=>onChange(1)}>+ Bill {draftBillNo}</button>}</div>
   {extra>0&&<p className="pos-extra-note">Đã gửi {group.qty} · <strong>Thêm {extra} {awaiting?'chờ xác nhận':'chưa gửi'}</strong></p>}
   {[...notes].map(([note,qty])=><p className="pos-saved-note" key={note}>{qty===group.qty?note:`${qty} × ${note}`}</p>)}
   {extra>0&&<label className="pos-line-note">Ghi chú món thêm<input maxLength={500} disabled={disabled} value={draft?.note??''} placeholder="Ghi chú cho phần gọi thêm…" onChange={event=>onNote(event.target.value)}/></label>}
   {group.rows.length===1&&<div className="pos-saved-actions"><ItemTakeaway item={group.rows[0].line} disabled={disabled} onBusy={onBusy} onChanged={onSavedChanged}/><EditSentNote item={group.rows[0].line} orderId={group.rows[0].orderId} status={group.rows[0].status} disabled={disabled} onBusy={onBusy} onChanged={onSavedChanged}/>{canCancel&&<CancelItem compact item={group.rows[0].line} disabled={disabled} onBusy={onBusy} onChanged={onSavedChanged}/>}</div>}
   {!expanded&&group.rows.some(({line})=>line.note_edited_at)&&<small className="note-edited-label">Đã chỉnh sửa</small>}
   {expanded&&<div className="pos-saved-sources">{group.rows.map(({line,status,orderId})=><div className="pos-saved-source" data-item-id={line.id} key={line.id}><div><strong>{line.qty} × {line.name}</strong><span>{formatMoney(line.price*line.qty)}</span></div><small>Bill {line.bill_no??1} · {status==='done'?'Đã ra món':'Đang làm'}</small>{line.note&&<p>{line.note}</p>}<ItemTakeaway item={line} disabled={disabled} onBusy={onBusy} onChanged={onSavedChanged}/><EditSentNote item={line} orderId={orderId} status={status} disabled={disabled} onBusy={onBusy} onChanged={onSavedChanged}/>{canCancel&&<CancelItem compact item={line} disabled={disabled} onBusy={onBusy} onChanged={onSavedChanged}/>} {line.note_edited_at&&<small className="note-edited-label">Đã chỉnh sửa</small>}</div>)}</div>}
  </div>
 </article>;
}
