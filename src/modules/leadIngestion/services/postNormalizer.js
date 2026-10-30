/**
 * postNormalizer.js - Chuẩn Hóa Bài Đăng Về Schema Chuẩn (Normalization Engine)
 * ----------------------------------------------------------------------------
 * Tuân thủ Section 9 Master Prompt:
 * - Chuẩn hóa mọi nguồn (Facebook, Website, Form, Email, CSV, API) về một Schema thống nhất: NormalizedPost
 * - Tách biệt tầng thu thập dữ liệu thô khỏi tầng NLP và CRM
 */

class PostNormalizer {
  /**
   * Chuyển đổi dữ liệu bài đăng bất kỳ về NormalizedPost schema
   * @param {Object} raw
   * @param {Object} [sourceMeta]
   * @returns {Object} NormalizedPost
   */
  normalize(raw = {}, sourceMeta = {}) {
    const content = (raw.content || raw.post_text || raw.originalText || raw.text || '').trim();
    const sourceGroup = raw.source_group || raw.group_name || raw.groupName || sourceMeta.group_name || 'Nguồn tuyển dụng';
    const externalId = raw.external_post_id || raw.id || raw.post_url || raw.postUrl || `ext_${Date.now()}`;
    const authorName = (raw.author?.name || raw.author_name || raw.posterName || 'Thành viên Facebook').trim();
    const postUrl = raw.post_url || raw.postUrl || '';

    return {
      source: raw.source || sourceMeta.platform || 'FACEBOOK_GROUP',
      source_id: raw.source_id || sourceMeta.id || null,
      source_group: sourceGroup,
      external_post_id: String(externalId),
      author: {
        name: authorName,
        url: raw.author?.url || raw.author_url || raw.authorUrl || '',
        external_id: raw.author?.external_id || raw.author_external_id || raw.author_id || null,
        is_anonymous: Boolean(raw.author?.is_anonymous || raw.is_anonymous || authorName.toLowerCase().includes('ẩn danh'))
      },
      content: content,
      post_url: postUrl,
      created_at: raw.created_at || raw.collected_at || raw.created_time || new Date().toISOString(),
      media: Array.isArray(raw.media) ? raw.media : [],
      location: raw.location || raw.street_address || raw.address || null,
      metadata: {
        raw_hints: raw.metadata || {},
        original_salary: raw.salary || null,
        original_phone: raw.phone || raw.contact_phone || null,
        original_job_title: raw.job_title || raw.jobTitle || null,
        original_employer: raw.employer || raw.employer_name || raw.employerName || null
      }
    };
  }
}

module.exports = new PostNormalizer();
