/**
 * engagementScanner.js - Tự động quét & đo lường Lượt tiếp cận, Tương tác & Bình luận xin việc trên Facebook
 * Phân tích Like, Comment và tự động phát hiện ứng viên hỏi việc ("ib", "quan tâm", "xin việc"...)
 */
const browserController = require('../../../core/automation/browserController');
const historyManager = require('../../../core/services/historyManager');
const logger = require('../../../core/utils/logger');

class EngagementScanner {
  constructor() {
    this.isScanning = false;
    this.shouldStop = false;
    this.progress = {
      status: 'IDLE', // IDLE | RUNNING | COMPLETED | STOPPED | ERROR
      current: 0,
      total: 0,
      totalLikes: 0,
      totalComments: 0,
      totalInquiries: 0,
      currentPostUrl: '',
      message: 'Sẵn sàng quét tương tác'
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
      isScanning: this.isScanning,
      progress: this.progress,
      logs: this.logs.slice(-35),
      results: this.results
    };
  }

  stop() {
    if (this.isScanning) {
      this.shouldStop = true;
      this.progress.status = 'STOPPED';
      this.progress.message = 'Đã dừng tiến trình quét tương tác.';
      this._log('🛑 Người dùng yêu cầu dừng quét tương tác.', 'warn');
      return true;
    }
    return false;
  }

  /**
   * Bắt đầu quét tương tác cho các bài viết đã có URL
   * @param {Object} options - { limit: 20, forceAll: false }
   */
  async startScan(options = {}) {
    if (this.isScanning) {
      throw new Error('Tiến trình quét tương tác đang chạy. Vui lòng đợi hoặc bấm dừng trước.');
    }

    const allHistory = historyManager.loadHistory();
    // Lấy các bài có postUrl và trạng thái PUBLISHED hoặc APPROVED
    const eligibleRecords = allHistory.filter(r => {
      const hasUrl = r.postUrl && r.postUrl.startsWith('http');
      const isLive = r.status === 'PUBLISHED' || r.status === 'APPROVED';
      if (options.forceAll) return hasUrl && isLive;
      // Mặc định quét các bài chưa quét hoặc quét cách đây hơn 2 giờ
      const scannedAgo = r.engagement && r.engagement.lastScannedAt
        ? Date.now() - new Date(r.engagement.lastScannedAt).getTime()
        : Infinity;
      return hasUrl && isLive && scannedAgo > 2 * 3600 * 1000;
    });

    const limit = Math.min(options.limit || 15, eligibleRecords.length);
    const targetRecords = eligibleRecords.slice(0, limit);

    if (targetRecords.length === 0) {
      return {
        success: true,
        message: 'Không có bài đăng nào cần quét tương tác lúc này (các bài đã được cập nhật gần đây).',
        scanned: 0
      };
    }

    this.isScanning = true;
    this.shouldStop = false;
    this.results = [];
    this.progress = {
      status: 'RUNNING',
      current: 0,
      total: targetRecords.length,
      totalLikes: 0,
      totalComments: 0,
      totalInquiries: 0,
      currentPostUrl: '',
      message: `Đang chuẩn bị quét ${targetRecords.length} bài viết...`
    };

    this._log(`🚀 Bắt đầu quét tương tác cho ${targetRecords.length} bài viết đã đăng...`, 'success');

    // Chạy ngầm tiến trình quét
    (async () => {
      let page = null;
      try {
        page = await browserController.ensureActivePage();

        for (let i = 0; i < targetRecords.length; i++) {
          if (this.shouldStop) {
            this._log('🛑 Quá trình quét tương tác đã dừng.', 'warn');
            break;
          }

          const record = targetRecords[i];
          this.progress.current = i + 1;
          this.progress.currentPostUrl = record.postUrl;
          this.progress.message = `Đang quét bài ${i + 1}/${targetRecords.length}: ${record.jobTitle} tại ${record.groupName}...`;
          this._log(`[${i + 1}/${targetRecords.length}] Đang mở bài: ${record.jobTitle} (${record.postUrl})...`);

          try {
            await page.goto(record.postUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
            await new Promise(r => setTimeout(r, 2500));

            // Bóc tách tương tác: Like, Comment, Share và nội dung bình luận
            const engagementData = await page.evaluate(() => {
              let likes = 0;
              let comments = 0;
              let shares = 0;
              const inquiryKeywords = [
                'ib', 'inbox', 'quan tâm', 'qtam', 'chấm', 'cho em hỏi',
                'cho mình hỏi', 'còn tuyển', 'ứng tuyển', 'xin việc', 'gửi cv',
                'lương bao nhiêu', 'ca nào', 'ở đâu', 'liên hệ', 'sđt'
              ];
              const commentTexts = [];

              // 1. Tìm số lượng reactions
              const reactionElements = Array.from(document.querySelectorAll('span[aria-label*="thích"], span[aria-label*="bày tỏ cảm xúc"], span[aria-label*="reaction"], div[aria-label*="reaction"]'));
              for (const el of reactionElements) {
                const text = el.innerText || el.getAttribute('aria-label') || '';
                const numMatch = text.match(/([\d.]+)\s*(k|m)?/i);
                if (numMatch) {
                  let val = parseFloat(numMatch[1]);
                  if (numMatch[2] && numMatch[2].toLowerCase() === 'k') val *= 1000;
                  if (numMatch[2] && numMatch[2].toLowerCase() === 'm') val *= 1000000;
                  likes = Math.max(likes, Math.round(val));
                }
              }

              // 2. Tìm số lượng bình luận
              const allSpans = Array.from(document.querySelectorAll('span, div[role="button"]'));
              for (const s of allSpans) {
                const text = (s.innerText || '').toLowerCase();
                const commentMatch = text.match(/([\d.]+)\s*(k)?\s*(bình luận|comments?)/i);
                if (commentMatch) {
                  let val = parseFloat(commentMatch[1]);
                  if (commentMatch[2] && commentMatch[2].toLowerCase() === 'k') val *= 1000;
                  comments = Math.max(comments, Math.round(val));
                }

                const shareMatch = text.match(/([\d.]+)\s*(k)?\s*(lượt chia sẻ|shares?)/i);
                if (shareMatch) {
                  let val = parseFloat(shareMatch[1]);
                  if (shareMatch[2] && shareMatch[2].toLowerCase() === 'k') val *= 1000;
                  shares = Math.max(shares, Math.round(val));
                }
              }

              // 3. Trích xuất các comment hiển thị trên trang để phát hiện ứng viên hỏi việc
              const commentEls = Array.from(document.querySelectorAll('div[dir="auto"], div[data-ad-preview="message"]'));
              let inquiryCount = 0;

              for (const c of commentEls) {
                const txt = (c.innerText || '').trim();
                if (txt.length > 0 && txt.length < 300) {
                  const lower = txt.toLowerCase();
                  const isInquiry = inquiryKeywords.some(kw => {
                    if (kw === 'chấm') return lower.includes('chấm') || lower.includes('.');
                    return lower.includes(kw);
                  });

                  if (isInquiry) {
                    inquiryCount++;
                    if (commentTexts.length < 5) commentTexts.push(txt);
                  }
                }
              }

              return {
                likes,
                comments: Math.max(comments, inquiryCount),
                shares,
                inquiryCount,
                sampleInquiries: commentTexts
              };
            });

            // Cập nhật vào history
            const finalEngagement = {
              likes: engagementData.likes || 0,
              comments: engagementData.comments || 0,
              shares: engagementData.shares || 0,
              inquiryCount: engagementData.inquiryCount || 0,
              sampleInquiries: engagementData.sampleInquiries || [],
              lastScannedAt: new Date().toISOString()
            };

            historyManager.updateEngagement(record.id, finalEngagement);

            this.progress.totalLikes += finalEngagement.likes;
            this.progress.totalComments += finalEngagement.comments;
            this.progress.totalInquiries += finalEngagement.inquiryCount;

            this.results.push({
              recordId: record.id,
              jobTitle: record.jobTitle,
              groupName: record.groupName,
              postUrl: record.postUrl,
              ...finalEngagement
            });

            this._log(`✅ [BÀI ${i + 1}] ${record.jobTitle}: ${finalEngagement.likes} Likes, ${finalEngagement.comments} Bình luận (${finalEngagement.inquiryCount} ứng viên hỏi việc).`, 'success');
          } catch (itemErr) {
            this._log(`⚠️ Không thể quét tương tác bài ${record.postUrl}: ${itemErr.message}`, 'warn');
          }

          // Dãn cách nhẹ giữa các lần xem bài
          await new Promise(r => setTimeout(r, 2500));
        }

        this.progress.status = 'COMPLETED';
        this.progress.message = `Hoàn tất quét tương tác! Tổng: ${this.progress.totalLikes} Likes, ${this.progress.totalComments} Bình luận, ${this.progress.totalInquiries} ứng viên hỏi việc.`;
        this._log(`🎉 ${this.progress.message}`, 'success');
      } catch (err) {
        this.progress.status = 'ERROR';
        this.progress.message = `Lỗi quét tương tác: ${err.message}`;
        this._log(`❌ Lỗi quét tương tác: ${err.message}`, 'error');
      } finally {
        this.isScanning = false;
      }
    })();

    return {
      success: true,
      message: `Đã khởi chạy quét tương tác cho ${targetRecords.length} bài viết.`,
      targetCount: targetRecords.length
    };
  }
}

module.exports = new EngagementScanner();
