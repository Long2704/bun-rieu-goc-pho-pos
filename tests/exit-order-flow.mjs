import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const scenario of ['normal','no','escape','non','none','mixed','offline','lost','sync']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[];let lose=scenario==='lost',failSync=scenario==='sync',guard=scenario==='routing';
  const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false}];
  const orders=[{id:'old',request_id:'old',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-01-01T00:00:00Z',order_items:[{id:'old-line',menu_item_id:'food',name:'Bún riêu',price:58000,qty:1,category:'bun',note:'',paid:false,bill_no:1,cancelled_at:null}]}];
  await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let body;
   if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'staff@example.test',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')body={id:'staff',email:'staff@example.test'};
   else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Nhân viên',role:scenario==='lost'?'phuc_vu':scenario==='sync'?'bep':'chu'});
   else if(path.endsWith('/menu_group_catalog'))body={non_kitchen_checkout:scenario!=='legacy',groups:[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}],assignments:{}};
   else if(path==='/rest/v1/menu_items')body=menu;
   else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
   else if(path==='/rest/v1/table_sessions'){if(failSync&&orders.length>1)return route.fulfill({status:503,json:{message:'Sync failed'}});body=[{id:'session',table_id:1,orders}];}
   else if(path==='/rest/v1/orders')body=orders.filter(o=>o.kitchen_relevant).map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));
   else if(/\/(submit_order|submit_non_kitchen_order)$/.test(path)){
    const payload=req.postDataJSON();calls.push({path,...payload});
    if(guard){guard=false;menu[1].category='bun';return route.fulfill({status:400,json:{code:'P0001',message:'Đơn có món cần gửi bếp. Kiểm tra và bấm Gửi bếp.'}});}
    if(calls.length>1)failSync=false;
    let order=orders.find(o=>o.request_id===payload.p_request_id);
    if(!order){const kitchen=payload.p_items.some(i=>menu.find(m=>m.id===i.menu_item_id).category!=='do_uong');order={id:'new',request_id:payload.p_request_id,session_id:'session',status:kitchen?'cooking':'done',kitchen_relevant:kitchen,created_at:'2026-01-01T01:00:00Z',order_items:payload.p_items.map((i,n)=>({...menu.find(m=>m.id===i.menu_item_id),...i,id:'new-line-'+n,paid:false,bill_no:1,cancelled_at:null}))};orders.push(order);}
    if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost ACK'}});}body=order.id;
   }else throw Error('Unexpected API (including payment writes): '+path);
   await route.fulfill({json:body});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();

  const back=()=>page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Thoát đơn hàng',exact:true});
  if(scenario==='none'){await back();await page.locator('.table-card').first().waitFor();assert.equal(await dialog.count(),0);assert.equal(calls.length,0);await context.close();continue;}
  if(scenario==='non'||scenario==='mixed'){
   await page.getByRole('button',{name:'Thêm món',exact:true}).click();await page.getByRole('button',{name:'Đồ uống',exact:true}).click();await page.getByRole('button',{name:'Thêm Khăn lạnh',exact:true}).click();await page.getByRole('button',{name:/^Xem đơn \d/}).click();
  }
  if(scenario==='non'){await back();await page.locator('.table-card').first().waitFor();assert.equal(await dialog.count(),0);assert.equal(calls.length,0);await context.close();continue;}
  const food=page.locator('.pos-saved-line[data-product-id="food"]');await food.getByRole('button',{name:'Thêm Bún riêu',exact:true}).click();await page.getByLabel('Ghi chú món thêm',{exact:true}).fill('Ít bún');
  if(scenario==='offline'){await context.setOffline(true);await page.waitForFunction(()=>!navigator.onLine);}
  await back();await dialog.waitFor();assert.equal(calls.length,0);assert.match(await dialog.innerText(),/món chưa gửi bếp/);
  if(scenario==='normal')await page.screenshot({path:'/workspace/artifacts/exit-order-popup-390.png'});
  if(scenario==='offline'){assert.equal(await dialog.getByRole('button',{name:'Thông báo',exact:true}).isDisabled(),true);await dialog.getByRole('button',{name:'Không',exact:true}).click();await page.locator('.table-card').first().waitFor();assert.equal(calls.length,0);await context.close();continue;}
  if(scenario==='no'||scenario==='escape'){
   if(scenario==='no')await dialog.getByRole('button',{name:'Không',exact:true}).click();else await page.keyboard.press('Escape');
   const card=page.locator('.table-card').filter({hasText:'Bàn 1'});await card.waitFor();assert.match(await card.innerText(),/Có món chưa xác nhận/);assert.equal(calls.length,0);await card.click();assert.equal(await food.locator('output').innerText(),'2');assert.equal(await page.getByLabel('Ghi chú món thêm',{exact:true}).inputValue(),'Ít bún');await back();await dialog.waitFor();
  }
  await dialog.getByRole('button',{name:'Thông báo',exact:true}).click();
  if(['lost','sync'].includes(scenario)){
   await page.locator('.pos-workspace-feedback [role="alert"]').first().waitFor();assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.locator('.pos-order-workspace').count(),1);
   if(scenario==='lost'){await page.reload();await page.getByRole('button',{name:'Thử gửi lại đơn này',exact:true}).click();}else await page.getByRole('button',{name:'Thử gửi lại',exact:true}).click();
  }
  const card=page.locator('.table-card').filter({hasText:'Bàn 1'});await card.waitFor();assert.equal(await page.locator('.pos-order-workspace').count(),0);assert.doesNotMatch(await card.innerText(),/Có món chưa xác nhận/);assert.equal(orders.length,2);assert.ok(calls.every(c=>c.path.endsWith('/submit_order')));assert.equal(calls[0].p_items.find(i=>i.menu_item_id==='food').qty,1);assert.equal(calls[0].p_items.find(i=>i.menu_item_id==='food').note,'Ít bún');assert.equal(calls[0].p_items.length,scenario==='mixed'?2:1);if(calls.length===2)assert.equal(calls[0].p_request_id,calls[1].p_request_id);assert.equal(orders[0].order_items[0].qty,1);assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS exit-order dialog: no/escape keep draft and notes without submitting; notify sends only new quantities then map; no popup for non-kitchen/no draft; mixed, offline disable, lost ACK/reload and sync retries stay safe. Mock API, mobile Chromium.');
}finally{await browser.close();}
