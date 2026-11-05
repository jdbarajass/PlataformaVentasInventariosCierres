import { PGlite } from '@electric-sql/pglite'
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp'
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm'
import { fileURLToPath } from 'url'
import fs from 'fs'; import path from 'path'
const MIG=fileURLToPath(new URL('../../supabase/migrations', import.meta.url))
export async function boot({verbose=false}={}){
  const db=new PGlite({extensions:{uuid_ossp,pg_trgm}})
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
  const files=fs.readdirSync(MIG).filter(f=>f.endsWith('.sql')).sort()
  const fails=[]
  for(const f of files){
    try{ await db.exec(fs.readFileSync(path.join(MIG,f),'utf8')) }
    catch(e){ fails.push([f,e.message]); }
  }
  if(verbose) console.log('migraciones',files.length,'fallidas',fails.length, fails)
  return {db,fails}
}
if(process.argv[1].endsWith('setup.mjs')){ const {db}=await boot({verbose:true})
 const r=await db.query(`select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and proname ~ 'pos_sale|release|restore_stock|decrement' order by 1`); console.log(r.rows.map(x=>x.proname).join(', '))
 const t=await db.query(`select pg_get_functiondef('public.cancel_pos_sale'::regproc) d`); console.log('cancel has addi:', t.rows[0].d.includes('addi_pending_releases'))
 console.log((await db.query('select version()')).rows[0].version) }
