/**
 * server.js - Express Server cho FB Group Enterprise Engine (Port 3001)
 */
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');
const logger = require('./core/utils/logger');
const apiRoutes = require('./routes/api');

// Modular Services
const googleSheetProvider = require('./modules/recruitment/services/googleSheetProvider');
const groupManager = require('./modules/recruitment/services/groupManager');
const apartmentManager = require('./modules/bds/services/apartmentManager');
const bdsGroupManager = require('./modules/bds/services/bdsGroupManager');
const scraperLiveSyncService = require('./modules/recruitment/services/scraperLiveSyncService');

const app = express();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Serve frontend assets & images (tắt cache static để code mới luôn được nạp tức thì)
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: 0,
  etag: false,
  setHeaders: (res, path) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }
}));
app.use('/uploads', express.static(path.join(__dirname, '../data/images')));

// Tắt cache cho tất cả API routes để frontend luôn nhận dữ liệu realtime mới nhất
app.use('/api', (req, res, next) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// API Routes (Mounted from modular architecture: Core + Recruitment + BDS)
app.use('/api', apiRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    engine: 'LeadX Modular Enterprise Engine (Tuyển Dụng & Bất Động Sản)',
    uptime: process.uptime(),
    port: config.port
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error(`API Error: ${err.message}`);
  res.status(500).json({ success: false, message: err.message });
});

// Khởi động server (Lắng nghe cả IPv4 và IPv6)
const server = app.listen(config.port, '0.0.0.0', async () => {
  console.log('\n' + '='.repeat(65));
  logger.success(`🚀 LEADX MODULAR DASHBOARD ĐANG CHẠY TẠI:`);
  console.log(`👉 http://localhost:${config.port}`);
  console.log(`👉 http://127.0.0.1:${config.port}`);
  console.log('='.repeat(65) + '\n');

  // Tải trước dữ liệu các module
  try {
    groupManager.loadGroups();
    logger.info(`[Tuyển Dụng] Đã nạp ${groupManager.groups.length} Hội Nhóm Facebook Tuyển Dụng.`);
    
    bdsGroupManager.loadGroups();
    logger.info(`[Bất Động Sản] Đã nạp ${bdsGroupManager.groups.length} Hội Nhóm Facebook BĐS.`);
    logger.info(`[Bất Động Sản] Kho Căn Hộ hiện có ${apartmentManager.apartments.length} tin.`);

    googleSheetProvider.fetchJobs(false).catch(err => {
      logger.warn(`Google Sheet Tuyển Dụng tải ngầm: ${err.message}`);
    });

    // Kích hoạt dịch vụ tự động đồng bộ liên tục dữ liệu cào đa nguồn
    scraperLiveSyncService.startAutoSync(30);
    logger.success(`[Scraper LiveSync] 🟢 Đã kích hoạt cơ chế Tự động đồng bộ liên tục dữ liệu cào (mỗi 30s).`);
  } catch (err) {
    logger.warn(`Khởi tạo ban đầu: ${err.message}`);
  }
});

// Bắt lỗi xung đột cổng EADDRINUSE một cách mượt mà
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log('\n' + '='.repeat(65));
    logger.warn(`⚠️ CỔNG ${config.port} ĐANG CÓ TIẾN TRÌNH KHÁC CHẠY SẴN (EADDRINUSE)!`);
    console.log(`👉 LeadX Dashboard có thể ĐANG HOẠT ĐỘNG SẴN tại: http://localhost:${config.port}`);
    console.log(`👉 Bạn có thể mở trình duyệt vào dùng ngay mà không cần khởi động lại.`);
    console.log(`👉 Nếu muốn tắt tiến trình cũ để chạy lại mới hoàn toàn, gõ:`);
    console.log(`   npm run kill`);
    console.log(`   npm start`);
    console.log('='.repeat(65) + '\n');
    process.exit(0);
  } else {
    logger.error(`Lỗi máy chủ: ${err.message}`);
    process.exit(1);
  }
});
