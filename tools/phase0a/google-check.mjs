import fs from 'node:fs';
import { ENV_PATH, loadEnv } from './env.mjs';
const envPath=ENV_PATH;
const env=loadEnv();
if(!env.GOOGLE_REFRESH_TOKEN){ console.error('NO_REFRESH_TOKEN'); process.exit(2); }
const writeEnv=(key,value)=>{const lines=fs.readFileSync(envPath,'utf8').split(/\r?\n/);let found=false;const next=lines.map(l=>{if(l.startsWith(key+'=')){found=true;return key+'='+value;}return l;});if(!found)next.push(key+'='+value);const tmp=envPath+'.tmp';fs.writeFileSync(tmp,next.join('\n'),{mode:0o600});fs.chmodSync(tmp,0o600);fs.renameSync(tmp,envPath);};
const tokenRes=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'})});
const token=await tokenRes.json();
if(!tokenRes.ok||!token.access_token){ console.error('TOKEN_REFRESH_FAILED',tokenRes.status,token.error||'unknown'); process.exit(3); }
const auth={Authorization:'Bearer '+token.access_token};
const get=async(url,opts={})=>{const r=await fetch(url,{...opts,headers:{...auth,...(opts.headers||{})}});const j=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error('HTTP '+r.status),{status:r.status,body:j});return j;};
const post=async(url,body,opts={})=>get(url,{method:'POST',headers:{'Content-Type':'application/json',...(opts.headers||{})},body:JSON.stringify(body)});
const out={read:{},write:{}};
out.read.sheets=await get(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_CRM_SPREADSHEET_ID)}?fields=properties.title,sheets.properties`).then(j=>({title:j.properties?.title,tabs:(j.sheets||[]).map(s=>s.properties?.title)}));
out.read.calendar=await get(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}`).then(j=>({summary:j.summary,timeZone:j.timeZone,accessRole:j.accessRole}));
const now=new Date(); const week=new Date(now.getTime()+7*86400000);
const fb=await post('https://www.googleapis.com/calendar/v3/freeBusy',{timeMin:now.toISOString(),timeMax:week.toISOString(),items:[{id:env.GOOGLE_CALENDAR_ID}]});
out.read.freebusy={busyBlocks:(fb.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy||[]).length};
out.read.driveAppFiles=await get('https://www.googleapis.com/drive/v3/files?pageSize=10&fields=files(id,name,mimeType)').then(j=>({count:(j.files||[]).length}));
if(process.argv.includes('--write')){
  const folderName='AI Nour Phase 0A (Dev)';
  const folder=await post('https://www.googleapis.com/drive/v3/files?fields=id,name',{name:folderName,mimeType:'application/vnd.google-apps.folder'});
  out.write.driveFolder={id:folder.id,name:folder.name};
  writeEnv('GOOGLE_KNOWLEDGE_FOLDER_ID',folder.id);
  const start=new Date(now.getTime()+30*86400000); start.setUTCHours(15,0,0,0); const end=new Date(start.getTime()+15*60000);
  const event=await post(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events?conferenceDataVersion=1&sendUpdates=none`,{summary:'AI Nour Phase 0A Test — delete me',description:'Synthetic feasibility event. No attendees.',start:{dateTime:start.toISOString(),timeZone:'America/Toronto'},end:{dateTime:end.toISOString(),timeZone:'America/Toronto'},conferenceData:{createRequest:{requestId:'ainour-phase0a-'+Date.now(),conferenceSolutionKey:{type:'hangoutsMeet'}}}});
  out.write.calendarEvent={id:event.id,hasMeet:Boolean(event.hangoutLink||event.conferenceData?.entryPoints?.some(e=>e.entryPointType==='video'))};
  await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(env.GOOGLE_CALENDAR_ID)}/events/${encodeURIComponent(event.id)}?sendUpdates=none`,{method:'DELETE',headers:auth});
  out.write.calendarEvent.deleted=true;
  const raw=['From: '+env.GOOGLE_CLOUD_PROJECT_ID+' <nourchkair@gmail.com>','To: nourchkair@gmail.com','Subject: AI Nour Phase 0A draft test','MIME-Version: 1.0','Content-Type: text/plain; charset=UTF-8','','Synthetic draft for integration validation. No send.',''].join('\r\n');
  const draft=await post('https://gmail.googleapis.com/gmail/v1/users/me/drafts',{message:{raw:Buffer.from(raw).toString('base64url')}});
  out.write.gmailDraft={id:draft.id};
  await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/drafts/${encodeURIComponent(draft.id)}`,{method:'DELETE',headers:auth});
  out.write.gmailDraft.deleted=true;
}
console.log(JSON.stringify({ok:true,read:out.read,write:out.write},null,2));
