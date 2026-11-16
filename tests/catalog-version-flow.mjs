import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:1440,height:950}});let version=1,name='Bàn 1',price=58000,group='Món chính',snapshots=0,shipped=0,groupsReads=0,legacy=0,malformed=false,missing=false;
 const groups=()=>({groups:[{id:'bun',name:group,category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}],assignments:{},non_kitchen_checkout:true});
 const menu=()=>[{id:'food',name:'Bún riêu',price,category:'bun',is_active:true,is_out:false}],tables=()=>[{id:1,name,service_type:'dine_in'}];const access=()=>({...mockAccess({name:'Admin',role:'chu'}),linked_tables:true,live_snapshot:true,catalog_versions:true});
 let ws;const joins=[];const frame=(topic,event,payload,ref=null)=>JSON.stringify([joins.findLast(j=>j.topic===topic)?.joinRef??null,ref,topic,event,payload]);
 await context.routeWebSocket('**/realtime/v1/websocket**',socket=>{ws=socket;socket.onMessage(raw=>{const a=JSON.parse(String(raw)),m={joinRef:a[0],ref:a[1],topic:a[2],event:a[3]};if(m.event==='phx_join'){joins.push(m);socket.send(frame(m.topic,'phx_reply',{status:'ok',response:{}},m.ref));}else if(m.event==='heartbeat')socket.send(frame(m.topic,'phx_reply',{status:'ok',response:{}},m.ref));});});
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:'catalog-owner',email:'test@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'catalog-owner'};
  else if(path==='/auth/v1/logout')body={};
  else if(path.endsWith('/get_my_access'))body=access();
  else if(path==='/rest/v1/menu_items')body=menu();
  else if(path==='/rest/v1/restaurant_tables')body=tables();
  else if(path.endsWith('/menu_group_catalog')){groupsReads++;body=groups();}
  else if(path.endsWith('/get_pos_live_snapshot')){legacy++;const p=req.postDataJSON();body={version:1,access:access(),snapshot:p.p_catalog_only?null:{sessions:[],links:[],kitchen:[]},catalog:p.p_catalog?{menu:menu(),tables:tables()}:null};}
  else if(path.endsWith('/get_pos_live_snapshot_v2')){
   snapshots++;if(missing)return route.fulfill({status:404,json:{code:'PGRST202',message:'Old backend'}});const p=req.postDataJSON();body={version:1,access:access(),snapshot:p.p_catalog_only?null:{sessions:[],links:[],kitchen:[]},catalog:null};
   if(p.p_catalog||p.p_catalog_only){const same=p.p_catalog_version===String(version);body.catalog_version=String(version);body.catalog_unchanged=same;if(!same){shipped++;body.catalog={menu:menu(),tables:tables(),groups:groups()};}if(malformed){body.catalog_version='unexpected';body.catalog_unchanged=true;}}
  }else throw Error('Unexpected '+path);await route.fulfill({json:body});
 });
 const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));await page.clock.install();await page.goto(process.env.POS_TEST_URL||'http://localhost:5199');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.locator('.table-card').waitFor();await page.clock.runFor(500);await page.waitForLoadState('networkidle');
 const base={snapshots,shipped,groupsReads};for(let i=0;i<39;i++){await page.clock.runFor(5000);await page.waitForTimeout(30);}await page.waitForLoadState('networkidle');assert.ok(snapshots>base.snapshots,'full safety still reads');assert.equal(shipped,base.shipped,'unchanged menu/table/group payload not transferred');assert.equal(groupsReads,base.groupsReads,'no separate idle group request');
 version++;name='Bàn phiên bản 2';price=65000;group='Món chính phiên bản 2';const sent=shipped;for(let i=0;i<25;i++)ws.send(frame('realtime:pos:catalog','broadcast',{event:'invalidate',type:'broadcast',payload:{version:1}}));await page.waitForTimeout(100);await page.clock.runFor(500);await page.getByRole('button',{name:/^Bàn phiên bản 2 /}).waitFor();assert.equal(shipped,sent+1);assert.equal(groupsReads,base.groupsReads);await page.locator('.table-card').click();await page.getByRole('button',{name:'Món chính phiên bản 2',exact:true}).waitFor();await page.getByText('65.000đ',{exact:true}).waitFor();await page.getByRole('button',{name:'Đóng danh sách món',exact:true}).click();
 // A missed catalog signal is recovered by the retained safety read.
 version++;name='Bàn phiên bản 3';for(let i=0;i<13;i++){await page.clock.runFor(5000);await page.waitForTimeout(30);}await page.waitForLoadState('networkidle');assert.ok(shipped>=sent+2);
 malformed=true;await page.getByRole('button',{name:'Đồng bộ',exact:true}).click();await page.getByText(/Chưa đồng bộ được đơn hàng/).first().waitFor();malformed=false;await page.clock.runFor(5000);await page.waitForLoadState('networkidle');await page.getByText(/Chưa đồng bộ được đơn hàng/).first().waitFor({state:'hidden'});
 assert.equal(legacy,0);missing=true;version++;name='Bàn tương thích';await page.getByRole('button',{name:'Đồng bộ',exact:true}).click();await page.getByRole('button',{name:/^Bàn tương thích /}).waitFor();assert.ok(legacy>0);await page.waitForLoadState('networkidle');assert.ok(groupsReads>base.groupsReads,'missing endpoint resumes legacy group reads');
 const oldLegacy=legacy,oldShipped=shipped;missing=false;await page.reload();await page.locator('.table-card').waitFor();await page.clock.runFor(500);await page.waitForLoadState('networkidle');assert.equal(legacy,oldLegacy);assert.ok(shipped>oldShipped,'reload resets unsupported probe and catalog token');assert.deepEqual(errors,[]);console.log('PASS versioned catalog browser: 60s safety preserved, unchanged catalogs omitted, zero separate idle group reads, burst invalidation hydrates menu/table/groups in one response, missed-event recovery, malformed version retry and fail-closed state. All network mocked.');
}finally{await browser.close();}
