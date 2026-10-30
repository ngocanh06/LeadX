/**
 * stockPhotoResolver.js - Bộ giải quyết ảnh chụp thực tế chuyên nghiệp theo ngành nghề
 * Tích hợp đa dạng: Cơ sở vật chất, máy móc, kiến trúc công trình, văn phòng hiện đại,
 * hình ảnh/logo nhận diện thương hiệu doanh nghiệp và ảnh nhân sự làm việc thực tế.
 * Xoay vòng linh hoạt bằng mã băm MD5 để tối đa hóa độ đa dạng, tuyệt đối chống trùng lặp.
 */
const path = require('path');
const fs = require('fs');

const stockDir = path.resolve(__dirname, '../../../../data/images/stock');

// Danh mục ảnh chuyên nghiệp theo ngành nghề (mỗi ngành gồm nhiều ảnh thực tế, cơ sở vật chất và nhân sự)
const STOCK_CATALOG = {
  // 1. Kỹ thuật, Cơ khí, Xây dựng, Công trình, Nhà xưởng, QC, Tự động hóa
  engineering_construction: {
    filenames: [
      'facility_factory_automated_robotics.jpg',
      'facility_factory_clean_production.jpg',
      'facility_plant_manufacturing_hall.jpg',
      'facility_architecture_blueprints_model.jpg',
      'construction_engineer_asian.jpg',
      'construction_site_modern.jpg',
      'mechanical_factory_asian.jpg',
      'engineer_tech_factory.jpg',
      'industrial_plant_building.jpg',
      'general_asian.jpg'
    ],
    keywords: [
      'xây dựng', 'công trình', 'giám sát', 'an toàn công trình', 'an toàn lao động',
      'kết cấu', 'kết cấu thép', 'thép', 'cơ khí', 'kỹ sư', 'thi công', 'thầu phụ',
      'chế tạo', 'thợ hàn', 'thợ tiện', 'bảo trì', 'kỹ thuật', 'qc', 'qa', 'nhà xưởng',
      'sản xuất', 'nhà máy', 'vận hành máy', 'điện công nghiệp', 'điện lạnh', 'tự động hóa'
    ]
  },

  // 2. Bán hàng, Sales, Kinh doanh, CSKH, Telesale, BĐS, Ngân hàng, Tư vấn tài chính
  sales_cskh: {
    filenames: [
      'facility_bank_modern_lobby.jpg',
      'facility_financial_tower_dusk.jpg',
      'facility_bank_trading_floor.jpg',
      'facility_executive_boardroom.jpg',
      'facility_car_showroom_luxury.jpg',
      'facility_real_estate_luxury_apartments.jpg',
      'sales_finance_banking.jpg',
      'sales_finance_02.jpg',
      'sales_consulting_01.jpg',
      'sales_handshake_02.jpg',
      'sales_meeting_corporate.jpg',
      'sales_discussion_modern.jpg',
      'sales_cskh_callcenter.jpg',
      'sales_cskh_support.jpg',
      'cskh_portrait_04.jpg',
      'sales_meeting_01.jpg',
      'sales_rep_asian.jpg',
      'sales_cskh_asian.jpg'
    ],
    keywords: [
      'bán hàng', 'sales', 'kinh doanh', 'tư vấn', 'cskh', 'chăm sóc khách hàng',
      'telesale', 'tiếp thị', 'marketing', 'bất động sản', 'môi giới', 'thương mại',
      'sales rep', 'đại diện bán hàng', 'phát triển thị trường', 'b2b', 'b2c', 'chốt deal',
      'quan hệ khách hàng', 'thực tập sinh', 'ngân hàng', 'tài chính', 'tín dụng', 'thu hồi nợ', 'thu phí'
    ]
  },

  // 3. Kho vận, Logistics, Tài xế, Giao hàng, Bưu cục, Lao động phổ thông
  warehouse_logistics: {
    filenames: [
      'facility_logistics_hub_warehouse.jpg',
      'facility_warehouse_high_racks.jpg',
      'facility_shipping_container_port.jpg',
      'facility_delivery_fleet_van.jpg',
      'warehouse_storage_aisle.jpg',
      'warehouse_boxes_pallets.jpg',
      'warehouse_worker_asian.jpg',
      'shipper_delivery_asian.jpg',
      'warehouse_logistics_asian.jpg'
    ],
    keywords: [
      'kho', 'kho vận', 'thủ kho', 'logistics', 'giao hàng', 'shipper', 'tài xế',
      'lái xe', 'vận chuyển', 'đóng gói', 'bốc xếp', 'điều vận', 'giao nhận',
      'lao động phổ thông', 'công nhân', 'phụ kho', 'bưu cục', 'chuyển phát'
    ]
  },

  // 4. Công nghệ thông tin, Lập trình, Viễn thông, Phần mềm, Hệ thống
  it_tech: {
    filenames: [
      'facility_it_server_datacenter.jpg',
      'facility_it_multimonitor_desk.jpg',
      'facility_it_cyber_network.jpg',
      'facility_it_circuit_tech_microchip.jpg',
      'it_coding_screen.jpg',
      'it_dev_asian.jpg',
      'it_dev_workspace.jpg',
      'it_team_software.jpg',
      'it_tech_asian.jpg',
      'it_tech.jpg'
    ],
    keywords: [
      'it', 'lập trình', 'developer', 'phần mềm', 'software', 'frontend', 'backend',
      'fullstack', 'react', 'node', 'python', 'java', 'tester', 'devops', 'hệ thống',
      'mạng', 'telecom', 'viễn thông', 'cntt', 'lập trình viên', 'an ninh mạng', 'dữ liệu', 'data'
    ]
  },

  // 5. Khối Văn phòng, Hành chính, Nhân sự, Kế toán, Quản trị
  office_admin: {
    filenames: [
      'facility_office_coworking_bright.jpg',
      'facility_office_meeting_pod.jpg',
      'facility_office_minimal_desk.jpg',
      'facility_office_glass_atrium.jpg',
      'facility_executive_boardroom.jpg',
      'office_admin_desk.jpg',
      'office_workspace_clean.jpg',
      'office_portrait_female.jpg',
      'office_hr_interview.jpg',
      'office_team_collab.jpg',
      'office_admin_asian.jpg',
      'office_asian_03.jpg'
    ],
    keywords: [
      'văn phòng', 'hành chính', 'kế toán', 'nhân sự', 'hr', 'tuyển dụng', 'thủ quỹ',
      'chứng từ', 'trợ lý', 'thư ký', 'pháp chế', 'kiểm toán', 'tài chính', 'lễ tân'
    ]
  },

  // 6. F&B, Nhà hàng, Quán ăn, Khách sạn, Pha chế, Bếp, Dịch vụ ẩm thực
  fnb_hospitality: {
    filenames: [
      'facility_cafe_modern_aesthetic.jpg',
      'facility_restaurant_interior_warm.jpg',
      'facility_coffee_espresso_machine.jpg',
      'facility_hotel_lobby_luxury.jpg',
      'fnb_barista_asian.jpg',
      'fnb_barista_latte.jpg',
      'fnb_cafe_counter.jpg',
      'fnb_dining_restaurant.jpg',
      'restaurant_dining_hall.jpg',
      'cafe_coffee_prep.jpg'
    ],
    keywords: [
      'nhà hàng', 'quán', 'cafe', 'cà phê', 'f&b', 'phục vụ', 'pha chế',
      'barista', 'bếp', 'phụ bếp', 'khách sạn', 'phụ quán', 'buồng phòng', 'bartender'
    ]
  },

  // 7. Bán lẻ, Siêu thị, Cửa hàng tiện lợi, Showroom, Thu ngân
  retail_supermarket: {
    filenames: [
      'facility_supermarket_shelves_fresh.jpg',
      'facility_retail_convenience_store_bright.jpg',
      'facility_retail_mall_modern.jpg',
      'retail_cashier_store.jpg',
      'supermarket_produce_worker.jpg',
      'supermarket_checkout_cart.jpg',
      'retail_convenience_store.jpg',
      'supermarket_aisle_stock.jpg',
      'retail_counter_service.jpg',
      'supermarket_customer_shopper.jpg'
    ],
    keywords: [
      'siêu thị', 'cửa hàng', 'tiện lợi', 'bách hóa', 'thu ngân', 'bán lẻ', 'retail',
      'quầy thu ngân', 'sắp xếp hàng hóa', 'nhân viên siêu thị', 'showroom', 'trưng bày'
    ]
  },

  // 8. Bất động sản, Căn hộ, Dự án đô thị
  real_estate: {
    filenames: [
      'facility_real_estate_luxury_apartments.jpg',
      'facility_urban_modern_complex.jpg',
      'facility_architecture_blueprints_model.jpg',
      'facility_financial_tower_dusk.jpg',
      'sales_consulting_01.jpg',
      'sales_handshake_02.jpg'
    ],
    keywords: [
      'bất động sản', 'bds', 'căn hộ', 'nhà phố', 'đất nền', 'dự án', 'môi giới bđs',
      'chuyên viên bất động sản', 'chung cư'
    ]
  },

  // 9. Giáo dục, Giảng dạy, Đào tạo chuyên môn
  education: {
    filenames: [
      'facility_education_university_library.jpg',
      'facility_education_conference_auditorium.jpg',
      'facility_education_classroom_hightech.jpg',
      'education_asian.jpg',
      'education.jpg'
    ],
    keywords: [
      'giáo dục', 'giảng dạy', 'giáo viên', 'gia sư', 'trợ giảng', 'giảng viên',
      'anh ngữ', 'mầm non', 'trường học', 'đào tạo'
    ]
  },

  // 10. Y tế, Dược phẩm, Phòng khám, Sức khỏe
  medical_pharma: {
    filenames: [
      'facility_medical_modern_clinic.jpg',
      'facility_medical_laboratory_research.jpg',
      'office_admin_asian.jpg'
    ],
    keywords: [
      'y tế', 'dược phẩm', 'dược sĩ', 'phòng khám', 'bệnh viện', 'điều dưỡng',
      'trình dược viên', 'thí nghiệm', 'nha khoa', 'bác sĩ'
    ]
  },

  // 11. Đa ngành / Tổng hợp (Hỗn hợp phong phú giữa cơ sở vật chất và không gian làm việc hiện đại)
  general: {
    filenames: [
      'facility_financial_tower_dusk.jpg',
      'facility_office_coworking_bright.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_retail_mall_modern.jpg',
      'facility_logistics_hub_warehouse.jpg',
      'facility_real_estate_luxury_apartments.jpg',
      'facility_factory_automated_robotics.jpg',
      'facility_supermarket_shelves_fresh.jpg',
      'facility_it_server_datacenter.jpg',
      'facility_architecture_blueprints_model.jpg',
      'general_asian.jpg',
      'sales_rep_asian.jpg',
      'sales_cskh_asian.jpg',
      'office_admin_asian.jpg',
      'it_dev_asian.jpg',
      'fnb_barista_asian.jpg',
      'construction_engineer_asian.jpg',
      'warehouse_worker_asian.jpg',
      'mechanical_factory_asian.jpg'
    ],
    keywords: []
  }
};

// Cấu hình Brand Targeting: Tự động phát hiện các tập đoàn / thương hiệu tuyển dụng lớn tại Việt Nam
const BRAND_TARGETS = [
  {
    kws: ['fe credit', 'vpbank fc', 'fecredit', 'tài chính fe'],
    files: [
      'brand_fe_credit.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_financial_tower_dusk.jpg',
      'sales_finance_banking.jpg',
      'sales_finance_02.jpg'
    ]
  },
  {
    kws: ['mbbank', 'mb bank', 'ngân hàng quân đội', 'mb ageas'],
    files: [
      'brand_mbbank.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_bank_trading_floor.jpg',
      'facility_financial_tower_dusk.jpg',
      'sales_finance_banking.jpg'
    ]
  },
  {
    kws: ['vpbank', 'việt nam thịnh vượng'],
    files: [
      'brand_vpbank.jpg',
      'facility_financial_tower_dusk.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_executive_boardroom.jpg',
      'sales_finance_banking.jpg'
    ]
  },
  {
    kws: ['techcombank', 'kỹ thương'],
    files: [
      'brand_techcombank.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_financial_tower_dusk.jpg',
      'facility_executive_boardroom.jpg'
    ]
  },
  {
    kws: ['hd saison', 'hdsaison'],
    files: [
      'brand_hdsaison.jpg',
      'facility_financial_tower_dusk.jpg',
      'sales_finance_02.jpg',
      'sales_finance_banking.jpg'
    ]
  },
  {
    kws: ['hdbank', 'phát triển tp. hcm', 'phát triển tp.hcm'],
    files: [
      'brand_hdbank.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_financial_tower_dusk.jpg',
      'sales_finance_banking.jpg'
    ]
  },
  {
    kws: ['mirae asset', 'miraeasset'],
    files: [
      'brand_mirae_asset.jpg',
      'facility_financial_tower_dusk.jpg',
      'facility_bank_trading_floor.jpg',
      'sales_finance_banking.jpg'
    ]
  },
  {
    kws: ['fpt', 'fpt software', 'fpt telecom', 'fpt shop'],
    files: [
      'brand_fpt.jpg',
      'facility_it_server_datacenter.jpg',
      'facility_it_multimonitor_desk.jpg',
      'facility_office_coworking_bright.jpg',
      'it_dev_asian.jpg'
    ]
  },
  {
    kws: ['misa'],
    files: [
      'brand_misa.jpg',
      'facility_office_coworking_bright.jpg',
      'facility_it_multimonitor_desk.jpg',
      'office_workspace_clean.jpg'
    ]
  },
  {
    kws: ['bcons', 'đất sài', 'bất động sản bcons'],
    files: [
      'brand_bcons.jpg',
      'facility_real_estate_luxury_apartments.jpg',
      'facility_urban_modern_complex.jpg',
      'facility_architecture_blueprints_model.jpg',
      'sales_consulting_01.jpg'
    ]
  },
  {
    kws: ['shopee', 'spx express', 'shopeefood'],
    files: [
      'brand_shopee.jpg',
      'facility_logistics_hub_warehouse.jpg',
      'facility_delivery_fleet_van.jpg',
      'warehouse_boxes_pallets.jpg',
      'shipper_delivery_asian.jpg'
    ]
  },
  {
    kws: ['viettel', 'viettel post', 'viettelpost'],
    files: [
      'brand_viettel.jpg',
      'facility_logistics_hub_warehouse.jpg',
      'facility_delivery_fleet_van.jpg',
      'facility_it_server_datacenter.jpg',
      'shipper_delivery_asian.jpg'
    ]
  },
  {
    kws: ['thế giới di động', 'tgdd', 'điện máy xanh', 'bách hóa xanh', 'mwg'],
    files: [
      'brand_mwg.jpg',
      'facility_retail_convenience_store_bright.jpg',
      'facility_supermarket_shelves_fresh.jpg',
      'retail_cashier_store.jpg',
      'supermarket_produce_worker.jpg'
    ]
  },
  {
    kws: ['winmart', 'winmart+', 'masan', 'wincommerce'],
    files: [
      'brand_winmart.jpg',
      'facility_supermarket_shelves_fresh.jpg',
      'supermarket_produce_worker.jpg',
      'facility_retail_convenience_store_bright.jpg',
      'retail_cashier_store.jpg'
    ]
  },
  {
    kws: ['king food', 'kingfood', 'king food market', 'kingfoodmart', 'vua thực phẩm'],
    files: [
      'facility_supermarket_shelves_fresh.jpg',
      'facility_retail_convenience_store_bright.jpg',
      'supermarket_produce_worker.jpg',
      'retail_cashier_store.jpg',
      'facility_retail_mall_modern.jpg'
    ]
  },
  {
    kws: ['chailease', 'cho thuê tài chính chailease'],
    files: [
      'facility_financial_tower_dusk.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_executive_boardroom.jpg',
      'sales_rep_asian.jpg',
      'sales_cskh_asian.jpg'
    ]
  },
  {
    kws: ['sun life', 'sunlife', 'bảo hiểm sun life'],
    files: [
      'facility_financial_tower_dusk.jpg',
      'facility_bank_modern_lobby.jpg',
      'facility_office_coworking_bright.jpg',
      'sales_cskh_asian.jpg',
      'sales_rep_asian.jpg'
    ]
  },
  {
    kws: ['gia cát lợi', 'hàng hóa gia cát lợi'],
    files: [
      'facility_financial_tower_dusk.jpg',
      'facility_bank_trading_floor.jpg',
      'sales_rep_asian.jpg',
      'sales_finance_banking.jpg'
    ]
  },
  {
    kws: ['funix', 'đại học trực tuyến funix', 'fpt funix'],
    files: [
      'facility_it_multimonitor_desk.jpg',
      'facility_education_university_library.jpg',
      'it_dev_asian.jpg',
      'education_asian.jpg'
    ]
  },
  {
    kws: ['circle k', 'circlek', 'gs25', '7-eleven', 'ministop', 'familymart'],
    files: [
      'facility_retail_convenience_store_bright.jpg',
      'retail_cashier_store.jpg',
      'facility_supermarket_shelves_fresh.jpg',
      'retail_convenience_store.jpg'
    ]
  },
  {
    kws: ['pharmacity', 'long châu', 'nhà thuốc an khang'],
    files: [
      'facility_medical_modern_clinic.jpg',
      'facility_supermarket_shelves_fresh.jpg',
      'retail_cashier_store.jpg'
    ]
  },
  {
    kws: ['highlands coffee', 'highlands', 'phúc long', 'the coffee house', 'trung nguyên'],
    files: [
      'facility_cafe_modern_aesthetic.jpg',
      'facility_coffee_espresso_machine.jpg',
      'fnb_barista_asian.jpg',
      'fnb_barista_latte.jpg'
    ]
  },
  {
    kws: ['ghn', 'giao hàng nhanh', 'ghtk', 'giao hàng tiết kiệm', 'j&t express', 'ninja van', 'best express'],
    files: [
      'facility_logistics_hub_warehouse.jpg',
      'facility_delivery_fleet_van.jpg',
      'shipper_delivery_asian.jpg',
      'warehouse_storage_aisle.jpg'
    ]
  },
  {
    kws: ['vinfast', 'vinhomes', 'vingroup', 'vincom'],
    files: [
      'facility_real_estate_luxury_apartments.jpg',
      'facility_car_showroom_luxury.jpg',
      'facility_urban_modern_complex.jpg',
      'facility_financial_tower_dusk.jpg'
    ]
  },
  {
    kws: ['shinhan', 'shinhan bank', 'shinhan finance'],
    files: [
      'brand_shinhan.jpg',
      'facility_financial_tower_dusk.jpg',
      'facility_bank_modern_lobby.jpg',
      'sales_rep_asian.jpg'
    ]
  },
  {
    kws: ['fe credit', 'fecredit', 'vpbank smbc', 'tài chính fe credit', 'fe credit việt nam'],
    files: [
      'brand_fe_credit_building.jpg',
      'facility_financial_tower_dusk.jpg',
      'facility_bank_modern_lobby.jpg'
    ]
  }
];

class StockPhotoResolver {
  /**
   * Khớp từ khóa chuẩn xác theo ranh giới từ tiếng Việt Unicode, tránh bẫy chuỗi con
   */
  matchesKeyword(text, keyword) {
    if (!text || !keyword) return false;
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, 'iu');
    return regex.test(text);
  }

  /**
   * Tính hash ổn định MD5 từ chuỗi để phân bổ xoay vòng ảnh đều đặn, chống trùng lặp tối đa
   */
  getStableHashIndex(key = '', length = 1) {
    if (length <= 1) return 0;
    const crypto = require('crypto');
    const md5 = crypto.createHash('md5').update(String(key)).digest();
    const num = md5.readUInt32BE(0);
    return num % length;
  }

  /**
   * Lấy catalog kết hợp giữa catalog mặc định và catalog tùy chỉnh do người dùng upload
   */
  getCatalog() {
    try {
      const customPath = path.resolve(__dirname, '../../../../data/stock_catalog_custom.json');
      if (fs.existsSync(customPath)) {
        const custom = JSON.parse(fs.readFileSync(customPath, 'utf8'));
        return { ...STOCK_CATALOG, ...custom };
      }
    } catch (e) {}
    return STOCK_CATALOG;
  }

  /**
   * Phân loại & ưu tiên ảnh: 
   * 1. Brand thương hiệu doanh nghiệp (brand_*)
   * 2. Người Châu Á làm việc (*asian*)
   * 3. Cơ sở vật chất, kiến trúc, máy móc hiện đại (facility_*)
   * Tuyệt đối giảm thiểu ảnh người phương Tây
   */
  filterAndPrioritizeFiles(fileList = []) {
    if (!Array.isArray(fileList) || fileList.length === 0) return fileList;
    const existing = fileList.filter(f => fs.existsSync(path.join(stockDir, f)));
    const listToUse = existing.length > 0 ? existing : fileList;
    return [...listToUse].sort((a, b) => {
      const getScore = (fn) => {
        const lower = String(fn).toLowerCase();
        if (lower.startsWith('brand_')) return 40;
        if (lower.includes('asian') || lower.includes('vietnam')) return 30;
        if (lower.startsWith('facility_') || lower.includes('modern_complex') || lower.includes('robotics')) return 20;
        return 5;
      };
      return getScore(b) - getScore(a);
    });
  }

  selectCandidateFile(fileList = [], rotationKey = '') {
    const sorted = this.filterAndPrioritizeFiles(fileList);
    if (!sorted || sorted.length === 0) return null;

    // ƯU TIÊN SỐ 1 TUYỆT ĐỐI: Nếu có ảnh thương hiệu doanh nghiệp (brand_*), ưu tiên chọn ngay ảnh thương hiệu!
    const brandFiles = sorted.filter(fn => fn.toLowerCase().startsWith('brand_'));
    if (brandFiles.length > 0) {
      const chosenIdx = this.getStableHashIndex(rotationKey, brandFiles.length);
      const chosenFile = brandFiles[chosenIdx];
      const filePath = path.join(stockDir, chosenFile);
      if (fs.existsSync(filePath)) return filePath;
    }

    // Ưu tiên hàng đầu tiếp theo: Lọc riêng các ảnh Châu Á hoặc Cơ sở vật chất
    const preferred = sorted.filter(fn => {
      const lower = fn.toLowerCase();
      return lower.includes('asian') || lower.startsWith('facility_');
    });

    const pool = preferred.length > 0 ? preferred : sorted;
    const chosenIdx = this.getStableHashIndex(rotationKey, pool.length);
    const chosenFile = pool[chosenIdx];
    const filePath = path.join(stockDir, chosenFile);
    return fs.existsSync(filePath) ? filePath : null;
  }

  /**
   * Chọn ảnh stock thực tế phù hợp nhất cho công việc kèm xoay vòng chống trùng lặp
   * @param {Object} job - Thông tin công việc (title, category, company, location)
   * @returns {string} - Đường dẫn tuyệt đối tới file ảnh
   */
  resolvePhotoPath(job = {}) {
    const titleText = (job.title || job.cong_viec || job.jobTitle || '').toLowerCase();
    const categoryText = (job.category || job.linh_vuc_nganh_nghe || '').toLowerCase();
    const companyText = (job.company || job.doanh_nghiep || '').toLowerCase();
    const locText = (job.location || job.tinh_thanh || '').toLowerCase();

    // Khóa xoay vòng ổn định đa chiều (id + cty + tiêu đề + tỉnh) để các bài khác nhau xoay vòng tối đa
    const rotationKey = `${job.id || job.jobId || ''}_${companyText}_${titleText}_${locText}`.trim() || 'leadx_job';

    // 0.1 ƯU TIÊN 0: KHỚP THƯƠNG HIỆU DOANH NGHIỆP TUYỂN DỤNG (Logo & Hình ảnh thương hiệu)
    for (const b of BRAND_TARGETS) {
      if (b.kws.some(kw => this.matchesKeyword(companyText, kw) || this.matchesKeyword(titleText, kw))) {
        const found = this.selectCandidateFile(b.files, rotationKey);
        if (found) return found;
      }
    }

    // 0.2 ƯU TIÊN SIÊU CHÍNH XÁC: Các nghề đặc thù khớp thẳng danh sách cơ sở vật chất & nhân sự chuyên biệt
    const microTargets = [
      { 
        kws: ['siêu thị', 'nhân viên siêu thị', 'thu ngân', 'bách hóa', 'tiện lợi', 'bán lẻ'], 
        files: [
          'facility_supermarket_shelves_fresh.jpg',
          'facility_retail_convenience_store_bright.jpg',
          'retail_cashier_store.jpg',
          'supermarket_produce_worker.jpg',
          'facility_retail_mall_modern.jpg',
          'supermarket_checkout_cart.jpg',
          'retail_convenience_store.jpg'
        ] 
      },
      { 
        kws: ['shipper', 'giao hàng', 'tài xế', 'lái xe', 'giao nhận', 'điều vận', 'bưu cục'], 
        files: [
          'facility_delivery_fleet_van.jpg',
          'facility_logistics_hub_warehouse.jpg',
          'shipper_delivery_asian.jpg',
          'facility_shipping_container_port.jpg',
          'warehouse_storage_aisle.jpg'
        ] 
      },
      { 
        kws: ['thủ kho', 'phụ kho', 'bốc xếp', 'đóng gói kho', 'kho vận', 'kho bãi'], 
        files: [
          'facility_warehouse_high_racks.jpg',
          'facility_logistics_hub_warehouse.jpg',
          'warehouse_worker_asian.jpg',
          'warehouse_storage_aisle.jpg',
          'warehouse_boxes_pallets.jpg',
          'warehouse_logistics_asian.jpg'
        ] 
      },
      { 
        kws: ['barista', 'pha chế', 'cà phê', 'quán cafe', 'bartender'], 
        files: [
          'facility_cafe_modern_aesthetic.jpg',
          'facility_coffee_espresso_machine.jpg',
          'fnb_barista_asian.jpg',
          'fnb_barista_latte.jpg',
          'fnb_cafe_counter.jpg'
        ] 
      },
      { 
        kws: ['nhà hàng', 'quán ăn', 'phục vụ', 'khách sạn', 'bếp', 'phụ bếp'], 
        files: [
          'facility_restaurant_interior_warm.jpg',
          'facility_hotel_lobby_luxury.jpg',
          'fnb_dining_restaurant.jpg',
          'restaurant_dining_hall.jpg',
          'restaurant_food_counter.jpg'
        ] 
      },
      { 
        kws: ['lập trình', 'developer', 'frontend', 'backend', 'fullstack', 'tester', 'devops', 'cntt', 'software'], 
        files: [
          'facility_it_server_datacenter.jpg',
          'facility_it_multimonitor_desk.jpg',
          'facility_it_cyber_network.jpg',
          'facility_it_circuit_tech_microchip.jpg',
          'it_dev_asian.jpg',
          'it_coding_screen.jpg',
          'it_dev_workspace.jpg',
          'it_team_software.jpg'
        ] 
      },
      { 
        kws: ['kỹ sư xây dựng', 'an toàn công trình', 'giám sát công trình', 'thi công', 'kiến trúc'], 
        files: [
          'facility_architecture_blueprints_model.jpg',
          'construction_site_modern.jpg',
          'construction_engineer_asian.jpg',
          'industrial_plant_building.jpg'
        ] 
      },
      { 
        kws: ['thợ hàn', 'vận hành máy', 'bảo trì nhà máy', 'công nhân', 'cơ khí', 'nhà xưởng', 'sản xuất'], 
        files: [
          'facility_factory_automated_robotics.jpg',
          'facility_factory_clean_production.jpg',
          'facility_plant_manufacturing_hall.jpg',
          'mechanical_factory_asian.jpg',
          'engineer_tech_factory.jpg'
        ] 
      },
      { 
        kws: ['bất động sản', 'môi giới', 'căn hộ', 'dự án'], 
        files: [
          'facility_real_estate_luxury_apartments.jpg',
          'facility_urban_modern_complex.jpg',
          'facility_architecture_blueprints_model.jpg',
          'sales_consulting_01.jpg',
          'sales_handshake_02.jpg'
        ] 
      },
      { 
        kws: ['tài chính', 'ngân hàng', 'tín dụng', 'thu hồi nợ', 'hồ sơ trả góp', 'thu phí'], 
        files: [
          'facility_bank_modern_lobby.jpg',
          'facility_financial_tower_dusk.jpg',
          'facility_bank_trading_floor.jpg',
          'facility_executive_boardroom.jpg',
          'sales_finance_banking.jpg',
          'sales_finance_02.jpg',
          'sales_consulting_01.jpg'
        ] 
      },
      { 
        kws: ['kế toán', 'nhân sự', 'hành chính', 'lễ tân', 'thư ký', 'văn phòng'], 
        files: [
          'facility_office_coworking_bright.jpg',
          'facility_office_meeting_pod.jpg',
          'facility_office_minimal_desk.jpg',
          'facility_office_glass_atrium.jpg',
          'office_admin_desk.jpg',
          'office_workspace_clean.jpg',
          'office_admin_asian.jpg',
          'office_hr_interview.jpg'
        ] 
      },
      { 
        kws: ['sales ô tô', 'kinh doanh ô tô', 'showroom ô tô'], 
        files: [
          'facility_car_showroom_luxury.jpg',
          'sales_rep_asian.jpg',
          'sales_handshake_02.jpg',
          'sales_discussion_modern.jpg'
        ] 
      },
      { 
        kws: ['chuyên viên kinh doanh', 'trưởng nhóm sales', 'quan hệ khách hàng', 'nhân viên kinh doanh', 'sales'], 
        files: [
          'facility_financial_tower_dusk.jpg',
          'facility_bank_modern_lobby.jpg',
          'facility_office_coworking_bright.jpg',
          'sales_consulting_01.jpg',
          'sales_finance_02.jpg',
          'sales_handshake_02.jpg',
          'sales_meeting_corporate.jpg',
          'sales_cskh_callcenter.jpg',
          'sales_rep_asian.jpg'
        ] 
      }
    ];

    for (const mt of microTargets) {
      if (mt.kws.some(kw => this.matchesKeyword(titleText, kw))) {
        const found = this.selectCandidateFile(mt.files, rotationKey);
        if (found) return found;
      }
    }

    // 1. ƯU TIÊN 1: So khớp trực tiếp trên Tiêu đề công việc và Ngành nghề
    const primaryText = `${titleText} ${categoryText}`;
    const catalog = this.getCatalog();

    for (const [catKey, catInfo] of Object.entries(catalog)) {
      if (catKey === 'general') continue;
      for (const kw of (catInfo.keywords || [])) {
        if (this.matchesKeyword(primaryText, kw)) {
          const files = catInfo.filenames || [catInfo.filename];
          const found = this.selectCandidateFile(files, rotationKey);
          if (found) return found;
        }
      }
    }

    // 2. ƯU TIÊN 2: Quét đoạn mô tả ngắn (loại bỏ từ khóa bẫy)
    let descSnippet = (job.description || '').toLowerCase().slice(0, 300);
    descSnippet = descSnippet
      .replace(/môi\s+trường/g, '')
      .replace(/đào\s+tạo/g, '')
      .replace(/tin\s+học/g, '');

    for (const [catKey, catInfo] of Object.entries(STOCK_CATALOG)) {
      if (catKey === 'general' || catKey === 'education') continue;
      for (const kw of catInfo.keywords) {
        if (this.matchesKeyword(descSnippet, kw)) {
          const files = catInfo.filenames || [catInfo.filename];
          const found = this.selectCandidateFile(files, rotationKey);
          if (found) return found;
        }
      }
    }

    // 3. Fallback tổng hợp: Xoay vòng qua danh sách phong phú cơ sở vật chất và người Châu Á
    const fallback = this.selectCandidateFile(STOCK_CATALOG.general.filenames, rotationKey);
    if (fallback) return fallback;

    // Fallback an toàn cuối cùng
    return path.join(stockDir, 'facility_financial_tower_dusk.jpg');
  }

  /**
   * Đọc ảnh thành Base64 Data URI để nhúng trực tiếp vào Puppeteer không lo lỗi đường dẫn
   * @param {Object} job 
   * @returns {string} - data:image/jpeg;base64,...
   */
  resolvePhotoDataUri(job = {}) {
    const photoPath = this.resolvePhotoPath(job);
    if (!photoPath || !fs.existsSync(photoPath)) {
      return '';
    }
    const ext = path.extname(photoPath).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
    const base64 = fs.readFileSync(photoPath).toString('base64');
    return `data:${mime};base64,${base64}`;
  }
}

module.exports = new StockPhotoResolver();
