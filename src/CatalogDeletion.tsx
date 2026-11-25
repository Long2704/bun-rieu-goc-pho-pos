import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import ConfirmDialog from './ConfirmDialog';
import {supabase} from './supabase';
import './catalog-deletion.css';
export type CatalogTarget={id:string|number;version:number;name:string};
export type CatalogDeletionHandle={open:(target:CatalogTarget)=>void};
type Request={requestId:string;target:CatalogTarget};
export default forwardRef<CatalogDeletionHandle,{kind:'menu'|'table';userId:string;disabled:boolean;onPending:(pending:boolean)=>void;onChanged:()=>Promise<void>}>(function CatalogDeletion({kind,userId,disabled,onPending,onChanged},ref){
 const key=`pos:catalog-delete:${kind}:${userId}`,lock=useRef(false),alive=useRef(true);
 const [target,setTarget]=useState<CatalogTarget|null>(null),[pending,setPending]=useState<Request|null>(null),[visible,setVisible]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[storageError,setStorageError]=useState(false),[message,setMessage]=useState('');
 useEffect(()=>{alive.current=true;try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw) as Request;
  if(!/^[0-9a-f-]{36}$/i.test(p.requestId)||!p.target||typeof p.target.name!=='string'||!Number.isSafeInteger(p.target.version)||p.target.version<1||(kind==='menu'?typeof p.target.id!=='string':!Number.isSafeInteger(p.target.id)||Number(p.target.id)<=0))throw Error();
  setPending(p);setTarget(p.target);setVisible(true);
 }}catch{setStorageError(true);}return()=>{alive.current=false;};},[key,kind]);
 useEffect(()=>onPending(busy||!!pending||storageError),[busy,pending,storageError,onPending]);
 useImperativeHandle(ref,()=>({open(next){if(disabled||lock.current||pending||storageError)return;setTarget({...next});setError('');setMessage('');setVisible(true);}}),[disabled,pending,storageError]);
 async function remove(){
  if(!supabase||lock.current||storageError||!target||(!pending&&disabled))return;
  if(!navigator.onLine){setError('Thiết bị đang mất kết nối. Kết nối lại trước khi xóa.');return;}
  let attempt=pending;
  if(!attempt){attempt={requestId:crypto.randomUUID(),target:{...target}};try{localStorage.setItem(key,JSON.stringify(attempt));}catch{setStorageError(true);setError('Không lưu được yêu cầu xóa. Chưa gửi thay đổi.');return;}setPending(attempt);}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const r=await supabase.rpc('delete_catalog_entry',{p_request_id:attempt.requestId,p_kind:kind,p_expected_version:attempt.target.version,p_item_id:kind==='menu'?attempt.target.id:null,p_table_id:kind==='table'?attempt.target.id:null});
   if(r.error){
    if(r.error.code==='P0001'){localStorage.removeItem(key);if(alive.current){setPending(null);setVisible(false);setTarget(null);setError(r.error.message);}await onChanged();return;}
    throw Error('Chưa xác nhận được kết quả xóa. Thử lại cùng yêu cầu để kiểm tra.');
   }
   if(r.data?.ok!==true||r.data.kind!==kind)throw Error('Chưa xác nhận được kết quả xóa. Thử lại cùng yêu cầu để kiểm tra.');
   await onChanged();localStorage.removeItem(key);
   if(alive.current){setPending(null);setTarget(null);setVisible(false);setMessage(`Đã xóa ${attempt.target.name}.`);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa xác nhận được kết quả. Giữ yêu cầu và thử lại.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 const label=kind==='menu'?'món':'bàn';
 return <>{storageError&&<p role="alert">Không đọc/ghi được yêu cầu xóa đang chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}{!visible&&error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{pending&&!visible&&<aside role="status">Xóa {pending.target.name} chờ xác nhận. <button disabled={busy} onClick={()=>setVisible(true)}>Kiểm tra yêu cầu xóa</button></aside>}
 <ConfirmDialog open={visible&&!!target} title={`Xóa ${label}`} busy={busy} error={error} confirmDisabled={storageError||(!pending&&disabled)} confirmLabel={pending?'Thử lại cùng yêu cầu xóa':`Xác nhận xóa ${label}`} onConfirm={()=>void remove()} onClose={()=>{if(!lock.current){setVisible(false);if(!pending)setTarget(null);}}}>
 <p>Bạn muốn xóa <strong>{target?.name}</strong>?</p><p>{kind==='menu'?'Món sẽ được gỡ khỏi menu và danh sách quản lý. Các món đã gọi và hóa đơn cũ được giữ nguyên.':'Bàn sẽ được gỡ khỏi sơ đồ và danh sách quản lý. Không thể xóa bàn đang có khách hoặc đơn chưa xử lý xong. Hóa đơn cũ được giữ nguyên.'}</p>
 </ConfirmDialog></>;
});
