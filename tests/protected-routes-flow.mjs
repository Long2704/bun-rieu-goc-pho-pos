import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {mockAccess, mockLegacyMenuGroups} from './support/access.mjs';

const project = 'https://uiwzinyckukaqlbznnam.supabase.co';
const base = 'http://localhost:5173';
const browser = await chromium.launch({executablePath:'/usr/bin/chromium', headless:true, args:['--no-sandbox']});

async function setup(role, {mustChangePassword=false}={}) {
 const context = await browser.newContext({serviceWorkers:'block'});
 const user = {id:role, email:'employee@example.test', aud:'authenticated', role:'authenticated'};
 const accessToken = [
  {alg:'HS256',typ:'JWT'},
  {sub:role,exp:Math.floor(Date.now()/1000)+3600},
  'mock',
 ].map(value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url')).join('.');
 const calls = [];
 await context.route(project+'/**',async route=>{
  const path = new URL(route.request().url()).pathname;
  calls.push(path);
  if(await mockLegacyMenuGroups(route))return;
  if(path==='/functions/v1/staff-login'){
   return route.fulfill({json:{access_token:accessToken,refresh_token:'mock-refresh'}});
  }
  if(path==='/auth/v1/user')return route.fulfill({json:user});
  if(path==='/auth/v1/logout')return route.fulfill({status:204});
  if(path.endsWith('/get_my_access')){
   return route.fulfill({json:{...mockAccess({name:'Employee',role}),must_change_password:mustChangePassword}});
  }
  if(path.endsWith('/list_employees')){
   return route.fulfill({json:{items:[],total:0,page:1,page_size:20}});
  }
  return route.fulfill({json:[]});
 });
 const page = await context.newPage();
 page.setDefaultTimeout(10000);
 return {context,page,calls};
}

async function login(page) {
 await page.getByLabel('Tên đăng nhập',{exact:true}).fill('employee');
 await page.getByLabel('Mật khẩu',{exact:true}).fill('mock-password');
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();
}

try {
 const owner = await setup('chu');
 await owner.page.goto(base+'/employees');
 await owner.page.getByRole('heading',{name:'Đăng nhập nhân viên'}).waitFor();
 assert.equal(owner.calls.some(path=>path.startsWith('/rest/')),false);
 await login(owner.page);
 const employees = owner.page.getByRole('heading',{name:'Quản lý nhân viên',exact:true,level:1});
 await employees.waitFor();
 await owner.page.reload();
 await employees.waitFor();
 await owner.page.getByRole('button',{name:'Phục vụ',exact:true}).click();
 await owner.page.waitForURL(base+'/service');
 await owner.page.goBack();
 await employees.waitFor();
 await owner.page.goForward();
 await owner.page.waitForURL(base+'/service');
 await owner.page.getByRole('button',{name:'Đăng xuất',exact:true}).click();
 await owner.page.getByRole('heading',{name:'Đăng nhập nhân viên'}).waitFor();
 await owner.page.goBack();
 await owner.page.waitForURL(base+'/employees');
 assert.equal(await employees.count(),0);
 await owner.context.close();

 const waiter = await setup('phuc_vu');
 await waiter.page.goto(base+'/employees');
 await login(waiter.page);
 await waiter.page.getByRole('alert').filter({hasText:'Tài khoản không có quyền truy cập trang này.'}).waitFor();
 assert.equal(waiter.calls.some(path=>path.endsWith('/list_employees')),false);
 await waiter.page.getByRole('button',{name:'Phục vụ',exact:true}).click();
 await waiter.page.waitForURL(base+'/service');
 await waiter.context.close();

 const kitchen = await setup('bep');
 await kitchen.page.goto(base+'/invoices');
 await login(kitchen.page);
 await kitchen.page.getByRole('alert').filter({hasText:'Tài khoản không có quyền truy cập trang này.'}).waitFor();
 await kitchen.page.goto(base+'/');
 await kitchen.page.getByRole('heading',{name:'Khu vực bếp',exact:true,level:1}).waitFor();
 await kitchen.context.close();

 const newEmployee = await setup('chu',{mustChangePassword:true});
 await newEmployee.page.goto(base+'/employees');
 await login(newEmployee.page);
 await newEmployee.page.getByLabel('Mật khẩu mới',{exact:true}).waitFor();
 assert.equal(newEmployee.calls.some(path=>path.endsWith('/list_employees')),false);
 await newEmployee.context.close();
 console.log('Protected routes passed with mocked Supabase Auth and employee permissions.');
} finally {
 await browser.close();
}
