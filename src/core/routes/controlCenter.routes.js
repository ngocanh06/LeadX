/**
 * controlCenter.routes.js - API Router cho Trung Tâm Điều Khiển Tự Động Hóa (Automation Control Center)
 * Bao gồm:
 * 1. Tổng quan hàng đợi & chỉ số thời gian thực (Realtime Automation Overview)
 * 2. Quản lý Nhóm tài khoản (Account Pools) & Điều phối an toàn Meta
 * 3. Hàng đợi đăng bài tập trung (Unified Posting Queue) & Thao tác hàng loạt
 * 4. Lập lịch thông minh & Dữ liệu Calendar View (Automation Scheduler)
 * 5. Bộ luật tự động hóa (Automation Rule Engine)
 * 6. Nhật ký truy vết hành vi toàn hệ thống (Audit Trail Logs)
 */
const express = require('express');
const router = express.Router();

const accountPoolManager = require('../services/accountPoolManager');
const facebookActionEngine = require('../services/facebookActionEngine');
const postingQueueService = require('../services/postingQueueService');
const automationScheduler = require('../services/automationScheduler');
const ruleEngineService = require('../services/ruleEngineService');
const auditLogger = require('../services/auditLogger');

// ============================================================================
// 1. TỔNG QUAN CONTROL CENTER (AUTOMATION DASHBOARD)
// ============================================================================

router.get('/overview', (req, res) => {
  try {
    const queueStats = postingQueueService.getStats();
    const actionStats = facebookActionEngine.getStats();
    const auditStats = auditLogger.getStats();
    const pools = accountPoolManager.getPools();

    const totalAccountsInPools = pools.reduce((acc, p) => acc + p.totalAccounts, 0);
    const activeAccountsInPools = pools.reduce((acc, p) => acc + p.activeAccountsCount, 0);

    const recentLogs = auditLogger.getLogs({ limit: 15 }).data || [];
    const schedulesList = automationScheduler.getSchedules();
    const rulesList = ruleEngineService.getRules();

    res.json({
      success: true,
      data: {
        queue: {
          total: queueStats.total,
          queued: queueStats.queued,
          scheduled: queueStats.scheduled,
          processing: queueStats.processing,
          success: queueStats.success,
          failed: queueStats.failed,
          retrying: queueStats.retrying,
          isPaused: queueStats.isPaused,
          isWorkerRunning: queueStats.isWorkerRunning,
          successRate: queueStats.successRate
        },
        actions: actionStats,
        accountPools: {
          totalPools: pools.length,
          totalAccounts: totalAccountsInPools,
          activeAccounts: activeAccountsInPools
        },
        accounts: {
          totalAccounts: totalAccountsInPools,
          activeAccounts: activeAccountsInPools,
          recruitmentPoolAccounts: pools.find(p => p.id === 'pool_recruitment')?.totalAccounts || 0,
          bdsPoolAccounts: pools.find(p => p.id === 'pool_bds')?.totalAccounts || 0
        },
        schedules: {
          totalActiveSchedules: schedulesList.filter(s => s.status === 'ACTIVE').length
        },
        rules: {
          totalActiveRules: rulesList.filter(r => r.enabled).length
        },
        audit: {
          totalLogs: auditStats.total,
          successRate: auditStats.successRate
        },
        recentAuditLogs: recentLogs
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 2. ACCOUNT POOLS (QUẢN LÝ NHÓM TÀI KHOẢN)
// ============================================================================

router.get('/pools', (req, res) => {
  try {
    const list = accountPoolManager.getPools();
    res.json({ success: true, total: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/pools', (req, res) => {
  try {
    const newPool = accountPoolManager.createPool(req.body);
    res.json({ success: true, message: 'Đã tạo Account Pool thành công!', data: newPool });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/pools/:id', (req, res) => {
  try {
    const updated = accountPoolManager.updatePool(req.params.id, req.body);
    res.json({ success: true, message: 'Đã cập nhật Account Pool!', data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/pools/:id/assign', (req, res) => {
  try {
    const { accountIds } = req.body;
    const pool = accountPoolManager.assignAccountsToPool(req.params.id, accountIds);
    res.json({ success: true, message: 'Đã gán tài khoản vào Pool thành công!', data: pool });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/pools/:id/remove', (req, res) => {
  try {
    const { accountId } = req.body;
    const pool = accountPoolManager.removeAccountFromPool(req.params.id, accountId);
    res.json({ success: true, message: 'Đã xóa tài khoản khỏi Pool!', data: pool });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/pools/resume-account', (req, res) => {
  try {
    const { accountId } = req.body;
    const acc = accountPoolManager.resumeAccount(accountId);
    res.json({ success: true, message: `Đã mở khóa tài khoản "${acc.name}" thành công!`, data: acc });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 3. UNIFIED POSTING QUEUE (HÀNG ĐỢI ĐĂNG BÀI TẬP TRUNG)
// ============================================================================

router.get('/queue', (req, res) => {
  try {
    const { status, industry, search, page, limit } = req.query;
    const result = postingQueueService.getJobs({ status, industry, search, page, limit });
    const stats = postingQueueService.getStats();
    res.json({ success: true, ...result, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/queue/add', (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      const added = postingQueueService.addBatchJobs(req.body);
      res.json({ success: true, message: `Đã nạp ${added.length} jobs vào hàng đợi!`, data: added });
    } else {
      const job = postingQueueService.addJob(req.body);
      res.json({ success: true, message: 'Đã thêm bài vào hàng đợi thành công!', data: job });
    }
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/queue/:id/retry', (req, res) => {
  try {
    const job = postingQueueService.retryJob(req.params.id);
    res.json({ success: true, message: 'Đã đưa bài vào hàng chờ xử lý lại!', data: job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/queue/:id/cancel', (req, res) => {
  try {
    const job = postingQueueService.cancelJob(req.params.id);
    res.json({ success: true, message: 'Đã hủy job đăng bài thành công!', data: job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/queue/:id/requeue', (req, res) => {
  try {
    const job = postingQueueService.requeueJob(req.params.id);
    res.json({ success: true, message: 'Đã tái xếp hàng job!', data: job });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/queue/pause', (req, res) => {
  try {
    const state = postingQueueService.pauseQueue();
    res.json({ success: true, message: 'Đã tạm dừng toàn bộ hàng đợi đăng bài!', data: state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/queue/resume', (req, res) => {
  try {
    const state = postingQueueService.resumeQueue();
    res.json({ success: true, message: 'Đã khôi phục hoạt động của hàng đợi!', data: state });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/queue/bulk', (req, res) => {
  try {
    const { action, jobIds } = req.body;
    const result = postingQueueService.bulkAction({ action, jobIds });
    res.json({ success: true, message: `Đã thực hiện thao tác "${action}" trên ${result.affectedCount} jobs!`, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.post('/queue/clear-completed', (req, res) => {
  try {
    const result = postingQueueService.clearCompleted();
    res.json({ success: true, message: `Đã dọn dẹp ${result.removedCount} jobs đã hoàn thành hoặc hủy!`, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 4. AUTOMATION SCHEDULER & CALENDAR VIEW
// ============================================================================

router.get('/schedules', (req, res) => {
  try {
    const list = automationScheduler.getSchedules();
    res.json({ success: true, total: list.length, data: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/schedules', (req, res) => {
  try {
    const sch = automationScheduler.createSchedule(req.body);
    res.json({ success: true, message: 'Đã tạo lịch đăng bài tự động!', data: sch });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.delete('/schedules/:id', (req, res) => {
  try {
    automationScheduler.deleteSchedule(req.params.id);
    res.json({ success: true, message: 'Đã xóa lịch trình thành công!' });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.get('/calendar', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const data = automationScheduler.getCalendarData({ startDate, endDate });
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 5. AUTOMATION RULE ENGINE
// ============================================================================

router.get('/rules', (req, res) => {
  try {
    const rules = ruleEngineService.getRules();
    res.json({ success: true, total: rules.length, data: rules });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.patch('/rules/:id/toggle', (req, res) => {
  try {
    const { enabled } = req.body;
    const updated = ruleEngineService.toggleRule(req.params.id, enabled);
    res.json({
      success: true,
      message: `Đã ${updated.enabled ? 'kích hoạt' : 'tắt'} luật "${updated.name}"!`,
      data: updated
    });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

router.put('/rules/:id', (req, res) => {
  try {
    const updated = ruleEngineService.updateRule(req.params.id, req.body);
    res.json({ success: true, message: 'Đã cập nhật luật tự động hóa!', data: updated });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// ============================================================================
// 6. AUDIT LOGS (NHẬT KÝ TRUY VẾT)
// ============================================================================

router.get('/audit-logs', (req, res) => {
  try {
    const { module, status, actor, search, page, limit } = req.query;
    const result = auditLogger.getLogs({ module, status, actor, search, page, limit });
    const stats = auditLogger.getStats();
    res.json({ success: true, ...result, stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/audit-logs/stats', (req, res) => {
  try {
    const stats = auditLogger.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
