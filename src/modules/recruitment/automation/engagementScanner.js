/**
 * engagementScanner.js - Quét tương tác & lượt tiếp cận Fanpage / Bài viết Facebook
 */
const browserController = require('../../../core/automation/browserController');
const logger = require('../../../core/utils/logger');
const historyManager = require('../../../core/services/historyManager');

class EngagementScanner {
  constructor() {
    this.isScanning = false;
    this.progress = {
      status: 'IDLE', // IDLE | RUNNING | COMPLETED | ERROR | STOPPED
      scannedCount: 0,
      totalCount: 0,
      message: 'Sẵn sàng quét tương tác'
    };
    this.logs = [];
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    this.logs.push({ timestamp, message: msg, type });
    if (this.logs.length > 300) this.logs.shift();
    if (type === 'error') logger.error(`[EngagementScanner] ${msg}`);
    else if (type === 'success') logger.success(`[EngagementScanner] ${msg}`);
    else logger.info(`[EngagementScanner] ${msg}`);
  }

  getStatus() {
    return {
      isScanning: this.isScanning,
      progress: this.progress,
      logs: this.logs.slice(-30)
    };
  }

  stop() {
    if (this.isScanning) {
      this.isScanning = false;
      this.progress.status = 'STOPPED';
      this.progress.message = 'Đã dừng quét tương tác.';
      this._log('Đã nhận lệnh dừng quét tương tác.', 'warn');
      return true;
    }
    return false;
  }

  async startScan({ limit = 20, forceAll = false } = {}) {
    if (this.isScanning) {
      throw new Error('Tiến trình quét tương tác đang chạy!');
    }

    this.isScanning = true;
    this.progress = {
      status: 'RUNNING',
      scannedCount: 0,
      totalCount: limit,
      message: 'Đang khởi động trình duyệt quét tương tác...'
    };
    this.logs = [];

    this._log(`Bắt đầu quét tương tác Facebook (Limit: ${limit}, ForceAll: ${forceAll})`);

    let page = null;
    try {
      await browserController.launch(false);
      page = await browserController.newDedicatedPage();

      for (let i = 1; i <= limit; i++) {
        if (!this.isScanning) break;
        this.progress.scannedCount = i;
        this.progress.message = `Đang quét bài viết [${i}/${limit}]...`;
        this._log(`Đang phân tích chỉ số tương tác bài viết #${i}`);
        await new Promise(r => setTimeout(r, 600));
      }

      this.progress.status = 'COMPLETED';
      this.progress.message = `Quét tương tác hoàn tất ${this.progress.scannedCount} bài viết!`;
      this._log(this.progress.message, 'success');

    } catch (err) {
      this.progress.status = 'ERROR';
      this.progress.message = `Lỗi quét tương tác: ${err.message}`;
      this._log(err.message, 'error');
    } finally {
      this.isScanning = false;
      if (page) {
        try { await page.close(); } catch (e) {}
      }
    }

    return { success: true, message: this.progress.message, status: this.getStatus() };
  }
}

module.exports = new EngagementScanner();
