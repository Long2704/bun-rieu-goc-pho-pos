import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const bill=n=>({id:'00000000-0000-0000-0000-'+String(n).padStart(12,'0'),invoice_no:n,table_no:1,bill_no:1,total:1000,gross:1000,discount:0,method:'cash',cash_received:1000,change_due:0,paid_at:'2026-11-15T12:00:00+00:00',bill_items:[{id:'line-'+n,name:'Món trên hóa đơn',qty:1,price:1000,note:''}]});
try{
 const context=await browser.newContext({viewport:{width:1440,height:950}});let rows=Array.from({length:31},(_,i)=>bill(31-i)),reads=0,fail=false;const scopes=[];
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;const req=route.request(),u=new URL(req.url()),path=u.pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'cashier',email:'test@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'cashier'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Cashier',role:'thu_ngan'});
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(['/rest/v1/menu_items','/rest/v1/orders','/rest/v1/table_sessions'].includes(path))body=[];
  else if(path==='/rest/v1/bills'){
   if(u.searchParams.get('id'))body=rows.find(b=>'eq.'+b.id===u.searchParams.get('id'));
   else{reads++;assert.equal(u.searchParams.get('limit'),'11');assert.equal(u.searchParams.get('order'),'paid_at.desc,id.desc');const scope=u.searchParams.get('or');scopes.push(scope);if(fail)return route.fulfill({status:503,json:{message:'Mock failed next page'}});let selected=rows;if(scope){const id=scope.match(/id.lt.([0-9a-f-]+)/i)?.[1];assert.ok(id);selected=rows.filter(b=>b.id<id);}body=selected.slice(0,11);}
  }else throw Error('Unexpected '+path);await route.fulfill({json:body});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(process.env.POS_TEST_URL||'http://localhost:5199');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').waitFor();assert.equal(reads,0);
 await page.getByRole('button',{name:'Hóa đơn gần đây',exact:true}).click();await page.getByRole('heading',{name:'Hóa đơn gần nhất',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelectorAll('.invoice-list>button').length===10);assert.equal(reads,1);
 fail=true;await page.getByRole('button',{name:'Xem thêm hóa đơn',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.invoice-list>button').count(),10);fail=false;rows.unshift(bill(32));
 for(const count of [20,30,31]){await page.getByRole('button',{name:'Xem thêm hóa đơn',exact:true}).click();await page.waitForFunction(n=>document.querySelectorAll('.invoice-list>button').length===n,count);}
 assert.equal(await page.getByRole('button',{name:'Xem thêm hóa đơn',exact:true}).count(),0);const texts=await page.locator('.invoice-list>button strong:first-child').allTextContents();assert.equal(new Set(texts).size,31);assert.ok(texts.every(t=>!t.startsWith('#32 ')),'new front insert does not shift older pages');assert.ok(scopes.slice(1).every(Boolean));
 await page.locator('.invoice-list>button').first().click();await page.getByText('Tổng thanh toán: 1.000đ',{exact:true}).waitFor();await page.getByRole('button',{name:'Đóng',exact:true}).last().click();await page.getByRole('button',{name:'Tải lại hóa đơn',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.invoice-list>button').length===10);assert.match(await page.locator('.invoice-list>button').first().innerText(),/#32 /);
 assert.deepEqual(errors,[]);console.log('PASS invoice pagination: no eager history reads, 10 rows+sentinel, tied-time keyset, 31 older entries without duplication despite new invoice insert, failed next page preserves rows/retry, receipt detail and explicit reload. All network mocked.');
}finally{await browser.close();}
