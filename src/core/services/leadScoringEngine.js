/**
 * leadScoringEngine.js - Động Cơ Chấm Điểm & Phân Hạng Lead Thông Minh (Dynamic Lead Scoring)
 * Tuân thủ Section 14 Master Prompt:
 * - Chấm điểm chất lượng Lead (0 - 100 điểm) dựa trên dữ liệu thực tế và hành vi.
 * - Minh bạch từng tiêu chí (Score Breakdown) không sinh số ngẫu nhiên.
 * - Phân hạng rõ ràng: HOT (>= 75), WARM (50-74), COLD (< 50).
 * - Đề xuất hành động tiếp theo tối ưu (Next Best Action).
 */
const logger = require('../utils/logger');

class LeadScoringEngine {
  /**
   * Tính toán điểm chất lượng và phân hạng lead
   * @param {Object} leadData
   */
  evaluateLead(leadData = {}) {
    let score = 0;
    const breakdown = [];
    const text = (leadData.originalText || leadData.content || leadData.text || '').toLowerCase();
    const entities = leadData.entities || {};

    // 1. Tiêu chí Số điện thoại (+30 điểm)
    const phone = leadData.phone || entities.phone;
    if (phone && phone.length >= 9) {
      score += 30;
      breakdown.push({ criteria: 'Có Số điện thoại liên hệ xác thực', points: 30, passed: true });
    } else {
      breakdown.push({ criteria: 'Có Số điện thoại liên hệ xác thực', points: 0, passed: false });
    }

    // 2. Tiêu chí Email (+15 điểm)
    const email = leadData.email || entities.email;
    if (email && email.includes('@')) {
      score += 15;
      breakdown.push({ criteria: 'Có Email liên lạc trực tiếp', points: 15, passed: true });
    } else {
      breakdown.push({ criteria: 'Có Email liên lạc trực tiếp', points: 0, passed: false });
    }

    // 3. Tiêu chí Ý định chuyển đổi mạnh (+20 điểm)
    const intent = leadData.intent || 'UNKNOWN';
    const strongIntents = ['JOB_SEEKER', 'EMPLOYER', 'TENANT_SEARCH', 'BUYER'];
    if (strongIntents.includes(intent)) {
      score += 20;
      breakdown.push({ criteria: `Ý định rõ ràng (${intent})`, points: 20, passed: true });
    } else if (intent === 'INQUIRY') {
      score += 10;
      breakdown.push({ criteria: 'Hỏi thăm thông tin (Inquiry)', points: 10, passed: true });
    } else {
      breakdown.push({ criteria: 'Ý định mua/thuê/ứng tuyển rõ ràng', points: 0, passed: false });
    }

    // 4. Tiêu chí Khu vực / Địa điểm (+15 điểm)
    const location = leadData.location || leadData.address || entities.location;
    if (location && location.trim().length > 2) {
      score += 15;
      breakdown.push({ criteria: `Xác định địa bàn/khu vực (${location})`, points: 15, passed: true });
    } else {
      breakdown.push({ criteria: 'Xác định địa bàn/khu vực cụ thể', points: 0, passed: false });
    }

    // 5. Tiêu chí Mức giá / Ngân sách / Lương (+10 điểm)
    const priceOrSalary = leadData.salary || leadData.price || entities.salaryOrPrice;
    if (priceOrSalary) {
      score += 10;
      breakdown.push({ criteria: `Xác định ngân sách/mức lương (${priceOrSalary})`, points: 10, passed: true });
    } else {
      breakdown.push({ criteria: 'Xác định ngân sách/mức lương', points: 0, passed: false });
    }

    // 6. Tiêu chí Nguồn uy tín / Tương tác từ Chiến dịch LeadX (+10 điểm)
    if (leadData.campaignId || leadData.sourceType === 'CAMPAIGN' || leadData.groupUrl) {
      score += 10;
      breakdown.push({ criteria: 'Nguồn từ Chiến dịch hoặc Nhóm mục tiêu LeadX', points: 10, passed: true });
    } else {
      breakdown.push({ criteria: 'Nguồn từ Chiến dịch hoặc Nhóm mục tiêu LeadX', points: 0, passed: false });
    }

    // Giới hạn max 100 điểm
    score = Math.min(100, Math.max(0, score));

    // Xác định Phân Hạng Tier
    let tier = 'COLD';
    let tierLabel = '❄️ Lead Tiềm Năng Thấp (Cold)';
    let color = '#64748B';

    if (score >= 75) {
      tier = 'HOT';
      tierLabel = '🔥 Lead Nóng (Hot - Cần chốt ngay)';
      color = '#EF4444';
    } else if (score >= 50) {
      tier = 'WARM';
      tierLabel = '⚡ Lead Ấm (Warm - Cần tư vấn thêm)';
      color = '#F59E0B';
    }

    // Xác định Hành Động Tiếp Theo Tối Ưu (Next Best Action)
    const nextAction = this._recommendNextAction({
      score,
      tier,
      phone,
      email,
      industry: leadData.industry,
      intent
    });

    return {
      score,
      tier,
      tierLabel,
      color,
      breakdown,
      nextAction,
      evaluatedAt: new Date().toISOString()
    };
  }

  _recommendNextAction({ score, tier, phone, email, industry, intent }) {
    if (phone) {
      return {
        action: 'CALL_NOW',
        label: `Gọi điện trực tiếp qua số ${phone}`,
        urgency: tier === 'HOT' ? 'HIGH' : 'MEDIUM',
        channel: 'PHONE'
      };
    }

    if (tier === 'HOT' || tier === 'WARM') {
      if (industry === 'bds') {
        return {
          action: 'SEND_PROPERTY_PORTFOLIO',
          label: 'Gửi tin nhắn riêng tư vấn giỏ hàng căn hộ phù hợp kèm ảnh thực tế',
          urgency: 'HIGH',
          channel: 'FACEBOOK_MESSENGER'
        };
      } else {
        return {
          action: 'SEND_JOB_DESCRIPTION',
          label: 'Gửi bản mô tả công việc (JD) và hẹn lịch phỏng vấn',
          urgency: 'HIGH',
          channel: 'FACEBOOK_MESSENGER'
        };
      }
    }

    return {
      action: 'NURTURE_ENGAGEMENT',
      label: 'Gửi phản hồi bình luận thân thiện & mời kết bạn/inbox trao đổi thêm',
      urgency: 'LOW',
      channel: 'COMMENT'
    };
  }
}

module.exports = new LeadScoringEngine();
