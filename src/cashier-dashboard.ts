import type {TimeBand} from './dashboard-model';
export type QuantityProduct={name:string;qty:number};
export type QuantitySlot={slot:string;slot_index:number;invoices:number;qty:number;main_qty:number};
export type QuantityTable={table_id:number;name:string;visits:number;invoices:number;qty:number};
export type CashierDashboard={from:string;to:string;generated_at:string;kind:string;table_id:number|null;invoices:number;visits:number;qty:number;slots:QuantitySlot[];products:QuantityProduct[];product_slots:{name:string;slot_index:number;qty:number}[];table_sales:QuantityTable[];table_options:{table_id:number;name:string}[];days:{day:string;invoices:number;qty:number}[]};
const integer=(n:unknown):n is number=>Number.isSafeInteger(n)&&Number(n)>=0;
const name=(s:unknown):s is string=>typeof s==='string'&&s.trim().length>0;
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const keys=(v:unknown,fields:string[])=>record(v)&&Object.keys(v).length===fields.length&&Object.keys(v).every(k=>fields.includes(k));
const unique=(items:unknown[])=>new Set(items).size===items.length;
const sum=(items:number[])=>items.reduce((n,x)=>n+x,0);
export function validateCashierDashboard(value:unknown,bands:TimeBand[]):CashierDashboard{
 const r=value as CashierDashboard;
 const fail=()=>{throw Error('Dữ liệu báo cáo chưa đầy đủ hoặc không khớp. Bấm Xem Dashboard để tải lại.');};
 if(!keys(r,['from','to','generated_at','kind','table_id','invoices','visits','qty','slots','products','product_slots','table_sales','table_options','days'])||typeof r.from!=='string'||typeof r.to!=='string'||!Number.isFinite(Date.parse(r.generated_at))||!['all','takeaway','dine'].includes(r.kind)||r.table_id!==null&&!Number.isInteger(r.table_id)||![r.invoices,r.visits,r.qty].every(integer)||r.visits>r.invoices)fail();
 const labels=[...bands.map(b=>`${b.start}–${b.end}`),'Ngoài khung'];
 if(!Array.isArray(r.slots)||r.slots.length!==labels.length||r.slots.some((s,i)=>!keys(s,['slot','slot_index','invoices','qty','main_qty'])||s.slot_index!==i+1||s.slot!==labels[i]||![s.invoices,s.qty,s.main_qty].every(integer)||s.main_qty>s.qty||s.invoices===0&&s.qty!==0))fail();
 if(!Array.isArray(r.products)||r.products.some(p=>!keys(p,['name','qty'])||!name(p.name)||!integer(p.qty)||!p.qty)||!unique(r.products.map(p=>p.name)))fail();
 if(!Array.isArray(r.table_sales)||r.table_sales.some(t=>!keys(t,['table_id','name','visits','invoices','qty'])||!Number.isInteger(t.table_id)||!name(t.name)||![t.invoices,t.visits,t.qty].every(integer)||!t.invoices||!t.visits||t.visits>t.invoices)||!unique(r.table_sales.map(t=>t.table_id)))fail();
 if(!Array.isArray(r.table_options)||r.table_options.some(t=>!keys(t,['table_id','name'])||!Number.isInteger(t.table_id)||!name(t.name))||!unique(r.table_options.map(t=>t.table_id)))fail();
 if(!Array.isArray(r.days)||r.days.some(d=>!keys(d,['day','invoices','qty'])||!/^\d{4}-\d{2}-\d{2}$/.test(d.day)||![d.invoices,d.qty].every(integer)||!d.invoices)||!unique(r.days.map(d=>d.day)))fail();
 if(!Array.isArray(r.product_slots)||r.product_slots.some(p=>!keys(p,['name','slot_index','qty'])||!r.products.some(x=>x.name===p.name)||!integer(p.slot_index)||p.slot_index<1||p.slot_index>labels.length||!integer(p.qty)||!p.qty)||!unique(r.product_slots.map(p=>JSON.stringify([p.name,p.slot_index]))))fail();
 if(sum(r.slots.map(s=>s.invoices))!==r.invoices||sum(r.slots.map(s=>s.qty))!==r.qty||sum(r.products.map(p=>p.qty))!==r.qty||sum(r.table_sales.map(t=>t.invoices))!==r.invoices||sum(r.table_sales.map(t=>t.visits))!==r.visits||sum(r.table_sales.map(t=>t.qty))!==r.qty||sum(r.days.map(d=>d.invoices))!==r.invoices||sum(r.days.map(d=>d.qty))!==r.qty)fail();
 if(r.products.some(p=>sum(r.product_slots.filter(s=>s.name===p.name).map(s=>s.qty))!==p.qty)||r.slots.some(s=>sum(r.product_slots.filter(p=>p.slot_index===s.slot_index).map(p=>p.qty))!==s.qty))fail();
 // Ranking is quantity-based. No financial ordering can leak through the bars.
 return {...r,products:[...r.products].sort((a,b)=>b.qty-a.qty||a.name.localeCompare(b.name,'vi'))};
}
