import {readFileSync} from "node:fs";
import pg from "pg";
import {loadLocalEnv} from "./load-env.mjs";
const env=loadLocalEnv();
const match=env.SUPABASE_DB_URL?.trim().match(/^postgres(?:ql)?:\/\/([^:]+):(.+)@([^:]+):(\d+)\/([^?\s]+)(?:\?.*)?$/);
if(!match)throw new Error("SUPABASE_DB_URL inválida");
const[,rawUser,rawPassword,host,port,rawDatabase]=match;
const password=rawPassword.startsWith("[")&&rawPassword.endsWith("]")?rawPassword.slice(1,-1):rawPassword;
const client=new pg.Client({user:decodeURIComponent(rawUser),password:decodeURIComponent(password),host,port:Number(port),database:decodeURIComponent(rawDatabase),ssl:{rejectUnauthorized:false}});
await client.connect();
try{
  const exists=await client.query("select to_regclass('public.administrative_files') as table_name");
  if(exists.rows[0]?.table_name){console.log(JSON.stringify({applied:false,reason:"already_present"}));process.exitCode=0;}
  else{await client.query("begin");try{await client.query(readFileSync("supabase/migrations/202608060001_administrative_vault.sql","utf8"));await client.query("commit");console.log(JSON.stringify({applied:true,migration:"202608060001_administrative_vault.sql"}));}catch(error){await client.query("rollback");throw error;}}
}finally{await client.end();}
