/**
 * seedingEngine.js - Động Cơ Tương Tác & Seeding Bài Viết Tự Động (Engagement & Seeding Engine)
 * Tuân thủ Section 16 Master Prompt:
 * - Điều phối bình luận mồi, thả cảm xúc và tạo tương tác tự nhiên cho bài đăng.
 * - Quy trình: Campaign -> Target Posts -> Content Variations -> Account Pool (pool_seeding) -> Queue -> Execute -> Result.
 * - Kiểm soát tần suất an toàn tuyệt đối, độ trễ ngẫu nhiên mô phỏng người thật, tuân thủ chính sách nền tảng.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const accountPoolManager = require('./accountPoolManager');
const facebookActionEngine = require('./facebookActionEngine');
const auditLogger = require('./auditLogger');

class SeedingEngine {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.campaignsFilePath = path.resolve(this.rootDir, 'data/seeding_campaigns.json');
    this.commentsFilePath = path.resolve(this.rootDir, 'data/seeding_comments.json');
    this.campaigns = [];
    this.commentsQueue = [];
    this.isWorkerActive = false;
    this.workerTimer = null;
    this._load();
    this.startSeedingWorker();
  }

  _load() {
    try {
      if (fs.existsSync(this.campaignsFilePath)) {
        this.campaigns = JSON.parse(fs.readFileSync(this.campaignsFilePath, 'utf8')) || [];
      } else {
        this.campaigns = [];
        this._saveCampaigns();
      }

      if (fs.existsSync(this.commentsFilePath)) {
        this.commentsQueue = JSON.parse(fs.readFileSync(this.commentsFilePath, 'utf8')) || [];
      } else {
        this.commentsQueue = [];
        this._saveComments();
      }
    } catch (err) {
      logger.error(`[SEEDING_ENGINE] Lỗi nạp dữ liệu seeding: ${err.message}`);
    }
  }

  _saveCampaigns() {
    try {
      const dir = path.dirname(this.campaignsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.campaignsFilePath, JSON.stringify(this.campaigns, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[SEEDING_ENGINE] Lỗi lưu campaigns: ${err.message}`);
    }
  }

  _saveComments() {
    try {
      const dir = path.dirname(this.commentsFilePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (this.commentsQueue.length > 3000) {
        this.commentsQueue = this.commentsQueue.slice(0, 3000);
      }
      fs.writeFileSync(this.commentsFilePath, JSON.stringify(this.commentsQueue, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[SEEDING_ENGINE] Lỗi lưu commentsQueue: ${err.message}`);
    }
  }

  /**
   * Tạo chiến dịch Seeding tương tác mới
   * @param {Object} params
   * @param {string} params.name - Tên chiến dịch Seeding
   * @param {Array<string>} params.targetPostUrls - Danh sách link bài viết cần tương tác
   * @param {Array<string>} params.commentTemplates - Danh sách mẫu câu bình luận (hệ thống sẽ chọn ngẫu nhiên)
   * @param {string} [params.accountPoolId='pool_seeding'] - Pool nick seeding
   * @param {number} [params.minDelaySeconds=45] - Giãn cách tối thiểu giữa 2 comment
   * @param {number} [params.maxDelaySeconds=120] - Giãn cách tối đa
   * @param {string} [params.reactionType='LIKE'] - Thả reaction kèm theo (LIKE, LOVE, CARE)
   */
  createSeedingCampaign({
    name,
    targetPostUrls = [],
    commentTemplates = [],
    accountPoolId = 'pool_seeding',
    minDelaySeconds = 45,
    maxDelaySeconds = 120,
    reactionType = 'LIKE'
  }) {
    if (!name || !name.trim()) throw new Error('Tên chiến dịch seeding không được để trống.');
    if (!Array.isArray(targetPostUrls) || targetPostUrls.length === 0) {
      throw new Error('Vui lòng cung cấp ít nhất một URL bài viết mục tiêu.');
    }
    if (!Array.isArray(commentTemplates) || commentTemplates.length === 0) {
      throw new Error('Vui lòng cung cấp các câu bình luận mẫu.');
    }

    const campaignId = `seed_camp_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const now = new Date();

    const campaign = {
      id: campaignId,
      name: name.trim(),
      targetPostUrls,
      commentTemplates,
      accountPoolId,
      minDelaySeconds: Number(minDelaySeconds) || 45,
      maxDelaySeconds: Number(maxDelaySeconds) || 120,
      reactionType,
      status: 'RUNNING',
      totalCommentsPlanned: targetPostUrls.length * 2, // Mặc định seeding 2 comment/bài
      commentsSent: 0,
      commentsFailed: 0,
      createdAt: now.toISOString(),
      completedAt: null
    };

    this.campaigns.unshift(campaign);
    this._saveCampaigns();

    // Nạp các comment jobs vào Hàng đợi Seeding
    let scheduledOffsetMs = 10000; // Bắt đầu sau 10s

    targetPostUrls.forEach(url => {
      // 2 comments trên 1 bài với nội dung luân chuyển
      for (let i = 0; i < 2; i++) {
        const template = commentTemplates[(Math.floor(Math.random() * commentTemplates.length))];
        const delay = Math.floor(Math.random() * (campaign.maxDelaySeconds - campaign.minDelaySeconds + 1) + campaign.minDelaySeconds) * 1000;
        scheduledOffsetMs += delay;

        const commentJob = {
          id: `seed_cmt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          campaignId: campaign.id,
          postUrl: url,
          commentText: template,
          reactionType: campaign.reactionType,
          accountPoolId: campaign.accountPoolId,
          scheduledAt: new Date(now.getTime() + scheduledOffsetMs).toISOString(),
          status: 'QUEUED',
          retryCount: 0,
          maxRetries: 2,
          executedAt: null,
          result: null,
          error: null,
          createdAt: now.toISOString()
        };

        this.commentsQueue.push(commentJob);
      }
    });

    this._saveComments();

    auditLogger.log({
      actor: 'SeedingEngine',
      action: 'CREATE_SEEDING_CAMPAIGN',
      module: 'SEEDING_ENGINE',
      target: campaign.name,
      status: 'SUCCESS',
      details: {
        campaignId,
        targetPostsCount: targetPostUrls.length,
        commentsEnqueued: targetPostUrls.length * 2
      }
    });

    return campaign;
  }

  /**
   * Worker chạy nền xử lý các tác vụ Seeding theo lịch dãn cách an toàn
   */
  startSeedingWorker() {
    if (this.workerTimer) return;

    this.workerTimer = setInterval(async () => {
      if (this.isWorkerActive) return;
      await this._processNextSeedingJob();
    }, 5000); // Quét mỗi 5 giây
  }

  async _processNextSeedingJob() {
    const now = Date.now();

    // Tìm comment job đến giờ chạy
    const eligibleJob = this.commentsQueue.find(j => 
      j.status === 'QUEUED' && new Date(j.scheduledAt).getTime() <= now
    );

    if (!eligibleJob) return;

    this.isWorkerActive = true;
    eligibleJob.status = 'PROCESSING';
    this._saveComments();

    try {
      logger.info(`[SEEDING] Đang thực thi Seeding Job ${eligibleJob.id} -> ${eligibleJob.postUrl}`);

      // Chuyển giao sang Facebook Action Engine thực thi
      const action = facebookActionEngine.createAction({
        actionType: 'COMMENT',
        targetType: 'POST',
        targetUrl: eligibleJob.postUrl,
        accountPoolId: eligibleJob.accountPoolId,
        campaignId: eligibleJob.campaignId,
        payload: {
          commentText: eligibleJob.commentText,
          postUrl: eligibleJob.postUrl,
          reaction: eligibleJob.reactionType
        },
        priority: 1
      });

      const res = await facebookActionEngine.executeAction(action.actionId);

      if (res && res.success) {
        eligibleJob.status = 'SUCCESS';
        eligibleJob.executedAt = new Date().toISOString();
        eligibleJob.result = res.data?.result || {};
        eligibleJob.error = null;

        // Cập nhật số lượng hoàn thành trên Campaign
        const camp = this.campaigns.find(c => c.id === eligibleJob.campaignId);
        if (camp) {
          camp.commentsSent += 1;
          if (camp.commentsSent + camp.commentsFailed >= camp.totalCommentsPlanned) {
            camp.status = 'COMPLETED';
            camp.completedAt = new Date().toISOString();
          }
          this._saveCampaigns();
        }
      } else {
        eligibleJob.retryCount = (eligibleJob.retryCount || 0) + 1;
        eligibleJob.error = res?.error || 'Lỗi khi gửi comment seeding';

        if (eligibleJob.retryCount <= eligibleJob.maxRetries) {
          eligibleJob.status = 'QUEUED';
          // Dãn cách thêm 60s trước khi thử lại
          eligibleJob.scheduledAt = new Date(Date.now() + 60000).toISOString();
        } else {
          eligibleJob.status = 'FAILED';
          eligibleJob.executedAt = new Date().toISOString();

          const camp = this.campaigns.find(c => c.id === eligibleJob.campaignId);
          if (camp) {
            camp.commentsFailed += 1;
            this._saveCampaigns();
          }
        }
      }

      this._saveComments();
    } catch (err) {
      logger.error(`[SEEDING] Lỗi bất ngờ: ${err.message}`);
      eligibleJob.status = 'FAILED';
      eligibleJob.error = err.message;
      this._saveComments();
    } finally {
      this.isWorkerActive = false;
    }
  }

  getCampaigns() {
    return this.campaigns;
  }

  getCommentsQueue({ campaignId = null, status = 'ALL', limit = 50 } = {}) {
    let list = [...this.commentsQueue];
    if (campaignId) list = list.filter(c => c.campaignId === campaignId);
    if (status && status !== 'ALL') list = list.filter(c => c.status === status);

    return {
      total: list.length,
      data: list.slice(0, limit)
    };
  }
}

module.exports = new SeedingEngine();
