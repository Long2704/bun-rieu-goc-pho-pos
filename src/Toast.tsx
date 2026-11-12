import {useEffect,useState} from 'react';
import {createPortal} from 'react-dom';

export default function Toast({message}:{message:string}){
 const [visible,setVisible]=useState(!!message);
 useEffect(()=>{
  setVisible(!!message);
  if(!message)return;
  const timer=window.setTimeout(()=>setVisible(false),1000);
  return()=>window.clearTimeout(timer);
 },[message]);
 if(!message||!visible)return null;
 return createPortal(<aside className="pos-toast" role="status" aria-live="polite" aria-atomic="true"><span className="pos-toast-icon" aria-hidden="true">✓</span><p>{message}</p><button type="button" aria-label="Đóng thông báo" onClick={()=>setVisible(false)}>×</button></aside>,document.body);
}
