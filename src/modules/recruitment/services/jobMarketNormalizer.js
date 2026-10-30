/**
 * jobMarketNormalizer.js - Chuẩn hóa và làm giàu dữ liệu tin tuyển dụng thô:
 * 1. Chuẩn hóa mức lương (Min, Max, Median, đơn vị Triệu VNĐ/tháng, xử lý USD/VND)
 * 2. Phân loại cấp bậc kinh nghiệm (Intern, Fresher, Entry-level, Junior, Middle, Senior, Lead/Manager)
 * 3. Bóc tách & Chuẩn hóa Kỹ năng (Canonical Skills Taxonomy đa ngành)
 * 4. Chuẩn hóa Địa điểm (Tỉnh/Thành phố/Remote)
 * 5. Chuẩn hóa Ngành kinh tế (Industry Classification)
 */
const taxonomyService = require('./jobMarketTaxonomyService');

// Bộ từ điển Kỹ năng Chuẩn hóa Đa ngành (Multi-Industry Canonical Skills Taxonomy)
const SKILL_TAXONOMY = [
  // 1. Databases & SQL
  { canonical: 'SQL', category: 'Technical Skills', patterns: [/\bsql\b/i, /t-sql/i, /pl\/sql/i, /postgresql/i, /mysql/i, /sql server/i] },
  { canonical: 'MySQL / PostgreSQL', category: 'Technical Skills', patterns: [/mysql/i, /postgresql/i, /postgres/i] },
  { canonical: 'NoSQL / MongoDB', category: 'Technical Skills', patterns: [/nosql/i, /mongodb/i, /redis/i] },

  // 2. Business Analysis & Processes
  { canonical: 'Requirement Gathering', category: 'Technical Skills', patterns: [/khảo\s+sát\s+yêu\s+cầu/i, /lấy\s+yêu\s+cầu/i, /requirement/i, /thu\s+thập\s+yêu\s+cầu/i] },
  { canonical: 'UML / Wireframe', category: 'Tools', patterns: [/\buml\b/i, /use\s+case/i, /wireframe/i, /prototype/i, /figma/i, /balsamiq/i] },
  { canonical: 'BPMN / Quy trình', category: 'Technical Skills', patterns: [/\bbpmn\b/i, /sơ\s+đồ\s+quy\s+trình/i, /flowchart/i, /workflow/i] },
  { canonical: 'Agile / Scrum', category: 'Technical Skills', patterns: [/agile/i, /scrum/i, /sprint/i, /scrum\s+master/i] },

  // 3. Analytics & Visualization Tools
  { canonical: 'Excel (Nâng cao)', category: 'Tools', patterns: [/\bexcel\b/i, /vlookup/i, /pivot\s+table/i, /tin\s+học\s+văn\s+phòng/i] },
  { canonical: 'Power BI', category: 'Tools', patterns: [/power\s*bi/i, /\bdax\b/i, /power\s+query/i, /microsoft\s+power\s*bi/i] },
  { canonical: 'Tableau', category: 'Tools', patterns: [/\btableau\b/i] },
  { canonical: 'Data Visualization', category: 'Technical Skills', patterns: [/trực\s+quan\s+hóa\s+dữ\s+liệu/i, /data\s+visualization/i, /dashboard/i] },

  // 4. Programming Languages
  { canonical: 'Python', category: 'Technical Skills', patterns: [/\bpython\b/i, /pandas/i, /numpy/i] },
  { canonical: 'Java', category: 'Technical Skills', patterns: [/\bjava\b/i, /spring\s+boot/i] },
  { canonical: 'JavaScript / TypeScript', category: 'Technical Skills', patterns: [/javascript/i, /typescript/i, /\bjs\b/i, /react/i, /node/i] },
  { canonical: 'C# / .NET', category: 'Technical Skills', patterns: [/\bc#\b/i, /\.net/i, /asp\.net/i] },
  { canonical: 'PHP', category: 'Technical Skills', patterns: [/\bphp\b/i, /laravel/i] },

  // 5. Marketing, Digital & Content
  { canonical: 'SEO / SEM', category: 'Technical Skills', patterns: [/\bseo\b/i, /sem\b/i, /tối\s+ưu\s+hóa\s+tìm\s+kiếm/i, /google\s+search\s+console/i] },
  { canonical: 'Google Ads & Facebook Ads', category: 'Tools', patterns: [/google\s+ads/i, /facebook\s+ads/i, /meta\s+ads/i, /chạy\s+ads/i, /quảng\s+cáo/i, /media\s+buyer/i] },
  { canonical: 'Content Writing & Copywriting', category: 'Technical Skills', patterns: [/content/i, /copywriting/i, /viết\s+bài/i, /sáng\s+tạo\s+nội\s+dung/i, /biên\s+tập/i] },
  { canonical: 'Social Media & TikTok', category: 'Technical Skills', patterns: [/social\s+media/i, /tiktok/i, /fanpage/i, /kênh\s+xã\s+hội/i] },
  { canonical: 'Branding & Chiến lược', category: 'Technical Skills', patterns: [/branding/i, /thương\s+hiệu/i, /chiến\s+lược\s+marketing/i] },

  // 6. Finance, Banking & Accounting
  { canonical: 'Kế toán tổng hợp & BCTC', category: 'Technical Skills', patterns: [/báo\s+cáo\s+tài\s+chính/i, /bctc/i, /kế\s+toán\s+tổng\s+hợp/i, /sổ\s+sách/i] },
  { canonical: 'Kế toán Thuế & Hóa đơn', category: 'Technical Skills', patterns: [/kế\s+toán\s+thuế/i, /quyết\s+toán\s+thuế/i, /thuế\s+gtgt/i, /hóa\s+đơn/i] },
  { canonical: 'Phần mềm Kế toán (MISA / FAST)', category: 'Tools', patterns: [/misa/i, /fast/i, /phần\s+mềm\s+kế\s+toán/i, /bravo/i] },
  { canonical: 'Financial Modeling & Phân tích', category: 'Technical Skills', patterns: [/financial\s+modeling/i, /mô\s+hình\s+tài\s+chính/i, /thẩm\s+định\s+dự\s+án/i, /dòng\s+tiền/i] },
  { canonical: 'Nghiệp vụ Tín dụng & Ngân hàng', category: 'Technical Skills', patterns: [/tín\s+dụng/i, /thẩm\s+định\s+tín\s+dụng/i, /cho\s+vay/i, /nghiệp\s+vụ\s+ngân\s+hàng/i] },

  // 7. Sales, Business & Customer Care
  { canonical: 'Kỹ năng Đàm phán & Chốt Sale', category: 'Soft Skills', patterns: [/đàm\s+phán/i, /chốt\s+sale/i, /thuyết\s+phục/i, /kỹ\s+năng\s+bán\s+hàng/i] },
  { canonical: 'B2B Sales & Tìm kiếm khách hàng', category: 'Technical Skills', patterns: [/b2b/i, /khách\s+hàng\s+doanh\s+nghiệp/i, /tìm\s+kiếm\s+khách\s+hàng/i, /mở\s+rộng\s+thị\s+trường/i] },
  { canonical: 'CRM (Salesforce / HubSpot / LeadX)', category: 'Tools', patterns: [/crm/i, /salesforce/i, /hubspot/i, /quản\s+trị\s+khách\s+hàng/i] },
  { canonical: 'Chăm sóc & Giữ chân Khách hàng', category: 'Soft Skills', patterns: [/chăm\s+sóc\s+khách\s+hàng/i, /cskh/i, /customer\s+success/i, /giải\s+quyết\s+khiếu\s+nại/i] },

  // 8. Logistics, Warehousing & Supply Chain
  { canonical: 'Quản lý kho bãi & Hàng tồn kho', category: 'Technical Skills', patterns: [/quản\s+lý\s+kho/i, /thủ\s+kho/i, /hàng\s+tồn\s+kho/i, /inventory/i, /fifo/i] },
  { canonical: 'Thủ tục Xuất nhập khẩu & Hải quan', category: 'Technical Skills', patterns: [/xuất\s+nhập\s+khẩu/i, /xnk/i, /hải\s+quan/i, /customs/i, /thông\s+quan/i, /tờ\s+khai/i] },
  { canonical: 'Incoterms & Chứng từ vận tải (B/L, C/O)', category: 'Technical Skills', patterns: [/incoterms/i, /vận\s+đơn/i, /bill\s+of\s+lading/i, /chứng\s+nhận\s+xuất\s+xứ/i, /c\/o/i] },
  { canonical: 'Điều phối vận tải & Fleet Management', category: 'Technical Skills', patterns: [/điều\s+phối\s+xe/i, /vận\s+tải/i, /giao\s+nhận/i, /fleet/i, /tuyến\s+đường/i] },
  { canonical: 'Đàm phán Nhà cung cấp & Mua hàng', category: 'Technical Skills', patterns: [/nhà\s+cung\s+cấp/i, /thu\s+mua/i, /procurement/i, /sourcing/i] },

  // 9. HR, Recruitment & Labor Law
  { canonical: 'Kỹ năng Tuyển dụng & Phỏng vấn', category: 'Technical Skills', patterns: [/tuyển\s+dụng/i, /phỏng\s+vấn/i, /headhunter/i, /sourcing\s+ứng\s+viên/i] },
  { canonical: 'C&B, Tiền lương & BHXH', category: 'Technical Skills', patterns: [/c&b/i, /tiền\s+lương/i, /bhxh/i, /bảo\s+hiểm\s+xã\s+hội/i, /chấm\s+công/i] },
  { canonical: 'Luật Lao động & Quan hệ lao động', category: 'Technical Skills', patterns: [/luật\s+lao\s+động/i, /hợp\s+đồng\s+lao\s+động/i, /nội\s+quy/i] },
  { canonical: 'Đào tạo & Phát triển nhân sự', category: 'Technical Skills', patterns: [/đào\s+tạo/i, /training/i, /phát\s+triển\s+nhân\s+sự/i] },

  // 10. Design, Multimedia & Engineering
  { canonical: 'Adobe Photoshop / Illustrator', category: 'Tools', patterns: [/photoshop/i, /illustrator/i, /\bpsd\b/i, /\bai\b/i, /thiết\s+kế\s+đồ\s+họa/i] },
  { canonical: 'Video Editing (Premiere / CapCut)', category: 'Tools', patterns: [/premiere/i, /after\s+effects/i, /capcut/i, /dựng\s+video/i] },
  { canonical: 'AutoCAD / Revit', category: 'Tools', patterns: [/autocad/i, /cad/i, /revit/i, /bản\s+vẽ/i] },
  { canonical: 'Bóc tách khối lượng & Dự toán', category: 'Technical Skills', patterns: [/bóc\s+tách\s+khối\s+lượng/i, /dự\s+toán/i, /hồ\s+sơ\s+thầu/i] },

  // 11. Soft Skills & Languages
  { canonical: 'Tiếng Anh (Giao tiếp / TOEIC / IELTS)', category: 'Languages', patterns: [/tiếng\s+anh/i, /english/i, /toeic/i, /ielts/i] },
  { canonical: 'Tiếng Trung (HSK)', category: 'Languages', patterns: [/tiếng\s+trung/i, /tiếng\s+hoa/i, /hsk/i, /chinese/i] },
  { canonical: 'Kỹ năng Giao tiếp & Thuyết trình', category: 'Soft Skills', patterns: [/giao\s+tiếp/i, /thuyết\s+trình/i, /communication/i, /presentation/i] },
  { canonical: 'Làm việc nhóm & Quản lý thời gian', category: 'Soft Skills', patterns: [/làm\s+việc\s+nhóm/i, /teamwork/i, /quản\s+lý\s+thời\s+gian/i] },
  { canonical: 'Tư duy logic & Giải quyết vấn đề', category: 'Soft Skills', patterns: [/tư\s+duy\s+logic/i, /problem\s+solving/i, /giải\s+quyết\s+vấn\s+đề/i] }
];

class JobMarketNormalizer {
  /**
   * Bóc tách và chuẩn hóa mức lương về đơn vị Triệu VNĐ/tháng
   */
  normalizeSalary(salaryStr) {
    if (!salaryStr || typeof salaryStr !== 'string') {
      return { raw: 'Thoả thuận', isNegotiable: true, min: null, max: null, median: null };
    }

    const clean = salaryStr.trim().toLowerCase();
    if (clean.includes('thoả thuận') || clean.includes('thỏa thuận') || clean.includes('cạnh tranh') || clean === '') {
      return { raw: salaryStr, isNegotiable: true, min: null, max: null, median: null };
    }

    const isUSD = clean.includes('usd') || clean.includes('$');
    const usdRate = 25.5;

    const matches = clean.match(/([\d]+(?:[.,]\d+)?)/g);
    if (!matches || matches.length === 0) {
      return { raw: salaryStr, isNegotiable: true, min: null, max: null, median: null };
    }

    let nums = matches.map(m => {
      let n = parseFloat(m.replace(',', '.'));
      if (isUSD) n = n * usdRate;
      return n;
    });

    if (nums.some(n => n > 1000000)) {
      nums = nums.map(n => Number((n / 1000000).toFixed(1)));
    }

    nums.sort((a, b) => a - b);

    let min = null;
    let max = null;
    let median = null;

    if (nums.length === 1) {
      median = nums[0];
      min = Number((nums[0] * 0.85).toFixed(1));
      max = Number((nums[0] * 1.15).toFixed(1));
    } else {
      min = nums[0];
      max = nums[nums.length - 1];
      median = Number(((min + max) / 2).toFixed(1));
    }

    if (min < 3) min = 3;
    if (max > 250) max = 250;
    if (median > max) median = max;
    if (median < min) median = min;

    return {
      raw: salaryStr,
      isNegotiable: false,
      min,
      max,
      median
    };
  }

  /**
   * Chuẩn hóa cấp bậc kinh nghiệm
   */
  normalizeSeniority(expStr, jobTitle = '') {
    const combined = `${expStr} ${jobTitle}`.toLowerCase();

    if (combined.includes('thực tập') || combined.includes('intern') || combined.includes('học việc')) {
      return { level: 'Intern', label: 'Thực tập sinh (Intern)', minYears: 0, maxYears: 0.5, isEntryLevel: true };
    }
    if (combined.includes('fresher') || combined.includes('mới tốt nghiệp') || combined.includes('không yêu cầu') || combined.includes('chưa có kinh nghiệm')) {
      return { level: 'Fresher', label: 'Fresher (0 - 1 năm)', minYears: 0, maxYears: 1, isEntryLevel: true };
    }
    if (combined.includes('trưởng phòng') || combined.includes('manager') || combined.includes('giám đốc') || combined.includes('director') || combined.includes('head of')) {
      return { level: 'Lead/Manager', label: 'Quản lý / Trưởng phòng (5+ năm)', minYears: 5, maxYears: 15, isEntryLevel: false };
    }
    if (combined.includes('senior') || combined.includes('chuyên gia') || combined.includes('chính') || combined.includes('4 năm') || combined.includes('5 năm')) {
      return { level: 'Senior', label: 'Senior (4 - 7 năm)', minYears: 4, maxYears: 7, isEntryLevel: false };
    }
    if (combined.includes('middle') || combined.includes('2 năm') || combined.includes('3 năm')) {
      return { level: 'Middle', label: 'Middle (2 - 4 năm)', minYears: 2, maxYears: 4, isEntryLevel: false };
    }
    if (combined.includes('junior') || combined.includes('1 năm') || combined.includes('dưới 1 năm')) {
      return { level: 'Junior', label: 'Junior (1 - 2 năm)', minYears: 1, maxYears: 2, isEntryLevel: true };
    }

    return { level: 'Junior', label: 'Junior (1 - 2 năm)', minYears: 1, maxYears: 2, isEntryLevel: true };
  }

  /**
   * Bóc tách kỹ năng từ văn bản
   */
  extractSkills(text) {
    if (!text || typeof text !== 'string') return [];
    const matchedSkills = [];

    for (const item of SKILL_TAXONOMY) {
      let matched = false;
      for (const p of item.patterns) {
        if (p.test(text)) {
          matched = true;
          break;
        }
      }
      if (matched) {
        matchedSkills.push({
          canonical: item.canonical,
          category: item.category
        });
      }
    }

    return matchedSkills;
  }

  /**
   * Chuẩn hóa Tỉnh/Thành phố
   */
  normalizeLocation(locStr) {
    if (!locStr) return 'Toàn quốc';
    const clean = locStr.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd');

    if (clean.includes('ho chi minh') || clean.includes('hcm') || clean.includes('sai gon') || clean.includes('thu duc')) {
      return 'Hồ Chí Minh';
    }
    if (clean.includes('ha noi') || clean.includes('hn') || clean.includes('cau giay') || clean.includes('nam tu liem')) {
      return 'Hà Nội';
    }
    if (clean.includes('da nang')) return 'Đà Nẵng';
    if (clean.includes('binh duong')) return 'Bình Dương';
    if (clean.includes('dong nai')) return 'Đồng Nai';
    if (clean.includes('ba ria') || clean.includes('vung tau')) return 'Bà Rịa - Vũng Tàu';
    if (clean.includes('bac ninh')) return 'Bắc Ninh';
    if (clean.includes('hai phong')) return 'Hải Phòng';
    if (clean.includes('can tho')) return 'Cần Thơ';
    if (clean.includes('remote') || clean.includes('tu xa') || clean.includes('online')) return 'Remote / Từ xa';
    return locStr.trim();
  }

  /**
   * Chuẩn hóa Ngành Doanh nghiệp (Industry)
   */
  normalizeIndustry(industryStr, companyName = '', jobTitle = '') {
    const raw = `${industryStr} ${companyName} ${jobTitle}`;
    
    // Thử map với taxonomy chuẩn
    const indObj = taxonomyService.resolveIndustry(industryStr) || taxonomyService.resolveIndustry(raw);
    if (indObj) {
      return indObj.name;
    }

    // Heuristics nhanh theo từ khóa
    const lower = raw.toLowerCase();
    if (lower.includes('logistics') || lower.includes('vận tải') || lower.includes('kho') || lower.includes('xuất nhập khẩu')) {
      return 'Logistics - Chuỗi cung ứng';
    }
    if (lower.includes('marketing') || lower.includes('quảng cáo') || lower.includes('truyền thông') || lower.includes('seo')) {
      return 'Marketing - Truyền thông';
    }
    if (lower.includes('tài chính') || lower.includes('ngân hàng') || lower.includes('chứng khoán') || lower.includes('bảo hiểm')) {
      return 'Tài chính - Ngân hàng';
    }
    if (lower.includes('kế toán') || lower.includes('kiểm toán') || lower.includes('thuế')) {
      return 'Kế toán - Kiểm toán';
    }
    if (lower.includes('kinh doanh') || lower.includes('bán hàng') || lower.includes('sales') || lower.includes('telesale')) {
      return 'Kinh doanh - Bán hàng';
    }
    if (lower.includes('nhân sự') || lower.includes('tuyển dụng') || lower.includes('hành chính') || lower.includes('hr')) {
      return 'Nhân sự - Hành chính';
    }
    if (lower.includes('bất động sản') || lower.includes('địa ốc') || lower.includes('căn hộ') || lower.includes('nhà đất')) {
      return 'Bất động sản';
    }
    if (lower.includes('xây dựng') || lower.includes('kiến trúc') || lower.includes('công trình') || lower.includes('nội thất')) {
      return 'Xây dựng - Kiến trúc';
    }
    if (lower.includes('sản xuất') || lower.includes('nhà máy') || lower.includes('chế tạo') || lower.includes('cơ khí')) {
      return 'Sản xuất - Kỹ thuật';
    }
    if (lower.includes('y tế') || lower.includes('dược') || lower.includes('bệnh viện') || lower.includes('bác sĩ')) {
      return 'Dược - Y tế - Sức khỏe';
    }
    if (lower.includes('giáo dục') || lower.includes('đào tạo') || lower.includes('giáo viên') || lower.includes('trường')) {
      return 'Giáo dục - Đào tạo';
    }
    if (lower.includes('nhà hàng') || lower.includes('khách sạn') || lower.includes('du lịch') || lower.includes('f&b')) {
      return 'Nhà hàng - Khách sạn - Du lịch';
    }
    if (lower.includes('bán lẻ') || lower.includes('siêu thị') || lower.includes('cửa hàng') || lower.includes('dịch vụ')) {
      return 'Bán lẻ - Dịch vụ đời sống';
    }
    if (lower.includes('thiết kế') || lower.includes('đồ họa') || lower.includes('design')) {
      return 'Thiết kế - Sáng tạo';
    }
    if (lower.includes('luật') || lower.includes('pháp lý') || lower.includes('pháp chế')) {
      return 'Luật - Pháp lý';
    }
    if (lower.includes('phần mềm') || lower.includes('lập trình') || lower.includes('cntt') || lower.includes('software') || lower.includes('developer')) {
      return 'Công nghệ thông tin';
    }

    return 'Kinh doanh - Bán hàng';
  }
}

module.exports = new JobMarketNormalizer();
