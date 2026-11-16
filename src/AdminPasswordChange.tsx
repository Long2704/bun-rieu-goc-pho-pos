import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {supabase} from './supabase';

/** Self-service Auth update: never accepts a target user ID or uses a service key. */
export default function AdminPasswordChange({onClose,onBusy,onSuccess}:{onClose:()=>void;onBusy:(busy:boolean)=>void;onSuccess:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),lock=useRef(false),alive=useRef(true);
 const [password,setPassword]=useState(''),[confirm,setConfirm]=useState('');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{alive.current=true;dialog.current?.showModal();return()=>{alive.current=false;onBusy(false);};},[onBusy]);
 const valid=password.length>=8&&new TextEncoder().encode(password).length<=72&&password===confirm;
 async function save(){
  if(!supabase||lock.current||!valid)return;
  if(!navigator.onLine){setError('Thiết bị đang mất kết nối. Kết nối lại trước khi đổi mật khẩu.');return;}
  lock.current=true;setBusy(true);onBusy(true);setError('');
  try{
   const access=await supabase.rpc('get_my_access');
   if(access.error||access.data?.is_active!==true||access.data?.session_invalid||access.data?.must_change_password||!['admin','chu'].includes(access.data?.actual_role??access.data?.role)||!access.data?.permissions?.includes('employees.manage'))throw new Error('Không xác nhận được quyền Admin. Vui lòng đăng nhập lại.');
   if(!alive.current)return;
   const result=await supabase.auth.updateUser({password});
   if(result.error){
    const code=result.error.code;
    if(code==='same_password')throw new Error('Mật khẩu mới phải khác mật khẩu đang dùng.');
    if(code==='weak_password')throw new Error('Mật khẩu chưa đủ mạnh. Hãy chọn mật khẩu khác.');
    if(code==='reauthentication_needed'||code==='reauthentication_not_valid')throw new Error('Cần xác thực lại. Vui lòng đăng xuất, đăng nhập lại rồi đổi mật khẩu.');
    if(result.error.status&&result.error.status<500)throw new Error('Chưa đổi được mật khẩu. Vui lòng đăng nhập lại hoặc chọn mật khẩu khác.');
    throw new Error('Chưa xác nhận được kết quả. Nếu không đăng nhập được bằng mật khẩu cũ, hãy thử mật khẩu mới trước khi đổi lại.');
   }
   if(alive.current){setPassword('');setConfirm('');onSuccess();}
  }catch(e){if(alive.current){setPassword('');setConfirm('');setError(e instanceof Error&&!(e instanceof TypeError)?e.message:'Chưa xác nhận được kết quả do mất kết nối. Hãy kiểm tra đăng nhập bằng mật khẩu mới trước khi thử đổi lại.');}}
  finally{lock.current=false;if(alive.current){setBusy(false);onBusy(false);}}
 }
 return createPortal(<dialog ref={dialog} className="confirm-dialog employee-editor" aria-labelledby="admin-password-title" onCancel={e=>{e.preventDefault();if(!lock.current)onClose();}}>
  <h2 id="admin-password-title">Đổi mật khẩu Admin</h2><p>Chỉ thay đổi mật khẩu của tài khoản bạn đang đăng nhập.</p>
  <form onSubmit={e=>{e.preventDefault();void save();}}>
   <label>Mật khẩu mới<input autoFocus type="password" autoComplete="new-password" minLength={8} maxLength={72} required disabled={busy} value={password} onChange={e=>setPassword(e.target.value)}/></label>
   <small>Từ 8 ký tự, tối đa 72 byte. Nên kết hợp chữ, số và ký tự đặc biệt.</small>
   <label>Nhập lại mật khẩu mới<input type="password" autoComplete="new-password" required maxLength={72} disabled={busy} value={confirm} onChange={e=>setConfirm(e.target.value)}/></label>
   {confirm&&confirm!==password&&<p role="status">Hai mật khẩu chưa khớp.</p>}{error&&<p role="alert">{error}</p>}
   <div className="confirm-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Đóng</button><button className="primary" type="submit" disabled={busy||!valid}>{busy?'Đang lưu…':'Lưu mật khẩu'}</button></div>
  </form>
 </dialog>,document.body);
}
