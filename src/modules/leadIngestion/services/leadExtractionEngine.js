/**
 * leadExtractionEngine.js - Động Cơ Bóc Tách Lead Thông Minh (NLP & Extraction Engine)
 * -----------------------------------------------------------------------------------
 * Tuân thủ Section 10, 11, 12, 13 Master Prompt:
 * - QUY TẮC BẮT BUỘC: KHÔNG TỰ BỊA COMPANY NAME. Chỉ trích xuất khi có tiền tố/tên rõ trong bài. Nếu không có: company_name = null.
 * - Phân loại Intent chuẩn xác: HIRING, RECRUITMENT_SERVICE_NEED, JOB_SEEKER, ADVERTISEMENT, IRRELEVANT, UNKNOWN.
 * - Phát hiện tín hiệu RECRUITMENT_SERVICE_NEED (cần tuyển sll, cần agency, cần hỗ trợ tuyển dụng...).
 * - Bóc tách: SĐT (chuẩn hóa), Email, Mức lương (Min/Max), Vị trí, Địa điểm, Số lượng tuyển.
 */

// Regex số điện thoại di động Việt Nam (hỗ trợ dấu cách, dấu chấm, +84, thay thế chữ O/o)
function extractVietnamesePhone(text) {
  if (!text) return null;
  const normalized = String(text).replace(/(?<=\b|[^\d\w])[oO](?=[35789]\d)/g, '0');
  const pattern = /(?:(?:\+84|84|0)[35789]|02\d)[\.\-\s]?\d{2,4}[\.\-\s]?\d{2,4}[\.\-\s]?\d{2,4}\b/g;
  const matches = normalized.match(pattern);
  if (matches) {
    for (const m of matches) {
      let digits = m.replace(/\D/g, '');
      if (digits.startsWith('84')) digits = '0' + digits.substring(2);
      if (digits.length === 10 && digits.startsWith('0')) return digits;
      if (digits.length === 11 && digits.startsWith('02')) return digits;
    }
  }
  return null;
}

// Regex Email
function extractEmail(text) {
  if (!text) return null;
  const match = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return match ? match[0].toLowerCase() : null;
}

// Bóc tách tên công ty / cơ sở kinh doanh KHÔNG BỊA
function extractCompanyName(text, authorName = '') {
  if (!text) return null;

  // Patterns tiền tố chỉ định rõ ràng doanh nghiệp / cơ sở
  const companyPrefixes = [
    /(?:công ty\s+tnhh\s+mtv|công ty\s+tnhh|công ty\s+cổ phần|công ty\s+cp|cty\s+tnhh|cty\s+cp|công ty|cty)\s+([A-ZÀ-Ỹ0-9\s\.\-\&]{3,45})/i,
    /(?:nhà hàng|quán ăn|quán cà phê|quán cafe|tiệm trà|khách sạn|hotel|resort|karaoke|bar|lounge)\s+([A-ZÀ-Ỹ0-9\s\.\-]{3,35})/i,
    /(?:shop|cửa hàng|siêu thị|showroom|hệ thống|thời trang)\s+([A-ZÀ-Ỹ0-9\s\.\-]{3,35})/i,
    /(?:tập đoàn|group|holding|logistics|express|corp)\s+([A-ZÀ-Ỹ0-9\s\.\-]{3,35})/i
  ];

  for (const regex of companyPrefixes) {
    const match = text.match(regex);
    if (match && match[0]) {
      let name = match[0].trim();
      // Loại bỏ các từ ngắt câu hoặc từ thừa
      name = name.split(/[\n,;:\.]/)[0].trim();
      if (name.length >= 4 && name.length <= 60) {
        return name;
      }
    }
  }

  // Tuyệt đối không tự suy đoán nếu không có bằng chứng
  return null;
}

// Bóc tách số lượng tuyển dụng (recruitment_need)
function extractRecruitmentNeed(text) {
  if (!text) return null;
  // Ví dụ: tuyển 20 telesale, cần 05 bạn, tuyển gấp 10 nv
  const pattern = /(?:tuyển|cần|bổ sung|tuyển dụng|tìm)\s+(?:gấp\s+)?(\d{1,3})\s+(?:bạn|nhân sự|nhân viên|vị trí|chỉ tiêu|telesale|nv)/i;
  const match = text.match(pattern);
  if (match && match[1]) {
    const count = parseInt(match[1], 10);
    if (!isNaN(count) && count > 0 && count < 1000) return count;
  }
  return null;
}

// Bóc tách chức danh công việc
function extractJobTitle(text) {
  if (!text) return 'Nhân viên';

  const jobPatterns = [
    /(?:tuyển\s+dụng|tuyển\s+gấp|cần\s+tuyển|tuyển)\s+([a-zA-Zà-ỹÀ-Ỹ\s\/\-\&]{3,40})(?=\s*[-:,.\n]|\s*(?:lương|ca|full|part|tại|kv|liên hệ))/i,
    /(?:vị trí|chức danh):\s*([^\n,;]{3,40})/i
  ];

  for (const p of jobPatterns) {
    const m = text.match(p);
    if (m && m[1]) {
      let title = m[1].trim();
      title = title.replace(/^(gấp|ngay|nhiều|vài)\s+/i, '');
      if (title.length >= 3 && title.length <= 40) return `Tuyển ${title}`;
    }
  }

  return 'Tuyển Nhân viên';
}

// Bóc tách mức lương
function extractSalary(text) {
  if (!text) return { text: 'Thỏa thuận', min: null, max: null };

  const patternRange = /(?:lương|thu nhập|lương cứng)[:\s]*(\d{1,2}(?:[.,]\d)?)\s*(?:-|đến|tới)\s*(\d{1,2}(?:[.,]\d)?)\s*(triệu|tr|m)/i;
  const matchRange = text.match(patternRange);
  if (matchRange) {
    const minVal = parseFloat(matchRange[1].replace(',', '.')) * 1000000;
    const maxVal = parseFloat(matchRange[2].replace(',', '.')) * 1000000;
    return {
      text: `${matchRange[1]} - ${matchRange[2]} triệu`,
      min: minVal,
      max: maxVal
    };
  }

  const patternSingle = /(?:lương|thu nhập)[:\s]*(\d{1,2}(?:[.,]\d)?)\s*(triệu|tr|m)/i;
  const matchSingle = text.match(patternSingle);
  if (matchSingle) {
    const val = parseFloat(matchSingle[1].replace(',', '.')) * 1000000;
    return {
      text: `${matchSingle[1]} triệu`,
      min: val,
      max: val
    };
  }

  const patternHourly = /(\d{2,3})k\s*\/\s*(?:h|giờ|tiếng)/i;
  const matchHourly = text.match(patternHourly);
  if (matchHourly) {
    return {
      text: `${matchHourly[1]}k/giờ`,
      min: parseInt(matchHourly[1], 10) * 1000,
      max: null
    };
  }

  return { text: 'Thỏa thuận', min: null, max: null };
}

// Bóc tách địa điểm
function extractLocation(text, rawLocation = null) {
  if (rawLocation && rawLocation.length >= 3) return rawLocation;
  if (!text) return 'Toàn quốc';

  const cities = [
    { name: 'Đà Nẵng', keywords: ['đà nẵng', 'da nang', 'ngũ hành sơn', 'hải châu', 'thanh khê', 'liên chiểu', 'sơn trà'] },
    { name: 'Hà Nội', keywords: ['hà nội', 'ha noi', 'cầu giấy', 'đống đa', 'hoàn kiếm', 'ba đình', 'hai bà trưng', 'nam từ liêm', 'bắc từ liêm', 'thanh xuân', 'hà đông'] },
    { name: 'TP.HCM', keywords: ['hồ chí minh', 'tphcm', 'tp hcm', 'tp.hcm', 'sài gòn', 'quận 1', 'quận 2', 'quận 3', 'quận 7', 'quận 10', 'bình thạnh', 'thủ đức', 'tân bình', 'gò vấp'] },
    { name: 'Bình Dương', keywords: ['bình dương', 'thủ dầu một', 'dĩ an', 'thuận an', 'bến cát'] },
    { name: 'Đồng Nai', keywords: ['đồng nai', 'biên hòa', 'long thành'] },
    { name: 'Hải Phòng', keywords: ['hải phòng', 'ngô quyền', 'lê chân'] },
    { name: 'Cần Thơ', keywords: ['cần thơ', 'ninh kiều'] }
  ];

  const lower = text.toLowerCase();
  for (const c of cities) {
    if (c.keywords.some(k => lower.includes(k))) {
      return c.name;
    }
  }

  return 'Toàn quốc';
}

class LeadExtractionEngine {
  /**
   * Bóc tách và phân loại bài đăng thành LeadCandidate
   * @param {Object} normalizedPost - NormalizedPost schema
   * @returns {Object} LeadCandidate
   */
  extract(normalizedPost) {
    const text = normalizedPost.content || '';
    const lower = text.toLowerCase();

    // 1. Phân loại Ý định (Lead Intent)
    let leadIntent = 'UNKNOWN';
    let isRecruitmentServiceNeed = false;

    const serviceNeedSignals = [
      'cần đơn vị tuyển dụng',
      'cần tuyển số lượng lớn',
      'cần hỗ trợ tuyển dụng',
      'đang cần nhân sự gấp',
      'tuyển nhiều vị trí',
      'cần nguồn lao động',
      'cần agency tuyển dụng',
      'cần đối tác tuyển dụng',
      'khoán tuyển dụng'
    ];

    if (serviceNeedSignals.some(s => lower.includes(s))) {
      leadIntent = 'RECRUITMENT_SERVICE_NEED';
      isRecruitmentServiceNeed = true;
    } else if (
      lower.includes('tìm việc') ||
      lower.includes('xin việc') ||
      lower.includes('cần tìm việc') ||
      lower.includes('em tìm việc') ||
      lower.includes('chưa có việc') ||
      lower.includes('em sinh năm')
    ) {
      leadIntent = 'JOB_SEEKER';
    } else if (
      lower.includes('tuyển') ||
      lower.includes('tuyển dụng') ||
      lower.includes('cần tuyển') ||
      lower.includes('lương') ||
      lower.includes('phỏng vấn')
    ) {
      leadIntent = 'HIRING';
    } else if (
      lower.includes('vay tiền') ||
      lower.includes('bán sim') ||
      lower.includes('thanh lý') ||
      lower.includes('pass đồ')
    ) {
      leadIntent = 'ADVERTISEMENT';
    }

    // 2. Bóc tách các trường dữ liệu thực tế
    const phone = extractVietnamesePhone(text) || normalizedPost.metadata?.raw_hints?.phone_hint || null;
    const email = extractEmail(text);
    const companyName = extractCompanyName(text, normalizedPost.author?.name) || normalizedPost.metadata?.raw_hints?.employer_hint || null;
    const recruitmentNeed = extractRecruitmentNeed(text);
    const jobTitle = normalizedPost.metadata?.raw_hints?.job_title_hint || extractJobTitle(text);
    const salary = extractSalary(text);
    const location = extractLocation(text, normalizedPost.location);

    // 3. Tính toán độ tin cậy trích xuất (Confidence)
    let confidence = 0.5;
    if (leadIntent === 'HIRING' || leadIntent === 'RECRUITMENT_SERVICE_NEED') confidence += 0.2;
    if (phone) confidence += 0.2;
    if (companyName) confidence += 0.1;
    confidence = Math.min(1.0, confidence);

    return {
      company_name: companyName, // Bắt buộc null nếu không có bằng chứng
      recruitment_need: recruitmentNeed,
      job_title: jobTitle,
      industry: 'recruitment',
      location: location,
      salary_min: salary.min,
      salary_max: salary.max,
      salary_text: salary.text,
      employment_type: lower.includes('part') ? 'PART_TIME' : (lower.includes('full') ? 'FULL_TIME' : 'FLEXIBLE'),
      contact_phone: phone,
      contact_email: email,
      contact_channel: phone ? 'PHONE' : (email ? 'EMAIL' : 'INBOX'),
      source_post_url: normalizedPost.post_url,
      source_group: normalizedPost.source_group,
      source_id: normalizedPost.source_id,
      author_name: normalizedPost.author?.name || 'Ẩn danh',
      author_url: normalizedPost.author?.url || '',
      author_external_id: normalizedPost.author?.external_id || null,
      lead_intent: leadIntent,
      is_recruitment_service_need: isRecruitmentServiceNeed,
      confidence: parseFloat(confidence.toFixed(2)),
      original_content: text,
      created_at: normalizedPost.created_at
    };
  }
}

module.exports = new LeadExtractionEngine();
