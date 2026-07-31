@echo off
title Aiman - AI TikTok Affiliate Studio
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [!] ยังไม่ได้ติดตั้ง Node.js
  echo  กรุณาดาวน์โหลดและติดตั้งจาก https://nodejs.org ก่อน ^(กด Next อย่างเดียวจนเสร็จ^)
  echo  จากนั้นดับเบิลคลิกไฟล์นี้อีกครั้ง
  echo.
  pause
  exit /b 1
)

if not exist node_modules (
  echo กำลังติดตั้งครั้งแรก กรุณารอสักครู่...
  call npm install
)

echo กำลังเปิด Aiman...
start "" http://localhost:3000
node server/index.js
pause
