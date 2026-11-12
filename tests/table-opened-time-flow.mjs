import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},timezoneId:'America/New_York'}),errors=[],writes=[],peers=[];
 const sid='00000000-0000-0000-0000-000000000681',other='00000000-0000-0000-0000-000000000683',fresh='00000000-0000-0000-0000-000000000682';
 const meal={id:'food',name:'Bún riêu truyền thống',price:58000,category:'bun',is_out:false};
 const order=id=>({id:'order-'+id,session_id:id,request_id:id,is_draft:false,status:'cooking',kitchen_relevant:true,created_at:'2026-11-12T07:40:00Z',order_items:[{...meal,id:'line-'+id,menu_item_id:'food',qty:1,note:'Ít bún',paid:false,bill_no:1}]});
 const original={id:sid,table_id:11,opened_at:'2026-11-12T07:07:00Z',orders:[order(sid)]};
 let sessions=[original,{id:other,table_id:12,opened_at:'2026-11-11T23:02:00Z',orders:[{...order(other),status:'done',kitchen_relevant:false}]}];
 const links=()=>sessions.filter(s=>s.table_id===11).flatMap(s=>[{table_id:11,session_id:s.id},{table_id:14,session_id:s.id}]);
 const kitchen=()=>sessions.flatMap(s=>s.orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:s.table_id,closed_at:null}})));
 const notify=ids=>peers.forEach(({socket,joined})=>{const m=joined.get('realtime:pos:orders');if(m)for(const session_id of ids)socket.send(JSON.stringify([m[0],null,m[2],'broadcast',{event:'invalidate',payload:{version:2,session_id},type:'broadcast'}]));});
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>{const joined=new Map();peers.push({socket,joined});socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(m[3]==='phx_join')joined.set(m[2],m);if(m[3]==='phx_join'||m[3]==='heartbeat')socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));});});
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'staff',email:'staff@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'staff@example.test'};
  else if(path.endsWith('/get_my_access'))body={...mockAccess({name:'Phục vụ',role:'phuc_vu'}),linked_tables:true,saved_menu_selections:true};
  else if(path==='/rest/v1/menu_items')body=[meal];
  else if(path==='/rest/v1/restaurant_tables')body=[11,12,13,14].map(id=>({id,name:'Bàn '+id,service_type:'dine_in'}));
  else if(path.endsWith('/menu_group_catalog'))body={groups:[{id:'bun',name:'Món chính',category:'bun',sort:0}],assignments:{},non_kitchen_checkout:true};
  else if(path.endsWith('/get_linked_table_snapshot'))body={sessions,links:links()};
  else if(path==='/rest/v1/orders')body=kitchen();
  else if(path.endsWith('/get_pos_sync_delta')){const ids=req.postDataJSON().p_session_ids;body={session_ids:ids,sessions:sessions.filter(s=>ids.includes(s.id)),links:links().filter(l=>ids.includes(l.session_id)),kitchen:kitchen().filter(o=>ids.includes(o.session_id))};}
  else{writes.push(path);throw Error('Unexpected API '+path);}
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>sessionStorage.setItem('goc-pho-install-dismissed','1'));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 const card=id=>page.locator('.table-card[data-table-id="'+id+'"]'),time=id=>card(id).locator('time');
 await time(11).waitFor();assert.equal(await time(11).innerText(),'14:07');assert.equal(await time(14).innerText(),'14:07');assert.equal(await time(12).innerText(),'06:02');assert.equal(await time(13).count(),0);
 assert.equal(await time(11).getAttribute('datetime'),original.opened_at);assert.ok(!(await card(11).innerText()).includes('Mở lúc'));
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:900});
  const box=await card(11).boundingBox(),clock=await time(11).boundingBox(),name=await card(11).locator('.table-card-heading>strong').boundingBox();
  assert.ok(clock.x>=box.x+8&&clock.y>=box.y+7&&clock.y<box.y+20);assert.ok(clock.y+clock.height<name.y);assert.ok(clock.x+clock.width<box.x+box.width-8);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'/workspace/artifacts/table-opening-time-'+width+'.png'});
 }
 await page.setViewportSize({width:390,height:844});
 // Adding another order must not replace the session clock with its later creation time.
 original.orders.push({...order(sid),id:'later-order',created_at:'2026-11-12T08:00:00Z'});notify([sid]);await page.getByRole('button',{name:'Đồng bộ',exact:true}).click();assert.equal(await time(11).innerText(),'14:07');
 // Closed sessions remove their clocks, including linked table projections.
 sessions=sessions.filter(s=>s.id!==sid);notify([sid]);await page.waitForFunction(()=>!document.querySelector('[data-table-id="11"] time'));assert.equal(await time(14).count(),0);
 // A new customer gets the new session opening time through the scoped Realtime read.
 sessions.push({id:fresh,table_id:11,opened_at:'2026-11-12T08:20:00Z',orders:[order(fresh)]});notify([fresh]);await page.waitForFunction(()=>document.querySelector('[data-table-id="11"] time')?.textContent==='15:20');assert.equal(await time(14).innerText(),'15:20');
 await card(11).click({position:{x:17,y:17}});await page.locator('.pos-order-workspace').waitFor();assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);
 console.log('PASS table opening time: HH:mm at upper-left, Vietnam time despite foreign device zone, overnight timestamp, empty hidden, linked shared time, later orders stable, close removes clocks/new session resets via scoped Realtime, no overlap 320/390/768/1440, timestamp click opens order, no sales writes. All HTTP/WebSocket mocked.');
 await context.close();
}finally{await browser.close();}
