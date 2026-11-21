import LoadingIndicator from './LoadingIndicator';
import {loadAdminDashboard} from './admin-dashboard';
import type {AdminDashboard} from './admin-dashboard';
import {useEffect,useMemo,useRef,useState} from 'react';
import PosIcon from './PosIcon';
import ReportClock from './ReportClock';
import SalesRetention from './SalesRetention';
import {formatMoney as money} from './format';
import {reportTimestamp,validReportPeriod,reportPeriodLabel} from './revenue-period';
import {aggregateSales,bandLabel,restoreReportBands,bounds,defaultBands,isTakeaway,matchesSale,saleName,shiftDay,validBands,vnToday} from './dashboard-model';
import type {Sale,TimeBand} from './dashboard-model';
import {loadDashboardSales} from './dashboard-data';
import {PaymentChart,TrendChart} from './DashboardCharts';
import './dashboard.css';
type Props={serverReports?:boolean;active?:boolean;userId?:string;tables?:{id:number;name:string}[];online?:boolean;};
type Data={aggregate?:AdminDashboard;kind?:string;table?:string;rules?:string;rows:Sale[];generatedAt:string;from:string;to:string};
const localStamp=(ms:number)=>new Date(ms+7*3600000).toISOString().slice(0,19);
const stamp=(date:string)=>new Date(date).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
export default function RevenuePanel({serverReports=false,active,userId='owner',tables=[],online=true}:Props){
 const [from,setFrom]=useState(vnToday),[to,setTo]=useState(vnToday),[fromTime,setFromTime]=useState('00:00:00'),[toTime,setToTime]=useState('23:59:59');
 const [kind,setKind]=useState('all'),[table,setTable]=useState('all'),[data,setData]=useState<Data|null>(null),[busy,setBusy]=useState(false),[exporting,setExporting]=useState(false),[error,setError]=useState('');
 const [bands,setBands]=useState<TimeBand[]>(()=>{try{const saved=JSON.parse(localStorage.getItem(`pos:dashboard-bands:${userId}`)||'null');return restoreReportBands(saved);}catch{return defaultBands;}});
 const controller=useRef<AbortController|null>(null),lock=useRef(false),autoTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
 const exportController=useRef<AbortController|null>(null);
 const [retentionLoaded,setRetentionLoaded]=useState(false);
 const fromLocal=reportTimestamp(from,fromTime),toLocal=reportTimestamp(to,toTime),valid=validReportPeriod(fromLocal,toLocal),bandsValid=validBands(bands);
 useEffect(()=>{if(bandsValid)try{localStorage.setItem(`pos:dashboard-bands:${userId}`,JSON.stringify(bands));}catch{/* Vẫn dùng khung giờ trong phiên này. */}},[bands,bandsValid,userId]);
 useEffect(()=>()=>{controller.current?.abort();exportController.current?.abort();},[]);
 useEffect(()=>{if(autoTimer.current){clearTimeout(autoTimer.current);autoTimer.current=null;}},[fromLocal,toLocal]);
 async function load(){
  if(!valid||!bandsValid||!fromLocal||!toLocal||!online)return;if(autoTimer.current){clearTimeout(autoTimer.current);autoTimer.current=null;}controller.current?.abort();lock.current=true;setBusy(true);setError('');setData(null);
  const request=new AbortController();controller.current=request;
  try{if(serverReports){const aggregate=await loadAdminDashboard(fromLocal,toLocal,bands,kind,table,request.signal);if(!request.signal.aborted)setData({aggregate,rows:[],generatedAt:aggregate.current.generated_at,from:fromLocal,to:toLocal,kind,table,rules:bands.map(bandLabel).join('|')});}else{const result=await loadDashboardSales(fromLocal,toLocal,request.signal);if(!request.signal.aborted)setData({...result,from:fromLocal,to:toLocal});}}
  catch(e){if(!request.signal.aborted)setError(e instanceof Error?e.message:'Không tải được Dashboard.');}
  finally{if(controller.current===request){lock.current=false;if(!request.signal.aborted)setBusy(false);}}
 }
 useEffect(()=>{let current=true;queueMicrotask(()=>{if(current&&active!==false&&!data)void load();});return()=>{current=false;};},[active]);
 const rules=bands.map(bandLabel).join('|');
 useEffect(()=>{if(!controller.current||!serverReports||active===false)return;
  if(data?.aggregate&&data.kind===kind&&data.table===table&&data.rules===rules)return;
  const timer=setTimeout(()=>{autoTimer.current=null;void load();},350);autoTimer.current=timer;return()=>{clearTimeout(timer);if(autoTimer.current===timer)autoTimer.current=null;};
 },[kind,table,rules,active,serverReports]);
 const stale=!!data&&(data.from!==fromLocal||data.to!==toLocal||!!data.aggregate&&(data.kind!==kind||data.table!==table||data.rules!==rules));
 const options=useMemo(()=>{const map=new Map(tables.map(t=>[t.id,t.name]));for(const choice of data?.aggregate?.table_options??[])map.set(choice.table_id,choice.has_label===false?(map.get(choice.table_id)??choice.name):choice.name);for(const sale of data?.rows??[])map.set(sale.table_no,sale.service_label?.trim()||map.get(sale.table_no)||saleName(sale));return [...map].sort((a,b)=>a[1].localeCompare(b[1],'vi',{numeric:true}));},[tables,data]);
 const filterLabel=`${kind==='takeaway'?'Mang về':kind==='dine'?'Ăn tại bàn':'Tất cả hình thức'} · ${table==='all'?'Tất cả bàn':options.find(([id])=>String(id)===table)?.[1]??table}`;
 const reports=useMemo(()=>{
  if(!data||stale||!bandsValid)return null;
  if(data.aggregate)return {current:{...data.aggregate.current,filter_label:filterLabel},previous:{...data.aggregate.previous,filter_label:filterLabel}};
  const filtered=data.rows.filter(s=>matchesSale(s,kind,table)),range=bounds(data.from,data.to);
  return {current:aggregateSales(filtered,data.from,data.to,bands,filterLabel,data.generatedAt),previous:aggregateSales(filtered,localStamp(range.previous),localStamp(range.start-1000),bands,filterLabel,data.generatedAt)};
 },[data,stale,bandsValid,bands,kind,table,filterLabel]);
 const report=reports?.current,previous=reports?.previous;
 function preset(value:'today'|'week'|'month'){const day=vnToday();setFrom(value==='week'?shiftDay(day,-6):value==='month'?day.slice(0,8)+'01':day);setTo(day);setFromTime('00:00:00');setToTime('23:59:59');}
 async function exportExcel(){
  if(!report||busy||exporting)return;const request=new AbortController();exportController.current=request;setExporting(true);
  try{
   const [{downloadRevenueWorkbook},{loadExcelMenu}]=await Promise.all([import('./revenue-workbook'),import('./revenue-export-menu')]);
   if(request.signal.aborted)return;
   const [menu,sales]=await Promise.all([loadExcelMenu(request.signal),data?.aggregate?loadDashboardSales(report.from,report.to,request.signal,false,report.generated_at).then(r=>r.rows):Promise.resolve(data?.rows)]);
   if(request.signal.aborted)return;
   await downloadRevenueWorkbook(report,sales?.filter(s=>matchesSale(s,kind,table)),{menu,exportedAt:new Date().toISOString()});setError('');
  }catch{if(!request.signal.aborted)setError('Không xuất được Excel. Kiểm tra dữ liệu rồi thử lại.');}
  finally{if(!request.signal.aborted)setExporting(false);}
 }

 const slots=report?[...new Set(report.slots.map(s=>s.slot_index))].map(index=>{const rows=report.slots.filter(s=>s.slot_index===index);return {name:rows[0].slot,invoices:rows.reduce((n,s)=>n+s.invoices,0),mainQty:rows.reduce((n,s)=>n+s.main_qty,0),total:rows.reduce((n,s)=>n+s.total,0)};}):[];
 const maxMainQty=Math.max(1,...slots.map(slot=>slot.mainQty));
 const top=report?.products.slice(0,6)??[],best=report?.days.reduce((a,b)=>b.total>a.total?b:a,report.days[0]),peak=slots.reduce<{name:string;invoices:number;mainQty:number}|null>((a,b)=>!a||b.mainQty>a.mainQty?b:a,null);
 return <section className="dashboard" aria-label="Dashboard kinh doanh">
 <header className="dash-intro"><div><p className="dash-eyebrow">BÚN RIÊU GÓC PHỐ · BUSINESS OVERVIEW</p><h2>Tổng quan kinh doanh</h2><p>Hiểu doanh thu, theo dõi từng bàn và nắm nhịp bán hàng.</p></div><span className={`dash-connection${online?'':' is-offline'}`}><i/>{online?'Kết nối trực tuyến':'Đang ngoại tuyến'}</span></header>
 <form className="dash-filters" onSubmit={e=>{e.preventDefault();void load();}}>
 <div className="dash-presets">{[['today','Hôm nay'],['week','7 ngày'],['month','Tháng này']].map(([value,label])=><button key={value} type="button" disabled={busy} onClick={()=>preset(value as 'today'|'week'|'month')}>{label}</button>)}</div>
 <div className="dash-period-inputs"><label>Từ ngày<input type="date" required disabled={busy} value={from} onChange={e=>setFrom(e.target.value)}/></label><ReportClock label="Từ giờ" value={fromTime} disabled={busy} onChange={setFromTime}/><label>Đến ngày<input type="date" required disabled={busy} value={to} onChange={e=>setTo(e.target.value)}/></label><ReportClock label="Đến giờ" value={toTime} disabled={busy} onChange={setToTime}/></div>
 <button className="primary" disabled={busy||!valid||!bandsValid||!online} type="submit">{'Xem Dashboard'}</button>
 <div className="dash-sales-filters"><div className="dash-filter-chips" aria-label="Hình thức bán">{[['all','Tất cả'],['takeaway','Mang về'],['dine','Ăn tại bàn']].map(([value,label])=><button key={value} type="button" aria-pressed={kind===value} onClick={()=>{setKind(value);setTable('all');}}>{label}</button>)}</div><label>Bàn / điểm bán<select aria-label="Bàn / điểm bán" value={table} onChange={e=>setTable(e.target.value)}><option value="all">Tất cả bàn / điểm bán</option>{options.filter(([id,name])=>kind==='all'||isTakeaway(name)===(kind==='takeaway')||data?.aggregate?.table_options.some(t=>t.table_id===id&&t.kinds.includes(kind))||data?.rows.some(s=>s.table_no===id&&matchesSale(s,kind,'all'))).map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><small>Thống kê theo bàn được ghi trên hóa đơn lúc thanh toán.</small></div>
 </form>
 <p className="dash-help">Giờ Việt Nam · Tính theo thời điểm thanh toán, gồm hết giây kết thúc đã chọn · Tối đa 366 ngày.</p>
 {!valid&&<p className="dash-alert" role="alert">Ngày giờ chưa hợp lệ hoặc khoảng chọn dài hơn 366 ngày.</p>}{error&&<p className="dash-alert" role="alert">{error}</p>}{stale&&<p className="dash-alert" role="status">Khoảng thời gian đã đổi. Bấm Xem Dashboard để cập nhật.</p>}
 <details className="dash-band-settings"><summary>Tùy chỉnh khung giờ · {bands.length} khung</summary><p>Mốc cuối không tính vào khung trước: 06–09 gồm 06:00:00 đến 08:59:59; 09:00:00 thuộc khung kế tiếp. Các khung phải theo thứ tự và không chồng nhau.</p><div className="dash-band-inputs">{bands.map((b,i)=><div key={i}><label>Từ<input aria-label={`Khung ${i+1} từ`} value={b.start} placeholder="06:00" maxLength={5} onChange={e=>setBands(bands.map((v,n)=>n===i?{...v,start:e.target.value}:v))}/></label><span>→</span><label>Đến<input aria-label={`Khung ${i+1} đến`} value={b.end} placeholder="09:00" maxLength={5} onChange={e=>setBands(bands.map((v,n)=>n===i?{...v,end:e.target.value}:v))}/></label><button type="button" aria-label={`Xóa khung ${i+1}`} disabled={bands.length===1} onClick={()=>setBands(bands.filter((_,n)=>n!==i))}>×</button></div>)}</div><div className="dash-band-actions"><button disabled={bands.length>=12} onClick={()=>setBands([...bands,{start:bands.at(-1)?.end??'06:00',end:'24:00'}])}>+ Thêm khung giờ</button><button onClick={()=>setBands(defaultBands)}>Khôi phục 7 khung ban đầu</button></div><small>Nhập HH:mm, có thể dùng 24:00 cho mốc cuối. Giờ nằm ngoài các khung vẫn được tính trong “Ngoài khung”.</small>{!bandsValid&&<p role="alert" className="dash-alert">Kiểm tra lại giờ bắt đầu/kết thúc. Tối đa 12 khung, không trùng hoặc chồng nhau.</p>}</details>
 {busy&&<LoadingIndicator label="Đang tổng hợp hóa đơn và đối chiếu số liệu"/>}
 {report&&previous&&<>
 <div className="dash-result-heading"><p>{reportPeriodLabel(report.from)} — {reportPeriodLabel(report.to)}<br/><small>{filterLabel}</small></p><div><button className="primary" disabled={busy||exporting} onClick={()=>void exportExcel()}><PosIcon name="download"/>{'Xuất Excel · tất cả khung'}</button></div></div>
 <dl className="dash-kpis">{[
 ['Thực thu',money(report.total),previous.total?`${((report.total-previous.total)/previous.total*100).toFixed(1)}% so với kỳ trước`:'Kỳ trước chưa có doanh thu để so sánh','report'],
 ['Số hóa đơn',String(report.invoices),`${previous.invoices} hóa đơn ở kỳ trước`,'invoice'],
 ['Lượt bán đã thanh toán',String(report.visits),'Một phiên tại một bàn = một lượt','guests'],
 ['Giá trị hóa đơn trung bình',money(report.invoices?Math.round(report.total/report.invoices):0),'Thực thu / số hóa đơn','audit']
 ].map(([label,value,hint,icon])=><div key={label}><dt>{label}<PosIcon name={icon as 'report'|'invoice'|'guests'|'audit'}/></dt><dd>{value}</dd><small>{hint}</small></div>)}</dl>
 {!report.invoices&&<p className="dash-empty">Chưa có hóa đơn đã thanh toán khớp bộ lọc này.</p>}
 <div className="dash-charts-grid"><article className="dash-card"><div className="dash-card-heading"><div><p className="dash-eyebrow">XU HƯỚNG</p><h3>Doanh thu theo ngày</h3></div><strong>{money(report.total)}</strong></div><TrendChart key={`${report.from}:${report.to}:${filterLabel}`} days={report.days} previous={report.from.endsWith('T00:00:00')&&report.to.endsWith('T23:59:59')?previous.days:[]}/><details><summary>Xem số liệu theo ngày</summary><div className="dash-table"><table><thead><tr><th>Ngày</th><th>Hóa đơn</th><th>Thực thu</th><th>Tiền mặt</th><th>Chuyển khoản</th></tr></thead><tbody>{report.days.map(d=><tr key={d.day}><td>{d.day.split('-').reverse().join('/')}</td><td>{d.invoices}</td><td>{money(d.total)}</td><td>{money(d.cash)}</td><td>{money(d.transfer)}</td></tr>)}</tbody></table></div></details><p className="dash-footnote">Kỳ trước: {reportPeriodLabel(previous.from)} — {reportPeriodLabel(previous.to)} · {money(previous.total)}. Chỉ so sánh dữ liệu còn được lưu. Đường biểu đồ kỳ trước hiển thị khi chọn trọn ngày.</p></article>
 <article className="dash-card"><p className="dash-eyebrow">DÒNG TIỀN BÁN HÀNG</p><h3>Cơ cấu thanh toán</h3><PaymentChart cash={report.cash} transfer={report.transfer}/><div className="dash-payment-summary"><span>Trước giảm giá <b>{money(report.gross)}</b></span><span>Giảm giá <b>{money(report.discount)}</b></span></div></article></div>
 <div className="dash-two-columns"><article className="dash-card"><div className="dash-card-heading"><div><p className="dash-eyebrow">NHỊP BÁN HÀNG</p><h3>Bán hàng theo khung giờ</h3></div><span className="dash-tag">Mốc cuối không bao gồm</span></div><div className="dash-slot-bars">{slots.map(slot=><div key={slot.name}><div><span>{slot.name}</span><strong>{money(slot.total)}</strong></div><div className="dash-bar"><i style={{width:`${slot.mainQty/maxMainQty*100}%`}}/></div><small>{slot.mainQty} phần món chính · {slot.invoices} hóa đơn</small></div>)}</div></article>
 <article className="dash-card"><div className="dash-card-heading"><div><p className="dash-eyebrow">THỰC ĐƠN</p><h3>Món bán chạy</h3></div><span className="dash-tag">Top 6 · Theo tiền món</span></div>{top.length?<ol className="dash-products">{top.map((p,i)=><li key={p.name}><span className="dash-rank">{String(i+1).padStart(2,'0')}</span><div><div><span>{p.name}</span><b>{money(p.gross)}</b></div><div className="dash-bar"><i style={{width:`${p.gross/Math.max(top[0].gross,1)*100}%`}}/></div><small>{p.qty} phần bán ra</small></div></li>)}</ol>:<p className="dash-empty">Chưa có món bán ra.</p>}<p className="dash-footnote">Tiền món trước giảm giá hóa đơn, chưa trừ chi phí.</p><details><summary>Xem toàn bộ món bán</summary><div className="dash-table"><table><thead><tr><th>Món</th><th>Số phần</th><th>Tiền món</th></tr></thead><tbody>{report.products.map(p=><tr key={p.name}><td>{p.name}</td><td>{p.qty}</td><td>{money(p.gross)}</td></tr>)}</tbody></table></div></details></article></div>
 <article className="dash-card dash-tables"><div className="dash-card-heading"><div><p className="dash-eyebrow">BÀN & MANG VỀ</p><h3>Điểm bán nào đang bán tốt?</h3></div><span className="dash-tag">{report.table_sales.length} điểm có bán</span></div><div className="dash-table"><table><thead><tr><th>Bàn / điểm bán</th><th>Lượt bán</th><th>Hóa đơn</th><th>Số phần</th><th>Thực thu</th><th>TB / lượt</th></tr></thead><tbody>{options.filter(([id,name])=>(table==='all'||String(id)===table)&&(kind==='all'||isTakeaway(name)===(kind==='takeaway')||data?.aggregate?.table_options.some(t=>t.table_id===id&&t.kinds.includes(kind))||data?.rows.some(s=>s.table_no===id&&matchesSale(s,kind,'all')))).map(([id,name])=>{const t=report.table_sales.find(row=>row.table_id===id);return <tr key={id}><td><strong>{t?.name??name}</strong></td><td>{t?.visits??0}</td><td>{t?.invoices??0}</td><td>{t?.qty??0}</td><td>{money(t?.total??0)}</td><td>{money(t?.visits?Math.round(t.total/t.visits):0)}</td></tr>;})}</tbody><tfoot><tr><th>Tổng khớp bộ lọc</th><th>{report.visits}</th><th>{report.invoices}</th><th>{report.products.reduce((n,p)=>n+p.qty,0)}</th><th>{money(report.total)}</th><th>{money(report.visits?Math.round(report.total/report.visits):0)}</th></tr></tfoot></table></div><p className="dash-footnote">Tách nhiều bill trong cùng một phiên tại một bàn vẫn tính 1 lượt. Đây là lượt có thanh toán trong khoảng chọn, không phải số lần gửi bếp hoặc số khách.</p></article>
 <div className="dash-insights"><article className="dash-card"><p className="dash-eyebrow">NGÀY NỔI BẬT</p><h3>Ngày bán tốt nhất</h3><strong>{best&&best.total>0?best.day.split('-').reverse().join('/'):'Chưa có dữ liệu'}</strong><p>{best&&best.total>0?`${money(best.total)} · ${best.invoices} hóa đơn`:'Chọn khoảng có doanh thu.'}</p></article><article className="dash-card"><p className="dash-eyebrow">GIỜ NỔI BẬT</p><h3>Khung giờ bán nhiều nhất</h3><strong>{peak&&peak.mainQty>0?peak.name:'Chưa có dữ liệu'}</strong><p>{peak&&peak.mainQty>0?`${peak.mainQty} phần món chính · ${peak.invoices} hóa đơn`:'Chọn khoảng có món chính đã bán.'}</p></article><article className="dash-card"><p className="dash-eyebrow">CÁCH ĐỌC SỐ LIỆU</p><h3>Doanh thu ≠ lợi nhuận</h3><p>Tính theo thời điểm thanh toán; chưa trừ nguyên liệu và chi phí vận hành. Dữ liệu đã dọn theo lịch 7 ngày không còn trong thống kê hoặc kỳ so sánh.</p></article></div>
 <p className="dash-updated">Cập nhật {stamp(report.generated_at)} · Làm mới bằng nút Xem Dashboard</p></>}
 <details className="dash-retention" onToggle={e=>{if(e.currentTarget.open)setRetentionLoaded(true);}}><summary>Lịch dọn dữ liệu · giữ 7 ngày gần nhất</summary>{retentionLoaded&&<SalesRetention/>}</details>
 </section>;
}
