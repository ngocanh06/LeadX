/**
 * marketAnalyticsService.js - Phân tích Cung - Cầu Thị Trường Tuyển Dụng & Dự Đoán Tỷ Lệ Đăng Bài
 * Kết nối trực tiếp với kho dữ liệu cào đa nguồn (TopCV, Vieclam24h, CareerViet) tại scraper_data
 */
const path = require('path');
const fs = require('fs');
const xlsx = require('xlsx');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');

class MarketAnalyticsService {
  constructor() {
    const rootDir = config.rootDir || path.resolve(__dirname, '../../../../');
    this.scraperDataDir = path.resolve(rootDir, '../Tuyển Dụng/scraper_data');
    this.cachedJobs = null;
    this.lastLoadedAt = null;
  }

  /**
   * Tải và chuẩn hóa toàn bộ dữ liệu cào từ các file Excel
   */
  loadMarketData(forceReload = false) {
    if (this.cachedJobs && !forceReload) {
      return this.cachedJobs;
    }

    const allJobs = [];
    const filesToRead = [
      { name: 'topcv_matrix_jobs.xlsx', source: 'TopCV' },
      { name: 'vieclam24h_matrix_jobs.xlsx', source: 'Vieclam24h' },
      { name: 'careerviet_matrix_jobs.xlsx', source: 'Careerviet' }
    ];

    for (const f of filesToRead) {
      const fullPath = path.join(this.scraperDataDir, f.name);
      if (fs.existsSync(fullPath)) {
        try {
          const wb = xlsx.readFile(fullPath);
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = xlsx.utils.sheet_to_json(sheet) || [];

          rows.forEach(r => {
            const title = (r['Công việc'] || r.cong_viec || r.ten_cong_viec || r.title || '').trim();
            const province = (r['Tỉnh thành'] || r.tinh_thanh || r.province || 'Toàn quốc').trim();
            const salary = (r['Mức lương'] || r.muc_luong || r.salary || 'Thoả thuận').trim();
            const industry = (r['Lĩnh vực/ngành nghề'] || r.linh_vuc_nganh_nghe || r.nganh_nghe || 'Khác').trim();
            const company = (r['Nhà tuyển dụng'] || r.nha_tuyen_dung || r.ten_cong_ty || r.company || 'Doanh nghiệp').trim();

            if (title) {
              allJobs.push({
                source: f.source,
                title,
                province,
                salary,
                salaryNumeric: this._parseSalaryNumeric(salary),
                industry,
                company,
                url: r.url || ''
              });
            }
          });
          logger.info(`Đã nạp ${rows.length} tin thị trường từ ${f.source}.`);
        } catch (e) {
          logger.warn(`Lỗi đọc file ${f.name}: ${e.message}`);
        }
      }
    }

    this.cachedJobs = allJobs;
    this.lastLoadedAt = new Date().toISOString();
    logger.success(`Tổng hợp thành công ${allJobs.length} tin tuyển dụng thị trường từ scraper_data.`);
    return allJobs;
  }

  /**
   * Bóc tách số tiền lương (triệu VNĐ) từ chuỗi tiếng Việt
   * Ví dụ: "10 - 15 triệu" -> { min: 10, max: 15, avg: 12.5 }
   */
  _parseSalaryNumeric(salaryStr) {
    if (!salaryStr || salaryStr.toLowerCase().includes('thoả thuận') || salaryStr.toLowerCase().includes('thỏa thuận')) {
      return null;
    }
    const clean = salaryStr.toLowerCase().replace(/,/g, '.');
    const matches = clean.match(/([\d.]+)/g);
    if (!matches || matches.length === 0) return null;

    let nums = matches.map(n => parseFloat(n)).filter(n => !isNaN(n) && n > 0);
    // Chuẩn hóa nếu đơn vị là VND đầy đủ (ví dụ 10.000.000)
    nums = nums.map(n => n > 1000 ? Math.round(n / 1000000) : n);

    if (nums.length === 1) {
      return { min: nums[0], max: nums[0], avg: nums[0] };
    }
    if (nums.length >= 2) {
      const min = Math.min(nums[0], nums[1]);
      const max = Math.max(nums[0], nums[1]);
      return { min, max, avg: (min + max) / 2 };
    }
    return null;
  }

  /**
   * Phân tích thị trường cho một vị trí cụ thể và tỉnh thành
   */
  analyzePosition(jobTitle = '', targetProvince = '') {
    const jobs = this.loadMarketData();
    const searchKW = (jobTitle || '').toLowerCase().trim();
    const searchProv = (targetProvince || '').toLowerCase().trim();

    // Tách các từ khóa chính (ví dụ "kế toán", "bán hàng", "tuyển dụng")
    const keywords = searchKW.split(/\s+/).filter(w => w.length > 1 && !['nhân', 'viên', 'tuyển', 'dụng', 'gấp', 'cần'].includes(w));

    const matchedJobs = jobs.filter(j => {
      const titleLower = j.title.toLowerCase();
      const provLower = j.province.toLowerCase();

      // Kiểm tra khớp từ khóa chức danh
      const matchTitle = keywords.length > 0
        ? keywords.some(kw => titleLower.includes(kw))
        : true;

      // Kiểm tra khớp tỉnh thành nếu có chỉ định
      const matchProv = searchProv && searchProv !== 'toàn quốc'
        ? (provLower.includes(searchProv) || searchProv.includes(provLower) || provLower === 'toàn quốc')
        : true;

      return matchTitle && matchProv;
    });

    const totalOpenings = matchedJobs.length;

    // Tính toán phổ lương thị trường
    const salaryList = matchedJobs.map(j => j.salaryNumeric).filter(Boolean);
    let salaryMin = 0;
    let salaryMax = 0;
    let salaryAvg = 0;

    if (salaryList.length > 0) {
      salaryMin = Math.min(...salaryList.map(s => s.min));
      salaryMax = Math.max(...salaryList.map(s => s.max));
      const sumAvg = salaryList.reduce((acc, s) => acc + s.avg, 0);
      salaryAvg = Math.round((sumAvg / salaryList.length) * 10) / 10;
    }

    // Đánh giá mức độ cạnh tranh
    let competitionLevel = 'LOW';
    let competitionText = 'Cạnh tranh thấp (Dễ tuyển)';
    let estimatedPostsPerCv = 3;
    let estimatedDays = '1 - 2 ngày';

    if (totalOpenings > 50) {
      competitionLevel = 'VERY_HIGH';
      competitionText = 'Rất gay gắt / Thị trường bão hòa tin tuyển';
      estimatedPostsPerCv = 14;
      estimatedDays = '5 - 7 ngày';
    } else if (totalOpenings > 20) {
      competitionLevel = 'HIGH';
      competitionText = 'Cạnh tranh cao (Nhiều doanh nghiệp cùng tuyển)';
      estimatedPostsPerCv = 9;
      estimatedDays = '3 - 5 ngày';
    } else if (totalOpenings >= 8) {
      competitionLevel = 'MEDIUM';
      competitionText = 'Cạnh tranh vừa phải';
      estimatedPostsPerCv = 6;
      estimatedDays = '2 - 3 ngày';
    } else {
      competitionLevel = 'LOW';
      competitionText = 'Ít đối thủ cạnh tranh (Dễ thu hút ứng viên)';
      estimatedPostsPerCv = 4;
      estimatedDays = '1 - 2 ngày';
    }

    // Đưa ra khuyến nghị cụ thể
    const recommendations = [];
    if (salaryAvg > 0) {
      recommendations.push(`Mặt bằng lương thị trường dao động từ ${salaryMin} - ${salaryMax} triệu (Trung bình: ~${salaryAvg} triệu/tháng). Hãy đảm bảo mức lương của bạn không thấp hơn mức này.`);
    } else {
      recommendations.push(`Đa số các tin trên thị trường để mức lương "Thoả thuận". Nếu bài đăng của bạn ghi rõ con số lương cụ thể, tỷ lệ nhận được inbox xin việc sẽ tăng gấp 2.5 lần!`);
    }

    if (competitionLevel === 'VERY_HIGH' || competitionLevel === 'HIGH') {
      recommendations.push(`Vị trí này đang có nhiều công ty cùng tuyển. Khuyến nghị: Tránh viết mô tả dài dòng, nên giật tít quyền lợi nổi bật (Ví dụ: "Không cần kinh nghiệm", "Phỏng vấn đi làm ngay", "Bao ăn ở").`);
    } else {
      recommendations.push(`Nhu cầu vị trí này ổn định và ít đối thủ. Bạn chỉ cần đăng khoảng ${estimatedPostsPerCv} - ${estimatedPostsPerCv + 3} bài lên các nhóm chất lượng là có thể thu về đủ chỉ tiêu CV.`);
    }

    return {
      query: { jobTitle, targetProvince },
      totalOpenings,
      competitionLevel,
      competitionText,
      estimatedPostsPerCv,
      estimatedDays,
      salaryMarket: {
        min: salaryMin,
        max: salaryMax,
        avg: salaryAvg,
        display: salaryAvg > 0 ? `${salaryMin} - ${salaryMax} triệu (TB: ${salaryAvg}tr)` : 'Thoả thuận phổ biến'
      },
      recommendations,
      sampleCompetitors: matchedJobs.slice(0, 4).map(j => ({
        title: j.title,
        company: j.company,
        province: j.province,
        salary: j.salary,
        source: j.source
      }))
    };
  }

  /**
   * Thống kê tổng quan thị trường
   */
  getMarketOverview() {
    const jobs = this.loadMarketData();
    const provCount = {};
    const industryCount = {};

    jobs.forEach(j => {
      const p = j.province || 'Toàn quốc';
      provCount[p] = (provCount[p] || 0) + 1;

      const ind = j.industry || 'Khác';
      industryCount[ind] = (industryCount[ind] || 0) + 1;
    });

    const topProvinces = Object.entries(provCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    const topIndustries = Object.entries(industryCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, count]) => ({ name, count }));

    return {
      totalMarketJobs: jobs.length,
      lastLoadedAt: this.lastLoadedAt,
      topProvinces,
      topIndustries
    };
  }
}

module.exports = new MarketAnalyticsService();
