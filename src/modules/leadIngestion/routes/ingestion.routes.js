/**
 * ingestion.routes.js - REST API Controller cho Pipeline Ingestion & Review Queue
 * --------------------------------------------------------------------------------
 * Tuân thủ Section 21, 24, 29 Master Prompt
 */
const express = require('express');
const router = express.Router();
const leadIngestionPipeline = require('../services/leadIngestionPipeline');
const ingestionJobQueue = require('../services/ingestionJobQueue');
const reviewQueueService = require('../services/reviewQueueService');
const rawPostRepository = require('../services/rawPostRepository');
const leadCrmManager = require('../../../core/services/leadCrmManager');

// 1. Thống kê tổng quan Pipeline thời gian thực (Real Database Stats - KHÔNG DỮ LIỆU GIẢ)
router.get('/stats', (req, res) => {
  try {
    const overview = leadIngestionPipeline.getPipelineOverview();
    res.json({ success: true, data: overview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Kích hoạt đồng bộ tất cả các nguồn (Sync All Sources)
router.post('/sync-all', async (req, res) => {
  try {
    const result = await leadIngestionPipeline.syncAllSources(req.body);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Lấy danh sách Ingestion Jobs
router.get('/jobs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const jobs = ingestionJobQueue.getJobs(limit);
    res.json({ success: true, data: jobs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Lấy danh sách Sync Logs
router.get('/logs', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const logs = ingestionJobQueue.getLogs(limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 5. Lấy danh sách Raw Posts gần nhất
router.get('/raw-posts', (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 50;
    const posts = rawPostRepository.getRecent(limit);
    res.json({ success: true, data: posts, total: rawPostRepository.count() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Lấy hàng đợi duyệt Lead (Review Queue)
router.get('/review-queue', (req, res) => {
  try {
    const pending = reviewQueueService.listPending();
    res.json({ success: true, data: pending, totalPending: reviewQueueService.countPending() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Chấp nhận Lead từ Review Queue (Accept)
router.post('/review-queue/:id/accept', (req, res) => {
  try {
    const item = reviewQueueService.resolve(req.params.id, {
      action: 'ACCEPTED',
      resolvedBy: req.body.resolvedBy || 'Quản trị viên',
      modifiedData: req.body.modifiedData
    });

    // Tạo Lead chính thức trong Lead CRM
    const cand = item.candidate;
    const nowStr = new Date().toISOString();
    const newLead = {
      id: `lead_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
      sourceJobId: cand.source_post_url || '',
      posterName: cand.author_name || 'Nhà tuyển dụng',
      authorUrl: cand.author_url || '',
      groupName: cand.source_group || 'Hội nhóm Facebook',
      groupUrl: '',
      postUrl: cand.source_post_url || '#',
      originalText: cand.original_content || '',
      postedAt: cand.created_at || nowStr,
      phone: cand.contact_phone || 'Chưa có SĐT',
      employerName: cand.company_name || 'Cơ sở tuyển dụng',
      shopName: cand.company_name || 'Cơ sở tuyển dụng',
      address: cand.location || 'Toàn quốc',
      jobTitle: cand.job_title || 'Nhân viên',
      salary: cand.salary_text || 'Thỏa thuận',
      status: 'NEW',
      statusLabel: 'Mới thu thập',
      leadScore: cand.lead_score || 70,
      leadTier: cand.lead_tier || 'WARM',
      leadTierLabel: 'Đã duyệt qua Review Queue',
      assignedStaff: req.body.assignedStaff || 'Quản trị viên',
      activities: [
        {
          id: `act_${Date.now().toString(36)}`,
          timestamp: nowStr,
          user: req.body.resolvedBy || 'Quản trị viên',
          action: 'ACCEPTED_FROM_REVIEW_QUEUE',
          actionName: 'Phê duyệt từ hàng đợi kiểm duyệt',
          notes: `Lead được duyệt thủ công. Điểm: ${cand.lead_score || 70}đ`,
          icon: 'fa-solid fa-check',
          color: '#16A34A'
        }
      ],
      createdAt: nowStr,
      updatedAt: nowStr
    };

    leadCrmManager.leads.unshift(newLead);
    leadCrmManager._save();

    res.json({ success: true, message: 'Đã duyệt và nhập Lead vào CRM thành công!', data: newLead });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

// 8. Từ chối Lead từ Review Queue (Reject)
router.post('/review-queue/:id/reject', (req, res) => {
  try {
    const item = reviewQueueService.resolve(req.params.id, {
      action: 'REJECTED',
      resolvedBy: req.body.resolvedBy || 'Quản trị viên'
    });
    res.json({ success: true, message: 'Đã từ chối ứng viên Lead.', data: item });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

module.exports = router;
