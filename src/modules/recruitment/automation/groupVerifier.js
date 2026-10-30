/**
 * groupVerifier.js - Trình kiểm tra & xác thực trạng thái tham gia Hội Nhóm Facebook Real-time
 * Kiểm tra trực tiếp trên trình duyệt Facebook xem tài khoản hiện tại đã tham gia, đang chờ duyệt hay chưa vào nhóm.
 */
const browserController = require('../../../core/automation/browserController');
const accountManager = require('../../../core/services/accountManager');
const groupManager = require('../services/groupManager');
const bdsGroupManager = require('../../bds/services/bdsGroupManager');
const logger = require('../../../core/utils/logger');

function getGroupMgr(groupType) {
  return groupType === 'bds' ? bdsGroupManager : groupManager;
}

class GroupVerifier {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentAccountId = null;
    this.progress = {
      current: 0,
      total: 0,
      joinedCount: 0,
      notJoinedCount: 0,
      pendingCount: 0,
      errorCount: 0,
      status: 'IDLE', // IDLE | RUNNING | PAUSED | COMPLETED | STOPPED | ERROR
      currentGroupName: '',
      message: 'Sẵn sàng'
    };
    this.logs = [];
    this.results = [];
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    this.logs.push({ timestamp, message: msg, type });
    if (this.logs.length > 300) this.logs.shift();

    if (type === 'error') logger.error(msg);
    else if (type === 'success') logger.success(msg);
    else logger.info(msg);
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      progress: this.progress,
      results: this.results,
      logs: this.logs.slice(-40)
    };
  }

  pause() {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      this.progress.status = 'PAUSED';
      this.progress.message = 'Tiến trình kiểm tra đã tạm dừng.';
      this._log('[TẠM DỪNG] Người dùng bấm tạm dừng quét.', 'warn');
      return true;
    }
    return false;
  }

  resume() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.progress.status = 'RUNNING';
      this.progress.message = 'Đang tiếp tục kiểm tra...';
      this._log('[TIẾP TỤC] Tiếp tục kiểm tra các nhóm còn lại.', 'info');
      return true;
    }
    return false;
  }

  stop() {
    if (this.isRunning) {
      this.shouldStop = true;
      this.isRunning = false;
      this.isPaused = false;
      this.progress.status = 'STOPPED';
      this.progress.message = 'Tiến trình kiểm tra đã dừng lại.';
      this._log('[DỪNG] Đã hủy tiến trình kiểm tra nhóm.', 'warn');
      return true;
    }
    return false;
  }

  /**
   * Phân tích trang Facebook của nhóm để nhận diện chính xác 100% trạng thái thành viên
   */
  async inspectPageMembership(page) {
    // 0. Kiểm tra trực tiếp cookie c_user của session trên page
    try {
      const pageCookies = await page.cookies('https://www.facebook.com');
      const hasCUser = pageCookies.some(c => c.name === 'c_user' && c.value && String(c.value).length > 4);
      if (!hasCUser) {
        return {
          status: 'NOT_LOGGED_IN',
          isMember: false,
          isPending: false,
          note: 'Trình duyệt chưa có Cookie đăng nhập Facebook (Khách vãng lai).'
        };
      }
    } catch (e) {}

    return await page.evaluate(() => {
      const bodyText = (document.body.innerText || '').toLowerCase();
      const currentUrl = window.location.href;

      // 1. Kiểm tra nếu bị chuyển hướng sang trang đăng nhập hoặc đang ở chế độ khách vãng lai (chưa đăng nhập)
      const hasLoginForm = !!document.querySelector('form[action*="/login"], input[name="email"], input[name="pass"], a[href*="/login/"], a[href*="/r.php"]');
      const hasGuestBanner = bodyText.includes('see more on facebook') ||
        bodyText.includes('xem thêm trên facebook') ||
        bodyText.includes('log in or sign up') ||
        bodyText.includes('đăng nhập hoặc đăng ký') ||
        bodyText.includes('explore the things you love') ||
        bodyText.includes('bạn phải đăng nhập để tiếp tục') ||
        bodyText.includes('you must log in to continue') ||
        (bodyText.includes('use another profile') && bodyText.includes('create new account')) ||
        (bodyText.includes('log in') && bodyText.includes('sign up') && !bodyText.includes('tạo bài viết') && !bodyText.includes('viết gì'));

      const isLoginRedirect = currentUrl.includes('/login') || hasGuestBanner || (hasLoginForm && !bodyText.includes('tạo bài viết'));

      if (isLoginRedirect) {
        return { status: 'NOT_LOGGED_IN', isMember: false, isPending: false, note: 'Cookie tài khoản đã hết hạn trên Facebook. Vui lòng cập nhật Cookie mới tại Tab Tài Khoản.' };
      }

      // 2. Kiểm tra nếu bị checkpoint
      const isCheckpoint = currentUrl.includes('/checkpoint') ||
        bodyText.includes('xác nhận danh tính') ||
        bodyText.includes('video selfie') ||
        bodyText.includes('tài khoản của bạn đã bị khóa') ||
        bodyText.includes('your account has been disabled');

      if (isCheckpoint) {
        return { status: 'CHECKPOINT', isMember: false, isPending: false, note: 'Tài khoản đang bị Facebook Checkpoint' };
      }

      // 3. Kiểm tra trang không tồn tại hoặc bị xóa
      const isNotFound = bodyText.includes('trang này không hiển thị') ||
        bodyText.includes('nội dung này hiện không khả dụng') ||
        bodyText.includes('this content isn\'t available right now') ||
        bodyText.includes('liên kết bạn đã theo dõi có thể đã hỏng');

      if (isNotFound) {
        return { status: 'NOT_FOUND', isMember: false, isPending: false, note: 'Nhóm không tồn tại hoặc link bị hỏng' };
      }

      // Tự động đóng modal "See more on Facebook" nếu có
      const closePopupBtn = document.querySelector('div[role="dialog"] div[aria-label="Close"], div[role="dialog"] div[aria-label="Đóng"], div[aria-label="Close"]');
      if (closePopupBtn) {
        try { closePopupBtn.click(); } catch(e) {}
      }
      // 4. Quét toàn bộ nút trên trang (ĐẶC BIỆT LÀ KHU VỰC HEADER VÀ ACTION BAR)
      const allButtons = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"], div[aria-label]'));

      let hasJoinBtn = false;
      let joinBtnLabel = '';
      let hasPendingBtn = false;
      let pendingBtnLabel = '';
      let hasJoinedBtn = false;
      let hasManageBtn = false;

      for (const btn of allButtons) {
        const rect = btn.getBoundingClientRect();
        // Nút phải hiển thị trên màn hình
        const isVisible = btn.offsetParent !== null && rect.height > 0 && rect.width > 0;
        if (!isVisible) continue;

        // Bỏ qua các nút nằm trong sidebar gợi ý nhóm khác hoặc danh sách đề xuất ngoài lề
        if (btn.closest('div[role="complementary"], aside, div[aria-label*="gợi ý"], div[aria-label*="nhóm tương tự"]')) {
          continue;
        }

        const txt = (btn.innerText || '').trim().toLowerCase();
        const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();

        // 4.1. Nút "Tham gia nhóm" (Dấu hiệu BẤT BIẾN của việc CHƯA THAM GIA)
        const isJoin = (
          (txt === 'tham gia nhóm' || txt === 'tham gia' || txt === '+ tham gia' || txt === 'join group' || txt === 'join' ||
           aria === 'tham gia nhóm' || aria === 'join group' || aria.includes('tham gia nhóm') || aria.includes('join group')) &&
          !txt.includes('đã') && !aria.includes('đã') &&
          !txt.includes('chờ') && !aria.includes('chờ') &&
          !txt.includes('hủy') && !aria.includes('hủy')
        );

        if (isJoin) {
          hasJoinBtn = true;
          joinBtnLabel = aria || txt || 'Tham gia nhóm';
        }

        // 4.2. Nút "Hủy yêu cầu" / "Đang chờ duyệt"
        const isPending = (
          txt.includes('hủy yêu cầu') || aria.includes('hủy yêu cầu') ||
          txt.includes('đang chờ phê duyệt') || aria.includes('đang chờ phê duyệt') ||
          txt.includes('chờ phê duyệt') || aria.includes('chờ phê duyệt') ||
          txt.includes('yêu cầu đã gửi') || aria.includes('yêu cầu đã gửi') ||
          txt.includes('cancel request') || aria.includes('cancel request') ||
          txt === 'pending' || aria === 'pending'
        );

        if (isPending) {
          hasPendingBtn = true;
          pendingBtnLabel = aria || txt || 'Đang chờ duyệt';
        }

        // 4.3. Nút "Đã tham gia" / "Joined" / "Rời khỏi nhóm"
        const isJoined = (
          txt === 'đã tham gia' || aria === 'đã tham gia' ||
          txt === 'joined' || aria === 'joined' ||
          aria.includes('đã tham gia') || aria.includes('joined') ||
          txt.includes('rời khỏi nhóm') || aria.includes('rời khỏi nhóm') ||
          txt.includes('leave group') || aria.includes('leave group')
        );

        if (isJoined) {
          hasJoinedBtn = true;
        }

        // 4.4. Quyền Quản trị viên: "Quản lý nhóm" / "Admin tools"
        const isManage = (
          txt === 'quản lý' || txt === 'manage' || txt === 'công cụ quản trị' ||
          aria === 'quản lý' || aria === 'manage' || aria.includes('quản lý nhóm') || aria.includes('admin tools')
        );

        if (isManage) {
          hasManageBtn = true;
        }
      }

      // 5. Kiểm tra thông báo chờ duyệt hoặc nhóm riêng tư bị khóa
      const hasPendingText = bodyText.includes('yêu cầu tham gia của bạn đang chờ phê duyệt') ||
        bodyText.includes('yêu cầu của bạn đang chờ phê duyệt') ||
        bodyText.includes('your request to join is pending approval');
      if (hasPendingText) {
        hasPendingBtn = true;
      }

      const isPrivateLocked = (bodyText.includes('nhóm riêng tư') || bodyText.includes('private group')) &&
        (bodyText.includes('hãy tham gia nhóm này để xem') || bodyText.includes('tham gia nhóm này để xem') || bodyText.includes('join this group to view'));

      // =========================================================================
      // NGUYÊN TẮC PHÁN QUYẾT BẤT BIẾN THEO THỨ TỰ ƯU TIÊN AN TOÀN TUYỆT ĐỐI:
      // =========================================================================

      // QUY TẮC 1 (ƯU TIÊN TUYỆT ĐỐI): NẾU CÓ NÚT "THAM GIA NHÓM" HOẶC NHÓM RIÊNG TƯ BỊ KHÓA
      // -> CHẮC CHẮN 100% LÀ CHƯA THAM GIA! (Bảo vệ hệ thống không bao giờ đăng nhầm vào nhóm chưa vào)
      if (hasJoinBtn || isPrivateLocked) {
        return {
          status: 'NOT_JOINED',
          isMember: false,
          isPending: false,
          note: isPrivateLocked 
            ? 'Chưa vào nhóm (Nhóm riêng tư bị khóa)' 
            : `Chưa vào nhóm (Phát hiện nút "${joinBtnLabel || 'Tham gia nhóm'}")`
        };
      }

      // QUY TẮC 2: NẾU CÓ NÚT "HỦY YÊU CẦU" HOẶC ĐANG CHỜ DUYỆT
      // -> CHẮC CHẮN 100% LÀ ĐANG CHỜ DUYỆT (PENDING)
      if (hasPendingBtn) {
        return {
          status: 'PENDING',
          isMember: false,
          isPending: true,
          note: `Đang chờ Quản trị viên duyệt (${pendingBtnLabel || 'Chờ phê duyệt'})`
        };
      }

      // QUY TẮC 3: NẾU CÓ NÚT "ĐÃ THAM GIA" HOẶC CÔNG CỤ "QUẢN LÝ NHÓM"
      // -> CHẮC CHẮN 100% LÀ ĐÃ THAM GIA (JOINED)
      if (hasJoinedBtn || hasManageBtn) {
        return {
          status: 'JOINED',
          isMember: true,
          isPending: false,
          note: hasManageBtn 
            ? 'Đã tham gia (Quản trị viên / Kiểm duyệt viên)' 
            : 'Đã tham gia (Xác nhận nút "Đã tham gia")'
        };
      }

      // QUY TẮC 4: NẾU CHƯA THẤY NÚT RÕ RÀNG -> TRẢ VỀ LOADING ĐỂ VÒNG LẶP TIẾP TỤC ĐỢI RENDER
      return {
        status: 'LOADING',
        isMember: false,
        isPending: false,
        note: 'Đang tải nội dung nhóm...'
      };
    });
  }

  /**
   * Kiểm tra Real-time một nhóm đơn lẻ
   */
  async verifySingleGroup(groupIdOrUrl, accountId = null, groupType = 'recruitment') {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const mgr = getGroupMgr(groupType);
    const groups = mgr.loadGroups();
    const cleanKey = String(groupIdOrUrl || '').toLowerCase().trim().replace(/\/+$/, '');
    
    const group = groups.find(g => {
      if (g.id === groupIdOrUrl) return true;
      const gUrl = String(g.url || '').toLowerCase().trim().replace(/\/+$/, '');
      return gUrl === cleanKey || (cleanKey.length > 10 && (gUrl.includes(cleanKey) || cleanKey.includes(gUrl)));
    });

    if (!group) {
      throw new Error('Không tìm thấy hội nhóm cần kiểm tra.');
    }

    // Chuyển sang tài khoản target nếu cần
    if (accountId && accountManager.getCurrentAccount()?.id !== targetAccountId) {
      await accountManager.switchAccount(targetAccountId);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Đảm bảo tab trình duyệt hoạt động độc lập
    let page = null;
    try {
      page = await browserController.newDedicatedPage();
      try {
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.setBlockedURLs', {
          urls: ['*.png*', '*.jpg*', '*.jpeg*', '*.webp*', '*.gif*', '*.mp4*', '*.webm*']
        });
      } catch (e) {}

      logger.info(`[REALTIME VERIFY] Đang kiểm tra nhóm "${group.name}" (${group.url}) cho nick ${targetAccountId}...`);

      try {
        await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (navErr) {
        if (navErr.message.includes('ERR_ABORTED')) {
          await new Promise(r => setTimeout(r, 1000));
          await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        } else {
          throw navErr;
        }
      }
      
      // Dynamic Smart Poll: Đợi trang hydrate và render nút thật, tối đa 5 giây
      let result = null;
      const pollStart = Date.now();
      const maxWaitMs = 5000;
      while (Date.now() - pollStart < maxWaitMs) {
        result = await this.inspectPageMembership(page);
        if (result && result.status !== 'LOADING') {
          break;
        }
        await new Promise(r => setTimeout(r, 300));
      }

      // Nếu sau 5s vẫn LOADING, cuộn nhẹ 1 lần để kích hoạt lazy render rồi kiểm tra lại
      if (!result || result.status === 'LOADING') {
        try {
          await page.evaluate(() => window.scrollBy(0, 300));
          await new Promise(r => setTimeout(r, 600));
          const retryRes = await this.inspectPageMembership(page);
          if (retryRes && retryRes.status !== 'LOADING') {
            result = retryRes;
          }
        } catch (e) {}
      }

      if (!result || result.status === 'LOADING') {
        result = {
          status: 'NOT_JOINED',
          isMember: false,
          isPending: false,
          note: 'Chưa vào nhóm (Không tìm thấy quyền thành viên sau khi tải xong)'
        };
      }

      if (result.status === 'NOT_LOGGED_IN') {
        const acc = accountManager.loadAccounts().find(a => a.id === targetAccountId);
        const accName = acc ? acc.name : 'tài khoản này';
        throw new Error(`Cookie của "${accName}" đã hết hạn trên Facebook. Vui lòng vào Tab "Quản Lý Tài Khoản" -> Bấm "Sửa" và dán Cookie mới nhất từ Cookie-Editor để kiểm tra Real-time.`);
      }

      if (result.status === 'CHECKPOINT') {
        accountManager.markCheckpoint(targetAccountId, 'Phát hiện Checkpoint khi kiểm tra nhóm.');
        throw new Error('Tài khoản đang bị Facebook Checkpoint, không thể kiểm tra nhóm.');
      }

      // Cập nhật trạng thái thực tế vào mgr
      const isJoined = result.isMember === true;
      mgr.updateGroupMembership(group.id, isJoined, targetAccountId);

      logger.info(`[REALTIME VERIFY] Kết quả nhóm "${group.name}": ${isJoined ? '✅ ĐÃ THAM GIA' : (result.isPending ? '⏳ ĐANG CHỜ DUYỆT' : '❌ CHƯA VÀO NHÓM')} (${result.note})`);

      return {
        groupId: group.id,
        groupName: group.name,
        groupUrl: group.url,
        accountId: targetAccountId,
        isJoined,
        isPending: result.isPending,
        status: result.status,
        note: result.note,
        verifiedAt: new Date().toISOString()
      };
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }

  /**
   * Quét và kiểm tra Real-time toàn bộ hoặc danh sách nhóm đã chọn
   */
  async verifyBatchGroups({ groupIds = [], accountId = null, delayMin = 2, delayMax = 4, groupType = 'recruitment' } = {}) {
    if (this.isRunning) {
      throw new Error('Tiến trình kiểm tra Real-time đang hoạt động!');
    }

    this.groupType = groupType;
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const mgr = getGroupMgr(groupType);
    const allGroups = mgr.loadGroups();
    
    let targetGroups = [];
    if (Array.isArray(groupIds) && groupIds.length > 0) {
      targetGroups = allGroups.filter(g => groupIds.includes(g.id));
    } else {
      targetGroups = allGroups;
    }

    if (targetGroups.length === 0) {
      throw new Error('Không có hội nhóm nào để kiểm tra.');
    }

    // Chuyển sang tài khoản target nếu cần
    if (accountId && accountManager.getCurrentAccount()?.id !== targetAccountId) {
      await accountManager.switchAccount(targetAccountId);
      await new Promise(r => setTimeout(r, 1500));
    }

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentAccountId = targetAccountId;
    this.results = [];
    this.logs = [];

    this.progress = {
      current: 0,
      total: targetGroups.length,
      joinedCount: 0,
      notJoinedCount: 0,
      pendingCount: 0,
      errorCount: 0,
      status: 'RUNNING',
      currentGroupName: '',
      message: `Bắt đầu quét kiểm tra Real-time cho ${targetGroups.length} nhóm...`
    };

    const currentAcc = accountManager.loadAccounts().find(a => a.id === targetAccountId);
    const accLabel = currentAcc ? `${currentAcc.name} (UID: ${currentAcc.fbUserId})` : targetAccountId;
    this._log(`[BẮT ĐẦU QUÉT REALTIME] Đang kiểm tra ${targetGroups.length} nhóm cho nick: "${accLabel}".`);

    let page = null;
    const setupCDP = async (p) => {
      try {
        const client = await p.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.setBlockedURLs', {
          urls: [
            '*.png*', '*.jpg*', '*.jpeg*', '*.webp*', '*.gif*',
            '*.mp4*', '*.webm*', '*.avi*', '*.m4v*',
            '*google-analytics.com*', '*doubleclick.net*',
            '*connect.facebook.net/signals*'
          ]
        });
      } catch (cdpErr) {}
    };

    try {
      page = await browserController.newDedicatedPage();
      await setupCDP(page);

      // PRE-FLIGHT CHECK: Xác thực phiên đăng nhập thực tế của tài khoản trước khi duyệt danh sách nhóm
      this._log(`[BƯỚC 1/2] Đang xác thực phiên đăng nhập của nick "${accLabel}" trên Facebook...`);
      
      const sessionCookies = await page.cookies('https://www.facebook.com');
      const hasCUser = sessionCookies.some(c => c.name === 'c_user' && c.value && String(c.value).length > 4);
      if (!hasCUser) {
        this._log(`🚨 [CHƯA ĐĂNG NHẬP] Trình duyệt chưa có Cookie c_user hợp lệ cho nick "${accLabel}". Vui lòng vào tab "Quản Lý Tài Khoản", cập nhật Cookie mới nhất từ Cookie-Editor!`, 'error');
        this.progress.status = 'ERROR';
        this.progress.message = `Lỗi: Nick "${accLabel}" chưa đăng nhập trên Facebook. Vui lòng cập nhật Cookie!`;
        this.isRunning = false;
        return;
      }

      try {
        await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const checkUrl = page.url();
        const checkRes = await this.inspectPageMembership(page);

        if (checkRes.status === 'NOT_LOGGED_IN' || checkUrl.includes('/login')) {
          this._log(`🚨 [LỖI COOKIE] Cookie của nick "${accLabel}" đã hết hạn hoặc bị Facebook đăng xuất! Vui lòng vào tab "Quản Lý Tài Khoản", bấm Sửa và dán Cookie mới nhất từ Cookie-Editor.`, 'error');
          this.progress.status = 'ERROR';
          this.progress.message = `Lỗi: Cookie của nick "${accLabel}" đã hết hạn. Vui lòng cập nhật Cookie mới!`;
          this.isRunning = false;
          return;
        }

        if (checkRes.status === 'CHECKPOINT' || checkUrl.includes('/checkpoint')) {
          this._log(`🚨 [BÁO ĐỘNG CHECKPOINT] Nick "${accLabel}" đang bị Facebook yêu cầu xác minh danh tính! Dừng khẩn cấp.`, 'error');
          accountManager.markCheckpoint(targetAccountId, 'Phát hiện Checkpoint khi xác thực phiên đăng nhập.');
          this.progress.status = 'ERROR';
          this.progress.message = `Lỗi: Nick "${accLabel}" bị Checkpoint Facebook.`;
          this.isRunning = false;
          return;
        }
      } catch (preErr) {
        logger.warn(`Preflight check warning: ${preErr.message}`);
      }

      this._log(`[BƯỚC 2/2] Xác thực tài khoản thành công! Bắt đầu quét kiểm tra Real-time ${targetGroups.length} nhóm...`, 'success');

      for (let i = 0; i < targetGroups.length; i++) {
        if (this.shouldStop) {
          this._log('[DỪNG LẠI] Đã dừng tiến trình kiểm tra theo lệnh người dùng.', 'warn');
          break;
        }

        while (this.isPaused) {
          if (this.shouldStop) break;
          await new Promise(r => setTimeout(r, 1000));
        }

        const group = targetGroups[i];
        this.progress.current = i + 1;
        this.progress.currentGroupName = group.name;
        this.progress.message = `[${i + 1}/${targetGroups.length}] Đang kiểm tra: ${group.name}`;

        // Đảm bảo tab page còn sống và không bị đóng
        if (!page || page.isClosed()) {
          try {
            page = await browserController.newDedicatedPage();
            await setupCDP(page);
          } catch (createErr) {
            this._log(`Lỗi khởi tạo tab mới: ${createErr.message}`, 'error');
          }
        }

        try {
          await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
          
          // Dynamic Smart Poll: Đợi trang hydrate và render nút thật, tối đa 5 giây
          let res = null;
          const pollStart = Date.now();
          const maxWaitMs = 5000;
          while (Date.now() - pollStart < maxWaitMs) {
            res = await this.inspectPageMembership(page);
            if (res && res.status !== 'LOADING') {
              break;
            }
            await new Promise(r => setTimeout(r, 300));
          }

          // Nếu sau 5s vẫn LOADING, cuộn nhẹ 1 lần để kích hoạt lazy render rồi kiểm tra lại
          if (!res || res.status === 'LOADING') {
            try {
              await page.evaluate(() => window.scrollBy(0, 300));
              await new Promise(r => setTimeout(r, 600));
              const retryRes = await this.inspectPageMembership(page);
              if (retryRes && retryRes.status !== 'LOADING') {
                res = retryRes;
              }
            } catch (e) {}
          }

          if (!res || res.status === 'LOADING') {
            res = {
              status: 'NOT_JOINED',
              isMember: false,
              isPending: false,
              note: 'Chưa vào nhóm (Không tìm thấy quyền thành viên sau khi tải xong)'
            };
          }

          if (res.status === 'CHECKPOINT') {
            this._log(`🚨 [BÁO ĐỘNG CHECKPOINT] Phát hiện màn hình xác minh danh tính! Dừng khẩn cấp.`, 'error');
            accountManager.markCheckpoint(targetAccountId, 'Phát hiện Checkpoint khi kiểm tra nhóm.');
            this.shouldStop = true;
            this.isRunning = false;
            break;
          }

          if (res.status === 'NOT_LOGGED_IN') {
            this._log(`🚨 Cookie tài khoản bị hết hạn hoặc đăng xuất! Vui lòng cập nhật Cookie.`, 'error');
            this.shouldStop = true;
            this.isRunning = false;
            break;
          }

          const isJoined = res.isMember === true;
          mgr.updateGroupMembership(group.id, isJoined, targetAccountId);

          if (isJoined) {
            this.progress.joinedCount++;
            this._log(`  -> [${i + 1}/${targetGroups.length}] ${group.name}: ✅ ĐÃ THAM GIA (${res.note})`, 'success');
          } else if (res.isPending) {
            this.progress.pendingCount++;
            this._log(`  -> [${i + 1}/${targetGroups.length}] ${group.name}: ⏳ ĐANG CHỜ DUYỆT (${res.note})`, 'warn');
          } else {
            this.progress.notJoinedCount++;
            this._log(`  -> [${i + 1}/${targetGroups.length}] ${group.name}: ❌ CHƯA VÀO NHÓM (${res.note})`, 'info');
          }

          this.results.push({
            groupId: group.id,
            groupName: group.name,
            groupUrl: group.url,
            isJoined,
            isPending: res.isPending,
            status: res.status,
            note: res.note,
            time: new Date().toLocaleTimeString('vi-VN')
          });

        } catch (groupErr) {
          const isFrameDetached = groupErr.message.includes('detached Frame') || 
                                  groupErr.message.includes('Target closed') || 
                                  groupErr.message.includes('Session closed') ||
                                  groupErr.message.includes('Execution context was destroyed');

          // Tự động phục hồi tab mới ngay lập tức nếu tab bị ngắt kết nối
          if (isFrameDetached) {
            this._log(`  -> [TỰ ĐỘNG PHỤC HỒI] Tab bị ngắt kết nối. Đang mở lại tab mới và thử lại nhóm "${group.name}"...`, 'warn');
            try {
              if (page && !page.isClosed()) await page.close().catch(() => {});
              page = await browserController.newDedicatedPage();
              await setupCDP(page);

              // Thử lại kiểm tra nhóm này với tab mới
              await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
              let retryRes = null;
              const retryStart = Date.now();
              while (Date.now() - retryStart < 4000) {
                retryRes = await this.inspectPageMembership(page);
                if (retryRes && retryRes.status !== 'LOADING') break;
                await new Promise(r => setTimeout(r, 300));
              }

              if (retryRes && retryRes.status !== 'LOADING') {
                const isJoinedRetry = retryRes.isMember === true;
                mgr.updateGroupMembership(group.id, isJoinedRetry, targetAccountId);
                if (isJoinedRetry) {
                  this.progress.joinedCount++;
                  this._log(`  -> [Phục hồi thành công] ${group.name}: ✅ ĐÃ THAM GIA (${retryRes.note})`, 'success');
                } else if (retryRes.isPending) {
                  this.progress.pendingCount++;
                  this._log(`  -> [Phục hồi thành công] ${group.name}: ⏳ ĐANG CHỜ DUYỆT (${retryRes.note})`, 'warn');
                } else {
                  this.progress.notJoinedCount++;
                  this._log(`  -> [Phục hồi thành công] ${group.name}: ❌ CHƯA VÀO NHÓM (${retryRes.note})`, 'info');
                }
                this.results.push({
                  groupId: group.id,
                  groupName: group.name,
                  groupUrl: group.url,
                  isJoined: isJoinedRetry,
                  isPending: retryRes.isPending,
                  status: retryRes.status,
                  note: retryRes.note,
                  time: new Date().toLocaleTimeString('vi-VN')
                });
                continue;
              }
            } catch (retryErr) {
              this._log(`  -> Thử lại sau phục hồi không thành công: ${retryErr.message}`, 'error');
            }
          }

          this.progress.errorCount++;
          this._log(`  -> [${i + 1}/${targetGroups.length}] Lỗi kiểm tra "${group.name}": ${groupErr.message}`, 'error');
          const currentIsJoined = Boolean(group.memberships?.[targetAccountId]?.isJoined);
          this.results.push({
            groupId: group.id,
            groupName: group.name,
            groupUrl: group.url,
            isJoined: currentIsJoined,
            isPending: false,
            status: 'ERROR',
            note: `Lỗi kết nối (${groupErr.message}), giữ nguyên trạng thái cũ`,
            time: new Date().toLocaleTimeString('vi-VN')
          });
        }

        // Cứ mỗi 25 nhóm, làm mới tab trình duyệt an toàn để giải phóng RAM và tránh nghẽn GraphQL
        if ((i + 1) % 25 === 0 && i < targetGroups.length - 1 && !this.shouldStop) {
          try {
            if (page && !page.isClosed()) {
              await page.close().catch(() => {});
            }
            page = await browserController.newDedicatedPage();
            await setupCDP(page);
            this._log(`[GIẢI PHÓNG RAM] Đã tự động làm mới tab sau ${i + 1} nhóm thành công.`, 'info');
          } catch (tabErr) {
            this._log(`[CẢNH BÁO TAB] Lỗi khi làm mới tab định kỳ: ${tabErr.message}`, 'warn');
            try {
              page = await browserController.newDedicatedPage();
              await setupCDP(page);
            } catch (_) {}
          }
        }

        // Giãn cách nhẹ chống quét quá nhanh
        if (i < targetGroups.length - 1 && !this.shouldStop) {
          const sleepSec = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
          await new Promise(r => setTimeout(r, sleepSec * 1000));
        }
      }

      this.progress.status = this.shouldStop ? 'STOPPED' : 'COMPLETED';
      this.progress.message = `Hoàn tất! Đã vào: ${this.progress.joinedCount} nhóm | Chưa vào: ${this.progress.notJoinedCount} nhóm | Chờ duyệt: ${this.progress.pendingCount} nhóm`;
      this._log(`[HOÀN TẤT QUÉT REALTIME] ${this.progress.message}`, 'success');

    } catch (err) {
      this._log(`[LỖI QUÉT REALTIME] ${err.message}`, 'error');
      this.progress.status = 'ERROR';
      this.progress.message = `Lỗi: ${err.message}`;
    } finally {
      this.isRunning = false;
      this.isPaused = false;
      if (typeof page !== 'undefined' && page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }

    return this.results;
  }

  /**
   * Đồng bộ toàn bộ danh sách nhóm đã tham gia siêu tốc từ trang https://www.facebook.com/groups/joins/
   * Tự động cuộn đến hết danh sách và đối chiếu đa tầng (URL, ID, Slug, Tên nhóm)
   */
  async syncJoinedGroupsFromFacebook(accountId = null, groupType = 'recruitment') {
    const targetAccountId = accountId || accountManager.getCurrentAccount()?.id || 'acc_primary';
    const mgr = getGroupMgr(groupType);
    const acc = accountManager.loadAccounts().find(a => a.id === targetAccountId);
    const accLabel = acc ? `${acc.name} (UID: ${acc.fbUserId})` : targetAccountId;

    logger.info(`[SYNC JOINS] Đang đồng bộ danh sách nhóm (${groupType.toUpperCase()}) đã vào trực tiếp từ Facebook cho nick: ${accLabel}...`);

    if (accountId && accountManager.getCurrentAccount()?.id !== targetAccountId) {
      await accountManager.switchAccount(targetAccountId);
      await new Promise(r => setTimeout(r, 1500));
    }

    const page = await browserController.ensureActivePage();
    await page.goto('https://www.facebook.com/groups/joins/', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 3000));

    // Kiểm tra đăng nhập
    const currentUrl = page.url();
    if (currentUrl.includes('/login') || currentUrl.includes('/checkpoint')) {
      throw new Error('Tài khoản chưa đăng nhập hoặc bị checkpoint trên Facebook.');
    }

    // Cuộn liên tục đến khi tải hết toàn bộ nhóm đã tham gia (tối đa 25 lần cuộn)
    let prevCount = 0;
    let sameCountStuck = 0;
    let reachedEnd = false;
    const joinedMap = new Map();

    for (let scroll = 1; scroll <= 25; scroll++) {
      const items = await page.evaluate(() => {
        window.scrollBy(0, 1800);
        const main = document.querySelector('div[role="main"], div[role="feed"]');
        if (main) main.scrollTop += 1800;

        const results = [];
        const anchors = Array.from(document.querySelectorAll('a[href*="/groups/"]'));
        for (const a of anchors) {
          const href = a.href || '';
          if (href.includes('/feed') || href.includes('/discover') || href.includes('/joins') || href.includes('/create')) continue;
          const text = (a.innerText || '').trim();
          const m = href.match(/facebook\.com\/groups\/([^\/\?#]+)/i);
          if (m) {
            const cleanSlug = m[1].toLowerCase();
            if (!['feed', 'discover', 'joins', 'create', 'notifications'].includes(cleanSlug)) {
              results.push({
                slug: cleanSlug,
                url: href.split('?')[0].replace(/\/+$/, '').toLowerCase(),
                name: text.split('\n')[0].trim()
              });
            }
          }
        }
        return results;
      });

      for (const item of items) {
        if (!joinedMap.has(item.slug)) {
          joinedMap.set(item.slug, item);
        } else if (item.name && !joinedMap.get(item.slug).name) {
          joinedMap.get(item.slug).name = item.name;
        }
      }

      if (joinedMap.size === prevCount) {
        sameCountStuck++;
        if (sameCountStuck >= 4) {
          reachedEnd = true;
          break;
        }
      } else {
        sameCountStuck = 0;
        prevCount = joinedMap.size;
      }
      await new Promise(r => setTimeout(r, 1600));
    }

    const joinedList = Array.from(joinedMap.values());
    const groups = mgr.loadGroups();
    let joinedCount = 0;
    let unjoinedCount = 0;

    groups.forEach(g => {
      const gUrl = (g.url || '').toLowerCase().trim().replace(/\/+$/, '');
      const gName = (g.name || '').toLowerCase().trim();
      const gMatch = gUrl.match(/facebook\.com\/groups\/([^\/\?#]+)/i);
      const gSlug = gMatch ? gMatch[1] : '';

      // Đối chiếu đa tầng: Clean URL, Slug, Numeric ID hoặc Tên nhóm
      const isJoined = joinedList.some(item => {
        if (item.url && (item.url === gUrl || gUrl.includes(item.url) || item.url.includes(gUrl))) return true;
        if (gSlug && item.slug && (item.slug === gSlug || gSlug.includes(item.slug) || item.slug.includes(gSlug))) return true;
        if (gName && item.name && (item.name.toLowerCase() === gName || item.name.toLowerCase().includes(gName) || gName.includes(item.name.toLowerCase()))) {
          // Chỉ match theo tên nếu tên đủ dài (>= 8 ký tự) để tránh nhầm lẫn
          if (gName.length >= 8 && item.name.length >= 8) return true;
        }
        return false;
      });

      // Nếu tìm thấy -> chắc chắn đã tham gia
      // Nếu không tìm thấy: Chỉ cập nhật false nếu đã cuộn được trọn vẹn danh sách đến cuối
      if (isJoined) {
        mgr.updateGroupMembership(g.id, true, targetAccountId);
        joinedCount++;
      } else if (reachedEnd) {
        mgr.updateGroupMembership(g.id, false, targetAccountId);
        unjoinedCount++;
      } else {
        // Chưa cuộn hết -> Giữ nguyên trạng thái cũ
        const currentIsJ = Boolean(g.memberships?.[targetAccountId]?.isJoined);
        if (currentIsJ) joinedCount++;
        else unjoinedCount++;
      }
    });

    logger.success(`[SYNC JOINS HOÀN TẤT] Nick ${accLabel}: Tìm thấy ${joinedList.length} nhóm trên Facebook. Khớp hệ thống: Đã vào ${joinedCount} nhóm, Chưa vào ${unjoinedCount} nhóm.`);

    return {
      success: true,
      accountId: targetAccountId,
      total: groups.length,
      fbTotal: joinedList.length,
      joinedCount,
      unjoinedCount
    };
  }
}

module.exports = new GroupVerifier();
