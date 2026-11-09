import type {RevenueDay,RevenueReport,RevenueSlot} from './revenue-export';
export type TimeBand={start:string;end:string};
export const defaultBands:TimeBand[]=[['06:00','09:00'],['09:00','11:00'],['11:00','13:00'],['13:00','15:00'],['15:00','17:00'],['17:00','22:00']].map(([start,end])=>({start,end}));
export type Sale={id:string;session_id:string;table_no:number;service_label?:string|null;paid_at:string;gross:number;discount:number;total:number;method:string;bill_items:{name:string;qty:number;price:number}[]};
export type TableSale={table_id:number;name:string;invoices:number;visits:number;qty:number;total:number};
export type DashboardReport=RevenueReport&{visits:number;table_sales:TableSale[];filter_label:string;slot_rules:string};
export const vnToday=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Ho_Chi_Minh',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function shiftDay(day:string,offset:number){return new Date(Date.parse(day+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);}
export function minute(value:string){if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)&&value!=='24:00')return NaN;const [h,m]=value.split(':').map(Number);return h*60+m;}
export function validBands(bands:TimeBand[]){return bands.length>0&&bands.length<=12&&bands.every((b,i)=>Number.isFinite(minute(b.start))&&minute(b.start)<minute(b.end)&&minute(b.end)<=1440&&(!i||minute(b.start)>=minute(bands[i-1].end)));}
export const bandLabel=(band:TimeBand)=>`${band.start}–${band.end}`;
export function bounds(from:string,to:string){const start=Date.parse(from+'+07:00'),end=Date.parse(to+'+07:00')+1000;return {start,end,previous:start-(end-start)};}
export function saleName(sale:Sale){return sale.service_label?.trim()||(sale.table_no<0?`Mang về #${-sale.table_no}`:`Bàn ${sale.table_no}`);}
export function isTakeaway(name:string){return /^mang\s+ve\b/.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());}
export function matchesSale(sale:Sale,kind:string,table:string){return (table==='all'||String(sale.table_no)===table)&&(kind==='all'||isTakeaway(saleName(sale))===(kind==='takeaway'));}
export function validateSale(sale:Sale){
 const integer=(n:number)=>Number.isSafeInteger(n)&&n>=0;
 if(!sale.id||!sale.session_id||!Number.isInteger(sale.table_no)||!Number.isFinite(Date.parse(sale.paid_at))||!['cash','transfer'].includes(sale.method)||![sale.gross,sale.discount,sale.total].every(integer)||sale.gross-sale.discount!==sale.total||!Array.isArray(sale.bill_items)||sale.bill_items.some(i=>typeof i.name!=='string'||!integer(i.price)||!Number.isSafeInteger(i.qty)||i.qty<=0)||sale.bill_items.reduce((sum,i)=>sum+i.price*i.qty,0)!==sale.gross)throw Error('Dữ liệu hóa đơn chưa đầy đủ hoặc không khớp tổng tiền. Chưa thể tổng hợp Dashboard.');
}
function empty(day:string):RevenueDay{return {day,invoices:0,gross:0,discount:0,total:0,cash:0,transfer:0};}
function add(row:RevenueDay,sale:Sale){row.invoices++;row.gross+=sale.gross;row.discount+=sale.discount;row.total+=sale.total;row.cash+=sale.method==='cash'?sale.total:0;row.transfer+=sale.method==='transfer'?sale.total:0;}
export function aggregateSales(sales:Sale[],from:string,to:string,bands:TimeBand[],filterLabel:string,generatedAt:string):DashboardReport{
 if(!validBands(bands))throw Error('Khung giờ không hợp lệ.');
 const range=bounds(from,to),rows=sales.filter(s=>Date.parse(s.paid_at)>=range.start&&Date.parse(s.paid_at)<range.end);
 const days=new Map<string,RevenueDay>(),slots:RevenueSlot[]=[],products=new Map<string,{name:string;qty:number;gross:number}>(),tables=new Map<number,TableSale&{sessions:Set<string>}>();
 for(let d=from.slice(0,10);d<=to.slice(0,10);d=shiftDay(d,1)){days.set(d,empty(d));[...bands.map(bandLabel),'Ngoài khung'].forEach((slot,i)=>slots.push({...empty(d),slot,slot_index:i+1}));}
 const slotMap=new Map(slots.map(s=>[`${s.day}:${s.slot_index}`,s]));
 const totals=empty('');const visits=new Set<string>();
 for(const sale of rows){
  validateSale(sale);const local=new Date(Date.parse(sale.paid_at)+7*3600000).toISOString(),day=local.slice(0,10),minutes=Number(local.slice(11,13))*60+Number(local.slice(14,16));
  const band=bands.findIndex(b=>minutes>=minute(b.start)&&minutes<minute(b.end));
  add(totals,sale);add(days.get(day)!,sale);add(slotMap.get(`${day}:${band<0?bands.length+1:band+1}`)!,sale);
  visits.add(`${sale.table_no}:${sale.session_id}`);
  let table=tables.get(sale.table_no);if(!table){table={table_id:sale.table_no,name:saleName(sale),invoices:0,visits:0,qty:0,total:0,sessions:new Set()};tables.set(sale.table_no,table);}
  table.name=saleName(sale);table.invoices++;table.total+=sale.total;table.sessions.add(sale.session_id);table.visits=table.sessions.size;
  for(const item of sale.bill_items){table.qty+=item.qty;const p=products.get(item.name)??{name:item.name,qty:0,gross:0};p.qty+=item.qty;p.gross+=item.price*item.qty;products.set(item.name,p);}
 }
 return {...totals,from,to,generated_at:generatedAt,products_complete:true,time_filter:true,slots_complete:true,slots,days:[...days.values()],products:[...products.values()].sort((a,b)=>b.gross-a.gross||a.name.localeCompare(b.name)),visits:visits.size,table_sales:[...tables.values()].map(({sessions:_,...t})=>t).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name)),filter_label:filterLabel,slot_rules:bands.map(bandLabel).join(', ')};
}
