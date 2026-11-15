import {useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {vnToday} from './dashboard-model';
import './dashboard.css';
type Slot={slot:string;main_qty:number;takeaway_qty:number;gift_qty:number};
type Report={from:string;to:string;main_qty:number;takeaway_qty:number;gift_qty:number;cancelled_qty:number;slots:Slot[]};
const quantity=(v:unknown)=>Number.isSafeInteger(v)&&Number(v)>=0;
function validReport(value:unknown):value is Report{const v=value as Report|undefined;return !!v&&typeof v.from==='string'&&typeof v.to==='string'&&[v.main_qty,v.takeaway_qty,v.gift_qty,v.cancelled_qty].every(quantity)&&Array.isArray(v.slots)&&v.slots.length===8&&v.slots.every(s=>typeof s.slot==='string'&&[s.main_qty,s.takeaway_qty,s.gift_qty].every(quantity));}
export default function CashierReport({active}:{active:boolean}){
 const [from,setFrom]=useState(vnToday),[to,setTo]=useState(vnToday),[data,setData]=useState<Report|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const lock=useRef(false),controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const valid=!!from&&!!to&&Number.isFinite(Date.parse(from))&&Number.isFinite(Date.parse(to))&&to>=from&&(Date.parse(to)-Date.parse(from))/86400000<=30;
 const stale=!!data&&(data.from!==from||data.to!==to);
 async function load(){if(!supabase||lock.current||!valid)return;lock.current=true;setBusy(true);setError('');setData(null);const request=new AbortController();controller.current=request;
 try{const result=await supabase.rpc('cashier_operations_report',{p_from:from,p_to:to}).abortSignal(request.signal);if(result.error||!validReport(result.data)||result.data.from!==from||result.data.to!==to)throw Error('Chưa tải được báo cáo vận hành. Kiểm tra kết nối và quyền rồi thử lại.');if(!request.signal.aborted)setData(result.data);}
 catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Chưa tải được báo cáo vận hành.');}
 finally{lock.current=false;if(!request.signal.aborted)setBusy(false);}}
 useEffect(()=>{let current=true;queueMicrotask(()=>{if(current&&active&&!data)void load();});return()=>{current=false;};},[active]);
 return <section className="dashboard" aria-label="Báo cáo vận hành"><header className="dash-intro"><div><p className="dash-eyebrow">BÚN RIÊU GÓC PHỐ</p><h2>Báo cáo vận hành</h2><p>Theo dõi số tô, mang về, phần tặng và món huỷ. Số bán tính theo thời điểm thanh toán, giờ Việt Nam.</p></div></header>
 <form className="dash-filters" onSubmit={e=>{e.preventDefault();void load();}}><div className="dash-period-inputs"><label>Từ ngày<input type="date" required value={from} disabled={busy} onChange={e=>setFrom(e.target.value)}/></label><label>Đến ngày<input type="date" required value={to} disabled={busy} onChange={e=>setTo(e.target.value)}/></label><button className="primary" disabled={busy||!valid}>{busy?'Đang tải…':'Xem báo cáo'}</button></div><p>Chọn tối đa 31 ngày.</p></form>
 {error&&<p role="alert">{error}</p>}{stale&&<p role="status">Khoảng ngày đã thay đổi. Bấm Xem báo cáo để cập nhật.</p>}
 {data&&!stale&&<><dl className="dash-kpis">{[['Tô món chính',data.main_qty],['Mang về (tô món chính)',data.takeaway_qty],['Chả ốc (Tặng)',data.gift_qty],['Số phần món huỷ',data.cancelled_qty]].map(([label,n])=><div key={label}><dt>{label}</dt><dd>{Number(n).toLocaleString('vi-VN')}</dd></div>)}</dl><article className="dash-card"><h3>Số lượng theo khung giờ</h3><div className="dash-table" style={{overflowX:'auto'}}><table><thead><tr><th scope="col">Khung giờ</th><th scope="col">Tô món chính</th><th scope="col">Mang về (tô)</th><th scope="col">Chả ốc (Tặng)</th></tr></thead><tbody>{data.slots.map(s=><tr key={s.slot}><th scope="row">{s.slot}</th><td>{s.main_qty}</td><td>{s.takeaway_qty}</td><td>{s.gift_qty}</td></tr>)}</tbody></table></div><p>Mang về chỉ đếm món chính được đánh dấu mang về hoặc bán tại bàn có tên bắt đầu bằng “Mang về”. Món phụ và nước không cộng vào số tô. Số món huỷ tính theo thời điểm huỷ.</p></article></>}
 </section>;
}
