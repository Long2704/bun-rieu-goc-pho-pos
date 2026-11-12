import {useCallback, useEffect, useRef, type RefObject} from 'react';

// Decorative only: never await motion before changing a draft or submitting it.
export default function useCartMotion(target: RefObject<HTMLButtonElement | null>, scope: string) {
 const tasks = useRef(new Set<() => void>());
 const clear = useCallback(() => { for (const dispose of [...tasks.current]) dispose(); }, []);
 useEffect(() => {
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const hidden = () => { if (document.hidden) clear(); };
  preference.addEventListener('change', clear);
  document.addEventListener('visibilitychange', hidden);
  return () => { clear(); preference.removeEventListener('change', clear); document.removeEventListener('visibilitychange', hidden); };
 }, [scope, clear]);
 const fly = useCallback((source: HTMLElement | null) => {
  if (!source || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches || tasks.current.size >= 3) return;
  const art = source.querySelector('.pos-product-art') ?? source;
  const from = art.getBoundingClientRect();
  const icon = art.querySelector('svg')?.cloneNode(true);
  let node: HTMLDivElement | undefined, animation: Animation | undefined, frame = 0, disposed = false;
  const dispose = () => { disposed = true; cancelAnimationFrame(frame); animation?.cancel(); node?.remove(); tasks.current.delete(dispose); };
  tasks.current.add(dispose);
  frame = requestAnimationFrame(() => {
   const button = target.current;
   if (!button?.isConnected || !source.isConnected || !button.animate) { dispose(); return; }
   const to = button.getBoundingClientRect();
   if (!from.width || !to.width) { dispose(); return; }
   node = document.createElement('div'); node.className = 'pos-cart-flight'; node.setAttribute('aria-hidden', 'true');
   if (icon) node.append(icon); else node.textContent = '+';
   node.style.left = `${from.left + from.width / 2 - 20}px`; node.style.top = `${from.top + from.height / 2 - 20}px`;
   document.body.append(node);
   const dx = to.left + to.width / 2 - (from.left + from.width / 2), dy = to.top + to.height / 2 - (from.top + from.height / 2);
   try {
    animation = node.animate([
     {transform:'translate3d(0,0,0) scale(1)',opacity:1},
     {transform:`translate3d(${dx * .55}px,${dy * .35 - 45}px,0) scale(.85)`,opacity:1,offset:.5},
     {transform:`translate3d(${dx}px,${dy}px,0) scale(.2)`,opacity:0}
    ], {duration:460,easing:'cubic-bezier(.3,.05,.45,1)',fill:'forwards'});
    void animation.finished.then(() => {
     node?.remove();
     const badge = button.querySelector('span');
     if (disposed || !badge?.isConnected) { dispose(); return; }
     animation = badge.animate([{transform:'scale(1)'},{transform:'scale(1.2)',offset:.45},{transform:'scale(1)'}],{duration:180,easing:'ease-out'});
     void animation.finished.then(dispose, dispose);
    }, dispose).catch(dispose);
   } catch { dispose(); }
  });
 }, [target]);
 return {fly, clear};
}
