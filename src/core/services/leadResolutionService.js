/**
 * leadResolutionService.js - Định Danh & Hợp Nhất Lead Trùng Lặp (Identity Resolution & Deduplication)
 * Tuân thủ Section 14 Master Prompt:
 * - Hợp nhất danh tính dựa trên SĐT, Facebook Profile / UID, Email.
 * - Tránh tạo trùng bản ghi Lead, tự động gộp lịch sử tương tác đa kênh.
 * - Gắn vết nguồn gốc phân bổ doanh thu (Attribution): Group -> Post -> Campaign -> Lead.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');
const leadScoringEngine = require('./leadScoringEngine');
const keywordMonitorService = require('./keywordMonitorService');

class LeadResolutionService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.leadsFile = path.resolve(this.rootDir, 'data/leads_crm.json');
    this.leads = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.leadsFile)) {
        this.leads = JSON.parse(fs.readFileSync(this.leadsFile, 'utf8')) || [];
      } else {
        this.leads = [];
        this._save();
      }
    } catch (err) {
      logger.error(`[LEAD_RESOLUTION] Lỗi nạp leads_crm.json: ${err.message}`);
      this.leads = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.leadsFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.leadsFile, JSON.stringify(this.leads, null, 2), 'utf8');
    } catch (err) {
      logger.error(`[LEAD_RESOLUTION] Lỗi lưu leads_crm.json: ${err.message}`);
    }
  }

  /**
   * Chuẩn hóa Số điện thoại (loại bỏ khoảng trắng, dấu chấm, mã quốc gia)
   */
  normalizePhone(phone) {
    if (!phone) return null;
    let cleaned = phone.toString().replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+84')) {
      cleaned = '0' + cleaned.substring(3);
    } else if (cleaned.startsWith('84') && cleaned.length >= 10) {
      cleaned = '0' + cleaned.substring(2);
    }
    return cleaned.length >= 9 ? cleaned : null;
  }

  /**
   * Tìm kiếm bản ghi trùng lặp trong hệ thống
   */
  findDuplicate({ phone, authorUrl, email, fbUid }) {
    const normPhone = this.normalizePhone(phone);
    const cleanAuthor = authorUrl && authorUrl !== '#' ? authorUrl.trim().toLowerCase() : null;
    const cleanEmail = email ? email.trim().toLowerCase() : null;

    return this.leads.find(lead => {
      // 1. Trùng Số điện thoại
      if (normPhone && lead.phone && this.normalizePhone(lead.phone) === normPhone) {
        return true;
      }
      // 2. Trùng Facebook URL / UID
      if (cleanAuthor && lead.authorUrl && lead.authorUrl.toLowerCase() === cleanAuthor) {
        return true;
      }
      if (fbUid && lead.fbUid && lead.fbUid === fbUid) {
        return true;
      }
      // 3. Trùng Email
      if (cleanEmail && lead.email && lead.email.toLowerCase() === cleanEmail) {
        return true;
      }
      return false;
    });
  }

  /**
   * Tiếp nhận và phân giải danh tính Lead từ bất kỳ kênh nào (Post, Comment, Inbox, Scraper)
   */
  resolveAndIngestLead(rawPayload = {}) {
    const text = rawPayload.text || rawPayload.originalText || rawPayload.content || '';
    const author = rawPayload.author || rawPayload.posterName || 'Khách hàng quan tâm';
    const authorUrl = rawPayload.authorUrl || rawPayload.profileUrl || '';
    const postUrl = rawPayload.postUrl || '';
    const campaignId = rawPayload.campaignId || null;
    const groupName = rawPayload.groupName || '';
    const groupUrl = rawPayload.groupUrl || '';
    const industry = rawPayload.industry || 'recruitment';

    // 1. Phân tích nội dung qua Keyword Monitor Service
    const analysis = keywordMonitorService.analyzeText({
      text,
      industryHint: industry,
      author,
      context: { postUrl, groupName, campaignId }
    });

    if (analysis.isSpam) {
      logger.warn(`[LEAD_RESOLUTION] Bỏ qua lead rác/spam: ${analysis.reason}`);
      return { isIngested: false, reason: analysis.reason, isSpam: true };
    }

    const phone = this.normalizePhone(rawPayload.phone || analysis.entities?.phone);
    const email = (rawPayload.email || analysis.entities?.email || '').toLowerCase();
    const location = rawPayload.location || analysis.entities?.location || '';
    const price = rawPayload.salary || rawPayload.price || analysis.entities?.salaryOrPrice || '';
    const intent = rawPayload.intent || analysis.intent || 'INQUIRY';

    // 2. Chấm điểm chất lượng Lead qua Lead Scoring Engine
    const scoreResult = leadScoringEngine.evaluateLead({
      text,
      phone,
      email,
      location,
      salary: price,
      intent,
      campaignId,
      groupUrl,
      industry
    });

    // 3. Kiểm tra trùng lặp (Deduplication)
    const existing = this.findDuplicate({ phone, authorUrl, email });

    const now = new Date().toISOString();

    if (existing) {
      // HỢP NHẤT DỮ LIỆU (Merge existing lead)
      let isUpdated = false;

      // Cập nhật SĐT nếu lead cũ chưa có mà lead mới có
      if (!existing.phone && phone) {
        existing.phone = phone;
        isUpdated = true;
      }
      // Cập nhật Email nếu chưa có
      if (!existing.email && email) {
        existing.email = email;
        isUpdated = true;
      }
      // Cập nhật địa điểm
      if (!existing.address && location) {
        existing.address = location;
        isUpdated = true;
      }

      // Nâng điểm chất lượng nếu lần tương tác mới có điểm cao hơn
      if (scoreResult.score > (existing.leadScore || 0)) {
        existing.leadScore = scoreResult.score;
        existing.leadTier = scoreResult.tier;
        existing.leadTierLabel = scoreResult.tierLabel;
        existing.scoreBreakdown = scoreResult.breakdown;
        existing.nextAction = scoreResult.nextAction;
        isUpdated = true;
      }

      // Ghi thêm tương tác vào timeline
      if (!Array.isArray(existing.interactionTimeline)) {
        existing.interactionTimeline = [];
      }
      existing.interactionTimeline.push({
        timestamp: now,
        type: 'CROSS_CHANNEL_INTERACTION',
        postUrl,
        groupName,
        campaignId,
        content: text.substring(0, 150)
      });

      existing.updatedAt = now;
      this._save();

      auditLogger.log({
        actor: 'LeadResolutionService',
        action: 'MERGE_LEAD',
        module: 'LEAD_CRM',
        target: existing.posterName || existing.phone,
        status: 'INFO',
        details: { leadId: existing.id, phone, updatedFields: isUpdated }
      });

      return {
        isIngested: true,
        isMerged: true,
        leadId: existing.id,
        lead: existing,
        scoreResult
      };
    }

    // TẠO MỚI BẢN GHI LEAD
    const newLead = {
      id: `lead_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      industry,
      posterName: author,
      authorUrl,
      postUrl,
      groupName,
      groupUrl,
      campaignId,
      phone: phone || null,
      email: email || null,
      address: location || null,
      salary: price || null,
      intent,
      originalText: text,
      status: 'NEW',
      statusLabel: 'Mới thu thập',
      leadScore: scoreResult.score,
      leadTier: scoreResult.tier,
      leadTierLabel: scoreResult.tierLabel,
      scoreBreakdown: scoreResult.breakdown,
      nextAction: scoreResult.nextAction,
      interactionTimeline: [
        {
          timestamp: now,
          type: 'INITIAL_INGESTION',
          postUrl,
          groupName,
          campaignId,
          content: text.substring(0, 150)
        }
      ],
      createdAt: now,
      updatedAt: now
    };

    this.leads.unshift(newLead);
    this._save();

    auditLogger.log({
      actor: 'LeadResolutionService',
      action: 'INGEST_NEW_LEAD',
      module: 'LEAD_CRM',
      target: newLead.posterName,
      status: 'SUCCESS',
      details: { leadId: newLead.id, phone, tier: newLead.leadTier, score: newLead.leadScore }
    });

    return {
      isIngested: true,
      isMerged: false,
      leadId: newLead.id,
      lead: newLead,
      scoreResult
    };
  }
}

module.exports = new LeadResolutionService();
