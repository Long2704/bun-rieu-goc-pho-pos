import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockAccess} from './support/access.mjs';

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const scenario of ['only-other','lose-ack','mixed']){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const menu=[{id:'tea',name:'Trà đá',price:3000,category:'do_uong',is_out:false},{id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false}];
  const groups=['bun','an_them','do_uong','other'].map((id,i)=>({id,name:['Món chính','Món thêm','Đồ uống','Khác'][i],category:id==='other'?'do_uong':id,sort:i}));
  const sid='10000000-0000-0000-0000-000000000001',oid='10000000-0000-0000-0000-000000000002';
  const orders=[],saves=[],notifications=[];
  let lose=scenario==='lose-ack';
  const snapshot=()=>({session_ids:[sid],sessions:orders.length?[{id:sid,table_id:1,orders}]:[],links:[],kitchen:[]});
  await context.routeWebSocket('**/realtime/v1/websocket**',ws=>ws.onMessage(()=>{}));
  await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname,args=req.postDataJSON();
   let data;
   if(path==='/auth/v1/token')data={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')data={id:'staff'};
   else if(path.endsWith('/get_my_access'))data={...mockAccess({name:'Lan',role:'phuc_vu'}),saved_menu_selections:scenario!=='mixed'};
   else if(path.endsWith('/menu_group_catalog'))data={groups,assignments:{towel:'other'}};
   else if(path==='/rest/v1/menu_items')data=menu;
   else if(path==='/rest/v1/restaurant_tables')data=[{id:1,name:'Bàn 1'}];
   else if(path==='/rest/v1/table_sessions')data=snapshot().sessions;
   else if(path==='/rest/v1/orders')data=[];
   else if(path.endsWith('/list_drink_tickets'))data=[];
   else if(path.endsWith('/save_menu_selection_snapshot')){
    saves.push(args);
    if(!orders.length)orders.push({id:oid,request_id:args.p_request_id,session_id:sid,status:'done',is_draft:true,kitchen_relevant:false,
     created_at:'2026-11-20T03:00:00Z',order_items:args.p_items.map(({menu_item_id,qty,note})=>({...menu.find(m=>m.id===menu_item_id),id:menu_item_id+'-line',menu_item_id,qty,note,paid:false,bill_no:1}))});
    if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost save response'}});}
    data={order_id:oid,session_id:sid,request_id:args.p_request_id,table_id:1,snapshot:snapshot()};
   }else if(path.endsWith('/notify_service_order')){notifications.push(args);data=oid;}
   else throw Error('Unexpected endpoint '+path);
   await route.fulfill({json:data});
  });
  const page=await context.newPage();
  page.setDefaultTimeout(10000);
  await page.goto(process.env.POS_TEST_URL??'http://localhost:5218');
  await page.getByLabel('Tên đăng nhập',{exact:true}).fill('waiter@example.test');
  await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-password');
  await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  const table=page.locator('.table-card').filter({hasText:'Bàn 1'});
  await table.click();
  await page.getByRole('button',{name:'Khác',exact:true}).waitFor();
  await page.getByRole('button',{name:'Thêm Khăn lạnh',exact:true}).click();
  if(scenario==='mixed'){
   await page.getByRole('button',{name:'Thêm Trà đá',exact:true}).click();
   await page.getByRole('button',{name:/^Xem đơn [0-9]/}).click();
   await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();
   await page.getByRole('dialog',{name:'Thoát đơn hàng'}).getByRole('button',{name:'Không',exact:true}).click();
  }else{
   await page.getByRole('button',{name:'Đóng danh sách món',exact:true}).click();
  }
  if(scenario==='lose-ack'){
   await page.getByRole('button',{name:/^Thử lưu lại/}).click();
   await table.waitFor();
   assert.equal(saves.length,2);
   assert.equal(saves[0].p_request_id,saves[1].p_request_id);
  }
  await table.waitFor();
  assert.equal(orders.length,1);
  assert.deepEqual(saves[0].p_items.map(item=>item.menu_item_id),['towel']);
  assert.equal(notifications.length,0);
  assert.equal(await page.getByRole('button',{name:'Nước (0)',exact:true}).count(),1);
  await table.click();
  if(scenario==='mixed'){
   await page.getByRole('button',{name:'Thông báo',exact:true}).waitFor();
   assert.equal(await page.locator('.pos-draft-row').filter({hasText:'Trà đá'}).count(),1);
  }else{
   assert.equal(await page.getByRole('button',{name:'Thông báo',exact:true}).count(),0);
   await page.getByText('Đã lưu',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Thanh toán',exact:true}).waitFor();
  }
  await context.close();
 }
 console.log('PASS: Khác saves on exit without notification, retries same request, and preserves drink drafts in a mixed order.');
}finally{await browser.close();}
