const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function createCleanHumanPoster() {
  const stockImgPath = path.resolve('d:/Dokumen/Làm/LeadX/data/images/stock/education_asian.jpg');
  const imgBase64 = fs.readFileSync(stockImgPath).toString('base64');
  const dataUri = `data:image/jpeg;base64,${imgBase64}`;
  
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700&display=swap');
      
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

      /* Khung thẻ chính - Nền sáng sang trọng chuẩn Agency Graphic Design */
      .card-container {
        width: 1120px;
        height: 1120px;
        background: #FFFFFF;
        border-radius: 28px;
        border: 1px solid #E2E8F0;
        box-shadow: 0 20px 50px rgba(15, 23, 42, 0.06);
        overflow: hidden;
        display: flex;
        flex-direction: column;
      }

      /* Phần ảnh chụp thật thực tế (Chiếm ~62% chiều cao) */
      .photo-section {
        position: relative;
        height: 690px;
        width: 100%;
        background-image: url('${dataUri}');
        background-size: cover;
        background-position: center center;
      }

      /* Gradient phủ nhẹ nhàng tự nhiên */
      .photo-overlay {
        position: absolute;
        inset: 0;
        background: linear-gradient(180deg, rgba(15, 23, 42, 0.45) 0%, rgba(15, 23, 42, 0) 25%, rgba(15, 23, 42, 0) 65%, rgba(255, 255, 255, 0.85) 96%, #FFFFFF 100%);
      }

      /* Header nổi trên ảnh - Tinh tế, KHÔNG EMOJI */
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

      .brand-box {
        display: flex;
        align-items: center;
        gap: 12px;
        background: rgba(255, 255, 255, 0.95);
        backdrop-filter: blur(10px);
        padding: 10px 22px;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.6);
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
      }

      .brand-title {
        font-size: 20px;
        font-weight: 800;
        color: #0F172A;
        letter-spacing: -0.5px;
      }
      .brand-sep {
        width: 1px;
        height: 16px;
        background: #CBD5E1;
      }
      .brand-sub {
        font-size: 13px;
        font-weight: 600;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .tag-urgent {
        background: #DC2626;
        color: #FFFFFF;
        padding: 10px 20px;
        border-radius: 10px;
        font-size: 14px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        box-shadow: 0 4px 14px rgba(220, 38, 38, 0.3);
      }

      /* Phần thông tin công việc - Nền sáng, typography chuẩn, KHÔNG EMOJI */
      .info-section {
        position: relative;
        flex: 1;
        background: #FFFFFF;
        padding: 30px 48px 36px 48px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        z-index: 2;
      }

      .info-main {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .category-label {
        font-size: 13px;
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
        font-size: 19px;
        font-weight: 600;
        color: #64748B;
        margin-top: 2px;
      }

      /* Bảng thông số kỹ thuật tối giản (Thu nhập, Địa điểm, Kinh nghiệm) */
      .meta-grid {
        display: grid;
        grid-template-columns: 1.3fr 1.1fr 1fr;
        gap: 16px;
        margin-top: 14px;
      }

      .meta-item {
        background: #F8FAFC;
        border: 1px solid #E2E8F0;
        border-radius: 14px;
        padding: 14px 20px;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .meta-item.highlight {
        background: #EFF6FF;
        border-color: #BFDBFE;
      }

      .meta-caption {
        font-size: 12px;
        font-weight: 600;
        color: #64748B;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }

      .meta-item.highlight .meta-caption {
        color: #2563EB;
      }

      .meta-value {
        font-size: 24px;
        font-weight: 800;
        color: #0F172A;
        line-height: 1.2;
      }

      .meta-item.highlight .meta-value {
        color: #1D4ED8;
      }

      /* Footer chuẩn Human Graphic Design */
      .footer-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid #F1F5F9;
        padding-top: 20px;
      }

      .cta-label {
        font-size: 15px;
        font-weight: 600;
        color: #334155;
      }

      .cta-action {
        color: #2563EB;
        font-weight: 700;
      }

      .contact-text {
        font-size: 14px;
        font-weight: 600;
        color: #94A3B8;
        letter-spacing: 0.2px;
      }
    </style>
  </head>
  <body>
    <div class="card-container">
      <!-- 1. Bức ảnh chụp thật thực tế của môi trường công việc -->
      <div class="photo-section">
        <div class="photo-overlay"></div>
        <div class="header-floating">
          <div class="brand-box">
            <span class="brand-title">JobCentral</span>
            <div class="brand-sep"></div>
            <span class="brand-sub">Hệ Thống Tuyển Dụng</span>
          </div>
          <div class="tag-urgent">Tuyển Dụng Gấp</div>
        </div>
      </div>

      <!-- 2. Khung thông tin Typography chuẩn mực, KHÔNG dùng Emoji -->
      <div class="info-section">
        <div class="info-main">
          <span class="category-label">Giáo Dục &amp; Tin Học</span>
          <h1 class="job-title">NHÂN VIÊN QUẢN LÝ CHUYÊN MÔN TIN HỌC</h1>
          <p class="company-name">CÔNG TY CỔ PHẦN TRUNG TÂM ANH NGỮ GEMS</p>
        </div>

        <!-- 3. Bảng thông số tối giản với Label & Value rõ ràng -->
        <div class="meta-grid">
          <div class="meta-item highlight">
            <span class="meta-caption">Mức Thu Nhập</span>
            <span class="meta-value">10 - 18 Triệu</span>
          </div>
          <div class="meta-item">
            <span class="meta-caption">Địa Điểm Làm Việc</span>
            <span class="meta-value">TP. Hồ Chí Minh</span>
          </div>
          <div class="meta-item">
            <span class="meta-caption">Kinh Nghiệm</span>
            <span class="meta-value">Tối thiểu 2 Năm</span>
          </div>
        </div>

        <!-- 4. Footer thanh lịch -->
        <div class="footer-bar">
          <p class="cta-label">Hình thức ứng tuyển: <span class="cta-action">Nhắn tin trực tiếp Fanpage để xếp lịch phỏng vấn</span></p>
          <span class="contact-text">facebook.com/JobCentralVietNam</span>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;

  console.log('Rendering clean human graphic design poster (ZERO EMOJIS)...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  const outPath = path.resolve('d:/Dokumen/Làm/LeadX/data/images/sample_clean_human_poster.png');
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  console.log('Clean human poster generated at:', outPath);
}

createCleanHumanPoster().catch(console.error);
