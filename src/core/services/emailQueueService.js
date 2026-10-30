/**
 * emailQueueService.js - Hàng Đợi Email Tập Trung & Worker Gửi Thực Tế (Email Queue & State Machine Worker)
 * Tuân thủ Section 6 Master Prompt Auto Email:
 * - State Machine: QUEUED -> SENDING -> SENT / FAILED / RETRYING / CANCELLED.
 * - Hỗ trợ Khóa Chống Trùng (Idempotency Key): Ngăn chặn tuyệt đối việc gửi 2 email giống nhau cho 1 người.
 * - Xử lý gửi thực tế qua Nodemailer, lưu vết messageId, envelope và provider response thật.
 * - Tự động đồng bộ vào CRM Timeline khi email được gửi thành công.
 * - Quản lý tạm dừng, tiếp tục, thử lại và hủy job.
 */
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');
const emailProviderService = require('./emailProviderService');

const EMAIL_STATUSES = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  SENT: 'SENT',
  FAILED: 'FAILED',
  RETRYING: 'RETRYING',
  CANCELLED: 'CANCELLED'
};

class EmailQueueService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/email_queue.json');
    this.leadsFile = path.resolve(this.rootDir, 'data/leads_crm.json');
    this.jobs = [];
    this.isPaused = false;
    this.isWorkerBusy = false;
    this.workerInterval = null;

    this._load();
    this.startWorker();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.jobs = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || [];
        if (!Array.isArray(this.jobs)) this.jobs = [];
      } else {
        this.jobs = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[EMAIL_QUEUE] Lỗi nạp email_queue.json: ${err.message}`);
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
      logger.error(`[EMAIL_QUEUE] Lỗi lưu email_queue.json: ${err.message}`);
    }
  }

  /**
   * Thêm Email vào hàng đợi (Có kiểm tra Idempotency Key)
   */
  addEmailJob({
    providerId,
    to,
    toName,
    subject,
    bodyHtml,
    bodyText,
    category = 'candidate',
    campaignId = null,
    leadId = null,
    scheduledAt = null,
    idempotencyKey = null,
    maxRetries = 3
  }) {
    if (!to || !to.includes('@')) throw new Error('Địa chỉ email người nhận không hợp lệ.');
    if (!subject || !subject.trim()) throw new Error('Tiêu đề email không được để trống.');
    if (!bodyHtml || !bodyHtml.trim()) throw new Error('Nội dung email không được để trống.');

    const cleanTo = to.trim().toLowerCase();

    // 1. Kiểm tra Idempotency Key (Tránh gửi trùng)
    if (idempotencyKey) {
      const duplicate = this.jobs.find(j => 
        j.idempotencyKey === idempotencyKey && 
        (j.status === EMAIL_STATUSES.QUEUED || j.status === EMAIL_STATUSES.SENDING || j.status === EMAIL_STATUSES.SENT)
      );
      if (duplicate) {
        logger.warn(`[EMAIL_QUEUE] Bỏ qua email trùng idempotencyKey: ${idempotencyKey}`);
        return duplicate;
      }
    }

    // Chọn provider mặc định nếu không truyền
    let finalProviderId = providerId;
    if (!finalProviderId) {
      const providers = emailProviderService.providers.filter(p => p.status === 'ACTIVE');
      if (providers.length === 0) {
        throw new Error('Không có hộp thư SMTP nào đang ở trạng thái Hoạt Động (Active).');
      }
      finalProviderId = providers[0].id;
    }

    const now = new Date();
    const scheduledTime = scheduledAt ? new Date(scheduledAt) : now;

    const job = {
      id: `emjob_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      idempotencyKey: idempotencyKey || null,
      providerId: finalProviderId,
      to: cleanTo,
      toName: toName ? toName.trim() : cleanTo,
      subject: subject.trim(),
      bodyHtml: bodyHtml.trim(),
      bodyText: bodyText ? bodyText.trim() : '',
      category,
      campaignId,
      leadId,
      status: EMAIL_STATUSES.QUEUED,
      retryCount: 0,
      maxRetries: Number(maxRetries) || 3,
      error: null,
      deliveryResponse: null,
      scheduledAt: scheduledTime.toISOString(),
      sentAt: null,
      createdAt: now.toISOString()
    };

    this.jobs.unshift(job);
    this._save();

    auditLogger.log({
      actor: 'EmailQueueService',
      action: 'ENQUEUE_EMAIL',
      module: 'EMAIL_ENGINE',
      target: `${job.toName} <${job.to}>`,
      status: 'INFO',
      details: { jobId: job.id, subject: job.subject, category: job.category }
    });

    return job;
  }

  /**
   * Bắt đầu Worker xử lý hàng đợi nền
   */
  startWorker() {
    if (this.workerInterval) return;

    this.workerInterval = setInterval(async () => {
      if (this.isPaused || this.isWorkerBusy) return;
      await this._processNextEmail();
    }, 3500); // 3.5 giây kiểm tra 1 lần
  }

  async _processNextEmail() {
    const now = Date.now();

    // Tìm job sẵn sàng gửi
    const targetJob = this.jobs.find(j => 
      (j.status === EMAIL_STATUSES.QUEUED || j.status === EMAIL_STATUSES.RETRYING) &&
      new Date(j.scheduledAt).getTime() <= now
    );

    if (!targetJob) return;

    this.isWorkerBusy = true;
    targetJob.status = EMAIL_STATUSES.SENDING;
    this._save();

    try {
      // 1. Nạp Transporter cấu hình SMTP từ Provider
      const transportConfig = emailProviderService.getDecryptedTransporterConfig(targetJob.providerId);
      const transporter = nodemailer.createTransport(transportConfig.transportOptions);

      // 2. Gửi thư thực tế qua SMTP
      const mailOptions = {
        from: transportConfig.from,
        to: `"${targetJob.toName}" <${targetJob.to}>`,
        subject: targetJob.subject,
        text: targetJob.bodyText || '',
        html: targetJob.bodyHtml
      };

      const info = await transporter.sendMail(mailOptions);

      // 3. Xử lý phản hồi thành công thực tế
      targetJob.status = EMAIL_STATUSES.SENT;
      targetJob.sentAt = new Date().toISOString();
      targetJob.deliveryResponse = {
        messageId: info.messageId,
        response: info.response,
        accepted: info.accepted,
        rejected: info.rejected
      };
      targetJob.error = null;

      // Cập nhật số lượng đã gửi của Provider
      emailProviderService.recordEmailSent(targetJob.providerId);

      // 4. Đồng bộ vào CRM Timeline nếu có gắn leadId
      if (targetJob.leadId) {
        this._syncToCrmTimeline(targetJob);
      }

      auditLogger.log({
        actor: 'EmailWorker',
        action: 'SEND_EMAIL_SUCCESS',
        module: 'EMAIL_ENGINE',
        target: targetJob.to,
        status: 'SUCCESS',
        details: { jobId: targetJob.id, messageId: info.messageId, subject: targetJob.subject }
      });

    } catch (err) {
      logger.error(`[EMAIL_WORKER] Lỗi gửi email tới ${targetJob.to}: ${err.message}`);
      targetJob.retryCount = (targetJob.retryCount || 0) + 1;
      targetJob.error = err.message;

      if (targetJob.retryCount < targetJob.maxRetries) {
        targetJob.status = EMAIL_STATUSES.RETRYING;
        // Giãn cách thử lại tăng dần (1 phút, 3 phút...)
        const retryDelayMs = targetJob.retryCount * 60 * 1000;
        targetJob.scheduledAt = new Date(Date.now() + retryDelayMs).toISOString();
      } else {
        targetJob.status = EMAIL_STATUSES.FAILED;
      }

      auditLogger.log({
        actor: 'EmailWorker',
        action: 'SEND_EMAIL_FAILED',
        module: 'EMAIL_ENGINE',
        target: targetJob.to,
        status: 'ERROR',
        details: { jobId: targetJob.id, error: err.message, retryCount: targetJob.retryCount }
      });
    } finally {
      this._save();
      this.isWorkerBusy = false;
    }
  }

  /**
   * Đồng bộ email đã gửi vào CRM Interaction Timeline
   */
  _syncToCrmTimeline(job) {
    try {
      if (!fs.existsSync(this.leadsFile)) return;
      const leads = JSON.parse(fs.readFileSync(this.leadsFile, 'utf8')) || [];
      const lead = leads.find(l => l.id === job.leadId);
      if (!lead) return;

      if (!Array.isArray(lead.interactionTimeline)) lead.interactionTimeline = [];
      lead.interactionTimeline.push({
        timestamp: new Date().toISOString(),
        type: 'EMAIL_SENT',
        subject: job.subject,
        to: job.to,
        category: job.category,
        messageId: job.deliveryResponse?.messageId || null
      });

      fs.writeFileSync(this.leadsFile, JSON.stringify(leads, null, 2), 'utf8');
    } catch (err) {
      logger.warn(`[EMAIL_QUEUE] Không thể ghi CRM timeline: ${err.message}`);
    }
  }

  // === QUẢN TRỊ ĐIỀU KHIỂN HÀNG ĐỢI EMAIL ===

  pauseQueue() {
    this.isPaused = true;
    auditLogger.log({ actor: 'User', action: 'PAUSE_EMAIL_QUEUE', module: 'EMAIL_ENGINE', status: 'WARNING' });
    return { isPaused: true };
  }

  resumeQueue() {
    this.isPaused = false;
    auditLogger.log({ actor: 'User', action: 'RESUME_EMAIL_QUEUE', module: 'EMAIL_ENGINE', status: 'SUCCESS' });
    return { isPaused: false };
  }

  retryJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) throw new Error(`Không tìm thấy job ${jobId}`);

    job.status = EMAIL_STATUSES.QUEUED;
    job.scheduledAt = new Date().toISOString();
    job.retryCount = 0;
    job.error = null;
    this._save();

    auditLogger.log({ actor: 'User', action: 'RETRY_EMAIL_JOB', module: 'EMAIL_ENGINE', target: job.to });
    return job;
  }

  cancelJob(jobId) {
    const job = this.jobs.find(j => j.id === jobId);
    if (!job) throw new Error(`Không tìm thấy job ${jobId}`);

    job.status = EMAIL_STATUSES.CANCELLED;
    this._save();

    auditLogger.log({ actor: 'User', action: 'CANCEL_EMAIL_JOB', module: 'EMAIL_ENGINE', target: job.to });
    return job;
  }

  getJobs({ status = 'ALL', category = 'ALL', search = '', limit = 50, page = 1 } = {}) {
    let list = [...this.jobs];

    if (status && status !== 'ALL') {
      list = list.filter(j => j.status === status);
    }
    if (category && category !== 'ALL') {
      list = list.filter(j => j.category === category);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(j => 
        (j.to && j.to.toLowerCase().includes(q)) ||
        (j.toName && j.toName.toLowerCase().includes(q)) ||
        (j.subject && j.subject.toLowerCase().includes(q))
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
      isWorkerBusy: this.isWorkerBusy,
      data: paginated
    };
  }

  getStats() {
    const total = this.jobs.length;
    const queued = this.jobs.filter(j => j.status === EMAIL_STATUSES.QUEUED).length;
    const sending = this.jobs.filter(j => j.status === EMAIL_STATUSES.SENDING).length;
    const sent = this.jobs.filter(j => j.status === EMAIL_STATUSES.SENT).length;
    const failed = this.jobs.filter(j => j.status === EMAIL_STATUSES.FAILED).length;
    const retrying = this.jobs.filter(j => j.status === EMAIL_STATUSES.RETRYING).length;
    const cancelled = this.jobs.filter(j => j.status === EMAIL_STATUSES.CANCELLED).length;

    return {
      total,
      queued,
      sending,
      sent,
      failed,
      retrying,
      cancelled,
      isPaused: this.isPaused,
      isWorkerBusy: this.isWorkerBusy,
      successRate: total > 0 ? Number(((sent / total) * 100).toFixed(1)) : 100
    };
  }
}

module.exports = new EmailQueueService();
