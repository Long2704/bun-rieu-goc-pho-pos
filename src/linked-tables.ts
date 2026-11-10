import type {TableSession} from './order-model';
export type TableLink={table_id:number;session_id:string};
// Project a shared session onto each physical table without copying any stored order.
export function projectLinkedSessions(raw:TableSession[],value:unknown):TableSession[]{
 if(!Array.isArray(value))throw Error('Không xác nhận được nhóm bàn.');
 const owners=new Map<number,string>(),groups=new Map<string,number[]>(),source=new Map(raw.map(s=>[s.id,s]));
 for(const v of value){const l=v as Partial<TableLink>;if(!Number.isInteger(l.table_id)||typeof l.session_id!=='string'||owners.has(l.table_id!)||!source.has(l.session_id))throw Error('Nhóm bàn vừa thay đổi.');owners.set(l.table_id!,l.session_id);groups.set(l.session_id,[...(groups.get(l.session_id)??[]),l.table_id!]);}
 for(const s of raw)if(owners.has(s.table_id)&&owners.get(s.table_id)!==s.id)throw Error('Nhóm bàn vừa thay đổi.');
 return raw.flatMap(s=>{const ids=groups.get(s.id);if(!ids)return[s];if(ids.length<2||!ids.includes(s.table_id))throw Error('Nhóm bàn chưa đồng bộ.');ids.sort((a,b)=>a-b);return[s.table_id,...ids.filter(id=>id!==s.table_id)].map(id=>({...s,table_id:id,canonical_table_id:s.table_id,member_table_ids:ids}));});
}
export function uniqueSessions(sessions:TableSession[]){return [...new Map(sessions.map(s=>[s.id,s])).values()];}
