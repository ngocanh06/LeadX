const fs = require('fs');
const path = require('path');
const axios = require('axios');

const stockDir = path.resolve(__dirname, 'data/images/stock');
if (!fs.existsSync(stockDir)) {
  fs.mkdirSync(stockDir, { recursive: true });
}

// Danh sách các ảnh cơ sở vật chất, máy móc, kiến trúc, văn phòng, nhà xưởng, ngân hàng, siêu thị, cafe, công nghệ
const PHOTO_MANIFEST = [
  // === 1. NGÂN HÀNG, TÀI CHÍNH & TÒA NHÀ TRỤ SỞ DOANH NGHIỆP ===
  {
    name: 'facility_bank_financial_center.jpg',
    url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80',
    desc: 'Tòa nhà kiến trúc tài chính cao cấp hiện đại'
  },
  {
    name: 'facility_bank_modern_lobby.jpg',
    url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1200&q=80',
    desc: 'Sảnh giao dịch ngân hàng / văn phòng tập đoàn rộng lớn'
  },
  {
    name: 'facility_financial_tower_dusk.jpg',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    desc: 'Tòa nhà chọc trời kính xanh thương mại hiện đại'
  },
  {
    name: 'facility_bank_trading_floor.jpg',
    url: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&w=1200&q=80',
    desc: 'Bảng điện tử thị trường tài chính / phân tích tài chính'
  },
  {
    name: 'facility_executive_boardroom.jpg',
    url: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=1200&q=80',
    desc: 'Phòng họp hội đồng quản trị cao cấp kính tràn'
  },

  // === 2. BẤT ĐỘNG SẢN & KIẾN TRÚC ĐÔ THỊ ===
  {
    name: 'facility_real_estate_luxury_apartments.jpg',
    url: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?auto=format&fit=crop&w=1200&q=80',
    desc: 'Khu căn hộ cao tầng bất động sản hiện đại'
  },
  {
    name: 'facility_architecture_blueprints_model.jpg',
    url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?auto=format&fit=crop&w=1200&q=80',
    desc: 'Bản vẽ kỹ thuật kiến trúc xây dựng và mô hình công trình'
  },
  {
    name: 'facility_urban_modern_complex.jpg',
    url: 'https://images.unsplash.com/photo-1486325212027-8081e485255e?auto=format&fit=crop&w=1200&q=80',
    desc: 'Tổ hợp dự án đô thị và tòa tháp căn hộ'
  },
  {
    name: 'facility_construction_cranes_site.jpg',
    url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186c5f7?auto=format&fit=crop&w=1200&q=80',
    desc: 'Đại công trường xây dựng với cần trục tháp hiện đại'
  },

  // === 3. NHÀ MÁY, CÔNG XƯỞNG, DÂY CHUYỀN SẢN XUẤT, CƠ KHÍ & ROBOTICS ===
  {
    name: 'facility_factory_automated_robotics.jpg',
    url: 'https://images.unsplash.com/photo-1581092160607-ee22621dd758?auto=format&fit=crop&w=1200&q=80',
    desc: 'Dây chuyền cánh tay robot tự động hóa công nghiệp'
  },
  {
    name: 'facility_factory_clean_production.jpg',
    url: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?auto=format&fit=crop&w=1200&q=80',
    desc: 'Nhà máy sản xuất công nghệ cao sạch đẹp hiện đại'
  },
  {
    name: 'facility_machinery_cnc_steel.jpg',
    url: 'https://images.unsplash.com/photo-1504917599217-d4dc5ebe6122?auto=format&fit=crop&w=1200&q=80',
    desc: 'Máy tiện CNC gia công cơ khí chính xác'
  },
  {
    name: 'facility_industrial_solar_energy.jpg',
    url: 'https://images.unsplash.com/photo-1509391365360-2e959784a276?auto=format&fit=crop&w=1200&q=80',
    desc: 'Hệ thống hạ tầng năng lượng công nghiệp'
  },
  {
    name: 'facility_plant_manufacturing_hall.jpg',
    url: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?auto=format&fit=crop&w=1200&q=80',
    desc: 'Nhà xưởng sản xuất quy mô lớn'
  },

  // === 4. KHO VẬN, LOGISTICS & CẢNG BIỂN, ĐỘI XE GIAO VẬN ===
  {
    name: 'facility_logistics_hub_warehouse.jpg',
    url: 'https://images.unsplash.com/photo-1553413077-190dd305871c?auto=format&fit=crop&w=1200&q=80',
    desc: 'Trung tâm chia chọn logistics và kho bãi hiện đại'
  },
  {
    name: 'facility_warehouse_high_racks.jpg',
    url: 'https://images.unsplash.com/photo-1587293852726-70cdb56c2866?auto=format&fit=crop&w=1200&q=80',
    desc: 'Hàng kệ kho chứa pallet cao tầng chuyên nghiệp'
  },
  {
    name: 'facility_shipping_container_port.jpg',
    url: 'https://images.unsplash.com/photo-1578575437130-527eed3abbec?auto=format&fit=crop&w=1200&q=80',
    desc: 'Cảng biển container xuất nhập khẩu quốc tế'
  },
  {
    name: 'facility_delivery_fleet_van.jpg',
    url: 'https://images.unsplash.com/photo-1519003722824-194d4455a60c?auto=format&fit=crop&w=1200&q=80',
    desc: 'Đội xe vận tải giao hàng bưu cục'
  },

  // === 5. BÁN LẺ, SIÊU THỊ, TRUNG TÂM THƯƠNG MẠI & SHOWROOM ===
  {
    name: 'facility_retail_mall_modern.jpg',
    url: 'https://images.unsplash.com/photo-1519567241046-7f570eee3ce6?auto=format&fit=crop&w=1200&q=80',
    desc: 'Không gian trung tâm thương mại mua sắm hiện đại'
  },
  {
    name: 'facility_supermarket_shelves_fresh.jpg',
    url: 'https://images.unsplash.com/photo-1578916171728-46686eac8d58?auto=format&fit=crop&w=1200&q=80',
    desc: 'Kệ hàng hóa siêu thị thực phẩm tươi sạch'
  },
  {
    name: 'facility_retail_convenience_store_bright.jpg',
    url: 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?auto=format&fit=crop&w=1200&q=80',
    desc: 'Cửa hàng tiện lợi / siêu thị mini phong cách hiện đại'
  },
  {
    name: 'facility_car_showroom_luxury.jpg',
    url: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?auto=format&fit=crop&w=1200&q=80',
    desc: 'Showroom trưng bày xe ô tô cao cấp'
  },

  // === 6. F&B, CAFE, NHÀ HÀNG & KHÁCH SẠN ===
  {
    name: 'facility_cafe_modern_aesthetic.jpg',
    url: 'https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?auto=format&fit=crop&w=1200&q=80',
    desc: 'Quầy bar cafe phong cách hiện đại ấm cúng'
  },
  {
    name: 'facility_restaurant_interior_warm.jpg',
    url: 'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=1200&q=80',
    desc: 'Không gian nội thất nhà hàng sang trọng'
  },
  {
    name: 'facility_coffee_espresso_machine.jpg',
    url: 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80',
    desc: 'Máy pha cafe espresso chuyên nghiệp và hạt cafe'
  },
  {
    name: 'facility_hotel_lobby_luxury.jpg',
    url: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=1200&q=80',
    desc: 'Sảnh đón khách sạn 5 sao cao cấp'
  },

  // === 7. CÔNG NGHỆ THÔNG TIN, IT, SERVER & KHÔNG GIAN LẬP TRÌNH ===
  {
    name: 'facility_it_server_datacenter.jpg',
    url: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&w=1200&q=80',
    desc: 'Hệ thống tủ server rack trung tâm dữ liệu data center'
  },
  {
    name: 'facility_it_multimonitor_desk.jpg',
    url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=1200&q=80',
    desc: 'Bàn làm việc công nghệ màn hình đôi và bàn phím cơ'
  },
  {
    name: 'facility_it_cyber_network.jpg',
    url: 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&w=1200&q=80',
    desc: 'Mạng lưới công nghệ số và an ninh mạng'
  },
  {
    name: 'facility_it_circuit_tech_microchip.jpg',
    url: 'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80',
    desc: 'Vi mạch bán dẫn và bo mạch điện tử công nghệ cao'
  },

  // === 8. VĂN PHÒNG, HÀNH CHÍNH & KHÔNG GIAN LÀM VIỆC SÁNG TẠO ===
  {
    name: 'facility_office_coworking_bright.jpg',
    url: 'https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80',
    desc: 'Không gian văn phòng mở sáng sủa hiện đại'
  },
  {
    name: 'facility_office_meeting_pod.jpg',
    url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1200&q=80',
    desc: 'Khu vực làm việc nhóm và thảo luận năng động'
  },
  {
    name: 'facility_office_minimal_desk.jpg',
    url: 'https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=1200&q=80',
    desc: 'Bàn làm việc văn phòng tối giản thanh lịch'
  },
  {
    name: 'facility_office_glass_atrium.jpg',
    url: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1200&q=80',
    desc: 'Kiến trúc văn phòng giếng trời kính hiện đại'
  },

  // === 9. GIÁO DỤC, ĐÀO TẠO & PHÒNG HỌP HỘI NGHỊ ===
  {
    name: 'facility_education_university_library.jpg',
    url: 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?auto=format&fit=crop&w=1200&q=80',
    desc: 'Thư viện đại học hiện đại khang trang'
  },
  {
    name: 'facility_education_conference_auditorium.jpg',
    url: 'https://images.unsplash.com/photo-1475721027785-f74eccf877e2?auto=format&fit=crop&w=1200&q=80',
    desc: 'Hội trường đào tạo hội nghị chuyên nghiệp'
  },
  {
    name: 'facility_education_classroom_hightech.jpg',
    url: 'https://images.unsplash.com/photo-1580582932707-520aed937b7b?auto=format&fit=crop&w=1200&q=80',
    desc: 'Không gian lớp học đào tạo hiện đại'
  },

  // === 10. Y TẾ, DƯỢC PHẨM & PHÒNG THÍ NGHIỆM ===
  {
    name: 'facility_medical_modern_clinic.jpg',
    url: 'https://images.unsplash.com/photo-1519494026892-80bbd2d6fd0d?auto=format&fit=crop&w=1200&q=80',
    desc: 'Không gian phòng khám y tế hiện đại sạch sẽ'
  },
  {
    name: 'facility_medical_laboratory_research.jpg',
    url: 'https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?auto=format&fit=crop&w=1200&q=80',
    desc: 'Phòng thí nghiệm nghiên cứu vi sinh hóa dược'
  }
];

async function downloadAll() {
  console.log(`Bắt đầu tải ${PHOTO_MANIFEST.length} ảnh cơ sở vật chất, kiến trúc & thiết bị đa ngành...`);
  let successCount = 0;
  for (const item of PHOTO_MANIFEST) {
    const dest = path.join(stockDir, item.name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 20000) {
      console.log(`⏩ [ĐÃ CÓ] ${item.name}`);
      successCount++;
      continue;
    }
    try {
      const res = await axios.get(item.url, { responseType: 'arraybuffer', timeout: 20000 });
      fs.writeFileSync(dest, res.data);
      console.log(`✅ [TẢI XONG] ${item.name} (${Math.round(res.data.length / 1024)} KB) - ${item.desc}`);
      successCount++;
    } catch (err) {
      console.error(`❌ [LỖI] Không tải được ${item.name}: ${err.message}`);
    }
  }
  console.log(`\n🎉 Hoàn tất! Đã có ${successCount}/${PHOTO_MANIFEST.length} ảnh cơ sở vật chất mới.`);
}

downloadAll();
