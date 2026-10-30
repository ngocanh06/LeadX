/**
 * fanpageManager.js - Quản lý danh sách 34 Fanpage khu vực & Token Meta Graph API
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');

// Danh sách Fanpage thực tế được phân theo Miền và Tỉnh thành
const DEFAULT_FANPAGES = [
  // 🌟 FANPAGE TỔNG
  {
    id: 'JobCentralVietNam',
    name: 'JobCentral Việt Nam (Fanpage Tổng)',
    region: 'Toàn Quốc',
    province: 'Toàn Quốc',
    category: 'Main Page',
    link: 'https://www.facebook.com/JobCentralVietNam/',
    isMain: true
  },

  // 🌴 MIỀN NAM (12 Fanpages)
  {
    id: '807271762466056',
    legacyId: '61580830558827',
    name: 'Việc Làm TP. Hồ Chí Minh',
    region: 'Miền Nam',
    province: 'TP. Hồ Chí Minh',
    link: 'https://www.facebook.com/807271762466056'
  },
  {
    id: '739458715928135',
    legacyId: '61579832676048',
    name: 'Việc làm Bình Dương',
    region: 'Miền Nam',
    province: 'Bình Dương',
    link: 'https://www.facebook.com/739458715928135'
  },
  {
    id: '834155313106354',
    legacyId: '61580972371001',
    name: 'Việc Làm Bà Rịa - Vũng Tàu',
    region: 'Miền Nam',
    province: 'Bà Rịa - Vũng Tàu',
    link: 'https://www.facebook.com/834155313106354'
  },
  {
    id: '762741043594578',
    legacyId: '61580527456696',
    name: 'Việc làm Đồng Nai',
    region: 'Miền Nam',
    province: 'Đồng Nai',
    link: 'https://www.facebook.com/762741043594578'
  },
  {
    id: '781516258380618',
    legacyId: '61580900524539',
    name: 'Việc Làm Tây Ninh',
    region: 'Miền Nam',
    province: 'Tây Ninh',
    link: 'https://www.facebook.com/781516258380618'
  },
  {
    id: '742151562322896',
    legacyId: '61580552308006',
    name: 'Việc Làm Cần Thơ',
    region: 'Miền Nam',
    province: 'Cần Thơ',
    link: 'https://www.facebook.com/742151562322896'
  },
  {
    id: '856877704165123',
    legacyId: '61581666781988',
    name: 'Việc Làm Sóc Trăng',
    region: 'Miền Nam',
    province: 'Sóc Trăng',
    link: 'https://www.facebook.com/856877704165123'
  },
  {
    id: '796466226886725',
    legacyId: '61581676531212',
    name: 'Việc Làm Vĩnh Long',
    region: 'Miền Nam',
    province: 'Vĩnh Long',
    link: 'https://www.facebook.com/796466226886725'
  },
  {
    id: '827210107136186',
    legacyId: '61580531656525',
    name: 'Việc Làm Đồng Tháp',
    region: 'Miền Nam',
    province: 'Đồng Tháp',
    link: 'https://www.facebook.com/827210107136186'
  },
  {
    id: '782407998291764',
    legacyId: '61580465138457',
    name: 'Việc Làm Tiền Giang',
    region: 'Miền Nam',
    province: 'Tiền Giang',
    link: 'https://www.facebook.com/782407998291764'
  },
  {
    id: '763162423552668',
    legacyId: '61580869867113',
    name: 'Việc làm An Giang',
    region: 'Miền Nam',
    province: 'An Giang',
    link: 'https://www.facebook.com/763162423552668'
  },
  {
    id: '794052057130926',
    legacyId: '61581522730932',
    name: 'Việc làm Cà Mau',
    region: 'Miền Nam',
    province: 'Cà Mau',
    link: 'https://www.facebook.com/794052057130926'
  },

  // 🌊 MIỀN TRUNG (11 Fanpages)
  {
    id: '61580599871932',
    name: 'Việc làm Thanh Hóa',
    region: 'Miền Trung',
    province: 'Thanh Hóa',
    link: 'https://www.facebook.com/profile.php?id=61580599871932'
  },
  {
    id: '61580626570641',
    name: 'Việc làm Nghệ An',
    region: 'Miền Trung',
    province: 'Nghệ An',
    link: 'https://www.facebook.com/profile.php?id=61580626570641'
  },
  {
    id: '61581104420894',
    name: 'Việc làm Hà Tĩnh',
    region: 'Miền Trung',
    province: 'Hà Tĩnh',
    link: 'https://www.facebook.com/profile.php?id=61581104420894'
  },
  {
    id: '61580370915511',
    name: 'Việc làm Quảng Trị',
    region: 'Miền Trung',
    province: 'Quảng Trị',
    link: 'https://www.facebook.com/profile.php?id=61580370915511'
  },
  {
    id: '61580327777409',
    name: 'Việc làm Huế',
    region: 'Miền Trung',
    province: 'Thừa Thiên Huế',
    link: 'https://www.facebook.com/profile.php?id=61580327777409'
  },
  {
    id: '61580677020698',
    name: 'Việc Làm Đà Nẵng',
    region: 'Miền Trung',
    province: 'Đà Nẵng',
    link: 'https://www.facebook.com/profile.php?id=61580677020698'
  },
  {
    id: '61580484936579',
    name: 'Việc Làm Quảng Ngãi',
    region: 'Miền Trung',
    province: 'Quảng Ngãi',
    link: 'https://www.facebook.com/profile.php?id=61580484936579'
  },
  {
    id: '61580502305375',
    name: 'Việc làm Gia Lai',
    region: 'Miền Trung',
    province: 'Gia Lai',
    link: 'https://www.facebook.com/profile.php?id=61580502305375'
  },
  {
    id: '61580531731740',
    name: 'Việc làm Đắk Lắk',
    region: 'Miền Trung',
    province: 'Đắk Lắk',
    link: 'https://www.facebook.com/profile.php?id=61580531731740'
  },
  {
    id: '61580647199248',
    name: 'Việc làm Khánh Hòa',
    region: 'Miền Trung',
    province: 'Khánh Hòa',
    link: 'https://www.facebook.com/profile.php?id=61580647199248'
  },
  {
    id: '61580472454331',
    name: 'Việc Làm Lâm Đồng',
    region: 'Miền Trung',
    province: 'Lâm Đồng',
    link: 'https://www.facebook.com/profile.php?id=61580472454331'
  },

  // 🏔️ MIỀN BẮC (11 Fanpages)
  {
    id: '61581452815617',
    name: 'Việc làm Hà Nội',
    region: 'Miền Bắc',
    province: 'Hà Nội',
    link: 'https://www.facebook.com/profile.php?id=61581452815617'
  },
  {
    id: '61580327318356',
    name: 'Việc Làm Hải Dương',
    region: 'Miền Bắc',
    province: 'Hải Dương',
    link: 'https://www.facebook.com/profile.php?id=61580327318356'
  },
  {
    id: '61550922286393',
    name: 'Việc Làm Lào Cai',
    region: 'Miền Bắc',
    province: 'Lào Cai',
    link: 'https://www.facebook.com/profile.php?id=61550922286393'
  },
  {
    id: '61582216285075',
    name: 'Việc Làm Thái Nguyên',
    region: 'Miền Bắc',
    province: 'Thái Nguyên',
    link: 'https://www.facebook.com/profile.php?id=61582216285075'
  },
  {
    id: '61581808272139',
    name: 'Việc Làm Phú Thọ',
    region: 'Miền Bắc',
    province: 'Phú Thọ',
    link: 'https://www.facebook.com/profile.php?id=61581808272139'
  },
  {
    id: '61581508752904',
    name: 'Việc Làm Bắc Ninh',
    region: 'Miền Bắc',
    province: 'Bắc Ninh',
    link: 'https://www.facebook.com/profile.php?id=61581508752904'
  },
  {
    id: '61581645521332',
    name: 'Việc làm Hưng Yên',
    region: 'Miền Bắc',
    province: 'Hưng Yên',
    link: 'https://www.facebook.com/profile.php?id=61581645521332'
  },
  {
    id: '61581820707232',
    name: 'Việc Làm Hải Phòng',
    region: 'Miền Bắc',
    province: 'Hải Phòng',
    link: 'https://www.facebook.com/profile.php?id=61581820707232'
  },
  {
    id: '61581752766199',
    name: 'Việc làm Ninh Bình',
    region: 'Miền Bắc',
    province: 'Ninh Bình',
    link: 'https://www.facebook.com/profile.php?id=61581752766199'
  },
  {
    id: '61581388871329',
    name: 'Việc làm Lai Châu',
    region: 'Miền Bắc',
    province: 'Lai Châu',
    link: 'https://www.facebook.com/profile.php?id=61581388871329'
  },
  {
    id: '61573879271213',
    name: 'Việc làm Quảng Ninh',
    region: 'Miền Bắc',
    province: 'Quảng Ninh',
    link: 'https://www.facebook.com/profile.php?id=61573879271213'
  }
];

class FanpageManager {
  constructor() {
    this.configFile = path.resolve(config.rootDir, 'data/fanpage_config.json');
    this.config = {
      systemUserToken: process.env.META_SYSTEM_USER_ACCESS_TOKEN || '',
      pageTokens: {},
      lastUpdated: null
    };
    this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const raw = fs.readFileSync(this.configFile, 'utf8');
        const parsed = JSON.parse(raw);
        this.config = { ...this.config, ...parsed };
      }
    } catch (err) {
      logger.warn(`Không đọc được cấu hình fanpage: ${err.message}`);
    }
  }

  async saveConfig(newConfig = {}) {
    try {
      const systemUserToken = newConfig.token !== undefined ? newConfig.token : (newConfig.systemUserToken !== undefined ? newConfig.systemUserToken : this.config.systemUserToken);

      let pageTokens = newConfig.pageTokens || this.config.pageTokens || {};
      const regionTokens = newConfig.regionTokens || this.config.regionTokens || {};

      // Danh sách các token cần đồng bộ (System token + 3 Region tokens)
      const tokensToSync = [];
      if (systemUserToken && systemUserToken.length > 15) {
        tokensToSync.push({ token: systemUserToken, label: 'Hệ thống' });
      }
      if (regionTokens['Miền Nam'] && regionTokens['Miền Nam'].length > 15) {
        tokensToSync.push({ token: regionTokens['Miền Nam'], label: 'Miền Nam' });
      }
      if (regionTokens['Miền Trung'] && regionTokens['Miền Trung'].length > 15) {
        tokensToSync.push({ token: regionTokens['Miền Trung'], label: 'Miền Trung' });
      }
      if (regionTokens['Miền Bắc'] && regionTokens['Miền Bắc'].length > 15) {
        tokensToSync.push({ token: regionTokens['Miền Bắc'], label: 'Miền Bắc' });
      }

      // Tự động phân giải và lưu Page Access Token cho từng Fanpage từ các token được cấp
      for (const tItem of tokensToSync) {
        try {
          const metaApiClient = require('../../../core/services/metaApiClient');
          const axios = require('axios');
          const accountsRes = await axios.get(`${metaApiClient.baseUrl}/${metaApiClient.apiVersion}/me/accounts`, {
            params: { access_token: tItem.token.trim(), fields: 'id,name,access_token' },
            timeout: 12000
          });
          const fetchedPages = accountsRes.data?.data || [];
          let syncedCount = 0;
          fetchedPages.forEach(p => {
            if (p.id && p.access_token) {
              pageTokens[p.id] = p.access_token;
              syncedCount++;
            }
          });
          if (syncedCount > 0) {
            logger.success(`[FanpageManager] Đã tự động đồng bộ ${syncedCount} Page Access Token từ tài khoản ${tItem.label}!`);
          }
        } catch (e) {
          logger.warn(`[FanpageManager] Không thể tự động trích xuất Page Tokens (${tItem.label}): ${e.message}`);
        }
      }

      this.config = {
        ...this.config,
        ...newConfig,
        systemUserToken,
        regionTokens,
        pageTokens,
        lastUpdated: new Date().toISOString()
      };
      fs.writeFileSync(this.configFile, JSON.stringify(this.config, null, 2), 'utf8');
      const count = Object.keys(pageTokens).length;
      return {
        success: true,
        message: count > 0 
          ? `Đã lưu cấu hình Meta Graph API thành công! (Tự động đồng bộ ${count} Fanpage Token vĩnh viễn)`
          : 'Đã lưu cấu hình Meta Fanpage thành công!',
        pageTokensCount: count
      };
    } catch (err) {
      logger.error(`Lỗi lưu cấu hình fanpage: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  getConfig() {
    const regionTokens = this.config.regionTokens || {};
    return {
      hasSystemToken: Boolean(this.config.systemUserToken && this.config.systemUserToken.length > 15),
      systemUserTokenMasked: this.config.systemUserToken
        ? `${this.config.systemUserToken.substring(0, 10)}...${this.config.systemUserToken.slice(-6)}`
        : '',
      regionTokens: {
        'Miền Nam': regionTokens['Miền Nam'] ? `${regionTokens['Miền Nam'].substring(0, 10)}...${regionTokens['Miền Nam'].slice(-6)}` : '',
        'Miền Trung': regionTokens['Miền Trung'] ? `${regionTokens['Miền Trung'].substring(0, 10)}...${regionTokens['Miền Trung'].slice(-6)}` : '',
        'Miền Bắc': regionTokens['Miền Bắc'] ? `${regionTokens['Miền Bắc'].substring(0, 10)}...${regionTokens['Miền Bắc'].slice(-6)}` : '',
      },
      hasRegionToken: {
        'Miền Nam': Boolean(regionTokens['Miền Nam'] && regionTokens['Miền Nam'].length > 15),
        'Miền Trung': Boolean(regionTokens['Miền Trung'] && regionTokens['Miền Trung'].length > 15),
        'Miền Bắc': Boolean(regionTokens['Miền Bắc'] && regionTokens['Miền Bắc'].length > 15),
      },
      pageTokensCount: Object.keys(this.config.pageTokens || {}).length,
      lastUpdated: this.config.lastUpdated
    };
  }

  getPages({ region, province, query } = {}) {
    let list = DEFAULT_FANPAGES.map(p => {
      const specificToken = this.config.pageTokens?.[p.id] || (p.legacyId ? this.config.pageTokens?.[p.legacyId] : null);
      const regionToken = this.config.regionTokens?.[p.region];
      const effectiveToken = specificToken || regionToken || this.config.systemUserToken || '';
      const hasToken = Boolean(effectiveToken && effectiveToken.length > 15);

      return {
        ...p,
        hasToken,
        status: hasToken ? 'READY' : 'NEEDS_TOKEN'
      };
    });

    if (region && region !== 'ALL') {
      list = list.filter(p => p.region === region);
    }
    if (province && province !== 'ALL') {
      list = list.filter(p => p.province === province);
    }
    if (query) {
      const q = query.toLowerCase().trim();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.province.toLowerCase().includes(q) ||
        p.region.toLowerCase().includes(q) ||
        p.id.includes(q)
      );
    }

    return list;
  }

  getPageById(pageId) {
    if (!pageId) return null;
    const pId = String(pageId).trim();
    let page = DEFAULT_FANPAGES.find(p => p.id === pId || p.legacyId === pId || (p.link && p.link.includes(pId)));
    if (!page) {
      page = DEFAULT_FANPAGES.find(p => p.province && pId.toLowerCase().includes(p.province.toLowerCase()));
    }
    if (!page) return null;

    const specificToken = this.config.pageTokens?.[page.id] || (page.legacyId ? this.config.pageTokens?.[page.legacyId] : null);
    const regionToken = this.config.regionTokens?.[page.region];
    const effectiveToken = specificToken || regionToken || this.config.systemUserToken || '';
    return {
      ...page,
      token: effectiveToken,
      hasToken: Boolean(effectiveToken && effectiveToken.length > 15)
    };
  }

  getStats() {
    const pages = this.getPages();
    return {
      total: pages.length,
      mainPage: pages.filter(p => p.isMain).length,
      south: pages.filter(p => p.region === 'Miền Nam').length,
      central: pages.filter(p => p.region === 'Miền Trung').length,
      north: pages.filter(p => p.region === 'Miền Bắc').length,
      readyCount: pages.filter(p => p.hasToken).length,
      hasSystemToken: Boolean(this.config.systemUserToken && this.config.systemUserToken.length > 15)
    };
  }
}

module.exports = new FanpageManager();
