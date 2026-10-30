/**
 * bdsGroupManager.js - Quản lý danh sách các Hội Nhóm Facebook Bất Động Sản (LeadX Real Estate Group Engine)
 * Chuyên trách quản lý các Group BĐS Đà Nẵng, TP.HCM, Hà Nội & Toàn Quốc
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const accountManager = require('../../../core/services/accountManager');

class BdsGroupManager {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.primaryGroupsFile = path.resolve(rootDir, 'data/bds/bds_groups.json');
    this.legacyGroupsFile = path.resolve(rootDir, 'data/bds_groups.json');
    this.groupsFile = fs.existsSync(this.primaryGroupsFile) ? this.primaryGroupsFile : this.legacyGroupsFile;

    this.primarySettingsFile = path.resolve(rootDir, 'data/bds/bds_group_settings.json');
    this.legacySettingsFile = path.resolve(rootDir, 'data/bds_group_settings.json');
    this.settingsFile = fs.existsSync(this.primarySettingsFile) ? this.primarySettingsFile : this.legacySettingsFile;

    this.groups = [];
    this.groupSheetUrl = '';
    this.loadSettings();
    this.loadGroups();
  }

  loadSettings() {
    try {
      const target = fs.existsSync(this.primarySettingsFile) ? this.primarySettingsFile : this.legacySettingsFile;
      if (fs.existsSync(target)) {
        const data = JSON.parse(fs.readFileSync(target, 'utf8'));
        this.groupSheetUrl = data.groupSheetUrl || '';
      } else {
        this.groupSheetUrl = '';
      }
    } catch (err) {
      this.groupSheetUrl = '';
    }
  }

  saveSettings() {
    try {
      const payload = JSON.stringify({ groupSheetUrl: this.groupSheetUrl }, null, 2);
      [this.primarySettingsFile, this.legacySettingsFile].forEach(f => {
        try {
          const dir = path.dirname(f);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(f, payload, 'utf8');
        } catch (_) {}
      });
    } catch (err) {
      logger.error('Lỗi khi lưu file bds_group_settings.json:', err.message);
    }
  }

  getGroupSheetUrl() {
    return this.groupSheetUrl;
  }

  setGroupSheetUrl(url) {
    this.groupSheetUrl = String(url || '').trim();
    this.saveSettings();
  }

  loadGroups() {
    try {
      const target = fs.existsSync(this.primaryGroupsFile) ? this.primaryGroupsFile : this.legacyGroupsFile;
      if (fs.existsSync(target)) {
        const content = fs.readFileSync(target, 'utf8');
        this.groups = JSON.parse(content);
        if (!Array.isArray(this.groups)) this.groups = [];
      } else {
        this.groups = this._getDefaultSampleGroups();
        this.saveGroups();
      }
    } catch (err) {
      logger.error('Lỗi khi đọc file bds_groups.json:', err.message);
      this.groups = [];
    }
    return this.groups;
  }

  saveGroups() {
    try {
      const payload = JSON.stringify(this.groups, null, 2);
      [this.primaryGroupsFile, this.legacyGroupsFile].forEach(f => {
        try {
          const dir = path.dirname(f);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(f, payload, 'utf8');
        } catch (_) {}
      });
      return true;
    } catch (err) {
      logger.error('Lỗi khi lưu file bds_groups.json:', err.message);
      return false;
    }
  }

  _getDefaultSampleGroups() {
    return [
      {
        id: 'bds_grp_101',
        name: 'Hội Thuê Nhà & Căn Hộ Đà Nẵng (Chính Chủ & Môi Giới)',
        url: 'https://www.facebook.com/groups/chothuecanhodanang/',
        province: 'Đà Nẵng',
        district: 'Sơn Trà & Ngũ Hành Sơn',
        category: 'Cho Thuê Căn Hộ',
        members: '185.000',
        status: 'READY',
        isJoined: true,
        memberships: {
          acc_primary: { isJoined: true, status: 'MEMBER', joinedAt: '2026-09-01T08:00:00Z' }
        },
        lastPostedAt: null
      },
      {
        id: 'bds_grp_102',
        name: 'Cho Thuê Căn Hộ & Phòng Trọ Sơn Trà - Ngũ Hành Sơn Đà Nẵng',
        url: 'https://www.facebook.com/groups/canhosontranguhanhson/',
        province: 'Đà Nẵng',
        district: 'Sơn Trà',
        category: 'Cho Thuê Căn Hộ',
        members: '128.500',
        status: 'READY',
        isJoined: true,
        memberships: {
          acc_primary: { isJoined: true, status: 'MEMBER', joinedAt: '2026-09-02T09:30:00Z' }
        },
        lastPostedAt: null
      },
      {
        id: 'bds_grp_103',
        name: 'Căn Hộ Cho Thuê Đà Nẵng - Studio & Căn Hộ Dịch Vụ',
        url: 'https://www.facebook.com/groups/canhodichvudanang/',
        province: 'Đà Nẵng',
        district: 'Hải Châu',
        category: 'Studio & Căn Hộ',
        members: '96.200',
        status: 'READY',
        isJoined: true,
        memberships: {
          acc_primary: { isJoined: true, status: 'MEMBER', joinedAt: '2026-09-03T10:15:00Z' }
        },
        lastPostedAt: null
      },
      {
        id: 'bds_grp_104',
        name: 'Bất Động Sản Đà Nẵng - Mua Bán & Cho Thuê BĐS',
        url: 'https://www.facebook.com/groups/batdongsandanang247/',
        province: 'Đà Nẵng',
        district: 'Toàn thành phố',
        category: 'Bất Động Sản',
        members: '215.000',
        status: 'READY',
        isJoined: true,
        memberships: {
          acc_primary: { isJoined: true, status: 'MEMBER', joinedAt: '2026-09-05T14:20:00Z' }
        },
        lastPostedAt: null
      },
      {
        id: 'bds_grp_105',
        name: 'Thuê Căn Hộ Khách Tây Đà Nẵng - Da Nang Apartments For Rent',
        url: 'https://www.facebook.com/groups/danangexpatsapartments/',
        province: 'Đà Nẵng',
        district: 'Ngũ Hành Sơn',
        category: 'Khách Nước Ngoài / Expat',
        members: '84.300',
        status: 'READY',
        isJoined: true,
        memberships: {
          acc_primary: { isJoined: true, status: 'MEMBER', joinedAt: '2026-09-06T11:00:00Z' }
        },
        lastPostedAt: null
      },
      {
        id: 'bds_grp_106',
        name: 'Phòng Trọ & Căn Hộ Mini Thanh Khê - Hải Châu - Đà Nẵng',
        url: 'https://www.facebook.com/groups/thuecanhothanhkhehaichau/',
        province: 'Đà Nẵng',
        district: 'Thanh Khê',
        category: 'Studio & 1PN',
        members: '112.000',
        status: 'READY',
        isJoined: true,
        memberships: {
          acc_primary: { isJoined: true, status: 'MEMBER', joinedAt: '2026-09-08T08:45:00Z' }
        },
        lastPostedAt: null
      },
      {
        id: 'bds_grp_107',
        name: 'Cộng Đồng Môi Giới BĐS & Cho Thuê Nhà Đà Nẵng',
        url: 'https://www.facebook.com/groups/moigioibdsdanang/',
        province: 'Đà Nẵng',
        district: 'Toàn thành phố',
        category: 'Bất Động Sản',
        members: '76.400',
        status: 'READY',
        isJoined: false,
        memberships: {},
        lastPostedAt: null
      },
      {
        id: 'bds_grp_108',
        name: 'Cho Thuê Căn Hộ Cao Cấp View Biển Mỹ Khê - Sơn Trà',
        url: 'https://www.facebook.com/groups/canhoviewbiendanang/',
        province: 'Đà Nẵng',
        district: 'Sơn Trà',
        category: 'Cho Thuê Căn Hộ',
        members: '68.900',
        status: 'READY',
        isJoined: false,
        memberships: {},
        lastPostedAt: null
      }
    ];
  }

  /**
   * Lấy danh sách hội nhóm BĐS với bộ lọc & trạng thái thành viên theo accountId
   */
  getGroups({ province = '', district = '', category = '', status = 'ALL', search = '', accountId = null } = {}) {
    let list = this.loadGroups();
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';

    list = list.map(g => {
      let isJoined = false;
      if (g.memberships && g.memberships[targetAccountId] !== undefined) {
        isJoined = Boolean(g.memberships[targetAccountId].isJoined);
      } else if (g.isJoined !== undefined && (!g.memberships || Object.keys(g.memberships).length === 0)) {
        isJoined = Boolean(g.isJoined);
      }
      const joinedAccounts = Object.keys(g.memberships || {}).filter(accId => g.memberships[accId]?.isJoined);

      return {
        ...g,
        isJoined,
        status: isJoined ? (g.status === 'POSTED' ? 'POSTED' : 'READY') : 'NOT_JOINED',
        joinedAccounts,
        currentViewAccountId: targetAccountId
      };
    });

    if (province && province !== 'ALL') {
      if (province === 'OTHER') {
        list = list.filter(g => {
          const p = (g.province || '').toLowerCase();
          return !p.includes('đà nẵng') && !p.includes('da nang') && !p.includes('hồ chí minh') && !p.includes('hcm');
        });
      } else {
        list = list.filter(g => (g.province || '').toLowerCase().includes(province.toLowerCase()));
      }
    }

    if (district && district !== 'ALL') {
      list = list.filter(g => (g.district || '').toLowerCase().includes(district.toLowerCase()));
    }

    if (category && category !== 'ALL') {
      list = list.filter(g => (g.category || '').toLowerCase().includes(category.toLowerCase()));
    }

    if (status && status !== 'ALL') {
      if (status === 'JOINED') {
        list = list.filter(g => g.isJoined);
      } else if (status === 'UNJOINED') {
        list = list.filter(g => !g.isJoined);
      } else {
        list = list.filter(g => g.status === status);
      }
    }

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(g =>
        (g.name || '').toLowerCase().includes(q) ||
        (g.url || '').toLowerCase().includes(q) ||
        (g.province || '').toLowerCase().includes(q) ||
        (g.district || '').toLowerCase().includes(q) ||
        (g.category || '').toLowerCase().includes(q)
      );
    }

    return list;
  }

  /**
   * Thống kê KPI hội nhóm BĐS
   */
  getGroupStats(accountId = null) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const list = this.getGroups({ accountId: targetAccountId });
    const total = list.length;
    let daNangCount = 0;
    let hcmCount = 0;
    let otherCount = 0;
    let joinedCount = 0;
    let unjoinedCount = 0;

    const districtBreakdown = {
      'Sơn Trà': 0,
      'Ngũ Hành Sơn': 0,
      'Hải Châu': 0,
      'Thanh Khê': 0,
      'Khác': 0
    };

    list.forEach(g => {
      if (g.isJoined) joinedCount++;
      else unjoinedCount++;

      const p = (g.province || '').toLowerCase();
      const d = (g.district || '').toLowerCase();

      if (p.includes('đà nẵng') || p.includes('da nang')) {
        daNangCount++;
        if (d.includes('sơn trà')) districtBreakdown['Sơn Trà']++;
        else if (d.includes('ngũ hành sơn')) districtBreakdown['Ngũ Hành Sơn']++;
        else if (d.includes('hải châu')) districtBreakdown['Hải Châu']++;
        else if (d.includes('thanh khê')) districtBreakdown['Thanh Khê']++;
        else districtBreakdown['Khác']++;
      } else if (p.includes('hồ chí minh') || p.includes('hcm') || p.includes('sài gòn')) {
        hcmCount++;
      } else {
        otherCount++;
      }
    });

    return {
      total,
      daNangCount,
      hcmCount,
      otherCount,
      joinedCount,
      unjoinedCount,
      districtBreakdown,
      accountId: targetAccountId
    };
  }

  addGroup({ name, url, province = 'Đà Nẵng', district = 'Toàn thành phố', category = 'Cho Thuê Căn Hộ', members = 'N/A' }) {
    if (!name || !url) throw new Error('Vui lòng cung cấp Tên nhóm và Link nhóm Facebook.');
    const id = `bds_grp_${Date.now()}`;
    const newGroup = {
      id,
      name: name.trim(),
      url: url.trim(),
      province: province.trim(),
      district: district.trim(),
      category: category.trim(),
      status: 'READY',
      members: members || 'N/A',
      isJoined: false,
      memberships: {},
      lastPostedAt: null,
      createdAt: new Date().toISOString()
    };

    this.groups.push(newGroup);
    this.saveGroups();
    return newGroup;
  }

  addBulkGroups(items) {
    if (!Array.isArray(items)) return { added: 0, total: this.groups.length };
    let added = 0;
    const existingUrls = new Set(this.groups.map(g => (g.url || '').toLowerCase().replace(/\/+$/, '')));
    items.forEach(item => {
      const url = (item.url || '').trim();
      if (!url) return;
      const cleanUrl = url.toLowerCase().replace(/\/+$/, '');
      if (existingUrls.has(cleanUrl)) return;
      existingUrls.add(cleanUrl);
      const newGroup = {
        id: `bds_grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        name: (item.name || url).trim(),
        url,
        province: item.province || 'Đà Nẵng',
        district: item.district || 'Toàn thành phố',
        category: item.category || 'Cho Thuê Căn Hộ',
        status: 'READY',
        members: item.members || 'N/A',
        isJoined: Boolean(item.isJoined),
        memberships: {},
        lastPostedAt: null,
        createdAt: new Date().toISOString()
      };
      this.groups.push(newGroup);
      added++;
    });
    if (added > 0) this.saveGroups();
    return { added, total: this.groups.length };
  }

  addGroupsBulk(rawText, defaultProvince = 'Đà Nẵng', defaultCategory = 'Cho Thuê Căn Hộ') {
    if (!rawText || !rawText.trim()) return { added: 0, skipped: 0 };
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    let added = 0;
    let skipped = 0;

    const existingUrls = new Set(this.groups.map(g => (g.url || '').toLowerCase().replace(/\/+$/, '')));

    for (const line of lines) {
      let url = '';
      let name = '';
      let province = defaultProvince;
      let district = 'Toàn thành phố';

      // Hỗ trợ dạng: Name | URL | Province
      if (line.includes('|')) {
        const parts = line.split('|').map(p => p.trim());
        name = parts[0];
        url = parts[1] || '';
        province = parts[2] || defaultProvince;
        district = parts[3] || 'Toàn thành phố';
      } else if (line.startsWith('http://') || line.startsWith('https://')) {
        url = line;
        // Trích xuất tên từ URL
        const match = line.match(/facebook\.com\/groups\/([^\/\?]+)/);
        name = match ? `Nhóm ${match[1]}` : `Nhóm BĐS Facebook`;
      } else {
        const tokens = line.split(/\s+/);
        const urlToken = tokens.find(t => t.startsWith('http://') || t.startsWith('https://'));
        if (urlToken) {
          url = urlToken;
          name = tokens.filter(t => t !== urlToken).join(' ') || 'Nhóm BĐS Facebook';
        }
      }

      if (!url) {
        skipped++;
        continue;
      }

      const cleanUrl = url.replace(/\/+$/, '').toLowerCase();
      if (existingUrls.has(cleanUrl)) {
        skipped++;
        continue;
      }

      existingUrls.add(cleanUrl);
      this.groups.push({
        id: `bds_grp_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: name || 'Nhóm BĐS Facebook',
        url: url.trim(),
        province: province || defaultProvince,
        district: district || 'Toàn thành phố',
        category: defaultCategory,
        status: 'READY',
        members: 'N/A',
        isJoined: false,
        memberships: {},
        lastPostedAt: null,
        createdAt: new Date().toISOString()
      });
      added++;
    }

    this.saveGroups();
    return { added, skipped, total: this.groups.length };
  }

  updateGroup(id, updates) {
    const group = this.groups.find(g => g.id === id);
    if (!group) return null;
    Object.assign(group, updates);
    this.saveGroups();
    return group;
  }

  deleteGroup(id) {
    const prev = this.groups.length;
    this.groups = this.groups.filter(g => g.id !== id);
    this.saveGroups();
    return this.groups.length < prev;
  }

  deleteGroupsByIds(ids = []) {
    const idSet = new Set(ids);
    const prev = this.groups.length;
    this.groups = this.groups.filter(g => !idSet.has(g.id));
    this.saveGroups();
    return { deletedCount: prev - this.groups.length, remainingCount: this.groups.length };
  }

  deleteUnjoinedGroups({ accountId = null } = {}) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const prev = this.groups.length;
    this.groups = this.groups.filter(g => {
      if (g.memberships && g.memberships[targetAccountId] !== undefined) {
        return Boolean(g.memberships[targetAccountId].isJoined);
      }
      return Boolean(g.isJoined);
    });
    this.saveGroups();
    return { deletedCount: prev - this.groups.length, remainingCount: this.groups.length };
  }

  clearAll() {
    const count = this.groups.length;
    this.groups = [];
    this.saveGroups();
    return count;
  }

  updateGroupMembership(id, isJoined, accountId = null) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const group = this.groups.find(g => g.id === id);
    if (!group) return null;

    if (!group.memberships) group.memberships = {};
    group.memberships[targetAccountId] = {
      isJoined: Boolean(isJoined),
      status: isJoined ? 'MEMBER' : 'NOT_JOINED',
      updatedAt: new Date().toISOString()
    };
    group.isJoined = Boolean(isJoined);
    this.saveGroups();
    return group;
  }

  markGroupPosted(id, info = {}) {
    const group = this.groups.find(g => g.id === id);
    if (group) {
      group.status = 'POSTED';
      group.lastPostedAt = new Date().toISOString();
      group.lastPostTitle = info.title || '';
      this.saveGroups();
    }
  }

  copyMemberships(sourceAccId, targetAccId) {
    if (!sourceAccId || !targetAccId) return { updatedCount: 0 };
    let updatedCount = 0;
    this.groups.forEach(g => {
      if (!g.memberships) g.memberships = {};
      const src = g.memberships[sourceAccId];
      if (src && src.isJoined) {
        g.memberships[targetAccId] = {
          isJoined: true,
          status: 'MEMBER',
          copiedFrom: sourceAccId,
          updatedAt: new Date().toISOString()
        };
        updatedCount++;
      }
    });
    this.saveGroups();
    return { updatedCount };
  }

  resetMemberships(accountId) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    let count = 0;
    this.groups.forEach(g => {
      if (g.memberships && g.memberships[targetAccountId]) {
        g.memberships[targetAccountId] = {
          isJoined: false,
          status: 'NOT_JOINED',
          resetAt: new Date().toISOString()
        };
        count++;
      }
    });
    this.saveGroups();
    return { resetCount: count };
  }
}

module.exports = new BdsGroupManager();
