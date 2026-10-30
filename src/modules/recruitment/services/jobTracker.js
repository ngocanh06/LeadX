/**
 * jobTracker.js - Quản lý trạng thái bài đăng (Đã đăng / Đang trong hàng đợi / Chưa đăng)
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');

const DATA_DIR = config.dataDir;
const TRACKER_FILE = path.join(DATA_DIR, 'posted_jobs_history.json');

class JobTracker {
  constructor() {
    this._ensureDir();
    this.history = this._loadHistory();
  }

  _ensureDir() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(TRACKER_FILE)) {
      fs.writeFileSync(TRACKER_FILE, JSON.stringify({}, null, 2), 'utf8');
    }
  }

  _loadHistory() {
    try {
      const raw = fs.readFileSync(TRACKER_FILE, 'utf8');
      return JSON.parse(raw);
    } catch (err) {
      return {};
    }
  }

  _saveHistory() {
    try {
      fs.writeFileSync(TRACKER_FILE, JSON.stringify(this.history, null, 2), 'utf8');
    } catch (err) {
      logger.error('Lỗi lưu lịch sử đăng bài:', err.message);
    }
  }

  recordJobPost(jobId, { pageId, pageName, status = 'POSTED', fbPostId = '' }) {
    const jId = String(jobId);
    if (!this.history[jId]) {
      this.history[jId] = {
        jobId: jId,
        posts: []
      };
    }

    this.history[jId].posts.push({
      pageId,
      pageName,
      status,
      fbPostId,
      postedAt: new Date().toISOString()
    });

    this._saveHistory();
  }

  getJobStatus(jobId) {
    const jId = String(jobId);
    const entry = this.history[jId];
    if (!entry || !entry.posts || entry.posts.length === 0) {
      return {
        isPosted: false,
        isQueued: false,
        lastPostedPage: null,
        postedCount: 0
      };
    }

    const hasPosted = entry.posts.some(p => p.status === 'POSTED');
    const hasQueued = entry.posts.some(p => p.status === 'QUEUED');
    const lastPost = entry.posts[entry.posts.length - 1];

    return {
      isPosted: hasPosted,
      isQueued: hasQueued && !hasPosted,
      lastPostedPage: lastPost?.pageName || null,
      postedCount: entry.posts.length
    };
  }

  getStats() {
    let totalPosted = 0;
    let totalQueued = 0;

    Object.values(this.history).forEach(item => {
      if (item.posts.some(p => p.status === 'POSTED')) totalPosted++;
      else if (item.posts.some(p => p.status === 'QUEUED')) totalQueued++;
    });

    return {
      totalTrackedJobs: Object.keys(this.history).length,
      totalPosted,
      totalQueued
    };
  }
}

module.exports = new JobTracker();
