/**
 * jobMarketTaxonomyService.js - Hệ thống Phân loại Ngành nghề & Job Roles Đa cấp (Taxonomy Engine)
 * Phục vụ phân tích thị trường việc làm tổng thể: Không hard-code bất kỳ ngành cụ thể nào.
 */

const INDUSTRY_TAXONOMY = [
  {
    id: 'it',
    name: 'Công nghệ thông tin',
    nameEn: 'Information Technology',
    aliases: ['it', 'cntt', 'công nghệ thông tin', 'phan mem', 'phần mềm', 'software', 'tech'],
    jobRoles: [
      { id: 'software_engineer', name: 'Software Engineer', aliases: ['software engineer', 'lập trình viên', 'developer', 'software dev'] },
      { id: 'frontend_developer', name: 'Frontend Developer', aliases: ['frontend', 'front-end', 'react', 'vue', 'angular'] },
      { id: 'backend_developer', name: 'Backend Developer', aliases: ['backend', 'back-end', 'node', 'java', 'golang', 'python backend', 'c#'] },
      { id: 'fullstack_developer', name: 'Full-stack Developer', aliases: ['fullstack', 'full-stack'] },
      { id: 'mobile_developer', name: 'Mobile Developer', aliases: ['mobile', 'android', 'ios', 'flutter', 'react native'] },
      { id: 'qa_qc', name: 'QA/QC Engineer', aliases: ['qa', 'qc', 'tester', 'kiểm thử phần mềm', 'quality assurance'] },
      { id: 'devops', name: 'DevOps / SRE', aliases: ['devops', 'sysadmin', 'cloud engineer', 'sre'] },
      { id: 'it_support', name: 'IT Support / Helpdesk', aliases: ['it support', 'helpdesk', 'kỹ thuật it', 'quản trị mạng'] },
      { id: 'system_analyst', name: 'System Analyst', aliases: ['system analyst', 'phân tích hệ thống'] },
      { id: 'project_manager_it', name: 'IT Project Manager', aliases: ['it pm', 'project manager it', 'quản lý dự án cntt'] }
    ]
  },
  {
    id: 'data_ai',
    name: 'Data & Artificial Intelligence',
    nameEn: 'Data & AI',
    aliases: ['data', 'dữ liệu', 'ai', 'trí tuệ nhân tạo', 'data science', 'machine learning'],
    jobRoles: [
      { id: 'data_analyst', name: 'Data Analyst', aliases: ['data analyst', 'phân tích dữ liệu', 'da'] },
      { id: 'data_scientist', name: 'Data Scientist', aliases: ['data scientist', 'khoa học dữ liệu'] },
      { id: 'data_engineer', name: 'Data Engineer', aliases: ['data engineer', 'kỹ sư dữ liệu', 'etl developer'] },
      { id: 'bi_analyst', name: 'BI Analyst / Developer', aliases: ['bi analyst', 'business intelligence', 'power bi developer', 'tableau developer'] },
      { id: 'ai_engineer', name: 'AI / Machine Learning Engineer', aliases: ['ai engineer', 'machine learning', 'ml engineer', 'deep learning'] }
    ]
  },
  {
    id: 'mis',
    name: 'Hệ thống thông tin quản lý (MIS)',
    nameEn: 'Management Information Systems',
    aliases: ['mis', 'htttql', 'hệ thống thông tin quản lý', 'he thong thong tin quan ly', 'business information systems'],
    jobRoles: [
      { id: 'business_analyst', name: 'Business Analyst (BA)', aliases: ['business analyst', 'ba', 'phân tích nghiệp vụ', 'it ba'] },
      { id: 'erp_consultant', name: 'ERP Consultant / Specialist', aliases: ['erp', 'sap', 'odoo', 'oracle erp', 'tư vấn erp'] },
      { id: 'product_owner', name: 'Product Owner / PO', aliases: ['product owner', 'po', 'quản trị sản phẩm'] },
      { id: 'data_analyst', name: 'Data Analyst', aliases: ['data analyst', 'phân tích dữ liệu', 'da'] },
      { id: 'bi_analyst', name: 'BI Analyst', aliases: ['bi analyst', 'business intelligence'] },
      { id: 'system_analyst', name: 'System Analyst', aliases: ['system analyst', 'phân tích hệ thống'] }
    ]
  },
  {
    id: 'marketing',
    name: 'Marketing - Truyền thông',
    nameEn: 'Marketing & Communications',
    aliases: ['marketing', 'mkt', 'tiếp thị', 'truyền thông', 'pr', 'quảng cáo', 'advertising'],
    jobRoles: [
      { id: 'digital_marketing', name: 'Digital Marketing Specialist', aliases: ['digital marketing', 'marketing online', 'tiếp thị số'] },
      { id: 'content_marketing', name: 'Content Marketing / Copywriter', aliases: ['content', 'content creator', 'copywriter', 'biên tập nội dung'] },
      { id: 'seo_specialist', name: 'SEO Specialist', aliases: ['seo', 'tối ưu hóa tìm kiếm'] },
      { id: 'performance_marketing', name: 'Performance Marketer (Ads)', aliases: ['performance', 'chạy ads', 'facebook ads', 'google ads', 'media buyer'] },
      { id: 'brand_manager', name: 'Brand Manager / Executive', aliases: ['brand', 'quản trị thương hiệu', 'brand executive'] },
      { id: 'pr_event', name: 'PR & Event Executive', aliases: ['pr', 'quan hệ công chúng', 'sự kiện', 'event'] },
      { id: 'marketing_manager', name: 'Marketing Manager', aliases: ['marketing manager', 'trưởng phòng marketing', 'head of marketing'] }
    ]
  },
  {
    id: 'logistics',
    name: 'Logistics - Chuỗi cung ứng',
    nameEn: 'Logistics & Supply Chain',
    aliases: ['logistics', 'kho vận', 'vận tải', 'chuỗi cung ứng', 'supply chain', 'xuất nhập khẩu', 'xnk'],
    jobRoles: [
      { id: 'van_tai_dieu_phoi', name: 'Điều phối vận tải / Logistics', aliases: ['điều phối vận tải', 'logistics coordinator', 'vận hành vận tải', 'fleet coordinator'] },
      { id: 'xuat_nhap_khau', name: 'Nhân viên Xuất nhập khẩu (XNK)', aliases: ['xuất nhập khẩu', 'xnk', 'import export', 'chứng từ xnk'] },
      { id: 'thu_kho_quan_ly_kho', name: 'Quản lý kho / Thủ kho', aliases: ['thủ kho', 'quản lý kho', 'warehouse supervisor', 'warehouse keeper'] },
      { id: 'purchasing_thu_mua', name: 'Chuyên viên Thu mua (Purchasing)', aliases: ['thu mua', 'purchasing', 'procurement', 'sourcing'] },
      { id: 'supply_chain_analyst', name: 'Supply Chain Analyst', aliases: ['supply chain analyst', 'phân tích chuỗi cung ứng'] },
      { id: 'customs_officer', name: 'Nhân viên Khai báo Hải quan', aliases: ['hải quan', 'customs', 'thông quan'] }
    ]
  },
  {
    id: 'finance_banking',
    name: 'Tài chính - Ngân hàng',
    nameEn: 'Finance & Banking',
    aliases: ['tài chính', 'ngân hàng', 'bảo hiểm', 'finance', 'banking', 'chứng khoán', 'securities'],
    jobRoles: [
      { id: 'financial_analyst', name: 'Financial Analyst', aliases: ['phân tích tài chính', 'financial analyst', 'chuyên viên tài chính'] },
      { id: 'chuyen_vien_tin_dung', name: 'Chuyên viên Khách hàng / Tín dụng', aliases: ['tín dụng', 'chuyên viên quan hệ khách hàng', 'loan officer', 'rm'] },
      { id: 'giao_dich_vien', name: 'Giao dịch viên ngân hàng', aliases: ['giao dịch viên', 'teller', 'bank teller'] },
      { id: 'investment_analyst', name: 'Investment Analyst', aliases: ['đầu tư', 'investment analyst', 'm&a'] },
      { id: 'risk_management', name: 'Quản trị rủi ro (Risk Management)', aliases: ['quản trị rủi ro', 'risk management', 'risk analyst'] },
      { id: 'tu_van_bao_hiem', name: 'Chuyên viên Tư vấn Bảo hiểm', aliases: ['bảo hiểm', 'insurance agent', 'tư vấn bảo hiểm'] }
    ]
  },
  {
    id: 'accounting_auditing',
    name: 'Kế toán - Kiểm toán',
    nameEn: 'Accounting & Auditing',
    aliases: ['kế toán', 'kiểm toán', 'thuế', 'accounting', 'auditing', 'tax'],
    jobRoles: [
      { id: 'ke_toan_tong_hop', name: 'Kế toán tổng hợp', aliases: ['kế toán tổng hợp', 'general accountant'] },
      { id: 'ke_toan_thue', name: 'Kế toán thuế', aliases: ['kế toán thuế', 'tax accountant'] },
      { id: 'ke_toan_kho_noi_bo', name: 'Kế toán nội bộ / Kho / Công nợ', aliases: ['kế toán nội bộ', 'kế toán công nợ', 'kế toán kho'] },
      { id: 'kiem_toan_vien', name: 'Kiểm toán viên (Auditor)', aliases: ['kiểm toán', 'auditor', 'internal audit'] },
      { id: 'ke_toan_truong', name: 'Kế toán trưởng / Trưởng phòng', aliases: ['kế toán trưởng', 'chief accountant'] }
    ]
  },
  {
    id: 'sales_business',
    name: 'Kinh doanh - Bán hàng',
    nameEn: 'Sales & Business Development',
    aliases: ['kinh doanh', 'bán hàng', 'sales', 'business development', 'bán lẻ', 'thương mại'],
    jobRoles: [
      { id: 'sales_b2b', name: 'Sales B2B / Khách hàng doanh nghiệp', aliases: ['sales b2b', 'nhân viên kinh doanh b2b', 'corporate sales'] },
      { id: 'account_executive', name: 'Account Executive (AE)', aliases: ['account executive', 'ae', 'quản lý khách hàng'] },
      { id: 'telesales', name: 'Telesales / Tư vấn qua điện thoại', aliases: ['telesales', 'telemarketing', 'tư vấn viên'] },
      { id: 'business_development', name: 'Business Development (BD)', aliases: ['business development', 'bd', 'phát triển kinh doanh'] },
      { id: 'sales_thi_truong', name: 'Nhân viên Kinh doanh thị trường / Giám sát', aliases: ['sales thị trường', 'trình dược', 'sales fmcg', 'sales rep'] },
      { id: 'sales_manager', name: 'Trưởng phòng Kinh doanh / Sales Manager', aliases: ['trưởng phòng kinh doanh', 'sales manager', 'giám đốc kinh doanh'] }
    ]
  },
  {
    id: 'human_resources',
    name: 'Nhân sự - Hành chính',
    nameEn: 'Human Resources & Administration',
    aliases: ['nhân sự', 'hành chính', 'hr', 'recruitment', 'tuyển dụng', 'c&b', 'pháp chế'],
    jobRoles: [
      { id: 'talent_acquisition', name: 'Chuyên viên Tuyển dụng (Recruiter)', aliases: ['tuyển dụng', 'recruiter', 'talent acquisition', 'ta'] },
      { id: 'cb_specialist', name: 'Chuyên viên C&B (Tiền lương & Phúc lợi)', aliases: ['c&b', 'tiền lương', 'bảo hiểm xã hội', 'compensation'] },
      { id: 'hr_generalist', name: 'Chuyên viên Nhân sự tổng hợp', aliases: ['hr generalist', 'nhân sự tổng hợp'] },
      { id: 'hanh_chinh', name: 'Nhân viên Hành chính / Văn phòng', aliases: ['hành chính', 'admin', 'lễ tân văn phòng', 'thư ký'] },
      { id: 'hrbp', name: 'HR Business Partner (HRBP)', aliases: ['hrbp', 'hr business partner'] },
      { id: 'hr_manager', name: 'Trưởng phòng Nhân sự (HR Manager)', aliases: ['trưởng phòng nhân sự', 'hr manager', 'head of hr'] }
    ]
  },
  {
    id: 'real_estate',
    name: 'Bất động sản',
    nameEn: 'Real Estate',
    aliases: ['bất động sản', 'bđs', 'địa ốc', 'nhà đất', 'real estate', 'căn hộ'],
    jobRoles: [
      { id: 'bds_broker', name: 'Chuyên viên Môi giới / Tư vấn BĐS', aliases: ['môi giới bđs', 'tư vấn bất động sản', 'sales bđs', 'nhân viên bất động sản'] },
      { id: 'bds_project', name: 'Chuyên viên Dự án / Đầu tư BĐS', aliases: ['phát triển dự án bđs', 'chuyên viên dự án'] },
      { id: 'bds_property_manager', name: 'Quản lý vận hành Tòa nhà / BĐS', aliases: ['quản lý tòa nhà', 'property manager', 'vận hành chung cư'] }
    ]
  },
  {
    id: 'construction_architecture',
    name: 'Xây dựng - Kiến trúc',
    nameEn: 'Construction & Architecture',
    aliases: ['xây dựng', 'kiến trúc', 'nội thất', 'construction', 'architecture', 'công trình'],
    jobRoles: [
      { id: 'civil_engineer', name: 'Kỹ sư Xây dựng / Hiện trường', aliases: ['kỹ sư xây dựng', 'giám sát công trình', 'civil engineer', 'kỹ sư hiện trường'] },
      { id: 'architect', name: 'Kiến trúc sư', aliases: ['kiến trúc sư', 'architect', 'thiết kế kiến trúc'] },
      { id: 'interior_designer', name: 'Thiết kế Nội thất', aliases: ['nội thất', 'interior design', '3d nội thất'] },
      { id: 'qs_engineer', name: 'Kỹ sư Dự toán (QS Engineer)', aliases: ['dự toán', 'qs', 'quantity surveyor'] },
      { id: 'site_manager', name: 'Chỉ huy trưởng công trình', aliases: ['chỉ huy trưởng', 'quản lý công trình'] }
    ]
  },
  {
    id: 'manufacturing_engineering',
    name: 'Sản xuất - Kỹ thuật',
    nameEn: 'Manufacturing & Engineering',
    aliases: ['sản xuất', 'chế tạo', 'nhà máy', 'cơ khí', 'kỹ thuật', 'manufacturing', 'engineering', 'qa qc nhà máy'],
    jobRoles: [
      { id: 'production_engineer', name: 'Kỹ sư Sản xuất / Quy trình', aliases: ['kỹ sư sản xuất', 'process engineer', 'production engineer'] },
      { id: 'mechanical_engineer', name: 'Kỹ sư Cơ khí / Tự động hóa', aliases: ['cơ khí', 'tự động hóa', 'mechanical engineer', 'plc'] },
      { id: 'quality_control_factory', name: 'Kỹ sư Quản lý chất lượng (QA/QC Nhà máy)', aliases: ['qa qc sản xuất', 'kiểm tra chất lượng', 'kcs'] },
      { id: 'maintenance_engineer', name: 'Kỹ sư Bảo trì / Cơ điện', aliases: ['bảo trì', 'maintenance engineer', 'kỹ thuật viên bảo trì'] },
      { id: 'factory_manager', name: 'Quản đốc / Giám đốc Nhà máy', aliases: ['quản đốc', 'giám đốc sản xuất', 'plant manager'] }
    ]
  },
  {
    id: 'healthcare_pharma',
    name: 'Dược - Y tế - Sức khỏe',
    nameEn: 'Healthcare & Pharma',
    aliases: ['dược', 'y tế', 'bệnh viện', 'sức khỏe', 'pharma', 'healthcare', 'y khoa', 'bác sĩ', 'dược sĩ'],
    jobRoles: [
      { id: 'pharmacist', name: 'Dược sĩ / Dược sĩ tư vấn', aliases: ['dược sĩ', 'pharmacist', 'nhà thuốc'] },
      { id: 'medical_rep', name: 'Trình dược viên (Medical Representative)', aliases: ['trình dược viên', 'medical rep', 'sales dược'] },
      { id: 'doctor', name: 'Bác sĩ chuyên khoa', aliases: ['bác sĩ', 'doctor', 'nha sĩ'] },
      { id: 'nurse', name: 'Điều dưỡng / Y tá', aliases: ['điều dưỡng', 'y tá', 'nurse'] }
    ]
  },
  {
    id: 'education_training',
    name: 'Giáo dục - Đào tạo',
    nameEn: 'Education & Training',
    aliases: ['giáo dục', 'đào tạo', 'trường học', 'education', 'training', 'giảng viên', 'giáo viên'],
    jobRoles: [
      { id: 'teacher_instructor', name: 'Giáo viên / Giảng viên', aliases: ['giáo viên', 'giảng viên', 'teacher', 'instructor', 'tutors'] },
      { id: 'academic_counselor', name: 'Tư vấn tuyển sinh / Khóa học', aliases: ['tư vấn tuyển sinh', 'tư vấn khóa học', 'academic counselor'] },
      { id: 'curriculum_developer', name: 'Chuyên viên Phát triển chương trình đào tạo', aliases: ['phát triển chương trình', 'curriculum', 'r&d giáo dục'] }
    ]
  },
  {
    id: 'hospitality_tourism',
    name: 'Nhà hàng - Khách sạn - Du lịch',
    nameEn: 'Hospitality & Tourism',
    aliases: ['nhà hàng', 'khách sạn', 'du lịch', 'f&b', 'hospitality', 'resort', 'tour'],
    jobRoles: [
      { id: 'restaurant_manager', name: 'Quản lý Nhà hàng / Cửa hàng F&B', aliases: ['quản lý nhà hàng', 'restaurant manager', 'quản lý ca'] },
      { id: 'hotel_receptionist', name: 'Lễ tân Khách sạn / Resort', aliases: ['lễ tân', 'receptionist', 'front desk'] },
      { id: 'chef_cook', name: 'Đầu bếp / Bếp trưởng (Chef)', aliases: ['đầu bếp', 'bếp trưởng', 'chef', 'cook'] },
      { id: 'tour_guide', name: 'Hướng dẫn viên / Điều hành Tour', aliases: ['hướng dẫn viên', 'điều hành tour', 'tour guide'] }
    ]
  },
  {
    id: 'retail_services',
    name: 'Bán lẻ - Dịch vụ đời sống',
    nameEn: 'Retail & Consumer Services',
    aliases: ['bán lẻ', 'dịch vụ', 'siêu thị', 'retail', 'cửa hàng', 'shop'],
    jobRoles: [
      { id: 'store_manager', name: 'Cửa hàng trưởng / Giám sát bán lẻ', aliases: ['cửa hàng trưởng', 'store manager', 'shop manager'] },
      { id: 'retail_staff', name: 'Nhân viên bán hàng / Thu ngân', aliases: ['nhân viên bán hàng', 'thu ngân', 'cashier', 'sales assistant'] },
      { id: 'customer_care', name: 'Chăm sóc khách hàng (CSKH)', aliases: ['cskh', 'chăm sóc khách hàng', 'customer support', 'customer service'] }
    ]
  },
  {
    id: 'design_creative',
    name: 'Thiết kế - Sáng tạo',
    nameEn: 'Design & Creative',
    aliases: ['thiết kế', 'đồ họa', 'design', 'ui ux', 'creative', 'graphic'],
    jobRoles: [
      { id: 'graphic_designer', name: 'Graphic Designer', aliases: ['graphic designer', 'thiết kế đồ họa', 'designer'] },
      { id: 'ui_ux_designer', name: 'UI/UX Designer', aliases: ['ui ux', 'ui/ux', 'product designer'] },
      { id: 'video_editor', name: 'Video Editor / Motion Graphics', aliases: ['video editor', 'dựng phim', 'motion graphics', 'quay dựng'] }
    ]
  },
  {
    id: 'legal',
    name: 'Luật - Pháp lý',
    nameEn: 'Legal & Compliance',
    aliases: ['luật', 'pháp lý', 'pháp chế', 'legal', 'compliance', 'luật sư'],
    jobRoles: [
      { id: 'legal_officer', name: 'Chuyên viên Pháp chế Doanh nghiệp', aliases: ['pháp chế', 'legal officer', 'tư vấn pháp lý'] },
      { id: 'lawyer', name: 'Luật sư / Trợ lý luật sư', aliases: ['luật sư', 'lawyer', 'paralegal'] }
    ]
  }
];

class JobMarketTaxonomyService {
  constructor() {
    this.industries = INDUSTRY_TAXONOMY;
  }

  /**
   * Lấy danh sách toàn bộ ngành nghề
   */
  getAllIndustries() {
    return this.industries.map(ind => ({
      id: ind.id,
      name: ind.name,
      nameEn: ind.nameEn,
      jobRolesCount: ind.jobRoles.length
    }));
  }

  /**
   * Lấy danh sách Job Roles theo Ngành
   */
  getJobRolesByIndustry(industryIdOrName) {
    if (!industryIdOrName || industryIdOrName === 'all') {
      const allRoles = [];
      this.industries.forEach(ind => {
        ind.jobRoles.forEach(r => {
          if (!allRoles.some(ar => ar.name === r.name)) {
            allRoles.push({ id: r.id, name: r.name, industryId: ind.id, industryName: ind.name });
          }
        });
      });
      return allRoles;
    }

    const ind = this.resolveIndustry(industryIdOrName);
    return ind ? ind.jobRoles.map(r => ({ id: r.id, name: r.name, industryId: ind.id, industryName: ind.name })) : [];
  }

  /**
   * Nhận diện và chuẩn hóa tên ngành từ bất kỳ từ khóa hoặc input
   */
  resolveIndustry(str) {
    if (!str || str === 'all') return null;
    const clean = str.toLowerCase().trim();

    // 1. Khớp chính xác ID hoặc tên
    let found = this.industries.find(i => i.id.toLowerCase() === clean || i.name.toLowerCase() === clean || i.nameEn.toLowerCase() === clean);
    if (found) return found;

    // 2. Khớp aliases
    found = this.industries.find(i => i.aliases.some(a => clean === a || clean.includes(a) || a.includes(clean)));
    if (found) return found;

    return null;
  }

  /**
   * Nhận diện và chuẩn hóa Job Role từ tiêu đề công việc hoặc từ khóa tìm kiếm
   */
  resolveJobRole(title, industryObj = null) {
    if (!title) return null;
    const clean = title.toLowerCase().trim();

    // Nếu đã có ngành cụ thể, ưu tiên tìm trong ngành đó trước
    if (industryObj && industryObj.jobRoles) {
      for (const r of industryObj.jobRoles) {
        if (r.aliases.some(a => clean.includes(a) || clean === a)) {
          return { ...r, industryId: industryObj.id, industryName: industryObj.name };
        }
      }
    }

    // Tìm kiếm trong toàn bộ các ngành
    for (const ind of this.industries) {
      for (const r of ind.jobRoles) {
        if (r.aliases.some(a => clean.includes(a) || clean === a)) {
          return { ...r, industryId: ind.id, industryName: ind.name };
        }
      }
    }

    return null;
  }

  /**
   * Tìm kiếm thông minh: Trả về gợi ý khớp cả Ngành và Job Role
   */
  searchTaxonomy(keyword) {
    if (!keyword) return { industries: [], jobRoles: [] };
    const kw = keyword.toLowerCase().trim();

    const matchedIndustries = this.industries.filter(i => 
      i.name.toLowerCase().includes(kw) || 
      i.nameEn.toLowerCase().includes(kw) ||
      i.aliases.some(a => a.includes(kw))
    ).map(i => ({ id: i.id, name: i.name, nameEn: i.nameEn }));

    const matchedRoles = [];
    this.industries.forEach(ind => {
      ind.jobRoles.forEach(r => {
        if (r.name.toLowerCase().includes(kw) || r.aliases.some(a => a.includes(kw))) {
          if (!matchedRoles.some(mr => mr.name === r.name)) {
            matchedRoles.push({ id: r.id, name: r.name, industryName: ind.name, industryId: ind.id });
          }
        }
      });
    });

    return {
      industries: matchedIndustries,
      jobRoles: matchedRoles.slice(0, 15)
    };
  }
}

module.exports = new JobMarketTaxonomyService();
