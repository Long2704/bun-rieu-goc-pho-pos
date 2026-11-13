import {isSessionId} from './realtime-sync';
import {mergeRealtimeDelta} from './realtime-delta';
import type {LiveSnapshot} from './realtime-delta';
export function mergeSavedSelection(previous:LiveSnapshot,request:{requestId:string;tableId:number},value:unknown){
 if(!value||typeof value!=='object')throw Error('Phản hồi lưu đơn không hợp lệ.');
 const data=value as {order_id?:unknown;request_id?:unknown;table_id?:unknown;session_id?:unknown;snapshot?:unknown};
 if(!isSessionId(data.order_id)||!isSessionId(data.session_id)||data.request_id!==request.requestId||data.table_id!==request.tableId)throw Error('Phản hồi lưu đơn không khớp yêu cầu.');
 const next=mergeRealtimeDelta(previous,[data.session_id],data.snapshot);
 const open=next.sessions.find(s=>s.id===data.session_id);
 if(open&&!open.orders.some(o=>o.id===data.order_id&&o.request_id===request.requestId))throw Error('Chưa thấy đơn vừa lưu trong dữ liệu xác nhận.');
 return {sessionId:data.session_id,next};
}
