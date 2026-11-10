import {memo} from 'react';
import POSIcon from './POSIcon';
import QuantityControl from './QuantityControl';
import type {Product} from './types';
import {formatMoney} from './types';
function ProductItem({product,qty,disabled,onSelect,onChange}:{product:Product;qty:number;disabled:boolean;onSelect:(product:Product)=>void;onChange:(id:string,delta:number)=>void}){
 const locked=disabled||product.is_out;
 return <div className={`pos-product-row pos-product-select-card${qty?' is-selected':''}`} data-product-id={product.id} onClick={e=>{if(!(e.target as HTMLElement).closest('.pos-product-inline-quantity'))onSelect(product);}}><button type="button" className="pos-product-hit" aria-label={`${qty?'Chỉnh sửa':'Chọn'} ${product.name}`} disabled={locked}><span className="pos-product-art"><POSIcon name={product.category==='do_uong'?'cup':'plate'}/>{qty>0&&<span className="pos-product-selected"><POSIcon name="check"/></span>}</span><span className="pos-product-copy"><strong className="pos-product-name">{product.name}</strong><span>{formatMoney(product.price)}</span></span></button><div className="pos-product-inline-quantity">{product.is_out?'Hết món':qty>0?<QuantityControl name={product.name} qty={qty} disabled={locked} onIncrease={()=>onChange(product.id,1)} onDecrease={()=>onChange(product.id,-1)}/>:<button type="button" className="pos-product-add" aria-label={`Thêm ${product.name}`} disabled={locked} onClick={()=>onSelect(product)}><POSIcon name="plus"/></button>}</div></div>;
}
export default memo(ProductItem);
