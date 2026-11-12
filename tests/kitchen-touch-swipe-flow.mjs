import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,recordVideo:{dir:'/workspace/artifacts/kitchen-motion',size:{width:390,height:844}}});
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
 else if(path==='/rest/v1/table_sessions')body=orders.filter(o=>o.id!=='first'||!closed).map((o,n)=>({id:o.session_id,table_id:o.id==='first'?1:2,orders:[o]}));
 else if(path==='/rest/v1/orders')body=orders.filter(o=>o.status==='cooking').map(o=>({...o,order_items:[...o.order_items].reverse(),table_sessions:{table_id:o.id==='first'?1:2,closed_at:o.id==='first'&&closed?'2026-11-09T03:00:00Z':null}}));
 else if(path.endsWith('/cancel_order_item')){
  cancelCalls++;const line=orders[0].order_items.find(i=>i.id===req.postDataJSON().p_item_id);assert.ok(line);assert.equal(line.paid,false);line.cancelled_at??='2026-11-09T03:00:00Z';closed=orders[0].order_items.every(i=>i.cancelled_at);
  if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost cancellation ACK'}});}body=null;
 }else if(path.endsWith('/complete_kitchen_order')){completeCalls++;await new Promise(r=>setTimeout(r,900));if(mode==='fail')return route.fulfill({status:503,json:{message:'Simulated completion failure'}});orders.find(o=>o.id===req.postDataJSON().p_order_id).status='done';acknowledged++;body=null;}
 else throw Error('Unexpected API '+path);
 await route.fulfill({json:body});
});
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(()=>{window.__posTransitions=0;const original=document.startViewTransition?.bind(document);if(original)document.startViewTransition=change=>{window.__posTransitions++;return original(change);};});
await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();


await page.getByRole('button',{name:/^Bếp \(/}).click();await page.locator('.kitchen-card').first().waitFor();
const cdp=await context.newCDPSession(page);
await page.evaluate(()=>{window.__captures=[];for(const type of ['gotpointercapture','lostpointercapture'])document.addEventListener(type,e=>window.__captures.push({type,target:e.target.tagName}),true);});
async function touch(locator,dx,dy=0,cancel=false){
 const box=await locator.boundingBox(),x=box.x+Math.min(35,box.width/2),y=box.y+Math.min(8,box.height/2);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
 for(let n=1;n<=12;n++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+dx*n/12,y:y+dy*n/12,id:1}]});await page.waitForTimeout(16);}
 await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
}
const first=()=>page.locator('.kitchen-card').first(),name=()=>first().locator('li strong').first();
await touch(name(),30);await page.waitForTimeout(300);assert.equal(completeCalls,0);
await touch(name(),5,-65);await page.waitForTimeout(300);assert.equal(completeCalls,0);
await touch(name(),144,1,true);await page.waitForTimeout(300);assert.equal(completeCalls,0);assert.equal(await first().evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41),0);
mode='fail';await touch(first().locator('.item-note').first(),144,1);await page.getByRole('alert').filter({hasText:'Chưa hoàn thành đơn'}).first().waitFor();await page.waitForTimeout(300);assert.equal(completeCalls,1);assert.equal(await page.locator('.kitchen-card').count(),2);assert.equal(await first().evaluate(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41),0);
mode='success';await touch(name(),144,1);
await page.waitForTimeout(350);
assert.equal(acknowledged,0,'flight/collapse finishes before slow server ACK');
assert.ok(await page.locator('.swipe-order').first().evaluate(e=>e.getBoundingClientRect().height)<2,'ticket collapses without waiting for ACK');
assert.equal(await page.locator('.swipe-order').first().getAttribute('aria-busy'),'true');
await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===1);assert.equal(completeCalls,2,'Touch retry must send exactly once');assert.match(await first().innerText(),/Bàn 2/);
const events=await page.evaluate(()=>window.__captures);assert.ok(events.some(e=>e.type==='lostpointercapture'&&e.target==='STRONG'),'Exercise native implicit capture transfer from a nested child');
await touch(first().locator('.order-heading>span'),-144,1);await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===0);assert.equal(completeCalls,3);assert.deepEqual(errors,[]);await context.close();
console.log('PASS real touch input: nested dish names/notes/time labels transfer implicit capture without cancelling swipe; left/right, short/vertical/cancelled touches, slow-ACK immediate collapse, failure restoration, retry once, FIFO. Reproduced zero submits before fix, correct completion after fix. Chromium mobile touch, mock API.');
}finally{await browser.close();}
