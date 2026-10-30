/**
 * googleSheetProvider.js - Nạp và phân tích dữ liệu tuyển dụng từ Google Sheets thời gian thực
 */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const csvParser = require('csv-parser');
const { Readable } = require('stream');
const config = require('../../../config');
const logger = require('../../../core/utils/logger');
const { fixSpellingAndSpacing, formatJobForGroup } = require('../../../core/utils/textCleaner');

class GoogleSheetProvider {
  constructor() {
    this.cachedJobs = [];
    this.lastFetched = null;
    this.sheetUrl = config.sheet.csvUrl;
    this.webhookUrl = process.env.GOOGLE_SHEET_WEBHOOK_URL || '';
    this.cfgFile = path.resolve(config.rootDir, 'data/sheet_config.json');
    this._loadConfig();
  }

  _loadConfig() {
    try {
      if (fs.existsSync(this.cfgFile)) {
        const c = JSON.parse(fs.readFileSync(this.cfgFile, 'utf8'));
        if (c.sheetUrl) this.sheetUrl = this._normalizeSheetUrl(c.sheetUrl);
        if (c.webhookUrl) this.webhookUrl = c.webhookUrl;
      }
    } catch (e) {}
  }

  _saveConfig() {
    try {
      fs.writeFileSync(this.cfgFile, JSON.stringify({
        sheetUrl: this.sheetUrl,
        webhookUrl: this.webhookUrl,
        updatedAt: new Date().toISOString()
      }, null, 2), 'utf8');
    } catch (e) {}
  }

  /**
   * Chuẩn hóa URL Google Sheet thành link tải CSV tự động
   */
  _normalizeSheetUrl(url) {
    if (!url) return '';
    let clean = String(url).trim();

    // Nếu đã là link pub?output=csv hoặc export?format=csv
    if (clean.includes('output=csv') || clean.includes('format=csv')) {
      return clean;
    }

    // Nếu là link xuất bản /pub
    if (clean.includes('/pub')) {
      return `${clean.split('?')[0]}?output=csv`;
    }

    // Nếu là link chia sẻ /spreadsheets/d/{SHEET_ID}/edit
    const match = clean.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) {
      const sheetId = match[1];
      return `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv`;
    }

    return clean;
  }

  /**
   * Cập nhật URL Google Sheet mới
   */
  setSheetUrl(newUrl) {
    this.sheetUrl = this._normalizeSheetUrl(newUrl);
    this.cachedJobs = [];
    this.lastFetched = null;
    this._saveConfig();
  }

  setSheetConfig(newSheetUrl, newWebhookUrl) {
    if (newSheetUrl) this.sheetUrl = this._normalizeSheetUrl(newSheetUrl);
    if (newWebhookUrl !== undefined) this.webhookUrl = (newWebhookUrl || '').trim();
    this.cachedJobs = [];
    this.lastFetched = null;
    this._saveConfig();
  }

  /**
   * Tải và parse dữ liệu từ Google Sheets
   */
  async fetchJobs(forceReload = false) {
    if (!forceReload && this.cachedJobs.length > 0 && this.lastFetched) {
      const ageSeconds = (Date.now() - this.lastFetched.getTime()) / 1000;
      if (ageSeconds < config.sheet.cacheTtlSeconds) {
        return this.cachedJobs;
      }
    }

    const downloadUrl = this._normalizeSheetUrl(this.sheetUrl);
    if (!downloadUrl) {
      logger.warn('Chưa cấu hình URL Google Sheets.');
      return [];
    }

    try {
      logger.info(`Đang tải dữ liệu từ Google Sheets: ${downloadUrl}`);
      const response = await axios.get(downloadUrl, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      const csvContent = response.data;
      const parsedRows = await this._parseCsvString(csvContent);

      this.cachedJobs = parsedRows.map((r, idx) => {
        // Tự động nhận diện tên cột linh hoạt từ Google Sheet
        const title = r['Công việc'] || r['Vị trí công việc'] || r['Tiêu đề'] || r['Chức vụ'] || r.title || r['Vị trí'] || 'Tuyển dụng';
        const company = r['Nhà tuyển dụng'] || r['Công Ty'] || r['Công ty'] || r['Doanh nghiệp'] || r.company || 'Doanh nghiệp Tuyển dụng';
        const location = r['Tỉnh thành'] || r['Tỉnh Thành'] || r['Địa điểm'] || r.location || 'Toàn quốc';
        const detailedLoc = r['Địa điểm chi tiết'] || r['Địa chỉ chi tiết'] || r.detailedLocation || '';
        
        // Mức lương / Thu nhập
        const salary = r['Mức lương'] || r['Lương'] || r['Số tiền (VNĐ/CV)'] || r.salary || 'Thoả thuận';
        const jobType = r['Loại hình công việc'] || r['Hình thức'] || r.jobType || 'Toàn thời gian';
        const industry = r['Lĩnh vực/ngành nghề'] || r['Ngành nghề'] || r['Lĩnh vực'] || '';
        const position = r['Chức vụ'] || 'Nhân viên';
        const so_luong = r['Số lượng'] && r['Số lượng'] !== 'Không đề cập' ? r['Số lượng'] : '';
        const workingTime = r['Thời gian làm việc'] && r['Thời gian làm việc'] !== 'Không đề cập' ? r['Thời gian làm việc'] : '';
        const gender = r['Giới tính'] || '';
        const age = r['Độ tuổi'] || '';
        
        // Mô tả công việc
        const desc = r['Mô tả công việc'] || r['Điều kiện nhận'] || r.description || '';
        
        // Yêu cầu chi tiết
        const kinh_nghiem = r['Kinh nghiệm'] || '';
        const ky_nang = r['Kỹ năng'] || '';
        const bang_cap = r['Bằng cấp'] || '';

        // Quyền lợi & Phúc lợi
        let ben = r['Quyền lợi'] || r['Quyền lợi & Phúc lợi'] || r['Thưởng (VNĐ)'] || r.benefits || '';
        if (r['Điều kiện thưởng']) {
          ben = ben ? `${ben} (Điều kiện: ${r['Điều kiện thưởng']})` : r['Điều kiện thưởng'];
        }

        const deadline = r['Hạn nộp Hồ sơ'] || r['Hạn nộp'] || r['Thời gian nhận tiền'] || '';
        const targetGroups = r['Link cần thiết'] || r['Group mục tiêu'] || r['Nhóm'] || '';
        const contactInfo = r['Liên hệ'] || r['SĐT'] || r['Zalo'] || r['Hotline'] || r['Số điện thoại'] || r['Thông tin liên hệ'] || 'Liên hệ Zalo: 0971946725';
        const note = r['Ghi chú'] || '';

        const jobObj = {
          id: idx + 1,
          stt: r['STT'] || (idx + 1),
          title: fixSpellingAndSpacing(title),
          company: fixSpellingAndSpacing(company),
          location: fixSpellingAndSpacing(location),
          province: fixSpellingAndSpacing(location),
          detailedLocation: fixSpellingAndSpacing(detailedLoc),
          salary: fixSpellingAndSpacing(salary),
          jobType: fixSpellingAndSpacing(jobType),
          industry: fixSpellingAndSpacing(industry),
          position: fixSpellingAndSpacing(position),
          so_luong,
          workingTime,
          gender,
          age,
          description: desc,
          kinh_nghiem,
          ky_nang,
          bang_cap,
          do_tuoi: age,
          gioi_tinh: gender,
          requirements: [kinh_nghiem, ky_nang, bang_cap].filter(x => x && x !== 'Không đề cập' && x !== 'Không yêu cầu').join('\n'),
          benefits: ben,
          deadline,
          targetGroups,
          contactInfo,
          note,
          isCustom: true
        };

        jobObj.formattedGroupPost = formatJobForGroup(jobObj);
        return jobObj;
      });

      this.lastFetched = new Date();
      
      // Tự động gộp các việc làm lưu tại app chưa có trên Sheet
      try {
        const path = require('path');
        const localJobsFile = path.resolve(__dirname, '..', '..', 'data', 'local_jobs.json');
        if (fs.existsSync(localJobsFile)) {
          const localJobs = JSON.parse(fs.readFileSync(localJobsFile, 'utf8'));
          const unadded = localJobs.filter(lj => 
            !this.cachedJobs.some(cj => 
              cj.title && lj.title && cj.title.toLowerCase().trim() === lj.title.toLowerCase().trim() &&
              cj.company && lj.company && cj.company.toLowerCase().trim() === lj.company.toLowerCase().trim()
            )
          );
          if (unadded.length > 0) {
            this.cachedJobs = [...unadded, ...this.cachedJobs];
          }
        }
      } catch (e) {}

      logger.success(`Đã nạp thành công ${this.cachedJobs.length} việc làm từ Google Sheets & Local.`);
      return this.cachedJobs;
    } catch (err) {
      logger.error(`Lỗi kết nối Google Sheets: ${err.message}`);
      return this.cachedJobs;
    }
  }

  _parseCsvString(csvString) {
    return new Promise((resolve, reject) => {
      const results = [];
      const stream = Readable.from([csvString]);

      stream
        .pipe(csvParser({ mapHeaders: ({ header }) => header.trim() }))
        .on('data', (data) => results.push(data))
        .on('end', () => resolve(results))
        .on('error', (err) => reject(err));
    });
  }


  /**
   * Thêm một việc làm mới trực tiếp và đồng bộ 2 chiều sang Google Sheet qua Webhook
   */
  async addJob(jobData) {
    const localJobsFile = path.resolve(config.rootDir, 'data/local_jobs.json');
    let localJobs = [];
    if (fs.existsSync(localJobsFile)) {
      try {
        localJobs = JSON.parse(fs.readFileSync(localJobsFile, 'utf8'));
      } catch (e) {}
    }

    const nextId = (this.cachedJobs.length || 0) + 1;
    const title = fixSpellingAndSpacing(jobData.title || 'Tuyển dụng');
    const company = fixSpellingAndSpacing(jobData.company || 'Doanh nghiệp tuyển dụng');
    const location = fixSpellingAndSpacing(jobData.location || jobData.province || 'Toàn quốc');
    const detailedLoc = fixSpellingAndSpacing(jobData.detailedLocation || '');
    const salary = fixSpellingAndSpacing(jobData.salary || 'Thoả thuận');
    const jobType = fixSpellingAndSpacing(jobData.jobType || 'Toàn thời gian');
    const industry = fixSpellingAndSpacing(jobData.industry || '');
    const position = fixSpellingAndSpacing(jobData.position || 'Nhân viên');
    const workingTime = fixSpellingAndSpacing(jobData.workingTime || 'Giờ hành chính');
    const deadline = jobData.deadline || 'Không đề cập';
    const desc = jobData.description || '';
    const reqs = jobData.requirements || '';
    const ben = jobData.benefits || '';
    const contact = jobData.contactInfo || 'Liên hệ Zalo/SĐT để ứng tuyển';
    const note = jobData.note || '';

    const newJob = {
      id: nextId,
      stt: nextId,
      title,
      company,
      location,
      province: location,
      detailedLocation: detailedLoc,
      salary,
      jobType,
      industry,
      position,
      so_luong: jobData.so_luong || '',
      workingTime,
      gender: jobData.gender || 'Không yêu cầu',
      age: jobData.age || 'Không yêu cầu',
      description: desc,
      kinh_nghiem: jobData.kinh_nghiem || '',
      ky_nang: jobData.ky_nang || '',
      bang_cap: jobData.bang_cap || '',
      requirements: reqs,
      benefits: ben,
      deadline,
      targetGroups: jobData.targetGroups || '',
      contactInfo: contact,
      note,
      isCustom: true,
      source: 'LeadX App',
      createdAt: new Date().toISOString()
    };

    newJob.formattedGroupPost = formatJobForGroup(newJob);

    // Lưu vào file local_jobs.json
    localJobs.unshift(newJob);
    fs.writeFileSync(localJobsFile, JSON.stringify(localJobs, null, 2), 'utf8');

    // Thêm vào đầu danh sách cache
    this.cachedJobs.unshift(newJob);

    // Gửi sang Webhook Google Sheet nếu đã được cấu hình
    let syncedToSheet = false;
    let syncError = null;

    const webhook = (jobData.webhookUrl || this.webhookUrl || '').trim();
    if (webhook) {
      try {
        logger.info(`Đang gửi dữ liệu sang Google Sheet Webhook: ${webhook}`);
        const res = await axios.post(webhook, {
          title,
          company,
          location,
          salary,
          workingTime,
          jobType,
          industry,
          description: desc,
          requirements: reqs,
          benefits: ben,
          deadline,
          contactInfo: contact,
          detailedLocation: detailedLoc,
          createdAt: new Date().toLocaleString('vi-VN')
        }, {
          timeout: 10000,
          headers: { 'Content-Type': 'application/json' }
        });

        if (res.status === 200 || res.status === 201) {
          syncedToSheet = true;
          logger.success(`Đã đồng bộ việc làm "${title}" sang Google Sheet thành công!`);
        }
      } catch (err) {
        syncError = err.message;
        logger.warn(`Lỗi đồng bộ Google Sheet Webhook: ${err.message}`);
      }
    }

    return {
      success: true,
      job: newJob,
      syncedToSheet,
      syncError,
      message: syncedToSheet 
        ? `Đã thêm việc làm "${title}" và đồng bộ tự động vào Google Sheet!`
        : (this.webhookUrl 
          ? `Đã lưu việc làm vào LeadX (Lỗi kết nối Webhook: ${syncError || 'timeout'})`
          : `Đã lưu việc làm vào LeadX thành công! (Dán Webhook URL trong Cấu Hình Link Sheet để tự động ghi vào Google Sheet)`)
    };
  }

}

module.exports = new GoogleSheetProvider();
