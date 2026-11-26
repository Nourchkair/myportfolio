import { PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

export const SECTION_ROUTES = Object.freeze({
  home: '/home',
  me: '/me',
  brain: '/me/brain',
  journey: '/journey',
  projects: '/projects',
  contact: '/contact',
  reading: '/read'
});

const chapterIds = new Set(PROFESSIONAL_CHAPTERS.map(chapter => chapter.id));

export function normalizePath(input){
  if(!input || input==='#') return '/home';
  let path=input.startsWith('#') ? input.slice(1) : input;
  if(!path.startsWith('/')) path='/'+path;
  path=path.replace(/\/+$/,'') || '/';
  if(path==='/') return '/home';
  if(path==='/about'||path==='/about-me') return '/me';
  if(path==='/professional'||path==='/about/professional') return '/journey';
  if(path==='/simple'||path.startsWith('/simple/')) return '/read'+path.slice(7);
  return path;
}

const route = (name,section,canonical,extra={}) => ({name,section,path:canonical,canonical,...extra});

export function parseRoute(input){
  const path=normalizePath(input);
  if(path==='/home') return route('home','home','/home');
  if(path==='/me') return route('me','me','/me');
  if(path==='/me/brain') return route('brain','me','/me/brain');
  if(path==='/journey') return route('journey','journey','/journey');
  if(path.startsWith('/journey/')){
    const chapterId=path.slice('/journey/'.length);
    if(!chapterIds.has(chapterId)) return null;
    return route('journey','journey',`/journey/${chapterId}`,{chapterId});
  }
  if(path==='/projects') return route('projects','projects','/projects');
  if(path.startsWith('/projects/')){
    const rest=path.slice('/projects/'.length).split('/');
    const projectId=rest[0];
    if(!PROJECT_BY_ID[projectId]) return null;
    if(rest.length===1) return route('project','projects',`/projects/${projectId}`,{projectId});
    if(rest.length===2 && rest[1]==='flow') return route('flow','projects',`/projects/${projectId}/flow`,{projectId});
    if(rest.length===3 && rest[1]==='flow'){
      const nodeId=rest[2];
      const node=PROJECT_BY_ID[projectId].flow?.nodes?.find(n=>n.id===nodeId);
      if(!node) return null;
      return route('flow','projects',`/projects/${projectId}/flow/${nodeId}`,{projectId,nodeId});
    }
    return null;
  }
  if(path==='/contact') return route('contact','contact','/contact');
  if(path==='/read') return route('reading','reading','/read');
  if(path.startsWith('/read/')) return route('reading','reading',path,{section:path.slice('/read/'.length)});
  return null;
}

export function routeForSection(section, extra={}){
  if(section==='project'&&extra.projectId) return `/projects/${extra.projectId}`;
  if(section==='flow'&&extra.projectId){
    return `/projects/${extra.projectId}/flow${extra.nodeId?`/${extra.nodeId}`:''}`;
  }
  if(section==='journey'&&extra.chapterId) return `/journey/${extra.chapterId}`;
  return SECTION_ROUTES[section]||null;
}
