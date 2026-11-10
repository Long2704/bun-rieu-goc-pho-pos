import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
import {projectLinkedSessions,uniqueSessions} from '../src/linked-tables.ts';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const scenario of ['shared','separate','lost','lost-separate','sync','offline']){
 const context=await browser.newContext({viewport:{width:390,height:844}}),calls=[],applied=new Map();let lose=scenario.startsWith('lost')||scenario==='offline',failSync=false,failAfterLink=scenario==='sync';
 const food={id:'food',name:'Bún riêu',category:'bun',price:58000,is_out:false},water={id:'water',name:'Trà đá',category:'do_uong',price:3000,is_out:false};
 const line=(id,p)=>({...p,id,menu_item_id:p.id,qty:1,note:'',paid:false,bill_no:1,cancelled_at:null});
 const order=(n,p)=>({id:'o'+n,request_id:'r'+n,session_id:'s'+n,status:p.category==='do_uong'?'done':'cooking',kitchen_relevant:p.category!=='do_uong',created_at:'2026-11-10T00:00:00Z',order_items:[line('i'+n,p)]});
 let sessions=[{id:'s1',table_id:1,orders:[order(1,food)]},{id:'s2',table_id:2,orders:[order(2,water)]}],links=[];
 const tables=[{id:1,name:'Bàn 1',service_type:'dine_in'},{id:2,name:'Bàn 2',service_type:'dine_in'},{id:3,name:'Bàn 3',service_type:'dine_in'}];
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path.endsWith('/menu_group_catalog'))return route.fulfill({json:{non_kitchen_checkout:true,groups:[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}],assignments:{}}});
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'staff',email:'staff@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'staff@example.test'};
  else if(path.endsWith('/get_my_access'))body={...mockAccess({name:'Phục vụ',role:'phuc_vu'}),linked_tables:true,permissions:[...mockAccess({name:'Phục vụ',role:'phuc_vu'}).permissions,'orders.cancel']};
  else if(path==='/rest/v1/menu_items')body=[food,water];
  else if(path==='/rest/v1/restaurant_tables')body=tables;
  else if(path==='/rest/v1/table_sessions'){if(failSync)return route.fulfill({status:503,json:{message:'Failed refresh'}});body=sessions;}
  else if(path==='/rest/v1/orders')body=sessions.flatMap(s=>s.orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:s.table_id,closed_at:null}})));
  else if(path.endsWith('/get_active_table_links'))body=links;
  else if(path.endsWith('/get_linked_table_snapshot')){if(failSync)return route.fulfill({status:503,json:{message:'Failed refresh'}});body={sessions,links};}
  else if(/\/(link_dining_tables|unlink_dining_table)$/.test(path)){
   const p=req.postDataJSON();calls.push({path,...p});let result=applied.get(p.p_request_id);
   if(!result){const current=sessions.find(s=>s.id===p.p_expected_session);assert.ok(current);const remove=p.p_remove_table_id;
    if(remove){links=links.filter(l=>l.table_id!==remove);if(current.table_id===remove)current.table_id=p.p_table_id;if(links.filter(l=>l.session_id===current.id).length===1)links=links.filter(l=>l.session_id!==current.id);}
    else{const otherSession=sessions.find(s=>s.id===p.p_expected_other_session);if(otherSession){for(const o of otherSession.orders){o.session_id=current.id;for(const i of o.order_items)i.bill_no=p.p_mode==='same_bill'?1:2;current.orders.push(o);}sessions=sessions.filter(s=>s.id!==otherSession.id);}const ids=new Set([current.table_id,p.p_table_id,p.p_other_table_id,...links.filter(l=>l.session_id===current.id).map(l=>l.table_id)]);links=links.filter(l=>!ids.has(l.table_id));links.push(...[...ids].map(table_id=>({table_id,session_id:current.id})));}
    result={ok:true,session_id:current.id,table_id:current.table_id,table_ids:links.filter(l=>l.session_id===current.id).map(l=>l.table_id)};if(remove&&result.table_ids.length===0)result.table_ids=[current.table_id];applied.set(p.p_request_id,result);
   }
   if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost link ACK'}});}if(failAfterLink){failAfterLink=false;failSync=true;}else failSync=false;body=result;
  }
  else if(path.endsWith('/submit_non_kitchen_order')){const p=req.postDataJSON();calls.push({path,...p});const link=links.find(l=>l.table_id===p.p_table_id),s=sessions.find(s=>s.id===link?.session_id||s.table_id===p.p_table_id);assert.ok(s);assert.equal(p.p_items[0].expected_session_id,s.id);let o=s.orders.find(o=>o.request_id===p.p_request_id);if(!o){o={...order(3,water),id:'added',request_id:p.p_request_id,session_id:s.id,order_items:[line('new-water',water)]};s.orders.push(o);}body=o.id;}
  else if(path.endsWith('/cancel_order_item')){const p=req.postDataJSON();calls.push({path,...p});const item=sessions.flatMap(s=>s.orders.flatMap(o=>o.order_items)).find(i=>i.id===p.p_item_id);assert.ok(item);item.cancelled_at=new Date().toISOString();return route.fulfill({status:200,body:''});}
  else if(path.endsWith('/pay_bill')){const p=req.postDataJSON();calls.push({path,...p});const s=sessions.find(s=>s.id===p.p_session_id);assert.ok(s);for(const i of s.orders.flatMap(o=>o.order_items).filter(i=>p.p_expected_item_ids.includes(i.id)))i.paid=true;if(!s.orders.some(o=>o.order_items.some(i=>!i.paid&&!i.cancelled_at))){sessions=sessions.filter(x=>x.id!==s.id);links=links.filter(l=>l.session_id!==s.id);}body='bill-'+p.p_request_id;}
  else throw Error('Unexpected API '+path);await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(18000);const errors=[];page.on('pageerror',e=>errors.push(e.message));const base=process.env.POS_TEST_URL||'http://localhost:5196';
 await page.goto(base);await page.getByLabel('Tên đăng nhập',{exact:true}).fill('staff@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.getByRole('button',{name:'Thao tác bàn',exact:true}).click();await page.getByRole('button',{name:'Gộp bàn',exact:true}).click();
 const picker=page.getByRole('dialog',{name:'Gộp bàn',exact:true}).filter({has:page.getByLabel('Tìm bàn cần gộp',{exact:true})});await picker.getByRole('button',{name:'Gộp Bàn 2',exact:true}).click();const mode=page.locator('.table-link-mode-dialog');await mode.waitFor();if(scenario==='shared'){for(const width of [375,1440,390]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}await page.screenshot({path:'/workspace/artifacts/linked-tables-mode-390.png'});}
 await mode.getByRole('button',{name:(scenario==='separate'||scenario==='lost-separate')?'Gộp bàn, tách đơn':'Gộp vào đơn hiện tại',exact:true}).click();
 if(['lost','lost-separate','sync','offline'].includes(scenario)){
  await mode.getByRole('alert').waitFor();const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('goc-pho-table-link-v1:staff')));assert.ok(saved?.requestId);assert.ok(await page.evaluate(()=>!!localStorage.getItem('goc-pho-table-link-v1:staff')));
  if(scenario==='offline'){await context.setOffline(true);await mode.getByRole('button',{name:'Thử lại cùng mã gộp bàn',exact:true}).click();assert.equal(calls.length,1);assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('goc-pho-table-link-v1:staff')))).requestId,saved.requestId);await context.setOffline(false);}await page.reload();await page.getByRole('button',{name:'Thử lại cùng mã gộp bàn',exact:true}).click();await page.waitForFunction(()=>localStorage.getItem('goc-pho-table-link-v1:staff')===null);assert.ok(calls.filter(c=>c.path.endsWith('/link_dining_tables')).every(c=>c.p_request_id===saved.requestId));
  assert.equal(sessions.length,1);assert.equal(sessions[0].orders.length,2);assert.equal(links.length,2);await context.close();console.log('PASS linked tables UI '+scenario+': durable same-request recovery, no duplicated orders');continue;
 }
 await mode.waitFor({state:'hidden'});await picker.getByRole('button',{name:'Hủy gộp Bàn 2',exact:true}).waitFor();assert.equal(sessions.length,1);assert.equal(links.length,2);if(scenario==='shared')await page.screenshot({path:'/workspace/artifacts/linked-tables-picker-390.png'});assert.equal(sessions[0].orders[1].order_items[0].bill_no,scenario==='separate'?2:1);
 // Empty table links immediately, without opening the bill-choice popup.
 await picker.getByRole('button',{name:'Gộp Bàn 3',exact:true}).click();await picker.getByRole('button',{name:'Hủy gộp Bàn 3',exact:true}).waitFor();assert.equal(await mode.isVisible(),false);assert.equal(links.length,3);
 // Minus frees only that table and does not move any item or bill.
 const linesBefore=structuredClone(sessions[0].orders);if(scenario==='shared'){await page.screenshot({path:'/workspace/artifacts/linked-tables-all-members-390.png'});lose=true;}await picker.getByRole('button',{name:'Hủy gộp Bàn 3',exact:true}).click();if(scenario==='shared'){await picker.getByRole('alert').waitFor();assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('goc-pho-table-link-v1:staff')))).action,'unlink');await picker.getByRole('button',{name:'Thử lại cùng mã gộp bàn',exact:true}).click();}await picker.getByRole('button',{name:'Gộp Bàn 3',exact:true}).waitFor();assert.deepEqual(sessions[0].orders,linesBefore);assert.equal(links.length,2);
 await picker.getByRole('button',{name:'Xong',exact:true}).click();await page.getByRole('button',{name:'Đóng thao tác bàn',exact:true}).click();await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();
 const card=n=>page.locator('.table-card[data-table-id="'+n+'"]');await card(1).waitFor();assert.match(await card(1).innerText(),/61\.000đ/);assert.match(await card(2).innerText(),/61\.000đ/);assert.match(await card(3).innerText(),/Trống/);
 // A second screen opening another physical table sees the same session/items.
 const second=await context.newPage();await second.goto(base);await second.getByRole('button',{name:/^Bàn 2 /}).click();await second.locator('.pos-header-linked').waitFor();assert.equal(await second.locator('.pos-header-linked').innerText(),'Gộp với Bàn 1');assert.equal(await second.locator('.pos-linked-banner').count(),0);assert.match(await second.locator('.pos-total-line').innerText(),/61\.000đ/);await second.close();
 // Add a non-kitchen item through the alias table and verify both cards after auto-save.
 await card(2).click();await page.getByRole('button',{name:'Thêm món',exact:true}).first().click();await page.getByRole('button',{name:'Đồ uống',exact:true}).click();await page.getByRole('button',{name:'Thêm Trà đá',exact:true}).click();await page.getByRole('button',{name:/^Xem đơn \d/}).click();await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await card(1).waitFor();assert.match(await card(1).innerText(),/64\.000đ/);assert.match(await card(2).innerText(),/64\.000đ/);
 // Cancel the original food through the other table; all group totals change.
 await card(1).click();await page.getByRole('button',{name:'Hủy Bún riêu',exact:true}).click();const cancel=page.getByRole('dialog',{name:'Xác nhận hủy Bún riêu',exact:true});await cancel.getByRole('button',{name:'Xác nhận hủy món',exact:true}).click();await cancel.waitFor({state:'hidden'});assert.match(await page.locator('.pos-total-line').innerText(),/6\.000đ/);
 // Pay each remaining bill from either member; final payment releases every table.
 for(let count=0;count<2&&sessions.length;count++){await page.getByRole('button',{name:/^Thanh toán(?: Bill \d+)?$/}).first().click();const pay=page.getByRole('dialog',{name:/^Thanh toán Bàn 1/});await pay.waitFor();await pay.getByRole('button',{name:'Xác nhận thu tiền mặt',exact:true}).click();await pay.waitFor({state:'hidden'});}
 assert.equal(sessions.length,0);assert.equal(links.length,0);await page.locator('.table-card').first().waitFor();for(const n of [1,2,3])assert.match(await card(n).innerText(),/Trống/);assert.deepEqual(errors,[]);
 await context.close();console.log('PASS linked tables UI '+scenario+': +/- picker, occupied popup, empty direct link, both cards/second screen, alias add/cancel/payment and final release');
 }
 // Invalid snapshots fail closed rather than double-counting a shared session.
 const raw=[{id:'s',table_id:1,orders:[]}];assert.equal(projectLinkedSessions(raw,[{table_id:1,session_id:'s'},{table_id:2,session_id:'s'}]).length,2);assert.equal(uniqueSessions(projectLinkedSessions(raw,[{table_id:1,session_id:'s'},{table_id:2,session_id:'s'}])).length,1);assert.throws(()=>projectLinkedSessions(raw,[{table_id:2,session_id:'missing'}]));
}finally{await browser.close();}
