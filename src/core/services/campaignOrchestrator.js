/**
 * campaignOrchestrator.js - Bộ Điều Phối Chiến Dịch Automation (Campaign Orchestrator)
 * Tuân thủ Section 12 Master Prompt:
 * - Quản lý chiến dịch toàn chuỗi: Market -> Audience -> Content -> Campaign -> Posting -> Engagement -> Lead -> CRM.
 * - Trạng thái vòng đời thực: DRAFT -> READY -> RUNNING -> PAUSED -> COMPLETED -> CANCELLED.
 * - Điều phối Target Groups, Fanpages, Account Pool, Content Studio Variations và Unified Posting Queue.
 * - Đồng bộ thống kê thực tế không giả lập: totalTargets, queued, success, failed, leads.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');
const contentStudioService = require('./contentStudioService');
const postingQueueService = require('./postingQueueService');
const accountPoolManager = require('./accountPoolManager');
const groupIntelligenceService = require('./groupIntelligenceService');
const ruleEngineService = require('./ruleEngineService');

const CAMPAIGN_STATUSES = {
  DRAFT: 'DRAFT',
  READY: 'READY',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

const DEFAULT_CAMPAIGNS = [
  {
    id: 'camp_rec_it_01',
    name: 'Chiến dịch Tuyển dụng Sales & B2B Miền Trung Q4',
    industry: 'recruitment',
    objective: 'CANDIDATE_ATTRACTION',
    status: CAMPAIGN_STATUSES.READY,
    accountPoolId: 'pool_recruitment',
    templateId: 'tmpl_rec_01',
    baseContent: {
      title: 'Tuyển Dụng Nhân Viên Kinh Doanh & Tư Vấn B2B',
      body: 'LeadX cần tuyển 05 Nhân viên Kinh doanh thị trường.\n- Thu nhập: 10 - 25 triệu/tháng (Lương cứng + Hoa hồng cao)\n- Khu vực: Đà Nẵng / Miền Trung\n- Yêu cầu: Nhanh nhẹn, có laptop, ham học hỏi\n- Quyền lợi: Đầy đủ BHXH, đào tạo bài bản từ A-Z',
      contact: '0971946725 (Zalo/Call)',
      tags: ['Sales', 'Kinh doanh', 'Đà Nẵng']
    },
    targets: [
      { targetType: 'GROUP', targetId: 'grp_rec_01', targetName: 'Việc Làm Đà Nẵng 2026', targetUrl: 'https://facebook.com/groups/vieclamdanang2026', location: 'Đà Nẵng' },
      { targetType: 'GROUP', targetId: 'grp_rec_02', targetName: 'Tuyển Dụng Sales & Marketing Miền Trung', targetUrl: 'https://facebook.com/groups/salesmarketingmientrung', location: 'Đà Nẵng' },
      { targetType: 'FANPAGE', targetId: 'page_rec_01', targetName: 'Tuyển Dụng Đà Nẵng', targetUrl: 'https://facebook.com/tuyendungdanang', location: 'Đà Nẵng' }
    ],
    schedule: {
      type: 'INTERVAL',
      intervalMinutes: 5,
      startAt: new Date().toISOString()
    },
    seedingConfig: {
      enabled: true,
      commentCount: 2
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  },
  {
    id: 'camp_bds_luxury_01',
    name: 'Chiến dịch Cho Thuê Căn Hộ Sơn Trà - Đà Nẵng',
    industry: 'bds',
    objective: 'LEAD_GENERATION',
    status: CAMPAIGN_STATUSES.READY,
    accountPoolId: 'pool_bds',
    templateId: 'tmpl_bds_01',
    baseContent: {
      title: 'Cho Thuê Căn Hộ Sơn Trà - Full Nội Thất Hiện Đại',
      body: 'Chính chủ cho thuê căn hộ 1PN - 2PN Sơn Trà, Đà Nẵng.\n- Giá thuê: 7.5 - 12 triệu/tháng\n- Diện tích: 45 - 65m²\n- Nội thất: Full đồ cao cấp (Tủ lạnh, Máy giặt riêng, Smart TV, Bếp)\n- Tiện ích: Hồ bơi vô cực, Gym, Thang máy, An ninh 24/7',
      contact: '0971946725 (Xem nhà trực tiếp)',
      tags: ['Căn hộ', 'Sơn Trà', 'Đà Nẵng']
    },
    targets: [
      { targetType: 'GROUP', targetId: 'grp_bds_01', targetName: 'Hội Thuê Nhà Đà Nẵng', targetUrl: 'https://facebook.com/groups/thuenhadanang', location: 'Đà Nẵng' },
      { targetType: 'GROUP', targetId: 'grp_bds_02', targetName: 'Căn Hộ Cho Thuê Sơn Trà - Ngũ Hành Sơn', targetUrl: 'https://facebook.com/groups/canhosontra', location: 'Đà Nẵng' },
      { targetType: 'FANPAGE', targetId: 'page_bds_01', targetName: 'Căn Hộ Đà Nẵng Giá Tốt', targetUrl: 'https://facebook.com/canhodanang', location: 'Đà Nẵng' }
    ],
    schedule: {
      type: 'INTERVAL',
      intervalMinutes: 6,
      startAt: new Date().toISOString()
    },
    seedingConfig: {
      enabled: false,
      commentCount: 0
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  }
];

class CampaignOrchestrator {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/campaigns.json');
    this.campaigns = [];
    this._load();
    this._startStatusWatcher();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.campaigns = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || [];
        if (!Array.isArray(this.campaigns) || this.campaigns.length === 0) {
          this.campaigns = DEFAULT_CAMPAIGNS;
          this._save();
        }
      } else {
        this.campaigns = DEFAULT_CAMPAIGNS;
        this._save();
      }
    } catch (err) {
      logger.error(`[CAMPAIGN_ORCHESTRATOR] Lỗi nạp campaigns.json: ${err.message}`);
      this.campaigns = DEFAULT_CAMPAIGNS;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.campaigns, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[CAMPAIGN_ORCHESTRATOR] Lỗi ghi campaigns.json: ${err.message}`);
    }
  }

  /**
   * Định kỳ kiểm tra tiến độ chiến dịch đang chạy để tự hoàn thành
   */
  _startStatusWatcher() {
    if (this.watcherInterval) return;
    this.watcherInterval = setInterval(() => {
      this._recheckRunningCampaigns();
    }, 10000); // 10s kiểm tra một lần
  }

  _recheckRunningCampaigns() {
    const runningCamps = this.campaigns.filter(c => c.status === CAMPAIGN_STATUSES.RUNNING);
    for (const camp of runningCamps) {
      const queueItems = postingQueueService.getQueue({ campaignId: camp.id });
      if (queueItems.length > 0) {
        const pendingOrRunning = queueItems.some(item => 
          item.status === 'QUEUED' || item.status === 'PROCESSING' || item.status === 'RETRYING' || item.status === 'SCHEDULED'
        );
        if (!pendingOrRunning) {
          camp.status = CAMPAIGN_STATUSES.COMPLETED;
          camp.completedAt = new Date().toISOString();
          this._save();
          auditLogger.log({
            actor: 'CampaignOrchestrator',
            action: 'CAMPAIGN_COMPLETED',
            module: 'CAMPAIGN',
            target: camp.name,
            status: 'SUCCESS',
            details: { campaignId: camp.id, completedAt: camp.completedAt }
          });
        }
      }
    }
  }

  /**
   * Lấy danh sách chiến dịch kèm bộ lọc
   */
  getCampaigns({ industry, status, search, page = 1, limit = 50 } = {}) {
    let result = [...this.campaigns];

    if (industry && industry !== 'ALL') {
      result = result.filter(c => c.industry === industry);
    }
    if (status && status !== 'ALL') {
      result = result.filter(c => c.status === status);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(c => 
        (c.name && c.name.toLowerCase().includes(q)) ||
        (c.id && c.id.toLowerCase().includes(q))
      );
    }

    // Gắn thêm stats thực tế từ PostingQueue
    const enriched = result.map(c => this._enrichCampaignStats(c));

    const startIndex = (page - 1) * limit;
    const paginated = enriched.slice(startIndex, startIndex + limit);

    return {
      total: enriched.length,
      page: Number(page),
      limit: Number(limit),
      campaigns: paginated
    };
  }

  /**
   * Lấy chi tiết một chiến dịch
   */
  getCampaignById(id) {
    const c = this.campaigns.find(item => item.id === id);
    if (!c) return null;
    return this._enrichCampaignStats(c);
  }

  /**
   * Gắn thống kê thực tế từ PostingQueue vào Campaign
   */
  _enrichCampaignStats(campaign) {
    const jobs = postingQueueService.getQueue({ campaignId: campaign.id }) || [];
    const totalJobs = jobs.length;
    const queued = jobs.filter(j => j.status === 'QUEUED' || j.status === 'SCHEDULED').length;
    const processing = jobs.filter(j => j.status === 'PROCESSING' || j.status === 'RETRYING').length;
    const success = jobs.filter(j => j.status === 'SUCCESS').length;
    const failed = jobs.filter(j => j.status === 'FAILED').length;
    const cancelled = jobs.filter(j => j.status === 'CANCELLED').length;

    return {
      ...campaign,
      stats: {
        totalTargets: Array.isArray(campaign.targets) ? campaign.targets.length : 0,
        totalDispatchedJobs: totalJobs,
        queued,
        processing,
        success,
        failed,
        cancelled,
        successRate: totalJobs > 0 ? Math.round((success / totalJobs) * 100) : 0,
        leadsGenerated: campaign.leadsGenerated || 0
      }
    };
  }

  /**
   * Tạo chiến dịch mới
   */
  createCampaign({
    name,
    industry = 'recruitment',
    objective = 'LEAD_GENERATION',
    accountPoolId,
    templateId,
    baseContent,
    targets = [],
    schedule = { type: 'IMMEDIATE', intervalMinutes: 5 },
    seedingConfig = { enabled: false, commentCount: 0 }
  }) {
    if (!name || !name.trim()) throw new Error('Tên chiến dịch không được để trống.');

    // Nạp baseContent từ template nếu có templateId
    let finalContent = baseContent;
    if (templateId) {
      const tmpl = contentStudioService.getTemplateById(templateId);
      if (tmpl) {
        finalContent = {
          title: tmpl.title,
          body: tmpl.body,
          contact: tmpl.contact,
          tags: tmpl.tags
        };
      }
    }

    if (!finalContent || (!finalContent.body && !finalContent.title)) {
      throw new Error('Nội dung chiến dịch không được để trống.');
    }

    // Default account pool nếu chưa có
    const poolId = accountPoolId || (industry === 'bds' ? 'pool_bds' : 'pool_recruitment');

    const newCamp = {
      id: `camp_${industry}_${Date.now()}`,
      name: name.trim(),
      industry,
      objective,
      status: CAMPAIGN_STATUSES.READY,
      accountPoolId: poolId,
      templateId: templateId || null,
      baseContent: finalContent,
      targets: Array.isArray(targets) ? targets : [],
      schedule: schedule || { type: 'IMMEDIATE', intervalMinutes: 5 },
      seedingConfig: seedingConfig || { enabled: false, commentCount: 0 },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };

    this.campaigns.unshift(newCamp);
    this._save();

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'CREATE_CAMPAIGN',
      module: 'CAMPAIGN',
      target: newCamp.name,
      status: 'SUCCESS',
      details: { campaignId: newCamp.id, industry, targetsCount: newCamp.targets.length }
    });

    return this._enrichCampaignStats(newCamp);
  }

  /**
   * Cập nhật chiến dịch
   */
  updateCampaign(id, updateData) {
    const idx = this.campaigns.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    const existing = this.campaigns[idx];
    if (existing.status === CAMPAIGN_STATUSES.RUNNING) {
      throw new Error('Chiến dịch đang chạy, vui lòng tạm dừng trước khi sửa đổi cấu hình.');
    }

    const updated = {
      ...existing,
      ...updateData,
      id: existing.id, // ID không được đổi
      updatedAt: new Date().toISOString()
    };

    this.campaigns[idx] = updated;
    this._save();

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'UPDATE_CAMPAIGN',
      module: 'CAMPAIGN',
      target: updated.name,
      status: 'SUCCESS',
      details: { campaignId: updated.id }
    });

    return this._enrichCampaignStats(updated);
  }

  /**
   * Xóa chiến dịch
   */
  deleteCampaign(id) {
    const idx = this.campaigns.findIndex(c => c.id === id);
    if (idx === -1) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    const camp = this.campaigns[idx];
    if (camp.status === CAMPAIGN_STATUSES.RUNNING) {
      throw new Error('Chiến dịch đang chạy, không thể xóa trực tiếp. Vui lòng dừng hoặc hủy trước.');
    }

    this.campaigns.splice(idx, 1);
    this._save();

    // Hủy các jobs chưa chạy của campaign trong queue nếu còn
    const jobs = postingQueueService.getQueue({ campaignId: id });
    for (const j of jobs) {
      if (j.status === 'QUEUED' || j.status === 'SCHEDULED') {
        postingQueueService.cancelJob(j.id);
      }
    }

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'DELETE_CAMPAIGN',
      module: 'CAMPAIGN',
      target: camp.name,
      status: 'SUCCESS',
      details: { campaignId: id }
    });

    return { success: true, message: `Đã xóa chiến dịch ${camp.name}` };
  }

  /**
   * Kích hoạt & Điều phối chiến dịch thực tế (Launch Campaign)
   * Section 12 Master Prompt:
   * - Tạo biến thể nội dung đa kênh tối ưu (Fanpage vs Group)
   * - Điều phối vào Unified Posting Queue
   * - Giãn cách thời gian giữa các bài đăng (Staggered Scheduling) tránh spam
   */
  launchCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    if (camp.status === CAMPAIGN_STATUSES.RUNNING) {
      throw new Error('Chiến dịch đã đang trong trạng thái khởi chạy.');
    }

    if (!camp.targets || camp.targets.length === 0) {
      throw new Error('Chiến dịch chưa cấu hình mục tiêu (Fanpage / Nhóm Facebook).');
    }

    const intervalMin = camp.schedule && camp.schedule.intervalMinutes ? Number(camp.schedule.intervalMinutes) : 4;
    const now = Date.now();
    const dispatchedJobs = [];

    // Lấy pool tài khoản để chia việc
    const pool = accountPoolManager.getPoolById(camp.accountPoolId);
    const availableAccounts = pool && pool.accounts ? pool.accounts.filter(a => a.status === 'ACTIVE') : [];

    camp.targets.forEach((target, index) => {
      // 1. Tạo biến thể nội dung chuẩn theo kênh
      const variation = contentStudioService.generateChannelVariations({
        baseContent: camp.baseContent,
        industry: camp.industry,
        targetType: target.targetType,
        targetName: target.targetName,
        location: target.location || 'Toàn quốc'
      });

      // 2. Tính toán lịch trình giãn cách (Staggered delay)
      const scheduledTime = new Date(now + index * intervalMin * 60 * 1000).toISOString();

      // 3. Chọn tài khoản luân phiên từ Pool
      const assignedAccount = availableAccounts.length > 0 
        ? availableAccounts[index % availableAccounts.length] 
        : null;

      // 4. Đẩy vào hàng đợi Posting Queue
      const job = postingQueueService.addJob({
        content: variation.fullText,
        targetType: target.targetType,
        targetId: target.targetId,
        targetName: target.targetName,
        targetUrl: target.targetUrl,
        accountId: assignedAccount ? assignedAccount.id : null,
        accountPoolId: camp.accountPoolId,
        campaignId: camp.id,
        industry: camp.industry,
        scheduledAt: scheduledTime,
        priority: 2, // Ưu tiên cho chiến dịch
        jobInfo: {
          campaignName: camp.name,
          channelType: variation.channelType,
          targetLocation: target.location
        }
      });

      dispatchedJobs.push(job);
    });

    camp.status = CAMPAIGN_STATUSES.RUNNING;
    camp.startedAt = new Date().toISOString();
    camp.updatedAt = new Date().toISOString();
    this._save();

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'LAUNCH_CAMPAIGN',
      module: 'CAMPAIGN',
      target: camp.name,
      status: 'SUCCESS',
      details: {
        campaignId: camp.id,
        dispatchedJobsCount: dispatchedJobs.length,
        intervalMinutes: intervalMin,
        accountPoolId: camp.accountPoolId
      }
    });

    return {
      success: true,
      message: `Đã khởi chạy chiến dịch thành công. ${dispatchedJobs.length} bài đăng đã được điều phối vào Hàng Đợi Unified Queue.`,
      campaign: this._enrichCampaignStats(camp),
      dispatchedCount: dispatchedJobs.length
    };
  }

  /**
   * Tạm dừng chiến dịch
   */
  pauseCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    if (camp.status !== CAMPAIGN_STATUSES.RUNNING) {
      throw new Error(`Chiến dịch đang ở trạng thái ${camp.status}, không thể tạm dừng.`);
    }

    camp.status = CAMPAIGN_STATUSES.PAUSED;
    camp.updatedAt = new Date().toISOString();
    this._save();

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'PAUSE_CAMPAIGN',
      module: 'CAMPAIGN',
      target: camp.name,
      status: 'INFO',
      details: { campaignId: camp.id }
    });

    return {
      success: true,
      message: `Đã tạm dừng chiến dịch ${camp.name}`,
      campaign: this._enrichCampaignStats(camp)
    };
  }

  /**
   * Tiếp tục chiến dịch
   */
  resumeCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    if (camp.status !== CAMPAIGN_STATUSES.PAUSED) {
      throw new Error(`Chiến dịch không trong trạng thái tạm dừng.`);
    }

    camp.status = CAMPAIGN_STATUSES.RUNNING;
    camp.updatedAt = new Date().toISOString();
    this._save();

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'RESUME_CAMPAIGN',
      module: 'CAMPAIGN',
      target: camp.name,
      status: 'INFO',
      details: { campaignId: camp.id }
    });

    return {
      success: true,
      message: `Đã tiếp tục chiến dịch ${camp.name}`,
      campaign: this._enrichCampaignStats(camp)
    };
  }

  /**
   * Hủy bỏ chiến dịch và thu hồi các bài đăng đang chờ trong queue
   */
  cancelCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    camp.status = CAMPAIGN_STATUSES.CANCELLED;
    camp.updatedAt = new Date().toISOString();
    this._save();

    // Thu hồi các job trong queue
    const jobs = postingQueueService.getQueue({ campaignId: id });
    let cancelledJobsCount = 0;
    for (const j of jobs) {
      if (j.status === 'QUEUED' || j.status === 'SCHEDULED') {
        postingQueueService.cancelJob(j.id);
        cancelledJobsCount++;
      }
    }

    auditLogger.log({
      actor: 'CampaignOrchestrator',
      action: 'CANCEL_CAMPAIGN',
      module: 'CAMPAIGN',
      target: camp.name,
      status: 'WARNING',
      details: { campaignId: camp.id, cancelledJobsCount }
    });

    return {
      success: true,
      message: `Đã hủy chiến dịch ${camp.name} và thu hồi ${cancelledJobsCount} bài đăng trong hàng đợi.`,
      campaign: this._enrichCampaignStats(camp)
    };
  }
}

module.exports = new CampaignOrchestrator();
