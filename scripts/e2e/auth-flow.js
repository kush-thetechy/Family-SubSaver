// Browser check of sign-in + reset against a local stub GoTrue. Needs puppeteer-core, Chrome, a build with NEXT_PUBLIC_SUPABASE_URL=http://localhost:3999, and: node scripts/e2e/gotrue-stub.js
const p=require('puppeteer-core');const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const log=async()=>JSON.parse(await (await fetch('http://localhost:3999/_log')).text());
const setNoEvent=(pg,sel,val)=>pg.evaluate((sel,val)=>{const el=document.querySelector(sel);Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el,val);},sel,val); // autofill-like: no input event
(async()=>{
 const b=await p.launch({executablePath:'/usr/bin/google-chrome',args:['--no-sandbox'],headless:'new'});
 const pg=await b.newPage();await pg.setBypassCSP(true);await pg.setViewport({width:390,height:844});
 const R=[];const ok=(n,v)=>{R.push((v?'PASS ':'FAIL ')+n)};
 // 1 normal sign-in with autofill-style fill (no change events)
 await pg.goto('http://localhost:3111/login',{waitUntil:'networkidle0'});
 await setNoEvent(pg,'input[name=email]','kush@test.dev');await setNoEvent(pg,'input[name=password]','oldpass-123');
 await pg.click('button[type=submit]');await sleep(2000);
 ok('autofill-style sign-in (no change events) succeeds, lands in app: '+pg.url(),!/login/.test(pg.url()));
 // 2 reset page: set new password, with show-password toggle
 await pg.goto('http://localhost:3111/reset-password',{waitUntil:'networkidle0'});
 await pg.type('input[name=password]','NewPass#4567');await pg.type('input[name=confirm]','NewPass#4567');
 await pg.click('input[type=checkbox]');
 ok('show password reveals text',await pg.evaluate(()=>document.querySelector('input[name=password]').type==='text'));
 await pg.click('button[type=submit]');await sleep(2500);
 let L=await log();
 ok('updateUser sent exactly the typed password with a valid session',L.some(e=>e.ev==='updateUser'&&e.pw==='NewPass#4567'&&e.auth));
 ok('signed out after save',L.some(e=>e.ev==='logout'));
 ok('lands on /login with success notice: '+pg.url(),/\/login/.test(pg.url())&&(await pg.evaluate(()=>document.body.innerText)).includes('Password updated'));
 // 3 normal sign-in with NEW password
 await pg.type('input[name=email]','kush@test.dev');await pg.type('input[name=password]','NewPass#4567');
 await pg.click('button[type=submit]');await sleep(2000);
 ok('normal sign-in with the new password succeeds: '+pg.url(),!/login/.test(pg.url()));
 // 4 old password rejected
 await pg.deleteCookie(...(await pg.cookies()));
 await pg.goto('http://localhost:3111/login',{waitUntil:'networkidle0'});
 await pg.type('input[name=email]','kush@test.dev');await pg.type('input[name=password]','oldpass-123');await pg.click('button[type=submit]');await sleep(1500);
 ok('old password rejected with Invalid login credentials',(await pg.evaluate(()=>document.body.innerText)).includes('Invalid login credentials'));
 // 5 stale-state: type then autofill overwrite without event
 await pg.goto('http://localhost:3111/login',{waitUntil:'networkidle0'});
 await pg.type('input[name=email]','kush@test.dev');await pg.type('input[name=password]','wrong');await setNoEvent(pg,'input[name=password]','NewPass#4567');await pg.click('button[type=submit]');await sleep(2000);
 ok('field value (not stale state) is what gets submitted',!/login/.test(pg.url()));
 L=await log();console.log(JSON.stringify(L.filter(e=>e.ev==='signin').map(e=>e.pw)));
 console.log(R.join('\n'));await b.close();
})();
