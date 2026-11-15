import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {validateCashierDashboard} from '../../src/cashier-dashboard.ts';
export async function checkCashierDashboard(db,owner,cashier,waiter){
 const row=async(q,p=[])=>{await db.exec('savepoint dashboard_check');try{const result=(await db.query(q,p)).rows[0];await db.exec('release savepoint dashboard_check');return result;}catch(e){await db.exec('rollback to savepoint dashboard_check;release savepoint dashboard_check');throw e;}};
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
 await db.exec('reset role');const path=readdirSync(new URL('../../supabase/migrations/',import.meta.url)).find(n=>n.endsWith('_cashier_dashboard_quantities.sql'));
 await db.exec(readFileSync(new URL('../../supabase/migrations/'+path,import.meta.url),'utf8'));
 await db.exec('begin');
 try{
 await db.exec("update auth.users set email=replace(id::text,'-','')||'@pos.test'");
 await db.query("update auth.users set email='cashier@pos.test' where id=$1",[cashier]);
 await db.query("update profiles set role='thu_ngan',is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=$1",[cashier]);
 const day=(await row("select (now() at time zone 'Asia/Ho_Chi_Minh')::date::text d")).d,from=day+'T00:00:00',to=day+'T23:59:59';
 const bands=[['06:00','09:00'],['09:00','11:00'],['11:00','13:00'],['13:00','15:00'],['15:00','17:00'],['17:00','22:00']].map(([start,end])=>({start,end}));
 const report=async(kind='all',table=null,bs=bands,f=from,t=to)=>(await row('select cashier_dashboard_window($1,$2,$3::jsonb,$4,$5) r',[f,t,JSON.stringify(bs),kind,table])).r;
 await as(cashier);const baseline=await report();validateCashierDashboard(baseline,bands);
 await db.exec('reset role');const seed=readFileSync(new URL('../../local/cashier-report-demo.sql',import.meta.url),'utf8').replace(/^begin;\s*$/gm,'').replace(/^commit;\s*$/gm,'');await db.exec(seed);
 await as(cashier);const result=await report();validateCashierDashboard(result,bands);
 assert.equal(result.invoices-baseline.invoices,7);assert.equal(result.visits-baseline.visits,7);assert.equal(result.qty-baseline.qty,76);
 for(const [i,qty] of [8,10,13,4,16,25,0].entries()){assert.equal(result.slots[i].qty-baseline.slots[i].qty,qty);assert.equal(result.slots[i].invoices-baseline.slots[i].invoices,i===5?2:i===6?0:1);}
 assert.deepEqual(Object.keys(result).sort(),['from','to','generated_at','kind','table_id','invoices','visits','qty','slots','products','product_slots','table_sales','table_options','days'].sort());
 const noMoney=o=>{if(!o||typeof o!=='object')return;for(const [key,value] of Object.entries(o)){assert.ok(!['price','gross','total','discount','cash','transfer','method','cash_received','change_due','amount'].includes(key),key);noMoney(value);}};noMoney(result);
 const dine=validateCashierDashboard(await report('all',901001),bands);assert.equal(dine.invoices,5);assert.equal(dine.visits,5);assert.equal(dine.qty,46);
 const takeaway=validateCashierDashboard(await report('all',901002),bands);assert.equal(takeaway.invoices,2);assert.equal(takeaway.qty,30);
 const selectedTakeaway=validateCashierDashboard(await report('takeaway',901002),bands);assert.equal(selectedTakeaway.qty,30);
 assert.equal((await report('dine',901002)).invoices,0);
 assert.equal((await report('all',901001,bands,day+'T10:00:00',day+'T10:00:00')).qty,10,'inclusive last second');
 // Splitting an existing table visit into two bills changes invoice count, not visits.
 await db.exec('reset role');
 const selected=await row('select id,session_id from bills where table_no=901001 order by paid_at limit 1');
 await db.query('update bills set session_id=$1 where id=(select id from bills where table_no=901001 and id<>$2 order by paid_at limit 1)',[selected.session_id,selected.id]);
 await as(cashier);const split=await report('all',901001);assert.equal(split.invoices,5);assert.equal(split.visits,4);assert.equal(split.qty,46);validateCashierDashboard(split,bands);
 const custom=[{start:'06:00',end:'09:00'},{start:'09:00',end:'24:00'}];validateCashierDashboard(await report('all',901001,custom),custom);
 await assert.rejects(report('all',null,[{start:'09:00',end:'11:00'},{start:'10:00',end:'12:00'}]),/chồng/);
 await assert.rejects(report('all',null,[{start:'bad',end:'11:00'}]),/hợp lệ/);
 await assert.rejects(report('all',null,[]),/12/);
 await assert.rejects(report('bad'),/hợp lệ/);
 await assert.rejects(report('all',null,bands,'2026-01-01T00:00:00','2027-01-02T00:00:00'),/366/);
 await as(waiter);await assert.rejects(report(),/quyền/);
 await as(cashier);await assert.rejects(row('select revenue_report(current_date,current_date)'),/quyền/);
 await db.exec('reset role');await db.query('update profiles set is_active=false where id=$1',[cashier]);await as(cashier);await assert.rejects(report(),/quyền/);
 await db.exec('reset role;set role anon');assert.equal((await row("select has_function_privilege('anon','public.cashier_dashboard_window(timestamp,timestamp,jsonb,text,integer)','execute') ok")).ok,false);
 }finally{await db.exec('rollback;reset role');}
 console.log('PASS cashier dashboard SQL: sample 7 invoices/76 portions; per-band, product, table, visits/split, date/time and sales filters; reconciled quantity-only response; invalid scope, financial API, inactive/other-role/anonymous denial.');
}
