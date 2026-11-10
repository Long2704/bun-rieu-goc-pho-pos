import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
import {vnToday,shiftDay} from '../src/dashboard-model.ts';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'America/Los_Angeles',acceptDownloads:true,hasTouch:true});
 const today=vnToday(),previous=shiftDay(today,-1);
 const sale=(id,day,time,amount,extra={})=>({id,session_id:'takeaway-session',table_no:201,service_label:'Mang về 2',paid_at:`${day}T${time}+07:00`,gross:amount,discount:0,total:amount,method:'cash',bill_items:[{name:'Bún riêu',qty:1,price:amount}],...extra});
 let sales=[sale('a',today,'08:59:59.999',58000),sale('b',today,'09:00:00.500',65000,{method:'transfer'}),sale('c',today,'17:00:00',15000,{session_id:'takeaway-three',table_no:202,service_label:'Mang về 3'}),sale('d',today,'11:00:00',100000,{session_id:'dine-session',table_no:1,service_label:'Bàn 1',gross:110000,discount:10000,bill_items:[{name:'Canh bún',qty:2,price:55000}]}),sale('p',previous,'09:00:00',25000)];
 let mode='ok',reads=[],retentionEnabled=true,retentionToggles=[];
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),url=new URL(req.url()),path=url.pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock-owner',refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user:{id:'dashboard-owner',email:'owner@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'dashboard-owner',email:'owner@example.test'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Chủ quán',role:'chu'});
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'},{id:2,name:'Bàn 2'},{id:201,name:'Mang về 2'},{id:202,name:'Mang về 3'}];
  else if(path==='/rest/v1/menu_items'){const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',sort:0,is_active:true},{id:'canh',name:'Canh bún',price:55000,category:'bun',sort:1,is_active:true}];return route.fulfill({json:menu,headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'}});}
  else if(['/rest/v1/orders','/rest/v1/table_sessions'].includes(path))body=[];
  else if(path.endsWith('/set_sales_retention_enabled')){retentionEnabled=req.postDataJSON().p_enabled;retentionToggles.push(retentionEnabled);body=null;}
  else if(path.endsWith('/get_sales_retention_status'))body={retention_days:7,retention_mode:'calendar_days',schedule_kind:'daily',enabled:retentionEnabled,scheduled:true,next_run:new Date().toISOString(),last_run:null,eligible:{sessions:0,orders:0,invoices:0}};
  else if(path==='/rest/v1/bills'){
   reads.push(url.href);if(mode==='error')return route.fulfill({status:403,json:{message:'Denied'}});
   let filtered=sales.filter(s=>url.searchParams.getAll('paid_at').every(rule=>{const [op,...parts]=rule.split('.'),time=Date.parse(parts.join('.')),actual=Date.parse(s.paid_at);return op==='gte'?actual>=time:op==='lt'?actual<time:actual<=time;}));
   filtered.sort((a,b)=>Date.parse(a.paid_at)-Date.parse(b.paid_at)||a.id.localeCompare(b.id));
   const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||500),page=filtered.slice(offset,offset+limit);
   return route.fulfill({json:page,headers:{'access-control-expose-headers':'content-range','content-range':`${offset}-${offset+page.length-1}/${mode==='huge'?50001:filtered.length}`}});
  }else throw Error('Unexpected '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.clock.setFixedTime(new Date(vnToday()+'T23:59:59+07:00'));await page.goto(process.env.POS_TEST_URL||'http://localhost:5173');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 if(await page.locator('.management-menu summary').isVisible())await page.locator('.management-menu summary').click();await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 const dash=page.getByRole('region',{name:'Dashboard kinh doanh'}),kpi=label=>dash.locator('.dash-kpis>div').filter({has:page.getByText(label,{exact:true})}).locator('dd');
 await kpi('Thực thu').waitFor();assert.equal(await kpi('Thực thu').innerText(),'238.000đ');assert.equal(await kpi('Số hóa đơn').innerText(),'4');assert.equal(await kpi('Lượt bán đã thanh toán').innerText(),'3');
 await dash.locator('.dash-retention summary').click();await dash.getByText(/Đang bật · Mỗi ngày, 03:00 giờ Việt Nam/).waitFor();await dash.getByText(/Giữ ngày hôm nay và 6 ngày trước/).waitFor();await dash.getByRole('button',{name:'Tạm dừng dọn tự động',exact:true}).click();await dash.getByText('Đã tạm dừng dọn tự động.',{exact:true}).waitFor();await dash.getByRole('button',{name:'Bật dọn tự động (giữ 7 ngày)',exact:true}).click();await dash.getByRole('button',{name:'Tạm dừng dọn tự động',exact:true}).waitFor();assert.deepEqual(retentionToggles,[false,true]);await dash.locator('.dash-retention summary').click();
 assert.equal(reads.length,1);assert.match(await dash.locator('.dash-slot-bars>div').nth(0).innerText(),/58\.000đ/);assert.match(await dash.locator('.dash-slot-bars>div').nth(1).innerText(),/65\.000đ/);
 await page.screenshot({path:'/workspace/artifacts/dashboard-desktop-1440.png'});
 await dash.locator('.dash-filter-chips').getByRole('button',{name:'Mang về',exact:true}).click();assert.equal(await kpi('Thực thu').innerText(),'138.000đ');assert.equal(await kpi('Lượt bán đã thanh toán').innerText(),'2');assert.equal(reads.length,1,'table filters reuse the complete loaded snapshot');
 await dash.getByLabel('Bàn / điểm bán',{exact:true}).selectOption('201');assert.equal(await kpi('Thực thu').innerText(),'123.000đ');assert.equal(await kpi('Số hóa đơn').innerText(),'2');assert.equal(await kpi('Lượt bán đã thanh toán').innerText(),'1');
 await dash.locator('.dash-band-settings summary').click();await dash.getByLabel('Khung 1 đến',{exact:true}).fill('08:00');await dash.getByLabel('Khung 2 từ',{exact:true}).fill('08:00');assert.match(await dash.locator('.dash-slot-bars>div').nth(0).innerText(),/0đ/);assert.match(await dash.locator('.dash-slot-bars>div').nth(1).innerText(),/123\.000đ/);
 await dash.getByLabel('Khung 2 từ',{exact:true}).fill('07:00');await dash.getByRole('alert').filter({hasText:'không trùng hoặc chồng nhau'}).waitFor();assert.equal(await dash.locator('.dash-kpis').count(),0);
 await dash.getByRole('button',{name:'Khôi phục 6 khung ban đầu',exact:true}).click();await kpi('Thực thu').waitFor();
 const downloading=page.waitForEvent('download');await dash.getByRole('button',{name:'Xuất Excel · tất cả khung',exact:true}).click();const file=await downloading;await file.saveAs('/tmp/dashboard-browser.xlsx');assert.match(file.suggestedFilename(),/\.xlsx$/);
 // Keep iOS-compatible seconds controls and invalidate exports until the new period loads.
 await dash.getByRole('button',{name:/^Đến giờ/}).click();const clock=page.getByRole('dialog',{name:'Chọn đến giờ'});await clock.getByLabel('Đến giờ · giờ',{exact:true}).selectOption('08');await clock.getByLabel('Đến giờ · phút',{exact:true}).selectOption('59');await clock.getByLabel('Đến giờ · giây',{exact:true}).selectOption('59');await clock.getByRole('button',{name:'Áp dụng',exact:true}).click();assert.equal(await dash.getByRole('button',{name:'Xuất Excel · tất cả khung',exact:true}).count(),0);
 await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await kpi('Thực thu').waitFor();assert.equal(await kpi('Thực thu').innerText(),'58.000đ');
 await dash.getByRole('button',{name:'Hôm nay',exact:true}).click();await dash.locator('.dash-filter-chips').getByRole('button',{name:'Tất cả',exact:true}).click();await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await kpi('Thực thu').waitFor();
 for(const width of [375,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,`No horizontal overflow at ${width}`);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/workspace/artifacts/dashboard-mobile-390.png'});
 // More than one API page: totals must include every receipt, not only the default limit.
 sales=Array.from({length:501},(_,i)=>sale('bulk'+String(i).padStart(4,'0'),today,'06:30:00',1000,{session_id:'session'+i}));const countBefore=reads.length;
 await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await kpi('Thực thu').waitFor();assert.equal(await kpi('Thực thu').innerText(),'501.000đ');assert.equal(await kpi('Số hóa đơn').innerText(),'501');assert.equal(reads.length-countBefore,2);
 mode='error';await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await dash.getByRole('alert').filter({hasText:'Không tải được dữ liệu Dashboard'}).waitFor();assert.equal(await dash.locator('.dash-kpis').count(),0);
 mode='huge';await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await dash.getByRole('alert').filter({hasText:'50.000 hóa đơn'}).waitFor();assert.equal(await dash.locator('.dash-kpis').count(),0);
 mode='ok';sales=[];await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await kpi('Thực thu').waitFor();assert.equal(await kpi('Thực thu').innerText(),'0đ');assert.equal(await kpi('Số hóa đơn').innerText(),'0');assert.deepEqual(errors,[]);
 console.log('PASS Dashboard UI: auto load, VN seconds/slot boundaries, dedup split visits, takeaway/table filters, custom/invalid bands, XLSX, stale exports, 501-row pagination, failed/oversized/empty data, responsive 375/390/768/1440. All API mocked.');
}finally{await browser.close();}
