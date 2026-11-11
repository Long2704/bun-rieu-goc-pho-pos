import {useRef,useState} from 'react';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import {supabase} from './supabase';
import type {OrderLine} from './order-model';
import './sent-note-edit.css';
type Attempt={p_request_id:string;p_item_id:string;p_order_id:string;p_expected_version:number;p_expected_note:string;p_note:string};
export default function EditSentNote({item,orderId,status,disabled,onBusy,onChanged}:{item:OrderLine;orderId:string;status:string;disabled:boolean;onBusy:(busy:boolean)=>void;onChanged:()=>Promise<void>}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[note,setNote]=useState(''),[error,setError]=useState(''),[message,setMessage]=useState('');
 const [snapshot,setSnapshot]=useState<{note:string;version:number;orderId:string}|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null),[conflict,setConflict]=useState(false);
 const lock=useRef(false);
 const eligible=(item.category==='do_uong'||status==='cooking')&&!item.paid&&!item.cancelled_at;
 function start(){setSnapshot({note:item.note,version:item.note_version??0,orderId});setNote(item.note);setAttempt(null);setConflict(false);setError('');setMessage('');setOpen(true);}
 async function save(){
  if(!supabase||lock.current||disabled||!snapshot||conflict)return;
  if(!navigator.onLine){setError('Mất kết nối. Kết nối mạng trước khi lưu ghi chú.');return;}
  const payload=attempt??{p_request_id:crypto.randomUUID(),p_item_id:item.id,p_order_id:snapshot.orderId,p_expected_version:snapshot.version,p_expected_note:snapshot.note,p_note:note.trim()};
  if(payload.p_note.length>500)return;
  lock.current=true;setBusy(true);onBusy(true);setAttempt(payload);setError('');
  let acknowledged=false;
  try{
   const r=await supabase.rpc('edit_sent_order_note',payload);
   if(r.error){
    if(['PGRST202','42883'].includes(r.error.code)){setAttempt(null);setConflict(true);setError('Chưa có chức năng sửa ghi chú trên hệ thống. Đồng bộ app rồi thử lại.');return;}
    if(['P0001','42501','23503'].includes(r.error.code)){setAttempt(null);setConflict(true);setError(r.error.code==='P0001'?r.error.message:'Thông tin món hoặc quyền truy cập đã thay đổi. Đóng và mở lại ghi chú.');return;}
    throw Error('Chưa xác nhận lưu ghi chú. Bấm Thử lại cùng yêu cầu; không tạo thay đổi khác.');
   }
   if(r.data?.ok!==true||r.data.item_id!==item.id)throw Error('Chưa xác nhận lưu ghi chú. Bấm Thử lại cùng yêu cầu.');
   acknowledged=true;await onChanged();setOpen(false);setAttempt(null);setMessage(item.category==='do_uong'?'Đã cập nhật ghi chú món.':'Đã cập nhật ghi chú cho bếp.');
  }catch(e){setError(acknowledged?'Đã lưu ghi chú nhưng chưa đồng bộ. Bấm Thử lại cùng yêu cầu để kiểm tra.':e instanceof Error?e.message:'Chưa xác nhận lưu ghi chú. Bấm Thử lại cùng yêu cầu.');}
  finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <>{eligible&&<button type="button" className="edit-sent-note-button" disabled={disabled||busy} aria-label={`Sửa ghi chú ${item.name}`} onClick={start}>Sửa ghi chú</button>}
 {message&&<Toast message={message}/>}
 <ConfirmDialog open={open} title={item.category==='do_uong'?'Sửa ghi chú món':'Sửa ghi chú món đã gửi'} danger={false} busy={busy} error={error} confirmLabel={attempt?'Thử lại cùng yêu cầu':'Lưu ghi chú'} cancelLabel="Đóng" confirmDisabled={disabled||conflict||!attempt&&note.trim()===(snapshot?.note??'').trim()} onConfirm={()=>void save()} onClose={()=>{setOpen(false);if(conflict)void onChanged().catch(()=>{});}} className="edit-sent-note-dialog">
 <p><strong>{item.qty} × {item.name}</strong></p><label>Ghi chú mới<textarea aria-label="Ghi chú món đã gửi" maxLength={500} rows={3} value={note} disabled={busy||!!attempt||conflict} onChange={e=>setNote(e.target.value)}/></label><small>{note.length}/500 ký tự · {item.category==='do_uong'?'Ghi chú được lưu với món, không gửi bếp.':'Cập nhật đúng lượt gọi món này trên phiếu bếp đang làm.'}</small>
 </ConfirmDialog></>;
}
