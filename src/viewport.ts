import './viewport.css';

// Safari can ignore viewport scaling limits: also cancel its native pinch events.
const preventZoom=(event:Event)=>{if(event.cancelable)event.preventDefault();};
for(const type of ['gesturestart','gesturechange'])document.addEventListener(type,preventZoom,{passive:false});

// One-finger scrolling, kitchen swipes and quantity taps keep their normal behavior.
document.addEventListener('touchmove',event=>{
 if(event.touches.length>1)preventZoom(event);
},{passive:false});

// Trackpad pinch is delivered as Ctrl+wheel in desktop browsers.
document.addEventListener('wheel',event=>{
 if(event.ctrlKey)preventZoom(event);
},{passive:false});

// Keep the usual browser reset shortcut (Ctrl/Cmd+0), but block page zoom steps.
document.addEventListener('keydown',event=>{
 if((event.ctrlKey||event.metaKey)&&!event.altKey&&['+','=','-'].includes(event.key))preventZoom(event);
});
