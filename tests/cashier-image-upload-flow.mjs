import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const image=readFileSync(new URL('../public/brand/goc-pho-logo.webp',import.meta.url));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});let uploads=0;const tickets=[],errors=[];
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'cashier',email:'cashier@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'cashier'};
  else if(path.endsWith('/get_my_access')){body=mockAccess({name:'Cashier',role:'thu_ngan'});body.permissions.push('kitchen_images.read','kitchen_images.upload');}
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path==='/rest/v1/kitchen_image_tickets')body=tickets;
  else if(path.endsWith('/get_kitchen_image_epoch'))body='000000000001';
  else if(path==='/functions/v1/kitchen-image-upload'){
   uploads++;const request=req.postDataBuffer().toString().match(/name="request_id"\r\n\r\n([^\r]+)/)?.[1];assert.ok(request);
   const ticket={id:crypto.randomUUID(),request_id:request,image_path:'cashier/test/image.webp',preview_path:'cashier/test/preview.webp',status:'cooking',created_at:new Date().toISOString(),created_by:'cashier',completed_at:null,completed_by:null,width:256,height:256};tickets.push(ticket);body={ticket};
  }else if(path.includes('/storage/v1/object/')){assert.equal(req.method(),'GET','cashier must not delete images');return route.fulfill({contentType:'image/webp',body:image});}
  else if(path.endsWith('/begin_kitchen_image_completion')||path.endsWith('/complete_kitchen_image_ticket'))throw Error('Cashier attempted completion');
  else if(!['/rest/v1/menu_items','/rest/v1/orders','/rest/v1/table_sessions'].includes(path))throw Error('Unexpected '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5203');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('cashier@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();
 await page.getByRole('button',{name:'Tải ảnh lên',exact:true}).waitFor();await page.locator('.kitchen-image-upload input').setInputFiles({name:'phieu.webp',mimeType:'image/webp',buffer:image});
 await page.locator('.kitchen-image-ticket img').waitFor();assert.equal(uploads,1);assert.ok(await page.getByRole('button',{name:'Xong',exact:true}).isDisabled());
 await page.getByRole('button',{name:'Phóng to phiếu ảnh',exact:true}).click();await page.getByRole('dialog',{name:'Xem phiếu ảnh'}).waitFor();await page.getByRole('button',{name:'Đóng ảnh',exact:true}).click();assert.deepEqual(errors,[]);
 console.log('PASS cashier browser: upload button, automatic upload once, private image preview/zoom; completion disabled and no deletion requests. All HTTP/WebSockets mocked.');
}finally{await browser.close();}
