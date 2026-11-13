import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const scenario=process.env.SAVE_CASE??'success';const baseline=process.env.SAVE_BASELINE==='1',sid='10000000-0000-0000-0000-000000000001',oid='20000000-0000-0000-0000-000000000001',food='30000000-0000-0000-0000-000000000001';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),orders=[],calls=[],requests=[];let measuring=false,fail=scenario==='lost',malformed=scenario==='malformed',captured=false;
 const product={id:food,name:'Bún riêu',category:'bun',price:58000,is_out:false};
 const snapshot=()=>({session_ids:[sid],sessions:orders.length?[{id:sid,table_id:1,orders:structuredClone(orders)}]:[],links:[],kitchen:[]});
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(measuring)calls.push(path);
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'staff',email:'test@example.test',role:'authenticated',aud:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'test@example.test'};
  else if(path.endsWith('/get_my_access')){if(measuring)await new Promise(r=>setTimeout(r,200));body={...mockAccess({name:'Phục vụ',role:'phuc_vu'}),saved_menu_selections:true,linked_tables:true};}
  else if(path.endsWith('/menu_group_catalog'))body={groups:[{id:'bun',name:'Món chính',category:'bun',sort:10}],assignments:{},non_kitchen_checkout:true};
  else if(path==='/rest/v1/menu_items')body=[product];
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path.endsWith('/get_linked_table_snapshot')){if(measuring)await new Promise(r=>setTimeout(r,300));body={sessions:snapshot().sessions,links:[]};}
  else if(path==='/rest/v1/orders'){if(measuring)await new Promise(r=>setTimeout(r,300));body=[];}
  else if(path.endsWith('/get_pos_sync_delta'))body=snapshot();
  else if(path.endsWith('/save_menu_selection')||path.endsWith('/save_menu_selection_snapshot')){
   const p=req.postDataJSON();requests.push(p.p_request_id);await new Promise(r=>setTimeout(r,400));
   if(!orders.length)orders.push({id:oid,request_id:p.p_request_id,session_id:sid,is_draft:true,status:'cooking',kitchen_relevant:false,created_at:new Date().toISOString(),order_items:[{...product,id:'line',menu_item_id:food,qty:1,note:'',paid:false,bill_no:1}]});
   if(fail){fail=false;return route.abort('failed');}
   body=path.endsWith('/save_menu_selection_snapshot')?{order_id:oid,request_id:p.p_request_id,table_id:1,session_id:sid,snapshot:snapshot()}:oid;
   if(malformed&&path.endsWith('/save_menu_selection_snapshot')){malformed=false;body.request_id='wrong-request';}
   if(scenario==='race'&&path.endsWith('/save_menu_selection_snapshot')&&!captured){captured=true;orders.push({...structuredClone(orders[0]),id:'20000000-0000-0000-0000-000000000002',request_id:'other-request',order_items:[{...orders[0].order_items[0],id:'other-line',note:'Món gọi thêm từ máy khác'}]});await new Promise(r=>setTimeout(r,800));}
  }else throw Error('Unexpected '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.locator('.pos-product-hit').click();
 await page.evaluate(()=>{
  window.saveMeasure={};document.addEventListener('click',event=>{if(event.target.closest('button')?.textContent.startsWith('Xem đơn'))window.saveMeasure.start=performance.now();},true);
  const observer=new MutationObserver(()=>{if(window.saveMeasure.start&&!window.saveMeasure.visible&&document.querySelector('.pos-mode-order'))requestAnimationFrame(()=>{window.saveMeasure.visible??=performance.now()-window.saveMeasure.start;});if(window.saveMeasure.start&&!window.saveMeasure.confirmed&&document.querySelector('[data-selection-item]')&&[...document.querySelectorAll('.pos-bottom-actions button')].some(b=>b.textContent==='Gửi bếp'&&!b.disabled))requestAnimationFrame(()=>{window.saveMeasure.confirmed??=performance.now()-window.saveMeasure.start;});});observer.observe(document.body,{childList:true,subtree:true});
 });
 measuring=true;const start=Date.now();await page.getByRole('button',{name:/^Xem đơn \d/}).click();
 if(!baseline){await page.locator('.pos-mode-order').waitFor({timeout:1000});assert.equal(orders.length,0,'order screen opens before the server saves');assert.equal(await page.getByRole('button',{name:'Đang lưu…',exact:true}).isDisabled(),true);await page.getByText('Đang lưu đơn…',{exact:true}).waitFor();}
 if(!baseline&&['lost','malformed'].includes(scenario)){
  await page.getByRole('button',{name:'Thử lưu lại',exact:true}).waitFor();assert.equal(orders.length,1);assert.equal(await page.locator('.pos-floating-add').isDisabled(),true);await page.reload();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.getByRole('button',{name:'Thử lưu lại',exact:true}).click();
 }
 if(!baseline&&scenario==='race'){for(let n=0;n<30&&!captured;n++)await page.waitForTimeout(50);await page.evaluate(()=>{window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));window.dispatchEvent(new Event('online'));});}
 await page.locator('[data-selection-item]').first().waitFor();await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent==='Gửi bếp');return b&&!b.disabled;});
 const confirmed=Date.now()-start,metric=await page.evaluate(()=>window.saveMeasure??{});assert.equal(orders.length,scenario==='race'?2:1);assert.equal(await page.locator('[data-selection-item]').count(),scenario==='race'?2:1);if(requests.length>1)assert.ok(requests.every(id=>id===requests[0]),'retries after reload reuse UUID');assert.deepEqual(errors,[]);
 if(!baseline){if(scenario==='success')assert.ok(metric.visible<250,`screen switch ${metric.visible}ms`);assert.equal(calls.filter(p=>p.endsWith('/save_menu_selection_snapshot')).length,['lost','malformed'].includes(scenario)?2:1);if(scenario==='success')assert.equal(calls.filter(p=>p.endsWith('/get_my_access')||p.endsWith('/get_linked_table_snapshot')||p==='/rest/v1/orders').length,0,'no full refresh after atomic save');}
 console.log(JSON.stringify({baseline,scenario,screenVisibleMs:Math.round(metric.visible),confirmedUiMs:Math.round(metric.confirmed??0),testElapsedMs:confirmed,requests:calls}));
 await context.close();
}finally{await browser.close();}
