/**
 * accountManager.js - Quản lý Đa Tài Khoản Facebook (Multi-Account Manager)
 * Cho phép lưu trữ nhiều tài khoản, chuyển đổi 1-chạm, theo dõi trạng thái làm mát (cooldown) từng nick
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const browserController = require('../automation/browserController');

class AccountManager {
  constructor() {
    this.accountsFile = path.resolve(config.rootDir, 'data/accounts.json');
    this.cookieFile = path.resolve(config.rootDir, 'data/cookies.json');
    this.initAccounts();
    // Tự động kiểm tra và giải phóng Action Block / Cooldown định kỳ mỗi 60 giây
    const timer = setInterval(() => {
      try {
        this.loadAccounts();
      } catch (e) {}
    }, 60 * 1000);
    if (timer && timer.unref) timer.unref();
  }

  /**
   * Khởi tạo file accounts.json nếu chưa tồn tại
   */
  initAccounts() {
    try {
      const dir = path.dirname(this.accountsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

      if (!fs.existsSync(this.accountsFile)) {
        let defaultAccounts = [];
        // Nếu đã có cookies.json hiện tại, tự động tạo tài khoản mặc định
        if (fs.existsSync(this.cookieFile)) {
          try {
            const raw = fs.readFileSync(this.cookieFile, 'utf8');
            const cookies = JSON.parse(raw);
            if (Array.isArray(cookies) && cookies.length > 0) {
              const cUser = cookies.find(c => c.name === 'c_user');
              const uid = cUser ? cUser.value : 'N/A';
              defaultAccounts.push({
                id: 'acc_primary',
                name: 'Tài Khoản Chính',
                fbUserId: uid,
                cookies,
                status: 'ACTIVE',
                cooldownUntil: null,
                postsToday: 0,
                totalPosts: 23,
                isCurrent: true,
                createdAt: new Date().toISOString(),
                lastUsedAt: new Date().toISOString()
              });
            }
          } catch (e) {}
        }
        fs.writeFileSync(this.accountsFile, JSON.stringify(defaultAccounts, null, 2), 'utf8');
      }
    } catch (err) {
      logger.error('Lỗi khởi tạo accounts.json:', err.message);
    }
  }

  /**
   * Đọc danh sách tài khoản và tự động giải phóng Action Block / Cooldown nếu đã hết thời gian
   */
  loadAccounts() {
    try {
      if (fs.existsSync(this.accountsFile)) {
        const raw = fs.readFileSync(this.accountsFile, 'utf8');
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          let modified = false;
          const now = new Date();

          for (const acc of list) {
            // Tự động giải phóng Action Block khi đã quá thời gian unblockAt
            if (acc.actionBlock && acc.actionBlock.unblockAt && now >= new Date(acc.actionBlock.unblockAt)) {
              logger.success(`[ACTION BLOCK AUTO-RESOLVE] Tài khoản "${acc.name}" đã hết hạn tạm khóa (${acc.actionBlock.featureName || 'Action Block'}). Tự động khôi phục ACTIVE.`);
              acc.actionBlock = null;
              if (acc.status === 'ACTION_BLOCKED') {
                acc.status = 'ACTIVE';
              }
              acc.updatedAt = now.toISOString();
              modified = true;
            }

            // Đảm bảo targetType và phân quyền Nhóm / Page tồn tại
            if (!acc.targetType) {
              acc.targetType = 'GROUP';
              modified = true;
            }
            if (acc.isCurrent && acc.isGroupCurrent === undefined) {
              acc.isGroupCurrent = true;
              modified = true;
            }
            if (acc.proxy === undefined) {
              acc.proxy = '';
              modified = true;
            }

            // Tự động giải phóng Cooldown khi đã quá thời gian cooldownUntil
            if (acc.cooldownUntil && now >= new Date(acc.cooldownUntil)) {
              if (acc.status === 'COOLDOWN') {
                logger.info(`[COOLDOWN AUTO-RESOLVE] Tài khoản "${acc.name}" đã kết thúc thời gian làm mát. Khôi phục ACTIVE.`);
                acc.status = 'ACTIVE';
              }
              acc.cooldownUntil = null;
              acc.updatedAt = now.toISOString();
              modified = true;
            }
          }

          if (modified) {
            fs.writeFileSync(this.accountsFile, JSON.stringify(list, null, 2), 'utf8');
          }

          return list;
        }
      }
    } catch (e) {
      logger.error('Lỗi khi đọc accounts.json:', e.message);
    }
    return [];
  }

  /**
   * Lưu danh sách tài khoản
   */
  saveAccounts(accounts) {
    try {
      fs.writeFileSync(this.accountsFile, JSON.stringify(accounts, null, 2), 'utf8');
      return true;
    } catch (err) {
      logger.error('Lỗi lưu accounts.json:', err.message);
      return false;
    }
  }

  /**
   * Lấy tài khoản đang được kích hoạt sử dụng
   */
  getCurrentAccount() {
    const accounts = this.loadAccounts();
    const current = accounts.find(a => a.isCurrent);
    return current || accounts[0] || null;
  }

  /**
   * Phân tích chuỗi cookie (JSON hoặc chuỗi text header)
   */
  parseCookieString(rawStr) {
    if (!rawStr) return [];
    let cookies = [];

    // Thử parse JSON
    try {
      const parsed = JSON.parse(rawStr);
      if (Array.isArray(parsed)) {
        for (const c of parsed) {
          if (c.name && c.value !== undefined) {
            cookies.push({
              name: String(c.name).trim(),
              value: String(c.value),
              domain: c.domain && c.domain.includes('facebook.com') ? c.domain : '.facebook.com',
              path: c.path || '/',
              httpOnly: Boolean(c.httpOnly || c.name === 'xs' || c.name === 'c_user' || c.name === 'datr' || c.name === 'sb'),
              secure: Boolean(c.secure !== undefined ? c.secure : true),
              sameSite: c.sameSite || 'Lax'
            });
          }
        }
      }
    } catch (e) {}

    // Parse dạng chuỗi Header name=value;
    if (cookies.length === 0) {
      const pairs = rawStr.split(';');
      for (let p of pairs) {
        p = p.trim();
        if (!p) continue;
        const idx = p.indexOf('=');
        if (idx > 0) {
          const name = p.slice(0, idx).trim();
          const value = p.slice(idx + 1).trim();
          if (name && value) {
            cookies.push({
              name,
              value,
              domain: '.facebook.com',
              path: '/',
              httpOnly: name === 'xs' || name === 'c_user' || name === 'sb' || name === 'datr',
              secure: true
            });
          }
        }
      }
    }

    return cookies;
  }

  /**
   * Thêm tài khoản mới vào hệ thống
   */
  addAccount({ name, cookieString, targetType = "GROUP", metaToken = "", fanpageNotes = "" }) {
    if (!name || !name.trim()) {
      throw new Error('Vui lòng nhập Tên gợi nhớ cho tài khoản (Ví dụ: Nick Tuyển Dụng 2).');
    }

    if (!cookieString || !cookieString.trim()) {
      throw new Error('Vui lòng dán chuỗi Cookie Facebook vào khung.');
    }

    const cookies = this.parseCookieString(cookieString);
    if (cookies.length === 0) {
      throw new Error('Định dạng Cookie không hợp lệ hoặc không có dữ liệu.');
    }

    const cUser = cookies.find(c => c.name === 'c_user');
    const xs = cookies.find(c => c.name === 'xs');
    if (!cUser || !xs) {
      throw new Error('Cookie thiếu trường c_user hoặc xs. Vui lòng lấy Cookie đầy đủ từ Facebook.');
    }

    const uid = cUser.value;
    const accounts = this.loadAccounts();

    // Kiểm tra xem UID đã tồn tại chưa
    const existing = accounts.find(a => a.fbUserId === uid);
    if (existing) {
      throw new Error(`Tài khoản có UID ${uid} đã tồn tại trong danh sách với tên "${existing.name}".`);
    }

    const isFirst = accounts.length === 0;
    const assignedType = targetType || 'GROUP';
    const newAccount = {
      id: `acc_${Date.now()}`,
      name: name.trim(),
      fbUserId: uid,
      cookies,
      proxy: (proxy || '').trim(),
      targetType: assignedType,
      metaToken: (metaToken || '').trim(),
      fanpageNotes: (fanpageNotes || '').trim(),
      status: 'ACTIVE',
      cooldownUntil: null,
      postsToday: 0,
      totalPosts: 0,
      isCurrent: isFirst,
      isGroupCurrent: isFirst || assignedType === 'GROUP' || assignedType === 'BOTH',
      isPageCurrent: isFirst || assignedType === 'PAGE',
      createdAt: new Date().toISOString(),
      lastUsedAt: isFirst ? new Date().toISOString() : null
    };

    accounts.push(newAccount);
    this.saveAccounts(accounts);
    logger.success(`Đã thêm tài khoản Facebook mới: ${newAccount.name} (UID: ${uid}, Proxy: ${newAccount.proxy || 'Trực tiếp'})`);

    // Nếu là tài khoản duy nhất hoặc đầu tiên, tự động kích hoạt
    if (isFirst) {
      this.switchAccount(newAccount.id);
    }

    return newAccount;
  }

  /**
   * Cập nhật thông tin hoặc thay thế Cookie của tài khoản
   */
  updateAccount(id, { name, cookieString, targetType, metaToken, fanpageNotes, proxy }) {
    const accounts = this.loadAccounts();
    const account = accounts.find(a => a.id === id);
    if (!account) throw new Error('Không tìm thấy tài khoản cần cập nhật.');

    if (name && name.trim()) {
      account.name = name.trim();
    }

    if (proxy !== undefined) {
      const oldProxy = account.proxy || '';
      account.proxy = proxy.trim();
      // Nếu proxy thay đổi và nick đang dùng, đóng browser để phiên sau ăn proxy mới
      if (account.isCurrent && oldProxy !== account.proxy) {
        try {
          if (browserController && browserController.browser) {
            browserController.close().catch(() => {});
          }
        } catch (_) {}
      }
    }

    if (cookieString && cookieString.trim()) {
      const cookies = this.parseCookieString(cookieString);
      const cUser = cookies.find(c => c.name === 'c_user');
      const xs = cookies.find(c => c.name === 'xs');
      if (!cUser || !xs) {
        throw new Error('Cookie mới không hợp lệ hoặc thiếu c_user/xs.');
      }
      account.cookies = cookies;
      account.fbUserId = cUser.value;
      account.status = 'ACTIVE';
      account.cooldownUntil = null;

      // Nếu đang là nick hiện tại, áp dụng cookie mới ngay lập tức
      if (account.isCurrent) {
        fs.writeFileSync(this.cookieFile, JSON.stringify(cookies, null, 2), 'utf8');
        try {
          if (browserController && browserController.page) {
            browserController.importCookies(JSON.stringify(cookies)).catch(e => {
              logger.warn(`Không thể nạp cookie vào trình duyệt đang mở: ${e.message}`);
            });
          }
        } catch (e) {}
      }
    }

    if (targetType) account.targetType = targetType;
    if (metaToken !== undefined) account.metaToken = metaToken.trim();
    if (fanpageNotes !== undefined) account.fanpageNotes = fanpageNotes.trim();

    account.updatedAt = new Date().toISOString();
    this.saveAccounts(accounts);
    return account;
  }

  /**
   * Xóa tài khoản
   */
  deleteAccount(id) {
    let accounts = this.loadAccounts();
    const target = accounts.find(a => a.id === id);
    if (!target) throw new Error('Không tìm thấy tài khoản cần xóa.');

    const wasCurrent = target.isCurrent;
    accounts = accounts.filter(a => a.id !== id);

    // Nếu xóa tài khoản đang kích hoạt, chuyển quyền cho tài khoản đầu tiên còn lại
    if (wasCurrent && accounts.length > 0) {
      accounts[0].isCurrent = true;
      fs.writeFileSync(this.cookieFile, JSON.stringify(accounts[0].cookies, null, 2), 'utf8');
    }

    this.saveAccounts(accounts);
    logger.info(`Đã xóa tài khoản: ${target.name} (${target.fbUserId})`);
    return { success: true, remaining: accounts.length };
  }

  /**
   * Chuyển đổi 1-chạm sang tài khoản khác (Switch Account)
   */
  async switchAccount(id) {
    const accounts = this.loadAccounts();
    const target = accounts.find(a => a.id === id);
    if (!target) throw new Error('Không tìm thấy tài khoản mục tiêu.');

    // Cập nhật cờ isCurrent
    accounts.forEach(a => {
      a.isCurrent = (a.id === id);
      if (a.id === id) a.lastUsedAt = new Date().toISOString();
    });
    this.saveAccounts(accounts);

    // Lưu cookie vào cookies.json
    fs.writeFileSync(this.cookieFile, JSON.stringify(target.cookies, null, 2), 'utf8');

    // Đóng browser cũ để tài khoản mới được khởi chạy với Profile & Proxy riêng biệt
    try {
      if (browserController && browserController.browser) {
        await browserController.close();
      }
    } catch (e) {}

    // Nạp vào Chrome của tool
    try {
      await browserController.importCookies(JSON.stringify(target.cookies));
      logger.success(`Đã chuyển đổi sang tài khoản: "${target.name}" (UID: ${target.fbUserId})`);
    } catch (err) {
      logger.warn(`Chuyển tài khoản trong trình duyệt gặp cảnh báo: ${err.message}`);
    }

    return {
      success: true,
      currentAccount: target,
      message: `Đã kích hoạt tài khoản: "${target.name}" (UID: ${target.fbUserId}) làm nick đăng bài chính thức.`
    };
  }

  /**
   * Đánh dấu tài khoản đang bị giới hạn làm mát (Cooldown)
   */
  markAccountCooldown(id, durationHours = 24, reason = '') {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    const cooldownUntil = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
    acc.status = 'COOLDOWN';
    acc.cooldownUntil = cooldownUntil;
    acc.lastCooldownReason = reason;

    this.saveAccounts(accounts);
    logger.warn(`[ACCOUNT MANAGER] Đã đặt thời gian làm mát cho "${acc.name}" đến ${cooldownUntil}`);
  }

  /**
   * Tăng biến đếm bài đăng của tài khoản hiện tại
   */
  incrementPostCount(id) {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) return;

    acc.postsToday = (acc.postsToday || 0) + 1;
    acc.totalPosts = (acc.totalPosts || 0) + 1;
    this.saveAccounts(accounts);
  }

  /**
   * Đánh dấu tài khoản bị Checkpoint / Vô hiệu hóa
   */
  markCheckpoint(id, reason = 'Tài khoản Facebook bị yêu cầu xác minh danh tính (Checkpoint 282).') {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) return false;

    acc.status = 'CHECKPOINT';
    acc.checkpointReason = reason;
    acc.checkpointAt = new Date().toISOString();
    this.saveAccounts(accounts);
    logger.error(`[CHECKPOINT] Tài khoản "${acc.name}" đã bị đánh dấu CHECKPOINT: ${reason}`);
    return true;
  }

  /**
   * Gỡ trạng thái Checkpoint sau khi người dùng đã xác minh thành công
   */
  resolveCheckpoint(id) {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) return false;

    acc.status = 'ACTIVE';
    acc.checkpointReason = null;
    acc.checkpointAt = null;
    acc.cooldownUntil = null;
    this.saveAccounts(accounts);
    logger.success(`[CHECKPOINT] Đã gỡ Checkpoint và kích hoạt lại tài khoản "${acc.name}".`);
    return true;
  }

  /**
   * Đánh dấu tài khoản bị Facebook chặn tính năng tạm thời (Action Block)
   * Ví dụ: Do xin vào hơn 20 nhóm liên tiếp nên bị FB chặn tính năng xin vào nhóm trong vài giờ
   */
  markActionBlocked(id, feature = 'JOIN_GROUP', reason = '', durationHours = 6) {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) return false;

    const now = new Date();
    const unblockAt = new Date(now.getTime() + durationHours * 3600 * 1000).toISOString();
    const featureName = feature === 'JOIN_GROUP' ? 'Xin Vào Nhóm (Join Group)' : 'Đăng Bài (Post)';

    acc.status = 'ACTION_BLOCKED';
    acc.actionBlock = {
      feature,
      featureName,
      reason: reason || 'Thuật toán Facebook tạm khóa tính năng do gửi yêu cầu liên tục quá nhanh ("Giờ bạn chưa dùng được tính năng này để bảo vệ khỏi spam"). Nút xin vào nhóm sẽ không có tác dụng trên Facebook trong vài giờ.',
      blockedAt: now.toISOString(),
      unblockAt,
      recommendation: 'Để tài khoản nghỉ ngơi hoàn toàn từ 2 - 6 tiếng. Tuyệt đối không tiếp tục bấm xin vào nhóm để tránh bị Facebook quét checkpoint 282.'
    };
    acc.updatedAt = now.toISOString();

    this.saveAccounts(accounts);
    logger.warn(`[ACTION BLOCK] Tài khoản "${acc.name}" đã bị đánh dấu ACTION_BLOCKED (${featureName}) đến ${unblockAt}`);
    return true;
  }

  /**
   * Gỡ trạng thái Action Block sau khi Facebook đã nhả chặn
   */
  clearActionBlock(id) {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) return false;

    acc.status = 'ACTIVE';
    acc.actionBlock = null;
    acc.updatedAt = new Date().toISOString();

    this.saveAccounts(accounts);
    logger.success(`[ACTION BLOCK] Đã gỡ trạng thái chặn tính năng cho tài khoản "${acc.name}".`);
    return true;
  }


  /**
   * Lấy tài khoản đang kích hoạt dùng cho NHÓM
   */
  getCurrentGroupAccount() {
    const accounts = this.loadAccounts();
    const groupAccs = accounts.filter(a => a.targetType === 'GROUP' || a.targetType === 'BOTH' || !a.targetType);
    const current = groupAccs.find(a => a.isGroupCurrent) || groupAccs.find(a => a.isCurrent) || groupAccs[0];
    return current || this.getCurrentAccount();
  }

  /**
   * Lấy tài khoản đang kích hoạt dùng cho FANPAGE
   */
  getCurrentPageAccount() {
    const accounts = this.loadAccounts();
    const pageAccs = accounts.filter(a => a.targetType === 'PAGE' || a.targetType === 'BOTH');
    const current = pageAccs.find(a => a.isPageCurrent) || pageAccs.find(a => a.isCurrent) || pageAccs[0];
    return current || null;
  }

  /**
   * Chuyển đổi nick đang dùng cho NHÓM
   */
  async switchGroupAccount(id) {
    const accounts = this.loadAccounts();
    const target = accounts.find(a => a.id === id);
    if (!target) throw new Error('Không tìm thấy tài khoản mục tiêu.');

    accounts.forEach(a => {
      a.isGroupCurrent = (a.id === id);
      if (a.id === id) {
        a.lastUsedAt = new Date().toISOString();
        if (a.targetType === 'PAGE') a.targetType = 'BOTH';
      }
    });
    this.saveAccounts(accounts);

    // Kích hoạt cookie vào Chrome cho tác vụ nhóm
    fs.writeFileSync(this.cookieFile, JSON.stringify(target.cookies, null, 2), 'utf8');
    try {
      await browserController.importCookies(JSON.stringify(target.cookies));
      logger.success(`[GROUP ACCOUNT] Đã chọn nick đăng nhóm: "${target.name}" (UID: ${target.fbUserId})`);
    } catch (err) {}

    return {
      success: true,
      currentGroupAccount: target,
      message: `Đã chọn tài khoản "${target.name}" làm nick đăng bài Hội Nhóm!`
    };
  }

  /**
   * Chuyển đổi nick đang dùng cho FANPAGE
   */
  switchPageAccount(id) {
    const accounts = this.loadAccounts();
    const target = accounts.find(a => a.id === id);
    if (!target) throw new Error('Không tìm thấy tài khoản mục tiêu.');

    accounts.forEach(a => {
      a.isPageCurrent = (a.id === id);
      if (a.id === id) {
        a.lastPageUsedAt = new Date().toISOString();
        if (a.targetType === 'GROUP') a.targetType = 'BOTH';
      }
    });
    this.saveAccounts(accounts);
    logger.success(`[PAGE ACCOUNT] Đã chọn nick quản trị Fanpage: "${target.name}" (UID: ${target.fbUserId})`);

    return {
      success: true,
      currentPageAccount: target,
      message: `Đã chọn tài khoản "${target.name}" làm nick quản trị Fanpage!`
    };
  }

  /**
   * Cập nhật phân loại mục đích sử dụng (GROUP, PAGE, BOTH)
   */
  setAccountTargetType(id, targetType) {
    const accounts = this.loadAccounts();
    const acc = accounts.find(a => a.id === id);
    if (!acc) throw new Error('Không tìm thấy tài khoản.');

    const validTypes = ['GROUP', 'PAGE', 'BOTH'];
    if (!validTypes.includes(targetType)) {
      throw new Error('Phân loại không hợp lệ (chỉ chấp nhận GROUP, PAGE, BOTH).');
    }

    acc.targetType = targetType;
    if (targetType === 'GROUP') {
      acc.isPageCurrent = false;
    } else if (targetType === 'PAGE') {
      acc.isGroupCurrent = false;
    }
    acc.updatedAt = new Date().toISOString();
    this.saveAccounts(accounts);
    return acc;
  }

}

module.exports = new AccountManager();
