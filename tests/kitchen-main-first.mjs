import assert from 'node:assert/strict';
import {kitchenLines,fifo} from '../src/order-model.ts';

const line=(id,category,extra={})=>({id,name:id,category,price:65000,qty:2,note:'Ít hành',paid:false,bill_no:1,...extra});
const order={id:'ticket-2',request_id:'request-2',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T02:00:00Z',order_items:[
 line('Bún thêm','an_them'),
 line('Bún riêu đầy đủ','bun'),
 line('Trà đá','do_uong'),
 line('Giò khoanh','an_them'),
 line('Canh bún truyền thống','bun',{paid:true}),
 line('Món chính đã hủy','bun',{cancelled_at:'2026-11-09T02:01:00Z'}),
 line('Chả ốc','an_them',{note:'Để riêng'}),
 line('Bún riêu góc phố','bun'),
 line('Món chưa phân nhóm','other'),
 line('Món thêm đã hủy','an_them',{cancelled_at:'2026-11-09T02:01:00Z'}),
]};
const before=structuredClone(order);
const expected=['Bún riêu đầy đủ','Canh bún truyền thống','Món chính đã hủy','Bún riêu góc phố','Bún thêm','Giò khoanh','Chả ốc','Món chưa phân nhóm','Món thêm đã hủy'];
for(const status of ['cooking','done']){
 const result=kitchenLines({...order,status});
 assert.deepEqual(result.map(i=>i.id),expected);
 for(const item of result)assert.strictEqual(item,order.order_items.find(i=>i.id===item.id),'preserve quantity, note, price and payment state');
}
const positioned={...order,order_items:order.order_items.map((i,n)=>({...i,kitchen_position:n+1}))};
assert.deepEqual(kitchenLines({...positioned,order_items:[...positioned.order_items].reverse()}).map(i=>i.id),expected,'stored kitchen position survives changed database row order');
assert.deepEqual(order,before,'never reorder the stored order');
assert.deepEqual(kitchenLines({...order,order_items:[]}),[]);
assert.deepEqual(kitchenLines({...order,order_items:[line('Nước','do_uong')]}),[]);
assert.deepEqual(kitchenLines({...order,order_items:[line('Giò','an_them'),line('Bún','an_them')]}).map(i=>i.id),['Giò','Bún']);
const older={...order,id:'ticket-1',created_at:'2026-11-09T01:00:00Z'};
assert.deepEqual(fifo([order,older]).map(o=>o.id),['ticket-1','ticket-2'],'ticket FIFO unchanged');
console.log('PASS: main dishes before sides, stable groups, notes/qty/paid preserved, cancelled retained, drinks excluded, active/history, no source mutation, ticket FIFO.');
