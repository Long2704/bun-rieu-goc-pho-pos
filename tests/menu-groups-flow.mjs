import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {mockAccess} from './support/access.mjs';
const out=process.env.POS_SCREENSHOT_DIR||'/tmp/menu-groups';mkdirSync(out,{recursive:true});
const groups=[{id:'bun',name:'Món chính',category:'bun',sort:10},{id:'an_them',name:'Món thêm',category:'an_them',sort:20},{id:'do_uong',name:'Đồ uống',category:'do_uong',sort:30}],assignments={};
const menu=[{id:'food',name:'Canh bún truyền thống',price:58000,category:'bun',is_out:false,is_active:true,sort:1,version:1},{id:'drink',name:'Trà đá',price:3000,category:'do_uong',is_out:false,is_active:true,sort:2,version:1}];
const sorts=[],sortApplied=new Set();let lostSort=true;
const creates=[],saves=[],created=new Map(),saved=new Set();let lostCreate=true,lostSave=true;
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 for(const role of ['chu','phuc_vu','bep']){
  const c=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await c.addInitScript(()=>sessionStorage.setItem('goc-pho-install-dismissed','1'));
  await c.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname;let body;
   if(path==='/auth/v1/token')body={access_token:'mock',refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user:{id:role,email:role+'@example.test',aud:'authenticated',role:'authenticated'}};
   else if(path==='/auth/v1/user')body={id:role,email:role+'@example.test'};
   else if(path.endsWith('/get_my_access'))body=mockAccess({name:role,role});
   else if(path==='/rest/v1/menu_items')body=menu;
   else if(path==='/rest/v1/restaurant_tables')body=[{id:1,name:'Bàn 1'}];
   else if(path==='/rest/v1/table_sessions'||path==='/rest/v1/orders'||path==='/rest/v1/kitchen_image_tickets')body=[];
   else if(path.endsWith('/menu_group_catalog'))body={groups,assignments};
   else if(path.endsWith('/list_menu_management'))body=[...menu].sort((a,b)=>a.sort-b.sort||a.id.localeCompare(b.id));
   else if(path.endsWith('/create_menu_group')){
    assert.equal(role,'chu');const p=req.postDataJSON();creates.push(p);
    if(!created.has(p.p_request_id)){
     if(groups.some(g=>g.name.toLocaleLowerCase('vi-VN')===p.p_name.trim().toLocaleLowerCase('vi-VN')))return route.fulfill({status:400,json:{code:'P0001',message:'Tên nhóm món đã tồn tại.'}});
     const id='group-'+groups.length;groups.push({id,name:p.p_name,category:p.p_category,sort:groups.length*10+10});created.set(p.p_request_id,id);
    }
    if(lostCreate){lostCreate=false;return route.fulfill({status:503,json:{message:'Acknowledgement lost'}});}body=created.get(p.p_request_id);
   }
   else if(path.endsWith('/save_menu_item_in_group')){
    assert.equal(role,'chu');const p=req.postDataJSON();saves.push(p);assert.equal(p.p_category,'bun');assert.equal(p.p_group_id,'group-3');
    if(!saved.has(p.p_request_id)){const m=menu.find(m=>m.id===p.p_item_id);assert.equal(p.p_expected_version,m.version);m.version++;assignments[m.id]=p.p_group_id;saved.add(p.p_request_id);}
    if(lostSave){lostSave=false;return route.fulfill({status:503,json:{message:'Acknowledgement lost'}});}body=p.p_item_id;
   }
   else if(path.endsWith('/reorder_menu_items')){
    assert.equal(role,'chu');const p=req.postDataJSON();sorts.push(p);
    if(!sortApplied.has(p.p_request_id)){
     assert.deepEqual(p.p_expected,[...menu].sort((a,b)=>a.sort-b.sort||a.id.localeCompare(b.id)).map(i=>({id:i.id,version:i.version,sort:i.sort})));
     p.p_ordered.forEach((id,sort)=>{const i=menu.find(m=>m.id===id);if(i.sort!==sort){i.sort=sort;i.version++;}});sortApplied.add(p.p_request_id);
    }
    if(lostSort){lostSort=false;return route.fulfill({status:503,json:{message:'Lost reorder acknowledgement'}});}body=null;
   }
   else throw Error('Unexpected API '+path);
   await route.fulfill({json:body});
  });
  const p=await c.newPage();p.setDefaultTimeout(12000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.goto(process.env.POS_TEST_URL||'http://localhost:5173');await p.getByLabel('Tên đăng nhập',{exact:true}).fill(role+'@example.test');await p.getByLabel('Mật khẩu',{exact:true}).fill('fake-password');await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();
  if(role==='chu'){
   await p.locator('.management-menu summary').click();await p.getByRole('button',{name:'Quản lý thực đơn',exact:true}).click();
   assert.equal(await p.locator('.menu-group-panel').count(),0);
   await p.getByRole('button',{name:'Thêm món mới',exact:true}).click();
   await p.getByLabel('Tên món',{exact:true}).fill('Món đang nhập');await p.getByLabel('Giá bán (đồng)',{exact:true}).fill('45000');
   const add=p.getByRole('button',{name:'Thêm nhóm món',exact:true});await p.waitForFunction(()=>{const b=document.querySelector('.menu-group-add');return b&&!b.disabled;});
   await add.click();const dialog=p.getByRole('dialog',{name:'Thêm nhóm món',exact:true});await dialog.waitFor();assert.equal(await dialog.getByLabel('Loại nhóm',{exact:true}).count(),0);
   assert.equal(await dialog.evaluate(d=>d.matches(':modal')),true);await p.locator('.menu-edit-form input').first().evaluate(e=>e.focus());assert.equal(await dialog.evaluate(d=>d.contains(document.activeElement)),true,'background form cannot take focus while popup open');
   await p.keyboard.press('Escape');assert.equal(await dialog.isVisible(),false);assert.equal(await add.evaluate(e=>e===document.activeElement),true);
   assert.equal(await p.getByLabel('Tên món',{exact:true}).inputValue(),'Món đang nhập');await add.click();
   await p.screenshot({path:out+'/group-popup-mobile.png'});
   const name=p.getByLabel('Tên nhóm món',{exact:true}),save=p.getByRole('button',{name:'Xác nhận',exact:true});assert.equal(await save.isDisabled(),true);
   await name.fill('Canh bún');await save.click();await p.getByRole('button',{name:'Thử lại tạo nhóm cùng mã',exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Đăng xuất',exact:true}).isDisabled(),true);
   await p.reload();await p.getByRole('button',{name:'Mở quản lý thực đơn',exact:true}).click();await p.getByRole('button',{name:'Thử lại tạo nhóm cùng mã',exact:true}).click();await p.getByText('Đã thêm nhóm Canh bún.',{exact:true}).waitFor();assert.equal(creates[0].p_request_id,creates[1].p_request_id);assert.equal(groups.filter(g=>g.name==='Canh bún').length,1);
   await p.getByRole('button',{name:'Thêm món mới',exact:true}).click();
   await add.click();await name.fill('CANH BÚN');await save.click();await p.getByText('Tên nhóm món đã tồn tại.',{exact:true}).waitFor();assert.equal(await p.getByRole('button',{name:'Thử lại tạo nhóm cùng mã',exact:true}).count(),0);await p.getByRole('button',{name:'Hủy thêm nhóm',exact:true}).click();await p.getByRole('button',{name:'Đóng cửa sổ sửa món',exact:true}).click();
   await p.getByRole('button',{name:'Sửa Canh bún truyền thống',exact:true}).click();await p.getByLabel('Nhóm món',{exact:true}).selectOption({label:'Canh bún'});await p.getByRole('button',{name:'Lưu thực đơn',exact:true}).click();await p.getByRole('dialog',{name:'Sửa món',exact:true}).getByRole('button',{name:'Thử lại cùng mã cập nhật',exact:true}).waitFor();await p.getByRole('dialog',{name:'Sửa món',exact:true}).getByRole('button',{name:'Thử lại cùng mã cập nhật',exact:true}).click();await p.getByText('Đã lưu thực đơn.',{exact:true}).waitFor();assert.equal(saves[0].p_request_id,saves[1].p_request_id);assert.equal(menu[0].version,2);assert.equal(menu[0].price,58000);
   await p.getByRole('button',{name:'Thêm món mới',exact:true}).click();await p.getByLabel('Tên món',{exact:true}).fill('Món nháp giữ nguyên');await p.getByLabel('Giá bán (đồng)',{exact:true}).fill('45000');
   await add.click();await name.fill('Bún đặc biệt');await p.getByRole('button',{name:'Xác nhận',exact:true}).click();await p.getByText('Đã thêm nhóm Bún đặc biệt.',{exact:true}).waitFor();
   assert.equal(await p.getByLabel('Nhóm món',{exact:true}).inputValue(),'group-4');assert.equal(await p.getByLabel('Tên món',{exact:true}).inputValue(),'Món nháp giữ nguyên');assert.equal(await p.getByLabel('Giá bán (đồng)',{exact:true}).inputValue(),'45000');
   await p.screenshot({path:out+'/group-picker-mobile.png'});
   await p.getByLabel('Nhóm món',{exact:true}).selectOption('do_uong');await add.click();await name.fill('Nước mới');await p.getByRole('button',{name:'Xác nhận',exact:true}).click();await p.getByText('Đã thêm nhóm Nước mới.',{exact:true}).waitFor();assert.equal(groups.find(g=>g.name==='Nước mới').category,'do_uong');assert.equal(await p.getByLabel('Nhóm món',{exact:true}).inputValue(),'group-5');
   await p.getByRole('button',{name:'Đóng chỉnh sửa',exact:true}).click();

   assert.equal(await p.getByLabel('Thứ tự hiển thị',{exact:true}).count(),0);
   await p.getByRole('button',{name:'Di chuyển Trà đá',exact:true}).press('ArrowUp');
   await p.getByRole('button',{name:'Lưu thứ tự món',exact:true}).click();await p.getByRole('button',{name:'Thử lại cùng mã sắp xếp món',exact:true}).waitFor();
   await p.reload();await p.getByRole('button',{name:'Mở quản lý thực đơn',exact:true}).click();await p.getByRole('button',{name:'Thử lại cùng mã sắp xếp món',exact:true}).click();await p.getByText('Đã lưu thứ tự món.',{exact:true}).waitFor();assert.equal(sorts[0].p_request_id,sorts[1].p_request_id);
   assert.deepEqual(await p.locator('.menu-management [data-sort-table] h3').allTextContents(),['Trà đá','Canh bún truyền thống']);
   await p.setViewportSize({width:1440,height:1000});
   await p.locator('.menu-management .sortable-tables').scrollIntoViewIfNeeded();
   const source=await p.getByRole('button',{name:'Di chuyển Canh bún truyền thống',exact:true}).boundingBox(),target=await p.getByRole('button',{name:'Di chuyển Trà đá',exact:true}).boundingBox();
   await p.mouse.move(source.x+source.width/2,source.y+source.height/2);await p.mouse.down();await p.mouse.move(target.x+target.width/2,target.y+target.height/2,{steps:8});await p.mouse.up();
   assert.deepEqual(await p.locator('.menu-management [data-sort-table] h3').allTextContents(),['Canh bún truyền thống','Trà đá']);await p.getByRole('button',{name:'Hủy sắp xếp món',exact:true}).click();
   await p.setViewportSize({width:390,height:844});await p.locator('.menu-management .sortable-tables').scrollIntoViewIfNeeded();
   const a=await p.getByRole('button',{name:'Di chuyển Canh bún truyền thống',exact:true}).boundingBox(),b=await p.getByRole('button',{name:'Di chuyển Trà đá',exact:true}).boundingBox(),cdp=await c.newCDPSession(p);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:a.x+a.width/2,y:a.y+a.height/2}]});
   for(let i=1;i<=6;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:b.x+b.width/2,y:a.y+a.height/2+(b.y-a.y)*i/6}]});await new Promise(r=>setTimeout(r,25));}
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});assert.deepEqual(await p.locator('.menu-management [data-sort-table] h3').allTextContents(),['Canh bún truyền thống','Trà đá']);await p.getByRole('button',{name:'Hủy sắp xếp món',exact:true}).click();
   for(const width of [375,390,768,1440]){await p.setViewportSize({width,height:900});assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
   await p.screenshot({path:out+'/menu-groups-desktop.png'});await p.setViewportSize({width:390,height:844});await p.screenshot({path:out+'/menu-groups-mobile.png',fullPage:true});
  }else assert.equal(await p.getByRole('button',{name:'Thêm nhóm món',exact:true}).count(),0);
  await p.getByRole('button',{name:'Phục vụ',exact:true}).click();await p.getByRole('button',{name:/^Bàn 1 /}).click();await p.getByRole('button',{name:'Canh bún',exact:true}).click();assert.deepEqual(await p.locator('.pos-product-name').allTextContents(),['Canh bún truyền thống']);await p.getByRole('button',{name:'Món chính',exact:true}).click();assert.equal(await p.locator('.pos-product-row').count(),0);await p.getByRole('button',{name:'Đồ uống',exact:true}).click();assert.deepEqual(await p.locator('.pos-product-name').allTextContents(),['Trà đá']);
  assert.deepEqual(errors,[]);await c.close();
 }
 console.log('PASS groups UI: Owner create/assign; duplicate-name validation, durable create/item retry including reload, dynamic tabs/filter shared by 3 roles, main/drink semantics preserved, 375–1440 layout; compact + picker, modal Escape/focus trap, auto-selection and preserved draft; keyboard/mouse/touch item ordering, cancel and reorder retry/reload; no production writes.');
}finally{await browser.close();}
