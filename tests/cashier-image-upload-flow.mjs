import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const canComplete=process.env.POS_TEST_COMPLETE==='1';
const image=readFileSync(new URL('../public/brand/goc-pho-logo.webp',import.meta.url));
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});let uploads=0,regularDone=false,imageDone=0,deleted=0;const tickets=[],errors=[];
 const normal={id:crypto.randomUUID(),session_id:crypto.randomUUID(),request_id:crypto.randomUUID(),status:'cooking',kitchen_relevant:true,is_draft:false,created_at:new Date().toISOString(),order_items:[{id:crypto.randomUUID(),name:'Bún thử hoàn thành',qty:1,price:58000,category:'bun',note:'',paid:false,bill_no:1,cancelled_at:null}],table_sessions:{table_id:1,closed_at:null}};
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'cashier',email:'cashier@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'cashier'};
  else if(path.endsWith('/get_my_access')){body=mockAccess({name:'Cashier',role:'thu_ngan'});body.permissions.push('kitchen_images.read','kitchen_images.upload');if(canComplete)body.permissions.push('kitchen.complete');}
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path==='/rest/v1/kitchen_image_tickets')body=tickets;
  else if(path==='/rest/v1/orders')body=canComplete&&!regularDone?[normal]:[];
  else if(path.endsWith('/complete_kitchen_order')){assert.ok(canComplete);assert.equal(req.postDataJSON().p_order_id,normal.id);regularDone=true;return route.fulfill({status:200,body:''});}
  else if(path.endsWith('/get_kitchen_image_epoch'))body='000000000001';
  else if(path==='/functions/v1/kitchen-image-upload'){
   uploads++;const request=req.postDataBuffer().toString().match(/name="request_id"\r\n\r\n([^\r]+)/)?.[1];assert.ok(request);
   const ticket={id:crypto.randomUUID(),request_id:request,image_path:'cashier/test/image.webp',preview_path:'cashier/test/preview.webp',status:'cooking',created_at:new Date().toISOString(),created_by:'cashier',completed_at:null,completed_by:null,width:256,height:256};tickets.push(ticket);body={ticket};
  }else if(path.includes('/storage/v1/object/')){if(req.method()==='DELETE'){assert.ok(canComplete);const paths=req.postDataJSON().prefixes;assert.equal(paths.length,2);deleted+=paths.length;return route.fulfill({json:paths.map(name=>({name}))});}assert.equal(req.method(),'GET');return route.fulfill({contentType:'image/webp',body:image});}
  else if(path.endsWith('/begin_kitchen_image_completion')){assert.ok(canComplete);const ticket=tickets[0];body={id:ticket.id,purged:false,paths:[ticket.image_path,ticket.preview_path]};}
  else if(path.endsWith('/complete_kitchen_image_ticket')){assert.ok(canComplete);assert.equal(deleted,2);body={id:tickets[0].id,purged:true};tickets.splice(0,1);imageDone++;}
  else if(!['/rest/v1/menu_items','/rest/v1/orders','/rest/v1/table_sessions'].includes(path))throw Error('Unexpected '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5203');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('cashier@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();
 await page.getByRole('button',{name:'Tải ảnh lên',exact:true}).waitFor();await page.locator('.kitchen-image-upload input').setInputFiles({name:'phieu.webp',mimeType:'image/webp',buffer:image});
 await page.locator('.kitchen-image-ticket img').waitFor();assert.equal(uploads,1);assert.equal(await page.locator('.kitchen-image-ticket').getByRole('button',{name:'Xong',exact:true}).isDisabled(),!canComplete);
 await page.getByRole('button',{name:'Phóng to phiếu ảnh',exact:true}).click();await page.getByRole('dialog',{name:'Xem phiếu ảnh'}).waitFor();await page.getByRole('button',{name:'Đóng ảnh',exact:true}).click();if(canComplete){await page.locator('.kitchen-card:not(.kitchen-image-ticket)').getByRole('button',{name:'Xong',exact:true}).click();await page.locator('.kitchen-card:not(.kitchen-image-ticket)').waitFor({state:'detached'});assert.ok(regularDone);await page.locator('.kitchen-image-ticket').getByRole('button',{name:'Xong',exact:true}).click();await page.locator('.kitchen-image-ticket').waitFor({state:'detached'});assert.equal(imageDone,1);assert.equal(deleted,2);}assert.deepEqual(errors,[]);
 console.log(canComplete?'PASS Cashier kitchen completion UI: normal ticket Xong, image ticket Xong, storage deletion, removed from queue; upload/zoom retained. All APIs mocked.':'PASS cashier upload-only baseline: upload/zoom retained; completion disabled. All APIs mocked.');
}finally{await browser.close();}
