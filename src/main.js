import './app/immersive.js?v=34';

const aiNourParams = new URLSearchParams(location.search);
const aiNourEnabled = aiNourParams.get('ainour') === '1'
  || aiNourParams.get('ainour') === 'dev'
  || localStorage.getItem('ainour:enabled') === '1';

if (aiNourEnabled) {
  import('./ai-nour/companion.js')
    .then((module) => module.mountCompanion())
    .catch((error) => console.warn('AI Nour companion could not start', error));
}
