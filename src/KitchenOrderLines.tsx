import {kitchenLines} from './order-model';
import type {Order,OrderLine} from './order-model';
import {fulfillmentSections,takeawayTitle} from './item-fulfillment';
import POSIcon from './pos/POSIcon';
function Lines({lines}:{lines:OrderLine[]}){return <ul>{lines.map(i=><li key={i.id} className={i.cancelled_at?'kitchen-cancelled-line':undefined}><strong>{i.qty} × {i.name}</strong>{i.cancelled_at&&<span className="kitchen-cancelled-label">Đã hủy</span>}{i.note&&<p className="item-note">{i.note}</p>}{i.note_edited_at&&<small className="note-edited-label">Đã chỉnh sửa</small>}</li>)}</ul>;}
export default function KitchenOrderLines({order,place}:{order:Order;place:string}){
 const sections=fulfillmentSections(kitchenLines(order));
 return sections.length<2?<Lines lines={sections[0]?.lines??[]}/>:<>{sections.map(section=><section key={String(section.takeaway)} className={`kitchen-service-section${section.takeaway?' is-takeaway':''}`}><h3>{section.takeaway&&<POSIcon name="bag"/>}{section.takeaway?takeawayTitle(place):'Ăn tại chỗ'}</h3><Lines lines={section.lines}/></section>)}</>;
}
