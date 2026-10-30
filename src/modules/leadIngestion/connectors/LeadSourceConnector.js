/**
 * LeadSourceConnector.js - Connector Base Interface cho Production Lead Ingestion
 * ---------------------------------------------------------------------------
 * Mọi nguồn dữ liệu (Facebook Group, Website, Form, Email, CSV, API)
 * đều bắt buộc phải kế thừa lớp này và triển khai đầy đủ các phương thức chuẩn.
 */

class LeadSourceConnector {
  /**
   * @param {Object} sourceConfig - Cấu hình nguồn từ lead_sources
   */
  constructor(sourceConfig) {
    if (new.target === LeadSourceConnector) {
      throw new TypeError('Không thể khởi tạo trực tiếp abstract class LeadSourceConnector.');
    }
    this.source = sourceConfig;
    this.sourceId = sourceConfig.id;
    this.platform = sourceConfig.platform || 'generic';
    this.isConnected = false;
  }

  /**
   * Khởi tạo kết nối tới nguồn dữ liệu
   * @returns {Promise<boolean>}
   */
  async connect() {
    throw new Error('connect() phải được implement bởi connector cụ thể.');
  }

  /**
   * Kiểm tra quyền truy cập và tính hợp lệ của kết nối
   * @returns {Promise<{ valid: boolean, error?: string, code?: string }>}
   */
  async validateAccess() {
    throw new Error('validateAccess() phải được implement bởi connector cụ thể.');
  }

  /**
   * Thu thập bài đăng từ nguồn (hỗ trợ phân trang, incremental)
   * @param {Object} options
   * @param {string} [options.since] - ISO Timestamp hoặc cursor bài đăng cũ nhất
   * @param {string} [options.lastExternalPostId] - ID bài đăng cuối đã sync
   * @param {number} [options.limit=50] - Giới hạn số lượng bài mỗi mẻ
   * @param {boolean} [options.isInitialSync=false] - Lần đồng bộ đầu tiên hay định kỳ
   * @returns {Promise<{ posts: Array<Object>, nextCursor?: string, hasMore: boolean }>}
   */
  async fetchPosts(options = {}) {
    throw new Error('fetchPosts() phải được implement bởi connector cụ thể.');
  }

  /**
   * Lấy thông tin chi tiết một bài đăng cụ thể
   * @param {string} externalPostId
   * @returns {Promise<Object|null>}
   */
  async fetchPostDetail(externalPostId) {
    throw new Error('fetchPostDetail() phải được implement bởi connector cụ thể.');
  }

  /**
   * Chuẩn hóa bài đăng từ payload thô về NormalizedPost schema
   * @param {Object} rawPost
   * @returns {Object} NormalizedPost
   */
  normalizePost(rawPost) {
    throw new Error('normalizePost() phải được implement bởi connector cụ thể.');
  }

  /**
   * Lấy siêu dữ liệu về nguồn (Tên nhóm, số thành viên, quyền hạn hiện tại)
   * @returns {Promise<Object>}
   */
  async getSourceMetadata() {
    throw new Error('getSourceMetadata() phải được implement bởi connector cụ thể.');
  }

  /**
   * Ngắt kết nối và giải phóng tài nguyên
   */
  async disconnect() {
    this.isConnected = false;
  }
}

module.exports = LeadSourceConnector;
