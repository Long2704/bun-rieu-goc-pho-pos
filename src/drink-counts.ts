import {isSessionId} from './realtime-sync';

// Undefined means an older backend or a role that cannot use the projection.
export type DrinkCounts=Readonly<Record<string,number>>;
export function readDrinkCounts(value:unknown,scope?:ReadonlySet<string>):DrinkCounts|undefined{
 if(value==null)return undefined;
 if(typeof value!=='object'||Array.isArray(value))throw Error('Invalid drink counts');
 const entries=Object.entries(value);
 if(entries.some(([id,count])=>!isSessionId(id)||(scope&&!scope.has(id))||!Number.isSafeInteger(count)||count<=0))throw Error('Invalid drink counts');
 return Object.fromEntries(entries);
}
export function replaceDrinkCounts(previous:DrinkCounts|undefined,scope:ReadonlySet<string>,incoming:DrinkCounts|undefined):DrinkCounts|undefined{
 if(!previous)return undefined; // Only a complete snapshot can initialize this projection.
 if(!incoming)throw Error('Missing shared drink counts'); // Force a full refresh.
 return {...Object.fromEntries(Object.entries(previous).filter(([id])=>!scope.has(id))),...incoming};
}
export function totalDrinkCounts(counts:DrinkCounts|undefined):number|undefined{
 return counts&&Object.values(counts).reduce((sum,count)=>sum+count,0);
}
