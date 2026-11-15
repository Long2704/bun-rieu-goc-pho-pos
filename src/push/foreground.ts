// Short server leases prevent suppression surviving a crashed/suspended page.
// Only opted-in devices renew while Kitchen is visible and synchronizing.
type Device={id:string;user:string;proof:string};
type Options={tab:string;read:()=>{device:Device|null;active:boolean};send:(device:Device,tab:string,active:boolean)=>Promise<void>;windowEvents:EventTarget;documentEvents:EventTarget;schedule?:(callback:()=>void,ms:number)=>ReturnType<typeof setInterval>;cancel?:(timer:ReturnType<typeof setInterval>)=>void};
export function startKitchenForeground(options:Options){
 let last:Device|null=null,queue=Promise.resolve(),timer:ReturnType<typeof setInterval>|undefined,disposed=false,renewNeeded=false;
 const schedule=options.schedule??setInterval,cancel=options.cancel??clearInterval;
 function send(d:Device,active:boolean){queue=queue.then(()=>options.send(d,options.tab,active)).catch(()=>{if(active&&last?.id===d.id&&last.user===d.user&&last.proof===d.proof)renewNeeded=true;/* Fail open: an unrenewed lease expires and push resumes. */});}
 function stopTimer(){if(timer!==undefined){cancel(timer);timer=undefined;}}
 function update(renew=false){
  if(disposed)return;
  const {device,active}=options.read();
  if(last&&(!active||!device||device.id!==last.id||device.user!==last.user||device.proof!==last.proof)){send(last,false);last=null;}
  if(device&&active){const changed=!last;last=device;if(changed||renew||renewNeeded){renewNeeded=false;send(device,true);}if(timer===undefined)timer=schedule(()=>update(true),60000);}else{renewNeeded=false;stopTimer();}
 }
 function hide(){stopTimer();if(last){send(last,false);last=null;}}
 const changed=()=>update();
 const reconnected=()=>update(true);
 const events=['kitchen-push-change','kitchen-view-change','offline','pageshow'];
 events.forEach(e=>options.windowEvents.addEventListener(e,changed));options.windowEvents.addEventListener('pagehide',hide);options.documentEvents.addEventListener('visibilitychange',changed);options.windowEvents.addEventListener('online',reconnected);update();
 return()=>{options.windowEvents.removeEventListener('online',reconnected);disposed=true;hide();events.forEach(e=>options.windowEvents.removeEventListener(e,changed));options.windowEvents.removeEventListener('pagehide',hide);options.documentEvents.removeEventListener('visibilitychange',changed);};
}
