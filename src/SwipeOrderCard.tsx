import {useEffect,useRef,useState} from 'react';
import type {PointerEvent,ReactNode} from 'react';
export type CompletionMotion=()=>Promise<void>;
export default function SwipeOrderCard({disabled,className,onComplete,children}:{disabled:boolean;className:string;onComplete:(beforeRemove?:CompletionMotion)=>Promise<boolean>;children:ReactNode}){
 const [phase,setPhase]=useState<'idle'|'dragging'|'waiting'|'leaving'|'restoring'>('idle'),[ready,setReady]=useState(false);
 const wrapper=useRef<HTMLDivElement>(null),card=useRef<HTMLElement>(null),offset=useRef(0),width=useRef(300),lock=useRef(false),alive=useRef(true),animations=useRef<Animation[]>([]);
 const gesture=useRef<{id:number;x:number;y:number;horizontal:boolean}|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;animations.current.forEach(a=>a.cancel());};},[]);
 const threshold=()=>Math.min(150,Math.max(85,width.current*.3));
 function place(x:number){offset.current=x;if(card.current)card.current.style.transform=`translate3d(${x}px,0,0)`;}
 function cancelAnimations(){animations.current.forEach(a=>a.cancel());animations.current=[];}
 function reset(){gesture.current=null;if(lock.current)return;place(0);setReady(false);setPhase('idle');}
 function down(e:PointerEvent<HTMLElement>){
  if(disabled||lock.current||!e.isPrimary||gesture.current||e.button!==0||(e.target as HTMLElement).closest('button,a,input,select,textarea,summary'))return;
  cancelAnimations();width.current=e.currentTarget.getBoundingClientRect().width;gesture.current={id:e.pointerId,x:e.clientX,y:e.clientY,horizontal:false};
 }
 function move(e:PointerEvent<HTMLElement>){
  const g=gesture.current;if(!g||g.id!==e.pointerId||disabled||lock.current)return;
  const dx=e.clientX-g.x,dy=e.clientY-g.y;
  if(!g.horizontal&&Math.abs(dy)>15&&Math.abs(dy)>Math.abs(dx)){reset();return;}
  if(!g.horizontal&&Math.abs(dx)>12&&Math.abs(dx)>Math.abs(dy)*1.4){g.horizontal=true;try{e.currentTarget.setPointerCapture(e.pointerId);}catch{}setPhase('dragging');}
  if(g.horizontal){place(Math.sign(dx)*Math.min(Math.abs(dx),width.current*.85));setReady(Math.abs(dx)>=threshold());}
 }
 async function animate(element:HTMLElement,frames:Keyframe[],duration:number){
  if(!alive.current)return;
  try{const a=element.animate(frames,{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});animations.current.push(a);await a.finished.catch(()=>{});}catch{/* Unsupported motion must never prevent the completion request. */}
 }
 async function reflow(change:()=>void){
  const parent=wrapper.current?.parentElement;
  if(!parent){change();return;}
  const siblings=Array.from(parent.children).filter((el):el is HTMLElement=>el instanceof HTMLElement&&el!==wrapper.current);
  const previous=siblings.map(el=>el.getBoundingClientRect());
  change();
  await Promise.all(siblings.map((el,index)=>{
   const next=el.getBoundingClientRect(),dx=previous[index].left-next.left,dy=previous[index].top-next.top;
   return Math.abs(dx)+Math.abs(dy)>.5?animate(el,[{transform:`translate3d(${dx}px,${dy}px,0)`},{transform:'translate3d(0,0,0)'}],160):Promise.resolve();
  }));
 }
 async function finish(direction:number){
  if(lock.current||disabled||!card.current||!wrapper.current)return;
  lock.current=true;setPhase('leaving');setReady(false);
  const height=wrapper.current.getBoundingClientRect().height;
  const gap=parseFloat(getComputedStyle(wrapper.current.parentElement!).rowGap)||0;
  const outside=direction*(width.current+32);
  // Start visuals and the request together. Server acknowledgement still decides success.
  const departure=Promise.all([
   animate(card.current,[{transform:`translate3d(${offset.current}px,0,0)`,opacity:1},{transform:`translate3d(${outside}px,0,0)`,opacity:0}],240),
   animate(wrapper.current,[{height:`${height}px`,marginBottom:'0px'},{height:'0px',marginBottom:`${-gap}px`}],270)
  ]).then(async()=>{if(alive.current&&wrapper.current){await reflow(()=>{if(wrapper.current)wrapper.current.style.display='none';});if(alive.current)setPhase('waiting');}});
  let accepted=false;
  try{accepted=await onComplete(()=>departure);}
  catch{/* Parent owns the failure message; restore the ticket below. */}
  finally{
   await departure;
   if(alive.current&&!accepted&&wrapper.current&&card.current){
    cancelAnimations();setPhase('restoring');
    wrapper.current.style.height='0px';wrapper.current.style.marginBottom=`${-gap}px`;
    const restored=reflow(()=>{if(wrapper.current)wrapper.current.style.display='';});
    await Promise.all([
     restored,
     animate(wrapper.current,[{height:'0px',marginBottom:`${-gap}px`},{height:`${height}px`,marginBottom:'0px'}],200),
     animate(card.current,[{transform:`translate3d(${direction*32}px,0,0)`,opacity:0},{transform:'translate3d(0,0,0)',opacity:1}],200)
    ]);
    if(alive.current){place(0);if(wrapper.current){wrapper.current.style.height='';wrapper.current.style.marginBottom='';}cancelAnimations();setPhase('idle');}
   }
   lock.current=false;
  }
 }
 function up(e:PointerEvent<HTMLElement>){
  const g=gesture.current,dx=g?e.clientX-g.x:0;
  const complete=!!g&&g.id===e.pointerId&&g.horizontal&&Math.abs(dx)>=threshold()&&Math.abs(dx)>Math.abs(e.clientY-g.y)*1.4;
  gesture.current=null;if(!complete||disabled||lock.current){reset();return;}void finish(Math.sign(dx)||1);
 }
 // Touch browsers transfer capture from the touched child to the card; ignore the child's bubbling capture loss.
 return <div ref={wrapper} className={`swipe-order ${!disabled?'can-swipe':''} ${phase==='dragging'?'is-dragging':''} ${phase==='waiting'?'is-waiting':''} ${phase==='leaving'?'is-leaving':''} ${phase==='restoring'?'is-restoring':''}`} inert={phase==='leaving'||phase==='waiting'||phase==='restoring'} aria-busy={phase==='leaving'||phase==='waiting'}><div className="swipe-order-backdrop" style={{justifyItems:offset.current<0?'end':'start'}} aria-hidden="true">{phase==='waiting'?'Đang xác nhận…':phase==='leaving'?'Đang hoàn thành…':ready?'Thả để hoàn thành':'Vuốt ngang để hoàn thành'}</div><article ref={card} className={className} onClickCapture={e=>{if((e.target as HTMLElement).closest('[data-complete-ticket]')){e.preventDefault();e.stopPropagation();if(!disabled&&!lock.current){width.current=e.currentTarget.getBoundingClientRect().width;void finish(1);}}}} onDragStart={e=>e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{if(gesture.current?.id===e.pointerId)reset();}} onLostPointerCapture={e=>{if(e.target===e.currentTarget&&gesture.current?.id===e.pointerId)reset();}}>{children}</article></div>;
}
