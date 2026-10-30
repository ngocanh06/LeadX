const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const outDir = path.resolve(__dirname, 'data/images/stock');

function getBase64(filename) {
  const p = path.join(outDir, filename);
  if (fs.existsSync(p)) {
    return `data:image/jpeg;base64,${fs.readFileSync(p).toString('base64')}`;
  }
  return '';
}

const BRANDS = [
  {
    id: 'brand_fe_credit.jpg',
    name: 'FE CREDIT',
    sub: 'CÔNG TY TÀI CHÍNH TNHH MTV NGÂN HÀNG VIỆT NAM THỊNH VƯỢNG',
    slogan: 'Vay Tiêu Dùng - Đơn Giản & Nhanh Chóng',
    primaryColor: '#008744',
    accentColor: '#D62D20',
    localBg: 'facility_bank_modern_lobby.jpg'
  },
  {
    id: 'brand_mbbank.jpg',
    name: 'MBBANK',
    sub: 'NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN QUÂN ĐỘI',
    slogan: 'Vững Bước Tương Lai - Ngân Hàng Số Dẫn Đầu',
    primaryColor: '#002B7F',
    accentColor: '#D81B60',
    localBg: 'facility_bank_trading_floor.jpg'
  },
  {
    id: 'brand_vpbank.jpg',
    name: 'VPBANK',
    sub: 'NGÂN HÀNG TMCP VIỆT NAM THỊNH VƯỢNG',
    slogan: 'Vì Một Việt Nam Thịnh Vượng',
    primaryColor: '#00965E',
    accentColor: '#EF4444',
    localBg: 'facility_financial_tower_dusk.jpg'
  },
  {
    id: 'brand_techcombank.jpg',
    name: 'TECHCOMBANK',
    sub: 'NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN KỸ THƯƠNG VIỆT NAM',
    slogan: 'Vượt Trội Hơn Mỗi Ngày',
    primaryColor: '#E11B22',
    accentColor: '#1F2937',
    localBg: 'facility_executive_boardroom.jpg'
  },
  {
    id: 'brand_hdsaison.jpg',
    name: 'HD SAISON',
    sub: 'CÔNG TY TÀI CHÍNH TNHH HD SAISON',
    slogan: 'Thỏa Mãn Mọi Ước Mơ Tiêu Dùng',
    primaryColor: '#F59E0B',
    accentColor: '#DC2626',
    localBg: 'facility_financial_tower_dusk.jpg'
  },
  {
    id: 'brand_hdbank.jpg',
    name: 'HDBANK',
    sub: 'NGÂN HÀNG TMCP PHÁT TRIỂN TP. HỒ CHÍ MINH',
    slogan: 'Cam Kết Vì Lợi Ích Cao Nhất Cho Khách Hàng',
    primaryColor: '#DC2626',
    accentColor: '#FBBF24',
    localBg: 'facility_bank_modern_lobby.jpg'
  },
  {
    id: 'brand_mirae_asset.jpg',
    name: 'MIRAE ASSET',
    sub: 'CÔNG TY TÀI CHÍNH TNHH MTV MIRAE ASSET (VIỆT NAM)',
    slogan: 'Tập Đoàn Quản Lý Tài Sản & Tài Chính Toàn Cầu',
    primaryColor: '#003366',
    accentColor: '#FF6600',
    localBg: 'facility_financial_tower_dusk.jpg'
  },
  {
    id: 'brand_fpt.jpg',
    name: 'FPT CORPORATION',
    sub: 'TẬP ĐOÀN CÔNG NGHỆ FPT',
    slogan: 'Kiến Tạo Hạnh Phúc - Tiên Phong Chuyển Đổi Số',
    primaryColor: '#F37021',
    accentColor: '#0083D6',
    localBg: 'facility_it_server_datacenter.jpg'
  },
  {
    id: 'brand_misa.jpg',
    name: 'MISA',
    sub: 'CÔNG TY CỔ PHẦN MISA',
    slogan: 'Phần Mềm Quản Trị Doanh Nghiệp Hàng Đầu',
    primaryColor: '#0070BA',
    accentColor: '#10B981',
    localBg: 'facility_office_coworking_bright.jpg'
  },
  {
    id: 'brand_bcons.jpg',
    name: 'BCONS GROUP',
    sub: 'CÔNG TY CỔ PHẦN ĐẦU TƯ XÂY DỰNG BCONS',
    slogan: 'Khác Biệt Ở Chữ Tín - Bất Động Sản Vững Bền',
    primaryColor: '#1E3A8A',
    accentColor: '#D97706',
    localBg: 'facility_real_estate_luxury_apartments.jpg'
  },
  {
    id: 'brand_shopee.jpg',
    name: 'SHOPEE / SPX EXPRESS',
    sub: 'NỀN TẢNG THƯƠNG MẠI ĐIỆN TỬ & GIAO VẬN HÀNG ĐẦU',
    slogan: 'Giao Hàng Siêu Tốc - Mua Sắm Dễ Dàng',
    primaryColor: '#EE4D2D',
    accentColor: '#FB923C',
    localBg: 'facility_logistics_hub_warehouse.jpg'
  },
  {
    id: 'brand_viettel.jpg',
    name: 'VIETTEL POST',
    sub: 'TỔNG CÔNG TY CỔ PHẦN BƯU CHÍNH VIETTEL',
    slogan: 'Đi Sâu Đi Xa Để Gắn Kết Con Người',
    primaryColor: '#D92D20',
    accentColor: '#1E293B',
    localBg: 'facility_delivery_fleet_van.jpg'
  },
  {
    id: 'brand_mwg.jpg',
    name: 'THẾ GIỚI DI ĐỘNG / BÁCH HÓA XANH',
    sub: 'CÔNG TY CỔ PHẦN ĐẦU TƯ THẾ GIỚI DI ĐỘNG (MWG)',
    slogan: 'Tận Tâm Phục Vụ Khách Hàng Toàn Quốc',
    primaryColor: '#EAB308',
    accentColor: '#15803D',
    localBg: 'facility_retail_convenience_store_bright.jpg'
  },
  {
    id: 'brand_winmart.jpg',
    name: 'WINMART / MASAN CONSUMER',
    sub: 'HỆ THỐNG BÁN LẺ WINCOMMERCE - TẬP ĐOÀN MASAN',
    slogan: 'Tươi Ngon Thượng Hạng Cho Mọi Gia Đình Việt',
    primaryColor: '#DC2626',
    accentColor: '#059669',
    localBg: 'facility_supermarket_shelves_fresh.jpg'
  },
  {
    id: 'brand_shinhan.jpg',
    name: 'SHINHAN VIETNAM',
    sub: 'NGÂN HÀNG TNHH MTV SHINHAN VIỆT NAM',
    slogan: 'Ngân Hàng Tài Chính Toàn Cầu Từ Hàn Quốc',
    primaryColor: '#0046FF',
    accentColor: '#0284C7',
    localBg: 'facility_financial_tower_dusk.jpg'
  }
];

async function generateBrandBanners() {
  console.log(`Đang tạo ${BRANDS.length} background thương hiệu từ ảnh cơ sở vật chất cục bộ...`);
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1200, height: 700 });

  for (const b of BRANDS) {
    const dest = path.join(outDir, b.id);
    const bgDataUri = getBase64(b.localBg);

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@600;700;800;900&display=swap" rel="stylesheet">
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
          width: 1200px; height: 700px;
          font-family: 'Be Vietnam Pro', sans-serif;
          background: #0f172a;
          overflow: hidden; position: relative;
        }
        .bg-img {
          position: absolute; inset: 0;
          background-image: url('${bgDataUri}');
          background-size: cover; background-position: center 30%;
          filter: brightness(0.65) contrast(1.1);
        }
        .overlay {
          position: absolute; inset: 0;
          background: linear-gradient(180deg, rgba(15,23,42,0.3) 0%, rgba(15,23,42,0.65) 100%);
        }
        .center-brand {
          position: absolute; top: 48%; left: 50%; transform: translate(-50%, -50%);
          display: flex; flex-direction: column; align-items: center; text-align: center;
          width: 880px; padding: 34px 44px;
          background: rgba(255, 255, 255, 0.95);
          backdrop-filter: blur(16px);
          border-radius: 28px;
          border: 2px solid rgba(255, 255, 255, 0.85);
          box-shadow: 0 20px 50px rgba(0, 0, 0, 0.35);
        }
        .brand-badge {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 6px 18px; border-radius: 30px;
          background: ${b.primaryColor}; color: #ffffff;
          font-size: 13px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;
          margin-bottom: 12px;
        }
        .brand-name {
          font-size: 42px; font-weight: 900; color: #0F172A;
          letter-spacing: -0.5px; line-height: 1.15;
          margin-bottom: 8px;
        }
        .brand-sub {
          font-size: 13.5px; font-weight: 700; color: #475569;
          text-transform: uppercase; letter-spacing: 0.5px;
          margin-bottom: 10px; max-width: 780px; line-height: 1.35;
        }
        .brand-slogan {
          font-size: 15.5px; font-weight: 700; color: ${b.accentColor};
          font-style: italic;
        }
      </style>
    </head>
    <body>
      <div class="bg-img"></div>
      <div class="overlay"></div>
      <div class="center-brand">
        <div class="brand-badge">🏢 DOANH NGHIỆP TUYỂN DỤNG</div>
        <div class="brand-name">${b.name}</div>
        <div class="brand-sub">${b.sub}</div>
        <div class="brand-slogan">"${b.slogan}"</div>
      </div>
    </body>
    </html>
    `;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });
    await page.screenshot({ path: dest, type: 'jpeg', quality: 90 });
    console.log(`✅ [TẠO XONG BRAND] ${b.id} (${b.name})`);
  }

  await browser.close();
  console.log('🎉 Hoàn tất sinh toàn bộ 15 Brand Backgrounds!');
}

generateBrandBanners().catch(console.error);
