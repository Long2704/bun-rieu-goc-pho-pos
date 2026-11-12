const clock=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
const fullTime=new Intl.DateTimeFormat('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'short',timeStyle:'short'});
export default function TableOpenedTime({value}:{value?:string|null}){
 if(!value||!Number.isFinite(Date.parse(value)))return null;
 const date=new Date(value),text=clock.format(date);
 return <time className="table-opened-time" dateTime={value} title={fullTime.format(date)} aria-label={`Giờ bắt đầu phiên bàn: ${text}`}>{text}</time>;
}
