import {supabase} from '../supabase';
const KEY='goc-pho-kitchen-push-v1';
export type PushDevice={user:string;id:string;proof:string};
export function device():PushDevice|null{try{const d=JSON.parse(localStorage.getItem(KEY)??'null');return d&&typeof d.user==='string'&&typeof d.id==='string'&&typeof d.proof==='string'?d:null;}catch{return null;}}
export function supported(){return window.isSecureContext&&'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window;}
export async function workerMessage(reg:ServiceWorkerRegistration,data:unknown){
 if(!reg.active)throw Error('Đóng tất cả cửa sổ POS rồi mở lại để cập nhật thông báo.');
 return new Promise<unknown>((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>{channel.port1.close();reject(Error('Đóng tất cả cửa sổ POS rồi mở lại để cập nhật thông báo.'));},2500);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();resolve(e.data);};reg.active!.postMessage(data,[channel.port2]);});
}
export async function registration(){const reg=await navigator.serviceWorker.getRegistration('/');if(!reg)throw Error('Cài POS ra màn hình chính, đóng app rồi mở lại để bật thông báo.');const cap=await workerMessage(reg,{type:'GET_PUSH_CAPABILITIES'}) as {version?:number};if(cap?.version!==1)throw Error('Đóng tất cả cửa sổ POS rồi mở lại để cập nhật thông báo.');return reg;}
export async function bind(reg:ServiceWorkerRegistration,d:PushDevice|null){await workerMessage(reg,{type:'SET_PUSH_BINDING',binding:d?{user:d.user,id:d.id}:null});}
async function rpc(name:string,args:Record<string,unknown>={}){if(!supabase)throw Error('Chưa kết nối máy chủ.');const r=await supabase.rpc(name,args).abortSignal(AbortSignal.timeout(6000));if(r.error)throw Error(r.error.message);return r.data;}
export async function enablePush(user:string){
 const reg=await registration(),settings=await rpc('get_kitchen_push_settings');if(!settings?.ready||!settings.public_key)throw Error('Thông báo bếp chưa sẵn sàng. Vui lòng thử lại sau.');
 const previous=device(),bytes=crypto.getRandomValues(new Uint8Array(32));
 const proof=previous?.proof??btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 const key=Uint8Array.from(atob(settings.public_key.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
 const existing=await reg.pushManager.getSubscription();
 const subscription=existing??await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
 try{const result=await rpc('register_kitchen_push',{p_proof:proof,p_subscription:subscription.toJSON()});const d={user,id:result.id,proof};localStorage.setItem(KEY,JSON.stringify(d));await bind(reg,d);return d;}
 catch(error){if(!existing)await subscription.unsubscribe().catch(()=>false);throw error;}
}
export async function disablePush(user:string){
 const d=device(),reg=await navigator.serviceWorker.getRegistration('/');
 // Revoke server delivery before removing the local subscription, so a retry remains possible on failure.
 if(d?.user===user)await rpc('disable_kitchen_push',{p_device:d.id,p_proof:d.proof});
 if(reg){await bind(reg,null);await (await reg.pushManager.getSubscription())?.unsubscribe();}localStorage.removeItem(KEY);
}
export async function detachKitchenPush(user:string){
 if(!('serviceWorker' in navigator))return;
 try{await disablePush(user);}catch{try{const reg=await navigator.serviceWorker.getRegistration('/');if(reg)await bind(reg,null);}catch{/* Auth session revocation also blocks future deliveries. */}localStorage.removeItem(KEY);}
}
export async function testPush(user:string){const d=device();if(d?.user!==user)throw Error('Bật thông báo trên thiết bị này trước.');await rpc('request_kitchen_push_test',{p_device:d.id,p_proof:d.proof});}
