/**
 * candidateManager.js - Quản lý Ứng Viên & Động cơ Matching Thông minh
 * -----------------------------------------------------------------------------------
 * - Đa nguồn: Form, CSV/Excel Import, Landing Page, Zalo Chatbot, Group Scraper (phụ).
 * - Metadata & Consent: Lưu source_url, thời điểm thu thập, trạng thái consent, xóa dữ liệu khi yêu cầu.
 * - Deduplication & Freshness: Khử trùng lặp qua SĐT/Email/Zalo, tự động gộp/gắn nhãn lưu trữ (>45 ngày).
 * - Scoring-Based Matching: Lọc cứng (khu vực, vị trí) + Điểm mềm (kỹ năng, lương, kinh nghiệm) + Giải thích kết quả.
 * - Human-in-the-Loop: Trạng thái duyệt trước khi gửi outreach.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');

class CandidateManager {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.primaryFile = path.resolve(rootDir, 'data/recruitment/candidates.json');
    this.initFile();
  }

  initFile() {
    try {
      const dir = path.dirname(this.primaryFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(this.primaryFile)) {
        fs.writeFileSync(this.primaryFile, JSON.stringify([], null, 2), 'utf8');
      }
    } catch (err) {
      logger.error('Lỗi khởi tạo candidates.json:', err.message);
    }
  }

  getAllCandidates() {
    try {
      if (fs.existsSync(this.primaryFile)) {
        const raw = fs.readFileSync(this.primaryFile, 'utf8');
        const list = JSON.parse(raw);
        return Array.isArray(list) ? list : [];
      }
    } catch (e) {
      logger.error('Lỗi đọc candidates.json:', e.message);
    }
    return [];
  }

  saveAllCandidates(list) {
    try {
      const payload = JSON.stringify(list, null, 2);
      fs.writeFileSync(this.primaryFile, payload, 'utf8');
      return true;
    } catch (e) {
      logger.error('Lỗi ghi candidates.json:', e.message);
      return false;
    }
  }

  /**
   * Chuẩn hóa số điện thoại VN
   */
  _normalizePhone(phone) {
    if (!phone) return '';
    let digits = String(phone).replace(/\D/g, '');
    if (digits.startsWith('84')) digits = '0' + digits.substring(2);
    return digits;
  }

  /**
   * Thêm hoặc cập nhật một ứng viên (có Deduplication & Consent tracking)
   */
  addCandidate(data) {
    const list = this.getAllCandidates();
    const phoneNorm = this._normalizePhone(data.phone);
    const emailNorm = (data.email || '').trim().toLowerCase();

    // Kiểm tra trùng lặp (Deduplication)
    let existingIndex = -1;
    if (phoneNorm && phoneNorm.length >= 9) {
      existingIndex = list.findIndex(c => this._normalizePhone(c.phone) === phoneNorm);
    }
    if (existingIndex === -1 && emailNorm) {
      existingIndex = list.findIndex(c => (c.email || '').toLowerCase() === emailNorm);
    }

    const now = new Date().toISOString();
    const candidateRecord = {
      id: existingIndex !== -1 ? list[existingIndex].id : 'cand_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      name: (data.name || 'Ứng viên chưa rõ tên').trim(),
      phone: data.phone || '',
      phoneNormalized: phoneNorm,
      email: data.email || '',
      skills: Array.isArray(data.skills) ? data.skills : (data.skills ? String(data.skills).split(',').map(s => s.trim()).filter(Boolean) : []),
      experience_years: parseFloat(data.experience_years) || 0,
      expected_salary: parseFloat(data.expected_salary) || 0, // triệu VNĐ
      location: (data.location || 'Toàn quốc').trim(),
      position_applied: (data.position_applied || 'Nhân viên tổng hợp').trim(),
      source_type: data.source_type || 'form', // form | csv_import | zalo | landing_page | group_scraper
      source_url: data.source_url || '',
      consent_status: data.consent_status !== undefined ? Boolean(data.consent_status) : true,
      collected_at: existingIndex !== -1 ? list[existingIndex].collected_at : now,
      updated_at: now,
      status: 'ACTIVE', // ACTIVE | ARCHIVED
      approval_status: existingIndex !== -1 ? list[existingIndex].approval_status : 'PENDING_REVIEW' // PENDING_REVIEW | APPROVED | REJECTED | OUTREACHED
    };

    // Kiểm tra độ tươi (Freshness check > 45 ngày tự động Archive)
    const collectedDate = new Date(candidateRecord.collected_at);
    const daysOld = (Date.now() - collectedDate.getTime()) / (1000 * 60 * 60 * 24);
    if (daysOld > 45) {
      candidateRecord.status = 'ARCHIVED';
    }

    if (existingIndex !== -1) {
      // Cập nhật thông tin mới nhất giữ nguyên ID và trạng thái duyệt nếu đã duyệt
      list[existingIndex] = { ...list[existingIndex], ...candidateRecord };
    } else {
      list.unshift(candidateRecord);
    }

    this.saveAllCandidates(list);
    return candidateRecord;
  }

  /**
   * Import hàng loạt (CSV/Excel/List)
   */
  importBatch(items, source_type = 'csv_import', source_url = '') {
    let importedCount = 0;
    for (const item of items) {
      try {
        this.addCandidate({
          ...item,
          source_type,
          source_url,
          consent_status: true
        });
        importedCount++;
      } catch (e) {
        logger.warn(`Lỗi import ứng viên: ${e.message}`);
      }
    }
    return { success: true, importedCount };
  }

  /**
   * Xóa dữ liệu hoặc hủy quyền (Right to be forgotten / Data removal request)
   */
  removeCandidate(id) {
    let list = this.getAllCandidates();
    const initialLen = list.length;
    list = list.filter(c => c.id !== id);
    if (list.length < initialLen) {
      this.saveAllCandidates(list);
      return { success: true, message: 'Đã xóa dữ liệu ứng viên thành công' };
    }
    return { success: false, message: 'Không tìm thấy ứng viên' };
  }

  /**
   * Cập nhật trạng thái duyệt (Human-in-the-Loop)
   */
  updateApprovalStatus(id, approvalStatus) {
    const list = this.getAllCandidates();
    const item = list.find(c => c.id === id);
    if (!item) return { success: false, message: 'Không tìm thấy ứng viên' };

    const validStatuses = ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'OUTREACHED'];
    if (!validStatuses.includes(approvalStatus)) {
      return { success: false, message: 'Trạng thái phê duyệt không hợp lệ' };
    }

    item.approval_status = approvalStatus;
    item.updated_at = new Date().toISOString();
    this.saveAllCandidates(list);
    return { success: true, candidate: item };
  }

  /**
   * Động cơ Matching Thông minh (Bộ lọc cứng + Chấm điểm mềm + Giải thích)
   */
  matchCandidatesWithJob(jobData) {
    const candidates = this.getAllCandidates().filter(c => c.status === 'ACTIVE');
    const jobTitle = (jobData.title || jobData.positionName || '').toLowerCase();
    const jobLocation = (jobData.location || '').toLowerCase();
    const jobRequiredSkills = Array.isArray(jobData.skills) ? jobData.skills.map(s => s.toLowerCase()) : [];
    const jobMaxSalary = parseFloat(jobData.maxSalary) || 30; // triệu

    const results = candidates.map(candidate => {
      let score = 0;
      const reasons = [];

      // 1. Kiểm tra bộ lọc cứng (Hard Filters)
      // Khu vực
      const candLocation = (candidate.location || '').toLowerCase();
      const isLocationMatch = !jobLocation || jobLocation.includes('toàn quốc') || candLocation.includes(jobLocation) || jobLocation.includes(candLocation);
      if (!isLocationMatch) {
        reasons.push('Khác khu vực địa lý');
        return { candidate, matchScore: 0, isMatch: false, reasons };
      }
      score += 30; // Điểm nền khu vực

      // Vị trí / Ngành nghề
      const candPos = (candidate.position_applied || '').toLowerCase();
      if (jobTitle && (candPos.includes(jobTitle) || jobTitle.includes(candPos))) {
        score += 30;
        reasons.push('Khớp vị trí ứng tuyển');
      } else {
        reasons.push('Vị trí tương đương');
        score += 15;
      }

      // 2. Chấm điểm mềm (Soft Scoring)
      // Kỹ năng trùng khớp (Skill overlap)
      if (jobRequiredSkills.length > 0 && candidate.skills.length > 0) {
        const candSkills = candidate.skills.map(s => s.toLowerCase());
        const matchedSkills = jobRequiredSkills.filter(js => candSkills.some(cs => cs.includes(js) || js.includes(cs)));
        const skillRatio = matchedSkills.length / jobRequiredSkills.length;
        const skillScore = Math.round(skillRatio * 20);
        score += skillScore;
        if (matchedSkills.length > 0) {
          reasons.push(`Khớp kỹ năng: ${matchedSkills.join(', ')}`);
        }
      } else {
        score += 10;
      }

      // Mức lương kỳ vọng (Salary fit)
      if (candidate.expected_salary > 0 && jobMaxSalary > 0) {
        if (candidate.expected_salary <= jobMaxSalary * 1.1) {
          score += 10;
          reasons.push('Mức lương phù hợp ngân sách');
        } else {
          score += 2;
          reasons.push('Lương kỳ vọng cao hơn ngân sách dự kiến');
        }
      } else {
        score += 5;
      }

      // Kinh nghiệm (Experience fit)
      if (candidate.experience_years >= 1) {
        score += 10;
        reasons.push(`Đã có ${candidate.experience_years} năm kinh nghiệm`);
      }

      const finalScore = Math.min(100, Math.max(0, score));
      return {
        candidate,
        matchScore: finalScore,
        isMatch: finalScore >= 50,
        reasons
      };
    });

    // Sắp xếp theo điểm match giảm dần
    results.sort((a, b) => b.matchScore - a.matchScore);
    return results;
  }
}

module.exports = new CandidateManager();
