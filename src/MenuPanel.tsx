import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {defaultGroups} from './menu-groups';
import type {GroupCatalog} from './menu-groups';
import MenuGroupPanel from './MenuGroupPanel';
import type {MenuGroupHandle} from './MenuGroupPanel';
import type {MenuGroup} from './menu-groups';
import DraggableTables from './DraggableTables';
type MenuOrderAttempt={requestId:string;expected:{id:string;version:number;sort:number}[];ordered:string[]};
type MenuItem={id:string;name:string;price:number;category:string;is_active:boolean;is_out:boolean;sort:number;version:number};
type Edit={groupId?:string;id:string;version:number;name:string;price:string;category:string;active:boolean;out:boolean;sort:string};
type Attempt={groupId?:string;requestId:string;itemId:string;version:number;name:string;price:number;category:string;active:boolean;out:boolean;sort:number};
const integer=(s:string)=>/^\d+$/.test(s)?Number(s):NaN;
const asEdit=(p:Attempt):Edit=>({groupId:p.groupId??p.category,id:p.itemId,version:p.version,name:p.name,price:String(p.price),category:p.category,active:p.active,out:p.out,sort:String(p.sort)});
export default function MenuPanel({userId,disabled,onPending,onSaved,active,catalog,groupError,onGroupsSaved}:{catalog:GroupCatalog|null;groupError:string;onGroupsSaved:()=>Promise<void>;userId:string;disabled:boolean;onPending:(v:boolean)=>void;onSaved:()=>Promise<void>;active?:boolean}){
 const [createdGroup,setCreatedGroup]=useState<MenuGroup|null>(null);
 const availableGroups=catalog?.groups??defaultGroups;
 const groups=createdGroup&&!availableGroups.some(g=>g.id===createdGroup.id)?[...availableGroups,createdGroup]:availableGroups;
 const groupDialog=useRef<MenuGroupHandle>(null);
 const [groupPending,setGroupPending]=useState(false);
 const unavailable=!!groupError&&!groupError.includes('Cần cập nhật cơ sở dữ liệu');
 const orderKey=`goc-pho-menu-order-v1:${userId}`;
 const [baseItems,setBaseItems]=useState<MenuItem[]>([]),[orderPending,setOrderPending]=useState<MenuOrderAttempt|null>(null);
 const key=`goc-pho-menu-v1:${userId}`;
 const [open,setOpen]=useState(false),[items,setItems]=useState<MenuItem[]>([]),[edit,setEdit]=useState<Edit|null>(null);
 const [pending,setPending]=useState<Attempt|null>(null),[storageError,setStorageError]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('');
 const orderDirty=JSON.stringify(items.map(i=>i.id))!==JSON.stringify(baseItems.map(i=>i.id));
 const lock=useRef(false),alive=useRef(true);
 useEffect(()=>{alive.current=true;try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw) as Attempt;if(!p.requestId||!p.itemId||!Number.isInteger(p.version)||p.version<0||typeof p.name!=='string'||!Number.isInteger(p.price)||!Number.isInteger(p.sort)||typeof p.active!=='boolean'||typeof p.out!=='boolean')throw new Error();setPending(p);setEdit(asEdit(p));setOpen(true);}}catch{setStorageError(true);}return()=>{alive.current=false;};},[key]);
 useEffect(()=>{try{const raw=localStorage.getItem(orderKey);if(raw){const p=JSON.parse(raw) as MenuOrderAttempt;if(!p.requestId||!Array.isArray(p.expected)||!Array.isArray(p.ordered)||!p.ordered.length||p.ordered.some(id=>typeof id!=='string'))throw new Error();setOrderPending(p);setOpen(true);}}catch{setStorageError(true);}},[orderKey]);
 useEffect(()=>{onPending(!!pending||storageError||busy||groupPending||!!orderPending);},[pending,storageError,busy,groupPending,orderPending,onPending]);
 const valid=!!edit&&edit.name.trim().length>0&&edit.name.trim().length<=120&&Number.isSafeInteger(integer(edit.price))&&integer(edit.price)<=10000000&&Number.isSafeInteger(integer(edit.sort))&&integer(edit.sort)<=9999;
 async function readMenu(){
  const r=await supabase!.rpc('list_menu_management');
  if(r.error)throw new Error(['PGRST202','42883'].includes(r.error.code)?'Database chưa có quản lý thực đơn. Cần chạy migration 008_menu_management.sql.':'Không tải được thực đơn quản lý. Kiểm tra quyền Bún Riêu Góc Phố và kết nối.');
  if(alive.current){setItems(r.data as MenuItem[]);setBaseItems(r.data as MenuItem[]);}
 }
 async function load(){if(!supabase||lock.current)return;lock.current=true;setBusy(true);setOpen(true);setError('');try{await readMenu();}catch(e){if(alive.current)setError(e instanceof Error?e.message:'Không tải được thực đơn.');}finally{lock.current=false;if(alive.current)setBusy(false);}}
 useEffect(()=>{if(active&&!orderDirty&&!orderPending)void load();},[active]);
 async function save(){
  if(!supabase||lock.current||storageError)return;
  let attempt=pending;
  if(!attempt){if(disabled||groupPending||orderPending||orderDirty||unavailable||!edit||!valid)return;attempt={...(catalog?{groupId:edit.groupId??edit.category}:{}),requestId:crypto.randomUUID(),itemId:edit.id,version:edit.version,name:edit.name.trim(),price:integer(edit.price),category:edit.category,active:edit.active,out:edit.out,sort:integer(edit.sort)};
   try{localStorage.setItem(key,JSON.stringify(attempt));}catch{setError('Không lưu được mã cập nhật. Chưa gửi yêu cầu.');return;}setPending(attempt);
  }
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const r=await supabase.rpc(attempt.groupId?'save_menu_item_in_group':'save_menu_item',{p_request_id:attempt.requestId,p_item_id:attempt.itemId,p_expected_version:attempt.version,p_name:attempt.name,p_price:attempt.price,p_category:attempt.category,p_is_active:attempt.active,p_is_out:attempt.out,p_sort:attempt.sort,...(attempt.groupId?{p_group_id:attempt.groupId}:{})});
   if(r.error){
    if(r.error.code==='P0001'&&r.error.message!=='Mã cập nhật thực đơn đã được sử dụng.'){
     localStorage.removeItem(key);if(alive.current)setPending(null);
     if(r.error.message==='Món đã được cập nhật ở nơi khác. Tải lại thực đơn rồi kiểm tra lại.'){if(alive.current)setEdit(null);await readMenu();}
     throw new Error(r.error.message);
    }
    throw new Error(['PGRST202','42883'].includes(r.error.code)?'Cần chạy migration 008_menu_management.sql rồi Thử lại cùng mã cập nhật.':`Chưa xác nhận lưu: ${r.error.message}. Thử lại cùng mã cập nhật, không tạo món lần nữa.`);
   }
   await onSaved();await onGroupsSaved();await readMenu();localStorage.removeItem(key);
   if(alive.current){setPending(null);setEdit(null);setMessage('Đã lưu thực đơn.');}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa xác nhận lưu. Thử lại cùng mã cập nhật.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function saveOrder(){
  if(!supabase||lock.current||storageError)return;
  let attempt=orderPending;
  if(!attempt){if(disabled||edit||pending||groupPending||!orderDirty||!catalog)return;attempt={requestId:crypto.randomUUID(),expected:baseItems.map(i=>({id:i.id,version:i.version,sort:i.sort})),ordered:items.map(i=>i.id)};try{localStorage.setItem(orderKey,JSON.stringify(attempt));}catch{setError('Không lưu được mã sắp xếp món. Chưa gửi yêu cầu.');return;}setOrderPending(attempt);}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const r=await supabase.rpc('reorder_menu_items',{p_request_id:attempt.requestId,p_expected:attempt.expected,p_ordered:attempt.ordered});
   if(r.error){if(r.error.code==='P0001'&&r.error.message!=='Mã sắp xếp món đã được sử dụng.'){localStorage.removeItem(orderKey);if(alive.current)setOrderPending(null);await readMenu();}throw new Error(r.error.code==='P0001'?r.error.message:'Chưa xác nhận thứ tự món. Thử lại cùng mã sắp xếp món.');}
   await onSaved();await readMenu();localStorage.removeItem(orderKey);if(alive.current){setOrderPending(null);setMessage('Đã lưu thứ tự món.');}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa xác nhận thứ tự món.');}
  finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function start(item?:MenuItem){setMessage('');setError('');setEdit(item?{groupId:catalog?.assignments[item.id]??item.category,id:item.id,version:item.version,name:item.name,price:String(item.price),category:item.category,active:item.is_active,out:item.is_out,sort:String(item.sort??0)}:{id:crypto.randomUUID(),version:0,name:'',price:'0',category:'bun',groupId:'bun',active:true,out:false,sort:String(Math.min(9999,items.reduce((max,i)=>Math.max(max,i.sort),-1)+1))});}
 return <section className="menu-management" aria-label="Quản lý thực đơn">
 {active===undefined&&<button disabled={busy} aria-expanded={open} onClick={()=>{if(open&&!pending)setOpen(false);else void load();}}>Quản lý thực đơn</button>}
 {storageError&&<p role="alert">Không đọc được cập nhật thực đơn chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}
 {pending&&<aside role="status"><strong>Cập nhật thực đơn chờ xác nhận: {pending.name}</strong><p>{pending.price.toLocaleString('vi-VN')}đ · Giữ nguyên mã để tránh tạo trùng món.</p><button disabled={busy} onClick={()=>void save()}>{busy?'Đang lưu…':'Thử lại cùng mã cập nhật'}</button></aside>}
 <MenuGroupPanel ref={groupDialog} active={open&&active!==false} userId={userId} catalog={catalog} disabled={disabled||busy||!!pending||storageError||orderDirty||!!orderPending} onPending={setGroupPending} onSaved={onGroupsSaved} onCreated={group=>{setCreatedGroup(group);setEdit(current=>current?{...current,groupId:group.id,category:group.category}:current);}}/>
 {open&&<>{active===undefined&&<h2>Quản lý thực đơn</h2>}
 {disabled&&!pending&&<p>Xử lý các yêu cầu chờ và gửi hoặc xóa món đang chọn trước khi sửa thực đơn.</p>}
 <button disabled={disabled||busy||!!pending||storageError||groupPending||unavailable||orderDirty||!!orderPending} onClick={()=>start()}>Thêm món mới</button>
 {edit&&<form className="menu-edit-form" onSubmit={e=>{e.preventDefault();void save();}}><h3>{edit.version===0?'Thêm món mới':'Sửa món'}</h3><fieldset disabled={disabled||busy||!!pending||storageError||groupPending||unavailable||orderDirty||!!orderPending}>
 <label>Tên món<input maxLength={120} required value={edit.name} onChange={e=>setEdit({...edit,name:e.target.value})}/></label>
 <label>Giá bán (đồng)<input inputMode="numeric" required value={edit.price} onChange={e=>setEdit({...edit,price:e.target.value})}/></label>
 <label htmlFor="edit-category">Nhóm món</label><div className="menu-group-picker"><select id="edit-category" value={edit.groupId??edit.category} onChange={e=>{const group=groups.find(g=>g.id===e.target.value);if(group)setEdit({...edit,category:group.category,groupId:group.id});}}>{groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select><button className="menu-group-add" type="button" aria-label="Thêm nhóm món" title="Thêm nhóm món" aria-haspopup="dialog" disabled={!catalog} onClick={()=>groupDialog.current?.open(edit.category)}>+</button></div>{groupError&&<p role="status" className="menu-group-load-error">{groupError} <button type="button" onClick={()=>void onGroupsSaved()}>Tải lại nhóm</button></p>}
 <label className="checkbox-label"><input type="checkbox" checked={edit.active} onChange={e=>setEdit({...edit,active:e.target.checked})}/>Đang bán</label>
 <label className="checkbox-label"><input type="checkbox" checked={edit.out} onChange={e=>setEdit({...edit,out:e.target.checked})}/>Hết món tạm thời</label>
 {!valid&&<p role="alert">Nhập tên món và giá nguyên từ 0 đến 10.000.000đ, không dấu phân cách.</p>}
 <button className="primary" disabled={!valid} type="submit">Lưu thực đơn</button></fieldset><button type="button" disabled={busy||!!pending} onClick={()=>setEdit(null)}>Đóng chỉnh sửa</button></form>}
 <p id="menu-sort-help" className="visually-hidden">Kéo nút ⠿ cạnh tên món rồi bấm Lưu thứ tự món. Có thể dùng phím ↑ / ↓ trên nút kéo.</p>
 {orderDirty&&!orderPending&&<div className="menu-order-actions"><button className="primary" disabled={disabled||busy||!!pending||!!edit||groupPending||storageError||!catalog} onClick={()=>void saveOrder()}>Lưu thứ tự món</button><button disabled={busy||!!pending} onClick={()=>void load()}>Hủy sắp xếp món</button></div>}
 {orderPending&&<aside role="status"><p>Thứ tự món đang chờ xác nhận.</p><button disabled={busy} onClick={()=>void saveOrder()}>Thử lại cùng mã sắp xếp món</button></aside>}
 <DraggableTables rows={items} helpId="menu-sort-help" disabled={disabled||busy||!!pending||!!orderPending||storageError||!!edit||groupPending||!catalog} onChange={next=>{setItems(next);setError('');setMessage('');}} render={i=><><div className="sortable-table-name"><h3>{i.name}</h3><p>{i.price.toLocaleString('vi-VN')}đ · {groups.find(g=>g.id===(catalog?.assignments[i.id]??i.category))?.name}{(!i.is_active||i.is_out)&&<span className="menu-item-state">{!i.is_active?'Ngừng bán':'Hết món'}</span>}</p></div><button className="menu-edit-button" aria-label={`Sửa ${i.name}`} title={`Sửa ${i.name}`} disabled={disabled||busy||!!pending||storageError||groupPending||unavailable||orderDirty||!!orderPending} onClick={()=>start(i)}>Sửa</button></>}/>

 {!busy&&!items.length&&!error&&<p>Chưa có món trong thực đơn.</p>}
 </>}{error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
 </section>;
}
