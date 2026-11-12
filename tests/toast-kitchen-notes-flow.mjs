import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const scenario of ['normal']){
  const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[];let lose=scenario==='lost',failSync=scenario==='sync',guard=scenario==='routing';
  const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false}];
  const orders=[{id:'old',request_id:'old',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-01-01T00:00:00Z',order_items:[{id:'old-line',menu_item_id:'food',name:'Bún riêu',price:58000,qty:1,category:'bun',note:'Ít bún, không hành\nGhi chú dài vẫn hiển thị đầy đủ để bếp chuẩn bị đúng yêu cầu.',paid:false,bill_no:1,cancelled_at:null}]}];
  await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
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
   else if(path.endsWith('/cancel_table_session')){orders.splice(0);body=null;}
   else if(/\/(submit_order|submit_non_kitchen_order)$/.test(path)){
    const payload=req.postDataJSON();calls.push({path,...payload});
    if(guard){guard=false;menu[1].category='bun';return route.fulfill({status:400,json:{code:'P0001',message:'Đơn có món cần gửi bếp. Kiểm tra và bấm Gửi bếp.'}});}
    if(calls.length>1)failSync=false;
    let order=orders.find(o=>o.request_id===payload.p_request_id);
    if(!order){const kitchen=payload.p_items.some(i=>menu.find(m=>m.id===i.menu_item_id).category!=='do_uong');order={id:'new-'+orders.length,request_id:payload.p_request_id,session_id:'session',status:kitchen?'cooking':'done',kitchen_relevant:kitchen,created_at:'2026-01-01T01:00:00Z',order_items:payload.p_items.map((i,n)=>({...menu.find(m=>m.id===i.menu_item_id),...i,id:'new-line-'+orders.length+'-'+n,paid:false,bill_no:1,cancelled_at:null}))};orders.push(order);}
    if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost ACK'}});}body=order.id;
   }else throw Error('Unexpected API (including payment writes): '+path);
   await route.fulfill({json:body});
  });
  const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();

  const toast=page.locator('.pos-toast');
  async function addAndSend(){await page.locator('.pos-saved-line[data-product-id="food"]').getByRole('button',{name:'Thêm Bún riêu',exact:true}).click();await page.getByRole('button',{name:'Gửi bếp',exact:true}).click();await toast.waitFor();}
  await addAndSend();assert.equal(await toast.count(),1);assert.match(await toast.innerText(),/Đã lưu đơn Bàn 1/);assert.equal(await toast.evaluate(e=>getComputedStyle(e).position),'fixed');assert.equal(await page.locator('.notice').filter({hasText:'Đã lưu đơn'}).count(),0);
  const tableTop=await page.locator('.table-grid').evaluate(e=>e.getBoundingClientRect().top);await page.waitForTimeout(800);
  await page.getByRole('button',{name:/^Bàn 1 /}).click();await addAndSend();await page.waitForTimeout(500);assert.equal(await toast.isVisible(),true,'new identical notification gets its own one second');await toast.waitFor({state:'detached',timeout:800});assert.equal(await page.locator('.table-grid').evaluate(e=>e.getBoundingClientRect().top),tableTop,'toast does not shift page layout');
  await page.getByRole('button',{name:/^Bàn 1 /}).click();await addAndSend();await toast.getByRole('button',{name:'Đóng thông báo',exact:true}).click();assert.equal(await toast.count(),0);
  await page.getByRole('button',{name:/^Bếp \(/}).click();await page.locator('.kitchen-card .item-note').first().waitFor();const note=page.locator('.kitchen-card .item-note').first();assert.match(await note.innerText(),/Ít bún, không hành/);assert.match(await note.innerText(),/hiển thị đầy đủ/);assert.equal(await note.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');assert.equal(await note.evaluate(e=>getComputedStyle(e).fontSize),'12px');assert.ok(await note.evaluate(e=>e.getBoundingClientRect().width<=e.parentElement.getBoundingClientRect().width));
  await page.screenshot({path:'/workspace/artifacts/compact-kitchen-notes-390.png'});
  for(const width of [375,390,414,1440,390]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.locator('.pos-saved-line[data-product-id="food"]').getByRole('button',{name:'Thêm Bún riêu',exact:true}).click();await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();const confirm=page.getByRole('dialog',{name:'Thoát đơn hàng',exact:true});await confirm.waitFor();await page.waitForTimeout(2200);assert.equal(await confirm.isVisible(),true,'action confirmation must not auto-dismiss');await confirm.getByRole('button',{name:'Không',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.locator('.pos-saved-line[data-product-id="food"]').getByRole('button',{name:'Bớt Bún riêu',exact:true}).click();await page.getByRole('button',{name:'Thao tác bàn',exact:true}).click();await page.getByRole('button',{name:'Hủy cả Bàn 1',exact:true}).click();await page.getByRole('dialog',{name:'Xác nhận hủy Bàn 1',exact:true}).getByRole('button',{name:'Xác nhận hủy cả bàn',exact:true}).click();await toast.waitFor();assert.match(await toast.innerText(),/Đã hủy các món chưa thanh toán/);await page.screenshot({path:'/workspace/artifacts/one-second-cancellation-toast-390.png'});await toast.waitFor({state:'detached',timeout:3000});assert.deepEqual(errors,[]);await context.close();
 }
 console.log('PASS: one fixed success toast without layout shift, same-message refresh resets one second, auto-dismiss and manual close; confirmation persists; compact multiline kitchen note remains readable; 375/390/414/desktop. Mock API.');
}finally{await browser.close();}
