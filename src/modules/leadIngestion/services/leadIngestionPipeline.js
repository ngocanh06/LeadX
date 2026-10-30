/**
 * leadIngestionPipeline.js - Master Orchestrator Điều Phối Toàn Bộ Pipeline
 * -------------------------------------------------------------------------
 * Kiến trúc chuẩn Production theo Section 2, 5, 20 & 39 Master Prompt:
 *
 *   SOURCE
 *     ↓
 *   CONNECTOR (ConnectorFactory -> FacebookGroupConnector)
 *     ↓
 *   INGESTION QUEUE (IngestionJobQueue)
 *     ↓
 *   RAW POSTS (RawPostRepository with SHA-256 hash dedup)
 *     ↓
 *   NORMALIZER (PostNormalizer -> NormalizedPost)
 *     ↓
 *   NLP EXTRACTION (LeadExtractionEngine -> LeadCandidate)
 *     ↓
 *   DEDUPLICATION (LeadDeduplicationEngine -> Multi-field & Entity Resolution)
 *     ↓
 *   LEAD SCORE (LeadScoringService -> 0-100 with breakdown explanation)
 *     ↓
 *   QUALITY / REVIEW (ReviewQueueService if low confidence / ambiguous)
 *     ↓
 *   LEAD DATABASE (leadCrmManager -> data/leads_crm.json)
 *     ↓
 *   CRM / SALES WORKSPACE
 */
const logger = require('../../../core/utils/logger');
const auditLogger = require('../../../core/services/auditLogger');
const ConnectorFactory = require('../connectors/ConnectorFactory');
const leadSourceManager = require('./leadSourceManager');
const rawPostRepository = require('./rawPostRepository');
const postNormalizer = require('./postNormalizer');
const leadExtractionEngine = require('./leadExtractionEngine');
const leadDeduplicationEngine = require('./leadDeduplicationEngine');
const leadScoringService = require('./leadScoringService');
const reviewQueueService = require('./reviewQueueService');
const ingestionJobQueue = require('./ingestionJobQueue');
const leadCrmManager = require('../../../core/services/leadCrmManager');

class LeadIngestionPipeline {
  constructor() {
    this.isSyncing = false;
  }

  /**
   * Đồng bộ một nguồn cụ thể
   * @param {string} sourceId
   * @param {Object} options
   */
  async syncSource(sourceId, options = {}) {
    const source = leadSourceManager.getById(sourceId);
    if (!source) {
      throw new Error(`Không tìm thấy nguồn dữ liệu với ID: ${sourceId}`);
    }

    if (source.status === 'PAUSED') {
      throw new Error(`Nguồn "${source.name}" đang ở trạng thái TẠM DỪNG (PAUSED). Vui lòng tiếp tục nguồn trước khi đồng bộ.`);
    }

    const startedAt = new Date().toISOString();
    const job = ingestionJobQueue.createJob({
      sourceId,
      jobType: 'INGEST_SOURCE',
      payload: { options }
    });

    ingestionJobQueue.updateJob(job.id, { status: 'RUNNING', started_at: startedAt });

    let postsFound = 0;
    let postsNew = 0;
    let postsDuplicate = 0;
    let leadsCreated = 0;
    let leadsDuplicate = 0;
    let leadsReview = 0;
    let errors = [];
    let totalScoreSum = 0;

    try {
      logger.info(`[Pipeline] Bắt đầu đồng bộ Nguồn: ${source.name} (${source.id})`);

      // 1. Khởi tạo Connector tương ứng
      const connector = ConnectorFactory.create(source);
      await connector.connect();

      // 2. Thu thập bài đăng (Fetch Posts)
      const fetchResult = await connector.fetchPosts({
        since: source.last_sync_at,
        lastExternalPostId: source.last_external_post_id,
        limit: options.limit || 100,
        isInitialSync: !source.last_sync_at
      });

      if (fetchResult.unsupportedOperation) {
        errors.push(fetchResult.error || 'UNSUPPORTED_SOURCE_OPERATION');
        leadSourceManager.recordSyncError(sourceId, fetchResult.error);
        ingestionJobQueue.updateJob(job.id, {
          status: 'FAILED',
          failed_at: new Date().toISOString(),
          error_message: fetchResult.error
        });
        return {
          success: false,
          code: 'UNSUPPORTED_SOURCE_OPERATION',
          message: fetchResult.error,
          stats: { postsFound: 0, postsNew: 0, leadsCreated: 0 }
        };
      }

      const fetchedPosts = fetchResult.posts || [];
      postsFound = fetchedPosts.length;

      // 3. Xử lý từng bài qua Pipeline
      for (const raw of fetchedPosts) {
        try {
          // A. Lưu trữ Raw Post & kiểm tra hash trùng lặp
          const rawSaveResult = rawPostRepository.saveRawPost({
            ...raw,
            source_id: source.id,
            source_group: source.group_name
          });

          if (rawSaveResult.isDuplicate) {
            postsDuplicate++;
            continue;
          }
          postsNew++;

          // B. Chuẩn hóa bài đăng (Normalization)
          const normalized = postNormalizer.normalize(raw, source);

          // C. Bóc tách & phân loại ý định (NLP / Regex Extraction)
          const candidate = leadExtractionEngine.extract(normalized);

          // Lọc bỏ bài tìm việc, rác quảng cáo
          if (candidate.lead_intent === 'JOB_SEEKER' || candidate.lead_intent === 'ADVERTISEMENT' || candidate.lead_intent === 'IRRELEVANT') {
            continue;
          }

          // D. Chấm điểm chất lượng Lead (Scoring Engine 0-100)
          const scoreResult = leadScoringService.calculateScore(candidate);
          candidate.lead_score = scoreResult.score;
          candidate.lead_tier = scoreResult.tier;
          candidate.score_breakdown = scoreResult.score_breakdown;
          candidate.score_explanation = scoreResult.reasons;

          totalScoreSum += scoreResult.score;

          // E. Kiểm tra trùng lặp & phân giải danh tính (Deduplication)
          const dedupResult = leadDeduplicationEngine.checkDuplicate(candidate, leadCrmManager.leads);

          if (dedupResult.isDuplicate) {
            leadsDuplicate++;
            // Nếu phát hiện bài mới từ cùng công ty/SĐT -> cập nhật timeline của Lead gốc
            const existing = dedupResult.existingLead;
            if (existing && Array.isArray(existing.activities)) {
              existing.activities.push({
                id: `act_${Date.now().toString(36)}`,
                timestamp: new Date().toISOString(),
                user: 'Hệ thống Ingestion',
                action: 'CROSS_POST_DETECTED',
                actionName: 'Phát hiện bài đăng mới cùng nguồn/SĐT',
                notes: `Bài viết mới: "${candidate.job_title}" tại nhóm "${source.group_name}"`,
                icon: 'fa-solid fa-copy',
                color: '#EA580C'
              });
              existing.updatedAt = new Date().toISOString();
            }
            continue;
          }

          // F. Kiểm tra Chất lượng & Phê duyệt (Quality Control)
          if (dedupResult.resolutionConfidence === 'LOW' || candidate.confidence < 0.6) {
            reviewQueueService.enqueue(candidate, {
              reason: dedupResult.resolutionReason || 'LOW_CONFIDENCE',
              confidence: candidate.confidence,
              potentialDuplicate: dedupResult.potentialDuplicate
            });
            leadsReview++;
            continue;
          }

          // G. Nhập Lead vào cơ sở dữ liệu Lead CRM chính thức
          // Chỉ tiếp nhận các Lead có SĐT để Sales có thể liên hệ
          if (candidate.contact_phone && candidate.contact_phone.length >= 9) {
            const nowStr = new Date().toISOString();
            const newLeadRecord = {
              id: `lead_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
              sourceJobId: raw.id || candidate.source_post_url || '',
              posterName: candidate.author_name || 'Nhà tuyển dụng',
              authorUrl: candidate.author_url || '',
              authorExternalId: candidate.author_external_id || null,
              groupName: source.group_name || candidate.source_group || 'Hội nhóm Facebook',
              groupUrl: source.group_url || '',
              postUrl: candidate.source_post_url || '#',
              originalText: candidate.original_content || '',
              postedAt: candidate.created_at || nowStr,
              phone: candidate.contact_phone,
              email: candidate.contact_email || null,
              employerName: candidate.company_name || 'Cơ sở tuyển dụng',
              shopName: candidate.company_name || 'Cơ sở tuyển dụng',
              address: candidate.location || 'Chưa rõ địa chỉ',
              jobTitle: candidate.job_title || 'Nhân viên',
              demandType: candidate.is_recruitment_service_need ? 'Cần Dịch Vụ Tuyển Dụng Gấp' : 'Tuyển dụng trực tiếp',
              quantity: candidate.recruitment_need || 1,
              salary: candidate.salary_text || 'Thỏa thuận',
              isManuallyEdited: false,
              status: 'NEW',
              statusLabel: 'Mới thu thập',
              leadScore: scoreResult.score,
              leadTier: scoreResult.tier,
              leadTierLabel: scoreResult.tierLabel,
              scoreBreakdown: scoreResult.reasons,
              scoreFactors: scoreResult.score_breakdown,
              assignedStaff: 'Quản trị viên',
              contactChannel: candidate.contact_channel || 'Phone',
              exploitationGoal: candidate.is_recruitment_service_need ? 'Tư vấn dịch vụ tuyển dụng' : 'Giới thiệu ứng viên',
              lastContactedAt: null,
              notes: candidate.is_recruitment_service_need ? '🔥 Có tín hiệu cần agency/hỗ trợ tuyển dụng số lượng lớn' : '',
              nextFollowUpAt: null,
              followUpTime: '',
              followUpNote: '',
              followUpStatus: 'NONE',
              crmCustomerId: null,
              isConverted: false,
              duplicateCandidates: [],
              activities: [
                {
                  id: `act_${Date.now().toString(36)}_init`,
                  timestamp: nowStr,
                  user: 'Production Lead Ingestion',
                  action: 'INGESTED',
                  actionName: 'Thu thập & bóc tách tự động',
                  notes: `Đồng bộ từ nguồn "${source.name}" - Điểm chất lượng: ${scoreResult.score}/100 (${scoreResult.tierLabel})`,
                  icon: 'fa-solid fa-bolt',
                  color: '#2563EB'
                }
              ],
              createdAt: nowStr,
              updatedAt: nowStr
            };

            leadCrmManager.leads.unshift(newLeadRecord);
            leadsCreated++;
          }
        } catch (itemErr) {
          logger.warn(`[Pipeline] Lỗi xử lý item từ ${source.name}: ${itemErr.message}`);
          errors.push(itemErr.message);
        }
      }

      // Lưu cập nhật leads_crm.json
      if (leadsCreated > 0) {
        leadCrmManager._save();
      }

      // Ghi nhận trạng thái hoàn thành nguồn
      const avgScore = leadsCreated > 0 ? Math.round(totalScoreSum / (leadsCreated + leadsDuplicate)) : 0;
      leadSourceManager.recordSyncSuccess(source.id, {
        postsCount: postsNew,
        leadsCount: leadsCreated,
        avgScore
      });

      // Ghi nhận Sync Log
      const finishedAt = new Date().toISOString();
      const log = ingestionJobQueue.recordSyncLog({
        sourceId: source.id,
        sourceName: source.name,
        startedAt,
        finishedAt,
        status: errors.length > 0 ? (leadsCreated > 0 ? 'PARTIAL' : 'ERROR') : 'SUCCESS',
        postsFound,
        postsNew,
        postsDuplicate,
        leadsCreated,
        leadsDuplicate,
        errors
      });

      // Cập nhật Job
      ingestionJobQueue.updateJob(job.id, {
        status: 'SUCCESS',
        completed_at: finishedAt,
        result: { postsFound, postsNew, leadsCreated, leadsDuplicate, leadsReview }
      });

      auditLogger.log({
        actor: 'LeadIngestionPipeline',
        action: 'SYNC_SOURCE_SUCCESS',
        module: 'LEAD_INGESTION',
        target: source.name,
        status: 'SUCCESS',
        details: { postsFound, postsNew, leadsCreated, leadsDuplicate }
      });

      return {
        success: true,
        sourceName: source.name,
        stats: {
          postsFound,
          postsNew,
          postsDuplicate,
          leadsCreated,
          leadsDuplicate,
          leadsReview,
          errorsCount: errors.length
        }
      };
    } catch (err) {
      logger.error(`[Pipeline Error] Đồng bộ nguồn ${source.name} thất bại: ${err.message}`);
      leadSourceManager.recordSyncError(source.id, err.message);

      ingestionJobQueue.updateJob(job.id, {
        status: 'FAILED',
        failed_at: new Date().toISOString(),
        error_message: err.message
      });

      ingestionJobQueue.recordSyncLog({
        sourceId: source.id,
        sourceName: source.name,
        startedAt,
        finishedAt: new Date().toISOString(),
        status: 'ERROR',
        postsFound,
        postsNew,
        postsDuplicate,
        leadsCreated,
        leadsDuplicate,
        errors: [err.message]
      });

      throw err;
    }
  }

  /**
   * Đồng bộ tất cả các nguồn đang ACTIVE
   */
  async syncAllSources(options = {}) {
    if (this.isSyncing) {
      return {
        success: false,
        message: 'Tiến trình đồng bộ đang được thực thi trong nền. Vui lòng đợi trong giây lát...'
      };
    }

    this.isSyncing = true;
    const sources = leadSourceManager.getAll().filter(s => s.status === 'ACTIVE');
    const results = [];

    try {
      logger.info(`[Pipeline] Bắt đầu đồng bộ hàng loạt cho ${sources.length} nguồn dữ liệu.`);
      for (const source of sources) {
        try {
          const res = await this.syncSource(source.id, options);
          results.push(res);
        } catch (err) {
          results.push({
            success: false,
            sourceName: source.name,
            error: err.message
          });
        }
      }
      return {
        success: true,
        totalSources: sources.length,
        results
      };
    } finally {
      this.isSyncing = false;
    }
  }

  /**
   * Thống kê toàn diện về hoạt động của Ingestion Pipeline
   */
  getPipelineOverview() {
    const sources = leadSourceManager.getAll();
    const activeSources = sources.filter(s => s.status === 'ACTIVE').length;
    const errorSources = sources.filter(s => s.status === 'ERROR' || s.connection_status === 'ERROR').length;
    const rawPostsCount = rawPostRepository.count();
    const queueStats = ingestionJobQueue.getStats();
    const reviewPendingCount = reviewQueueService.countPending();

    const leads = leadCrmManager.leads;
    const totalLeads = leads.length;
    const newLeads = leads.filter(l => l.status === 'NEW').length;
    const qualifiedLeads = leads.filter(l => l.status === 'QUALIFIED' || l.status === 'VERIFIED').length;
    const hotLeads = leads.filter(l => l.leadTier === 'HOT' || l.leadScore >= 75).length;
    const convertedLeads = leads.filter(l => l.isConverted || l.status === 'CONVERTED').length;

    return {
      sources: {
        total: sources.length,
        active: activeSources,
        error: errorSources
      },
      posts: {
        rawCollected: rawPostsCount,
        recent: rawPostRepository.getRecent(10)
      },
      leads: {
        total: totalLeads,
        newCount: newLeads,
        qualifiedCount: qualifiedLeads,
        hotCount: hotLeads,
        convertedCount: convertedLeads,
        conversionRate: totalLeads > 0 ? Math.round((convertedLeads / totalLeads) * 100) : 0
      },
      reviewQueue: {
        pendingCount: reviewPendingCount
      },
      jobs: queueStats,
      recentSyncLogs: ingestionJobQueue.getLogs(10)
    };
  }
}

module.exports = new LeadIngestionPipeline();
