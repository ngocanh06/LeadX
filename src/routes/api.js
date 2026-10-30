/**
 * api.js - Master Router kết nối các Module nghiệp vụ độc lập:
 * 1. Core Platform (Tài khoản Facebook, Trình duyệt Chrome Stealth, AI Spin, Media Upload, CRM, Lịch sử)
 * 2. Module Tuyển Dụng (Việc làm, Nhóm Tuyển Dụng, 34 Fanpage, Autopilot Queue, KPI Tuyển Dụng)
 * 3. Module Bất Động Sản (Kho Căn Hộ, Đồng bộ Google Sheets BĐS, Nhóm BĐS, BDS Controller)
 * 
 * Thiết kế Module hóa giúp dễ dàng bảo trì hoặc tách riêng từng Tool độc lập mà không ảnh hưởng lẫn nhau.
 */
const express = require('express');
const router = express.Router();

const coreRoutes = require('../core/routes/core.routes');
const controlCenterRoutes = require('../core/routes/controlCenter.routes');
const campaignRoutes = require('../core/routes/campaign.routes');
const leadIntelligenceRoutes = require('../core/routes/leadIntelligence.routes');
const pipelineRoutes = require('../core/routes/pipeline.routes');
const emailRoutes = require('../core/routes/email.routes');
const facebookAutomationRoutes = require('../modules/recruitment/routes/facebookAutomation.routes');
const recruitmentRoutes = require('../modules/recruitment/routes/recruitment.routes');
const bdsRoutes = require('../modules/bds/routes/bds.routes');
const marketIntelligenceRoutes = require('../modules/recruitment/routes/marketIntelligence.routes');
const leadSourcesRoutes = require('../modules/leadIngestion/routes/leadSources.routes');
const ingestionRoutes = require('../modules/leadIngestion/routes/ingestion.routes');
const marketingRoutes = require('../modules/marketing/routes/marketing.routes');

// Mount Modules
router.use('/', coreRoutes);
router.use('/control-center', controlCenterRoutes);
router.use('/campaigns', campaignRoutes);
router.use('/lead-intelligence', leadIntelligenceRoutes);
router.use('/pipelines', pipelineRoutes);
router.use('/email', emailRoutes);
router.use('/fb-automation', facebookAutomationRoutes);
router.use('/', recruitmentRoutes);
router.use('/recruitment', recruitmentRoutes);
router.use('/', bdsRoutes);
router.use('/bds', bdsRoutes);
router.use('/market-intelligence', marketIntelligenceRoutes);
router.use('/recruitment/market-intelligence', marketIntelligenceRoutes);
router.use('/lead-sources', leadSourcesRoutes);
router.use('/ingestion', ingestionRoutes);
router.use('/marketing', marketingRoutes);

module.exports = router;
