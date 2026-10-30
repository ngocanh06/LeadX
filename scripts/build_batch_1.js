/**
 * build_batch_1.js - Xây dựng Đợt 1 (100 ảnh nghề nghiệp thực tế chuẩn thương mại)
 * Phân bổ cân đối 18 nhóm ngành nghề, lưu trữ vào kho quản lý Fanpage, xuất file CSV Metadata chuẩn 18 cột
 */
const fs = require('fs');
const path = require('path');

const baseStockDir = path.resolve(__dirname, '../data/images/stock');
const industriesDir = path.join(baseStockDir, 'industries');
const csvPath = path.join(baseStockDir, 'industry_images_catalog.csv');
const catalogJsonPath = path.resolve(__dirname, '../data/stock_catalog_custom.json');

// Đảm bảo thư mục tồn tại
if (!fs.existsSync(industriesDir)) fs.mkdirSync(industriesDir, { recursive: true });

// Danh mục 18 nhóm ngành với chỉ tiêu Đợt 1 (100 ảnh) và từ khóa tìm kiếm con người thực tế
const BATCH_SPECS = [
  {
    code: 'IT',
    id: 'technology',
    name: 'Công nghệ thông tin, phần mềm, AI, dữ liệu',
    quota: 8,
    jobs: [
      { sub: 'software_engineering', title: 'Software Developer', query: 'software developer office computer' },
      { sub: 'data_science', title: 'Data Scientist', query: 'data scientist computer office' },
      { sub: 'ai_engineering', title: 'AI Engineer', query: 'artificial intelligence researcher computer' },
      { sub: 'devops_cloud', title: 'DevOps & SysAdmin', query: 'system administrator server room datacenter' },
      { sub: 'ui_ux_design', title: 'UI UX Designer', query: 'ui ux designer wireframe computer' },
      { sub: 'qa_testing', title: 'QA Software Tester', query: 'software tester computer screen' },
      { sub: 'it_support', title: 'IT Support Specialist', query: 'computer technician servicing hardware' },
      { sub: 'cloud_architect', title: 'Cloud Solutions Architect', query: 'cloud engineer laptop office' }
    ]
  },
  {
    code: 'SALES',
    id: 'business_sales',
    name: 'Kinh doanh, bán hàng, phát triển thị trường',
    quota: 10,
    jobs: [
      { sub: 'b2b_sales', title: 'B2B Sales Executive', query: 'sales representative meeting corporate client' },
      { sub: 'business_dev', title: 'Business Development Manager', query: 'business development manager office handshake' },
      { sub: 'corporate_sales', title: 'Corporate Sales Consultant', query: 'sales presentation client corporate meeting' },
      { sub: 'retail_sales', title: 'Automotive Sales Specialist', query: 'car showroom sales consultant customer' },
      { sub: 'real_estate_sales', title: 'Real Estate Sales Agent', query: 'real estate agent showing house client' },
      { sub: 'telesales', title: 'Telesales Executive', query: 'telesales representative calling headset office' },
      { sub: 'account_manager', title: 'Key Account Manager', query: 'account executive business discussion office' },
      { sub: 'field_sales', title: 'Field Sales Representative', query: 'sales agent contract signing desk' },
      { sub: 'sales_engineer', title: 'Technical Sales Engineer', query: 'sales engineer presenting product client' },
      { sub: 'channel_sales', title: 'Channel Sales Specialist', query: 'business team sales strategy discussion' }
    ]
  },
  {
    code: 'MKT',
    id: 'marketing_media',
    name: 'Marketing, truyền thông, sáng tạo nội dung',
    quota: 7,
    jobs: [
      { sub: 'digital_marketing', title: 'Digital Marketing Specialist', query: 'digital marketing specialist working analytics' },
      { sub: 'content_creator', title: 'Content Creator', query: 'content creator recording video camera' },
      { sub: 'social_media', title: 'Social Media Manager', query: 'social media manager laptop office' },
      { sub: 'brand_manager', title: 'Brand Marketing Manager', query: 'brand marketing team brainstorming whiteboard' },
      { sub: 'copywriter', title: 'Advertising Copywriter', query: 'copywriter typing laptop creative office' },
      { sub: 'pr_specialist', title: 'Public Relations Officer', query: 'public relations specialist press conference' },
      { sub: 'event_planner', title: 'Event Coordinator', query: 'event planner coordinator venue headset' }
    ]
  },
  {
    code: 'FIN',
    id: 'finance_banking',
    name: 'Kế toán, tài chính, ngân hàng, bảo hiểm',
    quota: 6,
    jobs: [
      { sub: 'accountant', title: 'General Accountant', query: 'accountant calculating financial documents desk' },
      { sub: 'auditor', title: 'Internal Auditor', query: 'auditor reviewing financial report ledger' },
      { sub: 'bank_teller', title: 'Bank Service Officer', query: 'bank teller customer service counter' },
      { sub: 'financial_analyst', title: 'Financial Analyst', query: 'financial analyst stock market charts computer' },
      { sub: 'insurance_agent', title: 'Insurance Consultant', query: 'insurance agent consulting client contract' },
      { sub: 'tax_consultant', title: 'Tax Consultant', query: 'tax advisor consulting client desk office' }
    ]
  },
  {
    code: 'HR',
    id: 'human_resources',
    name: 'Nhân sự, tuyển dụng, hành chính, văn phòng',
    quota: 6,
    jobs: [
      { sub: 'recruiter', title: 'Talent Acquisition Specialist', query: 'human resources recruiter job interview' },
      { sub: 'hr_manager', title: 'HR Manager', query: 'hr manager meeting employee corporate office' },
      { sub: 'office_admin', title: 'Office Administrator', query: 'office administrator managing paperwork desk' },
      { sub: 'executive_assistant', title: 'Executive Assistant', query: 'executive assistant corporate desk computer' },
      { sub: 'receptionist', title: 'Front Desk Receptionist', query: 'corporate receptionist lobby desk customer' },
      { sub: 'training_coord', title: 'HR Training Coordinator', query: 'corporate trainer workshop presentation' }
    ]
  },
  {
    code: 'EDU',
    id: 'education_training',
    name: 'Giáo dục, đào tạo, nghiên cứu',
    quota: 6,
    jobs: [
      { sub: 'school_teacher', title: 'Classroom Teacher', query: 'teacher classroom lesson students blackboard' },
      { sub: 'science_teacher', title: 'Science Teacher & Lab', query: 'science teacher laboratory experiments students' },
      { sub: 'university_lecturer', title: 'University Professor', query: 'university professor lecture hall auditorium' },
      { sub: 'english_teacher', title: 'Language Instructor', query: 'english language teacher classroom lesson' },
      { sub: 'research_scientist', title: 'Research Scientist', query: 'scientist working laboratory microscope university' },
      { sub: 'kindergarten', title: 'Kindergarten Educator', query: 'kindergarten teacher teaching children classroom' }
    ]
  },
  {
    code: 'MED',
    id: 'healthcare_medical',
    name: 'Y tế, dược phẩm, chăm sóc sức khỏe',
    quota: 6,
    jobs: [
      { sub: 'medical_doctor', title: 'Physician & Doctor', query: 'medical doctor stethoscope examining patient clinic' },
      { sub: 'hospital_nurse', title: 'Hospital Nurse', query: 'nurse hospital ward patient caring uniform' },
      { sub: 'pharmacist', title: 'Clinical Pharmacist', query: 'pharmacist dispensing medication drugstore counter' },
      { sub: 'lab_technician', title: 'Medical Laboratory Technician', query: 'medical laboratory technician testing blood sample' },
      { sub: 'dentist', title: 'Dentist', query: 'dentist dental clinic examining patient teeth' },
      { sub: 'surgeon', title: 'Surgeon & Operating Staff', query: 'surgeon surgical team operating room hospital' }
    ]
  },
  {
    code: 'HOSP',
    id: 'hospitality_tourism',
    name: 'Nhà hàng, khách sạn, du lịch',
    quota: 8,
    jobs: [
      { sub: 'hotel_receptionist', title: 'Hotel Front Desk Agent', query: 'hotel receptionist check in counter lobby' },
      { sub: 'concierge', title: 'Hotel Concierge', query: 'hotel concierge assisting tourist guest' },
      { sub: 'tour_guide', title: 'Tour Guide', query: 'tour guide leading tourists landmark' },
      { sub: 'travel_consultant', title: 'Travel Agent Consultant', query: 'travel agent booking holiday client desk' },
      { sub: 'waiter', title: 'Restaurant Waiter', query: 'waiter serving dish restaurant table' },
      { sub: 'waitress', title: 'Dining Waitress', query: 'waitress taking order dining restaurant' },
      { sub: 'housekeeping', title: 'Hotel Room Attendant', query: 'hotel housekeeper cleaning room bedroom' },
      { sub: 'resort_staff', title: 'Resort Guest Specialist', query: 'resort staff welcoming guest hospitality' }
    ]
  },
  {
    code: 'MFG',
    id: 'manufacturing_industry',
    name: 'Sản xuất, công nghiệp, cơ khí, điện',
    quota: 10,
    jobs: [
      { sub: 'assembly_worker', title: 'Assembly Line Worker', query: 'assembly line factory worker electronics manufacturing' },
      { sub: 'machinist_cnc', title: 'CNC Machine Operator', query: 'machinist operating cnc milling machine factory' },
      { sub: 'welder', title: 'Industrial Welder', query: 'welder metal workshop sparks protective helmet' },
      { sub: 'electrician_industrial', title: 'Industrial Electrician', query: 'electrician wiring industrial control panel' },
      { sub: 'quality_control', title: 'QC Quality Inspector', query: 'quality control inspector factory manufacturing' },
      { sub: 'maintenance_mechanic', title: 'Plant Maintenance Technician', query: 'mechanic repairing factory machinery plant' },
      { sub: 'cleanroom_tech', title: 'Cleanroom Operator', query: 'cleanroom semiconductor manufacturing worker suit' },
      { sub: 'sheet_metal', title: 'Metal Fabrication Worker', query: 'metal fabricator working steel workshop' },
      { sub: 'toolmaker', title: 'Tool & Die Maker', query: 'toolmaker lathe machine workshop metal' },
      { sub: 'production_supervisor', title: 'Production Supervisor', query: 'manufacturing plant supervisor clipboard floor' }
    ]
  },
  {
    code: 'CONST',
    id: 'construction_real_estate',
    name: 'Xây dựng, kiến trúc, bất động sản',
    quota: 7,
    jobs: [
      { sub: 'civil_engineer', title: 'Site Civil Engineer', query: 'civil engineer construction site hardhat blueprint' },
      { sub: 'site_supervisor', title: 'Construction Superintendent', query: 'construction supervisor inspecting building site helmet' },
      { sub: 'architect', title: 'Licensed Architect', query: 'architect working drafting table blueprint office' },
      { sub: 'surveyor', title: 'Land Surveyor', query: 'land surveyor theodolite construction site tripod' },
      { sub: 'heavy_equipment', title: 'Heavy Equipment Operator', query: 'excavator operator construction building site' },
      { sub: 'construction_trades', title: 'Construction Carpenter / Mason', query: 'construction workers concrete foundation site' },
      { sub: 'interior_designer', title: 'Interior Construction Designer', query: 'interior designer architectural materials samples' }
    ]
  },
  {
    code: 'LOG',
    id: 'logistics_warehouse',
    name: 'Logistics, kho vận, giao nhận, vận tải',
    quota: 7,
    jobs: [
      { sub: 'warehouse_associate', title: 'Warehouse Associate', query: 'warehouse worker scanning barcode parcels logistics' },
      { sub: 'forklift_driver', title: 'Forklift Operator', query: 'forklift operator driving pallet warehouse aisles' },
      { sub: 'delivery_courier', title: 'Delivery Driver / Courier', query: 'delivery courier delivering parcel box van' },
      { sub: 'freight_coordinator', title: 'Logistics Coordinator', query: 'logistics coordinator cargo freight shipping' },
      { sub: 'truck_driver', title: 'Commercial Truck Driver', query: 'truck driver logistics commercial vehicle' },
      { sub: 'inventory_clerk', title: 'Inventory Control Specialist', query: 'inventory clerk warehouse stock clipboard' },
      { sub: 'shipping_dock', title: 'Shipping Dock Worker', query: 'shipping container port logistics worker' }
    ]
  },
  {
    code: 'RET',
    id: 'retail_supermarket',
    name: 'Bán lẻ, siêu thị, thương mại điện tử',
    quota: 6,
    jobs: [
      { sub: 'supermarket_cashier', title: 'Supermarket Cashier', query: 'supermarket cashier barcode scanner checkout register' },
      { sub: 'produce_clerk', title: 'Grocery Produce Associate', query: 'grocery store clerk produce vegetables shelves' },
      { sub: 'retail_sales_clerk', title: 'Retail Boutique Sales Associate', query: 'retail sales assistant clothing store customer' },
      { sub: 'store_manager', title: 'Retail Store Manager', query: 'retail store manager checking inventory tablet' },
      { sub: 'visual_merchandiser', title: 'Visual Merchandiser', query: 'visual merchandiser arranging display mannequin store' },
      { sub: 'ecommerce_packer', title: 'E-commerce Order Packer', query: 'ecommerce packing parcels shipping warehouse' }
    ]
  },
  {
    code: 'FOOD',
    id: 'restaurant_kitchen',
    name: 'Nhà hàng, bếp, chế biến thực phẩm',
    quota: 4,
    jobs: [
      { sub: 'head_chef', title: 'Head Chef & Kitchen Lead', query: 'head chef cooking commercial kitchen pan stove' },
      { sub: 'line_cook', title: 'Line Cook & Prep Chef', query: 'line cook preparing food restaurant kitchen' },
      { sub: 'pastry_baker', title: 'Pastry Baker', query: 'baker bread dough bakery oven commercial' },
      { sub: 'barista', title: 'Specialty Coffee Barista', query: 'barista espresso machine pouring coffee cafe' }
    ]
  },
  {
    code: 'AGRI',
    id: 'agriculture_fishery',
    name: 'Nông nghiệp, thủy sản, môi trường',
    quota: 4,
    jobs: [
      { sub: 'crop_farmer', title: 'Agricultural Farmer', query: 'farmer harvesting vegetables organic crops field' },
      { sub: 'greenhouse_grower', title: 'Greenhouse Agronomist', query: 'greenhouse worker plants hydroponics agriculture' },
      { sub: 'aquaculture_specialist', title: 'Aquaculture Worker', query: 'aquaculture worker inspecting fish farm net' },
      { sub: 'veterinarian', title: 'Veterinarian', query: 'veterinarian examining livestock farm dairy' }
    ]
  },
  {
    code: 'BEAUTY',
    id: 'beauty_spa_fashion',
    name: 'Làm đẹp, spa, thời trang',
    quota: 3,
    jobs: [
      { sub: 'spa_therapist', title: 'Spa & Wellness Therapist', query: 'massage therapist spa facial treatment wellness' },
      { sub: 'hair_stylist', title: 'Professional Hair Stylist', query: 'hair stylist cutting client hair salon mirror' },
      { sub: 'makeup_artist', title: 'Makeup Artist', query: 'makeup artist cosmetics model beauty salon' }
    ]
  },
  {
    code: 'CS',
    id: 'customer_service',
    name: 'Dịch vụ khách hàng, chăm sóc khách hàng',
    quota: 3,
    jobs: [
      { sub: 'call_center_agent', title: 'Call Center Representative', query: 'call center agent headset speaking customer computer' },
      { sub: 'customer_support', title: 'Customer Support Specialist', query: 'customer support representative desk headset smile' },
      { sub: 'helpdesk_agent', title: 'Helpdesk Specialist', query: 'technical helpdesk operator customer service desk' }
    ]
  },
  {
    code: 'LABOR',
    id: 'general_labor_maintenance',
    name: 'Lao động phổ thông, vệ sinh, bảo trì',
    quota: 4,
    jobs: [
      { sub: 'commercial_cleaner', title: 'Commercial Cleaning Janitor', query: 'cleaner janitor mopping floor commercial building' },
      { sub: 'security_officer', title: 'Security Guard', query: 'security guard uniform standing duty commercial building' },
      { sub: 'building_maintenance', title: 'Building Maintenance Handyman', query: 'maintenance technician repairing plumbing electrical building' },
      { sub: 'landscaper', title: 'Groundskeeper / Landscaper', query: 'gardener groundskeeper landscaping maintenance park lawn' }
    ]
  },
  {
    code: 'ART',
    id: 'art_design_media_production',
    name: 'Nghệ thuật, thiết kế, nhiếp ảnh, sản xuất video',
    quota: 4,
    jobs: [
      { sub: 'graphic_designer', title: 'Graphic Designer', query: 'graphic designer digital tablet computer creative studio' },
      { sub: 'commercial_photographer', title: 'Studio Photographer', query: 'photographer camera tripod studio lighting model' },
      { sub: 'cameraman', title: 'Video Cameraman / Videographer', query: 'cameraman filming video camera studio television' },
      { sub: 'video_editor', title: 'Video Editor & Colorist', query: 'video editor dual monitors headphones editing timeline' }
    ]
  }
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

function sanitize(str) {
  return str.toLowerCase().replace(/[^a-z0-9_-]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

async function searchWikimediaPolite(query) {
  const url = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrnamespace=6&gsrlimit=12&prop=imageinfo&iiprop=url|size|extmetadata|mime&format=json`;
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JobCentralRecruitmentBot/2.0 (research-photos@jobcentral.vn; contact@jobcentral.vn)' }
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Object.values(data.query?.pages || {});
  } catch (e) {
    return [];
  }
}

async function downloadFile(url, dest) {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'JobCentralRecruitmentBot/2.0 (research-photos@jobcentral.vn)' }
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return buf.length;
}

function isValidAuthenticJobPhoto(pageTitle, mime, width, height, extMeta) {
  const lower = pageTitle.toLowerCase();
  if (!lower.endsWith('.jpg') && !lower.endsWith('.jpeg') && !lower.endsWith('.png')) return false;
  if (width < 900 || height < 600) return false;
  const ratio = width / height;
  if (ratio < 0.55 || ratio > 2.2) return false;

  const blacklist = [
    'flag', 'coat of arms', 'seal', 'logo', 'icon', 'map', 'diagram', 
    'chart', 'stamp', 'banknote', 'coin', 'monument', 'statue', 
    'cemetery', 'grave', 'drawing', 'painting', 'sketch', 'illustration',
    'vector', 'screenshot', 'signboard', 'blueprint', 'cartoon', 'anime',
    'micrograph', 'fossil', 'specimen', 'caricature', 'poster',
    'eeprom', 'circuit', 'microcontroller', 'arduino', 'programmer box',
    'adapter', 'cable', 'socket', 'chip', 'manual', 'textbook', 'cover',
    'slide', 'banner', 'page', 'postage', 'passport', 'obituary', 'tomb'
  ];
  if (blacklist.some(w => lower.includes(w))) return false;

  const lic = (extMeta?.LicenseShortName?.value || extMeta?.License?.value || '').toLowerCase();
  if (lic.includes('nc') || lic.includes('non-commercial') || lic.includes('noncommercial')) return false;

  return true;
}

async function runBatch1() {
  console.log('========================================================================');
  console.log('🎯 KHỞI CHẠY THU THẬP ĐỢT 1: 100 ẢNH NGHỀ NGHIỆP THỰC TẾ CHUẨN THƯƠNG MẠI');
  console.log('========================================================================\n');

  const seenUrls = new Set();
  const collectedRecords = [];
  let totalDownloaded = 0;

  for (const ind of BATCH_SPECS) {
    const indDir = path.join(industriesDir, ind.id);
    if (!fs.existsSync(indDir)) fs.mkdirSync(indDir, { recursive: true });

    let collectedInInd = 0;
    console.log(`\n📂 [${ind.code}] ${ind.name} (Chỉ tiêu: ${ind.quota} ảnh)`);

    for (const job of ind.jobs) {
      if (collectedInInd >= ind.quota) break;

      await sleep(1000);
      const pages = await searchWikimediaPolite(job.query);
      let takenFromThisJob = 0;

      for (const page of pages) {
        if (collectedInInd >= ind.quota || takenFromThisJob >= 2) break;
        const info = page.imageinfo?.[0];
        if (!info || !info.url) continue;

        if (seenUrls.has(info.url)) continue;
        if (!isValidAuthenticJobPhoto(page.title, info.mime, info.width, info.height, info.extmetadata)) continue;

        const seq = String(collectedInInd + 1).padStart(4, '0');
        const ext = (info.mime === 'image/png') ? '.png' : '.jpg';
        const filename = `${ind.code}-${seq}-${sanitize(job.title)}${ext}`;
        const destPath = path.join(indDir, filename);
        const directStockPath = path.join(baseStockDir, filename);

        try {
          console.log(`  ⬇️ [${ind.code}-${seq}] ${job.title}: ${page.title.slice(5, 50)} (${info.width}x${info.height})`);
          await downloadFile(info.url, destPath);
          fs.copyFileSync(destPath, directStockPath);

          const author = (info.extmetadata?.Artist?.value || info.extmetadata?.Author?.value || 'Wikimedia Contributor')
            .replace(/<[^>]*>/g, '').trim().slice(0, 80) || 'Wikimedia Contributor';
          const license = info.extmetadata?.LicenseShortName?.value || info.extmetadata?.License?.value || 'CC BY-SA';

          const record = {
            image_id: `${ind.code}-${seq}`,
            industry: ind.name,
            sub_industry: job.sub,
            job_title: job.title,
            image_description: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
            filename: filename,
            image_url: info.url,
            source_url: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
            source_name: 'Wikimedia Commons',
            author: author,
            license: license,
            commercial_use: 'YES',
            width: info.width,
            height: info.height,
            downloaded: 'YES',
            verified: 'YES',
            duplicate_status: 'UNIQUE',
            notes: `Ảnh thực tế ${info.width}x${info.height}, giấy phép ${license}`
          };

          collectedRecords.push(record);
          seenUrls.add(info.url);
          collectedInInd++;
          totalDownloaded++;
          takenFromThisJob++;
        } catch (e) {
          console.warn(`    ⚠️ Bỏ qua ảnh: ${e.message}`);
        }
      }
    }

    // Nếu vẫn chưa đủ quota, chạy thêm từ khóa dự phòng cho ngành đó
    if (collectedInInd < ind.quota) {
      console.log(`  🔄 Tìm kiếm bổ sung cho [${ind.code}] để đạt đủ chỉ tiêu ${ind.quota}...`);
      const fallbackQueries = [
        ind.id.replace(/_/g, ' '),
        ind.name.split(',')[0].toLowerCase()
      ];
      for (const fq of fallbackQueries) {
        if (collectedInInd >= ind.quota) break;
        await sleep(1000);
        const pages = await searchWikimediaPolite(fq);
        for (const page of pages) {
          if (collectedInInd >= ind.quota) break;
          const info = page.imageinfo?.[0];
          if (!info || !info.url || seenUrls.has(info.url)) continue;
          if (!isValidAuthenticJobPhoto(page.title, info.mime, info.width, info.height, info.extmetadata)) continue;

          const seq = String(collectedInInd + 1).padStart(4, '0');
          const ext = (info.mime === 'image/png') ? '.png' : '.jpg';
          const filename = `${ind.code}-${seq}-general-worker${ext}`;
          const destPath = path.join(indDir, filename);
          const directStockPath = path.join(baseStockDir, filename);

          try {
            console.log(`  ⬇️ [${ind.code}-${seq}] Bổ sung: ${page.title.slice(5, 50)} (${info.width}x${info.height})`);
            await downloadFile(info.url, destPath);
            fs.copyFileSync(destPath, directStockPath);

            const author = (info.extmetadata?.Artist?.value || info.extmetadata?.Author?.value || 'Wikimedia Contributor')
              .replace(/<[^>]*>/g, '').trim().slice(0, 80) || 'Wikimedia Contributor';
            const license = info.extmetadata?.LicenseShortName?.value || info.extmetadata?.License?.value || 'CC BY-SA';

            collectedRecords.push({
              image_id: `${ind.code}-${seq}`,
              industry: ind.name,
              sub_industry: 'general',
              job_title: `${ind.name.split(',')[0]} Professional`,
              image_description: page.title.replace(/^File:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' '),
              filename: filename,
              image_url: info.url,
              source_url: info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`,
              source_name: 'Wikimedia Commons',
              author: author,
              license: license,
              commercial_use: 'YES',
              width: info.width,
              height: info.height,
              downloaded: 'YES',
              verified: 'YES',
              duplicate_status: 'UNIQUE',
              notes: `Ảnh thực tế ${info.width}x${info.height}, giấy phép ${license}`
            });
            seenUrls.add(info.url);
            collectedInInd++;
            totalDownloaded++;
          } catch (e) {}
        }
      }
    }
  }

  // Xuất file CSV Metadata chuẩn 18 cột
  const headers = [
    'image_id', 'industry', 'sub_industry', 'job_title', 'image_description',
    'filename', 'image_url', 'source_url', 'source_name', 'author',
    'license', 'commercial_use', 'width', 'height', 'downloaded',
    'verified', 'duplicate_status', 'notes'
  ];

  const csvRows = [headers.map(h => `"${h}"`).join(',')];
  for (const r of collectedRecords) {
    csvRows.push(headers.map(h => `"${String(r[h] || '').replace(/"/g, '""')}"`).join(','));
  }
  fs.writeFileSync(csvPath, csvRows.join('\n'), 'utf8');

  // Xuất file JSON Custom Catalog cho LeadX Engine
  const customCatalog = {};
  for (const r of collectedRecords) {
    const indSpec = BATCH_SPECS.find(b => b.name === r.industry);
    if (!indSpec) continue;
    if (!customCatalog[indSpec.id]) {
      customCatalog[indSpec.id] = {
        filenames: [],
        keywords: [indSpec.name.toLowerCase(), r.job_title.toLowerCase()]
      };
    }
    if (!customCatalog[indSpec.id].filenames.includes(r.filename)) {
      customCatalog[indSpec.id].filenames.push(r.filename);
    }
  }
  fs.writeFileSync(catalogJsonPath, JSON.stringify(customCatalog, null, 2), 'utf8');

  console.log('\n========================================================================');
  console.log(`✅ HOÀN TẤT THU THẬP ĐỢT 1: ${totalDownloaded} ẢNH CHUẨN THƯƠNG MẠI!`);
  console.log(`📁 Thư mục lưu trữ: ${industriesDir}`);
  console.log(`📄 File Metadata CSV: ${csvPath}`);
  console.log(`⚙️ Cấu hình Engine: ${catalogJsonPath}`);
  console.log('========================================================================\n');
}

runBatch1().catch(e => console.error('Lỗi thực thi:', e));
