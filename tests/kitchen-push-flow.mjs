import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),writes=[];let role='bep';
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;const req=route.request(),path=new URL(req.url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user:{id:'push-test-user',email:'push@test.example',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'push-test-user',email:'push@test.example'};
  else if(path==='/auth/v1/logout')return route.fulfill({status:204});
  else if(path==='/rest/v1/rpc/get_my_access')body=mockAccess({name:'Bếp thử',role});
  else if(path==='/rest/v1/rpc/get_kitchen_push_settings')body={ready:true,public_key:'B'.repeat(87)};
  else if(path==='/rest/v1/rpc/register_kitchen_push'){writes.push({name:'register',body:req.postDataJSON()});body={id:'device-id',enabled:true};}
  else if(path==='/rest/v1/rpc/disable_kitchen_push'){writes.push({name:'disable',body:req.postDataJSON()});body=null;}
  else if(path==='/rest/v1/rpc/request_kitchen_push_test'){writes.push({name:'test',body:req.postDataJSON()});body={queued:true};}
  else if(!['/rest/v1/menu_items','/rest/v1/restaurant_tables','/rest/v1/table_sessions','/rest/v1/orders'].includes(path))throw Error('Unexpected network '+path);
  await route.fulfill({status:200,json:body});
 });
 await context.addInitScript(()=>{
  window.pushMock={permission:'default',requests:0,subscriptions:0,unsubscriptions:0,binding:null,old:false};
  Object.defineProperty(Notification,'permission',{get:()=>window.pushMock.permission});Notification.requestPermission=async()=>{window.pushMock.requests++;window.pushMock.permission='granted';return 'granted';};
  let subscription=null;
  const registration={active:{postMessage(data,ports){if(data.type==='GET_PUSH_CAPABILITIES')ports[0].postMessage({version:window.pushMock.old?0:1});else{window.pushMock.binding=data.binding;ports[0].postMessage({ok:true});}}},addEventListener(){},removeEventListener(){},update:async()=>{},pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{window.pushMock.subscriptions++;subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test-subscription',keys:{p256dh:'X'.repeat(87),auth:'Y'.repeat(22)}}),unsubscribe:async()=>{window.pushMock.unsubscriptions++;subscription=null;return true;}};return subscription;}}};
  Object.defineProperty(navigator.serviceWorker,'getRegistration',{value:async()=>registration});Object.defineProperty(navigator.serviceWorker,'register',{value:async()=>registration});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');
 async function login(){await page.getByLabel('Tên đăng nhập',{exact:true}).fill('push@test.example');await page.getByLabel('Mật khẩu',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();}
 await login();assert.equal(writes.length,0,'opt-in only');assert.equal(await page.evaluate(()=>window.pushMock.requests),0);
 await page.getByRole('button',{name:'Thông báo',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Thông báo phiếu bếp'});await dialog.waitFor();assert.equal(writes.length,0);
 await dialog.getByRole('button',{name:'Bật trên thiết bị này'}).click();await dialog.getByRole('button',{name:'Tắt trên thiết bị này'}).waitFor();await page.screenshot({path:'/tmp/kitchen-push-dialog.png'});assert.equal(writes[0].name,'register');assert.equal(writes[0].body.p_proof.length,43);assert.equal(await page.evaluate(()=>window.pushMock.requests),1);
 await dialog.getByRole('button',{name:'Gửi thông báo thử'}).click();await dialog.getByText(/Đã xếp hàng/).waitFor();assert.equal(writes.at(-1).name,'test');
 await dialog.getByRole('button',{name:'Tắt trên thiết bị này'}).click();await dialog.getByRole('button',{name:'Bật trên thiết bị này'}).waitFor();assert.equal(writes.at(-1).name,'disable');assert.equal(await page.evaluate(()=>window.pushMock.binding),null);
 await page.evaluate(()=>window.pushMock.old=true);await dialog.getByRole('button',{name:'Bật trên thiết bị này'}).click();await dialog.getByText(/Đóng tất cả cửa sổ/).waitFor();assert.equal(writes.filter(w=>w.name==='register').length,1,'old SW cannot enable push');
 await page.evaluate(()=>window.pushMock.old=false);await dialog.getByRole('button',{name:'Bật trên thiết bị này'}).click();await dialog.getByRole('button',{name:'Tắt trên thiết bị này'}).waitFor();await dialog.getByRole('button',{name:'Đóng',exact:true}).click();
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.pushMock.binding),null);assert.equal(writes.at(-1).name,'disable');
 role='phuc_vu';await login();assert.equal(await page.getByRole('button',{name:'Thông báo',exact:true}).count(),0,'waiter cannot subscribe');
 assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/kitchen-push-flow.png'});console.log('PASS kitchen push UI: opt-in, permission, register, test, disable, old worker, logout, waiter access');
 await context.close();
}finally{await browser.close();}
