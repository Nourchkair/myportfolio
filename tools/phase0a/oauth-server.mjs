import http from 'node:http';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { URL } from 'node:url';
import { ENV_PATH, loadEnv } from './env.mjs';

// Reauthorization utility only. Do not run unless explicitly authorized to replace the refresh token.
const envPath=ENV_PATH;
const env=loadEnv();
const clientId=env.GOOGLE_CLIENT_ID;
const clientSecret=env.GOOGLE_CLIENT_SECRET;
const redirectUri=env.GOOGLE_REDIRECT_URI;
const scopes=[
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.compose'
];
const pending=new Map();
const b64url=b=>Buffer.from(b).toString('base64').replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const sha256=s=>crypto.createHash('sha256').update(s).digest();
const writeRefreshToken=token=>{
  const lines=fs.readFileSync(envPath,'utf8').split(/\r?\n/);
  let found=false;
  const next=lines.map(l=>{
    if(l.startsWith('GOOGLE_REFRESH_TOKEN=')){found=true;return 'GOOGLE_REFRESH_TOKEN='+token;}
    return l;
  });
  if(!found) next.push('GOOGLE_REFRESH_TOKEN='+token);
  const tmp=envPath+'.tmp';
  fs.writeFileSync(tmp,next.join('\n'),{mode:0o600});
  fs.chmodSync(tmp,0o600);
  fs.renameSync(tmp,envPath);
};
const html=(title,body)=>`<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:system-ui;max-width:640px;margin:8vh auto;padding:0 24px;line-height:1.5"><h1>${title}</h1>${body}</body>`;
const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,`http://${req.headers.host}`);
  try{
    if(url.pathname==='/oauth/google/start'){
      const state=b64url(crypto.randomBytes(24));
      const verifier=b64url(crypto.randomBytes(48));
      pending.set(state,{verifier,created:Date.now()});
      const challenge=b64url(sha256(verifier));
      const auth=new URL('https://accounts.google.com/o/oauth2/v2/auth');
      auth.searchParams.set('client_id',clientId);
      auth.searchParams.set('redirect_uri',redirectUri);
      auth.searchParams.set('response_type','code');
      auth.searchParams.set('scope',scopes.join(' '));
      auth.searchParams.set('access_type','offline');
      auth.searchParams.set('prompt','consent');
      auth.searchParams.set('include_granted_scopes','true');
      auth.searchParams.set('state',state);
      auth.searchParams.set('code_challenge',challenge);
      auth.searchParams.set('code_challenge_method','S256');
      res.writeHead(302,{Location:auth.toString()}); res.end(); return;
    }
    if(url.pathname==='/oauth/google/callback'){
      const state=url.searchParams.get('state');
      const code=url.searchParams.get('code');
      const error=url.searchParams.get('error');
      if(error){res.writeHead(400,{'Content-Type':'text/html'});res.end(html('Authorization cancelled',`<p>Google returned: ${error}</p><p><a href="/oauth/google/start">Try again</a></p>`));return;}
      const item=state&&pending.get(state);
      if(!item||!code){res.writeHead(400,{'Content-Type':'text/html'});res.end(html('Invalid OAuth state','<p>The state is missing or expired. Start again.</p>'));return;}
      pending.delete(state);
      const body=new URLSearchParams({code,client_id:clientId,client_secret:clientSecret,redirect_uri:redirectUri,grant_type:'authorization_code',code_verifier:item.verifier});
      const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
      const json=await tokenRes.json();
      if(!tokenRes.ok||!json.refresh_token){
        res.writeHead(400,{'Content-Type':'text/html'});
        res.end(html('Authorization incomplete',`<p>Google did not return a refresh token. HTTP ${tokenRes.status}. ${json.error?String(json.error):''}</p><p>Ensure offline access and consent are enabled, then try again.</p>`));
        return;
      }
      writeRefreshToken(json.refresh_token);
      res.writeHead(200,{'Content-Type':'text/html'});
      res.end(html('Google authorization complete','<p>Refresh token stored locally with restricted permissions. You may close this tab.</p>'));
      return;
    }
    if(url.pathname==='/oauth/google/status'){
      const current=loadEnv().GOOGLE_REFRESH_TOKEN;
      res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});
      res.end(JSON.stringify({authorized:Boolean(current),redirectUri,scopes}));
      return;
    }
    res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found');
  }catch(e){
    console.error('oauth_server_error',e?.name||'error');
    res.writeHead(500,{'Content-Type':'text/html'});res.end(html('OAuth server error','<p>See the local server log. No credentials were printed.</p>'));
  }
});
server.listen(8787,'127.0.0.1',()=>console.log('oauth_server_ready http://localhost:8787/oauth/google/start'));
