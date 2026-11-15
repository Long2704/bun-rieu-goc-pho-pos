// Repeated manual clicks share one read batch. Never use for post-write confirmations.
export function createManualSync(){
 let current:{scope:string;promise:Promise<void>}|undefined;
 return (scope:string,read:()=>Promise<void>)=>{
  if(current?.scope===scope)return current.promise;
  const entry={scope,promise:Promise.resolve()};current=entry;
  entry.promise=Promise.resolve().then(read).finally(()=>{if(current===entry)current=undefined;});
  return entry.promise;
 };
}
