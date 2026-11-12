import {useSyncExternalStore} from 'react';

// One local clock for all mounted table counters. Never polls the server.
const listeners=new Set<()=>void>();
let now=Date.now(),timer:ReturnType<typeof setInterval>|undefined;
const snapshot=()=>now;
function update(){now=Date.now();for(const listener of listeners)listener();}
function stop(){if(timer!==undefined){clearInterval(timer);timer=undefined;}}
function visible(){
 stop();
 if(document.visibilityState!=='hidden'){
  update();timer=setInterval(update,1000);
 }
}
function subscribe(listener:()=>void){
 listeners.add(listener);
 if(listeners.size===1){document.addEventListener('visibilitychange',visible);visible();}
 return()=>{listeners.delete(listener);if(!listeners.size){stop();document.removeEventListener('visibilitychange',visible);}};
}
export default function useVisibleClock(){return useSyncExternalStore(subscribe,snapshot,snapshot);}
