// Prueba la corrección de datos de 00062_loans_no_stock.sql: arma una base
// con las migraciones hasta la 0061, crea préstamos con las funciones de la
// 00059 (que sí descontaban) y luego corre la 00062.
//   cd scripts/auditoria-ventas && node transicion-00062.mjs
import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { fileURLToPath } from 'url'
import fs from 'fs'; import path from 'path'

const MIG = fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
const db = new PGlite({ extensions: { uuid_ossp, pg_trgm } })
await db.exec(`
  CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
  CREATE SCHEMA auth; CREATE SCHEMA storage;
  CREATE TABLE auth.users(id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb default '{}', created_at timestamptz default now());
  CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
  CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ select 'service_role'::text $$;
  CREATE TABLE storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  CREATE TABLE storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid);
  ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
`)
const files = fs.readdirSync(MIG).filter((f) => f.endsWith('.sql')).sort()
for (const f of files.filter((f) => f < '00062')) await db.exec(fs.readFileSync(path.join(MIG, f), 'utf8'))

const q = async (s, p = []) => (await db.query(s, p)).rows
const one = async (s, p = []) => (await q(s, p))[0]
const simple = (await one(`insert into public.products(title,slug,sku,price_cents,cost_cents,stock_qty,active) values('Intercom','i','I1',100,50,10,true) returning id`)).id
const casco = (await one(`insert into public.products(title,slug,sku,price_cents,cost_cents,stock_qty,active) values('Casco','c','C1',100,50,0,true) returning id`)).id
const XL = (await one(`insert into public.product_variants(product_id,talla,stock_qty,cost_cents) values($1,'XL',5,50) returning id`, [casco])).id
const lend = (p, v) => one('select * from public.create_lent_loan($1::jsonb)', [JSON.stringify({ product_id: p, variant_id: v, product_title: 'x', warehouse: 'Otro' })])
const st = (id, s) => q('select public.set_loan_status($1,$2)', [id, s])
const sp = async () => (await one('select stock_qty s from public.products where id=$1', [simple])).s
const sv = async () => (await one('select stock_qty s from public.product_variants where id=$1', [XL])).s

await lend(simple, null)                               // pendiente: 10 -> 9
const cobrado = await lend(casco, XL); await st(cobrado.id, 'charged') // cobrado: XL 5 -> 4
const devuelto = await lend(simple, null); await st(devuelto.id, 'returned') // neutro
await db.exec(`insert into public.loans(product_id,product_title,warehouse,direction) values('${simple}','viejo','Otro','lent')`) // anterior a 00059
console.log('antes de 00062: intercom', await sp(), '(esperado 9), casco XL', await sv(), '(esperado 4)')

await db.exec(fs.readFileSync(path.join(MIG, '00062_loans_no_stock.sql'), 'utf8'))
const a = await sp(), b = await sv()
const mv = await one(`select count(*)::int c from public.inventory_movements where note like 'Corrección:%'`)
const nn = await one('select count(*)::int c from public.loans where stock_deducted is not null')
console.log('después:       intercom', a, '(esperado 10), casco XL', b, '(esperado 5), movimientos', mv.c, '(esperado 2), stock_deducted no nulos', nn.c)

await db.exec(fs.readFileSync(path.join(MIG, '00062_loans_no_stock.sql'), 'utf8'))
const a2 = await sp(), b2 = await sv()
console.log('correrla 2 veces: intercom', a2, 'casco XL', b2, '(no debe cambiar)')
const ok = a == 10 && b == 5 && mv.c == 2 && nn.c == 0 && a2 == 10 && b2 == 5
console.log(ok ? 'OK transición 00062' : 'FALLA transición 00062')
process.exit(ok ? 0 : 1)
