import { PROJECTS } from '../data/projects.js';
import { PROFESSIONAL_TAGLINE, PROFESSIONAL_INTRO, PROFESSIONAL_CHAPTERS } from '../data/journey.js';
import { PROFILE_INTERSECTION, ABOUT_ME_INTRO, ABOUT_ME_WORK, ABOUT_ME_DIRECTION } from '../data/profile.js';
import { SITE } from '../data/site.js';
import { escHTML as e } from '../utils/html.js';

const asArray = value => Array.isArray(value) ? value : (value == null ? [] : [value]);

function paragraphs(items){
  return asArray(items).map(text=>`<p>${e(text)}</p>`).join('');
}
function list(items,className=''){
  const values=asArray(items);
  if(!values.length) return '';
  return `<ul${className?` class="${className}"`:''}>${values.map(item=>`<li>${e(item)}</li>`).join('')}</ul>`;
}
function chapterHTML(chapter){
  const roles=asArray(chapter.roles).map(role=>`<div class="reading-role"><span>${e(role.org)}</span><b>${e(role.role)}</b><small>${e(role.period)}</small></div>`).join('');
  const milestoneTitle=chapter.milestonesTitle||'Milestones';
  const milestones=asArray(chapter.milestones).length
    ? `<div class="reading-milestone-block" role="group" aria-label="${e(milestoneTitle)}"><span class="reading-milestone-kicker">${e(milestoneTitle)}</span><div class="reading-milestones">${chapter.milestones.map((item,i)=>{
        const primary=i===0;
        const wide=String(item.value).length>8||!/\d/.test(String(item.value));
        return `<div class="reading-milestone${primary?' is-primary':''}"><b${wide?' class="is-wide"':''}>${e(item.value)}</b><span>${e(item.label)}</span></div>`;
      }).join('')}</div></div>`
    : '';
  const details=asArray(chapter.details).length?`<div class="reading-subblock"><h4>${e(chapter.detailsTitle||'At a glance')}</h4>${list(chapter.details,'reading-list')}</div>`:'';
  const focus=asArray(chapter.interests).length?`<div class="reading-subblock"><h4>${e(chapter.interestsTitle||'Focus areas')}</h4>${list(chapter.interests,'reading-list')}</div>`:'';
  const ambitions=asArray(chapter.ambitions).length?`<div class="reading-subblock"><h4>${e(chapter.ambitionsTitle||'Long-term ambitions')}</h4>${list(chapter.ambitions,'reading-list')}</div>`:'';
  const skills=asArray(chapter.capabilities).length?`<div class="reading-subblock"><h4>${e(chapter.capabilitiesLabel||'Core capabilities')}</h4><p class="reading-skills">${chapter.capabilities.map(e).join(' · ')}</p></div>`:'';
  return `<article class="reading-chapter" id="chapter-${e(chapter.id)}">
    <header class="reading-chapter-head"><span class="reading-kicker">${e(chapter.num)} / ${String(PROFESSIONAL_CHAPTERS.length).padStart(2,'0')} · ${e(chapter.period)}</span><h3>${e(chapter.title)}</h3></header>
    ${roles?`<div class="reading-roles">${roles}</div>`:''}
    ${milestones}
    <div class="reading-prose">${paragraphs(chapter.paragraphs)}</div>
    <div class="reading-chapter-grid">${details}${focus}${ambitions}${skills}</div>
    ${chapter.direction?`<blockquote class="reading-direction"><span>How it shaped the next step</span>${e(chapter.direction)}</blockquote>`:''}
  </article>`;
}
function contributionHTML(contribution){
  if(!contribution) return '';
  return `<section class="reading-project-block reading-contribution"><h4>My Contribution</h4>${contribution.lead?`<p class="reading-lede">${e(contribution.lead)}</p>`:''}${asArray(contribution.blocks).map(block=>`<div class="reading-contribution-row"><b>${e(block.label)}</b><p>${e(block.text)}</p></div>`).join('')}</section>`;
}
function flowHTML(project){
  const flow=project.flow; if(!flow) return '';
  const nodes=asArray(flow.nodes);
  const byId=Object.fromEntries(nodes.map(node=>[node.id,node]));
  const connections=asArray(flow.connections).filter(c=>byId[c.from]&&byId[c.to]);
  const nodeList=nodes.map(node=>`<li><span class="reading-flow-num">${e(node.num)}</span><div><h5>${e(node.title)}</h5><p class="reading-flow-visible">${e(node.visible)}</p><p>${e(node.explanation)}</p></div></li>`).join('');
  const links=connections.map(c=>`<li><b>${e(byId[c.from].title)}</b> → <b>${e(byId[c.to].title)}</b>${c.label?` <span>${e(c.label)}</span>`:''}</li>`).join('');
  return `<details class="reading-flow"><summary>How the work flows</summary><ol class="reading-flow-nodes">${nodeList}</ol>${links?`<div class="reading-flow-links"><h5>Connections</h5><ul>${links}</ul></div>`:''}${flow.scopeNote?`<p class="reading-note">${e(flow.scopeNote)}</p>`:''}</details>`;
}
function projectHTML(project){
  const overview=project.overview||{};
  return `<article class="reading-project" id="project-${e(project.id)}">
    <header class="reading-project-head"><span class="reading-kicker">${e(project.num)} / ${String(PROJECTS.length).padStart(2,'0')} · ${e(project.category)}</span><h3>${e(project.fullTitle||project.title)}</h3>${project.subtitle?`<p class="reading-subtitle">${e(project.subtitle)}</p>`:''}<p class="reading-project-desc">${e(project.description)}</p></header>
    <div class="reading-project-grid">
      <section class="reading-project-block"><h4>What it is</h4>${paragraphs(overview.whatItIs)}</section>
      <section class="reading-project-block"><h4>Business challenges</h4>${list(overview.challenges,'reading-list')}</section>
      <section class="reading-project-block"><h4>Business value</h4>${list(overview.value,'reading-list')}</section>
      ${contributionHTML(overview.contribution)}
    </div>
    ${flowHTML(project)}
  </article>`;
}
export function renderReadingContent(){
  const journey=PROFESSIONAL_CHAPTERS.map(chapterHTML).join('');
  const projects=PROJECTS.map(projectHTML).join('');
  return `<main id="reading-main" class="reading-main">
    <section class="reading-hero" id="about" aria-labelledby="reading-title">
      <span class="reading-kicker">Nour Chkair / Reading view</span>
      <h1 id="reading-title">I turn customer insight into commercial strategy.</h1>
      <p class="reading-lead">${e(PROFILE_INTERSECTION)}</p>
      <div class="reading-prose">${paragraphs(ABOUT_ME_INTRO.slice(1))}</div>
      <div class="reading-hero-actions"><a class="reading-cta" href="#contact">Contact</a><a class="reading-link" href="${SITE.linkedin}" target="_blank" rel="noopener">LinkedIn ↗</a><a class="reading-link" href="${SITE.github}" target="_blank" rel="noopener">GitHub ↗</a></div>
    </section>
    <section class="reading-section" id="approach" aria-labelledby="approach-title"><header class="reading-section-head"><span>01</span><h2 id="approach-title">About my approach</h2></header><div class="reading-prose">${paragraphs(ABOUT_ME_WORK)}</div><div class="reading-prose reading-direction-copy">${paragraphs(ABOUT_ME_DIRECTION)}</div></section>
    <section class="reading-section" id="experience" aria-labelledby="experience-title"><header class="reading-section-head"><span>02</span><h2 id="experience-title">My Journey</h2></header><p class="reading-lead">${e(PROFESSIONAL_TAGLINE)}</p><div class="reading-prose">${paragraphs(PROFESSIONAL_INTRO)}</div><nav class="reading-index" aria-label="My Journey chapters">${PROFESSIONAL_CHAPTERS.map(chapter=>`<a href="#chapter-${e(chapter.id)}">${e(chapter.num)} ${e(chapter.label)}</a>`).join('')}</nav><div class="reading-chapters">${journey}</div></section>
    <section class="reading-section" id="projects" aria-labelledby="projects-title"><header class="reading-section-head"><span>03</span><h2 id="projects-title">Projects</h2></header><p class="reading-lead">Five projects across customer acquisition, service operations, AI communication, knowledge systems and workplace intelligence.</p><nav class="reading-index" aria-label="Projects">${PROJECTS.map(project=>`<a href="#project-${e(project.id)}">${e(project.num)} ${e(project.title)}</a>`).join('')}</nav><div class="reading-projects">${projects}</div></section>
    <section class="reading-section" id="contact" aria-labelledby="contact-title"><header class="reading-section-head"><span>04</span><h2 id="contact-title">Contact</h2></header><p class="reading-lead">${e(SITE.contactIntro)}</p><div class="reading-hero-actions"><a class="reading-cta" href="${SITE.linkedin}" target="_blank" rel="noopener">Message on LinkedIn ↗</a><a class="reading-link" href="${SITE.github}" target="_blank" rel="noopener">GitHub ↗</a></div><p class="reading-note">${e(SITE.contactNote)}</p></section>
  </main>`;
}
export function renderReadingPage(){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#080d11">
<title>${e(SITE.title)} — Reading view</title>
<meta name="description" content="${e(SITE.description)}">
<meta name="robots" content="index,follow">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<meta property="og:type" content="website">
<meta property="og:title" content="${e(SITE.title)}">
<meta property="og:description" content="${e(SITE.description)}">
<meta property="og:image" content="assets/portraits/nour-about.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="stylesheet" href="src/styles/reading.css">
</head>
<body class="reading-page">
<a class="skip-link" href="#reading-main">Skip to content</a>
<header class="reading-head">
  <a class="reading-brand" href="index.html#/home" aria-label="Nour Chkair — immersive portfolio"><span class="reading-mark" aria-hidden="true">N</span><span><b>${e(SITE.name)}</b><small>Business strategy, sales &amp; applied AI</small></span></a>
  <nav class="reading-nav" aria-label="Reading view sections"><a href="#about">About</a><a href="#experience">My Journey</a><a href="#projects">Projects</a><a href="#contact">Contact</a></nav>
  <a class="reading-exit" href="index.html#/home">Open immersive portfolio ↗</a>
</header>
${renderReadingContent()}
<footer class="reading-foot"><span>Nour OS / Reading view</span><a href="index.html#/home">Open immersive portfolio ↗</a></footer>
</body>
</html>`;
}
