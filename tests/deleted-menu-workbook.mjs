import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {aggregateSales,defaultBands} from '../src/dashboard-model.ts';
import {revenueWorkbook} from '../src/revenue-workbook.ts';
const sales=[{id:'old-bill',session_id:'old-session',table_no:9,service_label:'Bàn đã xóa',paid_at:'2026-11-25T09:30:00+07:00',gross:122000,discount:12000,total:110000,method:'cash',bill_items:[{name:'Món chính đã xóa',category:'bun',qty:2,price:58000,is_takeaway:true},{name:'Trà đã xóa',category:'do_uong',qty:2,price:3000}]}];
const report=aggregateSales(sales,'2026-11-25T00:00:00','2026-11-25T23:59:59',defaultBands,'Tất cả','2026-11-25T10:00:00Z');
assert.equal(report.slots.find(s=>s.slot_index===2).main_qty,2);assert.equal(report.total,110000);
writeFileSync('/tmp/deleted-menu-workbook.xlsx',revenueWorkbook(report,sales,{menu:[]}).bytes);
execFileSync('python3',['-c',`import openpyxl
s=openpyxl.load_workbook('/tmp/deleted-menu-workbook.xlsx',data_only=True).active
rows={r[0]:r for r in s.iter_rows(values_only=True) if isinstance(r[0],str)}
assert rows['Món chính đã xóa †'][-3:]==(2,58000,116000)
assert rows['Trà đã xóa †'][-3:]==(2,3000,6000)
assert rows['TỔNG MÓN CHÍNH'][-3]==2
assert rows['TỔNG MÓN CHÍNH'][-1]==122000
assert rows['Mang về (tô)'][-3]==2
assert rows['Tiền món theo hóa đơn'][-1]==122000
assert rows['Chênh lệch giá menu / hóa đơn'][-1]==0
`]);
console.log('PASS deleted catalog Excel: historical name/price/category and takeaway quantities retained; main-only totals and money reconcile after all menu rows removed.');
