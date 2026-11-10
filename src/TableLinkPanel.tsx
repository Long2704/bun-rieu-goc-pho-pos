import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {supabase} from './supabase';
import type {TableSession} from './order-model';
import PosIcon from './PosIcon';
import ConfirmDialog from './ConfirmDialog';
import Toast from './Toast';
import './linked-tables.css';
type Table={id:number;name:string;service_type?:string};
type Attempt={requestId:string;tableId:number;otherId:number;sessionId:string;otherSession:string|null;mode:'same_bill'|'separate_bills';action?:'unlink';tableName:string;otherName:string};
export default function TableLinkPanel({userId,table,tables,sessions,disabled,onPending,onChanged}:{userId:string;table:Table|null;tables:Table[];sessions:TableSession[];disabled:boolean;onPending:(v:boolean)=>void;onChanged:()=>Promise<void>}){
 const key=`goc-pho-table-link-v1:${userId}`;
 const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[other,setOther]=useState<Table|null>(null),[pending,setPending]=useState<Attempt|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[storageError,setStorageError]=useState(false);
 const lock=useRef(false),alive=useRef(true),picker=useRef<HTMLDialogElement>(null);
 useEffect(()=>{alive.current=true;try{const raw=localStorage.getItem(key);if(raw){const p=JSON.parse(raw);if(!p.requestId||!p.sessionId||!Number.isInteger(p.tableId)||!Number.isInteger(p.otherId)||!['same_bill','separate_bills'].includes(p.mode)||p.action!==undefined&&p.action!=='unlink')throw Error();setPending(p);}}catch{setStorageError(true);}return()=>{alive.current=false;};},[key]);
 useEffect(()=>onPending(!!pending||busy||storageError),[pending,busy,storageError,onPending]);
 useEffect(()=>{if(open&&!picker.current?.open)picker.current?.showModal();else if(!open&&picker.current?.open)picker.current.close();},[open]);
 const current=table?sessions.find(s=>s.table_id===table.id):undefined;
 const members=tables.filter(t=>t.id!==table?.id&&current?.member_table_ids?.includes(t.id));
 const labelFor=(t:Table|null)=>{const ids=sessions.find(s=>s.table_id===t?.id)?.member_table_ids;return ids?.length?ids.map(id=>tables.find(row=>row.id===id)?.name??`Bàn ${id}`).join(' + '):t?.name;};
 const hasUnpaid=(id:number)=>sessions.find(s=>s.table_id===id)?.orders.some(o=>o.order_items.some(i=>!i.paid&&!i.cancelled_at));
 const choices=tables.filter(t=>t.id!==table?.id&&t.service_type!=='takeaway'&&t.id>0&&(!current||sessions.find(s=>s.table_id===t.id)?.id!==current.id)&&t.name.toLocaleLowerCase('vi-VN').includes(query.trim().toLocaleLowerCase('vi-VN')));
 async function link(mode:'same_bill'|'separate_bills',target=other,action?:'unlink'){
  if(!supabase||lock.current||storageError)return;let a=pending;
  if(!a){if(disabled||!table||!current||!target)return;a={requestId:crypto.randomUUID(),tableId:table.id,otherId:target.id,sessionId:current.id,otherSession:sessions.find(s=>s.table_id===target.id)?.id??null,mode,action,tableName:table.name,otherName:target.name};try{localStorage.setItem(key,JSON.stringify(a));}catch{setError('Chưa lưu được mã gộp bàn trên thiết bị. Chưa gửi yêu cầu.');return;}setPending(a);}
  if(!navigator.onLine){setError('Mất kết nối. Đã giữ mã yêu cầu; kết nối mạng rồi thử lại cùng mã.');return;}
  lock.current=true;setBusy(true);setError('');setMessage('');
  try{
   const r=a.action==='unlink'?await supabase.rpc('unlink_dining_table',{p_request_id:a.requestId,p_table_id:a.tableId,p_remove_table_id:a.otherId,p_expected_session:a.sessionId}):await supabase.rpc('link_dining_tables',{p_request_id:a.requestId,p_table_id:a.tableId,p_other_table_id:a.otherId,p_expected_session:a.sessionId,p_expected_other_session:a.otherSession,p_mode:a.mode});
   if(r.error){if(r.error.code==='P0001'&&r.error.message!=='Mã gộp bàn đã được sử dụng cho yêu cầu khác.'){localStorage.removeItem(key);if(alive.current){setPending(null);setOther(null);}await onChanged();throw Error(r.error.message);}throw Error(`Chưa xác nhận ${a.action?'hủy gộp':'gộp bàn'}. ${['PGRST202','42883'].includes(r.error.code)?'Hệ thống chưa có chức năng này.':'Thử lại cùng mã, không tạo yêu cầu mới.'}`);}
   if(r.data?.ok!==true||!Array.isArray(r.data.table_ids))throw Error('Chưa xác nhận được kết quả. Thử lại cùng mã.');
   await onChanged();localStorage.removeItem(key);if(alive.current){setPending(null);setOther(null);setMessage(a.action?`Đã bỏ gộp ${a.otherName}. Món và bill giữ ở nhóm còn lại.`:`Đã gộp ${a.tableName} và ${a.otherName}. Dữ liệu đã đồng bộ.`);}
  }catch(e){if(alive.current)setError(e instanceof Error?e.message:'Chưa đồng bộ nhóm bàn. Thử lại cùng mã.');}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 function close(){if(!busy){setOpen(false);setOther(null);}}
 const feedback=<>{storageError&&<p role="alert">Không đọc được yêu cầu đang chờ. Không xóa dữ liệu trình duyệt; liên hệ hỗ trợ.</p>}{pending&&<aside role="status"><strong>{pending.action?'Hủy gộp':'Gộp bàn'} chờ xác nhận · {pending.tableName} + {pending.otherName}</strong><button disabled={busy} onClick={()=>void link(pending.mode)}>{busy?'Đang xử lý và đồng bộ…':'Thử lại cùng mã gộp bàn'}</button></aside>}{error&&<p role="alert">{error}</p>}</>;
 return <section className="table-link-panel" aria-label="Thao tác gộp bàn">{table&&current&&!pending&&<button disabled={disabled||busy||storageError} onClick={()=>{setOpen(true);setOther(null);setQuery('');setError('');}}><PosIcon name="link"/><span>Gộp bàn</span></button>}{!open&&feedback}{message&&<Toast message={message}/>}
 {createPortal(<dialog ref={picker} className="table-link-dialog" aria-label="Gộp bàn" onCancel={e=>{if(busy)e.preventDefault();else close();}}><header><button aria-label="Đóng gộp bàn" disabled={busy} onClick={close}>×</button><h2>Gộp bàn</h2><button disabled={busy} onClick={close}>Xong</button></header><div className="table-link-picker"><label>Tìm bàn<input aria-label="Tìm bàn cần gộp" placeholder="Tìm tên bàn cần gộp…" value={query} disabled={busy||!!pending} onChange={e=>setQuery(e.target.value)}/></label>
 {members.length>0&&<><h3>Gộp với</h3><div className="table-link-list table-link-members">{members.map(t=><button key={t.id} disabled={disabled||busy||!!pending} onClick={()=>void link('separate_bills',t,'unlink')} aria-label={`Hủy gộp ${t.name}`}><span className="table-link-minus">−</span><span>{t.name}</span></button>)}</div><p className="table-link-hint">Bấm − để đưa bàn đó về trống. Món và bill giữ ở nhóm còn lại.</p></>}
 <h3>Chọn bàn</h3><div className="table-link-list">{choices.map(t=><button key={t.id} disabled={disabled||busy||!!pending} onClick={()=>{setError('');if(hasUnpaid(t.id))setOther(t);else void link('separate_bills',t);}} aria-label={`Gộp ${t.name}`}><span className="table-link-plus">+</span><span>{t.name}<small>{sessions.find(s=>s.table_id===t.id)?.member_table_ids?.length?labelFor(t):hasUnpaid(t.id)?'Có đơn':'Trống'}</small></span></button>)}{!choices.length&&<p>Không có bàn phù hợp.</p>}</div>{open&&feedback}</div></dialog>,document.body)}
 <ConfirmDialog open={!!other} title="Gộp bàn" danger={false} busy={busy} error={error} confirmLabel={pending?'Thử lại cùng mã gộp bàn':'Gộp vào đơn hiện tại'} cancelLabel="Quay lại" confirmDisabled={!pending&&disabled} onConfirm={()=>void link('same_bill')} onClose={()=>{setOther(null);}} className="table-link-mode-dialog"><p><strong>{labelFor(other)}</strong></p><p>Gộp vào <strong>{labelFor(table)}</strong></p><p>Gộp chung các món chưa thanh toán vào Bill 1, hoặc giữ các bill riêng trong nhóm bàn.</p><button className="table-link-separate" disabled={busy||!!pending||disabled} onClick={()=>void link('separate_bills')}>Gộp bàn, tách đơn</button></ConfirmDialog>
 </section>;
}
