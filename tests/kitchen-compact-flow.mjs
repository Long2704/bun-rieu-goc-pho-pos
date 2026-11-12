import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,recordVideo:{dir:'/workspace/artifacts/kitchen-compact-motion',size:{width:390,height:844}}});
const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'side',name:'Giò khoanh',price:10000,category:'an_them',is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
const makeLine=(product,n)=>({...product,id:'line-'+n,menu_item_id:product.id,qty:1,note:'Ghi chú '+n,paid:false,bill_no:1,cancelled_at:null,kitchen_position:n});
const orders=[{id:'first',request_id:'first',session_id:'s1',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T01:00:00Z',order_items:[makeLine(menu[1],1),makeLine(menu[0],2),makeLine(menu[0],3),makeLine(menu[2],4)]},{id:'second',request_id:'second',session_id:'s2',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T02:00:00Z',order_items:[makeLine(menu[0],5)]}];
let closed=false,cancelCalls=0,lose=true,completeCalls=0,mode='success',acknowledged=0;
await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
 if(await mockLegacyMenuGroups(route))return;
 const req=route.request(),path=new URL(req.url()).pathname;let body;
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'owner@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/user')body={id:'staff',email:'owner@example.test'};
 else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Chủ quán',role:'chu'});
 else if(path==='/rest/v1/menu_items')body=menu;
 else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'},{id:2,name:'Bàn 2'}];
 else if(path==='/rest/v1/table_sessions')body=orders.filter(o=>o.id!=='first'||!closed).map((o,n)=>({id:o.session_id,table_id:Number(o.session_id.slice(1)),orders:[o]}));
 else if(path==='/rest/v1/orders'){if(mode==='sync-fail'&&acknowledged>=2)return route.fulfill({status:503,json:{message:'Snapshot unavailable after acknowledged completion'}});body=orders.filter(o=>o.status==='cooking').map(o=>({...o,order_items:[...o.order_items].reverse(),table_sessions:{table_id:Number(o.session_id.slice(1)),closed_at:o.id==='first'&&closed?'2026-11-09T03:00:00Z':null}}));}
 else if(path.endsWith('/cancel_order_item')){
  cancelCalls++;const line=orders[0].order_items.find(i=>i.id===req.postDataJSON().p_item_id);assert.ok(line);assert.equal(line.paid,false);line.cancelled_at??='2026-11-09T03:00:00Z';closed=orders[0].order_items.every(i=>i.cancelled_at);
  if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost cancellation ACK'}});}body=null;
 }else if(path.endsWith('/complete_kitchen_order')){completeCalls++;await new Promise(r=>setTimeout(r,900));if(mode==='fail')return route.fulfill({status:503,json:{message:'Simulated completion failure'}});orders.find(o=>o.id===req.postDataJSON().p_order_id).status='done';acknowledged++;body=null;}
 else throw Error('Unexpected API '+path);
 await route.fulfill({json:body});
});
orders.splice(0,orders.length,...Array.from({length:4},(_,n)=>({id:n?'ticket'+n:'first',request_id:'request'+n,session_id:'s'+(n+1),status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T0'+n+':00:00Z',order_items:[makeLine(menu[0],n+1)]})));
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__posTransitions=0;const original=document.startViewTransition?.bind(document);if(original)document.startViewTransition=change=>{window.__posTransitions++;return original(change);};});
await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();


await page.getByRole('button',{name:/^Bếp \(/}).click();await page.locator('.kitchen-card').first().waitFor();

const installClose=page.getByRole('button',{name:'Ẩn gợi ý cài app',exact:true});if(await installClose.count())await installClose.click();
const cards=page.locator('.kitchen-card'),shells=page.locator('.swipe-order');
assert.equal(await cards.count(),4);assert.equal(await page.locator('.new-order-badge,.new-kitchen-alert').count(),0);
const metrics=await cards.first().evaluate(el=>({height:el.getBoundingClientRect().height,top:el.getBoundingClientRect().top,listMargin:parseFloat(getComputedStyle(el.querySelector('ul')).marginTop),buttonHeight:el.querySelector('.primary').getBoundingClientRect().height}));
assert.ok(metrics.height<=160,JSON.stringify(metrics));assert.ok(metrics.listMargin<=7);assert.ok(metrics.buttonHeight>=44);
const beforeFirst=await shells.nth(0).boundingBox(),beforeSecond=await shells.nth(1).boundingBox();
assert.ok(beforeSecond.y-beforeFirst.y-beforeFirst.height<=11);
await page.screenshot({path:'/workspace/artifacts/kitchen-dense-mobile.png'});
await cards.first().getByRole('button',{name:'Xong',exact:true}).evaluate(el=>{el.click();el.click();});
await page.waitForTimeout(350);assert.equal(completeCalls,1);assert.equal(acknowledged,0);
assert.equal(await shells.first().evaluate(el=>getComputedStyle(el).display),'none');
const collapsedSecond=await shells.nth(1).boundingBox();assert.ok(Math.abs(collapsedSecond.y-beforeFirst.y)<2,JSON.stringify({beforeFirst,beforeSecond,collapsedSecond}));
await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===3);
assert.ok(Math.abs((await shells.first().boundingBox()).y-collapsedSecond.y)<2,'removing acknowledged DOM adds no second jump');
mode='fail';await cards.first().getByRole('button',{name:'Xong',exact:true}).click();await page.getByRole('alert').filter({hasText:'Chưa hoàn thành đơn'}).first().waitFor();
await page.waitForFunction(()=>!document.querySelector('.swipe-order.is-restoring,.swipe-order.is-waiting,.swipe-order.is-leaving'));
assert.equal(await cards.count(),3);assert.ok((await shells.first().boundingBox()).height>100);assert.equal(completeCalls,2);
// An acknowledged completion stays removed even if the subsequent snapshot fails.
mode='sync-fail';await cards.first().getByRole('button',{name:'Xong',exact:true}).click();
await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===2);assert.equal(acknowledged,2);
await page.waitForFunction(()=>!document.querySelector('.swipe-order.is-restoring'));assert.equal(completeCalls,3);
for(const width of [320,414,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
await page.screenshot({path:'/workspace/artifacts/kitchen-dense-desktop.png'});
assert.deepEqual(errors,[]);await context.close();
console.log('PASS dense kitchen: compact card/list/button spacing, no new badges/counters, 10px queue gap, immediate button completion before slow ACK, double-click once, next card moves without second jump, failure restores original ticket, snapshot failure after ACK cannot resurrect it, 320/414/1440 responsive. All HTTP/WebSocket mocked.');
}finally{await browser.close();}
