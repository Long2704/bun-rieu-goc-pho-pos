import type {Order,OrderLine} from './order-model';
export function kitchenFulfillmentTitle(order:Pick<Order,'order_items'>,place:string){
 const lines=order.order_items.filter(i=>i.category!=='do_uong');
 return lines.length&&lines.every(i=>i.is_takeaway)?takeawayTitle(place):place;
}
export function takeawayTitle(place:string){return /^mang\s+ve\b/i.test(place.normalize('NFD').replace(/[\u0300-\u036f]/g,''))||/\(Mang về\)$/.test(place)?place:`${place} (Mang về)`;}
export function fulfillmentSections(lines:OrderLine[]){return [{takeaway:false,lines:lines.filter(i=>!i.is_takeaway)},{takeaway:true,lines:lines.filter(i=>i.is_takeaway)}].filter(section=>section.lines.length);}
