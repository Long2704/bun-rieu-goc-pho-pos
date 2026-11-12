import {useCallback,useRef,useState} from 'react';
import ProductItem from './ProductItem';
import ProductEditor from './ProductEditor';
import type {Product} from './types';
import './product-editor.css';
export default function ProductList({products,qty,disabled,notes,onApply,onChange,onAdded}:{products:Product[];qty:Record<string,number>;disabled:boolean;notes:Record<string,string>;onApply:(id:string,qty:number,note:string)=>void;onChange:(id:string,delta:number)=>void;onAdded?:(source:HTMLElement|null)=>void}){
 const [editing,setEditing]=useState<string|null>(null),quantity=useRef(qty);quantity.current=qty;
 const list=useRef<HTMLDivElement>(null);
 const change=useCallback((id:string,delta:number)=>{
  onChange(id,delta);
  if(delta>0&&!disabled&&(quantity.current[id]??0)<99)onAdded?.(Array.from(list.current?.querySelectorAll<HTMLElement>('[data-product-id]')??[]).find(el=>el.dataset.productId===id)??null);
 },[onChange,onAdded,disabled]);
 const select=useCallback((product:Product)=>{if(disabled||product.is_out)return;if((quantity.current[product.id]??0)>0)setEditing(product.id);else change(product.id,1);},[disabled,change]);
 const product=products.find(p=>p.id===editing);
 return <><div ref={list} className="pos-product-list">{products.map(product=><ProductItem key={product.id} product={product} qty={qty[product.id]??0} disabled={disabled} onSelect={select} onChange={change}/>)}{!products.length&&<div className="pos-empty"><h2>Không tìm thấy món</h2><p>Thử tên khác hoặc chọn danh mục khác.</p></div>}</div>{product&&<ProductEditor key={product.id} product={product} initialQty={qty[product.id]??0} initialNote={notes[product.id]??''} disabled={disabled} onSave={(next,note)=>{if(!disabled){const previous=quantity.current[product.id]??0;onApply(product.id,next,note);if(next>previous)onAdded?.(Array.from(list.current?.querySelectorAll<HTMLElement>('[data-product-id]')??[]).find(el=>el.dataset.productId===product.id)??null);}}} onClose={()=>setEditing(null)}/>}</>;
}
