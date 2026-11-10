import {memo} from 'react';
import POSIcon from './POSIcon';
import type {Product} from './types';
import {formatMoney} from './types';
function ProductItem({product,qty,disabled,onSelect}:{product:Product;qty:number;disabled:boolean;onSelect:(product:Product)=>void}){
 return <button type="button" className={`pos-product-row pos-product-select-card pos-product-hit${qty?' is-selected':''}`} data-product-id={product.id} aria-label={`${qty?'Chỉnh sửa':'Thêm'} ${product.name}`} disabled={disabled||product.is_out} onClick={()=>onSelect(product)}><span className="pos-product-art"><POSIcon name={product.category==='do_uong'?'cup':'plate'}/>{qty>0&&<span className="pos-product-selected"><POSIcon name="check"/></span>}</span><span className="pos-product-copy"><strong className="pos-product-name">{product.name}</strong><span>{formatMoney(product.price)}</span></span><span className="pos-product-pick-state">{product.is_out?'Hết món':qty>0?<><span className="pos-product-qty" aria-label={`Số lượng đã chọn ${product.name}`}>{qty}</span><small>Chỉnh sửa</small></>:<POSIcon name="plus"/>}</span></button>;
}
export default memo(ProductItem);
