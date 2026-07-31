// AI provider adapters — สองโหมดตามสเปค:
//   Credit-Based Mode : GPT Image (OpenAI) + Veo 3 (Gemini API)
//   Google Flow Mode  : Nano Banana (gemini-2.5-flash-image) + Veo ผ่าน Gemini API key ของผู้ใช้เอง
// ทุกตัวเรียกผ่าน API ทางการเท่านั้น ถ้าไม่มี key จะสร้างสื่อจำลอง (placeholder)
// เพื่อให้ทดลอง workflow ทั้งระบบได้โดยไม่มีค่าใช้จ่าย
const fs = require('fs');
const path = require('path');
const store = require('./store');

const STYLE_POOL = [
  'Clean studio product shot, soft lighting',
  'Lifestyle vlog, handheld, natural daylight',
  'Unboxing close-up, macro details',
  'Street style, urban background, high energy',
  'Minimal aesthetic, pastel tones',
  'Cinematic slow motion, dramatic lighting',
  'POV demonstration, first person',
  'Before/After comparison, split screen'
];

function pickRandomStyle() {
  return STYLE_POOL[Math.floor(Math.random() * STYLE_POOL.length)];
}

// เขียน prompt สำหรับภาพ/วิดีโอจากข้อมูลสินค้า + สไตล์ + ตัวละคร
function buildPrompts({ product, style, character, scenes }) {
  const char = character ? `Featuring recurring character: ${character.description}. ` : '';
  const base = `${char}Product: ${product.name}. ${product.description || ''} Style: ${style}.`;
  const imagePrompt = `High-quality vertical 9:16 product image for TikTok. ${base} No text overlays.`;
  const scenePrompts = [];
  scenePrompts.push(`Scene 1 (8s): Hook — show the product in action immediately. ${base} Vertical 9:16, engaging first 2 seconds.`);
  if (scenes === 2) {
    scenePrompts.push(`Scene 2 (8s): Payoff — benefits close-up and call-to-action mood, smooth continuation from scene 1 (same setting, same lighting). ${base} Vertical 9:16.`);
  }
  return { imagePrompt, scenePrompts };
}

// ---------- placeholder generators (ไม่มี API key) ----------
function placeholderImage(prompt, label) {
  const file = `${store.id('img')}.svg`;
  const hue = Math.floor(Math.random() * 360);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="540" height="960" viewBox="0 0 540 960">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue},70%,45%)"/><stop offset="1" stop-color="hsl(${(hue + 60) % 360},70%,30%)"/>
  </linearGradient></defs>
  <rect width="540" height="960" fill="url(#g)"/>
  <text x="270" y="440" fill="#fff" font-family="sans-serif" font-size="30" text-anchor="middle" font-weight="bold">${escapeXml(label)}</text>
  <text x="270" y="500" fill="#ffffffaa" font-family="sans-serif" font-size="16" text-anchor="middle">AI PREVIEW (placeholder)</text>
</svg>`;
  fs.writeFileSync(path.join(store.MEDIA_DIR, file), svg);
  return { file: `/media/${file}`, provider: 'placeholder', prompt };
}

function escapeXml(s) {
  return String(s).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).slice(0, 40);
}

// ---------- real API calls (เมื่อผู้ใช้ตั้งค่า key) ----------
async function openaiImage(prompt, apiKey) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'gpt-image-1', prompt, size: '1024x1536', n: 1 })
  });
  if (!res.ok) throw new Error(`OpenAI image error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const b64 = data.data[0].b64_json;
  const file = `${store.id('img')}.png`;
  fs.writeFileSync(path.join(store.MEDIA_DIR, file), Buffer.from(b64, 'base64'));
  return { file: `/media/${file}`, provider: 'gpt-image', prompt };
}

async function geminiImage(prompt, apiKey) {
  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent',
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );
  if (!res.ok) throw new Error(`Gemini image error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const part = data.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
  if (!part) throw new Error('Gemini ไม่คืนรูปภาพ');
  const file = `${store.id('img')}.png`;
  fs.writeFileSync(path.join(store.MEDIA_DIR, file), Buffer.from(part.inlineData.data, 'base64'));
  return { file: `/media/${file}`, provider: 'nano-banana', prompt };
}

// Veo 3 ผ่าน Gemini API (long-running operation)
async function veoVideo(prompt, apiKey, model = 'veo-3.0-generate-001') {
  const start = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:predictLongRunning`,
    {
      method: 'POST',
      headers: { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ instances: [{ prompt }] })
    }
  );
  if (!start.ok) throw new Error(`Veo error ${start.status}: ${(await start.text()).slice(0, 200)}`);
  let op = await start.json();
  const deadline = Date.now() + 5 * 60 * 1000;
  while (!op.done && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 10000));
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${op.name}`, {
      headers: { 'x-goog-api-key': apiKey }
    });
    op = await poll.json();
  }
  if (!op.done) throw new Error('Veo generation timeout');
  const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
  if (!uri) throw new Error('Veo ไม่คืนวิดีโอ');
  const vid = await fetch(uri, { headers: { 'x-goog-api-key': apiKey } });
  const file = `${store.id('vid')}.mp4`;
  fs.writeFileSync(path.join(store.MEDIA_DIR, file), Buffer.from(await vid.arrayBuffer()));
  return { file: `/media/${file}`, provider: 'veo-3', prompt };
}

// ---------- public API ----------
async function generateImage({ prompt, mode, label }) {
  const s = store.get('settings');
  try {
    if (mode === 'credit' && s.openaiApiKey) return await openaiImage(prompt, s.openaiApiKey);
    if (mode === 'flow' && s.geminiApiKey) return await geminiImage(prompt, s.geminiApiKey);
  } catch (err) {
    return { ...placeholderImage(prompt, label), warning: err.message };
  }
  return placeholderImage(prompt, label);
}

async function generateVideoScene({ prompt, mode, label }) {
  const s = store.get('settings');
  try {
    if (s.geminiApiKey && (mode === 'flow' || mode === 'credit')) {
      return await veoVideo(prompt, s.geminiApiKey);
    }
  } catch (err) {
    return { ...placeholderImage(prompt, label), provider: 'placeholder-video', warning: err.message };
  }
  return { ...placeholderImage(prompt, label), provider: 'placeholder-video' };
}

// AI caption — ใช้ Gemini ถ้ามี key, ไม่งั้นใช้ template
async function generateCaption(product, video) {
  const s = store.get('settings');
  const fallback = () => {
    const hooks = ['ของมันต้องมี! 🔥', 'ไอเทมลับที่ทุกคนถามหา ✨', 'รีวิวจริง ใช้จริง 💯', 'ราคานี้ไม่ซื้อไม่ได้แล้ว 🛒'];
    const hook = hooks[Math.floor(Math.random() * hooks.length)];
    return `${hook} ${product.name} ${product.description ? '— ' + product.description.slice(0, 60) : ''}\n#TikTokShop #รีวิว #ป้ายยา #${product.category || 'ของดีบอกต่อ'}`;
  };
  if (!s.geminiApiKey) return fallback();
  try {
    const res = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
      {
        method: 'POST',
        headers: { 'x-goog-api-key': s.geminiApiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `เขียนแคปชั่น TikTok ภาษาไทยสั้นๆ (ไม่เกิน 2 บรรทัด + แฮชแท็ก 4 อัน) สำหรับวิดีโอขายสินค้า Affiliate: ${product.name}. ${product.description || ''} สไตล์วิดีโอ: ${video?.style || ''}. ตอบเฉพาะแคปชั่นเท่านั้น`
            }]
          }]
        })
      }
    );
    if (!res.ok) return fallback();
    const data = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || fallback();
  } catch {
    return fallback();
  }
}

module.exports = { pickRandomStyle, buildPrompts, generateImage, generateVideoScene, generateCaption, STYLE_POOL };
