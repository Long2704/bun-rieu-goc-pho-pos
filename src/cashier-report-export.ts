import type {CashierDashboard} from './cashier-dashboard';
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
function worksheet(sheet:Sheet):string{
 if(sheet.rows.length>1048576)throw Error('Báo cáo vượt giới hạn dòng Excel');
 const maxCols=Math.max(...sheet.rows.map(r=>r.length),...sheet.widths?.map((_,i)=>i+1)??[1]),last=column(maxCols-1)+sheet.rows.length,f=sheet.freeze??{rows:5,cols:1};
 const pane=`<pane xSplit="${f.cols}" ySplit="${f.rows}" topLeftCell="${column(f.cols)}${f.rows+1}" activePane="${f.cols?'bottomRight':'bottomLeft'}" state="frozen"/>`;
 return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:'+last+'"/><sheetViews><sheetView workbookViewId="0" showGridLines="0">'+pane+'</sheetView></sheetViews><sheetFormatPr defaultRowHeight="23"/><cols>'+Array.from({length:maxCols},(_,i)=>`<col min="${i+1}" max="${i+1}" width="${sheet.widths?.[i]??18}" customWidth="1"/>`).join('')+'</cols><sheetData>'+sheet.rows.map((row,r)=>`<row r="${r+1}" ht="${r===0?34:r===1||r===2?25:r===4?38:25}" customHeight="1">`+row.map((c,i)=>{const ref=column(i)+(r+1),s=c.style??0;if(typeof c.value==='number'){if(!Number.isSafeInteger(c.value))throw Error('Số liệu không hợp lệ');return `<c r="${ref}" s="${s}" t="n"><v>${c.value}</v></c>`;}return `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xml(c.value)}</t></is></c>`;}).join('')+'</row>').join('')+'</sheetData>'+(sheet.filter?`<autoFilter ref="${sheet.filter}"/>`:'')+(sheet.merges?.length?`<mergeCells count="${sheet.merges.length}">${sheet.merges.map(ref=>`<mergeCell ref="${ref}"/>`).join('')}</mergeCells>`:'')+'<printOptions horizontalCentered="1"/><pageMargins left="0.25" right="0.25" top="0.4" bottom="0.4" header="0.15" footer="0.15"/><pageSetup paperSize="9" orientation="'+(sheet.landscape?'landscape':'portrait')+'" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>'+xml('&LBún Riêu Góc Phố&C&A&RTrang &P / &N')+'</oddFooter></headerFooter></worksheet>';
}

function styles(){
 const xf=(font:number,fill:number,num=0)=>`<xf numFmtId="${num}" fontId="${font}" fillId="${fill}" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>`;
 return '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="16"/><color rgb="FF135B88"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF135B88"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6">'+[xf(0,0),xf(1,2),xf(0,0,164),xf(2,0),xf(0,0),xf(1,2,164)].join('')+'</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
}
export function cashierReportRows(report:CashierDashboard,filterLabel:string):Cell[][]{
 const labels=report.slots.map(s=>s.slot);
 const rows:Cell[][]=[['BÁN HÀNG THEO GIỜ'],[`${report.from} → ${report.to} · Giờ Việt Nam`],[filterLabel],[],['Tên món',...labels,'Tổng số phần']];
 for(const product of report.products){rows.push([product.name,...report.slots.map(s=>report.product_slots.find(p=>p.name===product.name&&p.slot_index===s.slot_index)?.qty??0),product.qty]);}
 rows.push(['TỔNG SỐ PHẦN',...report.slots.map(s=>s.qty),report.qty],['Số hóa đơn',...report.slots.map(s=>s.invoices),report.invoices]);
 return rows;
}
export function cashierQuantityWorkbook(report:CashierDashboard,filterLabel:string){
 const values=cashierReportRows(report,filterLabel),count=report.slots.length+2,last=column(count-1),end=5+report.products.length;
 const sheet:Sheet={name:'Bán hàng theo giờ',rows:values.map((r,i)=>r.map(value=>({value,style:i===0?3:i===4?1:i>=values.length-2?(typeof value==='number'?5:1):typeof value==='number'?2:0}))),merges:[`A1:${last}1`,`A2:${last}2`,`A3:${last}3`],widths:[36,...report.slots.map(()=>16),18],freeze:{rows:5,cols:1},filter:`A5:${last}${Math.max(5,end)}`,landscape:true,printTitles:'$1:$5'};
 const prefix='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
 const files:[string,string][]=[
 ['[Content_Types].xml',prefix+'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>'],
 ['_rels/.rels',prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
 ['xl/workbook.xml',prefix+'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Bán hàng theo giờ" sheetId="1" r:id="rId1"/></sheets></workbook>'],
 ['xl/_rels/workbook.xml.rels',prefix+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
 ['xl/styles.xml',prefix+styles()],['xl/worksheets/sheet1.xml',worksheet(sheet)]
 ];
 return {filename:`goc-pho-so-luong_${report.from.replaceAll(':','-')}_${report.to.replaceAll(':','-')}.xlsx`,bytes:zip(files)};
}
// Quoting preserves commas/newlines; text formula prefixes receive a leading apostrophe.
export function cashierQuantityCsv(report:CashierDashboard,label:string){
 return '\ufeff'+cashierReportRows(report,label).map(row=>row.map(value=>{const text=typeof value==='string'&&/^[\s]*[=+@-]/.test(value)?"'"+value:String(value);return '"'+text.replaceAll('"','""')+'"';}).join(',')).join('\r\n');
}
export function downloadCashierReport(report:CashierDashboard,label:string,format:'csv'|'xlsx'){
 const file=format==='xlsx'?cashierQuantityWorkbook(report,label):{filename:`goc-pho-so-luong_${report.from.replaceAll(':','-')}_${report.to.replaceAll(':','-')}.csv`,bytes:new TextEncoder().encode(cashierQuantityCsv(report,label))};
 const url=URL.createObjectURL(new Blob([new Uint8Array(file.bytes).buffer],{type:format==='xlsx'?'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':'text/csv;charset=utf-8'})),link=document.createElement('a');
 try{link.href=url;link.download=file.filename;document.body.append(link);link.click();}finally{link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
}
