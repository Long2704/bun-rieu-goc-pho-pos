import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
 const line=(id,product,extra={})=>({...product,id,menu_item_id:product.id,qty:1,note:id==='food-a'?'Ít bún':'',bill_no:1,paid:false,cancelled_at:null,...extra});
 const items=[line('food-a',menu[0]),line('food-b',menu[0]),line('towel-line',menu[1]),line('drink-line',menu[2]),line('paid',menu[0],{paid:true}),line('cancelled',menu[0],{cancelled_at:'2026-11-09'})];
 items.find(i=>i.id==='food-a').bill_no=2;items.find(i=>i.id==='drink-line').bill_no=2;
 const order={id:'order',request_id:'order',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T01:00:00Z',order_items:items};
 const applied=new Map(),moves=[],payments=[],receipts=[];let lose=true,failSync=false,syncOnNext=false;const transfers=[],transferred=new Map(),targetOrders=[];let targetSession=null,sourceClosed=false,rejectTarget=false;
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'owner@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'owner@example.test'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Chủ quán',role:'chu'});
  else if(path==='/rest/v1/menu_items')body=menu;
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'},{id:2,name:'Bàn 2'},{id:-1,name:'Mang về'}];
  else if(path==='/rest/v1/table_sessions'){if(failSync)return route.fulfill({status:503,json:{message:'Sync failed'}});body=[...(!sourceClosed?[{id:'session',table_id:1,orders:[order]}]:[]),...(targetSession?[{id:targetSession,table_id:2,orders:targetOrders}]:[])];}
  else if(path==='/rest/v1/orders')body=[{...order,table_sessions:{table_id:1,closed_at:sourceClosed?'2026-11-09':null}},...targetOrders.map(o=>({...o,table_sessions:{table_id:2,closed_at:null}}))];
  else if(path.endsWith('/transfer_bill_to_table')){
   const p=req.postDataJSON();transfers.push(p);let result=transferred.get(p.p_request_id);
   if(!result){if(rejectTarget){rejectTarget=false;return route.fulfill({status:400,json:{code:'P0001',message:'Bàn đích đã thay đổi. Đồng bộ và chọn lại bàn đích.'}});}assert.equal(p.p_expected_target_session,targetSession);assert.equal(p.p_from_table,1);assert.equal(p.p_to_table,2);const selected=order.order_items.filter(i=>!i.paid&&!i.cancelled_at&&i.bill_no===p.p_bill_no);assert.deepEqual([...p.p_expected_item_ids].sort(),selected.map(i=>i.id).sort());const nextBill=targetOrders.length+1;targetSession??='target';selected.forEach(i=>i.bill_no=nextBill);order.order_items=order.order_items.filter(i=>!selected.includes(i));targetOrders.push({...order,id:'fragment-'+nextBill,request_id:'fragment-'+nextBill,session_id:targetSession,bill_transfer_origin:'order',table_path:[1,2],order_items:selected});sourceClosed=!order.order_items.some(i=>!i.paid&&!i.cancelled_at);result={table_id:2,session_id:targetSession,bill_no:nextBill,moved_count:selected.length};transferred.set(p.p_request_id,result);}
   if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost transfer ACK'}});}body=result;
  }else if(path.endsWith('/move_bill_items')){
   const p=req.postDataJSON();moves.push(p);let target=applied.get(p.p_request_id);
   if(target===undefined){target=p.p_to_bill||Math.max(...items.map(i=>i.bill_no))+1;for(const id of p.p_item_ids){const i=items.find(i=>i.id===id);assert.ok(i&&!i.paid&&!i.cancelled_at);assert.equal(i.bill_no,p.p_from_bill);i.bill_no=target;}applied.set(p.p_request_id,target);if(syncOnNext){syncOnNext=false;failSync=true;}}
   else failSync=false;
   if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost ACK'}});}body=target;
  }else if(path.endsWith('/pay_bill')){
   const p=req.postDataJSON();payments.push(p);const selected=items.filter(i=>!i.paid&&!i.cancelled_at&&i.bill_no===p.p_bill_no);assert.equal(p.p_bill_no,2);assert.equal(selected.length,3);assert.deepEqual([...p.p_expected_item_ids].sort(),selected.map(i=>i.id).sort());selected.forEach(i=>i.paid=true);
   const receipt={id:'receipt',invoice_no:1,table_no:1,bill_no:2,gross:64000,discount:0,total:64000,method:'cash',cash_received:64000,change_due:0,paid_at:'2026-11-09T01:00:00Z',bill_items:structuredClone(selected)};receipts.push(receipt);body='receipt';
  }else if(path==='/rest/v1/bills')body=receipts[0];
  else throw Error('Unexpected API '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();
 const bill=n=>page.locator(`.pos-order-lines [data-bill-no="${n}"]`),total=page.locator('.pos-total-line');
 async function startMove(){await page.getByRole('button',{name:'Thao tác bàn',exact:true}).click();await page.getByRole('button',{name:'Tách/gộp bill Bàn 1',exact:true}).click();}
 async function closeActions(){await page.getByRole('button',{name:'Đóng thao tác bàn',exact:true}).click();}
 const confirm=page.getByRole('button',{name:'Xác nhận tách/gộp bill',exact:true});

 const kitchenPage=await context.newPage();await kitchenPage.goto(process.env.POS_TEST_URL??'http://localhost:5194');await kitchenPage.getByRole('button',{name:/^Bếp \(/}).click();await kitchenPage.locator('.kitchen-card').first().waitFor();
 const transferDialog=page.getByRole('dialog',{name:'Chuyển bill sang bàn khác',exact:true});
 await bill(2).getByRole('button',{name:'Chuyển Bill 2 sang bàn khác',exact:true}).click();await transferDialog.waitFor();assert.match(await transferDialog.innerText(),/61\.000đ/);assert.equal(await transferDialog.getByRole('button',{name:'Xác nhận chuyển bill',exact:true}).isDisabled(),true);assert.equal(await page.getByLabel('Bàn nhận bill',{exact:true}).locator('option').filter({hasText:'Mang về'}).count(),0);await page.getByLabel('Bàn nhận bill',{exact:true}).selectOption('2');await transferDialog.getByRole('button',{name:'Xác nhận chuyển bill',exact:true}).click();await transferDialog.getByRole('alert').waitFor();assert.equal(targetOrders.length,1);assert.equal(await page.getByRole('button',{name:'Đăng xuất',exact:true,includeHidden:true}).isDisabled(),true);
 await page.reload();await transferDialog.waitFor();assert.equal(await page.locator('dialog[open]').count(),1,'legacy whole-table dialog must not steal pending bill transfer');await transferDialog.getByRole('button',{name:'Thử lại cùng mã chuyển bill',exact:true}).click();await page.locator('.pos-toast').filter({hasText:'sang Bàn 2'}).waitFor();assert.equal(transfers[0].p_request_id,transfers[1].p_request_id);assert.equal(targetOrders.length,1);assert.equal(await page.locator('.pos-screen-header h1').innerText(),'BÀN 2');assert.match(await total.innerText(),/61\.000đ/);assert.match(await bill(1).innerText(),/Trà đá/);assert.doesNotMatch(await bill(1).innerText(),/Khăn lạnh/);
 await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();for(const n of [1,2])assert.match(await page.getByRole('button',{name:new RegExp('^Bàn '+n+' ')}).innerText(),/61\.000đ/);await page.getByRole('button',{name:/^Bàn 1 /}).click();
 rejectTarget=true;await bill(1).getByRole('button',{name:'Chuyển Bill 1 sang bàn khác',exact:true}).click();await page.getByLabel('Bàn nhận bill',{exact:true}).selectOption('2');await transferDialog.getByRole('button',{name:'Xác nhận chuyển bill',exact:true}).click();await transferDialog.getByRole('alert').filter({hasText:'Bàn đích đã thay đổi'}).waitFor();assert.equal(targetOrders.length,1);await transferDialog.getByRole('button',{name:'Quay lại',exact:true}).click();
 await bill(1).getByRole('button',{name:'Chuyển Bill 1 sang bàn khác',exact:true}).click();await page.getByLabel('Bàn nhận bill',{exact:true}).selectOption('2');await transferDialog.getByRole('button',{name:'Xác nhận chuyển bill',exact:true}).click();await page.locator('.pos-toast').filter({hasText:'sang Bàn 2'}).waitFor();assert.equal(targetOrders.length,2);assert.match(await total.innerText(),/122\.000đ/);assert.equal(await page.locator('.pos-bill-group').count(),2);assert.equal(await bill(2).locator('.pos-saved-line[data-product-id="food"]').count(),1);assert.equal(sourceClosed,true);assert.equal(payments.length,0);assert.equal(transferred.size,2);
 await kitchenPage.getByRole('button',{name:'Đồng bộ',exact:true}).click();await kitchenPage.getByRole('heading',{name:'Bàn 1 → Bàn 2',exact:true}).first().waitFor();assert.equal(await kitchenPage.locator('.new-order-badge').count(),0,'kitchen that already saw the original ticket must not announce its fragments as new food');await page.screenshot({path:'/workspace/artifacts/bill-transferred-to-table-390.png'});await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();assert.match(await page.getByRole('button',{name:/^Bàn 1 /}).innerText(),/Trống/);await page.getByRole('button',{name:/^Bếp \(/}).click();assert.equal(await page.locator('.new-order-badge').count(),0,'moved ticket fragments are not new food orders');assert.equal(targetOrders.reduce((sum,o)=>sum+o.order_items.filter(i=>i.category==='bun').reduce((n,i)=>n+i.qty,0),0),2);assert.deepEqual(errors,[]);await context.close();console.log('PASS bill transfer UI: individual header action and frozen preview, empty/occupied targets with separate bill numbers, no takeaway, lost ACK/reload same request, no stolen modal, target-session rejection, other bill retained, last source closure, unchanged totals/no payment/new-food badge. Mock API.');
}finally{await browser.close();}
