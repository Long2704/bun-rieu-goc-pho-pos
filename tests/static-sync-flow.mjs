import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:950}}),counts={access:0,live:0,kitchen:0,menu:0,tables:0,groups:0,saves:0},menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_active:true,is_out:false,sort:0,version:1}];
 let amount=58000,tableName='Bàn 1',failMenu=false,failLive=false;
 const groups=[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}];
 const sessions=()=>[{id:'s',table_id:1,orders:[{id:'o',request_id:'r',session_id:'s',status:'cooking',kitchen_relevant:true,created_at:'2026-11-11T00:00:00Z',order_items:[{id:'i',menu_item_id:'food',name:'Bún riêu',category:'bun',qty:1,price:amount,paid:false,bill_no:1,note:''}]}]}];
 const {mockAccess}=await import('./support/access.mjs');
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body;
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'sync-owner',email:'test@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/logout')body={};
 else if(path==='/auth/v1/user')body={id:'sync-owner',email:'test@example.test'};
 else if(path.endsWith('/get_my_access')){counts.access++;body={...mockAccess({name:'Chủ',role:'chu'}),linked_tables:true};}
 else if(path.endsWith('/get_linked_table_snapshot')){counts.live++;if(failLive)return route.fulfill({status:503,json:{message:'Mock failure'}});body={sessions:sessions(),links:[]};}
 else if(path==='/rest/v1/orders'){counts.kitchen++;body=sessions()[0].orders.map(o=>({...o,table_sessions:{table_id:1,closed_at:null}}));}
 else if(path==='/rest/v1/menu_items'){counts.menu++;if(failMenu)return route.fulfill({status:503,json:{message:'Mock menu failure'}});body=menu;}
 else if(path==='/rest/v1/restaurant_tables'){counts.tables++;body=[{id:1,name:tableName,service_type:'dine_in'}];}
 else if(path.endsWith('/menu_group_catalog')){counts.groups++;body={groups,assignments:{},non_kitchen_checkout:true};}
 else if(path.endsWith('/list_menu_management'))body=menu;
 else if(path.endsWith('/save_menu_item_in_group')){counts.saves++;const p=req.postDataJSON();Object.assign(menu[0],{name:p.p_name,price:p.p_price,version:2});body='food';}
 else throw Error('Unexpected '+path);await route.fulfill({json:body});});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').click({trial:true});
 const wait=async(predicate)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(r=>setTimeout(r,10));}assert.ok(predicate(),'Expected request not observed');};
 await wait(()=>counts.live>0&&counts.groups>0);await page.waitForTimeout(150);const base={...counts};
 // Eleven 5-second ticks keep orders/kitchen live without requesting static data again.
 for(let tick=1;tick<=11;tick++){await page.waitForTimeout(100);const live=counts.live;await page.clock.runFor(5000);await wait(()=>counts.live>live);await page.waitForTimeout(100);}
 assert.equal(counts.menu,base.menu);assert.equal(counts.tables,base.tables);assert.equal(counts.groups,base.groups);assert.ok(counts.kitchen>=base.kitchen+11);assert.ok(counts.access>=base.access+11);
 const reduction={oldRequestsFor11Ticks:66,newRequestsFor11Ticks:(counts.live-base.live)+(counts.access-base.access)+(counts.kitchen-base.kitchen),staticAvoided:33};
 amount=65000;const live=counts.live;await page.clock.runFor(5000);await wait(()=>counts.live>live);await page.getByText('65.000đ',{exact:true}).waitFor();
 // At the next eligible heartbeat the three static sources refresh automatically.
 const m=counts.menu,g=counts.groups;await page.clock.runFor(5000);await wait(()=>counts.menu>base.menu&&counts.groups>base.groups);assert.ok(counts.menu<=base.menu+1);assert.ok(counts.tables<=base.tables+1);assert.ok(counts.groups<=base.groups+1);
 const beforeManual={...counts};tableName='Bàn đổi tên';menu[0].price=70000;await page.getByRole('button',{name:'Đồng bộ',exact:true}).click();await wait(()=>counts.menu>beforeManual.menu&&counts.groups>beforeManual.groups);await page.getByRole('button',{name:/^Bàn đổi tên /}).waitFor();
 // Reconnect forces catalog reload before its minute is due.
 const beforeOnline=counts.menu;await page.evaluate(()=>window.dispatchEvent(new Event('online')));await wait(()=>counts.menu>beforeOnline);
 // Catalog failures cannot masquerade as fresh success; next live tick retries them.
 failMenu=true;const failed=counts.menu;await page.getByRole('button',{name:'Đồng bộ',exact:true}).click();await wait(()=>counts.menu>failed);await page.getByText(/Chưa đồng bộ được đơn hàng/).first().waitFor();failMenu=false;const retry=counts.menu;await page.clock.runFor(5000);await wait(()=>counts.menu>retry);
 // Local menu saves bypass cache even when catalog was just fetched.
 if(await page.locator('.management-menu summary').isVisible())await page.locator('.management-menu summary').click();await page.getByRole('button',{name:'Quản lý thực đơn',exact:true}).click();await page.getByRole('button',{name:'Sửa Bún riêu',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa món',exact:true});await dialog.getByLabel('Giá bán (đồng)',{exact:true}).fill('75000');const beforeSave={...counts};await dialog.getByRole('button',{name:'Lưu thực đơn',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(counts.saves,1);assert.ok(counts.menu>beforeSave.menu&&counts.groups>beforeSave.groups);
 const beforeLogin=counts.groups;await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').click({trial:true});await wait(()=>counts.groups>beforeLogin);
 assert.deepEqual(errors,[]);console.log('PASS static sync:',JSON.stringify(reduction),'live 5s, catalog ~60s, exact names/amounts, manual/reconnect/local-save bypass, failed-catalog retry, cache cleared on same-user re-login, all API mocked.');
}finally{await browser.close();}
