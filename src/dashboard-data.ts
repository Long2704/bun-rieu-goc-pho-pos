import {supabase} from './supabase';
import {bounds,validateSale} from './dashboard-model';
import type {Sale} from './dashboard-model';
export async function loadDashboardSales(from:string,to:string,signal:AbortSignal){
 if(!supabase)throw Error('Chưa có kết nối dữ liệu.');
 const {previous,end}=bounds(from,to),generatedAt=new Date().toISOString(),rows:Sale[]=[];
 const fields='id,session_id,table_no,service_label,paid_at,gross,discount,total,method,bill_items(name,qty,price)';
 let expected:number|null=null;
 for(let offset=0;;){
  const result=await supabase.from('bills').select(fields,{count:'exact'}).gte('paid_at',new Date(previous).toISOString()).lt('paid_at',new Date(end).toISOString()).lte('paid_at',generatedAt).order('paid_at').order('id').range(offset,offset+499).abortSignal(signal);
  if(result.error)throw Error('Không tải được dữ liệu Dashboard. Kiểm tra kết nối và quyền xem báo cáo rồi thử lại.');
  if(result.count===null||!Number.isSafeInteger(result.count)||result.count<0)throw Error('Chưa xác nhận được tổng số hóa đơn. Vui lòng tải lại Dashboard.');
  if(expected!==null&&expected!==result.count)throw Error('Dữ liệu thay đổi trong lúc tải. Bấm Xem Dashboard để tải lại.');
  if(expected===null){expected=result.count;if(expected!==null&&expected>50000)throw Error('Khoảng chọn có hơn 50.000 hóa đơn. Chọn khoảng ngắn hơn để tải đầy đủ dữ liệu.');}
  const page=result.data as Sale[];for(const sale of page)validateSale(sale);rows.push(...page);
  if(new Set(rows.map(s=>s.id)).size!==rows.length)throw Error('Dữ liệu thay đổi trong lúc tải. Bấm Xem Dashboard để tải lại.');
  offset+=page.length;if(expected!==null&&offset>=expected||expected===null&&page.length<500)break;
  if(!page.length||offset>=50000)throw Error('Chưa tải đủ hóa đơn. Chọn khoảng ngắn hơn rồi thử lại.');
 }
 return {rows,generatedAt};
}
