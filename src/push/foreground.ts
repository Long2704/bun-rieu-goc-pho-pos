// Short server leases prevent suppression surviving a crashed/suspended page.
// Only opted-in devices renew while Kitchen is visible and synchronizing.
type Device={id:string;user:string;proof:string};
type Options={tab:string;read:()=>{device:Device|null;active:boolean};send:(device:Device,tab:string,active:boolean)=>Promise<void>;windowEvents:EventTarget;documentEvents:EventTarget;schedule?:(callback:()=>void,ms:number)=>ReturnType<typeof setInterval>;cancel?:(timer:ReturnType<typeof setInterval>)=>void};
export function startKitchenForeground(options:Options){
 let last:Device|null=null,queue=Promise.resolve(),timer:ReturnType<typeof setInterval>|undefined,disposed=false;
 const schedule=options.schedule??setInterval,cancel=options.cancel??clearInterval;
 function send(d:Device,active:boolean){queue=queue.then(()=>options.send(d,options.tab,active)).catch(()=>{/* Fail open: an unrenewed lease expires and push resumes. */});}
 function stopTimer(){if(timer!==undefined){cancel(timer);timer=undefined;}}
 function update(){
  if(disposed)return;
  const {device,active}=options.read();
  if(last&&(!active||!device||device.id!==last.id||device.user!==last.user)){send(last,false);last=null;}
  if(device&&active){last=device;send(device,true);if(timer===undefined)timer=schedule(update,60000);}else stopTimer();
 }
 function hide(){stopTimer();if(last){send(last,false);last=null;}}
 const events=['kitchen-push-change','kitchen-view-change','online','offline','pageshow'];
 events.forEach(e=>options.windowEvents.addEventListener(e,update));options.windowEvents.addEventListener('pagehide',hide);options.documentEvents.addEventListener('visibilitychange',update);update();
 return()=>{disposed=true;hide();events.forEach(e=>options.windowEvents.removeEventListener(e,update));options.windowEvents.removeEventListener('pagehide',hide);options.documentEvents.removeEventListener('visibilitychange',update);};
}
