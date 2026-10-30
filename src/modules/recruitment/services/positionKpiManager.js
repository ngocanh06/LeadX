/**
 * positionKpiManager.js - Quản lý Mục Tiêu (KPI) Tuyển Dụng & Cơ Chế Tự Động Dừng (Smart Auto-Stop)
 * Cho phép đặt chỉ tiêu CV, trần bài đăng và tự động dừng đăng để bảo toàn tài nguyên & nick Facebook
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');

class PositionKpiManager {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.primaryKpiFile = path.resolve(rootDir, 'data/recruitment/position_kpi.json');
    this.legacyKpiFile = path.resolve(rootDir, 'data/position_kpi.json');
    this.kpiFile = fs.existsSync(this.primaryKpiFile) ? this.primaryKpiFile : this.legacyKpiFile;
    this.initKpiFile();
  }

  initKpiFile() {
    try {
      [this.primaryKpiFile, this.legacyKpiFile].forEach(f => {
        const dir = path.dirname(f);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (!fs.existsSync(f)) {
          fs.writeFileSync(f, JSON.stringify({}, null, 2), 'utf8');
        }
      });
    } catch (err) {
      logger.error('Lỗi khởi tạo position_kpi.json:', err.message);
    }
  }

  getAllKpi() {
    try {
      const target = fs.existsSync(this.primaryKpiFile) ? this.primaryKpiFile : this.legacyKpiFile;
      if (fs.existsSync(target)) {
        const raw = fs.readFileSync(target, 'utf8');
        return JSON.parse(raw) || {};
      }
    } catch (e) {
      logger.error('Lỗi đọc position_kpi.json:', e.message);
    }
    return {};
  }

  saveAllKpi(data) {
    try {
      const payload = JSON.stringify(data, null, 2);
      [this.primaryKpiFile, this.legacyKpiFile].forEach(f => {
        try {
          const dir = path.dirname(f);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(f, payload, 'utf8');
        } catch (_) {}
      });
      return true;
    } catch (e) {
      logger.error('Lỗi lưu position_kpi.json:', e.message);
      return false;
    }
  }

  getKpi(positionName) {
    const all = this.getAllKpi();
    const key = (positionName || 'Chưa phân loại').trim();
    if (all[key]) return all[key];

    // Mặc định tạo mới nếu chưa có
    return {
      positionName: key,
      targetCv: 5,
      receivedCv: 0,
      maxPostsCap: 15,
      autoStopEnabled: true,
      costEstimate: 0,
      notes: ''
    };
  }

  updateKpi(positionName, updates = {}) {
    const key = (positionName || 'Chưa phân loại').trim();
    const all = this.getAllKpi();
    const current = all[key] || {
      positionName: key,
      targetCv: 5,
      receivedCv: 0,
      maxPostsCap: 15,
      autoStopEnabled: true,
      costEstimate: 0,
      notes: ''
    };

    if (updates.targetCv !== undefined) current.targetCv = Math.max(1, parseInt(updates.targetCv, 10) || 5);
    if (updates.receivedCv !== undefined) current.receivedCv = Math.max(0, parseInt(updates.receivedCv, 10) || 0);
    if (updates.maxPostsCap !== undefined) current.maxPostsCap = Math.max(1, parseInt(updates.maxPostsCap, 10) || 15);
    if (updates.autoStopEnabled !== undefined) current.autoStopEnabled = Boolean(updates.autoStopEnabled);
    if (updates.costEstimate !== undefined) current.costEstimate = Math.max(0, parseInt(updates.costEstimate, 10) || 0);
    if (updates.notes !== undefined) current.notes = String(updates.notes);

    current.updatedAt = new Date().toISOString();
    all[key] = current;
    this.saveAllKpi(all);
    return current;
  }

  quickAdjustCv(positionName, delta = 1) {
    const key = (positionName || 'Chưa phân loại').trim();
    const all = this.getAllKpi();
    const current = this.getKpi(key);
    current.receivedCv = Math.max(0, (current.receivedCv || 0) + delta);
    current.updatedAt = new Date().toISOString();
    all[key] = current;
    this.saveAllKpi(all);
    return current;
  }

  /**
   * Kiểm tra xem một vị trí công việc có được phép tiếp tục đăng bài không
   * @param {string} jobTitle - Tiêu đề vị trí
   * @param {number} currentPublishedPosts - Số bài đã lên trực tiếp/duyệt
   * @returns {{ canPost: boolean, reason: string, message: string }}
   */
  checkCanPost(jobTitle, currentPublishedPosts = 0) {
    const key = (jobTitle || '').trim();
    const kpi = this.getKpi(key);

    if (!kpi.autoStopEnabled) {
      return { canPost: true, reason: 'AUTO_STOP_DISABLED', message: 'Tự động dừng đang tắt.', kpi };
    }

    // 1. Kiểm tra nếu đã đủ số lượng CV mục tiêu
    if (kpi.receivedCv >= kpi.targetCv) {
      return {
        canPost: false,
        reason: 'TARGET_MET',
        message: `[KPI ĐẠT] Vị trí "${key}" đã đạt đủ chỉ tiêu (${kpi.receivedCv}/${kpi.targetCv} CV). Hệ thống tự động dừng đăng để tiết kiệm lượt đăng!`,
        kpi
      };
    }

    // 2. Kiểm tra nếu đã chạm giới hạn số bài đăng tối đa (Cap)
    if (currentPublishedPosts >= kpi.maxPostsCap) {
      return {
        canPost: false,
        reason: 'MAX_POSTS_REACHED',
        message: `[CHẠM TRẦN BÀI] Vị trí "${key}" đã đăng ${currentPublishedPosts}/${kpi.maxPostsCap} bài. Tự động dừng để tránh spam và bão hòa bài viết!`,
        kpi
      };
    }

    return { canPost: true, reason: 'ELIGIBLE', message: 'Hợp lệ để đăng bài.', kpi };
  }
}

module.exports = new PositionKpiManager();
