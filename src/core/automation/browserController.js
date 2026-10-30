/**
 * browserController.js - Điều khiển trình duyệt Chrome Stealth với Persistent Profile
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');

const COOKIE_FILE = path.resolve(config.rootDir, 'data/cookies.json');

puppeteer.use(StealthPlugin());

class BrowserController {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.profileDir = config.browser.userDataDir;
    this.proxyAuth = null;
    this.currentProfileDir = this.profileDir;
  }

  /**
   * Khởi động trình duyệt Chrome với Profile riêng biệt & Proxy theo tài khoản
   */
  async launch(headless = false, targetAccount = null) {
    if (this.browser) {
      if (this.browser.isConnected()) {
        return this.browser;
      }
      logger.warn('Kết nối Chrome cũ đã mất hiệu lực hoặc bị đóng. Đang dọn dẹp để khởi tạo phiên mới...');
      try {
        await this.browser.close().catch(() => {});
      } catch (e) {}
      this.browser = null;
      this.page = null;
    }


    // 1. Xác định tài khoản đang chạy để gán Profile & Proxy độc lập
    let activeAccount = targetAccount;
    if (!activeAccount) {
      try {
        const accountManager = require('../services/accountManager');
        activeAccount = accountManager.getCurrentAccount();
      } catch (e) {}
    }

    const { parseProxy } = require('../utils/proxyUtils');
    let effectiveProfileDir = this.profileDir;
    if (activeAccount && activeAccount.id) {
      effectiveProfileDir = path.resolve(config.rootDir, 'chrome_profiles', activeAccount.id);
    }
    this.currentProfileDir = effectiveProfileDir;

    if (!fs.existsSync(effectiveProfileDir)) {
      fs.mkdirSync(effectiveProfileDir, { recursive: true });
    } else {
      // Dọn dẹp stale lockfile nếu có
      try {
        const lockPath = path.join(effectiveProfileDir, 'lockfile');
        const singletonLock = path.join(effectiveProfileDir, 'SingletonLock');
        if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath);
        if (fs.existsSync(singletonLock)) fs.unlinkSync(singletonLock);
      } catch (e) {}
    }

    const launchArgs = [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-infobars',
      '--window-size=1280,800',
      '--disable-notifications',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=BeforeUnloadEvents',
      '--disable-prompt-on-repost'
    ];

    // 2. Cấu hình Proxy & Chống rò rỉ WebRTC IP
    let proxyParsed = null;
    if (activeAccount && activeAccount.proxy) {
      proxyParsed = parseProxy(activeAccount.proxy);
      if (proxyParsed) {
        launchArgs.push(`--proxy-server=${proxyParsed.protocol}://${proxyParsed.host}:${proxyParsed.port}`);
        // Chặn tuyệt đối rò rỉ IP mạng thật qua WebRTC STUN/TURN
        launchArgs.push('--enforce-webrtc-ip-permission-check');
        launchArgs.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
        launchArgs.push('--disable-features=WebRtcHideLocalIpsWithMdns');
        logger.info(`🌐 [PROXY ĐƯỢC KÍCH HOẠT] Nick "${activeAccount.name}" định tuyến qua: ${proxyParsed.host}:${proxyParsed.port}`);
      }
    } else {
      logger.info(`ℹ️ [IP TRỰC TIẾP] Nick "${activeAccount ? activeAccount.name : 'Mặc định'}" không dùng Proxy, kết nối trực tiếp.`);
    }

    logger.info(`Đang khởi động Chrome Stealth với Profile riêng: ${effectiveProfileDir}`);

    try {
      this.browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        userDataDir: effectiveProfileDir,
        executablePath: config.browser.executablePath,
        defaultViewport: null,
        args: launchArgs
      });
    } catch (launchErr) {
      logger.warn(`Không thể mở Profile thư mục (${launchErr.message}). Khởi động phiên Chrome sạch kèm Cookie...`);
      this.browser = await puppeteer.launch({
        headless: headless ? 'new' : false,
        executablePath: config.browser.executablePath,
        defaultViewport: null,
        args: launchArgs
      });
    }

    // Lắng nghe sự kiện Chrome bị đóng (bởi người dùng hoặc hệ thống) để dọn sạch tham chiếu RAM
    this.browser.on('disconnected', () => {
      logger.info('ℹ️ Trình duyệt Chrome đã đóng / ngắt kết nối CDP. Đã dọn dẹp tham chiếu.');
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
    });

    const pages = await this.browser.pages();
    this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

    // 3. Xác thực Proxy nếu có User/Password
    if (proxyParsed && proxyParsed.username && proxyParsed.password) {
      this.proxyAuth = { username: proxyParsed.username, password: proxyParsed.password };
      await this.page.authenticate(this.proxyAuth).catch(() => {});
      this.browser.on('targetcreated', async target => {
        try {
          const p = await target.page();
          if (p && this.proxyAuth) await p.authenticate(this.proxyAuth);
        } catch (_) {}
      });
    } else {
      this.proxyAuth = null;
    }

    this._setupPage(this.page);
    await this.page.setViewport({ width: 1280, height: 800 });

    // Tự động nạp cookie đã lưu nếu có
    await this.loadSavedCookies();

    return this.browser;
  }

  /**
   * Thiết lập tự động xử lý popup Leave Site và cảnh báo trình duyệt
   */
  _setupPage(page) {
    if (!page) return;
    try {
      page.removeAllListeners('dialog');
      page.on('dialog', async dialog => {
        try {
          logger.info(`Tự động bỏ qua hộp thoại trình duyệt (Leave site): ${dialog.message() || 'beforeunload'}`);
          await dialog.accept();
        } catch (e) {}
      });

      // Tăng cường Stealth: Xóa bỏ dấu hiệu tự động hóa và giả lập môi trường thật
      page.evaluateOnNewDocument(() => {
        // 1. Xóa cờ navigator.webdriver
        try {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        } catch (e) {}

        // 2. Giả lập đối tượng chrome đầy đủ
        window.chrome = window.chrome || {
          app: { isInstalled: false },
          runtime: { connect: () => {}, sendMessage: () => {} }
        };

        // 3. Giả lập plugins và languages phong phú của Chrome thật
        try {
          Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'] });
        } catch (e) {}
      }).catch(() => {});
    } catch (e) {}
  }

  /**
   * Đảm bảo tab trình duyệt luôn hoạt động và không bị lỗi detached frame
   */
  async ensureActivePage() {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch(false);
      return this.page;
    }

    try {
      if (!this.page || this.page.isClosed()) {
        const pages = await this.browser.pages();
        this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();
        if (this.proxyAuth) await this.page.authenticate(this.proxyAuth).catch(() => {});
        this._setupPage(this.page);
        await this.loadSavedCookies();
      } else {
        // Thử kiểm tra context của page
        await this.page.evaluate(() => 1 + 1);
        if (this.proxyAuth) await this.page.authenticate(this.proxyAuth).catch(() => {});
        this._setupPage(this.page);
      }
    } catch (e) {
      logger.warn(`Tab cũ bị mất kết nối hoặc detached Frame (${e.message}), khởi tạo tab mới...`);
      try {
        if (this.page && !this.page.isClosed()) {
          await this.page.close().catch(() => {});
        }
      } catch (err) {}
      const pages = await this.browser.pages().catch(() => []);
      this.page = pages.length > 0 && !pages[0].isClosed() ? pages[0] : await this.browser.newPage();
      if (this.proxyAuth) await this.page.authenticate(this.proxyAuth).catch(() => {});
      this._setupPage(this.page);
      await this.page.setViewport({ width: 1280, height: 800 });
      await this.loadSavedCookies();
    }
    return this.page;
  }

  /**
   * Khởi tạo một Tab riêng biệt cho tác vụ độc lập (như Cào nhóm / Quét tương tác)
   * Giúp không bị tranh chấp hoặc gián đoạn luồng tự động chính (như Đăng bài / Xin vào nhóm)
   */
  async newDedicatedPage(targetAccount = null) {
    if (!this.browser || !this.browser.isConnected()) {
      await this.launch(false, targetAccount);
    }
    let page = null;
    try {
      page = await this.browser.newPage();
    } catch (err) {
      logger.warn(`Không thể mở tab trên Chrome hiện tại (${err.message}). Đang tái khởi động Chrome mới...`);
      this.browser = null;
      this.page = null;
      await this.launch(false, targetAccount);
      page = await this.browser.newPage();
    }
    if (this.proxyAuth) await page.authenticate(this.proxyAuth).catch(() => {});
    this._setupPage(page);
    await page.setViewport({ width: 1280, height: 800 });

    // Đảm bảo tab mới luôn có đầy đủ Cookie từ bộ nhớ
    try {
      const cookieFile = COOKIE_FILE;
      if (fs.existsSync(cookieFile)) {
        const raw = fs.readFileSync(cookieFile, 'utf8');
        const jsonList = JSON.parse(raw);
        if (Array.isArray(jsonList) && jsonList.length > 0) {
          const cleanCookies = jsonList.map(c => {
            let sameSite = 'Lax';
            if (c.sameSite === 'no_restriction' || c.sameSite === 'None' || c.sameSite === 'none') {
              sameSite = 'None';
            } else if (c.sameSite === 'strict' || c.sameSite === 'Strict') {
              sameSite = 'Strict';
            }
            return {
              name: c.name,
              value: String(c.value),
              domain: c.domain && c.domain.includes('facebook.com') ? c.domain : '.facebook.com',
              path: c.path || '/',
              httpOnly: Boolean(c.httpOnly || c.name === 'xs' || c.name === 'c_user' || c.name === 'datr' || c.name === 'sb'),
              secure: Boolean(c.secure !== undefined ? c.secure : true),
              sameSite
            };
          });
          await page.setCookie(...cleanCookies);
        }
      }
    } catch (e) {}

    return page;
  }

  /**
   * Tự động nạp cookies từ file data/cookies.json
   */
  async loadSavedCookies() {
    try {
      const cookieFile = COOKIE_FILE;
      if (fs.existsSync(cookieFile) && this.page) {
        const raw = fs.readFileSync(cookieFile, 'utf8');
        const jsonList = JSON.parse(raw);
        if (Array.isArray(jsonList) && jsonList.length > 0) {
          const cleanCookies = jsonList.map(c => {
            let sameSite = 'Lax';
            if (c.sameSite === 'no_restriction' || c.sameSite === 'None' || c.sameSite === 'none') {
              sameSite = 'None';
            } else if (c.sameSite === 'strict' || c.sameSite === 'Strict') {
              sameSite = 'Strict';
            }
            return {
              name: c.name,
              value: String(c.value),
              domain: c.domain && c.domain.includes('facebook.com') ? c.domain : '.facebook.com',
              path: c.path || '/',
              httpOnly: Boolean(c.httpOnly || c.name === 'xs' || c.name === 'c_user' || c.name === 'datr' || c.name === 'sb'),
              secure: Boolean(c.secure !== undefined ? c.secure : true),
              sameSite
            };
          });

          try {
            const client = await this.page.target().createCDPSession();
            await client.send('Network.clearBrowserCookies');
          } catch (cdpErr) {}

          await this.page.setCookie(...cleanCookies);
          this.isLoggedIn = true;
          logger.info(`Đã tự động nạp ${cleanCookies.length} cookie Facebook từ bộ nhớ lưu trữ.`);
          return true;
        }
      }
    } catch (e) {
      logger.warn(`Lỗi nạp cookie từ bộ nhớ: ${e.message}`);
    }
    return false;
  }

  /**
   * Nạp Cookie Facebook trực tiếp vào phiên duyệt (Hỗ trợ cả JSON Array và Header String)
   */
  async importCookies(cookieInput) {
    if (!cookieInput) {
      throw new Error('Dữ liệu Cookie không được để trống.');
    }

    if (!this.browser || !this.browser.isConnected()) {
      await this.launch(false);
    } else {
      await this.ensureActivePage();
    }

    const cookies = [];
    const rawStr = String(cookieInput).trim();

    // 1. Nếu là định dạng JSON Array (Xuất trực tiếp từ Cookie-Editor)
    if (rawStr.startsWith('[') && rawStr.endsWith(']')) {
      try {
        const jsonList = JSON.parse(rawStr);
        if (Array.isArray(jsonList)) {
          for (const c of jsonList) {
            if (c.name && c.value) {
              let sameSite = 'Lax';
              if (c.sameSite === 'no_restriction' || c.sameSite === 'None' || c.sameSite === 'none') {
                sameSite = 'None';
              } else if (c.sameSite === 'strict' || c.sameSite === 'Strict') {
                sameSite = 'Strict';
              }
              cookies.push({
                name: c.name,
                value: String(c.value),
                domain: c.domain && c.domain.includes('facebook.com') ? c.domain : '.facebook.com',
                path: c.path || '/',
                httpOnly: Boolean(c.httpOnly || c.name === 'xs' || c.name === 'c_user' || c.name === 'datr' || c.name === 'sb'),
                secure: Boolean(c.secure !== undefined ? c.secure : true),
                sameSite
              });
            }
          }
        }
      } catch (e) {}
    }

    // 2. Nếu là chuỗi Header String dạng name=value; name2=value2
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
              secure: true,
              sameSite: 'Lax'
            });
          }
        }
      }
    }

    if (cookies.length === 0) {
      throw new Error('Không tìm thấy cookie Facebook hợp lệ trong nội dung vừa dán.');
    }

    // Lưu vào data/cookies.json để dùng lại vĩnh viễn
    try {
      const cookieFile = COOKIE_FILE;
      fs.writeFileSync(cookieFile, JSON.stringify(cookies, null, 2), 'utf8');
      logger.success(`Đã lưu ${cookies.length} cookie vào file cookies.json.`);
    } catch (e) {}

    if (this.page && !this.page.isClosed()) {
      try {
        const client = await this.page.target().createCDPSession();
        await client.send('Network.clearBrowserCookies').catch(() => {});
      } catch (cdpErr) {}

      try {
        await this.page.setCookie(...cookies);
        this.isLoggedIn = true;
        await this.page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' }).catch(() => {});
        await new Promise(r => setTimeout(r, 2000));
        return await this.checkLoginStatus();
      } catch (pageErr) {
        logger.warn(`Không thể nạp cookie vào trang mở (${pageErr.message}).`);
      }
    }
    return { success: true, message: 'Đã lưu cookie thành công vào file cấu hình.' };
  }

  /**
   * Kiểm tra trạng thái đăng nhập Facebook trong Profile & Cookie đã lưu
   */
  async checkLoginStatus() {
    try {
      const cookieFile = COOKIE_FILE;
      let savedFbUserId = null;
      let hasCookies = false;
      if (fs.existsSync(cookieFile)) {
        try {
          const raw = fs.readFileSync(cookieFile, 'utf8');
          const jsonList = JSON.parse(raw);
          if (Array.isArray(jsonList) && jsonList.length > 0) {
            hasCookies = true;
            const cUser = jsonList.find(c => c.name === 'c_user');
            if (cUser && cUser.value) {
              savedFbUserId = cUser.value;
            }
          }
        } catch (e) {}
      }

      if (this.browser && this.page) {
        const cookies = await this.page.cookies('https://www.facebook.com').catch(() => []);
        const cUserCookie = cookies.find(c => c.name === 'c_user');
        const xsCookie = cookies.find(c => c.name === 'xs');
        if (cUserCookie && cUserCookie.value && xsCookie && xsCookie.value) {
          this.isLoggedIn = true;
          return { isLoggedIn: true, fbUserId: cUserCookie.value, message: `Đã nạp Cookie FB (UID: ${cUserCookie.value})` };
        }
      }

      if (savedFbUserId) {
        return { isLoggedIn: true, fbUserId: savedFbUserId, message: `Đã lưu Cookie FB (UID: ${savedFbUserId})` };
      }

      this.isLoggedIn = false;
      return { isLoggedIn: false, message: 'Chưa đăng nhập FB (Vui lòng dán Cookie mới)' };
    } catch (err) {
      return { isLoggedIn: false, message: err.message };
    }
  }

  /**
   * Mở cửa sổ Chrome để người dùng đăng nhập thủ công
   */
  async openLoginWindow() {
    try {
      await this.close();
      await new Promise(r => setTimeout(r, 1000));
      await this.launch(false);
      await this.page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded' });
      return { success: true, message: 'Đã mở cửa sổ Chrome để bạn đăng nhập Facebook.' };
    } catch (err) {
      logger.warn(`Mở Puppeteer lỗi (${err.message}), mở Chrome trực tiếp qua Windows CMD...`);
      const { exec } = require('child_process');
      const profilePath = this.profileDir;
      const cmd = `start chrome --user-data-dir="${profilePath}" "https://www.facebook.com"`;
      exec(cmd);
      return { success: true, message: 'Đã mở trình duyệt Google Chrome trên màn hình của bạn.' };
    }
  }

  /**
   * Đóng trình duyệt
   */
  async close() {
    if (this.browser) {
      try {
        await this.browser.close();
      } catch (e) {}
      this.browser = null;
      this.page = null;
      this.isLoggedIn = false;
      logger.info('Đã đóng trình duyệt Chrome.');
    }
  }
}

module.exports = new BrowserController();
