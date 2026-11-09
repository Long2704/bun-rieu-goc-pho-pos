import {flushSync} from 'react-dom';
let running:{skipTransition:()=>void;finished:Promise<void>}|null=null;
export function tableMotion(tableId:number,update:()=>void){
 const doc=document as Document&{startViewTransition?:(change:()=>void)=>{skipTransition:()=>void;finished:Promise<void>}};
 if(!doc.startViewTransition||matchMedia('(prefers-reduced-motion: reduce)').matches){update();return;}
 running?.skipTransition();
 const selector=`.table-card[data-table-id="${tableId}"]`;
 const nameCard=()=>{const card=document.querySelector<HTMLElement>(selector);if(card)card.style.viewTransitionName='pos-table-panel';};
 nameCard();
 try{
  const transition=doc.startViewTransition(()=>{flushSync(update);nameCard();});running=transition;
  void transition.finished.catch(()=>{}).finally(()=>{if(running!==transition)return;document.querySelector<HTMLElement>(selector)?.style.removeProperty('view-transition-name');running=null;});
 }catch{update();document.querySelector<HTMLElement>(selector)?.style.removeProperty('view-transition-name');}
}
