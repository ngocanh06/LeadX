/**
 * leadSourceManager.js - Quản Lý Nguồn Dữ Liệu Lead (Lead Sources)
 * ----------------------------------------------------------------
 * Tuân thủ Section 3 & 22 Master Prompt:
 * - Lưu trữ danh sách nguồn tại data/lead_sources.json
 * - Tự động liên kết với kho groups.json sẵn có để giữ tính liên tục
 * - Theo dõi sức khỏe nguồn (Health, Error Count, Last Sync, Posts Collected, Leads Generated)
 */
const fs = require('fs');
const path = require('path');
const logger = require('../../../core/utils/logger');

class LeadSourceManager {
  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data/lead_sources.json');
    this.legacyGroupsPath = path.resolve(process.cwd(), 'data/groups.json');
    this.sources = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.sources = JSON.parse(raw);
        if (!Array.isArray(this.sources)) this.sources = [];
      } else {
        this.sources = [];
        this._seedFromLegacyGroups();
      }
    } catch (err) {
      logger.error(`[LeadSourceManager] Lỗi nạp lead_sources.json: ${err.message}`);
      this.sources = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.sources, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[LeadSourceManager] Lỗi lưu lead_sources.json: ${err.message}`);
    }
  }

  /**
   * Khởi tạo nguồn ban đầu từ các nhóm Facebook hiện có trong data/groups.json
   */
  _seedFromLegacyGroups() {
    let legacyGroups = [];
    if (fs.existsSync(this.legacyGroupsPath)) {
      try {
        legacyGroups = JSON.parse(fs.readFileSync(this.legacyGroupsPath, 'utf8'));
      } catch (e) {}
    }

    if (Array.isArray(legacyGroups) && legacyGroups.length > 0) {
      this.sources = legacyGroups.map((g, idx) => ({
        id: `source_fb_${idx + 1}_${Date.now().toString(36)}`,
        name: g.name || `Nhóm FB Tuyển Dụng ${idx + 1}`,
        type: 'FACEBOOK_GROUP',
        platform: 'FACEBOOK',
        group_name: g.name || '',
        group_url: g.link || '',
        external_id: g.id || `fb_grp_${idx + 1}`,
        status: 'ACTIVE',
        connection_status: 'CONNECTED',
        last_sync_at: null,
        next_sync_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        sync_frequency: 'HOURLY', // 'EVERY_15M' | 'HOURLY' | 'DAILY'
        posts_collected: 0,
        leads_generated: 0,
        avg_lead_score: 0,
        error_count: 0,
        last_error: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }));
    } else {
      // Default initial source
      this.sources = [
        {
          id: `source_fb_default_${Date.now().toString(36)}`,
          name: 'Hội Tuyển Dụng & Tìm Việc Làm Hà Nội / TP.HCM',
          type: 'FACEBOOK_GROUP',
          platform: 'FACEBOOK',
          group_name: 'Hội Tuyển Dụng & Tìm Việc Làm Hà Nội',
          group_url: 'https://www.facebook.com/groups/vieclamhanoi',
          external_id: 'fb_grp_hanoi',
          status: 'ACTIVE',
          connection_status: 'CONNECTED',
          last_sync_at: null,
          next_sync_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          sync_frequency: 'HOURLY',
          posts_collected: 0,
          leads_generated: 0,
          avg_lead_score: 0,
          error_count: 0,
          last_error: null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }
      ];
    }
    this._save();
    logger.info(`[LeadSourceManager] Đã khởi tạo ${this.sources.length} nguồn dữ liệu Lead.`);
  }

  getAll() {
    return this.sources;
  }

  getById(id) {
    return this.sources.find(s => s.id === id) || null;
  }

  addSource(data = {}) {
    if (!data.name && !data.group_name) {
      throw new Error('Tên nguồn dữ liệu không được để trống.');
    }

    const newSource = {
      id: `source_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: (data.name || data.group_name).trim(),
      type: data.type || 'FACEBOOK_GROUP',
      platform: data.platform || 'FACEBOOK',
      group_name: (data.group_name || data.name || '').trim(),
      group_url: (data.group_url || data.link || '').trim(),
      external_id: data.external_id || `ext_${Date.now()}`,
      status: 'ACTIVE',
      connection_status: 'CONNECTED',
      last_sync_at: null,
      next_sync_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      sync_frequency: data.sync_frequency || 'HOURLY',
      posts_collected: 0,
      leads_generated: 0,
      avg_lead_score: 0,
      error_count: 0,
      last_error: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    this.sources.unshift(newSource);
    this._save();
    logger.info(`[LeadSourceManager] Đã thêm nguồn mới: ${newSource.name} (${newSource.id})`);
    return newSource;
  }

  updateSource(id, updates = {}) {
    const source = this.getById(id);
    if (!source) throw new Error('Không tìm thấy nguồn dữ liệu.');

    const allowed = ['name', 'group_name', 'group_url', 'sync_frequency', 'status', 'connection_status'];
    for (const key of allowed) {
      if (updates[key] !== undefined) {
        source[key] = updates[key];
      }
    }
    source.updated_at = new Date().toISOString();
    this._save();
    return source;
  }

  pauseSource(id) {
    return this.updateSource(id, { status: 'PAUSED' });
  }

  resumeSource(id) {
    return this.updateSource(id, { status: 'ACTIVE', connection_status: 'CONNECTED', error_count: 0, last_error: null });
  }

  removeSource(id) {
    const idx = this.sources.findIndex(s => s.id === id);
    if (idx === -1) throw new Error('Không tìm thấy nguồn dữ liệu.');
    const removed = this.sources.splice(idx, 1)[0];
    this._save();
    logger.info(`[LeadSourceManager] Đã xóa nguồn: ${removed.name} (${id})`);
    return removed;
  }

  recordSyncSuccess(id, { postsCount = 0, leadsCount = 0, avgScore = 0 }) {
    const source = this.getById(id);
    if (!source) return;

    source.last_sync_at = new Date().toISOString();
    source.posts_collected = (source.posts_collected || 0) + postsCount;
    source.leads_generated = (source.leads_generated || 0) + leadsCount;
    if (avgScore > 0) {
      source.avg_lead_score = Math.round(
        source.avg_lead_score ? (source.avg_lead_score * 0.7 + avgScore * 0.3) : avgScore
      );
    }
    source.connection_status = 'CONNECTED';
    source.error_count = 0;
    source.last_error = null;
    source.updated_at = new Date().toISOString();
    this._save();
  }

  recordSyncError(id, errorMsg) {
    const source = this.getById(id);
    if (!source) return;

    source.error_count = (source.error_count || 0) + 1;
    source.last_error = errorMsg;
    if (source.error_count >= 3) {
      source.connection_status = 'ERROR';
      source.status = 'ERROR';
    }
    source.updated_at = new Date().toISOString();
    this._save();
    logger.warn(`[LeadSourceManager] Nguồn ${source.name} ghi nhận lỗi (${source.error_count}): ${errorMsg}`);
  }
}

module.exports = new LeadSourceManager();
