import {projectLinkedSessions} from './linked-tables';
import type {Order,TableSession} from './order-model';
import {isSessionId} from './realtime-sync';
export type CookingOrder=Order&{table_sessions:{table_id:number;closed_at:string|null;table_path?:number[]}};
export type LiveSnapshot={sessions:TableSession[];kitchen:CookingOrder[]};
// Closed sessions are deliberately absent from sessions but can retain paid
// cooking tickets. Replace both projections for every requested session.
export function mergeRealtimeDelta(previous:LiveSnapshot,ids:readonly string[],value:unknown):LiveSnapshot{
 if(!value||typeof value!=='object'||!ids.length||ids.length>30||ids.some(id=>!isSessionId(id)))throw Error('Invalid delta scope');
 const data=value as {session_ids?:unknown;sessions?:unknown;links?:unknown;kitchen?:unknown};
 const scope=new Set(ids);
 if(!Array.isArray(data.session_ids)||data.session_ids.length!==scope.size||data.session_ids.some(id=>typeof id!=='string'||!scope.has(id))||new Set(data.session_ids).size!==scope.size||!Array.isArray(data.sessions)||!Array.isArray(data.kitchen))throw Error('Incomplete delta');
 const sessions=data.sessions as TableSession[],kitchen=data.kitchen as CookingOrder[];
 if(sessions.some(s=>!s||!scope.has(s.id)||!Number.isInteger(s.table_id)||!Array.isArray(s.orders)||s.orders.some(o=>!o||o.session_id!==s.id||!Array.isArray(o.order_items)))||new Set(sessions.map(s=>s.id)).size!==sessions.length)throw Error('Invalid sessions');
 if(kitchen.some(o=>!o||!scope.has(o.session_id)||o.status!=='cooking'||o.kitchen_relevant!==true||!o.table_sessions||!Array.isArray(o.order_items))||new Set(kitchen.map(o=>o.id)).size!==kitchen.length)throw Error('Invalid kitchen');
 const projected=projectLinkedSessions(sessions,data.links);
 const nextSessions=[...previous.sessions.filter(s=>!scope.has(s.id)),...projected];
 // A table ownership race must use the complete snapshot, never leave two bills
 // occupying one physical table or silently remove an unrelated session.
 if(new Set(nextSessions.map(s=>s.table_id)).size!==nextSessions.length)throw Error('Table ownership changed');
 const nextKitchen=[...previous.kitchen.filter(o=>!scope.has(o.session_id)),...kitchen].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id));
 if(new Set(nextKitchen.map(o=>o.id)).size!==nextKitchen.length)throw Error('Kitchen ownership changed');
 return {sessions:nextSessions,kitchen:nextKitchen};
}
