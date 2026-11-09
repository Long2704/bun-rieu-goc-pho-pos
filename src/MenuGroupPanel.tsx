import {forwardRef,useEffect,useImperativeHandle,useRef,useState} from 'react';
import {supabase} from './supabase';
import {defaultGroups} from './menu-groups';
import type {GroupCatalog,MenuGroup} from './menu-groups';
type Pending={requestId:string;name:string;category:string;groupId?:string;version?:number;send?:boolean};
export type MenuGroupHandle={open:(category?:string)=>void;edit:(group:MenuGroup)=>void};
type Props={userId:string;catalog:GroupCatalog|null;disabled:boolean;active:boolean;onPending:(v:boolean)=>void;onSaved:()=>Promise<void>;onCreated:(group:MenuGroup)=>void};
export default forwardRef<MenuGroupHandle,Props>(function MenuGroupPanel({userId,catalog,disabled,active,onPending,onSaved,onCreated},ref){
 const key=`goc-pho-menu-group-v1:${userId}`;
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[category,setCategory]=useState('bun'),[send,setSend]=useState(true),[editing,setEditing]=useState<MenuGroup|null>(null),[pending,setPending]=useState<Pending|null>(null),[busy,setBusy]=useState(false),[storageError,setStorageError]=useState(false),[message,setMessage]=useState(''),[failure,setFailure]=useState('');
 const lock=useRef(false),alive=useRef(true),dialog=useRef<HTMLDialogElement>(null),input=useRef<HTMLInputElement>(null);
 useImperativeHandle(ref,()=>({open:(kind='bun')=>{if(disabled||busy||storageError||!catalog)return;if(!pending){setEditing(null);setName('');setCategory(kind);setSend(kind!=='do_uong');setFailure('');setMessage('');}setOpen(true);},edit:group=>{if(disabled||busy||storageError||!catalog?.kitchen_settings)return;setEditing(group);setName(group.name);setCategory(group.category);setSend(group.send_to_kitchen??group.category!=='do_uong');setFailure('');setMessage('');setOpen(true);}}),[disabled,busy,storageError,catalog,pending]);
 useEffect(()=>{const d=dialog.current;if(!d)return;if(open&&active){if(!d.open){d.showModal();input.current?.focus();}}else if(d.open)d.close();},[open,active]);
 useEffect(()=>{alive.current=true;try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw) as Pending;if(typeof p.requestId!=='string'||typeof p.name!=='string'||!defaultGroups.some(g=>g.id===p.category))throw new Error();setPending(p);setName(p.name);setCategory(p.category);setSend(p.send??p.category!=='do_uong');if(p.groupId)setEditing({id:p.groupId,name:p.name,category:p.category,sort:0,version:p.version});setOpen(true);}}catch{setStorageError(true);}return()=>{alive.current=false;};},[key]);
 useEffect(()=>onPending(!!pending||busy||storageError),[pending,busy,storageError,onPending]);
 const valid=name.trim().length>0&&name.trim().length<=80;
 async function save(){
  if(!supabase||lock.current||storageError)return;
  let attempt=pending;
  if(!attempt){if(disabled||!catalog||!valid)return;attempt={requestId:crypto.randomUUID(),name:name.trim(),category,...(catalog.kitchen_settings?{groupId:editing?.id,version:editing?.version??0,send}:{})};try{localStorage.setItem(key,JSON.stringify(attempt));}catch{setFailure('Không lưu được mã tạo nhóm. Chưa gửi yêu cầu.');return;}setPending(attempt);}
  lock.current=true;setBusy(true);setFailure('');setMessage('');
  try{
   const settings=attempt.send!==undefined;
   const r=await supabase.rpc(settings?'save_menu_group_settings':'create_menu_group',{p_request_id:attempt.requestId,p_name:attempt.name,p_category:attempt.category,...(settings?{p_group_id:attempt.groupId??null,p_expected_version:attempt.version??0,p_send_to_kitchen:attempt.send}:{})});
   if(r.error){
    if(r.error.code==='P0001'&&!['Mã tạo nhóm món đã được sử dụng.','Mã thiết lập nhóm đã được sử dụng.'].includes(r.error.message)){localStorage.removeItem(key);if(alive.current)setPending(null);}
    throw new Error(r.error.code==='P0001'?r.error.message:'Chưa xác nhận tạo nhóm. Thử lại cùng mã, không tạo lại nhóm.');
   }
   localStorage.removeItem(key);
   if(alive.current){setPending(null);setOpen(false);setName('');}
   await onSaved();
   if(settings){const fresh=await supabase.rpc('menu_group_catalog');const group=(fresh.data as GroupCatalog|null)?.groups?.find(g=>g.id===String(r.data));if(alive.current&&group)onCreated(group);}
   else if(alive.current)onCreated({id:String(r.data),name:attempt.name,category:attempt.category,sort:0});
   if(alive.current)setMessage(attempt.groupId?`Đã cập nhật nhóm ${attempt.name}.`:`Đã thêm nhóm ${attempt.name}.`);
  }catch(e){if(alive.current)setFailure(e instanceof Error?e.message:'Chưa xác nhận tạo nhóm.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <>
  {storageError&&<p role="alert">Không đọc được yêu cầu tạo nhóm đang chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}
  {pending&&!open&&<aside role="status"><p>Nhóm “{pending.name}” đang chờ xác nhận.</p><button type="button" disabled={busy} onClick={()=>setOpen(true)}>Mở nhóm món đang chờ</button></aside>}
  {message&&<p role="status" className="menu-group-message">{message}</p>}
  <dialog ref={dialog} className="menu-group-dialog" aria-labelledby="menu-group-title" onCancel={e=>{e.preventDefault();if(!busy)setOpen(false);}}>
   <header><h2 id="menu-group-title">{editing?'Thiết lập nhóm món':'Thêm nhóm món'}</h2><button type="button" aria-label="Đóng thêm nhóm món" disabled={busy} onClick={()=>setOpen(false)}>×</button></header>
   <form className="menu-group-form" onSubmit={e=>{e.preventDefault();void save();}}>
    <fieldset disabled={disabled||busy||!!pending||storageError||!catalog}>
     <label>Tên nhóm món<input readOnly={!!editing} ref={input} required maxLength={80} value={name} onChange={e=>setName(e.target.value)} placeholder="Ví dụ: Canh bún"/></label>
     {catalog?.kitchen_settings&&<label className="checkbox-label menu-group-kitchen"><input type="checkbox" checked={send} onChange={e=>setSend(e.target.checked)}/>Gửi món vào bếp</label>}
    </fieldset>
    {failure&&<p role="alert">{failure}</p>}
    {pending&&<p role="status">Nhóm “{pending.name}” đang chờ xác nhận.</p>}
    <div className="menu-group-actions"><button className="primary" disabled={busy||storageError||(!pending&&(!valid||disabled||!catalog))} type="submit">{busy?'Đang lưu…':pending?(pending.groupId?'Thử lại thiết lập cùng mã':'Thử lại tạo nhóm cùng mã'):'Xác nhận'}</button><button type="button" disabled={busy} onClick={()=>{setOpen(false);if(!pending)setFailure('');}}>Hủy thêm nhóm</button></div>
   </form>
  </dialog>
 </>;
});
