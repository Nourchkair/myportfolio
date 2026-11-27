import { PROJECTS } from '../../src/data/projects.js';
import { PROFESSIONAL_CHAPTERS, PROFESSIONAL_INTRO } from '../../src/data/journey.js';
import { ABOUT_ME_INTRO, ABOUT_ME_THINK, ABOUT_ME_WORK, ABOUT_ME_DIRECTION } from '../../src/data/profile.js';
import { SITE } from '../../src/data/site.js';

const chunks=[]; const add=(id,type,title,text,route='',tags=[])=>{ if(text&&String(text).trim()) chunks.push({id,type,title,text:String(text),route,tags}); };
const arr=v=>Array.isArray(v)?v:(v==null?[]:[v]);
for(const p of PROJECTS){
  add(`${p.id}:identity`,'project',`${p.title} — ${p.project}`, [p.title,p.project,p.category,p.description,...(p.capabilities||[])].join(' '),`/projects/${p.id}`,[p.id,p.project,p.category]);
  add(`${p.id}:what`,'project',`${p.title} — what it is`, arr(p.overview?.whatItIs).join(' '),`/projects/${p.id}`,[p.id]);
  add(`${p.id}:challenges`,'project',`${p.title} — challenges`, arr(p.overview?.challenges).join(' '),`/projects/${p.id}`,[p.id]);
  add(`${p.id}:value`,'project',`${p.title} — value`, arr(p.overview?.value).join(' '),`/projects/${p.id}`,[p.id]);
  const c=p.overview?.contribution;
  if(c) add(`${p.id}:contribution`,'project',`${p.title} — contribution`, [c.lead,...(c.blocks||[]).map(b=>`${b.label}: ${b.text}`)].join(' '),`/projects/${p.id}`,[p.id,'contribution']);
  for(const n of p.flow?.nodes||[]) add(`${p.id}:flow:${n.id}`,'flow',`${p.title} — ${n.title}`, [n.title,n.visible,n.explanation].join(' '),`/projects/${p.id}/flow/${n.id}`,[p.id,'flow']);
}
for(const c of PROFESSIONAL_CHAPTERS){
  add(`journey:${c.id}`,'journey',`${c.title} — ${c.label}`, [c.title,c.label,c.period,...(c.paragraphs||[]),c.direction,...(c.capabilities||[]),...(c.details||[])].join(' '),`/journey/${c.id}`,[c.id,c.label,c.title]);
  for(const r of c.roles||[]) add(`journey:${c.id}:role:${r.org}`,'journey',`${c.title} — ${r.org}`, [r.org,r.role,r.period].join(' '),`/journey/${c.id}`,[c.id,r.org,r.role]);
}
add('profile:intro','profile','About Nour',arr(ABOUT_ME_INTRO).join(' '),'/me',['intro','background']);
add('profile:think','profile','How Nour thinks',arr(ABOUT_ME_THINK).join(' '),'/me',['thinking']);
add('profile:work','profile','How Nour works',arr(ABOUT_ME_WORK).join(' '),'/me',['work','capabilities','technology']);
add('profile:direction','profile','Nour direction',arr(ABOUT_ME_DIRECTION).join(' '),'/me',['direction','ambition','consulting']);
add('profile:journey-intro','profile','Career introduction',arr(PROFESSIONAL_INTRO).join(' '),'/journey',['journey']);
add('site:contact','profile','Contact',[SITE.contactIntro,SITE.contactNote,SITE.linkedin,SITE.github].join(' '),'/contact',['contact']);

const stop=new Set('the a an and or of to in for on with as at by is are was were be been being this that these those what which who whom how why where when i you he she it we they me my your his her our their do does did can could should would will may might have has had from about into over after before more most other some such no not only own same than too very just'.split(' '));
const norm=s=>s.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();
const stem=w=>w.length>4&&w.endsWith('ies')?w.slice(0,-3)+'y':w.length>4&&w.endsWith('s')&&!w.endsWith('ss')?w.slice(0,-1):w;
const tok=s=>norm(s).split(/\s+/).filter(w=>w.length>1&&!stop.has(w)).map(stem);
const docs=chunks.map(c=>({...c,toks:tok(c.title+' '+c.text+' '+(c.tags||[]).join(' '))}));
const df=new Map(); for(const d of docs) for(const t of new Set(d.toks)) df.set(t,(df.get(t)||0)+1);
const avg=docs.reduce((a,d)=>a+d.toks.length,0)/docs.length; const N=docs.length; const k1=1.2,b=0.75;
const aliases={
  'h&m':['journey:entry:role:H&M','journey:sales:role:H&M','entry','sales'], 'hm':['journey:entry:role:H&M','journey:sales:role:H&M','entry','sales'], 'browns':['journey:commercial:role:Browns','commercial'], 'mpn':['journey:commercial:role:MPN Capital Markets','commercial'],
  'longfields':['entry'], 'university':['academic','technology'], 'ottawa':['entry','academic','profile:intro'],
  'acquisition':['acquisition'], 'customer acquisition':['acquisition'], 'dispatch':['h2ops'], 'h2ops':['h2ops'],
  'communications':['communications'], 'communication':['communications'], 'brain':['knowledge'], 'knowledge':['knowledge'],
  'safiy':['safiy'], 'ai':['communications','knowledge','safiy','technology'], 'voice':['communications'],
  'sms':['communications'], 'sales':['sales','commercial'], 'retail':['entry'], 'consulting':['direction','profile:direction'],
  'contact':['site:contact'], 'email':['site:contact'], 'linkedin':['site:contact'], 'study':['entry'], 'school':['entry'],
  'education':['entry'], 'ambition':['direction','profile:direction'], 'capabilities':['profile:work','technology'], 'skills':['profile:work','technology'],
  'technology':['technology','profile:work'], 'tools':['technology','profile:work'], 'project':['acquisition','h2ops','communications','knowledge','safiy']
};
const projectAlias=Object.fromEntries(PROJECTS.map(p=>[norm(p.title),p.id])); for(const p of PROJECTS){projectAlias[norm(p.project)]=p.id;projectAlias[p.id]=p.id;}
const chapterAlias=Object.fromEntries(PROFESSIONAL_CHAPTERS.map(c=>[norm(c.label),c.id])); chapterAlias['professional']='technology';
function boosts(q){
  const qn=norm(q); const boost=new Map(); const want=new Set();
  for(const [alias,ids] of Object.entries(aliases)) if(qn.includes(norm(alias))) ids.forEach(id=>want.add(id));
  for(const [alias,id] of Object.entries(projectAlias)) if(qn.includes(alias)) want.add(id);
  for(const [alias,id] of Object.entries(chapterAlias)) if(qn.includes(alias)) want.add(id);
  if(/\b(contribution|contribut|my role|your role|what did nour do)\b/.test(qn)) want.add('contribution');
  if(/\b(flow|process|stage|step|happens|connect)\b/.test(qn)) want.add('flow');
  if(/\b(contact|email|linkedin|reach)\b/.test(qn)) want.add('site:contact');
  if(/\b(study|school|education|university|diploma)\b/.test(qn)) want.add('journey:entry');
  if(/\b(capabilit|skills|tools|technology|technical)\b/.test(qn)) { want.add('profile:work'); want.add('journey:technology'); }
  return {want,boost};
}
function score(query,d){
  const q=tok(query), tf=new Map(); for(const t of d.toks) tf.set(t,(tf.get(t)||0)+1);
  let s=0; for(const t of q){ const f=tf.get(t)||0; if(!f) continue; const n=df.get(t)||0; const idf=Math.log(1+(N-n+0.5)/(n+0.5)); s+=idf*(f*(k1+1))/(f+k1*(1-b+b*d.toks.length/avg)); }
  const {want}=boosts(query); const title=norm(d.title), qn=norm(query);
  for(const t of q) if(title.includes(t)) s+=1.5;
  for(const id of want){
    if(d.id===id) s+=8;
    else if(d.id.startsWith(id+':')) s+=3;
    else if(d.tags?.includes(id)) s+=4;
  }
  const projectIds=new Set(PROJECTS.map(p=>p.id)); const hasProject=[...want].some(id=>projectIds.has(id));
  if(/\b(contribution|contribut|my role|your role)\b/.test(qn) && hasProject && d.id.endsWith(':contribution')) s+=3;
  if(/\b(flow|process|stage|step|happens|connect)\b/.test(qn) && d.type==='flow') s+=2;
  return s;
}
function search(q,limit=3){ return docs.map(d=>({id:d.id,score:score(q,d),title:d.title})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score).slice(0,limit); }

const tests=[
 ['What did Nour do at H&M?',['journey:entry','journey:sales','journey:entry:role:H&M','journey:sales:role:H&M']],
 ['How did Nour improve team sales?',['journey:sales']],
 ['What is Customer Acquisition?',['acquisition:identity','acquisition:what']],
 ['How does dispatch handle contractor supply?',['h2ops:identity','h2ops:flow:coverage','h2ops:flow:activate']],
 ['Which project uses AI voice and SMS?',['communications:identity','communications:what','communications:flow:sms','communications:flow:voice']],
 ['What is B.R.A.I.N.?',['knowledge:identity','knowledge:what']],
 ['What does Safiy do?',['safiy:identity','safiy:what']],
 ['What was Nour’s contribution to Safiy?',['safiy:contribution']],
 ['Where did Nour study?',['journey:entry:role:Longfields-Davidson Heights Secondary School','journey:entry']],
 ['What is Nour’s consulting direction?',['profile:direction','profile:work']],
 ['What are Nour’s technical capabilities?',['profile:work','journey:technology']],
 ['How does Nour approach business and technology?',['profile:work','profile:direction']],
 ['What is Nour’s professional ambition?',['profile:direction','journey:direction']],
 ['Show me the customer acquisition flow',['acquisition:flow:target','acquisition:flow:find','acquisition:flow:demo']],
 ['What happens after the demo in Customer Acquisition?',['acquisition:flow:outreach','acquisition:flow:nurture']],
 ['How does Dispatch match customers and contractors?',['h2ops:flow:match','h2ops:flow:coverage']],
 ['What is the exception path in Dispatch?',['h2ops:flow:exception']],
 ['How does AI Customer Communications assess needs?',['communications:flow:understand']],
 ['What is the knowledge library process?',['knowledge:flow:organize','knowledge:flow:maintain']],
 ['How does Safiy capture conversations?',['safiy:flow:capture']],
 ['What did Nour do at Browns?',['journey:commercial','journey:commercial:role:Browns']],
 ['What did Nour learn in retail?',['journey:entry']],
 ['What are Nour’s core capabilities?',['journey:technology','journey:commercial','profile:work']],
 ['Where is Nour based?',['profile:intro']],
 ['How can I contact Nour?',['site:contact']],
 ['Where did he get his first job?',['journey:entry']],
 ['Which project handles incoming customer questions?',['communications:identity','communications:what']],
 ['How does the system organize company memory?',['knowledge:identity','knowledge:what']],
 ['What did he do before working in tech?',['journey:entry','journey:sales','journey:commercial']],
 ['How does the portfolio show customer outreach?',['acquisition:identity','acquisition:flow:outreach']],
 ['Which work deals with scheduling service visits?',['h2ops:identity','h2ops:what']],
 ['What is his long-term goal?',['profile:direction','journey:direction']],
 ['How does he combine business and technology?',['profile:work','profile:direction']],
 ['Which project helps employees find internal answers?',['knowledge:identity','knowledge:what','safiy:identity']],
 ['What did he learn about leading a team?',['journey:sales']]
];
let hits1=0,hits3=0,mrr=0; const rows=[];
for(const [q,expected] of tests){const res=search(q,3),ids=res.map(r=>r.id);const rank=ids.findIndex(id=>expected.includes(id));if(rank===0)hits1++;if(rank>=0&&rank<3)hits3++;if(rank>=0)mrr+=1/(rank+1);rows.push({q,expected,got:ids,rank:rank<0?null:rank+1});}
const start=performance.now();for(let i=0;i<100;i++)for(const [q] of tests)search(q,3);const ms=(performance.now()-start)/100/tests.length;
console.log(JSON.stringify({docs:docs.length,queries:tests.length,top1:hits1/tests.length,top3:hits3/tests.length,mrr:mrr/tests.length,avgMsPerQuery:ms,misses:rows.filter(r=>r.rank===null),rows},null,2));
