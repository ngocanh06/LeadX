/**
 * scraperDataProvider.js - Nạp và chuyển đổi dữ liệu việc làm từ TopCV, Vieclam24h, CareerViet, Google Sheets & Scraped Leads
 */
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const logger = require('../../../core/utils/logger');

function resolveScraperDir() {
  const candidates = [
    'd:/Dokumen/Làm/Tuyển Dụng/scraper_data',
    'd:\\Dokumen\\Làm\\Tuyển Dụng\\scraper_data',
    'd:/Dokumen/Tuyển Dụng/scraper_data',
    'd:\\Dokumen\\Tuyển Dụng\\scraper_data',
    path.resolve(process.cwd(), '../Tuyển Dụng/scraper_data'),
    path.resolve(__dirname, '../../../../../../Tuyển Dụng/scraper_data'),
    path.resolve(__dirname, '../../../../Tuyển Dụng/scraper_data')
  ];
  for (const c of candidates) {
    try {
      if (fs.existsSync(c)) return c;
    } catch (e) {}
  }
  return candidates[0];
}

const SCRAPER_DIR = resolveScraperDir();

const KNOWN_SOURCES = [
  { fileName: 'topcv_matrix_jobs.xlsx', subPath: 'topcv/topcv_matrix_jobs.xlsx', sourceName: 'TopCV' },
  { fileName: 'vieclam24h_matrix_jobs.xlsx', subPath: 'vieclam24h/vieclam24h_matrix_jobs.xlsx', sourceName: 'Vieclam24h' },
  { fileName: 'careerviet_matrix_jobs.xlsx', subPath: 'careerviet/careerviet_matrix_jobs.xlsx', sourceName: 'CareerViet' },
  { fileName: 'jobsgo_matrix_jobs.xlsx', subPath: 'jobsgo/jobsgo_matrix_jobs.xlsx', sourceName: 'JobsGO' },
  { fileName: 'vietnamworks_matrix_jobs.xlsx', subPath: 'vietnamworks/vietnamworks_matrix_jobs.xlsx', sourceName: 'VietnamWorks' }
];

class ScraperDataProvider {
  constructor() {
    this.scraperDir = SCRAPER_DIR;
    this.cachedJobs = null;
    this.lastLoadedTime = null;
  }

  checkDeadline(deadlineStr) {
    if (!deadlineStr || ['không đề cập', 'không yêu cầu', ''].includes(String(deadlineStr).toLowerCase().trim())) {
      return { isExpired: false, daysRemaining: 999, formatted: 'Vô thời hạn' };
    }

    const match = String(deadlineStr).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) {
      return { isExpired: false, daysRemaining: 999, formatted: String(deadlineStr) };
    }

    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const year = parseInt(match[3], 10);

    const deadlineDate = new Date(year, month, day, 23, 59, 59);
    const now = new Date();
    const diffTime = deadlineDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    const isExpired = diffTime < 0;

    return {
      isExpired,
      daysRemaining,
      formatted: `${String(day).padStart(2, '0')}/${String(month + 1).padStart(2, '0')}/${year}`
    };
  }

  loadJobs(forceReload = false) {
    if (this.cachedJobs && !forceReload) {
      return this.cachedJobs;
    }

    const allMergedJobs = [];
    const seenSignatures = new Set();
    const loadedSources = [];

    // 1. Nạp từ các file Excel trong thư mục scraper_data
    if (this.scraperDir && fs.existsSync(this.scraperDir)) {
      for (const src of KNOWN_SOURCES) {
        let targetPath = path.join(this.scraperDir, src.fileName);
        if (!fs.existsSync(targetPath) && src.subPath) {
          targetPath = path.join(this.scraperDir, src.subPath);
        }
        if (!fs.existsSync(targetPath)) continue;

        try {
          const workbook = xlsx.readFile(targetPath);
          const firstSheetName = workbook.SheetNames[0];
          const sheet = workbook.Sheets[firstSheetName];
          const rows = xlsx.utils.sheet_to_json(sheet);

          if (!rows || rows.length === 0) continue;

          let count = 0;
          rows.forEach((r, idx) => {
            const title = r.cong_viec || r.chuc_vu || r.title || 'Tuyển dụng';
            const company = r.nha_tuyen_dung || r.company || 'Doanh nghiệp Tuyển dụng';
            const location = r.tinh_thanh || r.location || 'Toàn quốc';

            const sig = `${title.toLowerCase().trim()}|${company.toLowerCase().trim()}|${location.toLowerCase().trim()}`;
            if (seenSignatures.has(sig)) return;
            seenSignatures.add(sig);

            const deadlineInfo = this.checkDeadline(r.han_nop_ho_so || r.deadline);
            const jobId = r.id || `${src.sourceName.toLowerCase()}_${idx + 1}`;

            allMergedJobs.push({
              id: jobId,
              source: src.sourceName,
              title,
              company,
              location,
              detailedLocation: r.dia_diem_chi_tiet || r.dia_chi || r.detailedLocation || '',
              salary: r.muc_luong || r.salary || 'Thoả thuận',
              jobType: r.loai_hinh_cong_viec || r.jobType || 'Toàn thời gian',
              category: r.linh_vuc_nganh_nghe || r.category || 'Tổng hợp',
              experience: r.kinh_nghiem || r.experience || 'Không yêu cầu',
              so_luong: r.so_luong || '',
              ky_nang: r.ky_nang || r.skills || '',
              deadline: r.han_nop_ho_so || r.deadline || '',
              isExpired: deadlineInfo.isExpired,
              daysRemaining: deadlineInfo.daysRemaining,
              deadlineFormatted: deadlineInfo.formatted,
              description: r.mo_ta_cong_viec || r.description || '',
              benefits: r.quyen_loi || r.benefits || '',
              contact: r.thong_tin_lien_he || 'Không đề cập',
              imageUrl: r.imageUrl || r.image_url || null
            });
            count++;
          });

          loadedSources.push(`${src.sourceName}: ${count} tin`);
        } catch (err) {
          logger.warn(`Lỗi nạp file ${targetPath}: ${err.message}`);
        }
      }
    }

    // 2. Nạp thêm từ Google Sheets (nếu có sẵn trong bộ nhớ)
    try {
      const googleSheetProvider = require('./googleSheetProvider');
      if (googleSheetProvider.jobs && googleSheetProvider.jobs.length > 0) {
        let sheetCount = 0;
        googleSheetProvider.jobs.forEach(j => {
          const sig = `${(j.title || '').toLowerCase().trim()}|${(j.company || '').toLowerCase().trim()}|${(j.location || j.province || '').toLowerCase().trim()}`;
          if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            allMergedJobs.push({
              id: `sheet_${j.id}`,
              source: 'Google Sheets',
              title: j.title || 'Tuyển dụng',
              company: j.company || 'Doanh Nghiệp',
              location: j.location || j.province || 'Toàn quốc',
              salary: j.salary || 'Thỏa thuận',
              description: j.description || j.formattedGroupPost || '',
              benefits: j.benefits || '',
              isExpired: false,
              deadlineFormatted: 'Đang tuyển',
              imageUrl: null
            });
            sheetCount++;
          }
        });
        if (sheetCount > 0) loadedSources.push(`Google Sheets: ${sheetCount} tin`);
      }
    } catch (e) {}

    // 3. Nạp thêm từ Scraped Leads (facebook_group_jobs.json)
    try {
      const scrapedJobsProvider = require('./scrapedJobsProvider');
      const scJobs = scrapedJobsProvider.loadJobs();
      if (scJobs && scJobs.length > 0) {
        let scCount = 0;
        scJobs.forEach(j => {
          const sig = `${(j.title || '').toLowerCase().trim()}|${(j.employerName || j.company || '').toLowerCase().trim()}|${(j.location || '').toLowerCase().trim()}`;
          if (!seenSignatures.has(sig)) {
            seenSignatures.add(sig);
            allMergedJobs.push({
              id: `fb_lead_${j.id}`,
              source: 'Facebook Leads',
              title: j.title || 'Tuyển dụng',
              company: j.employerName || j.company || 'Doanh Nghiệp',
              location: j.location || j.province || 'Toàn quốc',
              salary: j.salary || 'Thỏa thuận',
              description: j.description || j.postText || '',
              benefits: '',
              isExpired: false,
              deadlineFormatted: 'Đang tuyển',
              imageUrl: null
            });
            scCount++;
          }
        });
        if (scCount > 0) loadedSources.push(`Facebook Leads: ${scCount} tin`);
      }
    } catch (e) {}

    this.cachedJobs = allMergedJobs;
    this.lastLoadedTime = new Date();
    logger.success(`[ScraperDataProvider] Đã tổng hợp ${allMergedJobs.length} tin việc làm (${loadedSources.join(' | ') || 'Trống'}).`);
    return this.cachedJobs;
  }

  _normalizeProvinceName(name) {
    if (!name) return '';
    return name
      .toLowerCase()
      .replace(/tp\.?\s*/g, '')
      .replace(/thành phố\s*/g, '')
      .replace(/tỉnh\s*/g, '')
      .trim();
  }

  _toHashtagFormat(text) {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd')
      .replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  getJobs({ query = '', location = '', source = 'ALL', hideExpired = true, postStatus = 'ALL', page = 1, limit = 12 } = {}) {
    const allJobs = this.loadJobs();
    let filtered = [...allJobs];

    if (source && source !== 'ALL') {
      filtered = filtered.filter(j => j.source && j.source.toLowerCase() === source.toLowerCase());
    }

    if (hideExpired === true || hideExpired === 'true') {
      filtered = filtered.filter(j => !j.isExpired);
    }

    if (postStatus === 'UNPOSTED') {
      filtered = filtered.filter(j => !j.tracking || (!j.tracking.isPosted && !j.tracking.isQueued));
    } else if (postStatus === 'POSTED') {
      filtered = filtered.filter(j => j.tracking && j.tracking.isPosted);
    }

    if (query) {
      const q = query.toLowerCase().trim();
      filtered = filtered.filter(j =>
        (j.title && j.title.toLowerCase().includes(q)) ||
        (j.company && j.company.toLowerCase().includes(q)) ||
        (j.category && j.category.toLowerCase().includes(q))
      );
    }

    if (location) {
      const normTargetLoc = this._normalizeProvinceName(location);
      filtered = filtered.filter(j => {
        const normJobLoc = this._normalizeProvinceName(j.location);
        if (normJobLoc.includes(normTargetLoc) || normTargetLoc.includes(normJobLoc)) {
          return true;
        }
        if (j.detailedLocation) {
          const normDetailed = j.detailedLocation.toLowerCase();
          if (normDetailed.includes(`${normTargetLoc}:`)) {
            return true;
          }
        }
        return false;
      });
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const items = filtered.slice(startIndex, endIndex);

    return {
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      items
    };
  }

  getJobById(jobId) {
    const allJobs = this.loadJobs();
    return allJobs.find(j => String(j.id) === String(jobId)) || null;
  }

  formatJobToCampaignPayload(job) {
    if (!job) return null;
    const autoPilotEngine = require('./autoPilotEngine');
    const rawContent = autoPilotEngine.formatCleanPost(job);
    const cleanTitle = (job.title || 'TUYỂN DỤNG NHÂN SỰ').toUpperCase();
    const fixedEntities = [];
    if (job.company && !['doanh nghiệp', 'khách hàng', 'chưa cập nhật'].includes(String(job.company).toLowerCase().trim())) {
      fixedEntities.push(job.company);
    }
    if (job.salary && !['không đề cập', 'không rõ'].includes(String(job.salary).toLowerCase().trim())) {
      fixedEntities.push(job.salary);
    }
    if (job.phone || job.hotline) {
      fixedEntities.push(job.phone || job.hotline);
    }
    return {
      rawContent,
      title: `Tuyển dụng ${cleanTitle} - ${job.company || 'Doanh Nghiệp'}`,
      fixedEntities
    };
  }
}

module.exports = new ScraperDataProvider();
