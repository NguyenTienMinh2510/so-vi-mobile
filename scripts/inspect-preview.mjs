import fs from 'node:fs';

const htmlPath = 'artifacts/ai-spending-preview/index.html';
const raw = fs.readFileSync(htmlPath, 'utf8');

// Find start of <section data-panel="plan"
const planStartIdx = raw.indexOf('<section data-panel="plan"');
if (planStartIdx === -1) {
  console.error('Could not find data-panel="plan"');
  process.exit(1);
}

// Find start of <section data-panel="model"
const modelStartIdx = raw.indexOf('<section data-panel="model"');
if (modelStartIdx === -1) {
  console.error('Could not find data-panel="model"');
  process.exit(1);
}

const beforePlan = raw.slice(0, planStartIdx);
const afterPlan = raw.slice(modelStartIdx);

console.log('Found plan slice:', planStartIdx, modelStartIdx);
