import { PROJECT_BY_ID } from '../data/projects.js';
import { PROFESSIONAL_CHAPTERS } from '../data/journey.js';

export const API_VERSION='1.0.0';
const SECTIONS=new Set(['home','me','brain','journey','projects','contact','reading']);
const CHAPTER_IDS=new Set(PROFESSIONAL_CHAPTERS.map(chapter=>chapter.id));

const COMMANDS=Object.freeze([
  'navigateTo','openProject','openProjectFlow','highlightFlowNode',
  'openJourneyChapter','openContact','openReadingView','goBack',
  'getCurrentState','getStatus','subscribe'
]);

function fail(code,message,details){
  return {ok:false,error:{code,message,...(details?{details}:{})}};
}
function clone(value){
  if(typeof structuredClone==='function') return structuredClone(value);
  return JSON.parse(JSON.stringify(value));
}
function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export function createCommandApi(adapter,store){
  if(!adapter||!store) throw new Error('Command API requires an adapter and store');
  const run=async(command,args,fn)=>{
    try{
      if(adapter.isBusy?.()) return fail('BUSY','A navigation transition is in progress');
      const result=await fn();
      if(result===false) return fail('INVALID_STATE','The requested action is not available in the current view');
      return {ok:true,state:deepFreeze(clone(store.getState()))};
    }catch(error){
      return fail(error?.code||'COMMAND_FAILED',error?.message||`${command} failed`);
    }
  };
  const api={
    apiVersion:API_VERSION,
    actions:COMMANDS,
    ready:()=>Boolean(store.getState().ready),
    getStatus(){
      const state=store.getState();
      return deepFreeze({
        ready:state.ready,
        transitioning:state.transition.active,
        apiVersion:API_VERSION,
        route:state.route.path,
        section:state.section,
        actions:COMMANDS,
        context:{
          route:state.route,
          home:state.home,
          about:state.about,
          project:state.project,
          contact:state.contact,
          environment:state.environment
        }
      });
    },
    getCurrentState(){ return deepFreeze(clone(store.getState())); },
    subscribe(listener){ return store.subscribe(listener); },
    navigateTo(section){
      return run('navigateTo',[section],()=>{
        if(!SECTIONS.has(section)) throw Object.assign(new Error('Unknown section'),{code:'UNKNOWN_SECTION'});
        return adapter.navigateTo(section);
      });
    },
    openProject(projectId){
      return run('openProject',[projectId],()=>{
        if(typeof projectId!=='string'||!PROJECT_BY_ID[projectId]) throw Object.assign(new Error('Unknown project id'),{code:'UNKNOWN_PROJECT'});
        return adapter.openProject(projectId);
      });
    },
    openProjectFlow(projectId,nodeId){
      return run('openProjectFlow',[projectId,nodeId],()=>{
        if(typeof projectId!=='string'||!PROJECT_BY_ID[projectId]) throw Object.assign(new Error('Unknown project id'),{code:'UNKNOWN_PROJECT'});
        if(nodeId!=null&&!PROJECT_BY_ID[projectId].flow?.nodes?.some(node=>node.id===nodeId)) throw Object.assign(new Error('Unknown flow node'),{code:'UNKNOWN_NODE'});
        return adapter.openProjectFlow(projectId,nodeId||null);
      });
    },
    highlightFlowNode(projectId,nodeId){
      return run('highlightFlowNode',[projectId,nodeId],()=>{
        if(typeof projectId!=='string'||!PROJECT_BY_ID[projectId]) throw Object.assign(new Error('Unknown project id'),{code:'UNKNOWN_PROJECT'});
        if(typeof nodeId!=='string'||!PROJECT_BY_ID[projectId].flow?.nodes?.some(node=>node.id===nodeId)) throw Object.assign(new Error('Unknown flow node'),{code:'UNKNOWN_NODE'});
        return adapter.highlightFlowNode(projectId,nodeId);
      });
    },
    openJourneyChapter(chapterId){
      return run('openJourneyChapter',[chapterId],()=>{
        if(typeof chapterId!=='string'||!CHAPTER_IDS.has(chapterId)) throw Object.assign(new Error('Unknown chapter id'),{code:'UNKNOWN_CHAPTER'});
        return adapter.openJourneyChapter(chapterId);
      });
    },
    openContact(){ return run('openContact',[],()=>adapter.openContact()); },
    openReadingView(){ return run('openReadingView',[],()=>adapter.openReadingView()); },
    goBack(){ return run('goBack',[],()=>adapter.goBack()); }
  };
  return Object.freeze(api);
}

export function installCommandApi(adapter,store){
  const api=createCommandApi(adapter,store);
  Object.defineProperty(window,'NourOS',{value:api,configurable:false,writable:false,enumerable:true});
  return api;
}
