/**
 * postLeadScraper.js - Tự động cào bài viết tuyển dụng & khai thác Lead Vàng từ Facebook Group
 * Bóc tách SĐT, Quán/Công ty, Mức lương, Địa chỉ, phân loại Lead Vàng theo thời gian thực.
 */
const browserController = require('../../../core/automation/browserController');
const logger = require('../../../core/utils/logger');
const scrapedJobsProvider = require('../services/scrapedJobsProvider');

class PostLeadScraper {
  constructor() {
    this.isScraping = false;
    this.isPaused = false;
    this.shouldStop = false;
    this.progress = {
      status: 'IDLE', // IDLE | RUNNING | PAUSED | COMPLETED | STOPPED | ERROR
      currentGroupName: '',
      currentGroupUrl: '',
      groupIndex: 0,
      totalGroups: 0,
      postsScanned: 0,
      goldLeadsCount: 0,
      potentialLeadsCount: 0,
      message: 'Hệ thống sẵn sàng cào dữ liệu'
    };
    this.results = [];
    this.logs = [];
  }

  _log(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('vi-VN');
    this.logs.push({ timestamp, message, type });
    if (this.logs.length > 300) this.logs.shift();

    if (type === 'error') logger.error(`[LeadScraper] ${message}`);
    else if (type === 'success') logger.success(`[LeadScraper] ${message}`);
    else if (type === 'warn') logger.warn(`[LeadScraper] ${message}`);
    else logger.info(`[LeadScraper] ${message}`);
  }

  getStatus() {
    return {
      isScraping: this.isScraping,
      isPaused: this.isPaused,
      progress: this.progress,
      resultsCount: this.results.length,
      goldCount: this.progress.goldLeadsCount,
      potentialCount: this.progress.potentialLeadsCount,
      results: this.results.slice(-20),
      logs: this.logs.slice(-35)
    };
  }

  stop() {
    if (this.isScraping) {
      this.shouldStop = true;
      this.isPaused = false;
      this.progress.status = 'STOPPED';
      this.progress.message = 'Đang dừng tiến trình cào...';
      this._log('⛔ Đã nhận lệnh dừng cào từ người dùng!', 'warn');
    }
  }

  pause() {
    if (this.isScraping && !this.isPaused) {
      this.isPaused = true;
      this.progress.status = 'PAUSED';
      this.progress.message = 'Tiến trình đang tạm dừng';
      this._log('⏸️ Đã tạm dừng cào.', 'info');
    }
  }

  resume() {
    if (this.isScraping && this.isPaused) {
      this.isPaused = false;
      this.progress.status = 'RUNNING';
      this.progress.message = 'Tiếp tục cào bài viết...';
      this._log('▶️ Tiếp tục tiến trình cào.', 'info');
    }
  }

  /**
   * Khởi động cào bài viết và bóc tách Lead
   */
  async startScraping({
    groups = [],
    maxPostsPerGroup = 15,
    goldOnly = false,
    filterJobSeekers = true,
    filterScam = true
  } = {}) {
    if (this.isScraping) {
      throw new Error('Hệ thống đang thực hiện một phiên cào bài viết khác!');
    }

    if (!groups || groups.length === 0) {
      throw new Error('Danh sách nhóm mục tiêu trống! Vui lòng chọn ít nhất 1 nhóm.');
    }

    this.isScraping = true;
    this.isPaused = false;
    this.shouldStop = false;
    this.results = [];
    this.logs = [];
    this.progress = {
      status: 'RUNNING',
      currentGroupName: '',
      currentGroupUrl: '',
      groupIndex: 0,
      totalGroups: groups.length,
      postsScanned: 0,
      goldLeadsCount: 0,
      potentialLeadsCount: 0,
      message: `Khởi động Chrome Stealth để cào ${groups.length} nhóm...`
    };

    this._log(`🚀 BẮT ĐẦU CÀO BÀI VIẾT: ${groups.length} nhóm mục tiêu | Tối đa ${maxPostsPerGroup} bài/nhóm.`);

    let page = null;
    try {
      // 1. Mở Chrome Stealth
      await browserController.launch(false);
      page = await browserController.newDedicatedPage();
      await page.setViewport({ width: 1280, height: 850 });

      // 2. Lần lượt quét từng nhóm
      for (let i = 0; i < groups.length; i++) {
        if (this.shouldStop) break;

        while (this.isPaused) {
          if (this.shouldStop) break;
          await new Promise(r => setTimeout(r, 1000));
        }
        if (this.shouldStop) break;

        const grp = groups[i];
        this.progress.groupIndex = i + 1;
        this.progress.currentGroupName = grp.name || grp.url;
        this.progress.currentGroupUrl = grp.url;
        this.progress.message = `[${i + 1}/${groups.length}] Đang cào nhóm: ${grp.name || grp.url}`;
        this._log(`📍 [${i + 1}/${groups.length}] Điều hướng tới: ${grp.name || grp.url}`);

        try {
          const groupResults = await this._scrapeSingleGroup(page, grp, maxPostsPerGroup, {
            goldOnly,
            filterJobSeekers,
            filterScam
          });

          this._log(`✅ Hoàn tất nhóm "${grp.name || grp.url}": Quét được ${groupResults.scanned} bài, tìm thấy ${groupResults.leads.length} Lead hợp lệ.`);
        } catch (grpErr) {
          this._log(`⚠️ Lỗi cào nhóm "${grp.name || grp.url}": ${grpErr.message}`, 'warn');
        }

        // Nghỉ giữa các nhóm để tránh checkpoint
        if (i < groups.length - 1 && !this.shouldStop) {
          const delaySec = 3 + Math.floor(Math.random() * 3);
          this.progress.message = `Tạm nghỉ an toàn ${delaySec}s trước nhóm tiếp theo...`;
          await new Promise(r => setTimeout(r, delaySec * 1000));
        }
      }

      this.progress.status = this.shouldStop ? 'STOPPED' : 'COMPLETED';
      this.progress.message = `Đã hoàn tất cào ${this.progress.postsScanned} bài viết! Thu được ${this.progress.goldLeadsCount} Lead Vàng & ${this.progress.potentialLeadsCount} Lead Tiềm Năng.`;
      this._log(`🎉 ${this.progress.message}`, 'success');

    } catch (err) {
      this.progress.status = 'ERROR';
      this.progress.message = `Lỗi tiến trình cào: ${err.message}`;
      this._log(`❌ Lỗi cào: ${err.message}`, 'error');
    } finally {
      this.isScraping = false;
      this.isPaused = false;
      if (page) {
        try { await page.close(); } catch (e) {}
      }
    }

    return this.results;
  }

  /**
   * Cào bài viết trong 1 nhóm cụ thể
   */
  async _scrapeSingleGroup(page, grp, maxPosts, options) {
    let cleanUrl = (grp.url || '').trim();
    if (!cleanUrl.endsWith('/')) cleanUrl += '/';
    // Đảm bảo không có query tham số thừa
    cleanUrl = cleanUrl.split('?')[0];

    // Ưu tiên bài viết mới nhất theo thứ tự thời gian
    const navUrl = cleanUrl.includes('?') ? cleanUrl : `${cleanUrl}?sorting_setting=CHRONOLOGICAL`;

    await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await new Promise(r => setTimeout(r, 2500));

    let scannedCount = 0;
    const foundLeads = [];
    const seenPostUrls = new Set();
    let scrollRounds = 0;
    const maxScrolls = Math.max(6, Math.ceil(maxPosts / 2));

    while (foundLeads.length < maxPosts && scrollRounds < maxScrolls) {
      if (this.shouldStop) break;

      // Trích xuất các bài viết đang hiển thị trên DOM
      const rawArticles = await page.evaluate(() => {
        const postsData = [];
        // Tìm các thẻ đại diện cho bài viết: role="article" hoặc div có chứa message, feed unit
        const articleElements = document.querySelectorAll('div[role="article"], div[data-ad-preview="message"], div[data-pagelet*="FeedUnit"], div[data-virtualized="false"]');

        articleElements.forEach(art => {
          try {
            // Nếu phần tử này chứa role="article" con thì bỏ qua container cha
            if (art.getAttribute('role') !== 'article' && art.querySelector('div[role="article"]')) return;

            // Bấm tự động nút "Xem thêm" / "See more" để lấy toàn bộ nội dung tuyển dụng & SĐT
            const seeMoreBtns = art.querySelectorAll('div[role="button"], span[role="button"]');
            for (const btn of seeMoreBtns) {
              const bText = (btn.innerText || '').toLowerCase().trim();
              if (bText === 'xem thêm' || bText === 'see more') {
                try { btn.click(); } catch (e) {}
              }
            }

            const fullText = (art.innerText || '').trim();
            if (!fullText || fullText.length < 35) return;

            // Tìm link bài viết
            const links = Array.from(art.querySelectorAll('a[href]'));
            let postUrl = '';
            let authorName = '';
            let authorUrl = '';

            for (const a of links) {
              const href = a.href || '';
              // Nhận diện link bài viết cụ thể
              if (!postUrl) {
                if (href.includes('/posts/') || href.includes('/permalink/') || href.includes('/multi_permalinks/')) {
                  postUrl = href.split('?')[0];
                  if (!postUrl.endsWith('/')) postUrl += '/';
                } else if (href.includes('story_fbid=')) {
                  const matchFbid = href.match(/story_fbid=([^&]+)/);
                  const matchId = href.match(/[?&]id=([^&]+)/);
                  if (matchFbid) {
                    postUrl = `https://www.facebook.com/permalink.php?story_fbid=${matchFbid[1]}${matchId ? `&id=${matchId[1]}` : ''}`;
                  } else {
                    postUrl = href;
                  }
                }
              }
              // Nhận diện tên tác giả (link trang cá nhân)
              if (!authorName && href.includes('facebook.com/') && !href.includes('/groups/') && !href.includes('/posts/')) {
                const txt = (a.innerText || '').trim();
                if (txt && txt.length > 1 && !['xem thêm', 'thích', 'bình luận', 'chia sẻ', 'phút', 'giờ', 'ngày'].some(s => txt.toLowerCase().includes(s))) {
                  authorName = txt;
                  authorUrl = href.split('?')[0];
                }
              }
            }

            postsData.push({
              postUrl,
              authorName,
              authorUrl,
              text: fullText
            });
          } catch (e) {}
        });

        return postsData;
      });

      // Phân tích và bóc tách từng bài viết thu được
      for (const item of rawArticles) {
        if (this.shouldStop) break;
        if (foundLeads.length >= maxPosts) break;

        const postKey = item.postUrl || item.text.substring(0, 100);
        if (seenPostUrls.has(postKey)) continue;
        seenPostUrls.add(postKey);

        scannedCount++;
        this.progress.postsScanned++;

        // 1. Phân tích nội dung (Bộ lọc 3 tầng)
        const analysis = this.analyzeJobPost(item.text, item.authorName);

        // Lọc bài tìm việc nếu bật
        if (options.filterJobSeekers && analysis.isJobSeeker) {
          continue;
        }

        // Lọc lừa đảo nếu bật
        if (options.filterScam && analysis.isScam) {
          continue;
        }

        // Chỉ lấy Lead Vàng nếu yêu cầu
        if (options.goldOnly && analysis.leadTier !== 'GOLD_LEAD') {
          continue;
        }

        // Bỏ qua bài chưa có danh tính gì (không có SĐT và không có tên quán/cty)
        if (!analysis.phone && !analysis.employer) {
          continue;
        }

        const fallbackSearchKey = analysis.phone || analysis.employer || analysis.jobTitle || '';
        const validPostUrl = item.postUrl || (fallbackSearchKey ? `${cleanUrl}search/?q=${encodeURIComponent(fallbackSearchKey)}` : cleanUrl);

        // Chuẩn hóa bản ghi Lead
        const leadRecord = {
          source: 'facebook_group',
          group_id: grp.id || '',
          group_name: grp.name || 'Nhóm Facebook',
          group_url: cleanUrl,
          post_url: validPostUrl,
          author_name: item.authorName || 'Nhà Tuyển Dụng',
          author_url: item.authorUrl || '',
          post_text: item.text,
          collected_at: new Date().toISOString(),
          job_title: analysis.jobTitle || 'Tuyển Dụng Mới',
          description: item.text.substring(0, 200) + '...',
          salary: analysis.salary || 'Thỏa thuận',
          location: analysis.location || grp.province || 'Toàn quốc',
          street_address: analysis.location || '',
          contact_phone: analysis.phone || '',
          contact: analysis.phone || 'Liên hệ trực tiếp',
          zalo_link: analysis.phone ? `https://zalo.me/${analysis.phone}` : '',
          working_time: analysis.workingTime || 'Theo ca / Toàn thời gian',
          requirements: 'Trao đổi chi tiết khi ứng tuyển',
          employer: analysis.employer || (item.authorName ? `Cơ sở của ${item.authorName}` : 'Doanh Nghiệp / Quán'),
          employer_name: analysis.employer || (item.authorName ? `Cơ sở của ${item.authorName}` : 'Doanh Nghiệp / Quán'),
          lead_tier: analysis.leadTier,
          lead_tier_label: analysis.leadTier === 'GOLD_LEAD' ? '🎯 Lead Vàng (Sẵn Sàng Tư Vấn)' : '⚡ Lead Tiềm Năng',
          identity_score: analysis.identityScore,
          reason: analysis.reason,
          is_anonymous: false
        };

        foundLeads.push(leadRecord);
        this.results.push(leadRecord);

        if (analysis.leadTier === 'GOLD_LEAD') {
          this.progress.goldLeadsCount++;
          this._log(`👑 [LEAD VÀNG] Phát hiện: "${leadRecord.job_title}" - ${leadRecord.employer} | SĐT: ${analysis.phone}`, 'success');
        } else {
          this.progress.potentialLeadsCount++;
          this._log(`⚡ [Tiềm Năng] Phát hiện: "${leadRecord.job_title}" - SĐT: ${analysis.phone || 'Chưa có'}`, 'info');
        }

        // Lưu trực tiếp vào ScrapedJobsProvider và file facebook_group_jobs.json
        scrapedJobsProvider.appendScrapedJob(leadRecord);
      }

      // Cuộn trang xuống để Facebook tải tiếp bài viết
      scrollRounds++;
      this.progress.message = `[${this.progress.groupIndex}/${this.progress.totalGroups}] Đang lướt trang nhóm (${scrollRounds}/${maxScrolls})...`;
      await page.evaluate(() => window.scrollBy(0, window.innerHeight * 1.5));
      await new Promise(r => setTimeout(r, 2200 + Math.floor(Math.random() * 1000)));
    }

    return { scanned: scannedCount, leads: foundLeads };
  }

  /**
   * Bộ lọc 3 tầng thông minh & Trích xuất thực thể
   */
  analyzeJobPost(rawText, authorName) {
    const text = (rawText || '').trim();
    const lower = text.toLowerCase();
    const folded = this._fold(text);

    // 1. Kiểm tra bài Người Tìm Việc (Job Seeker)
    const seekerSignals = [
      'can tim viec', 'can kiem viec', 'muon tim viec', 'xin viec lam', 'tim viec lam',
      'em 2k', 'sinh nam 20', 'tuoi moi ra da nang can tim viec', 'nhan viec bao an',
      'co cho nao tuyen k a', 'co ai tuyen k a', 'ai co viec gi k', 'can viec lam them'
    ];
    let isJobSeeker = false;
    for (const sig of seekerSignals) {
      if (folded.includes(sig)) {
        isJobSeeker = true;
        break;
      }
    }

    // 2. Kiểm tra dấu hiệu Lừa đảo / Đa cấp / Nhiệm vụ online
    const scamSignals = [
      'gấp lì xì', 'gap li xi', 'xâu chuỗi', 'xau chuoi', 'xâu hạt', 'xau hat',
      'cắt chỉ', 'cat chi', 'cắn hạt điều', 'gõ captcha', 'đánh máy tại nhà',
      'làm nhiệm vụ', 'nhiệm vụ shopee', 'nhiệm vụ tiktok', 'nhiệm vụ lazada',
      'giật đơn', 'nạp tiền nhận hoa hồng', 'tiền cọc', 'phí giữ chỗ', 'rút tiền ví trả sau',
      'nhóm telegram', 'kéo telegram', 'việc nhẹ lương cao'
    ];
    let isScam = false;
    for (const sig of scamSignals) {
      if (lower.includes(sig) || folded.includes(sig)) {
        isScam = true;
        break;
      }
    }

    // 3. Bóc tách Số Điện Thoại Việt Nam
    let phone = '';
    const normPhoneText = text.replace(/([: \t\n]|^)([Oo])(\d{8,9})\b/g, (m, p1, p2, p3) => p1 + '0' + p3);
    const phonePattern = /(?:(?:\+84|0)[.\s\-]*(?:3[2-9]|5[689]|7[06-9]|8[1-9]|9\d)(?:[.\s\-]*\d){7})\b/i;
    const phoneMatch = normPhoneText.match(phonePattern);
    if (phoneMatch) {
      phone = phoneMatch[0].replace(/[^0-9+]/g, '');
      if (phone.startsWith('+84')) phone = '0' + phone.substring(3);
    } else {
      const plainDigits = text.replace(/[\.\s\-\(\)]/g, '');
      const plainMatches = plainDigits.match(/\b0\d{9}\b/);
      if (plainMatches) phone = plainMatches[0];
    }

    // 4. Bóc tách Tên Quán / Doanh Nghiệp
    let employer = '';
    const employerPatterns = [
      /(?:công ty|cty|quán|tiệm|shop|cửa hàng|nhà hàng|cafe|cà phê|bakery|hotel|khách sạn|spa|studio|gara|xưởng)\s+([A-ZÀ-Ỹ0-9][A-Za-zÀ-ỹ0-9\s&]{2,45})/i,
      /(?:tại|chi nhánh)\s*:\s*([A-ZÀ-Ỹ0-9][A-Za-zÀ-ỹ0-9\s&]{2,45})/i
    ];
    for (const pat of employerPatterns) {
      const m = text.match(pat);
      if (m && m[0]) {
        employer = m[0].split('\n')[0].replace(/[,;:]/g, '').trim();
        // Loại bỏ các từ khóa thừa ở đuôi như "cần tuyển gấp", "tuyển dụng", "tuyển nhân sự"
        employer = employer.replace(/\s+(?:cần\s+tuyển(?:\s+gấp)?|tuyển\s+gấp|tuyển\s+dụng|tuyển\s+nhân\s+viên|tuyển).*$/i, '').trim();
        break;
      }
    }

    // 5. Bóc tách Mức Lương
    let salary = '';
    const salaryRangeRegex = /(?:lương|thu nhập|mức lương|salary)\s*[:\-]?\s*(?:cứng\s*)?([0-9\.\,]+(?:\s*(?:triệu|tr|k|đ))?\s*[-–~]\s*[0-9\.\,]+\s*(?:triệu|tr|k|đ|usd|tháng|h|giờ|ca)(?:\/[a-zA-ZÀ-ỹ]+)?)/i;
    const salarySingleRegex = /(?:lương|thu nhập|mức lương|salary)\s*[:\-]?\s*(?:cứng\s*)?([0-9\.\,]+\s*(?:triệu|tr|k|đ|usd|tháng|h|giờ|ca)(?:\/[a-zA-ZÀ-ỹ]+)?)/i;
    const salaryRangeMatch = text.match(salaryRangeRegex);
    const salarySingleMatch = text.match(salarySingleRegex);
    if (salaryRangeMatch) {
      salary = salaryRangeMatch[1].trim();
    } else if (salarySingleMatch) {
      salary = salarySingleMatch[1].trim();
    } else {
      const quickSalary = text.match(/\b(\d{1,2}(?:\.\d)?\s*-\s*\d{1,2}(?:\.\d)?\s*(?:triệu|tr))\b/i);
      if (quickSalary) salary = quickSalary[1];
    }

    // 6. Bóc tách Địa chỉ
    let location = '';
    const primaryLoc = text.match(/(?:địa chỉ|địa điểm|làm việc tại|khu vực|chi nhánh)\s*[:\-]?\s*([^\n\r;]{6,70})/i);
    if (primaryLoc) {
      location = primaryLoc[1].trim();
    } else {
      const fallbackLoc = text.match(/(?:tại)\s*[:\-]?\s*([^\n\r;]{6,70})/i);
      if (fallbackLoc) location = fallbackLoc[1].trim();
    }

    // 7. Xác định Chức Danh Công Việc
    let jobTitle = '';
    const specificRoles = [
      'nhân viên phục vụ', 'phục vụ bàn', 'phục vụ',
      'nhân viên pha chế', 'barista', 'pha chế',
      'thu ngân', 'kế toán',
      'phụ bếp', 'đầu bếp', 'bếp chính', 'bếp',
      'bảo vệ', 'tạp vụ',
      'nhân viên bán hàng', 'bán hàng',
      'nhân viên kinh doanh', 'telesale', 'sales',
      'lễ tân', 'giao hàng', 'shipper', 'tài xế', 'lái xe',
      'thợ may', 'thợ làm móng', 'thợ tóc', 'thợ spa'
    ];
    for (const role of specificRoles) {
      if (lower.includes(role)) {
        jobTitle = 'Tuyển ' + role.charAt(0).toUpperCase() + role.slice(1);
        break;
      }
    }
    if (!jobTitle) {
      const titleRegex = /(?:tuyển gấp|cần tuyển|tuyển dụng|tuyển)\s+([A-Za-zÀ-ỹ\s0-9&]{3,40})/i;
      const titleMatch = text.match(titleRegex);
      if (titleMatch) {
        jobTitle = 'Tuyển ' + titleMatch[1].replace(/[\n,:]/g, '').trim();
      } else {
        jobTitle = 'Tuyển Dụng Việc Làm Mới';
      }
    }

    // 8. Chấm điểm định danh & Phân hạng Lead
    let leadTier = 'UNQUALIFIED';
    let identityScore = 50;
    let reason = '';

    if (isJobSeeker) {
      leadTier = 'UNQUALIFIED';
      identityScore = 0;
      reason = 'Ứng viên tìm việc làm (Loại bỏ)';
    } else if (isScam) {
      leadTier = 'UNQUALIFIED';
      identityScore = 0;
      reason = 'Dấu hiệu lừa đảo / nhiệm vụ đa cấp (Loại bỏ)';
    } else if (phone && employer) {
      leadTier = 'GOLD_LEAD';
      identityScore = 100;
      reason = 'Có đầy đủ số điện thoại và tên doanh nghiệp / quán rõ ràng';
    } else if (phone || employer) {
      leadTier = 'POTENTIAL_LEAD';
      identityScore = 75;
      reason = phone ? 'Có số điện thoại liên hệ xác thực' : 'Có tên quán/công ty tuyển dụng';
    }

    return {
      isJobSeeker,
      isScam,
      phone,
      employer,
      salary,
      location,
      jobTitle,
      leadTier,
      identityScore,
      reason
    };
  }

  _fold(str) {
    return (str || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

module.exports = new PostLeadScraper();
