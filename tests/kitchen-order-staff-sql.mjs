import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const db=new PGlite(),creator='00000000-0000-0000-0000-000000000001',other='00000000-0000-0000-0000-000000000002';
const one=async(sql,p=[])=> (await db.query(sql,p)).rows[0];
try{
 await db.exec(`create role anon;create role authenticated;create schema pos_sync;
 create table profiles(id uuid primary key,name text);
 create table orders(id uuid primary key default gen_random_uuid(),created_by uuid references profiles(id),bill_transfer_origin uuid,status text default 'cooking',kitchen_relevant boolean default true,is_draft boolean default false);
 insert into profiles values('${creator}','Bo'),('${other}','Lan');
 insert into orders(created_by) values('${creator}');`);
 const existing=(await one('select id from orders')).id;
 await db.exec(readFileSync(new URL('../supabase/migrations/20261113011500_kitchen_order_staff_name.sql',import.meta.url),'utf8'));
 assert.equal((await one('select ordered_by_name from orders where id=$1',[existing])).ordered_by_name,'Bo','existing tickets get recorded creator name');
 const fresh=await one('insert into orders(created_by,ordered_by_name) values($1,$2) returning *',[creator,'Forged']);assert.equal(fresh.ordered_by_name,'Bo','server replaces supplied author label');
 await db.query('update profiles set name=$1 where id=$2',['Bo mới',creator]);assert.equal((await one('select ordered_by_name from orders where id=$1',[fresh.id])).ordered_by_name,'Bo','history remains stable after rename');
 const moved=await one('insert into orders(created_by,bill_transfer_origin) values($1,$2) returning *',[other,fresh.id]);assert.equal(moved.ordered_by_name,'Bo','transfer keeps author rather than mover');
 await db.query("update orders set status='done',ordered_by_name='Changed' where id=$1",[fresh.id]);assert.equal((await one('select ordered_by_name from orders where id=$1',[fresh.id])).ordered_by_name,'Bo','completion/edits preserve author');
 assert.equal((await one("select has_function_privilege('authenticated','pos_sync.snapshot_order_staff_name()','execute') as permitted")).permitted,false);
 assert.equal((await one('select ordered_by_name from (select to_jsonb(o) data from orders o where id=$1) x cross join lateral jsonb_to_record(x.data) as y(ordered_by_name text)',[fresh.id])).ordered_by_name,'Bo','delta JSON includes label without extra API');
 console.log('PASS kitchen staff name SQL: existing/new tickets, server snapshot, rename, transfer, completion, ACL and JSON projection');
}finally{await db.close();}
