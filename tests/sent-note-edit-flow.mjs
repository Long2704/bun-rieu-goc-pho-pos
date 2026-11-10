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
 let mode='lost',syncFail=false,page;const requests=[],applied=new Map(),changes=[];
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'staff@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'staff@example.test'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Phục vụ',role:'phuc_vu'});
  else if(path==='/rest/v1/menu_items')body=[food,drink];
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Mang về 1'}];
  else if(path==='/rest/v1/table_sessions'){if(syncFail&&req.frame().page()===page){return route.fulfill({status:503,json:{message:'Sync failed'}});}body=[{id:'session',table_id:1,orders}];}
  else if(path==='/rest/v1/orders')body=orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));
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
 page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5173');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Mang về 1 /}).click();
 const group=page.locator('.pos-saved-line[data-product-id="food"]');await group.getByRole('button',{name:'Chi tiết lượt gọi Bún riêu truyền thống',exact:true}).click();assert.equal(await group.getByRole('button',{name:'Sửa ghi chú Bún riêu truyền thống',exact:true}).count(),2);assert.equal(await page.getByRole('button',{name:'Sửa ghi chú Khăn lạnh',exact:true}).count(),0);
 const total=await page.locator('.pos-total-line').innerText();const kitchen=await context.newPage();kitchen.setDefaultTimeout(12000);kitchen.on('pageerror',e=>errors.push(e.message));await kitchen.goto(process.env.POS_TEST_URL||'http://localhost:5173');await kitchen.getByRole('button',{name:/^Bếp \(/}).click();await kitchen.locator('.kitchen-card').first().waitFor();assert.equal(await kitchen.locator('.kitchen-card').count(),2);
 const dialog=page.getByRole('dialog',{name:'Sửa ghi chú món đã gửi',exact:true});const sources=group.locator('.pos-saved-source');
 await group.locator('[data-item-id="a"]').getByRole('button',{name:'Sửa ghi chú Bún riêu truyền thống',exact:true}).click();await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).isDisabled(),true);await dialog.getByRole('textbox',{name:'Ghi chú món đã gửi',exact:true}).fill('Không hành\nNhiều rau');await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await dialog.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).waitFor();assert.equal(await dialog.getByRole('textbox').isDisabled(),true);await dialog.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert.equal(requests[0].p_request_id,requests[1].p_request_id);assert.equal(changes.length,1);assert.equal(b.note,'Không hành');assert.match(await group.locator('[data-item-id="a"]').innerText(),/Không hành\nNhiều rau/);assert.equal(await page.locator('.pos-total-line').innerText(),total);await kitchen.locator('.kitchen-card').first().getByText('Không hành\nNhiều rau',{exact:true}).waitFor();assert.equal(await kitchen.locator('.kitchen-card').first().getByText('Đã chỉnh sửa',{exact:true}).count(),1);
 assert.equal(await kitchen.locator('.kitchen-card').first().locator('.note-edited-label').evaluate(e=>getComputedStyle(e).textAlign),'right');
 // Clear a different occurrence, with a confirmed save followed by a failed refresh.
 mode='sync';await group.locator('[data-item-id="b"]').getByRole('button',{name:'Sửa ghi chú Bún riêu truyền thống',exact:true}).click();await dialog.getByRole('textbox').fill('');await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Đã lưu ghi chú nhưng chưa đồng bộ'}).waitFor();syncFail=false;await dialog.getByRole('button',{name:'Thử lại cùng yêu cầu',exact:true}).click();await dialog.waitFor({state:'hidden'});assert.equal(requests[2].p_request_id,requests[3].p_request_id);assert.equal(changes.length,2);assert.equal(a.note,'Không hành\nNhiều rau');assert.equal(b.note,'');await kitchen.locator('.kitchen-card').nth(1).getByText('Đã chỉnh sửa',{exact:true}).waitFor();assert.equal(await kitchen.locator('.kitchen-card').nth(1).locator('.item-note').count(),0);
 await page.screenshot({path:'/workspace/artifacts/sent-note-service-390.png'});await kitchen.screenshot({path:'/workspace/artifacts/sent-note-kitchen-390.png'});
 mode='conflict';await group.locator('[data-item-id="b"]').getByRole('button',{name:'Sửa ghi chú Bún riêu truyền thống',exact:true}).click();await dialog.getByRole('textbox').fill('Không ghi đè');await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'người khác sửa'}).waitFor();assert.equal(await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).isDisabled(),true);assert.equal(b.note,'Người khác vừa sửa');await dialog.getByRole('button',{name:'Đóng',exact:true}).click();await group.locator('[data-item-id="b"]').getByText('Người khác vừa sửa',{exact:true}).waitFor();
 mode='complete';await group.locator('[data-item-id="a"]').getByRole('button',{name:'Sửa ghi chú Bún riêu truyền thống',exact:true}).click();await dialog.getByRole('textbox').fill('Quá trễ');await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Bếp đã ra món'}).waitFor();await dialog.getByRole('button',{name:'Đóng',exact:true}).click();assert.equal(a.note,'Không hành\nNhiều rau');await page.waitForFunction(()=>document.querySelectorAll('.pos-saved-source .edit-sent-note-button').length===1);
 mode='missing';await group.locator('[data-item-id="b"]').getByRole('button',{name:'Sửa ghi chú Bún riêu truyền thống',exact:true}).click();await dialog.getByRole('textbox').fill('Thiếu backend');await dialog.getByRole('button',{name:'Lưu ghi chú',exact:true}).click();await dialog.getByRole('alert').filter({hasText:'Chưa có chức năng'}).waitFor();await dialog.getByRole('button',{name:'Đóng',exact:true}).click();assert.equal(changes.length,2);
 for(const width of [375,390,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}assert.deepEqual(errors,[]);
 console.log('PASS sent-note UI: edit exact repeated occurrence as waiter, multiline/clear and small right-aligned edited badge on kitchen auto-sync, preserved money/FIFO, lost ACK and failed-refresh same-request replay, concurrent-note/completion conflicts, done/paid/cancelled/non-kitchen restrictions, missing backend error, mobile/desktop. API mocked.');
}finally{await browser.close();}
