import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{for(const role of ['thu_ngan','chu']){
 let saves=0,reports=0,fail=false,created=false;const calls=[],errors=[];
 const menu=[{id:'00000000-0000-0000-0000-000000000501',name:'Bún riêu thử',price:58000,category:'bun',version:1,is_active:true,is_out:false,sort:1}];
 const invoices=[2,1].map(n=>({id:'receipt-'+n,invoice_no:n,table_no:n,bill_no:1,total:58000,gross:58000,discount:0,method:'cash',cash_received:60000,change_due:2000,paid_at:new Date(Date.now()-n*60000).toISOString(),bill_items:[{id:'line-'+n,name:'Bún trên hóa đơn',price:58000,qty:1,note:''}]}));
 const groups=[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}];
 const context=await browser.newContext({viewport:{width:390,height:844}});
 await context.addInitScript(role=>localStorage.setItem(`pos:dashboard-bands:${role}`,JSON.stringify([['06:00','09:00'],['09:00','11:00'],['11:00','13:00'],['13:00','15:00'],['15:00','17:00'],['17:00','22:00']].map(([start,end])=>({start,end})))),role);
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>{socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));});});
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;calls.push(path);let body;
 if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:role,email:'local@example.test',aud:'authenticated',role:'authenticated'}};
 else if(path==='/auth/v1/user')body={id:role,email:'local@example.test'};
 else if(path.endsWith('/get_my_access'))body={...mockAccess({role,name:role==='chu'?'Admin':'Thu ngân thử'}),linked_tables:true};
 else if(path.endsWith('/get_linked_table_snapshot'))body={sessions:[],links:[]};
 else if(path.endsWith('/get_pos_sync_delta'))body={session_ids:[],sessions:[],links:[],kitchen:[]};
 else if(path.endsWith('/menu_group_catalog'))body={groups,assignments:{},non_kitchen_checkout:true};
 else if(path==='/rest/v1/bills'){assert.equal(role,'thu_ngan');const u=new URL(req.url()),id=u.searchParams.get('id');if(id)body=invoices.find(b=>'eq.'+b.id===id);else{assert.equal(u.searchParams.get('limit'),'11');body=invoices;}}
 else if(path==='/rest/v1/orders')body=[];
 else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1',service_type:'dine_in'}];
 else if(path==='/rest/v1/menu_items'||path.endsWith('/list_menu_management'))body=menu;
 else if(path.endsWith('/save_menu_item_in_group')){saves++;const p=req.postDataJSON();Object.assign(menu[0],{name:p.p_name,price:p.p_price,version:2});body=menu[0].id;}
 else if(path.endsWith('/cashier_dashboard_window')){assert.equal(req.postDataJSON().p_bands.length,7,'cashier legacy bands upgrade');reports++;if(fail)return route.fulfill({status:503,json:{message:'Test unavailable'}});const p=req.postDataJSON();
 const choices=[{table_id:1,name:'Bàn 1'},{table_id:2,name:'Mang về 2'}];
 const tableData=p.p_kind==='takeaway'||p.p_table===2?[{table_id:2,name:'Mang về 2',invoices:3,visits:3,qty:33}]:p.p_kind==='dine'||p.p_table===1?[{table_id:1,name:'Bàn 1',invoices:5,visits:4,qty:60}]:[{table_id:1,name:'Bàn 1',invoices:5,visits:4,qty:60},{table_id:2,name:'Mang về 2',invoices:3,visits:3,qty:33}];
 const qty=tableData.reduce((n,t)=>n+t.qty,0),invoices=tableData.reduce((n,t)=>n+t.invoices,0),visits=tableData.reduce((n,t)=>n+t.visits,0);
 const products=qty===93?[{name:'Bún riêu đầy đủ',qty:30},{name:'Bún riêu truyền thống',qty:20},{name:'Bún riêu góc phố',qty:15},{name:'Canh bún đầy đủ',qty:10},{name:'Canh bún truyền thống',qty:8},{name:'Canh bún góc phố',qty:5},{name:'Bún thêm',qty:3},{name:'Trà đá',qty:2}]:[{name:'Bún riêu đầy đủ',qty}];
 const slots=[...p.p_bands.map(b=>b.start+'–'+b.end),'Ngoài khung'].map((slot,i)=>({slot,slot_index:i+1,invoices:0,qty:0}));
 const product_slots=products.map((v,i)=>({name:v.name,qty:v.qty,slot_index:(i%p.p_bands.length)+1}));for(const v of product_slots)slots[v.slot_index-1].qty+=v.qty;if(products.length===invoices){for(const v of product_slots)slots[v.slot_index-1].invoices++;}else slots[0].invoices=invoices;
 body={from:p.p_from_local,to:p.p_to_local,generated_at:new Date().toISOString(),kind:p.p_kind,table_id:p.p_table,invoices,visits,qty,slots,products,product_slots,table_sales:tableData,table_options:choices,days:[{day:p.p_from_local.slice(0,10),invoices,qty}]};}

 else if(path.endsWith('/list_employees'))body={employees:[],total:0,page:1,page_size:20};
 else if(path==='/functions/v1/staff-admin'){const p=req.postDataJSON();if(p.action==='create_employee'){assert.equal(role,'chu');assert.equal(p.role,'thu_ngan');created=true;}body={ok:true,user_id:'new-cashier'};}
 else throw Error('Unexpected '+path);
 await route.fulfill({json:body});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5197');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('local@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('LocalTest123!');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').first().waitFor();
 const open=async name=>{const summary=page.locator('.management-menu summary');if(await summary.isVisible()){if(!await page.locator('.management-menu').getAttribute('open'))await summary.click();await page.locator('.management-dropdown').getByRole('button',{name,exact:true}).click();}else await page.getByRole('button',{name,exact:true}).first().click();};
 if(role==='thu_ngan'){
 await open('Báo cáo');const report=page.getByRole('region',{name:'Báo cáo',exact:true});await report.getByRole('heading',{name:'Bán hàng theo khung giờ'}).waitFor();assert.equal(reports,1);
 assert.equal(await report.locator('.dash-kpis').count(),0);assert.equal(await report.locator('.dash-charts-grid').count(),0);
 assert.equal(await report.locator('.dash-two-columns>.dash-card').count(),2);assert.equal(await report.locator('.dash-products>li').count(),6);
 assert.deepEqual(await report.locator('.dash-tables thead th').allTextContents(),['Bàn / điểm bán','Lượt bán','Hóa đơn','Số phần']);
 await report.getByText('Xem toàn bộ món bán',{exact:true}).click();assert.deepEqual(await report.locator('.dash-two-columns table thead th').allTextContents(),['Món','Số phần']);
 const download=page.waitForEvent('download');await report.getByRole('button',{name:'Xuất Excel · tất cả khung',exact:true}).click();const file=await download;assert.ok(file.suggestedFilename().endsWith('.xlsx'));await file.saveAs('/workspace/artifacts/cashier-browser-quantity.xlsx');
 assert.equal(await report.getByRole('button',{name:'Xuất CSV',exact:true}).count(),0);assert.equal(await report.locator('.dash-operations').count(),0);
 const burst=reports;await report.getByRole('button',{name:'Mang về',exact:true}).click();await report.getByRole('button',{name:'Tất cả',exact:true}).click();await report.getByRole('button',{name:'Ăn tại bàn',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dash-tables tfoot')?.textContent?.includes('60'));assert.equal(reports,burst+1,'rapid filter changes coalesce');
 const initial=reports;await report.getByRole('button',{name:'Mang về',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dash-tables tfoot')?.textContent?.includes('33'));assert.ok(reports>initial);
 await report.getByRole('button',{name:'Tất cả',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.dash-tables tfoot')?.textContent?.includes('93'));
 
 assert.equal(await page.getByRole('button',{name:'Quản lý nhân viên',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Nhật ký hoạt động',exact:true}).count(),0);
 const text=await report.innerText();for(const hidden of ['Thực thu','TB / lượt','Giá trị hóa đơn','Cơ cấu thanh toán','Doanh thu theo ngày','Tiền món chưa thanh toán'])assert.ok(!text.includes(hidden),hidden);
 assert.equal(calls.filter(p=>p==='/rest/v1/bills'||p==='/rest/v1/bill_items'||p.endsWith('/revenue_report_window')).length,0);
 fail=true;await report.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await report.getByRole('alert').waitFor();assert.equal(await report.locator('.dash-tables tbody').count(),0,'old results cleared on failure');fail=false;await report.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await report.locator('.dash-tables tbody').waitFor();
 for(const width of [375,390,768,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:1440,height:1100});await page.screenshot({path:'/workspace/artifacts/cashier-dashboard-desktop.png',fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/workspace/artifacts/cashier-report.png',fullPage:true});
 await open('Quản lý thực đơn');await page.getByRole('button',{name:'Sửa Bún riêu thử',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Sửa món',exact:true});await dialog.getByLabel('Giá bán (đồng)',{exact:true}).fill('60000');await dialog.getByRole('button',{name:'Lưu thực đơn',exact:true}).click();await dialog.waitFor({state:'detached'});assert.equal(saves,1);assert.equal(menu[0].price,60000);await open('Hóa đơn gần đây');await page.getByRole('heading',{name:'Hóa đơn gần nhất',exact:true}).waitFor();assert.equal(await page.getByText('Chỉ hiển thị hóa đơn gần nhất do bạn thanh toán.',{exact:true}).count(),0);assert.equal(await page.locator('.invoice-list button').count(),2);await page.locator('.invoice-list button').first().click();await page.getByText('Tổng thanh toán: 58.000đ',{exact:true}).waitFor();await page.getByText('1 × Bún trên hóa đơn',{exact:false}).waitFor();
 }else{
 await open('Quản lý nhân viên');await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();const form=page.getByRole('form',{name:'Thêm nhân viên',exact:true});await form.getByLabel('Tên nhân viên',{exact:true}).fill('Thu ngân mới');await form.getByLabel('Tên đăng nhập',{exact:true}).fill('cashier-test');await form.getByLabel('Vai trò nhân viên',{exact:true}).selectOption('thu_ngan');await form.getByLabel('Mật khẩu tạm',{exact:true}).fill('Local123!');await form.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await page.getByText(/Đã tạo nhân viên/).waitFor();assert.equal(created,true);
 }
 assert.deepEqual(errors,[]);await context.close();
}console.log('PASS cashier browser: Dashboard layout retained, KPI/charts removed, quantity-only RPC/Excel; CSV and live operations removed; full receipt list/detail, sales filters, product/table counts, no financial/history/admin requests, error/retry, 375–1440 layout, cashier edits menu price, Owner creates cashier account. All HTTP/WebSockets mocked.');}finally{await browser.close();}
