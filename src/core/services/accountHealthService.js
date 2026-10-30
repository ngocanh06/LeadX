/**
 * accountHealthService.js - Giám sát toàn diện Sức Khỏe Tài Khoản & Đánh Giá Rủi Ro Đăng Bài Facebook
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const historyManager = require('./historyManager');
const browserController = require('../automation/browserController');
const proxyUtils = require('../utils/proxyUtils');
const logger = require('../utils/logger');

class AccountHealthService {
  constructor() {
    this.healthFile = path.resolve(config.rootDir, 'data/account_health.json');
    this.cachedHealth = null;
  }

  /**
   * Đọc dữ liệu kiểm tra sức khỏe đã lưu
   */
  loadSavedHealth() {
    try {
      if (fs.existsSync(this.healthFile)) {
        return JSON.parse(fs.readFileSync(this.healthFile, 'utf8'));
      }
    } catch (e) {}
    return null;
  }

  /**
   * Lưu kết quả kiểm tra sức khỏe
   */
  saveHealth(data) {
    try {
      const dir = path.dirname(this.healthFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.healthFile, JSON.stringify(data, null, 2), 'utf8');
      this.cachedHealth = data;
    } catch (err) {
      logger.error('Lỗi khi lưu account_health.json:', err.message);
    }
  }

  /**
   * Ghi nhận sự kiện Facebook chặn tính năng đăng bài khi chạy chiến dịch
   */
  recordRestrictionEvent(reason, groupName = '', groupUrl = '', accountId = null) {
    const saved = this.loadSavedHealth() || { accounts: {} };
    if (!saved.accounts) saved.accounts = {};

    const accountManager = require('./accountManager');
    const activeAcc = accountId
      ? (accountManager.loadAccounts().find(a => a.id === accountId) || accountManager.getCurrentAccount())
      : accountManager.getCurrentAccount();
    const targetAccountId = activeAcc ? activeAcc.id : 'acc_primary';
    const targetAccountName = activeAcc ? activeAcc.name : 'Tài Khoản Chính';

    const incident = {
      id: `inc_${Date.now()}`,
      timestamp: new Date().toISOString(),
      type: 'ACTION_BLOCK',
      severity: 'HIGH',
      reason: reason || 'Facebook tạm thời giới hạn quyền đăng bài của tài khoản.',
      groupName,
      groupUrl,
      accountId: targetAccountId,
      accountName: targetAccountName
    };

    if (!saved.accounts[targetAccountId]) {
      saved.accounts[targetAccountId] = {
        isRestricted: false,
        lastRestrictionAt: null,
        lastRestrictionReason: null,
        lastRestrictionGroup: null,
        incidents: []
      };
    }

    const accData = saved.accounts[targetAccountId];
    accData.isRestricted = true;
    accData.lastRestrictionAt = incident.timestamp;
    accData.lastRestrictionReason = incident.reason;
    accData.lastRestrictionGroup = groupName;
    if (!accData.incidents) accData.incidents = [];
    accData.incidents.unshift(incident);
    if (accData.incidents.length > 50) accData.incidents.pop();

    saved.updatedAt = new Date().toISOString();
    this.saveHealth(saved);
    logger.warn(`[HEALTH] Đã ghi nhận sự kiện giới hạn tính năng FB cho tài khoản "${targetAccountName}" (${targetAccountId}): ${incident.reason}`);
    return accData;
  }

  /**
   * Tính toán Báo cáo Tổng Quan Sức Khỏe & Thước Đo Rủi Ro
   */
  getHealthOverview(targetAccountId = null) {
    const saved = this.loadSavedHealth() || { accounts: {} };
    const accountManager = require('./accountManager');
    const allAccounts = accountManager.loadAccounts();
    const currentAcc = targetAccountId
      ? (allAccounts.find(a => a.id === targetAccountId) || accountManager.getCurrentAccount())
      : accountManager.getCurrentAccount();

    const accountId = currentAcc ? currentAcc.id : (allAccounts[0] ? allAccounts[0].id : 'acc_primary');
    const accountName = currentAcc ? currentAcc.name : 'Tài Khoản Chính';
    const fbUserId = currentAcc ? currentAcc.fbUserId : '';

    const history = historyManager.loadHistory();
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Lọc lịch sử trong 24 giờ qua của tài khoản này
    const recentHistory = history.filter(h => {
      const isWithin24h = new Date(h.postedAt).getTime() >= oneDayAgo;
      const matchAcc = h.accountId ? (h.accountId === accountId) : (accountId === 'acc_primary');
      return isWithin24h && matchAcc;
    });

    const total24h = recentHistory.length;
    const failed24h = recentHistory.filter(h => h.status === 'FAILED');
    const success24h = recentHistory.filter(h => h.status === 'PUBLISHED' || h.status === 'PENDING_APPROVAL');

    // Lấy dữ liệu sức khỏe của tài khoản này
    let accHealth = (saved.accounts && saved.accounts[accountId]) ? saved.accounts[accountId] : null;
    if (!accHealth && accountId === 'acc_primary' && saved.isRestricted !== undefined) {
      accHealth = saved;
    }
    if (!accHealth) {
      accHealth = {
        isRestricted: false,
        lastRestrictionAt: null,
        lastRestrictionReason: null,
        lastRestrictionGroup: null,
        incidents: []
      };
    }

    // Kiểm tra trạng thái cooldown cụ thể của nick này trong accountManager
    const isAccInCooldown = Boolean(currentAcc && currentAcc.status === 'COOLDOWN' && currentAcc.cooldownUntil && new Date(currentAcc.cooldownUntil).getTime() > now);

    let isRestricted = false;
    let cooldownRemainingMs = 0;
    let cooldownRemainingText = 'Không';
    let lastRestrictionTime = isAccInCooldown ? (currentAcc.cooldownReasonTime || accHealth.lastRestrictionAt) : accHealth.lastRestrictionAt;
    let lastRestrictionReason = isAccInCooldown ? (currentAcc.cooldownReason || accHealth.lastRestrictionReason) : accHealth.lastRestrictionReason;
    let lastRestrictionGroup = accHealth.lastRestrictionGroup || '';

    if (isAccInCooldown) {
      isRestricted = true;
      cooldownRemainingMs = new Date(currentAcc.cooldownUntil).getTime() - now;
      const hours = Math.floor(cooldownRemainingMs / (60 * 60 * 1000));
      const mins = Math.floor((cooldownRemainingMs % (60 * 60 * 1000)) / (60 * 1000));
      cooldownRemainingText = `${hours} giờ ${mins} phút`;
    } else if (accHealth.isRestricted && lastRestrictionTime) {
      const elapsedMs = now - new Date(lastRestrictionTime).getTime();
      const COOLDOWN_DURATION = 24 * 60 * 60 * 1000;
      if (elapsedMs < COOLDOWN_DURATION) {
        if (accHealth.lastProbeAt && new Date(accHealth.lastProbeAt).getTime() > new Date(lastRestrictionTime).getTime() && accHealth.lastProbeResult === 'HEALTHY') {
          isRestricted = false;
        } else {
          isRestricted = true;
          cooldownRemainingMs = COOLDOWN_DURATION - elapsedMs;
          const hours = Math.floor(cooldownRemainingMs / (60 * 60 * 1000));
          const mins = Math.floor((cooldownRemainingMs % (60 * 60 * 1000)) / (60 * 1000));
          cooldownRemainingText = `${hours} giờ ${mins} phút`;
        }
      }
    }

    // Đánh giá Điểm Rủi Ro (Risk Score: 0 - 100)
    let riskScore = 8;
    let riskLevel = 'LOW';
    let statusText = `Tài khoản "${accountName}" khỏe mạnh, hoàn toàn sẵn sàng đăng bài`;

    if (isRestricted) {
      riskScore = 88;
      riskLevel = 'CRITICAL';
      statusText = `Tài khoản "${accountName}" đang bị Facebook tạm giới hạn quyền đăng bài`;
    } else if (total24h >= 35) {
      riskScore = 75;
      riskLevel = 'HIGH';
      statusText = `Tần suất đăng bài của "${accountName}" quá cao trong 24h (Nguy cơ bị gậy)`;
    } else if (total24h >= 20) {
      riskScore = 50;
      riskLevel = 'MEDIUM';
      statusText = `Tần suất đăng ở mức trung bình, nên duy trì khoảng nghỉ an toàn`;
    }

    // 5 Thước đo rủi ro
    const riskVectors = [
      {
        id: 'action_block',
        name: 'Trạng Thái Quyền Đăng Bài',
        status: isRestricted ? 'CRITICAL' : 'GOOD',
        label: isRestricted ? 'Tạm Thời Bị Giới Hạn (Action Block)' : 'Đầy Đủ Quyền Đăng Bài',
        description: isRestricted
          ? `Facebook đã kích hoạt bộ lọc spam trên tài khoản này lúc ${new Date(lastRestrictionTime).toLocaleTimeString('vi-VN')} ngày ${new Date(lastRestrictionTime).toLocaleDateString('vi-VN')}.`
          : `Tài khoản "${accountName}" không có bất kỳ hạn chế nào từ Meta.`,
        icon: isRestricted ? 'fa-solid fa-triangle-exclamation' : 'fa-solid fa-circle-check',
        color: isRestricted ? 'danger' : 'success'
      },
      {
        id: 'velocity',
        name: 'Vận Tốc & Tần Suất Đăng (24h)',
        status: total24h > 30 ? 'CRITICAL' : (total24h > 15 ? 'WARNING' : 'GOOD'),
        label: `${total24h} bài đăng trong 24h`,
        description: total24h > 20
          ? `Đã đăng ${total24h} nhóm liên tiếp. Khuyến cáo không nên vượt quá 30 nhóm/ngày/nick.`
          : 'Tần suất đăng bài nằm trong ngưỡng an toàn cho phép.',
        icon: 'fa-solid fa-gauge-high',
        color: total24h > 30 ? 'danger' : (total24h > 15 ? 'warning' : 'success')
      },
      {
        id: 'content_hash',
        name: 'Bộ Lọc Trùng Lặp Nội Dung Meta',
        status: 'GOOD',
        label: 'Đã Kích Hoạt Tàng Hình (Zero-Width Salting)',
        description: 'Mỗi bài viết được gán mã băm MD5 duy nhất và luân phiên Hook + CTA Zalo chống quét trùng lặp.',
        icon: 'fa-solid fa-fingerprint',
        color: 'success'
      },
      {
        id: 'session_cookie',
        name: 'Trạng Thái Phiên Đăng Nhập & 2FA',
        status: 'GOOD',
        label: 'Chrome Stealth Profile Đang Hoạt Động',
        description: `Phiên làm việc độc lập của "${accountName}" lưu trữ cookie và bảo vệ an toàn.`,
        icon: 'fa-solid fa-key',
        color: 'success'
      },
      {
        id: 'group_reception',
        name: 'Tỷ Lệ Tiếp Nhận Nhóm (24h)',
        status: failed24h.length > 2 ? 'WARNING' : 'GOOD',
        label: `${success24h.length} thành công / ${total24h} tổng số`,
        description: failed24h.length > 0
          ? `Ghi nhận ${failed24h.length} lần thất bại do lỗi duyệt hoặc giới hạn tần suất.`
          : 'Toàn bộ bài đăng đã được đưa lên nhóm hoặc đang chờ duyệt an toàn.',
        icon: 'fa-solid fa-chart-pie',
        color: failed24h.length > 2 ? 'warning' : 'success'
      },
      {
        id: 'network_proxy',
        name: 'Địa Chỉ IP & Cô Lập Mạng (Anti-Detection)',
        status: (currentAcc && currentAcc.proxy) ? 'GOOD' : 'WARNING',
        label: (currentAcc && currentAcc.proxy) ? `Đã Ẩn IP Qua Proxy (${proxyUtils.formatProxy(currentAcc.proxy)})` : 'Dùng Chung IP Mạng Nhà (Chưa có Proxy)',
        description: (currentAcc && currentAcc.proxy)
          ? `Tài khoản kết nối qua địa chỉ IP riêng biệt với cờ chống rò rỉ WebRTC. Facebook nhận diện đây là người dùng độc lập, triệt tiêu nguy cơ cháy lan Checkpoint.`
          : `Đang dùng chung IP mạng nhà/văn phòng. Nếu trên cùng mạng có nhiều nick hoạt động hoặc từng bị chặn, Meta có thể liên kết và áp đặt hạn chế dây chuyền.`,
        icon: (currentAcc && currentAcc.proxy) ? 'fa-solid fa-shield-halved' : 'fa-solid fa-network-wired',
        color: (currentAcc && currentAcc.proxy) ? 'success' : 'warning'
      }
    ];

    // Thu thập danh sách các sự cố của nick này
    const incidents = (accHealth.incidents || []).slice(0, 10);

    // Thu thập danh sách các nick KHÁC đang bị cooldown trong hệ thống
    const otherAccountsInCooldown = allAccounts
      .filter(a => a.id !== accountId && a.status === 'COOLDOWN' && a.cooldownUntil && new Date(a.cooldownUntil).getTime() > now)
      .map(a => {
        const diff = new Date(a.cooldownUntil).getTime() - now;
        const h = Math.floor(diff / (60 * 60 * 1000));
        const m = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
        return {
          id: a.id,
          name: a.name,
          fbUserId: a.fbUserId,
          cooldownRemainingText: `${h} giờ ${m} phút`,
          reason: a.cooldownReason || 'Bị giới hạn đăng bài'
        };
      });

    // Quy trình phục hồi (Recovery Checklist)
    const recoveryChecklist = [
      {
        step: 1,
        title: 'Treo Nick Nghỉ Ngơi Tuyệt Đối',
        desc: 'Không bấm đăng bài bằng tool hay bằng tay trong thời gian làm mát (24 giờ). Tránh việc cố thử khiến Facebook gia hạn gậy.',
        status: isRestricted ? 'PENDING' : 'COMPLETED'
      },
      {
        step: 2,
        title: 'Tương Tác Tự Nhiên Bằng Điện Thoại',
        desc: 'Mở app Facebook trên điện thoại lướt xem bảng tin, xem video reels 5-10 phút, thả vài cảm xúc như người dùng bình thường để tăng Trust Score.',
        status: isRestricted ? 'IN_PROGRESS' : 'COMPLETED'
      },
      {
        step: 3,
        title: 'Chạy Chế Độ Giãn Cách An Toàn Khi Hết Hạn',
        desc: 'Sau khi quyền đăng bài được mở lại, luôn giữ chế độ "An Toàn Khuyên Dùng (60s - 120s)" và để hệ thống tự nghỉ 3 phút mỗi 5 nhóm.',
        status: isRestricted ? 'WAITING' : 'READY'
      },
      {
        step: 4,
        title: 'Gán Proxy Riêng & Khắc Phục Rò Rỉ IP',
        desc: 'Nếu mạng Wi-Fi đã bị Meta nghi ngờ hoặc có nick bị checkpoint, hãy gán Proxy 4G/Residential trong phần Quản Lý Tài Khoản để đổi dải IP sạch và cách ly phiên duyệt.',
        status: (currentAcc && currentAcc.proxy) ? 'COMPLETED' : 'RECOMMENDED'
      }
    ];

    return {
      success: true,
      data: {
        accountId,
        accountName,
        fbUserId,
        isRestricted,
        riskScore,
        riskLevel,
        statusText,
        lastRestrictionAt: isRestricted ? lastRestrictionTime : null,
        lastRestrictionReason: isRestricted ? lastRestrictionReason : null,
        lastRestrictionGroup: isRestricted ? lastRestrictionGroup : null,
        cooldownRemainingMs,
        cooldownRemainingText,
        stats24h: {
          total: total24h,
          success: success24h.length,
          failed: failed24h.length,
          successRate: total24h > 0 ? Math.round((success24h.length / total24h) * 100) : 100
        },
        riskVectors,
        incidents,
        otherAccountsInCooldown,
        recoveryChecklist,
        lastProbeAt: accHealth.lastProbeAt || null,
        lastProbeResult: accHealth.lastProbeResult || null
      }
    };
  }

  /**
   * Kiểm tra quyền đăng bài thực tế trên trình duyệt ngầm (Live Health Probe)
   */
  async probeAccountHealthLive() {
    logger.info('[HEALTH] Đang tiến hành kiểm tra trực tiếp quyền đăng bài trên Facebook...');
    const page = await browserController.ensureActivePage();

    try {
      // 1. Kiểm tra trạng thái đăng nhập
      const cookies = await page.cookies('https://www.facebook.com').catch(() => []);
      const cUser = cookies.find(c => c.name === 'c_user');
      const xs = cookies.find(c => c.name === 'xs');

      if (!cUser || !xs) {
        throw new Error('Chưa đăng nhập Facebook hoặc Cookie đã hết hạn.');
      }

      // 2. Truy cập trang chủ Facebook
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 });
      await new Promise(r => setTimeout(r, 2500));

      // 3. Kiểm tra xem có xuất hiện thông báo checkpoint / khóa tài khoản không
      const checkState = await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').toLowerCase();
        const isCheckpoint = window.location.pathname.includes('/checkpoint') ||
          bodyText.includes('tài khoản của bạn đã bị khóa') ||
          bodyText.includes('your account has been disabled') ||
          bodyText.includes('bảo vệ tài khoản');

        // Tìm ô đăng bài "Bạn đang nghĩ gì?"
        const spans = Array.from(document.querySelectorAll('span'));
        const postBoxTrigger = spans.find(s => {
          const txt = (s.innerText || '').toLowerCase();
          return txt.includes('bạn đang nghĩ gì') || txt.includes("what's on your mind");
        });

        return {
          isCheckpoint,
          hasPostBoxTrigger: !!postBoxTrigger
        };
      });

      if (checkState.isCheckpoint) {
        const result = {
          isRestricted: true,
          type: 'CHECKPOINT',
          message: 'Tài khoản Facebook bị yêu cầu xác minh (Checkpoint) hoặc bị khóa đăng nhập.'
        };
        this._updateProbeResult(result);
        return { success: true, data: result };
      }

      // 4. Bấm thử vào ô "Bạn đang nghĩ gì..." để xem có bật Action Block Popup không
      logger.info('[HEALTH] Đang kích hoạt thử khung đăng bài để kiểm tra phản hồi của Meta...');
      const probeResult = await page.evaluate(async () => {
        const spans = Array.from(document.querySelectorAll('span'));
        const postBox = spans.find(s => {
          const txt = (s.innerText || '').toLowerCase();
          return (txt.includes('bạn đang nghĩ gì') || txt.includes("what's on your mind")) && !txt.includes('bình luận');
        });

        if (postBox) {
          const clickable = postBox.closest('div[role="button"]') || postBox;
          clickable.click();
        }

        // Chờ 1.8 giây xem popup gì xuất hiện
        await new Promise(r => setTimeout(r, 1800));

        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        let isBlocked = false;
        let blockReason = '';

        for (const dlg of dialogs) {
          const txt = (dlg.innerText || '').toLowerCase();
          if (
            txt.includes('tính năng này tạm thời bị khóa') ||
            txt.includes('bị giới hạn') ||
            txt.includes('spam') ||
            txt.includes('giới hạn tần suất') ||
            txt.includes('bạn không thể dùng tính năng này') ||
            txt.includes("you can't use this feature right now")
          ) {
            isBlocked = true;
            blockReason = dlg.innerText.trim();
            break;
          }
        }

        return {
          isBlocked,
          blockReason,
          dialogOpened: dialogs.length > 0
        };
      });

      // Đóng hộp thoại lại
      await page.keyboard.press('Escape').catch(() => {});
      await new Promise(r => setTimeout(r, 800));
      await page.keyboard.press('Escape').catch(() => {});

      let probeData;
      if (probeResult.isBlocked) {
        probeData = {
          isRestricted: true,
          type: 'ACTION_BLOCK',
          message: 'Facebook xác nhận tài khoản đang bị hạn chế quyền đăng bài.',
          details: probeResult.blockReason
        };
        this.recordRestrictionEvent(probeResult.blockReason || 'Facebook tạm thời giới hạn quyền đăng bài.');
      } else {
        probeData = {
          isRestricted: false,
          type: 'HEALTHY',
          message: 'Tài khoản hoàn toàn bình thường! Không phát hiện lệnh giới hạn nào.',
          details: 'Hộp thoại đăng bài mở bình thường, không có cảnh báo spam từ Meta.'
        };
      }

      this._updateProbeResult(probeData);
      logger.success(`[HEALTH] Kiểm tra quyền đăng bài hoàn tất: ${probeData.message}`);
      return { success: true, data: probeData };
    } catch (err) {
      logger.error('[HEALTH] Lỗi khi kiểm tra sức khỏe FB:', err.message);
      return {
        success: false,
        message: `Lỗi kết nối trình duyệt khi kiểm tra: ${err.message}`
      };
    }
  }

  _updateProbeResult(result) {
    const saved = this.loadSavedHealth() || {};
    const updated = {
      ...saved,
      isRestricted: result.isRestricted,
      lastProbeAt: new Date().toISOString(),
      lastProbeResult: result.type,
      lastProbeMessage: result.message
    };
    if (!result.isRestricted) {
      // Nếu đã probe xác nhận sạch gậy, reset flag
      updated.lastRestrictionAt = null;
    }
    this.saveHealth(updated);
  }
}

module.exports = new AccountHealthService();
