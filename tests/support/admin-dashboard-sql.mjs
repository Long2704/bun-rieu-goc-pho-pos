import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {build} from 'esbuild';
const bundle=async file=>{const {outputFiles}=await build({entryPoints:[file],bundle:true,platform:'node',format:'esm',write:false,define:{'import.meta.env':'{}'}});return import('data:text/javascript;base64,'+Buffer.from(outputFiles[0].text).toString('base64'));};
const {aggregateSales,matchesSale,defaultBands,bounds}=await bundle('src/dashboard-model.ts');
const {validateAdminDashboard}=await bundle('src/admin-dashboard.ts');
export async function checkAdminAggregation(db,owner,waiter,kitchen,cashier,food){
 await db.exec('reset role');await db.exec(readFileSync(new URL('../../supabase/migrations/20261115171227_aggregated_admin_dashboard_and_catalog.sql',import.meta.url),'utf8'));
 const one=async(q,p=[])=>{await db.exec('savepoint admin_check');try{const row=(await db.query(q,p)).rows[0];await db.exec('release savepoint admin_check');return row;}catch(e){await db.exec('rollback to admin_check;release savepoint admin_check');throw e;}};
 const as=async id=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id??'']);await db.exec('set role authenticated');};
 await db.exec('begin');
 try{
 await db.query('update profiles set is_active=true,must_change_password=false,staff_sessions_revoked_before=null where id=any($1::uuid[])',[[owner,waiter,kitchen,cashier]]);await db.query("update profiles set role='thu_ngan' where id=$1",[cashier]);
 await db.exec("insert into restaurant_tables(id,name,is_active,service_type,display_order) values(991,'Bàn 991',true,'dine_in',991),(992,'Mang về 992',true,'dine_in',992),(993,'Bàn 993',true,'dine_in',993)");
 const pay=async(table,qty,method,when)=>{await as(owner);const o=(await one('select submit_order($1,gen_random_uuid(),$2::jsonb) id',[table,JSON.stringify([{menu_item_id:food,qty}])])).id;const session=(await one('select session_id from orders where id=$1',[o])).session_id;const items=(await db.query('select id from order_items where order_id=$1',[o])).rows.map(i=>i.id);const bill=(await one('select pay_bill($1,gen_random_uuid(),$2,$3::uuid[]) id',[session,method,items])).id;await db.exec('reset role');await db.query('update bills set paid_at=$1 where id=$2',[when,bill]);return bill;};
 const a=await pay(991,2,'cash','2010-01-02T08:59:59.999+07:00'),b=await pay(991,3,'transfer','2010-01-02T09:00:00+07:00');
 await db.query('update bills set session_id=(select session_id from bills where id=$1),discount=1000,total=gross-1000 where id=$2',[a,b]);
 const c=await pay(992,4,'cash','2010-01-02T17:00:00+07:00');await db.query("update bills set service_label='Máng Về đặc biệt' where id=$1",[c]);await pay(993,1,'transfer','2010-01-01T07:00:00+07:00');
 await as(owner);const raw=(await one("select coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('bill_items',(select jsonb_agg(jsonb_build_object('name',i.name,'qty',i.qty,'price',i.price,'is_takeaway',i.is_takeaway)) from bill_items i where i.bill_id=b.id)) order by b.paid_at,b.id),'[]') rows from bills b where paid_at>='2009-12-30' and paid_at<'2010-01-04'")).rows;
 const stamp=ms=>new Date(ms+7*3600000).toISOString().slice(0,19);
 const report=async(from,to,bands,kind='all',table=null)=>(await one('select admin_dashboard_window($1,$2,$3::jsonb,$4,$5) r',[from,to,JSON.stringify(bands),kind,table])).r;
 for(const [from,to,bands,kind,table] of [
 ['2010-01-02T00:00:00','2010-01-02T23:59:59',defaultBands,'all',null],
 ['2010-01-02T00:00:00','2010-01-02T23:59:59',defaultBands,'takeaway',null],
 ['2010-01-02T00:00:00','2010-01-02T23:59:59',defaultBands,'dine',991],
 ['2010-01-02T00:00:00','2010-01-02T23:59:59',defaultBands,'all',9999],
 ['2010-01-02T08:00:00','2010-01-02T09:00:00',[{start:'09:00',end:'24:00'}],'all',null],
 ['2010-01-01T00:00:00','2010-01-03T23:59:59',defaultBands,'all',null]]){
  const result=validateAdminDashboard(await report(from,to,bands,kind,table),from,to,bands,kind,table),range=bounds(from,to),filtered=raw.filter(s=>matchesSale(s,kind,table===null?'all':String(table)));
  for(const [actual,f,t] of [[result.current,from,to],[result.previous,stamp(range.previous),stamp(range.start-1000)]]){const expected=aggregateSales(filtered,f,t,bands,'',actual.generated_at);actual.filter_label='';assert.deepEqual(actual,expected);}
 }
 for(const label of ['Mang về 1','MANG VE 2','Máng Vè 3','Mang ve\u0300 4','\u00a0Mang\u00a0về\u00a0','Mang vềx','Mang về_1','Mang về-2','Mang về4/Bàn24','ABCD','Mangve3']){
  await db.exec('reset role');await db.query('update bills set service_label=$1 where id=$2',[label,c]);await as(owner);const r=await report('2010-01-02','2010-01-02T23:59:59',defaultBands,'takeaway',992);assert.equal(r.current.invoices,Number(matchesSale({...raw.find(v=>v.id===c),service_label:label},'takeaway','all')),label);
 }
 await db.exec('reset role');await db.query("update bills set service_label='' where id=$1",[c]);await as(owner);const options=(await report('2010-01-02','2010-01-02T23:59:59',defaultBands)).table_options;assert.equal(options.find(t=>t.table_id===992).has_label,false);
 for(const id of [waiter,kitchen,cashier]){await as(id);await assert.rejects(report('2010-01-02','2010-01-02T23:59:59',defaultBands),/quyền/);}
 await as(owner);for(const bands of [[],[{start:'bad',end:'11:00'}],[{start:'06:00',end:'10:00'},{start:'09:00',end:'11:00'}]])await assert.rejects(report('2010-01-02','2010-01-02T23:59:59',bands),/giờ|chồng/);
 await assert.rejects(report('2010-01-02','2012-01-02',defaultBands),/366/);
 let first=(await one('select get_pos_live_snapshot_v2(true,false,null) r')).r;assert.ok(first.catalog.groups.groups.length>=3);assert.equal(first.catalog_unchanged,false);
 const same=(await one('select get_pos_live_snapshot_v2(true,false,$1) r',[first.catalog_version])).r;assert.equal(same.catalog_unchanged,true);assert.equal(same.catalog,null);
 for(const sql of ["update menu_items set name=name||' version' where id='"+food+"'","update restaurant_tables set name=name||' version' where id=991","update menu_groups set name=name||' version' where id=(select id from menu_groups limit 1)","delete from menu_item_groups where item_id='"+food+"'"]){await db.exec('reset role');await db.exec(sql);await as(owner);const changed=(await one('select get_pos_live_snapshot_v2(true,false,$1) r',[first.catalog_version])).r;assert.equal(changed.catalog_unchanged,false);assert.notEqual(changed.catalog_version,first.catalog_version);first=changed;}
 await db.exec('reset role');await db.query("update profiles set role='chu' where id=$1",[cashier]);
 for(const condition of ['is_active=false',"staff_sessions_revoked_before=clock_timestamp()+interval '1 day'"]){await db.exec('reset role;savepoint denied_admin');await db.query('update profiles set '+condition+' where id=$1',[owner]);await as(owner);await assert.rejects(report('2010-01-02','2010-01-02T23:59:59',defaultBands),/quyền/);const blocked=(await one('select get_pos_live_snapshot_v2(true,false,null) r')).r;assert.equal(blocked.catalog,null);await db.exec('reset role;rollback to denied_admin');}
 await db.exec('reset role');assert.equal((await one("select has_table_privilege('authenticated','pos_sync.catalog_revision','update') ok")).ok,false);for(const f of ['admin_dashboard_window(timestamp,timestamp,jsonb,text,integer)','get_pos_live_snapshot_v2(boolean,boolean,text)'])assert.equal((await one('select has_function_privilege(\'anon\',$1,\'execute\') ok',[f])).ok,false);
 }finally{await db.exec('rollback;reset role');}
 console.log('PASS admin SQL exact JS parity: periods/previous, seconds, custom bands, zero days, split visits, mixed payments/discounts, accent takeaway and scope; cashier/other-role/blocked denial. Catalog revisions cover menu/table/groups/assignments, unchanged payload omitted, auth enforced.');
}
