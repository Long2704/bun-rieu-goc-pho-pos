import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
import {latestCompleted,fifo} from '../src/order-model.ts';
const order=(id,created_at,done_at)=>({id,request_id:id,session_id:'s',service_label:id,status:done_at?'done':'cooking',kitchen_relevant:true,created_at,done_at,order_items:[{id:'line-'+id,name:'Bún riêu',category:'bun',qty:1,price:58000,paid:false,note:'',bill_no:1}]});
const a=order('Gửi sớm, xong mới nhất','2026-11-10T00:00:00Z','2026-11-10T02:00:00Z');
const b=order('Gửi sau, xong trước','2026-11-10T01:00:00Z','2026-11-10T01:30:00Z');
const cooking=[order('Đang làm cũ','2026-11-10T00:10:00Z',null),order('Đang làm mới','2026-11-10T01:10:00Z',null)];
const source=[b,a];assert.deepEqual(latestCompleted(source).map(o=>o.id),[a.id,b.id]);assert.deepEqual(source,[b,a]);assert.deepEqual(fifo([...cooking].reverse()).map(o=>o.id),cooking.map(o=>o.id));
assert.deepEqual(latestCompleted([{...a,done_at:null},{...b,done_at:null}]).map(o=>o.id),[b.id,a.id]);
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const images of [false,true]){
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;const path=new URL(route.request().url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'staff',email:'test@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'test@example.test'};
  else if(path.endsWith('/get_my_access')){body=mockAccess({name:'Nhân viên',role:'phuc_vu'});if(images)body.permissions.push('kitchen_images.read');}
  else if(path==='/rest/v1/menu_items')body=[];
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path==='/rest/v1/table_sessions')body=[{id:'s',table_id:1,orders:[b,...cooking,a]}];
  else if(path==='/rest/v1/orders')body=cooking.map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));
  else if(path==='/rest/v1/kitchen_image_tickets')body=[];
  else throw Error('Unexpected API '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();await page.locator('.kitchen-card').first().waitFor();
 assert.deepEqual(await page.locator('.kitchen-card h2').allTextContents(),cooking.map(o=>o.id));
 await page.getByRole('button',{name:'Lịch sử',exact:true}).click();await page.locator('.kitchen-card h2').filter({hasText:a.id}).waitFor();assert.deepEqual(await page.locator('.kitchen-card h2').allTextContents(),[a.id,b.id]);
 await page.getByRole('button',{name:/^Đang làm \(/}).click();await page.locator('.kitchen-card h2').filter({hasText:cooking[0].id}).waitFor();assert.deepEqual(await page.locator('.kitchen-card h2').allTextContents(),cooking.map(o=>o.id));assert.deepEqual(errors,[]);await context.close();
 console.log('PASS kitchen history: latest completion first, earlier-created ticket completed last on top, source preserved, legacy fallback, cooking FIFO unchanged, image permission '+images+'; API mocked.');
}}finally{await browser.close();}
