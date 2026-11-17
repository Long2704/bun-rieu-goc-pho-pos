import {formatMoney} from './format';
import './audit-details.css';
type CancelledLine={name:string;qty:number;price:number|null};
function readLines(value:unknown):CancelledLine[]|null{
 if(!Array.isArray(value)||!value.length)return null;
 const result:CancelledLine[]=[];
 for(const row of value){
  if(!row||typeof row!=='object'||typeof row.name!=='string'||!row.name.trim()||!Number.isSafeInteger(row.qty)||row.qty<=0)return null;
  const price=typeof row.price==='number'&&Number.isSafeInteger(row.price)&&row.price>=0&&Number.isSafeInteger(row.price*row.qty)?row.price:null;
  result.push({name:row.name,qty:row.qty,price});
 }
 return result;
}
export default function CancelledTableDetails({items,count}:{items:unknown;count:unknown}){
 const lines=readLines(items);
 const lineCount=typeof count==='number'&&Number.isSafeInteger(count)&&count>=0?count:lines?.length;
 const portions=lines?.reduce((sum,line)=>sum+line.qty,0);
 const subtotal=lines?.every(line=>line.price!==null)?lines.reduce((sum,line)=>sum+line.qty*line.price!,0):null;
 return <><p>{lineCount!==undefined?`Đã hủy ${lineCount} dòng món chưa thanh toán.`:'Đã hủy các món chưa thanh toán.'}</p>
  {lines?<details className="audit-cancelled-details"><summary>Xem món đã hủy</summary><ul aria-label="Các món đã hủy">{lines.map((line,index)=><li key={index}><div><strong>{line.qty} × {line.name}</strong><small>{line.price===null?'Không có đơn giá được lưu':`Đơn giá: ${formatMoney(line.price)}`}</small></div><span>{line.price===null?'—':formatMoney(line.qty*line.price)}</span></li>)}</ul><p className="audit-cancelled-total"><span>{Number.isSafeInteger(portions)?`${portions} phần đã hủy`:'Tổng món đã hủy'}</span>{subtotal!==null&&Number.isSafeInteger(subtotal)&&<strong>{formatMoney(subtotal)}</strong>}</p></details>:<p className="audit-cancelled-missing">Hoạt động này không có chi tiết món được lưu.</p>}
 </>;
}
