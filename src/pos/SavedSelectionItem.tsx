import {useRef,useState} from 'react';
import {supabase} from '../supabase';
import ConfirmDialog from '../ConfirmDialog';
import {CancelItem} from '../OperationsPanel';
import QuantityControl from './QuantityControl';
import POSIcon from './POSIcon';
import type {SavedGroup} from './saved-order-groups';
import {formatMoney} from './types';
export default function SavedSelectionItem({group,disabled,canCancel,onBusy,onChanged}:{group:SavedGroup;disabled:boolean;canCancel:boolean;onBusy:(busy:boolean)=>void;onChanged:()=>Promise<void>}){
 const item=group.rows[0].line,[snapshot,setSnapshot]=useState<typeof item|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false);
 async function save(qty:number,note:string,expected=snapshot??item){
  if(!supabase||lock.current)return false;
  lock.current=true;setBusy(true);onBusy(true);setError('');
  try{const r=await supabase.rpc('edit_saved_menu_selection',{p_item_id:expected.id,p_expected_qty:expected.qty,p_expected_note:expected.note,p_qty:qty,p_note:note});if(r.error)throw Error(r.error.message);if(r.data?.ok!==true)throw Error('Chưa xác nhận cập nhật món.');await onChanged();return true;}
  catch(e){setError(e instanceof Error?e.message:'Chưa lưu được món. Kiểm tra kết nối và thử lại.');return false;}
  finally{lock.current=false;setBusy(false);onBusy(false);}
 }
 return <article className="pos-saved-line pos-saved-selection" data-selection-item={item.id}><span className="pos-order-art"><POSIcon name={item.category==='do_uong'?'cup':'plate'}/></span><div className="pos-order-item-body"><div className="pos-order-item-heading"><h3>{item.name}</h3><small>{item.category==='do_uong'?'Không gửi bếp':'Chưa gửi bếp'}</small></div><div className="pos-order-item-bottom"><strong>{formatMoney(item.price*item.qty)}</strong><QuantityControl name={item.name} qty={item.qty} disabled={disabled||busy} decreaseDisabled={item.qty===1} onIncrease={()=>void save(item.qty+1,item.note,item)} onDecrease={()=>void save(item.qty-1,item.note,item)}/></div>{error&&!snapshot&&<p role="alert">{error}</p>}{item.note&&<p className="pos-saved-note">{item.note}</p>}<div className="pos-saved-actions">{item.category!=='do_uong'&&<button type="button" className="edit-sent-note-button" disabled={disabled||busy} aria-label={`Sửa ghi chú ${item.name}`} onClick={()=>{setError('');setNote(item.note);setSnapshot({...item});}}>Sửa ghi chú</button>}{canCancel&&<CancelItem compact item={item} disabled={disabled||busy} onBusy={onBusy} onChanged={onChanged}/>}</div></div><ConfirmDialog open={!!snapshot} title="Sửa ghi chú món" danger={false} busy={busy} error={error} confirmLabel="Lưu ghi chú" cancelLabel="Đóng" confirmDisabled={disabled||note.trim()===(snapshot?.note??'')} onConfirm={()=>{if(snapshot)void save(snapshot.qty,note.trim(),snapshot).then(ok=>{if(ok)setSnapshot(null);});}} onClose={()=>setSnapshot(null)} className="edit-sent-note-dialog"><p><strong>{snapshot?.qty} × {item.name}</strong></p><label>Ghi chú mới<textarea aria-label="Ghi chú món chưa gửi" maxLength={500} rows={3} value={note} disabled={disabled||busy} onChange={e=>setNote(e.target.value)}/></label></ConfirmDialog></article>;
}
