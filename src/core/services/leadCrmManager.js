/**
 * leadCrmManager.js - Quản Lý & Khai Thác Lead CRM Chuyên Nghiệp (Lead Lifecycle Management)
 * Xử lý toàn bộ vòng đời của Lead Facebook Group:
 * Thu thập -> Xác minh -> Bóc tách -> Phân loại -> Tiếp cận -> Theo dõi (Follow-up) -> Chuyển đổi -> CRM
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const customerManager = require('./customerManager');
const scrapedJobsProvider = require('../../modules/recruitment/services/scrapedJobsProvider');

const LEAD_STATUSES = {
  NEW: { code: 'NEW', label: 'Mới thu thập', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', icon: 'fa-solid fa-sparkles' },
  VERIFIED: { code: 'VERIFIED', label: 'Đã xác minh', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', icon: 'fa-solid fa-shield-check' },
  CONTACTED: { code: 'CONTACTED', label: 'Đã liên hệ', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE', icon: 'fa-solid fa-phone-volume' },
  REPLIED: { code: 'REPLIED', label: 'Đã phản hồi', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', icon: 'fa-solid fa-comment-dots' },
  QUALIFIED: { code: 'QUALIFIED', label: 'Đủ tiêu chuẩn', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', icon: 'fa-solid fa-check-double' },
  FOLLOW_UP: { code: 'FOLLOW_UP', label: 'Cần Follow-up', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', icon: 'fa-solid fa-clock-rotate-left' },
  CONVERTED: { code: 'CONVERTED', label: 'Đã chuyển CRM', color: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', icon: 'fa-solid fa-user-check' },
  LOST: { code: 'LOST', label: 'Thất bại', color: '#64748B', bg: '#F8FAFC', border: '#E2E8F0', icon: 'fa-solid fa-xmark' },
  DUPLICATE: { code: 'DUPLICATE', label: 'Trùng lặp', color: '#EA580C', bg: '#FFF7ED', border: '#FFEDD5', icon: 'fa-solid fa-copy' },
  INVALID: { code: 'INVALID', label: 'Không hợp lệ', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', icon: 'fa-solid fa-ban' },
  NO_CONTACT: { code: 'NO_CONTACT', label: 'Không gọi được', color: '#475569', bg: '#F1F5F9', border: '#CBD5E1', icon: 'fa-solid fa-phone-slash' },
  NOT_INTERESTED: { code: 'NOT_INTERESTED', label: 'Từ chối / Hết nhu cầu', color: '#991B1B', bg: '#FEF2F2', border: '#FCA5A5', icon: 'fa-solid fa-thumbs-down' }
};

const DEFAULT_STAFFS = [
  'Nguyễn Văn An (Sale Lead)',
  'Trần Thị Mai (Tư Vấn F&B)',
  'Lê Hoàng Nam (Tư Vấn Tuyển Dụng)',
  'Phạm Quỳnh Như (CSKH)',
  'Quản trị viên'
];

class LeadCrmManager {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/leads_crm.json');
    this.leads = [];
    this.staffs = DEFAULT_STAFFS;
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        this.leads = JSON.parse(raw);
        if (!Array.isArray(this.leads)) this.leads = [];
      } else {
        this.leads = [];
        this._save();
      }
    } catch (err) {
      logger.error(`Lỗi tải dữ liệu leads_crm.json: ${err.message}`);
      this.leads = [];
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.leads, null, 2), 'utf8');
    } catch (err) {
      logger.error(`Lỗi lưu dữ liệu leads_crm.json: ${err.message}`);
    }
  }

  /**
   * Đồng bộ dữ liệu Lead từ bộ quét Scraper Facebook Group
   */
  async syncFromScraper(forceReload = false) {
    try {
      const scrapedJobs = await scrapedJobsProvider.getJobs({ forceReload });
      if (!Array.isArray(scrapedJobs) || scrapedJobs.length === 0) {
        return { total: this.leads.length, added: 0, updated: 0 };
      }

      let added = 0;
      let updated = 0;

      for (const raw of scrapedJobs) {
        const existingIdx = this.leads.findIndex(l => 
          (l.sourceJobId && l.sourceJobId === raw.id) ||
          (l.postUrl && raw.postUrl && l.postUrl === raw.postUrl && l.postUrl !== '#') ||
          (raw.phone && l.phone === raw.phone && raw.phone.length >= 9)
        );

        if (existingIdx >= 0) {
          // Cập nhật thông tin gốc nếu chưa bị sửa đổi thủ công
          const lead = this.leads[existingIdx];
          if (!lead.isManuallyEdited) {
            lead.originalText = raw.originalText || raw.content || lead.originalText;
            lead.postUrl = raw.postUrl || lead.postUrl;
            lead.groupName = raw.groupName || lead.groupName;
            
            // Cập nhật SĐT nếu trước đó bị sót do định dạng dấu chấm/khoảng trắng
            if (!lead.phone) {
              const ext = this.extractLeadInfo(lead.originalText);
              if (ext.phone) lead.phone = ext.phone;
            }

            lead.updatedAt = new Date().toISOString();
            updated++;
          }
        } else {
          // Tạo mới một Lead hoàn chỉnh (chỉ nhận tin có SĐT liên hệ)
          const newLead = this._createLeadFromRaw(raw);
          if (newLead) {
            this.leads.push(newLead);
            added++;
          }
        }
      }

      // LOẠI BỎ TRIỆT ĐỂ: Bất kỳ tin nào không có SĐT đều không lưu trữ/thu thập
      this.leads = this.leads.filter(l => l.phone && l.phone.length >= 9);

      this._save();
      logger.success(`[LEAD_CRM] Đã đồng bộ ${scrapedJobs.length} tin cào -> Thêm mới: ${added}, Cập nhật: ${updated} (Chỉ giữ tin có SĐT)`);
      return { total: this.leads.length, added, updated };
    } catch (err) {
      logger.error(`[LEAD_CRM] Lỗi đồng bộ từ Scraper: ${err.message}`);
      throw err;
    }
  }

  /**
   * Tạo entity Lead chuẩn hóa từ tin cào gốc
   */
  _createLeadFromRaw(raw) {
    const now = new Date().toISOString();
    const id = `lead_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
    
    // Tự động bóc tách thông tin từ văn bản bài viết
    const extracted = this.extractLeadInfo(raw.originalText || raw.content || '');

    const phone = raw.phone || raw.contactPhone || extracted.phone || '';
    
    // YÊU CẦU NGHIỆP VỤ: Không có SĐT liên hệ thì KHÔNG thu thập vì không thể sale
    if (!phone || phone.length < 9) {
      return null;
    }

    const employerName = (raw.employerName && raw.employerName !== 'Doanh Nghiệp / Cơ Sở Tuyển Dụng') 
      ? raw.employerName 
      : (extracted.employerName || raw.employer || 'Cơ sở tuyển dụng');
    const shopName = extracted.shopName || employerName;
    const jobTitle = raw.jobTitle || raw.title || extracted.jobTitle || 'Nhân viên';
    const address = (raw.location && raw.location !== 'Toàn quốc') 
      ? raw.location 
      : (extracted.address || 'Chưa rõ địa chỉ');
    const salary = (raw.salary && raw.salary !== 'Thỏa thuận') 
      ? raw.salary 
      : (extracted.salary || 'Thỏa thuận');
    const quantity = extracted.quantity || 1;
    const demandType = extracted.demandType || 'Linh hoạt / Thỏa thuận';

    // Tính điểm chất lượng Lead (Lead Score 0-100)
    const scoreData = this.calculateLeadScore({
      phone,
      employerName,
      address,
      jobTitle,
      salary,
      originalText: raw.originalText || raw.content || '',
      postedAt: raw.collectedAt || now
    });

    const initialStatus = phone ? 'NEW' : 'VERIFIED';

    return {
      id,
      sourceJobId: raw.id || '',
      posterName: raw.posterName || raw.authorName || 'Nhà tuyển dụng',
      authorUrl: raw.authorUrl || '',
      groupName: raw.groupName || 'Hội nhóm Facebook',
      groupUrl: raw.groupUrl || '',
      postUrl: raw.postUrl || '#',
      originalText: raw.originalText || raw.content || '',
      postedAt: raw.collectedAt || now,
      
      // Dữ liệu đã trích xuất (Editable)
      phone,
      employerName,
      shopName,
      address,
      jobTitle,
      demandType,
      quantity,
      salary,
      isManuallyEdited: false,

      // Trạng thái & Đánh giá
      status: initialStatus,
      statusLabel: LEAD_STATUSES[initialStatus]?.label || 'Mới thu thập',
      leadScore: scoreData.score,
      leadTier: scoreData.tier,
      leadTierLabel: scoreData.tierLabel,
      scoreBreakdown: scoreData.reasons,

      // Phân bổ & Khai thác
      assignedStaff: 'Quản trị viên',
      contactChannel: 'Phone',
      exploitationGoal: 'Tư vấn dịch vụ',
      lastContactedAt: null,
      notes: '',

      // Lịch Follow-up
      nextFollowUpAt: null,
      followUpTime: '',
      followUpNote: '',
      followUpStatus: 'NONE', // NONE, OVERDUE, TODAY, UPCOMING, COMPLETED

      // Liên kết CRM
      crmCustomerId: null,
      isConverted: false,
      duplicateCandidates: [],

      // Activity Timeline
      activities: [
        {
          id: `act_${Date.now().toString(36)}_init`,
          timestamp: now,
          user: 'Hệ thống Scraper',
          action: 'CREATED',
          actionName: 'Thu thập Lead từ nhóm Facebook',
          oldValue: null,
          newValue: initialStatus,
          notes: `Thu thập từ nhóm "${raw.groupName || 'Facebook'}" - Điểm chất lượng khởi tạo: ${scoreData.score}đ (${scoreData.tierLabel})`,
          icon: 'fa-solid fa-cloud-arrow-down',
          color: '#2563EB'
        }
      ],

      createdAt: now,
      updatedAt: now
    };
  }

  /**
   * Bóc tách thông tin tự động thông minh bằng Regex NLP rules
   */
  extractLeadInfo(text = '') {
    if (!text || typeof text !== 'string') {
      return { phone: '', employerName: '', shopName: '', address: '', jobTitle: '', salary: '', quantity: 1, demandType: '' };
    }

    const clean = text.replace(/\r/g, '').trim();

    // 1. Trích xuất SĐT (hỗ trợ di động VN 10 số, đầu 02 cố định, chữ O đầu số, dấu chấm, khoảng trắng, gạch ngang)
    let phone = '';
    const normalizedText = clean.replace(/(?<=\b|[^\d\w])[oO](?=[35789]\d)/g, '0');
    const phoneRegex = /(?:(?:\+84|84|0)[35789]|02\d)[\.\-\s]?\d{2,4}[\.\-\s]?\d{2,4}[\.\-\s]?\d{2,4}\b/g;
    const phoneMatches = normalizedText.match(phoneRegex);
    if (phoneMatches && phoneMatches.length > 0) {
      for (const m of phoneMatches) {
        let digits = m.replace(/\D/g, '');
        if (digits.startsWith('84')) digits = '0' + digits.substring(2);
        if (digits.length === 10 && digits.startsWith('0')) {
          phone = digits;
          break;
        }
        if (digits.length === 11 && digits.startsWith('02')) {
          phone = digits;
          break;
        }
      }
    }

    // 2. Trích xuất Tên quán / Cửa hàng / Công ty
    let employerName = '';
    let shopName = '';
    const shopMatches = clean.match(/(?:quán|cửa hàng|nhà hàng|tiệm|công ty|shop|cafe|cà phê|doanh nghiệp|đơn vị)\s+([^\n,.;\-_!]+)/i);
    if (shopMatches && shopMatches[1]) {
      shopName = shopMatches[0].trim();
      employerName = shopName;
    }

    // 3. Trích xuất Chức danh công việc
    let jobTitle = '';
    const titlePatterns = [
      /(?:cần tuyển|tuyển dụng|tuyển gấp|tìm|tuyển)\s+([^\n,.;\-_!]{3,40})/i,
      /(?:vị trí|chức vụ)[:\s]+([^\n,.;\-_!]{3,35})/i,
      /(?:nhân viên phục vụ|pha chế|thu ngân|phục vụ bàn|sales|nhân viên bán hàng|telesale|kế toán|tạp vụ|bếp|phụ bếp|bảo vệ|tài xế|giao hàng|shipper|marketing)/i
    ];
    for (const pat of titlePatterns) {
      const match = clean.match(pat);
      if (match) {
        jobTitle = (match[1] || match[0]).trim();
        // Cắt bỏ phần dư thừa
        jobTitle = jobTitle.replace(/^(?:nam|nữ|0\d|\d+)\s+/i, '').trim();
        break;
      }
    }
    if (!jobTitle) jobTitle = 'Nhân sự tuyển dụng';

    // 4. Trích xuất Số lượng
    let quantity = 1;
    const qtyMatch = clean.match(/(?:tuyển|cần|số lượng)[:\s]+(\d+)\s*(?:bạn|người|nhân sự|nhân viên|vị trí)?/i) || clean.match(/(\d+)\s*(?:nhân viên|bạn|người)/i);
    if (qtyMatch && qtyMatch[1]) {
      const q = parseInt(qtyMatch[1], 10);
      if (!isNaN(q) && q > 0 && q < 100) quantity = q;
    }

    // 5. Trích xuất Mức lương
    let salary = '';
    const salMatch = clean.match(/(?:lương|thu nhập|thù lao)[:\s]+([^\n.,;!]+(?:tháng|giờ|ca|tr|triệu|k)?)/i) ||
                     clean.match(/(\d+(?:[.,]\d+)?\s*(?:triệu|tr|k|đ|vnd|vnđ|\/giờ|\/tháng|\/ca))/i);
    if (salMatch) {
      salary = salMatch[0].trim();
    }

    // 6. Trích xuất Địa chỉ
    let address = '';
    const addrMatch = clean.match(/(?:địa chỉ|làm tại|khu vực|tại|chi nhánh)[:\s]+([^\n.;!]+)/i);
    if (addrMatch && addrMatch[1]) {
      address = addrMatch[1].trim();
    }

    // 7. Loại nhu cầu (Full-time / Part-time / Ca)
    let demandType = 'Toàn thời gian';
    if (/part[\s-]?time|theo ca|bán thời gian|xoay ca/i.test(clean)) {
      demandType = 'Bán thời gian / Theo ca';
    } else if (/thời vụ|làm tết|ngắn hạn/i.test(clean)) {
      demandType = 'Thời vụ / Ngắn hạn';
    }

    return {
      phone,
      employerName,
      shopName,
      address,
      jobTitle,
      salary,
      quantity,
      demandType
    };
  }

  /**
   * Tính toán điểm chất lượng Lead (Lead Score) theo bộ tiêu chí định lượng
   */
  calculateLeadScore({ phone, employerName, address, jobTitle, salary, originalText, postedAt }) {
    let score = 0;
    const reasons = [];

    // Tiêu chí 1: Có Số điện thoại (+25đ)
    if (phone && phone.length >= 9) {
      score += 25;
      reasons.push({ label: 'Có số điện thoại liên hệ trực tiếp', pts: 25, passed: true });
    } else {
      reasons.push({ label: 'Chưa có số điện thoại liên hệ', pts: 0, passed: false });
    }

    // Tiêu chí 2: Có Tên doanh nghiệp / Quán rõ ràng (+20đ)
    if (employerName && employerName.length > 3 && !employerName.includes('Cơ sở tuyển dụng')) {
      score += 20;
      reasons.push({ label: 'Có tên quán / doanh nghiệp xác định', pts: 20, passed: true });
    } else {
      reasons.push({ label: 'Tên quán/doanh nghiệp chưa rõ ràng', pts: 0, passed: false });
    }

    // Tiêu chí 3: Có Địa chỉ làm việc cụ thể (+15đ)
    if (address && address.length > 5 && address !== 'Chưa rõ địa chỉ') {
      score += 15;
      reasons.push({ label: 'Có địa chỉ làm việc cụ thể', pts: 15, passed: true });
    } else {
      reasons.push({ label: 'Chưa có địa chỉ nơi làm việc', pts: 0, passed: false });
    }

    // Tiêu chí 4: Nhu cầu tuyển dụng & Chức danh rõ (+15đ)
    if (jobTitle && jobTitle.length > 2 && jobTitle !== 'Nhân sự tuyển dụng') {
      score += 15;
      reasons.push({ label: 'Chức danh tuyển dụng rõ ràng', pts: 15, passed: true });
    } else {
      reasons.push({ label: 'Chức danh công việc chung chung', pts: 0, passed: false });
    }

    // Tiêu chí 5: Có mức lương / thu nhập minh bạch (+10đ)
    if (salary && salary !== 'Thỏa thuận' && salary.length > 2) {
      score += 10;
      reasons.push({ label: 'Mức lương & quyền lợi minh bạch', pts: 10, passed: true });
    } else {
      reasons.push({ label: 'Lương thỏa thuận hoặc chưa rõ', pts: 0, passed: false });
    }

    // Tiêu chí 6: Nội dung bài đăng đầy đủ chi tiết (+10đ)
    if (originalText && originalText.length >= 80) {
      score += 10;
      reasons.push({ label: 'Nội dung bài đăng chi tiết, đầy đủ', pts: 10, passed: true });
    } else {
      reasons.push({ label: 'Nội dung bài viết ngắn', pts: 0, passed: false });
    }

    // Tiêu chí 7: Bài đăng mới gần đây (+5đ)
    const postAgeDays = postedAt ? (Date.now() - new Date(postedAt).getTime()) / (1000 * 3600 * 24) : 99;
    if (postAgeDays <= 7) {
      score += 5;
      reasons.push({ label: 'Bài đăng mới trong vòng 7 ngày', pts: 5, passed: true });
    } else {
      reasons.push({ label: 'Bài đăng đã đăng trên 7 ngày', pts: 0, passed: false });
    }

    // Phân tầng Lead
    let tier = 'LOW';
    let tierLabel = 'Lead Thấp (<50đ)';
    if (score >= 85) {
      tier = 'GOLD_LEAD';
      tierLabel = '🎯 Lead Vàng (85-100đ)';
    } else if (score >= 70) {
      tier = 'POTENTIAL_LEAD';
      tierLabel = '⚡ Lead Tiềm Năng (70-84đ)';
    } else if (score >= 50) {
      tier = 'MEDIUM_LEAD';
      tierLabel = 'Lead Trung Bình (50-69đ)';
    }

    return {
      score: Math.min(100, score),
      tier,
      tierLabel,
      reasons
    };
  }

  /**
   * Kiểm tra trùng lặp Lead (Duplicate Detection)
   */
  findDuplicates(targetLead) {
    if (!targetLead) return [];
    const duplicates = [];

    const normPhone = (targetLead.phone || '').replace(/\D/g, '');
    const normFbUrl = (targetLead.authorUrl || targetLead.postUrl || '').toLowerCase();
    const normCompany = (targetLead.employerName || '').toLowerCase().trim();

    for (const other of this.leads) {
      if (other.id === targetLead.id) continue;

      let isDup = false;
      let reason = '';
      let confidence = 0;

      // 1. Trùng số điện thoại
      const otherPhone = (other.phone || '').replace(/\D/g, '');
      if (normPhone && otherPhone && normPhone.length >= 9 && normPhone === otherPhone) {
        isDup = true;
        reason = `Trùng Số Điện Thoại: ${normPhone}`;
        confidence = 100;
      }

      // 2. Trùng Facebook Profile
      const otherFb = (other.authorUrl || '').toLowerCase();
      if (!isDup && normFbUrl && otherFb && normFbUrl !== '#' && normFbUrl === otherFb) {
        isDup = true;
        reason = `Trùng Trang Cá Nhân Facebook: ${other.posterName}`;
        confidence = 90;
      }

      // 3. Trùng tên doanh nghiệp & cùng địa chỉ
      const otherComp = (other.employerName || '').toLowerCase().trim();
      if (!isDup && normCompany && otherComp && normCompany.length > 5 && normCompany === otherComp) {
        isDup = true;
        reason = `Trùng Tên Cơ Sở / Doanh Nghiệp: ${other.employerName}`;
        confidence = 75;
      }

      if (isDup) {
        duplicates.push({
          id: other.id,
          employerName: other.employerName,
          phone: other.phone,
          status: other.status,
          statusLabel: other.statusLabel,
          assignedStaff: other.assignedStaff,
          createdAt: other.createdAt,
          reason,
          confidence
        });
      }
    }

    return duplicates;
  }

  /**
   * Lấy danh sách Lead có hỗ trợ phân trang & bộ lọc nâng cao
   */
  getLeads({
    page = 1,
    limit = 25,
    search = '',
    status = 'ALL',
    tier = 'ALL',
    staff = 'ALL',
    group = 'ALL',
    hasPhone = 'ALL',
    followUpStatus = 'ALL',
    sortBy = 'createdAt',
    sortOrder = 'desc'
  } = {}) {
    // Tự động đồng bộ nếu danh sách đang rỗng
    if (this.leads.length === 0) {
      this.syncFromScraper().catch(() => {});
    }

    // Tự động kiểm tra trạng thái follow-up
    this._updateFollowUpStatuses();

    // CHẶN BẮT BUỘC: Chỉ quản lý & hiển thị các Lead có Số Điện Thoại liên hệ
    let filtered = this.leads.filter(l => l.phone && l.phone.length >= 9);

    // Filter Status
    if (status && status !== 'ALL') {
      filtered = filtered.filter(l => l.status === status);
    }

    // Filter Tier
    if (tier && tier !== 'ALL') {
      if (tier === 'GOLD_LEAD') filtered = filtered.filter(l => l.leadTier === 'GOLD_LEAD');
      else if (tier === 'POTENTIAL_LEAD') filtered = filtered.filter(l => l.leadTier === 'POTENTIAL_LEAD');
      else if (tier === 'MEDIUM_LEAD') filtered = filtered.filter(l => l.leadTier === 'MEDIUM_LEAD');
      else if (tier === 'LOW') filtered = filtered.filter(l => l.leadTier === 'LOW');
    }

    // Filter Staff
    if (staff && staff !== 'ALL') {
      filtered = filtered.filter(l => l.assignedStaff === staff);
    }

    // Filter Group
    if (group && group !== 'ALL') {
      filtered = filtered.filter(l => l.groupName === group);
    }

    // Filter Has Phone
    if (hasPhone === 'YES') {
      filtered = filtered.filter(l => l.phone && l.phone.length >= 9);
    } else if (hasPhone === 'NO') {
      filtered = filtered.filter(l => !l.phone || l.phone.length < 9);
    }

    // Filter Follow-up status
    if (followUpStatus && followUpStatus !== 'ALL') {
      filtered = filtered.filter(l => l.followUpStatus === followUpStatus);
    }

    // Search
    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(l =>
        (l.employerName && l.employerName.toLowerCase().includes(q)) ||
        (l.shopName && l.shopName.toLowerCase().includes(q)) ||
        (l.jobTitle && l.jobTitle.toLowerCase().includes(q)) ||
        (l.phone && l.phone.includes(q)) ||
        (l.posterName && l.posterName.toLowerCase().includes(q)) ||
        (l.address && l.address.toLowerCase().includes(q)) ||
        (l.groupName && l.groupName.toLowerCase().includes(q)) ||
        (l.originalText && l.originalText.toLowerCase().includes(q))
      );
    }

    // Sorting
    filtered.sort((a, b) => {
      let valA = a[sortBy];
      let valB = b[sortBy];
      if (sortBy === 'leadScore') {
        valA = Number(valA) || 0;
        valB = Number(valB) || 0;
      }
      if (valA < valB) return sortOrder === 'asc' ? -1 : 1;
      if (valA > valB) return sortOrder === 'asc' ? 1 : -1;
      return 0;
    });

    const total = filtered.length;
    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, parseInt(limit, 10));
    const startIdx = (pageNum - 1) * limitNum;
    const paged = filtered.slice(startIdx, startIdx + limitNum);

    return {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      data: paged
    };
  }

  /**
   * Cập nhật trạng thái thời gian Follow-up cho các Lead
   */
  _updateFollowUpStatuses() {
    const todayStr = new Date().toISOString().split('T')[0];
    for (const lead of this.leads) {
      if (!lead.nextFollowUpAt) {
        lead.followUpStatus = 'NONE';
        continue;
      }
      if (lead.status === 'CONVERTED' || lead.status === 'LOST' || lead.status === 'INVALID') {
        lead.followUpStatus = 'COMPLETED';
        continue;
      }
      const fuDate = lead.nextFollowUpAt.split('T')[0];
      if (fuDate < todayStr) {
        lead.followUpStatus = 'OVERDUE';
      } else if (fuDate === todayStr) {
        lead.followUpStatus = 'TODAY';
      } else {
        lead.followUpStatus = 'UPCOMING';
      }
    }
  }

  /**
   * Lấy chi tiết một Lead kèm phân tích trùng lặp
   */
  getLeadById(id) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) return null;
    const duplicates = this.findDuplicates(lead);
    return {
      ...lead,
      duplicateCandidates: duplicates
    };
  }

  /**
   * Cập nhật thông tin chi tiết một Lead
   */
  updateLead(id, patch = {}, actor = 'Admin') {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) throw new Error('Không tìm thấy Lead!');

    const now = new Date().toISOString();
    const oldValues = { ...lead };

    if (patch.employerName !== undefined) lead.employerName = patch.employerName;
    if (patch.shopName !== undefined) lead.shopName = patch.shopName;
    if (patch.jobTitle !== undefined) lead.jobTitle = patch.jobTitle;
    if (patch.phone !== undefined) lead.phone = patch.phone;
    if (patch.address !== undefined) lead.address = patch.address;
    if (patch.salary !== undefined) lead.salary = patch.salary;
    if (patch.quantity !== undefined) lead.quantity = Number(patch.quantity) || 1;
    if (patch.demandType !== undefined) lead.demandType = patch.demandType;
    if (patch.assignedStaff !== undefined) lead.assignedStaff = patch.assignedStaff;
    if (patch.contactChannel !== undefined) lead.contactChannel = patch.contactChannel;
    if (patch.exploitationGoal !== undefined) lead.exploitationGoal = patch.exploitationGoal;
    if (patch.notes !== undefined) lead.notes = patch.notes;
    lead.isManuallyEdited = true;

    // Tính toán lại Lead Score nếu các trường cốt lõi thay đổi
    const scoreData = this.calculateLeadScore({
      phone: lead.phone,
      employerName: lead.employerName,
      address: lead.address,
      jobTitle: lead.jobTitle,
      salary: lead.salary,
      originalText: lead.originalText,
      postedAt: lead.postedAt
    });
    lead.leadScore = scoreData.score;
    lead.leadTier = scoreData.tier;
    lead.leadTierLabel = scoreData.tierLabel;
    lead.scoreBreakdown = scoreData.reasons;

    lead.updatedAt = now;

    // Log Activity
    this._addActivity(lead, {
      user: actor,
      action: 'UPDATED',
      actionName: 'Chỉnh sửa thông tin Lead',
      oldValue: `${oldValues.employerName} - ${oldValues.phone}`,
      newValue: `${lead.employerName} - ${lead.phone}`,
      notes: patch.activityNote || 'Cập nhật trường dữ liệu Lead',
      icon: 'fa-solid fa-pen-to-square',
      color: '#0284C7'
    });

    this._save();
    return lead;
  }

  /**
   * Tự động trích xuất lại thông tin từ bài viết gốc
   */
  reExtractLead(id, actor = 'Admin') {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) throw new Error('Không tìm thấy Lead!');

    const extracted = this.extractLeadInfo(lead.originalText || '', lead.postedAt);
    if (extracted.phone) lead.phone = extracted.phone;
    if (extracted.employerName) lead.employerName = extracted.employerName;
    if (extracted.shopName) lead.shopName = extracted.shopName;
    if (extracted.address) lead.address = extracted.address;
    if (extracted.jobTitle) lead.jobTitle = extracted.jobTitle;
    if (extracted.salary) lead.salary = extracted.salary;
    if (extracted.quantity) lead.quantity = extracted.quantity;
    if (extracted.demandType) lead.demandType = extracted.demandType;

    const scoreData = this.calculateLeadScore({
      phone: lead.phone,
      employerName: lead.employerName,
      address: lead.address,
      jobTitle: lead.jobTitle,
      salary: lead.salary,
      originalText: lead.originalText,
      postedAt: lead.postedAt
    });
    lead.leadScore = scoreData.score;
    lead.leadTier = scoreData.tier;
    lead.leadTierLabel = scoreData.tierLabel;
    lead.scoreBreakdown = scoreData.reasons;
    lead.updatedAt = new Date().toISOString();

    this._addActivity(lead, {
      user: actor,
      action: 'RE_EXTRACTED',
      actionName: 'Bóc tách lại thông tin NLP',
      oldValue: null,
      newValue: null,
      notes: 'Đã phân tích lại bài đăng Facebook và cập nhật dữ liệu tự động',
      icon: 'fa-solid fa-wand-magic-sparkles',
      color: '#7C3AED'
    });

    this._save();
    return lead;
  }

  /**
   * Thay đổi trạng thái Lead (có ghi nhận lịch sử)
   */
  updateLeadStatus(id, newStatusCode, reason = '', actor = 'Admin', notes = '') {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) throw new Error('Không tìm thấy Lead!');

    const targetStatus = LEAD_STATUSES[newStatusCode];
    if (!targetStatus) throw new Error(`Trạng thái không hợp lệ: ${newStatusCode}`);

    const oldStatus = lead.status;
    const oldStatusLabel = lead.statusLabel;

    // Business Rule 1: Không được đánh dấu Qualified nếu không có thông tin liên hệ
    if (newStatusCode === 'QUALIFIED' && (!lead.phone || lead.phone.length < 9)) {
      throw new Error('Không thể đánh dấu Qualified: Lead chưa có Số điện thoại liên hệ!');
    }

    lead.status = newStatusCode;
    lead.statusLabel = targetStatus.label;
    lead.updatedAt = new Date().toISOString();

    // Log Activity
    this._addActivity(lead, {
      user: actor,
      action: 'STATUS_CHANGED',
      actionName: `Chuyển trạng thái sang "${targetStatus.label}"`,
      oldValue: oldStatusLabel,
      newValue: targetStatus.label,
      notes: reason ? `${reason}. ${notes}` : (notes || `Cập nhật từ ${oldStatusLabel} -> ${targetStatus.label}`),
      icon: targetStatus.icon || 'fa-solid fa-arrows-spin',
      color: targetStatus.color || '#2563EB'
    });

    this._save();
    return lead;
  }

  /**
   * Ghi nhận lượt liên hệ Lead
   */
  recordContact(id, { channel = 'Phone', notes = '', actor = 'Admin', nextFollowUp = null } = {}) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) throw new Error('Không tìm thấy Lead!');

    const now = new Date().toISOString();
    lead.lastContactedAt = now;
    lead.contactChannel = channel;
    
    // Tự động chuyển status sang CONTACTED nếu đang là NEW hoặc VERIFIED
    if (lead.status === 'NEW' || lead.status === 'VERIFIED') {
      lead.status = 'CONTACTED';
      lead.statusLabel = LEAD_STATUSES.CONTACTED.label;
    }

    if (nextFollowUp) {
      lead.nextFollowUpAt = nextFollowUp.date;
      lead.followUpTime = nextFollowUp.time || '09:00';
      lead.followUpNote = nextFollowUp.note || 'Gọi lại chăm sóc khách hàng';
    }

    this._addActivity(lead, {
      user: actor,
      action: 'CONTACTED',
      actionName: `Liên hệ qua ${channel}`,
      oldValue: null,
      newValue: channel,
      notes: notes || `Đã tiếp cận khách hàng qua kênh ${channel}`,
      icon: 'fa-solid fa-phone-volume',
      color: '#4F46E5'
    });

    lead.updatedAt = now;
    this._save();
    return lead;
  }

  /**
   * Đặt lịch Follow-up cho Lead
   */
  scheduleFollowUp(id, { date, time = '09:00', note = '', actor = 'Admin' } = {}) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) throw new Error('Không tìm thấy Lead!');

    if (!date) throw new Error('Vui lòng chọn ngày Follow-up!');

    lead.nextFollowUpAt = date;
    lead.followUpTime = time;
    lead.followUpNote = note;
    lead.status = 'FOLLOW_UP';
    lead.statusLabel = LEAD_STATUSES.FOLLOW_UP.label;
    lead.updatedAt = new Date().toISOString();

    this._addActivity(lead, {
      user: actor,
      action: 'FOLLOW_UP_SCHEDULED',
      actionName: `Lên lịch Follow-up: ${date} lúc ${time}`,
      oldValue: null,
      newValue: `${date} ${time}`,
      notes: note || 'Lên lịch hẹn tái liên hệ',
      icon: 'fa-solid fa-calendar-check',
      color: '#D97706'
    });

    this._save();
    return lead;
  }

  /**
   * Chuyển đổi Lead thành Khách Hàng CRM (Customer)
   */
  convertToCustomer(id, { actor = 'Admin', customData = {} } = {}) {
    const lead = this.leads.find(l => l.id === id);
    if (!lead) throw new Error('Không tìm thấy Lead!');

    // Business Rule 2: Kiểm tra dữ liệu hợp lệ trước khi Convert
    if (!lead.employerName && !lead.shopName) {
      throw new Error('Lead chưa có thông tin Tên quán hoặc Doanh nghiệp để chuyển đổi!');
    }

    const customerPayload = {
      name: customData.customerName || lead.employerName || lead.posterName || 'Khách Hàng Tuyển Dụng',
      phone: customData.phone || lead.phone || '',
      channel: lead.contactChannel || 'Facebook Group',
      status: lead.leadTier === 'GOLD_LEAD' ? 'VIP_URGENT' : 'NEW',
      statusLabel: lead.leadTier === 'GOLD_LEAD' ? 'Khách VIP' : 'Khách Hàng Mới',
      orderValue: Number(customData.orderValue) || 0,
      notes: customData.notes || `Chuyển đổi từ Lead: ${lead.jobTitle} - ${lead.address}. Nhóm FB: ${lead.groupName}`,
      groupName: lead.groupName,
      postUrl: lead.postUrl,
      source: 'facebook_group',
      rawPostText: lead.originalText
    };

    const convertRes = customerManager.convertFromLead(customerPayload);
    const customer = convertRes.customer;

    lead.status = 'CONVERTED';
    lead.statusLabel = LEAD_STATUSES.CONVERTED.label;
    lead.isConverted = true;
    lead.crmCustomerId = customer ? customer.id : null;
    lead.updatedAt = new Date().toISOString();

    this._addActivity(lead, {
      user: actor,
      action: 'CONVERTED',
      actionName: 'Chuyển đổi thành Khách Hàng CRM',
      oldValue: lead.statusLabel,
      newValue: 'Khách Hàng CRM',
      notes: convertRes.isExisting 
        ? `Đã liên kết với Khách hàng sẵn có "${customer.name}" (${customer.phone})`
        : `Tạo mới Khách hàng "${customer.name}" trong CRM (Mã: ${customer.id})`,
      icon: 'fa-solid fa-crown',
      color: '#16A34A'
    });

    this._save();
    return {
      lead,
      customer,
      isExistingCustomer: convertRes.isExisting
    };
  }

  /**
   * Gộp 2 Lead bị trùng (Lead phụ chuyển thành DUPLICATE và trỏ tới Lead chính)
   */
  mergeLeads(primaryId, duplicateId, actor = 'Admin') {
    const primary = this.leads.find(l => l.id === primaryId);
    const duplicate = this.leads.find(l => l.id === duplicateId);

    if (!primary || !duplicate) throw new Error('Không tìm thấy Lead để gộp!');

    // Giữ lại số điện thoại và thông tin phụ nếu primary còn thiếu
    if (!primary.phone && duplicate.phone) primary.phone = duplicate.phone;
    if (!primary.address && duplicate.address) primary.address = duplicate.address;
    if (!primary.salary && duplicate.salary) primary.salary = duplicate.salary;

    // Gộp toàn bộ hoạt động từ duplicate sang primary
    const mergedActivities = (duplicate.activities || []).map(a => ({
      ...a,
      notes: `[Gộp từ Lead ${duplicate.id}]: ${a.notes || ''}`
    }));
    primary.activities = [...primary.activities, ...mergedActivities];

    // Chuyển trạng thái Lead phụ thành DUPLICATE
    duplicate.status = 'DUPLICATE';
    duplicate.statusLabel = 'Trùng lặp';
    duplicate.mergedIntoLeadId = primary.id;
    duplicate.updatedAt = new Date().toISOString();

    this._addActivity(primary, {
      user: actor,
      action: 'MERGED',
      actionName: `Gộp dữ liệu từ Lead trùng #${duplicate.id}`,
      oldValue: null,
      newValue: `Gộp từ ${duplicate.id}`,
      notes: `Đã tích hợp toàn bộ lịch sử và dữ liệu từ Lead trùng ${duplicate.id}`,
      icon: 'fa-solid fa-code-merge',
      color: '#EA580C'
    });

    this._save();
    return { primary, duplicate };
  }

  /**
   * Bulk Actions (Hành động hàng loạt)
   */
  bulkAssign(ids, staffName, actor = 'Admin') {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    let count = 0;
    for (const id of ids) {
      const lead = this.leads.find(l => l.id === id);
      if (lead) {
        const old = lead.assignedStaff;
        lead.assignedStaff = staffName;
        lead.updatedAt = new Date().toISOString();
        this._addActivity(lead, {
          user: actor,
          action: 'ASSIGNED',
          actionName: `Gán nhân viên: ${staffName}`,
          oldValue: old,
          newValue: staffName,
          notes: 'Phân bổ nhân viên qua thao tác hàng loạt (Bulk)',
          icon: 'fa-solid fa-user-tag',
          color: '#2563EB'
        });
        count++;
      }
    }
    this._save();
    return count;
  }

  bulkStatus(ids, newStatusCode, reason = '', actor = 'Admin') {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const targetStatus = LEAD_STATUSES[newStatusCode];
    if (!targetStatus) throw new Error('Trạng thái không hợp lệ!');

    let count = 0;
    for (const id of ids) {
      const lead = this.leads.find(l => l.id === id);
      if (lead) {
        const oldLabel = lead.statusLabel;
        lead.status = newStatusCode;
        lead.statusLabel = targetStatus.label;
        lead.updatedAt = new Date().toISOString();
        this._addActivity(lead, {
          user: actor,
          action: 'STATUS_CHANGED',
          actionName: `Đổi trạng thái sang "${targetStatus.label}"`,
          oldValue: oldLabel,
          newValue: targetStatus.label,
          notes: reason || 'Chuyển trạng thái hàng loạt (Bulk)',
          icon: targetStatus.icon || 'fa-solid fa-check',
          color: targetStatus.color || '#2563EB'
        });
        count++;
      }
    }
    this._save();
    return count;
  }

  bulkConvert(ids, actor = 'Admin') {
    if (!Array.isArray(ids) || ids.length === 0) return { converted: 0, failed: 0 };
    let converted = 0;
    let failed = 0;
    for (const id of ids) {
      try {
        this.convertToCustomer(id, { actor });
        converted++;
      } catch (err) {
        failed++;
      }
    }
    return { converted, failed };
  }

  bulkDelete(ids, actor = 'Admin') {
    if (!Array.isArray(ids) || ids.length === 0) return 0;
    const initialLen = this.leads.length;
    this.leads = this.leads.filter(l => !ids.includes(l.id));
    const deleted = initialLen - this.leads.length;
    this._save();
    logger.info(`[LEAD_CRM] Đã xóa ${deleted} Lead bởi ${actor}`);
    return deleted;
  }

  /**
   * Pipeline / Kanban Data
   */
  getPipeline() {
    this._updateFollowUpStatuses();
    const columns = [
      { id: 'NEW', title: 'Mới thu thập', color: '#2563EB', leads: [] },
      { id: 'VERIFIED', title: 'Đã xác minh', color: '#0284C7', leads: [] },
      { id: 'CONTACTED', title: 'Đã liên hệ', color: '#4F46E5', leads: [] },
      { id: 'REPLIED', title: 'Đã phản hồi', color: '#7C3AED', leads: [] },
      { id: 'QUALIFIED', title: 'Đủ tiêu chuẩn', color: '#0D9488', leads: [] },
      { id: 'FOLLOW_UP', title: 'Cần Chăm Sóc Lại', color: '#D97706', leads: [] },
      { id: 'CONVERTED', title: 'Đã Chuyển Sang CRM', color: '#16A34A', leads: [] },
      { id: 'LOST', title: 'Thất bại', color: '#64748B', leads: [] }
    ];

    const colMap = {};
    columns.forEach(c => colMap[c.id] = c);

    for (const lead of this.leads) {
      if (colMap[lead.status]) {
        colMap[lead.status].leads.push({
          id: lead.id,
          employerName: lead.employerName,
          jobTitle: lead.jobTitle,
          phone: lead.phone,
          leadScore: lead.leadScore,
          leadTier: lead.leadTier,
          assignedStaff: lead.assignedStaff,
          followUpStatus: lead.followUpStatus,
          nextFollowUpAt: lead.nextFollowUpAt,
          salary: lead.salary
        });
      }
    }

    return columns;
  }

  /**
   * Thống kê KPI tổng hợp toàn hệ thống
   */
  getStats() {
    this._updateFollowUpStatuses();
    const total = this.leads.length;
    let newCount = 0;
    let goldCount = 0;
    let potentialCount = 0;
    let contactedCount = 0;
    let repliedCount = 0;
    let qualifiedCount = 0;
    let convertedCount = 0;
    let todayFollowUp = 0;
    let overdueFollowUp = 0;

    for (const l of this.leads) {
      if (l.status === 'NEW') newCount++;
      if (l.leadTier === 'GOLD_LEAD') goldCount++;
      if (l.leadTier === 'POTENTIAL_LEAD') potentialCount++;
      if (l.status === 'CONTACTED') contactedCount++;
      if (l.status === 'REPLIED') repliedCount++;
      if (l.status === 'QUALIFIED') qualifiedCount++;
      if (l.status === 'CONVERTED') convertedCount++;

      if (l.followUpStatus === 'TODAY') todayFollowUp++;
      if (l.followUpStatus === 'OVERDUE') overdueFollowUp++;
    }

    const conversionRate = total > 0 ? Number(((convertedCount / total) * 100).toFixed(1)) : 0;
    const contactRate = total > 0 ? Number((((contactedCount + repliedCount + qualifiedCount + convertedCount) / total) * 100).toFixed(1)) : 0;

    return {
      total,
      newCount,
      goldCount,
      potentialCount,
      contactedCount,
      repliedCount,
      qualifiedCount,
      convertedCount,
      conversionRate,
      contactRate,
      todayFollowUp,
      overdueFollowUp
    };
  }

  /**
   * Helper thêm Activity Log
   */
  _addActivity(lead, { user = 'Admin', action = 'UPDATED', actionName = '', oldValue = null, newValue = null, notes = '', icon = 'fa-solid fa-clock', color = '#64748B' } = {}) {
    if (!lead.activities) lead.activities = [];
    const act = {
      id: `act_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      user,
      action,
      actionName: actionName || action,
      oldValue,
      newValue,
      notes,
      icon,
      color
    };
    lead.activities.unshift(act);
    if (lead.activities.length > 50) {
      lead.activities = lead.activities.slice(0, 50);
    }
  }

  /**
   * RADAR DÒ LEAD (LEAD RADAR)
   * Khu vực chuyên biệt phát hiện các Lead đáng xử lý ngay hôm nay:
   * - Hot Lead (Điểm cao >= 85, có SĐT)
   * - Tăng Đột Biến (Hiring Spike / Đăng nhiều bài trên nhiều nhóm)
   * - Tuyển Gấp / Đi làm ngay (Urgent Hiring)
   * - Tuyển Đa Chi Nhánh / Đa Tỉnh (Multi-location)
   * - Tuyển Số Lượng Lớn (Mass Hiring)
   */
  getLeadRadar({ filter = 'ALL' } = {}) {
    const radarItems = [];

    for (const l of this.leads) {
      if (!l.phone || l.phone.length < 9) continue; // Bắt buộc có SĐT để sale

      const signals = [];
      const textLower = (l.originalText || '').toLowerCase();
      const titleLower = (l.jobTitle || '').toLowerCase();

      // 1. Tín hiệu Tuyển Gấp
      if (textLower.includes('gấp') || textLower.includes('ngay trong ngày') || textLower.includes('đi làm ngay') || titleLower.includes('gấp')) {
        signals.push({ code: 'URGENT_HIRING', label: 'Tuyển Gấp / Nhận Việc Ngay', color: '#DC2626', bg: '#FEF2F2' });
      }

      // 2. Tín hiệu Tuyển Đa Nhóm / Đăng Nhiều Lần (Hiring Spike)
      if (l.duplicateCandidates && l.duplicateCandidates.length > 0) {
        signals.push({ code: 'HIRING_SPIKE', label: `Đăng ${l.duplicateCandidates.length + 1} Lần Đa Nhóm`, color: '#D97706', bg: '#FFFBEB' });
      }

      // 3. Tín hiệu Tuyển Số Lượng Lớn (Mass Hiring)
      const qty = Number(l.quantity) || 1;
      if (qty >= 3 || textLower.includes('số lượng lớn') || textLower.includes('cần tuyển 10') || textLower.includes('cần tuyển 5') || textLower.includes('tuyển 05')) {
        signals.push({ code: 'MASS_HIRING', label: `Tuyển Số Lượng Lớn (${qty >= 3 ? qty : 'Nhiều'} nhân sự)`, color: '#7C3AED', bg: '#F5F3FF' });
      }

      // 4. Tín hiệu Tuyển Đa Chi Nhánh / Đa Điểm
      if (textLower.includes('chi nhánh') || textLower.includes('hà nội') && textLower.includes('hồ chí minh') || textLower.includes('các quận') || textLower.includes('hệ thống')) {
        signals.push({ code: 'MULTI_LOCATION', label: 'Tuyển Hệ Thống / Đa Điểm', color: '#0284C7', bg: '#F0F9FF' });
      }

      // Mặc định luôn có ít nhất 1 tín hiệu tiềm năng nếu điểm cao
      if (signals.length === 0 && l.leadScore >= 80) {
        signals.push({ code: 'HIGH_SCORE', label: 'Lead Tiềm Năng Cao', color: '#16A34A', bg: '#F0FDF4' });
      }

      // Đánh giá mức độ ưu tiên
      let priority = 'NORMAL';
      if (l.leadScore >= 85 || signals.some(s => s.code === 'URGENT_HIRING')) {
        priority = 'HOT';
      } else if (l.leadScore >= 70 || signals.length >= 2) {
        priority = 'HIGH';
      }

      // Lọc theo bộ lọc người dùng
      if (filter === 'HOT' && priority !== 'HOT') continue;
      if (filter === 'URGENT' && !signals.some(s => s.code === 'URGENT_HIRING')) continue;
      if (filter === 'SPIKE' && !signals.some(s => s.code === 'HIRING_SPIKE')) continue;
      if (filter === 'MASS' && !signals.some(s => s.code === 'MASS_HIRING')) continue;

      radarItems.push({
        id: l.id,
        companyName: l.employerName || l.shopName || l.posterName || 'Khách Tuyển Dụng',
        posterName: l.posterName,
        phone: l.phone,
        zaloLink: `https://zalo.me/${l.phone}`,
        jobTitle: l.jobTitle,
        salary: l.salary,
        address: l.address,
        groupName: l.groupName,
        postUrl: l.postUrl,
        leadScore: l.leadScore,
        leadTier: l.leadTier,
        leadTierLabel: l.leadTierLabel,
        signals,
        priority,
        status: l.status,
        statusLabel: l.statusLabel,
        assignedStaff: l.assignedStaff,
        postedAt: l.postedAt ? l.postedAt.split('T')[0] : 'Hôm nay',
        whyThisLead: `Doanh nghiệp có nhu cầu "${l.jobTitle}" rõ ràng, số điện thoại ${l.phone} sẵn sàng kết nối Zalo. Điểm chất lượng ${l.leadScore}đ với tín hiệu tuyển dụng thực tế.`,
        recommendedAction: priority === 'HOT' ? 'Nên mở Chat Zalo hoặc gọi điện ngay hôm nay' : 'Theo dõi tư vấn theo kịch bản tuyển dụng'
      });
    }

    // Sắp xếp ưu tiên: HOT trước, sau đó theo điểm Lead Score giảm dần
    radarItems.sort((a, b) => {
      if (a.priority === 'HOT' && b.priority !== 'HOT') return -1;
      if (b.priority === 'HOT' && a.priority !== 'HOT') return 1;
      return b.leadScore - a.leadScore;
    });

    return radarItems;
  }

  /**
   * HỒ SƠ DOANH NGHIỆP 360° (COMPANY 360)
   * Tổng hợp toàn bộ dữ liệu đa chiều của doanh nghiệp:
   * - Thông tin doanh nghiệp
   * - Hồ sơ tuyển dụng (tất cả các bài đăng đã cào)
   * - Danh sách người liên hệ (Contacts)
   * - Đơn hàng & Dịch vụ đã mua
   * - Lịch sử hoạt động (Activity Timeline)
   * - Trợ lý AI gợi ý hành động tiếp theo
   */
  getCompany360(id) {
    const lead = this.leads.find(l => l.id === id || l.phone === id);
    if (!lead) throw new Error('Không tìm thấy thông tin doanh nghiệp!');

    // Gom tất cả bài đăng có cùng SĐT hoặc cùng tên cơ sở
    const relatedPosts = this.leads.filter(l => 
      (lead.phone && l.phone === lead.phone) || 
      (lead.employerName && l.employerName === lead.employerName)
    ).map(p => ({
      id: p.id,
      jobTitle: p.jobTitle,
      salary: p.salary,
      groupName: p.groupName,
      postedAt: p.postedAt ? p.postedAt.split('T')[0] : '',
      postUrl: p.postUrl,
      snippet: p.originalText ? p.originalText.substring(0, 150) + '...' : ''
    }));

    // Danh sách liên hệ (Contacts)
    const contacts = [
      {
        name: lead.posterName || 'Người Đăng Bài Tuyển Dụng',
        role: 'Phụ trách tuyển dụng / Hotline',
        phone: lead.phone,
        zalo: `https://zalo.me/${lead.phone}`,
        isPrimary: true
      }
    ];

    // Trợ lý AI: Tóm tắt & Gợi ý bước đi tiếp theo
    const aiInsight = {
      summary: `${lead.employerName || lead.shopName || 'Doanh nghiệp'} hiện đang tuyển vị trí "${lead.jobTitle}" với mức lương "${lead.salary}". Có ${relatedPosts.length} bài đăng tuyển dụng được ghi nhận trên các hội nhóm Facebook.`,
      whyThisLead: `Khách hàng có nhu cầu tuyển dụng thực tế, thông tin SĐT ${lead.phone} rõ ràng. Đạt ${lead.leadScore}/100 điểm tiềm năng.`,
      nextBestAction: lead.status === 'NEW' 
        ? 'Gửi kịch bản chào hàng gói Đẩy Tin VIP qua Zalo, đề xuất giải pháp tìm ứng viên nhanh trong 24h.'
        : 'Gọi điện xác nhận tiến độ phỏng vấn và gửi báo giá ưu đãi tháng.',
      upsellPitch: relatedPosts.length >= 2 
        ? 'Doanh nghiệp đăng tuyển nhiều lần chứng tỏ đang thiếu người kéo dài, cơ hội chốt Gói Combo Tháng (7.5M) rất cao.' 
        : 'Nên đề xuất dùng thử Gói Đẩy Tin VIP 7 ngày (1.5M - 3.5M).'
    };

    return {
      company: {
        id: lead.id,
        name: lead.employerName || lead.shopName || lead.posterName,
        phone: lead.phone,
        address: lead.address,
        jobTitle: lead.jobTitle,
        salary: lead.salary,
        leadScore: lead.leadScore,
        leadTier: lead.leadTierLabel,
        status: lead.statusLabel,
        assignedStaff: lead.assignedStaff,
        groupName: lead.groupName,
        postUrl: lead.postUrl
      },
      hiringProfile: {
        totalPosts: relatedPosts.length,
        posts: relatedPosts
      },
      contacts,
      activities: lead.activities || [],
      aiInsight
    };
  }

  /**
   * Gom nhóm thực thể doanh nghiệp & Chống trùng lặp (Company Deduplication / Entity Resolution)
   */
  getGroupedCompanies() {
    const companyMap = new Map();

    for (const lead of this.leads) {
      if (lead.status === 'INVALID' || lead.status === 'DUPLICATE') continue;

      const normPhone = (lead.phone || '').replace(/\D/g, '');
      const normName = (lead.employerName || lead.shopName || lead.posterName || '').trim().toLowerCase();

      // Khóa gom nhóm: ưu tiên theo SĐT nếu có, nếu không theo tên
      const groupKey = normPhone && normPhone.length >= 9 
        ? `phone_${normPhone}` 
        : (normName ? `name_${normName}` : `lead_${lead.id}`);

      if (!companyMap.has(groupKey)) {
        companyMap.set(groupKey, {
          companyKey: groupKey,
          primaryId: lead.id,
          companyName: lead.employerName || lead.shopName || lead.posterName || 'Khách Tuyển Dụng',
          phone: lead.phone || '',
          address: lead.address || 'Toàn quốc',
          jobTitles: new Set(),
          groupNames: new Set(),
          posts: [],
          totalScore: 0,
          latestPostAt: lead.postedAt || lead.createdAt,
          leadStatuses: new Set(),
          contacts: new Map()
        });
      }

      const comp = companyMap.get(groupKey);
      if (lead.jobTitle) comp.jobTitles.add(lead.jobTitle);
      if (lead.groupName) comp.groupNames.add(lead.groupName);
      if (lead.status) comp.leadStatuses.add(lead.status);
      comp.totalScore += (lead.leadScore || 50);

      if (lead.posterName) {
        comp.contacts.set(lead.posterName, {
          name: lead.posterName,
          phone: lead.phone || '',
          role: 'Người đăng tuyển dụng',
          facebookUrl: lead.authorUrl || lead.posterFacebookUrl || ''
        });
      }

      comp.posts.push({
        id: lead.id,
        jobTitle: lead.jobTitle,
        salary: lead.salary,
        address: lead.address,
        groupName: lead.groupName,
        postUrl: lead.postUrl,
        postedAt: lead.postedAt ? lead.postedAt.split('T')[0] : 'Hôm nay',
        leadScore: lead.leadScore,
        status: lead.status,
        statusLabel: lead.statusLabel,
        originalText: lead.originalText
      });

      if (lead.postedAt && (!comp.latestPostAt || new Date(lead.postedAt) > new Date(comp.latestPostAt))) {
        comp.latestPostAt = lead.postedAt;
      }
    }

    const companies = [];
    for (const [key, comp] of companyMap.entries()) {
      const postCount = comp.posts.length;
      const groupCount = comp.groupNames.size;
      const avgScore = Math.round(comp.totalScore / postCount);
      const isSpike = postCount > 1 || groupCount > 1;

      let healthStatus = 'HEALTHY';
      let healthLabel = 'Khỏe Mạnh';
      if (comp.leadStatuses.has('LOST')) {
        healthStatus = 'AT_RISK';
        healthLabel = 'Nguy Cơ Mất Khách';
      } else if (comp.leadStatuses.has('FOLLOW_UP') || comp.leadStatuses.has('NEW')) {
        healthStatus = 'ATTENTION';
        healthLabel = 'Cần Chăm Sóc';
      }

      companies.push({
        companyKey: key,
        primaryId: comp.primaryId,
        companyName: comp.companyName,
        phone: comp.phone,
        address: comp.address,
        postCount,
        groupCount,
        isSpike,
        avgScore,
        uniqueGroups: Array.from(comp.groupNames),
        jobTitles: Array.from(comp.jobTitles),
        latestPostAt: comp.latestPostAt ? comp.latestPostAt.split('T')[0] : 'Hôm nay',
        leads: comp.posts,
        contacts: Array.from(comp.contacts.values()),
        healthStatus,
        healthLabel,
        aiSummary: isSpike
          ? `Doanh nghiệp đang tuyển cấp tập: Đã đăng ${postCount} bài trên ${groupCount} nhóm Facebook khác nhau. Nhu cầu tuyển cực cao!`
          : `Doanh nghiệp tuyển "${Array.from(comp.jobTitles).join(', ') || 'nhân sự'}". Điểm tiềm năng ${avgScore}đ.`,
        nextAction: isSpike 
          ? 'Ưu tiên kết nối Zalo ngay, tư vấn Gói Combo Tháng / Ghim bài đa nhóm'
          : 'Gửi kịch bản chào hàng dịch vụ tuyển dụng qua Phone / Zalo'
      });
    }

    companies.sort((a, b) => (b.postCount * 100 + b.avgScore) - (a.postCount * 100 + a.avgScore));
    return companies;
  }
}

module.exports = new LeadCrmManager();

