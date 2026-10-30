/**
 * locationMatcher.js - Bộ ánh xạ thông minh & chuẩn xác 100% Tỉnh/Thành sang Fanpage
 */

const PROVINCE_MAPPING = {
  // MIỀN NAM
  '61580830558827': {
    pageName: 'Việc làm TP. Hồ Chí Minh',
    region: 'Miền Nam',
    province: 'HoChiMinh',
    keywords: ['hồ chí minh', 'tp.hcm', 'tphcm', 'sài gòn', 'hcm', 'quận 1', 'quận 2', 'quận 3', 'quận 4', 'quận 5', 'quận 6', 'quận 7', 'quận 8', 'quận 9', 'quận 10', 'quận 11', 'quận 12', 'bình thạnh', 'thủ đức', 'gò vấp', 'tân bình', 'tân phú', 'phú nhuận', 'bình tân', 'nhà bè', 'hóc môn', 'củ chi', 'bình chánh', 'cần giờ']
  },
  '61579832676048': {
    pageName: 'Việc Làm Bình Dương',
    region: 'Miền Nam',
    province: 'BinhDuong',
    keywords: ['bình dương', 'thủ dầu một', 'thuận an', 'dĩ an', 'bến cát', 'tân uyên', 'bàu bàng', 'dầu tiếng', 'phú giáo', 'kcn sóng thần', 'vsip bình dương', 'vsip 1', 'vsip 2']
  },
  '61580972371001': {
    pageName: 'Việc Làm Bà Rịa - Vũng Tàu',
    region: 'Miền Nam',
    province: 'BaRiaVungTau',
    keywords: ['bà rịa', 'vũng tàu', 'bà rịa - vũng tàu', 'phú mỹ', 'châu đức', 'xuyên mộc', 'đất đỏ', 'long điền']
  },
  '61580527456696': {
    pageName: 'Việc Làm Đồng Nai',
    region: 'Miền Nam',
    province: 'DongNai',
    keywords: ['đồng nai', 'biên hòa', 'long thành', 'nhơn trạch', 'trảng bom', 'vĩnh cửu', 'thống nhất', 'cẩm mỹ', 'định quán', 'long khánh']
  },
  '61580900524539': {
    pageName: 'Việc làm Tây Ninh',
    region: 'Miền Nam',
    province: 'TayNinh',
    keywords: ['tây ninh', 'trảng bàng', 'gò dầu', 'hòa thành', 'bến cầu', 'châu thành', 'tân biên', 'tân châu']
  },
  '61580552308006': {
    pageName: 'Việc làm Cần Thơ',
    region: 'Miền Nam',
    province: 'CanTho',
    keywords: ['cần thơ', 'ninh kiều', 'cái răng', 'bình thủy', 'ô môn', 'thốt nốt', 'phong điền']
  },
  '61581666781988': {
    pageName: 'Việc làm Sóc Trăng',
    region: 'Miền Nam',
    province: 'SocTrang',
    keywords: ['sóc trăng', 'vĩnh châu', 'ngã năm']
  },
  '61581676531212': {
    pageName: 'Việc làm Vĩnh Long',
    region: 'Miền Nam',
    province: 'VinhLong',
    keywords: ['vĩnh long', 'bình minh', 'long hồ']
  },
  '61580531656525': {
    pageName: 'Việc làm Đồng Tháp',
    region: 'Miền Nam',
    province: 'DongThap',
    keywords: ['đồng tháp', 'cao lãnh', 'sa đéc', 'hồng ngự']
  },
  '61580465138457': {
    pageName: 'Việc làm Tiền Giang',
    region: 'Miền Nam',
    province: 'TienGiang',
    keywords: ['tiền giang', 'mỹ tho', 'gò công', 'cai lậy']
  },
  '61580869867113': {
    pageName: 'Việc Làm An Giang',
    region: 'Miền Nam',
    province: 'AnGiang',
    keywords: ['an giang', 'long xuyên', 'châu đốc', 'tân châu']
  },
  '61581522730932': {
    pageName: 'Việc Làm Cà Mau',
    region: 'Miền Nam',
    province: 'CaMau',
    keywords: ['cà mau', 'năm căn', 'u minh']
  },

  // MIỀN TRUNG
  '61580599871932': {
    pageName: 'Việc làm Thanh Hóa',
    region: 'Miền Trung',
    province: 'ThanhHoa',
    keywords: ['thanh hóa', 'nghi sơn', 'sầm sơn', 'bỉm sơn', 'hạc thành']
  },
  '61580626570641': {
    pageName: 'Việc làm Nghệ An',
    region: 'Miền Trung',
    province: 'NgheAn',
    keywords: ['nghệ an', 'vinh', 'cửa lò', 'hoàng mai', 'thái hòa']
  },
  '61581104420894': {
    pageName: 'Việc làm Hà Tĩnh',
    region: 'Miền Trung',
    province: 'HaTinh',
    keywords: ['hà tĩnh', 'kỳ anh', 'vũng áng', 'hồng lĩnh']
  },
  '61580370915511': {
    pageName: 'Việc làm Quảng Trị',
    region: 'Miền Trung',
    province: 'QuangTri',
    keywords: ['quảng trị', 'đông hà', 'la vang']
  },
  '61580327777409': {
    pageName: 'Việc làm Huế',
    region: 'Miền Trung',
    province: 'Hue',
    keywords: ['huế', 'thừa thiên huế', 'thừa thiên - huế', 'hương thủy', 'hương trà']
  },
  '61580677020698': {
    pageName: 'Việc Làm Đà Nẵng',
    region: 'Miền Trung',
    province: 'DaNang',
    keywords: ['đà nẵng', 'hải châu', 'thanh khê', 'liên chiểu', 'sơn trà', 'ngũ hành sơn', 'cẩm lệ', 'hòa vang']
  },
  '61580484936579': {
    pageName: 'Việc Làm Quảng Ngãi',
    region: 'Miền Trung',
    province: 'QuangNgai',
    keywords: ['quảng ngãi', 'dung quất', 'đức phổ']
  },
  '61580502305375': {
    pageName: 'Việc làm Gia Lai',
    region: 'Miền Trung',
    province: 'GiaLai',
    keywords: ['gia lai', 'pleiku', 'an khê', 'ayun pa']
  },
  '61580531731740': {
    pageName: 'Việc làm Đắk Lắk',
    region: 'Miền Trung',
    province: 'DakLak',
    keywords: ['đắk lắk', 'buôn ma thuột', 'đắc lắc', 'buôn hồ']
  },
  '61580647199248': {
    pageName: 'Việc làm Khánh Hòa',
    region: 'Miền Trung',
    province: 'KhanhHoa',
    keywords: ['khánh hòa', 'nha trang', 'cam ranh', 'ninh hòa', 'vạn ninh']
  },
  '61580472454331': {
    pageName: 'Việc Làm Lâm Đồng',
    region: 'Miền Trung',
    province: 'LamDong',
    keywords: ['lâm đồng', 'đà lạt', 'bảo lộc', 'đức trọng', 'đơn dương']
  },

  // MIỀN BẮC
  '61581452815617': {
    pageName: 'Việc làm Hà Nội',
    region: 'Miền Bắc',
    province: 'HaNoi',
    keywords: ['hà nội', 'cầu giấy', 'đống đa', 'hoàng mai', 'nam từ liêm', 'bắc từ liêm', 'hà đông', 'thanh xuân', 'ba đình', 'hoàn kiếm', 'hai bà trưng', 'tây hồ', 'long biên', 'đông anh', 'gia lâm', 'mê linh', 'sóc sơn', 'thanh trì', 'thường tín', 'hoài đức', 'thạch thất', 'quốc oai']
  },
  '61580327318356': {
    pageName: 'Việc Làm Hải Dương',
    region: 'Miền Bắc',
    province: 'HaiDuong',
    keywords: ['hải dương', 'chí linh', 'kinh môn', 'cẩm giàng', 'nam sách', 'kim thành', 'thanh hà', 'bình giang', 'gia lộc', 'tứ kỳ', 'ninh giang', 'thanh miện', 'kcn đại an', 'kcn tân trường', 'vsip hải dương']
  },
  '61550922286393': {
    pageName: 'Việc Làm Lào Cai',
    region: 'Miền Bắc',
    province: 'LaoCai',
    keywords: ['lào cai', 'sa pa', 'bát xát', 'bảo thắng', 'bắc hà', 'mường khương', 'si ma cai']
  },
  '61582216285075': {
    pageName: 'Việc Làm Thái Nguyên',
    region: 'Miền Bắc',
    province: 'ThaiNguyen',
    keywords: ['thái nguyên', 'sông công', 'phổ yên', 'đại từ']
  },
  '61581808272139': {
    pageName: 'Việc Làm Phú Thọ',
    region: 'Miền Bắc',
    province: 'PhuTho',
    keywords: ['phú thọ', 'việt trì', 'phúc yên', 'lâm thao']
  },
  '61581508752904': {
    pageName: 'Việc Làm Bắc Ninh',
    region: 'Miền Bắc',
    province: 'BacNinh',
    keywords: ['bắc ninh', 'từ sơn', 'yên phong', 'quế võ', 'thuận thành', 'tiên du', 'gia bình', 'lương tài', 'vsip bắc ninh', 'tiên sơn', 'đại đồng']
  },
  '61581645521332': {
    pageName: 'Việc làm Hưng Yên',
    region: 'Miền Bắc',
    province: 'HungYen',
    keywords: ['hưng yên', 'phố nối', 'mỹ hào', 'văn giang', 'yên mỹ', 'kim động']
  },
  '61581820707232': {
    pageName: 'Việc Làm Hải Phòng',
    region: 'Miền Bắc',
    province: 'HaiPhong',
    keywords: ['hải phòng', 'thủy nguyên', 'hải an', 'ngô quyền', 'lê chân', 'kiến an', 'đồ sơn', 'an dương']
  },
  '61581752766199': {
    pageName: 'Việc làm Ninh Bình',
    region: 'Miền Bắc',
    province: 'NinhBinh',
    keywords: ['ninh bình', 'tam điệp', 'hoa lư', 'gia viễn', 'đồng văn']
  },
  '61581388871329': {
    pageName: 'Việc làm Lai Châu',
    region: 'Miền Bắc',
    province: 'LaiChau',
    keywords: ['lai châu', 'mường tè', 'tam đường']
  },
  '61573879271213': {
    pageName: 'Việc làm Quảng Ninh',
    region: 'Miền Bắc',
    province: 'QuangNinh',
    keywords: ['quảng ninh', 'hạ long', 'cẩm phả', 'uông bí', 'móng cái', 'đông triều', 'quảng yên']
  }
};

function normalizeName(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/tp\.?\s*/g, '')
    .replace(/thanh pho\s*/g, '')
    .replace(/tinh\s*/g, '')
    .trim();
}

// Pre-normalize all keywords in PROVINCE_MAPPING once at startup for high throughput
for (const [pageId, info] of Object.entries(PROVINCE_MAPPING)) {
  info.keywordsNorm = info.keywords.map(normalizeName);
  info.pageProvinceNorm = normalizeName(info.pageName.replace(/Việc làm/gi, '').trim());
  info.firstThreeKeywordsNorm = info.keywordsNorm.slice(0, 3);
}

function findAllMatchingPages(job) {
  if (job._matchedPages) return job._matchedPages;

  const matched = [];
  const primaryLocNorm = normalizeName(job.location || job.province || '');

  // 1. So khớp trực tiếp tỉnh thành chính của Job
  for (const [pageId, info] of Object.entries(PROVINCE_MAPPING)) {
    if (info.keywordsNorm.some(kw => primaryLocNorm === kw || primaryLocNorm.includes(kw))) {
      matched.push({
        pageId,
        pageName: info.pageName,
        region: info.region,
        province: info.province
      });
      break;
    }
  }

  // 2. So khớp phụ nếu có địa điểm chi tiết
  if (job.detailedLocation || job.description) {
    const detailedNorm = normalizeName((job.detailedLocation || '') + ' ' + (job.description || '').substring(0, 300));
    for (const [pageId, info] of Object.entries(PROVINCE_MAPPING)) {
      if (matched.some(m => m.pageId === pageId)) continue;
      const hasPrefixMatch = detailedNorm.includes(`${info.pageProvinceNorm}:`) ||
                             detailedNorm.includes(`${info.pageProvinceNorm} :`) ||
                             info.firstThreeKeywordsNorm.some(kw => detailedNorm.includes(kw));
      if (hasPrefixMatch) {
        matched.push({
          pageId,
          pageName: info.pageName,
          region: info.region,
          province: info.province
        });
      }
    }
  }

  job._matchedPages = matched;
  return matched;
}

function findMatchingPageId(job) {
  const all = findAllMatchingPages(job);
  return all.length > 0 ? all[0].pageId : '61581452815617';
}

function getJobsForPage(allJobs, pageId, limit = 2) {
  const matched = [];
  for (const job of allJobs) {
    const matchedPages = findAllMatchingPages(job);
    if (matchedPages.some(p => p.pageId === pageId)) {
      matched.push(job);
      if (matched.length >= limit) break;
    }
  }
  return matched;
}

module.exports = {
  PROVINCE_MAPPING,
  findAllMatchingPages,
  findMatchingPageId,
  getJobsForPage
};
