import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext();
 const sid='00000000-0000-0000-0000-000000000001', other='00000000-0000-0000-0000-000000000002';
 const access={...mockAccess({name:'Lan',role:'thu_ngan'}),linked_tables:true,live_snapshot:true};
 const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false}];
 const tables=[{id:5,name:'Bàn 5',service_type:'dine_in'}];
 const order={id:'food-order',session_id:sid,status:'cooking',kitchen_relevant:true,created_at:'2026-11-19T04:00:00Z',order_items:[],table_sessions:{table_id:5,closed_at:null}};
 const ticket={id:'paid-water-order',queued_at:order.created_at,done_at:null,place:'Bàn 5',ordered_by_name:'Lan',items:[{id:'tea',name:'Trà đá',qty:1,target_qty:1,note:'',is_takeaway:false}]};
 let socket,join,hasWater=false,hasFood=false,listReads=0,fullReads=0,deltaReads=0,invalidDelta=false;
 await context.routeWebSocket('**/realtime/v1/websocket**',ws=>{
  socket=ws;
  ws.onMessage(raw=>{
   const [j,r,t,e]=JSON.parse(String(raw));
   if(e==='phx_join'&&t==='realtime:pos:orders')join=j;
   if(e==='phx_join'||e==='heartbeat')ws.send(JSON.stringify([j,r,t,'phx_reply',{status:'ok',response:{}}]));
  });
 });
 const inject=()=>socket.send(JSON.stringify([join,null,'realtime:pos:orders','broadcast',{type:'broadcast',event:'invalidate',payload:{version:2,session_id:sid}}]));
 const scoped=()=>hasWater?{[sid]:1}:{};
 const snapshot=()=>({sessions:[],links:[],kitchen:hasFood?[order]:[],drink_counts:{[other]:2,...scoped()}});
 const domain=process.env.POS_TEST_SUPABASE_URL||'https://uiwzinyckukaqlbznnam.supabase.co';
 await context.route(domain+'/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),p=new URL(req.url()).pathname;
  let json;
  if(p==='/auth/v1/token')json={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'cashier',aud:'authenticated',role:'authenticated'}};
  else if(p==='/auth/v1/user')json={id:'cashier'};
  else if(p.endsWith('/get_my_access'))json=access;
  else if(p==='/rest/v1/menu_items')json=menu;
  else if(p==='/rest/v1/restaurant_tables')json=tables;
  else if(p.endsWith('/get_pos_live_snapshot')){
   const {p_catalog,p_catalog_only}=req.postDataJSON();
   if(!p_catalog_only)fullReads++;
   json={version:1,access,snapshot:p_catalog_only?null:snapshot(),catalog:p_catalog||p_catalog_only?{menu,tables}:null};
  }else if(p.endsWith('/get_pos_sync_delta')){
   deltaReads++;assert.deepEqual(req.postDataJSON().p_session_ids,[sid]);
   json={session_ids:[sid],sessions:[],links:[],kitchen:hasFood?[order]:[],drink_counts:invalidDelta?{[other]:2}:scoped()};
  }else if(p.endsWith('/list_drink_tickets')){
   listReads++;json=hasWater?[ticket]:[];
  }else if(p==='/rest/v1/kitchen_image_tickets')json=[];
  else throw Error('Unexpected '+p);
  await route.fulfill({json});
 });
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(process.env.POS_TEST_URL||'http://127.0.0.1:5219');
 await page.getByLabel('Tên đăng nhập',{exact:true}).fill('cashier@example.test');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('mock');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 const badge=n=>page.getByRole('button',{name:'Nước ('+n+')',exact:true});
 const kitchen=n=>page.getByRole('button',{name:'Bếp ('+n+')',exact:true});
 await badge(2).waitFor();
 await kitchen(0).waitFor();
 for(let i=0;i<100&&!join;i++)await page.waitForTimeout(25);
 assert.ok(join);await page.waitForTimeout(350);
 const baseline=fullReads, deltas=deltaReads;
 hasWater=true;hasFood=true;inject();
 await badge(3).waitFor({timeout:2500});await kitchen(1).waitFor();
 assert.equal(deltaReads,deltas+1);assert.equal(fullReads,baseline);assert.equal(listReads,0);
 // Closed/paid water disappears only when finished; unaffected sessions remain.
 hasWater=false;inject();
 await badge(2).waitFor({timeout:2500});assert.equal(listReads,0);
 hasWater=true;invalidDelta=true;inject();
 await badge(3).waitFor({timeout:2500});assert.equal(fullReads,baseline+1);assert.equal(listReads,0);
 await badge(3).click();await page.getByText('1 × Trà đá',{exact:true}).waitFor();
 assert.equal(listReads,1);assert.deepEqual(errors,[]);
 console.log('PASS live badge and kitchen share one scoped RPC, retain other sessions, fall back after invalid delta, and only read the detailed queue on entry.');
}finally{await browser.close();}
