export type OrderLine = {note_version?:number;note_edited_at?:string|null;id:string; menu_item_id?:string|null; name:string; price:number; qty:number; category:string; note:string; paid:boolean; bill_no:number; cancelled_at?:string|null; cancel_reason?:string|null; kitchen_position?:number};
export type Order = {bill_transfer_origin?:string|null;service_label?:string;table_path?:number[];id:string; request_id:string; session_id:string; status:'cooking'|'done'; kitchen_relevant:boolean; created_at:string; order_items:OrderLine[]};
export type TableSession = {id:string; table_id:number; table_path?:number[]; orders:Order[]};
export function savedTotal(sessions:TableSession[], tableId:number){
 return sessions.filter(s=>s.table_id===tableId).reduce((sum,s)=>sum+s.orders.reduce((n,o)=>n+o.order_items.filter(i=>!i.paid&&!i.cancelled_at).reduce((v,i)=>v+i.price*i.qty,0),0),0);
}
export function tableStatus(sessions:TableSession[],tableId:number){
 const orders=sessions.filter(s=>s.table_id===tableId).flatMap(s=>s.orders).filter(o=>o.order_items.some(i=>!i.cancelled_at));
 return !orders.length?(tableId<0?'Chưa gọi món':'Trống'):orders.some(o=>o.kitchen_relevant&&o.status==='cooking')?'Bếp đang làm':'Đã ra món';
}
export function kitchenLines(order:Order){
 // Stable sorting keeps the existing order within each group and leaves stored lines unchanged.
 return order.order_items.filter(i=>i.category!=='do_uong')
  .sort((a,b)=>Number(b.category==='bun')-Number(a.category==='bun')||(a.kitchen_position!==undefined&&b.kitchen_position!==undefined?a.kitchen_position-b.kitchen_position:0));
}
export function fifo<T extends Order>(orders:T[]){return [...orders].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));}

export const placeLabel=(id:number)=>id<0?`Mang về #${-id}`:`Bàn ${id}`;
