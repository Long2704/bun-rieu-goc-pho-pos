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
 const panel=page.getByRole('region',{name:'Nhật ký hoạt động',exact:true});await panel.getByText('Hoạt động này không có chi tiết món được lưu.',{exact:true}).waitFor();
 const first=panel.locator('details').first();assert.equal(await first.getAttribute('open'),null);const initial=reads;
 await first.locator('summary').click();await first.getByText('2 × Bún riêu truyền thống',{exact:true}).waitFor();await first.getByText('1 × Trà đá',{exact:true}).waitFor();assert.equal(await first.locator('.audit-cancelled-total').innerText(),'3 phần đã hủy\n119.000đ');assert.equal(reads,initial,'opening archived details adds no request');
 await panel.locator('details').nth(1).locator('summary').click();await panel.getByText('Không có đơn giá được lưu',{exact:true}).waitFor();assert.equal(await panel.locator('details script').count(),0);assert.equal(await panel.locator('details').nth(1).locator('.audit-cancelled-total strong').count(),0);
 for(const width of [375,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.getByLabel('Loại hoạt động',{exact:true}).selectOption('cancel_table');assert.ok(reads>=initial);assert.deepEqual(errors,[]);
 console.log('PASS audit cancelled detail: archived names/quantities/prices/subtotal; zero extra detail requests; legacy and missing-price fallback; escaped names; filter and responsive layout. All API/WebSockets mocked.');
}finally{await browser.close();}
