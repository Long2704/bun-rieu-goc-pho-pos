import {useState} from 'react';
import type {RevenueDay} from './revenue-export';
import {formatMoney as money} from './format';
const short=(n:number)=>{const scale=n>=1e9?1e9:n>=1e6?1e6:n>=1000?1000:1;return new Intl.NumberFormat('vi-VN',{maximumFractionDigits:1}).format(n/scale)+(scale===1e9?' tỷ':scale===1e6?' triệu':scale===1000?' nghìn':'đ');};
export function TrendChart({days,previous}:{days:RevenueDay[];previous:RevenueDay[]}){
 const [selected,setSelected]=useState<number|null>(null),max=Math.max(1000,...days.map(d=>d.total),...previous.map(d=>d.total));
 const x=(i:number)=>60+(days.length===1?.5:i/(days.length-1))*720,y=(n:number)=>245-n/max*205;
 const points=(rows:RevenueDay[])=>rows.map((d,i)=>`${x(i)},${y(d.total)}`).join(' ');
 const current=selected===null?null:days[selected];
 return <><div className="dash-legend"><span><i/>Kỳ hiện tại</span>{previous.length>0&&<span><i/>Kỳ trước (cùng độ dài)</span>}</div>
 <svg className="dash-trend" viewBox="0 0 820 290" role="img" aria-label="Biểu đồ doanh thu theo ngày, so sánh kỳ trước">
 {[0,.25,.5,.75,1].map(t=><g key={t}><line x1="60" x2="780" y1={y(max*t)} y2={y(max*t)} stroke="#eddccc" strokeDasharray="4 6"/><text x="50" y={y(max*t)+4} textAnchor="end">{short(max*t)}</text></g>)}
 <polygon points={`${x(0)},245 ${points(days)} ${x(days.length-1)},245`} fill="#ff8010" fillOpacity=".08"/>
 <polyline points={points(previous)} fill="none" stroke="#85a99c" strokeWidth="2" strokeDasharray="5 5"/>{previous.length===1&&<circle cx={x(0)} cy={y(previous[0].total)} r="5" fill="#fffdf9" stroke="#85a99c" strokeWidth="2"><title>Kỳ trước: {money(previous[0].total)}</title></circle>}
 <polyline points={points(days)} fill="none" stroke="#ff7908" strokeWidth="3" strokeLinejoin="round"/>
 {days.map((d,i)=><g key={d.day}><circle cx={x(i)} cy={y(d.total)} r={days.length>31?3:5} fill="#fffdf9" stroke="#fa7504" strokeWidth="2" onMouseEnter={()=>setSelected(i)} onClick={()=>setSelected(i)}><title>{d.day}: {money(d.total)} · {d.invoices} hóa đơn</title></circle>{(i===0||i===days.length-1||days.length<9||i%Math.ceil(days.length/6)===0)&&<text x={x(i)} y="275" textAnchor="middle">{d.day.slice(8)}/{d.day.slice(5,7)}</text>}</g>)}
 </svg><p className="dash-chart-caption" aria-live="polite">{current?`${current.day.split('-').reverse().join('/')} · ${money(current.total)} · ${current.invoices} hóa đơn`:'Chạm một điểm để xem số liệu. Bảng chi tiết có ngay bên dưới.'}</p></>;
}
export function PaymentChart({cash,transfer}:{cash:number;transfer:number}){
 const total=cash+transfer,pct=total?cash/total*100:0;
 return <><div className="dash-donut" style={{background:total?`conic-gradient(#ff800b ${pct}%, #299780 ${pct}% 100%)`:'#f0e7dd'}} role="img" aria-label={`Tiền mặt ${money(cash)}, chuyển khoản ${money(transfer)}`}><div><span>Thực thu</span><strong>{short(total)}</strong></div></div><div className="dash-payment-rows">{[['Tiền mặt',cash,'#ff800b'],['Chuyển khoản',transfer,'#299780']].map(([name,value,color])=><div key={name}><i style={{background:String(color)}}/><span>{name}<strong>{money(Number(value))}</strong></span><b>{total?(Number(value)/total*100).toFixed(1):'0'}%</b></div>)}</div></>;
}
