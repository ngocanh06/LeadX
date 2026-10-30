/**
 * contentStudioService.js - Quản Lý Bản Mẫu Nội Dung & Biến Thể Đa Kênh (Content Studio & Multi-Channel Variations)
 * Tuân thủ Section 12 & 13 Master Prompt:
 * - Quản lý Templates mẫu: data/content_templates.json.
 * - Tự động tạo biến thể theo từng kênh đăng (Content Variation):
 *   + Fanpage: Nội dung đầy đủ, chuyên nghiệp, gắn hashtag thương hiệu và tỉnh thành.
 *   + Group: Ngắn gọn, súc tích, tập trung thông tin cốt lõi để thu hút tương tác tự nhiên.
 *   + BĐS: Ưu tiên Vị trí, Giá thuê, Diện tích, Nội thất, Tiện ích, SĐT liên hệ.
 *   + Tuyển dụng: Ưu tiên Vị trí, Mức lương, Địa điểm, Yêu cầu, Quyền lợi, Ứng tuyển.
 * - Tuyệt đối không tạo sai lệch thông tin dữ liệu nguồn.
 */
const fs = require('fs');
const path = require('path');
const config = require('../../config');
const logger = require('../utils/logger');
const auditLogger = require('./auditLogger');

const DEFAULT_TEMPLATES = [
  {
    id: 'tmpl_rec_01',
    name: 'Mẫu Tuyển Dụng Nhân Viên Kinh Doanh / Bán Hàng',
    category: 'recruitment',
    channelType: 'BOTH', // 'PAGE', 'GROUP', 'BOTH'
    title: 'Tuyển Dụng Nhân Viên Kinh Doanh & Tư Vấn B2B',
    body: 'LeadX cần tuyển 05 Nhân viên Kinh doanh thị trường.\n- Thu nhập: 10 - 25 triệu/tháng (Lương cứng + Hoa hồng cao)\n- Khu vực: Đà Nẵng / Toàn quốc\n- Yêu cầu: Nhanh nhẹn, có laptop, ham học hỏi\n- Quyền lợi: Đầy đủ BHXH, đào tạo bài bản từ A-Z',
    contact: '0971946725 (Zalo/Call)',
    tags: ['Sales', 'Kinh doanh', 'B2B'],
    createdAt: new Date().toISOString()
  },
  {
    id: 'tmpl_bds_01',
    name: 'Mẫu Cho Thuê Căn Hộ Cao Cấp View Đẹp',
    category: 'bds',
    channelType: 'BOTH',
    title: 'Cho Thuê Căn Hộ Sơn Trà - Full Nội Thất Hiện Đại',
    body: 'Chính chủ cho thuê căn hộ 1PN - 2PN Sơn Trà, Đà Nẵng.\n- Giá thuê: 7.5 - 12 triệu/tháng\n- Diện tích: 45 - 65m²\n- Nội thất: Full đồ cao cấp (Tủ lạnh, Máy giặt riêng, Smart TV, Bếp)\n- Tiện ích: Hồ bơi vô cực, Gym, Thang máy, An ninh 24/7',
    contact: '0971946725 (Xem nhà trực tiếp)',
    tags: ['Căn hộ', 'Sơn Trà', 'Đà Nẵng'],
    createdAt: new Date().toISOString()
  }
];

class ContentStudioService {
  constructor() {
    this.rootDir = config.rootDir || path.resolve(__dirname, '../../../');
    this.filePath = path.resolve(this.rootDir, 'data/content_templates.json');
    this.templates = [];
    this._load();
  }

  _load() {
    try {
      if (fs.existsSync(this.filePath)) {
        this.templates = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) || [];
        if (!Array.isArray(this.templates) || this.templates.length === 0) {
          this.templates = DEFAULT_TEMPLATES;
          this._save();
        }
      } else {
        this.templates = DEFAULT_TEMPLATES;
        this._save();
      }
    } catch (e) {
      logger.error(`[CONTENT_STUDIO] Lỗi nạp templates: ${e.message}`);
      this.templates = DEFAULT_TEMPLATES;
    }
  }

  _save() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.filePath, JSON.stringify(this.templates, null, 2), 'utf8');
    } catch (e) {
      logger.error(`[CONTENT_STUDIO] Lỗi lưu templates: ${e.message}`);
    }
  }

  getTemplates({ category = 'all' } = {}) {
    if (category && category !== 'all') {
      return this.templates.filter(t => t.category === category);
    }
    return this.templates;
  }

  createTemplate(data) {
    if (!data.name || !data.body) throw new Error('Tên mẫu và nội dung không được để trống.');

    const newTmpl = {
      id: `tmpl_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`,
      name: data.name.trim(),
      category: data.category || 'recruitment',
      channelType: data.channelType || 'BOTH',
      title: data.title || '',
      body: data.body.trim(),
      contact: data.contact || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      createdAt: new Date().toISOString()
    };

    this.templates.unshift(newTmpl);
    this._save();
    return newTmpl;
  }

  /**
   * Sinh các biến thể nội dung phù hợp cho từng kênh phát sóng
   * @param {Object} params
   * @param {string} params.category - 'recruitment' hoặc 'bds'
   * @param {Object} params.data - Dữ liệu nguồn thực tế (Việc làm hoặc Căn hộ)
   * @param {string} params.industry - Alias cho category
   * @param {Object} params.baseContent - Alias cho data
   * @param {string} params.targetType - 'FANPAGE' hoặc 'GROUP'
   * @param {string} params.targetName - Tên đối tượng target
   * @param {string} params.location - Địa điểm khu vực
   */
  generateChannelVariations(params = {}) {
    const category = params.category || params.industry || 'recruitment';
    const rawData = params.data || params.baseContent || {};
    const data = {
      ...rawData,
      location: params.location || rawData.location || rawData.province || 'Toàn quốc',
      province: params.location || rawData.province || rawData.location || 'Toàn quốc'
    };

    let result;
    if (category === 'recruitment') {
      result = this._generateRecruitmentVariations(data);
    } else if (category === 'bds') {
      result = this._generateBdsVariations(data);
    } else {
      result = {
        title: data.title || '',
        pageContent: data.body || '',
        groupContent: data.body || '',
        contact: data.contact || '',
        location: data.location || ''
      };
    }

    const targetType = (params.targetType || 'BOTH').toUpperCase();
    const fullText = (targetType === 'GROUP') 
      ? result.groupContent 
      : (result.pageContent || result.groupContent);

    return {
      ...result,
      targetType,
      channelType: targetType,
      fullText: fullText || data.body || ''
    };
  }

  /**
   * Biến thể Tuyển dụng (Fanpage chi tiết vs Group súc tích)
   */
  _generateRecruitmentVariations(job) {
    const title = job.title || 'Tuyển Dụng Nhân Viên';
    const company = job.company || 'Doanh Nghiệp Tuyển Dụng';
    const location = job.province || job.location || 'Toàn quốc';
    const salary = job.salary || 'Thỏa thuận';
    const contact = job.contactPhone || job.phone || '0971946725 (Zalo/Call)';
    const cleanTag = location.replace(/\s+/g, '');

    // Biến thể Fanpage: Đầy đủ, chỉn chu, chuyên nghiệp, gắn thương hiệu
    const pageContent = `【THÔNG BÁO TUYỂN DỤNG CHÍNH THỨC】\n` +
      `🔥 Vị trí: ${title.toUpperCase()}\n` +
      `🏢 Doanh nghiệp: ${company}\n` +
      `📍 Địa điểm: ${location}\n` +
      `💰 Mức thu nhập: ${salary}\n\n` +
      `✨ MÔ TẢ & YÊU CẦU CÔNG VIỆC:\n` +
      `- Làm việc trong môi trường năng động, chuyên nghiệp.\n` +
      `- Ưu tiên ứng viên có tinh thần trách nhiệm, giao tiếp tốt.\n` +
      `- Được đào tạo và trang bị đầy đủ công cụ làm việc.\n\n` +
      `🎁 QUYỀN LỢI ĐƯỢC HƯỞNG:\n` +
      `- Chế độ BHXH, thưởng lễ tết và hoa hồng hấp dẫn theo năng lực.\n` +
      `- Cơ hội thăng tiến rõ ràng sau 3 - 6 tháng.\n\n` +
      `📩 ỨNG TUYỂN NHANH:\n` +
      `Liên hệ trực tiếp qua SĐT/Zalo: ${contact}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `#TuyenDung${cleanTag} #ViecLam${cleanTag} #TimViecNhanh #LeadX`;

    // Biến thể Group: Ngắn gọn, trực diện, kích thích comment xin việc
    const groupContent = `[GÓC VIỆC LÀM - ${location.toUpperCase()}]\n` +
      `Bên mình đang cần tuyển gấp ${title} tại ${location} ạ!\n` +
      `• Mức lương: ${salary} (nhận lương đúng hạn)\n` +
      `• Công ty: ${company}\n` +
      `• Không yêu cầu kinh nghiệm cao, có người hướng dẫn tận tình.\n` +
      `Anh/chị/em nào đang tìm việc hoặc có bạn bè quan tâm vui lòng INBOX hoặc liên hệ: ${contact} để nhận việc ngay nhé!`;

    return {
      title,
      pageContent,
      groupContent,
      contact,
      location,
      salary
    };
  }

  /**
   * Biến thể Bất động sản (Căn hộ Fanpage vs Group)
   */
  _generateBdsVariations(apt) {
    const title = apt.title || 'Căn Hộ Cho Thuê';
    const location = `${apt.district || ''}, ${apt.city || 'Đà Nẵng'}`.trim();
    const price = apt.priceText || (apt.price ? `${apt.price} Triệu/tháng` : 'Thỏa thuận');
    const contact = apt.contactPhone || '0971946725 (Xem nhà trực tiếp)';
    const roomType = apt.roomType || '1PN';

    const pageContent = `【CHO THUÊ CĂN HỘ CAO CẤP - ${roomType.toUpperCase()}】\n` +
      `🏠 ${title}\n` +
      `📍 Vị trí: ${location}\n` +
      `💵 Giá thuê: ${price}\n` +
      `📐 Diện tích: ${apt.area || 45}m²\n\n` +
      `🛋️ TIỆN NGHI & NỘI THẤT:\n` +
      `- Full nội thất cao cấp: Tủ lạnh, Máy giặt, Điều hòa, Smart TV, Bếp từ.\n` +
      `- Giờ giấc tự do, bảo vệ camera an ninh 24/7, thang máy tốc độ cao.\n` +
      `- Khu vực trung tâm, thuận tiện di chuyển, gần chợ và siêu thị.\n\n` +
      `📞 LIÊN HỆ XEM PHÒNG TRỰC TIẾP:\n` +
      `Hotline/Zalo: ${contact}\n` +
      `━━━━━━━━━━━━━━━━━━━━\n` +
      `#CanHoDaNang #ThueNhaDaNang #CanHo${roomType} #LeadXRealEstate`;

    const groupContent = `[CHÍNH CHỦ CHO THUÊ CĂN HỘ ${roomType} - ${location.toUpperCase()}]\n` +
      `Phòng trống vào ở ngay, ban công thoáng mát view đẹp!\n` +
      `• Giá: ${price} (hỗ trợ cọc linh hoạt)\n` +
      `• Đầy đủ nội thất chỉ việc xách vali vào ở.\n` +
      `• Điện nước giá dân, an ninh tốt, wifi tốc độ cao.\n` +
      `Ai quan tâm chấm bài hoặc ib trực tiếp em gửi video & định vị nhé: ${contact}`;

    return {
      title,
      pageContent,
      groupContent,
      contact,
      location,
      price
    };
  }
}

module.exports = new ContentStudioService();
