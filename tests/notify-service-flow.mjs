import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';

const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const savedSelections of [false,true]){
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const menu=[{id:'tea',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
  const sid='10000000-0000-0000-0000-000000000001',oid='10000000-0000-0000-0000-000000000002';
  let order=null;
  const notifications=[];
  const snapshot=()=>({session_ids:[sid],sessions:order?[{id:sid,table_id:1,orders:[order]}]:[],links:[],kitchen:[]});
  await context.routeWebSocket('**/realtime/v1/websocket**',socket=>socket.onMessage(()=>{}));
  await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   if(await mockLegacyMenuGroups(route))return;
   const req=route.request(),path=new URL(req.url()).pathname;
   const args=req.postDataJSON();
   let data;
   if(path==='/auth/v1/token')data={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')data={id:'staff'};
   else if(path.endsWith('/get_my_access'))data={...mockAccess({name:'Lan',role:'phuc_vu'}),saved_menu_selections:savedSelections};
   else if(path==='/rest/v1/menu_items')data=menu;
   else if(path==='/rest/v1/restaurant_tables')data=[{id:1,name:'Bàn 1'}];
   else if(path==='/rest/v1/table_sessions')data=snapshot().sessions;
   else if(path==='/rest/v1/orders')data=[];
   else if(path.endsWith('/save_menu_selection_snapshot')||path.endsWith('/notify_service_order')){
    const saving=path.endsWith('/save_menu_selection_snapshot');
    if(!saving)notifications.push(args);
    if(!order)order={id:oid,request_id:args.p_request_id,session_id:sid,status:'done',is_draft:saving,kitchen_relevant:false,
     created_at:'2026-11-19T04:00:00Z',order_items:[{...menu[0],id:'tea-line',menu_item_id:'tea',qty:1,note:'',paid:false,bill_no:1}]};
    if(!saving)order.is_draft=false;
    data=saving?{order_id:oid,session_id:sid,request_id:args.p_request_id,table_id:1,snapshot:snapshot()}:oid;
   }else if(path.endsWith('/list_drink_tickets'))data=order&&!order.is_draft&&!args.p_history?
     [{id:oid,place:'Bàn 1',queued_at:order.created_at,ordered_by_name:'Lan',items:[{...order.order_items[0],target_qty:1}]}]:[];
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
  const notify=page.getByRole('button',{name:'Thông báo',exact:true});
  await table.click();
  await page.getByRole('button',{name:'Thêm Trà đá',exact:true}).click();
  await page.getByRole('button',{name:/^Xem đơn [0-9]/}).click();
  await notify.waitFor();
  if(savedSelections)await page.getByText('Chưa thông báo',{exact:true}).waitFor();

  await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();
  const leaving=page.getByRole('dialog',{name:'Thoát đơn hàng'});
  await leaving.getByRole('button',{name:'Không',exact:true}).click();
  await table.waitFor();
  assert.equal(notifications.length,0);
  if(!savedSelections)assert.equal(order,null);
  await page.getByRole('button',{name:/^Nước \([0-9]+\)$/}).click();
  await page.getByText('Chưa có món nước đang làm.').waitFor();

  await page.getByRole('button',{name:'Phục vụ',exact:true}).click();
  await table.click();
  if(!savedSelections)await page.getByRole('button',{name:/^Xem đơn [0-9]/}).click();
  await notify.click();
  await table.waitFor();
  assert.equal(notifications.length,1);
  assert.deepEqual(notifications[0].p_order_ids,savedSelections?[oid]:undefined);
  assert.equal(notifications[0].p_items.length,savedSelections?0:1);
  await page.getByRole('button',{name:'Nước (1)',exact:true}).click();
  await page.locator('.drinks-page').getByText('1 × Trà đá').waitFor();
  await context.close();
 }
 console.log('PASS saved and unsaved water pending, return without auto-save/dispatch, explicit notification and drink ticket');
}finally{await browser.close();}
