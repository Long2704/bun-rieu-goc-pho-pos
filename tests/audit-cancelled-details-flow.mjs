import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});let reads=0;const errors=[];
 const event=(id,extra)=>({id,type:'cancel_table',table_no:5,user_id:'staff',created_at:'2026-11-17T01:00:00Z',actor:{name:'Nhân viên A'},extra});
 const events=[event('complete',{count:2,items:[{name:'Bún riêu truyền thống',qty:2,price:58000},{name:'Trà đá',qty:1,price:3000}]}),event('legacy',{count:1}),event('partial',{count:1,items:[{name:'Món cũ <script>không chạy</script>',qty:1}]})];
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;const req=route.request(),path=new URL(req.url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'admin',email:'admin@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'admin'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Admin',role:'chu'});
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path==='/rest/v1/audit_log'){assert.equal(req.method(),'GET');reads++;body=events;}
  else if(!['/rest/v1/menu_items','/rest/v1/orders','/rest/v1/table_sessions'].includes(path))throw Error('Unexpected request '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5205');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('admin@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 const menu=page.locator('.management-menu');await menu.locator('summary').click();await menu.getByRole('button',{name:'Nhật ký hoạt động',exact:true}).click();
 const panel=page.getByRole('region',{name:'Nhật ký hoạt động',exact:true});const rows=panel.locator('.audit-cancelled-event');await rows.first().waitFor();assert.equal(await panel.locator('details').count(),0);const initial=reads;
 await rows.first().locator('span').first().click();let dialog=page.getByRole('dialog',{name:'Món đã hủy',exact:true});await dialog.waitFor();await dialog.getByText('2 × Bún riêu truyền thống',{exact:true}).waitFor();await dialog.getByText('1 × Trà đá',{exact:true}).waitFor();assert.equal(await dialog.locator('.audit-cancelled-total').innerText(),'3 phần đã hủy\n119.000đ');assert.match(await dialog.locator('.audit-cancelled-context').innerText(),/Bàn 5.*Nhân viên A/);assert.equal(reads,initial);
 for(const width of [375,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));}
 await page.keyboard.press('Escape');await dialog.waitFor({state:'detached'});assert.ok(await rows.first().evaluate(el=>el===document.activeElement));await rows.first().focus();await page.keyboard.press('Enter');await dialog.waitFor();await dialog.getByRole('button',{name:'Đóng chi tiết món đã hủy',exact:true}).click();await dialog.waitFor({state:'detached'});
 await rows.nth(1).click();await dialog.getByText('Hoạt động này không có chi tiết món được lưu.',{exact:true}).waitFor();await dialog.getByRole('button',{name:'Đóng chi tiết món đã hủy',exact:true}).click();
 await rows.nth(2).click();await dialog.getByText('Không có đơn giá được lưu',{exact:true}).waitFor();assert.equal(await dialog.locator('script').count(),0);assert.equal(await dialog.locator('.audit-cancelled-total strong').count(),0);await dialog.getByRole('button',{name:'Đóng chi tiết món đã hủy',exact:true}).click();assert.equal(reads,initial,'modal open/close adds no request');
 await page.getByLabel('Loại hoạt động',{exact:true}).selectOption('cancel_table');assert.deepEqual(errors,[]);
 console.log('PASS audit cancellation popup: whole-row click and keyboard opening, archived items/amounts/context, Esc/close/focus restoration, legacy fallback, zero extra API calls, responsive dialog. All API/WebSockets mocked.');
}finally{await browser.close();}
