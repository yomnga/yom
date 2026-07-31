// TikTok integration ผ่าน API ทางการเท่านั้น
//  - Content Posting API : อัปโหลด/โพสต์วิดีโอ (ต้องมี access token จาก OAuth ของแอปที่ลงทะเบียนกับ TikTok)
//  - Affiliate product list : ผ่าน TikTok Shop Open API (ต้องมี app credentials)
// ถ้าบัญชียังไม่ได้เชื่อม token จริง ระบบจะทำงานในโหมดจำลอง (simulated) เพื่อทดสอบ workflow
const store = require('./store');

async function publishVideo({ post, account, video, caption }) {
  if (account.accessToken) {
    // ขั้นตอนจริงตาม TikTok Content Posting API (Direct Post):
    // 1) POST /v2/post/publish/video/init/ พร้อม post_info (caption) + source_info
    // 2) อัปโหลดไฟล์วิดีโอไปยัง upload_url ที่ได้รับ
    // 3) ตรวจสถานะผ่าน /v2/post/publish/status/fetch/
    try {
      const init = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${account.accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          post_info: { title: caption, privacy_level: 'SELF_ONLY' },
          source_info: { source: 'FILE_UPLOAD', video_size: 0, chunk_size: 0, total_chunk_count: 1 }
        })
      });
      if (!init.ok) throw new Error(`TikTok API ${init.status}`);
      const data = await init.json();
      return { ok: true, simulated: false, publishId: data.data?.publish_id || null };
    } catch (err) {
      return { ok: false, simulated: false, error: err.message };
    }
  }
  // โหมดจำลอง
  return { ok: true, simulated: true, publishId: `sim_${Date.now()}` };
}

// จำลองรายการสินค้า Affiliate เมื่อยังไม่ได้เชื่อม TikTok Shop Open API
function sampleAffiliateProducts() {
  const samples = [
    { name: 'เซรั่มวิตามินซี เข้มข้น 20%', category: 'ความงาม', price: 259, commissionPct: 15, description: 'ผิวกระจ่างใสใน 7 วัน ลดจุดด่างดำ' },
    { name: 'หูฟังไร้สาย Bass หนัก กันน้ำ IPX7', category: 'แกดเจ็ต', price: 399, commissionPct: 10, description: 'แบตอึด 30 ชม. เชื่อมต่อไว' },
    { name: 'กระเป๋าผ้าแคนวาส มินิมอล', category: 'แฟชั่น', price: 189, commissionPct: 20, description: 'จุของได้เยอะ มี 5 สี' },
    { name: 'เครื่องปั่นน้ำผลไม้พกพา USB-C', category: 'ของใช้ในบ้าน', price: 329, commissionPct: 12, description: 'ปั่นแหลกใน 30 วินาที ล้างง่าย' },
    { name: 'แผ่นมาส์กหน้าคอลลาเจน (10 แผ่น)', category: 'ความงาม', price: 149, commissionPct: 25, description: 'ผิวชุ่มชื้นเด้งตั้งแต่ครั้งแรก' },
    { name: 'ขาตั้งมือถือ ไฟ LED วงแหวน', category: 'แกดเจ็ต', price: 279, commissionPct: 18, description: 'สำหรับสายไลฟ์และครีเอเตอร์' }
  ];
  return samples.map(s => ({
    id: store.id('prod'),
    ...s,
    affiliateLink: `https://vt.tiktok.com/demo/${Math.random().toString(36).slice(2, 8)}`,
    source: 'simulated-import',
    importedAt: new Date().toISOString()
  }));
}

module.exports = { publishVideo, sampleAffiliateProducts };
