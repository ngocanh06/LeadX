/**
 * fanpageBroadcastService.js - Phát Sóng Đa Fanpage & Biến Thể Nội Dung Tự Động (Multi-Page Broadcast)
 * Tuân thủ Section 11 Master Prompt:
 * - Quy trình: 1 Content -> Multiple Fanpages -> Content Variation -> Schedule -> Queue -> Publish
 * - Tự động tạo biến thể theo địa bàn từng Fanpage (Tên tỉnh/thành, hashtag địa phương, thông điệp điều chỉnh)
 * - Tích hợp chặt chẽ với postingQueueService và accountPoolManager
 */
const fanpageManager = require('./fanpageManager');
const postingQueueService = require('../../../core/services/postingQueueService');
const auditLogger = require('../../../core/services/auditLogger');
const logger = require('../../../core/utils/logger');

class FanpageBroadcastService {
  /**
   * Tạo chiến dịch phát sóng bài viết đa Fanpage kèm biến thể tự động
   * @param {Object} params
   * @param {string} params.title - Tiêu đề thông điệp chính
   * @param {string} params.baseContent - Nội dung gốc
   * @param {Array<string>} [params.fanpageIds] - Danh sách ID fanpage mục tiêu (nếu rỗng thì chọn toàn bộ 34 Fanpage)
   * @param {Array<string>} [params.images] - Hình ảnh đính kèm
   * @param {string} [params.accountPoolId='pool_recruitment'] - Pool nick phát bài
   * @param {number} [params.intervalMinutes=10] - Khoảng cách giãn cách an toàn giữa các Fanpage
   * @param {string} [params.campaignId=null] - Gắn ID chiến dịch
   */
  broadcastToPages({
    title = '',
    baseContent,
    fanpageIds = [],
    images = [],
    accountPoolId = 'pool_recruitment',
    intervalMinutes = 8,
    campaignId = null
  }) {
    if (!baseContent || !baseContent.trim()) {
      throw new Error('Nội dung phát sóng không được để trống.');
    }

    const allPages = fanpageManager.getPages() || [];
    let targetPages = [];

    if (Array.isArray(fanpageIds) && fanpageIds.length > 0) {
      targetPages = allPages.filter(p => fanpageIds.includes(p.id) || fanpageIds.includes(p.province));
    } else {
      targetPages = allPages; // Mặc định phát sóng toàn bộ 34 Fanpage
    }

    if (targetPages.length === 0) {
      throw new Error('Không tìm thấy Fanpage hợp lệ để phát sóng.');
    }

    const now = new Date();
    const broadcastId = `bcast_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
    const enqueuedJobs = [];

    targetPages.forEach((page, idx) => {
      // 1. Tạo biến thể nội dung cho từng Fanpage
      const variationContent = this._generatePageVariation(baseContent, page, title);

      // 2. Tính thời điểm phát dãn cách an toàn (tránh đồng loạt một giây)
      const delayMs = idx * intervalMinutes * 60 * 1000;
      const scheduledTime = new Date(now.getTime() + delayMs).toISOString();

      // 3. Đưa vào Unified Posting Queue
      const job = postingQueueService.addJob({
        content: variationContent,
        targetType: 'PAGE',
        targetId: page.id,
        targetName: page.name,
        targetUrl: page.url || page.link || '',
        accountPoolId,
        campaignId: campaignId || broadcastId,
        industry: 'recruitment',
        images: Array.isArray(images) ? images : [],
        scheduledAt: scheduledTime,
        priority: 2, // Broadcast được ưu tiên phát sóng
        jobInfo: {
          broadcastId,
          province: page.province,
          title: title || `Tuyển Dụng ${page.province}`
        }
      });

      enqueuedJobs.push(job);
    });

    auditLogger.log({
      actor: 'FanpageBroadcast',
      action: 'CREATE_FANPAGE_BROADCAST',
      module: 'FANPAGE_CENTER',
      target: `${targetPages.length} Fanpages`,
      status: 'SUCCESS',
      details: {
        broadcastId,
        totalPages: targetPages.length,
        intervalMinutes,
        firstPostAt: enqueuedJobs[0]?.scheduledAt,
        lastPostAt: enqueuedJobs[enqueuedJobs.length - 1]?.scheduledAt
      }
    });

    logger.info(`[BROADCAST] Đã lên lịch phát sóng thành công ${enqueuedJobs.length} bài đăng lên Hệ thống Fanpage (Broadcast ID: ${broadcastId})`);

    return {
      broadcastId,
      totalPages: targetPages.length,
      intervalMinutes,
      firstScheduledAt: enqueuedJobs[0]?.scheduledAt,
      lastScheduledAt: enqueuedJobs[enqueuedJobs.length - 1]?.scheduledAt,
      jobs: enqueuedJobs
    };
  }

  /**
   * Tạo biến thể nội dung tự nhiên cho từng Fanpage địa phương
   */
  _generatePageVariation(baseContent, page, title) {
    const province = page.province || 'Khu vực';
    const pageName = page.name || 'Fanpage Việc Làm';

    // Thêm câu chào và tiêu đề theo tỉnh thành
    const headerVariant = `【TUYỂN DỤNG TẠI ${province.toUpperCase()}】\n${title ? `🔥 ${title.toUpperCase()}\n` : ''}`;

    // Thêm thông tin liên hệ và hashtag bản địa hóa
    const cleanProvinceTag = province.replace(/\s+/g, '');
    const footerVariant = `\n\n━━━━━━━━━━━━━━━━━━━━\n📍 Khu vực làm việc: ${province}\n🌐 Theo dõi thêm việc làm mới tại: ${pageName}\n#ViecLam${cleanProvinceTag} #TuyenDung${cleanProvinceTag} #TimViecNhanh #LeadX`;

    return `${headerVariant}\n${baseContent.trim()}\n${footerVariant}`;
  }

  /**
   * Lấy danh sách Fanpage sẵn sàng phát sóng
   */
  getAvailableFanpages() {
    return (fanpageManager.getPages() || []).map(p => ({
      id: p.id,
      name: p.name,
      url: p.url || p.link || '',
      province: p.province,
      assignedAccount: p.assignedAccount || 'Auto',
      status: p.status || 'READY'
    }));
  }
}

module.exports = new FanpageBroadcastService();
