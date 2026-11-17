import {kitchenLines} from './order-model';
import type {Order,OrderLine} from './order-model';
import {fulfillmentSections,takeawayTitle} from './item-fulfillment';
import POSIcon from './pos/POSIcon';
function Lines({lines,staffName}:{lines:OrderLine[];staffName?:string}){return <ul>{lines.map((i,index)=>{
 const author=index===lines.length-1?staffName:undefined;
 const title=<><strong>{i.qty} × {i.name}</strong>{i.cancelled_at&&<span className="kitchen-cancelled-label">Đã hủy</span>}</>;
 return <li key={i.id} className={i.cancelled_at?'kitchen-cancelled-line':undefined}>{author?<div className={`kitchen-line-with-staff${i.note?' has-note':''}`}><div className="kitchen-line-title">{title}</div>{i.note&&<p className="item-note">{i.note}</p>}{i.note_edited_at&&<small className="note-edited-label">Đã chỉnh sửa</small>}<p className="kitchen-order-staff">{author}</p></div>:<>{title}{i.note&&<p className="item-note">{i.note}</p>}{i.note_edited_at&&<small className="note-edited-label">Đã chỉnh sửa</small>}</>}</li>;
 })}</ul>;}
export default function KitchenOrderLines({order,place}:{order:Order;place:string}){
 const sections=fulfillmentSections(kitchenLines(order)),name=order.ordered_by_name?.trim(),staffName=name==='Chủ quán Bún Riêu Góc Phố'?'Admin':name;
 if(!sections.length)return staffName?<p className="kitchen-order-staff">{staffName}</p>:null;
 return sections.length<2?<Lines lines={sections[0].lines} staffName={staffName}/>:<>{sections.map((section,index)=><section key={String(section.takeaway)} className={`kitchen-service-section${section.takeaway?' is-takeaway':''}`}><h3>{section.takeaway&&<POSIcon name="bag"/>}{section.takeaway?takeawayTitle(place):'Ăn tại chỗ'}</h3><Lines lines={section.lines} staffName={index===sections.length-1?staffName:undefined}/></section>)}</>;
}
