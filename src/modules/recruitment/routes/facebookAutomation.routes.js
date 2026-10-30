/**
 * facebookAutomation.routes.js - API Router Phân Hệ Facebook Automation (Phase 3)
 * Bao gồm:
 * 1. Multi-Page Broadcast (Phát sóng đa Fanpage kèm biến thể tự động)
 * 2. Group Intelligence (Đánh giá chất lượng nhóm tự động bằng Group Score)
 * 3. Seeding & Engagement Engine (Kịch bản bình luận mồi, thả reaction an toàn)
 */
const express = require('express');
const router = express.Router();

const fanpageBroadcastService = require('../services/fanpageBroadcastService');
const groupIntelligenceService = require('../../../core/services/groupIntelligenceService');
const seedingEngine = require('../../../core/services/seedingEngine');

// ============================================================================
// 1. MULTI-PAGE BROADCAST (PHÁT SÓNG ĐA FANPAGE)
// ============================================================================

router.get('/broadcast/pages', (req, res) => {
  try {
    const pages = fanpageBroadcastService.getAvailableFanpages();
    res.json({ success: true, total: pages.length, data: pages });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/broadcast', (req, res) => {
  try {
    const result = fanpageBroadcastService.broadcastToPages(req.body);
    res.json({
      success: true,
      message: `Đã lên lịch phát sóng thành công lên ${result.totalPages} Fanpage!`,
      data: result
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. DYNAMIC GROUP INTELLIGENCE (ĐÁNH GIÁ CHẤT LƯỢNG NHÓM)
// ============================================================================

router.get('/group-intelligence', (req, res) => {
  try {
    const { industry = 'recruitment', search = '', tier = 'ALL', limit = 50, page = 1 } = req.query;
    const result = groupIntelligenceService.getAnalyzedGroups({ industry, search, tier, limit, page });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. ENGAGEMENT & SEEDING ENGINE (BÌNH LUẬN & TƯƠNG TÁC)
// ============================================================================

router.get('/seeding/campaigns', (req, res) => {
  try {
    const list = seedingEngine.getCampaigns();
    res.json({ success: true, total: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/seeding/campaigns', (req, res) => {
  try {
    const campaign = seedingEngine.createSeedingCampaign(req.body);
    res.json({
      success: true,
      message: `Đã khởi tạo chiến dịch Seeding "${campaign.name}" thành công!`,
      data: campaign
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/seeding/queue', (req, res) => {
  try {
    const { campaignId, status, limit } = req.query;
    const result = seedingEngine.getCommentsQueue({ campaignId, status, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
