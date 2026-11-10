import fs from 'node:fs';
const text=fs.readFileSync(new URL('./.secrets/config.php',import.meta.url),'utf8');
const field=name=>{const match=text.match(new RegExp("'"+name+"'=>\\s*'([^']*)'"));if(!match)throw new Error('Configuration field missing');return match[1];};
const body=new URLSearchParams({grant_type:'authorization_code',client_id:field('client_id'),client_secret:field('client_secret'),redirect_uri:field('redirect_uri'),code:'invalid_diagnostic_code'});
const response=await fetch('https://accounts.zoho.com/oauth/v2/token',{method:'POST',body});
const data=await response.json();
const allowed=['invalid_code','invalid_client','invalid_client_secret','invalid_redirect_uri','access_denied'];
console.log(JSON.stringify({http:response.status,error:allowed.includes(data.error)?data.error:'other_response'}));
