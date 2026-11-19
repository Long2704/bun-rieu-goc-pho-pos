import {supabase} from './supabase';
import {bounds,bandLabel,shiftDay} from './dashboard-model';
import type {DashboardReport,TimeBand} from './dashboard-model';
export type AdminDashboard={version:1;kind:string;table_id:number|null;current:DashboardReport;previous:DashboardReport;table_options:{table_id:number;name:string;has_label?:boolean;kinds:string[]}[]};
const keys=['invoices','gross','discount','total','cash','transfer'] as const;
const num=(v:unknown)=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0;
const local=(ms:number)=>new Date(ms+7*3600000).toISOString().slice(0,19);
export function validateAdminDashboard(value:unknown,from:string,to:string,bands:TimeBand[],kind:string,table:number|null):AdminDashboard{
 const d=value as AdminDashboard,range=bounds(from,to);
 if(!d||d.version!==1||d.kind!==kind||d.table_id!==table||!Array.isArray(d.table_options)||d.table_options.some(t=>!t||!Number.isInteger(t.table_id)||typeof t.name!=='string'||t.has_label!==undefined&&typeof t.has_label!=='boolean'||!Array.isArray(t.kinds)||t.kinds.some(k=>!['dine','takeaway'].includes(k)))||new Set(d.table_options.map(t=>t.table_id)).size!==d.table_options.length)throw Error('Báo cáo không khớp bộ lọc.');
 for(const [r,a,z] of [[d.current,from,to],[d.previous,local(range.previous),local(range.start-1000)]] as const){
  if(!r||r.from!==a||r.to!==z||!Number.isFinite(Date.parse(r.generated_at))||r.products_complete!==true||r.slots_complete!==true||!keys.every(k=>num(r[k]))||!num(r.visits)||!Array.isArray(r.days)||!Array.isArray(r.slots)||!Array.isArray(r.products)||!Array.isArray(r.table_sales))throw Error('Thiếu số liệu báo cáo.');
  const dates:string[]=[];for(let day=a.slice(0,10);day<=z.slice(0,10);day=shiftDay(day,1))dates.push(day);
  const labels=[...bands.map(bandLabel),'Ngoài khung'];
  if((r as DashboardReport&{sparse?:boolean}).sparse===true){
   const allowed=new Set(dates),days=new Map(r.days.map(v=>[v?.day,v])),slots=new Map(r.slots.map(v=>[`${v?.day}:${v?.slot_index}`,v]));
   if(days.size!==r.days.length||slots.size!==r.slots.length||r.days.some(v=>!v||!allowed.has(v.day))||r.slots.some(v=>!v||!allowed.has(v.day)||!Number.isInteger(v.slot_index)||v.slot_index<1||v.slot_index>labels.length||v.slot!==labels[v.slot_index-1]))throw Error('Ngày hoặc khung giờ không hợp lệ.');
   const zero=(day:string)=>({day,invoices:0,gross:0,discount:0,total:0,cash:0,transfer:0});
   r.days=dates.map(day=>days.get(day)??zero(day));
   r.slots=dates.flatMap(day=>labels.map((slot,i)=>slots.get(`${day}:${i+1}`)??{...zero(day),slot,slot_index:i+1,main_qty:0}));
   delete (r as DashboardReport&{sparse?:boolean}).sparse;
  }

  if(r.days.length!==dates.length||r.slots.length!==dates.length*labels.length||r.days.some((v,i)=>v.day!==dates[i]||!keys.every(k=>num(v[k])))||r.slots.some((v,i)=>v.day!==dates[Math.floor(i/labels.length)]||v.slot_index!==i%labels.length+1||v.slot!==labels[i%labels.length]||!num(v.main_qty)||v.invoices===0&&v.main_qty!==0||!keys.every(k=>num(v[k]))))throw Error('Thiếu ngày hoặc khung giờ.');
  for(const k of keys)if(r.days.reduce((s,v)=>s+v[k],0)!==r[k]||r.slots.reduce((s,v)=>s+v[k],0)!==r[k])throw Error('Tổng ngày/giờ không khớp.');
  for(const [i,day] of r.days.entries())for(const k of keys)if(r.slots.slice(i*labels.length,(i+1)*labels.length).reduce((n,s)=>n+s[k],0)!==day[k])throw Error('Khung giờ không khớp ngày.');
  if([...r.days,...r.slots].some(v=>v.gross-v.discount!==v.total||v.cash+v.transfer!==v.total))throw Error('Số tiền ngày/giờ không khớp.');
  if(r.gross-r.discount!==r.total||r.cash+r.transfer!==r.total||r.products.some(p=>typeof p.name!=='string'||!num(p.qty)||!num(p.gross))||new Set(r.products.map(p=>p.name)).size!==r.products.length||r.products.reduce((s,p)=>s+p.gross,0)!==r.gross||r.table_sales.some(t=>!Number.isInteger(t.table_id)||typeof t.name!=='string'||![t.invoices,t.visits,t.qty,t.total].every(num))||new Set(r.table_sales.map(t=>t.table_id)).size!==r.table_sales.length||r.table_sales.reduce((s,t)=>s+t.total,0)!==r.total||r.table_sales.reduce((s,t)=>s+t.invoices,0)!==r.invoices||r.table_sales.reduce((s,t)=>s+t.visits,0)!==r.visits||r.table_sales.reduce((s,t)=>s+t.qty,0)!==r.products.reduce((s,p)=>s+p.qty,0))throw Error('Tổng báo cáo không khớp.');
  r.products.sort((a,b)=>b.gross-a.gross||a.name.localeCompare(b.name));r.table_sales.sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));
  r.slot_rules=bands.map(bandLabel).join(', ');
 }
 return d;
}
export async function loadAdminDashboard(from:string,to:string,bands:TimeBand[],kind:string,table:string,signal:AbortSignal){
 if(!supabase)throw Error('Chưa kết nối dữ liệu.');
 const id=table==='all'?null:Number(table),r=await supabase.rpc('admin_dashboard_window',{p_from_local:from,p_to_local:to,p_bands:bands,p_kind:kind,p_table:id}).abortSignal(signal);
 if(r.error)throw Error('Không tải được báo cáo tổng hợp. Kiểm tra kết nối rồi thử lại.');
 return validateAdminDashboard(r.data,from,to,bands,kind,id);
}
