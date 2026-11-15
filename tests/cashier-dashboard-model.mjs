import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {validateCashierDashboard} from '../src/cashier-dashboard.ts';
import {cashierQuantityCsv,cashierQuantityWorkbook} from '../src/cashier-report-export.ts';
const bands=[{start:'06:00',end:'09:00'},{start:'09:00',end:'24:00'}];
const sample={from:'2026-11-15T00:00:00',to:'2026-11-15T23:59:59',generated_at:'2026-11-15T12:00:00Z',kind:'all',table_id:null,invoices:2,visits:1,qty:3,slots:[{slot:'06:00–09:00',slot_index:1,invoices:1,qty:2},{slot:'09:00–24:00',slot_index:2,invoices:1,qty:1},{slot:'Ngoài khung',slot_index:3,invoices:0,qty:0}],products:[{name:'Bún & <đặc biệt>',qty:1},{name:'=SUM(A1:A2)',qty:2}],product_slots:[{name:'=SUM(A1:A2)',slot_index:1,qty:2},{name:'Bún & <đặc biệt>',slot_index:2,qty:1}],table_sales:[{table_id:1,name:'Bàn 1',visits:1,invoices:2,qty:3}],table_options:[{table_id:1,name:'Bàn 1'}],days:[{day:'2026-11-15',invoices:2,qty:3}]};
const report=validateCashierDashboard(sample,bands);assert.equal(report.products[0].qty,2);
for(const mutate of [v=>v.total=58000,v=>v.products[0].price=58000,v=>v.slots[0].qty++,v=>v.product_slots.pop(),v=>v.products.push({...v.products[0]}),v=>v.table_sales[0].visits=4,v=>v.slots[0].slot='06:00–10:00']){const invalid=structuredClone(sample);mutate(invalid);assert.throws(()=>validateCashierDashboard(invalid,bands));}
const empty={...sample,invoices:0,visits:0,qty:0,slots:sample.slots.map(s=>({...s,invoices:0,qty:0})),products:[],product_slots:[],table_sales:[],days:[]};validateCashierDashboard(empty,bands);
const csv=cashierQuantityCsv(report,'Tất cả');assert.ok(csv.includes("'=SUM(A1:A2)"));assert.ok(!/Thực thu|Đơn giá|Thành tiền|Tiền món/.test(csv));
const workbook=cashierQuantityWorkbook(report,'Tất cả');assert.ok(!workbook.filename.includes(':'));writeFileSync('/workspace/artifacts/cashier-dashboard-safe-export.xlsx',workbook.bytes);
console.log('PASS cashier dashboard model/export: strict quantity-only shape, reconciled slot/product/table totals, empty results, quantity ranking, formula-safe CSV and typed-text XLSX fixture.');
