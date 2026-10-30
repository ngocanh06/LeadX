/**
 * leadIntelligence.routes.js - API Định Tuyến Lead Intelligence & Social Listening
 * Section 14 Master Prompt
 */
const express = require('express');
const router = express.Router();
const keywordMonitorService = require('../services/keywordMonitorService');
const leadScoringEngine = require('../services/leadScoringEngine');
const leadResolutionService = require('../services/leadResolutionService');

// 1. Phân tích nội dung văn bản (Keyword & Intent Detection)
router.post('/analyze', (req, res) => {
  try {
    const { text, industryHint, author, context } = req.body;
    const result = keywordMonitorService.analyzeText({ text, industryHint, author, context });
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 2. Chấm điểm chất lượng Lead (Dynamic Scoring)
router.post('/score', (req, res) => {
  try {
    const result = leadScoringEngine.evaluateLead(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 3. Phân giải danh tính & Nhập Lead (Identity Resolution & Deduplication)
router.post('/resolve', (req, res) => {
  try {
    const result = leadResolutionService.resolveAndIngestLead(req.body);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 4. Lấy cấu hình từ khóa đang giám sát
router.get('/keywords', (req, res) => {
  try {
    res.json({ success: true, data: keywordMonitorService.config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Thống kê tổng quan Lead Intelligence
router.get('/overview', (req, res) => {
  try {
    const leads = leadResolutionService.leads;
    const total = leads.length;
    const hotLeads = leads.filter(l => l.leadTier === 'HOT' || l.leadScore >= 75).length;
    const warmLeads = leads.filter(l => (l.leadTier === 'WARM' || (l.leadScore >= 50 && l.leadScore < 75))).length;
    const coldLeads = leads.filter(l => l.leadTier === 'COLD' || l.leadScore < 50).length;

    const withPhone = leads.filter(l => l.phone && l.phone.length >= 9).length;
    const withEmail = leads.filter(l => l.email && l.email.includes('@')).length;
    const recruitmentCount = leads.filter(l => l.industry !== 'bds').length;
    const bdsCount = leads.filter(l => l.industry === 'bds').length;

    res.json({
      success: true,
      data: {
        total,
        hotLeads,
        warmLeads,
        coldLeads,
        withPhone,
        withEmail,
        recruitmentCount,
        bdsCount,
        phoneRate: total > 0 ? Math.round((withPhone / total) * 100) : 0,
        hotRate: total > 0 ? Math.round((hotLeads / total) * 100) : 0
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
