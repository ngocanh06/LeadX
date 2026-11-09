/**
 * groupCommentScraper.js - Tự động quét & cào bình luận (comments & replies) từ Facebook Group / Bài viết nhóm
 * Đã tối ưu chống lặp, chống rò rỉ tab, lọc chuẩn xác bài viết gốc và chuyển đổi bộ lọc bình luận.
 */
const browserController = require('../core/automation/browserController');
const logger = require('../core/utils/logger');
const fs = require('fs');
const path = require('path');
const config = require('../config');

// Helper sleep ngẫu nhiên
function sleep(minMs, maxMs) {
  const delay = maxMs ? Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs : minMs;
  return new Promise(resolve => setTimeout(resolve, delay));
}

class GroupCommentScraper {
  constructor() {
    this.isScraping = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.progress = {
      status: 'IDLE', // IDLE | RUNNING | PAUSED | COMPLETED | STOPPED | ERROR
      targetUrl: '',
      postsScanned: 0,
      commentsFound: 0,
      message: 'Sẵn sàng cào bình luận Facebook'
    };
    this.results = [];
    this.logs = [];
    this.outputFilePath = path.resolve(config.rootDir, 'data/scraped_group_comments.json');
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    this.logs.push({ timestamp, message: msg, type });
    if (this.logs.length > 400) this.logs.shift();

    if (type === 'error') logger.error(`[CommentScraper] ${msg}`);
    else if (type === 'success') logger.success(`[CommentScraper] ${msg}`);
    else if (type === 'warn') logger.warn(`[CommentScraper] ${msg}`);
    else logger.info(`[CommentScraper] ${msg}`);
  }

  getStatus() {
    const totalP = this.progress.totalPosts || 10;
    const scannedP = this.progress.postsScanned || 0;
    const pct = totalP > 0 ? Math.min(100, Math.round((scannedP / totalP) * 100)) : (this.isScraping ? 50 : (this.results.length > 0 ? 100 : 0));

    return {
      isScraping: this.isScraping,
      isPaused: this.isPaused,
      progress: pct,
      scrapedPosts: scannedP,
      totalPosts: totalP,
      scrapedComments: this.progress.commentsFound || this.results.length,
      leadsExtracted: this.results.length,
      recentLeads: this.results.map((r, idx) => ({
        id: r.commentId || `lead_${idx}`,
        name: r.authorName,
        profileUrl: r.profileUrl,
        commentText: r.commentText,
        intent: 'JOB_SEEKER',
        status: 'NEW'
      })),
      resultsCount: this.results.length,
      results: this.results.slice(-30),
      logs: this.logs.slice(-35)
    };
  }

  stop() {
    if (this.isScraping) {
      this.shouldStop = true;
      this.isPaused = false;
      this.progress.status = 'STOPPED';
      this.progress.message = 'Đang dừng tiến trình cào bình luận...';
      this._log('⛔ Đã nhận lệnh dừng cào bình luận từ người dùng!', 'warn');
    }
  }

  pause() {
    if (this.isScraping && !this.isPaused) {
      this.isPaused = true;
      this.progress.status = 'PAUSED';
      this.progress.message = 'Tiến trình cào bình luận đang tạm dừng';
      this._log('⏸️ Đã tạm dừng cào bình luận.', 'info');
    }
  }

  resume() {
    if (this.isScraping && this.isPaused) {
      this.isPaused = false;
      this.progress.status = 'RUNNING';
      this.progress.message = 'Tiếp tục cào bình luận...';
      this._log('▶️ Tiếp tục tiến trình cào bình luận.', 'info');
    }
  }

  async _waitIfPaused() {
    while (this.isPaused && !this.shouldStop) {
      await sleep(1000);
    }
  }

  // Bấm các nút "Xem thêm bình luận / phản hồi", chỉ chọn nút ngắn (< 60 ký tự)
  async _expandComments(page) {
    return page.evaluate(() => {
      const re = /(xem thêm bình luận|xem các bình luận trước|xem \d+ phản hồi|xem câu trả lời|view more comments|view previous comments|view \d+ repl|view previous replies)/i;
      let clicked = 0;
      document.querySelectorAll('div[role="button"]').forEach(btn => {
        const t = (btn.innerText || '').trim();
        if (t.length > 0 && t.length < 60 && re.test(t)) {
          try { btn.click(); clicked++; } catch (e) {}
        }
      });
      return clicked;
    }).catch(() => 0);
  }

  // Đổi sắp xếp sang “Tất cả bình luận”
  async _switchToAllComments(page) {
    const clickByText = (source) => page.evaluate((src) => {
      const rx = new RegExp(src, 'i');
      const el = Array.from(
        document.querySelectorAll('div[role="button"], div[role="menuitemradio"], span')
      ).find(e => {
        const t = (e.innerText || '').trim();
        return t.length < 40 && rx.test(t);
      });
      if (el) { el.click(); return true; }
      return false;
    }, source).catch(() => false);

    if (await clickByText('^(phù hợp nhất|most relevant)$')) {
      await sleep(1000, 1500);
      await clickByText('^(tất cả bình luận|all comments)$');
      await sleep(1500, 2500);
    }
  }

  // Trích xuất các bình luận đang hiển thị trên trang (chỉ lấy khối có aria-label hợp lệ, tránh bài viết gốc)
  async _extractComments(page) {
    return page.evaluate(() => {
      const out = [];
      document.querySelectorAll('div[role="article"][aria-label]').forEach(el => {
        const label = el.getAttribute('aria-label') || '';
        if (!/(bình luận|phản hồi|comment|reply)/i.test(label)) return;

        const text = (el.querySelector('div[dir="auto"]')?.innerText || '').trim();
        if (!text) return;

        const author = el.querySelector('a[href*="/user/"], a[href*="profile.php"]');
        const timeLink = el.querySelector('a[href*="comment_id="]');
        let commentId = null;
        try { 
          if (timeLink && timeLink.href) {
            commentId = new URL(timeLink.href).searchParams.get('comment_id'); 
          }
        } catch (e) {}

        out.push({
          commentId,
          authorName: (author?.innerText || '').trim() || 'Ẩn danh',
          profileUrl: author?.href || '',
          commentText: text,
          isReply: /(phản hồi|reply)/i.test(label),
          timeLabel: (timeLink?.innerText || '').trim()
        });
      });
      return out;
    }).catch(() => []);
  }

  // Cuộn + mở rộng + trích xuất nhiều vòng, trả về mảng bình luận đã khử trùng
  async _collectPostComments(page, maxComments) {
    await this._switchToAllComments(page);

    const collected = new Map();
    let stale = 0; // số vòng liên tiếp không có bình luận mới

    for (let i = 1; i <= 15 && !this.shouldStop && stale < 3 && collected.size < maxComments; i++) {
      await this._waitIfPaused();
      await this._expandComments(page);
      await page.evaluate(() => window.scrollBy(0, 800));
      await sleep(1800, 3000);

      const before = collected.size;
      const extracted = await this._extractComments(page);
      for (const c of extracted) {
        const key = c.commentId || `${c.authorName}|${c.commentText}`;
        if (!collected.has(key)) collected.set(key, c);
      }
      stale = collected.size === before ? stale + 1 : 0;
      this._log(`🔄 Vòng ${i}: đã có ${collected.size} bình luận`);
    }

    return Array.from(collected.values()).slice(0, maxComments);
  }

  /**
   * Bắt đầu cào bình luận từ URL bài viết hoặc danh sách bài viết trong nhóm
   */
  async startScraping({ targetUrl, maxPosts = 10, maxCommentsPerPost = 50 } = {}) {
    if (this.isScraping) {
      throw new Error('Tiến trình cào bình luận đang chạy! Vui lòng đợi hoàn tất hoặc dừng lại.');
    }

    if (!targetUrl || !targetUrl.trim()) {
      throw new Error('Vui lòng cung cấp Link Facebook Group hoặc Link bài viết cụ thể!');
    }

    this.isScraping = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.results = [];
    this.logs = [];
    this.progress = {
      status: 'RUNNING',
      targetUrl: targetUrl.trim(),
      postsScanned: 0,
      commentsFound: 0,
      message: 'Khởi động trình duyệt để cào bình luận...'
    };

    this._log(`🚀 BẮT ĐẦU CÀO BÌNH LUẬN | Target: ${targetUrl} | Tối đa ${maxPosts} bài, ${maxCommentsPerPost} bình luận/bài.`);

    let page = null;
    try {
      await browserController.launch(false);
      page = await browserController.newDedicatedPage();
      await page.setViewport({ width: 1280, height: 900 });

      const isPostUrl = targetUrl.includes('/posts/') || targetUrl.includes('/permalink/') || targetUrl.includes('/photo/') || targetUrl.includes('story_fbid');

      if (isPostUrl) {
        await this._scrapeSinglePostComments(page, targetUrl, maxCommentsPerPost);
      } else {
        await this._scrapeGroupFeedComments(page, targetUrl, maxPosts, maxCommentsPerPost);
      }

      this.progress.status = this.shouldStop ? 'STOPPED' : 'COMPLETED';
      this.progress.message = `Hoàn tất! Quét được ${this.progress.postsScanned} bài viết, thu thập ${this.results.length} bình luận.`;
      this._log(`🎉 ${this.progress.message}`, 'success');

    } catch (err) {
      this.progress.status = 'ERROR';
      this.progress.message = `Lỗi cào bình luận: ${err.message}`;
      this._log(`❌ Lỗi nghiêm trọng: ${err.message}`, 'error');
    } finally {
      this.isScraping = false;
      this.isPaused = false;
      this._saveResultsToFile(); // Lưu cả khi ERROR hoặc STOPPED
      if (page) {
        try { await page.close(); } catch (e) {}
      }
    }

    return this.results;
  }

  /**
   * Cào bình luận của một bài viết cụ thể
   */
  async _scrapeSinglePostComments(page, postUrl, maxComments) {
    this._log(`🔗 Đang mở bài viết: ${postUrl}`);
    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });
    await sleep(2500, 4000);
    this.progress.postsScanned = 1;

    const comments = await this._collectPostComments(page, maxComments);
    for (const c of comments) {
      this.results.push({ postUrl, ...c, scrapedAt: new Date().toISOString() });
    }
    this.progress.commentsFound = this.results.length;
    this._log(`✅ Thu thập ${comments.length} bình luận từ bài viết.`, 'success');
  }

  /**
   * Cào bình luận từ feed của nhóm (quét qua danh sách bài viết rồi vào từng bài cào comment)
   */
  async _scrapeGroupFeedComments(page, groupUrl, maxPosts, maxCommentsPerPost) {
    const cleanUrl = groupUrl.trim().split('?')[0].replace(/\/?$/, '/');
    this._log(`📍 Đang mở Group Feed: ${cleanUrl}`);
    await page.goto(cleanUrl, { waitUntil: 'domcontentloaded', timeout: 50000 });
    await sleep(2500, 4000);

    const visited = new Set(); // gồm cả bài đã thử nhưng lỗi
    let scrollCount = 0;
    const maxScrolls = Math.max(8, maxPosts * 3);

    while (visited.size < maxPosts && scrollCount < maxScrolls && !this.shouldStop) {
      await this._waitIfPaused();
      scrollCount++;
      this._log(`📜 Cuộn feed tìm bài viết (${scrollCount}/${maxScrolls})...`);

      const postUrls = await page.evaluate(() => {
        const urls = new Set();
        document.querySelectorAll('a[href*="/posts/"], a[href*="/permalink/"]').forEach(l => {
          const href = l.href || '';
          if (href.includes('/groups/')) urls.add(href.split('?')[0]);
        });
        return Array.from(urls);
      }).catch(() => []);

      const fresh = postUrls.filter(u => !visited.has(u));

      for (const url of fresh) {
        if (visited.size >= maxPosts || this.shouldStop) break;
        visited.add(url);
        this._log(`🎯 Bài [${visited.size}/${maxPosts}]: ${url}`);

        let tab = null;
        try {
          tab = await page.browser().newPage();
          await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });
          await sleep(2500, 4000);

          const comments = await this._collectPostComments(tab, maxCommentsPerPost);
          for (const c of comments) {
            this.results.push({ groupUrl: cleanUrl, postUrl: url, ...c, scrapedAt: new Date().toISOString() });
          }
          this.progress.postsScanned++;
          this.progress.commentsFound = this.results.length;
          this._saveResultsToFile(true); // lưu tăng dần, ẩn log rác
        } catch (err) {
          this._log(`⚠️ Không cào được ${url}: ${err.message}`, 'warn');
        } finally {
          if (tab) await tab.close().catch(() => {});
        }
        await sleep(3000, 6000); // nghỉ giữa các bài
      }

      await page.evaluate(() => window.scrollBy(0, 1000));
      await sleep(2000, 3500);
    }
  }

  _saveResultsToFile(silent = false) {
    if (!this.results.length) return;
    try {
      const dir = path.dirname(this.outputFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.outputFilePath, JSON.stringify(this.results, null, 2), 'utf8');
      if (!silent) {
        this._log(`💾 Đã lưu ${this.results.length} bình luận vào file: ${this.outputFilePath}`, 'success');
      }
    } catch (e) {
      this._log(`Lỗi lưu file kết quả: ${e.message}`, 'error');
    }
  }
}

module.exports = new GroupCommentScraper();
