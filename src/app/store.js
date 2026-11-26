const frozen = value => Object.freeze(value);

export function createStore(initial){
  let state=frozen(initial);
  const listeners=new Set();
  return {
    getState(){ return state; },
    replace(next){
      state=frozen(next);
      for(const listener of [...listeners]){
        try{ listener(state); }catch(error){ console.error('NourOS state subscriber failed',error); }
      }
      return state;
    },
    subscribe(listener){
      if(typeof listener!=='function') throw new TypeError('Subscriber must be a function');
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

export const initialState = {
  apiVersion: '1.0.0',
  ready: false,
  route: { path: '/home', section: 'home' },
  section: 'home',
  home: { activeCard: 'profile', index: 1 },
  about: { open: false, view: 'intro', chapterId: null },
  project: { open: false, id: null, view: 'overview', nodeId: null },
  contact: { open: false },
  environment: { index: 0 },
  motion: { reduced: false },
  transition: { active: false, type: null },
  notFound: false
};
