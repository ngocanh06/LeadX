/**
 * fanpagePoster.js - Tự động hóa đăng bài lên Facebook Fanpage mô phỏng người thật qua Chrome Stealth
 * Hỗ trợ chuyển sang Page profile hoặc đăng trực tiếp trên Fanpage feed
 */
const browserController = require('./browserController');
const accountManager = require('../services/accountManager');
const historyManager = require('../services/historyManager');
const config = require('../../config');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

class FanpagePoster {
  constructor() {
    this.isRunning = false;
    this.logs = [];
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    this.logs.push({ timestamp, message: msg, type });
    if (this.logs.length > 500) this.logs.shift();

    if (type === 'error') logger.error(`[FanpagePoster] ${msg}`);
    else if (type === 'success') logger.success(`[FanpagePoster] ${msg}`);
    else logger.info(`[FanpagePoster] ${msg}`);
  }

  /**
   * Đóng overlay hoặc popup thông báo nếu có
   */
  async dismissOverlays(page) {
    try {
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 500));

      await page.evaluate(() => {
        const dialogs = Array.from(document.querySelectorAll('div[role="dialog"]'));
        for (const dlg of dialogs) {
          const isPostDialog = dlg.querySelector('div[contenteditable="true"]') ||
            (dlg.innerText || '').includes('Tạo bài viết') ||
            (dlg.innerText || '').includes('Create post') ||
            (dlg.innerText || '').includes('Create a post');
          
          if (!isPostDialog) {
            const closeBtn = dlg.querySelector('div[aria-label="Đóng"], div[aria-label="Close"], svg');
            if (closeBtn) {
              const target = closeBtn.closest('div[role="button"]') || closeBtn;
              target.click();
            }
          }
        }
      });
    } catch (e) {}
  }

  /**
   * Đăng bài lên 1 Fanpage cụ thể qua Chrome Stealth Browser
   * @param {Object} pageInfo - { id, name, link, url, province }
   * @param {string} content - Nội dung bài viết
   * @param {Array<string>} mediaUrls - Danh sách ảnh đính kèm (URL hoặc file path)
   * @param {Object} [account] - Tài khoản thực thi
   */
  async postToPage(pageInfo, content, mediaUrls = [], account = null) {
    const pageName = pageInfo.name || pageInfo.pageName || `Fanpage ${pageInfo.id}`;
    const pageId = pageInfo.id || pageInfo.pageId || '';

    // Chuẩn bị URL của Fanpage
    let pageUrl = pageInfo.link || pageInfo.url || '';
    if (!pageUrl) {
      if (pageId && isNaN(pageId)) {
        pageUrl = `https://www.facebook.com/${pageId}/`;
      } else if (pageId) {
        pageUrl = `https://www.facebook.com/profile.php?id=${pageId}`;
      } else {
        throw new Error('Thiếu đường dẫn hoặc ID Fanpage.');
      }
    }

    // Chuẩn hóa đường dẫn ảnh cục bộ
    const resolvedImagePaths = [];
    if (Array.isArray(mediaUrls)) {
      for (const m of mediaUrls) {
        if (!m) continue;
        const str = String(m).trim();
        if (str.startsWith('http://') || str.startsWith('https://')) {
          // Bỏ qua link online trong chế độ file upload, trừ khi đã lưu về đĩa
          continue;
        }
        let localPath = str;
        if (str.startsWith('/uploads/')) {
          const cleanRel = str.replace(/^\/uploads\//, '');
          localPath = path.resolve(config.rootDir, 'data/images', cleanRel);
        }
        if (fs.existsSync(localPath)) {
          resolvedImagePaths.push(localPath);
        }
      }
    }

    this._log(`[BƯỚC 1] Bắt đầu kết nối trình duyệt Chrome Stealth tới Fanpage: "${pageName}" (${pageUrl})...`);

    const page = await browserController.ensureActivePage();

    try {
      // 1. Kiểm tra session đăng nhập
      const activeCookies = await page.cookies('https://www.facebook.com').catch(() => []);
      const cUserCookie = activeCookies.find(c => c.name === 'c_user');
      if (!cUserCookie) {
        throw new Error('Phiên đăng nhập Facebook đã hết hạn hoặc chưa đăng nhập. Vui lòng nạp Cookie trên Dashboard.');
      }

      // 2. Điều hướng tới Fanpage
      try {
        await page.goto(pageUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
      } catch (navErr) {
        if (navErr.message.includes('timeout') || navErr.message.includes('Timeout')) {
          this._log(`⚠️ Facebook tải ngầm hơi chậm, tiếp tục xử lý nội dung trang ngay...`, 'warn');
          await page.evaluate(() => window.stop()).catch(() => {});
        } else {
          throw navErr;
        }
      }
      await new Promise(r => setTimeout(r, 1200));

      // Đóng các popup chào mừng/nội quy
      await this.dismissOverlays(page);

      // 3. Kiểm tra nút "Chuyển sang [Tên trang]" (Switch now to Page profile)
      this._log(`[BƯỚC 2] Kiểm tra quyền quản trị và trạng thái chuyển danh tính Fanpage...`);
      const switched = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"], button, a[role="button"], span'));
        const switchBtn = buttons.find(b => {
          const t = (b.innerText || b.getAttribute('aria-label') || '').toLowerCase().trim();
          return t.includes('chuyển ngay') || t.includes('chuyển sang') || t.includes('switch now') || t.includes('switch to');
        });
        if (switchBtn) {
          const clickable = switchBtn.closest('div[role="button"]') || switchBtn.closest('button') || switchBtn;
          clickable.click();
          return true;
        }
        return false;
      });

      if (switched) {
        this._log(`  -> Đã bấm "Chuyển danh tính sang Trang", chờ Facebook đồng bộ...`, 'info');
        await new Promise(r => setTimeout(r, 3500));
        await this.dismissOverlays(page);
      }

      // 4. Tìm ô Tạo bài viết ("Bạn đang nghĩ gì?", "Viết gì đó...", "Tạo bài viết...")
      this._log(`[BƯỚC 3] Tìm ô tạo bài viết trên Fanpage "${pageName}"...`);
      let postBoxClicked = false;

      for (let attempt = 1; attempt <= 3; attempt++) {
        await this.dismissOverlays(page);

        postBoxClicked = await page.evaluate(() => {
          const spans = Array.from(document.querySelectorAll('div[role="main"] span, div[role="feed"] span, div[role="button"] span, span'));
          const target = spans.find(s => {
            const txt = (s.innerText || '').toLowerCase().trim();
            return (
              (txt.includes('bạn đang nghĩ gì') ||
               txt.includes('viết gì') ||
               txt.includes('tạo bài viết') ||
               txt.includes('tạo bài viết công khai') ||
               txt.includes('what\'s on your mind') ||
               txt.includes('create a post') ||
               txt.includes('create post')) &&
              !txt.includes('bình luận') &&
              !txt.includes('comment')
            );
          });

          if (target) {
            target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            const clickable = target.closest('div[role="button"]') || target;
            clickable.click();
            return true;
          }

          const ariaBtn = document.querySelector('div[aria-label*="Tạo bài viết"], div[aria-label*="Create a post"], div[aria-label*="Bạn đang nghĩ gì"], div[aria-label*="What\'s on your mind"]');
          if (ariaBtn) {
            ariaBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            ariaBtn.click();
            return true;
          }

          return false;
        });

        if (postBoxClicked) break;
        await page.keyboard.press('p').catch(() => {});
        await new Promise(r => setTimeout(r, 1500));

        const dialogOpen = await page.$('div[role="dialog"] div[contenteditable="true"]');
        if (dialogOpen) {
          postBoxClicked = true;
          break;
        }
      }

      if (!postBoxClicked) {
        throw new Error(`Không tìm thấy khung soạn thảo bài viết trên Fanpage "${pageName}". Đảm bảo tài khoản Facebook đã có quyền Biên tập viên / Quản trị viên của trang này.`);
      }

      // 5. Chờ hộp thoại tạo bài viết mở ra
      this._log(`[BƯỚC 3.1] Đang chờ hộp thoại Tạo bài viết (Dialog) mở ra...`);
      await page.waitForSelector('div[role="dialog"] div[contenteditable="true"], div[role="dialog"]', { timeout: 15000 });
      await new Promise(r => setTimeout(r, 1500));

      // 6. Đính kèm hình ảnh (nếu có)
      if (resolvedImagePaths.length > 0) {
        this._log(`[BƯỚC 4] Đang đính kèm ${resolvedImagePaths.length} hình ảnh Poster vào bài đăng Fanpage...`);
        let imageAttached = false;

        let fileInputHandles = await page.$$('input[type="file"]');
        if (fileInputHandles.length === 0) {
          // Bấm nút ảnh trong dialog
          await page.evaluate(() => {
            const dlg = document.querySelector('div[role="dialog"]');
            if (!dlg) return;
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
          await new Promise(r => setTimeout(r, 1500));
          fileInputHandles = await page.$$('input[type="file"]');
        }

        if (fileInputHandles.length > 0) {
          for (const handle of fileInputHandles) {
            try {
              await handle.uploadFile(...resolvedImagePaths);
              imageAttached = true;
            } catch (e) {}
          }

          if (imageAttached) {
            this._log(`  -> Đã tải ảnh lên, chờ Facebook xử lý hình ảnh...`, 'info');
            try {
              await page.waitForFunction(() => {
                const dlg = document.querySelector('div[role="dialog"]');
                if (!dlg) return false;
                return !!dlg.querySelector('img[src^="blob:"], img[src*="fbcdn"], div[aria-label*="Ảnh"], div[aria-label*="Photo"]');
              }, { timeout: 10000 });
            } catch (e) {
              await new Promise(r => setTimeout(r, 3000));
            }
          }
        }
      }

      // 7. Nhập nội dung bài viết
      this._log(`[BƯỚC 5] Đang nhập nội dung bài tuyển dụng vào Fanpage...`);
      const editorSelector = 'div[role="dialog"] div[contenteditable="true"][role="textbox"], div[role="dialog"] div[contenteditable="true"]';
      await page.waitForSelector(editorSelector, { timeout: 10000 });
      await page.focus(editorSelector);
      await new Promise(r => setTimeout(r, 400));

      const lines = content.split('\n');
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
          await new Promise(r => setTimeout(r, 30));
        }
      }
      await new Promise(r => setTimeout(r, 2000));

      // 8. Bấm nút Đăng
      this._log(`[BƯỚC 6] Bấm nút "Đăng" chính thức trên Fanpage...`);
      let posted = false;
      for (let attempt = 0; attempt < 5; attempt++) {
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
        await new Promise(r => setTimeout(r, 1200));
      }

      if (!posted) {
        // Fallback
        posted = await page.evaluate(() => {
          const btns = Array.from(document.querySelectorAll('div[role="dialog"] div[role="button"], div[role="dialog"] button'));
          const b = btns.find(x => (x.innerText || '').trim() === 'Đăng' || (x.innerText || '').trim() === 'Post');
          if (b) { b.click(); return true; }
          return false;
        });
      }

      if (!posted) {
        throw new Error('Không tìm thấy hoặc không bấm được nút "Đăng" trên Fanpage.');
      }

      // Đợi hoàn tất đăng
      await new Promise(r => setTimeout(r, 5000));

      // Kiểm tra lỗi nếu có
      const errorMsg = await page.evaluate(() => {
        const dlg = document.querySelector('div[role="dialog"]');
        if (dlg) {
          const t = (dlg.innerText || '').toLowerCase();
          if (t.includes('giới hạn tần suất') || t.includes('spam') || t.includes('thử lại sau')) {
            return 'Facebook giới hạn tần suất đăng bài (Spam Limit).';
          }
        }
        return '';
      });

      if (errorMsg) {
        throw new Error(errorMsg);
      }

      // Tìm URL bài viết vừa đăng
      let postUrl = pageUrl;
      try {
        const foundUrl = await page.evaluate(() => {
          const toastLinks = Array.from(document.querySelectorAll('div[role="alert"] a, div[aria-live] a, div[role="status"] a'));
          for (const a of toastLinks) {
            const h = a.href || '';
            if (h.includes('/posts/') || h.includes('/permalink/')) return h.split('?')[0];
          }
          return '';
        });
        if (foundUrl) postUrl = foundUrl;
      } catch (e) {}

      this._log(`🎉 [THÀNH CÔNG] Đã xuất bản bài viết lên Fanpage "${pageName}"! Link: ${postUrl}`, 'success');

      // Tăng bộ đếm bài đăng của tài khoản
      const currentAcc = account || accountManager.getCurrentAccount();
      if (currentAcc) {
        accountManager.incrementPostCount(currentAcc.id);
      }

      // Ghi nhận vào lịch sử
      historyManager.addHistory({
        type: 'FANPAGE_POST',
        pageId,
        pageName,
        groupName: `[Fanpage] ${pageName}`,
        postUrl,
        status: 'SUCCESS',
        title: pageInfo.jobTitle || 'Tin tuyển dụng Fanpage',
        province: pageInfo.province || '',
        publishedAt: new Date().toISOString()
      });

      return {
        success: true,
        status: 'PUBLISHED',
        pageId,
        pageName,
        postUrl,
        mode: 'PUPPETEER_BROWSER'
      };
    } catch (err) {
      this._log(`❌ [LỖI] Đăng bài lên Fanpage "${pageName}" thất bại: ${err.message}`, 'error');

      historyManager.addHistory({
        type: 'FANPAGE_POST',
        pageId,
        pageName,
        groupName: `[Fanpage] ${pageName}`,
        status: 'FAILED',
        error: err.message,
        title: pageInfo.jobTitle || 'Tin tuyển dụng Fanpage',
        publishedAt: new Date().toISOString()
      });

      return {
        success: false,
        status: 'FAILED',
        pageId,
        pageName,
        error: err.message
      };
    }
  }
}

module.exports = new FanpagePoster();
