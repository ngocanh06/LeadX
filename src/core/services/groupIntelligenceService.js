/**
 * groupIntelligenceService.js - Trí Tuệ & Đánh Giá Chất Lượng Hội Nhóm (Group Intelligence Engine)
 * Tuân thủ Section 10 Master Prompt:
 * - Điểm chất lượng Group (Group Score) được tính toán ĐỘNG từ dữ liệu thực tế, KHÔNG hard-code.
 * - Công thức chuẩn hóa:
 *   Group Score = Audience Fit (20đ) + Engagement (20đ) + Posting Success Rate (25đ) + Lead Generation (20đ) + Conversion (15đ)
 * - Tự động đối chiếu với data/post_history.json, data/leads_crm.json, data/customers.json.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');

class GroupIntelligenceService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
  }

  _readJsonFile(relPath, defaultVal = []) {
    try {
      const full = path.resolve(this.rootDir, relPath);
      if (fs.existsSync(full)) {
        return JSON.parse(fs.readFileSync(full, 'utf8')) || defaultVal;
      }
    } catch (e) {
      logger.error(`[GROUP_INTELLIGENCE] Lỗi đọc ${relPath}: ${e.message}`);
    }
    return defaultVal;
  }

  /**
   * Tính toán và làm giàu toàn bộ danh sách nhóm với Group Score động từ dữ liệu thực
   * @param {string} [industry='recruitment'] - 'recruitment' hoặc 'bds' hoặc 'all'
   */
  getAnalyzedGroups({ industry = 'recruitment', search = '', tier = 'ALL', limit = 100, page = 1 } = {}) {
    const rawRecruitmentGroups = this._readJsonFile('data/groups.json', []);
    const rawBdsGroups = this._readJsonFile('data/bds_groups.json', []);
    const postHistory = this._readJsonFile('data/post_history.json', []);
    const leads = this._readJsonFile('data/leads_crm.json', []);
    const customers = this._readJsonFile('data/customers.json', []);

    let groups = [];
    if (industry === 'recruitment' || industry === 'all') {
      groups.push(...rawRecruitmentGroups.map(g => ({ ...g, groupIndustry: 'recruitment' })));
    }
    if (industry === 'bds' || industry === 'all') {
      groups.push(...rawBdsGroups.map(g => ({ ...g, groupIndustry: 'bds' })));
    }

    // 1. Tổng hợp lịch sử đăng bài theo Group URL hoặc Tên nhóm
    const groupPostStats = new Map();
    postHistory.forEach(p => {
      const key = (p.groupUrl || p.groupName || '').trim().toLowerCase();
      if (!key) return;

      if (!groupPostStats.has(key)) {
        groupPostStats.set(key, { total: 0, published: 0, pending: 0, failed: 0, lastPostAt: null });
      }
      const s = groupPostStats.get(key);
      s.total += 1;
      if (p.status === 'PUBLISHED') s.published += 1;
      else if (p.status === 'PENDING') s.pending += 1;
      else if (p.status === 'FAILED') s.failed += 1;

      if (!s.lastPostAt || new Date(p.postedAt) > new Date(s.lastPostAt)) {
        s.lastPostAt = p.postedAt;
      }
    });

    // 2. Tổng hợp Lead thu thập được từ từng Group
    const groupLeadStats = new Map();
    leads.forEach(l => {
      const key = (l.groupUrl || l.groupName || '').trim().toLowerCase();
      if (!key) return;
      groupLeadStats.set(key, (groupLeadStats.get(key) || 0) + 1);
    });

    // 3. Tổng hợp Khách hàng / Chuyển đổi từ từng Group
    const groupCustomerStats = new Map();
    customers.forEach(c => {
      const key = (c.groupName || '').trim().toLowerCase();
      if (!key) return;
      groupCustomerStats.set(key, (groupCustomerStats.get(key) || 0) + 1);
    });

    // 4. Tính toán Group Score cho từng nhóm
    const scoredGroups = groups.map(g => {
      const keyByUrl = (g.url || '').trim().toLowerCase();
      const keyByName = (g.name || '').trim().toLowerCase();

      const pStats = groupPostStats.get(keyByUrl) || groupPostStats.get(keyByName) || { total: 0, published: 0, pending: 0, failed: 0, lastPostAt: null };
      const leadCount = groupLeadStats.get(keyByUrl) || groupLeadStats.get(keyByName) || 0;
      const conversionCount = groupCustomerStats.get(keyByName) || 0;

      // Thành phần 1: Audience Fit (Tối đa 20đ)
      let audienceFitScore = 15;
      const gNameLower = (g.name || '').toLowerCase();
      if (g.groupIndustry === 'recruitment' && (gNameLower.includes('tuyển dụng') || gNameLower.includes('việc làm') || gNameLower.includes('tìm việc'))) {
        audienceFitScore = 20;
      } else if (g.groupIndustry === 'bds' && (gNameLower.includes('bất động sản') || gNameLower.includes('căn hộ') || gNameLower.includes('thuê phòng'))) {
        audienceFitScore = 20;
      }

      // Thành phần 2: Engagement & Quy mô thành viên (Tối đa 20đ)
      const membersNum = parseInt(String(g.members || '0').replace(/\D/g, ''), 10) || 0;
      let engagementScore = 8;
      if (membersNum > 100000) engagementScore = 20;
      else if (membersNum > 50000) engagementScore = 17;
      else if (membersNum > 20000) engagementScore = 14;
      else if (membersNum > 5000) engagementScore = 11;

      // Thành phần 3: Posting Success Rate (Tối đa 25đ)
      let postingSuccessScore = 15; // Mặc định nếu chưa đăng
      if (pStats.total > 0) {
        const successRate = pStats.published / pStats.total;
        postingSuccessScore = Math.round(successRate * 25);
      } else if (g.approvalType === 'DIRECT_POST' || g.approvalType === 'NO_APPROVAL') {
        postingSuccessScore = 22; // Nhóm công khai duyệt ngay
      }

      // Thành phần 4: Lead Generation (Tối đa 20đ)
      let leadGenScore = Math.min(20, leadCount * 4);

      // Thành phần 5: Conversion Rate (Tối đa 15đ)
      let conversionScore = Math.min(15, conversionCount * 5);

      const totalScore = Math.min(100, Math.max(0, audienceFitScore + engagementScore + postingSuccessScore + leadGenScore + conversionScore));

      // Xếp hạng Tier nhóm
      let tierLevel = 'TIÊU_CHUẨN';
      let tierColor = '#2563EB';
      if (totalScore >= 80) {
        tierLevel = 'VIP';
        tierColor = '#16A34A';
      } else if (totalScore >= 65) {
        tierLevel = 'TIÊN_PHONG';
        tierColor = '#0284C7';
      } else if (totalScore < 45) {
        tierLevel = 'CẦN_THEO_DÕI';
        tierColor = '#EA580C';
      }

      return {
        id: g.id || `grp_${Buffer.from(g.url || g.name).toString('base64').substring(0, 10)}`,
        name: g.name,
        url: g.url,
        industry: g.groupIndustry,
        location: g.location || g.province || 'Toàn quốc',
        members: membersNum,
        membersFormatted: membersNum > 0 ? new Intl.NumberFormat('vi-VN').format(membersNum) : (g.members || 'N/A'),
        approvalType: g.approvalType || (g.requiresApproval ? 'ADMIN_APPROVAL' : 'DIRECT_POST'),
        postsCount: pStats.total,
        publishedCount: pStats.published,
        pendingCount: pStats.pending,
        failedCount: pStats.failed,
        lastPostAt: pStats.lastPostAt,
        leadCount,
        conversionCount,
        score: totalScore,
        scoreBreakdown: {
          audienceFit: audienceFitScore,
          engagement: engagementScore,
          postingSuccess: postingSuccessScore,
          leadGeneration: leadGenScore,
          conversion: conversionScore
        },
        tier: tierLevel,
        tierColor,
        recommendation: totalScore >= 75
          ? 'Nhóm trọng điểm: Đẩy mạnh tần suất đăng bài và seeding'
          : (totalScore >= 50 ? 'Nhóm tiềm năng: Tiếp tục duy trì đăng bài định kỳ' : 'Nhóm tương tác thấp: Cân nhắc dãn cách hoặc đổi kịch bản nội dung')
      };
    });

    // Sắp xếp theo Score giảm dần
    scoredGroups.sort((a, b) => b.score - a.score);

    // Lọc theo search & tier
    let filtered = scoredGroups;
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(g => g.name.toLowerCase().includes(q) || g.location.toLowerCase().includes(q) || g.url.toLowerCase().includes(q));
    }

    if (tier && tier !== 'ALL') {
      filtered = filtered.filter(g => g.tier === tier);
    }

    const total = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, parseInt(limit, 10) || 50);
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = filtered.slice(startIndex, startIndex + limitNum);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
      stats: {
        totalGroups: scoredGroups.length,
        vipCount: scoredGroups.filter(g => g.tier === 'VIP').length,
        pioneerCount: scoredGroups.filter(g => g.tier === 'TIÊN_PHONG').length,
        standardCount: scoredGroups.filter(g => g.tier === 'TIÊU_CHUẨN').length,
        warningCount: scoredGroups.filter(g => g.tier === 'CẦN_THEO_DÕI').length,
        avgScore: scoredGroups.length > 0 ? Math.round(scoredGroups.reduce((acc, g) => acc + g.score, 0) / scoredGroups.length) : 0
      },
      data: paginated
    };
  }
}

module.exports = new GroupIntelligenceService();
