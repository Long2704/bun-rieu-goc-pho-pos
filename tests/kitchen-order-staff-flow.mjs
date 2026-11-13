import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
const context=await browser.newContext({viewport:{width:390,height:844}});
const menu=[{id:'food',name:'Bún riêu truyền thống',price:58000,category:'bun',is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
const order=(table,id)=>({id:'order'+id,session_id:'s'+table,request_id:'req'+id,ordered_by_name:id===1?'Chủ quán Bún Riêu Góc Phố':'Lan',status:'cooking',kitchen_relevant:true,created_at:new Date().toISOString(),order_items:menu.map((m,n)=>({...m,id:`line${id}-${n}`,qty:1,note:n?'':'Không hành',paid:false,bill_no:1}))});
let sessions=[{id:'s1',table_id:1,orders:[order(1,1)]},{id:'s2',table_id:2,orders:[order(2,2)]},{id:'s3',table_id:3,orders:[order(3,3)]}];
let bills=[],attempts=[],lostResponse=true,receiptUnavailable=false,role='bep',stale=false;
sessions=sessions.slice(0,2);sessions[1].orders[0].status='done';sessions[1].orders[0].done_at=new Date().toISOString();
await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{if(await mockLegacyMenuGroups(route))return;
 const req=route.request(),u=new URL(req.url());let body;
 if(u.pathname==='/auth/v1/token')body={access_token:'test-access-token',refresh_token:'test-refresh-token',token_type:'bearer',expires_in:3600,user:{id:'payment-test-user',email:'test@example.com',aud:'authenticated',role:'authenticated'}};
 else if(u.pathname==='/auth/v1/user')body={id:'payment-test-user',email:'test@example.com'};
 else if(u.pathname==='/rest/v1/rpc/get_my_access')body=mockAccess({name:'Bếp thử nghiệm',role});
 else if(u.pathname==='/rest/v1/menu_items')body=menu;
 else if(u.pathname==='/rest/v1/restaurant_tables')body=Array.from({length:12},(_,i)=>({id:i+1,name:`Bàn ${i+1}`}));
 else if(u.pathname==='/rest/v1/table_sessions')body=sessions.filter(s=>!s.closed);
 else if(u.pathname==='/rest/v1/orders')body=sessions.flatMap(s=>s.orders.filter(o=>o.status==='cooking').map(o=>({...o,table_sessions:{table_id:s.table_id,closed_at:s.closed?'2026-10-27':null}})));
 else if(u.pathname==='/rest/v1/rpc/pay_bill'){
  const p=req.postDataJSON();attempts.push(p);
  if(stale){stale=false;return route.fulfill({status:400,json:{code:'P0001',message:'Danh sách món đã thay đổi. Đồng bộ và kiểm tra lại trước khi thanh toán.'}});}
  let b=bills.find(b=>b.request_id===p.p_request_id);
  if(!b){
   const s=sessions.find(s=>s.id===p.p_session_id);const lines=s.orders.flatMap(o=>o.order_items);
   assert.deepEqual([...p.p_expected_item_ids].sort(),lines.map(i=>i.id).sort());
   const gross=lines.reduce((n,i)=>n+i.qty*i.price,0),discount=p.p_discount_type==='percent'?Math.round(gross*p.p_discount_value/100):p.p_discount_value;
   b={id:'bill'+(bills.length+1),invoice_no:bills.length+1,request_id:p.p_request_id,table_no:s.table_id,gross,discount,total:gross-discount,method:p.p_method,cash_received:p.p_cash_received,change_due:p.p_method==='cash'?p.p_cash_received-(gross-discount):0,paid_at:new Date().toISOString(),bill_items:structuredClone(lines)};
   bills.push(b);s.closed=true;s.orders.forEach(o=>o.order_items.forEach(i=>i.paid=true));
  }
  if(lostResponse){lostResponse=false;return route.fulfill({status:503,json:{message:'Simulated payment acknowledgement lost'}});}
  body=b.id;
 }
 else if(u.pathname==='/rest/v1/bills'){
  if(u.searchParams.has('id')){if(receiptUnavailable)return route.fulfill({status:503,json:{message:'Receipt unavailable'}});body=bills.find(b=>'eq.'+b.id===u.searchParams.get('id'));}
  else body=[...bills].reverse();
 }
 else throw new Error('Unexpected network '+u.pathname);
 await route.fulfill({status:200,json:body});
});
await context.addInitScript(()=>{
 if(localStorage.getItem('test-unsupported')){Object.defineProperty(window,'AudioContext',{value:undefined,configurable:true});Object.defineProperty(window,'webkitAudioContext',{value:undefined,configurable:true});Object.defineProperty(navigator,'wakeLock',{value:undefined,configurable:true});return;}
 window.deviceCalls={notes:0,resumes:0,closes:0,wakeRequests:0,releases:0};window.leases=[];window.rejectWake=false;window.holdWake=false;
 class TestAudio{
  state='suspended';currentTime=0;destination={};
  async resume(){if(window.rejectAudio)throw new Error('Audio unavailable');this.state='running';window.deviceCalls.resumes++;}
  async suspend(){this.state='suspended';}
  async close(){this.state='closed';window.deviceCalls.closes++;}
  createOscillator(){return {frequency:{value:0},connect(){},disconnect(){},start(){window.deviceCalls.notes++;},stop(){},onended:null};}
  createGain(){return {gain:{setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}},connect(){},disconnect(){}};}
 }
 Object.defineProperty(window,'AudioContext',{value:TestAudio,configurable:true});
 Object.defineProperty(navigator,'wakeLock',{configurable:true,value:{async request(){window.deviceCalls.wakeRequests++;throw new Error('Must not request wake lock');}}});
 let visibility='visible';Object.defineProperty(document,'visibilityState',{get:()=>visibility,configurable:true});window.setTestVisibility=v=>{visibility=v;document.dispatchEvent(new Event('visibilitychange'));};
});
const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));

async function management(name){const control=page.locator('.management-menu');if(!await control.evaluate(e=>e.open))await control.locator('summary').click();await page.getByRole('button',{name,exact:true}).click();}
async function tableActions(){const control=page.locator('.table-operations');if(!await control.evaluate(e=>e.open))await control.locator('summary').click();}
await page.goto(process.env.POS_TEST_URL||'http://localhost:5196');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('test@example.com');await page.getByLabel('Mật khẩu',{exact:true}).fill('fake-test-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
await page.getByRole('button',{name:/^Bếp \(/}).click();
const cooking=page.locator('.kitchen-card').filter({has:page.getByRole('heading',{name:'Bàn 1',exact:true})});
await cooking.locator('.kitchen-order-staff').waitFor();assert.equal(await cooking.locator('.kitchen-order-staff').innerText(),'Admin');
assert.equal(await cooking.getByText(/Người order/).count(),0);assert.equal(await cooking.getByText(/payment-test-user/).count(),0);
const style=await cooking.locator('.kitchen-order-staff').evaluate(e=>{const s=getComputedStyle(e);return {color:s.color,weight:s.fontWeight,align:s.textAlign};});assert.deepEqual(style,{color:'rgb(180, 35, 24)',weight:'700',align:'right'});
await page.screenshot({path:'/tmp/kitchen-staff-cooking.png'});
await page.getByRole('button',{name:'Lịch sử',exact:true}).click();
const history=page.locator('.kitchen-card').filter({has:page.getByRole('heading',{name:'Bàn 2',exact:true})});await history.locator('.kitchen-order-staff').waitFor();assert.equal(await history.locator('.kitchen-order-staff').innerText(),'Lan');
assert.ok(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);await page.screenshot({path:'/tmp/kitchen-staff-history.png'});
console.log('PASS kitchen author UI: name only, red/bold/right aligned, current/history, mobile layout, no UID or prefix');await context.close();
}finally{await browser.close();}
