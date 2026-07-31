const express = require('express');
const crypto = require('crypto');
const path = require('path');
const store = require('./store');
const pipeline = require('./pipeline');
const providers = require('./providers');
const scheduler = require('./scheduler');
const tiktok = require('./tiktok');

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.use('/media', express.static(store.MEDIA_DIR));

const ok = (res, data) => res.json({ ok: true, data });
const fail = (res, err, code = 400) => res.status(code).json({ ok: false, error: String(err.message || err) });

// ---------- Dashboard / Analytics ----------
app.get('/api/dashboard', (req, res) => {
  const videos = store.get('videos');
  const posts = store.get('posts');
  const jobs = store.get('jobs');
  const usage = store.get('usage');
  const s = store.get('settings');
  const monthKey = new Date().toISOString().slice(0, 7);
  const creditsThisMonth = usage
    .filter(u => u.at.startsWith(monthKey))
    .reduce((sum, u) => sum + (u.credits || 0), 0);
  ok(res, {
    totalVideos: videos.length,
    totalPublished: posts.filter(p => p.status === 'published').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    creditsRemaining: s.credits,
    creditsUsedThisMonth: creditsThisMonth,
    monthlyCostEstimate: +(creditsThisMonth * 2.5).toFixed(2), // ประมาณการ บาท/เครดิต
    activeJobs: jobs.filter(j => j.status === 'running' || j.status === 'queued').length,
    recentJobs: jobs.slice(0, 5),
    recentVideos: videos.slice(0, 6),
    // สถิติผลิตรายวัน 14 วันล่าสุด
    daily: lastNDays(14).map(day => ({
      day,
      created: videos.filter(v => v.createdAt.startsWith(day)).length,
      published: posts.filter(p => p.publishedAt && p.publishedAt.startsWith(day)).length
    }))
  });
});

function lastNDays(n) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

// ---------- Products (TikTok Affiliate) ----------
app.get('/api/products', (req, res) => ok(res, store.get('products')));

app.post('/api/products', (req, res) => {
  const { name, description = '', price = 0, commissionPct = 0, category = '', affiliateLink = '' } = req.body;
  if (!name) return fail(res, 'กรุณาระบุชื่อสินค้า');
  const product = {
    id: store.id('prod'), name, description, price: +price, commissionPct: +commissionPct,
    category, affiliateLink, source: 'manual', importedAt: new Date().toISOString()
  };
  store.update('products', p => [product, ...p]);
  ok(res, product);
});

// ดึงสินค้า Affiliate จากบัญชี TikTok ที่เชื่อมไว้ (จำลองเมื่อไม่มี API credentials จริง)
app.post('/api/products/import', (req, res) => {
  const imported = tiktok.sampleAffiliateProducts();
  store.update('products', p => [...imported, ...p]);
  ok(res, imported);
});

app.delete('/api/products/:id', (req, res) => {
  store.update('products', p => p.filter(x => x.id !== req.params.id));
  ok(res, true);
});

// ---------- Generation jobs ----------
app.get('/api/jobs', (req, res) => ok(res, store.get('jobs').slice(0, 50)));

app.post('/api/jobs', (req, res) => {
  try {
    const jobs = pipeline.enqueue(req.body);
    ok(res, jobs);
  } catch (err) { fail(res, err); }
});

// ---------- Videos ----------
app.get('/api/videos', (req, res) => ok(res, store.get('videos')));

app.delete('/api/videos/:id', (req, res) => {
  store.update('videos', v => v.filter(x => x.id !== req.params.id));
  ok(res, true);
});

// ---------- Accounts ----------
app.get('/api/accounts', (req, res) => ok(res, store.get('accounts')));

app.post('/api/accounts', (req, res) => {
  const { name, handle = '' } = req.body;
  if (!name) return fail(res, 'กรุณาระบุชื่อบัญชี');
  // การเชื่อมจริงทำผ่าน TikTok OAuth (Login Kit) — ที่นี่บันทึกบัญชีไว้ก่อน รอผูก token
  const account = {
    id: store.id('acct'), name, handle, accessToken: '',
    connected: false, addedAt: new Date().toISOString()
  };
  store.update('accounts', a => [account, ...a]);
  ok(res, account);
});

app.delete('/api/accounts/:id', (req, res) => {
  store.update('accounts', a => a.filter(x => x.id !== req.params.id));
  ok(res, true);
});

app.get('/api/flow-accounts', (req, res) => ok(res, store.get('flowAccounts')));

app.post('/api/flow-accounts', (req, res) => {
  const { name, apiKey = '' } = req.body;
  if (!name) return fail(res, 'กรุณาระบุชื่อบัญชี');
  const account = { id: store.id('flow'), name, apiKey, addedAt: new Date().toISOString() };
  store.update('flowAccounts', a => [account, ...a]);
  // ใช้ key ล่าสุดเป็น key หลักของโหมด Flow
  if (apiKey) store.update('settings', s => ({ ...s, geminiApiKey: apiKey }));
  ok(res, { ...account, apiKey: mask(account.apiKey) });
});

app.delete('/api/flow-accounts/:id', (req, res) => {
  store.update('flowAccounts', a => a.filter(x => x.id !== req.params.id));
  ok(res, true);
});

function mask(key) {
  return key ? key.slice(0, 4) + '••••' + key.slice(-4) : '';
}

// ---------- Posting & scheduling ----------
app.get('/api/posts', (req, res) => ok(res, store.get('posts')));

app.post('/api/posts', async (req, res) => {
  try {
    const { videoId, accountIds = [], caption = '', music = '', attachProductLink = true, scheduledAt = null } = req.body;
    const video = store.get('videos').find(v => v.id === videoId);
    if (!video) return fail(res, 'ไม่พบวิดีโอ');
    if (!accountIds.length) return fail(res, 'เลือกอย่างน้อย 1 บัญชี TikTok');
    const product = store.get('products').find(p => p.id === video.productId);
    const post = {
      id: store.id('post'), videoId, videoTitle: video.title, accountIds, caption, music,
      productLink: attachProductLink ? (product?.affiliateLink || '') : '',
      scheduledAt, createdAt: new Date().toISOString(),
      status: scheduledAt ? 'scheduled' : 'publishing', results: []
    };
    store.update('posts', p => [post, ...p]);
    if (!scheduledAt) {
      const done = await scheduler.publishNow(post.id);
      return ok(res, done);
    }
    ok(res, post);
  } catch (err) { fail(res, err); }
});

app.delete('/api/posts/:id', (req, res) => {
  store.update('posts', p => p.filter(x => x.id !== req.params.id));
  ok(res, true);
});

app.post('/api/captions', async (req, res) => {
  try {
    const video = store.get('videos').find(v => v.id === req.body.videoId);
    const product = store.get('products').find(p => p.id === video?.productId) || { name: video?.productName || 'สินค้า' };
    ok(res, { caption: await providers.generateCaption(product, video) });
  } catch (err) { fail(res, err); }
});

// ---------- Character & Style Library ----------
for (const col of ['characters', 'styles']) {
  app.get(`/api/${col}`, (req, res) => ok(res, store.get(col)));
  app.post(`/api/${col}`, (req, res) => {
    const { name, description = '', prompt = '' } = req.body;
    if (!name) return fail(res, 'กรุณาระบุชื่อ');
    const item = { id: store.id(col.slice(0, 4)), name, description, prompt: prompt || description, createdAt: new Date().toISOString() };
    store.update(col, c => [item, ...c]);
    ok(res, item);
  });
  app.delete(`/api/${col}/:id`, (req, res) => {
    store.update(col, c => c.filter(x => x.id !== req.params.id));
    ok(res, true);
  });
}

app.get('/api/style-pool', (req, res) => ok(res, providers.STYLE_POOL));

// ---------- Settings & License ----------
app.get('/api/settings', (req, res) => {
  const s = store.get('settings');
  ok(res, { ...s, openaiApiKey: mask(s.openaiApiKey), geminiApiKey: mask(s.geminiApiKey) });
});

app.put('/api/settings', (req, res) => {
  const allowed = ['openaiApiKey', 'geminiApiKey', 'defaultMode', 'monthlyBudget', 'language'];
  store.update('settings', s => {
    const next = { ...s };
    for (const k of allowed) {
      if (req.body[k] !== undefined && !String(req.body[k]).includes('••••')) next[k] = req.body[k];
    }
    return next;
  });
  const s = store.get('settings');
  ok(res, { ...s, openaiApiKey: mask(s.openaiApiKey), geminiApiKey: mask(s.geminiApiKey) });
});

// License activation: 1 license = 1 device (ผูกกับ device fingerprint)
app.post('/api/license/activate', (req, res) => {
  const { licenseKey } = req.body;
  if (!licenseKey || !/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/i.test(licenseKey)) {
    return fail(res, 'รูปแบบ License Key ไม่ถูกต้อง (เช่น AAAA-BBBB-CCCC-DDDD)');
  }
  const deviceId = crypto.createHash('sha256')
    .update(`${require('os').hostname()}|${process.platform}`).digest('hex').slice(0, 16);
  const s = store.get('settings');
  if (s.activated && s.deviceId && s.deviceId !== deviceId) {
    return fail(res, 'License นี้ถูกใช้งานบนเครื่องอื่นแล้ว (1 License = 1 เครื่อง)');
  }
  store.update('settings', x => ({ ...x, licenseKey: licenseKey.toUpperCase(), deviceId, activated: true }));
  ok(res, { activated: true, deviceId });
});

// ---------- Backup & Migration ----------
app.get('/api/backup/export', (req, res) => {
  res.setHeader('Content-Disposition', `attachment; filename="aiman-backup-${Date.now()}.json"`);
  res.json(store.exportAll());
});

app.post('/api/backup/import', (req, res) => {
  try {
    store.importAll(req.body);
    ok(res, true);
  } catch (err) { fail(res, err); }
});

// SPA fallback
app.get(/^\/(?!api|media).*/, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Aiman running at http://localhost:${PORT}`);
  pipeline.resume();
  scheduler.start();
});
