/* Aiman SPA — hash router + views */
const $ = sel => document.querySelector(sel);
const main = $('#main');
let pollTimer = null;

// ---------- helpers ----------
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  const json = await res.json();
  if (!json.ok && json.error) throw new Error(json.error);
  return json.data !== undefined ? json.data : json;
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function toast(msg, isError = false) {
  const el = $('#toast');
  el.textContent = msg;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('show'), 3500);
}

function badge(status) {
  const th = {
    ready: 'พร้อมโพสต์', done: 'เสร็จสิ้น', published: 'โพสต์แล้ว', running: 'กำลังสร้าง',
    publishing: 'กำลังโพสต์', queued: 'รอคิว', scheduled: 'ตั้งเวลาไว้', failed: 'ล้มเหลว'
  };
  return `<span class="badge ${esc(status)}">${th[status] || esc(status)}</span>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' });
}

async function refreshCredits() {
  try {
    const s = await api('/settings');
    $('#credit-badge').textContent = `เครดิตคงเหลือ: ${s.credits}`;
  } catch {}
}

// ---------- router ----------
const routes = {};
window.addEventListener('hashchange', render);
window.addEventListener('DOMContentLoaded', () => { refreshCredits(); render(); });

async function render() {
  clearInterval(pollTimer);
  const page = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  document.querySelectorAll('#nav a').forEach(a =>
    a.classList.toggle('active', a.dataset.page === page));
  const view = routes[page] || routes.dashboard;
  main.innerHTML = '<div class="empty">กำลังโหลด…</div>';
  try { await view(); } catch (err) { main.innerHTML = `<div class="empty">เกิดข้อผิดพลาด: ${esc(err.message)}</div>`; }
}

// ---------- Dashboard ----------
routes.dashboard = async () => {
  const d = await api('/dashboard');
  const maxBar = Math.max(1, ...d.daily.map(x => Math.max(x.created, x.published)));
  main.innerHTML = `
    <h1>📊 แดชบอร์ด</h1>
    <div class="page-sub">ภาพรวมการผลิตและการเผยแพร่ทั้งหมดของคุณ</div>
    <div class="cards">
      <div class="card"><div class="lbl">วิดีโอที่สร้างทั้งหมด</div><div class="num">${d.totalVideos}</div></div>
      <div class="card"><div class="lbl">โพสต์แล้ว</div><div class="num">${d.totalPublished}</div></div>
      <div class="card"><div class="lbl">ตั้งเวลารอโพสต์</div><div class="num">${d.scheduled}</div></div>
      <div class="card"><div class="lbl">งานที่กำลังสร้าง</div><div class="num">${d.activeJobs}</div></div>
      <div class="card"><div class="lbl">เครดิตคงเหลือ</div><div class="num">${d.creditsRemaining}</div></div>
      <div class="card"><div class="lbl">ค่าใช้จ่ายเดือนนี้ (ประมาณ)</div><div class="num">฿${d.monthlyCostEstimate}</div></div>
    </div>
    <div class="grid2">
      <div class="panel">
        <h3>ผลผลิต 14 วันล่าสุด <span class="muted">(น้ำเงิน=สร้าง เขียว=โพสต์)</span></h3>
        <div class="chart">
          ${d.daily.map(x => `
            <div class="bar-wrap" title="${x.day}: สร้าง ${x.created} / โพสต์ ${x.published}">
              <div class="bar" style="height:${(x.created / maxBar) * 100}%"></div>
              <div class="bar pub" style="height:${(x.published / maxBar) * 100}%"></div>
              <div class="day">${x.day.slice(8)}</div>
            </div>`).join('')}
        </div>
      </div>
      <div class="panel">
        <h3>งานล่าสุด</h3>
        ${d.recentJobs.length ? d.recentJobs.map(j => `
          <div style="margin-bottom:10px">
            <div style="display:flex;justify-content:space-between;font-size:13px">
              <span>${esc(j.productName)} (${j.scenes} ฉาก)</span>${badge(j.status)}
            </div>
            <div class="progress"><div style="width:${j.progress}%"></div></div>
          </div>`).join('') : '<div class="empty">ยังไม่มีงาน — ไปที่ "สร้างวิดีโอ AI"</div>'}
      </div>
    </div>
    <div class="panel">
      <h3>วิดีโอล่าสุด</h3>
      ${d.recentVideos.length ? `<div class="video-grid">${d.recentVideos.map(videoCard).join('')}</div>`
        : '<div class="empty">ยังไม่มีวิดีโอ</div>'}
    </div>`;
  refreshCredits();
};

function videoCard(v) {
  return `
    <div class="video-card">
      <img src="${esc(v.thumbnail)}" alt="${esc(v.title)}">
      <div class="meta">
        <div class="title">${esc(v.title)}</div>
        <div class="muted">${v.durationSec} วิ · ${v.scenes} ฉาก · ${esc(v.provider)}</div>
        <div style="margin-top:5px">${badge(v.status)}</div>
      </div>
    </div>`;
}

// ---------- Create ----------
routes.create = async () => {
  const [products, styles, characters, settings] = await Promise.all([
    api('/products'), api('/styles'), api('/characters'), api('/settings')
  ]);
  main.innerHTML = `
    <h1>🎬 สร้างวิดีโอ AI</h1>
    <div class="page-sub">คลิกเดียว — ระบบสุ่มสไตล์ เขียน prompt สร้างภาพ และสร้างวิดีโอให้อัตโนมัติทุกขั้นตอน</div>
    <div class="grid2">
      <div class="panel">
        <h3>ตั้งค่าการผลิต</h3>
        <label>สินค้า Affiliate</label>
        <select id="c-product">
          ${products.length
            ? products.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')
            : '<option value="">— ยังไม่มีสินค้า (ไปที่หน้า สินค้า Affiliate) —</option>'}
        </select>
        <div class="row">
          <div>
            <label>ความยาววิดีโอ</label>
            <select id="c-scenes">
              <option value="1">1 ฉาก (8 วินาที)</option>
              <option value="2">2 ฉาก (16 วินาที) — Storyboard ต่อเนื่อง</option>
            </select>
          </div>
          <div>
            <label>โหมด AI</label>
            <select id="c-mode">
              <option value="credit" ${settings.defaultMode === 'credit' ? 'selected' : ''}>Credit-Based (GPT Image + Veo 3)</option>
              <option value="flow" ${settings.defaultMode === 'flow' ? 'selected' : ''}>Google Flow (Nano Banana + Veo)</option>
            </select>
          </div>
        </div>
        <div class="row">
          <div>
            <label>สไตล์วิดีโอ</label>
            <select id="c-style">
              <option value="">🎲 สุ่มอัตโนมัติ</option>
              ${styles.map(s => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}
            </select>
          </div>
          <div>
            <label>ตัวละคร AI (Character Library)</label>
            <select id="c-character">
              <option value="">— ไม่ใช้ —</option>
              ${characters.map(c => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <label>จำนวนคลิป (ผลิตต่อเนื่องอัตโนมัติ)</label>
        <input id="c-count" type="number" min="1" max="20" value="1">
        <button class="mt" id="c-go" ${products.length ? '' : 'disabled'}>🚀 เริ่มผลิตอัตโนมัติ</button>
      </div>
      <div class="panel">
        <h3>คิวงานผลิต</h3>
        <div id="job-list"></div>
      </div>
    </div>`;

  $('#c-go').onclick = async () => {
    try {
      await api('/jobs', { method: 'POST', body: {
        productId: $('#c-product').value,
        scenes: +$('#c-scenes').value,
        mode: $('#c-mode').value,
        styleId: $('#c-style').value || null,
        characterId: $('#c-character').value || null,
        count: +$('#c-count').value
      }});
      toast('เพิ่มงานเข้าคิวแล้ว — ระบบกำลังผลิตอัตโนมัติ');
      loadJobs();
    } catch (err) { toast(err.message, true); }
  };

  async function loadJobs() {
    const jobs = await api('/jobs');
    $('#job-list').innerHTML = jobs.length ? jobs.slice(0, 10).map(j => `
      <div style="margin-bottom:14px">
        <div style="display:flex;justify-content:space-between;font-size:13px">
          <b>${esc(j.productName)}</b>${badge(j.status)}
        </div>
        <div class="progress"><div style="width:${j.progress}%"></div></div>
        <div class="steps">${j.steps.map(s => `<span class="step ${s.status}">${s.status === 'done' ? '✓ ' : ''}${esc(s.label)}</span>`).join('')}</div>
        ${j.error ? `<div class="muted" style="color:#e77">⚠ ${esc(j.error)}</div>` : ''}
      </div>`).join('') : '<div class="empty">ยังไม่มีงานในคิว</div>';
  }
  loadJobs();
  pollTimer = setInterval(() => { loadJobs(); refreshCredits(); }, 2000);
};

// ---------- Videos ----------
routes.videos = async () => {
  const videos = await api('/videos');
  main.innerHTML = `
    <h1>📁 คลังวิดีโอ</h1>
    <div class="page-sub">วิดีโอทั้งหมดที่สร้างเสร็จ พร้อมนำไปโพสต์</div>
    ${videos.length ? `<div class="video-grid">${videos.map(v => `
      <div class="video-card">
        <img src="${esc(v.thumbnail)}" alt="">
        <div class="meta">
          <div class="title">${esc(v.title)}</div>
          <div class="muted">${v.durationSec} วิ · ${esc(v.provider)}</div>
          ${v.warning ? `<div class="muted" title="${esc(v.warning)}">⚠ ใช้สื่อจำลอง</div>` : ''}
          <div style="margin-top:6px;display:flex;gap:6px;align-items:center">
            ${badge(v.status)}
            <button class="small secondary" onclick="location.hash='#/publish?video=${v.id}'">โพสต์</button>
            <button class="small danger" data-del="${v.id}">ลบ</button>
          </div>
        </div>
      </div>`).join('')}</div>` : '<div class="empty">ยังไม่มีวิดีโอ — เริ่มที่หน้า "สร้างวิดีโอ AI"</div>'}`;
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    await api('/videos/' + b.dataset.del, { method: 'DELETE' });
    render();
  });
};

// ---------- Products ----------
routes.products = async () => {
  const products = await api('/products');
  main.innerHTML = `
    <h1>🛒 สินค้า TikTok Affiliate</h1>
    <div class="page-sub">ดึงสินค้าจากบัญชี TikTok ของคุณ หรือเพิ่มเอง แล้วสร้างวิดีโอโปรโมทได้ทันที</div>
    <div class="panel">
      <div class="row">
        <button id="p-import">⬇️ ดึงสินค้า Affiliate จาก TikTok</button>
        <button class="secondary" id="p-toggle">➕ เพิ่มสินค้าเอง</button>
      </div>
      <div id="p-form" style="display:none" class="mt">
        <div class="row">
          <div><label>ชื่อสินค้า *</label><input id="p-name"></div>
          <div><label>หมวดหมู่</label><input id="p-cat"></div>
        </div>
        <div class="row">
          <div><label>ราคา (บาท)</label><input id="p-price" type="number" min="0"></div>
          <div><label>ค่าคอมมิชชั่น (%)</label><input id="p-comm" type="number" min="0" max="100"></div>
        </div>
        <label>ลิงก์ Affiliate</label><input id="p-link" placeholder="https://...">
        <label>รายละเอียด / จุดขาย</label><textarea id="p-desc"></textarea>
        <button class="mt" id="p-add">บันทึกสินค้า</button>
      </div>
    </div>
    <div class="panel">
      ${products.length ? `<table>
        <tr><th>สินค้า</th><th>หมวด</th><th>ราคา</th><th>คอมฯ</th><th>ที่มา</th><th></th></tr>
        ${products.map(p => `<tr>
          <td><b>${esc(p.name)}</b><div class="muted">${esc(p.description || '')}</div></td>
          <td>${esc(p.category || '—')}</td>
          <td>฿${p.price}</td>
          <td>${p.commissionPct}%</td>
          <td class="muted">${p.source === 'manual' ? 'เพิ่มเอง' : 'นำเข้า'}</td>
          <td style="white-space:nowrap">
            <button class="small" onclick="location.hash='#/create'">🎬 สร้างวิดีโอ</button>
            <button class="small danger" data-del="${p.id}">ลบ</button>
          </td>
        </tr>`).join('')}
      </table>` : '<div class="empty">ยังไม่มีสินค้า — กด "ดึงสินค้า Affiliate จาก TikTok" เพื่อเริ่มต้น</div>'}
    </div>`;

  $('#p-import').onclick = async () => {
    const items = await api('/products/import', { method: 'POST' });
    toast(`นำเข้าสินค้า ${items.length} รายการแล้ว (โหมดจำลอง — เชื่อม TikTok Shop API จริงในหน้าตั้งค่า)`);
    render();
  };
  $('#p-toggle').onclick = () => {
    const f = $('#p-form');
    f.style.display = f.style.display === 'none' ? 'block' : 'none';
  };
  $('#p-add').onclick = async () => {
    try {
      await api('/products', { method: 'POST', body: {
        name: $('#p-name').value.trim(), category: $('#p-cat').value.trim(),
        price: $('#p-price').value, commissionPct: $('#p-comm').value,
        affiliateLink: $('#p-link').value.trim(), description: $('#p-desc').value.trim()
      }});
      toast('เพิ่มสินค้าแล้ว'); render();
    } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    await api('/products/' + b.dataset.del, { method: 'DELETE' }); render();
  });
};

// ---------- Publish ----------
routes.publish = async () => {
  const [videos, accounts, posts] = await Promise.all([api('/videos'), api('/accounts'), api('/posts')]);
  const preselect = new URLSearchParams(location.hash.split('?')[1] || '').get('video') || '';
  const ready = videos.filter(v => v.status === 'ready' || v.status === 'published');
  main.innerHTML = `
    <h1>📤 โพสต์ / ตั้งเวลา</h1>
    <div class="page-sub">โพสต์ขึ้น TikTok ทันที หรือตั้งเวลาล่วงหน้า รองรับหลายบัญชีพร้อมกัน (ทำงานเบื้องหลัง)</div>
    <div class="grid2">
      <div class="panel">
        <h3>สร้างโพสต์ใหม่</h3>
        <label>วิดีโอ</label>
        <select id="pub-video">
          ${ready.length ? ready.map(v => `<option value="${v.id}" ${v.id === preselect ? 'selected' : ''}>${esc(v.title)}</option>`).join('')
            : '<option value="">— ยังไม่มีวิดีโอพร้อมโพสต์ —</option>'}
        </select>
        <label>บัญชี TikTok (เลือกได้หลายบัญชี)</label>
        <div class="checklist" id="pub-accounts">
          ${accounts.length ? accounts.map(a => `
            <label><input type="checkbox" value="${a.id}"> ${esc(a.name)} ${a.handle ? '(@' + esc(a.handle) + ')' : ''} ${a.connected ? '🟢' : '⚪ ยังไม่เชื่อม token'}</label>`).join('')
            : '<div class="muted">ยังไม่มีบัญชี — เพิ่มที่หน้า "บัญชี"</div>'}
        </div>
        <label>แคปชั่น <button class="small secondary" id="pub-ai-cap" style="margin-left:8px">✨ ให้ AI เขียน</button></label>
        <textarea id="pub-caption" placeholder="แคปชั่นสำหรับโพสต์…"></textarea>
        <div class="row">
          <div><label>เพลงประกอบ</label><input id="pub-music" placeholder="เช่น เพลงฮิต TikTok"></div>
          <div><label>ตั้งเวลาโพสต์ (เว้นว่าง = โพสต์ทันที)</label><input id="pub-when" type="datetime-local"></div>
        </div>
        <label style="display:flex;gap:8px;align-items:center;color:var(--text)">
          <input type="checkbox" id="pub-cart" checked style="width:auto"> แนบลิงก์สินค้า Affiliate (ตะกร้าสินค้า)
        </label>
        <button class="mt" id="pub-go" ${ready.length && accounts.length ? '' : 'disabled'}>📤 โพสต์ / ตั้งเวลา</button>
      </div>
      <div class="panel">
        <h3>ประวัติ & คิวโพสต์</h3>
        ${posts.length ? `<table>
          <tr><th>วิดีโอ</th><th>สถานะ</th><th>เวลา</th><th></th></tr>
          ${posts.map(p => `<tr>
            <td>${esc(p.videoTitle)}<div class="muted">${p.accountIds.length} บัญชี${p.results?.some(r => r.simulated) ? ' · จำลอง' : ''}</div></td>
            <td>${badge(p.status)}</td>
            <td class="muted">${fmtDate(p.scheduledAt || p.publishedAt || p.createdAt)}</td>
            <td><button class="small danger" data-del="${p.id}">ลบ</button></td>
          </tr>`).join('')}
        </table>` : '<div class="empty">ยังไม่มีโพสต์</div>'}
      </div>
    </div>`;

  $('#pub-ai-cap').onclick = async e => {
    e.preventDefault();
    const videoId = $('#pub-video').value;
    if (!videoId) return toast('เลือกวิดีโอก่อน', true);
    $('#pub-caption').value = 'กำลังให้ AI เขียนแคปชั่น…';
    const r = await api('/captions', { method: 'POST', body: { videoId } });
    $('#pub-caption').value = r.caption;
  };
  $('#pub-go').onclick = async () => {
    try {
      const accountIds = [...main.querySelectorAll('#pub-accounts input:checked')].map(i => i.value);
      const when = $('#pub-when').value;
      await api('/posts', { method: 'POST', body: {
        videoId: $('#pub-video').value, accountIds,
        caption: $('#pub-caption').value, music: $('#pub-music').value,
        attachProductLink: $('#pub-cart').checked,
        scheduledAt: when ? new Date(when).toISOString() : null
      }});
      toast(when ? 'ตั้งเวลาโพสต์แล้ว' : 'ส่งโพสต์แล้ว');
      render();
    } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll('[data-del]').forEach(b => b.onclick = async () => {
    await api('/posts/' + b.dataset.del, { method: 'DELETE' }); render();
  });
};

// ---------- Accounts ----------
routes.accounts = async () => {
  const [accounts, flows] = await Promise.all([api('/accounts'), api('/flow-accounts')]);
  main.innerHTML = `
    <h1>👥 บัญชี</h1>
    <div class="page-sub">จัดการหลายบัญชี TikTok และหลายบัญชี Google/Gemini ในแอปเดียว</div>
    <div class="grid2">
      <div class="panel">
        <h3>บัญชี TikTok</h3>
        <div class="row">
          <input id="a-name" placeholder="ชื่อบัญชี เช่น ร้านหลัก">
          <input id="a-handle" placeholder="@username">
        </div>
        <button class="mt" id="a-add">➕ เพิ่มบัญชี TikTok</button>
        <div class="note">การเชื่อมต่อจริงใช้ TikTok Login Kit (OAuth) — บัญชีที่ยังไม่ผูก token จะโพสต์ในโหมดจำลอง</div>
        ${accounts.length ? `<table>
          <tr><th>บัญชี</th><th>สถานะ</th><th></th></tr>
          ${accounts.map(a => `<tr>
            <td><b>${esc(a.name)}</b> <span class="muted">${a.handle ? '@' + esc(a.handle) : ''}</span></td>
            <td>${a.connected ? '🟢 เชื่อมแล้ว' : '⚪ รอเชื่อม OAuth'}</td>
            <td><button class="small danger" data-del-acct="${a.id}">ลบ</button></td>
          </tr>`).join('')}
        </table>` : '<div class="empty">ยังไม่มีบัญชี TikTok</div>'}
      </div>
      <div class="panel">
        <h3>บัญชี Google Flow (Gemini)</h3>
        <input id="f-name" placeholder="ชื่อบัญชี เช่น Gmail หลัก">
        <label>Gemini API Key</label>
        <input id="f-key" type="password" placeholder="AIza...">
        <button class="mt" id="f-add">➕ เพิ่มบัญชี Flow</button>
        <div class="note">ใช้ API key จากบัญชี Google/Gemini ของคุณเองสำหรับโหมด Google Flow (Nano Banana + Veo)</div>
        ${flows.length ? `<table>
          <tr><th>บัญชี</th><th>เพิ่มเมื่อ</th><th></th></tr>
          ${flows.map(f => `<tr>
            <td><b>${esc(f.name)}</b></td>
            <td class="muted">${fmtDate(f.addedAt)}</td>
            <td><button class="small danger" data-del-flow="${f.id}">ลบ</button></td>
          </tr>`).join('')}
        </table>` : '<div class="empty">ยังไม่มีบัญชี Flow</div>'}
      </div>
    </div>`;

  $('#a-add').onclick = async () => {
    try {
      await api('/accounts', { method: 'POST', body: { name: $('#a-name').value.trim(), handle: $('#a-handle').value.trim().replace(/^@/, '') } });
      toast('เพิ่มบัญชีแล้ว'); render();
    } catch (err) { toast(err.message, true); }
  };
  $('#f-add').onclick = async () => {
    try {
      await api('/flow-accounts', { method: 'POST', body: { name: $('#f-name').value.trim(), apiKey: $('#f-key').value.trim() } });
      toast('เพิ่มบัญชี Flow แล้ว'); render();
    } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll('[data-del-acct]').forEach(b => b.onclick = async () => {
    await api('/accounts/' + b.dataset.delAcct, { method: 'DELETE' }); render();
  });
  main.querySelectorAll('[data-del-flow]').forEach(b => b.onclick = async () => {
    await api('/flow-accounts/' + b.dataset.delFlow, { method: 'DELETE' }); render();
  });
};

// ---------- Library ----------
routes.library = async () => {
  const [characters, styles, pool] = await Promise.all([api('/characters'), api('/styles'), api('/style-pool')]);
  main.innerHTML = `
    <h1>👤 คลังตัวละคร & สไตล์</h1>
    <div class="page-sub">บันทึกตัวละคร AI และสไตล์วิดีโอไว้ใช้ซ้ำ เพื่อคงเอกลักษณ์แบรนด์ให้สม่ำเสมอ</div>
    <div class="grid2">
      <div class="panel">
        <h3>ตัวละคร AI</h3>
        <input id="ch-name" placeholder="ชื่อตัวละคร เช่น น้องมายด์ พรีเซนเตอร์">
        <label>คำอธิบายลักษณะ (ใช้ใน prompt)</label>
        <textarea id="ch-desc" placeholder="เช่น หญิงไทยวัย 25 ผมยาวสีน้ำตาล ยิ้มสดใส สไตล์มินิมอล"></textarea>
        <button class="mt" id="ch-add">💾 บันทึกตัวละคร</button>
        ${characters.length ? characters.map(c => `
          <div class="card mt">
            <b>${esc(c.name)}</b>
            <div class="muted">${esc(c.description)}</div>
            <button class="small danger mt" data-del-ch="${c.id}">ลบ</button>
          </div>`).join('') : '<div class="empty">ยังไม่มีตัวละคร</div>'}
      </div>
      <div class="panel">
        <h3>สไตล์วิดีโอ</h3>
        <input id="st-name" placeholder="ชื่อสไตล์ เช่น มินิมอลพาสเทล">
        <label>รายละเอียดสไตล์ (ใช้ใน prompt)</label>
        <textarea id="st-desc" placeholder="เช่น Minimal aesthetic, pastel tones, soft light"></textarea>
        <button class="mt" id="st-add">💾 บันทึกสไตล์</button>
        ${styles.length ? styles.map(s => `
          <div class="card mt">
            <b>${esc(s.name)}</b>
            <div class="muted">${esc(s.prompt)}</div>
            <button class="small danger mt" data-del-st="${s.id}">ลบ</button>
          </div>`).join('') : '<div class="empty">ยังไม่มีสไตล์ที่บันทึกไว้</div>'}
        <h3 class="mt">สไตล์สุ่มอัตโนมัติในระบบ</h3>
        <div class="muted">${pool.map(esc).join(' · ')}</div>
      </div>
    </div>`;

  $('#ch-add').onclick = async () => {
    try {
      await api('/characters', { method: 'POST', body: { name: $('#ch-name').value.trim(), description: $('#ch-desc').value.trim() } });
      toast('บันทึกตัวละครแล้ว'); render();
    } catch (err) { toast(err.message, true); }
  };
  $('#st-add').onclick = async () => {
    try {
      await api('/styles', { method: 'POST', body: { name: $('#st-name').value.trim(), description: $('#st-desc').value.trim(), prompt: $('#st-desc').value.trim() } });
      toast('บันทึกสไตล์แล้ว'); render();
    } catch (err) { toast(err.message, true); }
  };
  main.querySelectorAll('[data-del-ch]').forEach(b => b.onclick = async () => {
    await api('/characters/' + b.dataset.delCh, { method: 'DELETE' }); render();
  });
  main.querySelectorAll('[data-del-st]').forEach(b => b.onclick = async () => {
    await api('/styles/' + b.dataset.delSt, { method: 'DELETE' }); render();
  });
};

// ---------- Settings ----------
routes.settings = async () => {
  const s = await api('/settings');
  main.innerHTML = `
    <h1>⚙️ ตั้งค่า & License</h1>
    <div class="page-sub">API keys, โหมดเริ่มต้น, License และการสำรองข้อมูล</div>
    <div class="grid2">
      <div class="panel">
        <h3>AI Providers</h3>
        <label>OpenAI API Key (GPT Image — โหมด Credit)</label>
        <input id="s-openai" type="password" value="${esc(s.openaiApiKey)}" placeholder="sk-...">
        <label>Gemini API Key (Nano Banana / Veo — โหมด Flow)</label>
        <input id="s-gemini" type="password" value="${esc(s.geminiApiKey)}" placeholder="AIza...">
        <label>โหมดเริ่มต้น</label>
        <select id="s-mode">
          <option value="credit" ${s.defaultMode === 'credit' ? 'selected' : ''}>Credit-Based Mode</option>
          <option value="flow" ${s.defaultMode === 'flow' ? 'selected' : ''}>Google Flow Mode</option>
        </select>
        <button class="mt" id="s-save">💾 บันทึกการตั้งค่า</button>
        <div class="note">ไม่ใส่ key ก็ทดลองใช้งานได้ — ระบบจะสร้างสื่อจำลอง (placeholder) ให้เห็น workflow ครบทุกขั้นตอน</div>
      </div>
      <div class="panel">
        <h3>License (1 License = 1 เครื่อง)</h3>
        ${s.activated
          ? `<div class="note" style="border-color:rgba(46,204,113,.4);background:rgba(46,204,113,.08)">🟢 เปิดใช้งานแล้ว<br>Key: <code>${esc(s.licenseKey)}</code><br>Device: <code>${esc(s.deviceId)}</code></div>`
          : `<label>License Key</label>
             <input id="s-license" placeholder="AAAA-BBBB-CCCC-DDDD">
             <button class="mt" id="s-activate">🔑 เปิดใช้งาน</button>`}
        <h3 class="mt">💾 สำรอง & ย้ายข้อมูล</h3>
        <div class="row">
          <a class="btn secondary" href="/api/backup/export" download>⬇️ Export Backup</a>
          <button class="secondary" id="s-import">⬆️ Import Backup</button>
        </div>
        <input type="file" id="s-file" accept=".json" style="display:none">
        <div class="muted mt">Backup รวม สินค้า วิดีโอ บัญชี ตัวละคร สไตล์ และการตั้งค่าทั้งหมด — ย้ายเครื่องได้ในคลิกเดียว</div>
      </div>
    </div>`;

  $('#s-save').onclick = async () => {
    await api('/settings', { method: 'PUT', body: {
      openaiApiKey: $('#s-openai').value.trim(),
      geminiApiKey: $('#s-gemini').value.trim(),
      defaultMode: $('#s-mode').value
    }});
    toast('บันทึกการตั้งค่าแล้ว');
  };
  const act = $('#s-activate');
  if (act) act.onclick = async () => {
    try {
      await api('/license/activate', { method: 'POST', body: { licenseKey: $('#s-license').value.trim() } });
      toast('เปิดใช้งาน License สำเร็จ'); render();
    } catch (err) { toast(err.message, true); }
  };
  $('#s-import').onclick = () => $('#s-file').click();
  $('#s-file').onchange = async e => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const dump = JSON.parse(await file.text());
      await api('/backup/import', { method: 'POST', body: dump });
      toast('กู้คืนข้อมูลสำเร็จ'); render();
    } catch (err) { toast('ไฟล์ไม่ถูกต้อง: ' + err.message, true); }
  };
};

// ---------- Guide ----------
routes.guide = async () => {
  main.innerHTML = `
    <h1>📖 คู่มือการใช้งาน Aiman</h1>
    <div class="page-sub">ขั้นตอนการใช้งานทุกฟีเจอร์ ตั้งแต่เริ่มต้นจนโพสต์อัตโนมัติ</div>
    <div class="panel guide">
      <h2>1. เริ่มต้นใช้งาน</h2>
      <ol>
        <li>ไปที่ <b>ตั้งค่า & License</b> → กรอก License Key เพื่อเปิดใช้งาน (1 License ต่อ 1 เครื่อง)</li>
        <li>ใส่ API key ของคุณ: <code>OpenAI</code> สำหรับโหมด Credit หรือ <code>Gemini</code> สำหรับโหมด Google Flow</li>
        <li>ยังไม่มี key? ใช้งานได้ทันทีในโหมดจำลอง — เห็น workflow ครบทุกขั้นตอนโดยไม่มีค่าใช้จ่าย</li>
      </ol>
      <h2>2. นำเข้าสินค้า Affiliate</h2>
      <ol>
        <li>ไปที่ <b>สินค้า Affiliate</b> → กด <b>ดึงสินค้า Affiliate จาก TikTok</b></li>
        <li>หรือกด <b>เพิ่มสินค้าเอง</b> เพื่อกรอกชื่อ ราคา คอมมิชชั่น และลิงก์ Affiliate</li>
      </ol>
      <h2>3. สร้างวิดีโอ AI อัตโนมัติ</h2>
      <ol>
        <li>ไปที่ <b>สร้างวิดีโอ AI</b> → เลือกสินค้า</li>
        <li>เลือกความยาว: <b>1 ฉาก (8 วิ)</b> หรือ <b>2 ฉาก (16 วิ)</b> — ระบบ Storyboard จะทำให้ฉากต่อเนื่องเป็นธรรมชาติ</li>
        <li>เลือกโหมด AI: <b>Credit-Based</b> (GPT Image + Veo 3) หรือ <b>Google Flow</b> (Nano Banana + Veo)</li>
        <li>เลือกสไตล์เอง หรือปล่อยให้ระบบ <b>สุ่มอัตโนมัติ</b> · เลือกตัวละครจากคลังเพื่อคงเอกลักษณ์แบรนด์</li>
        <li>ระบุจำนวนคลิป (สูงสุด 20) → กด <b>🚀 เริ่มผลิตอัตโนมัติ</b> — ระบบจะสุ่มสไตล์ เขียน prompt สร้างภาพ และสร้างวิดีโอต่อเนื่องจนครบโดยไม่ต้องกดซ้ำ</li>
      </ol>
      <h2>4. โพสต์ & ตั้งเวลา</h2>
      <ol>
        <li>ไปที่ <b>โพสต์ / ตั้งเวลา</b> → เลือกวิดีโอ และเลือกบัญชี TikTok ได้หลายบัญชีพร้อมกัน</li>
        <li>กด <b>✨ ให้ AI เขียน</b> เพื่อสร้างแคปชั่นอัตโนมัติ · ใส่เพลงประกอบ · ติ๊กแนบลิงก์สินค้า (ตะกร้า)</li>
        <li>เว้นเวลาว่าง = โพสต์ทันที หรือเลือกวันเวลาเพื่อตั้งโพสต์ล่วงหน้า — ระบบทำงานเบื้องหลังให้อัตโนมัติ</li>
      </ol>
      <h2>5. คลังตัวละคร & สไตล์</h2>
      <ul>
        <li>บันทึกตัวละคร AI (เช่น พรีเซนเตอร์ประจำแบรนด์) และสไตล์วิดีโอที่ชอบไว้ใช้ซ้ำได้ไม่จำกัด</li>
      </ul>
      <h2>6. แดชบอร์ด & สถิติ</h2>
      <ul>
        <li>ดูจำนวนวิดีโอที่สร้าง/โพสต์ เครดิตที่ใช้ ค่าใช้จ่ายรายเดือน และกราฟผลผลิต 14 วันล่าสุด</li>
      </ul>
      <h2>7. สำรอง & ย้ายเครื่อง</h2>
      <ul>
        <li><b>ตั้งค่า</b> → <b>Export Backup</b> ได้ไฟล์เดียวรวมทุกอย่าง → นำไป <b>Import</b> บนเครื่องใหม่ได้ทันที</li>
      </ul>
      <div class="note">
        <b>หมายเหตุด้านนโยบาย:</b> Aiman เชื่อมต่อ TikTok ผ่าน API ทางการ (Login Kit / Content Posting API / TikTok Shop API) เท่านั้น
        และไม่มีฟีเจอร์ลบลายน้ำของผู้ให้บริการ AI — ลายน้ำ/เครื่องหมายที่มา (เช่นของ Veo) เป็นข้อกำหนดของแพลตฟอร์ม
        การลบออกขัดต่อเงื่อนไขการใช้งานและแนวทางความโปร่งใสของเนื้อหา AI
      </div>
    </div>`;
};
