/**
 * marketIntelligence.routes.js - REST API Controller cho module Job Market Intelligence
 * Hỗ trợ phân tích đa ngành nghề & Job Roles theo chuẩn generic, không hard-code cho bất kỳ ngành nào.
 */
const express = require('express');
const router = express.Router();
const analyticsEngine = require('../services/jobMarketAnalyticsEngine');
const taxonomyService = require('../services/jobMarketTaxonomyService');
const topcvTaxonomyService = require('../services/topcvTaxonomyService');
const ingestionService = require('../services/jobMarketIngestionService');
const logger = require('../../../core/utils/logger');

// Cache kết quả phân tích trong bộ nhớ (5 phút) để tăng tốc tải trang
const queryCache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * GET /api/market-intelligence/analyze
 * Endpoint phân tích thị trường việc làm tổng thể
 */
router.get('/analyze', async (req, res) => {
  try {
    const {
      query = '',
      location = 'all',
      experience = 'all',
      industry = 'all',
      jobRole = 'all',
      timeframe = '12m',
      refresh = 'false'
    } = req.query;

    const cacheKey = `${query.toLowerCase()}_${industry.toLowerCase()}_${jobRole.toLowerCase()}_${location}_${experience}_${timeframe}`;

    if (refresh !== 'true' && queryCache.has(cacheKey)) {
      const cached = queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < CACHE_TTL_MS) {
        return res.json({ success: true, source: 'cache', data: cached.data });
      }
    }

    logger.info(`[JMI API] Phân tích thị trường: query="${query}" | Ngành="${industry}" | Role="${jobRole}" | Khu vực="${location}" | KN="${experience}" | Time="${timeframe}"`);

    // Phân tích định lượng toàn diện
    const metrics = await analyticsEngine.analyze({
      query,
      location,
      experience,
      industry,
      jobRole,
      timeframe
    });

    queryCache.set(cacheKey, { timestamp: Date.now(), data: metrics });

    return res.json({
      success: true,
      source: 'live_engine',
      data: metrics
    });
  } catch (error) {
    logger.error(`[JMI API] Lỗi phân tích thị trường: ${error.message}`);
    return res.status(500).json({
      success: false,
      message: 'Lỗi khi xử lý phân tích thị trường việc làm: ' + error.message
    });
  }
});

/**
 * GET /api/market-intelligence/coverage
 * Báo cáo độ bao phủ dữ liệu thị trường (Data Coverage - Mục 5)
 */
router.get('/coverage', (req, res) => {
  try {
    const coverage = ingestionService.getCoverageStats();
    return res.json({ success: true, data: coverage });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/market-intelligence/industries
 * Lấy danh sách toàn bộ ngành nghề được hỗ trợ
 */
router.get('/industries', (req, res) => {
  try {
    const industries = taxonomyService.getAllIndustries();
    return res.json({ success: true, data: industries });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/market-intelligence/job-roles
 * Lấy danh sách Job Roles theo ngành (hoặc toàn bộ)
 */
router.get('/job-roles', (req, res) => {
  try {
    const { industry } = req.query;
    const roles = taxonomyService.getJobRolesByIndustry(industry);
    return res.json({ success: true, data: roles });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/market-intelligence/search
 * Tìm kiếm gợi ý nhanh cả Ngành & Job Role
 */
router.get('/search', (req, res) => {
  try {
    const { q } = req.query;
    const results = taxonomyService.searchTaxonomy(q || '');
    return res.json({ success: true, data: results });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/market-intelligence/taxonomy
 * Lấy danh mục 3 cấp chuẩn TopCV
 */
router.get('/taxonomy', (req, res) => {
  try {
    const tree = topcvTaxonomyService.getTaxonomyTree();
    return res.json({ success: true, data: tree });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * GET /api/market-intelligence/raw-audit
 * Xem danh sách việc làm thực tế tạo nên các số liệu thống kê (Data Traceability)
 */
router.get('/raw-audit', async (req, res) => {
  try {
    const { query = '', industry = 'all', jobRole = 'all', limit = 50 } = req.query;
    const allJobs = await ingestionService.ingestAll();

    let matching = allJobs.filter(j => {
      if (industry !== 'all' && industry !== '') {
        if (!j.industry.toLowerCase().includes(industry.toLowerCase())) return false;
      }
      if (jobRole !== 'all' && jobRole !== '') {
        if (!j.jobRole.toLowerCase().includes(jobRole.toLowerCase())) return false;
      }
      if (query && query !== 'all') {
        const q = query.toLowerCase();
        const inTitle = (j.rawTitle || '').toLowerCase().includes(q);
        const inInd = (j.industry || '').toLowerCase().includes(q);
        const inRole = (j.jobRole || '').toLowerCase().includes(q);
        if (!inTitle && !inInd && !inRole) return false;
      }
      return true;
    });

    const results = matching.slice(0, parseInt(limit, 10)).map(j => ({
      id: j.id,
      source: j.source,
      sourceUrl: j.sourceUrl,
      title: j.rawTitle,
      company: j.company,
      location: j.location,
      industry: j.industry,
      jobRole: j.jobRole,
      salary: j.salary.raw,
      salaryNormalized: j.salary.median ? `${j.salary.median} Tr` : 'Thoả thuận',
      experience: j.seniority.label,
      skillsExtracted: (j.skills || []).map(s => s.canonical),
      postedDate: j.postedDate
    }));

    return res.json({
      success: true,
      totalMatched: matching.length,
      returned: results.length,
      data: results
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

/**
 * POST /api/market-intelligence/refresh
 * Bắt buộc quét lại kho dữ liệu
 */
router.post('/refresh', async (req, res) => {
  try {
    queryCache.clear();
    const jobs = await ingestionService.ingestAll(true);
    return res.json({
      success: true,
      message: `Đã nạp và chuẩn hóa lại thành công ${jobs.length} tin việc làm.`,
      totalJobs: jobs.length
    });
  } catch (error) {
    return res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
