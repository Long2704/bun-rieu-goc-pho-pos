import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:390,height:844}});
const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'side',name:'Giò khoanh',price:10000,category:'an_them',is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
const makeLine=(product,n)=>({...product,id:'line-'+n,menu_item_id:product.id,qty:1,note:'Ghi chú '+n,paid:false,bill_no:1,cancelled_at:null,kitchen_position:n});
const orders=[{id:'first',request_id:'first',session_id:'s1',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T01:00:00Z',order_items:[makeLine(menu[1],1),makeLine(menu[0],2),makeLine(menu[0],3),makeLine(menu[2],4)]},{id:'second',request_id:'second',session_id:'s2',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T02:00:00Z',order_items:[makeLine(menu[0],5)]}];
let closed=false,cancelCalls=0,lose=true,completeCalls=0;
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
 }else if(path.endsWith('/complete_kitchen_order')){completeCalls++;orders.find(o=>o.id===req.postDataJSON().p_order_id).status='done';body=null;}
 else throw Error('Unexpected API '+path);
 await route.fulfill({json:body});
});
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
async function kitchen(){await page.getByRole('button',{name:/^Bếp \(/}).click();await page.locator('.kitchen-card').first().waitFor();}
await kitchen();const cards=page.locator('.kitchen-card');assert.equal(await cards.count(),2);assert.match(await cards.nth(0).innerText(),/Bàn 1/);
const before=await cards.nth(0).locator('li>strong').allTextContents();assert.deepEqual(before,['1 × Bún riêu','1 × Bún riêu','1 × Giò khoanh']);
async function openTable(){await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();}
await openTable();const food=page.locator('.pos-saved-line[data-product-id="food"]');await food.getByRole('button',{name:'Chi tiết lượt gọi Bún riêu',exact:true}).click();
await food.getByRole('button',{name:'Hủy Bún riêu',exact:true}).first().click();const cancelDialog=page.getByRole('dialog',{name:'Xác nhận hủy Bún riêu',exact:true});await cancelDialog.getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await cancelDialog.getByRole('alert').waitFor();await cancelDialog.getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(await page.locator('.is-cancelled').count(),0);await page.waitForFunction(()=>document.querySelector('.pos-saved-line[data-product-id="food"] output')?.textContent==='1');assert.equal(await food.locator('output').innerText(),'1');assert.match(await page.locator('.pos-total-line').innerText(),/71\.000đ/);
await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await kitchen();assert.deepEqual(await cards.nth(0).locator('li>strong').allTextContents(),before);assert.equal(await cards.nth(0).locator('.kitchen-cancelled-line').count(),1);assert.equal(await cards.nth(0).locator('.kitchen-cancelled-label').innerText(),'Đã hủy');assert.equal(await cards.nth(0).locator('.kitchen-cancelled-line>strong').evaluate(e=>getComputedStyle(e).textDecorationLine),'line-through');assert.match(await cards.nth(0).locator('.kitchen-cancelled-line').innerText(),/Ghi chú 2/);
await page.screenshot({path:'/workspace/artifacts/kitchen-cancelled-partial-390.png'});
for(const name of ['Bún riêu','Giò khoanh','Trà đá']){
 await openTable();await page.getByRole('button',{name:'Hủy '+name,exact:true}).click();await page.getByRole('dialog',{name:'Xác nhận hủy '+name,exact:true}).getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));assert.equal(await page.locator('.is-cancelled').count(),0);await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await kitchen();
}
assert.equal(closed,true);assert.equal(await cards.count(),2);assert.match(await cards.nth(0).innerText(),/Bàn 1/);assert.deepEqual(await cards.nth(0).locator('li>strong').allTextContents(),before);assert.equal(await cards.nth(0).locator('.kitchen-cancelled-line').count(),3);assert.doesNotMatch(await cards.nth(0).innerText(),/Trà đá/);assert.equal(cancelCalls,5);assert.equal(completeCalls,0);
await page.reload();await kitchen();assert.equal(await cards.count(),2);assert.deepEqual(await cards.nth(0).locator('li>strong').allTextContents(),before);
await cards.nth(0).getByRole('button',{name:'Xong',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.kitchen-card').length===1);assert.match(await cards.nth(0).innerText(),/Bàn 2/);assert.equal(completeCalls,1);
for(const width of [375,390,414,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
assert.deepEqual(errors,[]);await context.close();console.log('PASS UI cancellation: table hides cancelled dishes, remaining quantity/total preserved, lost ACK replay, kitchen strike-through/label/notes, stable main-first positions and FIFO including closed/all-cancelled tickets, reload, only Xong removes ticket; mobile/desktop. Mock API.');
}finally{await browser.close();}
