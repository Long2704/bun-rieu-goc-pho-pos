import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false,is_active:true,sort:0,version:1},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false,is_active:true,sort:1,version:1},{id:'out',name:'Bún tạm hết',price:65000,category:'bun',is_out:true,is_active:true,sort:2,version:1},{id:'hidden',name:'Món ngừng bán',price:10000,category:'bun',is_out:false,is_active:false,sort:3,version:1}];
 const peers=[],saves=[],unexpected=[],errors=[];
 const notify=()=>peers.forEach(({socket,joins})=>{const m=joins.get('realtime:pos:catalog');if(m)socket.send(JSON.stringify([m[0],null,m[2],'broadcast',{event:'invalidate',payload:{version:1},type:'broadcast'}]));});
 async function context(role){
  const c=await browser.newContext({viewport:{width:390,height:844}});
  await c.addInitScript(()=>sessionStorage.setItem('goc-pho-install-dismissed','1'));
  await c.routeWebSocket('**/realtime/v1/websocket**',socket=>{const joins=new Map();peers.push({socket,joins});socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(m[3]==='phx_join')joins.set(m[2],m);if(m[3]==='phx_join'||m[3]==='heartbeat')socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));});});
  await c.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   const req=route.request(),url=new URL(req.url()),path=url.pathname;let body;
   if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:role,email:role+'@example.test',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')body={id:role,email:role+'@example.test'};
   else if(path.endsWith('/get_my_access'))body=mockAccess({name:role,role});
   else if(path==='/rest/v1/menu_items')body=menu.filter(i=>!url.searchParams.has('is_active')||i.is_active);
   else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
   else if(path==='/rest/v1/table_sessions'||path==='/rest/v1/orders')body=[];
   else if(path.endsWith('/menu_group_catalog'))body={groups:[{id:'bun',name:'Món chính',category:'bun',sort:0},{id:'an_them',name:'Món thêm',category:'an_them',sort:1},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:2}],assignments:{},non_kitchen_checkout:true};
   else if(path.endsWith('/list_menu_management'))body=menu;
   else if(/\/(save_menu_item|save_menu_item_in_group)$/.test(path)){
    const p=req.postDataJSON();saves.push(p);const item=menu.find(i=>i.id===p.p_item_id);assert.equal(item.version,p.p_expected_version);
    Object.assign(item,{name:p.p_name,price:p.p_price,category:p.p_category,is_active:p.p_is_active,is_out:p.p_is_out,sort:p.p_sort,version:item.version+1});body=item.id;notify();
   }else{unexpected.push(path);throw Error('Unexpected API/sales mutation '+path);}
   await route.fulfill({json:body});
  });
  const p=await c.newPage();p.setDefaultTimeout(12000);p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.POS_TEST_URL||'http://localhost:5196');await p.getByLabel('Tên đăng nhập',{exact:true}).fill(role+'@example.test');await p.getByLabel('Mật khẩu',{exact:true}).fill('mock');await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();return {p,c};
 }
 const {p:waiter,c:wc}=await context('phuc_vu');await waiter.locator('.table-card').click();
 const card=id=>waiter.locator('.pos-product-row[data-product-id="'+id+'"]');
 await card('food').waitFor();assert.equal(await card('out').count(),1);assert.equal(await card('hidden').count(),0);assert.equal(await card('out').getByText('Tạm hết',{exact:true}).count(),1);assert.equal(await card('out').getByRole('button',{name:'Thêm Bún tạm hết',exact:true}).isDisabled(),true);
 await card('out').click({position:{x:8,y:8}});assert.equal(await waiter.getByRole('dialog').count(),0);assert.equal(await card('out').locator('output').count(),0);assert.equal(await waiter.locator('.pos-cart-flight').count(),0);
 await waiter.getByRole('button',{name:'Món chính',exact:true}).click();assert.equal(await card('out').count(),1);
 await waiter.getByRole('button',{name:'Tìm kiếm món',exact:true}).click();await waiter.getByLabel('Tìm món',{exact:true}).fill('tam het');assert.equal(await card('out').count(),1);assert.equal(await card('food').count(),0);await waiter.getByLabel('Tìm món',{exact:true}).fill('');
 await card('food').click();assert.equal(await card('food').locator('output').innerText(),'1');
 const {p:owner,c:oc}=await context('chu');await owner.locator('.management-menu>summary').click();await owner.getByRole('button',{name:'Quản lý thực đơn',exact:true}).click();
 async function stock(out,active=true){
  await owner.getByRole('button',{name:'Sửa Bún riêu',exact:true}).click();const dialog=owner.getByRole('dialog',{name:'Sửa món',exact:true});await dialog.waitFor();
  await dialog.getByLabel('Đang bán',{exact:true}).setChecked(active);await dialog.getByLabel('Hết món tạm thời',{exact:true}).setChecked(out);await dialog.getByRole('button',{name:'Lưu thực đơn',exact:true}).click();await dialog.waitFor({state:'hidden'});
 }
 await stock(true);await card('food').getByText('Tạm hết',{exact:true}).waitFor();assert.equal(await card('food').locator('output').innerText(),'1','existing draft is never silently deleted');
 const plus=card('food').getByRole('button',{name:'Thêm Bún riêu',exact:true}),minus=card('food').getByRole('button',{name:'Bớt Bún riêu',exact:true});
 assert.equal(await plus.isDisabled(),true);assert.equal(await minus.isEnabled(),true);await plus.evaluate(el=>el.click());assert.equal(await card('food').locator('output').innerText(),'1');
 await waiter.screenshot({path:'/workspace/artifacts/menu-temporarily-out-390.png'});
 await minus.click();const removal=waiter.getByRole('dialog',{name:'Xóa món khỏi đơn?',exact:true});await removal.getByRole('button',{name:'Xóa món',exact:true}).click();assert.equal(await card('food').locator('output').count(),0);
 await stock(false);await card('food').getByRole('button',{name:'Thêm Bún riêu',exact:true}).waitFor({state:'visible'});await waiter.waitForFunction(()=>!document.querySelector('[data-product-id="food"] .pos-product-unavailable'));assert.equal(await card('food').getByRole('button',{name:'Thêm Bún riêu',exact:true}).isEnabled(),true);
 await stock(false,false);await card('food').waitFor({state:'detached'});
 await stock(true,false);assert.equal(await card('food').count(),0,'inactive always stays hidden even when also marked temporarily out');
 await stock(true,true);await card('food').getByText('Tạm hết',{exact:true}).waitFor();assert.equal(await card('food').getByRole('button',{name:'Thêm Bún riêu',exact:true}).isDisabled(),true);
 for(const width of [320,390,1440]){await waiter.setViewportSize({width,height:900});assert.ok(await waiter.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await stock(false,true);await waiter.waitForFunction(()=>!document.querySelector('[data-product-id="food"] .pos-product-unavailable'));await card('food').click();assert.equal(await card('food').locator('output').innerText(),'1');
 assert.ok(saves.every(p=>p.p_item_id==='food'));assert.deepEqual(unexpected,[]);assert.deepEqual(errors,[]);await wc.close();await oc.close();
 console.log('PASS menu availability: manager existing flags preserved, temporary-out remains visible in search/category and cannot select/animate/increase, existing draft retained and removable, catalog Realtime updates other device, recovery enables selection, inactive hidden including both flags set, 320/390/1440 layout, no sales writes. All HTTP/WebSocket mocked.');
}finally{await browser.close();}
