import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const scenario of ['normal','lost','sync','routing','offline','no-pay','empty-table']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[];let lose=scenario==='lost',failSync=scenario==='sync',guard=scenario==='routing';
  const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false}];
  const orders=[{id:'old',request_id:'old',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-01-01T00:00:00Z',order_items:[{id:'old-line',menu_item_id:'food',name:'Bún riêu',price:58000,qty:1,category:'bun',note:'',paid:false,bill_no:1,cancelled_at:null}]}];
  if(scenario==='empty-table')orders.length=0;
  await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let body;
   if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'staff@example.test',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')body={id:'staff',email:'staff@example.test'};
   else if(path.endsWith('/get_my_access')){body=mockAccess({name:'Nhân viên',role:scenario==='no-pay'?'phuc_vu':'chu'});if(scenario==='no-pay')body.permissions=body.permissions.filter(p=>p!=='payments.collect');}
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
    if(!order){const kitchen=payload.p_items.some(i=>menu.find(m=>m.id===i.menu_item_id).category!=='do_uong');order={id:'new',request_id:payload.p_request_id,session_id:'session',status:kitchen?'cooking':'done',kitchen_relevant:kitchen,created_at:'2026-01-01T01:00:00Z',order_items:payload.p_items.map((i,n)=>({...menu.find(m=>m.id===i.menu_item_id),...i,menu_item_id:i.menu_item_id,id:'new-line-'+n,paid:false,bill_no:1,cancelled_at:null}))};orders.push(order);}
    if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost ACK'}});}body=order.id;
   }else throw Error('Unexpected API (including payment writes): '+path);
   await route.fulfill({json:body});
  });

  const page=await context.newPage();page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base=process.env.POS_TEST_URL??'http://localhost:5196';
  await page.goto(base);await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();
  await page.locator('.pos-order-workspace').waitFor();
  const add=page.getByRole('button',{name:'Thêm món',exact:true}).first();if(await add.isVisible())await add.click();
  await page.getByRole('button',{name:'Đồ uống',exact:true}).click();await page.getByRole('button',{name:'Thêm Khăn lạnh',exact:true}).click();await page.getByRole('button',{name:/^Xem đơn \d/}).click();
  if(scenario==='offline')await context.setOffline(true);
  await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();
  if(scenario==='routing'){
   await page.getByRole('button',{name:'Gửi bếp',exact:true}).waitFor();assert.equal(orders.length,1);assert.equal(await page.getByRole('dialog').count(),0);assert.match(await page.locator('.pos-draft-row').innerText(),/Khăn lạnh/);await context.close();continue;
  }
  if(['lost','sync','offline'].includes(scenario)){
   await page.locator('.pos-workspace-feedback [role="alert"]').first().waitFor();assert.equal(await page.locator('.pos-order-workspace').count(),1);assert.equal(await page.locator('dialog[open]').count(),0);
   const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('goc-pho-pending-v1:staff')));assert.equal(saved.saveOnly,true);assert.equal(saved.checkout,true);
   if(scenario==='offline'){assert.equal(calls.length,0);await context.setOffline(false);}
   await page.reload();await page.getByRole('button',{name:'Thử gửi lại đơn này',exact:true}).click();
   await page.locator('.table-card:not([disabled])').first().waitFor();assert.ok(calls.every(c=>c.p_request_id===saved.requestId));
  }
  const card=page.locator('.table-card').filter({hasText:'Bàn 1'});await card.waitFor();assert.match(await card.innerText(),scenario==='empty-table'?/3\.000đ/:/61\.000đ/);assert.equal(await card.getByText('Có món chưa xác nhận',{exact:true}).count(),0);
  assert.equal(orders.length,scenario==='empty-table'?1:2);assert.ok(calls.length>=1);assert.ok(calls.every(c=>c.path.endsWith('/submit_non_kitchen_order')));
  const nonKitchen=orders.filter(o=>o.request_id!=='old');assert.equal(nonKitchen.length,1);assert.equal(nonKitchen[0].kitchen_relevant,false);assert.equal(nonKitchen[0].status,'done');assert.equal(nonKitchen[0].order_items[0].qty,1);
  assert.equal(await page.locator('dialog[open]').count(),0);assert.equal(await page.evaluate(()=>localStorage.getItem('goc-pho-pending-v1:staff')),null);
  const second=await context.newPage();second.setDefaultTimeout(15000);await second.goto(base);await second.getByRole('button',{name:'Phục vụ',exact:true}).click();await second.locator('.table-card:not([disabled])').first().waitFor();assert.match(await second.locator('.table-card').first().innerText(),scenario==='empty-table'?/3\.000đ/:/61\.000đ/);
  await page.reload();await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.locator('.table-card:not([disabled])').first().waitFor();assert.match(await page.locator('.table-card').first().innerText(),scenario==='empty-table'?/3\.000đ/:/61\.000đ/);assert.deepEqual(errors,[]);
  console.log('PASS save-on-exit '+scenario+': synced across screens/reload, no kitchen ticket/payment/duplicates');await context.close();
 }
}finally{await browser.close();}
