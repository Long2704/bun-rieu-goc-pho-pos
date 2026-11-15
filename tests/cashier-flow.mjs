import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const role of ['thu_ngan','chu']){
 let saves=0,reports=0,fail=false,created=false;const calls=[],errors=[];
 const menu=[{id:'00000000-0000-0000-0000-000000000501',name:'Bún riêu thử',price:58000,category:'bun',version:1,is_active:true,is_out:false,sort:1}];
 const groups=[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}];
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>{socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));});});
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;calls.push(path);let body;
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:role,email:'local@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/user')body={id:role,email:'local@example.test'};
 else if(path.endsWith('/get_my_access'))body={...mockAccess({role,name:role==='chu'?'Admin':'Thu ngân thử'}),linked_tables:true};
 else if(path.endsWith('/get_linked_table_snapshot'))body={sessions:[],links:[]};
 else if(path.endsWith('/get_pos_sync_delta'))body={session_ids:[],sessions:[],links:[],kitchen:[]};
 else if(path.endsWith('/menu_group_catalog'))body={groups,assignments:{},non_kitchen_checkout:true};
 else if(path==='/rest/v1/bills'){assert.equal(role,'thu_ngan');assert.equal(new URL(req.url()).searchParams.get('limit'),'1');body=[];}
 else if(path==='/rest/v1/orders')body=[];
 else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1',service_type:'dine_in'}];
 else if(path==='/rest/v1/menu_items'||path.endsWith('/list_menu_management'))body=menu;
 else if(path.endsWith('/save_menu_item_in_group')){saves++;const p=req.postDataJSON();Object.assign(menu[0],{name:p.p_name,price:p.p_price,version:2});body=menu[0].id;}
 else if(path.endsWith('/cashier_operations_report')){reports++;if(fail)return route.fulfill({status:503,json:{message:'Test unavailable'}});const p=req.postDataJSON();body={from:p.p_from,to:p.p_to,main_qty:5,takeaway_qty:2,gift_qty:1,cancelled_qty:1,slots:['06:00–09:00','09:00–11:00','11:00–13:00','13:00–15:00','15:00–17:00','17:00–19:00','19:00–22:00','Ngoài khung giờ'].map((slot,n)=>({slot,main_qty:n===0?5:0,takeaway_qty:n===0?2:0,gift_qty:n===0?1:0}))};}
 else if(path.endsWith('/list_employees'))body={employees:[],total:0,page:1,page_size:20};
 else if(path==='/functions/v1/staff-admin'){const p=req.postDataJSON();if(p.action==='create_employee'){assert.equal(role,'chu');assert.equal(p.role,'thu_ngan');created=true;}body={ok:true,user_id:'new-cashier'};}
 else throw Error('Unexpected '+path);
 await route.fulfill({json:body});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5197');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('local@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('LocalTest123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').first().waitFor();
 const open=async name=>{const summary=page.locator('.management-menu summary');if(await summary.isVisible()){if(!await page.locator('.management-menu').getAttribute('open'))await summary.click();await page.locator('.management-dropdown').getByRole('button',{name,exact:true}).click();}else await page.getByRole('button',{name,exact:true}).first().click();};
 if(role==='thu_ngan'){
 await open('Báo cáo vận hành');const report=page.getByRole('region',{name:'Báo cáo vận hành',exact:true});await report.getByRole('heading',{name:'Số lượng theo khung giờ'}).waitFor();assert.equal(reports,1);
 assert.equal(await page.getByRole('button',{name:'Quản lý nhân viên',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Nhật ký hoạt động',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Hóa đơn gần đây',exact:true}).count(),0);
 const text=await report.innerText();for(const hidden of ['Thực thu','Giá trị hóa đơn','Xuất Excel','Xuất dữ liệu CSV','Cơ cấu thanh toán','Doanh thu theo ngày'])assert.ok(!text.includes(hidden),hidden);
 assert.equal(calls.filter(p=>p==='/rest/v1/bills'||p==='/rest/v1/bill_items'||p.endsWith('/revenue_report_window')).length,0);
 fail=true;await report.getByRole('button',{name:'Xem báo cáo',exact:true}).click();await report.getByRole('alert').waitFor();assert.equal(await report.locator('tbody').count(),0,'old results cleared on failure');fail=false;await report.getByRole('button',{name:'Xem báo cáo',exact:true}).click();await report.locator('tbody').waitFor();
 for(const width of [375,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/workspace/artifacts/cashier-report.png',fullPage:true});
 await open('Quản lý thực đơn');await page.getByRole('button',{name:'Sửa Bún riêu thử',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa món',exact:true});await dialog.getByLabel('Giá bán (đồng)',{exact:true}).fill('60000');await dialog.getByRole('button',{name:'Lưu thực đơn',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(saves,1);assert.equal(menu[0].price,60000);await open('Hóa đơn vừa thu');await page.getByRole('heading',{name:'Hóa đơn vừa thu',exact:true}).waitFor();assert.equal(await page.getByRole('heading',{name:'30 hóa đơn gần nhất',exact:true}).count(),0);
 }else{
 await open('Quản lý nhân viên');await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();const form=page.getByRole('form',{name:'Thêm nhân viên',exact:true});await form.getByLabel('Tên nhân viên',{exact:true}).fill('Thu ngân mới');await form.getByLabel('Tên đăng nhập',{exact:true}).fill('cashier-test');await form.getByLabel('Vai trò nhân viên',{exact:true}).selectOption('thu_ngan');await form.getByLabel('Mật khẩu tạm',{exact:true}).fill('Local123!');await form.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await page.getByText(/Đã tạo nhân viên/).waitFor();assert.equal(created,true);
 }
 assert.deepEqual(errors,[]);await context.close();
}console.log('PASS cashier browser: quantity-only RPC, no financial/history/admin requests, error/retry, 375–1440 layout, cashier edits menu price, Owner creates cashier account. All HTTP/WebSockets mocked.');}finally{await browser.close();}
