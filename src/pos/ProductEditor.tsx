import {useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import POSIcon from './POSIcon';
import QuantityControl from './QuantityControl';
import type {Product} from './types';
import {formatMoney} from './types';
export default function ProductEditor({product,initialQty,initialNote,disabled,onSave,onClose}:{product:Product;initialQty:number;initialNote:string;disabled:boolean;onSave:(qty:number,note:string)=>void;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[qty,setQty]=useState(initialQty),[note,setNote]=useState(initialNote);
 useEffect(()=>{dialog.current?.showModal();},[]);
 return createPortal(<dialog ref={dialog} className="pos-product-editor" aria-label={`Chỉnh món ${product.name}`} onCancel={onClose}><header><button type="button" className="pos-icon-button" aria-label="Đóng chỉnh món" onClick={onClose}><POSIcon name="close"/></button><h2>Chi tiết món</h2></header><div className="pos-product-editor-body"><div className="pos-product-editor-summary"><span className="pos-product-art"><POSIcon name={product.category==='do_uong'?'cup':'plate'}/></span><div><h3>{product.name}</h3><p>{formatMoney(product.price)}</p></div></div>{product.category!=='do_uong'&&<label className="pos-product-editor-note">Ghi chú món<textarea aria-label="Ghi chú món" maxLength={500} rows={3} placeholder="Ít bún, không hành…" value={note} disabled={disabled} onChange={e=>setNote(e.target.value)}/><small>{note.length}/500</small></label>}<div className="pos-product-editor-quantity"><span>Số lượng</span><QuantityControl name={product.name} qty={qty} disabled={disabled} increaseDisabled={product.is_out} onIncrease={()=>setQty(q=>Math.min(99,q+1))} onDecrease={()=>setQty(q=>Math.max(0,q-1))}/></div></div><footer><button type="button" className="primary" disabled={disabled||product.is_out} onClick={()=>{onSave(qty,qty&&product.category!=='do_uong'?note:'');onClose();}}>{qty?`Cập nhật món · ${formatMoney(product.price*qty)}`:'Xóa khỏi đơn'}</button></footer></dialog>,document.body);
}
