import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mockAccess,mockLegacyMenuGroups} from './support/access.mjs';
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
try{
 const context=await browser.newContext({viewport:{width:390,height:844}});
 let completed=false,mode='lost',calls=[],cancelMode='released',cancellations=[];
 await context.route('https://uiwzinyckukaqlbznnam.supabase.co/**',async route=>{if(await mockLegacyMenuGroups(route))return;
  const path=new URL(route.request().url()).pathname;let body;
  if(path==='/auth/v1/token')body={access_token:'mock-owner',refresh_token:'mock-refresh',token_type:'bearer',expires_in:3600,user:{id:'owner',email:'owner@example.test',aud:'authenticated',role:'authenticated'}};
  else if(path==='/auth/v1/user')body={id:'owner',email:'owner@example.test'};
  else if(path.endsWith('/get_my_access'))body=mockAccess({name:'Owner thử nghiệm',role:'chu',is_active:true});
  else if(path.endsWith('/list_employees'))body={items:[],total:0,page:1,page_size:20};
  else if(path.endsWith('/cancel_employee_creation')){
   cancellations.push(route.request().postDataJSON());
   if(cancelMode==='error')return route.fulfill({status:503,json:{message:'Unavailable'}});
   body=cancelMode==='completed'?{completed:true,user_id:'existing-staff'}:{released:true};
  }else if(path==='/functions/v1/staff-admin'){
   const input=route.request().postDataJSON();calls.push(input);
   if(input.action==='create_employee'){
    assert.ok(['phuc_vu','bep'].includes(input.role));assert.ok(input.password.length>=6&&input.password.length<=12);
    if(mode==='reject')return route.fulfill({status:409,json:{error:'Email đã tồn tại.',released:true}});
    if(mode==='success')return route.fulfill({json:{ok:true,user_id:'new-staff'}});
    completed=true;
    return route.fulfill({status:503,json:{error:'Chưa xác nhận kết quả.',pending:true}});
   }
   assert.equal(input.action,'check_creation');assert.ok(!('password' in input));assert.equal(completed,true);body={ok:true,user_id:'new-kitchen'};
  }else if(['/rest/v1/menu_items','/rest/v1/orders','/rest/v1/table_sessions','/rest/v1/restaurant_tables'].includes(path))body=[];
  else throw new Error('Unexpected '+path);
  await route.fulfill({json:body});
 });
 const page=await context.newPage();page.setDefaultTimeout(10000);
 await page.goto(process.env.POS_TEST_URL||'http://localhost:5173');await page.getByLabel('Tên đăng nhập',{exact:true}).fill('owner@example.test');await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-password');await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
 async function employees(){await page.locator('.management-menu summary').click();await page.getByRole('button',{name:'Quản lý nhân viên',exact:true}).click();await page.getByRole('heading',{name:'Quản lý nhân viên',exact:true}).waitFor();}
 await employees();await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();
 const create=page.locator('.employee-create');
 await create.getByLabel('Tên nhân viên',{exact:true}).fill('Bo');
 await create.getByLabel('Tên đăng nhập',{exact:true}).fill('bo');
 await create.getByLabel('Mật khẩu tạm',{exact:true}).fill('Temp123!');
 assert.equal(await create.getByLabel('Tên đăng nhập',{exact:true}).evaluate(input=>input.checkValidity()),false);
 await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
 assert.equal(calls.length,0);assert.equal(await page.evaluate(()=>localStorage.getItem('pos:employee-create:owner')),null);
 assert.equal(await create.getByLabel('Tên nhân viên',{exact:true}).isEnabled(),true);
 await page.locator('.employee-create').getByLabel('Tên nhân viên',{exact:true}).fill('Bếp mới');await page.locator('.employee-create').getByLabel('Tên đăng nhập',{exact:true}).fill('nv-k02');await page.locator('.employee-create').getByLabel('Vai trò nhân viên',{exact:true}).selectOption('bep');
 assert.equal(await page.locator('.employee-create').getByLabel('Vai trò nhân viên').locator('option').count(),2);
 await page.locator('.employee-create').getByLabel('Mật khẩu tạm',{exact:true}).fill('Temp123!');await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
 await page.getByText('Chưa xác nhận kết quả.',{exact:true}).waitFor();assert.equal(await page.locator('.employee-create').getByLabel('Mật khẩu tạm',{exact:true}).inputValue(),'');
 const storage=await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}));assert.ok(!storage.includes('Temp123!'));
 assert.equal(await page.locator('.employee-create').getByLabel('Tên nhân viên',{exact:true}).isDisabled(),true);
 await page.reload();await employees();await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();await page.getByText(/Đã tạo nhân viên\. Cấp tên đăng nhập/).waitFor();
 assert.equal(calls.length,2);assert.equal(calls[0].role,'bep');assert.equal(calls[0].request_id,calls[1].request_id);assert.equal(calls[0].username,'nv-k02');
 assert.equal(await page.evaluate(()=>localStorage.getItem('pos:employee-create:owner')),null);
 mode='reject';await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).click();await page.locator('.employee-create').getByLabel('Tên nhân viên',{exact:true}).fill('Bếp khác');await page.locator('.employee-create').getByLabel('Tên đăng nhập',{exact:true}).fill('NV03');await page.locator('.employee-create').getByLabel('Mật khẩu tạm',{exact:true}).fill('Temp456!');await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();await page.getByText('Email đã tồn tại.',{exact:true}).waitFor();assert.equal(await page.locator('.employee-create').getByLabel('Tên nhân viên',{exact:true}).isDisabled(),false);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'/workspace/artifacts/employee-create-mobile.png'});
 // Recover the exact old stuck form: invalid two-character username and no password.
 const stuck={request_id:'90000000-0000-0000-0000-000000000009',name:'Bo',username:'bo',role:'phuc_vu'};
 await page.evaluate(input=>localStorage.setItem('pos:employee-create:owner',JSON.stringify(input)),stuck);
 await page.reload();await employees();
 const before=calls.length;
 await page.getByRole('button',{name:'Kiểm tra lại',exact:true}).click();
 await page.getByText(/Bấm Hủy yêu cầu để sửa lại thông tin/).waitFor();assert.equal(calls.length,before);
 cancelMode='error';await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).click();
 await page.getByText(/Chưa xác nhận hủy yêu cầu/).waitFor();
 assert.equal(await create.getByLabel('Tên nhân viên',{exact:true}).isDisabled(),true);
 assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('pos:employee-create:owner'))).request_id,stuck.request_id);
 cancelMode='released';await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).click();
 await page.getByText('Đã hủy yêu cầu. Bạn có thể sửa thông tin và tạo lại.',{exact:true}).waitFor();
 assert.equal(await create.getByLabel('Tên nhân viên',{exact:true}).isEnabled(),true);
 assert.equal(await create.getByLabel('Tên nhân viên',{exact:true}).inputValue(),'Bo');
 assert.equal(await create.getByLabel('Tên đăng nhập',{exact:true}).inputValue(),'bo');
 assert.equal(await page.evaluate(()=>localStorage.getItem('pos:employee-create:owner')),null);
 assert.deepEqual(cancellations,[{p_request_id:stuck.request_id},{p_request_id:stuck.request_id}]);
 mode='success';await create.getByLabel('Tên đăng nhập',{exact:true}).fill('bo-01');
 assert.equal(await create.getByLabel('Tên đăng nhập',{exact:true}).evaluate(input=>input.checkValidity()),true);
 await create.getByLabel('Mật khẩu tạm',{exact:true}).fill('Temp123!');await page.getByRole('button',{name:'Tạo tài khoản',exact:true}).click();
 await page.getByText(/Đã tạo nhân viên\. Cấp tên đăng nhập/).waitFor();
 assert.equal(calls.at(-1).username,'bo-01');assert.notEqual(calls.at(-1).request_id,stuck.request_id);
 // A cancellation racing with successful account creation must keep that account.
 await page.evaluate(input=>localStorage.setItem('pos:employee-create:owner',JSON.stringify(input)),{...stuck,username:'bo-01'});
 await page.reload();await employees();cancelMode='completed';await page.getByRole('button',{name:'Hủy yêu cầu',exact:true}).click();
 await page.getByText('Đã tạo nhân viên. Tài khoản được giữ nguyên.',{exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>localStorage.getItem('pos:employee-create:owner')),null);
 assert.equal(await page.getByRole('button',{name:'Thêm nhân viên',exact:true}).count(),1);
 console.log('ĐẠT hồi quy: tên ngắn không gửi/lưu yêu cầu; hủy draft cũ không cần tên hợp lệ/mật khẩu; lỗi hủy giữ yêu cầu; hủy thành công mở lại form; tạo lại và giữ tài khoản đã hoàn tất.');
 console.log('ĐẠT UI: Owner tạo Kitchen, chỉ hai vai trò, mất phản hồi/tải lại khôi phục cùng mã không lưu mật khẩu; kiểm tra lại không gửi mật khẩu; lỗi email mở lại form, mobile không tràn. API giả lập.');
}finally{await browser.close();}
