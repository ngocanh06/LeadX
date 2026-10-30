/**
 * scraperLiveSyncService.js
 * ----------------------------------------------------
 * Dịch vụ Tự Động Đồng Bộ Liên Tục Dữ Liệu Cào Tuyển Dụng (Real-time Live Sync)
 * - Tự động phát hiện thư mục scraper_data (d:/Dokumen/Làm/Tuyển Dụng/scraper_data)
 * - Quản lý File Watcher & Auto-Sync Runner (chạy background py export_scraper_stats.py)
 * - Cung cấp cơ chế thông báo Real-time (Server-Sent Events) tới Client
 * - Tự động nạp mới cache scraperDataProvider & marketAnalytics khi phát hiện có tin mới
 */
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');
const EventEmitter = require('events');
const logger = require('../../../core/utils/logger');

class ScraperLiveSyncService extends EventEmitter {
  constructor() {
    super();
    this.scraperDir = this._resolveScraperDir();
    this.overviewFilePath = path.join(this.scraperDir, 'scraper_overview.json');
    this.exportScriptPath = path.join(this.scraperDir, 'export_scraper_stats.py');
    
    this.cachedOverview = null;
    this.lastMtime = 0;
    this.lastSyncTime = null;
    this.isSyncing = false;
    this.autoSyncEnabled = true;
    this.intervalMs = 30000; // Mặc định 30 giây đồng bộ 1 lần
    this.timer = null;
    this.watcher = null;
    this.sseClients = new Set();
    this.heartbeatTimer = null;

    // Nạp dữ liệu có sẵn ngay khi khởi tạo
    this._loadFromFile(false);
  }

  _resolveScraperDir() {
    const candidates = [
      'd:/Dokumen/Làm/Tuyển Dụng/scraper_data',
      'd:\\Dokumen\\Làm\\Tuyển Dụng\\scraper_data',
      'd:/Dokumen/Tuyển Dụng/scraper_data',
      'd:\\Dokumen\\Tuyển Dụng\\scraper_data',
      path.resolve(process.cwd(), '../Tuyển Dụng/scraper_data'),
      path.resolve(__dirname, '../../../../../../Tuyển Dụng/scraper_data'),
      path.resolve(__dirname, '../../../../Tuyển Dụng/scraper_data')
    ];

    for (const c of candidates) {
      try {
        if (fs.existsSync(c)) {
          return c;
        }
      } catch (e) {}
    }
    return candidates[0];
  }

  _loadFromFile(broadcastIfChanged = true) {
    if (!fs.existsSync(this.overviewFilePath)) {
      return null;
    }

    try {
      const stat = fs.statSync(this.overviewFilePath);
      if (stat.mtimeMs <= this.lastMtime && this.cachedOverview) {
        return this.cachedOverview;
      }

      const content = fs.readFileSync(this.overviewFilePath, 'utf8');
      const parsed = JSON.parse(content);
      const prevTotal = this.cachedOverview ? this.cachedOverview.total_jobs : null;
      
      this.cachedOverview = parsed;
      this.lastMtime = stat.mtimeMs;
      this.lastSyncTime = new Date();

      if (broadcastIfChanged && prevTotal !== null && prevTotal !== parsed.total_jobs) {
        logger.success(`[LiveSync] Phát hiện dữ liệu cào mới: ${prevTotal} -> ${parsed.total_jobs} việc làm!`);
        this.broadcast('stats_updated', {
          overview: parsed,
          diff: {
            prevTotal,
            newTotal: parsed.total_jobs,
            added: parsed.total_jobs - prevTotal
          },
          timestamp: new Date().toISOString()
        });

        // Kích hoạt nạp lại provider nếu có
        try {
          const scraperDataProvider = require('./scraperDataProvider');
          if (scraperDataProvider && typeof scraperDataProvider.loadJobs === 'function') {
            scraperDataProvider.loadJobs(true);
          }
        } catch (e) {}
      }

      return this.cachedOverview;
    } catch (err) {
      logger.warn(`[LiveSync] Lỗi đọc scraper_overview.json: ${err.message}`);
      return this.cachedOverview;
    }
  }

  getOverview(forceReload = false) {
    if (forceReload || !this.cachedOverview) {
      return this._loadFromFile(false) || this.cachedOverview;
    }
    return this.cachedOverview;
  }

  getStatus() {
    return {
      autoSyncEnabled: this.autoSyncEnabled,
      intervalSeconds: Math.round(this.intervalMs / 1000),
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime ? this.lastSyncTime.toISOString() : null,
      totalJobs: this.cachedOverview?.total_jobs || 0,
      totalCompanies: this.cachedOverview?.total_companies || 0,
      totalSources: this.cachedOverview?.total_sources || 0,
      scraperDir: this.scraperDir,
      connectedClients: this.sseClients.size
    };
  }

  async syncNow(manual = false) {
    if (this.isSyncing) {
      return {
        success: true,
        isSyncing: true,
        message: 'Tiến trình đồng bộ đang chạy ngầm...',
        data: this.cachedOverview
      };
    }

    if (!fs.existsSync(this.exportScriptPath)) {
      logger.warn(`[LiveSync] Không tìm thấy file script: ${this.exportScriptPath}`);
      const data = this._loadFromFile(true);
      return { success: !!data, data, message: 'Đã tải dữ liệu từ file JSON hiện có' };
    }

    this.isSyncing = true;
    this.broadcast('sync_status', { isSyncing: true, manual });

    return new Promise((resolve) => {
      const prevJobs = this.cachedOverview?.total_jobs || 0;
      const cmd = `py "${this.exportScriptPath}"`;
      
      exec(cmd, { cwd: this.scraperDir, timeout: 45000 }, (err, stdout, stderr) => {
        this.isSyncing = false;
        
        if (err) {
          logger.warn(`[LiveSync] Cảnh báo khi chạy export script: ${err.message}`);
        }

        const freshData = this._loadFromFile(true);
        const newJobs = freshData?.total_jobs || prevJobs;
        const diff = newJobs - prevJobs;

        this.broadcast('sync_status', { 
          isSyncing: false, 
          diff, 
          newTotal: newJobs,
          overview: freshData 
        });

        resolve({
          success: true,
          diff,
          prevJobs,
          newJobs,
          data: freshData,
          message: diff !== 0 
            ? `Đã cập nhật ${diff > 0 ? '+' : ''}${diff} việc làm mới từ tiến trình cào!` 
            : 'Dữ liệu cào đã được làm mới thành công!'
        });
      });
    });
  }

  startAutoSync(intervalSeconds = 30) {
    this.autoSyncEnabled = true;
    this.intervalMs = Math.max(10, intervalSeconds) * 1000;

    if (this.timer) {
      clearInterval(this.timer);
    }

    logger.info(`[LiveSync] 🟢 Kích hoạt chế độ TỰ ĐỘNG ĐỒNG BỘ LIÊN TỤC (Chu kỳ: ${intervalSeconds}s).`);

    // Chạy ngầm định kỳ
    this.timer = setInterval(() => {
      if (this.autoSyncEnabled && !this.isSyncing) {
        this.syncNow(false).catch(err => {
          logger.warn(`[LiveSync Interval Error] ${err.message}`);
        });
      }
    }, this.intervalMs);

    // Bắt đầu File Watcher trên file scraper_overview.json
    this._startWatcher();

    // Khởi động heartbeat cho SSE
    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this._sendSsePing();
      }, 15000);
    }

    // Thực hiện 1 lần sync đầu tiên trong nền sau 3s khởi động
    setTimeout(() => {
      this.syncNow(false).catch(() => {});
    }, 3000);
  }

  stopAutoSync() {
    this.autoSyncEnabled = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    logger.info('[LiveSync] ⏸ Đã tạm dừng chế độ Tự động đồng bộ liên tục.');
    this.broadcast('sync_status', { autoSyncEnabled: false });
  }

  setAutoSyncInterval(seconds) {
    const sec = Math.max(5, parseInt(seconds, 10) || 30);
    this.startAutoSync(sec);
  }

  _startWatcher() {
    if (this.watcher) {
      try { this.watcher.close(); } catch (e) {}
    }

    try {
      if (fs.existsSync(this.scraperDir)) {
        let debounceTimer = null;
        this.watcher = fs.watch(this.scraperDir, { recursive: false }, (eventType, filename) => {
          if (!filename) return;
          if (filename.includes('scraper_overview.json') || filename.endsWith('.xlsx')) {
            if (debounceTimer) clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
              this._loadFromFile(true);
            }, 1000);
          }
        });
        logger.info(`[LiveSync] 👀 Đang theo dõi thư mục: ${this.scraperDir}`);
      }
    } catch (err) {
      logger.warn(`[LiveSync Watcher Error] ${err.message}`);
    }
  }

  // Quản lý SSE Client (Realtime Stream)
  handleSseConnection(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const client = { id: Date.now() + Math.random(), res };
    this.sseClients.add(client);

    // Gửi sự kiện ban đầu
    const initPayload = {
      type: 'connected',
      status: this.getStatus(),
      overview: this.getOverview()
    };
    res.write(`event: init\ndata: ${JSON.stringify(initPayload)}\n\n`);

    req.on('close', () => {
      this.sseClients.delete(client);
    });
  }

  broadcast(event, payload) {
    if (this.sseClients.size === 0) return;
    const msg = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const client of this.sseClients) {
      try {
        client.res.write(msg);
      } catch (e) {
        this.sseClients.delete(client);
      }
    }
  }

  _sendSsePing() {
    if (this.sseClients.size === 0) return;
    for (const client of this.sseClients) {
      try {
        client.res.write(`event: ping\ndata: {"time":${Date.now()}}\n\n`);
      } catch (e) {
        this.sseClients.delete(client);
      }
    }
  }
}

module.exports = new ScraperLiveSyncService();
