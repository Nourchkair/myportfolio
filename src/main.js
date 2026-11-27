import './app/immersive.js?v=46';

const aiNourParams = new URLSearchParams(location.search);
const aiNourMode = aiNourParams.get('ainour');
const aiNourLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const aiNourEnabled = aiNourMode === 'beta'
  || aiNourMode === '1'
  || (aiNourLocal && aiNourMode === 'dev');

if (aiNourEnabled) {
  import('./ai-nour/companion.js?v=20')
    .then((module) => module.mountCompanion())
    .catch((error) => console.warn('Nupa companion could not start', error));
}
