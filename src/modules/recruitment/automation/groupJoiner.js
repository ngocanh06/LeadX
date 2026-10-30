/**
 * groupJoiner.js - Tự động xin vào Hội Nhóm Facebook (Auto Group Joiner)
 * Tự động bấm "Tham gia nhóm", tự điền câu hỏi khảo sát, đồng ý nội quy và kiểm soát delay chống checkpoint
 */
const browserController = require('../../../core/automation/browserController');
const accountManager = require('../../../core/services/accountManager');
const groupManager = require('../services/groupManager');
const bdsGroupManager = require('../../bds/services/bdsGroupManager');
const logger = require('../../../core/utils/logger');

function getGroupMgr(groupType) {
  return groupType === 'bds' ? bdsGroupManager : groupManager;
}

class GroupJoiner {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentAccountId = null;
    this.progress = {
      current: 0,
      total: 0,
      successCount: 0,
      pendingCount: 0,
      alreadyMemberCount: 0,
      failCount: 0,
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
      logs: this.logs.slice(-35)
    };
  }

  pause() {
    if (this.isRunning && !this.isPaused) {
      this.isPaused = true;
      this.progress.status = 'PAUSED';
      this.progress.message = 'Tiến trình đã tạm dừng.';
      this._log('[TẠM DỪNG] Người dùng bấm tạm dừng tiến trình xin vào nhóm.', 'warn');
      return true;
    }
    return false;
  }

  resume() {
    if (this.isRunning && this.isPaused) {
      this.isPaused = false;
      this.progress.status = 'RUNNING';
      this.progress.message = 'Đang tiếp tục tiến trình...';
      this._log('[TIẾP TỤC] Người dùng tiếp tục tiến trình.', 'info');
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
      this.progress.message = 'Tiến trình đã dừng lại.';
      this._log('[DỪNG TIẾN TRÌNH] Đã gửi lệnh dừng Auto-Joiner.', 'warn');
      return true;
    }
    return false;
  }

  /**
   * Phân tích trạng thái thành viên nhóm Facebook chuẩn xác 100% (loại bỏ sai lệch do sidebar)
   */
  async inspectGroupState(page) {
    return await page.evaluate(() => {
      const bodyText = (document.body.innerText || '').toLowerCase();
      const currentUrl = window.location.href;

      // 1. Kiểm tra trạng thái Checkpoint / Phiên đăng nhập
      const isLogin = currentUrl.includes('/login') || 
        (bodyText.includes('xem thêm trên facebook') && bodyText.includes('đăng nhập')) || 
        (bodyText.includes('see more on facebook') && bodyText.includes('log in'));
      if (isLogin) {
        return { status: 'NOT_LOGGED_IN', isMember: false, isPending: false, hasJoinBtn: false, isActionBlocked: false };
      }

      // 2. Kiểm tra nếu Facebook hiện popup chặn tính năng (Action Blocked)
      const dialog = document.querySelector('div[role="dialog"]');
      const dialogText = dialog ? (dialog.innerText || '').toLowerCase() : '';
      const isActionBlocked = dialogText.includes('chưa dùng được tính năng này') ||
                             dialogText.includes('bảo vệ cộng đồng khỏi spam') ||
                             dialogText.includes('giới hạn tần suất') ||
                             dialogText.includes('hành động bị chặn') ||
                             dialogText.includes('hành vi tự động') ||
                             dialogText.includes('automated behavior') ||
                             dialogText.includes('hoạt động bất thường') ||
                             dialogText.includes('tạm thời bị hạn chế') ||
                             dialogText.includes('we limit how often');

      // 3. Quét các nút điều khiển chính của nhóm (LOẠI TRỪ HOÀN TOÀN SIDEBAR GỢI Ý)
      const buttons = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"], div[aria-label]'));

      let hasJoinedBtn = false;
      let hasManageBtn = false;
      let hasPendingBtn = false;
      let hasJoinBtn = false;

      for (const b of buttons) {
        const rect = b.getBoundingClientRect();
        const isVisible = b.offsetParent !== null && rect.height > 0 && rect.width > 0;
        if (!isVisible) continue;

        // Bỏ qua các nút nằm trong sidebar gợi ý nhóm khác hoặc danh sách đề xuất ngoài lề
        if (b.closest('div[role="complementary"], aside, div[aria-label*="gợi ý"], div[aria-label*="nhóm tương tự"]')) {
          continue;
        }

        const txt = (b.innerText || '').trim().toLowerCase();
        const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();

        // 3.1. Nút "Tham gia nhóm" (Dấu hiệu BẤT BIẾN của việc CHƯA THAM GIA)
        const isJoin = (
          (txt === 'tham gia nhóm' || txt === 'tham gia' || txt === '+ tham gia' || txt === 'join group' || txt === 'join' ||
           aria === 'tham gia nhóm' || aria === 'join group' || aria.includes('tham gia nhóm') || aria.includes('join group')) &&
          !txt.includes('đã') && !aria.includes('đã') &&
          !txt.includes('chờ') && !aria.includes('chờ') &&
          !txt.includes('hủy') && !aria.includes('hủy')
        );
        if (isJoin) {
          hasJoinBtn = true;
        }

        // 3.2. Nút "Hủy yêu cầu" / "Đang chờ duyệt"
        const isPending = (
          txt.includes('hủy yêu cầu') || aria.includes('hủy yêu cầu') ||
          txt.includes('đang chờ phê duyệt') || aria.includes('đang chờ phê duyệt') ||
          txt.includes('chờ phê duyệt') || aria.includes('chờ phê duyệt') ||
          txt.includes('yêu cầu đã gửi') || aria.includes('yêu cầu đã gửi') ||
          txt.includes('pending') || aria.includes('pending') ||
          txt.includes('cancel request') || aria.includes('cancel request')
        );
        if (isPending) {
          hasPendingBtn = true;
        }

        // 3.3. Nút "Đã tham gia" / "Joined" / "Rời khỏi nhóm"
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

        // 3.4. Quản trị viên: "Quản lý nhóm" / "Admin tools"
        const isManage = (
          txt === 'quản lý' || txt === 'manage' || txt === 'công cụ quản trị' ||
          aria === 'quản lý' || aria === 'manage' || aria.includes('quản lý nhóm') || aria.includes('admin tools')
        );
        if (isManage) {
          hasManageBtn = true;
        }
      }

      // 4. Kiểm tra thông báo chờ duyệt hoặc nhóm riêng tư bị khóa
      const hasPendingText = bodyText.includes('yêu cầu tham gia của bạn đang chờ phê duyệt') ||
        bodyText.includes('yêu cầu của bạn đang chờ phê duyệt') ||
        bodyText.includes('your request to join is pending approval');
      if (hasPendingText) {
        hasPendingBtn = true;
      }

      const isPrivateLocked = (bodyText.includes('nhóm riêng tư') || bodyText.includes('private group')) &&
        (bodyText.includes('hãy tham gia nhóm này để xem') || bodyText.includes('tham gia nhóm này để xem') || bodyText.includes('join this group to view'));

      // NGUYÊN TẮC PHÁN QUYẾT BẤT BIẾN THEO THỨ TỰ ƯU TIÊN AN TOÀN TUYỆT ĐỐI:
      // QUY TẮC 1: Nếu có nút "Tham gia nhóm" hoặc nhóm riêng tư bị khóa -> 100% CHƯA THAM GIA
      if (hasJoinBtn || isPrivateLocked) {
        return {
          isMember: false,
          isPending: false,
          joinBtnFound: true,
          hasJoinedBtn: false,
          hasPendingBtn: false,
          hasJoinBtn: true,
          isActionBlocked
        };
      }

      // QUY TẮC 2: Nếu có nút "Hủy yêu cầu" hoặc đang chờ duyệt -> 100% ĐANG CHỜ DUYỆT
      if (hasPendingBtn) {
        return {
          isMember: false,
          isPending: true,
          joinBtnFound: false,
          hasJoinedBtn: false,
          hasPendingBtn: true,
          hasJoinBtn: false,
          isActionBlocked
        };
      }

      // QUY TẮC 3: Nếu có nút "Đã tham gia" hoặc quyền "Quản lý" -> 100% ĐÃ THAM GIA
      if (hasJoinedBtn || hasManageBtn) {
        return {
          isMember: true,
          isPending: false,
          joinBtnFound: false,
          hasJoinedBtn: true,
          hasPendingBtn: false,
          hasJoinBtn: false,
          isActionBlocked
        };
      }

      // Mặc định an toàn: nếu chưa nhận diện rõ ràng, tuyệt đối không coi là thành viên
      return {
        isMember: false,
        isPending: false,
        joinBtnFound: false,
        hasJoinedBtn: false,
        hasPendingBtn: false,
        hasJoinBtn: false,
        isActionBlocked
      };
    });
  }

  /**
   * Tự động xử lý mọi bảng biểu popup: chọn Profile tham gia, trả lời khảo sát, đồng ý điều khoản, xác nhận
   */
  async _handleSurveyAndRules(page, defaultAnswer = 'Tôi đồng ý và cam kết tuân thủ mọi nội quy của nhóm.') {
    try {
      let anyHandled = false;
      let lastSuccess = false;

      // Lặp tối đa 3 lượt xử lý để hỗ trợ modal nhiều bước (Chọn profile -> Khảo sát -> Xác nhận)
      for (let step = 0; step < 3; step++) {
        await new Promise(r => setTimeout(r, 1200));

        const hasModal = await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return false;
          const text = (dialog.innerText || '').toLowerCase();
          return text.includes('câu hỏi') || text.includes('quy tắc') || text.includes('rules') || 
                 text.includes('questions') || text.includes('nội quy') || text.includes('tham gia nhóm') ||
                 text.includes('chọn trang') || text.includes('chọn profile') || text.includes('tư cách');
        });

        if (!hasModal) {
          break; // Không còn popup nào cần xử lý
        }

        this._log(`  -> Phát hiện hộp thoại / bảng câu hỏi xét duyệt (Bước ${step + 1}). Đang tự động xử lý...`);

        // 1. Tự động tick các checkbox đồng ý nội quy trong dialog
        const checkedBoxes = await page.evaluate(() => {
          let count = 0;
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return 0;

          const checkboxes = dialog.querySelectorAll('input[type="checkbox"], div[role="checkbox"]');
          for (const cb of checkboxes) {
            const isAriaChecked = cb.getAttribute('aria-checked') === 'true';
            const isChecked = cb.checked || isAriaChecked;
            if (!isChecked) {
              cb.click();
              count++;
            }
          }
          return count;
        });

        if (checkedBoxes > 0) {
          this._log(`  -> Đã tự động tích ${checkedBoxes} ô đồng ý điều khoản/nội quy.`);
          await new Promise(r => setTimeout(r, 600));
        }

        // 2. Tự động điền các ô nhập câu hỏi khảo sát
        const filledInputs = await page.evaluate((ans) => {
          let count = 0;
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return 0;

          const textInputs = dialog.querySelectorAll('textarea, input[type="text"]');
          for (const input of textInputs) {
            if (!input.value || input.value.trim().length === 0) {
              input.value = ans;
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              count++;
            }
          }
          return count;
        }, defaultAnswer);

        if (filledInputs > 0) {
          this._log(`  -> Đã tự động điền câu trả lời mẫu cho ${filledInputs} câu hỏi khảo sát.`);
          await new Promise(r => setTimeout(r, 600));
        }

        // 3. Tìm và nhấn nút Submit / Gửi / Hoàn tất / Tiếp tục / Tham gia nhóm
        const submitted = await page.evaluate(() => {
          const dialog = document.querySelector('div[role="dialog"]');
          if (!dialog) return false;

          const buttons = Array.from(dialog.querySelectorAll('div[role="button"], button'));
          const targetLabels = [
            'gửi', 'submit', 'hoàn tất', 'xong', 'gửi câu trả lời', 
            'tham gia nhóm', 'tiếp tục', 'tiếp', 'xác nhận', 'đồng ý', 'lưu', 'join group', 'confirm'
          ];

          for (const label of targetLabels) {
            for (const btn of buttons) {
              const txt = (btn.innerText || '').trim().toLowerCase();
              const aria = (btn.getAttribute('aria-label') || '').trim().toLowerCase();
              if (txt === label || aria === label || txt.includes(label)) {
                btn.click();
                try {
                  btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                } catch(e) {}
                return true;
              }
            }
          }
          return false;
        });

        if (submitted) {
          anyHandled = true;
          lastSuccess = true;
          this._log(`  -> Đã bấm gửi/xác nhận phiếu biểu mẫu thành công!`, 'success');
          await new Promise(r => setTimeout(r, 1500));
        } else {
          break;
        }
      }

      return { handled: anyHandled, success: lastSuccess };
    } catch (err) {
      this._log(`  -> Gặp lỗi khi xử lý khảo sát: ${err.message}`, 'warn');
      return { handled: false, error: err.message };
    }
  }

  /**
   * Kiểm tra toàn diện xem có Checkpoint, khóa tài khoản hoặc cảnh báo nghi ngờ tự động không
   */
  async _checkIntegrityAlert(page) {
    try {
      const currentUrl = page.url();
      if (currentUrl.includes('/checkpoint') || currentUrl.includes('/recover') || currentUrl.includes('/two_step_verification')) {
        return { isAlert: true, type: 'CHECKPOINT', message: 'Phát hiện chuyển hướng sang màn hình Checkpoint Facebook!' };
      }

      const alertInfo = await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').toLowerCase();
        const dialog = document.querySelector('div[role="dialog"]');
        const dialogText = dialog ? (dialog.innerText || '').toLowerCase() : '';
        const combined = (bodyText + ' ' + dialogText).toLowerCase();

        // 1. Checkpoint nặng (Video selfie / Khóa vĩnh viễn / Yêu cầu CCCD / 282 / 956)
        if (combined.includes('xác nhận danh tính') ||
            combined.includes('video selfie') ||
            combined.includes('tài khoản của bạn đã bị khóa') ||
            combined.includes('your account has been disabled') ||
            combined.includes('your account has been locked') ||
            combined.includes('chúng tôi cần có thêm thông tin') ||
            combined.includes('chúng tôi đã phát hiện thấy hoạt động bất thường')) {
          return { isAlert: true, type: 'CHECKPOINT', message: 'Facebook yêu cầu xác minh danh tính hoặc khóa tài khoản (Checkpoint 282 / 956)!' };
        }

        // 2. Cảnh báo nghi ngờ hành vi tự động / Giới hạn tần suất (Action Block / Automated Behavior Warning)
        if (combined.includes('hành vi tự động') ||
            combined.includes('automated behavior') ||
            combined.includes('hoạt động bất thường') ||
            combined.includes('unusual activity') ||
            combined.includes('nghi ngờ bạn đang dùng') ||
            combined.includes('nghi ngờ có hành vi') ||
            combined.includes('chúng tôi giới hạn tần suất') ||
            combined.includes('giới hạn tần suất bạn có thể') ||
            combined.includes('we limit how often') ||
            combined.includes('chưa dùng được tính năng này') ||
            combined.includes('tạm thời bị hạn chế') ||
            combined.includes('bảo vệ cộng đồng') ||
            combined.includes('bạn tạm thời bị chặn') ||
            combined.includes('you are temporarily blocked') ||
            combined.includes('you can\'t use this feature')) {
          return { isAlert: true, type: 'AUTOMATED_BEHAVIOR', message: 'Facebook cảnh báo nghi ngờ hành vi tự động hoặc tạm khóa tính năng (Action Block)!' };
        }

        return { isAlert: false };
      });

      return alertInfo;
    } catch (e) {
      return { isAlert: false };
    }
  }

  /**
   * Mô phỏng hành vi lướt web như người dùng thật (cuộn trang, di chuột, dừng đọc bài)
   */
  async _simulateHumanInteraction(page) {
    try {
      // Cuộn nhẹ xuống dưới để xem bài viết trong nhóm
      await page.evaluate(() => {
        window.scrollBy({ top: Math.floor(Math.random() * 250) + 150, behavior: 'smooth' });
      });
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 1000) + 800));

      // Di chuột nhẹ
      const randomX = Math.floor(Math.random() * 300) + 200;
      const randomY = Math.floor(Math.random() * 200) + 150;
      await page.mouse.move(randomX, randomY, { steps: 5 }).catch(() => {});

      // Cuộn nhẹ lên
      await page.evaluate(() => {
        window.scrollBy({ top: -(Math.floor(Math.random() * 120) + 80), behavior: 'smooth' });
      });
      await new Promise(r => setTimeout(r, Math.floor(Math.random() * 800) + 500));
    } catch (e) {}
  }

  /**
   * Bắt đầu tiến trình tự động xin vào danh sách nhóm
   */
  async joinGroups({ groupIds = [], accountId = null, delayMin = 45, delayMax = 80, autoAnswer = '', groupType = 'recruitment' } = {}) {
    if (this.isRunning) {
      throw new Error('Tiến trình Auto-Joiner đang hoạt động!');
    }

    if (!groupIds || groupIds.length === 0) {
      throw new Error('Vui lòng chọn ít nhất một hội nhóm để xin tham gia!');
    }

    this.groupType = groupType;
    const mgr = getGroupMgr(groupType);
    const allGroups = mgr.getGroups({ accountId });
    const targetGroups = allGroups.filter(g => groupIds.includes(g.id));
    if (targetGroups.length === 0) {
      throw new Error('Không tìm thấy hội nhóm hợp lệ trong danh sách đã chọn.');
    }

    this.isRunning = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.currentAccountId = accountId;
    this.results = [];
    this.logs = [];

    this.progress = {
      current: 0,
      total: targetGroups.length,
      successCount: 0,
      pendingCount: 0,
      alreadyMemberCount: 0,
      failCount: 0,
      status: 'RUNNING',
      currentGroupName: '',
      message: `Khởi động Auto-Joiner cho ${targetGroups.length} nhóm...`
    };

    this._log(`[BẮT ĐẦU AUTO-JOINER] Chuẩn bị xin vào ${targetGroups.length} nhóm. Giãn cách an toàn: ${delayMin}s - ${delayMax}s.`);

    try {
      // 1. Chuyển tài khoản nếu được chỉ định và kiểm tra Action Block
      const currentTargetAcc = accountId 
        ? accountManager.loadAccounts().find(a => a.id === accountId)
        : accountManager.getCurrentAccount();

      if (currentTargetAcc && currentTargetAcc.status === 'ACTION_BLOCKED') {
        const blockReason = currentTargetAcc.actionBlock?.reason || 'Đang bị Facebook tạm khóa tính năng xin vào nhóm.';
        this._log(`⚠️ [CẢNH BÁO ACTION BLOCK] Tài khoản "${currentTargetAcc.name}" đang bị Facebook tạm khóa tính năng xin vào nhóm ("Giờ bạn chưa dùng được tính năng này"). Không thể xin nhóm lúc này!`, 'error');
        throw new Error(`Tài khoản "${currentTargetAcc.name}" đang bị Facebook tạm khóa tính năng xin vào nhóm (${blockReason}). Vui lòng cho nick nghỉ ngơi vài giờ hoặc bấm "Gỡ Cảnh Báo" trong Quản Lý Tài Khoản nếu FB đã mở lại.`);
      }

      if (accountId) {
        const accounts = accountManager.loadAccounts();
        const acc = accounts.find(a => a.id === accountId);
        if (acc) {
          this._log(`Đang kích hoạt tài khoản thực thi: "${acc.name}" (UID: ${acc.fbUserId})`);
          await accountManager.switchAccount(accountId);
          await new Promise(r => setTimeout(r, 2000));
        }
      }

      let page = null;
      page = await browserController.newDedicatedPage();

      // Chỉ chặn các định dạng video nặng để tiết kiệm CPU/RAM, GIỮ NGUYÊN ảnh và tín hiệu Meta để trình duyệt giống người thật 100%
      try {
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.setBlockedURLs', {
          urls: [
            '*.mp4*', '*.webm*', '*.avi*', '*.m4v*'
          ]
        });
      } catch (cdpErr) {}

      // PRE-FLIGHT CHECK: Xác thực tài khoản có đang đăng nhập thật trên Facebook không trước khi bấm xin nhóm
      this._log(`[BƯỚC 1/2] Đang xác thực phiên đăng nhập của tài khoản trên Facebook...`);
      const joinerCookies = await page.cookies('https://www.facebook.com');
      const hasCUser = joinerCookies.some(c => c.name === 'c_user' && c.value && String(c.value).length > 4);
      if (!hasCUser) {
        this._log(`🚨 [CHƯA ĐĂNG NHẬP] Trình duyệt chưa có Cookie c_user hợp lệ. Vui lòng vào Tab "Quản Lý Tài Khoản" cập nhật Cookie mới.`, 'error');
        throw new Error('Tài khoản Facebook chưa được đăng nhập (Cookie hết hạn hoặc bị văng). Vui lòng cập nhật Cookie mới tại Tab "Quản Lý Tài Khoản" trước khi xin vào nhóm.');
      }

      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
      const currentUrl = page.url();
      const bodyText = await page.evaluate(() => (document.body.innerText || '').toLowerCase());
      
      const isLoginRedirect = currentUrl.includes('/login') ||
        bodyText.includes('explore the things you love') ||
        bodyText.includes('bạn phải đăng nhập để tiếp tục') ||
        bodyText.includes('use another profile') ||
        bodyText.includes('see more on facebook');

      if (isLoginRedirect) {
        this._log(`🚨 [COOKIE HẾT HẠN] Tài khoản đã bị Facebook đăng xuất. Vui lòng cập nhật Cookie mới!`, 'error');
        throw new Error('Cookie Facebook của nick này đã hết hạn hoặc bị đăng xuất. Vui lòng cập nhật Cookie mới tại Tab "Quản Lý Tài Khoản" trước khi bắt đầu xin nhóm.');
      }

      const isCheckpoint = currentUrl.includes('/checkpoint') ||
        bodyText.includes('xác nhận danh tính') ||
        bodyText.includes('video selfie') ||
        bodyText.includes('tài khoản của bạn đã bị khóa');

      if (isCheckpoint) {
        if (currentTargetAcc) accountManager.markCheckpoint(currentTargetAcc.id, 'Phát hiện Checkpoint trước khi xin nhóm.');
        this._log(`🚨 [BÁO ĐỘNG CHECKPOINT] Tài khoản đang bị Facebook yêu cầu xác minh danh tính! Dừng khẩn cấp.`, 'error');
        throw new Error('Tài khoản đang bị Facebook Checkpoint (xác minh danh tính). Hệ thống tự động ngắt để bảo vệ nick!');
      }

      this._log(`[BƯỚC 2/2] Xác thực tài khoản an toàn! Bắt đầu tiến trình xin vào ${targetGroups.length} nhóm...`, 'success');

      for (let i = 0; i < targetGroups.length; i++) {
        if (this.shouldStop) {
          this._log('[DỪNG TIẾN TRÌNH] Đã hủy tiến trình theo yêu cầu của bạn.', 'warn');
          break;
        }

        while (this.isPaused) {
          if (this.shouldStop) break;
          await new Promise(r => setTimeout(r, 1000));
        }

        const group = targetGroups[i];
        this.progress.current = i + 1;
        this.progress.currentGroupName = group.name;
        this.progress.message = `[${i + 1}/${targetGroups.length}] Đang xử lý: ${group.name}`;
        
        // Ghi log chi tiết tên nhóm ra terminal của modal
        this._log(`[${i + 1}/${targetGroups.length}] 🎯 Đang xử lý nhóm: "${group.name}"`, 'info');
        this._log(`  -> Link nhóm: ${group.url}`, 'info');

        try {
          await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
          await new Promise(r => setTimeout(r, 1200));

          // 1. Kiểm tra khẩn cấp: Facebook có chuyển hướng sang Checkpoint hoặc Cảnh báo tự động không?
          const integrityAlert = await this._checkIntegrityAlert(page);
          if (integrityAlert.isAlert) {
            if (integrityAlert.type === 'CHECKPOINT') {
              this._log(`🚨 [BÁO ĐỘNG CHECKPOINT] ${integrityAlert.message} Tự động DỪNG KHẨN CẤP toàn bộ tiến trình để bảo vệ nick không bị khóa vĩnh viễn!`, 'error');
              if (this.currentAccountId) {
                accountManager.markCheckpoint(this.currentAccountId, 'Phát hiện màn hình xác minh danh tính Facebook (Checkpoint 282 / Video Selfie / Khóa tài khoản).');
              }
            } else {
              this._log(`🚨 [CẢNH BÁO HÀNH VI TỰ ĐỘNG / ACTION BLOCK] ${integrityAlert.message} Dừng ngay lập tức để bảo vệ tài khoản!`, 'error');
              if (this.currentAccountId) {
                accountManager.markActionBlocked(this.currentAccountId, 'JOIN_GROUP', 'Facebook phát hiện hoặc nghi ngờ hành vi tự động. Tự động ngắt để bảo vệ nick.', 6);
              }
            }
            this.shouldStop = true;
            this.isRunning = false;
            break;
          }

          // 2. Kiểm tra nếu Cookie tài khoản bị hết hạn / đăng xuất
          const currentUrl = page.url();
          const isLoggedOut = currentUrl.includes('/login') || await page.evaluate(() => {
            const body = (document.body.innerText || '').toLowerCase();
            return (body.includes('explore the things you love') && body.includes('create new account')) ||
                   (body.includes('log in to facebook') && !body.includes('tạo bài viết') && !body.includes('viết gì')) ||
                   body.includes('bạn phải đăng nhập để tiếp tục');
          });

          if (isLoggedOut) {
            this._log(`🚨 [COOKIE HẾT HẠN] Tài khoản đã bị Facebook đăng xuất! Vui lòng vào Tab "Quản Lý Tài Khoản" -> Cập nhật Cookie mới nhất từ tiện ích Cookie-Editor để tiếp tục.`, 'error');
            this.shouldStop = true;
            this.isRunning = false;
            break;
          }

          // Tự động đóng modal "See more on Facebook" / popup che màn hình nếu có
          await page.evaluate(() => {
            const closeBtn = document.querySelector('div[role="dialog"] div[aria-label="Close"], div[role="dialog"] div[aria-label="Đóng"], div[aria-label="Close"]');
            if (closeBtn) try { closeBtn.click(); } catch(e) {}
          });

          // 2.5. Mô phỏng hành vi người dùng thật (cuộn trang, di chuột, dừng đọc bài 2-4 giây)
          this._log(`  -> Mô phỏng thao tác người thật (lướt đọc nội dung nhóm)...`);
          await this._simulateHumanInteraction(page);

          // 3. Dynamic polling: Đợi và nhận diện nút trạng thái ngay lập tức (không đợi cứng 4 giây)
          let checkStatus = { isMember: false, isPending: false, joinBtnFound: false };
          const pollStart = Date.now();
          while (Date.now() - pollStart < 2500) {
            checkStatus = await this.inspectGroupState(page);
            if (checkStatus.isMember || checkStatus.isPending || checkStatus.joinBtnFound) {
              break;
            }
            await new Promise(r => setTimeout(r, 200));
          }

          if (checkStatus.isMember) {
            this._log(`  -> 🎉 [ĐÃ THAM GIA] Tài khoản đã là thành viên chính thức của nhóm này ("Đã tham gia" / Có ô đăng bài)! Cập nhật dữ liệu chuẩn xác.`, 'success');
            mgr.updateGroupMembership(group.id, true, this.currentAccountId);
            this.progress.successCount++;
            this.results.push({
              groupId: group.id,
              groupName: group.name,
              status: 'JOINED_SUCCESS',
              time: new Date().toLocaleTimeString('vi-VN'),
              note: 'Đã là thành viên'
            });
            continue;
          }

          if (checkStatus.isPending) {
            this._log(`  -> ⏳ [CHỜ DUYỆT] Yêu cầu tham gia đã gửi trước đó (đang chờ Quản trị viên duyệt).`, 'info');
            mgr.updateGroupMembership(group.id, false, this.currentAccountId);
            this.progress.pendingCount++;
            this.results.push({
              groupId: group.id,
              groupName: group.name,
              status: 'PENDING_APPROVAL',
              time: new Date().toLocaleTimeString('vi-VN'),
              note: 'Đang chờ admin duyệt'
            });
            continue;
          }

          // Nhấn Escape trước để đóng mọi popup/dropdown rác đang che màn hình
          await page.keyboard.press('Escape').catch(() => {});
          await new Promise(r => setTimeout(r, 400));
          await page.keyboard.press('Escape').catch(() => {});

          // 4. Nhấn nút "Tham gia nhóm" (LOẠI BỎ TRIỆT ĐỂ NÚT SIDEBAR GỢI Ý)
          this._log(`  -> Đang tìm và bấm nút "Tham gia nhóm"...`);
          const clickedJoin = await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"]'));
            for (const b of buttons) {
              const rect = b.getBoundingClientRect();
              const isVisible = b.offsetParent !== null && rect.height > 0 && rect.width > 0;
              if (!isVisible) continue;

              // Loại trừ các nút nằm trong sidebar gợi ý nhóm khác ("aside", "complementary", gợi ý nhóm)
              if (b.closest('div[role="complementary"], aside, div[aria-label*="gợi ý"], div[aria-label*="nhóm tương tự"]')) {
                continue;
              }

              const txt = (b.innerText || '').trim().toLowerCase();
              const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();

              if (txt.includes('đã tham gia') || aria.includes('đã tham gia') || txt.includes('hủy') || aria.includes('hủy')) {
                continue;
              }

              const isJoin = (
                txt === 'tham gia nhóm' || 
                txt === 'tham gia' || 
                txt === 'join group' || 
                txt === 'join' ||
                aria === 'tham gia nhóm' || 
                aria === 'join group' ||
                aria.includes('tham gia nhóm') ||
                aria.includes('join group')
              );

              if (isJoin) {
                b.scrollIntoView({ behavior: 'smooth', block: 'center' });
                b.click();
                try {
                  b.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
                } catch(e) {}
                return true;
              }
            }
            return false;
          });

          if (!clickedJoin) {
            this._log(`  -> Không tìm thấy nút "Tham gia nhóm" trên giao diện (có thể nhóm đóng hoặc link hỏng).`, 'warn');
            this.progress.failCount++;
            this.results.push({
              groupId: group.id,
              groupName: group.name,
              status: 'FAILED',
              time: new Date().toLocaleTimeString('vi-VN'),
              note: 'Không tìm thấy nút Tham gia'
            });
          } else {
            this._log(`  -> Đã bấm nút "Tham gia nhóm"! Đang kiểm tra câu hỏi khảo sát / hộp thoại...`, 'success');
            
            // Xử lý câu hỏi khảo sát / chọn profile nếu có
            const surveyResult = await this._handleSurveyAndRules(page, autoAnswer || undefined);

            // Chờ Facebook cập nhật trạng thái nút trên giao diện (poll thực tế)
            let postJoinCheck = { isMember: false, isPending: false, hasJoinBtn: true, isActionBlocked: false };
            const postPollStart = Date.now();
            while (Date.now() - postPollStart < 3500) {
              postJoinCheck = await this.inspectGroupState(page);
              if (postJoinCheck.isActionBlocked || postJoinCheck.isMember || postJoinCheck.isPending) {
                break;
              }
              await new Promise(r => setTimeout(r, 250));
            }

            if (postJoinCheck.isActionBlocked) {
              this._log(`🚨 [BỊ FACEBOOK CHẶN TÍNH NĂNG] Tài khoản đã bị Facebook tạm khóa thao tác xin vào nhóm ("Giờ bạn chưa dùng được tính năng này để bảo vệ cộng đồng khỏi spam"). Đã tự động ghi chú vào Quản Lý Tài Khoản và dừng tiến trình an toàn!`, 'error');
              
              const blockedAcc = this.currentAccountId 
                ? accountManager.loadAccounts().find(a => a.id === this.currentAccountId)
                : accountManager.getCurrentAccount();
              if (blockedAcc) {
                accountManager.markActionBlocked(
                  blockedAcc.id,
                  'JOIN_GROUP',
                  'Facebook tạm khóa tính năng do nick đã gửi nhiều yêu cầu xin vào nhóm liên tiếp. Nút "Tham gia nhóm" sẽ không có tác dụng trong vài giờ.',
                  6
                );
              }

              this.shouldStop = true;
              this.isRunning = false;
              this.progress.failCount++;
              this.results.push({
                groupId: group.id,
                groupName: group.name,
                status: 'ACTION_BLOCKED',
                time: new Date().toLocaleTimeString('vi-VN'),
                note: 'Bị Facebook chặn tính năng (Thao tác quá nhanh)'
              });
              break;
            }

            if (postJoinCheck.isMember) {
              this._log(`  -> 🎉 [NHÓM TỰ DUYỆT / ĐÃ VÀO] Tài khoản đã được chấp thuận vào nhóm chính thức ("Đã tham gia")!`, 'success');
              mgr.updateGroupMembership(group.id, true, this.currentAccountId);
              this.progress.successCount++;
              this.results.push({
                groupId: group.id,
                groupName: group.name,
                status: 'JOINED_SUCCESS',
                time: new Date().toLocaleTimeString('vi-VN'),
                note: 'Đã là thành viên chính thức'
              });
            } else if (postJoinCheck.isPending || surveyResult.handled) {
              this._log(`  -> ⏳ [CHỜ DUYỆT] Đã bấm gửi yêu cầu tham gia thành công. Nhóm yêu cầu Admin duyệt thủ công.`, 'info');
              mgr.updateGroupMembership(group.id, false, this.currentAccountId);
              this.progress.pendingCount++;
              this.results.push({
                groupId: group.id,
                groupName: group.name,
                status: 'PENDING_APPROVAL',
                time: new Date().toLocaleTimeString('vi-VN'),
                note: 'Đã gửi yêu cầu (Chờ Admin duyệt)'
              });
            } else {
              this._log(`  -> ⚠️ Chưa thể gửi yêu cầu tham gia nhóm này.`, 'warn');
              this.progress.failCount++;
              this.results.push({
                groupId: group.id,
                groupName: group.name,
                status: 'FAILED',
                time: new Date().toLocaleTimeString('vi-VN'),
                note: 'Chưa tham gia được'
              });
            }
          }
        } catch (groupErr) {
          this._log(`  -> Lỗi khi xử lý nhóm "${group.name}": ${groupErr.message}`, 'error');
          this.progress.failCount++;
          this.results.push({
            groupId: group.id,
            groupName: group.name,
            status: 'ERROR',
            time: new Date().toLocaleTimeString('vi-VN'),
            note: groupErr.message
          });
        }

        // BẢO VỆ ĐỊNH KỲ (BATCH COOLDOWN): Cứ sau mỗi 3 nhóm, tự động nghỉ xả hơi 90 giây
        // Mô phỏng hành vi người thật giải lao, tránh thuật toán phát hiện chuỗi thao tác bot liên tục
        if ((i + 1) % 3 === 0 && i < targetGroups.length - 1 && !this.shouldStop) {
          const restBatchSec = 90;
          this._log(`☕ [NGHỈ ĐỊNH KỲ BẢO VỆ NICK] Đã xin vào liên tiếp ${i + 1} nhóm. Tự động tạm nghỉ ${restBatchSec}s để xả hơi và xóa dấu vết thuật toán quét tự động của Meta...`, 'warn');
          for (let s = restBatchSec; s > 0; s--) {
            if (this.shouldStop) break;
            while (this.isPaused) {
              if (this.shouldStop) break;
              await new Promise(r => setTimeout(r, 1000));
            }
            this.progress.message = `[Nghỉ định kỳ] Đang xả hơi ${s}s (Bảo vệ tài khoản sau mỗi 3 nhóm)...`;
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        // Nghỉ giãn cách ngẫu nhiên để chống checkpoint FB (trừ nhóm cuối cùng)
        if (i < targetGroups.length - 1 && !this.shouldStop) {
          const sleepSeconds = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
          this._log(`[GIÃN CÁCH AN TOÀN] Chờ ngẫu nhiên ${sleepSeconds} giây trước khi xin vào nhóm tiếp theo...`);
          
          for (let s = sleepSeconds; s > 0; s--) {
            if (this.shouldStop) break;
            while (this.isPaused) {
              if (this.shouldStop) break;
              await new Promise(r => setTimeout(r, 1000));
            }
            this.progress.message = `[Nghỉ giãn cách] Đang chờ ${s}s để chống khóa nick...`;
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      this.progress.status = this.shouldStop ? 'STOPPED' : 'COMPLETED';
      this.progress.message = `Hoàn tất! Thành công: ${this.progress.successCount}, Chờ duyệt / Nộp KS: ${this.progress.pendingCount}, Lỗi: ${this.progress.failCount}`;
      this._log(`[KẾT THÚC TIẾN TRÌNH] ${this.progress.message}`, 'success');
    } catch (err) {
      this._log(`[LỖI AUTO-JOINER] ${err.message}`, 'error');
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
   * Tự động kiểm tra trạng thái Action Block thực tế trên Facebook
   */
  async probeActionBlock(accountId, groupType = 'recruitment') {
    if (this.isRunning) {
      throw new Error('Tiến trình Auto-Joiner đang chạy. Vui lòng tạm dừng hoặc chờ tiến trình hoàn tất trước khi kiểm tra.');
    }

    const accounts = accountManager.loadAccounts();
    const acc = (accountId ? accounts.find(a => a.id === accountId) : null) || accountManager.getCurrentAccount();

    if (!acc) throw new Error('Không tìm thấy tài khoản để kiểm tra.');

    // Nếu tài khoản không có cảnh báo chặn tính năng nào
    if (!acc.actionBlock && acc.status !== 'ACTION_BLOCKED') {
      return {
        isBlocked: false,
        message: `Tài khoản "${acc.name}" đang ở trạng thái bình thường (${acc.status}), không có cảnh báo tạm khóa tính năng.`
      };
    }

    // 1. Kiểm tra nếu unblockAt đã hết hạn theo thời gian
    const now = new Date();
    if (acc.actionBlock && acc.actionBlock.unblockAt && now >= new Date(acc.actionBlock.unblockAt)) {
      accountManager.clearActionBlock(acc.id);
      return {
        isBlocked: false,
        message: `Thời gian tạm khóa của Facebook đã kết thúc an toàn. Đã tự động gỡ bỏ cảnh báo và khôi phục tài khoản hoạt động bình thường!`
      };
    }

    // 2. Chuyển phiên tài khoản nếu nick được kiểm tra chưa phải là nick chính
    if (acc.id && !acc.isCurrent) {
      await accountManager.switchAccount(acc.id);
      await new Promise(r => setTimeout(r, 1500));
    }

    // 3. Chọn 1 nhóm thử nghiệm từ danh sách nhóm (ưu tiên nhóm chưa gia nhập)
    const mgr = getGroupMgr(groupType);
    const allGroups = mgr.getGroups() || [];
    let testGroup = allGroups.find(g => !g.joined && g.url);
    if (!testGroup && allGroups.length > 0) {
      testGroup = allGroups[0];
    }
    if (!testGroup || !testGroup.url) {
      testGroup = {
        id: 'test_probe_group',
        name: 'Nhóm Tuyển Dụng Thử Nghiệm',
        url: 'https://www.facebook.com/groups/timvieclamnhanhhn'
      };
    }

    logger.info(`[PROBE ACTION BLOCK] Đang kiểm tra trạng thái mở chặn của nick "${acc.name}" trên: ${testGroup.name || testGroup.url}`);

    let page = null;
    try {
      page = await browserController.newDedicatedPage();

      // Tối ưu tốc độ tải trang
      try {
        const client = await page.target().createCDPSession();
        await client.send('Network.enable');
        await client.send('Network.setBlockedURLs', {
          urls: ['*.mp4*', '*.webm*', '*.avi*', '*.m4v*']
        });
      } catch (cdpErr) {}

      await page.goto(testGroup.url, { waitUntil: 'networkidle2', timeout: 35000 });
      await new Promise(r => setTimeout(r, 2000));
      await page.keyboard.press('Escape').catch(() => {});

      // Kiểm tra trạng thái sơ bộ của nút tham gia
      const btnCheck = await this.inspectGroupState(page);

      // Nếu tài khoản đã là thành viên hoặc đã gửi yêu cầu được từ trước mà không bị khóa
      if (btnCheck.isMember || btnCheck.isPending) {
        accountManager.clearActionBlock(acc.id);
        return {
          isBlocked: false,
          message: 'Tài khoản hoạt động bình thường trên nhóm Facebook, không phát hiện dấu hiệu bị hạn chế. Đã tự động gỡ cảnh báo!'
        };
      }

      // Thử bấm nút "Tham gia nhóm" (loại trừ sidebar)
      const clicked = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"]'));
        for (const b of buttons) {
          const rect = b.getBoundingClientRect();
          const isVisible = b.offsetParent !== null && rect.height > 0 && rect.width > 0;
          if (!isVisible) continue;

          // Loại trừ sidebar gợi ý
          if (b.closest('div[role="complementary"], aside, div[aria-label*="gợi ý"], div[aria-label*="nhóm tương tự"]')) {
            continue;
          }

          const txt = (b.innerText || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').trim().toLowerCase();
          if (txt === 'tham gia nhóm' || txt === 'tham gia' || txt === 'join group' || aria.includes('tham gia nhóm')) {
            b.click();
            return true;
          }
        }
        return false;
      });

      if (!clicked) {
        return {
          isBlocked: true,
          message: 'Không tìm thấy nút "Tham gia nhóm" trên giao diện Facebook để thử nghiệm. Khuyến nghị bạn để nick nghỉ thêm hoặc gỡ cảnh báo thủ công.'
        };
      }

      // Đợi Facebook phản hồi
      await new Promise(r => setTimeout(r, 2500));

      const inspectResult = await page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        const dialogText = dialog ? (dialog.innerText || '').toLowerCase() : '';
        const isActionBlocked = dialogText.includes('chưa dùng được tính năng này') ||
                               dialogText.includes('bảo vệ cộng đồng khỏi spam') ||
                               dialogText.includes('giới hạn tần suất') ||
                               dialogText.includes('hành động bị chặn') ||
                               dialogText.includes('hành vi tự động') ||
                               dialogText.includes('automated behavior') ||
                               dialogText.includes('hoạt động bất thường') ||
                               dialogText.includes('tạm thời bị hạn chế') ||
                               dialogText.includes('we limit how often');
        
        const isSurvey = dialogText.includes('câu hỏi') || dialogText.includes('quy tắc') || dialogText.includes('rules') || dialogText.includes('questions');
        return { isActionBlocked, isSurvey, dialogSnippet: dialogText.slice(0, 150) };
      });

      if (inspectResult.isActionBlocked) {
        logger.warn(`[PROBE ACTION BLOCK] Facebook vẫn đang tạm khóa tính năng của "${acc.name}".`);
        // Gia hạn thêm 2 tiếng nữa
        const newUnblockAt = new Date(Date.now() + 2 * 3600 * 1000).toISOString();
        const accList = accountManager.loadAccounts();
        const found = accList.find(a => a.id === acc.id);
        if (found && found.actionBlock) {
          found.actionBlock.unblockAt = newUnblockAt;
          found.actionBlock.lastCheckedAt = new Date().toISOString();
          accountManager.saveAccounts(accList);
        }
        return {
          isBlocked: true,
          message: 'Facebook VẪN ĐANG TẠM KHÓA tính năng xin vào nhóm ("Giờ bạn chưa dùng được tính năng này để bảo vệ khỏi spam"). Hệ thống đã tự động gia hạn thời gian nghỉ ngơi an toàn thêm 2 tiếng.'
        };
      }

      // Nếu không bị chặn (Facebook cho phép tham gia hoặc mở popup khảo sát)
      await page.keyboard.press('Escape').catch(() => {});
      accountManager.clearActionBlock(acc.id);
      logger.success(`[PROBE ACTION BLOCK] Tài khoản "${acc.name}" đã hết bị chặn tính năng.`);
      return {
        isBlocked: false,
        message: 'Tuyệt vời! Đã kiểm tra thực tế trên Facebook: Tính năng xin vào nhóm ĐÃ ĐƯỢC MỞ KHÓA hoàn toàn. Đã tự động kích hoạt lại tài khoản bình thường!'
      };
    } finally {
      if (page && !page.isClosed()) {
        await page.close().catch(() => {});
      }
    }
  }
}

module.exports = new GroupJoiner();
