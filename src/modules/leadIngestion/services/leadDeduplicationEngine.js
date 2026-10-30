/**
 * leadDeduplicationEngine.js - Chống Trùng Lặp & Phân Giải Doanh Nghiệp (Deduplication & Entity Resolution)
 * ---------------------------------------------------------------------------------------------------------
 * Tuân thủ Section 16 & 17 Master Prompt:
 * - Đối chiếu đa trường: Phone, Email, Author External ID, Normalized Company Name, Content Similarity.
 * - Giải quyết thực thể doanh nghiệp (Company Entity Resolution) theo mức độ tin cậy: HIGH, MEDIUM, LOW.
 * - Nếu confidence là LOW: KHÔNG tự động gộp, đưa sang Review Queue để nhân viên kiểm tra.
 */

class LeadDeduplicationEngine {
  /**
   * Chuẩn hóa tên doanh nghiệp để so khớp thực thể
   * Loại bỏ các từ pháp nhân thông dụng: Công ty, TNHH, CP, Cty, MTV, Logistics, Chi nhánh...
   */
  normalizeCompanyName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/\b(công ty|cty|tnhh|cổ phần|cp|mtv|tập đoàn|group|chi nhánh|holding|jsc)\b/gi, '')
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Tính toán độ tương đồng giữa 2 chuỗi theo Jaccard Token Overlap
   */
  calculateSimilarity(str1, str2) {
    if (!str1 || !str2) return 0;
    const tokens1 = new Set(str1.toLowerCase().split(/\s+/).filter(Boolean));
    const tokens2 = new Set(str2.toLowerCase().split(/\s+/).filter(Boolean));
    if (tokens1.size === 0 || tokens2.size === 0) return 0;

    let intersection = 0;
    for (const t of tokens1) {
      if (tokens2.has(t)) intersection++;
    }
    const union = new Set([...tokens1, ...tokens2]).size;
    return union > 0 ? intersection / union : 0;
  }

  /**
   * Kiểm tra trùng lặp và phân giải thực thể doanh nghiệp đối với danh sách Lead hiện có
   * @param {Object} candidate - LeadCandidate
   * @param {Array<Object>} existingLeads - Danh sách Lead trong hệ thống
   * @returns {Object} { isDuplicate, existingLead, resolutionConfidence, resolutionReason, matchField }
   */
  checkDuplicate(candidate = {}, existingLeads = []) {
    const candidatePhone = candidate.contact_phone;
    const candidateEmail = candidate.contact_email ? candidate.contact_email.toLowerCase() : null;
    const candidateAuthorId = candidate.author_external_id;
    const candidatePostUrl = candidate.source_post_url;
    const normCompany = this.normalizeCompanyName(candidate.company_name);

    for (const lead of existingLeads) {
      // 1. Khớp chính xác Post URL
      if (candidatePostUrl && lead.postUrl && candidatePostUrl === lead.postUrl && candidatePostUrl !== '#') {
        return {
          isDuplicate: true,
          existingLead: lead,
          resolutionConfidence: 'HIGH',
          resolutionReason: 'Trùng khớp chính xác link bài đăng Facebook gốc',
          matchField: 'post_url'
        };
      }

      // 2. Khớp chính xác Số điện thoại (Độ tin cậy cao nhất)
      if (candidatePhone && lead.phone && candidatePhone === lead.phone) {
        return {
          isDuplicate: true,
          existingLead: lead,
          resolutionConfidence: 'HIGH',
          resolutionReason: `Trùng khớp Số điện thoại liên hệ (${candidatePhone})`,
          matchField: 'phone'
        };
      }

      // 3. Khớp chính xác Email
      if (candidateEmail && lead.email && candidateEmail === lead.email.toLowerCase()) {
        return {
          isDuplicate: true,
          existingLead: lead,
          resolutionConfidence: 'HIGH',
          resolutionReason: `Trùng khớp Email liên lạc (${candidateEmail})`,
          matchField: 'email'
        };
      }

      // 4. Khớp External Author ID (cùng 1 người đăng tuyển ở nhiều nhóm)
      if (candidateAuthorId && lead.authorExternalId && candidateAuthorId === lead.authorExternalId) {
        return {
          isDuplicate: true,
          existingLead: lead,
          resolutionConfidence: 'MEDIUM',
          resolutionReason: 'Cùng một người dùng đăng tuyển trên nhiều Hội nhóm',
          matchField: 'author_id'
        };
      }

      // 5. Phân giải thực thể Doanh nghiệp (Company Entity Resolution)
      if (normCompany && normCompany.length >= 4) {
        const leadCompany = this.normalizeCompanyName(lead.employerName || lead.companyName || lead.company || '');
        if (leadCompany && leadCompany.length >= 4) {
          if (normCompany === leadCompany) {
            return {
              isDuplicate: true,
              existingLead: lead,
              resolutionConfidence: 'HIGH',
              resolutionReason: `Trùng tên thực thể doanh nghiệp: "${candidate.company_name}"`,
              matchField: 'company_name'
            };
          }

          // Độ tương đồng chuỗi từ 0.75 trở lên
          const sim = this.calculateSimilarity(normCompany, leadCompany);
          if (sim >= 0.75) {
            return {
              isDuplicate: true,
              existingLead: lead,
              resolutionConfidence: 'MEDIUM',
              resolutionReason: `Tên doanh nghiệp tương tự (${Math.round(sim * 100)}% khớp): "${candidate.company_name}" ~ "${lead.employerName || lead.companyName}"`,
              matchField: 'company_similarity'
            };
          } else if (sim >= 0.5) {
            // Có khả năng trùng nhưng không chắc chắn -> Đưa vào review queue
            return {
              isDuplicate: false,
              potentialDuplicate: lead,
              resolutionConfidence: 'LOW',
              resolutionReason: `Có thể là chi nhánh hoặc cùng thương hiệu (${Math.round(sim * 100)}%): "${candidate.company_name}" ~ "${lead.employerName || lead.companyName}"`,
              matchField: 'company_ambiguity'
            };
          }
        }
      }
    }

    // Không tìm thấy trùng lặp
    return {
      isDuplicate: false,
      existingLead: null,
      resolutionConfidence: 'HIGH',
      resolutionReason: 'Lead hoàn toàn mới',
      matchField: null
    };
  }
}

module.exports = new LeadDeduplicationEngine();
