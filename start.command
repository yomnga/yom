#!/bin/bash
# Aiman - AI TikTok Affiliate Studio (macOS launcher)
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "[!] ยังไม่ได้ติดตั้ง Node.js"
  echo "กรุณาดาวน์โหลดและติดตั้งจาก https://nodejs.org ก่อน แล้วดับเบิลคลิกไฟล์นี้อีกครั้ง"
  echo ""
  read -p "กด Enter เพื่อปิด..."
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "กำลังติดตั้งครั้งแรก กรุณารอสักครู่..."
  npm install
fi

echo "กำลังเปิด Aiman..."
(sleep 2 && open http://localhost:3000) &
node server/index.js
