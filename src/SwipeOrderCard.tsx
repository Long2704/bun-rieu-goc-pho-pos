import {useEffect,useRef,useState} from 'react';
import type {PointerEvent,ReactNode} from 'react';
export type CompletionMotion=()=>Promise<void>;
export default function SwipeOrderCard({disabled,className,onComplete,children}:{disabled:boolean;className:string;onComplete:(beforeRemove?:CompletionMotion)=>Promise<boolean>;children:ReactNode}){
 const [phase,setPhase]=useState<'idle'|'dragging'|'waiting'|'leaving'>('idle'),[ready,setReady]=useState(false);
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
  const a=element.animate(frames,{duration:matchMedia('(prefers-reduced-motion: reduce)').matches?0:duration,easing:'cubic-bezier(.22,1,.36,1)',fill:'forwards'});animations.current.push(a);await a.finished.catch(()=>{});
 }
 async function finish(direction:number){
  lock.current=true;setPhase('waiting');let accepted=false;
  try{
   accepted=await onComplete(async()=>{
    if(!alive.current||!card.current||!wrapper.current)return;
    setPhase('leaving');const height=wrapper.current.getBoundingClientRect().height;
    await animate(card.current,[{transform:`translate3d(${offset.current}px,0,0)`,opacity:1},{transform:`translate3d(${direction*(width.current+32)}px,0,0)`,opacity:0}],230);
    if(alive.current&&wrapper.current)await animate(wrapper.current,[{height:`${height}px`,marginBottom:'0px'},{height:'0px',marginBottom:'-15px'}],190);
   });
  }catch{/* Parent owns the failure message; keep the ticket available. */}
  finally{
   lock.current=false;
   if(alive.current&&!accepted){const from=offset.current;cancelAnimations();place(0);setReady(false);setPhase('idle');if(card.current)void animate(card.current,[{transform:`translate3d(${from}px,0,0)`,opacity:1},{transform:'translate3d(0,0,0)',opacity:1}],200).then(()=>{if(alive.current)cancelAnimations();});}
  }
 }
 function up(e:PointerEvent<HTMLElement>){
  const g=gesture.current,dx=g?e.clientX-g.x:0;
  const complete=!!g&&g.id===e.pointerId&&g.horizontal&&Math.abs(dx)>=threshold()&&Math.abs(dx)>Math.abs(e.clientY-g.y)*1.4;
  gesture.current=null;if(!complete||disabled||lock.current){reset();return;}void finish(Math.sign(dx)||1);
 }
 // Touch browsers transfer capture from the touched child to the card; ignore the child's bubbling capture loss.
 return <div ref={wrapper} className={`swipe-order ${!disabled?'can-swipe':''} ${phase==='dragging'?'is-dragging':''} ${phase==='waiting'?'is-waiting':''} ${phase==='leaving'?'is-leaving':''}`}><div className="swipe-order-backdrop" style={{justifyItems:offset.current<0?'end':'start'}} aria-hidden="true">{phase==='waiting'?'Đang xác nhận…':phase==='leaving'?'Đã hoàn thành':ready?'Thả để hoàn thành':'Vuốt ngang để hoàn thành'}</div><article ref={card} className={className} onDragStart={e=>e.preventDefault()} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={e=>{if(gesture.current?.id===e.pointerId)reset();}} onLostPointerCapture={e=>{if(e.target===e.currentTarget&&gesture.current?.id===e.pointerId)reset();}}>{children}</article></div>;
}
