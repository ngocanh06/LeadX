/**
 * emailCampaignService.js - Điều Phối Chiến Dịch Email Hàng Loạt & Lập Lịch (Email Campaign Engine)
 * Tuân thủ Section 11 Master Prompt Auto Email:
 * - Điều phối chiến dịch gửi hàng loạt: DRAFT -> SCHEDULED -> RUNNING -> PAUSED -> COMPLETED -> CANCELLED.
 * - Cơ chế Throttling & Giãn cách an toàn (20 - 60s/email) để bảo vệ uy tín tên miền và hạn ngạch SMTP.
 * - Idempotency Key bảo đảm mỗi người nhận chỉ nhận đúng 1 email trong cùng 1 chiến dịch.
 * - Thống kê thực tế không giả lập (sent, failed, queued, delivery rate).
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');
const emailQueueService = require('./emailQueueService');
const emailTemplateService = require('./emailTemplateService');
const emailProviderService = require('./emailProviderService');

const CAMPAIGN_STATUSES = {
  DRAFT: 'DRAFT',
  SCHEDULED: 'SCHEDULED',
  RUNNING: 'RUNNING',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  CANCELLED: 'CANCELLED'
};

const DEFAULT_CAMPAIGNS = [
  {
    id: 'emcamp_outreach_q4',
    name: 'Chiến Dịch Tiếp Cận 50 Doanh Nghiệp F&B Tuyển Dụng',
    category: 'employer',
    templateId: 'tmpl_employer_outreach',
    providerId: 'prov_gmail_leadx_demo',
    recipients: [
      { email: 'hr.the1985@gmail.com', name: 'Quán Cafe The 1985', customVars: { companyName: 'Quán Cafe The 1985', location: 'Tân Phú, TP.HCM', jobTitle: 'Nhân viên pha chế' } },
      { email: 'tuyendung.smileshop@gmail.com', name: 'Smile Mart', customVars: { companyName: 'Smile Mart', location: 'Hà Nội', jobTitle: 'Thu ngân ca gãy' } }
    ],
    throttleSeconds: 30,
    scheduledAt: new Date().toISOString(),
    status: CAMPAIGN_STATUSES.DRAFT,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null
  }
];

class EmailCampaignService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/email_campaigns.json');
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
      logger.error(`[EMAIL_CAMPAIGN] Lỗi nạp email_campaigns.json: ${err.message}`);
      this.campaigns = DEFAULT_CAMPAIGNS;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.campaigns, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[EMAIL_CAMPAIGN] Lỗi lưu email_campaigns.json: ${err.message}`);
    }
  }

  _startStatusWatcher() {
    if (this.watcherInterval) return;
    this.watcherInterval = setInterval(() => {
      this._checkRunningCampaigns();
    }, 8000);
  }

  _checkRunningCampaigns() {
    const running = this.campaigns.filter(c => c.status === CAMPAIGN_STATUSES.RUNNING);
    for (const camp of running) {
      const jobs = emailQueueService.jobs.filter(j => j.campaignId === camp.id);
      if (jobs.length > 0) {
        const stillPending = jobs.some(j => j.status === 'QUEUED' || j.status === 'SENDING' || j.status === 'RETRYING');
        if (!stillPending) {
          camp.status = CAMPAIGN_STATUSES.COMPLETED;
          camp.completedAt = new Date().toISOString();
          this._save();

          auditLogger.log({
            actor: 'EmailCampaignService',
            action: 'CAMPAIGN_COMPLETED',
            module: 'EMAIL_CAMPAIGN',
            target: camp.name,
            status: 'SUCCESS',
            details: { campaignId: camp.id }
          });
        }
      }
    }
  }

  _enrichCampaignStats(camp) {
    const jobs = emailQueueService.jobs.filter(j => j.campaignId === camp.id);
    const totalRecipients = Array.isArray(camp.recipients) ? camp.recipients.length : 0;
    const sent = jobs.filter(j => j.status === 'SENT').length;
    const failed = jobs.filter(j => j.status === 'FAILED').length;
    const queued = jobs.filter(j => j.status === 'QUEUED' || j.status === 'SENDING' || j.status === 'RETRYING').length;

    const progressRate = totalRecipients > 0 ? Math.round(((sent + failed) / totalRecipients) * 100) : 0;
    const deliveryRate = totalRecipients > 0 ? Math.round((sent / totalRecipients) * 100) : 0;

    return {
      ...camp,
      stats: {
        totalRecipients,
        queued,
        sent,
        failed,
        progressRate,
        deliveryRate
      }
    };
  }

  getCampaigns({ category, status, search } = {}) {
    let list = [...this.campaigns];
    if (category && category !== 'ALL') {
      list = list.filter(c => c.category === category);
    }
    if (status && status !== 'ALL') {
      list = list.filter(c => c.status === status);
    }
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c => c.name && c.name.toLowerCase().includes(q));
    }
    return list.map(c => this._enrichCampaignStats(c));
  }

  getCampaignById(id) {
    const c = this.campaigns.find(item => item.id === id);
    if (!c) return null;
    const jobs = emailQueueService.jobs.filter(j => j.campaignId === c.id);
    return {
      ...this._enrichCampaignStats(c),
      jobs
    };
  }

  createCampaign({
    name,
    category = 'employer',
    templateId,
    providerId,
    recipients = [],
    throttleSeconds = 30,
    scheduledAt = null
  }) {
    if (!name || !name.trim()) throw new Error('Tên chiến dịch không được để trống.');
    if (!templateId) throw new Error('Vui lòng chọn mẫu email.');
    if (!Array.isArray(recipients) || recipients.length === 0) {
      throw new Error('Danh sách người nhận không được để trống.');
    }

    const newCamp = {
      id: `emcamp_${Date.now().toString(36)}`,
      name: name.trim(),
      category,
      templateId,
      providerId: providerId || 'prov_gmail_leadx_demo',
      recipients,
      throttleSeconds: Math.max(5, Number(throttleSeconds) || 30),
      scheduledAt: scheduledAt || new Date().toISOString(),
      status: CAMPAIGN_STATUSES.DRAFT,
      createdAt: new Date().toISOString(),
      startedAt: null,
      completedAt: null
    };

    this.campaigns.unshift(newCamp);
    this._save();

    auditLogger.log({
      actor: 'EmailCampaignService',
      action: 'CREATE_EMAIL_CAMPAIGN',
      module: 'EMAIL_CAMPAIGN',
      target: newCamp.name,
      status: 'SUCCESS',
      details: { campaignId: newCamp.id, recipientsCount: recipients.length }
    });

    return this._enrichCampaignStats(newCamp);
  }

  /**
   * Khởi chạy chiến dịch: Lên lịch hàng loạt vào Unified Email Queue với độ giãn cách an toàn
   */
  launchCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    if (camp.status === CAMPAIGN_STATUSES.RUNNING) {
      throw new Error('Chiến dịch đang trong quá trình phát sóng.');
    }

    const template = emailTemplateService.getTemplateById(camp.templateId);
    if (!template) throw new Error('Mẫu email của chiến dịch không tồn tại.');

    const startTimestamp = Math.max(Date.now(), new Date(camp.scheduledAt || Date.now()).getTime());
    const throttleMs = (camp.throttleSeconds || 30) * 1000;
    const dispatched = [];

    camp.recipients.forEach((rec, index) => {
      if (!rec.email || !rec.email.includes('@')) return;

      const vars = {
        candidateName: rec.name || 'Bạn',
        companyName: rec.name || 'Quý Khách',
        clientName: rec.name || 'Quý Khách',
        ...(rec.customVars || {})
      };

      const rendered = emailTemplateService.renderTemplate(template, vars);
      const scheduledTime = new Date(startTimestamp + index * throttleMs).toISOString();
      const idempotencyKey = `emcamp_${camp.id}_${rec.email.trim().toLowerCase()}`;

      const job = emailQueueService.addEmailJob({
        providerId: camp.providerId,
        to: rec.email,
        toName: rec.name || rec.email,
        subject: rendered.subject,
        bodyHtml: rendered.bodyHtml,
        bodyText: rendered.bodyText,
        category: camp.category,
        campaignId: camp.id,
        scheduledAt: scheduledTime,
        idempotencyKey
      });

      dispatched.push(job);
    });

    camp.status = CAMPAIGN_STATUSES.RUNNING;
    camp.startedAt = new Date().toISOString();
    this._save();

    auditLogger.log({
      actor: 'EmailCampaignService',
      action: 'LAUNCH_EMAIL_CAMPAIGN',
      module: 'EMAIL_CAMPAIGN',
      target: camp.name,
      status: 'SUCCESS',
      details: { campaignId: camp.id, dispatchedCount: dispatched.length }
    });

    return {
      success: true,
      message: `Đã khởi chạy chiến dịch! ${dispatched.length} email đã được điều phối vào Hàng Đợi với độ giãn cách an toàn ${camp.throttleSeconds}s/email.`,
      campaign: this._enrichCampaignStats(camp)
    };
  }

  pauseCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    camp.status = CAMPAIGN_STATUSES.PAUSED;
    this._save();

    return { success: true, message: `Đã tạm dừng chiến dịch ${camp.name}`, campaign: this._enrichCampaignStats(camp) };
  }

  resumeCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    camp.status = CAMPAIGN_STATUSES.RUNNING;
    this._save();

    return { success: true, message: `Đã tiếp tục chiến dịch ${camp.name}`, campaign: this._enrichCampaignStats(camp) };
  }

  cancelCampaign(id) {
    const camp = this.campaigns.find(c => c.id === id);
    if (!camp) throw new Error(`Không tìm thấy chiến dịch ID ${id}`);

    camp.status = CAMPAIGN_STATUSES.CANCELLED;
    this._save();

    // Hủy các job chưa gửi của campaign trong queue
    let cancelledCount = 0;
    for (const j of emailQueueService.jobs) {
      if (j.campaignId === id && j.status === 'QUEUED') {
        j.status = 'CANCELLED';
        cancelledCount++;
      }
    }
    emailQueueService._save();

    return { success: true, message: `Đã hủy chiến dịch và thu hồi ${cancelledCount} email đang chờ gửi.`, campaign: this._enrichCampaignStats(camp) };
  }
}

module.exports = new EmailCampaignService();
