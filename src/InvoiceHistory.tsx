import LoadingIndicator from './LoadingIndicator';
import {placeLabel} from './order-model';
import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
type Invoice={service_label?:string;id:string;cashier_name?:string;table_no:number;bill_no:number;total:number;method:string;paid_at:string};
export default function InvoiceHistory({active,disabled,ownOnly=false,latestOnly=false,onOpen}:{active:boolean;disabled:boolean;ownOnly?:boolean;latestOnly?:boolean;onOpen:(id:string)=>void}){
 const [rows,setRows]=useState<Invoice[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[hasMore,setHasMore]=useState(false);
 const lock=useRef(false),alive=useRef(true),sequence=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 async function load(more=false){if(!supabase||lock.current)return;lock.current=true;const request=++sequence.current;setBusy(true);setError('');try{
  const size=latestOnly?1:10;let query=supabase.from('bills').select('service_label,id,cashier_name,table_no,bill_no,total,method,paid_at').order('paid_at',{ascending:false}).order('id',{ascending:false}).limit(latestOnly?1:size+1);
  if(more){const cursor=rows.at(-1);if(!cursor||!Number.isFinite(Date.parse(cursor.paid_at))||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cursor.id))throw Error('Mốc hóa đơn không hợp lệ. Bấm Tải lại hóa đơn.');query=query.or(`paid_at.lt.${cursor.paid_at},and(paid_at.eq.${cursor.paid_at},id.lt.${cursor.id})`);}
  const r=await query;if(r.error)throw Error('Chưa tải được danh sách hóa đơn. Vui lòng thử lại.');
  const list=r.data as Invoice[];if(!Array.isArray(list)||list.some(b=>!b||typeof b.id!=='string'||!Number.isFinite(Date.parse(b.paid_at))||!Number.isSafeInteger(b.total)||b.total<0)||new Set(list.map(b=>b.id)).size!==list.length||more&&list.some(b=>rows.some(old=>old.id===b.id)))throw Error('Danh sách hóa đơn vừa thay đổi. Bấm Tải lại hóa đơn.');
  if(alive.current&&request===sequence.current){setRows(old=>more?[...old,...list.slice(0,size)]:list.slice(0,size));setHasMore(!latestOnly&&list.length>size);}
 }catch(e){if(alive.current&&request===sequence.current){if(!more){setRows([]);setHasMore(false);}setError(e instanceof Error?e.message:'Không tải được hóa đơn.');}}finally{lock.current=false;if(alive.current&&request===sequence.current)setBusy(false);}}
 useEffect(()=>{if(active)void load();},[active]);
 return <section className="invoice-history" aria-label="Danh sách hóa đơn"><div className="panel-heading"><div><h2>{latestOnly?'Hóa đơn vừa thu':ownOnly?'Hóa đơn gần nhất của tôi':'Hóa đơn gần nhất'}</h2><p>{latestOnly?'Chỉ hiển thị hóa đơn gần nhất do bạn thanh toán.':ownOnly?'Chỉ hiển thị hóa đơn do bạn thanh toán.':'Mở hóa đơn để xem chi tiết.'}{!latestOnly&&' Tải 10 hóa đơn mỗi lần; bấm Xem thêm để xem các hóa đơn trước.'}</p></div><button disabled={busy} onClick={()=>void load()}>Tải lại hóa đơn</button></div>
 {error&&<p role="alert">{error}</p>}{busy&&<LoadingIndicator label="Đang tải hóa đơn"/>}
 {!rows.length&&!busy&&!error?<div className="empty-state"><h3>Chưa có hóa đơn</h3><p>Hóa đơn đã thanh toán sẽ xuất hiện tại đây.</p></div>:<div className="invoice-list">{rows.map(b=><button key={b.id} disabled={disabled} onClick={()=>onOpen(b.id)}><span><strong>{b.cashier_name?.trim()||'Nhân viên'} · {b.service_label||placeLabel(b.table_no)} · Bill {b.bill_no??1}</strong><small>{new Date(b.paid_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} · {b.method==='cash'?'Tiền mặt':'Chuyển khoản'}</small></span><strong>{Number(b.total).toLocaleString('vi-VN')}đ</strong></button>)}</div>}
 {hasMore&&<button disabled={busy} onClick={()=>void load(true)}>Xem thêm hóa đơn</button>}
 </section>;
}
