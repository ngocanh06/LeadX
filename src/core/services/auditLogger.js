/**
 * auditLogger.js - Hệ Thống Ghi Nhận Nhật Ký Truy Vết Chuẩn Enterprise (Audit Trail)
 * Tuân thủ Section 26 Master Prompt:
 * Ghi nhận chính xác: WHO - WHAT - WHERE - WHEN - RESULT - ERROR
 * Lưu trữ bền vững tại data/audit_logs.json
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');

class AuditLogger {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/audit_logs.json');
    this.logs = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.logs = JSON.parse(raw);
        if (!Array.isArray(this.logs)) this.logs = [];
      } else {
        this.logs = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[AUDIT_LOG] Lỗi đọc audit_logs.json: ${err.message}`);
      this.logs = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Giữ tối đa 10,000 bản ghi audit gần nhất để tối ưu dung lượng và tốc độ
      if (this.logs.length > 10000) {
        this.logs = this.logs.slice(0, 10000);
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.logs, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[AUDIT_LOG] Lỗi lưu audit_logs.json: ${err.message}`);
    }
  }

  /**
   * Ghi nhận một hành vi vào audit log
   * @param {Object} entry
   * @param {string} entry.actor - WHO (Người dùng / Tên tiến trình / Automation Engine)
   * @param {string} entry.action - WHAT (Hành động: CREATE_POST, PAUSE_ACCOUNT, RETRY_JOB, v.v.)
   * @param {string} entry.module - WHERE (Module: ACCOUNT_CENTER, POSTING_QUEUE, CRM, CAMPAIGN, v.v.)
   * @param {string} [entry.target] - Đối tượng đích (ID tài khoản, URL nhóm, Tên Fanpage)
   * @param {string} entry.status - RESULT ('SUCCESS' | 'FAILED' | 'WARNING' | 'INFO')
   * @param {Object} [entry.details] - Dữ liệu chi tiết đính kèm
   * @param {string} [entry.error] - Lỗi phát sinh nếu có
   */
  log({ actor = 'System', action, module = 'CORE', target = '', status = 'SUCCESS', details = null, error = null }) {
    const record = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      actor,
      action,
      module,
      target,
      status: ['SUCCESS', 'FAILED', 'WARNING', 'INFO'].includes(status) ? status : 'INFO',
      details: details || {},
      error: error ? String(error) : null
    };

    this.logs.unshift(record);
    this._save();

    const logMsg = `[AUDIT] [${record.status}] ${record.actor} -> ${record.action} (${record.module}) [Target: ${record.target || 'N/A'}]`;
    if (status === 'FAILED') {
      logger.error(`${logMsg} - Lỗi: ${record.error}`);
    } else if (status === 'WARNING') {
      logger.warn(logMsg);
    } else {
      logger.info(logMsg);
    }

    return record;
  }

  /**
   * Truy vấn lịch sử Audit Logs có phân trang, bộ lọc và tìm kiếm
   */
  getLogs({ module = 'ALL', status = 'ALL', actor = 'ALL', search = '', limit = 50, page = 1 } = {}) {
    let result = [...this.logs];

    if (module && module !== 'ALL') {
      result = result.filter(l => l.module.toLowerCase() === module.toLowerCase());
    }

    if (status && status !== 'ALL') {
      result = result.filter(l => l.status.toUpperCase() === status.toUpperCase());
    }

    if (actor && actor !== 'ALL') {
      result = result.filter(l => l.actor.toLowerCase().includes(actor.toLowerCase()));
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(l => 
        (l.action && l.action.toLowerCase().includes(q)) ||
        (l.target && l.target.toLowerCase().includes(q)) ||
        (l.actor && l.actor.toLowerCase().includes(q)) ||
        (l.error && l.error.toLowerCase().includes(q))
      );
    }

    const total = result.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = result.slice(startIndex, startIndex + limitNum);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      data: paginated
    };
  }

  /**
   * Thống kê tổng quan hoạt động
   */
  getStats() {
    const total = this.logs.length;
    const success = this.logs.filter(l => l.status === 'SUCCESS').length;
    const failed = this.logs.filter(l => l.status === 'FAILED').length;
    const warning = this.logs.filter(l => l.status === 'WARNING').length;

    // Đếm theo module
    const byModule = {};
    this.logs.forEach(l => {
      byModule[l.module] = (byModule[l.module] || 0) + 1;
    });

    return {
      total,
      success,
      failed,
      warning,
      successRate: total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100,
      byModule
    };
  }

  clearLogs() {
    this.logs = [];
    this._save();
    return true;
  }
}

module.exports = new AuditLogger();
