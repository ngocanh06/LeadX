/**
 * groupPoster.js - Tự động hóa đăng bài vào Hội Nhóm Facebook mô phỏng người thật & Lưu vết thống kê
 */
const browserController = require('./browserController');
const groupManager = require('../../modules/recruitment/services/groupManager');
const historyManager = require('../services/historyManager');
const accountHealthService = require('../services/accountHealthService');
const accountManager = require('../services/accountManager');
const positionKpiManager = require('../../modules/recruitment/services/positionKpiManager');
const { spinPostForGroup } = require('../utils/textCleaner');
const config = require('../../config');
const logger = require('../utils/logger');

class GroupPoster {
  constructor() {
    this.isRunning = false;
    this.isPaused = false;
    this.currentCampaign = null;
    this.logs = [];
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const logItem = { timestamp, message: msg, type };
    this.logs.push(logItem);
    if (this.logs.length > 500) this.logs.shift();

    if (type === 'error') logger.error(msg);
    else if (type === 'success') logger.success(msg);
    else logger.info(msg);
  }

  getLogs() {
    return this.logs;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentCampaign: this.currentCampaign
    };
  }

  /**
   * Đóng các popup quy tắc nhóm, chào mừng hoặc modal quảng cáo nếu có
   */
  async dismissGroupOverlays(page) {
    try {
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 600));

      const dismissed = await page.evaluate(() => {
        let acted = false;
        // 1. Tìm các nút xác nhận nội quy / chào mừng như "Tiếp tục", "Tôi đồng ý", "Đã hiểu", "Bắt đầu"
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        for (const dlg of dialogs) {
          // Bỏ qua nếu đây là khung Tạo bài viết
          const isPostDialog = dlg.querySelector('div[contenteditable="true"]') ||
            (dlg.innerText || '').includes('Tạo bài viết') ||
            (dlg.innerText || '').includes('Create a post') ||
            (dlg.innerText || '').includes('Create post');
          
          if (!isPostDialog) {
            const buttons = Array.from(dlg.querySelectorAll('div[role="button"], button, span'));
            const confirmBtn = buttons.find(b => {
              const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
              return t === 'tiếp tục' || t === 'tôi đồng ý' || t === 'đã hiểu' || t === 'xác nhận' || t === 'bắt đầu' || t === 'continue' || t === 'i agree' || t === 'got it';
            });
            if (confirmBtn) {
              const clickTarget = confirmBtn.closest('div[role="button"]') || confirmBtn.closest('button') || confirmBtn;
              clickTarget.click();
              acted = true;
            } else {
              // Tìm nút đóng X
              const closeBtn = dlg.querySelector('div[aria-label="Đóng"], div[aria-label="Close"], svg');
              if (closeBtn) {
                const target = closeBtn.closest('div[role="button"]') || closeBtn;
                target.click();
                acted = true;
              }
            }
          }
        }
        return acted;
      });

      if (dismissed) {
        this._log(`ℹ️ Đã tự động đóng thông báo/nội quy nhóm xuất hiện lúc vào nhóm.`);
        await new Promise(r => setTimeout(r, 1200));
      }
    } catch (e) {}
  }

  /**
   * Đăng bài vào 1 Group cụ thể kèm ảnh nếu có và lưu vết lịch sử
   */
  async postToSingleGroup(group, postText, imagePaths = [], job = null, campaignId = '', retryCount = 0) {
    const page = await browserController.ensureActivePage();
    
    // Chặn video feeds ngầm và tracking để trình duyệt mượt mà, nhưng GIỮ NGUYÊN tín hiệu Facebook để không bị phát hiện bot
    try {
      const client = await page.target().createCDPSession();
      await client.send('Network.enable');
      await client.send('Network.setBlockedURLs', {
        urls: [
          '*.mp4*', '*.webm*', '*.avi*', '*.m4v*',
          '*google-analytics.com*', '*doubleclick.net*'
        ]
      });
    } catch (e) {}

    this._log(`[BƯỚC 1] Đang truy cập Nhóm: ${group.name} (${group.url})...`);

    try {
      // Vô hiệu hóa hộp thoại "Leave site? Changes you made may not be saved" và dừng kết nối cũ
      await page.evaluate(() => {
        window.onbeforeunload = null;
        window.stop();
      }).catch(() => {});

      // Điều hướng tới nhóm với cơ chế tự phục hồi nếu Facebook bị nghẽn ngầm
      try {
        await page.goto(group.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      } catch (navErr) {
        if (navErr.message.includes('timeout') || navErr.message.includes('Timeout')) {
          this._log(`⚠️ Facebook tải ngầm hơi chậm, tiếp tục xử lý nội dung trang ngay...`, 'warn');
          await page.evaluate(() => window.stop()).catch(() => {});
        } else {
          throw navErr;
        }
      }
      await new Promise(r => setTimeout(r, 800));

      // 1. Kiểm tra khẩn cấp: Facebook có kích hoạt Checkpoint hoặc Cảnh báo hành vi tự động không?
      const currentUrl = page.url();
      const integrityAlert = currentUrl.includes('/checkpoint') || await page.evaluate(() => {
        const body = (document.body.innerText || '').toLowerCase();
        const dialog = document.querySelector('div[role="dialog"]');
        const dialogText = dialog ? (dialog.innerText || '').toLowerCase() : '';
        const combined = body + ' ' + dialogText;

        if (combined.includes('xác nhận danh tính') ||
            combined.includes('video selfie') ||
            combined.includes('tài khoản của bạn đã bị khóa') ||
            combined.includes('your account has been disabled') ||
            combined.includes('your account has been locked') ||
            combined.includes('chúng tôi cần có thêm thông tin') ||
            combined.includes('chúng tôi đã phát hiện thấy hoạt động bất thường')) {
          return { isAlert: true, type: 'CHECKPOINT', message: 'Yêu cầu xác minh danh tính hoặc khóa tài khoản (Checkpoint 282 / 956)' };
        }

        if (combined.includes('hành vi tự động') ||
            combined.includes('automated behavior') ||
            combined.includes('hoạt động bất thường') ||
            combined.includes('unusual activity') ||
            combined.includes('chúng tôi giới hạn tần suất') ||
            combined.includes('we limit how often') ||
            combined.includes('chưa dùng được tính năng này') ||
            combined.includes('tạm thời bị hạn chế') ||
            combined.includes('bảo vệ cộng đồng') ||
            combined.includes('bạn tạm thời bị chặn') ||
            combined.includes('you are temporarily blocked')) {
          return { isAlert: true, type: 'AUTOMATED_BEHAVIOR', message: 'Cảnh báo nghi ngờ hành vi tự động hoặc giới hạn quyền đăng bài (Action Block)' };
        }

        return { isAlert: false };
      });

      if (integrityAlert === true || integrityAlert?.isAlert) {
        const activeAcc = accountManager.getCurrentAccount();
        const alertMsg = integrityAlert?.message || 'Phát hiện màn hình xác minh danh tính hoặc cảnh báo tự động hóa Facebook.';
        if (activeAcc) {
          if (integrityAlert?.type === 'AUTOMATED_BEHAVIOR') {
            accountManager.markActionBlocked(activeAcc.id, 'POST', alertMsg, 6);
          } else {
            accountManager.markCheckpoint(activeAcc.id, alertMsg);
          }
        }
        this._log(`🚨 [BÁO ĐỘNG BẢO VỆ TÀI KHOẢN] ${alertMsg}! Tự động DỪNG KHẨN CẤP toàn bộ chiến dịch đăng bài để bảo vệ nick.`, 'error');
        this.isRunning = false;
        throw new Error(`SECURITY_INTEGRITY_TRIGGERED: ${alertMsg}. Hệ thống đã tự động dừng khẩn cấp để bảo vệ tài khoản.`);
      }

      // 2. Kiểm tra nếu phiên Facebook bị đăng xuất / Cookie hết hạn
      const activeCookies = await page.cookies('https://www.facebook.com').catch(() => []);
      const cUserCookie = activeCookies.find(c => c.name === 'c_user');
      const xsCookie = activeCookies.find(c => c.name === 'xs');

      const isRealLoginPage = await page.evaluate(() => {
        const text = (document.body.innerText || '').toLowerCase();
        const hasLoginInputs = !!document.querySelector('input[name="email"], input[name="pass"], input[type="password"]');
        const isLoginUrl = window.location.pathname.includes('/login');
        const isLoginRedirect = text.includes('bạn phải đăng nhập để tiếp tục') || text.includes('log in to facebook');
        return isLoginUrl || (hasLoginInputs && isLoginRedirect);
      });

      if (!cUserCookie || !xsCookie || isRealLoginPage) {
        throw new Error('Cookie Facebook này đã hết hạn / bị đăng xuất. Vui lòng bấm nút "Nạp / Đổi Cookie FB" ở menu bên trái để dán Cookie mới nhất.');
      }

      // Tự động đóng các popup / bảng nội quy nhóm
      await this.dismissGroupOverlays(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await new Promise(r => setTimeout(r, 400));

      // Kiểm tra nếu nhóm đang ở tab "Mua và bán", thử chuyển sang tab "Thảo luận"
      try {
        await page.evaluate(() => {
          const tabs = Array.from(document.querySelectorAll('a[role="tab"], div[role="tab"]'));
          const discussionTab = tabs.find(t => {
            const txt = (t.innerText || '').toLowerCase().trim();
            return txt === 'thảo luận' || txt === 'discussion';
          });
          if (discussionTab && discussionTab.getAttribute('aria-selected') !== 'true') {
            discussionTab.click();
          }
        });
      } catch (e) {}

      // [BƯỚC 1.5] KIỂM TRA QUYỀN THÀNH VIÊN & TỰ ĐỘNG XIN VÀO NHÓM NẾU CHƯA THAM GIA
      const membershipCheck = await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').toLowerCase();
        
        // 1. Kiểm tra ô đăng bài (Nếu có ô này -> 100% đã là thành viên chính thức)
        const hasPostBox = Array.from(document.querySelectorAll('div[role="button"], span, div')).some(el => {
          const t = (el.innerText || '').trim().toLowerCase();
          const rect = el.getBoundingClientRect();
          return el.offsetParent !== null && rect.height > 0 && (
            t === 'bạn viết gì đi...' || t === 'bạn viết gì đi' || 
            t === 'tạo bài viết...' || t === 'tạo bài viết công khai...' || t === 'tạo bài viết' ||
            t === 'write something...' || t === 'bài viết ẩn danh'
          );
        });

        const buttons = Array.from(document.querySelectorAll('div[role="button"], button, div[role="main"] a, span'));

        // 2. Kiểm tra nút "Đã tham gia"
        const hasJoinedBtn = buttons.some(b => {
          const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
          return t === 'đã tham gia' || t === 'joined' || t.includes('đã tham gia') || t.includes('rời khỏi nhóm');
        });

        const isMember = hasPostBox || hasJoinedBtn;

        // 3. Kiểm tra trạng thái đang chờ duyệt
        const isPending = !isMember && (
          bodyText.includes('đang chờ phê duyệt') || bodyText.includes('yêu cầu đã gửi') ||
          bodyText.includes('pending approval') || bodyText.includes('membership pending') ||
          bodyText.includes('hủy yêu cầu tham gia')
        );

        // 4. Kiểm tra nút Tham gia nhóm (loại trừ sidebar)
        let hasJoinBtn = false;
        if (!isMember && !isPending) {
          hasJoinBtn = buttons.some(b => {
            const inSidebar = !!b.closest('div[role="complementary"], aside, div[aria-label*="gợi ý"], div[aria-label*="nhóm tương tự"]');
            if (inSidebar) return false;
            const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
            return (t === 'tham gia nhóm' || t === 'tham gia' || t === 'join group' || t === 'join') &&
              !t.includes('đã tham gia') && !t.includes('chờ phê duyệt') && !t.includes('hủy');
          });
        }

        // Kiểm tra nhóm riêng tư bị khóa
        const isPrivateLocked = !isMember && bodyText.includes('nhóm riêng tư') && (bodyText.includes('hãy tham gia nhóm này để xem') || bodyText.includes('join this group to view'));

        return {
          isMember,
          hasJoinBtn,
          isPending,
          isPrivateLocked
        };
      });

      if (membershipCheck.isMember) {
        const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
        groupManager.updateGroupMembership(group.id, true, currentAccId);
      }

      if (membershipCheck.isPending) {
        this._log(`⏳ [CHỜ DUYỆT THÀNH VIÊN] Tài khoản đang chờ Admin Nhóm "${group.name}" phê duyệt vào nhóm. Tạm thời ghi nhận và bỏ qua nhóm này để tiếp tục chiến dịch.`, 'warn');
        const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
        groupManager.updateGroupMembership(group.id, false, currentAccId);
        historyManager.addRecord({
          campaignId,
          jobId: job ? (job.id || job.title) : '',
          jobTitle: job ? job.title : 'Tin tuyển dụng',
          company: job ? (job.company || '') : '',
          province: job ? (job.province || group.province || '') : (group.province || ''),
          salary: job ? (job.salary || '') : '',
          groupId: group.id,
          groupName: group.name,
          groupUrl: group.url,
          postText,
          imagePaths,
          status: 'PENDING_APPROVAL',
          approvalStatusText: 'Đang chờ Quản trị viên duyệt thành viên vào nhóm'
        });
        return { success: true, status: 'PENDING_APPROVAL', groupName: group.name, message: 'Đang chờ Admin duyệt thành viên' };
      }

      if (membershipCheck.hasJoinBtn) {
        this._log(`🤝 [TỰ ĐỘNG XIN VÀO] Phát hiện tài khoản chưa tham gia Nhóm "${group.name}". Đang tự động bấm "Tham gia nhóm"...`, 'info');
        try {
          await page.evaluate(() => {
            const buttons = Array.from(document.querySelectorAll('div[role="button"], button, div[role="main"] a, span'));
            const joinBtn = buttons.find(b => {
              const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
              return (t === 'tham gia nhóm' || t === 'tham gia' || t === 'join group' || t === 'join') &&
                !t.includes('đã tham gia') && !t.includes('chờ phê duyệt');
            });
            if (joinBtn) {
              const clickable = joinBtn.closest('div[role="button"]') || joinBtn.closest('button') || joinBtn;
              clickable.click();
            }
          });
          await new Promise(r => setTimeout(r, 2000));

          // Xử lý popup câu hỏi khảo sát nhóm nếu có
          const surveyHandled = await page.evaluate((defaultAns) => {
            const dialog = document.querySelector('div[role="dialog"]');
            if (!dialog) return false;

            // Tick các checkbox quy định
            const checkboxes = dialog.querySelectorAll('input[type="checkbox"], div[role="checkbox"]');
            checkboxes.forEach(cb => {
              if (!cb.checked && cb.getAttribute('aria-checked') !== 'true') cb.click();
            });

            // Điền câu trả lời mẫu
            const textareas = dialog.querySelectorAll('textarea, input[type="text"]');
            textareas.forEach(ta => {
              if (!ta.value) {
                ta.value = defaultAns;
                ta.dispatchEvent(new Event('input', { bubbles: true }));
                ta.dispatchEvent(new Event('change', { bubbles: true }));
              }
            });

            // Bấm Gửi
            const buttons = Array.from(dialog.querySelectorAll('div[role="button"], button'));
            const submitBtn = buttons.find(b => {
              const t = (b.innerText || '').toLowerCase().trim();
              return t === 'gửi' || t === 'submit' || t === 'hoàn tất' || t === 'xong' || t.includes('gửi câu trả lời');
            });
            if (submitBtn) {
              submitBtn.click();
              return true;
            }
            return false;
          }, 'Tôi xin tham gia nhóm để đăng tin tuyển dụng và tìm kiếm việc làm, cam kết tuân thủ đúng nội quy nhóm.');

          if (surveyHandled) {
            this._log(`  -> Đã tự động điền câu hỏi khảo sát & bấm Gửi yêu cầu vào nhóm thành công!`, 'success');
            await new Promise(r => setTimeout(r, 2000));
          }

          // Kiểm tra xem nhóm đã cho phép đăng ngay (nhóm mở / tự duyệt) hay cần chờ Admin duyệt thành viên
          const canPostNow = await page.evaluate(() => {
            const bodyText = (document.body.innerText || '').toLowerCase();
            if (bodyText.includes('đang chờ phê duyệt') || bodyText.includes('pending approval') || bodyText.includes('yêu cầu đã gửi') || bodyText.includes('hủy yêu cầu tham gia')) {
              return false;
            }
            const allSpans = Array.from(document.querySelectorAll('span'));
            return allSpans.some(s => {
              const txt = (s.innerText || '').toLowerCase().trim();
              return txt.includes('viết gì') || txt.includes('tạo bài viết') || txt.includes('bạn viết gì') || txt.includes('write something');
            });
          });

          const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';

          if (!canPostNow) {
            this._log(`⏳ [CHỜ DUYỆT THÀNH VIÊN] Đã gửi yêu cầu tham gia Nhóm: ${group.name} thành công (Đang chờ Admin duyệt thành viên). Chưa phải thành viên chính thức, tạm thời chuyển sang nhóm tiếp theo.`, 'warn');
            // Đảm bảo tuyệt đối không đánh dấu đã tham gia khi còn chờ duyệt
            groupManager.updateGroupMembership(group.id, false, currentAccId);

            historyManager.addRecord({
              campaignId,
              jobId: job ? (job.id || job.title) : '',
              jobTitle: job ? job.title : 'Tin tuyển dụng',
              company: job ? (job.company || '') : '',
              province: job ? (job.province || group.province || '') : (group.province || ''),
              salary: job ? (job.salary || '') : '',
              groupId: group.id,
              groupName: group.name,
              groupUrl: group.url,
              postText,
              imagePaths,
              status: 'PENDING_APPROVAL',
              approvalStatusText: 'Đã tự động gửi yêu cầu tham gia nhóm (Đang chờ Admin duyệt thành viên)'
            });
            return { success: true, status: 'PENDING_APPROVAL', groupName: group.name, message: 'Đã gửi yêu cầu xin vào nhóm (chờ admin duyệt)' };
          } else {
            this._log(`🎉 [THAM GIA THÀNH CÔNG] Đã vào Nhóm: ${group.name}! Đã xác nhận quyền thành viên chính thức. Tiếp tục quy trình đăng bài ngay...`, 'success');
            // Chỉ cập nhật isJoined: true khi đã chắc chắn là thành viên có quyền đăng bài
            groupManager.updateGroupMembership(group.id, true, currentAccId);
          }
        } catch (joinErr) {
          this._log(`⚠️ Tự động xin vào nhóm gặp lỗi: ${joinErr.message}`, 'warn');
        }
      } else {
        // Tài khoản đã là thành viên chính thức của nhóm này
        const currentAccId = accountManager.getCurrentAccount()?.id || 'acc_primary';
        groupManager.updateGroupMembership(group.id, true, currentAccId);
      }

      this._log(`[BƯỚC 2] Tìm ô tạo bài viết chính thức ở đầu Nhóm ${group.name}...`);

      // Tìm và click vào ô "Bạn viết gì đi...", "Viết gì đó...", "Tạo bài viết công khai..."
      let clickSuccess = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        // Đóng lại overlay nếu còn
        await this.dismissGroupOverlays(page);

        clickSuccess = await page.evaluate(() => {
          const allSpans = Array.from(document.querySelectorAll('div[role="main"] span, div[role="feed"] span, div[role="button"] span, span'));
          const target = allSpans.find(s => {
            const txt = (s.innerText || '').toLowerCase().trim();
            return (
              (txt.includes('viết gì') || txt.includes('tạo bài viết') || txt.includes('bạn viết gì') || txt.includes('write something') || txt.includes('create a public post')) &&
              !txt.includes('bình luận') &&
              !txt.includes('phản hồi') &&
              !txt.includes('comment')
            );
          });

          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const clickable = target.closest('div[role="button"]') || target;
            clickable.click();
            return true;
          }

          // Tìm theo aria-label
          const ariaBtn = document.querySelector('div[aria-label*="Tạo bài viết"], div[aria-label*="Create a post"], div[aria-label*="Viết gì đó"], div[aria-label*="Write something"]');
          if (ariaBtn) {
            ariaBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            ariaBtn.click();
            return true;
          }

          return false;
        });

        if (clickSuccess) break;

        // Fallback phím tắt 'p'
        this._log(`[Thử lần ${attempt}] Thử dùng phím tắt kích hoạt khung bài viết...`, 'warn');
        await page.keyboard.press('p');
        await new Promise(r => setTimeout(r, 2000));

        // Kiểm tra xem dialog đã xuất hiện chưa
        const dialogVisible = await page.$('div[role="dialog"] div[contenteditable="true"]');
        if (dialogVisible) {
          clickSuccess = true;
          break;
        }
      }

      this._log(`[BƯỚC 2.1] Đang chờ hộp thoại Tạo bài viết (Dialog) mở ra...`);
      await page.waitForSelector('div[role="dialog"] div[contenteditable="true"], div[role="dialog"]', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 2000));

      // ĐÍNH KÈM HÌNH ẢNH (NẾU CÓ)
      if (imagePaths && imagePaths.length > 0) {
        this._log(`[BƯỚC 3] Đang đính kèm ${imagePaths.length} hình ảnh vào bài viết...`);
        let imageAttached = false;
        try {
          // 1. Tìm tất cả file inputs hiện có trên trang
          let fileInputHandles = await page.$$('input[type="file"]');
          
          // 2. Nếu chưa có hoặc muốn kích hoạt popup nạp ảnh
          if (fileInputHandles.length === 0) {
            this._log(`[BƯỚC 3.1] Đang kích hoạt nút nạp ảnh trong Dialog...`);
            await page.evaluate(() => {
              const dlg = document.querySelector('div[role="dialog"]');
              if (!dlg) return;

              // Tìm theo aria-label hoặc text
              const elements = Array.from(dlg.querySelectorAll('div[role="button"], span, div, svg'));
              const photoBtn = elements.find(el => {
                const aria = (el.getAttribute('aria-label') || '').toLowerCase();
                const txt = (el.innerText || '').toLowerCase().trim();
                return aria.includes('ảnh') || aria.includes('photo') || txt.includes('ảnh') || txt.includes('photo');
              });
              if (photoBtn) {
                const clickable = photoBtn.closest('div[role="button"]') || photoBtn;
                clickable.click();
              }
            });
            await new Promise(r => setTimeout(r, 2000));
            fileInputHandles = await page.$$('input[type="file"]');
          }

          if (fileInputHandles.length > 0) {
            this._log(`[BƯỚC 3.2] Tìm thấy ${fileInputHandles.length} ô nạp file, đang đưa ${imagePaths.length} ảnh vào...`);
            for (const inputHandle of fileInputHandles) {
              try {
                await inputHandle.uploadFile(...imagePaths);
                imageAttached = true;
              } catch (e) {}
            }

            if (imageAttached) {
              this._log(`[BƯỚC 3.3] Đã đưa ảnh vào, đang chờ Facebook xử lý ảnh đính kèm...`, 'success');
              // Chờ preview ảnh xuất hiện
              try {
                await page.waitForFunction(() => {
                  const dlg = document.querySelector('div[role="dialog"]');
                  if (!dlg) return false;
                  return !!dlg.querySelector('img[src^="blob:"], img[src*="fbcdn"], div[aria-label*="Ảnh"], div[aria-label*="Photo"], div[aria-label*="Xóa"], div[aria-label*="Remove"]');
                }, { timeout: 12000 });
                this._log(`[BƯỚC 3.4] Facebook đã nạp và hiển thị ảnh đính kèm thành công!`, 'success');
              } catch (e) {
                this._log(`[BƯỚC 3.4] Đang tiếp tục sau thời gian chờ nạp ảnh...`);
                await new Promise(r => setTimeout(r, 4000));
              }
              await new Promise(r => setTimeout(r, 1500));
            }
          } else {
            this._log(`[CẢNH BÁO] Không tìm thấy ô tải ảnh Facebook, sẽ đăng bài dưới dạng văn bản.`, 'warn');
          }
        } catch (imgErr) {
          this._log(`[CẢNH BÁO] Đính kèm ảnh gặp sự cố: ${imgErr.message}`, 'warn');
        }
        if (imageAttached) {
          this._log(`✅ [BƯỚC 3 HOÀN TẤT] Ảnh đã được đính kèm vào bài viết.`, 'success');
        }
      }

      this._log(`[BƯỚC 4] Nhập nội dung bài tuyển dụng vào hộp thoại bài đăng...`);

      // Tìm khung soạn thảo contenteditable bên trong Dialog bài viết
      const editorSelector = 'div[role="dialog"] div[contenteditable="true"][role="textbox"], div[role="dialog"] div[contenteditable="true"]';
      await page.waitForSelector(editorSelector, { timeout: 15000 });
      await page.focus(editorSelector);
      await new Promise(r => setTimeout(r, 600));

      // Nạp từng dòng để giữ nguyên 100% định dạng xuống dòng, khoảng cách đoạn và Emoji
      const lines = postText.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.length > 0) {
          await page.evaluate((txt) => {
            document.execCommand('insertText', false, txt);
          }, line);
        }
        if (i < lines.length - 1) {
          await page.keyboard.down('Shift');
          await page.keyboard.press('Enter');
          await page.keyboard.up('Shift');
          await new Promise(r => setTimeout(r, 40));
        }
      }

      await new Promise(r => setTimeout(r, 2500));

      this._log(`[BƯỚC 5] Bấm nút Đăng bài chính thức trong hộp thoại...`);

      // Chờ nút "Đăng" sẵn sàng (không bị disabled)
      let posted = false;
      for (let btnAttempt = 0; btnAttempt < 5; btnAttempt++) {
        posted = await page.evaluate(() => {
          const dialogButtons = Array.from(document.querySelectorAll('div[role="dialog"] div[aria-label="Đăng"], div[role="dialog"] div[aria-label="Post"], div[role="dialog"] div[role="button"], div[role="dialog"] button'));
          const submitBtn = dialogButtons.find(b => {
            const txt = (b.innerText || b.getAttribute('aria-label') || '').trim();
            return (txt === 'Đăng' || txt === 'Post') && b.getAttribute('aria-disabled') !== 'true';
          });

          if (submitBtn) {
            submitBtn.click();
            return true;
          }
          return false;
        });

        if (posted) break;
        await new Promise(r => setTimeout(r, 1500));
      }

      if (!posted) {
        // Fallback thử click bất kỳ nút nào có chữ Đăng kể cả khi đang bật
        posted = await page.evaluate(() => {
          const dialogButtons = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button'));
          const submitBtn = dialogButtons.find(b => {
            const txt = (b.innerText || b.getAttribute('aria-label') || '').trim();
            return txt === 'Đăng' || txt === 'Post';
          });
          if (submitBtn) {
            submitBtn.click();
            return true;
          }
          return false;
        });
      }

      if (!posted) {
        throw new Error('Không tìm thấy hoặc không bấm được nút "Đăng" trong hộp thoại bài viết.');
      }

      // Đợi phản hồi và kiểm tra trạng thái duyệt bài từ Facebook
      // Đợi phản hồi và kiểm tra trạng thái duyệt bài từ Facebook
      await new Promise(r => setTimeout(r, 4000));

      const fbFeedback = await page.evaluate(() => {
        const bodyText = (document.body.innerText || '').toLowerCase();
        const postDialog = document.querySelector('div[role="dialog"]');
        let dialogError = '';
        let isDialogStillOpen = false;

        if (postDialog) {
          const dialogText = (postDialog.innerText || '').toLowerCase();
          if (dialogText.includes('đăng') || dialogText.includes('post') || postDialog.querySelector('div[contenteditable="true"]')) {
            isDialogStillOpen = true;
          }
          if (dialogText.includes('giới hạn tần suất') || dialogText.includes('bảo vệ cộng đồng') || dialogText.includes('spam') || dialogText.includes('thử lại sau')) {
            dialogError = 'Facebook tạm khóa tính năng đăng bài do bị giới hạn tần suất (Spam Limit).';
          } else if (dialogText.includes('không thể đăng') || dialogText.includes('lỗi')) {
            dialogError = 'Facebook từ chối xuất bản bài viết trong hộp thoại.';
          }
        }
        
        // 1. Thu thập tất cả các text từ alert, status, banner, toast hoặc khu vực feed/bài viết
        const feedElements = Array.from(document.querySelectorAll('div[role="feed"] > div, div[role="main"], div[role="alert"], div[role="status"], div[aria-live]'));
        const combinedText = (bodyText + ' ' + feedElements.map(el => (el.innerText || '').toLowerCase()).join(' '));

        // 2. Danh sách các từ khóa chờ duyệt của Facebook
        const pendingKeywords = [
          'đang chờ',
          'chờ duyệt',
          'chờ phê duyệt',
          'chờ quản trị viên',
          'quản trị viên phê duyệt',
          'quản trị viên xét duyệt',
          'phê duyệt bài viết',
          'nội dung gửi đi đang chờ',
          'bài viết của bạn đang chờ',
          'đã gửi bài viết',
          'gửi để phê duyệt',
          'pending approval',
          'pending post',
          'pending posts',
          'submitted for review',
          'admin approval',
          'waiting for approval',
          'đang chờ ·'
        ];

        const isPending = pendingKeywords.some(kw => combinedText.includes(kw));

        // 3. Kiểm tra lỗi bị chặn
        const isBlocked = !!dialogError || combinedText.includes('không thể đăng') ||
          combinedText.includes('tính năng này tạm thời bị khóa') ||
          combinedText.includes('bị giới hạn') ||
          combinedText.includes('giới hạn tần suất') ||
          combinedText.includes('you cannot post') ||
          combinedText.includes('tài khoản của bạn tạm thời bị hạn chế');

        return {
          isPending,
          isBlocked,
          dialogError,
          isDialogStillOpen
        };
      });

      let status = 'PUBLISHED';
      let approvalStatusText = 'Đã lên bài trực tiếp (Nhóm mở)';

      if (fbFeedback.isBlocked || fbFeedback.dialogError) {
        await page.keyboard.press('Escape').catch(() => {});
        const reason = fbFeedback.dialogError || 'Facebook tạm thời giới hạn quyền đăng bài của tài khoản.';
        const blockErr = new Error(reason);
        blockErr.isFacebookBlock = true;
        throw blockErr;
      } else if (fbFeedback.isPending) {
        status = 'PENDING_APPROVAL';
        approvalStatusText = 'Đang chờ quản trị viên (Admin) phê duyệt bài';
        this._log(`⏳ [CHỜ DUYỆT] Bài viết đã gửi đến Nhóm: ${group.name} (Đang chờ Quản trị viên duyệt)`, 'warn');
      } else {
        status = 'PUBLISHED';
        approvalStatusText = 'Đã lên bài thành công trực tiếp';
        this._log(`🎉 [THÀNH CÔNG] Đã lên bài trực tiếp tại Nhóm: ${group.name}!`, 'success');
      }

      groupManager.markGroupPosted(group.id, { title: job ? job.title : group.name });
      try {
        const activeAcc = accountManager.getCurrentAccount();
        if (activeAcc) accountManager.incrementPostCount(activeAcc.id);
      } catch (e) {}

      // 4. Trích xuất link bài viết cụ thể trên Facebook (Direct Post URL)
      let postUrl = '';
      if (status === 'PUBLISHED') {
        try {
          // Thăm dò nhiều lần (tối đa 5 lần x 800ms) để chờ Facebook hoàn tất tải ảnh và bắn popup Toast / Story
          for (let attempt = 0; attempt < 5; attempt++) {
            await new Promise(r => setTimeout(r, 800));
            postUrl = await page.evaluate(() => {
              // Chiến lược 1: Tìm bất kỳ thẻ <a> nào có text hoặc aria-label là "Xem bài viết" / "View post"
              const allLinks = Array.from(document.querySelectorAll('a'));
              for (const a of allLinks) {
                const text = (a.innerText || a.textContent || a.getAttribute('aria-label') || '').toLowerCase().trim();
                const href = a.href || '';
                if ((text.includes('xem bài viết') || text.includes('view post') || text.includes('xem bài') || text === 'xem') && href && !href.includes('#')) {
                  return href.split('?')[0];
                }
              }

              // Chiến lược 2: Tìm link trong các container thông báo popup / toast / snackbar
              const toastLinks = Array.from(document.querySelectorAll('div[role="alert"] a, div[aria-live] a, div[role="status"] a, div[data-visualcompletion] a'));
              for (const a of toastLinks) {
                const href = a.href || '';
                if (href.includes('/posts/') || href.includes('/permalink/') || href.includes('/share/p/') || href.includes('story_fbid=')) {
                  return href.split('?')[0];
                }
              }

              // Chiến lược 3: Tìm bài viết mới nhất ở đầu Newsfeed / FeedUnit của Group
              const feed = document.querySelector('div[role="feed"]') || document.querySelector('div[role="main"]');
              if (feed) {
                const firstPost = feed.querySelector('div[data-pagelet*="FeedUnit"], div[role="article"], div[data-ad-preview="message"]') || feed.children[0];
                if (firstPost) {
                  const links = Array.from(firstPost.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"], a[href*="/share/p/"], a[href*="story_fbid="]'));
                  for (const l of links) {
                    const href = l.href || '';
                    if (href && !href.includes('/groups/user/') && !href.includes('/members/') && !href.includes('/user/')) {
                      const clean = href.split('?')[0];
                      if (clean.includes('/posts/') || clean.includes('/permalink/') || clean.includes('/share/p/') || clean.includes('story_fbid=')) {
                        return clean;
                      }
                    }
                  }
                }
              }

              return '';
            });

            if (postUrl) break;
          }

          // Chiến lược 4 (Fallback thông minh): Nếu Facebook không trả permalink qua toast,
          // tự động tạo link trực tiếp dẫn tới danh sách bài của tài khoản trong nhóm hoặc feed theo thứ tự thời gian mới nhất
          if (!postUrl) {
            const cleanGrp = (group.url || '').replace(/\/+$/, '');
            const currentAcc = accountManager.getCurrentAccount();
            const uid = currentAcc?.fbUserId;
            if (cleanGrp.includes('/groups/')) {
              postUrl = uid ? `${cleanGrp}/user/${uid}/` : `${cleanGrp}/?sorting_setting=CHRONOLOGICAL`;
            } else {
              postUrl = cleanGrp;
            }
          }

          if (postUrl) {
            this._log(`🔗 [LINK BÀI VIẾT] Đã thiết lập link xem bài viết: ${postUrl}`, 'success');
          }
        } catch (e) {
          const cleanGrp = (group.url || '').replace(/\/+$/, '');
          postUrl = cleanGrp.includes('/groups/') ? `${cleanGrp}/?sorting_setting=CHRONOLOGICAL` : cleanGrp;
        }
      } else if (status === 'PENDING_APPROVAL') {
        const cleanGrp = (group.url || '').replace(/\/+$/, '');
        postUrl = cleanGrp.includes('/groups/') ? `${cleanGrp}/pending_posts` : cleanGrp;
      }

      // Xóa hook beforeunload sau khi đăng xong để chuyển trang tiếp theo mượt mà
      await page.evaluate(() => {
        window.onbeforeunload = null;
      }).catch(() => {});

      // Lưu chi tiết vào lịch sử
      const record = historyManager.addRecord({
        campaignId,
        jobId: job ? (job.id || job.title) : '',
        jobTitle: job ? job.title : 'Tin tuyển dụng',
        company: job ? (job.company || '') : '',
        province: job ? (job.province || group.province || '') : (group.province || ''),
        salary: job ? (job.salary || '') : '',
        groupId: group.id,
        groupName: group.name,
        groupUrl: group.url,
        postUrl,
        postText,
        imagePaths,
        status,
        approvalStatusText
      });

      return { success: true, status, groupName: group.name, recordId: record.id };
    } catch (err) {
      if (retryCount < 2 && (
        err.message.includes('detached Frame') || 
        err.message.includes('Execution context was destroyed') || 
        err.message.includes('Protocol error') ||
        err.message.includes('Target closed') ||
        err.message.includes('Session closed')
      )) {
        this._log(`⚠️ Facebook tải lại cấu trúc trang (detached Frame). Đang tự động làm mới tab và thử lại ${group.name} (Lần ${retryCount + 1}/2)...`, 'warn');
        await new Promise(r => setTimeout(r, 2500));
        await browserController.ensureActivePage();
        return await this.postToSingleGroup(group, postText, imagePaths, job, campaignId, retryCount + 1);
      }

      let userFriendlyError = err.message;
      if (err.message.includes('timeout') || err.message.includes('Timeout')) {
        userFriendlyError = 'Mạng chậm hoặc Facebook phản hồi quá thời gian chờ (45s).';
      } else if (err.message.includes('Cookie Facebook đã hết hạn')) {
        userFriendlyError = 'Phiên đăng nhập Facebook hết hạn. Vui lòng nạp lại Cookie trên Dashboard.';
      } else if (err.message.includes('Không tìm thấy hoặc không bấm được nút "Đăng"')) {
        userFriendlyError = 'Không tìm thấy nút "Đăng" trong nhóm này.';
      } else if (err.message.includes('tính năng đăng bài bị hạn chế')) {
        userFriendlyError = 'Facebook tạm thời giới hạn quyền đăng bài của tài khoản.';
      } else if (err.message.includes('detached Frame')) {
        userFriendlyError = 'Facebook tải lại khung trang lúc đang gửi dữ liệu bài viết.';
      }

      const isBlocked = !!(err.isFacebookBlock ||
        err.message.includes('tính năng đăng bài bị hạn chế') ||
        err.message.includes('tạm thời giới hạn') ||
        err.message.includes('Spam Limit') ||
        err.message.includes('bị khóa') ||
        err.message.includes('bị hạn chế'));

      this._log(`[LỖI] Đăng bài thất bại tại Nhóm ${group.name}: ${userFriendlyError}`, 'error');

      // Lưu vết thất bại
      historyManager.addRecord({
        campaignId,
        jobId: job ? (job.id || job.title) : '',
        jobTitle: job ? job.title : 'Tin tuyển dụng',
        company: job ? (job.company || '') : '',
        province: job ? (job.province || group.province || '') : (group.province || ''),
        salary: job ? (job.salary || '') : '',
        groupId: group.id,
        groupName: group.name,
        groupUrl: group.url,
        postText,
        imagePaths,
        status: 'FAILED',
        approvalStatusText: 'Đăng thất bại',
        errorMessage: userFriendlyError
      });

      return { success: false, status: 'FAILED', groupName: group.name, error: userFriendlyError, isBlocked };
    }
  }

  /**
   * Đăng bài một nhóm độc lập được gọi từ FacebookActionEngine
   */
  async postToGroup(postJob, account = null) {
    const group = {
      id: postJob.groupId || postJob.id || 'grp',
      name: postJob.groupName || postJob.targetName || 'Hội Nhóm Facebook',
      url: postJob.groupUrl || postJob.targetUrl || '',
      province: postJob.province || ''
    };
    const postText = postJob.content || postJob.description || '';
    const imagePaths = postJob.images || [];
    const job = {
      id: postJob.id,
      title: postJob.title,
      company: postJob.company,
      salary: postJob.salary,
      province: postJob.province
    };
    return await this.postToSingleGroup(group, postText, imagePaths, job, postJob.campaignId || '');
  }


  /**
   * Bắt đầu chiến dịch tự động đăng danh sách Group với cơ chế giãn cách an toàn
   */
  async startCampaign(job, targetGroups, imagePaths = [], delayConfig = null) {
    if (this.isRunning) {
      throw new Error('Chiến dịch đăng bài đang chạy. Vui lòng dừng chiến dịch hiện tại trước.');
    }

    if (!targetGroups || targetGroups.length === 0) {
      throw new Error('Danh sách Group mục tiêu đang trống.');
    }

    // 0. PRE-FLIGHT INTEGRITY & HEALTH CHECK TRƯỚC KHI ĐĂNG
    const activeAcc = accountManager.getCurrentAccount();
    if (activeAcc) {
      if (activeAcc.status === 'CHECKPOINT') {
        const cpReason = activeAcc.checkpointReason || 'Tài khoản đang bị Facebook Checkpoint xác minh danh tính.';
        throw new Error(`[BẢO VỆ TÀI KHOẢN] Nick "${activeAcc.name}" đang bị Checkpoint Facebook (${cpReason}). Vui lòng gỡ Checkpoint trên Facebook trước khi đăng bài.`);
      }
      if (activeAcc.status === 'ACTION_BLOCKED' && activeAcc.actionBlock?.feature === 'POST') {
        const blkReason = activeAcc.actionBlock?.reason || 'Facebook đang tạm khóa tính năng đăng bài.';
        throw new Error(`[BẢO VỆ TÀI KHOẢN] Nick "${activeAcc.name}" đang bị Facebook giới hạn quyền đăng bài (${blkReason}). Vui lòng chờ hết hạn hoặc bấm "Gỡ Cảnh Báo" nếu FB đã mở lại.`);
      }
    }

    // Kiểm tra KPI trước khi chạy
    const posReport = historyManager.getPositionsReport();
    const existingPos = posReport.positions.find(p => p.positionName.toLowerCase() === (job.title || '').trim().toLowerCase());
    const baseLiveCount = existingPos ? existingPos.totalLive : 0;
    const initialKpiCheck = positionKpiManager.checkCanPost(job.title, baseLiveCount);
    if (!initialKpiCheck.canPost) {
      this._log(`🛑 [AUTO-STOP KPI] ${initialKpiCheck.message}`, 'warn');
      throw new Error(initialKpiCheck.message);
    }

    const minDelay = (delayConfig && parseInt(delayConfig.minDelay, 10)) || config.safety.minPostDelaySec;
    const maxDelay = (delayConfig && parseInt(delayConfig.maxDelay, 10)) || config.safety.maxPostDelaySec;

    const campaignId = `camp_${Date.now()}`;
    this.isRunning = true;
    this.isPaused = false;
    this.currentCampaign = {
      campaignId,
      jobTitle: job.title,
      totalGroups: targetGroups.length,
      currentIndex: 0,
      currentGroupName: '',
      currentStatusText: 'Đang chuẩn bị...',
      completed: 0,
      pendingApproval: 0,
      publishedDirect: 0,
      failed: 0,
      imageCount: imagePaths ? imagePaths.length : 0,
      startTime: new Date().toISOString()
    };

    this._log(`🚀 BẮT ĐẦU CHIẾN DỊCH: "${job.title}" lên ${targetGroups.length} Nhóm Facebook (Giãn cách: ${minDelay}s - ${maxDelay}s, ${imagePaths.length} ảnh)...`, 'success');

    // Chạy ngầm loop đăng bài
    (async () => {
      // PRE-FLIGHT LIVE CHECK TRÊN FACEBOOK
      try {
        const prePage = await browserController.ensureActivePage();
        const preCookies = await prePage.cookies('https://www.facebook.com').catch(() => []);
        const hasCUser = preCookies.some(c => c.name === 'c_user' && c.value && String(c.value).length > 4);
        if (!hasCUser) {
          this._log(`🚨 [CHƯA ĐĂNG NHẬP] Phiên duyệt Facebook chưa có Cookie đăng nhập hợp lệ. Tự động hủy chiến dịch để bảo vệ nick.`, 'error');
          this.isRunning = false;
          return;
        }

        await prePage.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 15000 });
        const currentUrl = prePage.url();
        const bodyText = await prePage.evaluate(() => (document.body.innerText || '').toLowerCase());
        
        if (currentUrl.includes('/login') || bodyText.includes('explore the things you love') || bodyText.includes('use another profile') || bodyText.includes('bạn phải đăng nhập')) {
          this._log(`🚨 [COOKIE HẾT HẠN] Phiên đăng nhập Facebook đã bị hết hạn hoặc đăng xuất. Vui lòng nạp lại Cookie mới!`, 'error');
          this.isRunning = false;
          return;
        }

        if (currentUrl.includes('/checkpoint') || bodyText.includes('xác nhận danh tính') || bodyText.includes('video selfie')) {
          if (activeAcc) accountManager.markCheckpoint(activeAcc.id, 'Phát hiện Checkpoint trước khi đăng bài.');
          this._log(`🚨 [CHECKPOINT BÁO ĐỘNG] Tài khoản đang bị Facebook Checkpoint xác minh danh tính! Tự động dừng khẩn cấp.`, 'error');
          this.isRunning = false;
          return;
        }
      } catch (preErr) {
        logger.warn(`Preflight posting check warning: ${preErr.message}`);
      }

      for (let i = 0; i < targetGroups.length; i++) {
        if (!this.isRunning) {
          this._log(`🛑 Chiến dịch đã bị dừng bởi người dùng.`, 'warn');
          break;
        }

        // Kiểm tra KPI động trước mỗi bài
        const currentLive = baseLiveCount + (this.currentCampaign ? this.currentCampaign.publishedDirect : 0);
        const liveKpiCheck = positionKpiManager.checkCanPost(job.title, currentLive);
        if (!liveKpiCheck.canPost) {
          this._log(`🎯 [TỰ ĐỘNG DỪNG THEO KPI] ${liveKpiCheck.message}`, 'success');
          if (this.currentCampaign) {
            this.currentCampaign.currentStatusText = `Hoàn thành (Đạt KPI tự động dừng)`;
          }
          break;
        }

        while (this.isPaused) {
          if (this.currentCampaign) this.currentCampaign.currentStatusText = '⏸️ Đang tạm dừng';
          this._log(`⏸️ Chiến dịch đang tạm dừng, chờ tiếp tục...`);
          await new Promise(r => setTimeout(r, 3000));
        }

        const group = targetGroups[i];
        if (this.currentCampaign) {
          this.currentCampaign.currentIndex = i + 1;
          this.currentCampaign.currentGroupName = group.name || 'Nhóm Facebook';
          this.currentCampaign.currentStatusText = `Đang đăng nhóm ${i + 1}/${targetGroups.length}: ${group.name}`;
        }
        this._log(`[${i + 1}/${targetGroups.length}] Tiến hành đăng bài lên: ${group.name}...`);

        const basePostText = job.formattedGroupPost || job.description;
        const uniquePostText = spinPostForGroup(basePostText, i, group.name);
        const result = await this.postToSingleGroup(group, uniquePostText, imagePaths, job, campaignId);

        if (result.success) {
          this.currentCampaign.completed++;
          if (result.status === 'PENDING_APPROVAL') {
            this.currentCampaign.pendingApproval++;
          } else {
            this.currentCampaign.publishedDirect++;
          }
        } else {
          this.currentCampaign.failed++;

          // CƠ CHẾ NGẮT MẠCH KHẨN CẤP (EMERGENCY CIRCUIT BREAKER)
          // Nếu phát hiện Facebook có dấu hiệu giới hạn tính năng / chặn spam, DỪNG NGAY để bảo vệ tài khoản
          if (result.isBlocked) {
            accountHealthService.recordRestrictionEvent(result.error, group.name, group.url);
            try {
              const activeAcc = accountManager.getCurrentAccount();
              if (activeAcc) accountManager.markAccountCooldown(activeAcc.id, 24, result.error);
            } catch (e) {}
            this._log(`🚨 [NGẮT MẠCH KHẨN CẤP - BẢO VỆ TÀI KHOẢN] Facebook đã tạm thời giới hạn quyền đăng bài của nick này! Tool tự động NGẮT CHIẾN DỊCH NGAY LẬP TỨC để bảo toàn tài khoản, tránh bị Facebook phạt nặng hoặc khóa tài khoản vĩnh viễn! Bạn có thể chuyển sang Nick phụ khác trong tab "Quản Lý Tài Khoản" để tiếp tục.`, 'error');
            if (this.currentCampaign) {
              this.currentCampaign.currentStatusText = '🚨 ĐÃ DỪNG KHẨN CẤP: Facebook tạm giới hạn quyền đăng bài của tài khoản.';
            }
            this.stopCampaign();
            break;
          }
        }

        // BẢO VỆ ĐỊNH KỲ (BATCH COOLDOWN): Cứ sau mỗi 5 nhóm, nghỉ xả hơi 3 phút (180s)
        // Mô phỏng hành vi tự nhiên như người dùng thật nghỉ giải lao, triệt tiêu tín hiệu bot của Meta
        if ((i + 1) % 5 === 0 && i < targetGroups.length - 1 && this.isRunning) {
          const restSec = 180;
          this._log(`☕ [NGHỈ ĐỊNH KỲ BẢO VỆ NICK] Đã đăng liên tiếp ${i + 1} nhóm. Tự động tạm nghỉ 3 phút (${restSec}s) để mô phỏng người thật xả hơi và xóa dấu vết thuật toán spam...`, 'warn');
          for (let s = restSec; s > 0; s--) {
            if (!this.isRunning) {
              this._log(`🛑 Đã ngắt thời gian nghỉ do chiến dịch bị dừng.`, 'warn');
              break;
            }
            if (this.currentCampaign) {
              this.currentCampaign.currentStatusText = `☕ Nghỉ định kỳ ${s}s (Bảo vệ tài khoản sau mỗi 5 nhóm)...`;
            }
            while (this.isPaused && this.isRunning) {
              if (this.currentCampaign) this.currentCampaign.currentStatusText = '⏸️ Đang tạm dừng';
              await new Promise(r => setTimeout(r, 1000));
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        // Nếu còn nhóm tiếp theo, thực hiện giãn cách ngẫu nhiên thông thường
        if (i < targetGroups.length - 1 && this.isRunning) {
          const delaySec = Math.max(5, Math.floor(Math.random() * (maxDelay - minDelay + 1) + minDelay));
          this._log(`⏱️ [GIÃN CÁCH] Nghỉ ngẫu nhiên ${delaySec} giây trước khi đăng nhóm tiếp theo...`);
          
          for (let s = delaySec; s > 0; s--) {
            if (!this.isRunning) {
              this._log(`🛑 Đã ngắt thời gian nghỉ do chiến dịch bị dừng.`, 'warn');
              break;
            }
            if (this.currentCampaign) {
              this.currentCampaign.currentStatusText = `⏱️ Nghỉ giãn cách ${s}s (Đã đăng ${i + 1}/${targetGroups.length} nhóm)...`;
            }
            while (this.isPaused && this.isRunning) {
              if (this.currentCampaign) this.currentCampaign.currentStatusText = '⏸️ Đang tạm dừng';
              await new Promise(r => setTimeout(r, 1000));
            }
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }

      this.isRunning = false;
      if (this.currentCampaign) {
        this.currentCampaign.currentStatusText = `🎉 Đã hoàn tất (${this.currentCampaign.completed}/${targetGroups.length} nhóm thành công)`;
      }
      this._log(`🎉 HOÀN TẤT CHIẾN DỊCH! Tổng: ${this.currentCampaign.completed}/${targetGroups.length} nhóm thành công (Trực tiếp: ${this.currentCampaign.publishedDirect}, Chờ duyệt: ${this.currentCampaign.pendingApproval}, Thất bại: ${this.currentCampaign.failed}).`, 'success');
    })();

    return { success: true, campaignId, message: 'Đã kích hoạt chiến dịch đăng nhóm thành công.' };
  }

  stopCampaign() {
    this.isRunning = false;
    this.isPaused = false;
    this._log(`🛑 Đã gửi lệnh dừng chiến dịch.`, 'warn');
    return { success: true, message: 'Đã dừng chiến dịch.' };
  }

  pauseCampaign() {
    this.isPaused = true;
    this._log(`⏸️ Đã tạm dừng chiến dịch.`, 'warn');
    return { success: true, message: 'Đã tạm dừng chiến dịch.' };
  }

  resumeCampaign() {
    this.isPaused = false;
    this._log(`▶️ Đã tiếp tục chiến dịch.`, 'success');
    return { success: true, message: 'Đã tiếp tục chiến dịch.' };
  }
}

module.exports = new GroupPoster();
