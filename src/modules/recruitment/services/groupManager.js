/**
 * groupManager.js - Quản lý danh sách các Hội Nhóm Facebook mục tiêu
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const accountManager = require('../../../core/services/accountManager');

class GroupManager {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.primaryGroupsFile = path.resolve(rootDir, 'data/recruitment/groups.json');
    this.legacyGroupsFile = path.resolve(rootDir, 'data/groups.json');
    this.groupsFile = fs.existsSync(this.primaryGroupsFile) ? this.primaryGroupsFile : this.legacyGroupsFile;

    this.primarySettingsFile = path.resolve(rootDir, 'data/recruitment/group_settings.json');
    this.legacySettingsFile = path.resolve(rootDir, 'data/group_settings.json');
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
        this.groupSheetUrl = process.env.GOOGLE_SHEET_GROUP_CSV_URL || '';
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
      logger.error('Lỗi khi lưu file group_settings.json:', err.message);
    }
  }

  getGroupSheetUrl() {
    return this.groupSheetUrl;
  }

  setGroupSheetUrl(url) {
    this.groupSheetUrl = String(url || '').trim();
    this.saveSettings();
  }

  normalizeSheetUrl(url) {
    if (!url) return '';
    let clean = String(url).trim();

    if (clean.includes('output=csv') || clean.includes('format=csv')) {
      return clean;
    }

    if (clean.includes('/pub')) {
      return `${clean.split('?')[0]}?output=csv`;
    }

    const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      const sheetId = match[1];
      const gidMatch = clean.match(/gid=([0-9]+)/);
      const gidParam = gidMatch ? `&gid=${gidMatch[1]}` : '';
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv${gidParam}`;
    }

    return clean;
  }

  loadGroups() {
    try {
      const target = fs.existsSync(this.primaryGroupsFile) ? this.primaryGroupsFile : this.legacyGroupsFile;
      if (fs.existsSync(target)) {
        const content = fs.readFileSync(target, 'utf8');
        this.groups = JSON.parse(content);
      } else {
        this.groups = [];
      }
    } catch (err) {
      logger.error('Lỗi khi đọc file groups.json:', err.message);
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
    } catch (err) {
      logger.error('Lỗi khi lưu file groups.json:', err.message);
    }
  }

  /**
   * Lấy danh sách hội nhóm với trạng thái tham gia (isJoined) được tính toán riêng biệt cho từng tài khoản
   */
  getGroups({ province = '', category = '', status = 'ALL', accountId = null } = {}) {
    let list = this.loadGroups();

    // Xác định account ID cần kiểm tra (mặc định là tài khoản đang kích hoạt)
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';

    // Tính toán trạng thái isJoined và status chuẩn xác cho targetAccountId
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

    if (province) {
      list = list.filter(g => g.province.toLowerCase().includes(province.toLowerCase()));
    }

    if (category) {
      list = list.filter(g => g.category.toLowerCase().includes(category.toLowerCase()));
    }

    if (status !== 'ALL') {
      list = list.filter(g => g.status === status);
    }

    return list;
  }

  /**
   * Thống kê hội nhóm theo từng tài khoản riêng biệt
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
    const provinceBreakdown = {};

    list.forEach(g => {
      if (g.isJoined) joinedCount++;
      else unjoinedCount++;

      const rawP = (g.province || 'Toàn quốc').trim();
      let normP = rawP;
      if (/hồ chí minh|hcm|tp hcm|sài gòn/i.test(rawP)) {
        normP = 'TP Hồ Chí Minh';
      } else if (/đà nẵng|da nang/i.test(rawP)) {
        normP = 'Đà Nẵng';
      } else if (/bình dương|binh duong/i.test(rawP)) {
        normP = 'Bình Dương';
      } else if (/quảng nam|quang nam/i.test(rawP)) {
        normP = 'Quảng Nam';
      } else if (/toàn quốc|toan quoc/i.test(rawP)) {
        normP = 'Toàn quốc';
      }

      provinceBreakdown[normP] = (provinceBreakdown[normP] || 0) + 1;

      if (normP === 'Đà Nẵng') {
        daNangCount++;
      } else if (normP === 'TP Hồ Chí Minh') {
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
      provinceBreakdown,
      accountId: targetAccountId
    };
  }

  addGroup({ name, url, province = 'Toàn quốc', category = 'Tổng hợp', members = 'N/A' }) {
    const id = `group_${Date.now()}`;
    const newGroup = {
      id,
      name: name.trim(),
      url: url.trim(),
      province: province.trim(),
      category: category.trim(),
      status: 'READY',
      members,
      lastPostedAt: null
    };

    this.groups.push(newGroup);
    this.saveGroups();
    return newGroup;
  }

  updateGroup(id, updates) {
    const group = this.groups.find(g => g.id === id);
    if (!group) return null;

    Object.assign(group, updates);
    this.saveGroups();
    return group;
  }

  deleteGroup(id) {
    const initialLen = this.groups.length;
    this.groups = this.groups.filter(g => g.id !== id);
    this.saveGroups();
    return this.groups.length < initialLen;
  }

  deleteGroupsByIds(ids = []) {
    const idSet = new Set(ids);
    const initialLen = this.groups.length;
    this.groups = this.groups.filter(g => !idSet.has(g.id));
    this.saveGroups();
    return {
      deletedCount: initialLen - this.groups.length,
      remainingCount: this.groups.length
    };
  }

  deleteUnjoinedGroups({ accountId = null, scope = 'current' } = {}) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const initialLen = this.groups.length;

    if (scope === 'all_accounts') {
      // Xóa các nhóm mà KHÔNG CÓ BẤT KỲ tài khoản nào tham gia
      this.groups = this.groups.filter(g => {
        const hasJoinedMembership = Object.values(g.memberships || {}).some(m => m && m.isJoined);
        const legacyJoined = Boolean(g.isJoined);
        return hasJoinedMembership || legacyJoined;
      });
    } else {
      // Mặc định: Xóa các nhóm mà targetAccountId chưa tham gia (giữ lại các nhóm targetAccountId đã tham gia)
      this.groups = this.groups.filter(g => {
        if (g.memberships && g.memberships[targetAccountId] !== undefined) {
          return Boolean(g.memberships[targetAccountId].isJoined);
        }
        if (g.isJoined !== undefined && (!g.memberships || Object.keys(g.memberships).length === 0)) {
          return Boolean(g.isJoined);
        }
        return false;
      });
    }

    this.saveGroups();
    return {
      deletedCount: initialLen - this.groups.length,
      remainingCount: this.groups.length
    };
  }

  clearAll() {
    this.groups = [];
    this.saveGroups();
    return true;
  }

  addBulkGroups(groupList = []) {
    let addedCount = 0;
    let updatedCount = 0;
    groupList.forEach(item => {
      if (!item.url) return;
      const cleanUrl = String(item.url).trim();
      
      // Tránh trùng lặp URL
      const existing = this.groups.find(g => g.url.toLowerCase() === cleanUrl.toLowerCase());
      if (!existing) {
        const id = `group_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const isJoined = Boolean(item.isJoined);
        const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
        const memberships = {};
        if (isJoined) {
          memberships[currentAccId] = { isJoined: true, joinedAt: new Date().toISOString() };
        }
        this.groups.push({
          id,
          name: (item.name || `Nhóm ${this.groups.length + 1}`).trim(),
          url: cleanUrl,
          province: (item.province || 'Toàn quốc').trim(),
          category: (item.category || 'Tuyển dụng').trim(),
          status: isJoined ? 'READY' : 'NOT_JOINED',
          isJoined,
          memberships,
          members: item.members || item.membersStr || 'N/A',
          privacy: item.privacy || 'UNKNOWN',
          lastPostedAt: null
        });
        addedCount++;
      } else {
        updatedCount++;
        if (item.name && (!existing.name || existing.name.startsWith('Nhóm '))) {
          existing.name = item.name.trim();
        }
        if (item.members && (!existing.members || existing.members === 'N/A')) {
          existing.members = item.members;
        }
        if (item.province && (!existing.province || existing.province === 'Toàn quốc')) {
          existing.province = item.province.trim();
        }
        if (item.privacy && (!existing.privacy || existing.privacy === 'UNKNOWN')) {
          existing.privacy = item.privacy;
        }
        if (item.isJoined !== undefined) {
          const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
          if (!existing.memberships) existing.memberships = {};
          existing.memberships[currentAccId] = { isJoined: Boolean(item.isJoined), joinedAt: item.isJoined ? new Date().toISOString() : null };
          existing.isJoined = Boolean(item.isJoined);
          if (existing.status === 'NOT_JOINED' && existing.isJoined) {
            existing.status = 'READY';
          }
        }
      }
    });

    this.saveGroups();
    return { added: addedCount, updated: updatedCount, total: this.groups.length };
  }

  updateGroupMembership(idOrUrl, isJoined = true, accountId = null) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const cleanKey = String(idOrUrl || '').toLowerCase().trim().replace(/\/+$/, '');
    const target = this.groups.find(g => {
      if (g.id === idOrUrl) return true;
      const gUrl = String(g.url || '').toLowerCase().trim().replace(/\/+$/, '');
      return gUrl === cleanKey || (cleanKey.length > 10 && (gUrl.includes(cleanKey) || cleanKey.includes(gUrl)));
    });
    if (target) {
      if (!target.memberships) target.memberships = {};
      target.memberships[targetAccountId] = {
        isJoined: Boolean(isJoined),
        joinedAt: isJoined ? new Date().toISOString() : null
      };

      const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
      if (currentAccId === targetAccountId) {
        target.isJoined = Boolean(isJoined);
        if (isJoined && target.status === 'NOT_JOINED') {
          target.status = 'READY';
        } else if (!isJoined && target.status === 'READY') {
          target.status = 'NOT_JOINED';
        }
      }

      this.saveGroups();
      return target;
    }
    return null;
  }

  copyMemberships(sourceAccountId, targetAccountId) {
    if (!sourceAccountId || !targetAccountId || sourceAccountId === targetAccountId) return 0;
    let count = 0;
    this.groups.forEach(g => {
      if (!g.memberships) g.memberships = {};
      const sourceState = g.memberships[sourceAccountId];
      if (sourceState && sourceState.isJoined) {
        g.memberships[targetAccountId] = {
          isJoined: true,
          joinedAt: sourceState.joinedAt || new Date().toISOString()
        };
        count++;
      }
    });
    const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
    if (currentAccId === targetAccountId) {
      this.groups.forEach(g => {
        const isJ = Boolean(g.memberships?.[targetAccountId]?.isJoined);
        g.isJoined = isJ;
        if (isJ && g.status === 'NOT_JOINED') g.status = 'READY';
      });
    }
    this.saveGroups();
    return count;
  }

  resetMemberships(accountId) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    let count = 0;
    this.groups.forEach(g => {
      if (!g.memberships) g.memberships = {};
      g.memberships[targetAccountId] = {
        isJoined: false,
        joinedAt: null
      };
      count++;
    });

    const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
    if (currentAccId === targetAccountId) {
      this.groups.forEach(g => {
        g.isJoined = false;
        if (g.status === 'READY') g.status = 'NOT_JOINED';
      });
    }

    this.saveGroups();
    return count;
  }

  markGroupPosted(id, postDetails = {}, accountId = null) {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const target = this.groups.find(g => g.id === id);
    if (target) {
      if (!target.memberships) target.memberships = {};
      target.memberships[targetAccountId] = {
        isJoined: true,
        joinedAt: new Date().toISOString()
      };
    }
    return this.updateGroup(id, {
      status: 'POSTED',
      isJoined: true,
      lastPostedAt: new Date().toISOString(),
      lastPostTitle: postDetails.title || null
    });
  }

  /**
   * Đồng bộ danh sách Hội Nhóm từ Google Sheets
   */
  async syncFromSheet(customUrl = null, override = false) {
    const axios = require('axios');
    const csvParser = require('csv-parser');
    const { Readable } = require('stream');

    const rawUrl = customUrl || this.groupSheetUrl;
    if (!rawUrl) {
      throw new Error('Chưa cấu hình đường dẫn Google Sheets cho Hội Nhóm. Vui lòng nhập link sheet nhóm trước.');
    }

    const downloadUrl = this.normalizeSheetUrl(rawUrl);
    logger.info(`Đang đồng bộ Hội Nhóm từ Google Sheets: ${downloadUrl}`);

    const response = await axios.get(downloadUrl, {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
    });

    // Tự động nhận diện dòng tiêu đề nếu trang tính có dòng tiêu đề banner ở đầu
    const rawLines = response.data.split(/\r?\n/);
    let headerLineIndex = 0;
    for (let i = 0; i < Math.min(rawLines.length, 10); i++) {
      const lineLower = rawLines[i].toLowerCase();
      if ((lineLower.includes('link') || lineLower.includes('group') || lineLower.includes('nhóm') || lineLower.includes('url')) &&
          (lineLower.includes('tên') || lineLower.includes('name') || lineLower.includes('tỉnh') || lineLower.includes('stt'))) {
        headerLineIndex = i;
        break;
      }
    }

    const cleanCsvData = rawLines.slice(headerLineIndex).join('\n');
    const results = [];
    const stream = Readable.from([cleanCsvData]);
    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
        .on('data', (data) => results.push(data))
        .on('end', resolve)
        .on('error', reject);
    });


    let currentProvince = 'Toàn quốc';
    const validGroups = [];

    results.forEach((row) => {
      // 1. Nhận diện tỉnh thành linh hoạt
      const provinceCol = row['TỈNH'] || row['Tỉnh'] || row['Tỉnh Thành'] || row['Tỉnh thành'] || row['Khu vực'] || row['Province'] || row['Location'] || '';
      if (provinceCol && provinceCol.trim()) {
        currentProvince = provinceCol.trim();
      }

      // 2. Nhận diện link nhóm linh hoạt
      let url = row['LINK GROUP'] || row['Link Group'] || row['Link nhóm'] || row['LINK NHÓM'] || row['Link'] || row['URL'] || row['Facebook'] || row['Link Facebook'] || row['Group'] || row['Link cần thiết'] || row['Nhóm'] || '';
      
      // Nếu không khớp tên cột, quét tất cả các cell trong hàng để tìm link chứa facebook.com/groups/
      if (!url) {
        for (const key of Object.keys(row)) {
          const val = String(row[key] || '').trim();
          if (val.includes('facebook.com/groups/') || val.includes('fb.com/groups/')) {
            url = val;
            break;
          }
        }
      }

      // 3. Nhận diện tên nhóm
      let name = row['TÊN GROUP'] || row['Tên Group'] || row['Tên nhóm'] || row['TÊN NHÓM'] || row['Tên'] || row['Name'] || row['Group Name'] || '';
      
      // 4. Nhận diện thành viên
      const members = row['THÀNH VIÊN \nHIỆN TẠI'] || row['THÀNH VIÊN HIỆN TẠI'] || row['Thành viên'] || row['Số lượng thành viên'] || row['Members'] || row['Số lượng'] || 'N/A';

      if (url && (url.includes('facebook.com') || url.includes('fb.com') || url.startsWith('http'))) {
        let cleanUrl = url.trim();
        const urlMatch = cleanUrl.match(/https?:\/\/(www\.)?(facebook\.com|fb\.com)\/groups\/[^\s\/?#]+/i);
        if (urlMatch) {
          cleanUrl = urlMatch[0] + '/';
        } else if (!cleanUrl.endsWith('/') && !cleanUrl.includes('?')) {
          cleanUrl += '/';
        }

        validGroups.push({
          name: name ? name.trim() : `Nhóm ${validGroups.length + 1}`,
          url: cleanUrl,
          province: currentProvince,
          category: 'Tuyển dụng',
          members: String(members).trim()
        });
      }
    });

    if (validGroups.length === 0) {
      throw new Error('Không tìm thấy link nhóm Facebook hợp lệ trong bảng tính. Vui lòng kiểm tra lại URL sheet hoặc định dạng cột.');
    }

    if (override) {
      this.clearAll();
    }

    const syncResult = this.addBulkGroups(validGroups);
    if (customUrl) {
      this.setGroupSheetUrl(customUrl);
    }

    logger.success(`Đã đồng bộ thành công ${syncResult.added} nhóm mới từ Google Sheets (Tổng: ${syncResult.total} nhóm).`);
    return {
      added: syncResult.added,
      total: syncResult.total,
      validFound: validGroups.length
    };
  }
}

module.exports = new GroupManager();
