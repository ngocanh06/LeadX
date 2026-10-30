const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function createLightMinimalPoster() {
  const stockImgPath = path.resolve('d:/Dokumen/Làm/LeadX/data/images/stock/education.jpg');
  const imgBase64 = fs.readFileSync(stockImgPath).toString('base64');
  const dataUri = `data:image/jpeg;base64,${imgBase64}`;
  
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        width: 1200px;
        height: 1200px;
        font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
        background: #F1F5F9;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 40px;
      }

      /* Khung thẻ chính - Nền sáng sang trọng */
      .card-container {
        width: 1120px;
        height: 1120px;
        background: #FFFFFF;
        border-radius: 32px;
        border: 1px solid #E2E8F0;
        box-shadow: 0 25px 60px rgba(15, 23, 42, 0.08);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* Phần ảnh chụp thật thực tế (Chiếm ~64% chiều cao) */
      .photo-section {
        position: relative;
        height: 720px;
        width: 100%;
        background-image: url('${dataUri}');
        background-size: cover;
        background-position: center center;
      }

      /* Gradient phủ tinh tế */
      .photo-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, rgba(15, 23, 42, 0) 30%, rgba(15, 23, 42, 0) 70%, rgba(255, 255, 255, 0.9) 98%, #FFFFFF 100%);
      }

      /* Header nổi trên ảnh */
      .header-floating {
        position: absolute;
        top: 36px;
        left: 40px;
        right: 40px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 2;
      }

      .brand-pill {
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(12px);
        padding: 12px 24px;
        border-radius: 40px;
        display: flex;
        align-items: center;
        gap: 12px;
        box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
        border: 1px solid rgba(255, 255, 255, 0.8);
      }

      .brand-logo-text {
        font-size: 22px;
        font-weight: 800;
        color: #1E3A8A;
        letter-spacing: -0.5px;
      }
      .brand-dot {
        width: 8px;
        height: 8px;
        background: #2563EB;
        border-radius: 50%;
      }
      .brand-tagline {
        font-size: 13px;
        font-weight: 600;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .status-pill {
        background: #EF4444;
        color: #FFFFFF;
        padding: 12px 24px;
        border-radius: 40px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        box-shadow: 0 6px 18px rgba(239, 68, 68, 0.35);
      }

      /* Phần thông tin công việc - Nền sáng, thoáng, ít chữ (Chiếm ~36%) */
      .info-section {
        position: relative;
        flex: 1;
        background: #FFFFFF;
        padding: 24px 44px 34px 44px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        z-index: 2;
      }

      .info-top {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .category-row {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 14px;
        font-weight: 700;
        color: #2563EB;
        text-transform: uppercase;
        letter-spacing: 1.5px;
      }

      .job-title {
        font-size: 42px;
        font-weight: 800;
        color: #0F172A;
        line-height: 1.25;
        letter-spacing: -0.5px;
      }

      .company-name {
        font-size: 20px;
        font-weight: 600;
        color: #64748B;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Hàng thông tin tóm tắt cốt lõi: Lương & Nơi làm việc */
      .highlights-row {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 8px;
      }

      .badge-salary {
        background: #EFF6FF;
        border: 1.5px solid #BFDBFE;
        color: #1D4ED8;
        padding: 12px 24px;
        border-radius: 14px;
        font-size: 24px;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .badge-detail {
        background: #F8FAFC;
        border: 1.5px solid #E2E8F0;
        color: #334155;
        padding: 12px 20px;
        border-radius: 14px;
        font-size: 19px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Footer siêu tinh tế */
      .footer-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid #F1F5F9;
        padding-top: 18px;
      }

      .cta-text {
        font-size: 16px;
        font-weight: 700;
        color: #2563EB;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .channel-link {
        font-size: 15px;
        font-weight: 600;
        color: #94A3B8;
      }
    </style>
  </head>
  <body>
    <div class="card-container">
      <!-- 1. Bức ảnh chụp thực tế môi trường làm việc / nghề nghiệp -->
      <div class="photo-section">
        <div class="photo-overlay"></div>
        <div class="header-floating">
          <div class="brand-pill">
            <span class="brand-logo-text">JobCentral</span>
            <div class="brand-dot"></div>
            <span class="brand-tagline">Tuyển Dụng Toàn Quốc</span>
          </div>
          <div class="status-pill">🔥 Tuyển Dụng Gấp</div>
        </div>
      </div>

      <!-- 2. Khung thông tin nền sáng, tối giản, rõ ràng -->
      <div class="info-section">
        <div class="info-top">
          <div class="category-row">
            <span>● Giáo Dục &amp; Tin Học</span>
          </div>
          <h1 class="job-title">NHÂN VIÊN QUẢN LÝ CHUYÊN MÔN TIN HỌC</h1>
          <div class="company-name">
            🏢 CÔNG TY CỔ PHẦN TRUNG TÂM ANH NGỮ GEMS
          </div>
        </div>

        <!-- 3. Chỉ đưa các thông số cốt lõi nhất -->
        <div class="highlights-row">
          <div class="badge-salary">
            <span>💰 10 - 18 Triệu</span>
          </div>
          <div class="badge-detail">
            <span>📍 TP. Hồ Chí Minh</span>
          </div>
          <div class="badge-detail">
            <span>🎯 2 Năm Kinh Nghiệm</span>
          </div>
        </div>

        <!-- 4. Footer gọn gàng -->
        <div class="footer-row">
          <div class="cta-text">
            <span>👉 Inbox Fanpage để ứng tuyển &amp; nhận lịch phỏng vấn</span>
          </div>
          <div class="channel-link">
            facebook.com/JobCentralVietNam
          </div>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  console.log('Rendering light minimalist poster with base64 real photo...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  const outPath = path.resolve('d:/Dokumen/Làm/LeadX/data/images/sample_light_minimal_poster.png');
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  console.log('Light minimal poster generated at:', outPath);
}

createLightMinimalPoster().catch(console.error);
