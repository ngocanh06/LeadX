/**
 * browserController.js - Điều khiển trình duyệt Chrome Stealth với Persistent Profile
 */
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const os = require('os');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const { createSocksHttpProxyBridge } = require('../utils/socksHttpProxyBridge');

const COOKIE_FILE = path.resolve(config.rootDir, 'data/cookies.json');

puppeteer.use(StealthPlugin());

class BrowserController {
  constructor() {
    this.browser = null;
    this.page = null;
    this.isLoggedIn = false;
    this.profileDir = config.browser.userDataDir;
    this.proxyAuth = null;
    this.proxyBridge = null;
    this.proxyBridgeClosePromise = null;
    this.currentProfileDir = this.profileDir;
  }

  async _closeProxyBridge() {
    if (this.proxyBridgeClosePromise) return this.proxyBridgeClosePromise;
    const bridge = this.proxyBridge;
    this.proxyBridge = null;
    if (!bridge) return;
    this.proxyBridgeClosePromise = Promise.resolve(bridge.close()).finally(() => {
      this.proxyBridgeClosePromise = null;
    });
    await this.proxyBridgeClosePromise;
  }

  async _authenticateProxyPage(page) {
    if (page && this.proxyAuth) {
      await page.authenticate(this.proxyAuth);
    }
  }

  _getPuppeteerChromePath() {
    try {
      return puppeteer.executablePath();
    } catch (err) {
      logger.warn(`[BROWSER] Could not resolve Puppeteer Chrome path: ${err.message}`);
      return null;
    }
  }

  _isChromeExecutable(filePath) {
    if (!filePath || typeof filePath !== 'string') return false;
    try {
      return fs.statSync(filePath).isFile();
    } catch (_) {
      return false;
    }
  }

  _getSystemChromeCandidates() {
    if (process.platform !== 'win32') return [];

    const candidates = [];
    const programFilesRoots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.ProgramW6432
    ].filter(Boolean);

    for (const root of programFilesRoots) {
      candidates.push(path.join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }

    if (process.env.LOCALAPPDATA) {
      candidates.push(path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'));
    }

    return [...new Set(candidates)];
  }

  _getCachedChromeCandidates() {
    if (process.platform !== 'win32') return [];

    const cacheDir = process.env.PUPPETEER_CACHE_DIR || path.join(os.homedir(), '.cache', 'puppeteer');
    const chromeCacheDir = path.join(cacheDir, 'chrome');
    try {
      return fs.readdirSync(chromeCacheDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => {
          const match = entry.name.match(/(win32|win64)-([\d.]+)$/i);
          return {
            version: match ? match[2] : '',
            executablePath: path.join(chromeCacheDir, entry.name, match && match[1].toLowerCase() === 'win32' ? 'chrome-win32' : 'chrome-win64', 'chrome.exe')
          };
        })
        .sort((a, b) => {
          const left = a.version.split('.').map(Number);
          const right = b.version.split('.').map(Number);
          for (let index = 0; index < Math.max(left.length, right.length); index++) {
            const difference = (right[index] || 0) - (left[index] || 0);
            if (difference !== 0) return difference;
          }
          return 0;
        })
        .map(entry => entry.executablePath);
    } catch (_) {
      return [];
    }
  }

  resolveChromeExecutable() {
    const configuredCandidates = [
      config.browser.executablePath,
      process.env.PUPPETEER_EXECUTABLE_PATH
    ].filter((candidate, index, list) => candidate && list.indexOf(candidate) === index);

    for (const candidate of configuredCandidates) {
      logger.info(`[BROWSER] Checking configured Chrome: ${candidate}`);
      if (this._isChromeExecutable(candidate)) {
        logger.info(`[BROWSER] Chrome executable found: ${candidate}`);
        return candidate;
      }
      logger.warn(`[BROWSER] Configured Chrome executable does not exist: ${candidate}`);
    }

    logger.info('[BROWSER] Checking Puppeteer Chrome...');
    const puppeteerPath = this._getPuppeteerChromePath();
    if (this._isChromeExecutable(puppeteerPath)) {
      logger.info(`[BROWSER] Chrome executable found: ${puppeteerPath}`);
      return puppeteerPath;
    }
    if (puppeteerPath) {
      logger.warn(`[BROWSER] Puppeteer Chrome is missing: ${puppeteerPath}`);
    }

    logger.info('[BROWSER] Checking other cached Puppeteer Chrome versions...');
    for (const candidate of this._getCachedChromeCandidates()) {
      if (candidate !== puppeteerPath && this._isChromeExecutable(candidate)) {
        logger.info(`[BROWSER] Chrome executable found in Puppeteer cache: ${candidate}`);
        return candidate;
      }
    }

    logger.info('[BROWSER] Checking system Chrome...');
    const systemCandidates = this._getSystemChromeCandidates();
    for (const candidate of systemCandidates) {
      if (this._isChromeExecutable(candidate)) {
        logger.info(`[BROWSER] Chrome executable found: ${candidate}`);
        return candidate;
      }
    }

    const error = new Error(
      `Không tìm thấy Chrome executable. Puppeteer mong đợi: ${puppeteerPath || 'không xác định'}; ` +
      'cũng không tìm thấy Chrome hệ thống ở các vị trí phổ biến. Hãy cài Chrome hoặc cài đúng browser cho Puppeteer bằng `npx puppeteer browsers install chrome`. Ứng dụng không tự tải Chrome.'
    );
    logger.error(`[BROWSER] ${error.message}`);
    throw error;
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

    await this._closeProxyBridge().catch(() => {});
    this.proxyAuth = null;

    const executablePath = this.resolveChromeExecutable();

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

    try {
      // 2. Configure the account proxy and prevent WebRTC IP leaks.
      let proxyParsed = null;
      if (activeAccount && activeAccount.proxy) {
        proxyParsed = parseProxy(activeAccount.proxy);
        if (proxyParsed) {
          const hasProxyCredentials = Boolean(proxyParsed.username || proxyParsed.password);
          let browserProxyUrl = `${proxyParsed.protocol}://${proxyParsed.host}:${proxyParsed.port}`;

          if (proxyParsed.protocol.startsWith('socks') && hasProxyCredentials) {
            if (proxyParsed.protocol === 'socks4' && proxyParsed.password) {
              throw new Error('SOCKS4 does not support password authentication. Use SOCKS5 or an HTTP/HTTPS proxy.');
            }
            this.proxyBridge = await createSocksHttpProxyBridge(proxyParsed, () => {
              logger.warn(`[BROWSER] SOCKS proxy connection/authentication failed for ${proxyParsed.host}:${proxyParsed.port}. Check the proxy credentials and availability.`);
            });
            browserProxyUrl = this.proxyBridge.proxyUrl;
            this.proxyAuth = this.proxyBridge.auth;
            logger.info(`[BROWSER] Authenticated ${proxyParsed.protocol.toUpperCase()} proxy bridge started for ${proxyParsed.host}:${proxyParsed.port}.`);
          } else if (hasProxyCredentials) {
            this.proxyAuth = {
              username: proxyParsed.username,
              password: proxyParsed.password
            };
          }

          launchArgs.push(`--proxy-server=${browserProxyUrl}`);
          launchArgs.push('--enforce-webrtc-ip-permission-check');
          launchArgs.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
          launchArgs.push('--disable-features=WebRtcHideLocalIpsWithMdns');
          logger.info(`[PROXY ĐƯỢC KÍCH HOẠT] Nick "${activeAccount.name}" định tuyến qua: ${proxyParsed.host}:${proxyParsed.port}`);
        }
      } else {
        logger.info(`[IP TRỰC TIẾP] Nick "${activeAccount ? activeAccount.name : 'Mặc định'}" không dùng Proxy, kết nối trực tiếp.`);
      }

      logger.info(`Đang khởi động Chrome Stealth với Profile riêng: ${effectiveProfileDir}`);

      const launchOptions = {
        headless: headless ? 'new' : false,
        userDataDir: effectiveProfileDir,
        executablePath,
        defaultViewport: null,
        args: launchArgs
      };

      logger.info('[BROWSER] Launching Chrome...');
      try {
        this.browser = await puppeteer.launch(launchOptions);
      } catch (launchErr) {
        if (/Could not find Chrome|Could not find Chromium/i.test(launchErr.message || '')) {
          throw new Error(`Chrome đã được phát hiện tại ${executablePath} nhưng Puppeteer không thể sử dụng file này: ${launchErr.message}`);
        }

        logger.warn(`[BROWSER] Launch với profile riêng thất bại (${launchErr.message}); thử lại một lần với profile tạm.`);
        const fallbackOptions = { ...launchOptions };
        delete fallbackOptions.userDataDir;
        try {
          this.browser = await puppeteer.launch(fallbackOptions);
        } catch (fallbackErr) {
          throw new Error(
            `Đã tìm thấy Chrome tại ${executablePath} nhưng không khởi chạy được. ` +
            `Lỗi profile: ${launchErr.message}; lỗi thử lại: ${fallbackErr.message}`
          );
        }
      }
      logger.info('[BROWSER] Chrome launched successfully.');

      // Lắng nghe sự kiện Chrome bị đóng (bởi người dùng hoặc hệ thống) để dọn sạch tham chiếu RAM
      this.browser.on('disconnected', () => {
        logger.info('ℹ️ Trình duyệt Chrome đã đóng / ngắt kết nối CDP. Đã dọn dẹp tham chiếu.');
        this.browser = null;
        this.page = null;
        this.isLoggedIn = false;
        this.proxyAuth = null;
        this._closeProxyBridge().catch(error => {
          logger.warn(`[BROWSER] Could not stop local SOCKS proxy bridge: ${error.message}`);
        });
      });

      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[0] : await this.browser.newPage();

      // 3. Xác thực Proxy nếu có User/Password
      if (this.proxyAuth) {
        await this._authenticateProxyPage(this.page);
        this.browser.on('targetcreated', async target => {
          try {
            const p = await target.page();
            await this._authenticateProxyPage(p);
          } catch (authErr) {
            logger.warn(`[BROWSER] Could not configure proxy authentication for a new tab: ${authErr.message}`);
          }
        });
      }

      this._setupPage(this.page);
      await this.page.setViewport({ width: 1280, height: 800 });

      // Tự động nạp cookie đã lưu nếu có
      await this.loadSavedCookies();

      return this.browser;
    } catch (err) {
      const failedBrowser = this.browser;
      this.browser = null;
      this.page = null;
      this.proxyAuth = null;
      this.isLoggedIn = false;
      await this._closeProxyBridge().catch(closeErr => {
        logger.warn(`[BROWSER] Could not stop local SOCKS proxy bridge after startup failure: ${closeErr.message}`);
      });
      if (failedBrowser) {
        try {
          if (failedBrowser.isConnected()) await failedBrowser.close();
        } catch (closeErr) {
          logger.warn(`[BROWSER] Failed to close Chrome after initialization error: ${closeErr.message}`);
        }
      }
      logger.error(`[BROWSER] Chrome initialization failed at ${executablePath}: ${err.message}`);
      throw err;
    }
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
        await this._authenticateProxyPage(this.page);
        this._setupPage(this.page);
        await this.loadSavedCookies();
      } else {
        // Thử kiểm tra context của page
        await this.page.evaluate(() => 1 + 1);
        await this._authenticateProxyPage(this.page);
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
      await this._authenticateProxyPage(this.page);
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
    await this._authenticateProxyPage(page);
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
    this.proxyAuth = null;
    await this._closeProxyBridge().catch(error => {
      logger.warn(`[BROWSER] Could not stop local SOCKS proxy bridge: ${error.message}`);
    });
  }
}

module.exports = new BrowserController();
