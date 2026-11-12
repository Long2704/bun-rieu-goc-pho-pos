import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {mockAccess} from './support/access.mjs';
const sid='00000000-0000-0000-0000-000000000581';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 let sent=false,loseFirst=true;const changes=[],requests=new Map(),peers=[],errors=[];
 const items=[{id:'eat',name:'Bún riêu',menu_item_id:'food',price:58000,qty:1,category:'bun',note:'Ít bún',bill_no:1,paid:false,is_takeaway:false,takeaway_version:0},{id:'go',name:'Bún riêu',menu_item_id:'food',price:58000,qty:1,category:'bun',note:'Không hành',bill_no:1,paid:false,is_takeaway:false,takeaway_version:0}];
 items.push({...items[0],id:'cancel-before-send',note:'Hủy trước gửi',cancelled_at:'2026-11-12T01:59:00Z',cancelled_before_kitchen:true});
 const order=()=>({id:'o',request_id:'r',session_id:sid,created_at:'2026-11-12T02:00:00Z',is_draft:!sent,status:'cooking',kitchen_relevant:sent,order_items:items});
 const sessions=()=>[{id:sid,table_id:5,orders:[order()]}],kitchen=()=>sent?[{...order(),table_sessions:{table_id:5,closed_at:null}}]:[];
 const notify=()=>peers.forEach(({socket,joins})=>{const j=joins.get('realtime:pos:orders');if(j)socket.send(JSON.stringify([j[0],null,j[2],'broadcast',{event:'invalidate',payload:{version:2,session_id:sid},type:'broadcast'}]));});
 async function context(role){
  const c=await browser.newContext({viewport:{width:414,height:896}});
  await c.routeWebSocket('**/realtime/v1/websocket**',socket=>{const joins=new Map();peers.push({socket,joins});socket.onMessage(raw=>{const m=JSON.parse(String(raw));if(m[3]==='phx_join')joins.set(m[2],m);if(m[3]==='phx_join'||m[3]==='heartbeat')socket.send(JSON.stringify([m[0],m[1],m[2],'phx_reply',{status:'ok',response:{}}]));});});
  await c.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   const request=route.request(),path=new URL(request.url()).pathname;let body;
   if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',expires_in:3600,token_type:'bearer',user:{id:role,email:role+'@example.test',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')body={id:role,email:role+'@example.test'};
   else if(path.endsWith('/get_my_access'))body={...mockAccess({name:role,role}),saved_menu_selections:true,linked_tables:true};
   else if(path==='/rest/v1/menu_items')body=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false}];
   else if(path==='/rest/v1/restaurant_tables')body=[{id:5,name:'Bàn 5',service_type:'dine_in'}];
   else if(path.endsWith('/menu_group_catalog'))body={groups:[{id:'bun',name:'Món chính',category:'bun',sort:0},{id:'an_them',name:'Món thêm',category:'an_them',sort:1},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:2}],assignments:{},non_kitchen_checkout:true};
   else if(path.endsWith('/get_linked_table_snapshot'))body={sessions:sessions(),links:[]};
   else if(path==='/rest/v1/orders')body=kitchen();
   else if(path.endsWith('/get_pos_sync_delta'))body={session_ids:request.postDataJSON().p_session_ids,sessions:sessions(),links:[],kitchen:kitchen()};
   else if(path.endsWith('/set_order_item_takeaway')){
    const p=request.postDataJSON();changes.push(p);if(requests.has(p.p_request_id)){assert.deepEqual(requests.get(p.p_request_id).payload,p);body=requests.get(p.p_request_id).result;}
    else{const i=items.find(i=>i.id===p.p_item_id);assert.equal(i.takeaway_version,p.p_expected_version);assert.equal(i.is_takeaway,p.p_expected_takeaway);i.is_takeaway=p.p_takeaway;i.takeaway_version++;body={ok:true,item_id:i.id,is_takeaway:i.is_takeaway,version:i.takeaway_version};requests.set(p.p_request_id,{payload:p,result:body});if(loseFirst){loseFirst=false;return route.abort('failed');}notify();}
   }
   else if(path.endsWith('/send_saved_menu_selections')){sent=true;body='o';notify();}
   else throw Error('Unexpected mocked API '+path);
   await route.fulfill({json:body});
  });
  const p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.POS_TEST_URL||'http://localhost:5196');await p.getByLabel('Tên đăng nhập',{exact:true}).fill(role+'@example.test');await p.getByLabel('Mật khẩu',{exact:true}).fill('mock');await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();return {c,p};
 }
 const {p:a}=await context('chu');await a.locator('.table-card').click();const rows=a.locator('.pos-saved-selection');await rows.nth(1).getByRole('button',{name:'Đánh dấu Mang về Bún riêu',exact:true}).click();await rows.nth(1).getByRole('button',{name:'Đánh dấu Mang về Bún riêu',exact:true}).filter({hasText:'Thử lại'}).waitFor();
 await rows.nth(1).getByRole('button',{name:'Đánh dấu Mang về Bún riêu',exact:true}).click();await rows.nth(1).getByRole('button',{name:'Bỏ dấu Mang về Bún riêu',exact:true}).waitFor();assert.deepEqual(changes[0],changes[1]);assert.equal(items[1].takeaway_version,1);
 mkdirSync('/workspace/artifacts/item-takeaway',{recursive:true});await a.screenshot({path:'/workspace/artifacts/item-takeaway/service-mobile.png'});
 const {p:b}=await context('bep');await a.getByRole('button',{name:'Gửi bếp',exact:true}).click();await b.locator('.kitchen-card .kitchen-service-section.is-takeaway').waitFor();assert.equal(await b.locator('.kitchen-card').count(),1);assert.ok(!(await b.locator('.kitchen-card').innerText()).includes('Hủy trước gửi'));await b.getByRole('heading',{name:'Bàn 5 (Mang về)',exact:true}).waitFor();assert.ok((await b.locator('.kitchen-service-section.is-takeaway').innerText()).includes('Không hành'));assert.ok(!(await b.locator('.kitchen-service-section.is-takeaway').innerText()).includes('Ít bún'));await b.screenshot({path:'/workspace/artifacts/item-takeaway/kitchen-mobile.png'});
 // Change an already-sent dine-in row; the remote kitchen becomes all takeaway.
 if(await a.locator('.table-card').count())await a.locator('.table-card').click();await a.getByRole('button',{name:'Đánh dấu Mang về Bún riêu',exact:true}).click();await b.locator('.kitchen-card h2').filter({hasText:'Bàn 5 (Mang về)'}).waitFor();assert.equal(await b.locator('.kitchen-service-section').count(),0);assert.equal(await b.locator('.kitchen-card').count(),1);assert.equal(items.filter(i=>!i.cancelled_at).reduce((s,i)=>s+i.qty*i.price,0),116000);assert.deepEqual(items.filter(i=>!i.cancelled_at).map(i=>i.note),['Ít bún','Không hành']);
 assert.deepEqual(errors,[]);console.log('PASS item takeaway browser: compact selected chip, exact same-request recovery after lost response, same dish separate lines, one mixed kitchen ticket with correctly scoped takeaway heading/notes, remote Realtime updates to all-takeaway title, no duplicate ticket or changes to money/notes. All APIs and WebSockets mocked.');
}finally{await browser.close();}
