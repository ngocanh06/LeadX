/**
 * postingQueueService.js - Hàng Đợi Đăng Bài Tập Trung & Điều Phối Đa Kênh (Unified Posting Queue)
 * Tuân thủ Section 8 Master Prompt:
 * - Hàng đợi trung tâm cho cả Nhóm Tuyển Dụng, Nhóm BĐS, 34 Fanpage và Chiến dịch đa kênh.
 * - Quản lý trạng thái: DRAFT, SCHEDULED, QUEUED, PROCESSING, SUCCESS, FAILED, RETRYING, CANCELLED.
 * - Hỗ trợ đầy đủ: Retry, Cancel, Pause, Resume, Requeue, Bulk Actions.
 * - Worker chạy nền kiểm soát tốc độ và giãn cách chống Checkpoint.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const facebookActionEngine = require('./facebookActionEngine');
const auditLogger = require('./auditLogger');

const QUEUE_STATUSES = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
  CANCELLED: 'CANCELLED'
};

class PostingQueueService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/posting_queue.json');
    this.jobs = [];
    this.isWorkerRunning = false;
    this.isPaused = false;
    this.workerInterval = null;
    this._load();
    this.startWorker();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.jobs = JSON.parse(raw);
        if (!Array.isArray(this.jobs)) this.jobs = [];
      } else {
        this.jobs = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[POSTING_QUEUE] Lỗi nạp posting_queue.json: ${err.message}`);
      this.jobs = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (this.jobs.length > 5000) {
        this.jobs = this.jobs.slice(0, 5000);
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.jobs, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[POSTING_QUEUE] Lỗi lưu posting_queue.json: ${err.message}`);
    }
  }

  /**
   * Thêm một hoặc nhiều Job đăng bài vào Queue
   */
  addJob({
    content,
    targetType = 'GROUP',
    targetId = '',
    targetName = '',
    targetUrl = '',
    accountId = null,
    accountPoolId = null,
    campaignId = null,
    industry = 'recruitment',
    images = [],
    scheduledAt = null,
    priority = 1,
    maxRetries = 3,
    jobInfo = null
  }) {
    if (!content || !content.trim()) throw new Error('Nội dung bài đăng không được để trống.');

    const now = new Date();
    const scheduledTime = scheduledAt ? new Date(scheduledAt) : null;
    const isFuture = scheduledTime && scheduledTime.getTime() > now.getTime();

    const job = {
      id: `pjob_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      content: content.trim(),
      targetType,
      targetId,
      targetName: targetName || 'Facebook Target',
      targetUrl: targetUrl || '',
      accountId,
      accountPoolId,
      campaignId,
      industry,
      images: Array.isArray(images) ? images : [],
      scheduledAt: scheduledTime ? scheduledTime.toISOString() : null,
      priority: Number(priority) || 1,
      status: isFuture ? QUEUE_STATUSES.SCHEDULED : QUEUE_STATUSES.QUEUED,
      retryCount: 0,
      maxRetries: Number(maxRetries) || 3,
      error: null,
      result: null,
      jobInfo: jobInfo || null,
      createdAt: now.toISOString(),
      startedAt: null,
      completedAt: null
    };

    this.jobs.unshift(job);
    this._save();

    auditLogger.log({
      actor: 'PostingQueue',
      action: isFuture ? 'SCHEDULE_POST' : 'ENQUEUE_POST',
      module: 'POSTING_QUEUE',
      target: job.targetName,
      status: 'INFO',
      details: { jobId: job.id, scheduledAt: job.scheduledAt, priority: job.priority }
    });

    return job;
  }

  /**
   * Thêm hàng loạt Jobs vào Queue
   */
  addBatchJobs(jobsList) {
    if (!Array.isArray(jobsList)) throw new Error('Danh sách jobs phải là một mảng.');
    const added = [];
    for (const item of jobsList) {
      try {
        const j = this.addJob(item);
        added.push(j);
      } catch (err) {
        logger.error(`[POSTING_QUEUE] Lỗi thêm job vào queue: ${err.message}`);
      }
    }
    return added;
  }

  /**
   * Bắt đầu Worker chạy nền xử lý Hàng Đợi
   */
  startWorker() {
    if (this.workerInterval) return;

    this.workerInterval = setInterval(async () => {
      if (this.isPaused || this.isWorkerRunning) return;
      await this._processNextJob();
    }, 4000); // Kiểm tra mỗi 4 giây
  }

  /**
   * Xử lý Job tiếp theo trong hàng đợi
   */
  async _processNextJob() {
    const now = new Date().getTime();

    // 1. Kích hoạt các Job đã đến giờ hẹn từ SCHEDULED sang QUEUED
    this.jobs.forEach(j => {
      if (j.status === QUEUE_STATUSES.SCHEDULED && j.scheduledAt) {
        if (new Date(j.scheduledAt).getTime() <= now) {
          j.status = QUEUE_STATUSES.QUEUED;
        }
      }
    });

    // 2. Tìm Job ưu tiên cao nhất đang QUEUED hoặc RETRYING
    const eligibleJobs = this.jobs.filter(j => 
      j.status === QUEUE_STATUSES.QUEUED || j.status === QUEUE_STATUSES.RETRYING
    );

    if (eligibleJobs.length === 0) return;

    // Sắp xếp theo: priority giảm dần (ưu tiên cao trước), rồi đến createdAt tăng dần (cũ trước)
    eligibleJobs.sort((a, b) => {
      if (b.priority !== a.priority) return b.priority - a.priority;
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const targetJob = eligibleJobs[0];
    this.isWorkerRunning = true;

    try {
      targetJob.status = QUEUE_STATUSES.PROCESSING;
      targetJob.startedAt = new Date().toISOString();
      this._save();

      logger.info(`[POSTING_QUEUE] Đang xử lý Job ${targetJob.id} -> ${targetJob.targetName}`);

      // Chuyển giao sang Facebook Action Engine thực thi
      const action = facebookActionEngine.createAction({
        actionType: 'PUBLISH_POST',
        targetType: targetJob.targetType,
        targetId: targetJob.targetId,
        targetName: targetJob.targetName,
        targetUrl: targetJob.targetUrl,
        accountId: targetJob.accountId,
        accountPoolId: targetJob.accountPoolId,
        campaignId: targetJob.campaignId,
        payload: {
          content: targetJob.content,
          images: targetJob.images,
          jobInfo: targetJob.jobInfo
        },
        priority: targetJob.priority,
        maxRetries: targetJob.maxRetries
      });

      const res = await facebookActionEngine.executeAction(action.actionId);

      if (res && res.success) {
        targetJob.status = QUEUE_STATUSES.SUCCESS;
        targetJob.result = res.data?.result || {};
        targetJob.completedAt = new Date().toISOString();
        targetJob.error = null;
      } else {
        targetJob.retryCount = (targetJob.retryCount || 0) + 1;
        targetJob.error = res?.error || 'Lỗi không xác định khi đăng bài';

        if (targetJob.retryCount < targetJob.maxRetries) {
          targetJob.status = QUEUE_STATUSES.RETRYING;
        } else {
          targetJob.status = QUEUE_STATUSES.FAILED;
          targetJob.completedAt = new Date().toISOString();
        }
      }

      this._save();
    } catch (err) {
      logger.error(`[POSTING_QUEUE] Lỗi bất ngờ khi xử lý job ${targetJob.id}: ${err.message}`);
      targetJob.status = QUEUE_STATUSES.FAILED;
      targetJob.error = err.message;
      targetJob.completedAt = new Date().toISOString();
      this._save();
    } finally {
      this.isWorkerRunning = false;
    }
  }

  // === QUẢN TRỊ ĐIỀU KHIỂN HÀNG ĐỢI ===

  pauseQueue() {
    this.isPaused = true;
    auditLogger.log({ actor: 'User', action: 'PAUSE_POSTING_QUEUE', module: 'POSTING_QUEUE', status: 'WARNING' });
    return { isPaused: true };
  }

  resumeQueue() {
    this.isPaused = false;
    auditLogger.log({ actor: 'User', action: 'RESUME_POSTING_QUEUE', module: 'POSTING_QUEUE', status: 'SUCCESS' });
    return { isPaused: false };
  }

  retryJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Không tìm thấy job.');

    job.status = QUEUE_STATUSES.QUEUED;
    job.error = null;
    job.retryCount = 0;
    job.startedAt = null;
    job.completedAt = null;
    this._save();

    auditLogger.log({ actor: 'User', action: 'RETRY_POST_JOB', module: 'POSTING_QUEUE', target: job.targetName, details: { jobId } });
    return job;
  }

  cancelJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Không tìm thấy job.');

    if (job.status === QUEUE_STATUSES.PROCESSING) {
      throw new Error('Không thể hủy job đang trong tiến trình xử lý trực tiếp.');
    }

    job.status = QUEUE_STATUSES.CANCELLED;
    job.completedAt = new Date().toISOString();
    this._save();

    auditLogger.log({ actor: 'User', action: 'CANCEL_POST_JOB', module: 'POSTING_QUEUE', target: job.targetName, details: { jobId } });
    return job;
  }

  requeueJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) throw new Error('Không tìm thấy job.');

    job.status = QUEUE_STATUSES.QUEUED;
    job.error = null;
    job.retryCount = 0;
    job.createdAt = new Date().toISOString();
    this._save();

    return job;
  }

  /**
   * Thao tác hàng loạt (Bulk Actions)
   */
  bulkAction({ action, jobIds = [] }) {
    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất một job để thao tác.');
    }

    const affected = [];

    for (const id of jobIds) {
      try {
        if (action === 'retry') {
          affected.push(this.retryJob(id));
        } else if (action === 'cancel') {
          affected.push(this.cancelJob(id));
        } else if (action === 'requeue') {
          affected.push(this.requeueJob(id));
        }
      } catch (err) {
        logger.warn(`[POSTING_QUEUE] Bulk ${action} trên ${id} thất bại: ${err.message}`);
      }
    }

    return { action, affectedCount: affected.length, affected };
  }

  clearCompleted() {
    const prevCount = this.jobs.length;
    this.jobs = this.jobs.filter(j => j.status !== QUEUE_STATUSES.SUCCESS && j.status !== QUEUE_STATUSES.CANCELLED);
    this._save();
    return { removedCount: prevCount - this.jobs.length };
  }

  getJobs({ status = 'ALL', industry = 'ALL', campaignId = null, search = '', limit = 50, page = 1 } = {}) {
    let list = [...this.jobs];

    if (campaignId) {
      list = list.filter(j => j.campaignId === campaignId);
    }

    if (status && status !== 'ALL') {
      list = list.filter(j => j.status === status);
    }

    if (industry && industry !== 'ALL') {
      list = list.filter(j => j.industry === industry);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(j => 
        (j.targetName && j.targetName.toLowerCase().includes(q)) ||
        (j.content && j.content.toLowerCase().includes(q)) ||
        (j.error && j.error.toLowerCase().includes(q))
      );
    }

    const total = list.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = list.slice(startIndex, startIndex + limitNum);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      isPaused: this.isPaused,
      isWorkerRunning: this.isWorkerRunning,
      data: paginated
    };
  }

  getQueue({ campaignId = null, status = 'ALL', industry = 'ALL' } = {}) {
    let list = [...this.jobs];
    if (campaignId) {
      list = list.filter(j => j.campaignId === campaignId);
    }
    if (status && status !== 'ALL') {
      list = list.filter(j => j.status === status);
    }
    if (industry && industry !== 'ALL') {
      list = list.filter(j => j.industry === industry);
    }
    return list;
  }

  getStats() {
    const total = this.jobs.length;
    const queued = this.jobs.filter(j => j.status === QUEUE_STATUSES.QUEUED).length;
    const scheduled = this.jobs.filter(j => j.status === QUEUE_STATUSES.SCHEDULED).length;
    const processing = this.jobs.filter(j => j.status === QUEUE_STATUSES.PROCESSING).length;
    const success = this.jobs.filter(j => j.status === QUEUE_STATUSES.SUCCESS).length;
    const failed = this.jobs.filter(j => j.status === QUEUE_STATUSES.FAILED).length;
    const retrying = this.jobs.filter(j => j.status === QUEUE_STATUSES.RETRYING).length;

    return {
      total,
      queued,
      scheduled,
      processing,
      success,
      failed,
      retrying,
      isPaused: this.isPaused,
      isWorkerRunning: this.isWorkerRunning,
      successRate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100
    };
  }
}

module.exports = new PostingQueueService();
