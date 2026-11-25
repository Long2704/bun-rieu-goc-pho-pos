import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const role of ['admin','admin_phu','thu_ngan']){
 const ctx=await browser.newContext({viewport:{width:390,height:844}}),calls=[],results=new Map(),errors=[];let loseAck=true,stale=false,delay,resolveDelay;
 const item={id:'10000000-0000-4000-8000-000000000001',name:'Bún riêu thử',price:58000,category:'bun',is_active:true,is_out:false,version:1,sort:0};let items=[item];let tables=[{id:1,name:'Bàn đang phục vụ',is_active:true,version:1,busy:true},{id:2,name:'Bàn trống',is_active:true,version:1,busy:false}];
 await ctx.routeWebSocket('**/realtime/v1/websocket**',s=>s.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))s.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await ctx.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{const req=route.request(),u=new URL(req.url()),path=u.pathname;let body=[];
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'catalog-user',email:'local@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/user')body={id:'catalog-user',email:'local@example.test'};
 else if(path.endsWith('/get_my_access')){body={...mockAccess({name:role,role:role==='thu_ngan'?role:'chu'}),actual_role:role};if(role==='admin_phu')body.permissions=body.permissions.filter(p=>!['orders.cancel','tables.cancel'].includes(p));}
 else if(path.endsWith('/menu_group_catalog'))body={groups:[{id:'bun',name:'Món chính',category:'bun',sort:0}],assignments:{},non_kitchen_checkout:true};
 else if(path==='/rest/v1/menu_items'||path.endsWith('/list_menu_management'))body=items;
 else if(path==='/rest/v1/restaurant_tables'||path.endsWith('/list_table_management'))body=tables;
 else if(path.endsWith('/delete_catalog_entry')){
  const p=req.postDataJSON();calls.push(p);
  if(results.has(p.p_request_id))body=results.get(p.p_request_id);
  else if(stale){stale=false;tables[1].version=2;return route.fulfill({status:400,json:{code:'P0001',message:'Bàn đã thay đổi. Tải lại danh sách rồi xác nhận xóa lại.'}});}
  else{body={ok:true,kind:p.p_kind,name:p.p_kind==='menu'?item.name:'Bàn trống'};results.set(p.p_request_id,body);if(p.p_kind==='menu')items=[];else tables=tables.filter(t=>t.id!==p.p_table_id);
   if(loseAck){loseAck=false;return route.fulfill({status:503,json:{message:'Lost ACK'}});}if(delay)await delay;
  }
 }await route.fulfill({json:body});});
 const page=await ctx.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5200');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('local@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-only');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:'Phục vụ',exact:true}).waitFor();
 const nav=async name=>{const n=page.locator('.management-menu');if(!await n.evaluate(x=>x.open))await n.locator('summary').click();await n.getByRole('button',{name,exact:true}).click();};
 await nav('Quản lý thực đơn');await page.getByRole('button',{name:'Xóa món Bún riêu thử',exact:true}).click();const menuDialog=page.getByRole('dialog',{name:'Xóa món',exact:true});await menuDialog.getByRole('button',{name:'Quay lại',exact:true}).click();assert.equal(calls.length,0);
 await page.getByRole('button',{name:'Xóa món Bún riêu thử',exact:true}).click();await menuDialog.getByRole('button',{name:'Xác nhận xóa món',exact:true}).click();await menuDialog.getByRole('alert').waitFor();assert.equal(results.size,1);
 await page.reload();await menuDialog.waitFor();assert.equal(await page.getByRole('button',{name:'Xóa món Bún riêu thử',exact:true}).count(),0,'deleted entry missing after reload, request still recovers');await menuDialog.getByRole('button',{name:'Thử lại cùng yêu cầu xóa',exact:true}).click();await menuDialog.waitFor({state:'hidden'});assert.deepEqual(calls[0],calls[1]);assert.equal(results.size,1);assert.equal(await page.evaluate(()=>localStorage.getItem('pos:catalog-delete:menu:catalog-user')),null);
 await nav('Quản lý bàn');assert.ok(await page.getByRole('button',{name:'Xóa bàn Bàn đang phục vụ',exact:true}).isDisabled());await page.getByRole('button',{name:'Xóa bàn Bàn trống',exact:true}).click();const tableDialog=page.getByRole('dialog',{name:'Xóa bàn',exact:true});
 if(role==='admin'){await page.waitForTimeout(250);await page.screenshot({path:'/workspace/artifacts/xoa-ban-popup.png'});}
 stale=true;await tableDialog.getByRole('button',{name:'Xác nhận xóa bàn',exact:true}).click();await tableDialog.waitFor({state:'hidden'});await page.getByRole('alert').filter({hasText:'Bàn đã thay đổi'}).waitFor();assert.equal(results.size,1);
 await page.getByRole('button',{name:'Xóa bàn Bàn trống',exact:true}).click();delay=new Promise(r=>resolveDelay=r);await tableDialog.getByRole('button',{name:'Xác nhận xóa bàn',exact:true}).click();while(!resolveDelay)await page.waitForTimeout(10);assert.ok(await tableDialog.getByRole('button',{name:'Quay lại',exact:true}).isDisabled());await page.keyboard.press('Escape');assert.ok(await tableDialog.isVisible());resolveDelay();await tableDialog.waitFor({state:'hidden'});assert.equal(calls.at(-1).p_expected_version,2);assert.equal(await page.getByRole('button',{name:'Xóa bàn Bàn trống',exact:true}).count(),0);
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');}
 assert.deepEqual(errors,[]);await ctx.close();
 }console.log('PASS catalog deletion UI for Admin/deputy/Cashier: confirmation cancel, replay after lost ACK+reload with absent row, busy table denied, stale snapshot refresh, pending Escape lock, exact request/version, responsive and no browser errors. All APIs mocked.');
}finally{await browser.close();}
