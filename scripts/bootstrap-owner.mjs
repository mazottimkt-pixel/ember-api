import {createClient} from "@supabase/supabase-js";import {loadLocalEnv} from "./load-env.mjs";
const env=loadLocalEnv();for(const key of ["NEXT_PUBLIC_SUPABASE_URL","SUPABASE_SERVICE_ROLE_KEY","TEST_OWNER_EMAIL","TEST_OWNER_PASSWORD"])if(!env[key])throw new Error(`Variável ausente: ${key}`);
const supabase=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
let owner=null;for(let page=1;page<=10&&!owner;page++){const{data,error}=await supabase.auth.admin.listUsers({page,perPage:100});if(error)throw new Error(`Auth indisponível: ${error.message}`);owner=data.users.find(user=>user.email?.toLowerCase()===env.TEST_OWNER_EMAIL.toLowerCase());if(data.users.length<100)break}
let created=false;if(!owner){const{data,error}=await supabase.auth.admin.createUser({email:env.TEST_OWNER_EMAIL,password:env.TEST_OWNER_PASSWORD,email_confirm:true,user_metadata:{full_name:"Proprietário Ember"}});if(error)throw new Error(`Falha ao criar usuário: ${error.message}`);owner=data.user;created=true}
console.log(JSON.stringify({authConnected:true,ownerReady:Boolean(owner),created,userIdPresent:Boolean(owner?.id)}));
