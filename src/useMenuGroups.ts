import {useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';
import {isGroupCatalog} from './menu-groups';
import type {GroupCatalog} from './menu-groups';
export default function useMenuGroups(userId:string|undefined,sync:string){
 const [state,setState]=useState<{user?:string;catalog:GroupCatalog|null;error:string}>({catalog:null,error:''});
 const current=useRef(userId);current.current=userId;
 const sequence=useRef(0),missingSchema=useRef<string|undefined>(undefined);
 const refresh=useCallback(async()=>{
  if(!supabase||!userId)return;
  const request=++sequence.current;
  try{
   const result=await supabase.rpc('menu_group_catalog');
   if(current.current!==userId||request!==sequence.current)return;
   if(result.error){
    if(['PGRST202','42883'].includes(result.error.code))missingSchema.current=userId;
    setState({user:userId,catalog:null,error:['PGRST202','42883'].includes(result.error.code)?'Cần cập nhật cơ sở dữ liệu để bật quản lý nhóm món.':'Chưa tải được nhóm món. Kiểm tra mạng rồi thử lại.'});return;
   }
   if(!isGroupCatalog(result.data))throw new Error();
   missingSchema.current=undefined;
   setState(old=>old.user===userId&&JSON.stringify(old.catalog)===JSON.stringify(result.data)&&!old.error?old:{user:userId,catalog:result.data,error:''});
  }catch{if(current.current===userId&&request===sequence.current)setState({user:userId,catalog:null,error:'Chưa tải được nhóm món. Kiểm tra mạng rồi thử lại.'});}
 },[userId]);
 useEffect(()=>{if(!sync||missingSchema.current===userId)return;void refresh();return()=>{sequence.current++;};},[sync,refresh]);
 return {catalog:state.user===userId?state.catalog:null,error:state.user===userId?state.error:'',refresh};
}
