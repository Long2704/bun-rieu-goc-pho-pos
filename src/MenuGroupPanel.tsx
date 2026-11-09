import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {supabase} from './supabase';
import {defaultGroups} from './menu-groups';
import type {GroupCatalog,MenuGroup} from './menu-groups';
type Pending={requestId:string;name:string;category:string};
export type MenuGroupHandle={open:(category?:string)=>void};
type Props={userId:string;catalog:GroupCatalog|null;disabled:boolean;active:boolean;onPending:(v:boolean)=>void;onSaved:()=>Promise<void>;onCreated:(group:MenuGroup)=>void};
export default forwardRef<MenuGroupHandle,Props>(function MenuGroupPanel({userId,catalog,disabled,active,onPending,onSaved,onCreated},ref){
 const key=`goc-pho-menu-group-v1:${userId}`;
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[category,setCategory]=useState('bun'),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const lock=useRef(false),alive=useRef(true),dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
 useImperativeHandle(ref,()=>({open:(kind='bun')=>{if(disabled||busy||storageError||!catalog)return;if(!pending){setName('');setCategory(kind);setFailure('');setMessage('');}setOpen(true);}}),[disabled,busy,storageError,catalog,pending]);
 useEffect(()=>{const d=dialog.current;if(!d)return;if(open&&active){if(!d.open){d.showModal();input.current?.focus();}}else if(d.open)d.close();},[open,active]);
 useEffect(()=>{alive.current=true;try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw) as Pending;if(typeof p.requestId!=='string'||typeof p.name!=='string'||!defaultGroups.some(g=>g.id===p.category))throw new Error();setPending(p);setName(p.name);setCategory(p.category);setOpen(true);}}catch{setStorageError(true);}return()=>{alive.current=false;};},[key]);
 useEffect(()=>onPending(!!pending||busy||storageError),[pending,busy,storageError,onPending]);
 const valid=name.trim().length>0&&name.trim().length<=80;
 async function save(){
  if(!supabase||lock.current||storageError)return;
  let attempt=pending;
  if(!attempt){if(disabled||!catalog||!valid)return;attempt={requestId:crypto.randomUUID(),name:name.trim(),category};try{localStorage.setItem(key,JSON.stringify(attempt));}catch{setFailure('Không lưu được mã tạo nhóm. Chưa gửi yêu cầu.');return;}setPending(attempt);}
  lock.current=true;setBusy(true);setFailure('');setMessage('');
  try{
   const r=await supabase.rpc('create_menu_group',{p_request_id:attempt.requestId,p_name:attempt.name,p_category:attempt.category});
   if(r.error){
    if(r.error.code==='P0001'&&r.error.message!=='Mã tạo nhóm món đã được sử dụng.'){localStorage.removeItem(key);if(alive.current)setPending(null);}
    throw new Error(r.error.code==='P0001'?r.error.message:'Chưa xác nhận tạo nhóm. Thử lại cùng mã, không tạo lại nhóm.');
   }
   localStorage.removeItem(key);
   if(alive.current){setPending(null);setOpen(false);setName('');setMessage(`Đã thêm nhóm ${attempt.name}.`);}
   await onSaved();
   if(alive.current)onCreated({id:String(r.data),name:attempt.name,category:attempt.category,sort:0});
  }catch(e){if(alive.current)setFailure(e instanceof Error?e.message:'Chưa xác nhận tạo nhóm.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <>
  {storageError&&<p role="alert">Không đọc được yêu cầu tạo nhóm đang chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}
  {pending&&!open&&<aside role="status"><p>Nhóm “{pending.name}” đang chờ xác nhận.</p><button type="button" disabled={busy} onClick={()=>setOpen(true)}>Mở nhóm món đang chờ</button></aside>}
  {message&&<p role="status" className="menu-group-message">{message}</p>}
  <dialog ref={dialog} className="menu-group-dialog" aria-labelledby="menu-group-title" onCancel={e=>{e.preventDefault();if(!busy)setOpen(false);}}>
   <header><h2 id="menu-group-title">Thêm nhóm món</h2><button type="button" aria-label="Đóng thêm nhóm món" disabled={busy} onClick={()=>setOpen(false)}>×</button></header>
   <form className="menu-group-form" onSubmit={e=>{e.preventDefault();void save();}}>
    <fieldset disabled={disabled||busy||!!pending||storageError||!catalog}>
     <label>Tên nhóm món<input ref={input} required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Canh bún"/></label>
     <label>Loại nhóm<select value={category} onChange={e=>setCategory(e.target.value)}><option value="bun">Món chính</option><option value="an_them">Món phụ</option><option value="do_uong">Đồ uống</option></select></label>
    </fieldset>
    {failure&&<p role="alert">{failure}</p>}
    {pending&&<p role="status">Nhóm “{pending.name}” đang chờ xác nhận.</p>}
    <div className="menu-group-actions"><button className="primary" disabled={busy||storageError||(!pending&&(!valid||disabled||!catalog))} type="submit">{busy?'Đang lưu…':pending?'Thử lại tạo nhóm cùng mã':'Xác nhận'}</button><button type="button" disabled={busy} onClick={()=>{setOpen(false);if(!pending)setFailure('');}}>Hủy thêm nhóm</button></div>
   </form>
  </dialog>
 </>;
});
