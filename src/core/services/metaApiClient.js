/**
 * metaApiClient.js - Client gọi Meta Graph API chính thức cho Fanpage + Rate Limit Interceptor
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const fanpageManager = require('../../modules/recruitment/services/fanpageManager');

class MetaApiClient {
  constructor() {
    this.baseUrl = process.env.META_API_BASE_URL || 'https://graph.facebook.com';
    this.apiVersion = process.env.META_API_VERSION || 'v22.0';
    this.usageThreshold = parseInt(process.env.META_USAGE_THRESHOLD || '80', 10);
    this.lastUsageInfo = {
      callCount: 0,
      totalTime: 0,
      totalCpuTime: 0,
      timestamp: Date.now()
    };
  }

  parseRateLimitHeaders(headers = {}) {
    let callCount = 0;
    let totalCpuTime = 0;
    let totalTime = 0;

    const rawAppUsage = headers['x-app-usage'] || headers['X-App-Usage'];
    if (rawAppUsage) {
      try {
        const parsed = JSON.parse(rawAppUsage);
        callCount = parsed.call_count || 0;
        totalCpuTime = parsed.total_cputime || 0;
        totalTime = parsed.total_time || 0;
      } catch (e) {}
    }

    const isHighUsage = callCount >= this.usageThreshold || totalCpuTime >= this.usageThreshold;
    this.lastUsageInfo = { callCount, totalCpuTime, totalTime, isHighUsage, timestamp: Date.now() };
    return this.lastUsageInfo;
  }

  /**
   * Đăng bài lên Facebook Fanpage
   * @param {string} pageId 
   * @param {string} message 
   * @param {string[]} [mediaUrls] Link ảnh online hoặc đường dẫn
   * @param {string} [tokenOverride]
   */
  async publishToPage(pageId, message, mediaUrls = [], tokenOverride = null) {
    const page = fanpageManager.getPageById(pageId);
    if (!page) {
      throw new Error(`Không tìm thấy Fanpage với ID: ${pageId}`);
    }

    const token = tokenOverride || page.token;
    const targetPageId = page.id || pageId;

    // Nếu không có Token Meta API -> Tự động chuyển tiếp sang Chrome Stealth Browser Automation
    if (!token) {
      logger.info(`[Fanpage] "${page.name}" (${targetPageId}) chưa có Meta Graph API Token. Tự động chuyển sang Trình duyệt Chrome Stealth để đăng bài thực tế...`);
      const fanpagePoster = require('../automation/fanpagePoster');
      const browserRes = await fanpagePoster.postToPage(page, message, mediaUrls);
      if (!browserRes || browserRes.success === false) {
        throw new Error(browserRes?.error || `Trình duyệt Chrome không thể xuất bản lên "${page.name}"`);
      }
      return browserRes;
    }

    let localFilePath = null;
    let onlineUrl = null;
    if (Array.isArray(mediaUrls) && mediaUrls.length > 0 && mediaUrls[0]) {
      const m = String(mediaUrls[0]).trim();
      if (/^https?:\/\//i.test(m)) {
        onlineUrl = m;
      } else {
        const cleanRel = m.replace(/^\/uploads\//, '');
        const candidate = path.resolve(__dirname, '../../../data/images', cleanRel);
        if (fs.existsSync(candidate)) {
          localFilePath = candidate;
        } else if (fs.existsSync(m)) {
          localFilePath = m;
        }
      }
    }

    try {
      let res;
      if (localFilePath) {
        // Chuẩn xuất bản Meta Graph API: Tải ảnh ngầm (published: false) rồi xuất bản lên Bảng tin chính (Feed)
        try {
          const FormData = require('form-data');
          const form = new FormData();
          form.append('access_token', token);
          form.append('published', 'false');
          form.append('source', fs.createReadStream(localFilePath));

          const uploadRes = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/photos`, form, {
            headers: form.getHeaders(),
            timeout: 35000
          });

          const photoId = uploadRes.data?.id;
          if (photoId) {
            // Xuất bản bài viết trực tiếp lên BẢNG TIN / DÒNG THỜI GIAN (Feed) của Fanpage kèm ảnh đính kèm
            res = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/feed`, {
              message,
              attached_media: [{ media_fbid: photoId }],
              access_token: token
            }, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 25000
            });
          } else {
            throw new Error('Không nhận được Photo ID từ Meta');
          }
        } catch (feedErr) {
          logger.warn(`[MetaApiClient] Xuất bản Feed kèm attached_media lỗi: ${feedErr.message}. Thử phương án Photos trực tiếp...`);
          const FormData = require('form-data');
          const form = new FormData();
          form.append('caption', message);
          form.append('access_token', token);
          form.append('source', fs.createReadStream(localFilePath));

          res = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/photos`, form, {
            headers: form.getHeaders(),
            timeout: 35000
          });
        }
      } else if (onlineUrl) {
        try {
          const uploadRes = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/photos`, {
            url: onlineUrl,
            published: false,
            access_token: token
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 25000
          });

          const photoId = uploadRes.data?.id;
          if (photoId) {
            res = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/feed`, {
              message,
              attached_media: [{ media_fbid: photoId }],
              access_token: token
            }, {
              headers: { 'Content-Type': 'application/json' },
              timeout: 25000
            });
          } else {
            throw new Error('Không nhận được Photo ID từ Meta');
          }
        } catch (feedErr) {
          logger.warn(`[MetaApiClient] Xuất bản Feed online lỗi: ${feedErr.message}. Thử phương án Photos trực tiếp...`);
          res = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/photos`, {
            caption: message,
            url: onlineUrl,
            access_token: token
          }, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 25000
          });
        }
      } else {
        res = await axios.post(`${this.baseUrl}/${this.apiVersion}/${targetPageId}/feed`, {
          message,
          access_token: token
        }, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 20000
        });
      }

      const usageInfo = this.parseRateLimitHeaders(res.headers);
      const postId = res.data.post_id || res.data.id || '';
      let postUrl = '';
      if (postId && postId.includes('_')) {
        postUrl = `https://www.facebook.com/${postId.replace('_', '/posts/')}`;
      } else if (postId) {
        postUrl = `https://www.facebook.com/${targetPageId}/posts/${postId}`;
      } else {
        postUrl = page.link || `https://www.facebook.com/${targetPageId}`;
      }

      logger.success(`[FANPAGE POST OK] Đã đăng bài lên "${page.name}" -> Post ID: ${postId}`);

      return {
        success: true,
        pageId: targetPageId,
        pageName: page.name,
        postId,
        postUrl,
        usageInfo
      };
    } catch (err) {
      const status = err.response?.status;
      const fbErr = err.response?.data?.error || {};
      const errMsg = fbErr.message || err.message;
      logger.warn(`[FANPAGE GRAPH API FAILED] Trang "${page.name}" [HTTP ${status}]: ${errMsg}. Đang kích hoạt Fallback qua Trình duyệt Chrome Stealth...`);

      // Tự động chuyển tiếp sang Browser Automation nếu Graph API lỗi
      try {
        const fanpagePoster = require('../automation/fanpagePoster');
        const browserRes = await fanpagePoster.postToPage(page, message, mediaUrls);
        if (!browserRes || browserRes.success === false) {
          throw new Error(browserRes?.error || 'Trình duyệt Chrome không thể xuất bản bài viết lên Fanpage');
        }
        return browserRes;
      } catch (browserErr) {
        logger.error(`[FANPAGE BROWSER FALLBACK FAILED] ${browserErr.message}`);
        throw new Error(`Graph API: ${errMsg} | Browser Fallback: ${browserErr.message}`);
      }
    }
  }

  /**
   * Kiểm tra tính hợp lệ của Token Meta
   */
  async testToken(token) {
    if (!token || token.trim().length < 15) {
      return { success: false, message: 'Token quá ngắn hoặc để trống.' };
    }

    try {
      const res = await axios.get(`${this.baseUrl}/${this.apiVersion}/me`, {
        params: { access_token: token.trim(), fields: 'id,name' },
        timeout: 10000
      });

      // Lấy danh sách pages mà token này quản lý
      let managedPages = [];
      try {
        const pagesRes = await axios.get(`${this.baseUrl}/${this.apiVersion}/me/accounts`, {
          params: { access_token: token.trim(), fields: 'id,name,category,access_token' },
          timeout: 10000
        });
        managedPages = pagesRes.data?.data || [];
      } catch (e) {}

      return {
        success: true,
        valid: true,
        user: res.data,
        data: {
          valid: true,
          name: res.data.name,
          id: res.data.id,
          managedPagesCount: managedPages.length,
          managedPages: managedPages.map(p => ({ id: p.id, name: p.name }))
        },
        managedPagesCount: managedPages.length,
        managedPages: managedPages.map(p => ({ id: p.id, name: p.name })),
        message: `Token hợp lệ! Xác thực thành công tài khoản "${res.data.name}" (${managedPages.length} Page quản lý).`
      };
    } catch (err) {
      const fbErr = err.response?.data?.error || {};
      return {
        success: false,
        valid: false,
        data: { valid: false, reason: fbErr.message || err.message },
        message: `Token không hợp lệ: ${fbErr.message || err.message}`
      };
    }
  }
}

module.exports = new MetaApiClient();
