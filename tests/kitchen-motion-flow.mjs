import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:390,height:844},recordVideo:{dir:'/workspace/artifacts/kitchen-motion',size:{width:390,height:844}}});
const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'side',name:'Giò khoanh',price:10000,category:'an_them',is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
const makeLine=(product,n)=>({...product,id:'line-'+n,menu_item_id:product.id,qty:1,note:'Ghi chú '+n,paid:false,bill_no:1,cancelled_at:null,kitchen_position:n});
const orders=[{id:'first',request_id:'first',session_id:'s1',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T01:00:00Z',order_items:[makeLine(menu[1],1),makeLine(menu[0],2),makeLine(menu[0],3),makeLine(menu[2],4)]},{id:'second',request_id:'second',session_id:'s2',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T02:00:00Z',order_items:[makeLine(menu[0],5)]}];
let closed=false,cancelCalls=0,lose=true,completeCalls=0,mode='success';
await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
 if(await mockLegacyMenuGroups(route))return;
 const req=route.request(),path=new URL(req.url()).pathname;let body;
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'owner@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/user')body={id:'staff',email:'owner@example.test'};
 else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Chủ quán',role:'chu'});
 else if(path==='/rest/v1/menu_items')body=menu;
 else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'},{id:2,name:'Bàn 2'}];
 else if(path==='/rest/v1/table_sessions')body=orders.filter(o=>o.id!=='first'||!closed).map((o,n)=>({id:o.session_id,table_id:o.id==='first'?1:2,orders:[o]}));
 else if(path==='/rest/v1/orders')body=orders.filter(o=>o.status==='cooking').map(o=>({...o,order_items:[...o.order_items].reverse(),table_sessions:{table_id:o.id==='first'?1:2,closed_at:o.id==='first'&&closed?'2026-11-09T03:00:00Z':null}}));
 else if(path.endsWith('/cancel_order_item')){
  cancelCalls++;const line=orders[0].order_items.find(i=>i.id===req.postDataJSON().p_item_id);assert.ok(line);assert.equal(line.paid,false);line.cancelled_at??='2026-11-09T03:00:00Z';closed=orders[0].order_items.every(i=>i.cancelled_at);
  if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost cancellation ACK'}});}body=null;
 }else if(path.endsWith('/complete_kitchen_order')){completeCalls++;await new Promise(r=>setTimeout(r,180));if(mode==='fail')return route.fulfill({status:503,json:{message:'Simulated completion failure'}});orders.find(o=>o.id===req.postDataJSON().p_order_id).status='done';body=null;}
 else throw Error('Unexpected API '+path);
 await route.fulfill({json:body});
});
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__posTransitions=0;const original=document.startViewTransition?.bind(document);if(original)document.startViewTransition=change=>{window.__posTransitions++;return original(change);};});
await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();

await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.waitForTimeout(400);assert.equal(await page.locator('.pos-order-workspace').evaluate(e=>getComputedStyle(e).viewTransitionName),'pos-table-panel');await page.getByRole('button',{name:'Thêm món',exact:true}).click();await page.getByRole('button',{name:'Đồ uống',exact:true}).click();assert.match(await page.locator('.pos-product-list').evaluate(e=>getComputedStyle(e).animationName),/pos-category-in/);await page.getByRole('button',{name:'Đóng danh sách món',exact:true}).click();await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await page.locator('.table-grid').waitFor();await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>window.__posTransitions)>=2);assert.equal(await page.locator('.table-card').first().evaluate(e=>e.style.viewTransitionName),'');
await page.getByRole('button',{name:/^Bếp \(/}).click();await page.locator('.kitchen-card').first().waitFor();
async function drag(dx,dy=0){const box=await page.locator('.kitchen-card').first().boundingBox();const x=box.x+box.width/2,y=box.y+25;await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx,y+dy,{steps:12});await page.mouse.up();}
await drag(30);await page.waitForTimeout(350);assert.equal(completeCalls,0);assert.equal(await page.locator('.kitchen-card').count(),2);
await drag(8,65);await page.waitForTimeout(250);assert.equal(completeCalls,0);
mode='fail';await drag(-130);await page.getByRole('alert').filter({hasText:'Chưa hoàn thành đơn'}).first().waitFor();await page.waitForTimeout(300);assert.equal(await page.locator('.kitchen-card').count(),2);assert.equal(await page.locator('.kitchen-card').first().evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41),0);assert.equal(completeCalls,1);
mode='success';await drag(130);const shell=page.locator('.swipe-order').first();assert.match(await shell.getAttribute('class'),/is-waiting/);assert.ok(await page.locator('.kitchen-card').first().evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41)>100,'release must not jump back to zero while awaiting server');assert.equal(await page.locator('.kitchen-card').count(),2);await page.locator('.swipe-order.is-leaving').waitFor();await page.screenshot({path:'/workspace/artifacts/kitchen-swipe-leaving-390.png'});await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===1);assert.match(await page.locator('.kitchen-card').innerText(),/Bàn 2/);assert.equal(completeCalls,2);
await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 2 /}).click();assert.equal(await page.locator('.pos-order-workspace').evaluate(e=>getComputedStyle(e).viewTransitionName),'pos-table-panel');await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();await drag(-130);await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===0);assert.equal(completeCalls,3);await page.emulateMedia({reducedMotion:'no-preference'});await page.evaluate(()=>Object.defineProperty(document,'startViewTransition',{value:undefined,configurable:true}));await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await page.locator('.table-grid').waitFor();assert.deepEqual(errors,[]);await context.close();
console.log('PASS motion: shared table open/close and cleanup, category transition, short/vertical gestures do not submit, failed completion restores ticket, accepted swipe stays at release then exits/collapses, exactly one RPC, FIFO and reduced motion. Mock API, 390px Chromium video.');
}finally{await browser.close();}
