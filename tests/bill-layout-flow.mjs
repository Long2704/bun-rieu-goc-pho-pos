import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 const menu=[{id:'food',name:'Bún riêu',price:58000,category:'bun',is_out:false},{id:'towel',name:'Khăn lạnh',price:3000,category:'do_uong',is_out:false},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false}];
 const line=(id,product,extra={})=>({...product,id,menu_item_id:product.id,qty:1,note:id==='food-a'?'Ít bún':'',bill_no:1,paid:false,cancelled_at:null,...extra});
 const items=[line('food-a',menu[0]),line('food-b',menu[0]),line('towel-line',menu[1]),line('drink-line',menu[2]),line('paid',menu[0],{paid:true}),line('cancelled',menu[0],{cancelled_at:'2026-11-09'})];
 const order={id:'order',request_id:'order',session_id:'session',status:'cooking',kitchen_relevant:true,created_at:'2026-11-09T01:00:00Z',order_items:items};
 const applied=new Map(),moves=[],payments=[],receipts=[];let lose=true,failSync=false,syncOnNext=false;
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
  if(await mockLegacyMenuGroups(route))return;
  const req=route.request(),path=new URL(req.url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'refresh',token_type:'bearer',expires_in:3600,user:{id:'staff',email:'owner@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'staff',email:'owner@example.test'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Chủ quán',role:'chu'});
  else if(path==='/rest/v1/menu_items')body=menu;
  else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
  else if(path==='/rest/v1/table_sessions'){if(failSync)return route.fulfill({status:503,json:{message:'Sync failed'}});body=[{id:'session',table_id:1,orders:[order]}];}
  else if(path==='/rest/v1/orders')body=[{...order,table_sessions:{table_id:1,closed_at:null}}];
  else if(path.endsWith('/move_bill_items')){
   const p=req.postDataJSON();moves.push(p);let target=applied.get(p.p_request_id);
   if(target===undefined){target=p.p_to_bill||Math.max(...items.map(i=>i.bill_no))+1;for(const id of p.p_item_ids){const i=items.find(i=>i.id===id);assert.ok(i&&!i.paid&&!i.cancelled_at);assert.equal(i.bill_no,p.p_from_bill);i.bill_no=target;}applied.set(p.p_request_id,target);if(syncOnNext){syncOnNext=false;failSync=true;}}
   else failSync=false;
   if(lose){lose=false;return route.fulfill({status:503,json:{message:'Lost ACK'}});}body=target;
  }else if(path.endsWith('/pay_bill')){
   const p=req.postDataJSON();payments.push(p);const selected=items.filter(i=>!i.paid&&!i.cancelled_at&&i.bill_no===p.p_bill_no);assert.equal(p.p_bill_no,2);assert.equal(selected.length,3);assert.deepEqual([...p.p_expected_item_ids].sort(),selected.map(i=>i.id).sort());selected.forEach(i=>i.paid=true);
   const receipt={id:'receipt',invoice_no:1,table_no:1,bill_no:2,gross:64000,discount:0,total:64000,method:'cash',cash_received:64000,change_due:0,paid_at:'2026-11-09T01:00:00Z',bill_items:structuredClone(selected)};receipts.push(receipt);body='receipt';
  }else if(path==='/rest/v1/bills')body=receipts[0];
  else throw Error('Unexpected API '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.POS_TEST_URL??'http://localhost:5194');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();
 const bill=n=>page.locator(`.pos-order-lines [data-bill-no="${n}"]`),total=page.locator('.pos-total-line');
 async function startMove(){await page.getByRole('button',{name:'Thao tác bàn',exact:true}).click();await page.getByRole('button',{name:'Tách/gộp bill Bàn 1',exact:true}).click();}
 async function closeActions(){await page.getByRole('button',{name:'Đóng thao tác bàn',exact:true}).click();}
 const confirm=page.getByRole('button',{name:'Xác nhận tách/gộp bill',exact:true});
 await startMove();await page.getByRole('checkbox',{name:/1 × Bún riêu.*Ít bún/}).check();await page.getByRole('checkbox',{name:/Trà đá/}).check();assert.match(await page.getByLabel('Dự kiến sau tách gộp').innerText(),/61\.000đ/);await confirm.click();await page.getByRole('button',{name:'Thử lại cùng mã tách/gộp',exact:true}).click();await page.locator('.pos-toast').filter({hasText:'sang Bill 2'}).waitFor();assert.equal(moves[0].p_request_id,moves[1].p_request_id);await closeActions();
 assert.equal(await page.locator('.pos-bill-group').count(),2);for(const n of [1,2]){assert.match(await bill(n).locator('.pos-bill-heading').innerText(),/61\.000đ/);assert.equal(await bill(n).locator('.pos-saved-line[data-product-id="food"]').count(),1);}assert.match(await total.innerText(),/122\.000đ/);
 await bill(2).getByRole('button',{name:'Thanh toán Bill 2',exact:true}).click();const payment=page.getByRole('dialog',{name:'Thanh toán Bàn 1',exact:true});await payment.waitFor();assert.match(await payment.locator('.payment-header').innerText(),/Bill 2/);assert.match(await payment.locator('.payment-items').innerText(),/Trà đá/);assert.doesNotMatch(await payment.locator('.payment-items').innerText(),/Khăn lạnh/);assert.equal(payments.length,0);await payment.getByRole('button',{name:'Đóng',exact:true}).click();
 await bill(2).getByRole('button',{name:'Gọi thêm Bún riêu vào Bill 1',exact:true}).click();assert.equal(await bill(1).locator('.pos-saved-line[data-product-id="food"] output').innerText(),'2');assert.match(await bill(2).locator('.pos-bill-heading').innerText(),/61\.000đ/);assert.match(await bill(1).locator('.pos-bill-heading').innerText(),/119\.000đ/);assert.match(await total.innerText(),/180\.000đ/);assert.equal(await bill(2).getByRole('button',{name:'Thanh toán Bill 2',exact:true}).isDisabled(),true);await bill(1).getByRole('button',{name:'Bớt Bún riêu',exact:true}).click();assert.match(await total.innerText(),/122\.000đ/);
 syncOnNext=true;await startMove();await page.getByRole('checkbox',{name:/Khăn lạnh/}).check();await confirm.click();await page.getByRole('button',{name:'Thử lại cùng mã tách/gộp',exact:true}).waitFor();await page.getByRole('button',{name:'Thử lại cùng mã tách/gộp',exact:true}).click();await page.locator('.pos-toast').filter({hasText:'sang Bill 3'}).waitFor();assert.equal(moves[2].p_request_id,moves[3].p_request_id);await closeActions();assert.equal(await page.locator('.pos-bill-group').count(),3);assert.match(await bill(3).innerText(),/Khăn lạnh/);
 await page.screenshot({path:'/workspace/artifacts/three-bills-order-390.png'});
 await startMove();await page.getByLabel('Bill nguồn',{exact:true}).selectOption('3');await page.getByRole('button',{name:'Chọn tất cả dòng',exact:true}).click();await page.getByLabel('Chuyển sang',{exact:true}).selectOption('2');assert.match(await page.getByLabel('Dự kiến sau tách gộp').innerText(),/64\.000đ/);await page.screenshot({path:'/workspace/artifacts/bill-merge-preview-390.png'});await confirm.click();await page.locator('.pos-toast').filter({hasText:'từ Bill 3 sang Bill 2'}).waitFor();await closeActions();assert.equal(await bill(3).count(),0);assert.match(await bill(2).locator('.pos-bill-heading').innerText(),/64\.000đ/);assert.match(await total.innerText(),/122\.000đ/);
 await bill(2).getByRole('button',{name:'Thanh toán Bill 2',exact:true}).click();await payment.getByRole('button',{name:'Xác nhận thu tiền mặt',exact:true}).click();await payment.waitFor({state:'hidden'});assert.equal(payments.length,1);assert.match(await total.innerText(),/58\.000đ/);assert.equal(await bill(2).count(),0);assert.equal(order.status,'cooking');assert.equal(applied.size,3);
 items.find(i=>i.id==='food-b').bill_no=3;await page.getByRole('button',{name:'Quay lại danh sách bàn',exact:true}).click();await page.getByRole('button',{name:'Đồng bộ',exact:true}).click();await page.getByRole('button',{name:/^Bàn 1 /}).click();await bill(3).getByRole('button',{name:'Thêm Bún riêu',exact:true}).click();assert.match(await bill(3).locator('.pos-bill-heading').innerText(),/116\.000đ/);assert.match(await total.innerText(),/116\.000đ/);await bill(3).getByRole('button',{name:'Bớt Bún riêu',exact:true}).click();
 for(const width of [375,390,414,1440]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}assert.deepEqual(errors,[]);await context.close();console.log('PASS split/merge layout: duplicate products separated per bill, section totals, payment opens exact bill, add-on counted once on smallest open bill, lost ACK and sync retries same ID, three bills and merge preview, pay one bill leaves others and kitchen intact, mobile/desktop. Mock API.');
}finally{await browser.close();}
