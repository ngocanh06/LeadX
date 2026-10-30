/**
 * email.routes.js - API Router Cho Module Auto Email Hoàn Chỉnh
 * Phục vụ toàn bộ các chức năng: Overview, Queue, Providers, Templates, Workflows, Campaigns, Automations.
 */
const express = require('express');
const router = express.Router();

const emailProviderService = require('../services/emailProviderService');
const emailTemplateService = require('../services/emailTemplateService');
const emailQueueService = require('../services/emailQueueService');
const emailCampaignService = require('../services/emailCampaignService');
const emailAutomationBuilder = require('../services/emailAutomationBuilder');
const candidateEmailWorkflow = require('../../modules/recruitment/services/candidateEmailWorkflow');
const employerEmailWorkflow = require('../../modules/recruitment/services/employerEmailWorkflow');

// ==========================================
// 1. OVERVIEW & QUEUE
// ==========================================

router.get('/overview', (req, res) => {
  try {
    const queueStats = emailQueueService.getStats();
    const providers = emailProviderService.getProviders();
    const templates = emailTemplateService.getTemplates();
    const campaigns = emailCampaignService.getCampaigns();
    const automations = emailAutomationBuilder.getAutomations();

    const totalDailyLimit = providers.reduce((acc, p) => acc + (p.dailyLimit || 0), 0);
    const totalDailySent = providers.reduce((acc, p) => acc + (p.dailySent || 0), 0);

    res.json({
      success: true,
      data: {
        queue: queueStats,
        providers: {
          total: providers.length,
          activeCount: providers.filter(p => p.status === 'ACTIVE').length,
          totalDailyLimit,
          totalDailySent,
          quotaRemaining: Math.max(0, totalDailyLimit - totalDailySent)
        },
        templatesCount: templates.length,
        campaignsCount: campaigns.length,
        activeAutomationsCount: automations.filter(a => a.enabled).length
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/queue', (req, res) => {
  try {
    const { status, category, search, page, limit } = req.query;
    const result = emailQueueService.getJobs({ status, category, search, page, limit });
    res.json({ success: true, data: result.jobs, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/queue/pause', (req, res) => {
  try {
    const result = emailQueueService.pauseQueue();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/queue/resume', (req, res) => {
  try {
    const result = emailQueueService.resumeQueue();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/queue/:id/retry', (req, res) => {
  try {
    const job = emailQueueService.retryJob(req.params.id);
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/queue/:id/cancel', (req, res) => {
  try {
    const job = emailQueueService.cancelJob(req.params.id);
    res.json({ success: true, data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 2. PROVIDERS & SMTP MANAGEMENT
// ==========================================

router.get('/providers', (req, res) => {
  try {
    const list = emailProviderService.getProviders();
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/providers', (req, res) => {
  try {
    const newProv = emailProviderService.createProvider(req.body);
    res.status(201).json({ success: true, data: newProv });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/providers/:id', (req, res) => {
  try {
    const updated = emailProviderService.updateProvider(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/providers/:id', (req, res) => {
  try {
    const result = emailProviderService.deleteProvider(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/providers/:id/test', async (req, res) => {
  try {
    const result = await emailProviderService.testConnection(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 3. EMAIL TEMPLATES
// ==========================================

router.get('/templates', (req, res) => {
  try {
    const { category, search } = req.query;
    const list = emailTemplateService.getTemplates({ category, search });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/templates/:id', (req, res) => {
  try {
    const tmpl = emailTemplateService.getTemplateById(req.params.id);
    if (!tmpl) return res.status(404).json({ success: false, error: 'Không tìm thấy mẫu email' });
    res.json({ success: true, data: tmpl });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/templates', (req, res) => {
  try {
    const newTmpl = emailTemplateService.createTemplate(req.body);
    res.status(201).json({ success: true, data: newTmpl });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/templates/:id', (req, res) => {
  try {
    const updated = emailTemplateService.updateTemplate(req.params.id, req.body);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/templates/:id', (req, res) => {
  try {
    const result = emailTemplateService.deleteTemplate(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/templates/render-preview', (req, res) => {
  try {
    const { templateId, variables } = req.body;
    const rendered = emailTemplateService.renderTemplate(templateId, variables);
    res.json({ success: true, data: rendered });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. WORKFLOW TRIGGERS
// ==========================================

router.post('/workflow/candidate/ack', (req, res) => {
  try {
    const job = candidateEmailWorkflow.sendAcknowledgement(req.body);
    res.json({ success: true, message: 'Đã đưa thư tiếp nhận vào hàng đợi', data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/workflow/candidate/invite', (req, res) => {
  try {
    const job = candidateEmailWorkflow.sendInterviewInvitation(req.body);
    res.json({ success: true, message: 'Đã đưa thư mời phỏng vấn vào hàng đợi', data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/workflow/candidate/reminder', (req, res) => {
  try {
    const job = candidateEmailWorkflow.sendInterviewReminder(req.body);
    res.json({ success: true, message: 'Đã lên lịch gửi thư nhắc phỏng vấn', data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/workflow/employer/outreach', (req, res) => {
  try {
    const job = employerEmailWorkflow.sendOutreachEmail(req.body);
    res.json({ success: true, message: 'Đã đưa thư tiếp cận doanh nghiệp vào hàng đợi', data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/workflow/employer/quote', (req, res) => {
  try {
    const job = employerEmailWorkflow.sendQuotationEmail(req.body);
    res.json({ success: true, message: 'Đã đưa thư báo giá vào hàng đợi', data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/workflow/bds/quote', (req, res) => {
  try {
    const job = employerEmailWorkflow.sendBdsPropertyQuote(req.body);
    res.json({ success: true, message: 'Đã đưa báo giá căn hộ BĐS vào hàng đợi', data: job });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. EMAIL CAMPAIGNS
// ==========================================

router.get('/campaigns', (req, res) => {
  try {
    const { category, status, search } = req.query;
    const list = emailCampaignService.getCampaigns({ category, status, search });
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get('/campaigns/:id', (req, res) => {
  try {
    const camp = emailCampaignService.getCampaignById(req.params.id);
    if (!camp) return res.status(404).json({ success: false, error: 'Không tìm thấy chiến dịch email' });
    res.json({ success: true, data: camp });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/campaigns', (req, res) => {
  try {
    const newCamp = emailCampaignService.createCampaign(req.body);
    res.status(201).json({ success: true, data: newCamp });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/campaigns/:id/launch', (req, res) => {
  try {
    const result = emailCampaignService.launchCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/campaigns/:id/pause', (req, res) => {
  try {
    const result = emailCampaignService.pauseCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/campaigns/:id/resume', (req, res) => {
  try {
    const result = emailCampaignService.resumeCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.post('/campaigns/:id/cancel', (req, res) => {
  try {
    const result = emailCampaignService.cancelCampaign(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. AUTOMATIONS (DRIP SEQUENCES)
// ==========================================

router.get('/automations', (req, res) => {
  try {
    const list = emailAutomationBuilder.getAutomations(req.query);
    res.json({ success: true, data: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.post('/automations', (req, res) => {
  try {
    const newAuto = emailAutomationBuilder.createAutomation(req.body);
    res.status(201).json({ success: true, data: newAuto });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.put('/automations/:id/toggle', (req, res) => {
  try {
    const updated = emailAutomationBuilder.toggleAutomation(req.params.id, req.body.enabled);
    res.json({ success: true, data: updated });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

router.delete('/automations/:id', (req, res) => {
  try {
    const result = emailAutomationBuilder.deleteAutomation(req.params.id);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
