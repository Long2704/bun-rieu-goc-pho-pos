import {supabase} from './supabase';
import type {ExcelMenuItem} from './revenue-workbook';
// Only called when exporting: Dashboard fetching and aggregation stay unchanged.
export async function loadExcelMenu():Promise<ExcelMenuItem[]>{
 if(!supabase)throw Error('Chưa có kết nối thực đơn.');
 const items:ExcelMenuItem[]=[];let expected:number|null=null;
 for(let offset=0;;){
  const r=await supabase.from('menu_items').select('id,name,category,price,sort,is_active',{count:'exact'}).order('sort').order('id').range(offset,offset+499);
  if(r.error||r.count===null)throw Error('Chưa tải đủ menu để xuất Excel.');
  if(expected!==null&&r.count!==expected)throw Error('Menu thay đổi trong lúc xuất. Hãy thử lại.');
  expected=r.count;const page=r.data as ExcelMenuItem[];
  if(page.some(i=>typeof i.name!=='string'||typeof i.category!=='string'||!Number.isSafeInteger(i.price)||i.price<0))throw Error('Menu chưa hợp lệ.');
  items.push(...page);offset+=page.length;if(offset>=expected)break;if(!page.length||offset>=50000)throw Error('Chưa tải đủ menu.');
 }
 return items;
}
