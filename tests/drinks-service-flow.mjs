import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';

const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:320,height:844},hasTouch:true,isMobile:true});
 let socket,ordersJoin;
 await context.routeWebSocket('**/realtime/v1/websocket**',connection=>{
  socket=connection;
  connection.onMessage(raw=>{
   const [joinRef,ref,topic,event]=JSON.parse(String(raw));
   if(event==='phx_join'&&topic==='realtime:pos:orders')ordersJoin=joinRef;
   if(event==='phx_join'||event==='heartbeat'){
    connection.send(JSON.stringify([joinRef,ref,topic,'phx_reply',{status:'ok',response:{}}]));
   }
  });
 });
 const food={id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false};
 const drink={id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false};
 const items=[{...food,id:'meal',qty:1,note:'',paid:false,bill_no:1},{...drink,id:'tea',qty:2,note:'Ít đá',paid:false,bill_no:1}];
 const order={id:'order',request_id:'request',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-11-19T04:00:00Z',order_items:items};
 const ticket={id:order.id,queued_at:order.created_at,done_at:null,place:'Bàn 5',ordered_by_name:'Lan',
  items:[{id:'tea',name:'Trà đá',qty:2,target_qty:2,note:'Ít đá',is_takeaway:true}]};
 let role='phuc_vu',completed=false,fail=true,drinksSaved=false;
 const requests=[];
 let reads=0;
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;
  let data;
  if(path==='/auth/v1/token')data={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')data={id:'staff'};
  else if(path.endsWith('/get_my_access'))data=mockAccess({name:'Lan',role});
  else if(path==='/rest/v1/menu_items')data=[food,drink];
  else if(path==='/rest/v1/restaurant_tables')data=[{id:5,name:'Bàn 5'}];
  else if(path==='/rest/v1/table_sessions')data=[{id:'session',table_id:5,orders:[order]}];
  else if(path==='/rest/v1/orders')data=[{...order,table_sessions:{table_id:5,closed_at:null}}];
  else if(path.endsWith('/list_drink_tickets')){
   reads++;
   const history=req.postDataJSON().p_history;
   data=drinksSaved&&completed===history?[{...ticket,done_at:completed?'2026-11-19T04:03:00Z':null}]:[];
  }else if(path.endsWith('/complete_drink_ticket')){
   requests.push(req.postDataJSON());
   if(fail){fail=false;return route.fulfill({status:400,json:{message:'Simulated failure'}});}
   completed=true;
   data=null;
  }else throw Error('Unexpected API '+path);
  await route.fulfill({json:data});
 });
 const page=await context.newPage();
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 page.setDefaultTimeout(8000);
 await page.goto(process.env.POS_TEST_URL??'http://localhost:5218');
 await page.getByLabel('Tên đăng nhập',{exact:true}).fill('waiter@example.test');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-password');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();

 const drinksTab=page.getByRole('button',{name:/^Nước \([0-9]+\)$/});
 const panel=page.locator('.drinks-page');
 const card=panel.locator('.kitchen-card');
 await drinksTab.waitFor();
 assert.equal(await drinksTab.innerText(),'Nước (0)');
 await page.waitForFunction(()=>document.querySelector('.drinks-nav')?.textContent==='Nước (0)');
 assert.equal(await panel.count(),0);
 const previousReads=reads;
 assert.ok(ordersJoin);
 drinksSaved=true;
 socket.send(JSON.stringify([ordersJoin,null,'realtime:pos:orders','broadcast',{
  type:'broadcast',event:'invalidate',payload:{version:1}
 }]));
 // A notification from another station changes the badge without opening Nước.
 await page.getByRole('button',{name:'Nước (1)',exact:true}).waitFor({timeout:2000});
 assert.ok(reads>previousReads);
 await drinksTab.click();
 await card.getByText('2 × Trà đá').waitFor();
 await panel.getByRole('button',{name:'Đang làm (1)',exact:true}).waitFor();
 await card.getByRole('heading',{name:'Bàn 5 (Mang về)',exact:true}).waitFor();
 assert.equal(await card.getByText('2 × Trà đá').count(),1);
 assert.equal(await card.getByText('Ít đá').count(),1);
 assert.equal(await card.getByText('Lan',{exact:true}).count(),1);
 assert.equal(await card.getByText('Bún riêu',{exact:false}).count(),0);
 assert.equal(await panel.getByRole('button',{name:/chuông|thông báo|tải ảnh/i}).count(),0);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);

 const cdp=await context.newCDPSession(page);
 async function swipe(direction){
  const box=await card.getByText('2 × Trà đá').boundingBox();
  const x=box.x+box.width/2,y=box.y+box.height/2;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
  for(let step=1;step<=8;step++){
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+direction*120*step/8,y,id:1}]});
  }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 await swipe(1);
 await panel.getByRole('alert').filter({hasText:'Chưa xác nhận hoàn thành'}).waitFor();
 await panel.locator('.swipe-order[aria-busy=false]:not(.is-restoring)').waitFor();
 await card.getByText('2 × Trà đá').waitFor();
 await swipe(-1);
 await panel.getByText('Chưa có món nước đang làm.').waitFor();
 await page.getByRole('button',{name:'Nước (0)',exact:true}).waitFor();
 const expected={p_order_id:ticket.id,p_items:[{id:'tea',qty:2}]};
 assert.deepEqual(requests,[expected,expected]);
 await panel.getByRole('button',{name:'Lịch sử',exact:true}).click();
 await card.getByText('2 × Trà đá').waitFor();
 assert.equal(await drinksTab.innerText(),'Nước (0)');
 assert.equal(await panel.locator('.can-swipe').count(),0);
 await page.getByRole('button',{name:/^Bếp \(/}).click();
 await page.locator('.kitchen-page').getByText('1 × Bún riêu').waitFor();
 assert.equal(await page.locator('.kitchen-page .kitchen-card').getByText('Trà đá',{exact:false}).count(),0);

 role='bep';
 await page.reload();
 await page.getByRole('heading',{name:'Khu vực bếp'}).waitFor();
 assert.equal(await drinksTab.count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS Mobile drink tab, drink-only display, touch completion and retry, history, kitchen isolation and waiter access');
}finally{await browser.close();}
