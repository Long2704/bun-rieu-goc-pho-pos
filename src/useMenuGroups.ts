import {catalogDue} from './sync-policy';
import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {isGroupCatalog} from './menu-groups';
import type {GroupCatalog} from './menu-groups';
export default function useMenuGroups(userId:string|undefined,sync:string){
 const [state,setState]=useState<{user?:string;catalog:GroupCatalog|null;error:string}>({catalog:null,error:''});
 const current=useRef(userId);current.current=userId;
 const lastSuccess=useRef({user:'',at:0}),inFlight=useRef(new Map<string,{again:boolean;promise:Promise<void>}>());
 const sequence=useRef(0),missingSchema=useRef<string|undefined>(undefined);
 const refresh=useCallback((force=true):Promise<void>=>{
  if(!supabase||!userId)return Promise.resolve();
  const client=supabase;
  const existing=inFlight.current.get(userId);if(existing){if(force)existing.again=true;return existing.promise;}
  const entry={again:false,promise:Promise.resolve()};inFlight.current.set(userId,entry);
  const read=async()=>{const request=++sequence.current;
  try{
   const result=await client.rpc('menu_group_catalog');
   if(current.current!==userId||request!==sequence.current)return;
   if(result.error){
    lastSuccess.current={user:userId,at:0};
    if(['PGRST202','42883'].includes(result.error.code))missingSchema.current=userId;
    setState({user:userId,catalog:null,error:['PGRST202','42883'].includes(result.error.code)?'Cần cập nhật cơ sở dữ liệu để bật quản lý nhóm món.':'Chưa tải được nhóm món. Kiểm tra mạng rồi thử lại.'});return;
   }
   if(!isGroupCatalog(result.data))throw new Error();
   missingSchema.current=undefined;lastSuccess.current={user:userId,at:Date.now()};
   setState(old=>old.user===userId&&JSON.stringify(old.catalog)===JSON.stringify(result.data)&&!old.error?old:{user:userId,catalog:result.data,error:''});
  }catch{if(current.current===userId&&request===sequence.current){lastSuccess.current={user:userId,at:0};setState({user:userId,catalog:null,error:'Chưa tải được nhóm món. Kiểm tra mạng rồi thử lại.'});}}
  };
  entry.promise=(async()=>{try{do{entry.again=false;await read();}while(entry.again&&current.current===userId&&inFlight.current.get(userId)===entry);}finally{if(inFlight.current.get(userId)===entry)inFlight.current.delete(userId);}})();return entry.promise;
 },[userId]);
 useEffect(()=>{if(typeof document!=='undefined'&&document.visibilityState!=='visible')return;if(!sync||!userId||missingSchema.current===userId||inFlight.current.has(userId))return;if(lastSuccess.current.user!==userId||catalogDue(lastSuccess.current.at))void refresh(false);},[sync,refresh,userId]);
 useEffect(()=>{if(!userId){lastSuccess.current={user:'',at:0};missingSchema.current=undefined;setState({catalog:null,error:''});}return()=>{sequence.current++;inFlight.current.clear();};},[userId]);
 return {catalog:state.user===userId?state.catalog:null,error:state.user===userId?state.error:'',refresh};
}
