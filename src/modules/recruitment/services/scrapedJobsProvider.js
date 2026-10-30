/**
 * scrapedJobsProvider.js - Tích hợp nguồn tin tuyển dụng & Lead Vàng từ Facebook Group Scraper
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const groupManager = require('./groupManager');

function extractVietnamesePhone(text) {
  if (!text) return '';
  const normalized = String(text).replace(/(?<=\b|[^\d\w])[oO](?=[35789]\d)/g, '0');
  const pattern = /(?:(?:\+84|84|0)[35789]|02\d)[\.\-\s]?\d{2,4}[\.\-\s]?\d{2,4}[\.\-\s]?\d{2,4}\b/g;
  const matches = normalized.match(pattern);
  if (matches) {
    for (const m of matches) {
      let digits = m.replace(/\D/g, '');
      if (digits.startsWith('84')) digits = '0' + digits.substring(2);
      if (digits.length === 10 && digits.startsWith('0')) return digits;
      if (digits.length === 11 && digits.startsWith('02')) return digits;
    }
  }
  return '';
}

class ScrapedJobsProvider {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.scraperDir = path.resolve(rootDir, '../Tuyển Dụng/scraper_data/facebook_group');
    this.jobsJsonFile = path.join(this.scraperDir, 'facebook_group_jobs.json');
    this.groupsJsonFile = path.join(this.scraperDir, 'facebook_groups.json');
    this.localJobsJsonFile = path.resolve(rootDir, 'data/facebook_group_jobs.json');
    this.scraperApiUrl = 'http://localhost:5050/api/data';
    this.cachedJobs = [];
    this.lastFetched = null;
  }

  /**
   * Lấy danh sách bài tuyển dụng cào được (ưu tiên Lead Vàng)
   */
  async getJobs({ forceReload = false, goldOnly = false } = {}) {
    if (!forceReload && this.cachedJobs.length > 0 && this.lastFetched) {
      const ageSec = (Date.now() - this.lastFetched.getTime()) / 1000;
      if (ageSec < 30) {
        return goldOnly
          ? this.cachedJobs.filter(j => j.leadTier === 'GOLD_LEAD')
          : this.cachedJobs;
      }
    }

    let rawData = null;

    // 1. Ưu tiên đọc từ file JSON nội bộ hoặc data folder
    const targetFiles = [this.jobsJsonFile, this.localJobsJsonFile];
    for (const filePath of targetFiles) {
      if (fs.existsSync(filePath)) {
        try {
          const fileContent = fs.readFileSync(filePath, 'utf8');
          const parsed = JSON.parse(fileContent);
          if (parsed && ((parsed.posts && parsed.posts.length > 0) || (parsed.gold_leads && parsed.gold_leads.length > 0))) {
            rawData = parsed;
            break;
          } else if (!rawData) {
            rawData = parsed;
          }
        } catch (err) {
          logger.warn(`Lỗi đọc file ${filePath}: ${err.message}`);
        }
      }
    }

    // 2. Dự phòng: gọi trực tiếp API nếu Web Dashboard của Scraper đang chạy
    if (!rawData) {
      try {
        const res = await axios.get(this.scraperApiUrl, { timeout: 3000 });
        if (res.data && res.data.success) {
          rawData = res.data;
        }
      } catch (err) {
        // Dashboard scraper chưa bật
      }
    }

    if (!rawData) {
      return [];
    }

    // 1. Ưu tiên lấy từ danh sách gold_leads & potential_leads đã được phân loại chuẩn
    let rawList = [];
    if (Array.isArray(rawData.gold_leads) && rawData.gold_leads.length > 0) {
      rawList = [...rawData.gold_leads, ...(Array.isArray(rawData.potential_leads) ? rawData.potential_leads : [])];
    } else {
      rawList = Array.isArray(rawData.posts) ? rawData.posts : [];
    }

    // 2. BỘ LỌC CHẶN TRIỆT ĐỂ:
    // - KHÔNG lấy bài ứng viên tìm việc (JOB_SEEKER / REJECTED_SEEKER)
    // - KHÔNG lấy bài ẩn danh (is_anonymous = true / Người tham gia ẩn danh)
    // - KHÔNG lấy bài lừa đảo rác (REJECTED_SCAM)
    // - KHÔNG lấy bài chưa đủ chuẩn danh tính (UNQUALIFIED / Không SĐT + không tên quán/cty)
    const validPosts = rawList.filter(p => {
      // Chặn bài nặc danh / ẩn danh
      if (p.is_anonymous === true) return false;
      const text = (p.post_text || '').toLowerCase();
      const author = (p.author_name || '').toLowerCase();
      if (author.includes('ẩn danh') || text.startsWith('người tham gia ẩn danh') || text.startsWith('thành viên ẩn danh')) {
        return false;
      }

      // Chặn bài ứng viên tìm việc
      if (p.validity_status === 'REJECTED_SEEKER' || p.post_type === 'JOB_SEEKER') {
        return false;
      }
      if (text.includes('cần tìm việc') || text.includes('cần kiếm việc') || text.includes('tìm việc làm bao ăn')) {
        return false;
      }

      // Chặn bài lừa đảo
      if (p.validity_status === 'REJECTED_SCAM') {
        return false;
      }

      // Chặn bài không đủ chuẩn hoặc không có danh tính
      if (p.lead_tier === 'UNQUALIFIED') {
        return false;
      }

      // Bắt buộc phải có Số Điện Thoại liên hệ thực tế để phục vụ chuyển đổi sale
      const fullText = (p.post_text || '').trim();
      const extractedPhone = extractVietnamesePhone(p.contact_phone) || extractVietnamesePhone(fullText) || extractVietnamesePhone(p.contact);
      if (!extractedPhone || extractedPhone.length < 9) {
        return false;
      }

      return true;
    });

    const normalized = validPosts.map((p, index) => {
      const id = `scraped_${index + 1}_${Date.now().toString(36)}`;
      const cleanTitle = (p.job_title || '').trim() || 'Tuyển Dụng Mới';
      const employer = (p.employer_name || p.employer || '').trim();
      const fullText = (p.post_text || '').trim();
      const phone = extractVietnamesePhone(p.contact_phone) || extractVietnamesePhone(fullText) || extractVietnamesePhone(p.contact);
      const address = (p.street_address || p.location || '').trim();
      const salary = (p.salary || '').trim() || 'Thỏa thuận';

      // Tạo nội dung bài đăng mẫu được tối ưu hóa cho auto-posting
      const formattedPost = this.formatJobForPost({
        title: cleanTitle,
        employer,
        salary,
        address,
        phone,
        zaloLink: p.zalo_link,
        fullText
      });

      let resolvedPostUrl = (p.post_url || '').trim();
      if (!resolvedPostUrl || resolvedPostUrl === (p.group_url || '').trim()) {
        const cleanGrp = (p.group_url || '').trim().split('?')[0].replace(/\/+$/, '');
        const searchKey = phone || employer || cleanTitle;
        if (cleanGrp && searchKey) {
          resolvedPostUrl = `${cleanGrp}/search/?q=${encodeURIComponent(searchKey)}`;
        } else {
          resolvedPostUrl = p.group_url || '';
        }
      }

      return {
        id,
        source: 'facebook_scraper',
        jobTitle: cleanTitle,
        title: cleanTitle,
        employer: employer || 'Doanh Nghiệp / Cơ Sở Tuyển Dụng',
        employerName: employer || 'Doanh Nghiệp / Cơ Sở Tuyển Dụng',
        posterName: (p.author_name || p.poster_name || '').trim(),
        authorName: (p.author_name || p.poster_name || '').trim(),
        authorUrl: p.author_url || '',
        salary,
        location: address || 'Toàn quốc',
        contact: phone || p.contact || 'Liên hệ trực tiếp',
        contactPhone: phone,
        phone,
        zaloLink: p.zalo_link || (phone ? `https://zalo.me/${phone}` : ''),
        workingTime: p.working_time || 'Theo ca / Thỏa thuận',
        requirements: p.requirements || 'Trao đổi chi tiết khi ứng tuyển',
        content: formattedPost,
        formattedGroupPost: formattedPost,
        originalText: fullText,
        postUrl: resolvedPostUrl,
        groupName: p.group_name || '',
        leadTier: p.lead_tier || 'POTENTIAL_LEAD',
        leadTierLabel: p.lead_tier_label || '⚡ Lead Tiềm Năng',
        identityScore: p.identity_score || 70,
        isAnonymous: false,
        collectedAt: p.collected_at || ''
      };
    });

    this.cachedJobs = normalized;
    this.lastFetched = new Date();

    return goldOnly
      ? this.cachedJobs.filter(j => j.leadTier === 'GOLD_LEAD')
      : this.cachedJobs;
  }

  /**
   * Soạn thảo bài đăng tuyển dụng chuẩn dựa trên tin cào được
   */
  formatJobForPost({ title, employer, salary, address, phone, zaloLink, fullText }) {
    let lines = [];
    lines.push(`🔥 [TUYỂN DỤNG GẤP] ${title.toUpperCase()}`);
    if (employer) lines.push(`🏢 Đơn vị: ${employer}`);
    if (salary) lines.push(`💵 Mức thu nhập: ${salary}`);
    if (address) lines.push(`📍 Địa điểm làm việc: ${address}`);
    lines.push(`⏰ Thời gian: Linh hoạt theo ca / Toàn thời gian`);
    lines.push(`-----------------------------------`);
    lines.push(`📋 MÔ TẢ & YÊU CẦU:`);
    // Trích đoạn ngắn 2-3 câu từ bài gốc
    const snippet = fullText.length > 250 ? fullText.substring(0, 250) + '...' : fullText;
    lines.push(snippet);
    lines.push(`-----------------------------------`);
    if (phone) {
      lines.push(`📞 Hotline / Zalo ứng tuyển: ${phone}`);
      lines.push(`👉 Nhắn tin Zalo nhanh: https://zalo.me/${phone}`);
    } else {
      lines.push(`👉 Ứng viên vui lòng bình luận hoặc nhắn tin trực tiếp để nhận thông tin!`);
    }

    return lines.join('\n');
  }

  /**
   * Tự động đồng bộ toàn bộ Hội Nhóm cào được vào danh sách Hội Nhóm mục tiêu của GroupManager
   */
  syncGroupsToEngine() {
    try {
      const groupMap = new Map();

      // 1. Nạp từ facebook_groups.json nếu có
      if (fs.existsSync(this.groupsJsonFile)) {
        try {
          const data = JSON.parse(fs.readFileSync(this.groupsJsonFile, 'utf8'));
          const items = Array.isArray(data) ? data : (data.groups || []);
          items.forEach(g => {
            if (g && g.url) {
              groupMap.set(g.url.trim(), {
                name: g.name || g.url,
                url: g.url.trim(),
                province: g.province || 'Toàn quốc',
                category: 'Tuyển Dụng',
                members: g.members || g.memberCount || 'N/A',
                privacy: g.privacy || 'PUBLIC',
                isJoined: Boolean(g.isJoined)
              });
            }
          });
        } catch (e) {
          logger.warn(`Không đọc được facebook_groups.json: ${e.message}`);
        }
      }

      // 2. Nạp thêm các nhóm phát hiện được từ các bài đăng trong facebook_group_jobs.json
      if (fs.existsSync(this.jobsJsonFile)) {
        try {
          const jobsData = JSON.parse(fs.readFileSync(this.jobsJsonFile, 'utf8'));
          const allPosts = [
            ...(Array.isArray(jobsData.posts) ? jobsData.posts : []),
            ...(Array.isArray(jobsData.rejected_posts) ? jobsData.rejected_posts : [])
          ];

          allPosts.forEach(p => {
            const url = (p.group_url || '').trim();
            if (url && !groupMap.has(url)) {
              let name = p.group_name || url;
              if (name.startsWith('http')) {
                const match = name.match(/groups\/([^\/?#]+)/);
                name = match ? `Nhóm FB ${match[1]}` : name;
              }
              groupMap.set(url, {
                name,
                url,
                province: p.location || 'Toàn quốc',
                category: 'Tuyển Dụng',
                members: 'N/A',
                privacy: 'PUBLIC',
                isJoined: false
              });
            }
          });
        } catch (e) {
          logger.warn(`Không đọc được facebook_group_jobs.json: ${e.message}`);
        }
      }

      const groupItems = Array.from(groupMap.values());
      if (groupItems.length === 0) {
        return {
          success: false,
          message: 'Chưa có nhóm nào trong file cấu hình scraper hoặc danh sách bài cào.'
        };
      }

      const syncResult = groupManager.addBulkGroups(groupItems);
      logger.success(`Đã đồng bộ ${syncResult.added} nhóm mới (${syncResult.updated} nhóm cập nhật) từ Tool Cào Facebook!`);

      return {
        success: true,
        message: `Đã nạp thành công ${syncResult.added} nhóm mới (${syncResult.updated} nhóm cập nhật) từ Tool Cào!`,
        data: {
          addedCount: syncResult.added,
          updatedCount: syncResult.updated,
          totalGroups: syncResult.total
        }
      };
    } catch (err) {
      logger.error(`Lỗi đồng bộ nhóm từ tool cào: ${err.message}`);
      return { success: false, message: err.message };
    }
  }

  /**
   * Lưu hoặc chèn thêm một Lead cào được vào file JSON và cập nhật cache tức thì
   */
  appendScrapedJob(job) {
    try {
      let data = {
        collected_at: new Date().toISOString(),
        stats: { total_posts_scanned: 0, gold_leads_count: 0, potential_leads_count: 0, valid_jobs_saved: 0 },
        posts: [],
        gold_leads: [],
        potential_leads: [],
        rejected_posts: []
      };

      const targetFiles = [this.jobsJsonFile, this.localJobsJsonFile];
      for (const filePath of targetFiles) {
        if (fs.existsSync(filePath)) {
          try {
            const raw = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && (parsed.posts?.length || parsed.gold_leads?.length)) {
              data = parsed;
              break;
            }
          } catch (e) {}
        }
      }

      if (!Array.isArray(data.posts)) data.posts = [];
      if (!Array.isArray(data.gold_leads)) data.gold_leads = [];
      if (!Array.isArray(data.potential_leads)) data.potential_leads = [];

      // Kiểm tra trùng lặp theo post_url hoặc text
      const key = job.post_url || (job.post_text ? job.post_text.substring(0, 120) : '');
      const isDuplicate = data.posts.some(p => (p.post_url && p.post_url === key) || (p.post_text && p.post_text.substring(0, 120) === key));
      if (isDuplicate) return;

      // Chèn lên đầu danh sách bài mới nhất
      data.posts.unshift(job);
      if (job.lead_tier === 'GOLD_LEAD') {
        data.gold_leads.unshift(job);
      } else {
        data.potential_leads.unshift(job);
      }

      // Cập nhật thống kê
      data.stats = data.stats || {};
      data.stats.gold_leads_count = data.gold_leads.length;
      data.stats.potential_leads_count = data.potential_leads.length;
      data.stats.valid_jobs_saved = data.gold_leads.length + data.potential_leads.length;

      // Ghi lại file JSON vào cả 2 nơi (local data/ và scraper_data nếu có)
      for (const filePath of targetFiles) {
        try {
          const dir = path.dirname(filePath);
          if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        } catch (writeErr) {
          logger.warn(`Không thể ghi vào file ${filePath}: ${writeErr.message}`);
        }
      }

      // Cập nhật cache tức thì
      this.lastFetched = null;
    } catch (err) {
      logger.warn(`Không thể lưu lead vào JSON: ${err.message}`);
    }
  }
}

module.exports = new ScrapedJobsProvider();
