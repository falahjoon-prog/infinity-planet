#!/usr/bin/env bash
# Test-only: reset the local test stack and create the test users.
set -e
cd "$(dirname "$0")/.."
/home/claude/teststack/reset-db.sh >/dev/null 2>&1
P=postgresql://postgres:postgres@localhost:54322/postgres
psql $P -q -v ON_ERROR_STOP=1 -f supabase/migrations/001_base_schema.sql 2>&1 | grep -iv notice || true
psql $P -q -v ON_ERROR_STOP=1 -f supabase/migrations/004_rhc_v4_operating_system.sql 2>&1 | grep -iv notice || true
psql $P -q -v ON_ERROR_STOP=1 -f supabase/migrations/005_infinity_planet_4_1.sql 2>&1 | grep -iv notice || true
psql $P -q -v ON_ERROR_STOP=1 -f supabase/migrations/006_email_options_4_3.sql 2>&1 | grep -iv notice || true
node scripts/create-admin.mjs owner@rhc.test "Owner-Pass-12345" "Falah Owner" >/dev/null
node -e "
const {createClient}=require('@supabase/supabase-js');require('fs').readFileSync('.env.local','utf8').split('\n').forEach(l=>{const m=l.match(/^([A-Z_]+)=(.*)$/);if(m)process.env[m[1]]=m[2]});
const db=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{for(const [e,n,r] of [['legal@rhc.test','Lena Legal','legal'],['member@rhc.test','Max Member','member'],['viewer@rhc.test','Vera Viewer','viewer'],['mkt@rhc.test','Mia Marketing','marketing']]){const {data}=await db.auth.admin.createUser({email:e,password:'Team-Pass-12345',email_confirm:true,user_metadata:{full_name:n}});await db.from('profiles').update({role:r}).eq('id',data.user.id)}console.log('test users ready')})()"
