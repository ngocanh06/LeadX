/**
 * fanpageMatcher.js - Tự động phát hiện và gợi ý Fanpage phù hợp dựa trên vị trí của tin tuyển dụng
 */
const fanpageManager = require('./fanpageManager');

function removeTones(str) {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim();
}

const PROVINCE_KEYWORDS = {
  // Miền Nam
  '61580830558827': ['ho chi minh', 'tp hcm', 'tphcm', 'sai gon', 'hcm', 'quan 1', 'quan 2', 'quan 3', 'quan 7', 'quan 12', 'binh thanh', 'thu duc', 'go vap', 'tan binh', 'binh tan'],
  '61579832676048': ['binh duong', 'thu dau mot', 'thuan an', 'di an', 'ben cat', 'tan uyen', 'vsip'],
  '61580972371001': ['ba ria', 'vung tau', 'phu my', 'chau duc'],
  '61580527456696': ['dong nai', 'bien hoa', 'long thanh', 'nhon trach', 'trang bom'],
  '61580900524539': ['tay ninh', 'trang bang', 'go dau'],
  '61580552308006': ['can tho', 'ninh kieu', 'cai rang'],
  '61581666781988': ['soc trang'],
  '61581676531212': ['vinh long'],
  '61580531656525': ['dong thap', 'cao lanh', 'sa dec'],
  '61580465138457': ['tien giang', 'my tho'],
  '61580869867113': ['an giang', 'long xuyen', 'chau doc'],
  '61581522730932': ['ca mau'],

  // Miền Trung
  '61580677020698': ['da nang', 'hai chau', 'thanh khe', 'son tra', 'ngu hanh son', 'lien chieu', 'cam le', 'hoa vang'],
  '61580599871932': ['thanh hoa', 'sam son'],
  '61580626570641': ['nghe an', 'vinh', 'cua lo'],
  '61581104420894': ['ha tinh'],
  '61580370915511': ['quang tri', 'dong ha'],
  '61580327777409': ['hue', 'thua thien hue'],
  '61580484936579': ['quang ngai'],
  '61580502305375': ['gia lai', 'pleiku'],
  '61580531731740': ['dak lak', 'buon ma thuot', 'bmt'],
  '61580647199248': ['khanh hoa', 'nha trang', 'cam ranh'],
  '61580472454331': ['lam dong', 'da lat', 'bao loc'],

  // Miền Bắc
  '61581452815617': ['ha noi', 'cau giay', 'dong da', 'ba dinh', 'hoan kiem', 'hai ba trung', 'hoang mai', 'thanh xuan', 'ha dong', 'long bien'],
  '61580327318356': ['hai duong'],
  '61550922286393': ['lao cai', 'sa pa'],
  '61582216285075': ['thai nguyen'],
  '61581808272139': ['phu tho', 'viet tri'],
  '61581508752904': ['bac ninh', 'tu son'],
  '61581645521332': ['hung yen'],
  '61581820707232': ['hai phong', 'ngo quyen', 'le chan'],
  '61581752766199': ['ninh binh'],
  '61581388871329': ['lai chau'],
  '61573879271213': ['quang ninh', 'ha long', 'cam pha', 'uong bi']
};

class FanpageMatcher {
  /**
   * Khớp Fanpage phù hợp với bài đăng tuyển dụng
   * @param {object} job
   * @returns {{matchedPages: Array, isNationwide: boolean}}
   */
  match(job) {
    if (!job) return { matchedPages: [], isNationwide: false };

    const searchText = removeTones(
      `${job.title || ''} ${job.location || ''} ${job.province || ''} ${job.description || ''} ${job.postText || ''}`
    );

    const allPages = fanpageManager.getPages();
    const matchedIds = new Set();

    for (const [pageId, kwList] of Object.entries(PROVINCE_KEYWORDS)) {
      for (const kw of kwList) {
        if (searchText.includes(kw)) {
          matchedIds.add(pageId);
          break;
        }
      }
    }

    // Nếu không khớp tỉnh cụ thể nào hoặc tin toàn quốc -> Gợi ý Fanpage Tổng
    const isNationwide = matchedIds.size === 0 || searchText.includes('toan quoc');
    if (isNationwide) {
      const mainPage = allPages.find(p => p.isMain);
      if (mainPage) matchedIds.add(mainPage.id);
    }

    const matchedPages = allPages.filter(p => matchedIds.has(p.id));
    return {
      matchedPages,
      isNationwide,
      totalMatched: matchedPages.length
    };
  }
}

module.exports = new FanpageMatcher();
