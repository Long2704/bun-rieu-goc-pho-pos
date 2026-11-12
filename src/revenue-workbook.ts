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
const selectedPeriod=(report:RevenueReport)=>`THỜI GIAN: ${vnDay(report.from)} ${report.from.slice(11,19)||'00:00:00'} → ${vnDay(report.to)} ${report.to.slice(11,19)||'23:59:59'}`;
const vnDay=(day:string)=>{const [y,m,d]=day.slice(0,10).split('-');return `${d}/${m}/${y}`;};
const localTime=(stamp:string)=>new Date(Date.parse(stamp)+7*3600000).toISOString().slice(0,19).replace('T',' ');
const stamp=(report:RevenueReport)=>new Date(report.generated_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'});
const PERIOD_BANDS=[['06:00','09:00'],['09:00','11:00'],['11:00','13:00'],['13:00','15:00'],['15:00','17:00'],['17:00','19:00'],['19:00','22:00']];
const BAND_LABELS=[...PERIOD_BANDS.map(([a,b])=>`${a}–${b}`),'Ngoài khung'];
const keys=['invoices','gross','discount','total','cash','transfer'] as const;
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
export type ExcelMenuItem={id:string;name:string;price:number;category:string;sort:number;is_active:boolean};
export type ExcelReportOptions={menu:readonly ExcelMenuItem[];exportedAt?:string};
const normalizedName=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
function referenceMatrix(report:RevenueReport,current:readonly Sale[],options:ExcelReportOptions):Sheet{
 const menu=[...options.menu].sort((a,b)=>a.sort-b.sort||a.id.localeCompare(b.id));
 const byName=new Map<string,ExcelMenuItem>();
 for(const m of menu){const key=normalizedName(m.name);if(byName.has(key))throw Error('Tên món trong menu bị trùng. Kiểm tra trước khi xuất.');byName.set(key,m);}
 type Row={name:string;price:number;main:boolean;counts:number[];fallback:boolean};
 const rows=new Map<string,Row>();
 for(const m of menu)if(m.is_active)rows.set(normalizedName(m.name),{name:m.name,price:m.price,main:m.category==='bun',counts:Array(8).fill(0),fallback:false});
 const main=Array(8).fill(0) as number[],invoices=Array(8).fill(0) as number[],gift=Array(8).fill(0) as number[],takeaway=Array(8).fill(0) as number[];
 for(const sale of current){
  const time=localTime(sale.paid_at).slice(11,16),b=PERIOD_BANDS.findIndex(([a,z])=>time>=a&&time<z),band=b<0?7:b;invoices[band]++;
  for(const item of sale.bill_items){
   const key=normalizedName(item.name),m=byName.get(key),rowKey=m?key:JSON.stringify([key,item.price]);
   const row=rows.get(rowKey)??{name:m?.name??item.name,price:m?.price??item.price,main:m?.category==='bun',counts:Array(8).fill(0),fallback:!m};
   row.counts[band]+=item.qty;rows.set(rowKey,row);
   if(row.main){main[band]+=item.qty;if(item.is_takeaway??isTakeaway(saleName(sale)))takeaway[band]+=item.qty;}
   if(key===normalizedName('Chả ốc (Tặng)'))gift[band]+=item.qty;
  }
 }
 // Keep the seven requested columns. Expose an extra column only when actual data falls outside them.
 const indices=[0,1,2,3,4,5,6,...(invoices[7]>0?[7]:[])],labels=indices.map(i=>BAND_LABELS[i]);
 const values=[...rows.values()].map(r=>[r.name+(r.fallback?' †':''),...indices.map(i=>r.counts[i]),sum(r.counts),r.price,sum(r.counts)*r.price]);
 const amount=sum([...rows.values()].map(r=>sum(r.counts)*r.price)),last=labels.length+3;
 const sheet=tableSheet('Bán hàng theo giờ',selectedPeriod(report),report,['Khung giờ',...labels,'Tổng cộng','Giá','Thành tiền'],values,[36,...labels.map(()=>14),17,18,22],[last-1,last],['TỔNG MÓN CHÍNH',...indices.map(i=>main[i]),sum(main),'',amount]);
 sheet.rows[0][0].style=4;
 sheet.rows[2]=[cell('Tên món và giá theo menu lúc xuất · Số lượng theo hóa đơn đã thanh toán',5)];
 for(let r=5;r<5+values.length;r++)sheet.rows[r][0].style=9;
 const summary=(label:string,counts:number[])=>[cell(label,9),...indices.map(i=>number(counts[i])),number(sum(counts)),cell(''),cell('')];
 sheet.rows.push(summary('Số lượng bill',invoices),summary('Chả ốc (Tặng)',gift),summary('Mang về (tô)',takeaway));
 sheet.rows.push([], [cell('Tiền món theo hóa đơn',9),...Array(last-1).fill(cell('')),money(report.gross)], [cell('Chênh lệch giá menu / hóa đơn',9),...Array(last-1).fill(cell('')),money(amount-report.gross)]);
 const notes=[
  'Dòng xanh: số lượng chỉ cộng nhóm Món chính; cột Thành tiền cộng tất cả món trong bảng.',
  'Mang về (tô): đếm món chính có dấu Mang về trên hóa đơn; dữ liệu cũ chưa có dấu dùng tên bàn bắt đầu bằng “Mang về”.',
  'Chả ốc (Tặng): chỉ đếm đúng món này; không đếm Chả ốc bán thường hoặc món khác có giá 0đ.',
  'Giá là giá menu tại lúc xuất. Thành tiền = Giá × Tổng cộng; thực thu Dashboard không bị thay đổi.',
  '† Món cũ không còn trong menu: giữ giá hóa đơn, chưa đưa vào tổng món chính nếu không xác định được nhóm.',
  'Dòng 1 là khoảng ngày giờ đã chọn để xuất báo cáo, theo giờ Việt Nam; không phải ngày tải file.'
 ];
 for(const text of notes){sheet.rows.push([cell(text,5)]);const r=sheet.rows.length;sheet.merges?.push(`A${r}:${column(last)}${r}`);}
 return sheet;
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
  for(const item of sale.bill_items){const k=JSON.stringify([item.name,item.price]);for(const map of [products,dayProducts]){const bucket=map.get(k)??{name:item.name,price:item.price,qty:Array(8).fill(0),gross:0};bucket.qty[band]+=item.qty;bucket.gross+=item.qty*item.price;map.set(k,bucket);}if(item.is_takeaway??isTakeaway(saleName(sale)))takeaway[band]+=item.qty;if(item.price===0)free[band]+=item.qty;}
 }
 const ordered=(map:Map<string,ProductBucket>)=>[...map.values()].sort((a,b)=>a.name.localeCompare(b.name,'vi',{numeric:true})||a.price-b.price);
 return {current,products:ordered(products),daily:[...daily].map(([day,p])=>({day,products:ordered(p)})),invoices,takeaway,free};
}
export function revenueWorkbook(report:RevenueReport,sales?:readonly Sale[],options?:ExcelReportOptions):{filename:string;bytes:Uint8Array}{
 if(!report.products_complete||!report.slots_complete||!report.slots?.length)throw Error('Thiếu dữ liệu theo khung giờ');
 for(const key of keys)if(sum(report.slots.map(s=>s[key]))!==report[key]||sum(report.days.map(s=>s[key]))!==report[key])throw Error('Tổng khung giờ/ngày không khớp báo cáo');
 if(report.gross-report.discount!==report.total||report.cash+report.transfer!==report.total||sum(report.products.map(p=>p.gross))!==report.gross)throw Error('Tổng tiền không khớp báo cáo');
 const detail=sales?exportDetail(report,sales):null;
 if(!detail)throw Error('Thiếu dữ liệu hóa đơn chi tiết để lập bảng bán hàng theo giờ');
 const sheets:Sheet[]=[];
 if(detail){
  const headers=['Tên món',...BAND_LABELS,'Tổng số phần','Đơn giá','Tiền món'];
  const values=detail.products.map(p=>[p.name,...p.qty,sum(p.qty),p.price,p.gross]);
  const quantities=BAND_LABELS.map((_,i)=>sum(detail.products.map(p=>p.qty[i])));
  const matrix=tableSheet('Bán hàng theo giờ',selectedPeriod(report),report,headers,values,[36,...BAND_LABELS.map(()=>14),17,18,22],[10,11],['TỔNG MÓN',...quantities,sum(quantities),'',report.gross]);
  // Highlight item labels like the supplied paper report.
  for(let r=5;r<5+values.length;r++)matrix.rows[r][0].style=9;
  const summary=(label:string,values:number[])=>[cell(label,9),...values.map(number),number(sum(values)),cell(''),cell('')];
  matrix.rows.push(summary('Số lượng bill',detail.invoices),summary('Số phần mang về¹',detail.takeaway),summary('Số phần giá 0đ²',detail.free),[],[cell('¹ Tất cả món thuộc hóa đơn mang về; không suy đoán đơn vị tô/phần chính.',5)],[cell('² Không đồng nghĩa tất cả món được tặng: chỉ đếm dòng có đơn giá bằng 0đ.',5)],[cell('Các cột giờ tính từ giờ đầu đến trước giờ cuối. Món bán ngoài 06:00–22:00 vẫn được cộng đủ.',5)],[cell('Khăn lạnh / nước uống cũng nằm trong tổng; không cộng thêm lần thứ hai.',5)]);
  matrix.merges?.push(...[3,2,1,0].map(offset=>{const r=matrix.rows.length-offset;return `A${r}:L${r}`;}));
  if(options)sheets.unshift(referenceMatrix(report,detail.current,options));else sheets.push(matrix);

 }
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
export async function downloadRevenueWorkbook(report:RevenueReport,sales?:readonly Sale[],options?:ExcelReportOptions){
 const file=revenueWorkbook(report,sales,options),url=URL.createObjectURL(new Blob([new Uint8Array(file.bytes).buffer],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 const a=document.createElement('a');try{a.href=url;a.download=file.filename;document.body.append(a);a.click();}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
