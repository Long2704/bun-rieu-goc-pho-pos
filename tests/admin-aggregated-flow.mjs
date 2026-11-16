import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
import {aggregateSales,matchesSale,bounds,defaultBands,vnToday,shiftDay} from '../src/dashboard-model.ts';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),today=vnToday(),before=shiftDay(today,-1);let requests=0,rawReads=0,fail=false,bad=false,summaryBytes=0,rawBytes=0,holdExport=false,releaseExport;
 const sales=Array.from({length:601},(_,i)=>({id:'bill-'+i,session_id:'session-'+Math.floor(i/3),table_no:i%2?1:2,service_label:i%2?'Bàn 1':'Mang về 2',paid_at:`${today}T${String(6+i%16).padStart(2,'0')}:00:00+07:00`,gross:119000,discount:0,total:119000,method:i%3?'cash':'transfer',bill_items:[{name:'Bún riêu',qty:2,price:58000,is_takeaway:i%2===0},{name:'Trà đá',qty:1,price:3000,is_takeaway:i%2===0}]}));
 sales.push({...sales[0],id:'previous',paid_at:before+'T08:00:00+07:00'});
 const groups=[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}];
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(['phx_join','heartbeat'].includes(m[3]))socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));}));
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url()),path=u.pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'aggregate-owner',email:'test@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'aggregate-owner'};
  else if(path==='/auth/v1/logout')body={};
  else if(path.endsWith('/get_my_access'))body={...mockAccess({name:'Admin',role:'chu'}),dashboard_aggregates:true};
  else if(path==='/rest/v1/table_sessions'||path==='/rest/v1/orders')body=[];
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'},{id:2,name:'Mang về 2'}];
  else if(path==='/rest/v1/menu_items')return route.fulfill({json:[{id:'food',name:'Bún riêu',price:58000,category:'bun',sort:0,is_active:true,is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',sort:1,is_active:true,is_out:false}],headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'}});
  else if(path.endsWith('/menu_group_catalog'))body={groups,assignments:{},non_kitchen_checkout:true};
  else if(path.endsWith('/admin_dashboard_window')){
   requests++;if(fail)return route.fulfill({status:503,json:{message:'Test unavailable'}});
   const p=req.postDataJSON(),r=bounds(p.p_from_local,p.p_to_local),local=ms=>new Date(ms+7*3600000).toISOString().slice(0,19),filtered=sales.filter(s=>matchesSale(s,p.p_kind,p.p_table===null?'all':String(p.p_table))),generated=today+'T23:59:59+07:00';
   body={version:1,kind:p.p_kind,table_id:p.p_table,current:aggregateSales(filtered,p.p_from_local,p.p_to_local,p.p_bands,'',generated),previous:aggregateSales(filtered,local(r.previous),local(r.start-1000),p.p_bands,'',generated),table_options:[{table_id:1,name:'Bàn 1',kinds:['dine']},{table_id:2,name:'Mang về 2',kinds:['takeaway']}]};
   if(requests===1){summaryBytes=Buffer.byteLength(JSON.stringify(body));rawBytes=Buffer.byteLength(JSON.stringify(sales));assert.ok(summaryBytes<rawBytes/4);}
   if(bad)body.current.slots.pop();
  }else if(path==='/rest/v1/bills'){
   rawReads++;if(holdExport)await new Promise(resolve=>releaseExport=resolve);const dates=u.searchParams.getAll('paid_at');assert.ok(dates.some(s=>s.startsWith('gte.')&&Date.parse(s.slice(4))===bounds(today+'T00:00:00',today+'T23:59:59').start),'Excel fetches selected period only');
   const selected=sales.filter(s=>dates.every(rule=>{const op=rule.slice(0,rule.indexOf('.')),t=Date.parse(rule.slice(rule.indexOf('.')+1)),v=Date.parse(s.paid_at);return op==='gte'?v>=t:op==='lt'?v<t:v<=t;}));
   const off=Number(u.searchParams.get('offset')||0),limit=Number(u.searchParams.get('limit')||500),rows=selected.slice(off,off+limit);return route.fulfill({json:rows,headers:{'content-range':`${off}-${off+rows.length-1}/${selected.length}`,'access-control-expose-headers':'content-range'}});
  }else throw Error('Unexpected '+path);await route.fulfill({json:body});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));let downloadCount=0;page.on('download',()=>downloadCount++);page.setDefaultTimeout(12000);await page.clock.setFixedTime(new Date(today+'T23:59:59+07:00'));
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5199');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').first().waitFor();
 if(await page.locator('.management-menu summary').isVisible())await page.locator('.management-menu summary').click();await page.getByRole('button',{name:'Dashboard',exact:true}).click();
 const dash=page.getByRole('region',{name:'Dashboard kinh doanh'}),kpi=()=>dash.locator('.dash-kpis>div').filter({has:page.getByText('Số hóa đơn',{exact:true})}).locator('dd');await kpi().waitFor();assert.equal(await kpi().innerText(),'601');assert.equal(requests,1);assert.equal(rawReads,0,'view never downloads invoice rows');
 const initial=requests;await dash.getByRole('button',{name:'Mang về',exact:true}).click();await dash.getByRole('button',{name:'Tất cả',exact:true}).click();await dash.getByRole('button',{name:'Ăn tại bàn',exact:true}).click();await kpi().waitFor();assert.equal(await kpi().innerText(),'300');assert.equal(requests,initial+1,'burst emits only final filter');assert.equal(rawReads,0);
 const explicit=requests;await dash.getByRole('button',{name:'Mang về',exact:true}).click();await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await kpi().waitFor();await page.waitForTimeout(500);assert.equal(requests,explicit+1,'manual submit cancels pending debounce');
 await dash.getByRole('button',{name:'Tất cả',exact:true}).click();await kpi().waitFor();assert.equal(await kpi().innerText(),'601');
 const downloaded=page.waitForEvent('download');await dash.getByRole('button',{name:'Xuất Excel · tất cả khung',exact:true}).click();assert.ok((await downloaded).suggestedFilename().endsWith('.xlsx'));assert.equal(rawReads,2,'detail is paged only on export');
 for(const type of ['failure','malformed']){fail=type==='failure';bad=type==='malformed';await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await dash.getByRole('alert').waitFor();assert.equal(await dash.locator('.dash-kpis').count(),0);fail=false;bad=false;await dash.getByRole('button',{name:'Xem Dashboard',exact:true}).click();await kpi().waitFor();}
 assert.equal(rawReads,2,'failed aggregate cannot silently download raw invoices');
 for(const width of [375,768,1440]){await page.setViewportSize({width,height:950});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 holdExport=true;await dash.getByRole('button',{name:'Xuất Excel · tất cả khung',exact:true}).click();for(let n=0;n<100&&!releaseExport;n++)await page.waitForTimeout(20);assert.ok(releaseExport);await page.getByRole('button',{name:'Đăng xuất',exact:true}).click();await page.getByLabel('Tên đăng nhập',{exact:true}).waitFor();holdExport=false;releaseExport();await page.waitForTimeout(100);assert.equal(downloadCount,1,'logout aborts a pending export');
 assert.deepEqual(errors,[]);console.log(JSON.stringify({fixtureSummaryBytes:summaryBytes,fixtureRawInvoiceBytes:rawBytes,reductionPercent:Math.round((1-summaryBytes/rawBytes)*100)}));console.log('PASS aggregate browser: 601 invoices rendered from one summary, no raw invoice reads on view/filter; 3 rapid filter changes→one RPC; selected-period Excel only on demand; failed/malformed response fails closed; responsive UI. All HTTP/WebSocket mocked.');
}finally{await browser.close();}
