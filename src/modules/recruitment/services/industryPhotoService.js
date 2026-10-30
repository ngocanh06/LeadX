/**
 * industryPhotoService.js - Quản Lý Kho Ảnh Thực Tế Theo Ngành Nghề (Industry Asset Hub)
 * Phục vụ tạo Poster Human Graphic AI và xuất bản Fanpage
 */
const path = require('path');
const fs = require('fs');

const INDUSTRY_METADATA_MAP = {
  technology: {
    name: 'Công nghệ thông tin, phần mềm, AI, dữ liệu',
    shortName: 'CNTT / Phần Mềm',
    icon: 'fa-solid fa-laptop-code',
    color: '#8b5cf6',
    description: 'Lập trình viên, kỹ sư AI, hệ thống mạng, dữ liệu, thiết kế UI/UX'
  },
  business_sales: {
    name: 'Kinh doanh, bán hàng, phát triển thị trường',
    shortName: 'Kinh Doanh / Sales',
    icon: 'fa-solid fa-chart-line',
    color: '#10b981',
    description: 'Chuyên viên B2B, phát triển thị trường, tư vấn bán hàng, bất động sản, showroom'
  },
  marketing_media: {
    name: 'Marketing, truyền thông, sáng tạo nội dung',
    shortName: 'Marketing / Media',
    icon: 'fa-solid fa-bullhorn',
    color: '#f59e0b',
    description: 'Digital marketing, sáng tạo nội dung, quản trị fanpage, quan hệ công chúng'
  },
  finance_banking: {
    name: 'Kế toán, tài chính, ngân hàng, bảo hiểm',
    shortName: 'Tài Chính / Ngân Hàng',
    icon: 'fa-solid fa-building-columns',
    color: '#3b82f6',
    description: 'Kế toán tổng hợp, kiểm toán, giao dịch viên ngân hàng, phân tích tài chính, bảo hiểm'
  },
  human_resources: {
    name: 'Nhân sự, tuyển dụng, hành chính, văn phòng',
    shortName: 'Hành Chính / Nhân Sự',
    icon: 'fa-solid fa-id-card-clip',
    color: '#6366f1',
    description: 'Chuyên viên tuyển dụng, quản lý nhân sự, hành chính văn phòng, lễ tân'
  },
  education_training: {
    name: 'Giáo dục, đào tạo, nghiên cứu',
    shortName: 'Giáo Dục / Đào Tạo',
    icon: 'fa-solid fa-graduation-cap',
    color: '#14b8a6',
    description: 'Giáo viên lớp học, giảng viên đại học, trợ giảng, nghiên cứu giáo dục'
  },
  healthcare_medical: {
    name: 'Y tế, dược phẩm, chăm sóc sức khỏe',
    shortName: 'Y Tế / Dược Phẩm',
    icon: 'fa-solid fa-user-doctor',
    color: '#ef4444',
    description: 'Bác sĩ, dược sĩ nhà thuốc, điều dưỡng bệnh viện, kỹ thuật viên xét nghiệm'
  },
  hospitality_tourism: {
    name: 'Nhà hàng, khách sạn, du lịch',
    shortName: 'Khách Sạn / Du Lịch',
    icon: 'fa-solid fa-hotel',
    color: '#ec4899',
    description: 'Lễ tân khách sạn, hướng dẫn viên du lịch, phục vụ bàn, buồng phòng resort'
  },
  manufacturing_industry: {
    name: 'Sản xuất, công nghiệp, cơ khí, điện',
    shortName: 'Sản Xuất / Cơ Khí',
    icon: 'fa-solid fa-industry',
    color: '#ea580c',
    description: 'Công nhân nhà xưởng, vận hành máy CNC, thợ hàn cơ khí, điện công nghiệp, QC kiểm phẩm'
  },
  construction_real_estate: {
    name: 'Xây dựng, kiến trúc, bất động sản',
    shortName: 'Xây Dựng / Kiến Trúc',
    icon: 'fa-solid fa-helmet-safety',
    color: '#d97706',
    description: 'Kỹ sư công trình, giám sát an toàn, kiến trúc sư, thiết kế nội thất, khảo sát'
  },
  logistics_warehouse: {
    name: 'Logistics, kho vận, giao nhận, vận tải',
    shortName: 'Kho Vận / Logistics',
    icon: 'fa-solid fa-truck-fast',
    color: '#06b6d4',
    description: 'Thủ kho, nhân viên kho vận, lái xe nâng, giao hàng shipper, tài xế vận tải'
  },
  retail_supermarket: {
    name: 'Bán lẻ, siêu thị, thương mại điện tử',
    shortName: 'Bán Lẻ / Siêu Thị',
    icon: 'fa-solid fa-cart-shopping',
    color: '#10b981',
    description: 'Thu ngân siêu thị, sắp xếp hàng hóa, nhân viên bán hàng cửa hàng tiện lợi, đóng gói sàn TMĐT'
  },
  restaurant_kitchen: {
    name: 'Nhà hàng, bếp, chế biến thực phẩm',
    shortName: 'Nhà Hàng / Bếp / F&B',
    icon: 'fa-solid fa-utensils',
    color: '#f43f5e',
    description: 'Đầu bếp, phụ bếp, làm bánh pastry, barista pha chế cà phê specialty'
  },
  agriculture_fishery: {
    name: 'Nông nghiệp, thủy sản, môi trường',
    shortName: 'Nông Nghiệp / Thủy Sản',
    icon: 'fa-solid fa-seedling',
    color: '#84cc16',
    description: 'Canh tác trồng trọt công nghệ cao, nông trại thủy canh, nuôi trồng thủy hải sản'
  },
  beauty_spa_fashion: {
    name: 'Làm đẹp, spa, thời trang',
    shortName: 'Spa / Thẩm Mỹ',
    icon: 'fa-solid fa-spa',
    color: '#f472b6',
    description: 'Kỹ thuật viên massage spa, nhà tạo mẫu tóc, trang điểm thẩm mỹ chuyên nghiệp'
  },
  customer_service: {
    name: 'Dịch vụ khách hàng, chăm sóc khách hàng',
    shortName: 'CSKH / Tổng Đài',
    icon: 'fa-solid fa-headset',
    color: '#38bdf8',
    description: 'Nhân viên tổng đài call center, chăm sóc hỗ trợ khách hàng, giải đáp thắc mắc'
  },
  general_labor_maintenance: {
    name: 'Lao động phổ thông, vệ sinh, bảo trì',
    shortName: 'Lao Động Phổ Thông',
    icon: 'fa-solid fa-broom',
    color: '#78716c',
    description: 'Nhân viên an ninh bảo vệ, vệ sinh công nghiệp, bảo trì sửa chữa cơ điện'
  },
  art_design_media_production: {
    name: 'Nghệ thuật, thiết kế, nhiếp ảnh, sản xuất video',
    shortName: 'Thiết Kế / Media',
    icon: 'fa-solid fa-palette',
    color: '#a855f7',
    description: 'Thiết kế đồ họa, nhiếp ảnh gia studio, quay phim dựng phim chuyên nghiệp'
  },
  office_admin: {
    name: 'Hành Chính - Kế Toán - Nhân Sự',
    shortName: 'Hành Chính / Văn Phòng',
    icon: 'fa-solid fa-briefcase',
    color: '#3b82f6',
    description: 'Nhân viên văn phòng, kế toán viên, nhân sự HR, lễ tân, trợ lý'
  },
  sales_cskh: {
    name: 'Bán Hàng - CSKH - Telesale - Sales',
    shortName: 'Bán Hàng / CSKH',
    icon: 'fa-solid fa-headset',
    color: '#10b981',
    description: 'Chuyên viên tư vấn, nhân viên bán hàng, telesales, chăm sóc khách hàng'
  },
  it_tech: {
    name: 'Công Nghệ Thông Tin - Lập Trình (IT)',
    shortName: 'Công Nghệ (IT)',
    icon: 'fa-solid fa-laptop-code',
    color: '#8b5cf6',
    description: 'Lập trình viên, kỹ sư phần mềm, tester, devops, kỹ thuật máy tính'
  },
  engineering_construction: {
    name: 'Kỹ Thuật - Cơ Khí - Nhà Máy - Xây Dựng',
    shortName: 'Kỹ Thuật / Nhà Máy',
    icon: 'fa-solid fa-industry',
    color: '#f59e0b',
    description: 'Kỹ sư cơ khí, thợ hàn, kỹ thuật bảo trì, công nhân nhà xưởng, giám sát'
  },
  fnb_retail: {
    name: 'F&B - Nhà Hàng - Quán Cafe - Siêu Thị',
    shortName: 'Nhà Hàng / Cafe',
    icon: 'fa-solid fa-mug-hot',
    color: '#ec4899',
    description: 'Pha chế barista, phục vụ bàn, thu ngân siêu thị, phụ bếp, nhân viên quán'
  },
  education: {
    name: 'Giáo Dục - Đào Tạo - Giảng Dạy',
    shortName: 'Giáo Dục / Đào Tạo',
    icon: 'fa-solid fa-graduation-cap',
    color: '#14b8a6',
    description: 'Giáo viên, trợ giảng tiếng Anh, gia sư, chuyên viên đào tạo'
  },
  general: {
    name: 'Đa Ngành - Tổng Hợp Thực Tế',
    shortName: 'Đa Ngành',
    icon: 'fa-solid fa-layer-group',
    color: '#64748b',
    description: 'Hình ảnh văn phòng làm việc và đời sống lao động đa phong cách chất lượng cao'
  }
};

class IndustryPhotoService {
  constructor() {
    this.stockDir = path.resolve(__dirname, '../../../../data/images/stock');
    this.customCatalogPath = path.resolve(__dirname, '../../../../data/stock_catalog_custom.json');

    // Danh mục 8 nhóm ngành nghề chuẩn
    this.defaultCategories = {
      office_admin: {
        id: 'office_admin',
        name: 'Hành Chính - Kế Toán - Nhân Sự',
        shortName: 'Văn Phòng',
        icon: 'fa-solid fa-briefcase',
        color: '#3b82f6',
        description: 'Nhân viên văn phòng, kế toán viên, nhân sự HR, lễ tân, trợ lý',
        keywords: ['văn phòng', 'hành chính', 'kế toán', 'nhân sự', 'hr', 'thủ quỹ', 'lễ tân', 'trợ lý', 'chứng từ'],
        filenames: ['office_admin_asian.jpg', 'office_admin.jpg']
      },
      sales_cskh: {
        id: 'sales_cskh',
        name: 'Bán Hàng - CSKH - Telesale - Sales',
        shortName: 'Bán Hàng',
        icon: 'fa-solid fa-headset',
        color: '#10b981',
        description: 'Chuyên viên tư vấn, nhân viên bán hàng, telesales, chăm sóc khách hàng',
        keywords: ['bán hàng', 'sales', 'kinh doanh', 'tư vấn', 'cskh', 'telesale', 'tiếp thị', 'bất động sản'],
        filenames: ['sales_rep_asian.jpg', 'sales_cskh_asian.jpg', 'sales_cskh.jpg']
      },
      it_tech: {
        id: 'it_tech',
        name: 'Công Nghệ Thông Tin - Lập Trình (IT)',
        shortName: 'Công Nghệ (IT)',
        icon: 'fa-solid fa-laptop-code',
        color: '#8b5cf6',
        description: 'Lập trình viên, kỹ sư phần mềm, tester, devops, kỹ thuật máy tính',
        keywords: ['it', 'lập trình', 'developer', 'phần mềm', 'software', 'tester', 'frontend', 'backend'],
        filenames: ['it_dev_asian.jpg', 'it_tech_asian.jpg', 'it_tech.jpg']
      },
      engineering_construction: {
        id: 'engineering_construction',
        name: 'Kỹ Thuật - Cơ Khí - Nhà Máy - Xây Dựng',
        shortName: 'Kỹ Thuật / Nhà Máy',
        icon: 'fa-solid fa-industry',
        color: '#f59e0b',
        description: 'Kỹ sư cơ khí, thợ hàn, kỹ thuật bảo trì, công nhân nhà xưởng, giám sát',
        keywords: ['kỹ thuật', 'cơ khí', 'nhà máy', 'nhà xưởng', 'sản xuất', 'công trình', 'thợ hàn', 'vận hành'],
        filenames: ['construction_engineer_asian.jpg', 'mechanical_factory_asian.jpg']
      },
      fnb_retail: {
        id: 'fnb_retail',
        name: 'F&B - Nhà Hàng - Quán Cafe - Siêu Thị',
        shortName: 'Nhà Hàng / Cafe',
        icon: 'fa-solid fa-mug-hot',
        color: '#ec4899',
        description: 'Pha chế barista, phục vụ bàn, thu ngân siêu thị, phụ bếp, nhân viên quán',
        keywords: ['nhà hàng', 'cafe', 'cà phê', 'f&b', 'phục vụ', 'thu ngân', 'pha chế', 'barista', 'siêu thị'],
        filenames: ['fnb_barista_asian.jpg', 'fnb_retail_asian.jpg', 'fnb_retail.jpg']
      },
      warehouse_logistics: {
        id: 'warehouse_logistics',
        name: 'Kho Vận - Logistics - Giao Hàng - Tài Xế',
        shortName: 'Kho / Logistics',
        icon: 'fa-solid fa-truck-fast',
        color: '#06b6d4',
        description: 'Thủ kho, nhân viên giao hàng, tài xế xe tải, bốc xếp, điều phối vận tải',
        keywords: ['kho', 'kho vận', 'thủ kho', 'logistics', 'giao hàng', 'shipper', 'tài xế', 'lái xe', 'vận tải'],
        filenames: ['warehouse_worker_asian.jpg', 'shipper_delivery_asian.jpg', 'warehouse_logistics_asian.jpg']
      },
      education: {
        id: 'education',
        name: 'Giáo Dục - Đào Tạo - Giảng Dạy',
        shortName: 'Giáo Dục',
        icon: 'fa-solid fa-graduation-cap',
        color: '#14b8a6',
        description: 'Giáo viên, trợ giảng tiếng Anh, gia sư, chuyên viên đào tạo',
        keywords: ['giáo dục', 'giảng dạy', 'giáo viên', 'gia sư', 'trợ giảng', 'đào tạo', 'anh ngữ'],
        filenames: ['education_asian.jpg', 'education.jpg']
      },
      general: {
        id: 'general',
        name: 'Đa Ngành - Tổng Hợp Thực Tế',
        shortName: 'Đa Ngành',
        icon: 'fa-solid fa-layer-group',
        color: '#64748b',
        description: 'Hình ảnh văn phòng làm việc và đời sống lao động đa phong cách chất lượng cao',
        keywords: ['lao động', 'việc làm', 'tuyển dụng', 'doanh nghiệp'],
        filenames: ['general_asian.jpg', 'general.jpg']
      }
    };

    this._ensureDirs();
  }

  _ensureDirs() {
    if (!fs.existsSync(this.stockDir)) {
      fs.mkdirSync(this.stockDir, { recursive: true });
    }
  }

  _loadCustomCatalog() {
    try {
      if (fs.existsSync(this.customCatalogPath)) {
        return JSON.parse(fs.readFileSync(this.customCatalogPath, 'utf8'));
      }
    } catch (e) {}
    return null;
  }

  _saveCustomCatalog(catalog) {
    try {
      fs.writeFileSync(this.customCatalogPath, JSON.stringify(catalog, null, 2), 'utf8');
    } catch (e) {}
  }

  /**
   * Lấy toàn bộ danh mục và danh sách ảnh thực tế có trong kho
   */
  getCatalog() {
    const custom = this._loadCustomCatalog();
    const categories = custom || JSON.parse(JSON.stringify(this.defaultCategories));

    // Đọc các file thực tế trong thư mục data/images/stock
    let allDiskFiles = [];
    try {
      allDiskFiles = fs.readdirSync(this.stockDir);
    } catch (e) {
      allDiskFiles = [];
    }

    const resultCategories = [];
    let totalPhotos = 0;
    let totalBytes = 0;

    for (const [key, cat] of Object.entries(categories)) {
      // Lọc các file thực sự tồn tại trên đĩa
      const validFiles = (cat.filenames || []).filter(fn => {
        const fullPath = path.join(this.stockDir, fn);
        return fs.existsSync(fullPath);
      });

      const photos = validFiles.map(fn => {
        const fullPath = path.join(this.stockDir, fn);
        let stat = { size: 0, mtime: new Date() };
        try {
          stat = fs.statSync(fullPath);
        } catch (e) {}

        totalPhotos++;
        totalBytes += stat.size;

        return {
          filename: fn,
          url: `/uploads/stock/${fn}`,
          sizeBytes: stat.size,
          sizeFormatted: this._formatSize(stat.size),
          updatedAt: stat.mtime.toISOString(),
          isDefault: cat.filenames && cat.filenames[0] === fn
        };
      });

      const meta = INDUSTRY_METADATA_MAP[cat.id || key] || {};
      const catName = cat.name || meta.name || key;
      const catShortName = cat.shortName || meta.shortName || catName;
      const catIcon = cat.icon || meta.icon || 'fa-solid fa-folder-open';
      const catColor = cat.color || meta.color || '#3b82f6';
      const catDesc = cat.description || meta.description || '';

      resultCategories.push({
        id: cat.id || key,
        name: catName,
        shortName: catShortName,
        icon: catIcon,
        color: catColor,
        description: catDesc,
        keywords: cat.keywords || meta.keywords || [],
        count: photos.length,
        photos
      });
    }

    return {
      stats: {
        totalCategories: resultCategories.length,
        totalPhotos,
        totalBytes,
        totalBytesFormatted: this._formatSize(totalBytes)
      },
      categories: resultCategories
    };
  }

  /**
   * Thêm ảnh vào một danh mục cụ thể
   */
  addPhotoToCategory(categoryId, filename) {
    const custom = this._loadCustomCatalog() || JSON.parse(JSON.stringify(this.defaultCategories));
    if (!custom[categoryId]) {
      throw new Error(`Ngành nghề "${categoryId}" không tồn tại.`);
    }

    if (!custom[categoryId].filenames) custom[categoryId].filenames = [];
    if (!custom[categoryId].filenames.includes(filename)) {
      custom[categoryId].filenames.unshift(filename);
      this._saveCustomCatalog(custom);
    }

    return true;
  }

  /**
   * Xóa ảnh khỏi danh mục và khỏi ổ đĩa
   */
  deletePhoto(categoryId, filename) {
    const custom = this._loadCustomCatalog() || JSON.parse(JSON.stringify(this.defaultCategories));
    if (custom[categoryId] && custom[categoryId].filenames) {
      custom[categoryId].filenames = custom[categoryId].filenames.filter(f => f !== filename);
      this._saveCustomCatalog(custom);
    }

    // Xóa file trên đĩa nếu không còn ngành nào dùng
    const filePath = path.join(this.stockDir, filename);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
      } catch (e) {}
    }

    return true;
  }

  /**
   * Tìm ảnh phù hợp theo từ khóa ngành nghề hoặc tiêu đề công việc
   */
  findPhotosByKeyword(text = '') {
    const catalog = this.getCatalog();
    const query = (text || '').toLowerCase().trim();
    if (!query) return catalog.categories;

    return catalog.categories.filter(cat => {
      const matchName = cat.name.toLowerCase().includes(query);
      const matchKw = cat.keywords.some(k => query.includes(k.toLowerCase()) || k.toLowerCase().includes(query));
      return matchName || matchKw;
    });
  }

  _formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
}

module.exports = new IndustryPhotoService();
