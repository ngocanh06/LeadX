/**
 * keywordMonitorService.js - Giám Sát Từ Khóa & Phân Loại Ý Định Thời Gian Thực
 * Tuân thủ Section 14 Master Prompt:
 * - Theo dõi từ khóa đa ngành: Tuyển dụng & Bất động sản
 * - Intent Classification chính xác:
 *   + Tuyển dụng: JOB_SEEKER (ứng viên), EMPLOYER (nhà tuyển dụng), INQUIRY (hỏi thăm)
 *   + BĐS: TENANT_SEARCH (khách thuê), BUYER (khách mua), LANDLORD (chủ nhà), BROKER (môi giới)
 * - Negative keyword filter loại bỏ spam, lừa đảo, cờ bạc, bán sim.
 * - Trích xuất tự động: Số điện thoại, Email, Mức giá/lương, Địa điểm.
 */
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');

const KEYWORD_CONFIG = {
  recruitment: {
    jobSeekerKeywords: [
      'tìm việc', 'xin việc', 'cần việc', 'tìm việc làm', 'cần tìm việc',
      'ứng tuyển', 'gửi cv', 'rải cv', 'nộp hồ sơ', 'part time', 'part-time',
      'full time', 'full-time', 'làm thêm', 'sinh viên tìm việc', 'chưa có kinh nghiệm',
      'tìm việc gấp', 'kiếm việc', 'xin chân', 'nhận việc ngay'
    ],
    employerKeywords: [
      'cần tuyển', 'tuyển dụng', 'tuyển gấp', 'tuyển nhân viên', 'tuyển dụng gấp',
      'tuyển phụ việc', 'tuyển sale', 'tuyển phục vụ', 'tuyển tạp vụ', 'tuyển thu ngân',
      'lương cứng', 'thu nhập từ', 'chế độ đãi ngộ', 'quyền lợi', 'yêu cầu công việc',
      'nộp hồ sơ tại', 'phỏng vấn trực tiếp', 'ib gửi jd', 'gửi cv qua mail'
    ],
    inquiryKeywords: [
      'còn tuyển không', 'còn tuyển ko', 'ib em với', 'inbox em', 'chấm', '.',
      'chi tiết công việc', 'làm ở đâu ạ', 'thời gian thế nào', 'lương bao nhiêu'
    ]
  },
  bds: {
    tenantKeywords: [
      'cần thuê', 'tìm thuê', 'thuê căn hộ', 'thuê phòng', 'tìm phòng trọ',
      'tìm nhà nguyên căn', 'thuê chung cư', 'cần tìm phòng', 'thuê 1pn', 'thuê 2pn',
      'tìm căn 1pn', 'tìm căn 2pn', 'studio cho thuê', 'tài chính dưới', 'tài chính tầm',
      'dọn vào ở ngay', 'tìm phòng khu vực'
    ],
    buyerKeywords: [
      'cần mua', 'tìm mua đất', 'tìm mua nhà', 'mua căn hộ', 'tài chính tỷ',
      'đầu tư bds', 'sổ hồng riêng', 'chính chủ cần mua'
    ],
    landlordKeywords: [
      'chính chủ cho thuê', 'cho thuê căn hộ', 'cho thuê phòng', 'nhà trống vào ở ngay',
      'full nội thất', 'giờ giấc tự do', 'không chung chủ', 'máy giặt riêng',
      'giá thuê chỉ', 'cọc 1 thanh toán', 'miễn trung gian'
    ],
    brokerKeywords: [
      'nhận ký gửi', 'rổ hàng căn hộ', 'chuyên bds', 'hoa hồng', 'liên kết môi giới',
      'hợp tác anh chị em môi giới'
    ]
  },
  negativeKeywords: [
    'vay tiền', 'cho vay nóng', 'hỗ trợ vay', 'bán sim', 'sim số đẹp', 'đánh bạc',
    'tài xỉu', 'cá độ', 'đổi thẻ cào', 'làm nhiệm vụ kiếm tiền', 'app kiếm tiền',
    'hoa hồng 30%', 'pass đồ', 'thanh lý đồ cũ', 'mua bán acc'
  ]
};

class KeywordMonitorService {
  constructor() {
    this.config = KEYWORD_CONFIG;
  }

  /**
   * Phân tích và bóc tách thông tin từ một bài đăng hoặc bình luận
   * @param {Object} input
   * @param {string} input.text - Nội dung bài đăng / bình luận
   * @param {string} input.industryHint - Gợi ý ngành ('recruitment' | 'bds' | 'auto')
   */
  analyzeText({ text = '', industryHint = 'auto', author = null, context = null }) {
    if (!text || typeof text !== 'string') {
      return { isValid: false, reason: 'Nội dung rỗng' };
    }

    const cleanText = text.trim();
    const lowerText = cleanText.toLowerCase();

    // 1. Kiểm tra Negative Keywords (Spam / Lừa đảo / Cho vay)
    const matchedNegative = this.config.negativeKeywords.find(kw => lowerText.includes(kw));
    if (matchedNegative) {
      return {
        isValid: false,
        isSpam: true,
        reason: `Chứa từ khóa tiêu cực / spam: "${matchedNegative}"`,
        confidence: 0
      };
    }

    // 2. Trích xuất Thực thể (Entities: Phone, Email, Price, Location)
    const entities = this._extractEntities(cleanText);

    // 3. Phân định Ngành (Recruitment vs BĐS)
    let industry = industryHint;
    if (industryHint === 'auto') {
      const recMatchCount = this._countMatches(lowerText, [
        ...this.config.recruitment.jobSeekerKeywords,
        ...this.config.recruitment.employerKeywords
      ]);
      const bdsMatchCount = this._countMatches(lowerText, [
        ...this.config.bds.tenantKeywords,
        ...this.config.bds.landlordKeywords,
        ...this.config.bds.buyerKeywords
      ]);

      industry = bdsMatchCount > recMatchCount ? 'bds' : 'recruitment';
    }

    // 4. Phân loại Ý định (Intent Classification)
    let intent = 'UNKNOWN';
    let matchedKeywords = [];
    let confidence = 50;

    if (industry === 'recruitment') {
      const jobSeekerHits = this.config.recruitment.jobSeekerKeywords.filter(kw => lowerText.includes(kw));
      const employerHits = this.config.recruitment.employerKeywords.filter(kw => lowerText.includes(kw));
      const inquiryHits = this.config.recruitment.inquiryKeywords.filter(kw => lowerText.includes(kw));

      if (jobSeekerHits.length > 0 && jobSeekerHits.length >= employerHits.length) {
        intent = 'JOB_SEEKER';
        matchedKeywords = jobSeekerHits;
        confidence = Math.min(95, 60 + jobSeekerHits.length * 10);
      } else if (employerHits.length > 0) {
        intent = 'EMPLOYER';
        matchedKeywords = employerHits;
        confidence = Math.min(95, 60 + employerHits.length * 10);
      } else if (inquiryHits.length > 0) {
        intent = 'INQUIRY';
        matchedKeywords = inquiryHits;
        confidence = 70;
      }
    } else {
      // BĐS
      const tenantHits = this.config.bds.tenantKeywords.filter(kw => lowerText.includes(kw));
      const landlordHits = this.config.bds.landlordKeywords.filter(kw => lowerText.includes(kw));
      const buyerHits = this.config.bds.buyerKeywords.filter(kw => lowerText.includes(kw));
      const brokerHits = this.config.bds.brokerKeywords.filter(kw => lowerText.includes(kw));

      if (tenantHits.length > 0) {
        intent = 'TENANT_SEARCH';
        matchedKeywords = tenantHits;
        confidence = Math.min(95, 60 + tenantHits.length * 10);
      } else if (buyerHits.length > 0) {
        intent = 'BUYER';
        matchedKeywords = buyerHits;
        confidence = Math.min(95, 65 + buyerHits.length * 10);
      } else if (landlordHits.length > 0) {
        intent = 'LANDLORD';
        matchedKeywords = landlordHits;
        confidence = Math.min(95, 60 + landlordHits.length * 10);
      } else if (brokerHits.length > 0) {
        intent = 'BROKER';
        matchedKeywords = brokerHits;
        confidence = 75;
      }
    }

    // Tăng confidence nếu có SĐT hoặc Email thật
    if (entities.phone) confidence = Math.min(100, confidence + 15);
    if (entities.email) confidence = Math.min(100, confidence + 10);

    return {
      isValid: true,
      isSpam: false,
      industry,
      intent,
      confidence,
      matchedKeywords,
      entities,
      author,
      context,
      analyzedAt: new Date().toISOString()
    };
  }

  _countMatches(text, keywords) {
    let count = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) count++;
    }
    return count;
  }

  /**
   * Bóc tách Số điện thoại, Email, Mức giá, Khu vực bằng Regex chính xác
   */
  _extractEntities(text) {
    const result = {
      phone: null,
      email: null,
      salaryOrPrice: null,
      location: null,
      rooms: null
    };

    // SĐT: Hỗ trợ 09x, 03x, 07x, 08x, 05x, O9x, dạng có chấm / cách
    const normalizedPhoneText = text
      .replace(/[oO]/g, (match, offset) => {
        // Thay chữ O/o thành số 0 nếu nằm trong chuỗi số SĐT
        const prev = text[offset - 1];
        const next = text[offset + 1];
        return (/\d/.test(prev) || /\d/.test(next)) ? '0' : match;
      });

    const phoneMatch = normalizedPhoneText.match(/(?:(?:\+|00)84|0)(?:3|5|7|8|9)(?:[.\s]?[0-9]){8}/);
    if (phoneMatch) {
      result.phone = phoneMatch[0].replace(/[.\s]/g, '');
    }

    // Email
    const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) {
      result.email = emailMatch[0].toLowerCase();
    }

    // Mức giá / Mức lương (triệu, tr, k, đ, vnd)
    const priceMatch = text.match(/(\d+(?:[.,]\d+)?)\s*(triệu|tr|tr\/tháng|triệu\/th|k|k\/h|k\/ca|vnd|đ)/i);
    if (priceMatch) {
      result.salaryOrPrice = priceMatch[0];
    }

    // Số phòng BĐS (1pn, 2pn, 3pn, studio)
    const roomMatch = text.match(/(studio|[1-4]\s*(?:pn|phòng ngủ|ngủ))/i);
    if (roomMatch) {
      result.rooms = roomMatch[0].toUpperCase();
    }

    // Địa điểm phổ biến (Đà Nẵng, Sơn Trà, Hải Châu, Cầu Giấy, Hà Nội, HCM...)
    const locations = [
      'Sơn Trà', 'Hải Châu', 'Ngũ Hành Sơn', 'Thanh Khê', 'Liên Chiểu', 'Cẩm Lệ', 'Hòa Vang', 'Đà Nẵng',
      'Cầu Giấy', 'Đống Đa', 'Ba Đình', 'Hai Bà Trưng', 'Hoàng Mai', 'Hà Đông', 'Thanh Xuân', 'Hà Nội',
      'Quận 1', 'Quận 3', 'Quận 7', 'Bình Thạnh', 'Tân Bình', 'Thủ Đức', 'Gò Vấp', 'Hồ Chí Minh', 'TP.HCM'
    ];
    for (const loc of locations) {
      if (text.toLowerCase().includes(loc.toLowerCase())) {
        result.location = loc;
        break;
      }
    }

    return result;
  }
}

module.exports = new KeywordMonitorService();
