export const LIVE_SYNC_MS=5000;
export const CATALOG_SYNC_MS=60000;
export function catalogDue(lastSuccess:number,now=Date.now()){
 return lastSuccess===0||now<lastSuccess||now-lastSuccess>=CATALOG_SYNC_MS;
}
