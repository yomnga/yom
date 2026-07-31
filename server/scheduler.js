// Scheduled publishing — ตรวจโพสต์ที่ถึงกำหนดทุก 30 วินาที แล้วส่งโพสต์แบบ background
const store = require('./store');
const tiktok = require('./tiktok');

async function tick() {
  const now = Date.now();
  const posts = store.get('posts');
  const due = posts.filter(p => p.status === 'scheduled' && new Date(p.scheduledAt).getTime() <= now);
  for (const post of due) {
    await publishNow(post.id);
  }
}

async function publishNow(postId) {
  const post = store.get('posts').find(p => p.id === postId);
  if (!post || post.status === 'published') return post;
  const video = store.get('videos').find(v => v.id === post.videoId);
  const accounts = store.get('accounts').filter(a => post.accountIds.includes(a.id));

  const results = [];
  for (const account of accounts) {
    const r = await tiktok.publishVideo({ post, account, video, caption: post.caption });
    results.push({ accountId: account.id, accountName: account.name, ...r });
  }
  const allOk = results.every(r => r.ok);

  store.update('posts', all => all.map(p => p.id === postId
    ? { ...p, status: allOk ? 'published' : 'failed', publishedAt: new Date().toISOString(), results }
    : p));
  if (allOk && video) {
    store.update('videos', all => all.map(v => v.id === video.id ? { ...v, status: 'published' } : v));
  }
  return store.get('posts').find(p => p.id === postId);
}

function start() {
  setInterval(() => tick().catch(() => {}), 30 * 1000);
}

module.exports = { start, publishNow };
