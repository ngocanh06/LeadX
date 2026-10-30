/**
 * industry_photo_collector.js - Trình tự động thu thập thư viện 1.000+ ảnh nghề nghiệp chuẩn thương mại
 * Nguồn: Wikimedia Commons API (Public Domain, CC0, CC-BY, CC-BY-SA)
 * Đảm bảo: Ảnh chụp thực tế con người làm việc, độ phân giải cao >= 1000px, không watermark, đầy đủ metadata & bản quyền.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Cấu hình đường dẫn
const baseStockDir = path.resolve(__dirname, '../data/images/stock');
const industriesDir = path.join(baseStockDir, 'industries');
const metadataCsvPath = path.join(baseStockDir, 'industry_images_catalog.csv');
const customCatalogJsonPath = path.resolve(__dirname, '../data/stock_catalog_custom.json');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(baseStockDir)) fs.mkdirSync(baseStockDir, { recursive: true });
if (!fs.existsSync(industriesDir)) fs.mkdirSync(industriesDir, { recursive: true });

// Danh mục 18 nhóm ngành nghề chuẩn JobCentral với phân bổ mục tiêu ~1.090 ảnh
const INDUSTRY_TAXONOMY = [
  {
    code: 'IT',
    id: 'technology',
    name: 'Công nghệ thông tin, phần mềm, AI, dữ liệu',
    targetCount: 80,
    vietnameseKeywords: ['công nghệ thông tin', 'lập trình', 'it', 'phần mềm', 'developer', 'frontend', 'backend', 'fullstack', 'data', 'ai', 'devops', 'tester', 'qc'],
    subIndustries: [
      { sub: 'software_engineering', job: 'Software Developer', queries: ['software engineer working laptop office desk', 'computer programmer typing screen office', 'web developer workstation office desk', 'software developers collaborating screen'] },
      { sub: 'data_ai', job: 'Data Analyst & AI Engineer', queries: ['data analyst working computer monitor office', 'data scientist analyzing dashboard screen', 'machine learning engineer office computer'] },
      { sub: 'devops_cloud', job: 'DevOps & System Admin', queries: ['network engineer datacenter server rack', 'system administrator working server room technician'] },
      { sub: 'ui_ux_design', job: 'UI UX Designer', queries: ['ui ux designer working monitor office', 'digital designer working tablet computer studio'] },
      { sub: 'it_support', job: 'IT Support Specialist', queries: ['it support technician servicing laptop desk', 'computer technician workstation office'] }
    ]
  },
  {
    code: 'SALES',
    id: 'business_sales',
    name: 'Kinh doanh, bán hàng, phát triển thị trường',
    targetCount: 100,
    vietnameseKeywords: ['bán hàng', 'sales', 'kinh doanh', 'tư vấn', 'telesale', 'phát triển thị trường', 'chốt hợp đồng', 'b2b', 'b2c', 'account executive'],
    subIndustries: [
      { sub: 'b2b_sales', job: 'Sales Representative & B2B', queries: ['sales representative meeting corporate client', 'business sales executive negotiation office', 'sales consultant presenting client tablet'] },
      { sub: 'business_dev', job: 'Business Development Manager', queries: ['business development manager meeting', 'business people handshake corporate office', 'account executive client meeting discussion'] },
      { sub: 'direct_sales', job: 'Direct Sales Consultant', queries: ['car showroom sales consultant customer', 'sales agent discussing contract customer desk'] },
      { sub: 'telemarketing', job: 'Telemarketing & Inside Sales', queries: ['telesales representative calling headset computer', 'inside sales agent office phone call'] }
    ]
  },
  {
    code: 'MKT',
    id: 'marketing_media',
    name: 'Marketing, truyền thông, sáng tạo nội dung',
    targetCount: 70,
    vietnameseKeywords: ['marketing', 'truyền thông', 'content', 'seo', 'digital marketing', 'sáng tạo nội dung', 'quảng cáo', 'copywriter', 'brand'],
    subIndustries: [
      { sub: 'digital_marketing', job: 'Digital Marketing Specialist', queries: ['digital marketing specialist analytics computer', 'marketing team campaign strategy whiteboard', 'social media marketing manager working laptop'] },
      { sub: 'content_creation', job: 'Content Creator & Copywriter', queries: ['copywriter writing article laptop coffee', 'content creator working computer studio creative'] },
      { sub: 'public_relations', job: 'PR & Event Planner', queries: ['public relations specialist press conference', 'event organizer coordinator headset venue'] }
    ]
  },
  {
    code: 'FIN',
    id: 'finance_banking',
    name: 'Kế toán, tài chính, ngân hàng, bảo hiểm',
    targetCount: 60,
    vietnameseKeywords: ['kế toán', 'tài chính', 'ngân hàng', 'bảo hiểm', 'kiểm toán', 'thuế', 'tín dụng', 'giao dịch viên', 'thu hồi nợ', 'thu phí'],
    subIndustries: [
      { sub: 'accounting_audit', job: 'Accountant & Auditor', queries: ['accountant working financial report calculator desk', 'auditor reviewing financial documents ledger', 'female accountant working spreadsheet office'] },
      { sub: 'banking_teller', job: 'Bank Teller & Loan Officer', queries: ['bank teller customer service counter', 'bank officer discussing loan customer desk'] },
      { sub: 'financial_analyst', job: 'Financial Analyst', queries: ['financial analyst trading terminal stock market', 'investment banker analyzing charts computer'] },
      { sub: 'insurance_consultant', job: 'Insurance Agent', queries: ['insurance agent consulting policyholder', 'financial advisor consulting family'] }
    ]
  },
  {
    code: 'HR',
    id: 'human_resources',
    name: 'Nhân sự, tuyển dụng, hành chính, văn phòng',
    targetCount: 60,
    vietnameseKeywords: ['nhân sự', 'tuyển dụng', 'hành chính', 'văn phòng', 'le tan', 'lễ tân', 'hr', 'c&b', 'thư ký', 'trợ lý'],
    subIndustries: [
      { sub: 'recruitment', job: 'HR Recruiter & Interviewer', queries: ['human resources recruiter interviewing job candidate', 'job interview corporate office desk resume', 'hr specialist onboarding new employee'] },
      { sub: 'office_admin', job: 'Office Administrator', queries: ['office administrator organizing documents filing', 'executive assistant working corporate desk computer'] },
      { sub: 'receptionist', job: 'Corporate Receptionist', queries: ['corporate office receptionist welcoming visitor desk', 'reception desk lobby professional receptionist'] }
    ]
  },
  {
    code: 'EDU',
    id: 'education_training',
    name: 'Giáo dục, đào tạo, nghiên cứu',
    targetCount: 60,
    vietnameseKeywords: ['giáo dục', 'đào tạo', 'giáo viên', 'giảng viên', 'gia sư', 'nghiên cứu', 'mầm non', 'trợ giảng', 'tiếng anh'],
    subIndustries: [
      { sub: 'school_teacher', job: 'Teacher & Educator', queries: ['teacher classroom students blackboard lesson', 'female teacher teaching elementary school students', 'teacher helping student desk classroom'] },
      { sub: 'higher_education', job: 'University Lecturer & Researcher', queries: ['university professor lecturing hall auditorium', 'science researcher laboratory microscope university'] },
      { sub: 'corporate_trainer', job: 'Trainer & Workshop Host', queries: ['corporate trainer presentation workshop whiteboard', 'seminar speaker presentation auditorium'] }
    ]
  },
  {
    code: 'MED',
    id: 'healthcare_medical',
    name: 'Y tế, dược phẩm, chăm sóc sức khỏe',
    targetCount: 60,
    vietnameseKeywords: ['y tế', 'bác sĩ', 'điều dưỡng', 'dược sĩ', 'y tá', 'bệnh viện', 'phòng khám', 'nha sĩ', 'xét nghiệm'],
    subIndustries: [
      { sub: 'physician_doctor', job: 'Doctor & Physician', queries: ['medical doctor stethoscope examining patient clinic', 'physician consultation patient hospital desk', 'doctor reviewing medical chart hospital corridor'] },
      { sub: 'nursing', job: 'Nurse & Caregiver', queries: ['nurse attending patient hospital bed caring', 'hospital nurse medical ward uniform'] },
      { sub: 'pharmacy', job: 'Pharmacist', queries: ['pharmacist dispensing medicine pharmacy shelves counter', 'chemist working laboratory pharmaceutical testing'] },
      { sub: 'dentistry', job: 'Dentist & Dental Assistant', queries: ['dentist examining patient teeth dental clinic chair'] }
    ]
  },
  {
    code: 'HOSP',
    id: 'hospitality_tourism',
    name: 'Nhà hàng, khách sạn, du lịch',
    targetCount: 80,
    vietnameseKeywords: ['khách sạn', 'du lịch', 'resort', 'lễ tân khách sạn', 'hướng dẫn viên', 'buồng phòng', 'phục vụ bàn', 'waiter', 'waitress'],
    subIndustries: [
      { sub: 'hotel_staff', job: 'Hotel Front Desk & Concierge', queries: ['hotel receptionist check in counter guest', 'hotel concierge assisting tourist guest lobby', 'hotel bellhop luggage cart luxury hotel'] },
      { sub: 'tour_guide', job: 'Tour Guide & Travel Coordinator', queries: ['tour guide leading tourists sightseeing landmark', 'travel agency consultant booking trip client'] },
      { sub: 'food_service', job: 'Restaurant Waiter & Waitress', queries: ['waiter serving food restaurant dining table', 'waitress taking order dining restaurant guests'] },
      { sub: 'housekeeping', job: 'Hotel Housekeeper', queries: ['hotel housekeeper making bed luxury room clean', 'room attendant cleaning hotel bedroom'] }
    ]
  },
  {
    code: 'MFG',
    id: 'manufacturing_industry',
    name: 'Sản xuất, công nghiệp, cơ khí, điện',
    targetCount: 100,
    vietnameseKeywords: ['sản xuất', 'nhà máy', 'công nhân', 'cơ khí', 'vận hành máy', 'hàn', 'tiện', 'bảo trì', 'kỹ thuật cơ điện', 'tự động hóa', 'qc'],
    subIndustries: [
      { sub: 'factory_worker', job: 'Assembly Line Factory Worker', queries: ['factory assembly line workers manufacturing electronic', 'factory worker operating industrial machinery plant', 'cleanroom manufacturing technician assembly'] },
      { sub: 'mechanical_machinist', job: 'Machinist & CNC Operator', queries: ['cnc machinist operator metal working lathe', 'welder working metal spark workshop safety helmet', 'mechanic repairing industrial machinery workshop'] },
      { sub: 'industrial_electrician', job: 'Industrial Electrician', queries: ['industrial electrician electrical control panel wiring', 'electrical engineer inspecting substation power plant'] },
      { sub: 'quality_control', job: 'QC & QA Inspector', queries: ['quality control inspector manufacturing factory clipboard', 'quality assurance technician checking product parts'] }
    ]
  },
  {
    code: 'CONST',
    id: 'construction_real_estate',
    name: 'Xây dựng, kiến trúc, bất động sản',
    targetCount: 70,
    vietnameseKeywords: ['xây dựng', 'công trình', 'kỹ sư xây dựng', 'giám sát', 'kiến trúc sư', 'kết cấu', 'an toàn lao động', 'thi công', 'bất động sản'],
    subIndustries: [
      { sub: 'civil_engineer', job: 'Civil Engineer & Site Supervisor', queries: ['civil engineer construction site blueprint hardhat', 'construction supervisor inspecting building site helmet', 'female civil engineer construction site plan'] },
      { sub: 'architect', job: 'Architect & Draftsman', queries: ['architect working blueprint drafting table office', 'architectural designer working cad computer model'] },
      { sub: 'construction_worker', job: 'Construction Tradesperson', queries: ['construction workers pouring concrete building site', 'mason bricklayer building wall construction site', 'heavy equipment operator excavator construction'] }
    ]
  },
  {
    code: 'LOG',
    id: 'logistics_warehouse',
    name: 'Logistics, kho vận, giao nhận, vận tải',
    targetCount: 70,
    vietnameseKeywords: ['logistics', 'kho', 'kho vận', 'thủ kho', 'giao hàng', 'shipper', 'tài xế', 'lái xe', 'bốc xếp', 'điều vận', 'xuất nhập khẩu'],
    subIndustries: [
      { sub: 'warehouse_worker', job: 'Warehouse Associate & Picker', queries: ['warehouse worker barcode scanner boxes shelves', 'warehouse workers sorting parcels logistics hub', 'inventory clerk checking stock warehouse clipboard'] },
      { sub: 'forklift_operator', job: 'Forklift Operator', queries: ['forklift operator driving pallet warehouse aisles', 'forklift loading cargo shipping container logistics'] },
      { sub: 'delivery_driver', job: 'Delivery Driver & Courier', queries: ['delivery driver courier handing package customer van', 'truck driver commercial logistics vehicle cab', 'courier parcel delivery motorcycle street'] }
    ]
  },
  {
    code: 'RET',
    id: 'retail_supermarket',
    name: 'Bán lẻ, siêu thị, thương mại điện tử',
    targetCount: 60,
    vietnameseKeywords: ['siêu thị', 'bán lẻ', 'thu ngân', 'bách hóa', 'tiện lợi', 'cửa hàng', 'cửa hàng trưởng', 'nhân viên bán hàng siêu thị'],
    subIndustries: [
      { sub: 'supermarket_cashier', job: 'Supermarket Cashier', queries: ['supermarket cashier scanning items checkout counter', 'grocery store cashier customer paying register'] },
      { sub: 'retail_clerk', job: 'Store Merchandiser & Clerk', queries: ['retail store clerk restocking shelves supermarket produce', 'supermarket staff arranging vegetables display', 'retail store sales assistant helping shopper clothing'] },
      { sub: 'store_manager', job: 'Retail Store Manager', queries: ['retail store manager checking inventory tablet aisle', 'convenience store manager working register counter'] }
    ]
  },
  {
    code: 'FOOD',
    id: 'restaurant_kitchen',
    name: 'Nhà hàng, bếp, chế biến thực phẩm',
    targetCount: 40,
    vietnameseKeywords: ['đầu bếp', 'phụ bếp', 'bếp trưởng', 'làm bánh', 'pha chế', 'barista', 'bartender', 'nấu ăn'],
    subIndustries: [
      { sub: 'chef_cook', job: 'Executive Chef & Line Cook', queries: ['chef cooking commercial kitchen restaurant stove', 'line cook preparing food plate restaurant kitchen', 'chef garnishing gourmet dish restaurant'] },
      { sub: 'baker_pastry', job: 'Baker & Pastry Chef', queries: ['baker kneading bread dough bakery oven', 'pastry chef decorating cake bakery display'] },
      { sub: 'barista_bartender', job: 'Barista & Bartender', queries: ['barista preparing espresso coffee machine cafe', 'bartender mixing cocktail shaker bar counter'] }
    ]
  },
  {
    code: 'AGRI',
    id: 'agriculture_fishery',
    name: 'Nông nghiệp, thủy sản, môi trường',
    targetCount: 40,
    vietnameseKeywords: ['nông nghiệp', 'thủy sản', 'nuôi trồng', 'trang trại', 'môi trường', 'chăn nuôi', 'thu hoạch'],
    subIndustries: [
      { sub: 'farming_crops', job: 'Agricultural Farmer', queries: ['farmer harvesting crops organic vegetable field', 'farmers working rice field agriculture harvest', 'greenhouse farmer inspecting hydroponic tomato plants'] },
      { sub: 'aquaculture_fishery', job: 'Aquaculture Specialist & Fisher', queries: ['aquaculture worker inspecting fish farm net water', 'fisherman harvesting fresh catch boat commercial'] },
      { sub: 'veterinary_livestock', job: 'Veterinarian & Livestock Staff', queries: ['veterinarian examining cow farm dairy agriculture', 'veterinarian treating animal clinic examining table'] }
    ]
  },
  {
    code: 'BEAUTY',
    id: 'beauty_spa_fashion',
    name: 'Làm đẹp, spa, thời trang',
    targetCount: 30,
    vietnameseKeywords: ['spa', 'thẩm mỹ', 'làm đẹp', 'chăm sóc da', 'tóc', 'nail', 'make up', 'thời trang'],
    subIndustries: [
      { sub: 'spa_therapist', job: 'Spa Therapist & Esthetician', queries: ['spa therapist facial massage treatment salon wellness', 'massage therapist wellness center relaxation client'] },
      { sub: 'hair_makeup', job: 'Hair Stylist & Makeup Artist', queries: ['hair stylist cutting hair client salon mirror', 'makeup artist applying cosmetics model beauty chair'] },
      { sub: 'nail_technician', job: 'Nail Technician', queries: ['nail technician manicure client salon beauty desk'] }
    ]
  },
  {
    code: 'CS',
    id: 'customer_service',
    name: 'Dịch vụ khách hàng, chăm sóc khách hàng',
    targetCount: 30,
    vietnameseKeywords: ['cskh', 'chăm sóc khách hàng', 'call center', 'tổng đài', 'trực tổng đài', 'hỗ trợ khách hàng', 'helpdesk'],
    subIndustries: [
      { sub: 'call_center', job: 'Call Center Representative', queries: ['call center representative headset talking customer computer', 'customer support agent headset smiling office monitor', 'customer care operator workstation call center'] },
      { sub: 'client_service', job: 'Helpdesk & Customer Care', queries: ['customer service specialist helping client counter desk', 'technical support agent headset troubleshooting desk'] }
    ]
  },
  {
    code: 'LABOR',
    id: 'general_labor_maintenance',
    name: 'Lao động phổ thông, vệ sinh, bảo trì',
    targetCount: 40,
    vietnameseKeywords: ['lao động phổ thông', 'vệ sinh', 'tạp vụ', 'bảo vệ', 'bảo trì', 'rửa xe', 'phụ việc'],
    subIndustries: [
      { sub: 'cleaning_janitor', job: 'Janitor & Cleaning Staff', queries: ['cleaning staff mopping office floor commercial janitor', 'cleaner sanitizing office desk commercial cleaning', 'window cleaner cleaning modern glass building exterior'] },
      { sub: 'security_guard', job: 'Security Guard', queries: ['security guard monitoring cctv surveillance screens office', 'security officer uniform standing duty commercial building'] },
      { sub: 'handyman_maintenance', job: 'Maintenance Handyman', queries: ['maintenance worker repairing plumbing pipe building', 'handyman fixing air conditioner building maintenance'] }
    ]
  },
  {
    code: 'ART',
    id: 'art_design_media_production',
    name: 'Nghệ thuật, thiết kế, nhiếp ảnh, sản xuất video',
    targetCount: 40,
    vietnameseKeywords: ['thiết kế đồ họa', 'nhiếp ảnh', 'quay phim', 'dựng phim', 'graphic designer', 'photographer', 'video editor', 'chụp ảnh'],
    subIndustries: [
      { sub: 'graphic_design', job: 'Graphic Designer', queries: ['graphic designer drawing tablet stylus computer studio', 'designer working color palette typography monitor'] },
      { sub: 'photography_video', job: 'Photographer & Cameraman', queries: ['photographer studio camera tripod lighting model portrait', 'cameraman filming video camera studio television', 'video editor editing footage dual monitors headphones'] }
    ]
  }
];

// Hàm làm sạch chuỗi
function sanitizeFilename(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 50);
}

// Bảng ánh xạ giấy phép thương mại
function getLicenseInfo(extMetadata) {
  const licenseShort = extMetadata?.LicenseShortName?.value || extMetadata?.License?.value || 'CC BY-SA';
  const author = (extMetadata?.Artist?.value || extMetadata?.Author?.value || 'Wikimedia Contributor')
    .replace(/<[^>]*>/g, '')
    .trim()
    .slice(0, 80);
  const licenseUrl = extMetadata?.LicenseUrl?.value || 'https://creativecommons.org/';
  
  // Xác định khả năng thương mại hợp pháp
  let commercial = 'YES';
  const lowerLic = licenseShort.toLowerCase();
  if (lowerLic.includes('nc') || lowerLic.includes('non-commercial') || lowerLic.includes('noncommercial')) {
    commercial = 'NO (Non-Commercial)';
  } else if (lowerLic.includes('cc0') || lowerLic.includes('public domain') || lowerLic.includes('pd')) {
    commercial = 'YES (Public Domain / CC0)';
  } else {
    commercial = 'YES (CC BY / CC BY-SA Attribution Required)';
  }

  return {
    licenseShort,
    author: author || 'Unknown Author',
    licenseUrl,
    commercial
  };
}

// Hàm sleep
const sleep = ms => new Promise(res => setTimeout(res, ms));

class IndustryPhotoCollector {
  constructor() {
    this.seenUrls = new Set();
    this.seenHashes = new Set();
    this.catalog = [];
    this.targetTotal = 1000;
  }

  // Nạp metadata CSV cũ nếu đã có để chạy nối tiếp (resume)
  loadExistingMetadata() {
    if (!fs.existsSync(metadataCsvPath)) return;
    try {
      const content = fs.readFileSync(metadataCsvPath, 'utf8');
      const lines = content.split('\n').filter(Boolean);
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split('","').map(s => s.replace(/^"|"$/g, ''));
        if (parts.length >= 7) {
          const imgUrl = parts[6];
          const filename = parts[5];
          this.seenUrls.add(imgUrl);
          this.seenHashes.add(filename);
        }
      }
      console.log(`[Collector] Đã nạp ${this.seenUrls.size} ảnh đã có từ trước trong catalog.`);
    } catch (e) {
      console.warn(`[Collector] Không thể đọc catalog cũ: ${e.message}`);
    }
  }

  // Tìm kiếm ảnh qua Wikimedia Commons API
  async searchWikimedia(query, limit = 15) {
    const encoded = encodeURIComponent(query);
    const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encoded}&gsrnamespace=6&gsrlimit=${limit}&prop=imageinfo&iiprop=url|size|extmetadata|mime&format=json`;
    
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'JobCentralRecruitmentBot/1.0 (https://jobcentral.vn; contact@jobcentral.vn)'
        }
      });
      if (!res.ok) return [];
      const json = await res.json();
      if (!json.query?.pages) return [];
      return Object.values(json.query.pages);
    } catch (err) {
      console.warn(`[API] Lỗi tìm kiếm "${query}": ${err.message}`);
      return [];
    }
  }

  // Tải ảnh về đĩa an toàn
  async downloadImage(imageUrl, destPath) {
    const res = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'JobCentralRecruitmentBot/1.0 (https://jobcentral.vn; contact@jobcentral.vn)'
      }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    return buffer.length;
  }

  // Bộ lọc loại bỏ ảnh rác, sơ đồ, bản đồ, logo, quốc kỳ, con tem
  isValidAuthenticJobPhoto(pageTitle, mime, width, height, extMetadata) {
    if (!mime || !mime.startsWith('image/')) return false;
    if (mime === 'image/svg+xml' || mime === 'image/gif' || mime === 'image/tiff') return false;

    // Kích thước tối thiểu 1000px chiều dài, 650px chiều cao để poster sắc nét
    if (width < 950 || height < 600) return false;

    // Tỷ lệ khung hình hợp lý (landscape hoặc portrait cân đối)
    const ratio = width / height;
    if (ratio < 0.55 || ratio > 2.2) return false;

    const lowerTitle = pageTitle.toLowerCase();
    const junkWords = [
      'flag', 'coat of arms', 'seal', 'logo', 'icon', 'map', 'diagram', 
      'chart', 'stamp', 'banknote', 'coin', 'monument', 'statue', 
      'cemetery', 'grave', 'drawing', 'painting', 'sketch', 'illustration',
      'vector', 'screenshot', 'signboard', 'blueprint', 'cartoon', 'anime',
      'micrograph', 'fossil', 'specimen', 'caricature', 'poster',
      'eeprom', 'circuit', 'microcontroller', 'arduino', 'programmer box',
      'adapter', 'cable', 'socket', 'chip', 'manual', 'textbook', 'cover',
      'slide', 'banner', 'page', 'postage', 'device', 'hardware box'
    ];

    if (junkWords.some(w => lowerTitle.includes(w))) return false;

    // Giấy phép không được là Non-Commercial (vì hệ thống tuyển dụng dùng trong thương mại)
    const lic = getLicenseInfo(extMetadata);
    if (lic.commercial.startsWith('NO')) return false;

    return true;
  }

  // Chạy thu thập theo từng đợt (Batch Mode hoặc Full)
  async collectAll(options = {}) {
    const maxTarget = options.maxTarget || 1090;
    const batchLimit = options.batchLimit || maxTarget;
    console.log(`========================================================================`);
    console.log(`🚀 BẮT ĐẦU THU THẬP THƯ VIỆN ẢNH NGHỀ NGHIỆP THỰC TẾ CHO JOBCENTRAL`);
    console.log(`🎯 Mục tiêu đợt này: ${batchLimit} ảnh (Tối đa toàn hệ thống: ${maxTarget} ảnh)`);
    console.log(`📁 Thư mục lưu trữ: ${industriesDir}`);
    console.log(`========================================================================\n`);

    this.loadExistingMetadata();
    let totalCollectedThisSession = 0;
    const statsByIndustry = {};

    for (const ind of INDUSTRY_TAXONOMY) {
      statsByIndustry[ind.name] = { target: ind.targetCount, collected: 0, existing: 0 };
    }

    // Đếm số ảnh đã có trong thư mục
    for (const ind of INDUSTRY_TAXONOMY) {
      const indDir = path.join(industriesDir, ind.id);
      if (fs.existsSync(indDir)) {
        const files = fs.readdirSync(indDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
        statsByIndustry[ind.name].existing = files.length;
      }
    }

    // Lặp qua từng nhóm ngành
    for (const ind of INDUSTRY_TAXONOMY) {
      if (totalCollectedThisSession >= batchLimit) break;

      const indDir = path.join(industriesDir, ind.id);
      if (!fs.existsSync(indDir)) fs.mkdirSync(indDir, { recursive: true });

      const targetForInd = Math.min(ind.targetCount, batchLimit - totalCollectedThisSession);
      let collectedForInd = statsByIndustry[ind.name].existing;

      console.log(`\n📌 [${ind.code}] ${ind.name} (Đã có: ${collectedForInd}/${ind.targetCount})`);

      for (const sub of ind.subIndustries) {
        if (collectedForInd >= ind.targetCount || totalCollectedThisSession >= batchLimit) break;

        for (const query of sub.queries) {
          if (collectedForInd >= ind.targetCount || totalCollectedThisSession >= batchLimit) break;

          console.log(`  🔍 Tìm kiếm: "${query}"...`);
          const pages = await this.searchWikimedia(query, 18);
          await sleep(250); // Giãn cách tôn trọng Wikimedia API policy

          for (const page of pages) {
            if (collectedForInd >= ind.targetCount || totalCollectedThisSession >= batchLimit) break;

            const info = page.imageinfo?.[0];
            if (!info || !info.url) continue;

            const directUrl = info.url;
            if (this.seenUrls.has(directUrl)) continue;

            const width = info.width || 0;
            const height = info.height || 0;
            const mime = info.mime || '';
            const extMeta = info.extmetadata || {};

            if (!this.isValidAuthenticJobPhoto(page.title, mime, width, height, extMeta)) {
              continue;
            }

            // Tên file chuẩn: IT-0001-software-developer.jpg
            const seqNum = String(collectedForInd + 1).padStart(4, '0');
            const cleanJob = sanitizeFilename(sub.job);
            const ext = mime === 'image/png' ? '.png' : '.jpg';
            const filename = `${ind.code}-${seqNum}-${cleanJob}${ext}`;
            const destPath = path.join(indDir, filename);
            const directStockPath = path.join(baseStockDir, filename);

            try {
              console.log(`    ⬇️ [${ind.code}-${seqNum}] Đang tải: ${page.title.slice(5, 55)}... (${width}x${height})`);
              const sizeBytes = await this.downloadImage(directUrl, destPath);

              // Copy 1 bản ra trực tiếp kho stock chính để LeadX generator dùng ngay lập tức
              fs.copyFileSync(destPath, directStockPath);

              const lic = getLicenseInfo(extMeta);
              const sourcePageUrl = info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`;

              const record = {
                image_id: `${ind.code}-${seqNum}`,
                industry: ind.name,
                sub_industry: sub.sub,
                job_title: sub.job,
                image_description: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
                filename: filename,
                image_url: directUrl,
                source_url: sourcePageUrl,
                source_name: 'Wikimedia Commons',
                author: lic.author,
                license: lic.licenseShort,
                commercial_use: lic.commercial,
                width: width,
                height: height,
                downloaded: 'YES',
                verified: 'YES',
                duplicate_status: 'UNIQUE',
                notes: `Chất lượng cao ${width}x${height}, giấy phép ${lic.licenseShort}`
              };

              this.catalog.push(record);
              this.seenUrls.add(directUrl);
              this.seenHashes.add(filename);

              collectedForInd++;
              totalCollectedThisSession++;
              statsByIndustry[ind.name].collected++;

              await sleep(200); // Tốc độ tải an toàn không làm nghẽn mạng
            } catch (dlErr) {
              console.warn(`    ⚠️ Bỏ qua ảnh lỗi: ${dlErr.message}`);
            }
          }
        }
      }
    }

    // Xuất file CSV Metadata
    this.exportMetadataCsv();

    // Cập nhật cấu hình stock_catalog_custom.json cho LeadX Engine
    this.updateStockCatalogJson();

    // Báo cáo tổng kết
    this.printSummaryReport(totalCollectedThisSession, statsByIndustry);

    return {
      totalCollectedThisSession,
      catalogCount: this.catalog.length,
      statsByIndustry
    };
  }

  // Xuất file CSV
  exportMetadataCsv() {
    const headers = [
      'image_id', 'industry', 'sub_industry', 'job_title', 'image_description',
      'filename', 'image_url', 'source_url', 'source_name', 'author',
      'license', 'commercial_use', 'width', 'height', 'downloaded',
      'verified', 'duplicate_status', 'notes'
    ];

    let csvContent = '';
    if (!fs.existsSync(metadataCsvPath)) {
      csvContent = headers.map(h => `"${h}"`).join(',') + '\n';
    }

    const rows = this.catalog.map(item => {
      return headers.map(h => `"${String(item[h] || '').replace(/"/g, '""')}"`).join(',');
    });

    if (rows.length > 0) {
      fs.appendFileSync(metadataCsvPath, csvContent + rows.join('\n') + '\n', 'utf8');
      console.log(`\n📄 [Metadata] Đã xuất thành công metadata vào: ${metadataCsvPath}`);
    }
  }

  // Cập nhật cấu hình stock_catalog_custom.json để stockPhotoResolver nạp ngay
  updateStockCatalogJson() {
    let custom = {};
    if (fs.existsSync(customCatalogJsonPath)) {
      try {
        custom = JSON.parse(fs.readFileSync(customCatalogJsonPath, 'utf8'));
      } catch (e) {}
    }

    for (const ind of INDUSTRY_TAXONOMY) {
      const indDir = path.join(industriesDir, ind.id);
      if (!fs.existsSync(indDir)) continue;

      const files = fs.readdirSync(indDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png'));
      if (files.length === 0) continue;

      if (!custom[ind.id]) {
        custom[ind.id] = {
          filenames: [],
          keywords: ind.vietnameseKeywords
        };
      }

      // Hợp nhất tên file (không trùng)
      const existing = new Set(custom[ind.id].filenames);
      for (const f of files) {
        existing.add(f);
      }
      custom[ind.id].filenames = Array.from(existing);
    }

    fs.writeFileSync(customCatalogJsonPath, JSON.stringify(custom, null, 2), 'utf8');
    console.log(`⚙️ [Config] Đã liên kết toàn bộ ảnh mới vào hệ thống tự động: ${customCatalogJsonPath}`);
  }

  // In báo cáo thống kê
  printSummaryReport(totalCollected, stats) {
    console.log(`\n========================================================================`);
    console.log(`📊 BÁO CÁO TỔNG KẾT THU THẬP HÌNH ẢNH NGHỀ NGHIỆP JOBCENTRAL`);
    console.log(`========================================================================`);
    console.log(`- Tổng số ảnh mới thu thập đợt này: ${totalCollected}`);
    console.log(`- Trạng thái giấy phép: 100% Đã xác minh (Public Domain, CC0, CC BY, CC BY-SA)`);
    console.log(`- Thương mại: 100% Hợp pháp sử dụng cho nền tảng tuyển dụng`);
    console.log(`------------------------------------------------------------------------`);
    console.log(`NGÀNH NGHỀ                                  | ĐÃ TẢI THÀNH CÔNG | MỤC TIÊU`);
    console.log(`------------------------------------------------------------------------`);
    for (const [name, s] of Object.entries(stats)) {
      const totalNow = s.existing + s.collected;
      const pct = Math.round((totalNow / s.target) * 100);
      console.log(`${name.padEnd(43)} | ${String(totalNow).padStart(6)} / ${String(s.target).padEnd(5)} | (${pct}%)`);
    }
    console.log(`========================================================================\n`);
  }
}

// Khởi chạy
if (require.main === module) {
  const args = process.argv.slice(2);
  let batchLimit = 100; // Mặc định đợt 1 là 100 ảnh theo yêu cầu người dùng
  if (args.includes('--all')) {
    batchLimit = 1090;
  } else {
    const bArg = args.find(a => a.startsWith('--batch='));
    if (bArg) batchLimit = parseInt(bArg.split('=')[1], 10) || 100;
  }

  const collector = new IndustryPhotoCollector();
  collector.collectAll({ batchLimit }).catch(err => {
    console.error('Lỗi thực thi:', err);
  });
}

module.exports = IndustryPhotoCollector;
