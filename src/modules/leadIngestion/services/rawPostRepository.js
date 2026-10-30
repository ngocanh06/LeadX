/**
 * rawPostRepository.js - Kho Lưu Trữ Bài Đăng Thô (Raw Post Storage)
 * -------------------------------------------------------------------
 * Tuân thủ Section 8 Master Prompt:
 * - Không đưa raw data trực tiếp vào Lead table
 * - Lưu trữ bài đăng thô tại data/raw_posts.json
 * - Tạo content_hash (SHA-256) chuẩn hóa để chống trùng lặp từ gốc
 * - Tối thiểu hóa dữ liệu cá nhân
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const logger = require('../../../core/utils/logger');

class RawPostRepository {
  constructor() {
    this.filePath = path.resolve(process.cwd(), 'data/raw_posts.json');
    this.posts = [];
    this.hashSet = new Set();
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.posts = JSON.parse(raw);
        if (!Array.isArray(this.posts)) this.posts = [];
        this.posts.forEach(p => {
          if (p.content_hash) this.hashSet.add(p.content_hash);
        });
      } else {
        this.posts = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[RawPostRepository] Lỗi nạp raw_posts.json: ${err.message}`);
      this.posts = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      // Giới hạn lưu tối đa 5000 bài gần nhất để giữ dung lượng nhẹ
      if (this.posts.length > 5000) {
        this.posts = this.posts.slice(0, 5000);
      }
      fs.writeFileSync(this.filePath, JSON.stringify(this.posts, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[RawPostRepository] Lỗi lưu raw_posts.json: ${err.message}`);
    }
  }

  /**
   * Tạo mã hash SHA-256 từ nội dung văn bản chuẩn hóa
   */
  computeContentHash(content) {
    if (!content) return '';
    const normalized = content
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .trim();
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }

  /**
   * Kiểm tra bài đăng đã tồn tại qua hash hoặc external_id
   */
  exists(contentHash, externalPostId) {
    if (contentHash && this.hashSet.has(contentHash)) return true;
    if (externalPostId) {
      return this.posts.some(p => p.external_post_id === externalPostId || p.post_url === externalPostId);
    }
    return false;
  }

  /**
   * Lưu một bài đăng thô mới
   */
  saveRawPost(data = {}) {
    const content = data.content || data.post_text || data.originalText || '';
    const contentHash = data.content_hash || this.computeContentHash(content);
    const externalId = data.external_post_id || data.post_url || `post_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Nếu đã tồn tại
    if (this.exists(contentHash, externalId)) {
      return { isDuplicate: true, post: null };
    }

    const rawRecord = {
      id: `raw_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      source_id: data.source_id || 'UNKNOWN_SOURCE',
      source_group: data.source_group || data.group_name || 'Nhóm Facebook',
      external_post_id: externalId,
      author_external_id: data.author?.external_id || data.author_id || null,
      author_name: data.author?.name || data.author_name || 'Thành viên Facebook',
      post_url: data.post_url || data.postUrl || '',
      content: content.trim(),
      created_at_source: data.created_at || data.collected_at || new Date().toISOString(),
      captured_at: new Date().toISOString(),
      media_metadata: data.media || [],
      raw_payload: data.raw_payload ? JSON.stringify(data.raw_payload).substring(0, 1000) : null,
      content_hash: contentHash
    };

    this.posts.unshift(rawRecord);
    this.hashSet.add(contentHash);
    this._save();

    return { isDuplicate: false, post: rawRecord };
  }

  getRecent(limit = 100) {
    return this.posts.slice(0, limit);
  }

  getById(id) {
    return this.posts.find(p => p.id === id) || null;
  }

  count() {
    return this.posts.length;
  }
}

module.exports = new RawPostRepository();
