import type {RevenueReport,RevenueSlot} from './revenue-export';
import type {Sale} from './dashboard-model';
// Match the existing Dashboard classification without changing its aggregation or filters.
const isTakeaway=(name:string)=>/^mang\s+ve\b/.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
const saleName=(sale:Sale)=>sale.service_label?.trim()||(sale.table_no<0?`Mang về #${-sale.table_no}`:`Bàn ${sale.table_no}`);
const bounds=(from:string,to:string)=>({start:Date.parse(from+'+07:00'),end:Date.parse(to+'+07:00')+1000});
function validateSale(sale:Sale){
 if(!sale.id||!sale.session_id||!Number.isFinite(Date.parse(sale.paid_at))||!['cash','transfer'].includes(sale.method)||![sale.gross,sale.discount,sale.total].every(n=>Number.isSafeInteger(n)&&n>=0)||sale.gross-sale.discount!==sale.total||!Array.isArray(sale.bill_items)||sale.bill_items.some(i=>typeof i.name!=='string'||!Number.isSafeInteger(i.qty)||i.qty<=0||!Number.isSafeInteger(i.price)||i.price<0)||sale.bill_items.reduce((n,i)=>n+i.qty*i.price,0)!==sale.gross)throw Error('Chi tiết hóa đơn không hợp lệ');
}
type Cell=string|number;
type XCell={value:Cell;style?:number};
type Sheet={name:string;rows:XCell[][];merges?:string[];widths?:number[];freeze?:{rows:number;cols:number};filter?:string;landscape?:boolean;printTitles?:string;moneyColumns?:number[]};
const xml=(s:string)=>s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const enc=new TextEncoder();
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes:Uint8Array){let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;}
// OOXML ZIP with stored entries: small reports need no runtime dependency or CDN.
function zip(files:[string,string][]):Uint8Array{
 const chunks:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 for(const [name,content] of files){const n=enc.encode(name),data=enc.encode(content),sum=crc(data),header=new Uint8Array(30+n.length),h=new DataView(header.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,sum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,n.length,true);header.set(n,30);chunks.push(header,data);
  const c=new Uint8Array(46+n.length),v=new DataView(c.buffer);v.setUint32(0,0x02014b50,true);v.setUint16(4,20,true);v.setUint16(6,20,true);v.setUint16(8,0x800,true);v.setUint16(14,33,true);v.setUint32(16,sum,true);v.setUint32(20,data.length,true);v.setUint32(24,data.length,true);v.setUint16(28,n.length,true);v.setUint32(42,offset,true);c.set(n,46);central.push(c);offset+=header.length+data.length;
 }
 const end=new Uint8Array(22),e=new DataView(end.buffer),size=central.reduce((n,b)=>n+b.length,0);e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,size,true);e.setUint32(16,offset,true);
 const out=new Uint8Array(offset+size+22);let at=0;for(const b of [...chunks,...central,end]){out.set(b,at);at+=b.length;}return out;
}
function column(n:number):string{let s='';for(n++;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;}
const cell=(value:Cell,style=0):XCell=>({value,style});
const money=(n:number)=>cell(n,3);
const number=(n:number)=>cell(n,2);
const vnDay=(day:string)=>{const [y,m,d]=day.slice(0,10).split('-');return `${d}/${m}/${y}`;};
const localTime=(stamp:string)=>new Date(Date.parse(stamp)+7*3600000).toISOString().slice(0,19).replace('T',' ');
const stamp=(report:RevenueReport)=>new Date(report.generated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const PERIOD_BANDS=[['06:00','09:00'],['09:00','11:00'],['11:00','13:00'],['13:00','15:00'],['15:00','17:00'],['17:00','19:00'],['19:00','22:00']];
const BAND_LABELS=[...PERIOD_BANDS.map(([a,b])=>`${a}–${b}`),'Ngoài khung'];
const keys=['invoices','gross','discount','total','cash','transfer'] as const;
const financialHeaders=['Số hóa đơn','Tiền món (VND)','Giảm giá (VND)','Thực thu (VND)','Tiền mặt (VND)','Chuyển khoản (VND)'];
const sum=(values:number[])=>{const n=values.reduce((a,b)=>a+b,0);if(!Number.isSafeInteger(n))throw Error('Tổng vượt giới hạn số an toàn');return n;};
function heading(title:string,report:RevenueReport,columns:number,subtitle?:string):Pick<Sheet,'rows'|'merges'>{
 return {rows:[[cell(title,13)],[cell(`${vnDay(report.from)} → ${vnDay(report.to)} · ${report.filter_label??'Tất cả'} · Giờ Việt Nam`,5)],[cell(subtitle??`BÚN RIÊU GÓC PHỐ · Xuất lúc ${stamp(report)}`,5)],[]],merges:[`A1:${column(columns-1)}1`,`A2:${column(columns-1)}2`,`A3:${column(columns-1)}3`]};
}
function tableSheet(name:string,title:string,report:RevenueReport,headers:string[],values:Cell[][],widths:number[],moneyColumns:number[]=[],total?:Cell[]):Sheet{
 const h=heading(title,report,headers.length),rows=h.rows;
 rows.push(headers.map(v=>cell(v,1)));
 values.forEach((row,i)=>rows.push(row.map((v,c)=>cell(v,typeof v==='number'?(moneyColumns.includes(c)?(i%2?12:3):(i%2?11:2)):(i%2?10:0)))));
 const end=rows.length;if(total)rows.push(total.map((v,c)=>cell(v,typeof v==='number'?(moneyColumns.includes(c)?8:7):6)));
 return {name,rows,merges:h.merges,widths,freeze:{rows:5,cols:1},filter:`A5:${column(headers.length-1)}${Math.max(5,end)}`,landscape:true,printTitles:'$1:$5'};
}
function worksheet(sheet:Sheet):string{
 if(sheet.rows.length>1048576)throw Error('Báo cáo vượt giới hạn dòng Excel');
 const maxCols=Math.max(...sheet.rows.map(r=>r.length),...sheet.widths?.map((_,i)=>i+1)??[1]),last=column(maxCols-1)+sheet.rows.length,f=sheet.freeze??{rows:5,cols:1};
 const pane=`<pane xSplit="${f.cols}" ySplit="${f.rows}" topLeftCell="${column(f.cols)}${f.rows+1}" activePane="${f.cols?'bottomRight':'bottomLeft'}" state="frozen"/>`;
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:'+last+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">'+pane+'</sheetView></sheetViews><sheetFormatPr defaultRowHeight="23"/><cols>'+Array.from({length:maxCols},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${sheet.widths?.[i]??18}" customWidth="1"/>`).join('')+'</cols><sheetData>'+sheet.rows.map((row,r)=>`<row r="${r+1}" ht="${r===0?34:r===1||r===2?25:r===4?38:25}" customHeight="1">`+row.map((c,i)=>{const ref=column(i)+(r+1),s=c.style??0;if(typeof c.value==='number'){if(!Number.isSafeInteger(c.value))throw Error('Số liệu không hợp lệ');return `<c r="${ref}" s="${s}" t="n"><v>${c.value}</v></c>`;}return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.value)}</t></is></c>`;}).join('')+'</row>').join('')+'</sheetData>'+(sheet.filter?`<autoFilter ref="${sheet.filter}"/>`:'')+(sheet.merges?.length?`<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:'')+'<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="'+(sheet.landscape?'landscape':'portrait')+'" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>'+xml('&LBún Riêu Góc Phố&C&A&RTrang &P / &N')+'</oddFooter></headerFooter></worksheet>';
}
function styles():string{
 const xf=(fontId:number,fillId:number,numFmtId=0,borderId=1,alignment='left')=>`<xf numFmtId="${numFmtId}" fontId="${fontId}" fillId="${fillId}" borderId="${borderId}" xfId="0" applyNumberFormat="1" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="${alignment}" vertical="center" wrapText="1"/></xf>`;
 const fonts=[['11','334155',''],['11','FFFFFF','<b/>'],['19','123B5D','<b/>'],['10','64748B',''],['11','123B5D','<b/>']].map(([size,color,b])=>`<font>${b}<sz val="${size}"/><color rgb="FF${color}"/><name val="Calibri"/></font>`).join('');
 const fills=['<fill><patternFill patternType="none"/></fill>','<fill><patternFill patternType="gray125"/></fill>',...['135B88','FFF2CD','F3F7FA'].map(c=>`<fill><patternFill patternType="solid"><fgColor rgb="FF${c}"/><bgColor indexed="64"/></patternFill></fill>`)].join('');
 const formats=[xf(0,0),xf(1,2,0,1,'center'),xf(0,0,164,1,'right'),xf(0,0,165,1,'right'),xf(1,2),xf(3,0,0,0),xf(1,2),xf(1,2,164,1,'right'),xf(1,2,165,1,'right'),xf(4,3),xf(0,4),xf(0,4,164,1,'right'),xf(0,4,165,1,'right'),xf(2,0,0,0)];
 return '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="2"><numFmt numFmtId="164" formatCode="#,##0;[Red](#,##0);&quot;–&quot;"/><numFmt numFmtId="165" formatCode="#,##0&quot; đ&quot;;[Red](#,##0)&quot; đ&quot;;0&quot; đ&quot;"/></numFmts><fonts count="5">'+fonts+'</fonts><fills count="5">'+fills+'</fills><borders count="2"><border/><border><left style="thin"><color rgb="FFDCE5ED"/></left><right style="thin"><color rgb="FFDCE5ED"/></right><top style="thin"><color rgb="FFDCE5ED"/></top><bottom style="thin"><color rgb="FFDCE5ED"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="'+formats.length+'">'+formats.join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
type ProductBucket={name:string;price:number;qty:number[];gross:number};
function exportDetail(report:RevenueReport,sales:readonly Sale[]){
 const range=bounds(report.from,report.to),seen=new Set<string>();
 const current=sales.filter(s=>Date.parse(s.paid_at)>=range.start&&Date.parse(s.paid_at)<range.end).sort((a,b)=>a.paid_at.localeCompare(b.paid_at)||a.id.localeCompare(b.id));
 if(current.reduce((n,s)=>n+(s.bill_items?.length??0),0)>1048571)throw Error('Chi tiết quá lớn cho một trang Excel. Chọn khoảng thời gian ngắn hơn.');
 for(const s of current){validateSale(s);if(seen.has(s.id))throw Error('Trùng hóa đơn trong dữ liệu xuất');seen.add(s.id);}
 const sourceTotals={invoices:current.length,gross:sum(current.map(s=>s.gross)),discount:sum(current.map(s=>s.discount)),total:sum(current.map(s=>s.total)),cash:sum(current.filter(s=>s.method==='cash').map(s=>s.total)),transfer:sum(current.filter(s=>s.method==='transfer').map(s=>s.total))};
 for(const k of keys)if(sourceTotals[k]!==report[k])throw Error('Chi tiết hóa đơn không khớp báo cáo');
 const products=new Map<string,ProductBucket>(),daily=new Map<string,Map<string,ProductBucket>>(),invoices=Array(8).fill(0) as number[],takeaway=Array(8).fill(0) as number[],free=Array(8).fill(0) as number[];
 for(const sale of current){const local=localTime(sale.paid_at),day=local.slice(0,10),time=local.slice(11,16),idx=PERIOD_BANDS.findIndex(([a,b])=>time>=a&&time<b),band=idx<0?7:idx;invoices[band]++;const dayProducts=daily.get(day)??new Map<string,ProductBucket>();daily.set(day,dayProducts);
  for(const item of sale.bill_items){const k=JSON.stringify([item.name,item.price]);for(const map of [products,dayProducts]){const bucket=map.get(k)??{name:item.name,price:item.price,qty:Array(8).fill(0),gross:0};bucket.qty[band]+=item.qty;bucket.gross+=item.qty*item.price;map.set(k,bucket);}if(isTakeaway(saleName(sale)))takeaway[band]+=item.qty;if(item.price===0)free[band]+=item.qty;}
 }
 const ordered=(map:Map<string,ProductBucket>)=>[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true})||a.price-b.price);
 return {current,products:ordered(products),daily:[...daily].map(([day,p])=>({day,products:ordered(p)})),invoices,takeaway,free};
}
export function revenueWorkbook(report:RevenueReport,sales?:readonly Sale[]):{filename:string;bytes:Uint8Array}{
 if(!report.products_complete||!report.slots_complete||!report.slots?.length)throw Error('Thiếu dữ liệu theo khung giờ');
 for(const key of keys)if(sum(report.slots.map(s=>s[key]))!==report[key]||sum(report.days.map(s=>s[key]))!==report[key])throw Error('Tổng khung giờ/ngày không khớp báo cáo');
 if(report.gross-report.discount!==report.total||report.cash+report.transfer!==report.total||sum(report.products.map(p=>p.gross))!==report.gross)throw Error('Tổng tiền không khớp báo cáo');
 const detail=sales?exportDetail(report,sales):null;
 const amounts=(s:Pick<RevenueSlot,typeof keys[number]>)=>keys.map(k=>s[k]);
 const totals=[...new Set(report.slots.map(s=>s.slot_index))].sort((a,b)=>a-b).map(index=>{const rows=report.slots!.filter(s=>s.slot_index===index);return {slot:rows[0].slot,...Object.fromEntries(keys.map(k=>[k,sum(rows.map(s=>s[k]))]))} as RevenueSlot;});
 const overview=heading('BÁO CÁO BÁN HÀNG',report,3,'Tổng hợp từ hóa đơn đã thanh toán · Đơn vị tiền: VND · Doanh thu không phải lợi nhuận');
 overview.rows.push(['CHỈ TIÊU','GIÁ TRỊ','GIẢI THÍCH'].map(v=>cell(v,1)));
 for(const [label,value,note,isMoney] of [['Thực thu',report.total,'Tiền món trừ giảm giá',true],['Tiền món',report.gross,'Tổng giá bán × số lượng trước giảm giá hóa đơn',true],['Giảm giá',report.discount,'Giảm ở cấp hóa đơn; không tự phân bổ xuống món',true],['Số hóa đơn',report.invoices,'Tách bill có thể làm tăng số hóa đơn',false],['Lượt bán',report.visits??'Chưa có dữ liệu','Một phiên bàn là một lượt; tách bill không tăng lượt',false],['Tiền mặt',report.cash,'Thực thu bằng tiền mặt',true],['Chuyển khoản',report.transfer,'Thực thu bằng chuyển khoản',true]] as const)overview.rows.push([cell(label,9),cell(value,typeof value==='number'?(isMoney?3:2):0),cell(note)]);
 overview.rows.push([], [cell('ĐỐI SOÁT',6),cell('KẾT QUẢ',6),cell('QUY TẮC',6)], [cell('Thu tiền'),cell(report.cash+report.transfer===report.total?'Khớp':'Lệch'),cell('Tiền mặt + chuyển khoản = thực thu')], [cell('Doanh số'),cell(report.gross-report.discount===report.total?'Khớp':'Lệch'),cell('Tiền món − giảm giá = thực thu')], [cell('Chi tiết món'),cell(detail?'Đã đối soát hóa đơn':'Chưa có chi tiết hóa đơn'),cell('Giữ riêng cùng tên món nhưng khác đơn giá')],[],[cell('CÁCH ĐỌC FILE',6)], [cell('Bán hàng theo giờ: ma trận món × 7 khung chuẩn theo mẫu, kèm Ngoài khung.',5)], [cell('Theo ngày và khung / Tổng theo khung: dùng khung giờ đang chọn trên Dashboard.',5)], [cell('Chi tiết hóa đơn và Chi tiết món bán: dữ liệu nguồn để kiểm tra số liệu.',5)], [cell('Món giá 0đ chỉ phản ánh giá ghi trên hóa đơn, không tự suy luận chương trình tặng.',5)], [cell('Mang về được nhận diện theo tên điểm bán bắt đầu bằng “Mang về”, như Dashboard.',5)]);
 const sheets:Sheet[]=[{name:'Tổng quan',rows:overview.rows,merges:[...(overview.merges??[]),...[19,20,21,22,23,24].map(r=>`A${r}:C${r}`)],widths:[36,24,84],freeze:{rows:5,cols:0},landscape:true,printTitles:'$1:$5'}];
 if(detail){
  const headers=['Tên món',...BAND_LABELS,'Tổng số phần','Đơn giá','Tiền món'];
  const values=detail.products.map(p=>[p.name,...p.qty,sum(p.qty),p.price,p.gross]);
  const quantities=BAND_LABELS.map((_,i)=>sum(detail.products.map(p=>p.qty[i])));
  const matrix=tableSheet('Bán hàng theo giờ','MÓN BÁN THEO KHUNG GIỜ',report,headers,values,[36,...BAND_LABELS.map(()=>14),17,18,22],[10,11],['TỔNG MÓN',...quantities,sum(quantities),'',report.gross]);
  // Highlight item labels like the supplied paper report.
  for(let r=5;r<5+values.length;r++)matrix.rows[r][0].style=9;
  const summary=(label:string,values:number[])=>[cell(label,9),...values.map(number),number(sum(values)),cell(''),cell('')];
  matrix.rows.push(summary('Số lượng bill',detail.invoices),summary('Số phần mang về¹',detail.takeaway),summary('Số phần giá 0đ²',detail.free),[],[cell('¹ Tất cả món thuộc hóa đơn mang về; không suy đoán đơn vị tô/phần chính.',5)],[cell('² Không đồng nghĩa tất cả món được tặng: chỉ đếm dòng có đơn giá bằng 0đ.',5)],[cell('Các cột giờ tính từ giờ đầu đến trước giờ cuối. Món bán ngoài 06:00–22:00 vẫn được cộng đủ.',5)],[cell('Khăn lạnh / nước uống cũng nằm trong tổng; không cộng thêm lần thứ hai.',5)]);
  matrix.merges?.push(...[3,2,1,0].map(offset=>{const r=matrix.rows.length-offset;return `A${r}:L${r}`;}));
  sheets.push(matrix);
  sheets.push(tableSheet('Món theo ngày','CHI TIẾT MÓN THEO NGÀY VÀ KHUNG GIỜ',report,['Ngày','Tên món',...BAND_LABELS,'Tổng số phần','Đơn giá','Tiền món'],detail.daily.flatMap(d=>d.products.map(p=>[vnDay(d.day),p.name,...p.qty,sum(p.qty),p.price,p.gross])),[16,36,...BAND_LABELS.map(()=>14),17,18,22],[11,12]));
 }
 sheets.push(
  tableSheet('Theo ngày và khung','THU TIỀN THEO NGÀY VÀ KHUNG ĐÃ CHỌN',report,['Ngày','Khung giờ',...financialHeaders],report.slots.map(s=>[vnDay(s.day),s.slot,...amounts(s)]),[17,22,18,23,22,23,23,23],[3,4,5,6,7],['TỔNG CỘNG','',...amounts(report)]),
  tableSheet('Tổng theo khung','TỔNG THU THEO KHUNG ĐÃ CHỌN',report,['Khung giờ',...financialHeaders],totals.map(s=>[s.slot,...amounts(s)]),[23,18,23,22,23,23,23],[2,3,4,5,6],['TỔNG CỘNG',...amounts(report)]),
  tableSheet('Tổng theo ngày','TỔNG THU THEO NGÀY',report,['Ngày',...financialHeaders],report.days.map(s=>[vnDay(s.day),...amounts(s)]),[18,18,23,22,23,23,23],[2,3,4,5,6],['TỔNG CỘNG',...amounts(report)]),
  tableSheet('Món ăn','TỔNG HỢP MÓN BÁN',report,['Tên món','Số lượng','Tiền món trước giảm giá'],report.products.map(p=>[p.name,p.qty,p.gross]),[44,20,30],[2],['TỔNG CỘNG',sum(report.products.map(p=>p.qty)),sum(report.products.map(p=>p.gross))])
 );
 if(report.table_sales)sheets.push(tableSheet('Theo bàn và Mang về','DOANH THU THEO BÀN / ĐIỂM BÁN',report,['Bàn / điểm bán','Hình thức','Lượt bán','Số hóa đơn','Tổng số phần','Thực thu'],report.table_sales.map(t=>[t.name,isTakeaway(t.name)?'Mang về':'Ăn tại bàn',t.visits,t.invoices,t.qty,t.total]),[32,22,17,17,19,25],[5],['TỔNG CỘNG','',report.visits??0,report.invoices,sum(report.table_sales.map(t=>t.qty)),report.total]));
 if(detail){
  const name=(s:Sale)=>saleName(s),method=(s:Sale)=>s.method==='cash'?'Tiền mặt':'Chuyển khoản';
  sheets.push(tableSheet('Chi tiết hóa đơn','DỮ LIỆU HÓA ĐƠN ĐỐI SOÁT',report,['Mã hóa đơn','Thời gian thanh toán (VN)','Bàn / điểm bán','Hình thức','Phương thức','Số phần','Tiền món','Giảm giá','Thực thu','Mã phiên bàn'],detail.current.map(s=>[s.id,localTime(s.paid_at),name(s),isTakeaway(name(s))?'Mang về':'Ăn tại bàn',method(s),sum(s.bill_items.map(i=>i.qty)),s.gross,s.discount,s.total,s.session_id]),[40,26,28,18,22,15,23,23,23,40],[6,7,8]));
  sheets.push(tableSheet('Chi tiết món bán','DỮ LIỆU DÒNG MÓN ĐÃ THANH TOÁN',report,['Mã hóa đơn','Thời gian thanh toán (VN)','Bàn / điểm bán','Tên món','Số lượng','Đơn giá','Tiền món','Ghi nhận'],detail.current.flatMap(s=>s.bill_items.map(i=>[s.id,localTime(s.paid_at),name(s),i.name,i.qty,i.price,i.qty*i.price,i.price===0?'Dòng có đơn giá 0đ':''])),[40,26,28,42,16,23,23,28],[5,6]));
 }
 const info:Cell[][]=[['Từ ngày giờ',report.from],['Đến ngày giờ (bao gồm giây cuối)',report.to],['Múi giờ','Asia/Ho_Chi_Minh (UTC+7)'],['Bộ lọc',report.filter_label??'Tất cả'],['Thời điểm tính','Thời điểm thanh toán, không phải thời điểm gọi món'],['Khung chuẩn ma trận',PERIOD_BANDS.map(([a,b])=>`${a}–${b}`).join(', ')],['Khung của Dashboard',report.slot_rules??'Theo dữ liệu báo cáo'],['Ngoài khung','Không bỏ doanh số ngoài giờ chuẩn hoặc các khoảng trống giữa khung'],['Đơn giá khác nhau','Cùng tên nhưng khác đơn giá được tách dòng trong ma trận'],['Tiền món và thực thu','Tiền món chưa trừ giảm giá hóa đơn; thực thu đã trừ giảm giá'],['Giảm giá theo món','Không tự phân bổ giảm giá hóa đơn cho từng dòng món'],['Số lượng mang về','Đếm tất cả số phần ở điểm bán tên bắt đầu bằng Mang về; không tương đương số tô'],['Món tặng','Chỉ nhận biết dòng có giá 0đ; không suy đoán món tặng từ tên món hoặc giảm giá hóa đơn'],['Ngày không bán','Tổng theo ngày giữ cả ngày không có hóa đơn trong khoảng lọc'],['Chi tiết nguồn',detail?'Có dữ liệu từng hóa đơn':'Không có dữ liệu hóa đơn chi tiết; chưa lập ma trận món theo giờ'],['Dữ liệu mẫu','File xuất dùng dữ liệu thực đã tải. Số trong ảnh tham khảo không được chép vào doanh số'],['Xuất lúc (VN)',stamp(report)]];
 sheets.push(tableSheet('Thông tin','PHẠM VI VÀ QUY TẮC BÁO CÁO',report,['Nội dung','Giải thích'],info,[40,110]));
 const prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const files:[string,string][]=[
  ['[Content_Types].xml',prefix+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'+sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')+'</Types>'],
  ['_rels/.rels',prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
  ['xl/workbook.xml',prefix+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView activeTab="0"/></bookViews><sheets>'+sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')+'</sheets><definedNames>'+sheets.flatMap((s,i)=>[`<definedName name="_xlnm.Print_Area" localSheetId="${i}">'${xml(s.name)}'!$A$1:$${column(Math.max(...s.rows.map(r=>r.length),s.widths?.length??1)-1)}$${s.rows.length}</definedName>`,s.printTitles?`<definedName name="_xlnm.Print_Titles" localSheetId="${i}">'${xml(s.name)}'!${s.printTitles}</definedName>`:'']).join('')+'</definedNames></workbook>'],
  ['xl/_rels/workbook.xml.rels',prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'+sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')+`<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml',prefix+styles()],...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,worksheet(s)] as [string,string])
 ];
 return {filename:`goc-pho-bao-cao_${report.from.replaceAll(':','-')}_${report.to.replaceAll(':','-')}.xlsx`,bytes:zip(files)};
}
export async function downloadRevenueWorkbook(report:RevenueReport,sales?:readonly Sale[]){
 const file=revenueWorkbook(report,sales),url=URL.createObjectURL(new Blob([new Uint8Array(file.bytes).buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');try{a.href=url;a.download=file.filename;document.body.append(a);a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
