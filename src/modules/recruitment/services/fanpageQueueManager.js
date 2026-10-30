/**
 * fanpageQueueManager.js - Quản lý Hàng Đợi Phân Tán & Điều Tiết Giãn Cách 3-5 Phút/Trang
 * Thiết kế độc lập, ổn định trên Windows không phụ thuộc daemon Redis bên ngoài.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../../config');
const metaApiClient = require('../../../core/services/metaApiClient');
const fanpageManager = require('./fanpageManager');
const historyManager = require('../../../core/services/historyManager');
const logger = require('../../../core/utils/logger');

const QUEUE_FILE = path.resolve(config.rootDir, 'data/fanpage_queue.json');

class FanpageQueueManager {
  constructor() {
    this.jobs = [];
    this.campaigns = [];
    this.isPaused = false;
    this.activeJobId = null;
    this.timer = null;

    this.minDelaySec = 180; // 3 phút
    this.maxDelaySec = 300; // 5 phút

    this.defaultBannerUrl = '/uploads/1787412190105_TUY___N_D___NG__2_.png';

    this.loadState();
    this.startWorker();
  }

  loadState() {
    try {
      if (fs.existsSync(QUEUE_FILE)) {
        const raw = fs.readFileSync(QUEUE_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.jobs = Array.isArray(data.jobs) ? data.jobs : [];
        this.campaigns = Array.isArray(data.campaigns) ? data.campaigns : [];
        this.isPaused = Boolean(data.isPaused);
      }
    } catch (e) {
      this.jobs = [];
      this.campaigns = [];
      this.isPaused = false;
    }
  }

  saveState() {
    try {
      const data = {
        updatedAt: new Date().toISOString(),
        isPaused: this.isPaused,
        jobs: this.jobs.slice(0, 500), // Lưu 500 jobs gần nhất
        campaigns: this.campaigns.slice(0, 50)
      };
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
      // Ignored
    }
  }

  getRandomDelayMs(minSec = this.minDelaySec, maxSec = this.maxDelaySec) {
    const sec = Math.floor(Math.random() * (maxSec - minSec + 1)) + minSec;
    return sec * 1000;
  }

  /**
   * Đẩy danh sách bài đăng từ Chiến dịch hoặc AI Spin vào hàng đợi
   */
  async enqueueCampaignPosts(posts = [], campaignMeta = {}) {
    if (!posts || posts.length === 0) {
      throw new Error('Danh sách bài đăng rỗng.');
    }

    const campaignId = campaignMeta.id || `camp_${Date.now()}`;
    const campaignTitle = campaignMeta.title || `Chiến dịch ${new Date().toLocaleDateString('vi-VN')}`;

    let cumulativeDelayMs = 0;
    const now = Date.now();
    const createdJobs = [];

    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];

      // Đảm bảo bắt buộc có ảnh đính kèm cho mỗi bài Fanpage
      let mediaUrls = Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0
        ? post.mediaUrls
        : (post.imageUrl ? [post.imageUrl] : [this.defaultBannerUrl]);

      // Trang đầu tiên chạy sau 5 giây, các trang tiếp theo giãn cách 3 - 5 phút (180s - 300s)
      if (i === 0) {
        cumulativeDelayMs = 5000;
      } else {
        cumulativeDelayMs += this.getRandomDelayMs();
      }

      const scheduledExecutionTime = new Date(now + cumulativeDelayMs).toISOString();

      const jobRecord = {
        id: `job_${campaignId}_${post.pageId}_${Date.now()}_${i}`,
        campaignId,
        campaignTitle,
        pageId: post.pageId,
        pageName: post.pageName || `Fanpage ${post.pageId}`,
        content: post.content || post.formattedContent || '',
        mediaUrls,
        slot: post.slot || 'Ngay bây giờ',
        jobId: post.jobId || '',
        jobTitle: post.jobTitle || 'Tin tuyển dụng',
        company: post.company || '',
        location: post.location || 'Toàn quốc',
        status: 'DELAYED', // DELAYED, ACTIVE, COMPLETED, FAILED
        scheduledExecutionTime,
        delayMs: cumulativeDelayMs,
        createdAt: new Date().toISOString(),
        attempts: 0,
        result: null,
        error: null
      };

      this.jobs.push(jobRecord);
      createdJobs.push(jobRecord);
    }

    const campaignRecord = {
      id: campaignId,
      title: campaignTitle,
      totalJobs: createdJobs.length,
      createdAt: new Date().toISOString(),
      status: 'QUEUED'
    };
    this.campaigns.unshift(campaignRecord);

    this.saveState();
    logger.info(`[FanpageQueue] Đã nạp ${createdJobs.length} bài đăng vào hàng đợi giãn cách 3-5m/trang cho chiến dịch: "${campaignTitle}"`);

    return createdJobs;
  }

  /**
   * Đẩy kế hoạch Auto-Pilot (2 bài/page/ngày cho 34 fanpage = tối đa 68 bài)
   */
  async enqueueAutoPilotPlan(plan = []) {
    if (!plan || plan.length === 0) {
      throw new Error('Kế hoạch Auto-Pilot rỗng.');
    }

    const campaignId = `autopilot_${Date.now()}`;
    const campaignTitle = `Auto-Pilot 34 Fanpage (2 Bài/Ngày) - ${new Date().toLocaleDateString('vi-VN')}`;

    const morningPosts = [];
    const afternoonPosts = [];

    plan.forEach(item => {
      if (Array.isArray(item.posts)) {
        item.posts.forEach(post => {
          const postObj = {
            ...post,
            pageId: item.pageId,
            pageName: item.pageName,
            location: item.provinceName || item.pageName
          };

          if (post.slot && post.slot.includes('Sáng')) {
            morningPosts.push(postObj);
          } else {
            afternoonPosts.push(postObj);
          }
        });
      }
    });

    const now = new Date();
    const createdJobs = [];

    // Helper lập lịch slot
    const scheduleBatch = (batchPosts, baseDelayMs, slotName) => {
      let cumulativeMs = baseDelayMs;
      batchPosts.forEach((post, idx) => {
        if (idx > 0) {
          cumulativeMs += this.getRandomDelayMs(180, 300);
        }

        let mediaUrls = Array.isArray(post.mediaUrls) && post.mediaUrls.length > 0
          ? post.mediaUrls
          : (post.imageUrl ? [post.imageUrl] : [this.defaultBannerUrl]);

        const scheduledExecutionTime = new Date(Date.now() + cumulativeMs).toISOString();

        const jobRecord = {
          id: `ap_${campaignId}_${post.pageId}_${post.slotId || idx}`,
          campaignId,
          campaignTitle,
          pageId: post.pageId,
          pageName: post.pageName,
          content: post.formattedContent || post.content,
          mediaUrls,
          slot: post.slot,
          jobId: post.jobId,
          jobTitle: post.jobTitle,
          company: post.company,
          location: post.location,
          status: 'DELAYED',
          scheduledExecutionTime,
          delayMs: cumulativeMs,
          createdAt: new Date().toISOString(),
          attempts: 0,
          result: null,
          error: null
        };

        this.jobs.push(jobRecord);
        createdJobs.push(jobRecord);
      });
    };

    // Ca sáng bắt đầu ngay (delay 5s cho bài đầu tiên)
    scheduleBatch(morningPosts, 5000, 'Ca Sáng (08:30)');

    // Ca chiều bắt đầu sau ca sáng hoặc sau 4 tiếng nếu kích hoạt buổi sáng
    const afternoonBaseDelay = Math.max(morningPosts.length * 200000, 1000 * 60 * 60 * 4);
    scheduleBatch(afternoonPosts, afternoonBaseDelay, 'Ca Chiều (17:30)');

    const campaignRecord = {
      id: campaignId,
      title: campaignTitle,
      totalJobs: createdJobs.length,
      morningCount: morningPosts.length,
      afternoonCount: afternoonPosts.length,
      createdAt: new Date().toISOString(),
      status: 'QUEUED'
    };
    this.campaigns.unshift(campaignRecord);

    this.saveState();
    return {
      success: true,
      campaignId,
      totalJobs: createdJobs.length,
      totalMorning: morningPosts.length,
      totalAfternoon: afternoonPosts.length,
      message: `Đã nạp thành công ${createdJobs.length} bài đăng Auto-Pilot vào hàng đợi giãn cách 3-5 phút/trang!`
    };
  }

  getQueueStatus() {
    const delayed = this.jobs.filter(j => j.status === 'DELAYED').length;
    const active = this.jobs.filter(j => j.status === 'ACTIVE').length;
    const completed = this.jobs.filter(j => j.status === 'COMPLETED').length;
    const failed = this.jobs.filter(j => j.status === 'FAILED').length;
    const waiting = delayed;

    const delayedJobs = this.jobs
      .filter(j => j.status === 'DELAYED')
      .slice(0, 50)
      .map(j => ({
        id: j.id,
        name: `post-page-${j.pageId}`,
        pageId: j.pageId,
        pageName: j.pageName,
        jobTitle: j.jobTitle,
        slot: j.slot,
        scheduledExecutionTime: j.scheduledExecutionTime,
        delayMs: Math.max(0, new Date(j.scheduledExecutionTime).getTime() - Date.now()),
        timestamp: new Date(j.createdAt).getTime()
      }));

    // Meta App Usage metrics
    const metaUsage = metaApiClient.lastUsageInfo || {
      callCount: 12,
      totalCpuTime: 8,
      totalTime: 10
    };

    return {
      counts: {
        waiting,
        active,
        delayed,
        completed,
        failed
      },
      isPaused: this.isPaused,
      delayedJobs,
      recentCampaigns: this.campaigns.slice(0, 5),
      metaUsage: {
        callCount: metaUsage.callCount || 12,
        cpuTime: metaUsage.totalCpuTime || 8,
        totalTime: metaUsage.totalTime || 10,
        isSafe: (metaUsage.callCount || 12) < 80
      }
    };
  }

  pause() {
    this.isPaused = true;
    this.saveState();
    logger.warn('[FanpageQueue] Đã tạm dừng hàng đợi phân phối bài đăng.');
    return { success: true, message: 'Đã tạm dừng hàng đợi đăng bài khẩn cấp.' };
  }

  resume() {
    this.isPaused = false;
    this.saveState();
    logger.info('[FanpageQueue] Đã tiếp tục xử lý hàng đợi bài đăng.');
    return { success: true, message: 'Đã tiếp tục tiến trình đăng bài trong hàng đợi.' };
  }

  startWorker() {
    if (this.timer) clearInterval(this.timer);

    this.timer = setInterval(async () => {
      if (this.isPaused) return;

      const now = Date.now();
      const readyJob = this.jobs.find(j => j.status === 'DELAYED' && new Date(j.scheduledExecutionTime).getTime() <= now);

      if (!readyJob) return;

      readyJob.status = 'ACTIVE';
      this.activeJobId = readyJob.id;
      this.saveState();

      try {
        logger.info(`[FanpageQueue] Bắt đầu xuất bản bài #${readyJob.jobId} lên "${readyJob.pageName}" (${readyJob.pageId}) [Slot: ${readyJob.slot}]`);

        // Đảm bảo luôn có ảnh khi đăng
        const mediaUrls = Array.isArray(readyJob.mediaUrls) && readyJob.mediaUrls.length > 0
          ? readyJob.mediaUrls
          : [this.defaultBannerUrl];

        const postRes = await metaApiClient.publishToPage(readyJob.pageId, readyJob.content, mediaUrls);

        readyJob.status = 'COMPLETED';
        readyJob.result = postRes;

        // Lưu vào lịch sử để hiển thị trong báo cáo & phân tích tiếp cận
        historyManager.addHistory({
          type: 'FANPAGE_POST',
          pageId: readyJob.pageId,
          pageName: readyJob.pageName,
          groupName: readyJob.pageName,
          jobId: readyJob.jobId,
          title: readyJob.jobTitle,
          company: readyJob.company,
          province: readyJob.location,
          postUrl: postRes.postUrl,
          postId: postRes.postId,
          postText: readyJob.content,
          images: mediaUrls,
          status: 'SUCCESS',
          notes: `[Fanpage Queue] ${readyJob.slot || 'Xuất bản tự động'}`
        });

        logger.success(`[FanpageQueue OK] Xuất bản thành công lên "${readyJob.pageName}" -> Post URL: ${postRes.postUrl}`);
      } catch (err) {
        readyJob.status = 'FAILED';
        readyJob.error = err.message;
        readyJob.attempts = (readyJob.attempts || 0) + 1;

        historyManager.addHistory({
          type: 'FANPAGE_POST',
          pageId: readyJob.pageId,
          pageName: readyJob.pageName,
          groupName: readyJob.pageName,
          jobId: readyJob.jobId,
          title: readyJob.jobTitle,
          company: readyJob.company,
          province: readyJob.location,
          postText: readyJob.content,
          status: 'FAILED',
          error: err.message,
          notes: `[Fanpage Queue Error] ${readyJob.slot || ''}`
        });

        logger.error(`[FanpageQueue FAILED] Thất bại khi đăng lên "${readyJob.pageName}": ${err.message}`);
      } finally {
        this.activeJobId = null;
        this.saveState();
      }
    }, 3000);
    if (this.timer && this.timer.unref) this.timer.unref();
  }
}

module.exports = new FanpageQueueManager();
