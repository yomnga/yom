// Fully Automated Workflow — job queue ที่ทำงานทุกขั้นตอนอัตโนมัติ:
// สุ่มสไตล์ → เขียน AI prompt → สร้างภาพสินค้า → สร้างวิดีโอ (1-2 ฉาก) → เก็บเข้าคลัง
// รองรับสั่งผลิตต่อเนื่องหลายคลิป (batch) โดยไม่ต้องกดซ้ำ
const store = require('./store');
const providers = require('./providers');

const queue = [];
let running = false;

function stepList(scenes) {
  const steps = [
    { key: 'style', label: 'สุ่ม/เลือกสไตล์วิดีโอ' },
    { key: 'prompt', label: 'AI เขียน prompt (Storyboard)' },
    { key: 'image', label: 'สร้างภาพสินค้า AI' }
  ];
  for (let i = 1; i <= scenes; i++) steps.push({ key: `scene${i}`, label: `สร้างวิดีโอฉากที่ ${i} (8 วิ)` });
  steps.push({ key: 'finish', label: 'ประกอบวิดีโอ + บันทึกเข้าคลัง' });
  return steps;
}

function enqueue({ productId, scenes = 1, mode, styleId, characterId, count = 1 }) {
  const settings = store.get('settings');
  const product = store.get('products').find(p => p.id === productId);
  if (!product) throw new Error('ไม่พบสินค้า');
  scenes = scenes === 2 ? 2 : 1;
  const jobs = [];
  for (let i = 0; i < Math.min(count, 20); i++) {
    const job = {
      id: store.id('job'),
      productId,
      productName: product.name,
      scenes,
      mode: mode || settings.defaultMode,
      styleId: styleId || null,
      characterId: characterId || null,
      status: 'queued',
      progress: 0,
      steps: stepList(scenes).map(s => ({ ...s, status: 'pending' })),
      createdAt: new Date().toISOString(),
      error: null,
      videoId: null
    };
    jobs.push(job);
    queue.push(job.id);
  }
  store.update('jobs', all => [...jobs, ...all].slice(0, 200));
  processQueue();
  return jobs;
}

function saveJob(job) {
  store.update('jobs', all => all.map(j => (j.id === job.id ? job : j)));
}

function markStep(job, key, status) {
  const step = job.steps.find(s => s.key === key);
  if (step) step.status = status;
  const done = job.steps.filter(s => s.status === 'done').length;
  job.progress = Math.round((done / job.steps.length) * 100);
  saveJob(job);
}

async function runJob(job) {
  const product = store.get('products').find(p => p.id === job.productId);
  const settings = store.get('settings');
  try {
    job.status = 'running';
    saveJob(job);

    // 1) สไตล์: ใช้จาก Style Library ถ้าเลือกไว้ ไม่งั้นสุ่ม
    markStep(job, 'style', 'running');
    let style;
    if (job.styleId) {
      const s = store.get('styles').find(x => x.id === job.styleId);
      style = s ? s.prompt : providers.pickRandomStyle();
    } else {
      style = providers.pickRandomStyle();
    }
    job.style = style;
    markStep(job, 'style', 'done');

    // 2) prompt + storyboard
    markStep(job, 'prompt', 'running');
    const character = job.characterId ? store.get('characters').find(c => c.id === job.characterId) : null;
    const prompts = providers.buildPrompts({ product, style, character, scenes: job.scenes });
    job.prompts = prompts;
    markStep(job, 'prompt', 'done');

    // 3) ภาพสินค้า
    markStep(job, 'image', 'running');
    const image = await providers.generateImage({ prompt: prompts.imagePrompt, mode: job.mode, label: product.name });
    markStep(job, 'image', 'done');

    // 4) วิดีโอทีละฉาก
    const sceneResults = [];
    for (let i = 0; i < job.scenes; i++) {
      markStep(job, `scene${i + 1}`, 'running');
      const scene = await providers.generateVideoScene({
        prompt: prompts.scenePrompts[i], mode: job.mode, label: `${product.name} #${i + 1}`
      });
      sceneResults.push(scene);
      markStep(job, `scene${i + 1}`, 'done');
    }

    // 5) บันทึกวิดีโอ + ตัดเครดิต
    markStep(job, 'finish', 'running');
    const creditCost = settings.creditCostImage + settings.creditCostVideoPerScene * job.scenes;
    if (job.mode === 'credit') {
      store.update('settings', s => ({ ...s, credits: Math.max(0, s.credits - creditCost) }));
    }
    store.update('usage', u => [
      { at: new Date().toISOString(), type: 'generate', mode: job.mode, credits: job.mode === 'credit' ? creditCost : 0, jobId: job.id },
      ...u
    ].slice(0, 1000));

    const video = {
      id: store.id('vid'),
      productId: product.id,
      productName: product.name,
      title: `${product.name} — ${style.slice(0, 30)}`,
      style,
      scenes: job.scenes,
      durationSec: job.scenes * 8,
      mode: job.mode,
      thumbnail: image.file,
      sceneFiles: sceneResults.map(s => s.file),
      provider: sceneResults[0]?.provider || 'placeholder',
      warning: image.warning || sceneResults.find(s => s.warning)?.warning || null,
      status: 'ready',
      createdAt: new Date().toISOString()
    };
    store.update('videos', v => [video, ...v]);
    job.videoId = video.id;
    markStep(job, 'finish', 'done');
    job.status = 'done';
    job.progress = 100;
    saveJob(job);
  } catch (err) {
    job.status = 'failed';
    job.error = err.message;
    saveJob(job);
  }
}

async function processQueue() {
  if (running) return;
  running = true;
  while (queue.length) {
    const jobId = queue.shift();
    const job = store.get('jobs').find(j => j.id === jobId);
    if (!job || job.status !== 'queued') continue;
    // หน่วงเล็กน้อยระหว่างขั้นตอนเพื่อให้เห็น progress ในโหมดจำลอง
    await runJob(job);
  }
  running = false;
}

// เมื่อรีสตาร์ทเซิร์ฟเวอร์ ให้คิวงานค้างกลับเข้าคิว
function resume() {
  for (const j of store.get('jobs')) {
    if (j.status === 'queued' || j.status === 'running') {
      j.status = 'queued';
      saveJob(j);
      queue.push(j.id);
    }
  }
  processQueue();
}

module.exports = { enqueue, resume };
