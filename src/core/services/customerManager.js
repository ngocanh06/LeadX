/**
 * customerManager.js - Quản Lý Khách Hàng CRM (Theo chuẩn Google Sheets Mau_Quan_Ly_Khach_Hang)
 * Quản lý danh sách khách hàng, kênh liên hệ, 10 mã màu nhãn trạng thái và giá trị đơn hàng.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const scrapedJobsProvider = require('../../modules/recruitment/services/scrapedJobsProvider');

class CustomerManager {
  constructor() {
    this.filePath = path.resolve(config.rootDir, 'data/customers.json');
    this.customers = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.customers = JSON.parse(raw);
        if (!Array.isArray(this.customers)) this.customers = [];
      } else {
        this.customers = [];
      }

      // Xóa bỏ triệt để dữ liệu mẫu giả định (cust_sample_*)
      const hadSamples = this.customers.some(c => c.id && c.id.startsWith('cust_sample_'));
      if (hadSamples) {
        this.customers = this.customers.filter(c => !c.id || !c.id.startsWith('cust_sample_'));
        this._save();
      }

      // Nếu chưa có khách hàng thực tế hoặc có dữ liệu cũ, tự động đồng bộ từ Group Scraper
      if (this.customers.length === 0 || hadSamples) {
        this.syncFromGroupScraper({ forceReload: false, purgeSamples: true }).catch(err => {
          logger.warn(`Tự động đồng bộ khách hàng từ Group Scraper: ${err.message}`);
        });
      }
    } catch (err) {
      logger.error(`Lỗi tải dữ liệu khách hàng CRM: ${err.message}`);
      this.customers = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.customers, null, 2), 'utf8');
    } catch (err) {
      logger.error(`Lỗi lưu dữ liệu khách hàng CRM: ${err.message}`);
    }
  }

  /**
   * Đồng bộ dữ liệu khách hàng từ nguồn cào Facebook Group
   * Lọc chuẩn:
   * 1. Chỉ lấy tin CÓ SỐ ĐIỆN THOẠI liên hệ thực tế
   * 2. Bóc tách Tên khách hàng (người đăng / doanh nghiệp)
   * 3. Bóc tách Vị trí tuyển dụng đang cần tuyển
   * 4. Thống kê Số lượng đăng group mấy lần qua các nhóm Facebook
   * 5. Thời gian đăng bài
   * 6. Ghi chú chi tiết phục vụ khai thác sale
   */
  async syncFromGroupScraper({ forceReload = true, purgeSamples = true } = {}) {
    try {
      const scrapedJobs = await scrapedJobsProvider.getJobs({ forceReload });

      // Xóa các mẫu dữ liệu giả định nếu có
      if (purgeSamples) {
        this.customers = this.customers.filter(c => !c.id || !c.id.startsWith('cust_sample_'));
      }

      if (!Array.isArray(scrapedJobs) || scrapedJobs.length === 0) {
        this._save();
        return { total: this.customers.length, added: 0, updated: 0, syncCount: 0 };
      }

      // Gom nhóm tin cào theo SĐT để đếm số lần đăng group
      const groupedByPhone = new Map();

      for (const job of scrapedJobs) {
        const phone = (job.phone || job.contactPhone || '').trim();
        if (!phone || phone.length < 9) continue; // Chỉ nhận tin có SĐT

        if (!groupedByPhone.has(phone)) {
          groupedByPhone.set(phone, []);
        }
        groupedByPhone.get(phone).push(job);
      }

      let added = 0;
      let updated = 0;

      for (const [phone, posts] of groupedByPhone.entries()) {
        const latestPost = posts[0];
        const postCount = posts.length;
        const groupNames = Array.from(new Set(posts.map(p => p.groupName).filter(Boolean)));

        const authorName = (latestPost.posterName || latestPost.authorName || '').trim();
        const employerName = (latestPost.employer || latestPost.employerName || '').trim();
        let displayName = '';
        if (authorName && employerName && authorName !== employerName) {
          displayName = `${authorName} (${employerName})`;
        } else {
          displayName = authorName || employerName || 'Khách Tuyển Dụng FB';
        }

        const jobTitle = latestPost.jobTitle || latestPost.title || 'Tuyển dụng nhân sự';
        const salary = latestPost.salary || 'Thỏa thuận';
        const location = latestPost.location || latestPost.street_address || 'Toàn quốc';
        const postedAt = (latestPost.collectedAt ? latestPost.collectedAt.split('T')[0] : '') || new Date().toISOString().split('T')[0];

        const groupSummaryText = groupNames.length > 0 ? groupNames.join(', ') : (latestPost.groupName || 'Nhóm Facebook');
        const frequencyBadge = postCount > 1 ? `[Đã đăng ${postCount} lần trên ${groupNames.length} nhóm]` : `[Đăng 1 lần]`;

        const notes = `Vị trí: ${jobTitle} (${salary}). Địa chỉ: ${location}. ${frequencyBadge} trên: ${groupSummaryText}. Đăng lúc: ${postedAt}. SĐT/Zalo sẵn sàng khai thác sale.`;

        // Nếu đã đăng từ 2 lần trở lên -> Nhu cầu tuyển gấp, gắn VIP_URGENT
        const autoStatus = postCount > 1 ? 'VIP_URGENT' : 'NEW';
        const autoStatusLabel = postCount > 1 ? 'Tuyển Gấp / VIP' : 'Khách Hàng Mới';

        const existingIdx = this.customers.findIndex(c => c.phone === phone);

        if (existingIdx >= 0) {
          const cust = this.customers[existingIdx];
          cust.name = displayName;
          cust.jobTitle = jobTitle;
          cust.salary = salary;
          cust.location = location;
          cust.postCount = postCount;
          cust.groupNames = groupNames;
          cust.groupName = groupNames[0] || cust.groupName;
          cust.postUrl = latestPost.postUrl || cust.postUrl;
          cust.notes = notes;
          cust.updatedAt = postedAt;
          cust.source = 'facebook_group';
          if (cust.status === 'NEW' && postCount > 1) {
            cust.status = 'VIP_URGENT';
            cust.statusLabel = 'Tuyển Gấp / VIP';
          }
          updated++;
        } else {
          const newCust = {
            id: `cust_fb_${phone}_${Math.random().toString(36).substring(2, 6)}`,
            name: displayName,
            phone: phone,
            channel: 'Facebook Group',
            channelIcon: 'fa-solid fa-users',
            status: autoStatus,
            statusLabel: autoStatusLabel,
            orderValue: 0,
            updatedAt: postedAt,
            jobTitle: jobTitle,
            salary: salary,
            location: location,
            postCount: postCount,
            groupNames: groupNames,
            groupName: groupNames[0] || 'Facebook Group',
            postUrl: latestPost.postUrl || '',
            notes: notes,
            source: 'facebook_group',
            rawPostText: latestPost.originalText || latestPost.content || ''
          };
          this.customers.unshift(newCust);
          added++;
        }
      }

      this._save();
      logger.success(`[CRM] Đã đồng bộ ${groupedByPhone.size} khách hàng thực tế từ Facebook Group Scraper (Thêm mới: ${added}, Cập nhật: ${updated})`);
      return { total: this.customers.length, added, updated, syncCount: groupedByPhone.size };
    } catch (err) {
      logger.error(`[CRM] Lỗi đồng bộ từ Group Scraper: ${err.message}`);
      throw err;
    }
  }

  /**
   * Lấy danh sách khách hàng kèm bộ lọc
   */
  getCustomers({ search = '', status = 'ALL', channel = 'ALL' } = {}) {
    let list = [...this.customers];

    if (status && status !== 'ALL') {
      list = list.filter(c => c.status === status);
    }

    if (channel && channel !== 'ALL') {
      list = list.filter(c => c.channel === channel);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.jobTitle || '').toLowerCase().includes(q) ||
        (c.notes || '').toLowerCase().includes(q) ||
        (c.groupName || '').toLowerCase().includes(q)
      );
    }

    return list;
  }

  /**
   * Chuyển một Lead cào từ Facebook Group thành Khách Hàng CRM
   */
  convertFromLead(leadData) {
    if (!leadData) throw new Error('Dữ liệu Lead không hợp lệ!');

    const authorName = (leadData.posterName || leadData.authorName || leadData.author_name || '').trim();
    const employerName = (leadData.employer || leadData.employer_name || leadData.shopName || '').trim();
    let name = '';
    if (authorName && employerName && authorName !== employerName) {
      name = `${authorName} (${employerName})`;
    } else {
      name = employerName || authorName || leadData.name || 'Khách Tuyển Dụng';
    }

    const phone = (leadData.phone || leadData.contactPhone || leadData.contact_phone || '').trim();
    const groupName = (leadData.groupName || leadData.group_name || '').trim();
    const postUrl = (leadData.postUrl || leadData.post_url || '').trim();
    const jobTitle = (leadData.jobTitle || leadData.job_title || '').trim();
    const salary = (leadData.salary || '').trim();
    const location = (leadData.location || leadData.street_address || '').trim();

    // Kiểm tra xem số điện thoại hoặc tên khách đã tồn tại chưa
    const existing = this.customers.find(c => (phone && c.phone === phone) || (postUrl && c.postUrl === postUrl));
    if (existing) {
      existing.updatedAt = new Date().toISOString().split('T')[0];
      existing.postCount = (existing.postCount || 1) + 1;
      if (jobTitle && !existing.notes.includes(jobTitle)) {
        existing.notes = `Tuyển ${jobTitle} (${salary || 'Thỏa thuận'}) tại ${location || 'Toàn quốc'}. ` + existing.notes;
      }
      this._save();
      return { success: true, isExisting: true, customer: existing };
    }

    const newCustomer = {
      id: `cust_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name,
      phone,
      channel: 'Facebook Group',
      channelIcon: 'fa-solid fa-users',
      status: leadData.leadTier === 'GOLD_LEAD' ? 'VIP_URGENT' : 'NEW',
      statusLabel: leadData.leadTier === 'GOLD_LEAD' ? 'Khách VIP' : 'Khách Hàng Mới',
      orderValue: 0,
      updatedAt: new Date().toISOString().split('T')[0],
      jobTitle: jobTitle || 'Nhân sự',
      salary: salary || 'Thỏa thuận',
      location: location || 'Toàn quốc',
      postCount: 1,
      groupNames: groupName ? [groupName] : [],
      groupName,
      postUrl,
      notes: `Vị trí: ${jobTitle || 'Nhân sự'} (${salary || 'Thỏa thuận'}). Địa chỉ: ${location || 'Toàn quốc'}. Thu thập từ nhóm FB: ${groupName || 'Hội nhóm'}.`,
      source: 'facebook_group',
      rawPostText: leadData.originalText || leadData.post_text || ''
    };

    this.customers.unshift(newCustomer);
    this._save();

    logger.success(`Đã chuyển Lead "${name}" (${phone || 'Chưa có SĐT'}) thành Khách Hàng CRM!`);
    return { success: true, isExisting: false, customer: newCustomer };
  }

  /**
   * Cập nhật trạng thái khách hàng (với 10 mã màu)
   */
  updateStatus(id, newStatus, newStatusLabel = '') {
    const cust = this.customers.find(c => c.id === id);
    if (!cust) throw new Error('Không tìm thấy khách hàng!');

    cust.status = newStatus;
    if (newStatusLabel) cust.statusLabel = newStatusLabel;
    cust.updatedAt = new Date().toISOString().split('T')[0];

    this._save();
    return cust;
  }

  /**
   * Cập nhật toàn diện thông tin khách hàng
   */
  updateCustomer(id, patch = {}) {
    const cust = this.customers.find(c => c.id === id);
    if (!cust) throw new Error('Không tìm thấy khách hàng!');

    if (patch.name !== undefined) cust.name = patch.name;
    if (patch.phone !== undefined) cust.phone = patch.phone;
    if (patch.channel !== undefined) cust.channel = patch.channel;
    if (patch.status !== undefined) cust.status = patch.status;
    if (patch.statusLabel !== undefined) cust.statusLabel = patch.statusLabel;
    if (patch.orderValue !== undefined) cust.orderValue = Number(patch.orderValue) || 0;
    if (patch.notes !== undefined) cust.notes = patch.notes;
    cust.updatedAt = new Date().toISOString().split('T')[0];

    this._save();
    return cust;
  }

  /**
   * Xóa một khách hàng
   */
  deleteCustomer(id) {
    const idx = this.customers.findIndex(c => c.id === id);
    if (idx === -1) throw new Error('Không tìm thấy khách hàng để xóa!');
    const deleted = this.customers.splice(idx, 1)[0];
    this._save();
    return deleted;
  }

  /**
   * Lấy thống kê tổng hợp CRM
   */
  getStats() {
    const total = this.customers.length;
    let totalRevenue = 0;
    const byStatus = {
      NEW: 0,
      VIP_URGENT: 0,
      CONSULTING: 0,
      CALLBACK: 0,
      QUOTING: 0,
      PAID: 0,
      LOYAL: 0,
      COMPLAINT: 0,
      POTENTIAL: 0,
      SUPPORT: 0
    };

    this.customers.forEach(c => {
      totalRevenue += Number(c.orderValue) || 0;
      if (byStatus[c.status] !== undefined) {
        byStatus[c.status]++;
      }
    });

    return {
      total,
      totalRevenue,
      byStatus
    };
  }
}

module.exports = new CustomerManager();
