import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}}),errors=[];
 const food={id:'food',name:'Bún thử',price:58000,category:'bun',is_active:true,is_out:false};
 const line=(id)=>({...food,id,menu_item_id:food.id,qty:2,note:'',paid:false,bill_no:1,cancelled_at:null});
 const orders=['cooking','done','draft'].map((status,i)=>({id:status,request_id:status,session_id:'session',status:status==='draft'?'done':status,is_draft:status==='draft',kitchen_relevant:status!=='draft',created_at:new Date(Date.now()-i*60000).toISOString(),order_items:[line(status+'-item')]}));
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;const path=new URL(route.request().url()).pathname;let body=[];
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'deputy',email:'deputy@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'deputy',email:'deputy@example.test'};
  else if(path.endsWith('/get_my_access')){body={...mockAccess({name:'admin2',role:'chu'}),actual_role:'admin_phu',saved_menu_selections:true};body.permissions=body.permissions.filter(p=>!['orders.cancel','tables.cancel'].includes(p));}
  else if(path==='/rest/v1/menu_items')body=[food];
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path==='/rest/v1/table_sessions')body=[{id:'session',table_id:1,orders}];
  else if(path==='/rest/v1/orders')body=orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));
  else if(/cancel_order_item|cancel_table_session|edit_saved_menu_selection/.test(path))throw Error('Deputy UI attempted a prohibited cancellation/reduction');
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5199');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('deputy@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('test-only');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:'Phục vụ',exact:true}).waitFor();
 const menu=page.locator('.management-menu');await menu.locator('summary').click();for(const name of ['Đổi mật khẩu','Quản lý nhân viên','Quản lý thực đơn','Quản lý bàn','Dashboard','Nhật ký hoạt động','Hóa đơn gần đây'])assert.ok(await menu.getByRole('button',{name,exact:true}).isVisible(),name);
 await menu.locator('summary').click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await page.getByText('Món đã gọi',{exact:true}).waitFor();
 assert.equal(await page.locator('.cancel-line-button').count(),0);const draft=page.locator('[data-selection-item="draft-item"]');await draft.waitFor();assert.ok(await draft.getByRole('button',{name:'Bớt Bún thử',exact:true}).isDisabled());assert.ok(await draft.getByRole('button',{name:'Thêm Bún thử',exact:true}).isEnabled());
 await page.getByRole('button',{name:'Thao tác bàn',exact:true}).click();const dialog=page.getByRole('dialog',{name:/Thao tác bàn/});await dialog.waitFor();assert.equal(await dialog.getByRole('button',{name:/Hủy/}).count(),0);assert.ok(await dialog.getByRole('button',{name:/Chuyển Bàn 1/}).isEnabled());assert.deepEqual(errors,[]);
 console.log('PASS deputy UI: full Admin navigation, canonical identity, no item/table cancellation, no saved quantity reduction, increases and table operations retained. All APIs mocked.');await context.close();
}finally{await browser.close();}
