/**
 * reviewQueueService.js - Hàng Đợi Kiểm Tra Chất Lượng & Duyệt Thủ Công (Lead Review Queue)
 * -----------------------------------------------------------------------------------------
 * Tuân thủ Section 19 Master Prompt:
 * - Tiếp nhận các Lead có:
 *   + confidence < threshold (ví dụ < 0.6)
 *   + duplicate uncertainty (nghi vấn trùng nhưng chưa đủ chắc chắn)
 *   + company identity uncertainty (tên tương đồng nhưng khác địa chỉ)
 * - Cho phép nhân viên Sales/Manager: Accept, Edit, Merge, Reject
 */
const fs = require('fs');
const path = require('path');
const logger = require('../../../core/utils/logger');
const auditLogger = require('../../../core/services/auditLogger');

class ReviewQueueService {
  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data/review_queue.json');
    this.queue = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.queue = JSON.parse(raw);
        if (!Array.isArray(this.queue)) this.queue = [];
      } else {
        this.queue = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[ReviewQueueService] Lỗi nạp review_queue.json: ${err.message}`);
      this.queue = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.queue, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[ReviewQueueService] Lỗi lưu review_queue.json: ${err.message}`);
    }
  }

  /**
   * Đưa một ứng viên Lead vào hàng đợi kiểm duyệt
   */
  enqueue(candidate, { reason, confidence, potentialDuplicate = null }) {
    const item = {
      id: `rev_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      candidate,
      reason: reason || 'LOW_CONFIDENCE',
      confidence: confidence || candidate.confidence || 0.5,
      status: 'PENDING', // 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'MERGED'
      potential_duplicate: potentialDuplicate ? {
        id: potentialDuplicate.id,
        company: potentialDuplicate.employerName || potentialDuplicate.companyName,
        phone: potentialDuplicate.phone
      } : null,
      created_at: new Date().toISOString(),
      resolved_at: null,
      resolved_by: null
    };

    this.queue.unshift(item);
    this._save();
    logger.info(`[ReviewQueue] Đã chuyển Lead vào hàng đợi duyệt (${item.id}): ${candidate.company_name || candidate.job_title} - Lý do: ${reason}`);
    return item;
  }

  listPending(limit = 50) {
    return this.queue.filter(q => q.status === 'PENDING').slice(0, limit);
  }

  getAll() {
    return this.queue;
  }

  getById(id) {
    return this.queue.find(q => q.id === id) || null;
  }

  resolve(id, { action, resolvedBy = 'Admin', modifiedData = null }) {
    const item = this.getById(id);
    if (!item) throw new Error('Không tìm thấy bản ghi duyệt.');

    item.status = action; // 'ACCEPTED' | 'REJECTED' | 'MERGED'
    item.resolved_at = new Date().toISOString();
    item.resolved_by = resolvedBy;
    if (modifiedData) {
      item.candidate = { ...item.candidate, ...modifiedData };
    }

    this._save();

    auditLogger.log({
      actor: resolvedBy,
      action: `REVIEW_LEAD_${action}`,
      module: 'LEAD_INGESTION',
      target: item.candidate.company_name || item.id,
      status: 'SUCCESS',
      details: { reviewId: id, action }
    });

    return item;
  }

  countPending() {
    return this.queue.filter(q => q.status === 'PENDING').length;
  }
}

module.exports = new ReviewQueueService();
