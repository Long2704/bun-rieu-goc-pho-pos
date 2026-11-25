import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const role of ['admin','admin_phu','thu_ngan','phuc_vu','bep']){
 const errors=[];let attempts=0,mode='same',accessDenied=false,resolveUpdate;
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:role,email:'local@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user'){
   if(req.method()==='PUT'){
    attempts++;assert.ok(Object.keys(req.postDataJSON()).every(k=>['password','code_challenge','code_challenge_method'].includes(k)));assert.equal(req.postDataJSON().password,'AdminTest123!');
    if(mode==='same')return route.fulfill({status:422,json:{error_code:'same_password',msg:'same'}});
    await new Promise(r=>{resolveUpdate=r;});
   }
   body={id:role,email:'local@example.test',aud:'authenticated',role:'authenticated'};
  }
  else if(path.endsWith('/get_my_access'))body={...mockAccess({role:['admin','admin_phu'].includes(role)?'chu':role,name:role==='admin'?'Admin':'Nhân viên'}),actual_role:role,is_active:!accessDenied,linked_tables:true};
  else if(path.endsWith('/get_linked_table_snapshot'))body={sessions:[],links:[]};
  else if(path.endsWith('/get_pos_sync_delta'))body={session_ids:[],sessions:[],links:[],kitchen:[]};
  else if(path.endsWith('/menu_group_catalog'))body={groups:[],assignments:{},non_kitchen_checkout:true};
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1',service_type:'dine_in'}];
  else if(path.endsWith('/list_employees'))body={items:[{id:'admin',name:'Admin',role:'admin',is_active:true,created_at:new Date().toISOString()}],total:1};
  if(path.endsWith('/get_my_access')&&role==='admin_phu')body.permissions=body.permissions.filter(p=>!['orders.cancel','tables.cancel'].includes(p));
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5200');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('local@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('LocalTest123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 await page.getByRole('button',{name:'Phục vụ',exact:true}).waitFor();
 const open=async()=>{const menu=page.locator('.management-menu');await menu.locator('summary').click();await menu.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();};
 if(!['admin','admin_phu'].includes(role)){assert.equal(await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).count(),0);assert.equal(attempts,0);}
 else{
  await open();let d=page.getByRole('dialog',{name:'Đổi mật khẩu Admin'});
  await d.getByLabel('Mật khẩu mới',{exact:true}).fill('AdminTest123!');await d.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill('different');assert.ok(await d.getByRole('button',{name:'Lưu mật khẩu',exact:true}).isDisabled());
  await d.getByLabel('Nhập lại mật khẩu mới',{exact:true}).fill('AdminTest123!');await d.getByRole('button',{name:'Lưu mật khẩu',exact:true}).click();await d.getByRole('alert').filter({hasText:'khác mật khẩu'}).waitFor();assert.equal(attempts,1);assert.equal(await d.getByLabel('Mật khẩu mới',{exact:true}).inputValue(),'');
  mode='success';for(const label of ['Mật khẩu mới','Nhập lại mật khẩu mới'])await d.getByLabel(label,{exact:true}).fill('AdminTest123!');await d.getByRole('button',{name:'Lưu mật khẩu',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('dialog[open] button[type=submit]')?.disabled);assert.ok(await d.getByRole('button',{name:'Đóng',exact:true}).isDisabled());await page.keyboard.press('Escape');assert.ok(await d.isVisible());while(!resolveUpdate)await page.waitForTimeout(10);resolveUpdate();await d.waitFor({state:'detached'});assert.equal(attempts,2);await page.getByRole('status').filter({hasText:'Đã đổi mật khẩu Admin.'}).waitFor();
  assert.equal(await page.evaluate(()=>Object.values(localStorage).some(v=>v.includes('AdminTest123!'))),false);
  await open();d=page.getByRole('dialog',{name:'Đổi mật khẩu Admin'});assert.equal(await d.getByLabel('Mật khẩu mới',{exact:true}).inputValue(),'');accessDenied=true;for(const label of ['Mật khẩu mới','Nhập lại mật khẩu mới'])await d.getByLabel(label,{exact:true}).fill('AdminTest123!');await d.getByRole('button',{name:'Lưu mật khẩu',exact:true}).click();await d.getByRole('alert').filter({hasText:'quyền Admin'}).waitFor();assert.equal(attempts,2,'stale admin authorization blocks Auth update');accessDenied=false;await d.getByRole('button',{name:'Đóng',exact:true}).click();
  for(const width of [375,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.getByRole('button',{name:'Đổi mật khẩu',exact:true}).click();await page.getByRole('dialog',{name:'Đổi mật khẩu Admin'}).waitFor();await page.screenshot({path:'/workspace/artifacts/admin-password-desktop.png'});await page.getByRole('dialog').getByRole('button',{name:'Đóng',exact:true}).click();
 }
 assert.deepEqual(errors,[]);await context.close();
}console.log('PASS Admin password UI: admin-only, canonical role bridge, confirmation, safe self-only Auth payload, error handling, busy/escape guard, no credential storage, stale permissions denial, all staff roles retained, responsive layout. All network mocked.');}finally{await browser.close();}
