import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {bind,device,disablePush,enablePush,supported,testPush} from './kitchen-push';
import './kitchen-push.css';
export function KitchenPushControl({user,online}:{user:string;online:boolean}){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[enabled,setEnabled]=useState(false),[notice,setNotice]=useState('');const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{if(open){dialog.current?.showModal();setNotice('');setEnabled(device()?.user===user&&supported()&&Notification.permission==='granted');}else dialog.current?.close();},[open,user]);
 async function action(kind:'enable'|'disable'|'test'){
  if(busy)return;setBusy(true);setNotice('');
  try{
   if(kind==='enable'){
    if(!supported())throw Error('Trình duyệt chưa hỗ trợ push. Trên iPhone/iPad (iOS 16.4 trở lên), dùng Safari thêm POS vào Màn hình chính, rồi mở app từ biểu tượng đó.');
    // Permission is requested directly from this tap, before any network or service-worker await.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Chưa được cấp quyền. Vào cài đặt thông báo của trình duyệt/app để cho phép, rồi bật lại.');
    await enablePush(user);setEnabled(true);setNotice('Đã bật trên thiết bị này. Bấm Gửi thông báo thử để kiểm tra.');
   }else if(kind==='disable'){await disablePush(user);setEnabled(false);setNotice('Đã tắt trên thiết bị này.');}
   else{await testPush(user);setNotice('Đã xếp hàng thông báo thử. Có thể mất đến 1 phút; mỗi phút gửi tối đa một lần.');}
  }catch(e){setNotice(e instanceof Error?e.message:'Chưa thực hiện được. Vui lòng thử lại.');}finally{setBusy(false);}
 }
 return <><button className="kitchen-push-trigger" onClick={()=>setOpen(true)}>Thông báo</button>{createPortal(<dialog ref={dialog} className="confirm-dialog kitchen-push-dialog" aria-label="Thông báo phiếu bếp" onCancel={e=>{if(busy)e.preventDefault();else setOpen(false);}}><h2>Thông báo phiếu bếp</h2><p>Nhận push khi có phiếu bếp mới, kể cả khi app ở nền. Chỉ bật trên thiết bị cần nhận thông báo bếp.</p><p><strong>iPhone / iPad:</strong> iOS 16.4 trở lên → Safari → Chia sẻ → Thêm vào Màn hình chính → mở POS từ biểu tượng vừa thêm.</p><p>Push cần Internet và có thể bị trễ do cài đặt điện thoại. Khi đang làm bếp, tiếp tục dùng phiếu và chuông trong app để theo dõi đơn.</p><p role="status">{notice||`Thiết bị này: ${enabled?'đã bật':'chưa bật'}.`}</p><div className="push-actions"><button className="primary" disabled={busy||!online} onClick={()=>void action(enabled?'disable':'enable')}>{busy?'Đang xử lý…':enabled?'Tắt trên thiết bị này':'Bật trên thiết bị này'}</button>{enabled&&<button disabled={busy||!online} onClick={()=>void action('test')}>Gửi thông báo thử</button>}<button disabled={busy} onClick={()=>setOpen(false)}>Đóng</button></div></dialog>,document.body)}</>;
}
export function KitchenPushLifecycle({user,active,onOpen}:{user:string|null;active:boolean;onOpen:()=>void}){
 const state=useRef({user,active,onOpen});state.current={user,active,onOpen};
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let cancelled=false;
  void navigator.serviceWorker.getRegistration('/').then(async reg=>{if(cancelled||!reg?.active)return;const d=device();try{await bind(reg,d?.user===user?d:null);}catch{/* An older worker is upgraded when all POS windows close. */}});
  const receive=(event:MessageEvent)=>{const s=state.current;if(event.data?.type==='KITCHEN_PUSH_PRESENCE'){const d=device();event.ports[0]?.postMessage({active:!!s.user&&s.active&&d?.user===s.user&&d.id===event.data.device_id&&document.visibilityState==='visible'});}if(event.data?.type==='OPEN_KITCHEN_PUSH'&&s.user)s.onOpen();};
  navigator.serviceWorker.addEventListener('message',receive);return()=>{cancelled=true;navigator.serviceWorker.removeEventListener('message',receive);};
 },[user]);
 useEffect(()=>{if(user&&new URLSearchParams(location.search).get('open')==='kitchen'){state.current.onOpen();const url=new URL(location.href);url.searchParams.delete('open');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}},[user]);
 return null;
}
