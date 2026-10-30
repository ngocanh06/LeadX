/**
 * recruitment.routes.js - API Router chuyên trách cho Module Tuyển Dụng (Recruitment Engine)
 * Bao gồm:
 * - Quản lý Việc Làm Google Sheets & Việc Cào (Scraped Jobs)
 * - Quản lý Hội Nhóm Facebook Tuyển Dụng (CRUD, Sheet Sync, Scraper, Verifier, Auto Join)
 * - Quản lý 34 Fanpage Tỉnh Thành & Hàng Đợi Đăng Bài (Autopilot Queue)
 * - Điều khiển Chiến dịch Đăng Bài Tuyển Dụng (Recruitment Campaign)
 * - Quản lý Mục Tiêu (KPI) Vị Trí Tuyển Dụng & Phân Tích Thị Trường
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

const config = require('../../../config');
const googleSheetProvider = require('../services/googleSheetProvider');
const groupManager = require('../services/groupManager');
const groupPoster = require('../../../core/automation/groupPoster');
const groupScraper = require('../automation/groupScraper');
const groupJoiner = require('../automation/groupJoiner');
const groupVerifier = require('../automation/groupVerifier');
const engagementScanner = require('../automation/engagementScanner');
const postLeadScraper = require('../automation/postLeadScraper');
const scrapedJobsProvider = require('../services/scrapedJobsProvider');
const scraperDataProvider = require('../services/scraperDataProvider');
const scraperLiveSyncService = require('../services/scraperLiveSyncService');
const fanpageManager = require('../services/fanpageManager');
const fanpageMatcher = require('../services/fanpageMatcher');
const fanpageQueueManager = require('../services/fanpageQueueManager');
const autoPilotEngine = require('../services/autoPilotEngine');
const positionKpiManager = require('../services/positionKpiManager');
const marketAnalyticsService = require('../services/marketAnalyticsService');
const locationMatcher = require('../services/locationMatcher');
const accountManager = require('../../../core/services/accountManager');
const historyManager = require('../../../core/services/historyManager');
const multer = require('multer');
const industryPhotoService = require('../services/industryPhotoService');

// Cấu hình Multer cho Kho Ảnh Ngành Nghề Stock
const stockStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve(config.rootDir, 'data/images/stock');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `stock_${Date.now()}_${cleanName}${ext}`);
  }
});
const stockUpload = multer({
  storage: stockStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['.jpg', '.jpeg', '.png', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) return cb(null, true);
    cb(new Error('Chỉ chấp nhận các định dạng ảnh: .jpg, .jpeg, .png, .webp'));
  }
});
const bannerGenerator = require('../services/bannerGeneratorService');

const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
const imagesDir = path.join(rootDir, 'data/images');

// === SCRAPED JOBS & LEADS ===

// 1. LẤY DỮ LIỆU GOOGLE SHEETS
router.get('/sheet/jobs', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const jobs = await googleSheetProvider.fetchJobs(force);
    res.json({
      success: true,
      sheetUrl: googleSheetProvider.sheetUrl,
      lastFetched: googleSheetProvider.lastFetched,
      total: jobs.length,
      data: jobs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1.1 THÊM VIỆC LÀM MỚI VÀ ĐỒNG BỘ 2 CHIỀU SANG GOOGLE SHEET
router.post('/sheet/add-job', async (req, res) => {
  try {
    const jobData = req.body;
    if (!jobData || !jobData.title || !jobData.company) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập Vị trí công việc và Tên doanh nghiệp.' });
    }
    const result = await googleSheetProvider.addJob(jobData);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 1.2 LẤY CẤU HÌNH LINK SHEET & WEBHOOK
router.get('/sheet/config', (req, res) => {
  res.json({
    success: true,
    sheetUrl: googleSheetProvider.sheetUrl,
    webhookUrl: googleSheetProvider.webhookUrl
  });
});

// 2. CẬP NHẬT URL GOOGLE SHEET & WEBHOOK 2 CHIỀU
router.post('/sheet/config', async (req, res) => {
  const { sheetUrl, webhookUrl } = req.body;
  if (!sheetUrl && !webhookUrl) {
    return res.status(400).json({ success: false, message: 'Vui lòng cung cấp link Google Sheets hoặc Webhook URL.' });
  }

  googleSheetProvider.setSheetConfig(sheetUrl, webhookUrl);
  const jobs = await googleSheetProvider.fetchJobs(true);

  res.json({
    success: true,
    message: 'Đã cập nhật cấu hình Google Sheets và nạp dữ liệu thành công!',
    sheetUrl: googleSheetProvider.sheetUrl,
    webhookUrl: googleSheetProvider.webhookUrl,
    total: jobs.length,
    data: jobs
  });
});

// 2.1. NGUỒN TIN TUYỂN DỤNG & ĐỒNG BỘ NHÓM TỪ FACEBOOK GROUP SCRAPER
router.get('/scraped/jobs', async (req, res) => {
  try {
    const force = req.query.force === 'true';
    const goldOnly = req.query.goldOnly === 'true';
    const jobs = await scrapedJobsProvider.getJobs({ forceReload: force, goldOnly });
    res.json({
      success: true,
      total: jobs.length,
      goldCount: jobs.filter(j => j.leadTier === 'GOLD_LEAD').length,
      potentialCount: jobs.filter(j => j.leadTier === 'POTENTIAL_LEAD').length,
      data: jobs
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/scraped/sync-groups', (req, res) => {
  try {
    const result = scrapedJobsProvider.syncGroupsToEngine();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});
// 2.1.2 BÁO CÁO TỔNG QUAN DỮ LIỆU CÀO ĐA NGUỒN TỪ CÁC WEBSITE

// 2.1.2B CHI TIẾT NGUỒN CÀO TUYỂN DỤNG CỤ THỂ (TOPCV, JOBSGO, CAREERVIET, VIECLAM24H, VIETNAMWORKS)
router.get('/scraped/source-detail', (req, res) => {
  try {
    const sourceId = (req.query.source || 'topcv').toLowerCase().trim();
    const scraperDir = scraperLiveSyncService.scraperDir;

    const overview = scraperLiveSyncService.getOverview() || {};

    const SOURCE_MAP = {
      topcv: { name: 'TopCV', file: 'topcv_matrix_jobs.xlsx', icon: 'fa-solid fa-graduation-cap', color: '#00b14f' },
      jobsgo: { name: 'JobsGO', file: 'jobsgo/jobsgo_matrix_jobs.xlsx', icon: 'fa-solid fa-briefcase', color: '#1877f2' },
      careerviet: { name: 'CareerViet', file: 'careerviet_matrix_jobs.xlsx', icon: 'fa-solid fa-globe', color: '#e00016' },
      vieclam24h: { name: 'Vieclam24h', file: 'vieclam24h_matrix_jobs.xlsx', icon: 'fa-solid fa-building', color: '#ff6b00' },
      vietnamworks: { name: 'VietnamWorks', file: 'vietnamworks/vietnamworks_matrix_jobs.xlsx', icon: 'fa-solid fa-network-wired', color: '#005aff' },
      facebook_group: { name: 'Facebook Group Leads', file: '', icon: 'fa-brands fa-facebook', color: '#1877f2' }
    };

    const srcInfo = SOURCE_MAP[sourceId] || { name: sourceId, file: '', color: '#3b82f6', icon: 'fa-solid fa-database' };
    const sourceStats = (overview.sources || []).find(s => s.id === sourceId) || {};

    let jobs = [];
    if (srcInfo.file) {
      const fullPath = path.join(scraperDir, srcInfo.file);
      if (fs.existsSync(fullPath)) {
        try {
          const xlsxLib = require('xlsx');
          const wb = xlsxLib.readFile(fullPath);
          const raw = xlsxLib.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
          jobs = raw.map((r, i) => ({
            id: r['id'] || (i + 1),
            title: r['cong_viec'] || r['Công việc'] || r['Tiêu đề'] || '',
            company: r['nha_tuyen_dung'] || r['Nhà tuyển dụng'] || r['Công ty'] || 'Chưa cập nhật',
            location: r['tinh_thanh'] || r['Tỉnh thành'] || r['Địa điểm'] || 'Toàn quốc',
            industry: r['linh_vuc_nganh_nghe'] || r['Lĩnh vực/ngành nghề'] || '',
            salary: r['muc_luong'] || r['Mức lương'] || r['Lương'] || 'Thỏa thuận',
            workingTime: r['thoi_gian_lam_viec'] || r['Thời gian làm việc'] || '',
            deadline: r['han_nop_ho_so'] || r['Hạn nộp Hồ sơ'] || '',
            url: r['url'] || r['link'] || r['Link'] || '',
            contact: r['thong_tin_lien_he'] || r['Thông tin liên hệ'] || ''
          })).filter(j => j.title);
        } catch (err) {
          logger.warn(`Lỗi đọc file Excel nguồn ${sourceId}: ${err.message}`);
        }
      }
    }

    if (jobs.length === 0 && overview.recent_jobs) {
      jobs = overview.recent_jobs
        .filter(j => (j.source || '').toLowerCase().includes(sourceId.toLowerCase()))
        .map((j, i) => ({
          id: i + 1,
          title: j.title,
          company: j.company,
          location: j.location,
          salary: j.salary,
          url: j.url,
          industry: '',
          deadline: '',
          contact: ''
        }));
    }

    const count = sourceStats.count || jobs.length;
    const totalJobs = overview.total_jobs || 17797;
    const ratio = totalJobs > 0 ? Math.round((count / totalJobs) * 100) : 0;

    res.json({
      success: true,
      data: {
        sourceId,
        name: sourceStats.name || srcInfo.name,
        color: sourceStats.color || srcInfo.color,
        icon: sourceStats.icon || srcInfo.icon,
        count: count,
        companies_count: sourceStats.companies_count || 0,
        latest_time: sourceStats.latest_time || overview.updated_at || 'Mới cập nhật',
        ratio: ratio,
        totalJobs: totalJobs,
        file: srcInfo.file,
        totalInFile: jobs.length,
        jobs: jobs.slice(0, 100)
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Lấy báo cáo tổng quan dữ liệu cào đa nguồn (hỗ trợ force refresh và trả trạng thái auto-sync)
router.get('/scraped/market-overview', async (req, res) => {
  try {
    const force = req.query.force === 'true' || req.query.refresh === 'true';
    if (force) {
      const syncResult = await scraperLiveSyncService.syncNow(true);
      return res.json({ 
        success: true, 
        data: syncResult.data, 
        syncStatus: scraperLiveSyncService.getStatus(),
        diff: syncResult.diff,
        message: syncResult.message 
      });
    }

    const data = scraperLiveSyncService.getOverview();
    res.json({
      success: true,
      data: data,
      syncStatus: scraperLiveSyncService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Làm mới báo cáo tổng quan cào thủ công ngay lập tức
router.post('/scraped/refresh-market-overview', async (req, res) => {
  try {
    const syncResult = await scraperLiveSyncService.syncNow(true);
    res.json({
      success: true,
      message: syncResult.message,
      data: syncResult.data,
      diff: syncResult.diff,
      syncStatus: scraperLiveSyncService.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// SSE Stream cập nhật Real-time liên tục cho Frontend
router.get('/scraped/live-stream', (req, res) => {
  scraperLiveSyncService.handleSseConnection(req, res);
});

// Trạng thái tự động đồng bộ liên tục
router.get('/scraped/auto-sync-status', (req, res) => {
  res.json({ success: true, data: scraperLiveSyncService.getStatus() });
});

// Bật/Tắt chế độ đồng bộ liên tục hoặc thay đổi chu kỳ (giây)
router.post('/scraped/auto-sync-toggle', (req, res) => {
  try {
    const { enabled, intervalSeconds } = req.body;
    if (enabled === false) {
      scraperLiveSyncService.stopAutoSync();
    } else {
      scraperLiveSyncService.startAutoSync(intervalSeconds || 30);
    }
    res.json({ success: true, data: scraperLiveSyncService.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2.1.1 BẮT ĐẦU CÀO BÀI VIẾT & KHAI THÁC LEAD VÀNG TRỰC TIẾP
router.post('/scraped/start-scrape-leads', async (req, res) => {
  try {
    const {
      groups = [],
      maxPostsPerGroup = 15,
      goldOnly = false,
      filterJobSeekers = true,
      filterScam = true
    } = req.body;

    if (!groups || groups.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn hoặc cung cấp ít nhất 1 nhóm Facebook!' });
    }

    if (postLeadScraper.isScraping) {
      return res.status(400).json({ success: false, message: 'Hệ thống đang thực hiện một tiến trình cào bài viết khác!' });
    }

    // Chạy ngầm background tiến trình cào
    postLeadScraper.startScraping({
      groups,
      maxPostsPerGroup: parseInt(maxPostsPerGroup, 10) || 15,
      goldOnly: Boolean(goldOnly),
      filterJobSeekers: filterJobSeekers !== false,
      filterScam: filterScam !== false
    }).catch(err => {
      logger.error(`[LeadScraper Async Error] ${err.message}`);
    });

    res.json({
      success: true,
      message: `Đã kích hoạt tiến trình cào bài viết cho ${groups.length} nhóm mục tiêu!`,
      status: postLeadScraper.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/scraped/scrape-status', (req, res) => {
  try {
    res.json({
      success: true,
      data: postLeadScraper.getStatus()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/scraped/stop-scrape', (req, res) => {
  try {
    postLeadScraper.stop();
    res.json({ success: true, message: 'Đã gửi yêu cầu dừng tiến trình cào bài viết!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/scraped/pause-scrape', (req, res) => {
  try {
    postLeadScraper.pause();
    res.json({ success: true, message: 'Đã tạm dừng tiến trình cào bài viết!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/scraped/resume-scrape', (req, res) => {
  try {
    postLeadScraper.resume();
    res.json({ success: true, message: 'Đã tiếp tục tiến trình cào bài viết!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// === FANPAGES MANAGEMENT ===

router.get('/fanpages/stats', (req, res) => {
  res.json({ success: true, data: fanpageManager.getStats() });
});

router.get('/fanpages/config', (req, res) => {
  res.json({ success: true, data: fanpageManager.getConfig() });
});

router.post('/fanpages/config', async (req, res) => {
  const result = await fanpageManager.saveConfig(req.body);
  res.json(result);
});

router.get('/fanpages', (req, res) => {
  const { region, province, query } = req.query;
  const pages = fanpageManager.getPages({ region, province, query });
  const stats = fanpageManager.getStats();
  const config = fanpageManager.getConfig();
  const hasToken = Boolean(config.systemUserToken && config.systemUserToken.trim());
  res.json({
    success: true,
    total: pages.length,
    stats,
    config,
    hasToken,
    data: {
      fanpages: pages,
      stats,
      config,
      hasToken
    },
    fanpages: pages
  });
});

router.post('/fanpages/test-token', async (req, res) => {
  try {
    const token = req.body.token || fanpageManager.config.systemUserToken;
    const result = await metaApiClient.testToken(token);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/match', (req, res) => {
  try {
    const { job } = req.body;
    const result = fanpageMatcher.match(job);
    res.json({
      success: true,
      ...result,
      matchedFanpages: result.matchedPages,
      data: {
        matchedPages: result.matchedPages,
        matchedFanpages: result.matchedPages,
        ...result
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/publish', async (req, res) => {
  try {
    const pageIds = req.body.pageIds || req.body.fanpageIds;
    const job = req.body.job;
    const message = req.body.message || req.body.content || (job ? (job.formattedGroupPost || job.description || job.postText || job.title) : '');
    let mediaUrls = req.body.mediaUrls || req.body.selectedImages || req.body.imageUrls;
    const jobMeta = req.body.jobMeta || job;

    if (!Array.isArray(pageIds) || pageIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất 1 Fanpage mục tiêu.' });
    }
    if (!message || !message.trim()) {
      return res.status(400).json({ success: false, message: 'Nội dung bài đăng không được để trống.' });
    }
    
    // Tự động tạo Poster đồ họa đa mẫu nếu chưa có ảnh đính kèm
    if (!Array.isArray(mediaUrls) || mediaUrls.length === 0) {
      try {
        const bannerGenerator = require('../services/bannerGeneratorService');
        const genRes = await bannerGenerator.generateJobPoster(job || { title: message.slice(0, 50) });
        if (genRes && genRes.imageUrl) {
          mediaUrls = [genRes.imageUrl];
        } else {
          mediaUrls = ['/uploads/1787412190105_TUY___N_D___NG__2_.png'];
        }
      } catch (genErr) {
        mediaUrls = ['/uploads/1787412190105_TUY___N_D___NG__2_.png'];
      }
    }

    const results = [];
    for (const pageId of pageIds) {
      try {
        const postRes = await metaApiClient.publishToPage(pageId, message, mediaUrls);
        results.push(postRes);

        // Lưu vào lịch sử đăng bài
        historyManager.addHistory({
          type: 'FANPAGE_POST',
          pageId: postRes.pageId,
          groupName: `[Fanpage] ${postRes.pageName}`,
          postUrl: postRes.postUrl,
          postId: postRes.postId,
          status: 'SUCCESS',
          title: jobMeta?.title || 'Đăng bài Fanpage',
          publishedAt: new Date().toISOString()
        });
      } catch (err) {
        const page = fanpageManager.getPageById(pageId);
        results.push({
          success: false,
          pageId,
          pageName: page ? page.name : pageId,
          error: err.message
        });

        historyManager.addHistory({
          type: 'FANPAGE_POST',
          pageId,
          groupName: page ? `[Fanpage] ${page.name}` : pageId,
          status: 'FAILED',
          error: err.message,
          title: jobMeta?.title || 'Đăng bài Fanpage',
          publishedAt: new Date().toISOString()
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    res.json({
      success: true,
      total: pageIds.length,
      successCount,
      failCount: pageIds.length - successCount,
      data: results
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2.3. CHẾ ĐỘ AUTO-PILOT ĐĂNG 34 TỈNH THÀNH (2 BÀI/PAGE/NGÀY)
router.get('/fanpages/autopilot/plan', (req, res) => {
  try {
    const postsPerPage = parseInt(req.query.postsPerPage, 10) || 2;
    const plan = autoPilotEngine.generateDailyAutoPilotPlan(postsPerPage);
    // Tự động sinh ngầm poster trong background nếu có cờ generatePosters
    if (req.query.generatePosters === 'true') {
      autoPilotEngine.generateAllPosters({ plan }).catch(err => {
        logger.warn(`[AutoPilot Poster BG] Lỗi sinh poster ngầm: ${err.message}`);
      });
    }
    res.json(plan);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/autopilot/generate-all-posters', async (req, res) => {
  try {
    const result = await autoPilotEngine.generateAllPosters(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/autopilot/generate-all-posters', async (req, res) => {
  try {
    const result = await autoPilotEngine.generateAllPosters(req.body || {});
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/autopilot/launch', async (req, res) => {
  try {
    const result = await autoPilotEngine.launchAutoPilot(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// === FANPAGE LIVE CONTROLLER & TERMINAL ENDPOINTS ===
router.post('/fanpages/campaign/start', async (req, res) => {
  try {
    if (autoPilotEngine.isRunning) {
      return res.status(400).json({ success: false, message: 'Chiến dịch xuất bản Fanpage đang chạy!' });
    }
    // Chạy nền bất đồng bộ để không block request HTTP
    autoPilotEngine.launchAutoPilot(req.body).catch(err => {
      logger.error('[FanpageController] Lỗi chạy chiến dịch nền:', err.message);
    });
    res.json({ success: true, message: 'Đã kích hoạt chiến dịch xuất bản Fanpage thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/campaign/pause', (req, res) => {
  res.json(autoPilotEngine.pauseCampaign());
});

router.post('/fanpages/campaign/resume', (req, res) => {
  res.json(autoPilotEngine.resumeCampaign());
});

router.post('/fanpages/campaign/stop', (req, res) => {
  res.json(autoPilotEngine.stopCampaign());
});

router.get('/fanpages/campaign/status', (req, res) => {
  res.json({
    success: true,
    data: autoPilotEngine.getStatus(),
    logs: autoPilotEngine.getLogs()
  });
});

router.post('/fanpages/campaign/clear-logs', (req, res) => {
  res.json(autoPilotEngine.clearLogs());
});

// 2.4. TỰ ĐỘNG TẠO POSTER TUYỂN DỤNG CHUẨN HUMAN GRAPHIC DESIGN (NỀN SÁNG, ẢNH CHÂU Á, ZERO EMOJI)
router.post('/generate-poster', async (req, res) => {
  try {
    const { job, pageInfo, force } = req.body || {};
    if (!job) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin việc làm để tạo poster.' });
    }
    const result = await bannerGenerator.generateJobPoster(job, pageInfo || {}, { force: !!force });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/generate-poster', async (req, res) => {
  try {
    const { job, pageInfo, force } = req.body || {};
    if (!job) {
      return res.status(400).json({ success: false, message: 'Thiếu thông tin việc làm để tạo poster.' });
    }
    const result = await bannerGenerator.generateJobPoster(job, pageInfo || {}, { force: !!force });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// === JOBS REPOSITORY ===

router.get('/jobs', (req, res) => {
  const { query, location, source, hideExpired, postStatus, page, limit } = req.query;
  const result = scraperDataProvider.getJobs({
    query: query || '',
    location: location || '',
    source: source || 'ALL',
    hideExpired: hideExpired !== 'false',
    postStatus: postStatus || 'ALL',
    page: parseInt(page, 10) || 1,
    limit: parseInt(limit, 10) || 12
  });
  res.json({ success: true, data: result });
});

// 2. Lấy chi tiết 1 Job & Format thành payload bài đăng + Tự động khớp Fanpage tỉnh thành
router.get('/jobs/:id', (req, res) => {
  const job = scraperDataProvider.getJobById(req.params.id);
  if (!job) {
    return res.status(404).json({ success: false, message: 'Không tìm thấy tin tuyển dụng.' });
  }

  const campaignPayload = scraperDataProvider.formatJobToCampaignPayload(job);
  const matchedPages = locationMatcher.findAllMatchingPages(job);
  const matchedPageIds = matchedPages.map(p => p.pageId);

  res.json({
    success: true,
    data: {
      job,
      campaignPayload,
      matchedPageId: matchedPageIds[0],
      matchedPageIds,
      matchedPages,
      matchedPageName: matchedPages.map(p => p.pageName).join(', ')
    }
  });
});

// 3. Lấy danh sách Fanpage (alias cho workflow)
router.get('/pages', (req, res) => {
  const pages = fanpageManager.getPages();
  res.json({
    success: true,
    total: pages.length,
    data: pages
  });
});

// 4. Gọi AI Spin & Kiểm tra ma trận Levenshtein

// === FANPAGE QUEUE & AUTOPILOT ===

router.post('/campaigns/publish', async (req, res) => {
  try {
    const { campaignTitle, posts, mediaUrls } = req.body;
    if (!posts || posts.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách bài đăng trống.' });
    }

    const fallbackImage = '/uploads/1787412190105_TUY___N_D___NG__2_.png';
    const preparedPosts = posts.map(p => {
      let urls = (Array.isArray(p.mediaUrls) && p.mediaUrls.length > 0)
        ? p.mediaUrls
        : (Array.isArray(mediaUrls) && mediaUrls.length > 0 ? mediaUrls : [fallbackImage]);
      return {
        ...p,
        mediaUrls: urls
      };
    });

    const campaignId = 'camp_' + Date.now();
    const campaignMeta = {
      id: campaignId,
      title: campaignTitle || 'Chiến dịch tuyển dụng ' + new Date().toLocaleDateString('vi-VN')
    };

    const jobs = await fanpageQueueManager.enqueueCampaignPosts(preparedPosts, campaignMeta);

    res.json({
      success: true,
      data: {
        campaignId,
        totalJobs: jobs.length,
        estimatedCompletionMinutes: (jobs.length * 4).toFixed(0),
        message: `Đã nạp thành công ${jobs.length} bài đăng vào hàng đợi với khoảng cách 3-5 phút/trang.`
      }
    });
  } catch (err) {
    logger.error('Lỗi API /campaigns/publish:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Lấy trạng thái hàng đợi theo thời gian thực
router.get('/queue/status', (req, res) => {
  try {
    const status = fanpageQueueManager.getQueueStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Tạm dừng / Tiếp tục hàng đợi
router.post('/queue/pause', (req, res) => {
  try {
    const result = fanpageQueueManager.pause();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/queue/resume', (req, res) => {
  try {
    const result = fanpageQueueManager.resume();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. Kế hoạch Auto-Pilot 2 bài/page/ngày cho 34 Fanpage
router.get('/autopilot/plan', (req, res) => {
  try {
    const planResult = autoPilotEngine.generateDailyAutoPilotPlan(2);
    res.json(planResult);
  } catch (err) {
    logger.error('Lỗi /autopilot/plan:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. Kích hoạt nạp toàn bộ bài đăng Auto-Pilot vào hàng đợi
router.post('/autopilot/launch', async (req, res) => {
  try {
    const { plan } = req.body;
    const planToLaunch = plan || autoPilotEngine.generateDailyAutoPilotPlan(2).plan;
    const result = await fanpageQueueManager.enqueueAutoPilotPlan(planToLaunch);
    res.json(result);
  } catch (err) {
    logger.error('Lỗi /autopilot/launch:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. QUẢN LÝ HỘI NHÓM (GROUPS)

// === RECRUITMENT FACEBOOK GROUPS ===

router.get('/groups/stats', (req, res) => {
  const accountId = req.query.accountId || accountManager.getCurrentAccount()?.id;
  const stats = groupManager.getGroupStats(accountId);
  res.json({ success: true, data: stats });
});

router.get('/groups', (req, res) => {
  const accountId = req.query.accountId || accountManager.getCurrentAccount()?.id;
  const { province, category, status } = req.query;
  const groups = groupManager.getGroups({ province, category, status, accountId });
  const stats = groupManager.getGroupStats(accountId);
  res.json({ success: true, total: groups.length, stats, data: groups });
});

router.post('/groups', (req, res) => {
  const { name, url, province, category, members } = req.body;
  if (!name || !url) {
    return res.status(400).json({ success: false, message: 'Tên nhóm và URL nhóm là bắt buộc.' });
  }

  const newGroup = groupManager.addGroup({ name, url, province, category, members });
  res.json({ success: true, message: 'Đã thêm Nhóm mới thành công!', data: newGroup });
});

router.post('/groups/bulk', (req, res) => {
  const { groups } = req.body;
  if (!Array.isArray(groups) || groups.length === 0) {
    return res.status(400).json({ success: false, message: 'Danh sách nhóm không hợp lệ.' });
  }

  const result = groupManager.addBulkGroups(groups);
  res.json({ success: true, message: `Đã nạp thành công ${result.added} nhóm mới!`, ...result });
});

router.get('/groups/sheet-config', (req, res) => {
  res.json({
    success: true,
    data: {
      groupSheetUrl: groupManager.getGroupSheetUrl()
    }
  });
});

router.post('/groups/sheet-config', (req, res) => {
  try {
    const { sheetUrl } = req.body;
    if (!sheetUrl) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp link Google Sheets nhóm.' });
    }
    groupManager.setGroupSheetUrl(sheetUrl);
    res.json({ success: true, message: 'Đã lưu cấu hình link Google Sheets nhóm thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/groups/sync-sheet', async (req, res) => {
  try {
    const { sheetUrl, override } = req.body;
    const syncResult = await groupManager.syncFromSheet(sheetUrl, override === true);
    res.json({
      success: true,
      message: `Đã đồng bộ thành công ${syncResult.added} nhóm mới từ Google Sheets!`,
      totalGroups: syncResult.total,
      data: groupManager.loadGroups()
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi đồng bộ Google Sheets nhóm: ${err.message}` });
  }
});


// Xuất danh sách hội nhóm ra file CSV tương thích 100% Google Sheets & Microsoft Excel
router.get('/groups/export-csv', (req, res) => {
  try {
    const accountId = req.query.accountId || accountManager.getCurrentAccount()?.id;
    const currentAcc = (accountManager.loadAccounts() || []).find(a => a.id === accountId) || accountManager.getCurrentAccount();
    const accName = currentAcc ? currentAcc.name : 'Tất cả nick';

    const { province, category, status } = req.query;
    const groups = groupManager.getGroups({ province, category, status, accountId });

    const rows = [
      [
        'STT',
        'Tên Hội Nhóm Facebook',
        'Đường Dẫn Group (URL)',
        'Tỉnh / Thành Phố',
        'Chuyên Mục / Ngành Nghề',
        'Số Lượng Thành Viên',
        'Trạng Thái Tham Gia',
        'Tài Khoản Đang Đối Chiếu',
        'Lần Đăng Bài Gần Nhất',
        'Tiêu Đề Tin Đăng Gần Nhất'
      ]
    ];

    groups.forEach((g, idx) => {
      const isJoined = g.isJoined === true ? 'Đã tham gia' : 'Chưa vào nhóm';
      const lastPosted = g.lastPostedAt ? new Date(g.lastPostedAt).toLocaleDateString('vi-VN') : 'Chưa đăng';

      rows.push([
        idx + 1,
        `"${(g.name || '').replace(/"/g, '""')}"`,
        `"${(g.url || '').replace(/"/g, '""')}"`,
        `"${(g.province || 'Toàn quốc').replace(/"/g, '""')}"`,
        `"${(g.category || 'Tổng hợp').replace(/"/g, '""')}"`,
        `"${(g.members || 'N/A').replace(/"/g, '""')}"`,
        `"${isJoined}"`,
        `"${accName.replace(/"/g, '""')}"`,
        `"${lastPosted}"`,
        `"${(g.lastPostTitle || '').replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\r\n');
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="Danh_Sach_Hoi_Nhom_Facebook_${dateStr}.csv"`);
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/groups/clear-all', (req, res) => {
  groupManager.clearAll();
  res.json({ success: true, message: 'Đã xóa toàn bộ danh sách nhóm.' });
});

router.delete('/groups/clear-unjoined', (req, res) => {
  try {
    const { accountId, scope } = Object.assign({}, req.query, req.body);
    const result = groupManager.deleteUnjoinedGroups({ accountId, scope });
    res.json({
      success: true,
      message: `Đã xóa ${result.deletedCount} nhóm chưa tham gia. Hiện còn ${result.remainingCount} nhóm.`,
      deletedCount: result.deletedCount,
      remainingCount: result.remainingCount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/groups/bulk-delete', (req, res) => {
  try {
    const { groupIds } = req.body;
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Danh sách nhóm cần xóa không hợp lệ.' });
    }
    const result = groupManager.deleteGroupsByIds(groupIds);
    res.json({
      success: true,
      message: `Đã xóa ${result.deletedCount} nhóm được chọn. Còn lại ${result.remainingCount} nhóm.`,
      deletedCount: result.deletedCount,
      remainingCount: result.remainingCount
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/groups/:id', (req, res) => {
  const deleted = groupManager.deleteGroup(req.params.id);
  res.json({ success: deleted, message: deleted ? 'Đã xóa nhóm.' : 'Không tìm thấy nhóm để xóa.' });
});

// 3.1. TÍNH NĂNG 1: AUTO GROUP SCRAPER (TỰ ĐỘNG CÀO / QUÉT HỘI NHÓM)
router.post('/groups/scrape/start', async (req, res) => {
  try {
    const { keyword, province, minMembers, privacyFilter, maxResults } = req.body;
    if (!keyword || !keyword.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập từ khóa tìm kiếm nhóm (ví dụ: Việc làm Đà Nẵng).' });
    }

    if (groupScraper.isScraping) {
      return res.status(400).json({ success: false, message: 'Đang có tiến trình quét nhóm hoạt động. Vui lòng chờ hoàn tất.' });
    }

    // Chạy bất đồng bộ
    groupScraper.scrapeGroups({
      keyword: keyword.trim(),
      province: (province || '').trim(),
      minMembers: parseInt(minMembers, 10) || 0,
      privacyFilter: privacyFilter || 'ALL',
      maxResults: parseInt(maxResults, 10) || 30
    }).catch(err => {
      console.error('[GroupScraper] Error:', err.message);
    });

    res.json({
      success: true,
      message: `Đã khởi động tiến trình quét nhóm với từ khóa "${keyword}".`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/groups/scrape/status', (req, res) => {
  res.json({
    success: true,
    data: groupScraper.getStatus()
  });
});

router.post('/groups/scrape/save', (req, res) => {
  try {
    const { groups } = req.body;
    if (!Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ success: false, message: 'Không có hội nhóm nào được chọn để lưu.' });
    }

    const result = groupManager.addBulkGroups(groups);
    res.json({
      success: true,
      message: `Đã nạp thành công ${result.added} nhóm mới (${result.updated} nhóm cập nhật) vào hệ thống!`,
      added: result.added,
      updated: result.updated,
      total: result.total
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// Toggle membership trạng thái 1 nhóm cho nick hiện tại
router.post('/groups/:id/toggle-membership', (req, res) => {
  try {
    const { id } = req.params;
    const { isJoined, accountId } = req.body;
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const group = groupManager.getGroups({ accountId: targetAccountId }).find(g => g.id === id);
    if (!group) return res.status(404).json({ success: false, message: 'Không tìm thấy nhóm.' });

    const newStatus = isJoined !== undefined ? Boolean(isJoined) : !group.isJoined;
    const updated = groupManager.updateGroupMembership(id, newStatus, targetAccountId);
    res.json({
      success: true,
      message: `Đã cập nhật trạng thái nhóm thành: ${newStatus ? 'Đã tham gia' : 'Chưa vào nhóm'}.`,
      data: updated
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Sao chép trạng thái nhóm đã tham gia từ tài khoản này sang tài khoản khác
router.post('/groups/copy-membership', (req, res) => {
  try {
    const { sourceAccountId, targetAccountId } = req.body;
    const srcId = sourceAccountId || 'acc_primary';
    const tgtId = targetAccountId || accountManager.getCurrentAccount()?.id;
    if (!srcId || !tgtId || srcId === tgtId) {
      return res.status(400).json({ success: false, message: 'Tài khoản nguồn và đích phải khác nhau.' });
    }
    const count = groupManager.copyMemberships(srcId, tgtId);
    const stats = groupManager.getGroupStats(tgtId);
    res.json({
      success: true,
      message: `Đã sao chép thành công trạng thái ${count} nhóm sang nick đang chọn!`,
      copiedCount: count,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Đặt lại tất cả trạng thái nhóm về "Chưa vào nhóm" cho tài khoản
router.post('/groups/reset-membership', (req, res) => {
  try {
    const { accountId } = req.body;
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const acc = accountManager.loadAccounts().find(a => a.id === targetAccountId);
    const count = groupManager.resetMemberships(targetAccountId);
    const stats = groupManager.getGroupStats(targetAccountId);
    res.json({
      success: true,
      message: `Đã đặt lại toàn bộ ${count} nhóm về trạng thái "Chưa vào nhóm" cho nick "${acc ? acc.name : targetAccountId}".`,
      count,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Đồng bộ tự động các nhóm đã tham gia của tài khoản từ Facebook
router.post('/groups/sync-membership', async (req, res) => {
  try {
    const { accountId } = req.body;
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id;
    const acc = accountManager.loadAccounts().find(a => a.id === targetAccountId);
    if (!acc) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });

    if (acc.status === 'CHECKPOINT') {
      return res.status(400).json({ success: false, message: 'Tài khoản đang bị Checkpoint, không thể đồng bộ.' });
    }

    const syncRes = await groupVerifier.syncJoinedGroupsFromFacebook(targetAccountId);
    const stats = groupManager.getGroupStats(targetAccountId);
    res.json({
      success: true,
      message: `Đồng bộ chuẩn xác từ Facebook thành công! Đã vào: ${syncRes.joinedCount} nhóm | Chưa vào: ${syncRes.unjoinedCount} nhóm.`,
      matchedCount: syncRes.joinedCount,
      unjoinedCount: syncRes.unjoinedCount,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi đồng bộ nhóm: ${err.message}` });
  }
});

// 3.1.5. TÍNH NĂNG KIỂM TRA TRẠNG THÁI REAL-TIME TỪNG NHÓM
router.post('/groups/:id/check-realtime', async (req, res) => {
  try {
    const { id } = req.params;
    const { accountId } = req.body;
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id;

    const result = await groupVerifier.verifySingleGroup(id, targetAccountId);
    const stats = groupManager.getGroupStats(targetAccountId);

    res.json({
      success: true,
      message: `Đã kiểm tra nhóm "${result.groupName}": ${result.isJoined ? '✅ ĐÃ THAM GIA' : (result.isPending ? '⏳ ĐANG CHỜ DUYỆT' : '❌ CHƯA VÀO NHÓM')} (${result.note})`,
      data: result,
      stats
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3.1.6. TÍNH NĂNG QUÉT KIỂM TRA REAL-TIME HÀNG LOẠT
router.post('/groups/verify-batch/start', async (req, res) => {
  try {
    const { groupIds, accountId, delayMin, delayMax } = req.body;
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id;

    if (groupVerifier.isRunning) {
      return res.status(400).json({ success: false, message: 'Tiến trình kiểm tra Real-time đang hoạt động. Vui lòng chờ hoàn tất.' });
    }

    // Chạy bất đồng bộ
    groupVerifier.verifyBatchGroups({
      groupIds: Array.isArray(groupIds) ? groupIds : [],
      accountId: targetAccountId,
      delayMin: parseInt(delayMin, 10) || 2,
      delayMax: parseInt(delayMax, 10) || 4
    }).catch(err => {
      console.error('[GroupVerifier] Error:', err.message);
    });

    res.json({
      success: true,
      message: 'Đã khởi động tiến trình quét kiểm tra Real-time toàn bộ nhóm!'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/groups/verify-batch/status', (req, res) => {
  res.json({
    success: true,
    data: groupVerifier.getStatus()
  });
});

router.post('/groups/verify-batch/pause', (req, res) => {
  const ok = groupVerifier.pause();
  res.json({ success: ok, message: ok ? 'Đã tạm dừng tiến trình kiểm tra.' : 'Không thể tạm dừng.' });
});

router.post('/groups/verify-batch/resume', (req, res) => {
  const ok = groupVerifier.resume();
  res.json({ success: ok, message: ok ? 'Đang tiếp tục kiểm tra nhóm...' : 'Không thể tiếp tục.' });
});

router.post('/groups/verify-batch/stop', (req, res) => {
  const ok = groupVerifier.stop();
  res.json({ success: ok, message: ok ? 'Đã dừng tiến trình kiểm tra.' : 'Không có tiến trình đang chạy.' });
});

// 3.2. TÍNH NĂNG 2: AUTO GROUP JOINER (TỰ ĐỘNG XIN VÀO NHÓM)
router.post('/groups/join/start', async (req, res) => {
  try {
    const { groupIds, accountId, delayMin, delayMax, autoAnswer } = req.body;
    if (!Array.isArray(groupIds) || groupIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn ít nhất một hội nhóm để xin tham gia.' });
    }

    const targetAccId = accountId || accountManager.getCurrentAccount()?.id;
    const targetAcc = accountManager.loadAccounts().find(a => a.id === targetAccId);
    if (targetAcc && targetAcc.status === 'CHECKPOINT') {
      return res.status(400).json({
        success: false,
        message: `Tài khoản "${targetAcc.name}" đang bị Facebook yêu cầu xác minh danh tính (Checkpoint 282). Vui lòng hoàn tất xác minh trước khi xin vào nhóm!`
      });
    }

    if (groupJoiner.isRunning) {
      return res.status(400).json({ success: false, message: 'Tiến trình xin vào nhóm đang hoạt động.' });
    }

    // Chạy bất đồng bộ
    groupJoiner.joinGroups({
      groupIds,
      accountId: accountId || null,
      delayMin: parseInt(delayMin, 10) || 40,
      delayMax: parseInt(delayMax, 10) || 75,
      autoAnswer: (autoAnswer || '').trim()
    }).catch(err => {
      console.error('[GroupJoiner] Error:', err.message);
    });

    res.json({
      success: true,
      message: `Đã khởi động Auto-Joiner cho ${groupIds.length} nhóm đã chọn!`
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/groups/join/pause', (req, res) => {
  const paused = groupJoiner.pause();
  res.json({ success: paused, message: paused ? 'Đã tạm dừng tiến trình.' : 'Không thể tạm dừng.' });
});

router.post('/groups/join/resume', (req, res) => {
  const resumed = groupJoiner.resume();
  res.json({ success: resumed, message: resumed ? 'Đã tiếp tục tiến trình.' : 'Không thể tiếp tục.' });
});

router.post('/groups/join/stop', (req, res) => {
  const stopped = groupJoiner.stop();
  res.json({ success: stopped, message: stopped ? 'Đã gửi lệnh dừng tiến trình.' : 'Không thể dừng.' });
});

router.get('/groups/join/status', (req, res) => {
  res.json({
    success: true,
    data: groupJoiner.getStatus()
  });
});

// 4. QUẢN LÝ HÌNH ẢNH TUYỂN DỤNG (IMAGES)

// === RECRUITMENT CAMPAIGN CONTROLLER ===

router.post('/campaign/start', async (req, res) => {
  try {
    const { job, groupIds, selectedImages, imagePaths, delayConfig } = req.body || {};

    const currentAcc = accountManager.getCurrentAccount();
    if (currentAcc && currentAcc.status === 'CHECKPOINT') {
      return res.status(400).json({
        success: false,
        message: `Tài khoản "${currentAcc.name}" đang bị Facebook yêu cầu xác minh danh tính (Checkpoint 282). Vui lòng hoàn tất xác minh trước khi đăng bài!`
      });
    }

    if (!job) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn bài viết từ Google Sheets.' });
    }

    const allGroups = groupManager.loadGroups();
    const targetGroups = groupIds && groupIds.length > 0
      ? allGroups.filter(g => groupIds.includes(g.id))
      : allGroups;

    // Chuẩn hóa danh sách file ảnh tuyệt đối
    let resolvedImages = [];
    if (Array.isArray(imagePaths) && imagePaths.length > 0) {
      resolvedImages = imagePaths.map(p => path.isAbsolute(p) ? p : path.join(imagesDir, p)).filter(fs.existsSync);
    } else if (Array.isArray(selectedImages) && selectedImages.length > 0) {
      resolvedImages = selectedImages.map(img => {
        const fn = typeof img === 'string' ? img : img.filename;
        return path.join(imagesDir, fn);
      }).filter(fs.existsSync);
    }

    const result = await groupPoster.startCampaign(job, targetGroups, resolvedImages, delayConfig);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/campaign/pause', (req, res) => {
  res.json(groupPoster.pauseCampaign());
});

router.post('/campaign/resume', (req, res) => {
  res.json(groupPoster.resumeCampaign());
});

router.post('/campaign/stop', (req, res) => {
  res.json(groupPoster.stopCampaign());
});

router.get('/campaign/status', (req, res) => {
  res.json({
    success: true,
    data: groupPoster.getStatus(),
    logs: groupPoster.getLogs()
  });
});

// 7. QUẢN LÝ LỊCH SỬ ĐĂNG BÀI & THỐNG KÊ (HISTORY & ANALYTICS)

// === POSITIONS KPI & AUTO-STOP ===

router.get('/positions/kpi', (req, res) => {
  try {
    const report = historyManager.getPositionsReport();
    const kpiAll = positionKpiManager.getAllKpi();
    res.json({ success: true, data: { report, kpi: kpiAll } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/positions/kpi/update', (req, res) => {
  try {
    const { positionName, targetCv, receivedCv, maxPostsCap, autoStopEnabled, costEstimate, notes } = req.body;
    if (!positionName) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên vị trí.' });
    }
    const updated = positionKpiManager.updateKpi(positionName, {
      targetCv,
      receivedCv,
      maxPostsCap,
      autoStopEnabled,
      costEstimate,
      notes
    });
    res.json({ success: true, message: `Đã cập nhật KPI cho vị trí "${positionName}".`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/positions/kpi/adjust-cv', (req, res) => {
  try {
    const { positionName, delta } = req.body;
    if (!positionName) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp tên vị trí.' });
    }
    const updated = positionKpiManager.quickAdjustCv(positionName, parseInt(delta, 10) || 1);
    res.json({ success: true, message: `Đã cập nhật số lượng CV cho vị trí "${positionName}".`, data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 12. QUÉT TƯƠNG TÁC & LƯỢT TIẾP CẬN FACEBOOK (ENGAGEMENT SCANNER)

// === ENGAGEMENT SCANNER ===

router.post('/engagement/scan', async (req, res) => {
  try {
    const { limit, forceAll } = req.body;
    const result = await engagementScanner.startScan({ limit, forceAll });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/engagement/status', (req, res) => {
  try {
    const status = engagementScanner.getStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/engagement/stop', (req, res) => {
  try {
    const stopped = engagementScanner.stop();
    res.json({ success: true, stopped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 13. PHÂN TÍCH THỊ TRƯỜNG VIỆC LÀM & CUNG - CẦU (MARKET INTELLIGENCE)

// === MARKET ANALYTICS ===

router.get('/market/overview', (req, res) => {
  try {
    const overview = marketAnalyticsService.getMarketOverview();
    res.json({ success: true, data: overview });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/market/analyze', (req, res) => {
  try {
    const { jobTitle, province } = req.query;
    const analysis = marketAnalyticsService.analyzePosition(jobTitle || '', province || '');
    res.json({ success: true, data: analysis });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// ==========================================
// FANPAGE ANALYTICS & INSIGHTS ROUTES
// ==========================================

// === FANPAGE ANALYTICS ===

router.get('/fanpages/analytics', (req, res) => {
  try {
    const data = historyManager.getFanpageAnalytics();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/fanpages/posts/:id/refresh-metrics', (req, res) => {
  try {
    const updated = historyManager.refreshFanpagePostMetrics(req.params.id);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bài đăng' });
    }
    res.json({ success: true, post: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/fanpages/analytics/export', (req, res) => {
  try {
    const data = historyManager.getFanpageAnalytics();
    const rows = [
      ['STT', 'Ten Fanpage', 'ID Fanpage', 'Tieu De Tin', 'Muc Luong', 'Khu Vuc', 'Thoi Gian Dang', 'Luot Tiep Can (Reach)', 'Luot Thich', 'Binh Luan', 'Chia Se', 'Click Link Zalo', 'Link Bai Viet', 'Trang Thai']
    ];

    data.posts.forEach((p, idx) => {
      rows.push([
        idx + 1,
        `"${(p.groupName || '').replace(/"/g, '""')}"`,
        `"${p.groupId || ''}"`,
        `"${(p.jobTitle || '').replace(/"/g, '""')}"`,
        `"${p.salary || 'Thoa thuan'}"`,
        `"${p.province || 'Toan quoc'}"`,
        `"${p.publishedAt || p.createdAt || ''}"`,
        p.metrics?.reach || 0,
        p.metrics?.likes || 0,
        p.metrics?.comments || 0,
        p.metrics?.shares || 0,
        p.metrics?.clicks || 0,
        `"${p.postUrl || ''}"`,
        p.status || 'PUBLISHED'
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="fanpage_reach_analytics.csv"');
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});


// === INDUSTRY STOCK PHOTOS (KHO ẢNH NGÀNH NGHỀ) ===

router.get('/stock-photos', (req, res) => {
  try {
    const catalog = industryPhotoService.getCatalog();
    res.json({ success: true, data: catalog });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/stock-photos/upload', stockUpload.single('photo'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Vui lòng chọn file ảnh để tải lên' });
    }
    const category = req.body.category || 'general';
    industryPhotoService.addPhotoToCategory(category, req.file.filename);
    res.json({
      success: true,
      message: 'Tải ảnh lên kho ngành nghề thành công',
      photo: {
        filename: req.file.filename,
        url: `/uploads/stock/${req.file.filename}`,
        category
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/stock-photos/:category/:filename', (req, res) => {
  try {
    const { category, filename } = req.params;
    industryPhotoService.deletePhoto(category, filename);
    res.json({ success: true, message: 'Đã xóa ảnh thành công' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;