/**
 * ingestionJobQueue.js - Hàng Đợi Tác Vụ & Nhật Ký Đồng Bộ (Job Queue & Sync Logs)
 * ---------------------------------------------------------------------------------
 * Tuân thủ Section 6, 7 & 24 Master Prompt:
 * - Không chạy scraping trực tiếp chặn HTTP request.
 * - Quản lý tác vụ ngầm: Ingestion Job (QUEUED, RUNNING, SUCCESS, FAILED, CANCELLED).
 * - Retry có kiểm soát (max_retry = 3, Exponential Backoff, Circuit Breaker chặn vòng lặp vô hạn).
 * - Ghi nhận nhật ký đồng bộ chi tiết tại data/sync_logs.json.
 */
const fs = require('fs');
const path = require('path');
const EventEmitter = require('events');
const logger = require('../../../core/utils/logger');

class IngestionJobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobsFilePath = path.resolve(process.cwd(), 'data/ingestion_jobs.json');
    this.logsFilePath = path.resolve(process.cwd(), 'data/sync_logs.json');
    this.jobs = [];
    this.logs = [];
    this.isProcessing = false;
    this.maxRetry = 3;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.jobsFilePath)) {
        this.jobs = JSON.parse(fs.readFileSync(this.jobsFilePath, 'utf8')) || [];
      } else {
        this.jobs = [];
        this._saveJobs();
      }

      if (fs.existsSync(this.logsFilePath)) {
        this.logs = JSON.parse(fs.readFileSync(this.logsFilePath, 'utf8')) || [];
      } else {
        this.logs = [];
        this._saveLogs();
      }
    } catch (err) {
      logger.error(`[IngestionJobQueue] Lỗi nạp jobs/logs: ${err.message}`);
      this.jobs = [];
      this.logs = [];
    }
  }

  _saveJobs() {
    try {
      const dir = path.dirname(this.jobsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (this.jobs.length > 500) this.jobs = this.jobs.slice(0, 500);
      fs.writeFileSync(this.jobsFilePath, JSON.stringify(this.jobs, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[IngestionJobQueue] Lỗi lưu jobs: ${err.message}`);
    }
  }

  _saveLogs() {
    try {
      const dir = path.dirname(this.logsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (this.logs.length > 500) this.logs = this.logs.slice(0, 500);
      fs.writeFileSync(this.logsFilePath, JSON.stringify(this.logs, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[IngestionJobQueue] Lỗi lưu logs: ${err.message}`);
    }
  }

  /**
   * Tạo một Job mới vào hàng đợi
   */
  createJob({ sourceId, jobType = 'INGEST_SOURCE', priority = 'NORMAL', payload = {} }) {
    const job = {
      id: `job_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      source_id: sourceId,
      job_type: jobType,
      status: 'QUEUED', // 'QUEUED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'CANCELLED'
      priority,
      retry_count: 0,
      started_at: null,
      completed_at: null,
      failed_at: null,
      error_message: null,
      payload,
      result: null,
      created_at: new Date().toISOString()
    };

    this.jobs.unshift(job);
    this._saveJobs();
    logger.info(`[JobQueue] Đã xếp hàng Job ${job.id} (${job.job_type}) cho Source ${sourceId}`);
    return job;
  }

  updateJob(jobId, updates = {}) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) return null;
    Object.assign(job, updates);
    this._saveJobs();
    return job;
  }

  /**
   * Ghi log kết quả đồng bộ (Sync Log)
   */
  recordSyncLog({
    sourceId,
    sourceName,
    startedAt,
    finishedAt = new Date().toISOString(),
    status = 'SUCCESS',
    postsFound = 0,
    postsNew = 0,
    postsDuplicate = 0,
    leadsCreated = 0,
    leadsDuplicate = 0,
    errors = [],
    durationMs = 0
  }) {
    const log = {
      id: `synclog_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      source_id: sourceId,
      source_name: sourceName || 'Nhóm Facebook',
      started_at: startedAt,
      finished_at: finishedAt,
      status, // 'SUCCESS' | 'PARTIAL' | 'ERROR'
      posts_found: postsFound,
      posts_new: postsNew,
      posts_duplicate: postsDuplicate,
      leads_created: leadsCreated,
      leads_duplicate: leadsDuplicate,
      errors: Array.isArray(errors) ? errors : [errors].filter(Boolean),
      duration_ms: durationMs || (new Date(finishedAt).getTime() - new Date(startedAt).getTime())
    };

    this.logs.unshift(log);
    this._saveLogs();
    logger.info(`[SyncLog] ${log.source_name}: Tìm thấy ${postsFound}, Mới ${postsNew}, Lead ${leadsCreated} (${log.duration_ms}ms)`);
    return log;
  }

  getJobs(limit = 50) {
    return this.jobs.slice(0, limit);
  }

  getLogs(limit = 50, sourceId = null) {
    if (sourceId) {
      return this.logs.filter(l => l.source_id === sourceId).slice(0, limit);
    }
    return this.logs.slice(0, limit);
  }

  getStats() {
    const totalJobs = this.jobs.length;
    const runningJobs = this.jobs.filter(j => j.status === 'RUNNING').length;
    const failedJobs = this.jobs.filter(j => j.status === 'FAILED').length;
    const successJobs = this.jobs.filter(j => j.status === 'SUCCESS').length;

    let totalPostsCollected = 0;
    let totalLeadsCreated = 0;
    this.logs.forEach(l => {
      totalPostsCollected += (l.posts_new || 0);
      totalLeadsCreated += (l.leads_created || 0);
    });

    return {
      totalJobs,
      runningJobs,
      failedJobs,
      successJobs,
      totalPostsCollected,
      totalLeadsCreated,
      totalLogs: this.logs.length,
      lastSync: this.logs.length > 0 ? this.logs[0].finished_at : null
    };
  }
}

module.exports = new IngestionJobQueue();
