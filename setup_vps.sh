#!/bin/bash

# Script tự động cài đặt môi trường Rôm Rả Bot trên VPS mới Ubuntu 22.04
# Hỗ trợ: Node.js v20 LTS, PM2, Playwright Chromium & dependencies, tải code Bot mới nhất.

echo "=================================================================="
echo "🚀 BẮT ĐẦU SETUP HỆ THỐNG RÔM RẢ BOT TRÊN VPS MỚI (UBUNTU 22.04) 🚀"
echo "=================================================================="
sleep 2

# 1. Cập nhật hệ thống
echo "🔄 [1/6] Đang cập nhật danh sách gói hệ thống..."
apt update && apt upgrade -y

# 2. Cài đặt các công cụ cơ bản
echo "📦 [2/6] Cài đặt curl, git và build tools..."
apt install -y curl git build-essential

# 3. Cài đặt Node.js v20 LTS và npm
echo "🟢 [3/6] Cài đặt Node.js v20 LTS và npm..."
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Xác nhận phiên bản Node.js
echo "ℹ️ Phiên bản Node.js hiện tại: $(node -v)"
echo "ℹ️ Phiên bản npm hiện tại: $(npm -v)"

# 4. Cài đặt PM2 quản lý bot chạy ngầm
echo "⚙️ [4/6] Cài đặt PM2 toàn cục..."
npm install -g pm2

# 5. Khởi tạo cấu trúc thư mục và tải mã nguồn bot mới nhất từ GitHub
echo "📂 [5/6] Tạo thư mục làm việc và tải code bot..."
mkdir -p /root/scratch

# Tải file bot Grab chính
echo "📥 Tải romra_scraper.js..."
curl -L -o /root/romra_scraper.js https://raw.githubusercontent.com/betafpt/romracaphe/main/romra_scraper.js

# Tải các file cào cưỡng bức đơn lịch sử
echo "📥 Tải test_specific_order.js..."
curl -L -o /root/scratch/test_specific_order.js https://raw.githubusercontent.com/betafpt/romracaphe/main/scratch/test_specific_order.js

echo "📥 Tải test_history_scrape.js..."
curl -L -o /root/scratch/test_history_scrape.js https://raw.githubusercontent.com/betafpt/romracaphe/main/scratch/test_history_scrape.js

# Tải file bot Shopee
echo "📥 Tải shopee_scraper.js..."
curl -L -o /root/shopee_scraper.js https://raw.githubusercontent.com/betafpt/romracaphe/main/shopee_scraper.js

# 6. Cài đặt thư viện Node.js và Playwright Chromium dependencies
echo "🛡️ [6/6] Cài đặt thư viện Node.js và Chromium dependencies..."

# Di chuyển về thư mục gốc root để cài packages
cd /root

# Khởi tạo package.json tối giản nếu chưa có
if [ ! -f package.json ]; then
  npm init -y
fi

# Cài đặt các thư viện Node.js cần thiết cho bot
npm install @supabase/supabase-js ws playwright

# Ra lệnh cho Playwright cài đặt Chromium và TẤT CẢ các thư viện hệ thống cần thiết (Cực kỳ quan trọng)
echo "🌐 Đang tải Chromium và tự động cài đặt 100% thư viện hệ thống bổ trợ..."
npx playwright install chromium --with-deps

echo "=================================================================="
echo "🎉 SETUP HỆ THỐNG MÔI TRƯỜNG THÀNH CÔNG RỰC RỠ! 🎉"
echo "=================================================================="
echo "👉 Các bước tiếp theo anh cần làm:"
echo "1. Tạo file cấu hình Grab bằng lệnh: nano /root/grab_config.json (Dán nội dung cấu hình cũ vào và lưu lại)."
echo "2. Tạo file cấu hình Shopee bằng lệnh: nano /root/shopee_config.json (Dán nội dung cấu hình cũ vào và lưu lại)."
echo "3. Khởi động 2 bot trên PM2:"
echo "   pm2 start /root/romra_scraper.js --name 'romra-bot'"
echo "   pm2 start /root/shopee_scraper.js --name 'romra-shopee-bot'"
echo "4. Lưu trạng thái PM2 tự khởi động cùng VPS: pm2 save && pm2 startup"
echo "=================================================================="
