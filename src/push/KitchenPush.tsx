import {startKitchenForeground} from './foreground';
import {useEffect,useRef,useState} from 'react';
import Toast from '../Toast';
import {bind,device,disablePush,enablePush,supported,setKitchenForeground} from './kitchen-push';
import './kitchen-push.css';
export function KitchenPushControl({user,online,onBusy}:{user:string;online:boolean;onBusy?:(busy:boolean)=>void}){
 const current=()=>device()?.user===user&&supported()&&Notification.permission==='granted';
 const [busy,setBusy]=useState(false),[enabled,setEnabled]=useState(current),[error,setError]=useState(''),[message,setMessage]=useState('');
 const lock=useRef(false);
 useEffect(()=>{
  const update=()=>{if(!lock.current)setEnabled(device()?.user===user&&supported()&&Notification.permission==='granted');};
  update();window.addEventListener('focus',update);window.addEventListener('storage',update);window.addEventListener('kitchen-push-change',update);document.addEventListener('visibilitychange',update);
  return()=>{window.removeEventListener('focus',update);window.removeEventListener('storage',update);window.removeEventListener('kitchen-push-change',update);document.removeEventListener('visibilitychange',update);};
 },[user]);
 async function toggle(){
  if(lock.current||!online)return;lock.current=true;setBusy(true);onBusy?.(true);setError('');setMessage('');
  try{
   if(enabled){await disablePush(user);setEnabled(false);setMessage('Đã tắt thông báo bếp trên thiết bị này.');}
   else{
    if(!supported())throw Error('Thiết bị chưa hỗ trợ push. Trên iPhone, mở POS từ Màn hình chính.');
    // Keep permission inside the user gesture. Never open an app instructions modal.
    const permission=await Notification.requestPermission();if(permission!=='granted')throw Error('Chưa được cấp quyền. Cho phép thông báo cho POS trong cài đặt thiết bị rồi bật lại.');
    await enablePush(user);setEnabled(true);setMessage('Đã bật thông báo bếp trên thiết bị này.');
   }
  }catch(e){setError(e instanceof Error?e.message:'Chưa thực hiện được. Vui lòng thử lại.');}
  finally{lock.current=false;setBusy(false);onBusy?.(false);}
 }
 return <><button type="button" role="switch" aria-label="Thông báo bếp" aria-checked={enabled} aria-busy={busy} className="kitchen-push-toggle" disabled={busy||!online} onClick={()=>void toggle()}><span>Thông báo</span><span className="kitchen-push-track" aria-hidden="true"><span/></span></button>{error&&<p className="kitchen-push-error" role="alert">{error}</p>}{message&&<Toast message={message}/>}</>;
}
export function KitchenPushLifecycle({user,active,onOpen}:{user:string|null;active:boolean;onOpen:()=>void}){
 const state=useRef({user,active,onOpen});state.current={user,active,onOpen};
 useEffect(()=>{window.dispatchEvent(new Event('kitchen-view-change'));},[active]);
 useEffect(()=>{
  if(!('serviceWorker' in navigator))return;
  let cancelled=false;
  void navigator.serviceWorker.getRegistration('/').then(async reg=>{if(cancelled||!reg?.active)return;const d=device();try{await bind(reg,d?.user===user?d:null);}catch{/* An older worker is upgraded when all POS windows close. */}});
  const stopForeground=startKitchenForeground({tab:crypto.randomUUID(),read:()=>{const s=state.current,d=device();return {device:d?.user===s.user?d:null,active:s.active&&document.visibilityState==='visible'&&navigator.onLine};},send:setKitchenForeground,windowEvents:window,documentEvents:document});
  const receive=(event:MessageEvent)=>{const s=state.current;if(event.data?.type==='KITCHEN_PUSH_PRESENCE'){const d=device();event.ports[0]?.postMessage({active:!!s.user&&s.active&&d?.user===s.user&&d.id===event.data.device_id&&document.visibilityState==='visible'});}if(event.data?.type==='OPEN_KITCHEN_PUSH'&&s.user)s.onOpen();};
  navigator.serviceWorker.addEventListener('message',receive);return()=>{stopForeground();cancelled=true;navigator.serviceWorker.removeEventListener('message',receive);};
 },[user]);
 useEffect(()=>{if(user&&new URLSearchParams(location.search).get('open')==='kitchen'){state.current.onOpen();const url=new URL(location.href);url.searchParams.delete('open');window.history.replaceState(null,'',url.pathname+url.search+url.hash);}},[user]);
 return null;
}
