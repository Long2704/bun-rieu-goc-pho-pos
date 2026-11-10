import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'Asia/Ho_Chi_Minh'});
 const food={id:'food',name:'Bún riêu truyền thống',price:58000,category:'bun',is_out:false},drink={id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false};
 const line=(id,p,note='',extra={})=>({...p,id,menu_item_id:p.id,qty:1,note,paid:false,bill_no:1,cancelled_at:null,...extra});
 const a=line('a',food,'Ít bún'),b=line('b',food,'Không hành');
 const orders=[{id:'first',request_id:'first',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:new Date(Date.now()-120000).toISOString(),order_items:[a,line('drink',drink),line('paid',food,'Bản đã thanh toán',{paid:true}),line('cancelled',food,'Bản đã hủy',{cancelled_at:new Date().toISOString()})]},{id:'second',request_id:'second',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:new Date(Date.now()-60000).toISOString(),order_items:[b]},{id:'done',request_id:'done',session_id:'session',status:'done',kitchen_relevant:true,created_at:new Date(Date.now()-180000).toISOString(),order_items:[line('done',food,'Đã phục vụ')]}];
 const cancelRequests=[],effects=[];let loseCancel=true;let mode='lost',syncFail=false,page;const requests=[],applied=new Map(),changes=[];
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'staff@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'staff@example.test'};
  else if(path.endsWith('/get_my_access'))body={...mockAccess({name:'Phục vụ',role:'phuc_vu'}),permissions:[...mockAccess({name:'Phục vụ',role:'phuc_vu'}).permissions,'orders.cancel']};
  else if(path==='/rest/v1/menu_items')body=[food,drink];
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Mang về 1'}];
  else if(path==='/rest/v1/table_sessions'){if(syncFail&&req.frame().page()===page){return route.fulfill({status:503,json:{message:'Sync failed'}});}body=[{id:'session',table_id:1,orders}];}
  else if(path==='/rest/v1/orders')body=orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));
  else if(path.endsWith('/cancel_order_item')){const p=req.postDataJSON();cancelRequests.push(p);const item=orders.flatMap(o=>o.order_items).find(i=>i.id===p.p_item_id);assert.ok(item);assert.equal(item.paid,false);if(!item.cancelled_at){item.cancelled_at=new Date().toISOString();effects.push(item.id);}if(loseCancel){loseCancel=false;return route.fulfill({status:503,json:{message:'Lost cancellation ACK'}});}return route.fulfill({status:200,body:''});}
  else if(path.endsWith('/edit_sent_order_note')){
   const p=req.postDataJSON();requests.push(p);
   if(mode==='missing')return route.fulfill({status:404,json:{code:'PGRST202',message:'Missing RPC'}});
   const order=orders.find(o=>o.id===p.p_order_id),item=order?.order_items.find(i=>i.id===p.p_item_id);assert.ok(item);
   if(mode==='conflict'){mode='ok';item.note='Người khác vừa sửa';item.note_version=(item.note_version??0)+1;return route.fulfill({status:400,json:{code:'P0001',message:'Ghi chú đã được người khác sửa. Đồng bộ và mở lại ghi chú mới nhất.'}});}
   if(mode==='complete'){mode='ok';order.status='done';return route.fulfill({status:400,json:{code:'P0001',message:'Bếp đã ra món hoặc món vừa được chuyển. Không thể sửa ghi chú.'}});}
   let result=applied.get(p.p_request_id);
   if(!result){assert.equal(p.p_expected_version,item.note_version??0);assert.equal(p.p_expected_note,item.note);assert.equal(item.paid,false);assert.equal(order.status,'cooking');item.note=p.p_note;item.note_version=(item.note_version??0)+1;item.note_edited_at=new Date().toISOString();result={ok:true,changed:true,item_id:item.id,note:item.note,note_version:item.note_version,note_edited_at:item.note_edited_at};applied.set(p.p_request_id,result);changes.push(item.id);}
   if(mode==='lost'){mode='ok';return route.fulfill({status:503,json:{message:'Lost ACK'}});}
   if(mode==='sync'){mode='ok';syncFail=true;}
   body=result;
  }else throw Error('Unexpected API '+path);
  await route.fulfill({json:body});
 });

 page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const base=process.env.POS_TEST_URL||'http://localhost:5196';
 await page.goto(base);await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Mang về 1 /}).click();
 const group=page.locator('.pos-saved-line[data-product-id="food"]');await group.getByRole('button',{name:'Chi tiết lượt gọi Bún riêu truyền thống',exact:true}).click();assert.equal(await group.getByRole('button',{name:'Hủy Bún riêu truyền thống',exact:true}).count(),3);assert.equal(await group.locator('[data-item-id="paid"]').count(),0);
 const kitchen=await context.newPage();await kitchen.goto(base);await kitchen.getByRole('button',{name:/^Bếp \(/}).click();await kitchen.locator('.kitchen-card').first().waitFor();const queue=await kitchen.locator('.kitchen-card .order-heading').allTextContents();
 const confirm=page.getByRole('dialog',{name:'Xác nhận hủy Bún riêu truyền thống',exact:true});await group.locator('[data-item-id="a"]').getByRole('button',{name:'Hủy Bún riêu truyền thống',exact:true}).click();await confirm.getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await confirm.getByRole('alert').waitFor();await confirm.getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await confirm.waitFor({state:'hidden'});assert.equal(cancelRequests.length,2);assert.equal(cancelRequests[0].p_item_id,cancelRequests[1].p_item_id);assert.deepEqual(effects,['a']);assert.match(await page.locator('.pos-total-line').innerText(),/119\.000đ/);
 await kitchen.locator('.kitchen-card').first().locator('.kitchen-cancelled-line').filter({hasText:'Ít bún'}).waitFor();assert.equal(await kitchen.locator('.kitchen-card').count(),2);assert.deepEqual(await kitchen.locator('.kitchen-card .order-heading').allTextContents(),queue);
 await group.locator('[data-item-id="done"]').getByRole('button',{name:'Hủy Bún riêu truyền thống',exact:true}).click();await confirm.getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await confirm.waitFor({state:'hidden'});assert.deepEqual(effects,['a','done']);assert.match(await page.locator('.pos-total-line').innerText(),/61\.000đ/);
 assert.equal(await group.locator('[data-item-id="paid"]').count(),0);assert.equal(orders[0].order_items.find(i=>i.id==='paid').cancelled_at,null);assert.deepEqual(errors,[]);console.log('PASS waiter cancellation UI: cooking and served item buttons, exact repeated occurrence, lost ACK retry applies once, total updated, paid excluded, kitchen strike-through and FIFO preserved; all APIs mocked.');
}finally{await browser.close();}
