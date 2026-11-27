import { PROJECTS, PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_TAGLINE, PROFESSIONAL_CHAPTERS } from '../data/journey.js';
import { PROFILE_POSITIONING, PROFILE_PROOF, ABOUT_ME_INTRO, ABOUT_ME_THINK, ABOUT_ME_WORK, ABOUT_ME_DIRECTION } from '../data/profile.js';
import { SCENES } from '../data/environments.js';
import { parseRoute, normalizePath } from './routes.js';
import { createStore, initialState } from './store.js';
import { installCommandApi } from './commands.js';
import { createPresentationController } from './presentation.js?v=13';


/* Project data now lives in the approved PROJECTS registry in os-app2.js. */


/* Approved project and environment data live in src/data/. */

const MAIN_CARDS=[
  {type:'journey',deck:'main'},
  {type:'profile',deck:'main'},
  {type:'projects',deck:'main'}
];
const PROJECT_CARDS=PROJECTS.map(p=>({type:'project',id:p.id,deck:'projects'}));
const ALL_CARDS=[...MAIN_CARDS,...PROJECT_CARDS];
const HOME_MAIN=1;

let deck='main';
let mainIndex=HOME_MAIN;
let projectIndex=0;
let mode='home';
let sceneIndex=0;
let entered=false;
let introStarted=false;
let suppressClick=false;
let drag=null;
let currentRoute=null;
let routeNotFound=false;

const appStore=createStore(initialState);
let presentationController=null;

const $=id=>document.getElementById(id);
const pad=n=>String(n).padStart(2,'0');
const tint=(hex,a)=>{
  const h=hex.replace('#','');
  const n=parseInt(h,16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
};
function announce(text){ const el=$('live'); if(el) el.textContent=text; }

/* ---------- local time ---------- */
function formatClock(date=new Date()){
  return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
}
function greetingFor(hour){
  return hour<12?'Good morning.':hour<17?'Good afternoon.':'Good evening.';
}
function renderLocalClock(){
  const now=new Date();
  const time=formatClock(now);
  ['tbTime','nowTime','ccTime'].forEach(id=>{ const el=$(id); if(el) el.textContent=time; });
  const greet=$('greetingText');
  if(greet) greet.textContent=greetingFor(now.getHours());
  const widget=document.querySelector('.now-widget');
  if(widget){
    const scene=$('nowScene')?$('nowScene').textContent:'';
    widget.setAttribute('aria-label',`Local time ${time}, ${scene}`);
  }
}
function initLocalConditions(){
  renderLocalClock();
  setInterval(renderLocalClock,15000);
  document.addEventListener('visibilitychange',()=>{ if(!document.hidden) renderLocalClock(); });
}
const currentCards=()=>deck==='main'?MAIN_CARDS:PROJECT_CARDS;
const activeIndex=()=>deck==='main'?mainIndex:projectIndex;
function setActiveIndex(i){ if(deck==='main') mainIndex=i; else projectIndex=i; }
function activeCard(){ return currentCards()[activeIndex()]; }

function cardLabel(item){
  if(item.type==='journey') return 'My Journey';
  if(item.type==='profile') return 'Nour Chkair';
  if(item.type==='projects') return 'Projects';
  return PROJECT_BY_ID[item.id].title;
}
function cardSub(item){
  if(item.type==='journey') return 'Professional';
  if(item.type==='profile') return 'About';
  if(item.type==='projects') return 'Selected work';
  return PROJECT_BY_ID[item.id].category;
}
/* ---------- scenes ---------- */
function buildScenes(){
  $('sceneParallax').innerHTML=SCENES.map((s,i)=>`
    <div class="scene${i===0?' is-active':''}" data-scene="${i}">
      <img src="${s.img}" alt="" decoding="async">
    </div>`).join('');
  $('motes').innerHTML=Array.from({length:16},(_,i)=>{
    const left=(i*47+11)%100;
    const top=16+((i*31)%74);
    const dur=13+(i%6)*2.4;
    const delay=-((i*2.7)%18);
    const size=i%4===0?2.4:1.4;
    return `<i style="left:${left}%;top:${top}%;animation-delay:${delay}s;animation-duration:${dur}s;width:${size}px;height:${size}px"></i>`;
  }).join('');
  $('sceneDots').innerHTML=SCENES.map((s,i)=>`<button class="scene-dot" data-scene-dot="${i}" aria-label="Show ${s.name}" aria-current="${i===0}"></button>`).join('');
  $('sceneDots').querySelectorAll('[data-scene-dot]').forEach(el=>{
    el.addEventListener('click',()=>setScene(+el.dataset.sceneDot));
  });
}
function setScene(i,remember=true){
  sceneIndex=((i%SCENES.length)+SCENES.length)%SCENES.length;
  const s=SCENES[sceneIndex];
  document.querySelectorAll('.scene').forEach((el,idx)=>el.classList.toggle('is-active',idx===sceneIndex));
  document.documentElement.style.setProperty('--accent',s.accent);
  document.documentElement.style.setProperty('--accent-soft',tint(s.accent,.16));
  document.body.dataset.scene=String(sceneIndex);
  const utilitySceneName=$('utilitySceneName');
  if(utilitySceneName){ utilitySceneName.textContent=s.name; utilitySceneName.title=s.name; }
  const utilitySceneThumb=$('utilitySceneThumb');
  if(utilitySceneThumb) utilitySceneThumb.src=s.img;
  $('tbScene').textContent=s.name;
  $('nowScene').textContent=s.name;
  $('sceneDots').querySelectorAll('[data-scene-dot]').forEach((el,idx)=>el.setAttribute('aria-current',idx===sceneIndex?'true':'false'));
  if(remember){
    announce(`Environment ${sceneIndex+1} of 4: ${s.name}`);
    try{ localStorage.setItem('nour-os-scene',String(sceneIndex)); }catch(e){}
  }
}
function initScene(){
  let saved=0;
  try{ const v=localStorage.getItem('nour-os-scene'); if(v!==null) saved=Math.max(0,Math.min(3,+v||0)); }catch(e){}
  setScene(saved,false);
}

/* ---------- cards ---------- */
function collageHTML(){
  return `<div class="card-art art-collage">
    ${PROJECTS.slice(0,5).map(p=>`<img src="${p.cover}" alt="" decoding="async">`).join('')}
    <div class="art-tint"></div>
  </div>`;
}
function artHTML(item){
  if(item.type==='journey'){
    return `<div class="card-art art-journey art-journey--card">
      <svg class="journey-card-path" viewBox="0 0 400 520" fill="none" aria-hidden="true">
        <path d="M52 434c74 0 74-72 136-112s74-16 118-86 26-76 42-106" stroke="currentColor" stroke-width="1.3" opacity=".8"/>
        <path d="M64 462c68-10 78-70 132-108s72-14 108-72" stroke="currentColor" stroke-width=".8" opacity=".3"/>
        <circle cx="52" cy="434" r="3.2" fill="currentColor"/>
        <circle cx="188" cy="322" r="3.2" fill="currentColor"/>
        <circle cx="306" cy="236" r="3.2" fill="currentColor"/>
        <circle cx="348" cy="130" r="3.2" fill="currentColor"/>
        <path d="m332 122 20-9-4 20" opacity=".8"/>
        <circle cx="200" cy="300" r="88" opacity=".1"/>
        <circle cx="200" cy="300" r="130" opacity=".05"/>
      </svg>
      <span class="journey-card-word" aria-hidden="true">JOURNEY</span>
      <span class="journey-card-meta" aria-hidden="true">06 Chapters · 2026</span>
      <div class="art-wash"></div><div class="art-grid"></div><div class="art-tint"></div>
    </div>`;
  }
  if(item.type==='profile'){
    return `<div class="card-art art-profile"><img src="assets/portraits/nour-about.jpg" alt="Nour Chkair" decoding="async"><div class="art-wash"></div><div class="art-tint"></div></div>`;
  }
  if(item.type==='projects') return collageHTML();
  const p=PROJECT_BY_ID[item.id];
  return `<div class="card-art art-project"><img src="${p.cover}" alt="${escHTML(p.coverAlt||'')}" decoding="async"><div class="art-wash"></div><div class="art-grid"></div><div class="art-tint"></div></div>`;
}
function bodyHTML(item){
  if(item.type==='journey'){
    return `<div class="card-kicker">Professional / My Journey</div>
      <h2>My Journey.</h2>
      <p class="card-desc">From customers to commerce to systems.</p>
      <div class="card-actions"><button class="cta" data-journey>Explore my journey <span aria-hidden="true">↗</span></button></div>`;
  }
  if(item.type==='profile'){
    return `<div class="card-kicker">Business strategy / Sales / Applied AI</div>
      <h2 id="greetingText">Good evening.</h2>
      <p class="card-position">${escHTML(PROFILE_POSITIONING)}</p>
      <p class="card-proof">${escHTML(PROFILE_PROOF)}</p>
      <div class="card-actions">
        <button class="cta" data-open-deck>View projects <span aria-hidden="true">↗</span></button>
        <button class="ghost-btn" data-contact>Contact</button>
      </div>`;
  }
  if(item.type==='projects'){
    return `<h2>Selected work.</h2>
      <p class="card-desc">Work across business and technology.</p>
      <div class="card-actions"><button class="cta" data-open-deck>Open project deck <span aria-hidden="true">→</span></button></div>`;
  }
  const p=PROJECT_BY_ID[item.id];
  return `<div class="card-kicker">${escHTML(p.category)} / ${escHTML(p.project)}</div>
    <h2>${escHTML(p.title)}</h2>
    ${p.subtitle?`<p class="card-subtitle">${escHTML(p.subtitle)}</p>`:''}
    <p class="card-desc">${escHTML(p.description)}</p>
    <div class="card-bottom-row">
      <div class="card-tags">${p.capabilities.map(s=>`<span>${escHTML(s)}</span>`).join('')}</div>
      <div class="card-actions"><button class="cta card-cta" data-open="${p.id}">Open project <span aria-hidden="true">↗</span></button></div>
    </div>`;
}
function cardHTML(item,i,deckName){
  return `<article class="os-card" data-type="${item.type}" data-deck="${deckName}" data-deck-index="${i}" data-card="${deckName}-${i}" aria-label="${cardLabel(item)} card" tabindex="0">
    ${artHTML(item)}
    <div class="card-caption"><b>${cardLabel(item)}</b><span>${cardSub(item)}</span></div>
    <div class="card-body">${bodyHTML(item)}</div>
  </article>`;
}
let cardEls=[];
function buildCards(){
  $('cardStage').innerHTML=
    MAIN_CARDS.map((c,i)=>cardHTML(c,i,'main')).join('')+
    PROJECT_CARDS.map((c,i)=>cardHTML(c,i,'projects')).join('');
  cardEls=[...document.querySelectorAll('.os-card')];
  cardEls.forEach(el=>{
    const elDeck=el.dataset.deck;
    const idx=+el.dataset.deckIndex;
    const item=(elDeck==='main'?MAIN_CARDS:PROJECT_CARDS)[idx];
    el.addEventListener('click',e=>{
      if(e.target.closest('button,a')) return;
      if(elDeck!==deck) return;
      if(idx===activeIndex()){
        if(item.type==='profile'){ openAbout(el); return; }
        if(item.type==='journey'){ goProfessional(); return; }
        if(item.type==='projects'){ openProjectDeck(); return; }
        if(item.type==='project'){ openProject(item.id); return; }
      } else goCard(idx);
    });
    el.addEventListener('keydown',e=>{
      if(elDeck!==deck) return;
      if(idx===activeIndex()){
        if((item.type==='profile'||item.type==='journey')&&(e.key==='Enter'||e.key===' ')){
          e.preventDefault();
          if(item.type==='profile') openAbout(el); else goProfessional();
        }
        return;
      }
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        goCard(idx);
      }
    });
  });
  $('cardStage').addEventListener('click',e=>{
    if(suppressClick){ e.preventDefault(); e.stopPropagation(); suppressClick=false; return; }
    const open=e.target.closest('[data-open]');
    if(open){ e.stopPropagation(); openProject(open.dataset.open); return; }
    if(e.target.closest('[data-open-deck]')){ e.stopPropagation(); openProjectDeck(); return; }
    if(e.target.closest('[data-journey]')){ e.stopPropagation(); goProfessional(); return; }
    if(e.target.closest('[data-contact]')){ e.stopPropagation(); setMode('contact'); }
  },true);
}
function offsetFor(i,active,n){
  let d=i-active;
  if(d>n/2) d-=n;
  if(d<-n/2) d+=n;
  return d;
}
function updateCards(){
  const cards=currentCards();
  const ai=activeIndex();
  cardEls.forEach(el=>{
    const elDeck=el.dataset.deck;
    if(elDeck!==deck){
      el.classList.remove('pos-0','pos-1','pos--1','pos-2','pos--2','pos-hidden','is-active');
      el.classList.add('pos-hidden');
      el.inert=true;
      el.setAttribute('aria-hidden','true');
      el.tabIndex=-1;
      const b=el.querySelector('.card-body'); if(b) b.inert=true;
      return;
    }
    const idx=+el.dataset.deckIndex;
    const d=offsetFor(idx,ai,cards.length);
    const pos=d===0?'pos-0':d===1?'pos-1':d===-1?'pos--1':d===2?'pos-2':d===-2?'pos--2':'pos-hidden';
    el.classList.remove('pos-0','pos-1','pos--1','pos-2','pos--2','pos-hidden');
    el.classList.add(pos);
    const hidden=pos==='pos-hidden';
    const isActive=d===0;
    const isProfile=isActive&&cards[idx].type==='profile';
    const isJourney=isActive&&cards[idx].type==='journey';
    const isOpener=isProfile||isJourney;
    el.inert=hidden;
    el.setAttribute('aria-hidden',hidden?'true':'false');
    el.setAttribute('role',isOpener||!isActive?'button':'group');
    el.setAttribute('aria-label',isProfile?'Open about Nour Chkair':isJourney?'Open my journey':isActive?`${cardLabel(cards[idx])} card`:`Focus ${cardLabel(cards[idx])} card`);
    el.tabIndex=hidden?-1:(isActive&&!isOpener?-1:0);
    el.classList.toggle('is-active',isActive);
    const body=el.querySelector('.card-body');
    if(body){ body.inert=!isActive; if(isActive) body.scrollTop=0; }
  });
  updateDots();
}
function goCard(i,announceIt=true){
  const n=currentCards().length;
  setActiveIndex(((i%n)+n)%n);
  updateCards();
  if(document.body.classList.contains('ready')) setActiveNav(deckNavName());
  if(announceIt&&document.body.classList.contains('ready')) announce(`${cardLabel(activeCard())}, ${activeIndex()+1} of ${n}`);
  if(deck==='projects') schedulePrewarm(PROJECT_CARDS[activeIndex()].id);
}
function navCard(dir){
  if(mode!=='home') setMode('home');
  goCard(activeIndex()+dir);
}
function renderDots(){
  const cards=currentCards();
  $('cardDots').innerHTML=cards.map((c,i)=>`<button class="card-dot" data-dot-index="${i}" aria-label="${cardLabel(c)}" aria-current="${i===activeIndex()}"></button>`).join('');
  $('cardDots').querySelectorAll('[data-dot-index]').forEach(el=>{
    el.addEventListener('click',()=>goCard(+el.dataset.dotIndex));
  });
}
function updateDots(){
  $('cardDots').querySelectorAll('[data-dot-index]').forEach((el,i)=>el.setAttribute('aria-current',i===activeIndex()?'true':'false'));
}
function updateDeckChrome(){
  document.body.dataset.deck=deck;
}
function applyTooltips(root=document){
  if(!root) return;
  const selector=[
    '.card-kicker','.card-body .welcome','.card-body p','.card-tags span','.card-foot',
    '.card-caption b','.card-caption span'
  ].join(',');
  root.querySelectorAll(selector).forEach(el=>{
    const text=(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();
    if(text) el.title=text;
  });
}
const navButtons=[...document.querySelectorAll('[data-nav]')];
function setActiveNav(name){
  navButtons.forEach(btn=>{
    const active=btn.dataset.nav===name;
    btn.classList.toggle('is-active',active);
    if(active) btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current');
  });
  const brand=$('brandHome');
  if(brand){
    const home=name==='home';
    brand.classList.toggle('is-active',home);
    if(home) brand.setAttribute('aria-current','page'); else brand.removeAttribute('aria-current');
  }
}
function mainNavForCard(){
  const card=activeCard();
  return card&&card.type==='projects'?'projects':'me';
}
function deckNavName(){
  return deck==='projects'?'projects':mainNavForCard();
}
function syncUtilityToggleLabel(){}
function setUtilityOpen(){}
function resetToHomeChrome(){
  setUtilityOpen(false);
  if($('aboutView').classList.contains('open')) closeAbout({restoreFocus:false,immediate:true,keepRoute:true});
  if($('project').classList.contains('open')) closeProject({restoreFocus:false,silent:true,immediate:true,keepRoute:true});
  if(document.body.classList.contains('minimal')){
    document.body.classList.remove('minimal');
    updateMinimalToggle();
  }
  if(mode!=='home'){ mode='home'; document.body.dataset.mode='home'; }
}
function goHome(){
  resetToHomeChrome();
  openMainDeck();
  setActiveNav('home');
  syncHash('/home');
}
function goProjects(){
  const retain=currentProjectId;
  resetToHomeChrome();
  openProjectDeck(retain||undefined);
  setActiveNav('projects');
}

/* ---------- about me workspace ---------- */
let mePanelView='intro';

function meParagraphs(paragraphs){
  return paragraphs.map(text=>`<p>${escHTML(text)}</p>`).join('');
}
function meViewBarHTML(count){
  return `<div class="me-view-bar">
    <button class="me-back" type="button" data-me-back aria-label="Back to introduction">
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg><span>About</span>
    </button>
    <span class="me-view-count">${escHTML(count)}</span>
  </div>`;
}
function meIntroHTML(){
  return `<article class="pw-window me-panel me-panel--intro" data-me-view="intro" aria-labelledby="meIntroTitle">
    <figure class="me-intro-portrait">
      <img src="assets/portraits/nour-about.jpg" alt="Portrait of Nour Chkair" loading="lazy" decoding="async">
    </figure>
    <header class="me-intro-head">
      <span class="me-eyebrow">About me</span>
      <h1 id="meIntroTitle" tabindex="-1">Hey, I'm Nour!</h1>
      <p class="me-subtitle">${escHTML(PROFILE_POSITIONING)}</p>
    </header>
    <div class="me-intro-copy">${meParagraphs(ABOUT_ME_INTRO)}</div>
    <div class="me-intro-next">
      <button class="me-brain-cta" type="button" data-me-brain aria-controls="aboutMeContent">
        <span>My Brain</span><span class="me-brain-cta-mark" aria-hidden="true">↗</span>
      </button>
    </div>
  </article>`;
}
function meBrainHTML(){
  return `<section class="me-view me-view--brain" data-me-view="brain" aria-label="My brain">
    ${meViewBarHTML('My brain')}
    <div class="me-brain">
      <article class="pw-window me-panel me-brain-panel" aria-labelledby="meThinkTitle">
        <span class="me-kicker">Mindset</span>
        <h2 id="meThinkTitle" tabindex="-1">How I think.</h2>
        ${meParagraphs(ABOUT_ME_THINK)}
      </article>
      <article class="pw-window me-panel me-brain-panel" aria-labelledby="meWorkTitle">
        <span class="me-kicker">Approach</span>
        <h2 id="meWorkTitle" tabindex="-1">How I work.</h2>
        ${meParagraphs(ABOUT_ME_WORK)}
      </article>
      <article class="pw-window me-panel me-panel--direction" aria-labelledby="meDirectionTitle">
        <div class="me-direction-copy">
          <span class="me-kicker">Direction</span>
          <h2 id="meDirectionTitle" tabindex="-1">What drives me.</h2>
          ${meParagraphs(ABOUT_ME_DIRECTION)}
        </div>
        <div class="me-direction-art" aria-hidden="true">
          <svg viewBox="0 0 180 200" fill="none" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 176c44 0 66-24 92-44s40-16 50-44 3-44 3-44" opacity=".75"/>
            <path d="M30 190c42-8 58-28 84-46s40-14 48-38" opacity=".28"/>
            <circle cx="22" cy="176" r="2.6" fill="currentColor" stroke="none"/>
            <circle cx="114" cy="132" r="2.6" fill="currentColor" stroke="none"/>
            <circle cx="167" cy="44" r="2.6" fill="currentColor" stroke="none"/>
            <path d="m155 39 15-8-2 17" opacity=".8"/>
            <circle cx="112" cy="92" r="34" opacity=".14"/>
            <circle cx="112" cy="92" r="56" opacity=".08"/>
          </svg>
        </div>
      </article>
    </div>
  </section>`;
}
function renderAboutMePanel(view,opts={}){
  const host=$('aboutMeContent');
  if(!host) return;
  const next=view==='brain'?'brain':'intro';
  mePanelView=next;
  host.innerHTML=next==='brain'?meBrainHTML():meIntroHTML();
  host.dataset.view=next;
  host.scrollTop=0;
  const panel=host.closest('.about-me-panel');
  if(panel) panel.dataset.meView=next;
  if(opts.animate!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    const viewEl=host.querySelector('[data-me-view]');
    if(viewEl&&viewEl.animate) viewEl.animate([
      {opacity:0,transform:'translateY(9px)'},
      {opacity:1,transform:'none'}
    ],{duration:300,easing:'cubic-bezier(.2,.8,.2,1)'});
  }
}
function setMeBrainMode(active){
  const ov=$('aboutView');
  if(!ov) return;
  ov.classList.toggle('me-brain-open',!!active);
}
function setAboutMeView(view,opts={}){
  const next=view==='brain'?'brain':'intro';
  if(next==='intro') setMeBrainMode(false);
  renderAboutMePanel(next,{animate:opts.animate!==false});
  if(next==='brain') setMeBrainMode(true);
  const host=$('aboutMeContent');
  if(!host) return;
  if(opts.focus==='view'&&next==='brain'){
    host.querySelector('.me-view h2')?.focus({preventScroll:true});
  }else if(opts.focus==='brainButton'&&next==='intro'){
    host.querySelector('[data-me-brain]')?.focus({preventScroll:true});
  }else if(opts.focus==='intro'&&next==='intro'){
    host.querySelector('#meIntroTitle')?.focus({preventScroll:true});
  }
  publishState();
}
function resetAboutMeWorkspace(){
  setMeBrainMode(false);
  renderAboutMePanel('intro',{animate:false});
  const host=$('aboutMeContent');
  if(host) host.scrollTop=0;
}
function bindAboutMeWorkspace(){
  const host=$('aboutMeContent');
  if(!host) return;
  host.addEventListener('click',e=>{
    const brain=e.target.closest('[data-me-brain]');
    if(brain){ setAboutMeView('brain',{focus:'view'}); syncHash('/me/brain'); return; }
    const back=e.target.closest('[data-me-back]');
    if(back){ setAboutMeView('intro',{focus:'brainButton'}); syncHash('/me'); }
  });
}

let professionalChapterId=null;
function professionalChapterHTML(chapter){
  const total=PROFESSIONAL_CHAPTERS.length;
  const roles=chapter.roles&&chapter.roles.length
    ? `<div class="pro-role-strip" role="group" aria-label="Roles and dates">
        ${chapter.roles.map(role=>`<div class="pro-role">
          <span class="pro-role-org">${escHTML(role.org)}</span>
          <span class="pro-role-title">${escHTML(role.role)}</span>
          <span class="pro-role-date">${escHTML(role.period)}</span>
        </div>`).join('')}
      </div>`
    : '';
  const milestoneTitle=chapter.milestonesTitle||'Milestones';
  const milestones=chapter.milestones&&chapter.milestones.length
    ? `<div class="pro-milestone-block" role="group" aria-label="${escHTML(milestoneTitle)}">
        <span class="pro-milestone-kicker">${escHTML(milestoneTitle)}</span>
        <div class="pro-milestones">
          ${chapter.milestones.map((item,i)=>{
            const primary=i===0;
            const wide=String(item.value).length>8||!/\d/.test(String(item.value));
            return `<div class="pro-milestone${primary?' is-primary':''}"><b class="${wide?'is-wide':''}">${escHTML(item.value)}</b><span>${escHTML(item.label)}</span></div>`;
          }).join('')}
        </div>
      </div>`
    : '';
  const detailList=chapter.details&&chapter.details.length
    ? `<ul class="pro-aside-list">${chapter.details.map(item=>`<li>${escHTML(item)}</li>`).join('')}</ul>`
    : '';
  const detailSubhead=chapter.detailsTitle&&chapter.detailsTitle!=='At a glance'
    ? `<span class="pro-aside-subhead">${escHTML(chapter.detailsTitle)}</span>`
    : '';
  const focusList=chapter.interests&&chapter.interests.length
    ? `<span class="pro-aside-subhead">${escHTML(chapter.interestsTitle||'Focus areas')}</span><ul class="pro-aside-list">${chapter.interests.map(item=>`<li>${escHTML(item)}</li>`).join('')}</ul>`
    : '';
  const ambitionList=chapter.ambitions&&chapter.ambitions.length
    ? `<span class="pro-aside-subhead">${escHTML(chapter.ambitionsTitle||'Long-term ambitions')}</span><ul class="pro-aside-list">${chapter.ambitions.map(item=>`<li>${escHTML(item)}</li>`).join('')}</ul>`
    : '';
  const atAGlance=(detailList||focusList||ambitionList)
    ? `<section class="pro-aside-block pro-aside-block--glance">
        <span class="pro-side-label">At a glance</span>
        ${detailSubhead}${detailList}${focusList}${ambitionList}
      </section>`
    : '';
  const caps=chapter.capabilities&&chapter.capabilities.length
    ? `<section class="pro-aside-block">
        <span class="pro-side-label">${escHTML(chapter.capabilitiesLabel||'Core capabilities')}</span>
        <div class="pro-chips">${chapter.capabilities.map(item=>`<span>${escHTML(item)}</span>`).join('')}</div>
      </section>`
    : '';
  const direction=chapter.direction
    ? `<div class="pro-direction"><span>How it shaped the next step</span><p>${escHTML(chapter.direction)}</p></div>`
    : '';
  return `<div class="journey-panel-grid">
    <section class="pw-window journey-panel journey-panel--main" aria-labelledby="proChapterTitle">
      <div class="journey-panel-scroll">
        <div class="pro-chapter-head">
          <span class="pro-chapter-kicker">${chapter.num} / ${String(total).padStart(2,'0')} · ${escHTML(chapter.label)} · ${escHTML(chapter.period)}</span>
          <h2 id="proChapterTitle">${escHTML(chapter.title)}</h2>
        </div>
        ${roles}
        ${milestones}
        <div class="pro-narrative">${chapter.paragraphs.map(p=>`<p>${escHTML(p)}</p>`).join('')}</div>
      </div>
    </section>
    <section class="pw-window journey-panel journey-panel--side" aria-label="Chapter summary">
      <div class="journey-panel-scroll">
        ${atAGlance}
        ${caps}
        ${direction}
      </div>
    </section>
  </div>`;
}
function selectProfessionalChapter(id,opts={}){
  const float=$('aboutJourneyFloat'), body=$('aboutDetailBody');
  const timeline=float?.querySelector('.pro-timeline');
  const host=body?.querySelector('#proChapter');
  if(!timeline||!host) return;
  const index=PROFESSIONAL_CHAPTERS.findIndex(chapter=>chapter.id===id);
  if(index<0) return;
  const chapter=PROFESSIONAL_CHAPTERS[index];
  const total=PROFESSIONAL_CHAPTERS.length;
  const prev=PROFESSIONAL_CHAPTERS[index-1], next=PROFESSIONAL_CHAPTERS[index+1];
  professionalChapterId=chapter.id;
  const buttons=[...timeline.querySelectorAll('[data-pro-chapter]')];
  buttons.forEach(btn=>{
    const on=btn.dataset.proChapter===chapter.id;
    btn.classList.toggle('is-active',on);
    btn.setAttribute('aria-selected',String(on));
    btn.tabIndex=on?0:-1;
    if(on&&opts.focus) btn.focus({preventScroll:true});
  });
  timeline.style.setProperty('--pro-progress',`${(index/(PROFESSIONAL_CHAPTERS.length-1))*100}%`);
  host.setAttribute('aria-labelledby',`proTab-${chapter.id}`);
  host.innerHTML=professionalChapterHTML(chapter);
  body.scrollTop=0;
  const prevBtn=$('proTimelinePrev'), nextBtn=$('proTimelineNext'), count=$('proTimelineCount');
  if(prevBtn){
    prevBtn.disabled=!prev;
    prevBtn.dataset.proPrev=prev?prev.id:'';
    prevBtn.setAttribute('aria-label',prev?`Previous chapter: ${prev.title}`:'No previous chapter');
  }
  if(nextBtn){
    nextBtn.disabled=!next;
    nextBtn.dataset.proNext=next?next.id:'';
    nextBtn.setAttribute('aria-label',next?`Next chapter: ${next.title}`:'No next chapter');
  }
  if(count) count.textContent=`${chapter.num} / ${String(total).padStart(2,'0')}`;
  if(opts.animate!==false&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
    host.animate([{opacity:.25,transform:'translateY(7px)'},{opacity:1,transform:'none'}],{duration:260,easing:PROJECT_OPEN_EASE});
  }
  if(opts.syncRoute) syncHash(`/journey/${chapter.id}`);
  publishState();
  if(opts.announce!==false) announce(`${chapter.num} ${chapter.title}`);
  if(opts.focusChapter) setTimeout(()=>{
    if(professionalChapterId!==chapter.id) return;
    host.focus({preventScroll:true});
  },opts.animate===false?0:60);
}
function renderProfessionalView(body){
  const float=$('aboutJourneyFloat');
  if(!float) return;
  const steps=PROFESSIONAL_CHAPTERS.map((chapter,i)=>`<button class="pro-step" type="button" role="tab" id="proTab-${chapter.id}" data-pro-chapter="${chapter.id}" aria-label="${chapter.num} ${escHTML(chapter.title)} — ${escHTML(chapter.period)}" aria-selected="${i===0?'true':'false'}" aria-controls="proChapter" tabindex="${i===0?'0':'-1'}"><span class="pro-step-dot" aria-hidden="true"></span><span class="pro-step-num">${chapter.num}</span><span class="pro-step-label">${escHTML(chapter.label)}</span><span class="pro-step-period">${escHTML(chapter.period)}</span></button>`).join('');
  float.innerHTML=`<header class="pro-float-head">
      <span class="pro-eyebrow">My Journey / Professional experience</span>
      <h1>My Journey</h1>
      <p class="pro-tagline">${escHTML(PROFESSIONAL_TAGLINE)}</p>
    </header>
    <div class="pro-timeline-panel">
      <div class="pro-timeline-top">
        <span class="pro-timeline-kicker">My Journey / Chapters</span>
        <div class="pro-timeline-nav">
          <button class="pro-timeline-btn" type="button" id="proTimelinePrev" disabled aria-label="No previous chapter"><span aria-hidden="true">←</span> Prev</button>
          <span class="pro-timeline-count" id="proTimelineCount">01 / 06</span>
          <button class="pro-timeline-btn" type="button" id="proTimelineNext" aria-label="Next chapter"><span>Next</span> <span aria-hidden="true">→</span></button>
        </div>
      </div>
      <div class="pro-timeline pro-timeline--float" id="proTimeline" role="tablist" aria-label="My Journey chapters" style="--pro-progress:0%">
        <div class="pro-timeline-rail" aria-hidden="true"><span class="pro-timeline-track"><span class="pro-timeline-fill"></span></span></div>
        ${steps}
      </div>
    </div>`;
  float.setAttribute('aria-hidden','false');
  body.innerHTML=`<div class="professional-view professional-view--merged pro-journey-body">
    <section class="pro-chapter" id="proChapter" role="tabpanel" tabindex="0"></section>
  </div>`;
  const timeline=float.querySelector('.pro-timeline');
  timeline.addEventListener('click',e=>{
    const btn=e.target.closest('[data-pro-chapter]');
    if(btn) selectProfessionalChapter(btn.dataset.proChapter,{animate:true,syncRoute:true});
  });
  timeline.addEventListener('keydown',e=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key)) return;
    const buttons=[...timeline.querySelectorAll('[data-pro-chapter]')];
    const current=buttons.indexOf(document.activeElement);
    if(current<0) return;
    e.preventDefault();
    let next=current;
    if(e.key==='ArrowLeft'||e.key==='ArrowUp') next=(current-1+buttons.length)%buttons.length;
    if(e.key==='ArrowRight'||e.key==='ArrowDown') next=(current+1)%buttons.length;
    if(e.key==='Home') next=0;
    if(e.key==='End') next=buttons.length-1;
    selectProfessionalChapter(buttons[next].dataset.proChapter,{animate:true,focus:true,syncRoute:true});
  });
  float.querySelector('.pro-timeline-nav')?.addEventListener('click',e=>{
    const btn=e.target.closest('[data-pro-prev],[data-pro-next]');
    if(!btn) return;
    const id=btn.dataset.proPrev||btn.dataset.proNext;
    if(id) selectProfessionalChapter(id,{animate:true,focusChapter:true,syncRoute:true});
  });
  selectProfessionalChapter(PROFESSIONAL_CHAPTERS[0].id,{animate:false,announce:false});
}

/* ---------- about overlay (Me workspace + My Journey) ---------- */
let aboutOpen=false, aboutClosing=false, aboutStackAnim=null;
let aboutRestoreTimer=null, aboutPanelFlight=null, aboutSourceCard=null;
const ABOUT_FLIGHT_MS=460;
const ABOUT_PANEL_OPEN_MS=420;
const ABOUT_PANEL_CLOSE_MS=420;
function escHTML(value){
  return String(value).replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}
function canAnimateAbout(){
  return window.innerWidth>900&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function aboutLiveProfileCard(){
  return document.querySelector('#cardStage .os-card.pos-0[data-deck="main"][data-type="profile"]');
}
function aboutLiveJourneyCard(){
  return document.querySelector('#cardStage .os-card[data-deck="main"][data-type="journey"]');
}
function aboutScrubId(root){
  root.querySelectorAll('[id]').forEach(el=>el.removeAttribute('id'));
}
function aboutMakeCardClone(live){
  const clone=live.cloneNode(true);
  aboutScrubId(clone);
  clone.querySelectorAll('button,a,[tabindex]').forEach(el=>{ el.tabIndex=-1; });
  clone.querySelectorAll('button,a').forEach(el=>{ el.style.pointerEvents='none'; });
  clone.removeAttribute('data-card'); clone.removeAttribute('data-deck-index'); clone.removeAttribute('role');
  clone.classList.remove('pos-1','pos--1','pos-2','pos--2','pos-hidden');
  clone.classList.add('pos-0','is-active');
  clone.setAttribute('tabindex','-1');
  clone.setAttribute('aria-label',live.dataset.type==='journey'?'My Journey card':'Nour Chkair about card');
  clone.querySelectorAll('.card-actions').forEach(el=>el.setAttribute('aria-hidden','true'));
  return clone;
}
function buildAboutCard(sourceEl){
  const live=sourceEl||aboutLiveProfileCard();
  const frame=$('aboutHero');
  if(!live||!frame) return null;
  frame.replaceChildren(aboutMakeCardClone(live));
  return {live,frame};
}
function sizeAboutCard(){
  const frame=$('aboutHero');
  if(!frame) return;
  const card=frame.querySelector('.os-card');
  const slot=$('aboutLeftSlot');
  if(!card||!slot) return;
  const slotW=slot.clientWidth||frame.clientWidth;
  if(!slotW) return;
  const cs=getComputedStyle(card);
  const dw=parseFloat(cs.width)||388.8;
  const dh=parseFloat(cs.height)||540;
  const w=Math.min(slotW,dw);
  const stage=$('aboutStage');
  const stageH=stage?stage.clientHeight:0;
  const heightScale=stageH>24?Math.min(1,(stageH-24)/dh):1;
  const scale=Math.min(w/dw,heightScale);
  frame.style.width=`${w.toFixed(2)}px`;
  frame.style.height=`${(dh*scale).toFixed(2)}px`;
  frame.style.setProperty('--about-card-scale',String(scale));
  card.style.width=`${dw.toFixed(2)}px`;
  card.style.height=`${dh.toFixed(2)}px`;
  card.style.transform=`scale(${scale.toFixed(5)})`;
}
function resetAboutCardStyles(){
  const slot=$('aboutLeftSlot'), inner=$('aboutLeftInner');
  if(slot){ slot.getAnimations().forEach(a=>a.cancel()); slot.style.transform=''; slot.style.transformOrigin=''; }
  if(inner){ inner.getAnimations().forEach(a=>a.cancel()); inner.style.transform=''; }
}
function setAboutReading(active){
  const ov=$('aboutView');
  if(ov) ov.classList.toggle('reading',!!active);
}
function renderAboutDetail(){
  const body=$('aboutDetailBody');
  if(!body) return;
  body.scrollTop=0;
  body.dataset.section='professional';
  renderProfessionalView(body);
}
function clearAboutRestoreTimer(){
  if(aboutRestoreTimer){ clearTimeout(aboutRestoreTimer); aboutRestoreTimer=null; }
}
function cancelAboutPanelFlight(){
  if(aboutPanelFlight){
    try{ aboutPanelFlight.cancel(); }catch(e){}
    aboutPanelFlight=null;
  }
}
function removeAboutLeftGhost(){
  document.querySelectorAll('.about-left-ghost').forEach(el=>el.remove());
}
function placeAboutStack(){ return null; }
function resetAboutPanels(){
  clearAboutRestoreTimer();
  cancelAboutPanelFlight();
  removeAboutLeftGhost();
  resetAboutMeWorkspace();
  $('aboutView')?.classList.remove('actions-hidden','journey-open');
  $('aboutJourneyFloat')?.setAttribute('aria-hidden','true');
  setAboutReading(false);
  const intro=$('aboutIntro'), detail=$('aboutDetail');
  const journeyFloat=$('aboutJourneyFloat');
  if(journeyFloat) journeyFloat.inert=true;
  if(intro){ intro.inert=false; intro.classList.remove('is-hidden','is-content-hidden'); intro.setAttribute('aria-hidden','false'); }
  if(detail){ detail.classList.remove('is-visible','is-content-hidden'); detail.setAttribute('aria-hidden','true'); detail.inert=true; }
  document.querySelectorAll('.about-stack-clone').forEach(el=>el.remove());
  aboutStackAnim=null;
}
function revealAboutIntro(){
  $('aboutView').classList.remove('entering');
}
function animateAboutCardIn(fromRect){
  const slot=$('aboutLeftSlot'), inner=$('aboutLeftInner'), frame=$('aboutHero');
  if(!slot||!inner||!frame||!fromRect){ revealAboutIntro(); return; }
  const innerH=inner.offsetHeight, innerW=inner.offsetWidth;
  if(!innerH||!innerW){ revealAboutIntro(); return; }
  const slotRect=slot.getBoundingClientRect();
  const s=fromRect.height/innerH;
  const dx=fromRect.left-slotRect.left-inner.offsetLeft*s;
  const dy=fromRect.top-slotRect.top-inner.offsetTop*s;
  const start=`translate(${dx}px, ${dy}px) scale(${s})`;
  slot.style.transformOrigin='top left';
  slot.style.transform=start;
  inner.getAnimations().forEach(a=>a.cancel());
  inner.style.transform='translateZ(0) rotateY(0deg)';
  inner.animate([{transform:'translateZ(0) rotateY(0deg)'},{transform:'translateZ(-34px) rotateY(16deg)'}],{duration:ABOUT_FLIGHT_MS,easing:PROJECT_OPEN_EASE});
  requestAnimationFrame(()=>{
    if(aboutClosing) return;
    slot.getAnimations().forEach(a=>a.cancel());
    const anim=slot.animate([
      {transform:start},
      {transform:'translate(0, 0) scale(1, 1)'}
    ],{duration:ABOUT_FLIGHT_MS,easing:PROJECT_OPEN_EASE});
    anim.onfinish=()=>{
      if(aboutClosing) return;
      slot.style.transform=''; slot.style.transformOrigin='';
      inner.style.transform='';
      revealAboutIntro();
    };
  });
}
function openAbout(sourceEl,opts={}){
  if(aboutOpen||aboutClosing) return;
  if($('project').classList.contains('open')) return;
  const live=sourceEl||aboutLiveProfileCard();
  if(!live) return;
  aboutSourceCard=live;
  setUtilityOpen(false);
  const fromRect=live.getBoundingClientRect();
  aboutOpen=true;
  aboutClosing=false;
  resetAboutPanels();
  if(opts.journey) $('aboutView')?.classList.add('journey-open');
  resetAboutCardStyles();
  buildAboutCard(live);
  sizeAboutCard();
  const ov=$('aboutView');
  const willAnimate=canAnimateAbout()&&!opts.noFlight;
  ov.classList.toggle('entering',willAnimate);
  ov.classList.add('open');
  ov.classList.remove('closing');
  ov.setAttribute('aria-hidden','false');
  document.body.classList.add('about-open');
  document.body.classList.remove('about-reveal','about-closing','minimal');
  updateMinimalToggle();
  setActiveNav('me');
  const barLabel=$('aboutBarLabel');
  if(barLabel) barLabel.textContent=pendingAboutSection?'Nour Chkair / My Journey':'Nour Chkair / About';
  syncA11y();
  if(willAnimate) animateAboutCardIn(fromRect);
  else revealAboutIntro();
  setTimeout(()=>{
    if(aboutOpen&&!aboutClosing) ov.classList.add('actions-hidden');
  },520);
  setTimeout(()=>{
    if(aboutOpen&&!aboutClosing) $('aboutBack')?.focus({preventScroll:true});
  },willAnimate?80:30);
  if(!opts.journey&&!opts.noRoute){
    const target=opts.route||'/me';
    if(hashPath()!==target) syncHash(target);
  }
  announce('About Nour Chkair');
}
function showAboutDetail(opts={}){
  const intro=$('aboutIntro'), detail=$('aboutDetail');
  pendingAboutSection=null;
  if(!intro||!detail) return;
  if(mePanelView!=='intro') resetAboutMeWorkspace();
  setMeBrainMode(false);
  if(aboutOpen&&detail.classList.contains('is-visible')){
    if(opts.syncRoute!==false) syncHash('/journey');
    setActiveNav('me');
    const barLabel=$('aboutBarLabel');
    if(barLabel) barLabel.textContent='Nour Chkair / My Journey';
    detail.inert=false;
    return;
  }
  clearAboutRestoreTimer();
  cancelAboutPanelFlight();
  removeAboutLeftGhost();
  intro.style.transition='none';
  intro.inert=true;
  intro.classList.add('is-hidden','is-content-hidden');
  intro.setAttribute('aria-hidden','true');
  setAboutReading(false);
  $('aboutView')?.classList.add('journey-open');
  const journeyFloat=$('aboutJourneyFloat');
  if(journeyFloat) journeyFloat.inert=false;
  renderAboutDetail();
  if(opts.syncRoute!==false) syncHash('/journey');
  setActiveNav('me');
  const barLabel=$('aboutBarLabel');
  if(barLabel) barLabel.textContent='Nour Chkair / My Journey';
  detail.style.transition='none';
  detail.inert=false;
  detail.classList.add('is-visible');
  detail.setAttribute('aria-hidden','false');
  detail.classList.remove('is-content-hidden');
  requestAnimationFrame(()=>{ detail.style.transition=''; intro.style.transition=''; });
  setTimeout(()=>{
    if(!aboutOpen||aboutClosing) return;
    if(!detail.classList.contains('is-visible')) return;
    $('aboutDetailBody')?.focus({preventScroll:true});
  },canAnimateAbout()?120:30);
}
function restoreAboutIntro(opts={}){
  const intro=$('aboutIntro'), detail=$('aboutDetail');
  pendingAboutSection=null;
  if(!intro||!detail||!detail.classList.contains('is-visible')) return;
  if(opts.syncRoute!==false) syncHash('/me');
  setActiveNav('me');
  const barLabel=$('aboutBarLabel');
  if(barLabel) barLabel.textContent='Nour Chkair / About';
  clearAboutRestoreTimer();
  cancelAboutPanelFlight();
  removeAboutLeftGhost();
  $('aboutView')?.classList.remove('journey-open');
  const journeyFloat=$('aboutJourneyFloat');
  if(journeyFloat){ journeyFloat.inert=true; journeyFloat.setAttribute('aria-hidden','true'); }
  setAboutReading(false);
  const profile=aboutLiveProfileCard();
  if(profile){
    aboutSourceCard=profile;
    buildAboutCard(profile);
    sizeAboutCard();
  }
  detail.inert=true;
  detail.setAttribute('aria-hidden','true');
  detail.classList.add('is-content-hidden');
  intro.style.transition='none';
  detail.classList.remove('is-visible');
  intro.inert=false;
  intro.classList.remove('is-hidden','is-content-hidden');
  intro.setAttribute('aria-hidden','false');
  resetAboutMeWorkspace();
  requestAnimationFrame(()=>{ detail.style.transition=''; intro.style.transition=''; });
  const heading=intro.querySelector('#meIntroTitle');
  if(heading) setTimeout(()=>{
    if(!aboutOpen||aboutClosing) return;
    if(detail.classList.contains('is-visible')) return;
    heading.focus({preventScroll:true});
  },70);
}
function finishAboutClose(restoreFocus){
  const ov=$('aboutView');
  const live=aboutSourceCard||aboutLiveProfileCard();
  aboutSourceCard=null;
  clearAboutRestoreTimer();
  cancelAboutPanelFlight();
  removeAboutLeftGhost();
  setAboutReading(false);
  const stack=document.querySelector('.about-stack-clone');
  if(stack) stack.remove();
  resetAboutCardStyles();
  ov.classList.remove('open','closing','entering');
  ov.setAttribute('aria-hidden','true');
  document.body.classList.remove('about-open','about-reveal','about-closing');
  aboutOpen=false;
  aboutClosing=false;
  aboutStackAnim=null;
  resetAboutPanels();
  setActiveNav(deckNavName());
  syncA11y();
  if(restoreFocus&&live){
    setTimeout(()=>{ if(!aboutOpen) live.focus({preventScroll:true}); },30);
  }
}
function closeAbout(opts={}){
  const ov=$('aboutView');
  if(!ov.classList.contains('open')||aboutClosing) return;
  const restoreFocus=opts.restoreFocus!==false;
  const brainWasOpen=ov.classList.contains('me-brain-open');
  if(brainWasOpen){ setMeBrainMode(false); resetAboutMeWorkspace(); }
  if(!opts.keepRoute) syncHash(deck==='projects'?'/projects':'/home');
  if(opts.immediate||brainWasOpen||!canAnimateAbout()){ finishAboutClose(restoreFocus); return; }
  const live=aboutSourceCard||aboutLiveProfileCard();
  const slot=$('aboutLeftSlot'), inner=$('aboutLeftInner');
  if(!live||!slot||!inner){ finishAboutClose(restoreFocus); return; }
  const innerH=inner.offsetHeight, innerW=inner.offsetWidth;
  const to=live.getBoundingClientRect();
  if(!innerH||!innerW||!to.width){ finishAboutClose(restoreFocus); return; }
  const slotRect=slot.getBoundingClientRect();
  const s=to.height/innerH;
  const dx=to.left-slotRect.left-inner.offsetLeft*s;
  const dy=to.top-slotRect.top-inner.offsetTop*s;
  slot.style.transformOrigin='top left';
  aboutClosing=true;
  ov.classList.add('closing');
  ov.classList.remove('actions-hidden');
  document.body.classList.add('about-closing','about-reveal');
  const innerCurrent=getComputedStyle(inner).transform;
  inner.getAnimations().forEach(a=>a.cancel());
  inner.style.transform=innerCurrent==='none'?'':innerCurrent;
  inner.animate([
    {transform:innerCurrent==='none'?'translateZ(0) rotateY(0deg)':innerCurrent},
    {transform:'translateZ(0) rotateY(0deg)'}
  ],{duration:ABOUT_FLIGHT_MS,easing:PROJECT_CLOSE_EASE,fill:'forwards'});
  const anim=slot.animate([
    {transform:'translate(0, 0) scale(1, 1)'},
    {transform:`translate(${dx}px, ${dy}px) scale(${s})`}
  ],{duration:ABOUT_FLIGHT_MS,easing:PROJECT_CLOSE_EASE,fill:'forwards'});
  anim.onfinish=()=>finishAboutClose(restoreFocus);
}


let aboutSectionTimer=null, pendingAboutSection=null;
function goMe(opts={}){
  const wantBrain=opts.view==='brain';
  const route=wantBrain?'/me/brain':'/me';
  pendingAboutSection=null;
  clearTimeout(aboutSectionTimer);
  if(aboutOpen){
    if($('aboutDetail').classList.contains('is-visible')) restoreAboutIntro({syncRoute:!wantBrain});
    setAboutMeView(wantBrain?'brain':'intro',{animate:false});
    setActiveNav('me');
    syncHash(route);
    const back=$('aboutBack');
    if(back) back.focus({preventScroll:true});
    return;
  }
  resetToHomeChrome();
  openMainDeck();
  if(mainIndex!==HOME_MAIN) goCard(HOME_MAIN,false);
  setActiveNav('me');
  syncHash(route);
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const live=aboutLiveProfileCard();
    if(live) openAbout(live,{route,noRoute:true});
    if(wantBrain) setAboutMeView('brain',{animate:false});
  }));
}
const goAbout=goMe;
function goAboutSection(chapterId=null){
  clearTimeout(aboutSectionTimer);
  pendingAboutSection='professional';
  const targetChapter=typeof chapterId==='string'?chapterId:null;
  const route=targetChapter?`/journey/${targetChapter}`:'/journey';
  const revealChapter=()=>{
    const chapterId=targetChapter||PROFESSIONAL_CHAPTERS[0]?.id;
    if(chapterId) selectProfessionalChapter(chapterId,{animate:false,announce:false});
  };
  const syncRoute=()=>syncHash(route);
  const journeyCard=aboutLiveJourneyCard();
  if(aboutOpen){
    $('aboutView')?.classList.add('journey-open');
    if(journeyCard){
      aboutSourceCard=journeyCard;
      buildAboutCard(journeyCard);
      sizeAboutCard();
    }
    showAboutDetail({syncRoute:false});
    revealChapter();
    syncRoute();
    return;
  }
  resetToHomeChrome();
  openMainDeck();
  mainIndex=0;
  updateCards();
  setActiveNav('me');
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    const live=aboutLiveJourneyCard();
    if(!live) return;
    openAbout(live,{journey:true,noRoute:true});
    if(aboutOpen){
      showAboutDetail({syncRoute:false});
      revealChapter();
      syncRoute();
    }
  }));
}
function goProfessional(chapterId){ goAboutSection(chapterId); }
function closeContact(){
  setMode('home');
  setActiveNav(deckNavName());
  syncHash(deck==='projects'?'/projects':'/home');
  setTimeout(()=>{
    const active=document.querySelector('#cardStage .os-card.pos-0');
    if(active) active.focus({preventScroll:true});
  },40);
}
function goContact(opts={}){
  if(mode==='contact'&&!opts.force){
    closeContact();
    return;
  }
  resetToHomeChrome();
  setMode('contact');
  setActiveNav('contact');
  syncHash('/contact');
  announce('Contact Nour');
  setTimeout(()=>{
    if(mode==='contact') $('contactClose')?.focus({preventScroll:true});
  },620);
}
function openProjectDeck(projectId,opts={}){
  setUtilityOpen(false);
  if(mode!=='home'){ mode='home'; document.body.dataset.mode='home'; }
  deck='projects';
  projectIndex=projectId?projectIndexFor(projectId):0;
  updateDeckChrome();
  renderDots();
  updateCards();
  syncA11y();
  setActiveNav('projects');
  if(opts.syncRoute!==false) syncHash('/projects');
  schedulePrewarm(PROJECT_CARDS[activeIndex()].id);
  announce(projectId?`${projectById(projectId).title}, project deck`:`${projectById(PROJECT_CARDS[projectIndex].id).title}, project deck`);
}
function openMainDeck(){
  setUtilityOpen(false);
  if(mode!=='home'){ mode='home'; document.body.dataset.mode='home'; }
  deck='main';
  mainIndex=HOME_MAIN;
  updateDeckChrome();
  renderDots();
  updateCards();
  syncA11y();
  setActiveNav('me');
  announce('Main panels');
}

/* ---------- modes / minimal ---------- */
function setMode(next){
  if(next!=='home'&&next!=='contact') next='home';
  setUtilityOpen(false);
  document.body.classList.remove('minimal');
  updateMinimalToggle();
  mode=next;
  document.body.dataset.mode=next;
  syncA11y();
  setActiveNav(next==='contact'?'contact':deckNavName());
}
function updateMinimalToggle(){
  const minimal=document.body.classList.contains('minimal');
  const label=minimal?'Show deck':'Hide deck';
  ['quickMinimalToggle'].forEach(id=>{
    const btn=$(id);
    if(!btn) return;
    btn.setAttribute('aria-label',label);
    btn.title=label;
  });
}
function enterMinimal(){
  setUtilityOpen(false);
  if($('project').classList.contains('open')) closeProject({restoreFocus:false,silent:true,immediate:true});
  if(mode!=='home'){ mode='home'; document.body.dataset.mode='home'; }
  document.body.classList.add('minimal');
  updateMinimalToggle();
  syncA11y();
  announce('Minimal view');
}
function exitMinimal(){
  document.body.classList.remove('minimal');
  updateMinimalToggle();
  syncA11y();
  announce('Deck shown');
}
function syncA11y(){
  const online=document.body.classList.contains('ready');
  const minimal=document.body.classList.contains('minimal');
  const m=document.body.dataset.mode;
  const projectOpen=$('project').classList.contains('open');
  const aboutOpen=$('aboutView').classList.contains('open');
  const base=online&&!projectOpen&&!aboutOpen&&!minimal;
  $('project').inert=!projectOpen;
  const aboutView=$('aboutView');
  aboutView.inert=!aboutOpen;
  aboutView.setAttribute('aria-hidden',aboutOpen?'false':'true');
  $('carouselPanel').inert=!base||m!=='home';
  $('contactPanel').inert=!base||m!=='contact';
  $('toolbar').inert=!base;
  $('utilityDock').inert=!online||projectOpen||aboutOpen;
  $('deckPrev').inert=!base||m!=='home';
  $('deckNext').inert=!base||m!=='home';
  $('cardDots').querySelectorAll('button').forEach(b=>b.tabIndex=base&&m==='home'?0:-1);
  publishState();
}

/* ---------- project workspace ---------- */
let currentProjectId=null;
const PROJECT_FLIGHT_MS=460;
const PROJECT_OPEN_EASE='cubic-bezier(.32,.72,.25,1)';
const PROJECT_CLOSE_EASE='cubic-bezier(.45,.05,.25,1)';
function projectById(id){ return PROJECT_BY_ID[id]||null; }
function currentProject(){ return projectById(currentProjectId); }
function projectIndexFor(id){ return Math.max(0,PROJECTS.findIndex(p=>p.id===id)); }
/* ---------- Customer Acquisition overview + process view ---------- */
function projectOverviewBriefHTML(p){
  const o=p.overview;
  const what=Array.isArray(o.whatItIs)?o.whatItIs:[o.whatItIs];
  return `<section class="pw-window pw-overview-window pw-overview-what" aria-labelledby="pwOverviewWhatTitle">
    <div class="pw-winbar"><span class="pw-winlabel">Project overview</span><span class="pw-winmeta">Context</span></div>
    <div class="pw-overview-body">
      <h2 id="pwOverviewWhatTitle">What it is</h2>
      ${what.map(t=>`<p class="pw-overview-lead">${escHTML(t)}</p>`).join('')}
      ${o.provenance?`<p class="pw-overview-provenance">${escHTML(o.provenance)}</p>`:''}
    </div>
  </section>
  <section class="pw-window pw-overview-window pw-overview-challenges" aria-labelledby="pwOverviewChallengesTitle">
    <div class="pw-winbar"><span class="pw-winlabel">Project overview</span><span class="pw-winmeta">Why it matters</span></div>
    <div class="pw-overview-body">
      <h2 id="pwOverviewChallengesTitle">Business challenges</h2>
      <ul class="pw-overview-list">${o.challenges.map(item=>`<li>${escHTML(item)}</li>`).join('')}</ul>
    </div>
  </section>`;
}
function projectContributionHTML(o){
  const contribution=o.contribution;
  if(!contribution) return '';
  return `<section class="pw-overview-contribution" aria-labelledby="pwContributionTitle">
    <div class="pw-contribution-head">
      <h3 id="pwContributionTitle">My Contribution</h3>
    </div>
    ${contribution.lead?`<p class="pw-contribution-lead">${escHTML(contribution.lead)}</p>`:''}
    <div class="pw-contribution-blocks">
      ${(contribution.blocks||[]).map(block=>`<div class="pw-contribution-block">
        <span>${escHTML(block.label)}</span>
        <p>${escHTML(block.text)}</p>
      </div>`).join('')}
    </div>
  </section>`;
}
function projectOverviewValueHTML(p){
  const o=p.overview;
  return `<section class="pw-window pw-overview-window pw-overview-value" aria-labelledby="pwOverviewValueTitle">
    <div class="pw-winbar"><span class="pw-winlabel">Project overview</span><span class="pw-winmeta">Intended benefits</span></div>
    <div class="pw-overview-body">
      <h2 id="pwOverviewValueTitle">Business value</h2>
      <ul class="pw-overview-list pw-overview-list--value">${o.value.map(item=>`<li>${escHTML(item)}</li>`).join('')}</ul>
      ${projectContributionHTML(o)}
    </div>
    <footer class="pw-overview-foot">
      <button class="pw-overview-cta" type="button" data-project-flow>${escHTML(o.cta)} <span aria-hidden="true">→</span></button>
    </footer>
  </section>`;
}
function flowIcon(name){
  const attrs='viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.35" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
  if(name==='target') return `<svg ${attrs}><circle cx="12" cy="12" r="7.2"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></svg>`;
  if(name==='search') return `<svg ${attrs}><circle cx="10.6" cy="10.6" r="5.5"/><path d="m14.7 14.7 4.3 4.3"/><path d="M8.6 10.6h4M10.6 8.6v4"/></svg>`;
  if(name==='contact') return `<svg ${attrs}><circle cx="10" cy="8" r="3"/><path d="M4.6 18c.6-3.1 2.4-4.7 5.4-4.7 1.5 0 2.7.4 3.6 1.2"/><path d="M16.5 14.5v5M14 17h5"/></svg>`;
  if(name==='filter') return `<svg ${attrs}><path d="M4 5h16l-6.2 7.1v5.6l-3.6 1.6v-7.2Z"/></svg>`;
  if(name==='spark') return `<svg ${attrs}><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7Z"/><path d="m18.5 15 .7 2.2 2.3.8-2.3.7-.7 2.3-.8-2.3-2.2-.7 2.2-.8Z"/></svg>`;
  if(name==='message') return `<svg ${attrs}><rect x="3.5" y="5" width="17" height="12" rx="3"/><path d="m6 17-2.5 3v-3.8"/><path d="M7.5 9.5h9M7.5 13h6"/></svg>`;
  if(name==='repeat') return `<svg ${attrs}><path d="M5 8.5A4.5 4.5 0 0 1 9.5 4H19l-3-3M19 15.5a4.5 4.5 0 0 1-4.5 4.5H5l3 3"/><path d="M19 4v4h-4M5 20v-4h4"/></svg>`;
  if(name==='calendar') return `<svg ${attrs}><rect x="3.5" y="5.5" width="17" height="15" rx="2.5"/><path d="M7.5 3v5M16.5 3v5M3.5 10h17"/><path d="m8.5 15 2.2 2.2 4.8-4.7"/></svg>`;
  if(name==='clipboard') return `<svg ${attrs}><rect x="5" y="4.5" width="14" height="16.5" rx="2.5"/><path d="M9 4.5V3h6v1.5M8.5 9h7M8.5 13h7M8.5 17h4"/></svg>`;
  if(name==='map') return `<svg ${attrs}><path d="m3.5 6 5-2 7 2 5-2v14l-5 2-7-2-5 2Z"/><path d="M8.5 4v14M15.5 6v14"/></svg>`;
  if(name==='id') return `<svg ${attrs}><rect x="3.5" y="5" width="17" height="14" rx="3"/><circle cx="9" cy="11" r="2.2"/><path d="M5.8 16.5c.4-1.7 1.5-2.6 3.2-2.6s2.8.9 3.2 2.6M14.5 10h3M14.5 13.5h3"/></svg>`;
  if(name==='check') return `<svg ${attrs}><circle cx="12" cy="12" r="8"/><path d="m8.3 12.2 2.3 2.3 5.1-5"/></svg>`;
  if(name==='link') return `<svg ${attrs}><path d="M9.8 14.2 14.2 9.8"/><path d="M7.4 16.6 5.8 18.2a3.4 3.4 0 0 1-4.8-4.8l3.2-3.2a3.4 3.4 0 0 1 4.8 0"/><path d="m16.6 7.4 1.6-1.6a3.4 3.4 0 0 1 4.8 4.8l-3.2 3.2a3.4 3.4 0 0 1-4.8 0"/></svg>`;
  if(name==='layers') return `<svg ${attrs}><path d="m12 3 8.5 4.5L12 12 3.5 7.5Z"/><path d="m3.5 12 8.5 4.5 8.5-4.5"/><path d="m3.5 16.5 8.5 4.5 8.5-4.5"/></svg>`;
  if(name==='eye') return `<svg ${attrs}><path d="M2.5 12s3.4-5.5 9.5-5.5 9.5 5.5 9.5 5.5-3.4 5.5-9.5 5.5S2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/></svg>`;
  if(name==='phone') return `<svg ${attrs}><path d="M6.5 3.5h2.9l1.4 3.9-2 1.4a14.2 14.2 0 0 0 6.4 6.4l1.4-2 3.9 1.4v2.9a2.5 2.5 0 0 1-2.8 2.5C10.3 20.1 3.9 13.7 4 6.3a2.5 2.5 0 0 1 2.5-2.8Z"/></svg>`;
  if(name==='clock') return `<svg ${attrs}><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.5 2"/></svg>`;
  if(name==='book') return `<svg ${attrs}><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16.5H6.5A2.5 2.5 0 0 0 4 22Z"/><path d="M4 18.5A2.5 2.5 0 0 1 6.5 16H20"/></svg>`;
  if(name==='mic') return `<svg ${attrs}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>`;
  if(name==='alert') return `<svg ${attrs}><path d="M12 3.5 21 20H3Z"/><path d="M12 9v5M12 17.2v.1"/></svg>`;
  return `<svg ${attrs}><path d="M4 19V5M4 19h16"/><path d="M7 16v-4M11 16V8M15 16v-6M19 16V6"/></svg>`;
}
function flowConnectionPath(a,b,kind){
  const acx=a.x+105, acy=a.y+75, bcx=b.x+105, bcy=b.y+75;
  if(kind==='shortcut'){
    return `M${acx} ${a.y} C${acx+60} ${a.y-150}, ${bcx-60} ${b.y-150}, ${bcx} ${b.y}`;
  }
  if(a.y!==b.y){
    return `M${a.x+210} ${acy} C${a.x+255} ${acy}, ${b.x-45} ${bcy}, ${b.x} ${bcy}`;
  }
  return `M${a.x+210} ${acy} H${b.x}`;
}
function projectFlowHTML(p){
  const f=p.flow;
  const map=Object.fromEntries(f.nodes.map(n=>[n.id,n]));
  const paths=f.connections.map(c=>{
    const a=map[c.from], b=map[c.to];
    if(!a||!b) return '';
    const d=c.path||flowConnectionPath(a,b,c.kind);
    return `<path class="pw-flow-link pw-flow-link--${c.kind}" data-from="${c.from}" data-to="${c.to}" d="${d}"/>`;
  }).join('');
  const canvasW=f.canvas?.width||2220, canvasH=f.canvas?.height||640;
  const spineFrom=f.spine?map[f.spine.from]:null, spineTo=f.spine?map[f.spine.to]:null;
  const spine=(spineFrom&&spineTo)?`<path class="pw-flow-spine" d="M${spineFrom.x+105} ${canvasH-65} H${spineTo.x+105}"/><path class="pw-flow-spine-tick" d="M${spineTo.x+105} ${canvasH-65} V${spineTo.y+150}"/>`:'';
  const labels=(f.labels||[]).map(l=>`<span class="pw-flow-label pw-flow-label--${escHTML(l.kind||'note')}" style="left:${l.x}px;top:${l.y}px">${escHTML(l.text)}</span>`).join('');
  const spineLabelStyle=f.spine&&(f.spine.labelX!=null||f.spine.labelY!=null)
    ?` style="${f.spine.labelX!=null?`left:${f.spine.labelX}px;`:''}${f.spine.labelY!=null?`top:${f.spine.labelY}px;`:''}"`:'';
  const spineLabel=f.spine?`<span class="pw-flow-crm-note"${spineLabelStyle}>${escHTML(f.spine.label)}</span>`:'';
  const nodes=f.nodes.map((n,i)=>`<button class="pw-flow-node" type="button" data-flow-node="${n.id}" data-flow-index="${i}"${n.tone?` data-tone="${escHTML(n.tone)}"`:''} style="left:${n.x}px;top:${n.y}px" aria-describedby="projectFlowTip">
    <span class="pw-flow-node-top"><span class="pw-flow-node-num">${escHTML(n.num)}</span><span class="pw-flow-node-icon">${flowIcon(n.icon)}</span></span>
    <b>${escHTML(n.title)}</b>
    <span class="pw-flow-node-desc">${escHTML(n.visible)}</span>
  </button>`).join('');
  return `<div class="pw-flow-shell">
    <header class="pw-flow-bar">
      <button class="pw-flow-back" id="projectFlowBack" type="button">
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5"/></svg><span>Back to project</span>
      </button>
      <div class="pw-flow-heading">
        <span class="pw-flow-eyebrow">${escHTML(f.eyebrow)}</span>
        <b>${escHTML(f.title)}</b>
      </div>
      <span class="pw-flow-hint">${escHTML(f.hint||'Drag or scroll horizontally · Hover or focus a step')}</span>
    </header>
    <div class="pw-flow-stage" id="projectFlowStage">
      <div class="pw-flow-viewport" id="projectFlowViewport" tabindex="0" aria-label="${escHTML(f.viewportLabel||f.title)}">
        <div class="pw-flow-canvas" style="width:${canvasW}px;height:${canvasH}px">
          <span class="pw-flow-canvas-mark" aria-hidden="true">${escHTML(f.eyebrow)}</span>
          <svg class="pw-flow-lines" viewBox="0 0 ${canvasW} ${canvasH}" preserveAspectRatio="none" fill="none" aria-hidden="true">
            ${paths}${spine}
          </svg>
          ${labels}
          ${nodes}
          ${spineLabel}
        </div>
      </div>
      <div class="pw-flow-tip" id="projectFlowTip" role="status" aria-live="polite" hidden></div>
    </div>
    ${f.scopeNote?`<footer class="pw-flow-foot">${escHTML(f.scopeNote)}</footer>`:''}
  </div>`;
}
function projectHeroHTML(p,id){
  const idx=projectIndexFor(id);
  let card=cardHTML({type:'project',id},idx,'projects');
  card=card
    .replace('class="os-card"','class="os-card pos-0 is-active"')
    .replace(' data-deck="projects"','')
    .replace(/ data-deck-index="[^"]*"/,'')
    .replace(/ data-card="[^"]*"/,'')
    .replace('tabindex="0"','tabindex="-1"');
  if(p.fullTitle) card=card.replace(`<h2>${escHTML(p.title)}</h2>`,`<h2>${escHTML(p.fullTitle)}</h2>`);
  card=card.replace('<button','<span').replace('</button>','</span>');
  return `<div class="pw-project-frame">${card}</div>`;
}
let activeFlowNodeId=null;
let projectOverviewScroll=0;
function projectCanvasEl(){ const p=$('project'); return p?p.querySelector('.pw-canvas'):null; }
function resetProjectFlow(){
  const project=$('project');
  if(project) project.classList.remove('project-flow-mode');
  const flow=$('projectFlow');
  if(flow){ flow.inert=true; flow.setAttribute('aria-hidden','true'); }
  const stage=$('projectStage');
  if(stage) stage.inert=false;
  clearFlowActiveNode();
}
function openProjectFlow(opts={}){
  const p=currentProject();
  const project=$('project');
  if(!p||!p.flow||!project||!project.classList.contains('open')||project.classList.contains('project-flow-mode')) return;
  const canvas=projectCanvasEl();
  projectOverviewScroll=canvas?canvas.scrollTop:0;
  if(canvas) canvas.scrollTop=0;
  clearFlowActiveNode();
  project.classList.add('project-flow-mode');
  const flow=$('projectFlow');
  if(flow){ flow.inert=false; flow.setAttribute('aria-hidden','false'); }
  const stage=$('projectStage');
  if(stage) stage.inert=true;
  const alignFlowStart=()=>{
    const viewport=$('projectFlowViewport');
    if(!viewport) return;
    const first=p.flow.nodes.find(n=>n.id===p.flow.start)||p.flow.nodes[0];
    const center=first?first.y+75:viewport.scrollHeight/2;
    const max=Math.max(0,viewport.scrollHeight-viewport.clientHeight);
    viewport.scrollLeft=0;
    viewport.scrollTop=Math.max(0,Math.min(max,center-viewport.clientHeight*.60));
  };
  alignFlowStart();
  requestAnimationFrame(alignFlowStart);
  if(opts.syncRoute!==false) syncHash(`/projects/${p.id}/flow`);
  publishState();
  announce(`${p.title} process view`);
  if(opts.focus!==false) setTimeout(()=>$('projectFlowBack')?.focus({preventScroll:true}),60);
}
function closeProjectFlow(opts={}){
  const project=$('project');
  if(!project||!project.classList.contains('project-flow-mode')) return;
  project.classList.remove('project-flow-mode');
  const flow=$('projectFlow');
  if(flow){ flow.inert=true; flow.setAttribute('aria-hidden','true'); }
  clearFlowActiveNode();
  const stage=$('projectStage');
  if(stage) stage.inert=false;
  const canvas=projectCanvasEl();
  if(canvas) canvas.scrollTop=projectOverviewScroll;
  if(opts.syncRoute!==false){
    const p=currentProject();
    if(p) syncHash(`/projects/${p.id}`);
  }
  publishState();
  if(opts.focus!==false) setTimeout(()=>$('projectStage')?.querySelector('[data-project-flow]')?.focus({preventScroll:true}),60);
}
function hideFlowTip(){
  const tip=$('projectFlowTip');
  if(tip){ tip.hidden=true; tip.innerHTML=''; }
}
function clearFlowActiveNode(){
  activeFlowNodeId=null;
  hideFlowTip();
  document.querySelectorAll('#projectFlow .pw-flow-node.is-active,#projectFlow .pw-flow-node.is-related').forEach(el=>el.classList.remove('is-active','is-related'));
  document.querySelectorAll('#projectFlow .pw-flow-link.is-active,#projectFlow .pw-flow-spine.is-active').forEach(el=>el.classList.remove('is-active'));
}
function positionFlowTip(nodeId){
  const tip=$('projectFlowTip'), stage=$('projectFlowStage'), node=document.querySelector(`[data-flow-node="${nodeId}"]`);
  if(!tip||!stage||!node||tip.hidden) return;
  const sr=stage.getBoundingClientRect(), nr=node.getBoundingClientRect();
  if(nr.width===0||nr.height===0) return;
  if(nr.bottom<sr.top||nr.top>sr.bottom||nr.right<sr.left||nr.left>sr.right){ tip.hidden=true; return; }
  const width=Math.min(340,sr.width-24);
  tip.style.width=`${width}px`;
  tip.style.left='0px'; tip.style.top='0px';
  const tr=tip.getBoundingClientRect();
  const nodeCenter=nr.left-sr.left+nr.width/2;
  const left=Math.max(12+tr.width/2,Math.min(sr.width-12-tr.width/2,nodeCenter));
  let top=nr.top-sr.top-tr.height-14;
  if(top<10) top=nr.bottom-sr.top+14;
  top=Math.max(8,Math.min(sr.height-tr.height-8,top));
  tip.style.left=`${left}px`;
  tip.style.top=`${top}px`;
  tip.style.transform='translateX(-50%)';
}
function showFlowTip(nodeId,opts={}){
  const p=currentProject();
  if(!p||!p.flow) return;
  const node=p.flow.nodes.find(n=>n.id===nodeId);
  if(!node) return;
  activeFlowNodeId=nodeId;
  const neighbors=new Set();
  p.flow.connections.forEach(c=>{
    if(c.from===nodeId) neighbors.add(c.to);
    if(c.to===nodeId) neighbors.add(c.from);
  });
  document.querySelectorAll('#projectFlow [data-flow-node]').forEach(el=>{
    const id=el.dataset.flowNode;
    el.classList.toggle('is-active',id===nodeId);
    el.classList.toggle('is-related',neighbors.has(id));
  });
  document.querySelectorAll('#projectFlow .pw-flow-link').forEach(path=>{
    const on=path.dataset.from===nodeId||path.dataset.to===nodeId;
    path.classList.toggle('is-active',on);
  });
  const spine=document.querySelector('#projectFlow .pw-flow-spine');
  if(spine) spine.classList.toggle('is-active',!!p.flow.spine&&nodeId===p.flow.spine.to);
  const tip=$('projectFlowTip');
  if(!tip) return;
  tip.innerHTML=`<span class="pw-flow-tip-kicker">Step ${escHTML(node.num)} / ${String(p.flow.nodes.length).padStart(2,'0')}</span><b>${escHTML(node.title)}</b><p>${escHTML(node.explanation)}</p>`;
  tip.hidden=false;
  requestAnimationFrame(()=>positionFlowTip(nodeId));
  if(opts.syncRoute) syncHash(`/projects/${p.id}/flow/${nodeId}`,{replace:!!opts.replaceRoute});
  publishState();
}
function bindProjectFlowControls(){
  const root=$('project');
  if(!root||root.dataset.flowControlsBound==='true') return;
  root.dataset.flowControlsBound='true';
  root.addEventListener('click',e=>{
    if(e.target.closest('[data-project-flow]')){ e.preventDefault(); openProjectFlow(); return; }
    if(e.target.closest('#projectFlowBack')){ e.preventDefault(); closeProjectFlow(); return; }
    const node=e.target.closest('[data-flow-node]');
    if(node){
      const id=node.dataset.flowNode;
      const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
      node.scrollIntoView({behavior:reduced?'auto':'smooth',block:'nearest',inline:'center'});
      showFlowTip(id,{syncRoute:true});
      if(!reduced) setTimeout(()=>{ if(activeFlowNodeId===id) showFlowTip(id); },520);
      return;
    }
    if(e.target.closest('#projectFlow')){
      clearFlowActiveNode();
      const p=currentProject();
      if(p) syncHash(`/projects/${p.id}/flow`,{replace:true});
      publishState();
    }
  });
  const flow=$('projectFlow');
  if(!flow) return;
  flow.addEventListener('pointerover',e=>{
    if(e.pointerType===('touch')) return;
    const node=e.target.closest('[data-flow-node]');
    if(node) showFlowTip(node.dataset.flowNode);
  });
  flow.addEventListener('pointerout',e=>{
    if(e.pointerType==='touch') return;
    const node=e.target.closest('[data-flow-node]');
    if(!node) return;
    if(node.contains(e.relatedTarget)) return;
    if(document.activeElement===node) return;
    clearFlowActiveNode();
  });
  flow.addEventListener('focusin',e=>{
    const node=e.target.closest('[data-flow-node]');
    if(node) showFlowTip(node.dataset.flowNode);
  });
  flow.addEventListener('focusout',e=>{
    setTimeout(()=>{
      if(flow.contains(document.activeElement)&&document.activeElement.closest?.('[data-flow-node]')) return;
      hideFlowTip();
    },0);
  });
  flow.addEventListener('keydown',e=>{
    if(e.key==='Escape'){
      e.preventDefault();
      e.stopPropagation();
      closeProjectFlow();
      return;
    }
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) return;
    const nodes=[...flow.querySelectorAll('[data-flow-node]')];
    if(!nodes.length) return;
    let index=nodes.indexOf(document.activeElement);
    e.preventDefault();
    e.stopPropagation();
    if(index<0) index=e.key==='ArrowLeft'||e.key==='ArrowUp'?0:-1;
    const next=e.key==='ArrowLeft'||e.key==='ArrowUp'?(index-1+nodes.length)%nodes.length:(index+1)%nodes.length;
    nodes[next].focus({preventScroll:false});
  });
  flow.addEventListener('scroll',()=>{
    if(activeFlowNodeId) positionFlowTip(activeFlowNodeId);
  },true);
}
function updateProjectNav(){
  const n=PROJECTS.length;
  const idx=projectIndexFor(currentProjectId);
  const prev=PROJECTS[(idx-1+n)%n];
  const next=PROJECTS[(idx+1)%n];
  const count=$('projectCount');
  const prevBtn=$('projectPrev');
  const nextBtn=$('projectNext');
  if(count) count.textContent=`${pad(idx+1)} / ${pad(n)}`;
  if(prevBtn){
    prevBtn.setAttribute('aria-label',`Previous project: ${prev.title}`);
    prevBtn.title=`Previous project: ${prev.title} (←)`;
  }
  if(nextBtn){
    nextBtn.setAttribute('aria-label',`Next project: ${next.title}`);
    nextBtn.title=`Next project: ${next.title} (→)`;
  }
}
function navigateProject(dir){
  const n=PROJECTS.length;
  const idx=projectIndexFor(currentProjectId);
  const next=(idx+dir+n)%n;
  projectIndex=next;
  openProject(PROJECTS[next].id,{focusBack:false});
  announce(`${PROJECTS[next].title}, project ${next+1} of ${n}`);
}
let projectClosing=false;
let projectStageScale=1;
function canAnimateProject(){
  return window.innerWidth>1020&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
}
function resetProjectStageScale(){
  const stage=$('projectStage');
  projectStageScale=1;
  if(stage){ stage.style.transform=''; stage.style.transformOrigin=''; }
}
function sizeProjectHero(){
  const hero=$('projectHero');
  if(!hero) return;
  const frame=hero.querySelector('.pw-project-frame');
  if(!frame) return;
  const card=frame.querySelector('.os-card');
  const slot=$('projectHeroSlot');
  if(!card||!slot) return;
  const slotW=slot.clientWidth||frame.clientWidth||hero.clientWidth;
  if(!slotW) return;
  const cs=getComputedStyle(card);
  const dw=parseFloat(cs.width)||388.8;
  const dh=parseFloat(cs.height)||540;
  const w=Math.min(slotW,dw);
  const scale=w/dw;
  frame.style.width=`${w.toFixed(2)}px`;
  frame.style.height=`${(dh*scale).toFixed(2)}px`;
  frame.style.setProperty('--pw-card-scale',String(scale));
  card.style.width=`${dw.toFixed(2)}px`;
  card.style.height=`${dh.toFixed(2)}px`;
  card.style.transform=`scale(${scale.toFixed(5)})`;
}
function fitProjectStage(){
  const stage=$('projectStage');
  if(!stage) return;
  sizeProjectHero();
  const active=currentProject();
  const prevTransition=stage.style.transition;
  stage.style.transition='none';
  resetProjectStageScale();
  void stage.offsetWidth;
  if(active&&active.overview&&window.innerWidth<=1020){
    stage.style.transition=prevTransition;
    return;
  }
  const cols=[document.getElementById('projectHeroSlot'),document.querySelector('.pw-middle'),document.querySelector('.pw-right')]
    .filter(c=>c&&c.getClientRects().length>0);
  if(!cols.length){
    stage.style.transition=prevTransition;
    return;
  }
  const stageTop=stage.getBoundingClientRect().top;
  const maxBottom=Math.max(...cols.map(c=>c.getBoundingClientRect().bottom));
  const targetBottom=window.innerHeight-(window.innerWidth<=1020?72:16);
  if(maxBottom>targetBottom&&targetBottom-stageTop>=260){
    const scale=Math.max(.55,Math.min(1,(targetBottom-stageTop)/(maxBottom-stageTop)));
    if(scale<.998){
      projectStageScale=scale;
      stage.style.transformOrigin='top center';
      stage.style.transform=`scale(${scale})`;
    }
  }
  void stage.offsetWidth;
  stage.style.transition=prevTransition;
}
const PROJECT_TEMPLATES={};
function primeProjectTemplates(){
  PROJECTS.forEach(p=>{
    const hero=document.createElement('template');
    hero.innerHTML=projectHeroHTML(p,p.id);
    applyTooltips(hero.content);
    const brief=document.createElement('template');
    brief.innerHTML=projectOverviewBriefHTML(p);
    applyTooltips(brief.content);
    const gallery=document.createElement('template');
    gallery.innerHTML=projectOverviewValueHTML(p);
    applyTooltips(gallery.content);
    const flow=document.createElement('template');
    flow.innerHTML=p.flow?projectFlowHTML(p):'';
    PROJECT_TEMPLATES[p.id]={hero,brief,gallery,flow};
  });
}
function mountProject(id,hideCta=false){
  const t=PROJECT_TEMPLATES[id];
  if(t){
    const heroFrag=t.hero.content.cloneNode(true);
    if(hideCta){
      const f=heroFrag.querySelector('.pw-project-frame');
      if(f) f.classList.add('cta-hidden');
    }
    $('projectHero').replaceChildren(heroFrag);
    $('projectBrief').replaceChildren(t.brief.content.cloneNode(true));
    $('projectGallery').replaceChildren(t.gallery.content.cloneNode(true));
    if(t.flow) $('projectFlow').replaceChildren(t.flow.content.cloneNode(true));
    else $('projectFlow').replaceChildren();
    return;
  }
  const p=projectById(id);
  $('projectHero').innerHTML=projectHeroHTML(p,id);
  if(hideCta){
    const f=$('projectHero').querySelector('.pw-project-frame');
    if(f) f.classList.add('cta-hidden');
  }
  $('projectBrief').innerHTML=projectOverviewBriefHTML(p);
  $('projectGallery').innerHTML=projectOverviewValueHTML(p);
  if(p.flow) $('projectFlow').innerHTML=projectFlowHTML(p); else $('projectFlow').replaceChildren();
  applyTooltips($('projectHero'));
  applyTooltips($('projectBrief'));
  applyTooltips($('projectGallery'));
}
function resetProjectWorkspace(p){
  document.querySelectorAll('.pw-overview-body').forEach(el=>{ el.scrollTop=0; });
  const canvas=projectCanvasEl();
  if(canvas) canvas.scrollTop=0;
}
let prewarmedId=null;
let prewarmKey='';
let prewarmTimer=null;
function prewarmProject(id){
  if(!id||$('project').classList.contains('open')||projectClosing) return;
  const key=`${window.innerWidth}x${window.innerHeight}`;
  if(prewarmedId===id&&prewarmKey===key&&$('projectHero').childElementCount) return;
  mountProject(id);
  fitProjectStage();
  prewarmedId=id;
  prewarmKey=`${window.innerWidth}x${window.innerHeight}`;
}
function schedulePrewarm(id){
  if(prewarmTimer) clearTimeout(prewarmTimer);
  const target=()=>id||(deck==='projects'?PROJECT_CARDS[activeIndex()].id:null);
  prewarmTimer=setTimeout(()=>{
    const next=target();
    if(next) prewarmProject(next);
  },320);
}
function animateProjectCardIn(fromRect){
  const slot=$('projectHeroSlot');
  if(!slot||!fromRect){ $('project').classList.remove('entering'); return; }
  slot.getAnimations().forEach(a=>a.cancel());
  const to=slot.getBoundingClientRect();
  if(!to.width||!to.height){ $('project').classList.remove('entering'); return; }
  const dx=fromRect.left-to.left;
  const dy=fromRect.top-to.top;
  const sx=fromRect.width/to.width;
  const sy=fromRect.height/to.height;
  const s=projectStageScale||1;
  const start=`translate(${dx/s}px, ${dy/s}px) scale(${sx/s}, ${sy/s})`;
  slot.style.opacity='';
  slot.style.transformOrigin='top left';
  slot.style.transform=start;
  const left=document.querySelector('.pw-left');
  const card=document.querySelector('.pw-project-card');
  if(left){
    left.getAnimations().forEach(a=>a.cancel());
    left.style.transform='translateZ(0) rotateY(0deg)';
    left.animate([
      {transform:'translateZ(0) rotateY(0deg)'},
      {transform:'translateZ(-34px) rotateY(16deg)'}
    ],{duration:PROJECT_FLIGHT_MS,easing:PROJECT_OPEN_EASE});
  }
  if(card){
    card.getAnimations().forEach(a=>a.cancel());
    card.style.borderRadius='30px';
    card.animate([{borderRadius:'30px'},{borderRadius:'38px'}],{duration:PROJECT_FLIGHT_MS,easing:PROJECT_OPEN_EASE});
  }
  requestAnimationFrame(()=>{
    slot.getAnimations().forEach(a=>a.cancel());
    const anim=slot.animate([
      {transform:start,opacity:1},
      {transform:'translate(0, 0) scale(1, 1)',opacity:1}
    ],{duration:PROJECT_FLIGHT_MS,easing:PROJECT_OPEN_EASE});
    anim.onfinish=()=>{
      slot.style.transform='';
      slot.style.transformOrigin='';
      if(left) left.style.transform='';
      if(card) card.style.borderRadius='';
      $('project').classList.remove('entering');
    };
  });
}
function openProject(id,opts={}){
  const focusBack=opts.focusBack!==false;
  const p=projectById(id);
  if(!p) return;
  const wasOpen=$('project').classList.contains('open');
  const activeEl=document.querySelector('.os-card.pos-0[data-deck="projects"]');
  const fromRect=!wasOpen&&activeEl?activeEl.getBoundingClientRect():null;
  const willAnimate=!opts.noFlight&&!wasOpen&&canAnimateProject()&&!!activeEl;
  currentProjectId=id;
  projectIndex=projectIndexFor(id);
  const prewarmHit=!wasOpen&&prewarmedId===id&&prewarmKey===`${window.innerWidth}x${window.innerHeight}`;
  setUtilityOpen(false);
  if(!prewarmHit) mountProject(id, wasOpen);
  resetProjectFlow();
  resetProjectWorkspace(p);
  $('project').classList.toggle('project-has-overview',!!p.overview);
  $('project').dataset.project=p.id;
  $('project').classList.toggle('entering',willAnimate);
  $('project').classList.add('open');
  $('project').setAttribute('aria-hidden','false');
  document.body.classList.add('project-open');
  $('project').scrollTop=0;
  fitProjectStage();
  const frame=$('projectHero').querySelector('.pw-project-frame');
  if(frame){
    if(wasOpen){
      frame.classList.add('cta-hidden');
    } else {
      frame.classList.remove('cta-hidden');
      requestAnimationFrame(()=>frame.classList.add('cta-hidden'));
    }
  }
  updateProjectNav();
  setActiveNav('projects');
  if(opts.syncRoute!==false) syncHash(`/projects/${id}`);
  syncA11y();
  if(willAnimate){
    animateProjectCardIn(fromRect);
    requestAnimationFrame(()=>updateCards());
  } else {
    $('project').classList.remove('entering');
    updateCards();
  }
  if(focusBack) setTimeout(()=>$('projectBack').focus({preventScroll:true}),40);
}
function closeProject(opts={}){
  const overlay=$('project');
  if(!overlay.classList.contains('open')||projectClosing) return;
  const restoreFocus=opts.restoreFocus!==false;
  const flowWasOpen=overlay.classList.contains('project-flow-mode');
  if(flowWasOpen) closeProjectFlow({focus:false,syncRoute:false});
  if(!opts.keepRoute) syncHash('/projects');
  const finish=()=>{
    const slot=$('projectHeroSlot');
    if(slot){
      slot.getAnimations().forEach(a=>a.cancel());
      slot.style.transform='';
      slot.style.transformOrigin='';
      slot.style.opacity='';
    }
    const left=document.querySelector('.pw-left');
    const card=document.querySelector('.pw-project-card');
    if(left){ left.getAnimations().forEach(a=>a.cancel()); left.style.transform=''; }
    if(card){ card.getAnimations().forEach(a=>a.cancel()); card.style.borderRadius=''; }
    overlay.classList.remove('open','closing','entering','project-flow-mode','project-has-overview');
    delete overlay.dataset.project;
    overlay.setAttribute('aria-hidden','true');
    document.body.classList.remove('project-open','project-reveal','project-closing');
    syncUtilityToggleLabel();
    resetProjectStageScale();
    resetProjectFlow();
    prewarmedId=null;
    prewarmKey='';
    projectClosing=false;
    syncA11y();
    publishState();
    schedulePrewarm(deck==='projects'?PROJECT_CARDS[activeIndex()].id:null);
    setActiveNav(deckNavName());
    if(restoreFocus) setTimeout(()=>{
      const activeEl=document.querySelector('.os-card.pos-0[data-deck="projects"]');
      if(activeEl) activeEl.focus({preventScroll:true});
    },30);
  };
  if(!opts.silent) announce('Back to project deck');
  if(opts.immediate||flowWasOpen||!canAnimateProject()){ finish(); return; }
  const slot=$('projectHeroSlot');
  const target=document.querySelector('.os-card.pos-0[data-deck="projects"]');
  if(!slot||!target){ finish(); return; }
  const current=getComputedStyle(slot).transform;
  slot.getAnimations().forEach(a=>a.cancel());
  slot.style.transform=current==='none'?'':current;
  slot.style.opacity='';
  const left=document.querySelector('.pw-left');
  const card=document.querySelector('.pw-project-card');
  let leftStart='translateZ(-34px) rotateY(16deg)';
  if(left){
    const cur=getComputedStyle(left).transform;
    left.getAnimations().forEach(a=>a.cancel());
    if(cur!=='none') left.style.transform=cur;
    leftStart=cur==='none'?'translateZ(0) rotateY(0deg)':cur;
  }
  let radiusStart='38px';
  if(card){
    const cur=getComputedStyle(card).borderRadius;
    card.getAnimations().forEach(a=>a.cancel());
    card.style.borderRadius=cur;
    radiusStart=cur||'38px';
  }
  const from=slot.getBoundingClientRect();
  const to=target.getBoundingClientRect();
  if(!from.width||!to.width){ finish(); return; }
  projectClosing=true;
  overlay.classList.remove('entering');
  overlay.classList.add('closing');
  document.body.classList.add('project-closing','project-reveal');
  const dx=to.left-from.left;
  const dy=to.top-from.top;
  const sx=to.width/from.width;
  const sy=to.height/from.height;
  const s=projectStageScale||1;
  slot.style.transformOrigin='top left';
  const startTransform=current==='none'?'translate(0, 0) scale(1, 1)':current;
  const endTransform=`translate(${dx/s}px, ${dy/s}px) scale(${sx/s}, ${sy/s})`;
  if(left){
    left.animate([
      {transform:leftStart},
      {transform:'translateZ(0) rotateY(0deg)'}
    ],{duration:PROJECT_FLIGHT_MS,easing:PROJECT_CLOSE_EASE,fill:'forwards'});
  }
  if(card){
    card.animate([
      {borderRadius:radiusStart},
      {borderRadius:'30px'}
    ],{duration:PROJECT_FLIGHT_MS,easing:PROJECT_CLOSE_EASE,fill:'forwards'});
  }
  const anim=slot.animate([
    {transform:startTransform},
    {transform:endTransform}
  ],{duration:PROJECT_FLIGHT_MS,easing:PROJECT_CLOSE_EASE,fill:'forwards'});
  anim.onfinish=finish;
}


/* ---------- toast ---------- */
let toastTimer;
function showToast(message){
  const toast=$('toast');
  toast.textContent=message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>toast.classList.remove('show'),3200);
}

/* ---------- routes ---------- */
let routeApplying=false, pendingRoute=null, appliedPath=null;

function rawHashPath(){
  const h=location.hash||'';
  if(!h||!h.startsWith('#/')) return null;
  return h.slice(1);
}
function hashPath(){
  const raw=rawHashPath();
  return raw?normalizePath(raw):null;
}
function syncHash(path,{replace=false}={}){
  if(routeApplying||!path) return;
  const parsed=parseRoute(path);
  const target=parsed?parsed.canonical:normalizePath(path);
  if(hashPath()===target){
    appliedPath=target;
    if(parsed) currentRoute=parsed;
    publishState();
    return;
  }
  try{
    history[replace?'replaceState':'pushState'](null,'','#'+target);
  }catch(e){
    location.hash=target;
    return;
  }
  appliedPath=target;
  currentRoute=parsed||null;
  routeNotFound=!parsed;
  publishState();
}
function openProjectRoute(route){
  const id=route.projectId;
  const overlay=$('project');
  const isOpen=overlay.classList.contains('open');
  if(isOpen&&currentProjectId===id){
    if(route.name==='flow'){
      if(!overlay.classList.contains('project-flow-mode')) openProjectFlow({syncRoute:false,focus:false});
      if(route.nodeId) showFlowTip(route.nodeId,{replaceRoute:true});
      else clearFlowActiveNode();
    }else if(overlay.classList.contains('project-flow-mode')){
      closeProjectFlow({focus:false,syncRoute:false});
    }
    return;
  }
  resetToHomeChrome();
  openProjectDeck(id,{syncRoute:false});
  openProject(id,{noFlight:true,syncRoute:false,focusBack:false});
  if(route.name==='flow') openProjectFlow({syncRoute:false,focus:false});
  if(route.nodeId) showFlowTip(route.nodeId,{replaceRoute:true});
}
function applyRoute(input){
  const parsed=parseRoute(input);
  const requested=(input.startsWith('#')?input.slice(1):input).replace(/\/+$/,'')||'/home';
  if(!parsed){
    routeNotFound=true;
    try{ history.replaceState(null,'','#/home'); }catch(e){}
    if(!entered){
      pendingRoute='/home';
      appliedPath='/home';
      currentRoute=parseRoute('/home');
      publishState();
      return;
    }
    goHome();
    appliedPath='/home';
    currentRoute=parseRoute('/home');
    showToast('That link is not available. Showing Home.');
    publishState();
    return;
  }
  routeNotFound=false;
  if(parsed.canonical!==requested){
    try{ history.replaceState(null,'','#'+parsed.canonical); }catch(e){}
  }
  if(!entered){
    pendingRoute=parsed.canonical;
    currentRoute=parsed;
    publishState();
    return;
  }
  if(parsed.name==='reading'){
    location.replace('read.html'+(parsed.section?`#${parsed.section}`:''));
    appliedPath=parsed.canonical;
    currentRoute=parsed;
    return;
  }
  routeApplying=true;
  try{
    if(parsed.name==='home') goHome();
    else if(parsed.name==='me') goMe({view:'intro'});
    else if(parsed.name==='brain') goMe({view:'brain'});
    else if(parsed.name==='journey') goAboutSection(parsed.chapterId||null);
    else if(parsed.name==='projects') goProjects();
    else if(parsed.name==='project'||parsed.name==='flow') openProjectRoute(parsed);
    else if(parsed.name==='contact') goContact({force:true});
  }finally{
    routeApplying=false;
  }
  appliedPath=parsed.canonical;
  currentRoute=parsed;
  publishState();
}
function applyCurrentPath(){
  const raw=rawHashPath()||'/home';
  if(raw===appliedPath&&currentRoute) return;
  applyRoute(raw);
}
let routeTimer=null;
function scheduleRouteApply(){
  if(routeApplying) return;
  clearTimeout(routeTimer);
  routeTimer=setTimeout(applyCurrentPath,30);
}
window.addEventListener('popstate',scheduleRouteApply);
window.addEventListener('hashchange',scheduleRouteApply);

function buildAppState(){
  const route=currentRoute||parseRoute(appliedPath||hashPath()||'/home')||parseRoute('/home');
  const projectEl=$('project');
  const aboutEl=$('aboutView');
  const projectOpen=!!projectEl&&projectEl.classList.contains('open');
  const flowOpen=projectOpen&&projectEl.classList.contains('project-flow-mode');
  const aboutIsOpen=!!aboutEl&&aboutEl.classList.contains('open');
  const transitionActive=aboutClosing||projectClosing||document.body.classList.contains('about-closing')||document.body.classList.contains('project-closing');
  let transitionType=null;
  if(aboutClosing) transitionType='about-close';
  else if(projectClosing) transitionType='project-close';
  else if(document.body.classList.contains('about-reveal')) transitionType='about-open';
  else if(document.body.classList.contains('project-reveal')) transitionType='project-open';
  return {
    ...initialState,
    apiVersion:'1.0.0',
    ready:document.body.classList.contains('ready'),
    route:{path:route.canonical,name:route.name,section:route.section},
    section:route.section,
    home:{deck,activeCard:activeCard()?.type||null,index:activeIndex()},
    about:{open:aboutIsOpen,view:aboutIsOpen?mePanelView:'intro',chapterId:aboutIsOpen?professionalChapterId:null,closing:aboutClosing},
    project:{open:projectOpen,id:projectOpen?currentProjectId:null,view:flowOpen?'flow':'overview',nodeId:projectOpen?activeFlowNodeId:null,closing:projectClosing},
    contact:{open:mode==='contact'},
    environment:{index:sceneIndex,name:SCENES[sceneIndex]?.name||null},
    motion:{reduced:matchMedia('(prefers-reduced-motion: reduce)').matches},
    transition:{active:transitionActive,type:transitionType},
    notFound:routeNotFound
  };
}
function publishState(){
  try{
    appStore.replace(buildAppState());
    presentationController?.sync();
  }catch(error){
    console.error('NourOS could not publish state',error);
  }
}

/* ---------- entry ---------- */
const WELCOME_DELAY_MS=300;
function showIntroGreeting(){
  if(entered||introStarted) return;
  introStarted=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const show=()=>{
    if(entered) return;
    document.body.classList.add('intro-greeting');
    announce('Welcome to Nour’s Portfolio');
  };
  if(reduced) show();
  else setTimeout(show,WELCOME_DELAY_MS);
}
function finishIntro(){
  if(entered) return;
  entered=true;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const screen=$('enterScreen');
  document.body.classList.remove('intro-frozen');
  if(screen) screen.classList.add('done');
  document.body.classList.add('intro-reveal','ready');
  syncA11y();
  announce('Nour OS ready. Use the arrow keys or the card navigation to explore.');
  const main=$('mainContent');
  if(main) setTimeout(()=>main.focus({preventScroll:true}),reduced?0:120);
  if(pendingRoute){
    const path=pendingRoute;
    pendingRoute=null;
    setTimeout(()=>{
      if(hashPath()===path) applyCurrentPath();
    },reduced?0:420);
  }
  setTimeout(()=>document.body.classList.remove('intro-reveal','intro-greeting'),reduced?0:1500);
}

/* ---------- boot ---------- */
document.body.classList.add('intro-frozen');
buildScenes();
buildCards();
renderDots();
updateDeckChrome();
initScene();
initLocalConditions();
updateCards();
updateMinimalToggle();
updateProjectNav();
setActiveNav('home');
applyTooltips(document);
setUtilityOpen(false);
renderAboutMePanel('intro',{animate:false});
bindAboutMeWorkspace();
const rawInitial=rawHashPath();
const initialPath=rawInitial?normalizePath(rawInitial):'/home';
const initialRoute=parseRoute(initialPath);
if(initialRoute&&initialRoute.name==='reading'){
  location.replace('read.html'+(initialRoute.section?`#${initialRoute.section}`:''));
}else{
  if(!initialRoute){
    try{ history.replaceState(null,'','#/home'); }catch(e){}
    appliedPath='/home';
    currentRoute=parseRoute('/home');
    routeNotFound=true;
    pendingRoute=null;
    setTimeout(()=>showToast('That link is not available. Showing Home.'),1200);
  }else{
    if(initialRoute.canonical!==rawInitial||!rawInitial){
      try{ history.replaceState(null,'','#'+initialRoute.canonical); }catch(e){}
    }
    currentRoute=initialRoute;
    if(initialRoute.canonical==='/home'){
      appliedPath='/home';
      pendingRoute=null;
    }else{
      appliedPath=null;
      pendingRoute=initialRoute.canonical;
    }
  }
  announce('Loading Nour OS.');
  document.addEventListener('click', event => {
    const button = event.target.closest?.('#introChoices [data-explore]');
    if (!button || entered) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.explore === 'ai') {
      window.__ainourExploreRequested = true;
      window.dispatchEvent(new CustomEvent('ainour:explore'));
    }
    finishIntro();
  }, true);
  showIntroGreeting();
}
function warmProjectArt(){
  const urls=[...new Set([...PROJECTS.map(p=>p.cover),...SCENES.map(s=>s.img)])];
  urls.forEach(src=>{
    const img=new Image();
    img.decoding='async';
    img.onload=()=>{ if(img.decode) img.decode().catch(()=>{}); };
    img.src=src;
  });
}
primeProjectTemplates();
bindProjectFlowControls();
warmProjectArt();
schedulePrewarm(PROJECT_CARDS[0].id);

$('readViewBtn').addEventListener('click',()=>{location.href='read.html';});

$('brandHome').addEventListener('click',goHome);
$('NavMe').addEventListener('click',()=>goMe());
$('NavProjects').addEventListener('click',goProjects);
$('NavContact').addEventListener('click',goContact);
$('projectNavMe').addEventListener('click',()=>goMe());
$('projectNavProjects').addEventListener('click',goProjects);
$('projectNavContact').addEventListener('click',goContact);
$('aboutBack').addEventListener('click',()=>closeAbout());
$('aboutNavMe').addEventListener('click',()=>goMe());
$('aboutNavProjects').addEventListener('click',goProjects);
$('aboutNavContact').addEventListener('click',goContact);
$('deckPrev').addEventListener('click',()=>navCard(-1));
$('deckNext').addEventListener('click',()=>navCard(1));
$('quickMinimalToggle').addEventListener('click',()=>{
  if(document.body.classList.contains('minimal')) exitMinimal(); else enterMinimal();
});
$('quickScenePrev').addEventListener('click',()=>setScene(sceneIndex-1));
$('quickSceneNext').addEventListener('click',()=>setScene(sceneIndex+1));
$('contactClose').addEventListener('click',closeContact);
$('projectBack').addEventListener('click',closeProject);
$('projectPrev').addEventListener('click',()=>navigateProject(-1));
$('projectNext').addEventListener('click',()=>navigateProject(1));


// swipe / drag on the deck
$('carousel').addEventListener('pointerdown',e=>{
  if(mode!=='home'||document.body.classList.contains('minimal')||!document.body.classList.contains('ready')) return;
  if(e.target.closest('.card-body')||e.target.closest('button,a')) return;
  drag={x:e.clientX,y:e.clientY,moved:false};
});
window.addEventListener('pointermove',e=>{
  if(!drag) return;
  if(Math.abs(e.clientX-drag.x)>8||Math.abs(e.clientY-drag.y)>8) drag.moved=true;
},{passive:true});
window.addEventListener('pointerup',e=>{
  if(!drag) return;
  const dx=e.clientX-drag.x;
  const moved=drag.moved;
  drag=null;
  if(moved&&Math.abs(dx)>55){
    navCard(dx<0?1:-1);
    suppressClick=true;
    setTimeout(()=>suppressClick=false,80);
  }
});
window.addEventListener('pointercancel',()=>{ drag=null; });

// keyboard
document.addEventListener('keydown',e=>{
  const target=e.target;
  const typing=target instanceof Element&&target.closest('input,textarea,select,[contenteditable="true"]');
  if(!typing&&entered&&e.altKey&&!e.ctrlKey&&!e.metaKey&&!e.shiftKey){
    const navMap={Digit1:goHome,Digit2:goProjects,Digit3:goContact,Digit4:()=>{location.href='read.html';}};
    if(navMap[e.code]){ e.preventDefault(); navMap[e.code](); return; }
  }
  if(typing) return;
  if(aboutOpen){
    if(e.key==='Escape'){
      e.preventDefault();
      if($('aboutDetail').classList.contains('is-visible')) closeAbout();
      else if(mePanelView!=='intro'){
        resetAboutMeWorkspace();
        $('aboutMeContent')?.querySelector('[data-me-brain]')?.focus({preventScroll:true});
      }
      else closeAbout();
    }
    return;
  }
  if(document.body.classList.contains('project-closing')) return;
  if($('project').classList.contains('open')){
    if($('project').classList.contains('project-flow-mode')){
      if(e.key==='Escape'){ e.preventDefault(); closeProjectFlow(); return; }
      if(e.key==='ArrowLeft'||e.key==='ArrowRight') return;
    }
    if(e.key==='Escape'){ e.preventDefault(); closeProject(); return; }
    if(e.key==='ArrowLeft'){ e.preventDefault(); navigateProject(-1); return; }
    if(e.key==='ArrowRight'){ e.preventDefault(); navigateProject(1); return; }
    return;
  }
  if(e.key==='Escape'){
    if(document.body.classList.contains('minimal')) exitMinimal();
    else if(document.body.dataset.mode==='contact') closeContact();
    return;
  }
  if(document.body.dataset.mode==='home'&&document.body.classList.contains('ready')&&!document.body.classList.contains('minimal')){
    if(e.key==='ArrowLeft'){ e.preventDefault(); navCard(-1); }
    if(e.key==='ArrowRight'){ e.preventDefault(); navCard(1); }
  }
});

// pointer parallax on the environment
document.addEventListener('pointermove',e=>{
  if(matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  document.documentElement.style.setProperty('--px',(e.clientX/innerWidth-.5).toFixed(3));
  document.documentElement.style.setProperty('--py',(e.clientY/innerHeight-.5).toFixed(3));
},{passive:true});

let projectFitTimer=null;
window.addEventListener('resize',()=>{
  if(projectFitTimer) clearTimeout(projectFitTimer);
  projectFitTimer=setTimeout(()=>{
    if($('project').classList.contains('open')&&!document.body.classList.contains('project-closing')) fitProjectStage();
    if(aboutOpen&&!aboutClosing){
      sizeAboutCard();
      placeAboutStack();
    }
  },140);
});

syncA11y();

/* ---------- NourOS command API ---------- */
function apiBusy(){
  return aboutClosing||projectClosing||
    document.body.classList.contains('about-closing')||
    document.body.classList.contains('project-closing');
}
function apiOpenProject(id,{syncRoute=true,noFlight=false}={}){
  resetToHomeChrome();
  openProjectDeck(id,{syncRoute:false});
  openProject(id,{syncRoute,noFlight,focusBack:false});
}
function apiNodeRoute(id,nodeId){
  return `/projects/${id}/flow${nodeId?`/${nodeId}`:''}`;
}
function apiNavigateTo(section){
  if(section==='home') goHome();
  else if(section==='me') goMe({view:'intro'});
  else if(section==='brain') goMe({view:'brain'});
  else if(section==='journey') goProfessional();
  else if(section==='projects') goProjects();
  else if(section==='contact') goContact({force:true});
  else if(section==='reading'){ location.href='read.html'; }
  else return false;
  return true;
}
function apiShowProjectCard(projectId){
  resetToHomeChrome();
  openProjectDeck(projectId,{syncRoute:false});
  syncHash('/projects');
  publishState();
  return true;
}
function apiOpenProjectFlow(projectId,nodeId){
  apiOpenProject(projectId,{syncRoute:false,noFlight:true});
  openProjectFlow({syncRoute:false,focus:false});
  if(nodeId) showFlowTip(nodeId,{syncRoute:false});
  syncHash(apiNodeRoute(projectId,nodeId));
  publishState();
  return true;
}
function apiShowFlowNode(projectId,nodeId){
  const overlay=$('project');
  const sameProject=overlay.classList.contains('open')&&currentProjectId===projectId;
  if(!sameProject) apiOpenProject(projectId,{syncRoute:false,noFlight:true});
  if(!overlay.classList.contains('project-flow-mode')) openProjectFlow({syncRoute:false,focus:false});
  showFlowTip(nodeId,{syncRoute:false});
  syncHash(apiNodeRoute(projectId,nodeId),{replace:true});
  publishState();
  return true;
}

presentationController=createPresentationController({
  navigateTo:apiNavigateTo,
  showProjectCard:apiShowProjectCard,
  openProject(projectId){ apiOpenProject(projectId,{syncRoute:true,noFlight:true}); return true; },
  openProjectFlow:apiOpenProjectFlow,
  closeProjectFlow(){ closeProjectFlow({syncRoute:true,focus:false}); return true; },
  showFlowNode:apiShowFlowNode,
  clearFlowNode(){ clearFlowActiveNode(); publishState(); return true; },
  openJourneyChapter(chapterId){ goProfessional(chapterId); return true; },
  openContact(){ goContact({force:true}); return true; },
  getState:buildAppState,
  isReducedMotion:()=>matchMedia('(prefers-reduced-motion: reduce)').matches
});

const commandApi=installCommandApi({
  isBusy:apiBusy,
  navigateTo:apiNavigateTo,
  showProjectCard:apiShowProjectCard,
  openProject(projectId){
    apiOpenProject(projectId);
    return true;
  },
  openProjectFlow:apiOpenProjectFlow,
  highlightFlowNode:apiShowFlowNode,
  openJourneyChapter(chapterId){
    goProfessional(chapterId);
    return true;
  },
  openContact(){
    goContact({force:true});
    return true;
  },
  openReadingView(){
    location.href='read.html';
    return true;
  },
  goBack(){
    if(history.length>1) history.back();
    else goHome();
    return true;
  },
  getPresentationTargets(options){ return presentationController?.getTargets(options)||{targets:[]}; },
  getPresentationTarget(targetId){ return presentationController?.getTarget(targetId)||null; },
  applyPresentationAction(action){ return presentationController?.applyAction(action)||{ok:false,error:'PRESENTATION_UNAVAILABLE'}; },
  cancelPresentationActions(){ presentationController?.cancelPending(); },
  waitForPresentationTarget(targetId){ return presentationController?.waitForTarget(targetId)||Promise.resolve(false); },
  getPresentationState(){ return presentationController?.getState()||null; }
},appStore);


