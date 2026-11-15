import {projectLinkedSessions} from './linked-tables';
import type {TableSession} from './order-model';
import type {CookingOrder} from './realtime-delta';
type Catalog={menu:{id:string;name:string;price:number;category:string;is_out:boolean}[];tables:{id:number;name:string;service_type?:string}[]};
export type PosLiveSnapshot={version:1;access:unknown;snapshot:{sessions:TableSession[];links:unknown;kitchen:CookingOrder[]}|null;catalog:Catalog|null};
export function liveEnvelope(value:unknown):PosLiveSnapshot{
 if(!value||typeof value!=='object'||(value as PosLiveSnapshot).version!==1||!('access' in value))throw Error('Invalid live snapshot');
 return value as PosLiveSnapshot;
}
// Validate after access handling: revoked/password-reset accounts intentionally have no business data.
export function validateLiveSnapshot(data:PosLiveSnapshot,catalog:boolean,catalogOnly:boolean){
 if(!catalogOnly){
  const s=data.snapshot;
  if(!s||!Array.isArray(s.sessions)||!Array.isArray(s.kitchen))throw Error('Incomplete snapshot');
  if(s.sessions.some(v=>!v||typeof v.id!=='string'||!Number.isInteger(v.table_id)||!Array.isArray(v.orders)||v.orders.some(o=>!o||o.session_id!==v.id||!Array.isArray(o.order_items)))||new Set(s.sessions.map(v=>v.id)).size!==s.sessions.length)throw Error('Invalid sessions');
  const projected=projectLinkedSessions(s.sessions,s.links);
  if(new Set(projected.map(v=>v.table_id)).size!==projected.length)throw Error('Duplicate tables');
  if(s.kitchen.some(o=>!o||typeof o.id!=='string'||o.status!=='cooking'||o.kitchen_relevant!==true||!o.table_sessions||!Number.isInteger(o.table_sessions.table_id)||!Array.isArray(o.order_items))||new Set(s.kitchen.map(o=>o.id)).size!==s.kitchen.length)throw Error('Invalid kitchen');
 }
 if(catalog){const c=data.catalog;if(!c||!Array.isArray(c.menu)||!Array.isArray(c.tables)||c.menu.some(v=>!v||typeof v.id!=='string'||typeof v.name!=='string'||!Number.isFinite(v.price)||typeof v.category!=='string'||typeof v.is_out!=='boolean')||c.tables.some(v=>!v||!Number.isInteger(v.id)||typeof v.name!=='string'))throw Error('Invalid catalog');}
 return data;
}
export const missingLiveRpc=(error:{code?:string}|null)=>error?.code==='PGRST202'||error?.code==='42883';
