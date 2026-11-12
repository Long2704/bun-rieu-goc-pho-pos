import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:'/workspace/artifacts/ui-motion',size:{width:390,height:844}}}),calls=[];
 const food={id:'food',name:'Bún riêu đầy đủ',category:'bun',price:65000,is_out:false},water={id:'water',name:'Trà đá',category:'do_uong',price:3000,is_out:false},out={...food,id:'out',name:'Món hết',is_out:true};let orders=[];
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body;
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'test@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/user')body={id:'staff',email:'test@example.test'};
 else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Phục vụ',role:'phuc_vu'});
 else if(path.endsWith('/menu_group_catalog'))body={non_kitchen_checkout:true,groups:[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}],assignments:{}};
 else if(path==='/rest/v1/menu_items')body=[food,water,out];
 else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
 else if(path==='/rest/v1/table_sessions')body=orders.length?[{id:'s',table_id:1,orders}]:[];
 else if(path==='/rest/v1/orders')body=orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));
 else if(path.endsWith('/submit_order')){const p=req.postDataJSON();calls.push(p);let o=orders.find(o=>o.request_id===p.p_request_id);if(!o){o={id:'saved',session_id:'s',request_id:p.p_request_id,status:'cooking',kitchen_relevant:true,created_at:new Date().toISOString(),order_items:p.p_items.map((i,n)=>({...([food,water].find(m=>m.id===i.menu_item_id)),...i,id:'line'+n,paid:false,bill_no:1}))};orders.push(o);}body=o.id;}
 else throw Error('Unexpected API '+path);await route.fulfill({json:body});});
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();
 const card=id=>page.locator('.pos-product-row[data-product-id="'+id+'"]'),qty=id=>card(id).locator('.pos-quantity-control output'),dialog=page.getByRole('dialog',{name:'Chỉnh món Bún riêu đầy đủ',exact:true});

 await card('food').waitFor();
 await page.evaluate(async()=>{await Promise.all(document.getAnimations().map(a=>a.finished.catch(()=>{})));});
 await card('food').locator('.pos-product-hit').click();
 await page.locator('.pos-cart-flight').waitFor({state:'attached'});
 assert.equal(await qty('food').innerText(),'1');
 assert.equal(await page.locator('.pos-cart-flight').getAttribute('aria-hidden'),'true');
 assert.equal(await page.locator('.pos-cart-flight').evaluate(el=>getComputedStyle(el).pointerEvents),'none');
 await page.screenshot({path:'/workspace/artifacts/cart-flight-390.png'});
 await page.waitForFunction(()=>document.querySelectorAll('.pos-cart-flight').length===0);
 await card('food').click();await dialog.waitFor();
 assert.equal(await page.locator('.pos-cart-flight').count(),0);
 await dialog.getByRole('textbox').fill('Ít bún');
 await dialog.getByRole('button',{name:'Cập nhật món · 65.000đ',exact:true}).click();
 assert.equal(await page.locator('.pos-cart-flight').count(),0);
 // Burst clicks preserve every quantity update while decorative work stays bounded.
 await card('food').getByRole('button',{name:'Thêm Bún riêu đầy đủ',exact:true}).evaluate(button=>{for(let i=0;i<15;i++)button.click();});
 assert.equal(await qty('food').innerText(),'16');
 assert.ok(await page.locator('.pos-cart-flight').count()<=3);
 await page.emulateMedia({reducedMotion:'reduce'});
 await page.waitForFunction(()=>document.querySelectorAll('.pos-cart-flight').length===0);
 await card('food').getByRole('button',{name:'Thêm Bún riêu đầy đủ',exact:true}).click();
 assert.equal(await qty('food').innerText(),'17');assert.equal(await page.locator('.pos-cart-flight').count(),0);
 await page.emulateMedia({reducedMotion:'no-preference'});
 await card('water').click();await page.locator('.pos-cart-flight').waitFor({state:'attached'});
 // Navigation must remove all flying artifacts; no extra mutation happens for motion.
 await page.getByRole('button',{name:/^Xem đơn \d/}).click();
 await page.locator('.pos-order-pane').waitFor();assert.equal(await page.locator('.pos-cart-flight').count(),0);
 assert.equal(calls.length,0);assert.deepEqual(errors,[]);
 await context.close();
 console.log('PASS UI motion: real flight, immediate qty, note-only no flight, bounded rapid clicks, reduced-motion cancellation, navigation cleanup, zero mutations. APIs mocked.');
}finally{await browser.close();}
