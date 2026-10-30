/**
 * core.routes.js - API Router cho Nền Tảng Dùng Chung (Core & Shared Engine)
 * Bao gồm:
 * - Quản lý Đa Tài Khoản & Sức Khỏe Nick Facebook (Accounts & Health)
 * - Điều khiển Trình duyệt Chrome Stealth (Browser Controller)
 * - AI Content Spinner & Viết Lại Nội Dung (Gemini AI)
 * - Quản lý File Hình Ảnh Upload (Images Storage)
 * - Lịch Sử Đăng Bài Toàn Hệ Thống (Post History)
 * - Quản lý Khách Hàng CRM & Lead Vàng (Customer CRM)
 */
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const config = require('../../config');
const accountManager = require('../services/accountManager');
const accountHealthService = require('../services/accountHealthService');
const browserController = require('../automation/browserController');
const historyManager = require('../services/historyManager');
const customerManager = require('../services/customerManager');
const leadCrmManager = require('../services/leadCrmManager');
const commerceManager = require('../services/commerceManager');
const AISpinningService = require('../services/aiSpinningService');
const aiSpinner = new AISpinningService();
const { calculateSimilarityRatio } = require('../utils/similarityUtils');
const { testProxy, formatProxyDisplay } = require('../utils/proxyUtils');

let groupManager = null;
try {
  groupManager = require('../../modules/recruitment/services/groupManager');
} catch (e) {
  try {
    groupManager = require('../../modules/bds/services/bdsGroupManager');
  } catch (err) {}
}

const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
const imagesDir = path.join(rootDir, 'data/images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, imagesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedExts = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedExts.includes(ext)) return cb(null, true);
    cb(new Error('Chỉ chấp nhận các định dạng ảnh: .jpg, .jpeg, .png, .webp, .gif'));
  }
});

// === CRM CUSTOMERS ===

router.get('/customers', (req, res) => {
  try {
    const { search, status, channel } = req.query;
    const list = customerManager.getCustomers({ search, status, channel });
    const stats = customerManager.getStats();
    res.json({ success: true, data: list, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/customers/stats', (req, res) => {
  try {
    res.json({ success: true, data: customerManager.getStats() });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/customers', (req, res) => {
  try {
    const { name, phone, channel, status, statusLabel, orderValue, notes } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Tên khách hàng không được để trống!' });
    }
    const newCust = {
      id: `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: name.trim(),
      phone: (phone || '').trim(),
      channel: channel || 'Facebook Group',
      channelIcon: channel === 'Zalo OA' ? 'fa-solid fa-comment-dots' : (channel === 'Facebook Page' ? 'fa-brands fa-facebook' : (channel === 'Meta Messenger' ? 'fa-brands fa-facebook-messenger' : 'fa-solid fa-users')),
      status: status || 'NEW',
      statusLabel: statusLabel || 'Khách Hàng Mới',
      orderValue: Number(orderValue) || 0,
      updatedAt: new Date().toISOString().split('T')[0],
      notes: notes || '',
      source: 'manual',
      groupName: '',
      postUrl: ''
    };
    customerManager.customers.unshift(newCust);
    customerManager._save();
    res.json({ success: true, message: 'Đã thêm khách hàng thành công!', data: newCust });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/customers/convert-from-lead', (req, res) => {
  try {
    const leadData = req.body;
    const result = customerManager.convertFromLead(leadData);
    res.json({
      success: true,
      message: result.isExisting
        ? `Khách hàng "${result.customer.name}" đã tồn tại, đã cập nhật thêm thông tin!`
        : `Đã chuyển Lead "${result.customer.name}" thành Khách Hàng CRM thành công!`,
      data: result.customer,
      isExisting: result.isExisting
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/customers/sync-scraper', async (req, res) => {
  try {
    const result = await customerManager.syncFromGroupScraper({ forceReload: true, purgeSamples: true });
    res.json({
      success: true,
      message: `Đã đồng bộ thành công ${result.syncCount} khách hàng thực tế từ Facebook Group!`,
      data: result
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/customers/:id/status', (req, res) => {
  try {
    const { status, statusLabel } = req.body;
    const updated = customerManager.updateStatus(req.params.id, status, statusLabel);
    res.json({ success: true, message: 'Đã cập nhật trạng thái thành công!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.put('/customers/:id', (req, res) => {
  try {
    const updated = customerManager.updateCustomer(req.params.id, req.body);
    res.json({ success: true, message: 'Đã cập nhật thông tin khách hàng thành công!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/customers/:id', (req, res) => {
  try {
    const deleted = customerManager.deleteCustomer(req.params.id);
    res.json({ success: true, message: 'Đã xóa khách hàng thành công!', data: deleted });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// === LEAD CRM MODULE - QUY TRÌNH KHAI THÁC LEAD FACEBOOK GROUP ===
// ============================================================================

// 1. Lấy danh sách Leads (phân trang, tìm kiếm đa trường, bộ lọc trạng thái, lead tier, staff)
router.get('/leads', (req, res) => {
  try {
    const {
      page = 1,
      limit = 25,
      search = '',
      status = 'ALL',
      tier = 'ALL',
      staff = 'ALL',
      group = 'ALL',
      hasPhone = 'ALL',
      followUpStatus = 'ALL',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const result = leadCrmManager.getLeads({
      page,
      limit,
      search,
      status,
      tier,
      staff,
      group,
      hasPhone,
      followUpStatus,
      sortBy,
      sortOrder
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2. Thống kê KPI Cards Dashboard
router.get('/leads/stats', (req, res) => {
  try {
    const stats = leadCrmManager.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 3. Pipeline / Kanban Board
router.get('/leads/pipeline', (req, res) => {
  try {
    const pipeline = leadCrmManager.getPipeline();
    res.json({ success: true, data: pipeline });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 4. Danh sách nhân viên phụ trách & Nhóm FB
router.get('/leads/meta-options', (req, res) => {
  try {
    const groups = [...new Set(leadCrmManager.leads.map(l => l.groupName).filter(Boolean))];
    res.json({
      success: true,
      data: {
        staffs: leadCrmManager.staffs,
        groups
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Đồng bộ dữ liệu Lead từ bộ cào Scraper & Ingestion Pipeline
router.post('/leads/sync-scraper', async (req, res) => {
  try {
    const { forceReload = false } = req.body;
    const ingestionPipeline = require('../../modules/leadIngestion/services/leadIngestionPipeline');
    const pipelineResult = await ingestionPipeline.syncAllSources({ forceReload });

    // Đồng thời chạy syncFromScraper để đảm bảo tương thích 100%
    let legacyResult = { added: 0, updated: 0 };
    try {
      legacyResult = await leadCrmManager.syncFromScraper(forceReload);
    } catch (e) {}

    res.json({
      success: true,
      message: `Đồng bộ Lead Ingestion Pipeline hoàn tất qua ${pipelineResult.totalSources || 0} nguồn dữ liệu!`,
      data: { pipeline: pipelineResult, legacy: legacyResult }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.5 Radar Dò Lead (Ưu tiên các Lead Tuyển Gấp, Hiring Spike, Điểm cao)
router.get('/leads/radar', (req, res) => {
  try {
    const { filter = 'ALL' } = req.query;
    const radarItems = leadCrmManager.getLeadRadar({ filter });
    res.json({ success: true, data: radarItems, total: radarItems.length });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.6 Gom nhóm thực thể doanh nghiệp (Company Deduplication / Entity Resolution)
router.get('/leads/companies', (req, res) => {
  try {
    const companies = leadCrmManager.getGroupedCompanies();
    res.json({ success: true, total: companies.length, data: companies });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5.7 Ghi nhận lý do thất bại / Mất khách (Lost Lead / Lost Customer)
router.post('/leads/:id/lost', (req, res) => {
  try {
    const { reason, notes, actor = 'Sales' } = req.body;
    if (!reason) return res.status(400).json({ success: false, message: 'Vui lòng chọn lý do thất bại!' });
    const lead = leadCrmManager.updateLeadStatus(req.params.id, 'LOST', reason, actor, notes);
    res.json({ success: true, message: 'Đã ghi nhận lý do thất bại thành công!', data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. Chi tiết 1 Lead kèm Duplicate Candidates
router.get('/leads/:id', (req, res) => {
  try {
    const lead = leadCrmManager.getLeadById(req.params.id);
    if (!lead) return res.status(404).json({ success: false, message: 'Không tìm thấy Lead!' });
    res.json({ success: true, data: lead });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 7. Cập nhật thông tin trích xuất / trường dữ liệu Lead
router.patch('/leads/:id', (req, res) => {
  try {
    const actor = req.body.actor || 'Admin';
    const updated = leadCrmManager.updateLead(req.params.id, req.body, actor);
    res.json({ success: true, message: 'Đã lưu thông tin Lead thành công!', data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 8. Tự động bóc tách lại thông tin NLP (Re-extract)
router.post('/leads/:id/extract', (req, res) => {
  try {
    const actor = req.body.actor || 'Admin';
    const extracted = leadCrmManager.reExtractLead(req.params.id, actor);
    res.json({
      success: true,
      message: 'Đã phân tích và bóc tách lại thông tin bài đăng thành công!',
      data: extracted
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 9. Cập nhật Trạng Thái Lead (kèm lý do và ghi log)
router.post('/leads/:id/status', (req, res) => {
  try {
    const { status, reason, actor = 'Admin', notes } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Thiếu mã trạng thái!' });
    const updated = leadCrmManager.updateLeadStatus(req.params.id, status, reason, actor, notes);
    res.json({ success: true, message: `Đã đổi trạng thái sang "${updated.statusLabel}"!`, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 10. Ghi nhận Tiếp Cận / Liên Hệ (Contacted)
router.post('/leads/:id/contact', (req, res) => {
  try {
    const { channel = 'Phone', notes = '', actor = 'Admin', nextFollowUp = null } = req.body;
    const updated = leadCrmManager.recordContact(req.params.id, { channel, notes, actor, nextFollowUp });
    res.json({ success: true, message: `Đã ghi nhận tiếp cận qua kênh ${channel}!`, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 11. Đặt lịch Follow-up
router.post('/leads/:id/follow-up', (req, res) => {
  try {
    const { date, time, note, actor = 'Admin' } = req.body;
    if (!date) return res.status(400).json({ success: false, message: 'Vui lòng chọn ngày Follow-up!' });
    const updated = leadCrmManager.scheduleFollowUp(req.params.id, { date, time, note, actor });
    res.json({
      success: true,
      message: `Đã lên lịch Follow-up vào ${date} lúc ${time || '09:00'}!`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 12. Chuyển đổi Lead thành Khách Hàng CRM (Convert)
router.post('/leads/:id/convert', (req, res) => {
  try {
    const { actor = 'Admin', customData = {} } = req.body;
    const result = leadCrmManager.convertToCustomer(req.params.id, { actor, customData });
    res.json({
      success: true,
      message: result.isExistingCustomer
        ? `Đã liên kết với Khách hàng "${result.customer.name}" trong CRM!`
        : `Đã chuyển đổi thành công Khách hàng "${result.customer.name}" vào CRM!`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 13. Gộp Lead trùng (Merge)
router.post('/leads/merge', (req, res) => {
  try {
    const { primaryId, duplicateId, actor = 'Admin' } = req.body;
    if (!primaryId || !duplicateId) {
      return res.status(400).json({ success: false, message: 'Thiếu Lead chính hoặc Lead phụ để gộp!' });
    }
    const result = leadCrmManager.mergeLeads(primaryId, duplicateId, actor);
    res.json({ success: true, message: 'Đã gộp dữ liệu 2 Lead thành công!', data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 14. Bulk Actions (Hành động hàng loạt)
router.post('/leads/bulk-assign', (req, res) => {
  try {
    const { ids, staffName, actor = 'Admin' } = req.body;
    if (!staffName) return res.status(400).json({ success: false, message: 'Vui lòng chọn nhân viên!' });
    const count = leadCrmManager.bulkAssign(ids, staffName, actor);
    res.json({ success: true, message: `Đã phân công ${count} Lead cho "${staffName}"!`, count });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/leads/bulk-status', (req, res) => {
  try {
    const { ids, status, reason, actor = 'Admin' } = req.body;
    if (!status) return res.status(400).json({ success: false, message: 'Vui lòng chọn trạng thái!' });
    const count = leadCrmManager.bulkStatus(ids, status, reason, actor);
    res.json({ success: true, message: `Đã cập nhật trạng thái cho ${count} Lead!`, count });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/leads/bulk-convert', (req, res) => {
  try {
    const { ids, actor = 'Admin' } = req.body;
    const result = leadCrmManager.bulkConvert(ids, actor);
    res.json({
      success: true,
      message: `Đã chuyển đổi ${result.converted} Lead thành Khách Hàng CRM (Thất bại: ${result.failed})!`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/leads/bulk-delete', (req, res) => {
  try {
    const { ids, actor = 'Admin' } = req.body;
    const count = leadCrmManager.bulkDelete(ids, actor);
    res.json({ success: true, message: `Đã xóa ${count} Lead thành công!`, count });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// === KHAI THÁC LEAD: COMPANY 360, DỊCH VỤ, ĐƠN HÀNG & DOANH THU GROUP ===
// ============================================================================

// 16. Hồ Sơ Doanh Nghiệp 360° (Company 360)
router.get('/companies/:id/360', (req, res) => {
  try {
    const profile = leadCrmManager.getCompany360(req.params.id);
    res.json({ success: true, data: profile });
  } catch (err) {
    res.status(404).json({ success: false, message: err.message });
  }
});

// 17. Danh mục gói dịch vụ tuyển dụng
router.get('/commerce/services', (req, res) => {
  try {
    const services = commerceManager.getServices();
    res.json({ success: true, data: services });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 18. Danh sách đơn hàng
router.get('/commerce/orders', (req, res) => {
  try {
    const { customerId, status, search } = req.query;
    const orders = commerceManager.getOrders({ customerId, status, search });
    res.json({ success: true, data: orders });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 19. Tạo đơn hàng mới cho khách hàng
router.post('/commerce/orders', (req, res) => {
  try {
    const order = commerceManager.createOrder(req.body);
    res.json({ success: true, message: `Đã tạo đơn hàng "${order.orderCode}" thành công!`, data: order });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// 20. Báo cáo Phễu chuyển đổi 7 tầng (Lead Funnel)
router.get('/commerce/funnel', (req, res) => {
  try {
    const funnel = commerceManager.getFunnelAnalytics();
    res.json({ success: true, data: funnel });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 21. Báo cáo Doanh thu theo từng Hội Nhóm Facebook cào được
router.get('/commerce/revenue-by-group', (req, res) => {
  try {
    const groupRev = commerceManager.getRevenueByGroup();
    res.json({ success: true, data: groupRev });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 22. Nhận diện cơ hội Bán thêm (Upsell / Cross-sell signals)
router.get('/commerce/upsell-opportunities', (req, res) => {
  try {
    const opps = commerceManager.getUpsellOpportunities();
    res.json({ success: true, data: opps });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 2.2. HỆ THỐNG 34 FANPAGE (META GRAPH API AUTOPOST)

// === AI SPINNING ===

router.post('/ai/spin', async (req, res) => {
  try {
    const { rawContent, targetPages, fixedEntities, imageUrl } = req.body;
    if (!rawContent || !targetPages || targetPages.length === 0) {
      return res.status(400).json({ success: false, message: 'Thiếu rawContent hoặc targetPages.' });
    }

    const spunPosts = await aiSpinner.generateSpunPosts(rawContent, targetPages, fixedEntities || []);
    const fallbackImage = '/uploads/1787412190105_TUY___N_D___NG__2_.png';
    spunPosts.forEach(post => {
      post.mediaUrls = imageUrl ? [imageUrl] : [fallbackImage];
    });

    // Tạo ma trận tương đồng chi tiết
    const matrix = [];
    for (let i = 0; i < spunPosts.length; i++) {
      for (let j = i + 1; j < spunPosts.length; j++) {
        const sim = calculateSimilarityRatio(spunPosts[i].content, spunPosts[j].content);
        matrix.push({
          idxA: i,
          pageA: spunPosts[i].pageName,
          idxB: j,
          pageB: spunPosts[j].pageName,
          similarity: Number((sim * 100).toFixed(1)),
          isSafe: sim <= 0.70
        });
      }
    }

    res.json({
      success: true,
      totalPosts: spunPosts.length,
      data: spunPosts,
      similarityMatrix: matrix,
      isCompliant: matrix.every(m => m.isSafe)
    });
  } catch (err) {
    logger.error('Lỗi API /ai/spin:', err.message);
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. Nạp chiến dịch vào hàng đợi Delayed Jobs (Xuất bản)

// === IMAGES STORAGE ===

router.get('/images', (req, res) => {
  try {
    if (!fs.existsSync(imagesDir)) {
      return res.json({ success: true, data: [] });
    }
    const files = fs.readdirSync(imagesDir);
    const images = files
      .filter(f => /\.(jpg|jpeg|png|webp|gif)$/i.test(f))
      .map(filename => {
        const fullPath = path.join(imagesDir, filename);
        const stats = fs.statSync(fullPath);
        return {
          filename,
          name: filename,
          url: `/uploads/${filename}`,
          fullPath,
          sizeBytes: stats.size,
          createdAt: stats.birthtime
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, total: images.length, data: images, images });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/images/upload', upload.array('images', 10), (req, res) => {
  try {
    const uploadedFiles = (req.files || []).map(file => ({
      filename: file.filename,
      originalName: file.originalname,
      url: `/uploads/${file.filename}`,
      fullPath: file.path,
      sizeBytes: file.size
    }));

    res.json({
      success: true,
      message: `Đã tải lên ${uploadedFiles.length} hình ảnh thành công!`,
      data: uploadedFiles
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/images/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const targetPath = path.join(imagesDir, filename);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
      return res.json({ success: true, message: 'Đã xóa hình ảnh.' });
    }
    res.status(404).json({ success: false, message: 'Không tìm thấy file ảnh.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 5. BROWSER & CHROME PROFILE CONTROLLER

// === BROWSER CONTROLLER ===

router.get('/browser/status', async (req, res) => {
  try {
    const status = await browserController.checkLoginStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.json({ success: false, message: err.message });
  }
});

router.post('/browser/open-login', async (req, res) => {
  try {
    const result = await browserController.openLoginWindow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 6. AUTOPOST CONTROLLER

router.post('/browser/open-login', async (req, res) => {
  try {
    const result = await browserController.openLoginWindow();
    res.json({ success: true, message: result.message });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi mở Chrome: ${err.message}` });
  }
});

router.get('/browser/status', async (req, res) => {
  try {
    const status = await browserController.checkLoginStatus();
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi kiểm tra trạng thái Facebook: ${err.message}` });
  }
});

router.post('/browser/import-cookies', async (req, res) => {
  try {
    const { cookieString } = req.body;
    if (!cookieString) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp chuỗi Cookie Facebook.' });
    }
    const status = await browserController.importCookies(cookieString);

    // Tự động đồng bộ vào Account Manager để không bị switchAccount ghi đè cookie cũ:
    try {
      const parsed = accountManager.parseCookieString(cookieString);
      const cUser = parsed.find(c => c.name === 'c_user');
      const uid = cUser ? cUser.value : null;

      const accounts = accountManager.loadAccounts();
      let matchedAcc = uid ? accounts.find(a => a.fbUserId === uid) : null;
      if (!matchedAcc) {
        matchedAcc = accountManager.getCurrentAccount();
      }

      if (matchedAcc) {
        accountManager.updateAccount(matchedAcc.id, { cookieString });
      }
    } catch (syncErr) {
      console.warn('Lỗi đồng bộ cookie vào accountManager:', syncErr.message);
    }

    res.json({ success: true, message: 'Đã nạp Cookie và liên kết tài khoản Facebook thành công!', data: status });
  } catch (err) {
    res.status(500).json({ success: false, message: `Lỗi nạp Cookie: ${err.message}` });
  }
});

router.post('/browser/close', async (req, res) => {
  try {
    await browserController.close();
    res.json({ success: true, message: 'Đã đóng cửa sổ Chrome.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 9. QUẢN LÝ SỨC KHỎE TÀI KHOẢN & RỦI RO ĐĂNG BÀI (ACCOUNT HEALTH & RISK)

// === POST HISTORY ===

router.get('/history', (req, res) => {
  try {
    const { search, status, jobId, groupId, limit, page } = req.query;
    const result = historyManager.getHistory({
      search,
      status,
      jobId,
      groupId,
      limit: parseInt(limit, 10) || 100,
      page: parseInt(page, 10) || 1
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/history/stats', (req, res) => {
  try {
    const stats = historyManager.getStatistics();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Báo cáo đo lường hiệu quả tuyển dụng theo vị trí việc làm (User Google Sheet format)
router.get('/history/positions-report', (req, res) => {
  try {
    const report = historyManager.getPositionsReport();
    res.json({ success: true, data: report });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Cập nhật đường link bài viết cụ thể trên Facebook (Direct Post URL)
router.patch('/history/:id/post-url', (req, res) => {
  try {
    const { postUrl } = req.body;
    const updated = historyManager.updatePostUrl(req.params.id, postUrl);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi lịch sử.' });
    }
    res.json({ success: true, message: 'Đã cập nhật link bài viết thành công!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Xuất file CSV Bảng Đo Lường Tuyển Dụng chuẩn format Google Sheets của công ty
router.get('/history/export-recruitment-csv', (req, res) => {
  try {
    const report = historyManager.getPositionsReport();
    const rows = [
      ['Ngày đăng', 'Công ty', 'Vị trí tuyển dụng', 'Nền tảng đăng', 'Link bài viết', 'Hội nhóm Facebook', 'Trạng thái']
    ];

    report.records.forEach(r => {
      rows.push([
        r.dateFormatted,
        `"${(r.company || '').replace(/"/g, '""')}"`,
        `"${(r.positionName || '').replace(/"/g, '""')}"`,
        r.platform || 'Facebook',
        `"${(r.postUrl || '').replace(/"/g, '""')}"`,
        `"${(r.groupName || '').replace(/"/g, '""')}"`,
        `"${(r.approvalStatusText || r.status || '').replace(/"/g, '""')}"`
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="Bang_Do_Luong_Tuyen_Dung.csv"');
    res.send(csvContent);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/history/:id/status', (req, res) => {
  try {
    const { status, notes } = req.body;
    if (!status) {
      return res.status(400).json({ success: false, message: 'Vui lòng cung cấp trạng thái mới.' });
    }
    const updated = historyManager.updateStatus(req.params.id, status, notes);
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi lịch sử.' });
    }
    res.json({ success: true, message: 'Đã cập nhật trạng thái thành công!', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/history/:id', (req, res) => {
  try {
    const deleted = historyManager.deleteRecord(req.params.id);
    res.json({ success: deleted, message: deleted ? 'Đã xóa bản ghi.' : 'Không tìm thấy bản ghi để xóa.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete('/history', (req, res) => {
  try {
    historyManager.clearAll();
    res.json({ success: true, message: 'Đã dọn dẹp toàn bộ lịch sử đăng bài.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/history/export', (req, res) => {
  try {
    const format = req.query.format || 'json';
    const list = historyManager.loadHistory();

    if (format === 'csv') {
      const headers = ['ID', 'Thời Gian', 'Mã Tin', 'Tiêu Đề Tin', 'Công Ty', 'Tỉnh Thành', 'Mức Lương', 'Tên Nhóm', 'URL Nhóm', 'Trạng Thái', 'Chi Tiết Trạng Thái', 'Ảnh Đính Kèm', 'Ghi Chú'];
      const rows = list.map(item => [
        `"${item.id}"`,
        `"${new Date(item.postedAt).toLocaleString('vi-VN')}"`,
        `"${(item.jobId || '').replace(/"/g, '""')}"`,
        `"${(item.jobTitle || '').replace(/"/g, '""')}"`,
        `"${(item.company || '').replace(/"/g, '""')}"`,
        `"${(item.province || '').replace(/"/g, '""')}"`,
        `"${(item.salary || '').replace(/"/g, '""')}"`,
        `"${(item.groupName || '').replace(/"/g, '""')}"`,
        `"${(item.groupUrl || '').replace(/"/g, '""')}"`,
        `"${item.status}"`,
        `"${(item.approvalStatusText || item.errorMessage || '').replace(/"/g, '""')}"`,
        `"${(item.images || []).join('; ')}"`,
        `"${(item.notes || '').replace(/"/g, '""')}"`
      ]);

      const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="fb_post_history_${Date.now()}.csv"`);
      return res.send(csvContent);
    }

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="fb_post_history_${Date.now()}.json"`);
    res.send(JSON.stringify(list, null, 2));
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 8. QUẢN LÝ TRÌNH DUYỆT CHROME & ĐĂNG NHẬP FACEBOOK

// === ACCOUNTS & HEALTH ===

router.get('/account-health', (req, res) => {
  try {
    const current = accountManager.getCurrentAccount();
    const accountId = req.query.accountId || (current ? current.id : null);
    const overview = accountHealthService.getHealthOverview(accountId);
    res.json(overview);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/account-health/probe', async (req, res) => {
  try {
    const result = await accountHealthService.probeAccountHealthLive();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 10. QUẢN LÝ ĐA TÀI KHOẢN FACEBOOK (MULTI-ACCOUNT MANAGER)
router.get('/accounts', (req, res) => {
  try {
    const { scope } = req.query; // 'GROUP' | 'PAGE' | 'ALL'
    let accounts = accountManager.loadAccounts();
    const current = accountManager.getCurrentAccount();
    const currentGroup = accountManager.getCurrentGroupAccount();
    const currentPage = accountManager.getCurrentPageAccount();

    if (scope === 'GROUP') {
      accounts = accounts.filter(a => a.targetType === 'GROUP' || a.targetType === 'BOTH' || !a.targetType);
    } else if (scope === 'PAGE') {
      accounts = accounts.filter(a => a.targetType === 'PAGE' || a.targetType === 'BOTH');
    }

    const enrichedAccounts = accounts.map(acc => {
      const stats = (groupManager && typeof groupManager.getGroupStats === 'function')
        ? groupManager.getGroupStats(acc.id)
        : { joinedCount: 0, unjoinedCount: 0, total: 0 };
      return {
        ...acc,
        targetType: acc.targetType || 'GROUP',
        joinedGroupsCount: stats.joinedCount || 0,
        unjoinedGroupsCount: stats.unjoinedCount || 0,
        totalGroupsCount: stats.total || 0
      };
    });

    res.json({
      success: true,
      total: enrichedAccounts.length,
      current: current ? current.id : null,
      currentGroupId: currentGroup ? currentGroup.id : null,
      currentPageId: currentPage ? currentPage.id : null,
      currentGroupAccount: currentGroup,
      currentPageAccount: currentPage,
      data: enrichedAccounts
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts/test-proxy', async (req, res) => {
  try {
    const { proxy } = req.body;
    if (!proxy || !proxy.trim()) {
      return res.status(400).json({ success: false, message: 'Vui lòng nhập chuỗi Proxy (IP:Port hoặc IP:Port:User:Pass).' });
    }
    const result = await testProxy(proxy);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts', (req, res) => {
  try {
    const { name, cookieString, targetType, metaToken, fanpageNotes, proxy } = req.body;
    const newAccount = accountManager.addAccount({ name, cookieString, targetType, metaToken, fanpageNotes, proxy });
    res.json({
      success: true,
      message: `Đã thêm tài khoản "${newAccount.name}" (UID: ${newAccount.fbUserId}) thành công!`,
      data: newAccount
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { name, cookieString, targetType, metaToken, fanpageNotes, proxy } = req.body;
    const updated = accountManager.updateAccount(id, { name, cookieString, targetType, metaToken, fanpageNotes, proxy });
    res.json({
      success: true,
      message: `Đã cập nhật thông tin tài khoản "${updated.name}" thành công!`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/accounts/:id', (req, res) => {
  try {
    const { id } = req.params;
    const result = accountManager.deleteAccount(id);
    res.json({
      success: true,
      message: 'Đã xóa tài khoản khỏi danh sách.',
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});


router.post('/accounts/:id/switch-group', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await accountManager.switchGroupAccount(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts/:id/switch-page', (req, res) => {
  try {
    const { id } = req.params;
    const result = accountManager.switchPageAccount(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts/:id/set-target-type', (req, res) => {
  try {
    const { id } = req.params;
    const { targetType } = req.body;
    const updated = accountManager.setAccountTargetType(id, targetType);
    res.json({
      success: true,
      message: `Đã chuyển mục đích sử dụng sang: ${targetType === 'GROUP' ? 'Chuyên Đăng Nhóm' : (targetType === 'PAGE' ? 'Quản Trị Fanpage' : 'Dùng Cả Hai')}`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/accounts/:id/switch', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await accountManager.switchAccount(id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts/:id/resolve-checkpoint', (req, res) => {
  try {
    const { id } = req.params;
    const ok = accountManager.resolveCheckpoint(id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    res.json({ success: true, message: 'Đã kích hoạt lại tài khoản sau khi gỡ Checkpoint thành công!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts/:id/clear-action-block', (req, res) => {
  try {
    const { id } = req.params;
    const ok = accountManager.clearActionBlock(id);
    if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy tài khoản.' });
    res.json({ success: true, message: 'Đã gỡ cảnh báo Action Block và khôi phục tài khoản hoạt động bình thường!' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/accounts/:id/test-action-block', async (req, res) => {
  try {
    const { id } = req.params;
    const result = await groupJoiner.probeActionBlock(id);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// 11. QUẢN LÝ KPI VỊ TRÍ & TỰ ĐỘNG DỪNG (SMART KPI & AUTO-STOP)

module.exports = router;