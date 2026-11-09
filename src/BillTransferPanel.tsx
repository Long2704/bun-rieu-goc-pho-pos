import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import {supabase} from './supabase';
import type {OrderLine,TableSession} from './order-model';
type Table={id:number;name:string};
type Attempt={requestId:string;sessionId:string;from:number;fromName:string;billNo:number;to:number;toName:string;targetSession:string|null;items:OrderLine[]};
export type BillTransferHandle={open:(billNo:number)=>void};
type Props={userId:string;table:Table|null;tables:Table[];sessions:TableSession[];disabled:boolean;onPending:(value:boolean)=>void;onChanged:(tableId:number)=>Promise<void>};
const money=(n:number)=>n.toLocaleString('vi-VN')+'đ';
export default forwardRef<BillTransferHandle,Props>(function BillTransferPanel({userId,table,tables,sessions,disabled,onPending,onChanged},ref){
 const key=`goc-pho-bill-table-transfer-v1:${userId}`;
 const [draft,setDraft]=useState<Attempt|null>(null),[pending,setPending]=useState<Attempt|null>(null),[open,setOpen]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[storageError,setStorageError]=useState(false);
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw) as Attempt;if(!p.requestId||!p.sessionId||!Number.isInteger(p.from)||!Number.isInteger(p.to)||!p.to||!Number.isInteger(p.billNo)||!Array.isArray(p.items)||!p.items.length||p.items.some(i=>typeof i.id!=='string'))throw new Error();setPending(p);setOpen(true);}}catch{setStorageError(true);}return()=>{alive.current=false;};},[key]);
 useEffect(()=>{onPending(!!pending||busy||storageError);},[pending,busy,storageError,onPending]);
 useImperativeHandle(ref,()=>({open:billNo=>{if(disabled||busy||storageError||pending||!table||table.id<0)return;const current=sessions.find(s=>s.table_id===table.id),items=current?.orders.flatMap(o=>o.order_items).filter(i=>(i.bill_no??1)===billNo&&!i.paid&&!i.cancelled_at)??[];if(!current||!items.length)return;setDraft({requestId:crypto.randomUUID(),sessionId:current.id,from:table.id,fromName:table.name,billNo,to:0,toName:'',targetSession:null,items:items.map(i=>({...i}))});setError('');setMessage('');setOpen(true);}}));
 const shown=pending??draft;
 async function transfer(){
  if(!supabase||lock.current||storageError)return;
  if(!navigator.onLine){setError('Mất kết nối. Kết nối mạng trước khi chuyển bill.');return;}
  let attempt=pending;
  if(!attempt){if(disabled||!draft||!tables.some(t=>t.id===draft.to&&t.id!==draft.from))return;attempt=draft;try{localStorage.setItem(key,JSON.stringify(attempt));}catch{setError('Không lưu được mã chuyển bill. Chưa gửi yêu cầu.');return;}setPending(attempt);}
  lock.current=true;setBusy(true);setError('');
  try{
   const r=await supabase.rpc('transfer_bill_to_table',{p_session_id:attempt.sessionId,p_from_table:attempt.from,p_bill_no:attempt.billNo,p_to_table:attempt.to,p_request_id:attempt.requestId,p_expected_item_ids:attempt.items.map(i=>i.id),p_expected_target_session:attempt.targetSession});
   if(r.error){
    if(['PGRST202','42883'].includes(r.error.code)){localStorage.removeItem(key);setPending(null);throw new Error('Cần chạy file bill_table_transfer.sql trên Supabase để bật chuyển bill sang bàn khác.');}
    if(r.error.code==='P0001'&&r.error.message!=='Mã chuyển bill đã được sử dụng.'){localStorage.removeItem(key);setPending(null);setDraft(null);throw new Error(r.error.message+' Đóng cửa sổ, đồng bộ rồi chọn lại bill.');}
    throw new Error('Chưa xác nhận chuyển bill. Giữ nguyên mã và bấm thử lại; không tạo yêu cầu mới.');
   }
   if(!r.data||r.data.table_id!==attempt.to||!Number.isInteger(r.data.bill_no))throw new Error('Chưa xác nhận được bill tại bàn đích. Thử lại cùng mã.');
   await onChanged(attempt.to);localStorage.removeItem(key);
   if(alive.current){setPending(null);setDraft(null);setOpen(false);setMessage(`Đã chuyển Bill ${attempt.billNo} từ ${attempt.fromName} sang ${attempt.toName} · Bill ${r.data.bill_no}.`);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa xác nhận chuyển bill. Thử lại cùng mã.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <>{message&&<Toast message={message}/>}{storageError&&<p role="alert">Không đọc được yêu cầu chuyển bill chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}{pending&&!open&&createPortal(<aside className="bill-transfer-recovery" role="status">Chuyển Bill {pending.billNo} đang chờ xác nhận. <button onClick={()=>setOpen(true)}>Kiểm tra chuyển bill</button></aside>,document.body)}
 <ConfirmDialog className="bill-transfer-dialog" open={open} title="Chuyển bill sang bàn khác" danger={false} busy={busy} error={error} confirmDisabled={!shown?.to||(!pending&&disabled)||!navigator.onLine} confirmLabel={pending?'Thử lại cùng mã chuyển bill':'Xác nhận chuyển bill'} onConfirm={()=>void transfer()} onClose={()=>{setOpen(false);if(!pending)setDraft(null);}}>
 {shown&&<><p><strong>{shown.fromName} · Bill {shown.billNo}</strong></p><ul className="bill-transfer-items">{shown.items.map(i=><li key={i.id}>{i.qty} × {i.name}<strong>{money(i.qty*i.price)}</strong>{i.note&&<small>{i.note}</small>}</li>)}</ul><p>Tổng bill: <strong>{money(shown.items.reduce((sum,i)=>sum+i.price*i.qty,0))}</strong></p>
 {pending?<p>Đến {shown.toName}. Giữ nguyên mã để kiểm tra, không chuyển lại lần nữa.</p>:<label>Bàn nhận bill<select aria-label="Bàn nhận bill" value={shown.to||''} disabled={busy||disabled} onChange={e=>{const to=Number(e.target.value),next=tables.find(t=>t.id===to);setDraft({...shown,to,toName:next?.name??'',targetSession:sessions.find(s=>s.table_id===to)?.id??null});}}><option value="">Chọn bàn đích</option>{tables.filter(t=>t.id!==shown.from&&t.id>0).map(t=><option key={t.id} value={t.id}>{t.name} · {sessions.some(s=>s.table_id===t.id)?'Có khách, nhận bill riêng':'Trống'}</option>)}</select></label>}
 <p>Các bill khác giữ ở bàn cũ. Bàn đích nhận bill riêng; món đang làm được cập nhật vị trí cho bếp.</p></>}
 </ConfirmDialog></>;
});
