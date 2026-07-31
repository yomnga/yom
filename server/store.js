// Simple JSON-file data store. Each collection persists to data/<name>.json
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');

fs.mkdirSync(MEDIA_DIR, { recursive: true });

const DEFAULTS = {
  settings: {
    licenseKey: '',
    deviceId: '',
    activated: false,
    // Credit-Based Mode (ผู้ใช้ใส่ API key ของตนเอง)
    openaiApiKey: '',
    geminiApiKey: '',
    credits: 100,
    creditCostImage: 1,
    creditCostVideoPerScene: 5,
    monthlyBudget: 0,
    defaultMode: 'credit', // 'credit' | 'flow'
    language: 'th'
  },
  products: [],
  videos: [],
  jobs: [],
  posts: [],
  accounts: [],       // TikTok accounts (OAuth ผ่าน API ทางการ)
  flowAccounts: [],   // Google/Gemini API accounts
  characters: [],
  styles: [],
  usage: []           // credit/cost log สำหรับ analytics
};

const cache = {};

function fileFor(name) {
  return path.join(DATA_DIR, `${name}.json`);
}

function get(name) {
  if (cache[name] !== undefined) return cache[name];
  try {
    cache[name] = JSON.parse(fs.readFileSync(fileFor(name), 'utf8'));
  } catch {
    cache[name] = JSON.parse(JSON.stringify(DEFAULTS[name]));
  }
  return cache[name];
}

function set(name, value) {
  cache[name] = value;
  fs.writeFileSync(fileFor(name), JSON.stringify(value, null, 2));
  return value;
}

function update(name, fn) {
  return set(name, fn(get(name)));
}

let seq = Date.now() % 1e8;
function id(prefix) {
  seq += 1;
  return `${prefix}_${seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function exportAll() {
  const dump = {};
  for (const name of Object.keys(DEFAULTS)) dump[name] = get(name);
  dump.__meta = { app: 'aiman', version: 1, exportedAt: new Date().toISOString() };
  return dump;
}

function importAll(dump) {
  if (!dump || dump.__meta?.app !== 'aiman') throw new Error('ไฟล์ backup ไม่ถูกต้อง');
  for (const name of Object.keys(DEFAULTS)) {
    if (dump[name] !== undefined) set(name, dump[name]);
  }
}

module.exports = { get, set, update, id, exportAll, importAll, DATA_DIR, MEDIA_DIR, DEFAULTS };
