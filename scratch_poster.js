const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

async function createSampleBanner() {
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Inter:wght@400;500;600;700;800&display=swap');
      
      * {
        box-sizing: border-box;
        margin: 0;
        padding: 0;
      }
      
      body {
        width: 1200px;
        height: 1200px;
        font-family: 'Plus Jakarta Sans', 'Inter', -apple-system, sans-serif;
        background: #0A1128;
        color: #ffffff;
        position: relative;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        padding: 70px 80px;
      }

      /* Subtle geometric background elements (Corporate & Clean, NO AI) */
      .bg-glow-1 {
        position: absolute;
        top: -150px;
        right: -150px;
        width: 650px;
        height: 650px;
        background: radial-gradient(circle, rgba(37, 99, 235, 0.28) 0%, rgba(10, 17, 40, 0) 70%);
        border-radius: 50%;
        pointer-events: none;
      }
      .bg-glow-2 {
        position: absolute;
        bottom: -200px;
        left: -150px;
        width: 700px;
        height: 700px;
        background: radial-gradient(circle, rgba(14, 165, 233, 0.2) 0%, rgba(10, 17, 40, 0) 70%);
        border-radius: 50%;
        pointer-events: none;
      }
      .bg-grid {
        position: absolute;
        inset: 0;
        background-image: radial-gradient(rgba(255, 255, 255, 0.08) 1.5px, transparent 1.5px);
        background-size: 36px 36px;
        opacity: 0.7;
        pointer-events: none;
      }

      /* Header Bar */
      .header {
        position: relative;
        z-index: 2;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-bottom: 1px solid rgba(255, 255, 255, 0.12);
        padding-bottom: 35px;
      }

      .brand {
        display: flex;
        align-items: center;
        gap: 18px;
      }

      .brand-icon {
        width: 58px;
        height: 58px;
        background: linear-gradient(135deg, #2563EB, #06B6D4);
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 28px;
        color: white;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.4);
      }

      .brand-text h2 {
        font-size: 28px;
        font-weight: 800;
        letter-spacing: -0.5px;
        color: #FFFFFF;
      }
      .brand-text p {
        font-size: 13px;
        font-weight: 600;
        color: #94A3B8;
        letter-spacing: 1px;
        text-transform: uppercase;
      }

      .header-badges {
        display: flex;
        align-items: center;
        gap: 14px;
      }

      .badge-urgent {
        background: linear-gradient(135deg, #EF4444, #DC2626);
        color: white;
        padding: 10px 22px;
        border-radius: 30px;
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        display: flex;
        align-items: center;
        gap: 8px;
        box-shadow: 0 4px 16px rgba(239, 68, 68, 0.35);
      }

      .badge-location {
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #E2E8F0;
        padding: 10px 20px;
        border-radius: 30px;
        font-size: 15px;
        font-weight: 600;
        backdrop-filter: blur(10px);
      }

      /* Hero Content */
      .hero-content {
        position: relative;
        z-index: 2;
        margin: auto 0;
      }

      .category-tag {
        display: inline-block;
        font-size: 15px;
        font-weight: 700;
        color: #38BDF8;
        letter-spacing: 2px;
        text-transform: uppercase;
        margin-bottom: 20px;
      }

      .job-title {
        font-size: 52px;
        font-weight: 800;
        line-height: 1.25;
        color: #FFFFFF;
        letter-spacing: -1px;
        margin-bottom: 20px;
        max-width: 1040px;
        text-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
      }

      .company-name {
        font-size: 24px;
        font-weight: 600;
        color: #94A3B8;
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 48px;
      }

      /* Highlights Cards */
      .cards-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 24px;
      }

      .info-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 20px;
        padding: 26px 28px;
        backdrop-filter: blur(12px);
      }

      .info-card.highlight {
        background: linear-gradient(135deg, rgba(37, 99, 235, 0.3), rgba(6, 182, 212, 0.18));
        border: 1px solid rgba(56, 189, 248, 0.45);
        box-shadow: 0 8px 30px rgba(37, 99, 235, 0.25);
      }

      .card-label {
        font-size: 14px;
        font-weight: 600;
        color: #94A3B8;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 10px;
      }

      .info-card.highlight .card-label {
        color: #38BDF8;
      }

      .card-val {
        font-size: 32px;
        font-weight: 800;
        color: #FFFFFF;
        line-height: 1.2;
      }

      .info-card.highlight .card-val {
        color: #FACC15; /* Warm Gold */
      }

      /* Quick Points */
      .points-container {
        margin-top: 36px;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 18px;
        padding: 24px 30px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }

      .point-item {
        display: flex;
        align-items: center;
        gap: 14px;
        font-size: 18px;
        font-weight: 600;
        color: #E2E8F0;
      }
      .point-icon {
        width: 32px;
        height: 32px;
        border-radius: 10px;
        background: rgba(34, 197, 94, 0.15);
        color: #22C55E;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
      }

      /* Footer Bar */
      .footer {
        position: relative;
        z-index: 2;
        border-top: 1px solid rgba(255, 255, 255, 0.12);
        padding-top: 32px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .cta-box {
        display: flex;
        align-items: center;
        gap: 18px;
      }
      .cta-btn {
        background: #FFFFFF;
        color: #0A1128;
        font-size: 18px;
        font-weight: 800;
        padding: 16px 36px;
        border-radius: 14px;
        letter-spacing: -0.2px;
        box-shadow: 0 8px 24px rgba(255, 255, 255, 0.2);
      }
      .cta-note {
        font-size: 16px;
        font-weight: 500;
        color: #94A3B8;
      }

      .footer-contact {
        font-size: 17px;
        font-weight: 600;
        color: #CBD5E1;
        letter-spacing: 0.2px;
      }
    </style>
  </head>
  <body>
    <div class="bg-glow-1"></div>
    <div class="bg-glow-2"></div>
    <div class="bg-grid"></div>

    <!-- Header -->
    <div class="header">
      <div class="brand">
        <div class="brand-icon">JC</div>
        <div class="brand-text">
          <h2>JobCentral</h2>
          <p>Mạng Lưới Tuyển Dụng & Việc Làm</p>
        </div>
      </div>
      <div class="header-badges">
        <div class="badge-urgent">🔥 Tuyển Dụng Gấp</div>
        <div class="badge-location">📍 TP. Hồ Chí Minh</div>
      </div>
    </div>

    <!-- Hero Content -->
    <div class="hero-content">
      <span class="category-tag">Giáo Dục &amp; Tin Học</span>
      <h1 class="job-title">NHÂN VIÊN QUẢN LÝ CHUYÊN MÔN TIN HỌC</h1>
      <div class="company-name">
        🏢 CÔNG TY CỔ PHẦN TRUNG TÂM ANH NGỮ GEMS
      </div>

      <!-- Highlights Cards -->
      <div class="cards-grid">
        <div class="info-card highlight">
          <div class="card-label">Mức Thu Nhập</div>
          <div class="card-val">10 - 18 Triệu</div>
        </div>
        <div class="info-card">
          <div class="card-label">Kinh Nghiệm</div>
          <div class="card-val">2 Năm</div>
        </div>
        <div class="info-card">
          <div class="card-label">Thời Gian Làm Việc</div>
          <div class="card-val">Hành Chính</div>
        </div>
      </div>

      <!-- Quick Trust Points -->
      <div class="points-container">
        <div class="point-item">
          <div class="point-icon">✓</div>
          <span>Phỏng vấn &amp; Đi làm ngay</span>
        </div>
        <div class="point-item">
          <div class="point-icon">✓</div>
          <span>Chế độ &amp; Phúc lợi thỏa thuận</span>
        </div>
        <div class="point-item">
          <div class="point-icon">✓</div>
          <span>Môi trường giáo dục năng động</span>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <div class="cta-box">
        <div class="cta-btn">ỨNG TUYỂN NGAY</div>
        <span class="cta-note">👉 Comment hoặc Inbox trực tiếp Fanpage</span>
      </div>
      <div class="footer-contact">
        🌐 facebook.com/JobCentralVietNam
      </div>
    </div>
  </body>
  </html>
  `;

  console.log('Launching Puppeteer browser...');
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 1200, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  
  const outDir = path.resolve('d:/Dokumen/Làm/LeadX/data/images');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }
  const outPath = path.join(outDir, 'sample_recruitment_poster.png');
  await page.screenshot({ path: outPath, type: 'png' });
  await browser.close();
  console.log('Sample poster generated successfully at:', outPath);
}

createSampleBanner().catch(console.error);
