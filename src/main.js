import './app/immersive.js?v=47';

const aiNourParams = new URLSearchParams(location.search);
const aiNourMode = aiNourParams.get('ainour');
const aiNourLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const aiNourEnabled = !aiNourLocal
  || aiNourMode === 'beta'
  || aiNourMode === '1'
  || (aiNourLocal && aiNourMode === 'dev');

if (aiNourEnabled) {
  import('./ai-nour/companion.js?v=27')
    .then((module) => module.mountCompanion())
    .catch((error) => console.warn('Nupa companion could not start', error));
}
