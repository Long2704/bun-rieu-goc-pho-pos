import useVisibleClock from './useVisibleClock';

export function elapsedTableTime(start:number,now:number){
 const seconds=Math.max(0,Math.floor((now-start)/1000));
 const hours=Math.floor(seconds/3600),minutes=Math.floor(seconds/60)%60,remainder=seconds%60;
 return {seconds,text:[hours,minutes,remainder].map(n=>String(n).padStart(2,'0')).join(':')};
}
function Counter({start}:{start:number}){
 const {seconds,text}=elapsedTableTime(start,useVisibleClock());
 return <time className="table-opened-time" dateTime={`PT${seconds}S`} title={`Thời gian bàn đã mở: ${text}`} aria-label={`Bàn đã mở ${text}`}>{text}</time>;
}
export default function TableOpenedTime({value}:{value?:string|null}){
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 return <Counter start={Date.parse(value)}/>;
}
