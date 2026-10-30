/**
 * autoPilotEngine.js - Engine Tự động hóa đăng bài 34 Fanpage Tỉnh Thành (2 bài/ngày/page)
 */
const scraperDataProvider = require('./scraperDataProvider');
const fanpageManager = require('./fanpageManager');
const { getJobsForPage, findAllMatchingPages, PROVINCE_MAPPING } = require('./locationMatcher');
const metaApiClient = require('../../../core/services/metaApiClient');
const historyManager = require('../../../core/services/historyManager');
const logger = require('../../../core/utils/logger');
const { cleanJobTitle, fixSpellingAndSpacing, shortenSalary, cleanCompanyName, cleanJobDescription, cleanJobRequirements, cleanJobBenefits, cleanJobLocations, toCleanHashtag } = require('../../../core/utils/textCleaner');
const bannerGenerator = require('./bannerGeneratorService');

class AutoPilotEngine {
  constructor() {
    this.currentPlan = null;
    this.isRunning = false;
    this.isPaused = false;
    this.currentCampaign = null;
    this.logs = [];
  }

  _log(msg, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    const logItem = { timestamp, message: msg, type };
    this.logs.push(logItem);
    if (this.logs.length > 500) this.logs.shift();

    if (type === 'error') logger.error(`[FanpageController] ${msg}`);
    else if (type === 'success') logger.success(`[FanpageController] ${msg}`);
    else logger.info(`[FanpageController] ${msg}`);
  }

  getLogs() {
    return this.logs;
  }

  clearLogs() {
    this.logs = [];
    return { success: true, message: 'Đã xóa nhật ký Fanpage Terminal' };
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentCampaign: this.currentCampaign
    };
  }

  pauseCampaign() {
    if (!this.isRunning) return { success: false, message: 'Không có chiến dịch nào đang chạy' };
    this.isPaused = true;
    this._log('⏸ [TẠM DỪNG] Đã tạm dừng tiến trình xuất bản Fanpage.', 'warn');
    return { success: true, message: 'Đã tạm dừng chiến dịch đăng bài Fanpage' };
  }

  resumeCampaign() {
    if (!this.isRunning) return { success: false, message: 'Không có chiến dịch nào đang chạy' };
    this.isPaused = false;
    this._log('▶️ [TIẾP TỤC] Khôi phục tiến trình xuất bản Fanpage...', 'info');
    return { success: true, message: 'Đã tiếp tục chiến dịch đăng bài Fanpage' };
  }

  stopCampaign() {
    if (!this.isRunning) return { success: false, message: 'Không có chiến dịch nào đang chạy' };
    this.isRunning = false;
    this.isPaused = false;
    this._log('⏹ [DỪNG HẲN] Đã hủy toàn bộ tiến trình xuất bản Fanpage.', 'error');
    if (this.currentCampaign) {
      this.currentCampaign.currentStatusText = 'Đã dừng chiến dịch theo yêu cầu';
    }
    return { success: true, message: 'Đã dừng hẳn chiến dịch đăng bài Fanpage' };
  }

  formatCleanPost(job, pageInfo = {}) {
    const sections = [];

    // 1. Tiêu đề: [TUYỂN DỤNG] TÊN VỊ TRÍ
    const rawTitle = job.title || job.cong_viec || 'Tuyển Dụng';
    const cleanTitle = cleanJobTitle ? cleanJobTitle(rawTitle).toUpperCase() : rawTitle.toUpperCase();
    sections.push(`[TUYỂN DỤNG] ${cleanTitle}`);

    // 2. Thông tin tổng quan (Công ty, Lương, Số lượng, Hình thức)
    const headerInfo = [];
    const rawComp = job.company || job.doanh_nghiep;
    if (rawComp && !['doanh nghiệp', 'khách hàng', 'chưa cập nhật', ''].includes(String(rawComp).toLowerCase().trim())) {
      const cleanComp = cleanCompanyName ? cleanCompanyName(rawComp) : rawComp;
      headerInfo.push(`🏢 Doanh nghiệp: ${cleanComp}`);
    }

    const rawSal = job.salary || job.muc_luong;
    if (rawSal && !['không đề cập', 'không rõ', ''].includes(String(rawSal).toLowerCase().trim())) {
      const cleanSal = shortenSalary ? shortenSalary(rawSal) : rawSal;
      headerInfo.push(`💰 Mức lương: ${cleanSal}`);
    } else {
      headerInfo.push(`💰 Mức lương: Thỏa thuận theo năng lực`);
    }

    const sl = job.so_luong || job.quantity;
    if (sl && !['không đề cập', 'không yêu cầu', ''].includes(String(sl).toLowerCase().trim())) {
      const slStr = String(sl).trim();
      headerInfo.push(`👥 Số lượng: ${slStr.toLowerCase().includes('người') ? slStr : slStr + ' người'}`);
    }

    const jobType = job.jobType || job.workingTime || job.loai_hinh_cong_viec || 'Toàn thời gian';
    headerInfo.push(`⏰ Hình thức: ${jobType}`);

    sections.push(headerInfo.join('\n'));

    // Tách mô tả và yêu cầu từ description nếu scraper gộp chung
    let descRaw = (job.description || '').trim();
    let reqRaw = (job.requirements || '').trim();
    if (descRaw.includes(' | YÊU CẦU:')) {
      const parts = descRaw.split(' | YÊU CẦU:');
      descRaw = parts[0].trim();
      if (!reqRaw) reqRaw = parts.slice(1).join(' | YÊU CẦU:').trim();
    } else if (descRaw.includes(' | YÊU CẦU ỨNG VIÊN:')) {
      const parts = descRaw.split(' | YÊU CẦU ỨNG VIÊN:');
      descRaw = parts[0].trim();
      if (!reqRaw) reqRaw = parts.slice(1).join(' | YÊU CẦU ỨNG VIÊN:').trim();
    }

    // Helper chuẩn hóa các gạch đầu dòng súc tích, ngắn gọn, đầy đủ ý (tối đa 4 ý chính)
    function formatBullets(rawText, maxItems = 4) {
      if (!rawText) return [];
      let text = String(rawText);
      if (typeof fixSpellingAndSpacing === 'function') {
        text = fixSpellingAndSpacing(text);
      }

      // 1. Sửa từ bị gãy dấu gạch ngang giữa chừng: 'tài -chính' -> 'tài chính'
      text = text.replace(/(\p{L}+)\s+[-–—]\s*(\p{L}+)/gu, '$1 $2');
      text = text.replace(/(\p{L}+)[-–—]\s+(\p{L}+)/gu, '$1 $2');

      // 2. Nối lại các dòng bị xuống dòng giữa chừng từ scraper
      text = text.replace(/([^\n.!?])\n(?=[a-zà-ỹ0-9])/gu, '$1 ');

      // 3. Bảo vệ các khoảng số, mức lương, thời gian (7 - 12 triệu, 4 - 8 tiếng) bằng en-dash
      text = text.replace(/(\d+(?:[.,]\d+)?\s*(?:k|tr|triệu|tháng|tiếng|giờ)?)\s*[-–]\s*(\d+)/gi, '$1 – $2');

      // 4. Tách các gạch nối dính chùm giữa các câu / đầu việc: 'điện thoại-Chào đón' -> 'điện thoại\n- Chào đón'
      text = text.replace(/([^\s\d–—])\s*[-–—]\s*(?=[A-ZĐÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ])/gu, '$1\n- ');

      // 5. Tách các ký tự phân cách: '=>', '->', '•', '*', ';' (giữ lại dấu '+' cho phụ cấp/lương)
      text = text.replace(/\s*(?:=>|->)\s*/g, '\n- ');
      text = text.replace(/[•*]\s*/g, '\n- ');
      text = text.replace(/;\s*[-–•*]\s*/g, '\n- ');
      text = text.replace(/;\s*/g, '\n- ');
      text = text.replace(/(\d+)\.\s+/g, '\n- ');

      // 6. Tách các câu có động từ đầu việc hoặc quyền lợi viết hoa đứng sau chữ thường
      text = text.replace(/(?<=\p{Ll})\s+(?=(?:Thực hiện|Sắp xếp|Thu ngân|Tư vấn|Hỗ trợ|Kiểm tra|Quản lý|Chăm sóc|Đóng gói|Bán hàng|Vận hành|Phối hợp|Báo cáo|Hướng dẫn|Tiếp nhận|Chào đón|Giới thiệu|Cập nhật|Thử việc|Tham gia|Được hưởng|Hưởng|Nhận|Chế độ|Thưởng)\b)/gu, '\n- ');

      const rawLines = text.split('\n')
        .map(l => l.trim())
        .filter(Boolean)
        .map(l => l.replace(/^(?:[-*•+–=>]+|\d+[\.\)]|\([0-9a-zA-Z]\))\s*/, '').trim())
        .filter(l => l.length > 5 && !/^(mô tả|yêu cầu|quyền lợi|nhiệm vụ|kỹ năng|chế độ):?$/i.test(l));

      const unique = [];
      for (let l of rawLines) {
        l = l.replace(/^[-–—:\s]+/, '').trim();
        if (l) l = l.charAt(0).toUpperCase() + l.slice(1);

        // Rút gọn câu quá lê thê nếu có nhiều mệnh đề
        if (l.length > 130) {
          const parts = l.split(/[,;]/);
          if (parts[0] && parts[0].length >= 35) {
            l = parts[0].trim();
          }
        }

        if (!unique.some(u => u.toLowerCase() === l.toLowerCase())) {
          unique.push(l);
        }
      }

      return unique.slice(0, maxItems).map(it => `- ${it}`);
    }

    // 3. Mô tả công việc (Rút gọn 3-4 ý chính đắt giá nhất)
    const descBullets = formatBullets(descRaw, 4);
    if (descBullets.length > 0) {
      sections.push(`📋 MÔ TẢ CÔNG VIỆC:\n${descBullets.join('\n')}`);
    }

    // 4. Yêu cầu ứng viên (3-4 tiêu chí cốt lõi, không trùng lặp)
    const reqBullets = [];
    if (job.experience && !['không đề cập', 'không yêu cầu', ''].includes(String(job.experience).toLowerCase().trim())) {
      reqBullets.push(`- Kinh nghiệm: ${job.experience}`);
    }
    const extractedReqs = formatBullets(reqRaw, 4);
    extractedReqs.forEach(r => reqBullets.push(r));
    if (reqBullets.length === 0 && job.ky_nang && !['không đề cập', 'không yêu cầu', ''].includes(String(job.ky_nang).toLowerCase().trim())) {
      let kn = String(job.ky_nang).trim();
      const knItems = kn.split(',').map(x => x.trim()).filter(Boolean);
      reqBullets.push(`- Kỹ năng yêu cầu: ${knItems.slice(0, 3).join(', ')}`);
    }
    if (reqBullets.length > 0) {
      sections.push(`🎯 YÊU CẦU ỨNG VIÊN:\n${reqBullets.slice(0, 4).join('\n')}`);
    }

    // 5. Quyền lợi & phúc lợi (3-4 quyền lợi nổi bật nhất)
    const benefitBullets = formatBullets(job.benefits || '', 4);
    if (benefitBullets.length > 0) {
      sections.push(`🎁 QUYỀN LỢI & PHÚC LỢI:\n${benefitBullets.join('\n')}`);
    }

    // 6. Địa điểm làm việc (Luôn có fallback rõ ràng, không bao giờ để trống tiêu đề)
    const targetProv = pageInfo.province || pageInfo.name || job.location || job.tinh_thanh || '';
    let cleanLoc = cleanJobLocations(job.detailedLocation || job.dia_diem_chi_tiet, job.location || job.tinh_thanh, targetProv);
    if (!cleanLoc || cleanLoc.trim() === '' || cleanLoc.trim() === '-') {
      cleanLoc = targetProv ? `- Khu vực ${targetProv} (Phỏng vấn & phân bổ chi nhánh gần nhất)` : '- Phỏng vấn & làm việc tại hệ thống chi nhánh';
    }
    sections.push(`📍 ĐỊA ĐIỂM LÀM VIỆC:\n${cleanLoc}`);

    // 7. Kêu gọi hành động & Hashtags & Link
    function toTag(str) {
      if (!str) return '';
      return str.normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd').replace(/Đ/g, 'D')
        .replace(/[^a-zA-Z0-9]/g, '');
    }

    let provTag = toTag(pageInfo.province || job.location || 'HoChiMinh');
    provTag = provTag.replace(/^(TP|ThanhPho|Tinh)/i, '');
    if (!provTag) provTag = 'HoChiMinh';
    let compTag = toTag(job.company || '').toUpperCase();
    if (compTag.length > 30) compTag = compTag.slice(0, 30);
    const compPart = compTag ? `#${compTag} ` : '';

    const bottomSection = [
      '👉 Bạn quan tâm vị trí này? Comment hoặc inbox để nhận thông tin chi tiết nhé!',
      `#ViecLam${provTag} ${compPart}#JobCentral`.trim(),
      '🔗 https://www.facebook.com/JobCentralVietNam/'
    ].join('\n');

    sections.push(bottomSection);

    return sections.join('\n\n');
  }

  generateDailyAutoPilotPlan(postsPerPage = 2) {
    const allJobs = scraperDataProvider.loadJobs();
    // 34 Fanpage tỉnh thành (loại trừ Page Tổng)
    const pages = fanpageManager.getPages().filter(p => !p.isMainHub && p.pageId !== 'PAGE_TONG_VIEC_LAM' && p.id !== 'JobCentralVietNam');

    logger.info(`[AutoPilot] Đang lập kế hoạch Auto-Pilot cho ${pages.length} Fanpage Tỉnh Thành (${postsPerPage} bài/trang)...`);

    // Phân loại đơn giản 1-pass O(N) cho toàn bộ 34 Fanpage để tối ưu hiệu năng tức thì (<1 giây)
    const jobsByPage = {};
    for (const page of pages) {
      const pId = String(page.id || page.pageId);
      const bucket = { active: [], all: [] };
      jobsByPage[pId] = bucket;
      if (page.legacyId) jobsByPage[String(page.legacyId)] = bucket;
      if (page.province) jobsByPage[page.province.toLowerCase()] = bucket;
    }

    for (const job of allJobs) {
      const matchedPages = findAllMatchingPages(job);
      for (const mp of matchedPages) {
        const bucket = jobsByPage[mp.pageId] || (mp.province ? jobsByPage[mp.province.toLowerCase()] : null);
        if (bucket) {
          bucket.all.push(job);
          if (!job.isExpired) {
            bucket.active.push(job);
          }
        }
      }
    }

    const plan = [];
    let fullCount = 0;
    let partialCount = 0;
    let noDataCount = 0;
    const usedJobIds = new Set(); // Bộ nhớ chống trùng lặp chéo giữa các Fanpage khác nhau

    for (const page of pages) {
      const pId = String(page.id || page.pageId);
      const bucket = jobsByPage[pId] || (page.legacyId ? jobsByPage[String(page.legacyId)] : null) || (page.province ? jobsByPage[page.province.toLowerCase()] : null) || { active: [], all: [] };
      const provinceJobs = bucket.all;
      const activeJobs = bucket.active;

      // Ưu tiên chọn các tin việc làm chưa bị các Fanpage khác lấy (Mỗi Fanpage một bộ tin độc nhất)
      let availableJobs = activeJobs.filter(j => !usedJobIds.has(j.id));
      if (availableJobs.length < postsPerPage) {
        availableJobs = availableJobs.concat(activeJobs.filter(j => !availableJobs.includes(j)));
      }
      const matchedJobs = availableJobs.slice(0, postsPerPage);
      matchedJobs.forEach(j => usedJobIds.add(j.id));

      let readinessStatus = 'FULL';
      let reason = 'Đủ điều kiện xuất bản 2 bài (Ca Sáng & Ca Chiều)';

      if (matchedJobs.length === 0) {
        readinessStatus = 'NO_DATA';
        noDataCount++;
        reason = provinceJobs.length === 0 
          ? 'Chưa có tin tuyển dụng nào của tỉnh này trong kho dữ liệu.' 
          : `Tất cả ${provinceJobs.length} tin của tỉnh này đều đã hết hạn hoặc không khả dụng.`;
      } else if (matchedJobs.length < postsPerPage) {
        readinessStatus = 'PARTIAL';
        partialCount++;
        reason = `Tìm được ${matchedJobs.length}/${postsPerPage} tin mới (thiếu 1 tin cho ca chiều).`;
      } else {
        fullCount++;
      }

      const pagePlan = {
        pageId: pId,
        pageName: page.name,
        province: page.province,
        region: page.region,
        readinessStatus,
        reason,
        matchedCount: matchedJobs.length,
        posts: []
      };

      matchedJobs.forEach((job, idx) => {
        const formatted = this.formatCleanPost(job, page);
        const posterInfo = bannerGenerator.computePosterInfo(job, { name: page.name, province: page.province });
        const dynamicPosterUrl = posterInfo.imageUrl;

        pagePlan.posts.push({
          slot: idx === 0 ? 'Ca Sáng (08:30)' : 'Ca Chiều (17:30)',
          jobId: job.id,
          jobTitle: job.title,
          company: job.company,
          location: job.location,
          deadline: job.deadlineFormatted || 'Đang tuyển',
          formattedContent: formatted,
          pageId: pId,
          pageName: page.name,
          province: page.province,
          job: job,
          posterUrl: dynamicPosterUrl,
          posterExists: posterInfo.exists,
          mediaUrls: [dynamicPosterUrl]
        });
      });

      plan.push(pagePlan);
    }

    const totalPosts = plan.reduce((acc, p) => acc + p.posts.length, 0);

    const result = {
      success: true,
      totalPages: plan.length,
      totalScheduledPosts: totalPosts,
      metrics: {
        totalProvinces: plan.length,
        fullCount,
        partialCount,
        noDataCount,
        readyProvincesRate: Math.round((fullCount / plan.length) * 100)
      },
      plan
    };

    this.currentPlan = result;
    return result;
  }

  /**
   * Tự động sinh hàng loạt Poster Tuyển Dụng cho toàn bộ các bài đăng trên 34 Fanpage
   * @param {Object} options - { plan, force, concurrency }
   */
  async generateAllPosters(options = {}) {
    const planResult = options.plan || this.currentPlan || this.generateDailyAutoPilotPlan(2);
    const plan = planResult.plan || [];

    const items = [];
    plan.forEach(p => {
      if (Array.isArray(p.posts)) {
        p.posts.forEach(post => {
          items.push({
            job: post.job || {
              title: post.jobTitle,
              company: post.company,
              location: post.location || p.province,
              salary: post.salary,
              category: post.category
            },
            pageInfo: {
              name: p.pageName,
              province: p.province
            },
            postRef: post
          });
        });
      }
    });

    logger.info(`[AutoPilot] Bắt đầu tự động tạo poster cho ${items.length} bài đăng trên ${plan.length} Fanpage tỉnh thành...`);

    const batchRes = await bannerGenerator.generateBatchJobPosters(items, {
      force: !!options.force,
      concurrency: options.concurrency || 4
    });

    // Cập nhật lại posterUrl & posterExists
    items.forEach((item, idx) => {
      const res = batchRes.results && batchRes.results[idx];
      if (res && res.success && res.imageUrl) {
        item.postRef.posterUrl = res.imageUrl;
        item.postRef.mediaUrls = [res.imageUrl];
        item.postRef.posterExists = true;
      }
    });

    logger.success(`[AutoPilot] Hoàn tất sinh Poster: ${batchRes.generated} tạo mới, ${batchRes.cached} từ cache, ${batchRes.failed} lỗi.`);

    return {
      success: true,
      total: items.length,
      generated: batchRes.generated,
      cached: batchRes.cached,
      failed: batchRes.failed,
      plan: planResult
    };
  }

  async launchAutoPilot(options = {}) {
    if (this.isRunning) {
      throw new Error('Hệ thống Auto-Pilot đang trong quá trình chạy một chiến dịch khác!');
    }

    this.isRunning = true;
    this.isPaused = false;
    this._log('🚀 [KHỞI TẠO] Bắt đầu kích hoạt chiến dịch xuất bản Fanpage...', 'info');

    try {
      const planResult = options.plan || this.currentPlan || this.generateDailyAutoPilotPlan(2);
      let plan = planResult.plan || [];

      // HỖ TRỢ TEST 1 PAGE: Lọc riêng page được chọn
      if (options.targetPageId) {
        plan = plan.filter(p => p.pageId === options.targetPageId);
        if (plan.length === 0) {
          throw new Error(`Không tìm thấy kế hoạch cho Fanpage ID: ${options.targetPageId}`);
        }
      }

      // HỖ TRỢ XUẤT BẢN THEO KHU VỰC MIỀN (Miền Nam / Miền Trung / Miền Bắc)
      if (options.targetRegion && options.targetRegion !== 'ALL') {
        const regionNorm = options.targetRegion.toLowerCase().replace(/[-_ ]/g, '');
        plan = plan.filter(p => {
          const pReg = (p.region || '').toLowerCase().replace(/[-_ ]/g, '');
          return pReg.includes(regionNorm) || regionNorm.includes(pReg);
        });
        if (plan.length === 0) {
          throw new Error(`Không tìm thấy Fanpage nào thuộc khu vực: ${options.targetRegion}`);
        }
      }

      let allPosts = [];
      if (options.singlePost) {
        allPosts = [options.singlePost];
      } else {
        // Tiền xử lý tạo toàn bộ Poster ảnh cho plan được chọn
        try {
          this._log('🎨 [POSTER BATCH] Đang đồng bộ và kiểm tra Poster cho toàn bộ kế hoạch...', 'info');
          await this.generateAllPosters({ plan: { plan } });
        } catch (err) {
          logger.warn(`[AutoPilot LAUNCH] Lỗi tiền xử lý poster: ${err.message}`);
        }
        plan.forEach(p => {
          if (Array.isArray(p.posts)) {
            p.posts.forEach(post => allPosts.push(post));
          }
        });
      }

      const campaignId = 'ap_' + Date.now();
      this.currentCampaign = {
        campaignId,
        totalPosts: allPosts.length,
        completed: 0,
        success: 0,
        failed: 0,
        currentPost: null,
        currentStatusText: `Bắt đầu xuất bản ${allPosts.length} bài đăng...`,
        startTime: Date.now()
      };

      this._log(`🎯 [KẾ HOẠCH] Đã chuẩn bị ${allPosts.length} bài đăng trên ${plan.length} Fanpage (${options.targetPageId ? 'CHẾ ĐỘ TEST 1 TRANG' : (options.targetRegion && options.targetRegion !== 'ALL' ? 'KHU VỰC ' + options.targetRegion.toUpperCase() : 'Toàn bộ hệ thống')}).`, 'info');

      const results = [];
      let successCount = 0;
      let failedCount = 0;

      for (let i = 0; i < allPosts.length; i++) {
        // 1. Kiểm tra tạm dừng / dừng hẳn
        while (this.isPaused && this.isRunning) {
          if (this.currentCampaign) {
            this.currentCampaign.currentStatusText = 'Chiến dịch đang tạm dừng... Bấm "Tiếp tục" để chạy tiếp.';
          }
          await new Promise(r => setTimeout(r, 1000));
        }

        if (!this.isRunning) {
          this._log('⏹ [DỪNG HẲN] Đã hủy tiến trình xuất bản Fanpage theo yêu cầu.', 'warn');
          break;
        }

        const p = allPosts[i];
        const progText = `[${i + 1}/${allPosts.length}]`;
        this.currentCampaign.currentPost = {
          pageName: p.pageName,
          pageId: p.pageId,
          jobTitle: p.jobTitle,
          slot: p.slot,
          company: p.company
        };
        this.currentCampaign.currentStatusText = `${progText} Đang đăng lên: ${p.pageName} (${p.jobTitle})`;

        this._log(`${progText} Đang kết nối Meta API đăng lên Fanpage: "${p.pageName}" - Vị trí: "${p.jobTitle}"...`, 'info');

        try {
          // Đảm bảo có poster ảnh trước khi đăng
          if (!p.mediaUrls || p.mediaUrls.length === 0 || p.mediaUrls[0].includes('TUY___N_D___NG') || p.mediaUrls[0].includes('fallback')) {
            try {
              const jobData = p.job || {
                title: p.jobTitle,
                company: p.company,
                location: p.location,
                salary: p.salary,
                category: p.category
              };
              const posterRes = await bannerGenerator.generateJobPoster(jobData, { name: p.pageName, province: p.location });
              if (posterRes && posterRes.success && posterRes.imageUrl) {
                p.mediaUrls = [posterRes.imageUrl];
                p.posterUrl = posterRes.imageUrl;
                this._log(`  └ 🖼️ Đã tạo poster chuẩn: ${posterRes.imageUrl}`, 'info');
              }
            } catch (posterErr) {
              logger.warn(`[AutoPilot] Không thể tạo poster động cho "${p.jobTitle}": ${posterErr.message}`);
            }
          }

          const postRes = await metaApiClient.publishToPage(p.pageId, p.formattedContent, p.mediaUrls);
          if (!postRes || postRes.success === false) {
            throw new Error(postRes?.error || 'Đăng bài lên Fanpage thất bại.');
          }

          results.push({
            success: true,
            pageId: p.pageId,
            pageName: p.pageName,
            slot: p.slot,
            jobTitle: p.jobTitle,
            postUrl: postRes.postUrl,
            postId: postRes.postId
          });
          successCount++;
          this.currentCampaign.success = successCount;
          this.currentCampaign.completed = i + 1;

          this._log(`🎉 ${progText} [THÀNH CÔNG] Đã xuất bản lên ${p.pageName}! (ID: ${postRes.postId || 'OK'})${postRes.postUrl ? ` - Link: ${postRes.postUrl}` : ''}`, 'success');

          historyManager.addHistory({
            type: 'FANPAGE_AUTOPILOT',
            pageId: p.pageId,
            groupName: `[Fanpage 34] ${p.pageName}`,
            postUrl: postRes.postUrl,
            postId: postRes.postId,
            status: 'SUCCESS',
            title: `[Auto-Pilot] ${p.jobTitle} (${p.slot})`,
            company: p.company,
            province: p.location
          });

        } catch (err) {
          results.push({
            success: false,
            pageId: p.pageId,
            pageName: p.pageName,
            slot: p.slot,
            jobTitle: p.jobTitle,
            error: err.message
          });
          failedCount++;
          this.currentCampaign.failed = failedCount;
          this.currentCampaign.completed = i + 1;

          this._log(`❌ ${progText} [LỖI] Fanpage "${p.pageName}" thất bại: ${err.message}`, 'error');

          historyManager.addHistory({
            type: 'FANPAGE_AUTOPILOT',
            pageId: p.pageId,
            groupName: `[Fanpage 34] ${p.pageName}`,
            status: 'FAILED',
            error: err.message,
            title: `[Auto-Pilot Lỗi] ${p.jobTitle} (${p.slot})`
          });
        }

        // Kiểm tra cảnh báo tần suất gọi Meta API (Rate Limit Protection)
        if (postRes?.usageInfo?.isHighUsage) {
          this._log(`⚠️ [BẢO VỆ TẦN SUẤT META API] Mức sử dụng API đã chạm ${postRes.usageInfo.callCount}%. Hệ thống tự động tạm nghỉ 60s để hạ nhiệt hạn mức...`, 'warn');
          await new Promise(r => setTimeout(r, 60000));
        }

        // Giãn cách an toàn tự nhiên giữa các lượt đăng (10s) tránh spam và tránh chạm hạn mức Meta
        if (i < allPosts.length - 1 && this.isRunning) {
          const delaySec = options.delaySeconds || 10;
          this._log(`⏳ Nghỉ giãn cách an toàn ${delaySec}s trước bài tiếp theo...`, 'info');
          await new Promise(r => setTimeout(r, delaySec * 1000));
        }
      }

      const summaryMsg = `Tổng: ${allPosts.length} bài | Thành công: ${successCount} | Lỗi: ${failedCount}`;
      this._log(`🏁 [HOÀN TẤT CHIẾN DỊCH] ${summaryMsg}`, successCount > 0 ? 'success' : 'warn');

      if (this.currentCampaign) {
        this.currentCampaign.currentStatusText = `Hoàn tất! Đã xuất bản ${successCount}/${allPosts.length} bài đăng.`;
      }

      return {
        success: true,
        totalPosts: allPosts.length,
        successCount,
        failedCount,
        results
      };
    } finally {
      this.isRunning = false;
      this.isPaused = false;
    }
  }
}

module.exports = new AutoPilotEngine();
