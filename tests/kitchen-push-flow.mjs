import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),writes=[],presence=[];let role='bep',releaseRegister,holdRegister=true;
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const a=JSON.parse(String(raw));if(a[3]==='phx_join'||a[3]==='heartbeat')socket.send(JSON.stringify([a[0],a[1],a[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;const req=route.request(),path=new URL(req.url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user:{id:'push-test-user',email:'push@test.example',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'push-test-user',email:'push@test.example'};
  else if(path==='/auth/v1/logout')return route.fulfill({status:204});
  else if(path==='/rest/v1/rpc/get_my_access')body=role==='chu'?{...mockAccess({name:'Chủ quán',role}),permissions:[...mockAccess({name:'Chủ quán',role}).permissions,'kitchen_images.read','kitchen_images.upload']}:mockAccess({name:'Bếp thử',role});
  else if(path==='/rest/v1/rpc/set_kitchen_push_foreground'){presence.push(req.postDataJSON());body=null;}
  else if(path==='/rest/v1/rpc/get_kitchen_push_settings')body={ready:true,public_key:'B'.repeat(87)};
  else if(path==='/rest/v1/rpc/register_kitchen_push'){writes.push({name:'register',body:req.postDataJSON()});if(holdRegister){holdRegister=false;await new Promise(resolve=>releaseRegister=resolve);}body={id:'device-id',enabled:true};}
  else if(path==='/rest/v1/rpc/disable_kitchen_push'){writes.push({name:'disable',body:req.postDataJSON()});body=null;}
  else if(path==='/rest/v1/rpc/request_kitchen_push_test'){writes.push({name:'test',body:req.postDataJSON()});body={queued:true};}
  else if(!['/rest/v1/menu_items','/rest/v1/restaurant_tables','/rest/v1/table_sessions','/rest/v1/orders','/rest/v1/kitchen_image_tickets'].includes(path))throw Error('Unexpected network '+path);
  await route.fulfill({status:200,json:body});
 });
 await context.addInitScript(()=>{
  let online=true;Object.defineProperty(navigator,'onLine',{get:()=>online});window.setPushOnline=v=>{online=v;window.dispatchEvent(new Event(v?'online':'offline'));};let visibility='visible';Object.defineProperty(document,'visibilityState',{get:()=>visibility});window.setPushVisibility=v=>{visibility=v;document.dispatchEvent(new Event('visibilitychange'));};
  window.pushMock={permission:'default',deny:false,requests:0,subscriptions:0,unsubscriptions:0,binding:null,old:false};
  Object.defineProperty(Notification,'permission',{get:()=>window.pushMock.permission});Notification.requestPermission=async()=>{window.pushMock.requests++;window.pushMock.permission=window.pushMock.deny?'denied':'granted';return window.pushMock.permission;};
  let subscription=null;
  const registration={active:{postMessage(data,ports){if(data.type==='GET_PUSH_CAPABILITIES')ports[0].postMessage({version:window.pushMock.old?0:1});else{window.pushMock.binding=data.binding;ports[0].postMessage({ok:true});}}},addEventListener(){},removeEventListener(){},update:async()=>{},pushManager:{getSubscription:async()=>subscription,subscribe:async()=>{window.pushMock.subscriptions++;subscription={toJSON:()=>({endpoint:'https://fcm.googleapis.com/fcm/send/test-subscription',keys:{p256dh:'X'.repeat(87),auth:'Y'.repeat(22)}}),unsubscribe:async()=>{window.pushMock.unsubscriptions++;subscription=null;return true;}};return subscription;}}};
  Object.defineProperty(navigator.serviceWorker,'getRegistration',{value:async()=>registration});Object.defineProperty(navigator.serviceWorker,'register',{value:async()=>registration});
 });
 const page=await context.newPage(),errors=[];await page.clock.install();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');
 async function login(){await page.getByLabel('Tên đăng nhập',{exact:true}).fill('push@test.example');await page.getByLabel('Mật khẩu',{exact:true}).fill('test-only-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();}
 await login();assert.equal(writes.length,0,'opt-in only');assert.equal(await page.evaluate(()=>window.pushMock.requests),0);
 const toggle=page.getByRole('switch',{name:'Thông báo bếp',exact:true});await toggle.waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'false');
 assert.equal(await page.getByRole('dialog',{name:'Thông báo phiếu bếp'}).count(),0,'no instructions modal');assert.equal(await page.getByRole('button',{name:'Gửi thông báo thử'}).count(),0);
 await page.evaluate(()=>window.pushMock.deny=true);await toggle.click();await page.getByRole('alert').filter({hasText:'Chưa được cấp quyền'}).waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(writes.length,0);
 await page.evaluate(()=>window.pushMock.deny=false);await toggle.click();for(let n=0;n<30&&!releaseRegister;n++)await page.waitForTimeout(50);assert.equal(await page.getByRole('button',{name:'Đăng xuất',exact:true}).isDisabled(),true,'cannot log out mid-registration');releaseRegister();await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true');
 assert.equal(writes[0].name,'register');assert.equal(writes[0].body.p_proof.length,43);assert.equal(await page.evaluate(()=>window.pushMock.requests),2);await page.waitForFunction(()=>!document.querySelector('[role=switch]')?.disabled);await page.screenshot({path:'/tmp/kitchen-push-toggle-on.png'});
 await page.getByText('Đã bật thông báo bếp trên thiết bị này.',{exact:true}).waitFor();await page.clock.fastForward(1100);assert.equal(await page.locator('.pos-toast').count(),0,'toast dismisses after 1s');
 for(let n=0;n<30&&!presence.some(p=>p.p_active);n++)await page.waitForTimeout(100);assert.ok(presence.some(p=>p.p_active),'visible synchronized Kitchen acquires a server lease');
 await page.evaluate(()=>window.setPushVisibility('hidden'));for(let n=0;n<30&&presence.at(-1)?.p_active!==false;n++)await page.waitForTimeout(100);assert.equal(presence.at(-1).p_active,false);const count=presence.length;await page.clock.fastForward(60000);await page.waitForTimeout(100);assert.equal(presence.length,count,'no heartbeat in background');await page.evaluate(()=>window.setPushVisibility('visible'));for(let n=0;n<30&&presence.at(-1)?.p_active!==true;n++)await page.waitForTimeout(100);assert.equal(presence.at(-1).p_active,true);
 await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='false');assert.equal(writes.at(-1).name,'disable');assert.equal(await page.evaluate(()=>window.pushMock.binding),null);
 await page.evaluate(()=>window.pushMock.old=true);await toggle.click();await page.getByRole('alert').filter({hasText:'Đóng tất cả cửa sổ'}).waitFor();assert.equal(await toggle.getAttribute('aria-checked'),'false');assert.equal(writes.filter(w=>w.name==='register').length,1,'old SW cannot enable push');
 await page.evaluate(()=>window.pushMock.old=false);await toggle.click();await page.waitForFunction(()=>document.querySelector('[role=switch]')?.getAttribute('aria-checked')==='true');
 await page.getByRole('button',{name:'Phục vụ',exact:true}).click();await page.getByRole('button',{name:/^Bếp \(/}).click();assert.equal(await toggle.getAttribute('aria-checked'),'true','switch restores device state on remount');
 await page.evaluate(()=>window.setPushOnline(false));await page.waitForFunction(()=>document.querySelector('[role=switch]')?.disabled);assert.equal(await toggle.isDisabled(),true);await page.evaluate(()=>window.setPushOnline(true));await page.waitForFunction(()=>!document.querySelector('[role=switch]')?.disabled);
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.pushMock.binding),null);assert.equal(writes.at(-1).name,'disable');
 role='phuc_vu';await login();assert.equal(await page.getByRole('switch',{name:'Thông báo bếp',exact:true}).count(),0,'waiter cannot subscribe');
 await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByRole('button',{name:'Đăng nhập',exact:true}).waitFor();role='chu';await login();await page.getByRole('button',{name:'Tải ảnh lên',exact:true}).waitFor();
 assert.equal(await toggle.innerText(),'','switch has no visible text label');
 for(const width of [320,360,390,430,768]){
  await page.setViewportSize({width,height:844});
  const boxes=await page.locator('.kitchen-tabs button').evaluateAll(nodes=>nodes.map(n=>{const r=n.getBoundingClientRect();return {top:r.top,right:r.right};}));
  assert.equal(boxes.length,4);assert.ok(Math.max(...boxes.map(b=>b.top))-Math.min(...boxes.map(b=>b.top))<2,`all kitchen controls share a row at ${width}px`);
  const logout=await page.getByRole('button',{name:'Đăng xuất',exact:true}).boundingBox(),row=await page.locator('.kitchen-heading .workspace-title-row').boundingBox();assert.ok(Math.abs(logout.x+logout.width-row.x-row.width)<2,`logout at right edge ${width}px`);
  assert.ok(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth),`no overflow at ${width}px`);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/kitchen-controls-one-row.png'});
 assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/kitchen-push-flow.png'});console.log('PASS kitchen push UI: direct switch, denied permission, register/disable, saved state, foreground/background, 1s toast, offline, logout and waiter access');
 await context.close();
}finally{await browser.close();}
