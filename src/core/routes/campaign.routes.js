/**
 * campaign.routes.js - API Định Tuyến Quản Lý Chiến Dịch & Content Studio
 * Section 12 Master Prompt
 */
const express = require('express');
const router = express.Router();
const campaignOrchestrator = require('../services/campaignOrchestrator');
const contentStudioService = require('../services/contentStudioService');
const postingQueueService = require('../services/postingQueueService');

// ==========================================
// 1. CONTENT STUDIO / TEMPLATES ENDPOINTS
// ==========================================

router.get('/templates', (req, res) => {
  try {
    const { category, channelType, search } = req.query;
    const templates = contentStudioService.getTemplates({ category, channelType, search });
    res.json({ success: true, data: templates });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/templates/:id', (req, res) => {
  try {
    const tmpl = contentStudioService.getTemplateById(req.params.id);
    if (!tmpl) return res.status(404).json({ success: false, error: 'Không tìm thấy mẫu nội dung' });
    res.json({ success: true, data: tmpl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/templates', (req, res) => {
  try {
    const newTmpl = contentStudioService.createTemplate(req.body);
    res.status(201).json({ success: true, data: newTmpl });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/templates/:id', (req, res) => {
  try {
    const updated = contentStudioService.updateTemplate(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/templates/:id', (req, res) => {
  try {
    const result = contentStudioService.deleteTemplate(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/templates/preview-variations', (req, res) => {
  try {
    const { baseContent, industry, targetName, location } = req.body;
    const pageVariation = contentStudioService.generateChannelVariations({
      baseContent,
      industry,
      targetType: 'FANPAGE',
      targetName,
      location
    });
    const groupVariation = contentStudioService.generateChannelVariations({
      baseContent,
      industry,
      targetType: 'GROUP',
      targetName,
      location
    });

    res.json({
      success: true,
      data: {
        fanpage: pageVariation,
        group: groupVariation
      }
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. CAMPAIGN MANAGEMENT ENDPOINTS
// ==========================================

router.get('/', (req, res) => {
  try {
    const { industry, status, search, page, limit } = req.query;
    const result = campaignOrchestrator.getCampaigns({ industry, status, search, page, limit });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/:id', (req, res) => {
  try {
    const camp = campaignOrchestrator.getCampaignById(req.params.id);
    if (!camp) return res.status(404).json({ success: false, error: 'Không tìm thấy chiến dịch' });

    // Lấy kèm danh sách queue jobs của chiến dịch
    const jobs = postingQueueService.getQueue({ campaignId: camp.id });
    res.json({ success: true, data: { ...camp, jobs } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/', (req, res) => {
  try {
    const newCamp = campaignOrchestrator.createCampaign(req.body);
    res.status(201).json({ success: true, data: newCamp });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/:id', (req, res) => {
  try {
    const updated = campaignOrchestrator.updateCampaign(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const result = campaignOrchestrator.deleteCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/:id/launch', (req, res) => {
  try {
    const result = campaignOrchestrator.launchCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/:id/pause', (req, res) => {
  try {
    const result = campaignOrchestrator.pauseCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/:id/resume', (req, res) => {
  try {
    const result = campaignOrchestrator.resumeCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/:id/cancel', (req, res) => {
  try {
    const result = campaignOrchestrator.cancelCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
