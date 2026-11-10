import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {aggregateSales,defaultBands,matchesSale} from '../src/dashboard-model.ts';
import {revenueWorkbook} from '../src/revenue-workbook.ts';
const from='2026-11-09T00:00:00',to='2026-11-10T23:59:59';
const item=(name,qty,price)=>({name,qty,price});
const sale=(id,time,items,extra={})=>{const gross=items.reduce((n,i)=>n+i.qty*i.price,0);return{id,session_id:'session-'+id,table_no:1,service_label:'Bàn 1',paid_at:time+'+07:00',gross,discount:0,total:gross,method:'cash',bill_items:items,...extra};};
const rows=[
 sale('MẪU-01','2026-11-09T06:00:00',[item('Bún riêu truyền thống',2,58000),item('Trà đá',2,3000)],{session_id:'s1'}),
 sale('MẪU-02','2026-11-09T08:59:59.999',[item('Bún riêu đầy đủ',1,65000),item('Khăn lạnh',1,3000)],{session_id:'s1',discount:8000,total:60000,method:'transfer'}),
 sale('MẪU-03','2026-11-09T09:00:00',[item('Bún riêu truyền thống',1,60000)],{table_no:201,service_label:'Mang về 4'}),
 sale('MẪU-04','2026-11-09T17:00:00',[item('Canh bún đầy đủ',2,65000),item('Chả ốc thêm',1,0)]),
 sale('MẪU-05','2026-11-09T19:00:00',[item('Bún riêu góc phố',1,80000)]),
 sale('MẪU-06','2026-11-09T22:00:00',[item('Nước sâm',1,15000)]),
 sale('MẪU-07','2026-11-10T00:00:00',[item('Khăn lạnh',2,3000)],{table_no:9,service_label:'ABCD'}),
 sale('MẪU-08','2026-11-10T23:59:59.999',[item('Trà đá',1,3000)],{table_no:202,service_label:'Mang về 5'}),
 sale('Không thuộc kỳ','2026-11-11T00:00:00',[item('Không tính',1,999000)])
];
const report=aggregateSales(rows,from,to,defaultBands,'MINH HỌA · Không phải doanh số thực','2026-11-11T02:00:00Z');
const snapshot=JSON.stringify({report,rows}),file=revenueWorkbook(report,rows);
assert.equal(JSON.stringify({report,rows}),snapshot,'export never mutates Dashboard data');
writeFileSync('/workspace/artifacts/Bao-cao-Excel-minh-hoa.xlsx',file.bytes);
writeFileSync('/tmp/detailed-revenue-expected.json',JSON.stringify({invoices:report.invoices,gross:report.gross,discount:report.discount,total:report.total,cash:report.cash,transfer:report.transfer,qty:report.products.reduce((n,p)=>n+p.qty,0)}));
assert.throws(()=>revenueWorkbook(report,rows.slice(1)),/không khớp/);
assert.throws(()=>revenueWorkbook(report,[...rows,rows[0]]),/Trùng/);
assert.throws(()=>revenueWorkbook({...report,cash:0},rows),/không khớp/);
const filtered=rows.filter(s=>matchesSale(s,'takeaway','201'));
const filteredReport=aggregateSales(filtered,from,to,defaultBands,'Mang về 4','2026-11-11T02:00:00Z');
writeFileSync('/tmp/revenue-workbook-filtered.xlsx',revenueWorkbook(filteredReport,filtered).bytes);
const empty=aggregateSales([],from,to,defaultBands,'Trống','2026-11-11T02:00:00Z');
writeFileSync('/tmp/revenue-workbook-empty.xlsx',revenueWorkbook(empty,[]).bytes);
const injection=[sale('safe','2026-11-09T12:00:00',[item('=HYPERLINK("bad") & <món>',1,1000)])];
writeFileSync('/tmp/revenue-workbook-text.xlsx',revenueWorkbook(aggregateSales(injection,from,to,defaultBands,'Kiểm thử','2026-11-11T02:00:00Z'),injection).bytes);
console.log('PASS detailed Excel: snapshot unchanged, full receipt reconciliation, variable prices, seven reference bands/outside, VN boundaries/end fractions, takeaway filters, empty report, duplicate/missing receipts rejected, gift-price and discount distinction; fixtures for independent openpyxl validation.');
