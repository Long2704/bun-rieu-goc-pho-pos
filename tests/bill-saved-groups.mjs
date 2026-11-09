import assert from 'node:assert/strict';
import {groupSavedOrders} from '../src/pos/saved-order-groups.ts';
const line=(id,bill,qty=1,extra={})=>({id,menu_item_id:'food',name:'Bún riêu',price:58000,qty,note:'Ít bún',category:'bun',paid:false,bill_no:bill,...extra});
const orders=[{id:'order',request_id:'request',session_id:'session',created_at:'2026-11-09',status:'cooking',kitchen_relevant:true,order_items:[line('b2',2,2),line('b1',1),line('b2-extra',2),line('paid',3,1,{paid:true}),line('cancelled',1,1,{cancelled_at:'2026-11-09'}),line('missing1',1,1,{menu_item_id:null}),line('missing2',1,1,{menu_item_id:null})]}];
const before=structuredClone(orders);const {groups,history}=groupSavedOrders(orders);
assert.equal(groups.filter(g=>g.productId==='food').length,2,'same product in distinct bills stays separate');
assert.deepEqual(groups.filter(g=>g.productId==='food').map(g=>({bill:g.billNo,qty:g.qty,amount:g.amount})),[{bill:1,qty:1,amount:58000},{bill:2,qty:3,amount:174000}]);
assert.equal(groups.filter(g=>g.productId===null).length,2);assert.equal(history.length,2);assert.equal(new Set(groups.map(g=>g.key)).size,groups.length);assert.deepEqual(orders,before);
console.log('PASS bill-aware saved grouping: same product separated across bills, quantities/subtotals within bill, paid/cancelled excluded, missing product IDs kept separate, stable source data.');
