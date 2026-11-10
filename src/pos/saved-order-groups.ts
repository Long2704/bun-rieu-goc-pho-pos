import type {Order,OrderLine} from '../order-model';
export type SavedSource={orderId:string;status:Order['status'];line:OrderLine};
export type SavedGroup={pending?:boolean;key:string;billNo:number;productId:string|null;name:string;category:string;qty:number;amount:number;rows:SavedSource[]};
export function groupSavedOrders(orders:Order[],separateSelections=false){
 const groups=new Map<string,SavedGroup>(),history:SavedSource[]=[];
 for(const order of orders)for(const line of order.order_items){
  const source={orderId:order.id,status:order.status,line};
  if(line.paid||line.cancelled_at){history.push(source);continue;}
  const productId=line.menu_item_id??null,billNo=line.bill_no??1,key=`bill:${billNo}:${productId??`line:${line.id}`}${separateSelections?`:order:${order.id}`:''}`;
  let group=groups.get(key);
  if(!group){group={pending:!!order.is_draft,key,billNo,productId,name:line.name,category:line.category,qty:0,amount:0,rows:[]};groups.set(key,group);}
  group.name=line.name;group.category=line.category;group.qty+=line.qty;group.amount+=line.price*line.qty;group.rows.push(source);
 }
 return {groups:[...groups.values()].sort((a,b)=>a.billNo-b.billNo),history};
}
