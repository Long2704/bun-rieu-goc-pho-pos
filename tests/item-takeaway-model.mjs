import {kitchenLines} from '../src/order-model.ts';
import assert from 'node:assert/strict';
import {kitchenFulfillmentTitle,fulfillmentSections,takeawayTitle} from '../src/item-fulfillment.ts';
import {groupSavedOrders} from '../src/pos/saved-order-groups.ts';
import {aggregateSales,defaultBands} from '../src/dashboard-model.ts';
import {revenueWorkbook} from '../src/revenue-workbook.ts';
const line=(id,takeaway,extra={})=>({id,name:'Bún riêu',menu_item_id:'food',qty:1,price:58000,category:'bun',note:'Ít bún',paid:false,bill_no:1,is_takeaway:takeaway,...extra});
const a=line('a',false),b=line('b',true),c=line('c',true,{cancelled_at:'2026-11-12T00:00:00Z'}),drink=line('d',false,{category:'do_uong'});
assert.equal(kitchenFulfillmentTitle({order_items:[b,c,drink]},'Bàn 5'),'Bàn 5 (Mang về)');assert.equal(kitchenFulfillmentTitle({order_items:[a,b]},'Bàn 5'),'Bàn 5');assert.equal(takeawayTitle('Mang về 4'),'Mang về 4');
const hidden={...a,cancelled_at:'2026-11-12T00:00:00Z',cancelled_before_kitchen:true};assert.deepEqual(kitchenLines({order_items:[hidden,b,c]}).map(i=>i.id),['b','c']);assert.equal(kitchenFulfillmentTitle({order_items:[hidden,b]},'Bàn 5'),'Bàn 5 (Mang về)');
assert.deepEqual(fulfillmentSections([a,b,c]).map(s=>s.lines.map(i=>i.id)),[['a'],['b','c']]);
assert.equal(groupSavedOrders([{id:'o',status:'cooking',order_items:[a,b]}]).groups.length,2,'same dish with different service mode must not merge');
const completionGroups=groupSavedOrders([
 {id:'finished',status:'done',kitchen_relevant:true,is_draft:false,order_items:[a]},
 {id:'later',status:'cooking',kitchen_relevant:true,is_draft:false,order_items:[{...a,id:'later-line'}]},
 {id:'drink',status:'done',kitchen_relevant:false,is_draft:false,order_items:[drink]},
 {id:'pending',status:'cooking',kitchen_relevant:false,is_draft:true,order_items:[{...a,id:'pending-line'}]}
]);
const completionById=new Map(completionGroups.groups.flatMap(g=>g.rows.map(r=>[r.line.id,r.kitchenCompleted])));
assert.equal(completionById.get(a.id),true);assert.equal(completionById.get('later-line'),false);assert.equal(completionById.get(drink.id),false);assert.equal(completionById.get('pending-line'),false);
const sale=(id,label,items)=>{const gross=items.reduce((s,i)=>s+i.qty*i.price,0);return {id,session_id:id,table_no:5,service_label:label,paid_at:'2026-11-12T08:00:00+07:00',gross,total:gross,discount:0,method:'cash',bill_items:items};};
const items=[sale('1','Bàn 5',[line('1',false,{qty:2}),line('2',true)]),sale('2','Mang về 4',[line('3',false,{qty:2}),line('4',true)]),sale('3','Mang về 1',[line('5',undefined,{qty:2})]),sale('4','ABCD',[line('6',true)])];
const report=aggregateSales(items,'2026-11-12T00:00:00','2026-11-12T23:59:59',defaultBands,'Tất cả','2026-11-12T10:00:00Z');
const before=JSON.stringify({report,items});const file=revenueWorkbook(report,items,{menu:[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_active:true,sort:0}]});assert.equal(JSON.stringify({report,items}),before,'export does not mutate Dashboard data');
const bytes=file.bytes,decoder=new TextDecoder(),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let at=0,sheet='';
while(view.getUint32(at,true)===0x04034b50){const size=view.getUint32(at+18,true),names=view.getUint16(at+26,true),extra=view.getUint16(at+28,true),name=decoder.decode(bytes.slice(at+30,at+30+names)),start=at+30+names+extra;if(name==='xl/worksheets/sheet1.xml')sheet=decoder.decode(bytes.slice(start,start+size));at=start+size;}
const row=[...sheet.matchAll(/<row\b[^>]*r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].find(m=>m[2].includes('Mang về (tô)'));assert.ok(row);assert.ok(new RegExp('<c[^>]*r="I'+row[1]+'"[^>]*><v>5<\\/v>').test(row[2]),'1 mixed-table + 1 explicit takeaway + 2 legacy table-prefix + 1 custom-table takeaway, explicit false excluded');
console.log('PASS takeaway model/report: all/mixed kitchen labels, stable canceled lines, same-dish service separation, explicit true/false independent of table, legacy report fallback, exact 5 takeaway bowls and unchanged Dashboard data.');
