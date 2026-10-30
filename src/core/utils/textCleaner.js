/**
 * textCleaner.js - Bộ lọc & Chuẩn hóa chính tả, tách chữ dính và định dạng bài đăng Facebook Groups
 */

function cleanJobTitle(rawTitle) {
  if (!rawTitle) return '';
  let title = fixSpellingAndSpacing(rawTitle);
  title = title.replace(/\(Việc Làm Online\s*\|\s*Thu Nhập Cao.*$/i, '');
  title = title.replace(/\|\s*Việc Làm Online.*$/i, '');
  title = title.replace(/-?\s*ID\d+$/i, '');
  title = title.replace(/\(\s*\)/g, '');
  title = title.replace(/&([^\s])/g, '& $1');
  title = title.replace(/([^\s])&/g, '$1 &');
  title = title.replace(/–([^\s])/g, '– $1');
  title = title.replace(/([^\s])–/g, '$1 –');
  return title.trim();
}

function fixSpellingAndSpacing(text) {
  if (!text) return '';
  let str = String(text);

  // Danh sách từ khóa chuyên ngành / phần mềm cần bảo toàn
  const protectedTerms = [
    { reg: /\bautocad\b/gi, name: 'AutoCAD' },
    { reg: /\bsketchup\b/gi, name: 'SketchUp' },
    { reg: /\b3ds\s*max\b/gi, name: '3ds Max' },
    { reg: /\b3dsmax\b/gi, name: '3ds Max' },
    { reg: /\bphotoshop\b/gi, name: 'Photoshop' },
    { reg: /\brevit\b/gi, name: 'Revit' },
    { reg: /\bpowerpoint\b/gi, name: 'PowerPoint' },
    { reg: /\btiktok\b/gi, name: 'TikTok' },
    { reg: /\byoutube\b/gi, name: 'YouTube' },
    { reg: /\bfanpage\b/gi, name: 'Fanpage' },
    { reg: /\bcorona\b/gi, name: 'Corona' },
    { reg: /\bvray\b/gi, name: 'Vray' }
  ];

  // Thay thế tạm bằng token không chứa ký tự chữ
  protectedTerms.forEach((term, idx) => {
    str = str.replace(term.reg, `[[TECH_TOKEN_${idx}]]`);
  });

  // Chuẩn hóa dấu câu cơ bản
  str = str.replace(/(:)([^\s\d/])/g, '$1 $2');
  str = str.replace(/(,)([^\s\d])/g, '$1 $2');
  str = str.replace(/(\))([^\s,.;:!\n])/g, '$1 $2');
  str = str.replace(/([^\s])(\()/g, '$1 $2');
  str = str.replace(/(\.)([A-ZĐÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ])/gu, '$1 $2');

  // Tách chữ thường dính số (Ví dụ: "cứng6.000.000" -> "cứng 6.000.000", "Xăng50" -> "Xăng 50")
  str = str.replace(/(\p{Ll})(\d)/gu, '$1 $2');

  // Tách dấu cộng dính chữ (Ví dụ: "+PC" -> "+ PC", "+Thưởng" -> "+ Thưởng")
  str = str.replace(/(\+)([^\s\d+])/g, '$1 $2');
  str = str.replace(/([^\s+])(\+)/g, '$1 $2');

  // Tách chữ dính thường-hoa thông thường (Ví dụ: "HồChíMinh" -> "Hồ Chí Minh")
  str = str.replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2');

  // Khôi phục lại chính xác tên phần mềm chuẩn
  protectedTerms.forEach((term, idx) => {
    str = str.replace(new RegExp(`\\[\\[TECH_TOKEN_${idx}\\]\\]`, 'g'), term.name);
  });

  str = str.replace(/(\d+)\s*phúto\s*/gi, '$1 phút - ');
  str = str.replace(/([a-zA-Z0-9])Có từ\s+/g, '$1 - Có từ ');
  str = str.replace(/đến(\d+)/gi, 'đến $1');
  str = str.replace(/XEBẮC/gi, 'XE BẮC');
  str = str.replace(/BẾNXE/gi, 'BẾN XE');
  str = str.replace(/XeBắc/g, 'Xe Bắc');
  str = str.replace(/BếnXe/g, 'Bến Xe');
  str = str.replace(/F&B/gi, 'F&B');
  str = str.replace(/B2B/gi, 'B2B');
  str = str.replace(/B2C/gi, 'B2C');
  str = str.replace(/\.\.\.và\s+\d+\s+địa điểm khác.*$/gi, '');
  str = str.replace(/Thu gọn$/gi, '');

  str = str.replace(/hăng tiến/gi, 'thăng tiến');
  return str.replace(/[ \t]+/g, ' ').trim();
}

function shortenSalary(sal) {
  if (!sal || sal === 'Không đề cập') return 'Thoả thuận theo năng lực';
  let s = String(sal);
  s = s.replace(/\(Lương cứng.*?\)/gi, '').trim();
  s = s.replace(/(\d+)[\.,]000[\.,]000/g, '$1 triệu');
  s = s.replace(/(\d+)\s*triệu\s*[–-]\s*(\d+)\s*triệu/gi, '$1 – $2 triệu');
  s = s.replace(/\+?\s*(VNĐ|VND|đồng)\/tháng/gi, '/tháng');
  s = s.replace(/Thoả thuận theo năng lực và kinh nghiệm/gi, 'Thỏa thuận theo năng lực');
  return fixSpellingAndSpacing(s).trim();
}

function cleanBulletLine(line, maxLen = 140) {
  if (!line) return '';
  let s = fixSpellingAndSpacing(line)
    .replace(/^[-+•*oO\d.)\s]+/, '')
    .replace(/^[\d+.]\s*/, '')
    .trim();

  // Bỏ các từ đệm hoa mỹ/tiêu đề danh mục lặp lại
  s = s.replace(/^(?:Yêu cầu ứng viên|Mô tả công việc|Quyền lợi được hưởng|Chế độ phúc lợi|Thu nhập hấp dẫn):?\s*/i, '');
  s = s.replace(/\[Số tiền\]/g, 'cạnh tranh');
  s = s.replace(/^(?:Kinh nghiệm|Kỹ năng|Am hiểu ngành|Ngoại hình|Thái độ|Công cụ|Công tác tuyển dụng|Quản lý chi phí|Điều hành thi công|Quản lý hiện trường|Kiểm tra hồ sơ):\s*/i, '');
  s = s.replace(/\.{3,}/g, '…');

  s = s.replace(/^Ưu tiên ứng viên có từ\s*/i, 'Ưu tiên ');
  s = s.replace(/^Ưu tiên ứng viên có\s*/i, 'Ưu tiên ');
  s = s.replace(/^Ưu tiên ứng viên\s*/i, 'Ưu tiên ');
  s = s.replace(/^Thu nhập cạnh tranh và không giới hạn theo năng lực:\s*/i, '');
  s = s.replace(/^Hưởng đầy đủ các chế độ phúc lợi nội bộ:\s*/i, '');
  s = s.replace(/^Khai thác nguồn khách hàng tiềm năng do công ty cung cấp\s*kết hợp\s*/i, 'Khai thác data KH & ');
  s = s.replace(/thưởng lễ, tết, hiếu hỉ, sinh nhật, du lịch và teambuilding định kỳ\./i, 'Thưởng lễ Tết, sinh nhật, du lịch teambuilding');

  // Rút gọn câu dài nếu vượt quá maxLen tại điểm ngắt dấu chấm phẩy
  if (s.length > maxLen) {
    const clauses = s.split(/[;]/);
    if (clauses[0] && clauses[0].length >= 35) {
      s = clauses[0].trim();
    }
  }

  s = s.replace(/[.,;:\s]+$/, '').trim();
  if (!s || s.length < 4) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const condenseBulletLine = cleanBulletLine;

function isCategoryHeaderOnly(text) {
  if (!text) return true;
  const clean = text.replace(/^[-\d.+•*\s]+/, '').replace(/:$/, '').trim().toLowerCase();
  return [
    'kỹ năng chuyên môn', 'kỹ năng', 'yêu cầu', 'yêu cầu công việc',
    'yêu cầu ứng viên', 'mô tả', 'mô tả công việc', 'nhiệm vụ',
    'quyền lợi', 'chế độ đãi ngộ', 'thông tin khác'
  ].includes(clean);
}

function splitGluedBullets(rawText) {
  if (!rawText) return '';
  return String(rawText)
    .replace(/\.-\s*/g, '\n- ')
    .replace(/\.-/g, '\n- ')
    .replace(/;\s*[-–•*]\s*/g, '\n- ')
    .replace(/;\s*/g, '\n- ')
    .replace(/^[-•*\s]*nhiệm vụ chung:?\s*[-•*\s]*/i, '- ')
    .replace(/^[-•*\s]*nhiệm vụ:?\s*[-•*\s]*/i, '- ')
    .replace(/^[-•*\s]*mô tả công việc:?\s*[-•*\s]*/i, '- ')
    .replace(/^[-•*\s]*yêu cầu công việc:?\s*[-•*\s]*/i, '- ')
    .replace(/^[-•*\s]*yêu cầu ứng viên:?\s*[-•*\s]*/i, '- ')
    .replace(/^[-•*\s]*quyền lợi:?\s*[-•*\s]*/i, '- ')
    .replace(/^[-•*\s]*quyền lợi được hưởng:?\s*[-•*\s]*/i, '- ');
}

function cleanConciseLines(rawText, maxItems = 4, excludeKeywords = []) {
  if (!rawText || rawText === 'Không đề cập' || rawText === 'Không yêu cầu') return [];
  const preprocessed = splitGluedBullets(rawText);
  const lines = preprocessed.split('\n');
  const result = [];

  for (let l of lines) {
    l = l.trim();
    if (!l) continue;

    let clean = cleanBulletLine(l);
    if (!clean || clean.length < 4 || isCategoryHeaderOnly(clean)) continue;

    // Bỏ qua dòng chỉ là tiêu đề kết thúc bằng dấu hai chấm
    if (/^(kỹ năng|yêu cầu|quyền lợi|nhiệm vụ|mô tả|chức năng|trách nhiệm)(\s+\w+)*:?$/i.test(clean) || clean.endsWith(':')) {
      continue;
    }

    const lower = clean.toLowerCase();
    const shouldExclude = excludeKeywords.some(kw => lower.includes(kw));
    if (shouldExclude && lines.length > 2) continue;

    if (!result.includes(clean)) {
      result.push(clean);
    }
    if (result.length >= maxItems) break;
  }
  return result;
}

function cleanJobDescription(rawDesc, maxItems = 4) {
  if (!rawDesc || rawDesc === 'Không đề cập') return '';
  let text = String(rawDesc);
  const reqSplit = text.split(/\|\s*YÊU CẦU:?|YÊU CẦU:/i);
  let mainDesc = reqSplit[0];
  mainDesc = mainDesc.replace(/Địa điểm làm việc:.*$/i, '');

  const items = cleanConciseLines(mainDesc, maxItems, ['địa điểm làm việc', 'báo cáo tiến độ']);
  if (items.length === 0) return '';
  return items.map(line => `- ${line}`).join('\n');
}

function cleanJobRequirements(job, maxItems = 3) {
  const parts = [];

  // 1. Kinh nghiệm (ưu tiên hàng đầu)
  if (job.experience && job.experience !== 'Không yêu cầu' && job.experience !== 'Không đề cập') {
    parts.push(`- Kinh nghiệm: Tối thiểu ${job.experience} trong lĩnh vực chuyên môn liên quan`);
  } else if (job.kinh_nghiem && job.kinh_nghiem !== 'Không yêu cầu' && job.kinh_nghiem !== 'Không đề cập') {
    const knLines = cleanConciseLines(job.kinh_nghiem, 1);
    if (knLines.length > 0) {
      let knText = knLines[0].replace(/^Kinh nghiệm:?\s*/i, '');
      parts.push(`- Kinh nghiệm: ${knText}`);
    }
  }

  // 2. Kỹ năng & Yêu cầu từ text
  if (job.ky_nang && job.ky_nang !== 'Không đề cập') {
    const skills = cleanConciseLines(job.ky_nang, 1);
    if (skills.length > 0) {
      let s = skills[0].replace(/^kỹ năng\s*/i, '');
      parts.push(`- Kỹ năng: ${s}`);
    }
  }

  if (job.requirements && parts.length < maxItems) {
    const rItems = cleanConciseLines(job.requirements, maxItems - parts.length, ['nhiệt tình']);
    rItems.forEach(r => parts.push(`- ${r}`));
  }

  // Nếu vẫn chưa có đủ yêu cầu, bổ sung yêu cầu tác phong chuẩn
  if (parts.length === 0) {
    parts.push(`- Nhanh nhẹn, có tinh thần trách nhiệm và tinh thần học hỏi tốt`);
    parts.push(`- Không yêu cầu kinh nghiệm, chấp nhận đào tạo cho ứng viên mới`);
  } else if (parts.length === 1) {
    parts.push(`- Tác phong nhanh nhẹn, tinh thần trách nhiệm cao và tận tâm với công việc`);
  }

  return parts.slice(0, maxItems).join('\n');
}

function cleanJobBenefits(rawBenefits, maxItems = 3, hasSalary = true) {
  if (!rawBenefits || rawBenefits === 'Không đề cập') return '';
  const excludeKw = ['các chế độ khác', 'thân thiện'];
  const items = cleanConciseLines(rawBenefits, maxItems, excludeKw);
  if (items.length === 0) return '';
  return items.map(line => `- ${line}`).join('\n');
}

function cleanCompanyName(company) {
  if (!company || company === 'Doanh Nghiệp' || company === 'Chưa cập nhật' || company === 'Khách hàng') return '';
  let str = fixSpellingAndSpacing(company);
  // Tách trường hợp crawler bị dính brand/mã với CÔNG TY: ví dụ FTILESCÔNG TY -> FTILES - CÔNG TY
  str = str.replace(/([A-Z0-9]{2,})\s*(CÔNG TY|TNHH|CỔ PHẦN|TẬP ĐOÀN|DOANH NGHIỆP)/gu, '$1 - $2');
  str = str.replace(/([a-z0-9])\s*(CÔNG TY|TNHH|CỔ PHẦN|TẬP ĐOÀN|DOANH NGHIỆP)/gu, '$1 - $2');
  return str.replace(/\s+/g, ' ').trim();
}

const PROVINCES_LIST = [
  'Hồ Chí Minh', 'TP.HCM', 'TP HCM', 'Hà Nội', 'Đà Nẵng', 'Hải Phòng', 'Cần Thơ',
  'Bình Dương', 'Đồng Nai', 'Bà Rịa - Vũng Tàu', 'Bà Rịa-Vũng Tàu', 'Bà Rịa Vũng Tàu',
  'Tây Ninh', 'Bình Phước', 'Long An', 'Tiền Giang', 'Bến Tre', 'Trà Vinh', 'Vĩnh Long',
  'Đồng Tháp', 'An Giang', 'Kiên Giang', 'Hậu Giang', 'Sóc Trăng', 'Bạc Liêu',
  'Cà Mau', 'Bình Thuận', 'Ninh Thuận', 'Khánh Hòa', 'Phú Yên', 'Bình Định', 'Quảng Ngãi',
  'Quảng Nam', 'Thừa Thiên Huế', 'Quảng Trị', 'Quảng Bình', 'Hà Tĩnh', 'Nghệ An', 'Thanh Hóa',
  'Ninh Bình', 'Nam Định', 'Thái Bình', 'Hà Nam', 'Hưng Yên', 'Hải Dương', 'Bắc Ninh',
  'Bắc Giang', 'Vĩnh Phúc', 'Phú Thọ', 'Thái Nguyên', 'Tuyên Quang', 'Lạng Sơn', 'Cao Bằng',
  'Bắc Kạn', 'Hà Giang', 'Yên Bái', 'Lào Cai', 'Điện Biên', 'Lai Châu', 'Sơn La', 'Hòa Bình',
  'Kon Tum', 'Gia Lai', 'Đắk Lắk', 'Đắk Nông', 'Lâm Đồng'
];

function cleanJobLocations(rawDetailedLoc, rawLoc, targetProvince = '') {
  let sourceText = (rawDetailedLoc || rawLoc || targetProvince || '').trim();
  if (!sourceText) return targetProvince ? `- Tại ${targetProvince}` : '- Toàn quốc';

  // 1. Dọn sạch rác crawler và các nút bấm mở rộng của TopCV
  sourceText = sourceText
    .replace(/\.\.\.và\s+\d+\s+địa điểm khác.*$/gi, '')
    .replace(/Thu gọn$/gi, '')
    .replace(/:\s*:/g, ':')
    .replace(/\(tất cả phường\)/gi, '')
    .replace(/\(tất cả quận\/?huyện\)/gi, '')
    .replace(/\(tất cả quận\)/gi, '')
    .replace(/\(tất cả\)/gi, '')
    .trim();

  // Kiểm tra xem có phải danh sách nhiều chi nhánh bị gộp lại không
  const provPattern = PROVINCES_LIST.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const multiRegex = new RegExp(`([^\\n])(?=(?:${provPattern})\\s*:)`, 'gi');
  const isMultiBranch = multiRegex.test(sourceText) || sourceText.includes(' cũ)') || sourceText.split(':').length > 3;

  // Nếu là địa điểm đơn lẻ ngắn gọn
  if (!isMultiBranch && sourceText.length < 120) {
    let single = sourceText
      .replace(/^[-+•*]\s*/, '')
      .replace(/\s*\([^)]*cũ\)/gi, '')
      .replace(/:\s*$/, '')
      .replace(/:\s*/g, ': ')
      .trim();
    if (!single || single === targetProvince || single === 'Hồ Chí Minh' || single === 'Hà Nội' || single === 'Đà Nẵng') {
      return `- Khu vực ${targetProvince || single}`;
    }
    return `- ${single}`;
  }

  // 2. Tách từng chi nhánh
  let text = sourceText.replace(new RegExp(`([^\\n])(?=(?:${provPattern})\\s*:)`, 'gi'), '$1\n');
  const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);

  const parsed = [];
  for (let line of rawLines) {
    const match = line.match(/^([^:]+):\s*:?\s*(.*)$/);
    let prov = '';
    let addr = line;
    if (match) {
      prov = match[1].trim();
      addr = match[2].trim();
    }

    // Làm sạch địa chỉ, lược bỏ tên công ty lặp lại và tag cũ
    addr = addr
      .replace(/^Công ty [^,]+,\s*/i, '')
      .replace(/^Chi nhánh [^,]+(?:tại Bà Rịa-Vũng Tàu|tại Bình Phước|tại Đồng Nai|tại Tây Ninh|tại),\s*/i, '')
      .replace(/^Chi nhánh [^,]+,\s*/i, '')
      .replace(/\s*\([^)]*cũ\)/gi, '')
      .replace(/^[:\s,-]+/, '')
      .trim();

    // Nhận diện lại tỉnh thành thực tế từ nội dung địa chỉ nếu crawler gán nhầm
    let detectedProv = prov;
    for (const p of PROVINCES_LIST) {
      if (addr.toLowerCase().includes(p.toLowerCase())) {
        detectedProv = p;
        break;
      }
    }
    // Quận/Huyện đặc trưng các tỉnh trọng điểm
    if (/Thủ Dầu Một|Thuận An|Dĩ An|Bến Cát|Tân Uyên|Bàu Bàng|Phú Giáo|Dầu Tiếng/i.test(addr)) {
      detectedProv = 'Bình Dương';
    } else if (/Biên Hòa|Long Thành|Trảng Bom|Nhơn Trạch|Vĩnh Cửu|Định Quán|Xuân Lộc/i.test(addr)) {
      detectedProv = 'Đồng Nai';
    } else if (/Vũng Tàu|Bà Rịa|Phú Mỹ|Châu Đức|Xuyên Mộc|Long Điền/i.test(addr)) {
      detectedProv = 'Bà Rịa - Vũng Tàu';
    } else if (/Đồng Xoài|Bình Long|Chơn Thành|Hớn Quản|Phước Long/i.test(addr)) {
      detectedProv = 'Bình Phước';
    } else if (/Tân Biên|Hòa Thành|Dương Minh Châu|Gò Dầu|Trảng Bàng|Bến Cầu|Châu Thành/i.test(addr)) {
      detectedProv = 'Tây Ninh';
    } else if (/Tân Thuận|Quận 7|Bình Thạnh|Tân Bình|Thủ Đức|Quận 1|Quận 12|Gò Vấp/i.test(addr)) {
      detectedProv = 'Hồ Chí Minh';
    } else if (/Cầu Giấy|Nam Từ Liêm|Đống Đa|Ba Đình|Hoàn Kiếm|Hà Đông/i.test(addr)) {
      detectedProv = 'Hà Nội';
    } else if (/Ninh Kiều|Cái Răng|Bình Thủy|Ô Môn/i.test(addr)) {
      detectedProv = 'Cần Thơ';
    }

    if (addr) {
      parsed.push({ province: detectedProv, address: addr });
    }
  }

  // 3. Phân loại theo targetProvince của Fanpage
  const normTarget = (targetProvince || '').toLowerCase()
    .replace(/^(tỉnh|thành phố|tp\.?)\s*/i, '')
    .replace(/[- ]/g, '')
    .trim();

  const targetMatches = [];
  const otherProvinces = new Set();

  for (const item of parsed) {
    const normItemProv = (item.province || '').toLowerCase()
      .replace(/^(tỉnh|thành phố|tp\.?)\s*/i, '')
      .replace(/[- ]/g, '')
      .trim();

    if (normTarget && (normItemProv.includes(normTarget) || normTarget.includes(normItemProv))) {
      targetMatches.push(item.address);
    } else {
      if (item.province) otherProvinces.add(item.province);
    }
  }

  // Nếu có chi nhánh khớp với tỉnh của Fanpage
  if (targetMatches.length > 0) {
    const lines = [];
    const cleanAddrs = targetMatches
      .map(a => a.replace(/^Tại\s*$/i, '').replace(/;\s*$/, '').trim())
      .filter(Boolean);
    const displayAddrs = cleanAddrs.slice(0, 4).join(', ');
    if (displayAddrs) {
      lines.push(`- Tại ${targetProvince}: ${displayAddrs}`);
    } else {
      lines.push(`- Tại ${targetProvince}`);
    }
    if (otherProvinces.size > 0) {
      const otherList = Array.from(otherProvinces).slice(0, 4).join(', ');
      lines.push(`- Ngoài ra còn có chi nhánh tại: ${otherList}...`);
    }
    return lines.join('\n');
  }

  // Nếu không khớp targetProvince cụ thể, gom theo tỉnh thành ngắn gọn
  const provGroups = {};
  for (const item of parsed) {
    const p = item.province || 'Khu vực khác';
    if (!provGroups[p]) provGroups[p] = [];
    if (!provGroups[p].includes(item.address)) provGroups[p].push(item.address);
  }

  const groupLines = [];
  for (const [p, addrs] of Object.entries(provGroups)) {
    const briefAddrs = addrs.filter(Boolean).slice(0, 2).join(', ');
    if (briefAddrs) {
      groupLines.push(`- ${p}: ${briefAddrs}${addrs.length > 2 ? ` (+${addrs.length - 2} điểm)` : ''}`);
    } else if (p && p !== 'Khu vực khác') {
      groupLines.push(`- Khu vực ${p}`);
    }
  }

  if (groupLines.length === 0) {
    return targetProvince ? `- Khu vực ${targetProvince}` : (sourceText ? `- ${sourceText}` : '- Toàn quốc');
  }

  return groupLines.slice(0, 4).join('\n');
}

function removeVietnameseTones(str) {
  if (!str) return '';
  let s = String(str);
  s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[đĐ]/g, m => m === 'đ' ? 'd' : 'D');
  return s;
}

function toCleanHashtag(str, prefix = '') {
  if (!str) return '';
  let s = String(str)
    .replace(/CÔNG TY CỔ PHẦN\s*/gi, '')
    .replace(/CÔNG TY TNHH\s*/gi, '')
    .replace(/TẬP ĐOÀN\s*/gi, '')
    .replace(/DOANH NGHIỆP\s*/gi, '')
    .replace(/TP\.?\s*/gi, '')
    .replace(/Tỉnh\s*/gi, '')
    .replace(/Thành phố\s*/gi, '');

  const noAccents = removeVietnameseTones(s);
  const words = noAccents.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const pascal = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join('');
  if (!pascal) return '';
  return prefix ? `#${prefix}${pascal}` : `#${pascal}`;
}

function formatWorkingTime(rawTime) {
  if (!rawTime || rawTime === 'Không đề cập' || rawTime === 'Không yêu cầu') return '';
  let s = fixSpellingAndSpacing(rawTime);
  s = s.replace(/Thứ 2\s*[-–]\s*Thứ 7/gi, 'T2 – T7')
       .replace(/Thứ 2\s*[-–>]\s*Sáng Thứ 7/gi, 'T2 – Sáng T7')
       .replace(/Thứ 2\s*[-–]\s*Thứ 6/gi, 'T2 – T6');

  const m = s.match(/^([^(]+)\s*\(([^)]+)\)$/);
  if (m) {
    const part1 = m[1].trim();
    const part2 = m[2].trim();
    if (/\d+:\d+|\d+h/i.test(part2) && /t\d|thứ/i.test(part1)) {
      return `${part2} (${part1})`;
    }
  }
  return s;
}

function extractKeyPerks(benefits, salary) {
  if (!benefits || benefits === 'Không đề cập') return '';
  const text = (benefits + ' ' + (salary || '')).toLowerCase();
  const perks = [];

  if (text.includes('bhxh') || text.includes('bảo hiểm') || text.includes('bhtn')) perks.push('BHXH');
  if (text.includes('thưởng')) perks.push('thưởng');
  if (text.includes('hoa hồng')) perks.push('hoa hồng');
  else if (text.includes('phúc lợi')) perks.push('phúc lợi');

  return Array.from(new Set(perks)).slice(0, 3).join(' + ');
}

function inferJobDescription(job) {
  const title = (job.title || job.cong_viec || job.chuc_vu || '').toLowerCase();
  const skills = (job.ky_nang || '').toLowerCase();

  if (title.includes('3d') || title.includes('render') || skills.includes('3dsmax') || skills.includes('corona')) {
    return [
      'Thiết kế phối cảnh 3D nội thất, kiến trúc theo yêu cầu dự án',
      'Triển khai dựng hình và render hình ảnh chất lượng cao',
      'Phối hợp cùng team kỹ thuật và thiết kế hoàn thiện hồ sơ phương án'
    ];
  }
  if (title.includes('2d') || title.includes('bản vẽ') || title.includes('autocad')) {
    return [
      'Khảo sát hiện trạng, đo đạc mặt bằng công trình',
      'Triển khai chi tiết bản vẽ kỹ thuật 2D nội thất, kiến trúc',
      'Phối hợp các bộ phận kỹ thuật để hoàn thiện hồ sơ bản vẽ'
    ];
  }
  if (title.includes('sale') || title.includes('kinh doanh') || title.includes('tư vấn')) {
    return [
      'Tìm kiếm và khai thác nguồn khách hàng tiềm năng qua các kênh',
      'Tư vấn giải pháp thiết kế, thi công và đàm phán chốt hợp đồng',
      'Chăm sóc khách hàng và hỗ trợ các thủ tục bàn giao'
    ];
  }
  if (title.includes('giám sát') || title.includes('thi công')) {
    return [
      'Trực tiếp giám sát chất lượng và tiến độ thi công tại hiện trường',
      'Phối hợp với thầu phụ và xử lý các phát sinh kỹ thuật',
      'Nghiệm thu hạng mục và báo cáo tiến độ công việc'
    ];
  }
  if (title.includes('kế toán')) {
    return [
      'Theo dõi và hạch toán chi phí công trình, thu chi nội bộ',
      'Kiểm soát công nợ, vật tư và thực hiện các báo cáo tài chính',
      'Phối hợp cùng các phòng ban liên quan'
    ];
  }
  return [
    'Thực hiện các công việc chuyên môn theo vị trí tuyển dụng',
    'Phối hợp cùng các bộ phận hoàn thành đúng tiến độ công việc'
  ];
}

function formatJobForGroup(job, groupInfo = null, isFanpage = false) {
  const sections = [];

  // 1. Tiêu đề chuẩn JobCentral: [TUYỂN DỤNG] TÊN VỊ TRÍ
  let cleanTitle = cleanJobTitle(job.title || job.cong_viec || job.chuc_vu || 'Tuyển dụng')
    .replace(/^Tuyển\s+/i, '')
    .toUpperCase();

  sections.push(`[TUYỂN DỤNG] ${cleanTitle}`);

  // 2. Số lượng
  if (job.so_luong && job.so_luong !== 'Không đề cập' && job.so_luong !== 'Không yêu cầu') {
    sections.push(`Số lượng: ${fixSpellingAndSpacing(job.so_luong)}`);
  }

  // 3. Mô tả công việc
  let descLines = [];
  if (job.description && job.description !== 'Không đề cập') {
    descLines = cleanConciseLines(job.description, 6, ['địa điểm làm việc']);
  }
  if (descLines.length === 0) {
    descLines = inferJobDescription(job);
  }
  if (descLines.length > 0) {
    sections.push(`Mô tả công việc:\n${descLines.map(l => '- ' + l.replace(/^[-•*]\s*/, '')).join('\n')}`);
  }

  // 4. Yêu cầu ứng viên
  const reqLines = [];
  if (job.kinh_nghiem && job.kinh_nghiem !== 'Không yêu cầu' && job.kinh_nghiem !== 'Không đề cập') {
    reqLines.push(`Kinh nghiệm: ${cleanBulletLine(job.kinh_nghiem)}`);
  }
  if (job.ky_nang && job.ky_nang !== 'Không đề cập') {
    job.ky_nang.split('\n').forEach(l => {
      const cl = cleanBulletLine(l);
      if (cl && !isCategoryHeaderOnly(cl) && !reqLines.includes(cl)) reqLines.push(cl);
    });
  }
  if (job.bang_cap && job.bang_cap !== 'Không đề cập' && job.bang_cap !== 'Không yêu cầu') {
    const bc = cleanBulletLine(job.bang_cap);
    if (bc && !isCategoryHeaderOnly(bc) && !reqLines.includes(bc)) reqLines.push(bc);
  }
  if (reqLines.length === 0 && job.requirements) {
    job.requirements.split('\n').forEach(l => {
      const cl = cleanBulletLine(l);
      if (cl && !isCategoryHeaderOnly(cl) && !reqLines.includes(cl)) reqLines.push(cl);
    });
  }
  if (reqLines.length > 0) {
    sections.push(`Yêu cầu ứng viên:\n${reqLines.map(l => '- ' + l.replace(/^[-•*]\s*/, '')).join('\n')}`);
  }

  // 5. Quyền lợi & phúc lợi
  const benLines = [];
  if (job.salary && job.salary !== 'Không đề cập') {
    benLines.push(`Mức lương: ${shortenSalary(job.salary)}`);
  }
  if (job.benefits && job.benefits !== 'Không đề cập') {
    job.benefits.split('\n').forEach(l => {
      const cl = cleanBulletLine(l);
      if (cl && !isCategoryHeaderOnly(cl) && !benLines.includes(cl)) benLines.push(cl);
    });
  }
  if (benLines.length > 0) {
    sections.push(`Quyền lợi & phúc lợi:\n${benLines.map(l => '- ' + l.replace(/^[-•*]\s*/, '')).join('\n')}`);
  }

  // 6. Hình thức làm việc
  const jobType = job.loai_hinh_cong_viec || job.jobType || 'Toàn thời gian';
  sections.push(`Hình thức làm việc: ${jobType}`);

  // 7. Địa điểm làm việc
  const loc = cleanJobLocations(job.detailedLocation || job.dia_diem_chi_tiet, job.location || job.tinh_thanh);
  if (loc) {
    sections.push(`Địa điểm làm việc:\n- ${loc}`);
  }

  // 8. Chân bài theo kênh đăng: Group vs Fanpage
  if (isFanpage) {
    const provTag = toCleanHashtag(job.location || job.tinh_thanh || 'HoChiMinh');
    const brandTag = toCleanHashtag(job.company || 'DoanhNghiep');
    sections.push(`Bạn quan tâm vị trí này? Comment hoặc ib để nhận thông tin chi tiết nhé!\n\n#ViecLam${provTag} #${brandTag} #JobCentral\n\n🔗https://www.facebook.com/JobCentralVietNam/`);
  } else {
    const phone = job.contactPhone || job.phone || '0971946725';
    sections.push(`Thông tin liên hệ:\n- Ứng viên quan tâm vui lòng liên hệ Hotline/Zalo: ${phone}\n- Nhắn tin Zalo ứng tuyển: https://zalo.me/${phone}\n- Nhận việc ngay sau khi phỏng vấn.`);
  }

  return sections.join('\n\n');
}

/**
 * Làm mới nội dung (Anti-Duplicate Filter / Content Spinning) cho từng nhóm Facebook:
 * - Thay đổi Hook/Tiêu đề luân phiên (🔔, 📢, 💼, ✨, 🎯)
 * - Thay đổi câu kêu gọi Zalo luân phiên (Mặc định 0971946725)
 * - Chèn ký tự Zero-Width Space (\u200B) ngẫu nhiên để thay đổi mã băm (MD5/SHA) kiểm tra trùng lặp của Meta
 */
function spinPostForGroup(postText, groupIndex = 0, groupName = '') {
  if (!postText) return '';
  let text = String(postText);

  // 1. Luân phiên Câu kêu gọi Zalo (Luôn dùng Zalo mặc định 0971946725)
  const phone = '0971946725';

  const ctaVariations = [
    `📲 Ứng tuyển: Liên hệ Zalo ${phone}`,
    `📲 Ứng tuyển nhanh: Nhắn tin qua Zalo ${phone}`,
    `📲 Liên hệ nhận việc trực tiếp qua Zalo: ${phone}`,
    `📲 Đăng ký phỏng vấn: Kết bạn / Nhắn Zalo ${phone}`,
    `📲 Ứng viên quan tâm vui lòng gửi tin qua Zalo: ${phone}`
  ];
  const selectedCta = ctaVariations[groupIndex % ctaVariations.length];
  text = text.replace(/📲\s*(?:Ứng tuyển|Liên hệ).*$/gim, selectedCta);

  // 2. Luân phiên Hook / Icon đầu bài nếu có dạng 🔔 / 📢 / 💼 / ✨ / 🎯
  const hookPrefixes = ['🔔', '📢', '💼', '✨', '🎯'];
  const newHook = hookPrefixes[groupIndex % hookPrefixes.length];
  text = text.replace(/^(?:🔔|📢|💼|✨|🎯)\s*/, `${newHook}  `);

  // 3. Salt với Zero-Width Space (\u200B) vào các từ chữ cái để tạo Hash MD5/SHA duy nhất cho Meta
  const words = text.split(' ');
  if (words.length > 5) {
    const saltCount = Math.min(6, Math.max(2, Math.floor(words.length / 12)));
    for (let s = 0; s < saltCount; s++) {
      const idx = (groupIndex * 7 + s * 11 + 3) % words.length;
      if (words[idx] && words[idx].length >= 2 && !/[\uD800-\uDFFF]/.test(words[idx])) {
        words[idx] = words[idx] + '\u200B';
      }
    }
    text = words.join(' ');
  }

  return text;
}

module.exports = {
  cleanJobTitle,
  fixSpellingAndSpacing,
  shortenSalary,
  cleanCompanyName,
  cleanBulletLine,
  condenseBulletLine,
  cleanConciseLines,
  cleanJobDescription,
  cleanJobRequirements,
  cleanJobBenefits,
  cleanJobLocations,
  removeVietnameseTones,
  toCleanHashtag,
  formatJobForGroup,
  spinPostForGroup
};



