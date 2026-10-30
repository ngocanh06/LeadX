/**
 * leadScoringService.js - Hệ Thống Chấm Điểm Lead Minh Bạch (Lead Scoring Engine)
 * --------------------------------------------------------------------------------
 * Tuân thủ Section 14 & 15 Master Prompt:
 * - Thang điểm 0 - 100 điểm, tính toán tại Backend (không hard-code ở Frontend).
 * - Bảng phân tích chi tiết score_breakdown phục vụ giải thích "Vì sao Lead này được X điểm?".
 * - 7 yếu tố cấu thành:
 *   1. Hiring Intent (+25)
 *   2. Recruitment Volume (+20)
 *   3. Contact Available (+15)
 *   4. Company Identified (+15)
 *   5. Location Match (+10)
 *   6. Recent Post (+10)
 *   7. Relevant Industry (+5)
 */

class LeadScoringService {
  /**
   * Tính toán điểm chất lượng và giải trình điểm số cho LeadCandidate
   * @param {Object} candidate - LeadCandidate từ LeadExtractionEngine
   * @returns {Object} { score, tier, score_breakdown, explanation }
   */
  calculateScore(candidate = {}) {
    const breakdown = {
      hiring_intent: 0,
      recruitment_volume: 0,
      contact_available: 0,
      company_identified: 0,
      location_match: 0,
      recency: 0,
      industry_match: 0
    };
    const reasons = [];

    // 1. Hiring Intent (+25 điểm)
    if (candidate.is_recruitment_service_need || candidate.lead_intent === 'RECRUITMENT_SERVICE_NEED') {
      breakdown.hiring_intent = 25;
      reasons.push('Phát hiện tín hiệu cần đơn vị tuyển dụng / dịch vụ cung ứng (+25đ)');
    } else if (candidate.lead_intent === 'HIRING') {
      breakdown.hiring_intent = 20;
      reasons.push('Doanh nghiệp có nhu cầu tuyển dụng thực tế (+20đ)');
    } else {
      breakdown.hiring_intent = 0;
      reasons.push('Chưa rõ ý định tuyển dụng hoặc bài viết chung chung (0đ)');
    }

    // 2. Recruitment Volume (+20 điểm)
    const volume = candidate.recruitment_need;
    if (volume && volume >= 10) {
      breakdown.recruitment_volume = 20;
      reasons.push(`Nhu cầu tuyển số lượng lớn (${volume} chỉ tiêu) (+20đ)`);
    } else if (volume && volume >= 3) {
      breakdown.recruitment_volume = 15;
      reasons.push(`Nhu cầu tuyển nhiều nhân sự (${volume} chỉ tiêu) (+15đ)`);
    } else if (candidate.original_content && /(?:tuyển nhiều|số lượng lớn|tuyển liên tục)/i.test(candidate.original_content)) {
      breakdown.recruitment_volume = 12;
      reasons.push('Có dấu hiệu tuyển số lượng nhiều vị trí (+12đ)');
    } else {
      breakdown.recruitment_volume = 5;
      reasons.push('Tuyển dụng vị trí thông thường (+5đ)');
    }

    // 3. Contact Available (+15 điểm)
    if (candidate.contact_phone && candidate.contact_phone.length >= 9) {
      breakdown.contact_available = 15;
      reasons.push(`Đã có Số điện thoại trực tiếp ${candidate.contact_phone} (+15đ)`);
    } else if (candidate.contact_email) {
      breakdown.contact_available = 8;
      reasons.push(`Đã có Email liên lạc ${candidate.contact_email} (+8đ)`);
    } else {
      breakdown.contact_available = 0;
      reasons.push('Chưa có Số điện thoại hoặc Email liên lạc trực tiếp (0đ)');
    }

    // 4. Company Identified (+15 điểm)
    if (candidate.company_name && candidate.company_name.trim().length > 3) {
      breakdown.company_identified = 15;
      reasons.push(`Đã định danh tên thương hiệu / cơ sở: "${candidate.company_name}" (+15đ)`);
    } else {
      breakdown.company_identified = 0;
      reasons.push('Chưa xác định được pháp nhân / tên công ty cụ thể (0đ)');
    }

    // 5. Location Match (+10 điểm)
    if (candidate.location && candidate.location !== 'Toàn quốc') {
      breakdown.location_match = 10;
      reasons.push(`Địa bàn làm việc rõ ràng (${candidate.location}) (+10đ)`);
    } else {
      breakdown.location_match = 3;
      reasons.push('Địa bàn làm việc chưa cụ thể (+3đ)');
    }

    // 6. Recent Post (+10 điểm)
    const postTime = candidate.created_at ? new Date(candidate.created_at).getTime() : Date.now();
    const hoursAgo = (Date.now() - postTime) / (1000 * 60 * 60);
    if (hoursAgo <= 24) {
      breakdown.recency = 10;
      reasons.push('Bài đăng thu thập trong vòng 24 giờ qua (+10đ)');
    } else if (hoursAgo <= 72) {
      breakdown.recency = 8;
      reasons.push('Bài đăng thu thập trong 3 ngày gần nhất (+8đ)');
    } else if (hoursAgo <= 168) {
      breakdown.recency = 5;
      reasons.push('Bài đăng trong tuần (+5đ)');
    } else {
      breakdown.recency = 2;
      reasons.push('Bài đăng trên 7 ngày (+2đ)');
    }

    // 7. Relevant Industry (+5 điểm)
    if (candidate.industry === 'recruitment' || candidate.industry === 'bds') {
      breakdown.industry_match = 5;
      reasons.push('Ngành nghề trọng tâm của hệ thống LeadX (+5đ)');
    } else {
      breakdown.industry_match = 2;
    }

    // Tổng điểm
    const totalScore = Math.min(100, Math.max(0,
      breakdown.hiring_intent +
      breakdown.recruitment_volume +
      breakdown.contact_available +
      breakdown.company_identified +
      breakdown.location_match +
      breakdown.recency +
      breakdown.industry_match
    ));

    // Xác định Tier
    let tier = 'COLD';
    let tierLabel = 'Low Priority';
    if (totalScore >= 75) {
      tier = 'HOT';
      tierLabel = 'Hot Lead (Ưu tiên tiếp cận ngay)';
    } else if (totalScore >= 50) {
      tier = 'WARM';
      tierLabel = 'Warm Lead (Tiềm năng)';
    }

    return {
      score: totalScore,
      tier,
      tierLabel,
      score_breakdown: breakdown,
      reasons,
      evaluated_at: new Date().toISOString()
    };
  }
}

module.exports = new LeadScoringService();
