/**
 * academicOntologyService.js - Knowledge Graph & Taxonomy Engine
 * Ánh xạ giữa Ngành học / Lĩnh vực đào tạo (Academic Field) với Không gian nghề nghiệp (Occupations),
 * Chuyên ngành, Kỹ năng trọng tâm, Career Path và Khung chương trình đào tạo chuẩn (để tính Skill Gap).
 */

const ACADEMIC_ONTOLOGY = {
  mis: {
    id: 'mis',
    code: '7480104', // Mã ngành đào tạo chuẩn GD-ĐT
    name: 'Management Information Systems (MIS)',
    nameVi: 'Hệ thống thông tin quản lý',
    synonyms: [
      'mis', 'htttql', 'he thong thong tin quan ly', 'management information systems',
      'information systems', 'hệ thống thông tin', 'business information systems'
    ],
    description: 'Ngành giao thoa giữa Công nghệ thông tin và Quản trị kinh doanh, ứng dụng công nghệ để giải quyết bài toán vận hành và ra quyết định doanh nghiệp.',
    
    // Khung chương trình đào tạo chuẩn đại học (Dùng để tính Skill Gap)
    curriculumBaseline: [
      { skill: 'SQL & Cơ sở dữ liệu', category: 'Databases', depthLevel: 'Advanced', academicCoverage: 0.90 },
      { skill: 'Phân tích & Thiết kế HTTT (UML/DFD)', category: 'Business Skills', depthLevel: 'Advanced', academicCoverage: 0.85 },
      { skill: 'Excel & Xử lý số liệu', category: 'Tools', depthLevel: 'Intermediate', academicCoverage: 0.85 },
      { skill: 'Quy trình nghiệp vụ (BPMN)', category: 'Business Skills', depthLevel: 'Intermediate', academicCoverage: 0.75 },
      { skill: 'Lập trình căn bản (Python/C#/Java)', category: 'Programming Languages', depthLevel: 'Basic', academicCoverage: 0.65 },
      { skill: 'Xác suất & Thống kê ứng dụng', category: 'Analytics', depthLevel: 'Intermediate', academicCoverage: 0.70 },
      { skill: 'Quản trị dự án CNTT', category: 'Business Skills', depthLevel: 'Basic', academicCoverage: 0.60 },
      { skill: 'ERP Căn bản (SAP/Odoo lý thuyết)', category: 'Enterprise Systems', depthLevel: 'Basic', academicCoverage: 0.45 },
      { skill: 'Power BI / Data Visualization', category: 'Analytics', depthLevel: 'Basic', academicCoverage: 0.40 },
      { skill: 'Cloud & Điện toán đám mây', category: 'Cloud', depthLevel: 'Awareness', academicCoverage: 0.25 },
      { skill: 'Agile / Scrum thực chiến', category: 'Business Skills', depthLevel: 'Awareness', academicCoverage: 0.30 },
      { skill: 'Big Data & Cloud Data Warehousing', category: 'Cloud', depthLevel: 'Awareness', academicCoverage: 0.15 }
    ],

    // Ánh xạ nghề nghiệp với mức độ tương thích (Match Classification)
    occupations: [
      {
        id: 'business_analyst',
        name: 'Business Analyst',
        nameVi: 'Chuyên viên Phân tích Nghiệp vụ',
        matchType: 'DIRECT', // DIRECT MATCH (>= 0.85)
        confidenceScore: 0.96,
        track: 'Business Track',
        titlePatterns: [
          /business\s+analyst/i, /\bba\b/i, /phân\s+tích\s+nghiệp\s+vụ/i,
          /it\s+ba\b/i, /business\s+system\s+analyst/i, /chuyên\s+viên\s+ba/i
        ],
        excludePatterns: [/badminton/i, /bảo\s+an/i, /bà\s+rịa/i],
        requiredCoreSkills: ['SQL', 'Requirement Gathering', 'UML', 'BPMN', 'User Story', 'Agile/Scrum', 'Excel'],
        recommendedSalaryRange: { min: 14, median: 22, max: 40 }
      },
      {
        id: 'data_analyst',
        name: 'Data Analyst',
        nameVi: 'Chuyên viên Phân tích Dữ liệu',
        matchType: 'DIRECT',
        confidenceScore: 0.93,
        track: 'Data Track',
        titlePatterns: [
          /data\s+analyst/i, /phân\s+tích\s+dữ\s+liệu/i, /\bda\b/i,
          /data\s+analytics/i, /chuyên\s+viên\s+dữ\s+liệu/i
        ],
        excludePatterns: [/nhập\s+liệu/i, /data\s+entry/i],
        requiredCoreSkills: ['SQL', 'Excel', 'Power BI', 'Python', 'Data Visualization', 'Dashboard Design'],
        recommendedSalaryRange: { min: 13, median: 20, max: 38 }
      },
      {
        id: 'bi_analyst',
        name: 'BI Analyst',
        nameVi: 'Chuyên viên Business Intelligence',
        matchType: 'DIRECT',
        confidenceScore: 0.91,
        track: 'Data Track',
        titlePatterns: [
          /bi\s+analyst/i, /business\s+intelligence/i, /chuyên\s+viên\s+bi/i,
          /power\s*bi\s+developer/i, /tableau\s+developer/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['Power BI', 'SQL', 'Data Warehousing', 'DAX', 'Tableau', 'ETL'],
        recommendedSalaryRange: { min: 15, median: 24, max: 42 }
      },
      {
        id: 'it_business_analyst',
        name: 'IT Business Analyst',
        nameVi: 'Chuyên viên Phân tích Nghiệp vụ Phần mềm',
        matchType: 'DIRECT',
        confidenceScore: 0.95,
        track: 'Business Track',
        titlePatterns: [
          /it\s+business\s+analyst/i, /it\s+ba\b/i, /ba\s+phần\s+mềm/i,
          /software\s+business\s+analyst/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['SQL', 'Software Requirements', 'API Specs', 'Wireframing', 'Jira', 'Agile/Scrum'],
        recommendedSalaryRange: { min: 15, median: 23, max: 42 }
      },
      {
        id: 'system_analyst',
        name: 'System Analyst',
        nameVi: 'Chuyên viên Phân tích Hệ thống',
        matchType: 'DIRECT',
        confidenceScore: 0.88,
        track: 'System Track',
        titlePatterns: [
          /system\s+analyst/i, /phân\s+tích\s+hệ\s+thống/i, /\bsa\b/i,
          /it\s+system\s+analyst/i
        ],
        excludePatterns: [/quản\s+trị\s+mạng/i],
        requiredCoreSkills: ['System Architecture', 'Database Design', 'UML', 'API Integration', 'SQL'],
        recommendedSalaryRange: { min: 16, median: 25, max: 45 }
      },
      {
        id: 'erp_consultant',
        name: 'ERP Consultant',
        nameVi: 'Chuyên viên Tư vấn Triển khai ERP',
        matchType: 'RELATED', // RELATED MATCH (0.65 - 0.84)
        confidenceScore: 0.82,
        track: 'ERP Track',
        titlePatterns: [
          /erp/i, /sap\s+consultant/i, /oracle\s+erp/i, /triển\s+khai\s+erp/i,
          /odoo/i, /chuyên\s+viên\s+erp/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['ERP Systems', 'SAP', 'Business Process', 'SQL', 'Accounting/Supply Chain'],
        recommendedSalaryRange: { min: 15, median: 25, max: 48 }
      },
      {
        id: 'product_analyst',
        name: 'Product Analyst',
        nameVi: 'Chuyên viên Phân tích Sản phẩm Công nghệ',
        matchType: 'RELATED',
        confidenceScore: 0.78,
        track: 'Product Track',
        titlePatterns: [
          /product\s+analyst/i, /phân\s+tích\s+sản\s+phẩm/i, /associate\s+product\s+manager/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['Product Analytics', 'SQL', 'A/B Testing', 'User Behavior', 'Figma'],
        recommendedSalaryRange: { min: 14, median: 22, max: 40 }
      },
      {
        id: 'it_project_coordinator',
        name: 'IT Project Coordinator',
        nameVi: 'Điều phối & Quản trị Dự án CNTT',
        matchType: 'RELATED',
        confidenceScore: 0.75,
        track: 'Management Track',
        titlePatterns: [
          /project\s+coordinator/i, /it\s+pm\b/i, /it\s+project\s+manager/i,
          /trợ\s+lý\s+dự\s+án\s+cntt/i, /scrum\s+master/i
        ],
        excludePatterns: [/xây\s+dựng/i],
        requiredCoreSkills: ['Project Management', 'Jira', 'Agile/Scrum', 'Stakeholder Management', 'English'],
        recommendedSalaryRange: { min: 14, median: 22, max: 45 }
      },
      {
        id: 'digital_transformation',
        name: 'Digital Transformation Specialist',
        nameVi: 'Chuyên viên Chuyển đổi số',
        matchType: 'RELATED',
        confidenceScore: 0.74,
        track: 'Business Track',
        titlePatterns: [
          /chuyển\s+đổi\s+số/i, /digital\s+transformation/i, /tối\s+ưu\s+hóa\s+quy\s+trình/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['BPMN', 'Process Automation', 'Change Management', 'ERP', 'Data-driven Decision'],
        recommendedSalaryRange: { min: 16, median: 26, max: 45 }
      },
      {
        id: 'data_engineer_junior',
        name: 'Data Engineer (Junior)',
        nameVi: 'Kỹ sư Dữ liệu',
        matchType: 'ADJACENT', // ADJACENT MATCH (0.45 - 0.64)
        confidenceScore: 0.62,
        track: 'Data Track',
        titlePatterns: [
          /data\s+engineer/i, /kỹ\s+sư\s+dữ\s+liệu/i, /etl\s+developer/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['SQL', 'Python', 'ETL Pipeline', 'Data Warehousing', 'Cloud'],
        recommendedSalaryRange: { min: 16, median: 26, max: 48 }
      },
      {
        id: 'it_consultant',
        name: 'IT Consultant',
        nameVi: 'Chuyên viên Tư vấn Giải pháp CNTT',
        matchType: 'ADJACENT',
        confidenceScore: 0.64,
        track: 'Business Track',
        titlePatterns: [
          /it\s+consultant/i, /tư\s+vấn\s+giải\s+pháp\s+cntt/i, /solution\s+consultant/i
        ],
        excludePatterns: [],
        requiredCoreSkills: ['Enterprise Architecture', 'Business Analysis', 'Presentation', 'Vendor Management'],
        recommendedSalaryRange: { min: 16, median: 26, max: 50 }
      }
    ],

    // Khung Lộ trình Nghề nghiệp (Career Paths) chuẩn cho MIS
    careerTracks: [
      {
        trackName: 'Business Track (Hướng Nghiệp vụ & Sản phẩm)',
        stages: [
          { level: 'Entry', role: 'Junior Business Analyst', exp: '0 - 2 năm', salaryMed: 14, focusSkills: ['Requirement Gathering', 'UML/BPMN', 'SQL Cơ bản', 'User Story'] },
          { level: 'Middle', role: 'Senior Business Analyst', exp: '2 - 5 năm', salaryMed: 24, focusSkills: ['System Design', 'Domain Knowledge (Fintech/Logistics)', 'Agile Coaching', 'Stakeholder Management'] },
          { level: 'Lead', role: 'Lead BA / Product Manager', exp: '5+ năm', salaryMed: 40, focusSkills: ['Product Strategy', 'Enterprise Solution', 'Team Leadership', 'Budgeting'] }
        ]
      },
      {
        trackName: 'Data & Analytics Track (Hướng Dữ liệu & BI)',
        stages: [
          { level: 'Entry', role: 'Junior Data / BI Analyst', exp: '0 - 2 năm', salaryMed: 13, focusSkills: ['SQL', 'Excel', 'Power BI Dashboard', 'Basic Python'] },
          { level: 'Middle', role: 'Senior BI / Data Specialist', exp: '2 - 5 năm', salaryMed: 23, focusSkills: ['Data Modeling', 'DAX', 'Cloud Data Warehouse', 'Statistical Inference'] },
          { level: 'Lead', role: 'Analytics Lead / Head of BI', exp: '5+ năm', salaryMed: 42, focusSkills: ['Data Governance', 'Big Data Architecture', 'Executive Storytelling', 'Strategy'] }
        ]
      },
      {
        trackName: 'System & Operations Track (Hướng Hệ thống & Chuyển đổi số)',
        stages: [
          { level: 'Entry', role: 'Junior System Analyst / IT Coordinator', exp: '0 - 2 năm', salaryMed: 15, focusSkills: ['Database Schema', 'API Specs', 'Process Flow', 'Jira'] },
          { level: 'Middle', role: 'Senior System Analyst / ERP Consultant', exp: '2 - 5 năm', salaryMed: 25, focusSkills: ['ERP Module Mastery (SAP/Oracle)', 'System Integration', 'Security Compliance'] },
          { level: 'Lead', role: 'IT Solution Architect / IT Director', exp: '6+ năm', salaryMed: 50, focusSkills: ['Enterprise Architecture', 'Cloud Infrastructure', 'Vendor Negotiation', 'Digital Strategy'] }
        ]
      }
    ],

    // Quy tắc loại trừ (Guardrail Exclusion Rules)
    strictExclusions: [
      /embedded/i, /lập\s+trình\s+nhúng/i, /vi\s+mạch/i,
      /react\s+native/i, /flutter\s+developer/i, /ios\s+developer/i, /android\s+developer/i,
      /thợ\s+điện/i, /lái\s+xe/i, /bếp/i, /phục\s+vụ/i, /bảo\s+vệ/i, /công\s+nhân/i
    ]
  },

  // Hỗ trợ thêm các ngành học khác trong hệ thống
  data_science: {
    id: 'data_science',
    code: '7480109',
    name: 'Data Science & Artificial Intelligence',
    nameVi: 'Khoa học dữ liệu & Trí tuệ nhân tạo',
    synonyms: ['data science', 'ds', 'khoa học dữ liệu', 'ai', 'tri tue nhan tao', 'machine learning'],
    occupations: [
      { id: 'data_scientist', name: 'Data Scientist', nameVi: 'Nhà khoa học dữ liệu', matchType: 'DIRECT', confidenceScore: 0.98, track: 'AI/ML Track', titlePatterns: [/data\s+scientist/i, /khoa\s+học\s+dữ\s+liệu/i], requiredCoreSkills: ['Python', 'Machine Learning', 'SQL', 'Deep Learning', 'Statistics'] },
      { id: 'data_analyst', name: 'Data Analyst', nameVi: 'Chuyên viên phân tích dữ liệu', matchType: 'DIRECT', confidenceScore: 0.90, track: 'Analytics Track', titlePatterns: [/data\s+analyst/i], requiredCoreSkills: ['SQL', 'Python', 'Power BI', 'Tableau'] },
      { id: 'data_engineer', name: 'Data Engineer', nameVi: 'Kỹ sư dữ liệu', matchType: 'DIRECT', confidenceScore: 0.92, track: 'Engineering Track', titlePatterns: [/data\s+engineer/i], requiredCoreSkills: ['SQL', 'Python', 'Spark', 'Airflow', 'Cloud Data Warehouse'] }
    ]
  },

  computer_science: {
    id: 'computer_science',
    code: '7480101',
    name: 'Computer Science (CS)',
    nameVi: 'Khoa học máy tính',
    synonyms: ['computer science', 'cs', 'khoa hoc may tinh', 'cntt', 'cong nghe thong tin', 'it', 'software engineering'],
    occupations: [
      { id: 'software_engineer', name: 'Software Engineer', nameVi: 'Kỹ sư phát triển phần mềm', matchType: 'DIRECT', confidenceScore: 0.97, track: 'Software Track', titlePatterns: [/software\s+engineer/i, /lập\s+trình\s+viên/i, /developer/i], requiredCoreSkills: ['Java', 'C#', 'Python', 'JavaScript', 'Database', 'Git'] },
      { id: 'backend_developer', name: 'Backend Developer', nameVi: 'Lập trình viên Backend', matchType: 'DIRECT', confidenceScore: 0.95, track: 'Software Track', titlePatterns: [/backend/i, /back-end/i], requiredCoreSkills: ['Node.js', 'Java', 'Golang', 'SQL', 'Docker'] },
      { id: 'system_analyst', name: 'System Analyst', nameVi: 'Phân tích hệ thống', matchType: 'RELATED', confidenceScore: 0.85, track: 'Systems Track', titlePatterns: [/system\s+analyst/i], requiredCoreSkills: ['System Design', 'Architecture', 'UML', 'Database'] }
    ]
  }
};

class AcademicOntologyService {
  /**
   * Nhận diện ngành học hoặc từ khóa truy vấn của người dùng
   * @param {string} query Ví dụ: "MIS", "Management Information Systems", "Hệ thống thông tin quản lý"
   */
  resolveField(query) {
    if (!query || typeof query !== 'string') return ACADEMIC_ONTOLOGY.mis;
    const clean = query.trim().toLowerCase();

    for (const [key, field] of Object.entries(ACADEMIC_ONTOLOGY)) {
      if (key === clean) return field;
      if (field.name.toLowerCase().includes(clean)) return field;
      if (field.nameVi.toLowerCase().includes(clean)) return field;
      if (field.synonyms && field.synonyms.some(s => clean.includes(s) || s.includes(clean))) {
        return field;
      }
    }

    // Default fallback là MIS nếu tìm kiếm có liên quan đến hệ thống / analyst / thông tin
    if (/mis|analyst|business|dữ liệu|data|hệ thống|thông tin|erp/i.test(clean)) {
      return ACADEMIC_ONTOLOGY.mis;
    }
    return ACADEMIC_ONTOLOGY.mis;
  }

  /**
   * Lấy danh sách tất cả các ngành được hỗ trợ
   */
  getAllFields() {
    return Object.values(ACADEMIC_ONTOLOGY).map(f => ({
      id: f.id,
      code: f.code,
      name: f.name,
      nameVi: f.nameVi,
      description: f.description,
      occupationsCount: f.occupations ? f.occupations.length : 0
    }));
  }

  /**
   * Phân loại 1 tin tuyển dụng vào Occupation tương ứng
   * @param {Object} job Tin tuyển dụng thô đã nạp
   * @param {Object} field Khung ngành học đang xét (mặc định MIS)
   */
  classifyJob(job, field = ACADEMIC_ONTOLOGY.mis) {
    const title = (job.title || '').trim();
    const skillsText = (job.ky_nang || job.skills || '').trim();
    const desc = (job.description || '').trim();
    const fullText = `${title} ${skillsText} ${desc}`;

    // Kiểm tra bộ quy tắc loại trừ nghiêm ngặt (Guardrail Exclusions)
    if (field.strictExclusions) {
      for (const excl of field.strictExclusions) {
        if (excl.test(title)) {
          return null; // Bị loại trừ hoàn toàn
        }
      }
    }

    let bestMatch = null;
    let highestScore = 0;

    for (const occ of field.occupations) {
      // 1. Kiểm tra excludePatterns riêng của từng role
      if (occ.excludePatterns && occ.excludePatterns.some(rx => rx.test(title))) {
        continue;
      }

      // 2. Kiểm tra Title Patterns
      let titleMatched = false;
      for (const pattern of occ.titlePatterns) {
        if (pattern.test(title)) {
          titleMatched = true;
          break;
        }
      }

      if (titleMatched) {
        let score = occ.confidenceScore || 0.8;
        if (score > highestScore) {
          highestScore = score;
          bestMatch = {
            occupationId: occ.id,
            occupationName: occ.name,
            occupationNameVi: occ.nameVi,
            matchType: occ.matchType,
            confidenceScore: score,
            track: occ.track,
            recommendedSalaryRange: occ.recommendedSalaryRange
          };
        }
      }
    }

    return bestMatch;
  }
}

module.exports = new AcademicOntologyService();
