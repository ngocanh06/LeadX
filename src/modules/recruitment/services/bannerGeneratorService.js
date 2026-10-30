/**
 * bannerGeneratorService.js - Engine Tự động tạo Poster Tuyển Dụng chuẩn Human Graphic Design Đa Biến Thể
 * Hỗ trợ 4 Layout Templates, 6 Bảng Màu Đồ Họa, Đa Dạng Tagline & Ảnh Thực Tế Chống Lặp 100%
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const logger = require('../../../core/utils/logger');
const stockPhotoResolver = require('./stockPhotoResolver');
const { cleanJobTitle, shortenSalary, cleanCompanyName, cleanJobLocations } = require('../../../core/utils/textCleaner');

const outDir = path.resolve(__dirname, '../../../../data/images/generated');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

// 6 Bảng Màu Đồ Họa Đẳng Cấp Chuyên Nghiệp (Curated Agency Palettes)
const THEMES = [
  {
    id: 'blue_corporate',
    primary: '#1D4ED8',
    secondary: '#2563EB',
    badge: '#DC2626',
    badgeText: '#FFFFFF',
    lightBg: '#EFF6FF',
    borderColor: '#BFDBFE',
    accentText: '#1E40AF'
  },
  {
    id: 'emerald_growth',
    primary: '#047857',
    secondary: '#059669',
    badge: '#D97706',
    badgeText: '#FFFFFF',
    lightBg: '#ECFDF5',
    borderColor: '#A7F3D0',
    accentText: '#065F46'
  },
  {
    id: 'sunset_coral',
    primary: '#BE123C',
    secondary: '#E11D48',
    badge: '#4F46E5',
    badgeText: '#FFFFFF',
    lightBg: '#FFF1F2',
    borderColor: '#FECDD3',
    accentText: '#9F1239'
  },
  {
    id: 'royal_indigo',
    primary: '#4338CA',
    secondary: '#6366F1',
    badge: '#059669',
    badgeText: '#FFFFFF',
    lightBg: '#EEF2FF',
    borderColor: '#C7D2FE',
    accentText: '#3730A3'
  },
  {
    id: 'amber_navy',
    primary: '#B45309',
    secondary: '#D97706',
    badge: '#1D4ED8',
    badgeText: '#FFFFFF',
    lightBg: '#FFFBEB',
    borderColor: '#FDE68A',
    accentText: '#92400E'
  },
  {
    id: 'cyan_tech',
    primary: '#0E7490',
    secondary: '#0891B2',
    badge: '#E11D48',
    badgeText: '#FFFFFF',
    lightBg: '#ECFEFF',
    borderColor: '#A5F3FC',
    accentText: '#155E75'
  }
];

// Danh mục Tagline linh hoạt theo ngữ cảnh
const BADGES = [
  'TUYỂN DỤNG GẤP',
  'ĐI LÀM NGAY',
  'THU NHẬP HẤP DẪN',
  'CƠ HỘI NGHỀ NGHIỆP',
  'TUYỂN TRỰC TIẾP',
  'HOT RECRUITMENT'
];

class BannerGeneratorService {
  constructor() {
    this.browser = null;
    this.isLaunching = false;
  }

  async getBrowser() {
    if (this.browser && this.browser.connected) {
      return this.browser;
    }

    if (this.isLaunching) {
      while (this.isLaunching) {
        await new Promise(r => setTimeout(r, 100));
      }
      if (this.browser && this.browser.connected) {
        return this.browser;
      }
    }

    this.isLaunching = true;
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--no-first-run',
          '--no-zygote'
        ]
      });
      logger.info('[BannerGenerator] Đã khởi tạo Headless Browser cho Banner Generator.');
      return this.browser;
    } catch (err) {
      logger.error(`[BannerGenerator] Lỗi khởi tạo Puppeteer: ${err.message}`);
      throw err;
    } finally {
      this.isLaunching = false;
    }
  }

  /**
   * Tính toán trước thông tin, chọn Theme và Layout Template chống trùng lặp
   */
  computePosterInfo(job = {}, pageInfo = {}) {
    let cleanTitle = job.title || job.cong_viec || 'Chuyên Viên Tuyển Dụng';
    if (typeof cleanJobTitle === 'function') {
      cleanTitle = cleanJobTitle(cleanTitle);
    }
    if (cleanTitle.length > 45) {
      cleanTitle = cleanTitle.replace(/[\(\[].*?[\)\]]/g, '').trim();
      cleanTitle = cleanTitle.replace(/,\s*LÀM VIỆC.*/i, '').trim();
      cleanTitle = cleanTitle.replace(/-\s*LÀM VIỆC.*/i, '').trim();
    }
    cleanTitle = cleanTitle.toUpperCase();
    if (cleanTitle.length > 70) {
      cleanTitle = cleanTitle.slice(0, 67) + '...';
    }

    const rawComp = job.company || job.doanh_nghiep || 'Doanh Nghiệp Tuyển Dụng';
    const cleanComp = cleanCompanyName ? cleanCompanyName(rawComp) : rawComp;

    const rawSal = job.salary || job.muc_luong || 'Thỏa thuận theo năng lực';
    const cleanSal = shortenSalary ? shortenSalary(rawSal) : rawSal;

    const targetProv = pageInfo.province || pageInfo.name || job.location || job.tinh_thanh || 'TP. Hồ Chí Minh';
    let cleanLoc = targetProv;
    const rawLoc = (job.detailedLocation || job.dia_diem_chi_tiet || job.location || job.tinh_thanh || '').trim();
    if (rawLoc && !rawLoc.includes(':') && !rawLoc.includes(';') && rawLoc.length <= 25 && !rawLoc.toLowerCase().includes('địa điểm') && !rawLoc.toLowerCase().includes('công ty')) {
      cleanLoc = rawLoc;
    } else {
      cleanLoc = targetProv;
    }

    let cleanExp = job.experience || job.kinh_nghiem || 'Không yêu cầu';
    if (!cleanExp || cleanExp === 'Không đề cập') cleanExp = 'Không yêu cầu kinh nghiệm';
    if (cleanExp.length > 22) cleanExp = cleanExp.slice(0, 22);

    const category = job.category || job.linh_vuc_nganh_nghe || 'Tuyển Dụng & Việc Làm';

    const photoPath = stockPhotoResolver.resolvePhotoPath(job);
    const photoFile = photoPath ? path.basename(photoPath) : 'default';

    // Băm kết hợp ổn định (Title + Company + Location) để chọn Template & Theme chống trùng lặp
    const seed = `${cleanTitle}|${cleanComp}|${cleanLoc}`;
    let hashVal = 0;
    for (let i = 0; i < seed.length; i++) {
      hashVal = (hashVal * 31 + seed.charCodeAt(i)) >>> 0;
    }

    // Khóa cố định Template 0: Modern Bottom-Sheet Card (Theo đúng mẫu chuẩn người dùng yêu cầu)
    const templateIndex = 0;
    const themeIndex = Math.abs((hashVal >>> 2) % THEMES.length);
    const badgeIndex = Math.abs((hashVal >>> 4) % BADGES.length);

    const theme = THEMES[themeIndex] || THEMES[0];
    const badgeText = BADGES[badgeIndex] || BADGES[0];

    const cacheKey = `v22_t${templateIndex}_th${themeIndex}_${cleanTitle}|${cleanComp}|${cleanSal}|${cleanLoc}|${photoFile}`;
    const hash = crypto.createHash('md5').update(cacheKey).digest('hex').slice(0, 10);
    const filename = `poster_${hash}.png`;
    const outPath = path.join(outDir, filename);
    const relativeUrl = `/uploads/generated/${filename}`;
    const exists = fs.existsSync(outPath);

    return {
      hash,
      filename,
      filePath: outPath,
      imageUrl: relativeUrl,
      exists,
      cleanTitle,
      cleanComp,
      cleanSal,
      cleanLoc,
      cleanExp,
      category,
      targetProv,
      templateIndex,
      theme,
      badgeText
    };
  }

  /**
   * Sinh mã HTML cho 4 Template đồ họa độc lập
   */
  _buildHtmlTemplate(data, photoDataUri) {
    const { cleanTitle, cleanComp, cleanSal, cleanLoc, cleanExp, category, templateIndex, theme, badgeText } = data;

    // === TEMPLATE 0: Modern Bottom-Sheet (Clean Minimalist với Dynamic Theme & Tag) ===
    if (templateIndex === 0) {
      return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 1200px; height: 1200px;
            font-family: 'Be Vietnam Pro', -apple-system, sans-serif;
            background: #FFFFFF;
            margin: 0; padding: 0;
            overflow: hidden;
            display: flex; flex-direction: column;
            -webkit-font-smoothing: antialiased;
          }
          .card-container {
            width: 1200px; height: 1200px;
            background: #FFFFFF;
            border-radius: 0;
            border: none;
            box-shadow: none;
            overflow: hidden; display: flex; flex-direction: column; position: relative;
          }
          .photo-section {
            position: relative; height: 740px; width: 100%; flex-shrink: 0;
            background-image: url('${photoDataUri}');
            background-size: cover; background-position: center center;
          }
          .photo-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.6) 0%, rgba(15, 23, 42, 0.08) 25%, rgba(0, 0, 0, 0) 100%);
          }
          .header-floating {
            position: absolute; top: 36px; left: 44px; right: 44px;
            display: flex; justify-content: space-between; align-items: center; z-index: 2;
          }
          .brand-box {
            display: flex; align-items: center; gap: 12px;
            background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(12px);
            padding: 12px 24px; border-radius: 16px;
            border: 1.5px solid rgba(255, 255, 255, 0.9);
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.15);
          }
          .brand-title { font-size: 22px; font-weight: 900; color: #0F172A; }
          .brand-sep { width: 2px; height: 18px; background: #CBD5E1; }
          .brand-sub { font-size: 14.5px; font-weight: 800; color: #475569; text-transform: uppercase; }
          .tag-urgent {
            background: ${theme.badge}; color: ${theme.badgeText};
            padding: 12px 24px; border-radius: 14px; font-size: 15.5px; font-weight: 900;
            text-transform: uppercase; letter-spacing: 0.6px;
            box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
          }
          .info-section {
            position: relative; margin-top: -55px; border-radius: 46px 46px 0 0;
            background: #FFFFFF; flex: 1; padding: 42px 52px 42px 52px;
            display: flex; flex-direction: column; justify-content: space-between;
            box-shadow: 0 -16px 40px rgba(0, 0, 0, 0.14); z-index: 3;
          }
          .meta-top-row {
            display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;
          }
          .category-pill {
            display: inline-flex; align-items: center; padding: 9px 24px;
            background: ${theme.lightBg}; border: 2.5px solid ${theme.borderColor};
            border-radius: 14px; font-size: 18px; font-weight: 900;
            color: ${theme.primary}; text-transform: uppercase; letter-spacing: 0.5px;
          }
          .location-pill {
            display: inline-flex; align-items: center; gap: 8px;
            background: #F8FAFC; border: 2px solid #E2E8F0;
            padding: 9px 20px; border-radius: 14px;
            font-size: 16px; font-weight: 800; color: #475569; text-transform: uppercase;
          }
          .job-title {
            font-size: 58px; font-weight: 900; color: #0F172A; line-height: 1.16;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
            letter-spacing: -0.6px;
          }
          .company-name {
            font-size: 30px; font-weight: 700; color: #334155; margin-top: 10px;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          }
          .meta-grid {
            display: grid; grid-template-columns: 1.35fr 1.25fr 1.15fr; gap: 18px; margin-top: 20px;
          }
          .meta-item {
            background: #F8FAFC; border: 2.5px solid #E2E8F0; border-radius: 22px;
            padding: 20px 24px; display: flex; flex-direction: column; justify-content: center; height: 155px;
          }
          .meta-item.highlight {
            background: ${theme.lightBg}; border-color: ${theme.borderColor};
          }
          .meta-caption { font-size: 17px; font-weight: 800; color: #64748B; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 0.5px; }
          .meta-item.highlight .meta-caption { color: ${theme.primary}; }
          .meta-value { font-size: 42px; font-weight: 900; color: #0F172A; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .meta-item.highlight .meta-value { color: ${theme.primary}; }
        </style>
      </head>
      <body>
        <div class="card-container">
          <div class="photo-section">
            <div class="photo-overlay"></div>
            <div class="header-floating">
              <div class="brand-box">
                <span class="brand-title">JobCentral</span>
                <div class="brand-sep"></div>
                <span class="brand-sub">Hệ Thống Tuyển Dụng</span>
              </div>
              <div class="tag-urgent">${badgeText}</div>
            </div>
          </div>
          <div class="info-section">
            <div>
              <div class="meta-top-row">
                <span class="category-pill">${category}</span>
                <span class="location-pill">📍 ${cleanLoc}</span>
              </div>
              <h1 class="job-title">${cleanTitle}</h1>
              <p class="company-name">${cleanComp}</p>
            </div>
            <div class="meta-grid">
              <div class="meta-item highlight">
                <span class="meta-caption">Mức Thu Nhập</span>
                <span class="meta-value">${cleanSal}</span>
              </div>
              <div class="meta-item">
                <span class="meta-caption">Địa Điểm Làm Việc</span>
                <span class="meta-value">${cleanLoc}</span>
              </div>
              <div class="meta-item">
                <span class="meta-caption">Kinh Nghiệm</span>
                <span class="meta-value">${cleanExp}</span>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
      `;
    }

    // === TEMPLATE 1: Editorial Split (Bố cục tạp chí 2 cột trái phải, hiện đại) ===
    if (templateIndex === 1) {
      return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 1200px; height: 1200px;
            font-family: 'Be Vietnam Pro', -apple-system, sans-serif;
            background: #0F172A;
            display: flex; align-items: center; justify-content: center;
            padding: 40px; -webkit-font-smoothing: antialiased;
          }
          .card-container {
            width: 1120px; height: 1120px;
            background: #FFFFFF; border-radius: 32px;
            display: flex; overflow: hidden; position: relative;
            box-shadow: 0 30px 80px rgba(0, 0, 0, 0.35);
          }
          .left-column {
            width: 480px; height: 100%; position: relative; flex-shrink: 0;
            background-image: url('${photoDataUri}');
            background-size: cover; background-position: center center;
          }
          .left-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, rgba(0,0,0,0) 40%, rgba(15, 23, 42, 0.7) 100%);
          }
          .left-header {
            position: absolute; top: 40px; left: 36px; right: 36px; z-index: 2;
          }
          .brand-pill-dark {
            display: inline-flex; align-items: center; gap: 8px;
            background: rgba(15, 23, 42, 0.85); backdrop-filter: blur(10px);
            padding: 8px 18px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.2);
            color: #FFFFFF; font-size: 15px; font-weight: 800;
          }
          .left-footer {
            position: absolute; bottom: 40px; left: 36px; right: 36px; z-index: 2;
          }
          .badge-split {
            display: inline-block; background: ${theme.badge}; color: ${theme.badgeText};
            padding: 10px 20px; border-radius: 12px; font-size: 14px; font-weight: 800;
            text-transform: uppercase; letter-spacing: 0.6px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          }
          .right-column {
            flex: 1; padding: 60px 52px; display: flex; flex-direction: column; justify-content: space-between;
          }
          .top-meta { display: flex; align-items: center; justify-content: space-between; }
          .cat-badge {
            font-size: 13px; font-weight: 700; text-transform: uppercase;
            color: ${theme.primary}; background: ${theme.lightBg};
            padding: 6px 14px; border-radius: 8px; border: 1px solid ${theme.borderColor};
          }
          .prov-badge {
            font-size: 14px; font-weight: 700; color: #64748B;
          }
          .title-area { margin-top: 24px; }
          .job-title-split {
            font-size: 40px; font-weight: 900; color: #0F172A; line-height: 1.25;
            display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden;
          }
          .company-split {
            font-size: 22px; font-weight: 600; color: #475569; margin-top: 14px;
            display: flex; align-items: center; gap: 8px;
          }
          .salary-banner {
            margin-top: 28px; background: ${theme.lightBg};
            border-left: 6px solid ${theme.primary};
            padding: 20px 26px; border-radius: 0 16px 16px 0;
          }
          .salary-caption { font-size: 13px; font-weight: 700; color: ${theme.primary}; text-transform: uppercase; }
          .salary-value { font-size: 34px; font-weight: 900; color: #0F172A; margin-top: 4px; }
          .specs-row {
            display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 24px;
          }
          .spec-box {
            background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 14px; padding: 14px 18px;
          }
          .spec-label { font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; }
          .spec-val { font-size: 18px; font-weight: 800; color: #0F172A; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .bottom-bar {
            margin-top: 28px; padding-top: 20px; border-top: 1px solid #E2E8F0;
            display: flex; justify-content: space-between; align-items: center; font-size: 14px; color: #64748B; font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="card-container">
          <div class="left-column">
            <div class="left-overlay"></div>
            <div class="left-header">
              <div class="brand-pill-dark">JobCentral Việt Nam</div>
            </div>
            <div class="left-footer">
              <span class="badge-split">${badgeText}</span>
            </div>
          </div>
          <div class="right-column">
            <div>
              <div class="top-meta">
                <span class="cat-badge">${category}</span>
                <span class="prov-badge">📍 ${cleanLoc}</span>
              </div>
              <div class="title-area">
                <h1 class="job-title-split">${cleanTitle}</h1>
                <p class="company-split">🏢 ${cleanComp}</p>
              </div>
              <div class="salary-banner">
                <div class="salary-caption">Mức Thu Nhập Đề Xuất</div>
                <div class="salary-value">${cleanSal}</div>
              </div>
              <div class="specs-row">
                <div class="spec-box">
                  <div class="spec-label">Kinh Nghiệm</div>
                  <div class="spec-val">${cleanExp}</div>
                </div>
                <div class="spec-box">
                  <div class="spec-label">Khu Vực Tuyển</div>
                  <div class="spec-val">${cleanLoc}</div>
                </div>
              </div>
            </div>
            <div class="bottom-bar">
              <span>✓ Phỏng vấn nhanh, nhận việc ngay</span>
              <span>✓ Đầy đủ chế độ phúc lợi</span>
            </div>
          </div>
        </div>
      </body>
      </html>
      `;
    }

    // === TEMPLATE 2: Glassmorphism Floating Sheet (Đẳng cấp Cao Cấp / IT / Executive) ===
    if (templateIndex === 2) {
      return `
      <!DOCTYPE html>
      <html lang="vi">
      <head>
        <meta charset="utf-8">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            width: 1200px; height: 1200px;
            font-family: 'Be Vietnam Pro', -apple-system, sans-serif;
            background: #090D16;
            display: flex; align-items: center; justify-content: center;
            padding: 40px; -webkit-font-smoothing: antialiased;
          }
          .glass-card {
            width: 1120px; height: 1120px; border-radius: 36px;
            position: relative; overflow: hidden;
            background-image: url('${photoDataUri}');
            background-size: cover; background-position: center 20%;
            display: flex; flex-direction: column; justify-content: space-between;
            padding: 50px 54px; box-shadow: 0 30px 80px rgba(0, 0, 0, 0.6);
          }
          .full-overlay {
            position: absolute; inset: 0;
            background: linear-gradient(180deg, rgba(15, 23, 42, 0.65) 0%, rgba(15, 23, 42, 0.2) 35%, rgba(15, 23, 42, 0.85) 75%, #0B0F19 100%);
          }
          .top-row { position: relative; z-index: 2; display: flex; justify-content: space-between; align-items: center; }
          .glass-brand {
            background: rgba(255, 255, 255, 0.15); backdrop-filter: blur(16px);
            border: 1px solid rgba(255, 255, 255, 0.25);
            padding: 10px 22px; border-radius: 14px; color: #FFFFFF; font-weight: 800; font-size: 18px;
          }
          .glass-urgent {
            background: ${theme.badge}; color: #FFFFFF;
            padding: 10px 22px; border-radius: 12px; font-weight: 800; font-size: 14px;
            text-transform: uppercase; letter-spacing: 0.8px; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
          }
          .sheet-container {
            position: relative; z-index: 2;
            background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(24px);
            border: 1px solid rgba(255, 255, 255, 0.8);
            border-radius: 28px; padding: 40px 48px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.25);
          }
          .cat-pill-glass {
            display: inline-block; background: ${theme.lightBg}; color: ${theme.primary};
            font-size: 13px; font-weight: 700; text-transform: uppercase;
            padding: 6px 14px; border-radius: 8px; border: 1px solid ${theme.borderColor};
          }
          .job-title-glass {
            font-size: 38px; font-weight: 900; color: #0F172A; line-height: 1.25; margin-top: 12px;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
          }
          .comp-glass { font-size: 20px; font-weight: 600; color: #475569; margin-top: 6px; }
          .glass-grid {
            display: grid; grid-template-columns: 1.3fr 1.2fr 1fr; gap: 16px; margin-top: 24px;
          }
          .glass-grid-item {
            background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 16px;
            padding: 14px 20px;
          }
          .glass-grid-item.focus {
            background: ${theme.lightBg}; border-color: ${theme.borderColor};
          }
          .item-caption { font-size: 12px; font-weight: 700; color: #64748B; text-transform: uppercase; }
          .glass-grid-item.focus .item-caption { color: ${theme.primary}; }
          .item-val { font-size: 24px; font-weight: 800; color: #0F172A; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .glass-grid-item.focus .item-val { color: ${theme.primary}; }
        </style>
      </head>
      <body>
        <div class="glass-card">
          <div class="full-overlay"></div>
          <div class="top-row">
            <div class="glass-brand">JOBCENTRAL &bull; TUYỂN DỤNG TOÀN QUỐC</div>
            <div class="glass-urgent">${badgeText}</div>
          </div>
          <div class="sheet-container">
            <span class="cat-pill-glass">${category}</span>
            <h1 class="job-title-glass">${cleanTitle}</h1>
            <p class="comp-glass">${cleanComp}</p>
            <div class="glass-grid">
              <div class="glass-grid-item focus">
                <div class="item-caption">Thu Nhập Hấp Dẫn</div>
                <div class="item-val">${cleanSal}</div>
              </div>
              <div class="glass-grid-item">
                <div class="item-caption">Địa Điểm</div>
                <div class="item-val">${cleanLoc}</div>
              </div>
              <div class="glass-grid-item">
                <div class="item-caption">Kinh Nghiệm</div>
                <div class="item-val">${cleanExp}</div>
              </div>
            </div>
          </div>
        </div>
      </body>
      </html>
      `;
    }

    // === TEMPLATE 3: Geometric Bold Accent (Bố cục Khối màu Tương phản cao, F&B / Bán hàng / Khối Phổ thông) ===
    return `
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="utf-8">
      <link rel="preconnect" href="https://fonts.googleapis.com">
      <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
      <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 1200px; height: 1200px;
          font-family: 'Be Vietnam Pro', -apple-system, sans-serif;
          background: #E2E8F0;
          display: flex; align-items: center; justify-content: center;
          padding: 40px; -webkit-font-smoothing: antialiased;
        }
        .geo-card {
          width: 1120px; height: 1120px; background: #FFFFFF;
          border-radius: 32px; overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 25px 60px rgba(0,0,0,0.1); border: 2px solid #CBD5E1;
        }
        .header-stripe {
          background: ${theme.primary}; height: 84px; display: flex;
          align-items: center; justify-content: space-between; padding: 0 44px;
        }
        .stripe-brand { font-size: 22px; font-weight: 900; color: #FFFFFF; letter-spacing: -0.5px; }
        .stripe-badge {
          background: #FFFFFF; color: ${theme.primary};
          padding: 8px 20px; border-radius: 10px; font-size: 13px; font-weight: 900; text-transform: uppercase;
        }
        .content-body { flex: 1; padding: 36px 44px; display: flex; flex-direction: column; justify-content: space-between; }
        .top-info { }
        .cat-tag-geo {
          display: inline-block; background: ${theme.lightBg}; color: ${theme.primary};
          font-size: 13px; font-weight: 800; text-transform: uppercase;
          padding: 6px 14px; border-radius: 8px; margin-bottom: 12px;
        }
        .geo-title {
          font-size: 38px; font-weight: 900; color: #0F172A; line-height: 1.25;
          display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
        }
        .geo-comp { font-size: 20px; font-weight: 600; color: #475569; margin-top: 6px; }
        .middle-photo-box {
          height: 480px; width: 100%; border-radius: 20px; overflow: hidden;
          position: relative; margin: 20px 0;
          background-image: url('${photoDataUri}');
          background-size: cover; background-position: center 25%;
          border: 1px solid #E2E8F0; box-shadow: 0 8px 24px rgba(0,0,0,0.06);
        }
        .photo-floating-pill {
          position: absolute; bottom: 20px; left: 24px;
          background: rgba(15, 23, 42, 0.9); backdrop-filter: blur(10px);
          color: #FFFFFF; padding: 10px 22px; border-radius: 12px;
          font-size: 16px; font-weight: 800; border: 1px solid rgba(255,255,255,0.2);
        }
        .bottom-spec-grid {
          display: grid; grid-template-columns: 1.4fr 1.2fr 1fr; gap: 14px;
        }
        .spec-card {
          background: #F8FAFC; border: 1.5px solid #E2E8F0; border-radius: 16px; padding: 14px 18px;
        }
        .spec-card.highlight {
          background: ${theme.lightBg}; border-color: ${theme.borderColor};
        }
        .sc-cap { font-size: 11px; font-weight: 700; color: #64748B; text-transform: uppercase; }
        .spec-card.highlight .sc-cap { color: ${theme.primary}; }
        .sc-val { font-size: 22px; font-weight: 800; color: #0F172A; margin-top: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .spec-card.highlight .sc-val { color: ${theme.primary}; }
      </style>
    </head>
    <body>
      <div class="geo-card">
        <div class="header-stripe">
          <div class="stripe-brand">JobCentral &bull; Hệ Thống Tuyển Dụng</div>
          <div class="stripe-badge">${badgeText}</div>
        </div>
        <div class="content-body">
          <div class="top-info">
            <span class="cat-tag-geo">${category}</span>
            <h1 class="geo-title">${cleanTitle}</h1>
            <p class="geo-comp">🏢 ${cleanComp}</p>
          </div>
          <div class="middle-photo-box">
            <div class="photo-floating-pill">📍 Địa điểm: ${cleanLoc}</div>
          </div>
          <div class="bottom-spec-grid">
            <div class="spec-card highlight">
              <div class="sc-cap">Mức Thu Nhập</div>
              <div class="sc-val">${cleanSal}</div>
            </div>
            <div class="spec-card">
              <div class="sc-cap">Khu Vực Làm Việc</div>
              <div class="sc-val">${cleanLoc}</div>
            </div>
            <div class="spec-card">
              <div class="sc-cap">Yêu Cầu Kinh Nghiệm</div>
              <div class="sc-val">${cleanExp}</div>
            </div>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;
  }

  /**
   * Sinh ảnh Poster cho 1 tin tuyển dụng
   */
  async generateJobPoster(job = {}, pageInfo = {}, options = {}) {
    try {
      const posterInfo = this.computePosterInfo(job, pageInfo);
      const {
        filename,
        filePath: outPath,
        imageUrl: relativeUrl
      } = posterInfo;

      if (posterInfo.exists && !options.force) {
        return {
          success: true,
          imageUrl: relativeUrl,
          filePath: outPath,
          filename,
          cached: true
        };
      }

      // Lấy ảnh thực tế Châu Á / Việt Nam tương ứng
      const photoDataUri = stockPhotoResolver.resolvePhotoDataUri(job);

      // Tạo mã HTML tương ứng với Template & Theme đồ họa được chọn
      const html = this._buildHtmlTemplate(posterInfo, photoDataUri);

      // Render bằng Puppeteer an toàn
      const browser = await this.getBrowser();
      let page = null;
      try {
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setDefaultTimeout(15000);
        await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 1.5 });
        await page.setContent(html, { waitUntil: ['domcontentloaded', 'networkidle0'], timeout: 15000 });
        await page.evaluate(async () => {
          await document.fonts.ready;
          await Promise.all([
            document.fonts.load('800 38px "Be Vietnam Pro"'),
            document.fonts.load('700 20px "Be Vietnam Pro"'),
            document.fonts.load('600 16px "Be Vietnam Pro"')
          ]).catch(() => {});
        });
        await page.screenshot({ path: outPath, type: 'png' });
      } finally {
        if (page) {
          await page.close().catch(() => {});
        }
      }

      logger.success(`[BannerGenerator] Đã tạo thành công Poster: ${filename} (Template ${posterInfo.templateIndex}, Theme: ${posterInfo.theme.id}) cho "${posterInfo.cleanTitle}"`);

      return {
        success: true,
        imageUrl: relativeUrl,
        filePath: outPath,
        filename,
        templateIndex: posterInfo.templateIndex,
        theme: posterInfo.theme.id,
        cached: false
      };

    } catch (err) {
      logger.error(`[BannerGenerator] Lỗi khi tạo Poster: ${err.message}`);
      return {
        success: false,
        error: err.message,
        imageUrl: '/uploads/1787412190105_TUY___N_D___NG__2_.png'
      };
    }
  }

  /**
   * Sinh ảnh Poster hàng loạt an toàn, tuần tự và ổn định 100%
   */
  async generateBatchJobPosters(items = [], options = {}) {
    const results = [];
    let generated = 0;
    let cached = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i++) {
      const { job, pageInfo } = items[i];
      try {
        const res = await this.generateJobPoster(job, pageInfo, options);
        if (res.cached) cached++;
        else if (res.success) generated++;
        else failed++;
        results.push(res);
      } catch (err) {
        failed++;
        results.push({ success: false, error: err.message });
      }
    }

    return {
      success: true,
      total: items.length,
      generated,
      cached,
      failed,
      results
    };
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new BannerGeneratorService();
