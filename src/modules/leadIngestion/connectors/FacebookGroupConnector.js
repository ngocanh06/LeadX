/**
 * FacebookGroupConnector.js - Connector kết nối Nhóm Facebook
 * ---------------------------------------------------------------------------
 * Tuân thủ nghiêm ngặt nguyên tắc Production:
 * - KHÔNG bypass login, CAPTCHA hay bảo mật nền tảng.
 * - Chỉ khai thác dữ liệu từ nguồn được cấp phép (Scraper Pipeline nội bộ hoặc Facebook Graph API hợp lệ).
 * - Nếu API hoặc quyền truy cập không hỗ trợ một operation: trả về UNSUPPORTED_SOURCE_OPERATION rõ ràng.
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const LeadSourceConnector = require('./LeadSourceConnector');
const logger = require('../../../core/utils/logger');

class FacebookGroupConnector extends LeadSourceConnector {
  constructor(sourceConfig) {
    super(sourceConfig);
    this.groupUrl = sourceConfig.group_url || '';
    this.groupName = sourceConfig.group_name || sourceConfig.name || '';
    this.accessToken = sourceConfig.access_token || process.env.FB_GRAPH_API_TOKEN || null;
    this.dataSourceMode = sourceConfig.data_source_mode || 'INTERNAL_AUTHORIZED_PIPELINE'; // 'GRAPH_API' | 'INTERNAL_AUTHORIZED_PIPELINE'
    this.localScraperFile = sourceConfig.local_file_path || path.resolve(process.cwd(), 'data/facebook_group_jobs.json');
    this.externalScraperFile = path.resolve(process.cwd(), '../Tuyển Dụng/scraper_data/facebook_group/facebook_group_jobs.json');
  }

  /**
   * Kết nối và xác thực tính sẵn sàng của nguồn
   */
  async connect() {
    try {
      const access = await this.validateAccess();
      if (!access.valid) {
        this.isConnected = false;
        throw new Error(access.error || 'Quyền truy cập nguồn không hợp lệ hoặc thiếu chứng thực.');
      }
      this.isConnected = true;
      return true;
    } catch (err) {
      this.isConnected = false;
      throw err;
    }
  }

  /**
   * Xác thực quyền truy cập nguồn
   */
  async validateAccess() {
    if (this.dataSourceMode === 'GRAPH_API') {
      if (!this.accessToken) {
        return {
          valid: false,
          code: 'UNSUPPORTED_SOURCE_OPERATION',
          error: 'Facebook Graph API yêu cầu Page/User Access Token hợp lệ có quyền groups_access_member_info hoặc public_profile.'
        };
      }
      try {
        const url = `https://graph.facebook.com/v19.0/${this.source.external_id || 'me'}?access_token=${this.accessToken}`;
        const res = await axios.get(url, { timeout: 8000 });
        if (res.data && (res.data.id || res.data.name)) {
          return { valid: true };
        }
      } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        const code = err.response?.status === 403 || err.response?.status === 401 ? 'PERMISSION_DENIED' : 'CONNECTION_ERROR';
        return { valid: false, code, error: `Facebook Graph API từ chối kết nối: ${msg}` };
      }
    }

    // Chế độ Authorized Internal Pipeline
    const files = [this.externalScraperFile, this.localScraperFile];
    let fileFound = false;
    for (const f of files) {
      if (fs.existsSync(f)) {
        fileFound = true;
        break;
      }
    }

    if (fileFound) {
      return { valid: true };
    }

    return {
      valid: false,
      code: 'SOURCE_OFFLINE',
      error: `Không tìm thấy kênh dữ liệu hợp lệ tại ${this.localScraperFile}. Vui lòng kiểm tra tiến trình thu thập dữ liệu nội bộ.`
    };
  }

  /**
   * Lấy danh sách bài đăng từ nguồn (Initial / Incremental Sync)
   */
  async fetchPosts(options = {}) {
    const { since, lastExternalPostId, limit = 50, isInitialSync = false } = options;

    if (this.dataSourceMode === 'GRAPH_API') {
      if (!this.accessToken) {
        return {
          posts: [],
          hasMore: false,
          unsupportedOperation: true,
          error: 'UNSUPPORTED_SOURCE_OPERATION: Facebook API v19+ không cấp quyền đọc Feed của Nhóm Facebook tự do nếu chưa có App Review & phê duyệt quyền Groups API từ Meta.'
        };
      }
      // Graph API Feed Fetch
      try {
        const groupId = this.source.external_id;
        const url = `https://graph.facebook.com/v19.0/${groupId}/feed?limit=${limit}&access_token=${this.accessToken}`;
        const res = await axios.get(url, { timeout: 10000 });
        const items = res.data?.data || [];
        return {
          posts: items.map(p => this._mapGraphPost(p)),
          nextCursor: res.data?.paging?.cursors?.after || null,
          hasMore: Boolean(res.data?.paging?.next)
        };
      } catch (err) {
        logger.error(`[FB Connector] Lỗi fetchPosts từ Graph API: ${err.message}`);
        throw err;
      }
    }

    // Chế độ Authorized Internal Pipeline
    let rawPosts = [];
    const files = [this.externalScraperFile, this.localScraperFile];
    for (const f of files) {
      if (fs.existsSync(f)) {
        try {
          const content = fs.readFileSync(f, 'utf8');
          const parsed = JSON.parse(content);
          if (parsed) {
            const list = parsed.posts || parsed.gold_leads || [];
            if (Array.isArray(list) && list.length > 0) {
              rawPosts = list;
              break;
            }
          }
        } catch (e) {
          logger.warn(`[FB Connector] Lỗi đọc file ${f}: ${e.message}`);
        }
      }
    }

    // Lọc theo Group Name hoặc Group URL nếu có cấu hình cụ thể
    if (this.groupName && this.groupName !== 'Tất cả' && this.groupName !== 'ALL') {
      const gNameLower = this.groupName.toLowerCase();
      rawPosts = rawPosts.filter(p => {
        const postGroup = (p.group_name || p.groupName || '').toLowerCase();
        return postGroup.includes(gNameLower) || gNameLower.includes(postGroup);
      });
    }

    // Xử lý Incremental Sync: chỉ lấy bài mới hơn lastExternalPostId hoặc since
    let filtered = rawPosts;
    if (lastExternalPostId) {
      const idx = filtered.findIndex(p => (p.post_url === lastExternalPostId || p.id === lastExternalPostId || p.postUrl === lastExternalPostId));
      if (idx >= 0) {
        filtered = filtered.slice(0, idx); // Chỉ lấy những bài đứng trước bài cũ nhất
      }
    } else if (since && !isInitialSync) {
      const sinceDate = new Date(since).getTime();
      filtered = filtered.filter(p => {
        const postTime = new Date(p.collected_at || p.collectedAt || 0).getTime();
        return postTime > sinceDate;
      });
    }

    if (limit && filtered.length > limit) {
      filtered = filtered.slice(0, limit);
    }

    return {
      posts: filtered,
      nextCursor: filtered.length > 0 ? (filtered[filtered.length - 1].post_url || filtered[filtered.length - 1].id) : null,
      hasMore: false
    };
  }

  /**
   * Lấy chi tiết bài đăng
   */
  async fetchPostDetail(externalPostId) {
    const { posts } = await this.fetchPosts({ limit: 1000 });
    const found = posts.find(p => p.post_url === externalPostId || p.id === externalPostId || p.postUrl === externalPostId);
    return found || null;
  }

  /**
   * Chuẩn hóa về NormalizedPost Schema
   */
  normalizePost(raw) {
    const externalId = raw.post_url || raw.postUrl || raw.id || `fb_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const content = raw.post_text || raw.originalText || raw.content || '';
    const author = raw.author_name || raw.posterName || 'Thành viên Facebook';
    const group = raw.group_name || raw.groupName || this.groupName || 'Nhóm Facebook';
    const createdAt = raw.collected_at || raw.collectedAt || raw.created_time || new Date().toISOString();

    return {
      source: 'FACEBOOK_GROUP',
      source_id: this.sourceId,
      source_group: group,
      external_post_id: externalId,
      author: {
        name: author,
        url: raw.author_url || raw.authorUrl || '',
        external_id: raw.author_id || raw.authorExternalId || null,
        is_anonymous: Boolean(raw.is_anonymous || author.includes('Ẩn danh'))
      },
      content: content.trim(),
      post_url: raw.post_url || raw.postUrl || '',
      created_at: createdAt,
      media: raw.media || [],
      location: raw.location || raw.street_address || null,
      metadata: {
        job_title_hint: raw.job_title || raw.jobTitle || null,
        salary_hint: raw.salary || null,
        phone_hint: raw.contact_phone || raw.contact || raw.phone || null,
        employer_hint: raw.employer || raw.employer_name || raw.employerName || null,
        lead_tier_hint: raw.lead_tier || null
      }
    };
  }

  /**
   * Lấy metadata của nhóm
   */
  async getSourceMetadata() {
    return {
      source_id: this.sourceId,
      platform: 'FACEBOOK',
      group_name: this.groupName,
      group_url: this.groupUrl,
      mode: this.dataSourceMode,
      status: this.isConnected ? 'CONNECTED' : 'DISCONNECTED'
    };
  }

  _mapGraphPost(post) {
    return {
      id: post.id,
      post_url: `https://www.facebook.com/${post.id}`,
      post_text: post.message || '',
      author_name: post.from?.name || 'Thành viên Facebook',
      author_id: post.from?.id,
      collected_at: post.created_time || new Date().toISOString()
    };
  }
}

module.exports = FacebookGroupConnector;
