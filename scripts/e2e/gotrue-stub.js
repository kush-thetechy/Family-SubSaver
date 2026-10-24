const http=require('http');
const users={'kush@test.dev':{id:'11111111-1111-1111-1111-111111111111',password:'oldpass-123'}};
const log=[];
const b64=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt=(u)=>b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub:u.id,email:u.email,aud:'authenticated',role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.sig';
const tokens={};
const userObj=(email)=>({id:users[email].id,aud:'authenticated',role:'authenticated',email,email_confirmed_at:'2026-10-21T00:00:00Z',app_metadata:{provider:'email'},user_metadata:{},identities:[{id:'1'}],created_at:'2026-10-21T00:00:00Z',updated_at:new Date().toISOString()});
const session=(email)=>{const u=Object.assign({email},users[email]);const t=jwt(u);tokens[t]=email;return{access_token:t,token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,refresh_token:'r-'+Math.random(),user:userObj(email)}};
http.createServer((req,res)=>{let body='';req.on('data',d=>body+=d);req.on('end',()=>{
 const u=new URL(req.url,'http://x');const send=(c,o)=>{res.writeHead(c,{'content-type':'application/json','access-control-allow-origin':req.headers.origin||'*','access-control-allow-headers':'*','access-control-allow-methods':'*'});res.end(JSON.stringify(o))};
 if(req.method==='OPTIONS')return send(200,{});
 const j=body?JSON.parse(body):{};const bearer=(req.headers.authorization||'').replace('Bearer ','');
 if(u.pathname==='/auth/v1/token'&&u.searchParams.get('grant_type')==='password'){log.push({ev:'signin',email:j.email,pw:j.password});const us=users[j.email];if(us&&us.password===j.password)return send(200,session(j.email));return send(400,{code:'invalid_credentials',error_code:'invalid_credentials',msg:'Invalid login credentials'})}
 if(u.pathname==='/auth/v1/user'&&req.method==='GET'){const e=tokens[bearer];return e?send(200,userObj(e)):send(401,{msg:'bad jwt'})}
 if(u.pathname==='/auth/v1/user'&&req.method==='PUT'){const e=tokens[bearer];log.push({ev:'updateUser',pw:j.password,auth:!!e});if(!e)return send(401,{msg:'bad jwt'});if(j.password)users[e].password=j.password;return send(200,userObj(e))}
 if(u.pathname==='/auth/v1/logout'){log.push({ev:'logout'});return send(204,{})}
 if(u.pathname==='/_log')return send(200,log);
 send(404,{msg:'nf '+u.pathname});
});}).listen(3999);
