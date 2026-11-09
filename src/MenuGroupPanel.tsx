import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {defaultGroups} from './menu-groups';
import type {GroupCatalog} from './menu-groups';
type Pending={requestId:string;name:string;category:string};
export default function MenuGroupPanel({userId,catalog,error,disabled,onPending,onSaved}:{userId:string;catalog:GroupCatalog|null;error:string;disabled:boolean;onPending:(v:boolean)=>void;onSaved:()=>Promise<void>}){
 const key=`goc-pho-menu-group-v1:${userId}`;
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[category,setCategory]=useState('bun'),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const lock=useRef(false),alive=useRef(true);
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
  }catch(e){if(alive.current)setFailure(e instanceof Error?e.message:'Chưa xác nhận tạo nhóm.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="menu-group-panel" aria-label="Quản lý nhóm món">
  <div className="menu-group-heading"><div><h3>Nhóm món</h3><p>Tạo nhóm riêng để tìm món nhanh hơn.</p></div><button type="button" disabled={disabled||busy||!!pending||storageError||!catalog} onClick={()=>{setOpen(true);setFailure('');setMessage('');}}>Thêm nhóm món</button></div>
  {catalog&&<div className="menu-group-tags">{catalog.groups.map(g=><span key={g.id}>{g.name}</span>)}</div>}
  {error&&<p role="status">{error} <button type="button" disabled={busy} onClick={()=>void onSaved()}>Tải lại nhóm</button></p>}
  {storageError&&<p role="alert">Không đọc được yêu cầu tạo nhóm đang chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}
  {pending&&<aside role="status"><p>Nhóm “{pending.name}” đang chờ xác nhận.</p><button type="button" disabled={busy} onClick={()=>void save()}>{busy?'Đang lưu…':'Thử lại tạo nhóm cùng mã'}</button></aside>}
  {open&&<form className="menu-group-form" onSubmit={e=>{e.preventDefault();void save();}}><fieldset disabled={disabled||busy||!!pending||storageError||!catalog}>
   <label>Tên nhóm món<input required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Canh bún"/></label>
   <label>Loại nhóm<select value={category} onChange={e=>setCategory(e.target.value)}><option value="bun">Món chính</option><option value="an_them">Món phụ</option><option value="do_uong">Đồ uống</option></select></label>
   <p>Món chính được xếp trước món phụ ở bếp. Đồ uống không gửi vào bếp.</p>
   <div className="menu-group-actions"><button className="primary" disabled={!valid} type="submit">Lưu nhóm món</button><button type="button" onClick={()=>{setOpen(false);setFailure('');}}>Hủy thêm nhóm</button></div>
  </fieldset></form>}
  {failure&&<p role="alert">{failure}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
