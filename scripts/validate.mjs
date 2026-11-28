import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS, PROJECT_BY_ID } from '../src/data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../src/data/journey.js';
import { SCENES } from '../src/data/environments.js';
import { parseRoute, normalizePath, routeForSection } from '../src/app/routes.js';
import { renderReadingPage } from '../src/reading/render.js';
import { createStore, initialState } from '../src/app/store.js';
import { createCommandApi, API_VERSION } from '../src/app/commands.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const failures=[];
const passes=[];
let checked=0;

function check(name,condition,details=''){
  checked++;
  if(condition) passes.push(name);
  else failures.push(details?`${name}: ${details}`:name);
}
function read(file){ return fs.readFileSync(path.join(root,file),'utf8'); }
function exists(file){ return fs.existsSync(path.join(root,file)); }

/* ---------- data contracts ---------- */
const retiredIds=['waterair','afuntime','academia','chefskiss','trackit'];
const legacyProjectKeys=['brief','system','demonstrations','visual','technology','impact'];
check('exactly five projects',PROJECTS.length===5,`found ${PROJECTS.length}`);
check('project ids are unique',new Set(PROJECTS.map(p=>p.id)).size===PROJECTS.length);
check('project numbers are 01–05',PROJECTS.map(p=>p.num).join(',')==='01,02,03,04,05');
check('retired projects are not public',PROJECTS.every(p=>!retiredIds.includes(p.id)));
for(const project of PROJECTS){
  for(const key of ['id','num','title','project','category','description','cover','coverAlt']){
    check(`${project.id} has ${key}`,typeof project[key]==='string'&&project[key].length>0);
  }
  check(`${project.id} has no legacy fields`,legacyProjectKeys.every(key=>!(key in project)),JSON.stringify(Object.keys(project)));
  check(`${project.id} has capabilities`,Array.isArray(project.capabilities)&&project.capabilities.length>0);
  check(`${project.id} has overview`,!!project.overview);
  check(`${project.id} has flow`,!!project.flow);
  if(project.overview){
    for(const key of ['whatItIs','challenges','value','cta']){
      check(`${project.id} overview has ${key}`,project.overview[key]!=null);
    }
    check(`${project.id} contribution`,!!project.overview.contribution);
  }
  if(project.flow){
    const ids=new Set(project.flow.nodes.map(n=>n.id));
    check(`${project.id} flow ids unique`,ids.size===project.flow.nodes.length);
    check(`${project.id} flow start exists`,!project.flow.start||ids.has(project.flow.start));
    check(`${project.id} flow connections valid`,project.flow.connections.every(c=>ids.has(c.from)&&ids.has(c.to)));
    check(`${project.id} flow has labels`,Array.isArray(project.flow.labels));
  }
  check(`${project.id} cover exists`,exists(project.cover.split('?')[0]),project.cover);
}

check('six journey chapters',PROFESSIONAL_CHAPTERS.length===6,`found ${PROFESSIONAL_CHAPTERS.length}`);
check('journey ids unique',new Set(PROFESSIONAL_CHAPTERS.map(c=>c.id)).size===PROFESSIONAL_CHAPTERS.length);
for(const chapter of PROFESSIONAL_CHAPTERS){
  for(const key of ['id','num','label','title','period']){
    check(`chapter ${chapter.id} has ${key}`,typeof chapter[key]==='string'&&chapter[key].length>0);
  }
  check(`chapter ${chapter.id} has paragraphs`,Array.isArray(chapter.paragraphs)&&chapter.paragraphs.length>0);
  check(`chapter ${chapter.id} has no visual field`,!('visual' in chapter));
}

check('four environments',SCENES.length===4,`found ${SCENES.length}`);
for(const scene of SCENES) check(`scene asset exists: ${scene.img}`,exists(scene.img),scene.img);
for(const portrait of ['assets/portraits/nour-about.jpg','assets/portraits/nour-contact.jpg']){
  check(`portrait exists: ${portrait}`,exists(portrait));
}

/* ---------- routes ---------- */
const routes=[
  ['/home','home','home','/home'],
  ['/me','me','me','/me'],
  ['/me/brain','brain','me','/me/brain'],
  ['/journey','journey','journey','/journey'],
  [`/journey/${PROFESSIONAL_CHAPTERS[0].id}`,'journey','journey',`/journey/${PROFESSIONAL_CHAPTERS[0].id}`],
  ['/projects','projects','projects','/projects'],
  [`/projects/${PROJECTS[0].id}`,'project','projects',`/projects/${PROJECTS[0].id}`],
  [`/projects/${PROJECTS[0].id}/flow`,'flow','projects',`/projects/${PROJECTS[0].id}/flow`],
  [`/projects/${PROJECTS[0].id}/flow/${PROJECTS[0].flow.nodes[0].id}`,'flow','projects',`/projects/${PROJECTS[0].id}/flow/${PROJECTS[0].flow.nodes[0].id}`],
  ['/contact','contact','contact','/contact'],
  ['/read','reading','reading','/read']
];
for(const [input,name,section,canonical] of routes){
  const parsed=parseRoute(input);
  check(`route ${input}`,!!parsed&&parsed.name===name&&parsed.section===section&&parsed.canonical===canonical,JSON.stringify(parsed));
}
check('legacy /about alias',normalizePath('/about')==='/me');
check('legacy /professional alias',normalizePath('/professional')==='/journey');
check('legacy /simple alias',normalizePath('/simple')==='/read');
check('invalid project route rejected',parseRoute('/projects/not-a-project')===null);
check('invalid flow node rejected',parseRoute(`/projects/${PROJECTS[0].id}/flow/not-a-node`)===null);
check('invalid chapter route rejected',parseRoute('/journey/not-a-chapter')===null);
check('section route helper',routeForSection('home')==='/home'&&routeForSection('journey',{chapterId:'entry'})==='/journey/entry');

/* ---------- build artefacts ---------- */
const buildFiles=['index.html','read.html','spatial2.html','404.html','favicon.svg','robots.txt'];
for(const file of buildFiles) check(`build file exists: ${file}`,exists(file));
const indexHTML=read('index.html');
const readHTML=read('read.html');
const redirectHTML=read('spatial2.html');
check('index uses module entry',/<script type="module" src="src\/main\.js(?:\?[^"]*)?"><\/script>/.test(indexHTML));
check('index has no inline simple view',!indexHTML.includes('simpleView')&&!indexHTML.includes('simple-view'));
check('index has no legacy project system',!indexHTML.includes('projectSystem')&&!indexHTML.includes('data-project-stage'));
check('index has favicon',indexHTML.includes('rel="icon"')&&indexHTML.includes('favicon.svg'));
check('index has social preview',indexHTML.includes('property="og:image"'));
check('index has skip link',indexHTML.includes('class="skip-link"'));
check('index has no archive scripts',!/archive\/|three\.module|os-app2\.js/.test(indexHTML));
check('spatial2 redirects with hash',redirectHTML.includes('location.hash')&&redirectHTML.includes('location.replace'));
check('reading page is generated',readHTML.trim()===renderReadingPage().trim());
check('reading page needs no JS',!/<script\b/i.test(readHTML));
check('reading page has 5 projects',(readHTML.match(/class="reading-project"/g)||[]).length===5);
check('reading page has 6 chapters',(readHTML.match(/class="reading-chapter"/g)||[]).length===6);
check('reading page has flow explanations',(readHTML.match(/class="reading-flow"/g)||[]).length===5);
check('reading page has contributions',(readHTML.match(/reading-project-block reading-contribution/g)||[]).length===5);
check('reading page has skip link',readHTML.includes('class="skip-link"'));
check('reading page has description',readHTML.includes('name="description"'));
check('reading page has social preview',readHTML.includes('property="og:image"'));

/* ---------- CSS cleanup ---------- */
const appCSS=read('src/styles/app.css');
const baseCSS=read('src/styles/base.css');
const deadSelectors=['pw-brief','pw-system','pw-stage-btn','pw-evidence','pw-component','pw-tech','pw-fold','ja-','journey-art'];
for(const token of deadSelectors){
  check(`dead CSS removed: ${token}`,!appCSS.includes(token)&&!baseCSS.includes(token));
}
check('CSS below former size',appCSS.length<130000&&baseCSS.length<60000,`${appCSS.length}/${baseCSS.length} bytes`);

/* ---------- archive separation ---------- */
check('archive exists',exists('archive'));
check('retired project data archived',exists('archive/data/retired-projects.json'));
check('legacy experiments archived',exists('archive/experiments'));
check('legacy assets archived',exists('archive/assets'));
const activeAssets=[];
(function walk(dir){
  for(const entry of fs.readdirSync(path.join(root,dir),{withFileTypes:true})){
    const rel=path.join(dir,entry.name).replaceAll(path.sep,'/');
    if(entry.isDirectory()) walk(rel); else activeAssets.push(rel);
  }
})('assets');
check('active asset set is small',activeAssets.length<=18,`${activeAssets.length} files`);
check('retired covers not active',activeAssets.every(file=>!/(waterair|afuntime|academia|chefskiss|trackit)\./.test(file)));

/* ---------- dist allowlist ---------- */
if(exists('dist')){
  for(const file of buildFiles) check(`dist has ${file}`,exists(`dist/${file}`));
  for(const forbidden of ['archive','tests','docs','scripts','node_modules']){
    check(`dist excludes ${forbidden}`,!exists(`dist/${forbidden}`));
  }
  check('dist excludes build-time reading source',!exists('dist/src/reading'));
  check('dist includes runtime app',exists('dist/src/app/immersive.js'));
  check('dist includes assets',exists('dist/assets'));
  check('dist has nojekyll',exists('dist/.nojekyll'));
}

/* ---------- command API contract ---------- */
const state=createStore({...initialState,ready:true,route:{path:'/home',name:'home',section:'home'}});
const calls=[];
const adapter={
  isBusy:()=>false,
  navigateTo:section=>{calls.push(['navigateTo',section]);return true;},
  openProject:id=>{calls.push(['openProject',id]);return true;},
  openProjectFlow:(id,node)=>{calls.push(['openProjectFlow',id,node]);return true;},
  highlightFlowNode:(id,node)=>{calls.push(['highlightFlowNode',id,node]);return true;},
  openJourneyChapter:id=>{calls.push(['openJourneyChapter',id]);return true;},
  openContact:()=>{calls.push(['openContact']);return true;},
  openReadingView:()=>{calls.push(['openReadingView']);return true;},
  goBack:()=>{calls.push(['goBack']);return true;}
};
const api=createCommandApi(adapter,state);
check('API version',api.apiVersion===API_VERSION&&API_VERSION==='1.0.0');
for(const action of ['navigateTo','openProject','openProjectFlow','highlightFlowNode','openJourneyChapter','openContact','openReadingView','goBack','getCurrentState','getStatus','subscribe']){
  check(`API exposes ${action}`,typeof api[action]==='function');
}
const status=api.getStatus();
check('API status has context',!!status.context&&!!status.context.route&&!!status.context.project);
check('API status lists actions',Array.isArray(status.actions)&&status.actions.includes('navigateTo'));
check('API status ready',status.ready===true&&status.apiVersion===API_VERSION);

const invalidSection=await api.navigateTo('not-a-section');
check('API rejects unknown section',invalidSection.ok===false&&invalidSection.error.code==='UNKNOWN_SECTION');
const invalidProject=await api.openProject('not-a-project');
check('API rejects unknown project',invalidProject.ok===false&&invalidProject.error.code==='UNKNOWN_PROJECT');
const invalidNode=await api.openProjectFlow(PROJECTS[0].id,'not-a-node');
check('API rejects unknown node',invalidNode.ok===false&&invalidNode.error.code==='UNKNOWN_NODE');
const invalidChapter=await api.openJourneyChapter('not-a-chapter');
check('API rejects unknown chapter',invalidChapter.ok===false&&invalidChapter.error.code==='UNKNOWN_CHAPTER');
check('API rejects without adapter calls',calls.length===0,JSON.stringify(calls));

const validNav=await api.navigateTo('home');
check('API accepts known section',validNav.ok===true);
const validProject=await api.openProject(PROJECTS[0].id);
check('API accepts known project',validProject.ok===true);
const validFlow=await api.openProjectFlow(PROJECTS[0].id,PROJECTS[0].flow.nodes[0].id);
check('API accepts known flow node',validFlow.ok===true);
const busyAdapter=createCommandApi({...adapter,isBusy:()=>true},state);
const busyResult=await busyAdapter.openProject(PROJECTS[0].id);
check('API reports BUSY during transitions',busyResult.ok===false&&busyResult.error.code==='BUSY');

/* ---------- voice pipeline contracts ---------- */
const companionSource=read('src/ai-nour/companion.js');
const livePromptSource=read('ai-nour/src/sessions/manager.js');
check('voice worklet exists',exists('src/ai-nour/audio-worklet.js'));
check('voice pipeline uses AudioWorklet',/audioWorklet\.addModule/.test(companionSource)&&/nupa-mic-resampler/.test(companionSource));
check('voice fallback has anti-alias filters',/createBiquadFilter/.test(companionSource)&&/resampleTo16k/.test(companionSource));
check('voice playback respects provider mime rate',/parseAudioFormat/.test(companionSource)&&/part\.inlineData\.mimeType/.test(companionSource));
check('voice interruptions use gain ramps',/linearRampToValueAtTime/.test(companionSource)&&/stopPlayback\(20\)/.test(companionSource));
check('voice recovers audio contexts on visibility/device changes',/visibilitychange/.test(companionSource)&&/devicechange/.test(companionSource));
check('configured live voice is Sadachbia',read('ai-nour/src/config.js').includes("liveVoice: 'Sadachbia'")&&read('ai-nour/wrangler.production.toml').includes('LIVE_VOICE = "Sadachbia"'));
check('live prompt is structured',['CORE IDENTITY AND POLICIES','CONVERSATIONAL PERSONALITY','VOICE DELIVERY','PORTFOLIO KNOWLEDGE','PRESENTATION AND TOOL USE'].every((section)=>livePromptSource.includes(section)));
check('live introduction is natural and short',/Start like a person, not a presenter/.test(companionSource)&&/ask one genuine question/.test(companionSource));
check('live duration defaults to fifteen minutes',/LIVE_SESSION_SECONDS = "900"/.test(read('ai-nour/wrangler.production.toml'))&&/MAX_LIVE_SESSION_SECONDS = "900"/.test(read('ai-nour/wrangler.production.toml')));
check('live reservation is conservative for fifteen minutes',/LIVE_TOKEN_RESERVATION_PER_MINUTE_USD_MICROS = "30000"/.test(read('ai-nour/wrangler.production.toml')));
check('bottom presentation bar is removed',!/ai-pres-bar/.test(companionSource)&&!/ai-pres-bar/.test(read('src/app/presentation.js'))&&!/ai-pres-bar/.test(read('src/ai-nour/companion.css')));
check('unified Nupa pill exposes voice and presentation controls',/presentation-pause/.test(companionSource)&&/presentation-resume/.test(companionSource)&&/end-live/.test(companionSource)&&/toggleMicMute/.test(companionSource));
check('presentation supports phrase highlighting',/getTargetForElement/.test(read('src/app/presentation.js'))&&/findTextRange/.test(read('src/app/presentation.js'))&&/quote/.test(read('ai-nour/src/tools/registry.js')));
check('interface awareness captures selection and interaction context',/selectionchange/.test(companionSource)&&/pointerover/.test(companionSource)&&/INTERACTION CONTEXT/.test(companionSource));
check('context updates use the silent context channel',/sendContextUpdate/.test(companionSource)&&/LIVE CONTEXT \(silent/.test(companionSource));
check('explicit voice end releases the lease',/leaseReleased/.test(read('ai-nour/src/routes/session.js')));


/* ---------- output ---------- */
const summary={
  passed:passes.length,
  failed:failures.length,
  checked,
  projects:PROJECTS.length,
  chapters:PROFESSIONAL_CHAPTERS.length,
  apiVersion:API_VERSION,
  activeAssets:activeAssets.length
};
if(failures.length){
  console.error(`Validation failed: ${failures.length} of ${checked} checks`);
  for(const failure of failures) console.error(`  ✗ ${failure}`);
  process.exitCode=1;
}else{
  console.log(`Validation passed: ${checksLabel(checked)}`);
  console.log(JSON.stringify(summary,null,2));
}
function checksLabel(count){ return `${count} checks`; }
