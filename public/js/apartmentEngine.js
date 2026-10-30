/**
 * apartmentEngine.js - Phân hệ Bất Động Sản (LeadX Real Estate Engine)
 * Bao gồm:
 * 1. Kho Căn Hộ BĐS: Tự động đồng bộ Google Sheets, phân loại Quận Đà Nẵng, quản lý tiện ích & Drive
 * 2. Quản Lý Nhóm BĐS: Quản lý danh sách Hội Nhóm BĐS Facebook theo chuẩn bên Tuyển Dụng
 * 3. Điều Khiển Đăng Bài BĐS: Xuất bản bài viết & album ảnh căn hộ tự động qua Puppeteer Stealth
 */

// =========================================================
// 1. STATE MANAGEMENT
// =========================================================

window.apartmentState = {
  apartments: [],
  stats: null,
  sheetUrl: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQYbGiYlGrwpAGOCcJxCemRLMDWIzVgTZHgrB6ZaqlJmnUp2497nE_hMXalbzM2SbYU27JL0YE_q0Rw/pub?output=csv',
  currentFilter: {
    city: 'Đà Nẵng',
    district: 'ALL',
    roomType: 'ALL',
    status: 'ALL',
    search: '',
    minPrice: '',
    maxPrice: ''
  },
  activeApartmentForPost: null
};

window.bdsGroupState = {
  groups: [],
  filteredGroups: [],
  stats: null,
  currentAccountId: 'acc_primary',
  viewMode: 'table', // 'table' | 'grid'
  filters: {
    search: '',
    province: 'ALL',
    district: 'ALL',
    membership: 'ALL',
    category: 'ALL',
    sort: 'DEFAULT'
  },
  selectedGroupIds: new Set()
};

window.bdsControllerState = {
  selectedApartment: null,
  selectedGroupIds: new Set(),
  customCaption: '',
  selectedImages: [],
  isRunning: false,
  isPaused: false,
  pollTimer: null,
  currentCampaign: null
};

// =========================================================
// 2. PHÂN HỆ: KHO CĂN HỘ BẤT ĐỘNG SẢN (APARTMENTS TAB)
// =========================================================

async function initApartmentsTab() {
  await loadApartmentSheetConfig();
  await loadApartmentsData();
}

async function loadApartmentSheetConfig() {
  try {
    const res = await fetch('/api/apartments/sheet-config');
    const data = await res.json();
    if (data.success && data.url) {
      apartmentState.sheetUrl = data.url;
      const inp = document.getElementById('bds-sheet-url-input');
      if (inp) inp.value = data.url;
    }
  } catch (e) {
    console.error('Lỗi lấy sheet config:', e);
  }
}

async function syncApartmentsFromSheet() {
  showToast('Đang Đồng Bộ', 'Đang kết nối & tải dữ liệu Căn Hộ từ Google Sheets...', 'info', 4000);
  try {
    const res = await fetch('/api/apartments/sync-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: apartmentState.sheetUrl })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đồng Bộ Thành Công!', result.message, 'success', 6000);
      await loadApartmentsData();
      if (typeof initBdsControllerTab === 'function') {
        populateBdsApartmentSelect();
      }
    } else {
      showToast('Lỗi Đồng Bộ', result.message, 'danger', 6000);
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', `Không thể đồng bộ Google Sheets: ${err.message}`, 'danger');
  }
}

function openApartmentSheetConfigModal() {
  const modal = document.getElementById('bds-sheet-config-modal');
  if (!modal) return;
  const inp = document.getElementById('bds-sheet-url-input');
  if (inp) inp.value = apartmentState.sheetUrl || '';
  modal.classList.add('active');
}

function closeApartmentSheetConfigModal() {
  const modal = document.getElementById('bds-sheet-config-modal');
  if (modal) modal.classList.remove('active');
}

async function saveApartmentSheetConfig() {
  const inp = document.getElementById('bds-sheet-url-input');
  const url = inp ? inp.value.trim() : '';
  if (!url) {
    showToast('Thiếu Link', 'Vui lòng dán link Google Sheets CSV.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/apartments/sheet-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const result = await res.json();
    if (result.success) {
      apartmentState.sheetUrl = url;
      showToast('Đã Lưu', 'Đã cập nhật liên kết Google Sheets Căn Hộ!', 'success');
      closeApartmentSheetConfigModal();
      await syncApartmentsFromSheet();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (e) {
    showToast('Lỗi Kết Nối', e.message, 'danger');
  }
}

async function loadApartmentsData() {
  const container = document.getElementById('apartments-grid-container');
  if (container) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        <i class="fa-solid fa-spinner fa-spin fa-2x"></i>
        <p style="margin-top: 10px;">Đang tải danh sách căn hộ cho thuê...</p>
      </div>
    `;
  }

  try {
    const f = apartmentState.currentFilter;
    const params = new URLSearchParams();
    if (f.city && f.city !== 'ALL') params.append('city', f.city);
    if (f.district && f.district !== 'ALL') params.append('district', f.district);
    if (f.roomType && f.roomType !== 'ALL') params.append('roomType', f.roomType);
    if (f.status && f.status !== 'ALL') params.append('status', f.status);
    if (f.search) params.append('search', f.search);
    if (f.minPrice) params.append('minPrice', f.minPrice);
    if (f.maxPrice) params.append('maxPrice', f.maxPrice);

    const res = await fetch(`/api/apartments?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      apartmentState.apartments = data.data || [];
      apartmentState.stats = data.stats || null;
      renderApartmentKpis(data.stats);
      populateDistrictFilter();
      renderApartmentCards(data.data);
    } else {
      if (container) container.innerHTML = `<div class="empty-state"><p>Lỗi: ${data.message}</p></div>`;
    }
  } catch (err) {
    console.error('[ApartmentEngine] Lỗi load dữ liệu:', err);
    if (container) container.innerHTML = `<div class="empty-state"><p>Lỗi kết nối tải dữ liệu căn hộ.</p></div>`;
  }
}

function renderApartmentKpis(stats) {
  if (!stats) return;
  const totalEl = document.getElementById('kpi-apt-total');
  const availableEl = document.getElementById('kpi-apt-available');
  const studioEl = document.getElementById('kpi-apt-studio');
  const familyEl = document.getElementById('kpi-apt-family');

  if (totalEl) totalEl.textContent = stats.total || 0;
  if (availableEl) availableEl.textContent = stats.available || 0;

  const studioCount = (stats.roomTypeStats?.['Studio'] || 0) + (stats.roomTypeStats?.['1PN'] || 0);
  if (studioEl) studioEl.textContent = studioCount;

  const familyCount = (stats.roomTypeStats?.['2PN'] || 0) + (stats.roomTypeStats?.['3PN'] || 0);
  if (familyEl) familyEl.textContent = familyCount;
}

function populateDistrictFilter() {
  const select = document.getElementById('apt-district-filter');
  if (!select) return;

  const current = apartmentState.currentFilter.district;
  const districts = ['Sơn Trà', 'Ngũ Hành Sơn', 'Hải Châu', 'Thanh Khê'];

  let opts = '<option value="ALL">-- Tất cả Quận/Huyện Đà Nẵng --</option>';
  districts.forEach(d => {
    const count = apartmentState.stats?.districtStats?.[d] || 0;
    opts += `<option value="${d}" ${d === current ? 'selected' : ''}>Quận ${d} (${count} căn)</option>`;
  });
  select.innerHTML = opts;
}

function handleApartmentFilterChange() {
  const city = document.getElementById('apt-city-filter')?.value || 'Đà Nẵng';
  const district = document.getElementById('apt-district-filter')?.value || 'ALL';
  const roomType = document.getElementById('apt-roomtype-filter')?.value || 'ALL';
  const status = document.getElementById('apt-status-filter')?.value || 'ALL';
  const search = document.getElementById('apt-search-input')?.value || '';

  apartmentState.currentFilter = {
    ...apartmentState.currentFilter,
    city,
    district,
    roomType,
    status,
    search: search.trim()
  };

  loadApartmentsData();
}

function renderApartmentCards(list) {
  const container = document.getElementById('apartments-grid-container');
  if (!container) return;

  if (!list || list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
        <i class="fa-solid fa-building-circle-xmark fa-3x" style="color: var(--text-muted); margin-bottom: 12px;"></i>
        <h3 style="font-size: 1.1rem; color: var(--text-main);">Không tìm thấy căn hộ nào khớp bộ lọc</h3>
        <p style="font-size: 0.82rem; color: var(--text-muted); margin-top: 4px;">Bấm "Đồng Bộ Google Sheets" để tải danh sách mới nhất từ bảng tính.</p>
        <button class="btn btn-primary" style="margin-top: 14px;" onclick="syncApartmentsFromSheet()">
          <i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Google Sheets Ngay
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(apt => {
    const hasImages = Array.isArray(apt.images) && apt.images.length > 0;
    const mainImg = hasImages ? apt.images[0] : '';

    const priceText = apt.price >= 1000000
      ? `${(apt.price / 1000000).toLocaleString('vi-VN')} Tr/tháng`
      : `${apt.price.toLocaleString('vi-VN')} đ/tháng`;

    const featuresHtml = (apt.features || []).slice(0, 3).map(f => `
      <span style="font-size: 0.7rem; padding: 2px 7px; border-radius: 4px; background: rgba(255,255,255,0.06); color: var(--text-muted);">
        <i class="fa-solid fa-check" style="font-size: 0.65rem; color: #10b981;"></i> ${f}
      </span>
    `).join('');

    const driveBtn = apt.driveLink && apt.driveLink.startsWith('http')
      ? `<a href="${apt.driveLink}" target="_blank" class="btn btn-sm btn-outline" style="border-color: #3b82f6; color: #60a5fa;" title="Mở thư mục ảnh Google Drive gốc"><i class="fa-brands fa-google-drive"></i> Drive</a>`
      : '';

    // Khung ảnh: Hiển thị ảnh thực tế từ Drive nếu có, hoặc placeholder thông báo Drive trống
    const imageBlock = hasImages ? `
      <div style="position: relative; height: 190px; width: 100%; overflow: hidden; background: #000; cursor: pointer;" onclick="openApartmentGalleryModal('${apt.id}')" title="Bấm để xem tất cả ${apt.images.length} ảnh thực tế">
        <img src="${mainImg}" alt="${escapeHtml(apt.title)}" style="width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" loading="lazy">
        <div style="position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; flex-wrap: wrap;">
          <span class="badge-pill warning" style="font-size: 0.72rem; font-weight: 700;">
            ${escapeHtml(apt.projectCode || 'BĐS')}
          </span>
          <span class="badge-pill info" style="font-size: 0.72rem; font-weight: 700;">
            ${apt.roomType || 'Studio'}
          </span>
          <span class="badge-pill ${apt.status === 'AVAILABLE' ? 'success' : 'warning'}" style="font-size: 0.72rem;">
            ${apt.status === 'AVAILABLE' ? 'Trống sẵn' : (apt.status === 'RESERVED' ? 'Giữ Cọc' : 'Đã Thuê')}
          </span>
        </div>
        <div style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.85); color: #34d399; font-weight: 800; font-size: 1.05rem; padding: 4px 10px; border-radius: 6px; backdrop-filter: blur(4px);">
          ${priceText}
        </div>
        <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(16, 185, 129, 0.9); color: #fff; font-size: 0.72rem; font-weight: 600; padding: 2px 8px; border-radius: 4px; display: flex; align-items: center; gap: 5px;">
          <i class="fa-solid fa-camera"></i> ${apt.images.length} ảnh thực tế
        </div>
      </div>
    ` : `
      <div style="position: relative; height: 190px; width: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; background: radial-gradient(circle at center, #1e293b 0%, #090d16 100%); border-bottom: 1px solid var(--border-color); text-align: center; padding: 16px;">
        <div style="position: absolute; top: 10px; left: 10px; display: flex; gap: 6px; flex-wrap: wrap;">
          <span class="badge-pill warning" style="font-size: 0.72rem; font-weight: 700;">
            ${escapeHtml(apt.projectCode || 'BĐS')}
          </span>
          <span class="badge-pill info" style="font-size: 0.72rem; font-weight: 700;">
            ${apt.roomType || 'Studio'}
          </span>
        </div>
        <div style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.85); color: #34d399; font-weight: 800; font-size: 1.05rem; padding: 4px 10px; border-radius: 6px;">
          ${priceText}
        </div>
        <i class="fa-brands fa-google-drive" style="font-size: 2.2rem; color: #3b82f6; margin-bottom: 8px;"></i>
        <div style="font-size: 0.8rem; font-weight: 700; color: #e2e8f0;">Chưa có ảnh trên Drive</div>
        <div style="font-size: 0.7rem; color: #64748b; margin-top: 2px;">(Thư mục Drive đang trống)</div>
        ${apt.driveLink ? `<a href="${apt.driveLink}" target="_blank" style="font-size: 0.72rem; color: #60a5fa; text-decoration: underline; margin-top: 6px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở Drive để tải ảnh lên</a>` : ''}
      </div>
    `;

    return `
      <div class="apartment-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; display: flex; flex-direction: column; transition: all 0.2s ease; box-shadow: 0 4px 15px rgba(0,0,0,0.15);">
        <!-- Khung Ảnh Thực Tế & Badge -->
        ${imageBlock}

        <!-- Nội dung -->
        <div style="padding: 16px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 0.76rem; color: #0084ff; font-weight: 600; text-transform: uppercase;">
              <span><i class="fa-solid fa-location-dot"></i> Q. ${apt.district || 'Sơn Trà'}, Đà Nẵng</span>
              <span style="color: var(--text-muted); font-size: 0.72rem;">${apt.project || ''}</span>
            </div>
            <h4 style="font-size: 0.95rem; font-weight: 700; color: var(--text-main); margin: 6px 0; line-height: 1.35; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;" title="${escapeHtml(apt.title)}">
              ${escapeHtml(apt.title)}
            </h4>
            <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 14px; margin-bottom: 10px; flex-wrap: wrap;">
              <span><i class="fa-solid fa-ruler-combined"></i> ${apt.area ? apt.area + ' m²' : '--'}</span>
              <span><i class="fa-solid fa-couch"></i> ${apt.furnitureStatus ? 'Full nội thất' : 'Cơ bản'}</span>
              <span><i class="fa-solid fa-bolt"></i> Điện: ${apt.fees?.electricity || '4k/chữ'}</span>
              <span><i class="fa-solid fa-share-nodes"></i> Đã đăng: <strong style="color: var(--primary);">${apt.postCount || 0}</strong> lần</span>
            </div>
            ${apt.note ? `<div style="font-size: 0.75rem; color: #f59e0b; margin-bottom: 8px;"><i class="fa-solid fa-tag"></i> <em>${escapeHtml(apt.note)}</em></div>` : ''}
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 14px;">
              ${featuresHtml}
            </div>
          </div>

          <!-- Footer card & Action buttons -->
          <div style="border-top: 1px solid var(--border-color); padding-top: 12px; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
            <div style="font-size: 0.76rem; color: var(--text-muted);">
              <i class="fa-solid fa-phone" style="color: #10b981;"></i> ${apt.contact?.phone || '0905123456'}
            </div>
            <div style="display: flex; gap: 6px; align-items: center;">
              ${hasImages ? `
                <button class="btn btn-sm btn-outline" style="border-color: #10b981; color: #34d399;" onclick="openApartmentGalleryModal('${apt.id}')" title="Xem ${apt.images.length} ảnh thực tế">
                  <i class="fa-solid fa-images"></i> Xem Ảnh (${apt.images.length})
                </button>
              ` : ''}
              ${driveBtn}
              <button class="btn btn-sm btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); border: none;" onclick="goToBdsController('${apt.id}')" title="Điều khiển đăng bài căn hộ này vào các Group BĐS">
                <i class="fa-solid fa-paper-plane"></i> Đăng Bài
              </button>
              <button class="btn btn-sm btn-outline" onclick="openEditApartmentModal('${apt.id}')" title="Chỉnh sửa căn hộ">
                <i class="fa-solid fa-pen"></i>
              </button>
              <button class="btn btn-sm btn-outline" style="color: var(--danger); border-color: rgba(239,68,68,0.3);" onclick="confirmDeleteApartment('${apt.id}', '${escapeHtml(apt.title)}')" title="Xóa">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// =========================================================
// LIGHTBOX GALLERY ẢNH THỰC TẾ GOOGLE DRIVE
// =========================================================

function openApartmentGalleryModal(aptId) {
  const apt = apartmentState.apartments.find(a => a.id === aptId);
  if (!apt) return;

  const modal = document.getElementById('bds-apartment-gallery-modal');
  if (!modal) return;

  const titleEl = document.getElementById('bds-gallery-modal-title');
  const subEl = document.getElementById('bds-gallery-modal-sub');
  const mainImg = document.getElementById('bds-gallery-main-img');
  const counterEl = document.getElementById('bds-gallery-img-counter');
  const thumbsContainer = document.getElementById('bds-gallery-thumbnails');
  const driveLinkEl = document.getElementById('bds-gallery-drive-link');

  const images = (apt.images || []).filter(Boolean);

  if (titleEl) {
    titleEl.innerHTML = `<i class="fa-solid fa-images text-primary"></i> [${escapeHtml(apt.projectCode)}] ${escapeHtml(apt.title)}`;
  }
  if (subEl) {
    subEl.textContent = `Thư mục Drive có ${images.length} ảnh thực tế | Vị trí: ${apt.address || apt.district}`;
  }

  if (driveLinkEl) {
    if (apt.driveLink && apt.driveLink.startsWith('http')) {
      driveLinkEl.href = apt.driveLink;
      driveLinkEl.style.display = 'inline-flex';
    } else {
      driveLinkEl.style.display = 'none';
    }
  }

  if (images.length > 0) {
    if (mainImg) mainImg.src = images[0];
    if (counterEl) counterEl.textContent = `1 / ${images.length}`;

    if (thumbsContainer) {
      thumbsContainer.innerHTML = images.map((imgUrl, idx) => `
        <div style="flex-shrink: 0; width: 72px; height: 54px; border-radius: 4px; overflow: hidden; cursor: pointer; border: 2px solid ${idx === 0 ? '#10b981' : 'transparent'};" onclick="setApartmentGalleryMainImage('${imgUrl}', ${idx + 1}, ${images.length}, this)">
          <img src="${imgUrl}" alt="Ảnh ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;">
        </div>
      `).join('');
    }
  } else {
    if (mainImg) mainImg.src = '';
    if (counterEl) counterEl.textContent = `0 / 0`;
    if (thumbsContainer) thumbsContainer.innerHTML = '<p style="color: #94a3b8; font-size: 0.8rem; padding: 10px;">Thư mục Drive này chưa có ảnh.</p>';
  }

  modal.classList.add('active');
}

function setApartmentGalleryMainImage(url, currentIdx, total, thumbEl) {
  const mainImg = document.getElementById('bds-gallery-main-img');
  const counterEl = document.getElementById('bds-gallery-img-counter');
  if (mainImg) mainImg.src = url;
  if (counterEl) counterEl.textContent = `${currentIdx} / ${total}`;

  if (thumbEl && thumbEl.parentElement) {
    Array.from(thumbEl.parentElement.children).forEach(c => {
      c.style.borderColor = 'transparent';
    });
    thumbEl.style.borderColor = '#10b981';
  }
}

function closeApartmentGalleryModal() {
  const modal = document.getElementById('bds-apartment-gallery-modal');
  if (modal) modal.classList.remove('active');
}

function goToBdsController(aptId) {
  switchTab('bds-controller-tab');
  setTimeout(() => {
    const sel = document.getElementById('bds-select-apartment');
    if (sel) {
      sel.value = aptId;
      onBdsSelectApartmentChange(aptId);
    }
  }, 200);
}

// =========================================================
// 3. PHÂN HỆ: QUẢN LÝ NHÓM BẤT ĐỘNG SẢN (BDS GROUPS TAB)
// =========================================================

async function initBdsGroupsTab() {
  populateBdsAccountSelector();
  await loadBdsGroupsData();
}

function populateBdsAccountSelector() {
  const sel = document.getElementById('bds-group-filter-account-select');
  if (!sel) return;

  const accounts = state.accounts || [];
  if (accounts.length === 0) {
    sel.innerHTML = '<option value="acc_primary">Tài Khoản Mặc Định (Nick 1)</option>';
    return;
  }

  sel.innerHTML = accounts.map(a => `
    <option value="${a.id}" ${a.id === bdsGroupState.currentAccountId ? 'selected' : ''}>
      ${a.name || a.id} (${a.uid || 'FB User'}) ${a.status === 'LIVE' ? '🟢' : '🟡'}
    </option>
  `).join('');
}

async function loadBdsGroupsData() {
  try {
    const f = bdsGroupState.filters;
    const params = new URLSearchParams();
    if (f.province && f.province !== 'ALL') params.append('province', f.province);
    if (f.district && f.district !== 'ALL') params.append('district', f.district);
    if (f.category && f.category !== 'ALL') params.append('category', f.category);
    if (f.membership && f.membership !== 'ALL') params.append('status', f.membership);
    if (f.search) params.append('search', f.search);
    params.append('accountId', bdsGroupState.currentAccountId);

    const res = await fetch(`/api/bds/groups?${params.toString()}`);
    const data = await res.json();

    if (data.success) {
      bdsGroupState.groups = data.data || [];
      bdsGroupState.stats = data.stats || null;
      renderBdsGroupKpis(data.stats);
      renderBdsGroupListing();
      updateBdsAccountBadge(data.stats);
    }
  } catch (err) {
    console.error('[BDS Group] Lỗi tải dữ liệu nhóm:', err);
  }
}

function updateBdsAccountBadge(stats) {
  const badge = document.getElementById('bds-group-account-joined-badge');
  if (!badge || !stats) return;
  badge.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> Đã vào: <strong>${stats.joinedCount || 0}</strong> / ${stats.total || 0} nhóm`;
}

function renderBdsGroupKpis(stats) {
  if (!stats) return;

  const totalEl = document.getElementById('kpi-bds-group-total');
  const danangEl = document.getElementById('kpi-bds-group-danang');
  const danangPct = document.getElementById('kpi-bds-danang-percent');
  const hcmEl = document.getElementById('kpi-bds-group-hcm');
  const otherEl = document.getElementById('kpi-bds-group-other');

  if (totalEl) totalEl.textContent = stats.total || 0;
  if (danangEl) danangEl.textContent = stats.daNangCount || 0;
  if (hcmEl) hcmEl.textContent = stats.hcmCount || 0;
  if (otherEl) otherEl.textContent = stats.otherCount || 0;

  if (danangPct && stats.total > 0) {
    const pct = Math.round((stats.daNangCount / stats.total) * 100);
    danangPct.textContent = `${pct}%`;
  }
}

function renderBdsGroupListing() {
  if (bdsGroupState.viewMode === 'table') {
    renderBdsGroupTable();
  } else {
    renderBdsGroupCards();
  }
}

function setBdsGroupViewMode(mode) {
  bdsGroupState.viewMode = mode;
  const btnTable = document.getElementById('btn-bds-view-table');
  const btnGrid = document.getElementById('btn-bds-view-grid');
  const tableCont = document.getElementById('bds-groups-table-container');
  const gridCont = document.getElementById('bds-groups-grid-container');

  if (btnTable) btnTable.classList.toggle('active', mode === 'table');
  if (btnGrid) btnGrid.classList.toggle('active', mode === 'grid');
  if (tableCont) tableCont.style.display = mode === 'table' ? 'block' : 'none';
  if (gridCont) gridCont.style.display = mode === 'grid' ? 'grid' : 'none';

  renderBdsGroupListing();
}

function renderBdsGroupTable() {
  const tbody = document.getElementById('bds-groups-table-body');
  const counter = document.getElementById('bds-group-display-counter');
  if (!tbody) return;

  const list = bdsGroupState.groups || [];
  if (counter) counter.innerHTML = `Đang hiển thị <strong>${list.length}</strong> / ${bdsGroupState.stats?.total || list.length} nhóm BĐS`;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-5" style="color: var(--text-muted);">
          <i class="fa-solid fa-users-slash fa-2x mb-2" style="opacity: 0.5;"></i>
          <p>Không có nhóm BĐS nào phù hợp với bộ lọc hiện tại.</p>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map((g, idx) => {
    const isChecked = bdsGroupState.selectedGroupIds.has(g.id);
    const statusBadge = g.isJoined
      ? `<span class="badge badge-success" style="cursor: pointer;" onclick="toggleBdsMembership('${g.id}', false)"><i class="fa-solid fa-circle-check"></i> Đã Tham Gia</span>`
      : `<span class="badge badge-secondary" style="cursor: pointer;" onclick="toggleBdsMembership('${g.id}', true)"><i class="fa-solid fa-circle-plus"></i> Chưa Vào Nhóm</span>`;

    const lastPostedText = g.lastPostedAt
      ? new Date(g.lastPostedAt).toLocaleDateString('vi-VN') + ' ' + new Date(g.lastPostedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
      : '<span style="color: var(--text-dim); font-size: 0.75rem;">Chưa đăng bài</span>';

    return `
      <tr>
        <td class="text-center">
          <input type="checkbox" class="bds-table-checkbox" value="${g.id}" ${isChecked ? 'checked' : ''} onchange="toggleSelectBdsGroup('${g.id}', this.checked)">
        </td>
        <td class="text-center" style="font-weight: 600; color: var(--text-muted); font-size: 0.8rem;">
          ${idx + 1}
        </td>
        <td>
          <div style="display: flex; flex-direction: column;">
            <a href="${g.url}" target="_blank" style="font-weight: 600; color: var(--text-main); font-size: 0.85rem; text-decoration: none; display: flex; align-items: center; gap: 6px;" title="Mở nhóm trên Facebook">
              <i class="fa-brands fa-facebook text-primary"></i> ${escapeHtml(g.name)}
              <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem; opacity: 0.6;"></i>
            </a>
            <span style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">${g.url}</span>
          </div>
        </td>
        <td>
          <span class="badge-pill info" style="font-size: 0.72rem;">
            <i class="fa-solid fa-location-dot"></i> ${escapeHtml(g.district ? `${g.district} - ${g.province}` : g.province)}
          </span>
        </td>
        <td>
          <span style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(g.category || 'Cho Thuê Căn Hộ')}</span>
        </td>
        <td class="text-center" style="font-size: 0.82rem; font-weight: 600; color: var(--text-main);">
          ${g.members || 'N/A'}
        </td>
        <td class="text-center">
          ${statusBadge}
        </td>
        <td class="text-center" style="font-size: 0.78rem;">
          ${lastPostedText}
        </td>
        <td class="text-center">
          <div style="display: flex; justify-content: center; gap: 4px;">
            <button class="btn btn-sm btn-outline" id="btn-bds-verify-tbl-${g.id}" style="padding: 2px 7px; font-size: 0.72rem; color: #10b981; border-color: rgba(16,185,129,0.3);" onclick="checkSingleBdsGroupRealtime('${g.id}')" title="Kiểm tra Real-time trên Facebook">
              <i class="fa-solid fa-satellite-dish"></i>
            </button>
            <button class="btn btn-sm btn-outline" style="padding: 2px 7px; font-size: 0.72rem;" onclick="goToBdsControllerWithGroup('${g.id}')" title="Chọn nhóm này để đăng bài">
              <i class="fa-solid fa-paper-plane text-success"></i>
            </button>
            <button class="btn btn-sm btn-outline" style="padding: 2px 7px; font-size: 0.72rem;" onclick="openEditBdsGroupModal('${g.id}')" title="Chỉnh sửa">
              <i class="fa-solid fa-pen text-primary"></i>
            </button>
            <button class="btn btn-sm btn-outline" style="padding: 2px 7px; font-size: 0.72rem; color: var(--danger); border-color: rgba(239,68,68,0.3);" onclick="deleteBdsGroup('${g.id}')" title="Xóa">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function renderBdsGroupCards() {
  const container = document.getElementById('bds-groups-grid-container');
  if (!container) return;

  const list = bdsGroupState.groups || [];
  if (list.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-muted);">
        <p>Không có nhóm nào.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = list.map(g => `
    <div class="group-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 14px; display: flex; flex-direction: column; justify-content: space-between;">
      <div>
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 8px;">
          <a href="${g.url}" target="_blank" style="font-weight: 700; color: var(--text-main); font-size: 0.9rem; text-decoration: none;">
            <i class="fa-brands fa-facebook text-primary"></i> ${escapeHtml(g.name)}
          </a>
          <span class="badge-pill ${g.isJoined ? 'success' : 'secondary'}" style="font-size: 0.7rem; flex-shrink: 0;">
            ${g.isJoined ? 'Đã Vào' : 'Chưa Vào'}
          </span>
        </div>
        <div style="font-size: 0.78rem; color: var(--text-muted); display: flex; gap: 10px; margin-bottom: 8px;">
          <span><i class="fa-solid fa-location-dot text-danger"></i> ${escapeHtml(g.district || g.province)}</span>
          <span><i class="fa-solid fa-users text-primary"></i> ${g.members || 'N/A'}</span>
        </div>
      </div>
      <div style="border-top: 1px solid var(--border-color); padding-top: 10px; display: flex; justify-content: space-between; align-items: center; gap: 6px;">
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-sm btn-outline" id="btn-bds-verify-${g.id}" style="padding: 2px 8px; color: #10b981; border-color: rgba(16,185,129,0.3);" onclick="checkSingleBdsGroupRealtime('${g.id}')" title="Kiểm tra Real-time trên Facebook">
            <i class="fa-solid fa-satellite-dish"></i>
          </button>
          <button class="btn btn-sm btn-outline" onclick="toggleBdsMembership('${g.id}', ${!g.isJoined})">
            ${g.isJoined ? 'Rời nhóm' : 'Đã vào nhóm'}
          </button>
        </div>
        <button class="btn btn-sm btn-primary" style="background: linear-gradient(135deg, #10b981, #059669); border: none;" onclick="goToBdsControllerWithGroup('${g.id}')">
          <i class="fa-solid fa-paper-plane"></i> Đăng Tin
        </button>
      </div>
    </div>
  `).join('');
}

function onBdsGroupFilterChange(field, val) {
  if (!bdsGroupState.filters) {
    bdsGroupState.filters = { search: '', province: 'ALL', district: 'ALL', membership: 'ALL', category: 'ALL' };
  }
  bdsGroupState.filters[field] = val;
  loadBdsGroupsData();
}

function onBdsGroupProvinceOrDistrictChange(val) {
  if (!bdsGroupState.filters) {
    bdsGroupState.filters = { search: '', province: 'ALL', district: 'ALL', membership: 'ALL', category: 'ALL' };
  }
  if (!val || val === 'ALL') {
    bdsGroupState.filters.province = 'ALL';
    bdsGroupState.filters.district = 'ALL';
  } else if (val.startsWith('district:')) {
    const dist = val.replace('district:', '');
    bdsGroupState.filters.province = 'Đà Nẵng';
    bdsGroupState.filters.district = dist;
  } else {
    bdsGroupState.filters.province = val;
    bdsGroupState.filters.district = 'ALL';
  }
  loadBdsGroupsData();
}

function selectBdsProvinceFilter(prov) {
  if (!bdsGroupState.filters) {
    bdsGroupState.filters = { search: '', province: 'ALL', district: 'ALL', membership: 'ALL', category: 'ALL' };
  }
  bdsGroupState.filters.province = prov;
  bdsGroupState.filters.district = 'ALL';
  const sel = document.getElementById('bds-filter-province-select');
  if (sel) sel.value = prov;
  loadBdsGroupsData();
}

function resetAllBdsGroupFilters() {
  bdsGroupState.filters = {
    search: '',
    province: 'ALL',
    district: 'ALL',
    membership: 'ALL',
    category: 'ALL',
    sort: 'DEFAULT'
  };

  const sInp = document.getElementById('bds-group-search');
  if (sInp) sInp.value = '';
  const pSel = document.getElementById('bds-filter-province-select');
  if (pSel) pSel.value = 'ALL';
  const mSel = document.getElementById('bds-filter-membership-select');
  if (mSel) mSel.value = 'ALL';
  const cSel = document.getElementById('bds-filter-category-select');
  if (cSel) cSel.value = 'ALL';

  loadBdsGroupsData();
}

function onBdsGroupAccountViewChange(accId) {
  bdsGroupState.currentAccountId = accId;
  loadBdsGroupsData();
}

async function toggleBdsMembership(id, isJoined) {
  try {
    const res = await fetch(`/api/bds/groups/${id}/toggle-membership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isJoined, accountId: bdsGroupState.currentAccountId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Cập Nhật', result.message, 'success');
      loadBdsGroupsData();
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

async function copyBdsMembershipFromPrimary() {
  if (bdsGroupState.currentAccountId === 'acc_primary') {
    showToast('Thông báo', 'Bạn đang xem Nick Chính (acc_primary). Hãy chọn Nick phụ khác để sao chép từ Nick chính!', 'warning');
    return;
  }

  if (!confirm(`Sao chép toàn bộ trạng thái nhóm đã vào từ Nick Chính sang Nick đang xem (${bdsGroupState.currentAccountId})?`)) return;

  try {
    const res = await fetch('/api/bds/groups/copy-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceAccountId: 'acc_primary', targetAccountId: bdsGroupState.currentAccountId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Sao Chép Thành Công', result.message, 'success');
      loadBdsGroupsData();
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

async function resetBdsGroupMembershipsToUnjoined() {
  if (!confirm(`Bạn có chắc chắn muốn đặt lại toàn bộ nhóm về "Chưa vào nhóm" cho Nick đang xem (${bdsGroupState.currentAccountId})?`)) return;

  try {
    const res = await fetch('/api/bds/groups/reset-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: bdsGroupState.currentAccountId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Đặt Lại', result.message, 'success');
      loadBdsGroupsData();
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

async function cleanBdsUnjoinedGroups() {
  if (!confirm('Bạn có chắc muốn xóa TẤT CẢ các nhóm chưa tham gia khỏi danh sách nhóm BĐS không?')) return;

  try {
    const res = await fetch('/api/bds/groups/clean-unjoined', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: bdsGroupState.currentAccountId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Dọn Dẹp', result.message, 'success');
      loadBdsGroupsData();
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

async function clearAllBdsGroups() {
  if (!confirm('CẢNH BÁO: Bạn có chắc chắn muốn xóa TOÀN BỘ nhóm BĐS khỏi hệ thống? Hành động này không thể hoàn tác!')) return;

  try {
    const res = await fetch('/api/bds/groups/clear-all', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Xóa Hết', result.message, 'success');
      loadBdsGroupsData();
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

function openAddBdsGroupModal() {
  const modal = document.getElementById('add-bds-group-modal');
  if (modal) modal.classList.add('active');
}

function closeAddBdsGroupModal() {
  const modal = document.getElementById('add-bds-group-modal');
  if (modal) modal.classList.remove('active');
}

async function saveBdsGroup() {
  const name = document.getElementById('bds-new-group-name')?.value.trim();
  const url = document.getElementById('bds-new-group-url')?.value.trim();
  const province = document.getElementById('bds-new-group-province')?.value.trim() || 'Đà Nẵng';
  const district = document.getElementById('bds-new-group-district')?.value.trim() || 'Sơn Trà';
  const category = document.getElementById('bds-new-group-category')?.value.trim() || 'Cho Thuê Căn Hộ';
  const members = document.getElementById('bds-new-group-members')?.value.trim() || 'N/A';

  if (!name || !url) {
    showToast('Thiếu Thông Tin', 'Vui lòng nhập Tên nhóm và Link nhóm Facebook.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/bds/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, province, district, category, members })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Thành Công', result.message, 'success');
      closeAddBdsGroupModal();
      loadBdsGroupsData();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

function openBulkBdsGroupModal() {
  const modal = document.getElementById('bulk-bds-group-modal');
  if (modal) modal.classList.add('active');
}

function closeBulkBdsGroupModal() {
  const modal = document.getElementById('bulk-bds-group-modal');
  if (modal) modal.classList.remove('active');
}

async function saveBulkBdsGroups() {
  const rawText = document.getElementById('bds-bulk-group-textarea')?.value.trim();
  const defaultProvince = document.getElementById('bds-bulk-default-province')?.value || 'Đà Nẵng';
  const defaultCategory = document.getElementById('bds-bulk-default-category')?.value || 'Cho Thuê Căn Hộ';

  if (!rawText) {
    showToast('Thiếu Danh Sách', 'Vui lòng dán danh sách link hoặc tên nhóm.', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/bds/groups/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, defaultProvince, defaultCategory })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Thêm Hàng Loạt', result.message, 'success');
      closeBulkBdsGroupModal();
      loadBdsGroupsData();
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

function toggleSelectBdsGroup(id, checked) {
  if (checked) bdsGroupState.selectedGroupIds.add(id);
  else bdsGroupState.selectedGroupIds.delete(id);
}

function toggleSelectAllBdsTable(checked) {
  const checkboxes = document.querySelectorAll('.bds-table-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = checked;
    if (checked) bdsGroupState.selectedGroupIds.add(cb.value);
    else bdsGroupState.selectedGroupIds.delete(cb.value);
  });
}

function exportBdsGroups() {
  const list = bdsGroupState.groups || [];
  if (list.length === 0) {
    showToast('Danh Sách Rỗng', 'Không có nhóm nào để xuất file.', 'warning');
    return;
  }

  let csv = '\uFEFFSTT,Tên Nhóm Facebook,Link Nhóm,Khu Vực,Quận Huyện,Chuyên Mục,Thành Viên,Đã Tham Gia\n';
  list.forEach((g, i) => {
    csv += `${i+1},"${(g.name||'').replace(/"/g, '""')}","${g.url||''}","${g.province||''}","${g.district||''}","${g.category||''}","${g.members||''}","${g.isJoined ? 'Có' : 'Chưa'}"\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Nhom_BDS_LeadX_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('Xuất File Thành Công', 'Đã tải danh sách nhóm BĐS ra file CSV!', 'success');
}

function goToBdsControllerWithGroup(groupId) {
  switchTab('bds-controller-tab');
  setTimeout(() => {
    bdsControllerState.selectedGroupIds.add(groupId);
    renderBdsTargetGroups();
  }, 200);
}

// =========================================================
// 4. PHÂN HỆ: ĐIỀU KHIỂN ĐĂNG BÀI BẤT ĐỘNG SẢN (BDS CONTROLLER TAB)
// =========================================================

async function initBdsControllerTab() {
  populateBdsApartmentSelect();
  populateBdsControllerAccounts();
  await loadBdsGroupsForController();
  checkBdsCampaignStatus();
}

function populateBdsApartmentSelect() {
  const sel = document.getElementById('bds-select-apartment');
  if (!sel) return;

  const list = apartmentState.apartments || [];
  if (list.length === 0) {
    sel.innerHTML = '<option value="">-- Đang nạp danh sách căn hộ... --</option>';
    loadApartmentsData().then(() => populateBdsApartmentSelect());
    return;
  }

  let opts = '<option value="">-- Chọn Căn Hộ Từ Kho Dữ Liệu BĐS --</option>';
  list.forEach(a => {
    const priceText = a.price >= 1000000 ? `${(a.price/1000000).toLocaleString('vi-VN')} Tr` : `${a.price} đ`;
    opts += `<option value="${a.id}">[${escapeHtml(a.projectCode || 'BĐS')}] ${escapeHtml(a.title)} - ${priceText}/th</option>`;
  });
  sel.innerHTML = opts;

  if (apartmentState.activeApartmentForPost) {
    sel.value = apartmentState.activeApartmentForPost.id;
    onBdsSelectApartmentChange(apartmentState.activeApartmentForPost.id);
  } else if (list.length > 0 && !sel.value) {
    sel.value = list[0].id;
    onBdsSelectApartmentChange(list[0].id);
  }
}

function populateBdsControllerAccounts() {
  const sel = document.getElementById('bds-controller-account-select');
  if (!sel) return;

  const accounts = state.accounts || [];
  if (accounts.length === 0) {
    sel.innerHTML = '<option value="acc_primary">Tài Khoản Mặc Định (Nick 1)</option>';
    return;
  }

  sel.innerHTML = accounts.map(a => `
    <option value="${a.id}">
      ${a.name || a.id} (${a.uid || 'FB User'}) ${a.status === 'LIVE' ? '🟢 Live' : '🟡'}
    </option>
  `).join('');
}

async function loadBdsGroupsForController() {
  try {
    const res = await fetch('/api/bds/groups');
    const data = await res.json();
    if (data.success) {
      bdsGroupState.groups = data.data || [];
      renderBdsTargetGroups();
    }
  } catch (err) {
    console.error('Lỗi nạp nhóm cho controller:', err);
  }
}

function onBdsSelectApartmentChange(aptId) {
  const apt = apartmentState.apartments.find(a => a.id === aptId);
  if (!apt) return;

  bdsControllerState.selectedApartment = apt;
  renderBdsApartmentSummary(apt);

  // Sinh template bài đăng BĐS
  fetch(`/api/apartments/${apt.id}/template`)
    .then(r => r.json())
    .then(res => {
      if (res.success && res.template) {
        const textarea = document.getElementById('bds-post-caption');
        if (textarea) textarea.value = res.template;
        bdsControllerState.customCaption = res.template;
        updateBdsPreview();
      }
    }).catch(console.error);

  // Khớp nhóm theo Quận của căn hộ
  autoMatchBdsGroupsForApartment(apt.district);
}

function renderBdsApartmentSummary(apt) {
  const card = document.getElementById('bds-apartment-summary-card');
  if (!card || !apt) return;

  const priceText = apt.price >= 1000000
    ? `${(apt.price / 1000000).toLocaleString('vi-VN')} Triệu / tháng`
    : `${apt.price.toLocaleString('vi-VN')} đ / tháng`;

  const driveBtn = apt.driveLink && apt.driveLink.startsWith('http')
    ? `<a href="${apt.driveLink}" target="_blank" class="btn btn-sm btn-outline" style="border-color: #3b82f6; color: #60a5fa;"><i class="fa-brands fa-google-drive"></i> Mở Thư Mục Ảnh Drive</a>`
    : '';

  const imagesHtml = (apt.images && apt.images.length > 0)
    ? `
      <div style="margin-top: 12px; border-top: 1px dashed var(--border-color); padding-top: 10px;">
        <div style="font-size: 0.76rem; color: var(--text-muted); margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
          <span style="color: #34d399; font-weight: 600;"><i class="fa-solid fa-camera"></i> ${apt.images.length} ảnh thực tế Google Drive:</span>
          <button type="button" class="btn btn-sm btn-outline" style="padding: 1px 8px; font-size: 0.72rem; color: #10b981; border-color: #10b981;" onclick="openApartmentGalleryModal('${apt.id}')">
            <i class="fa-solid fa-expand"></i> Xem Phóng To
          </button>
        </div>
        <div style="display: flex; gap: 8px; overflow-x: auto; padding-bottom: 4px;">
          ${apt.images.slice(0, 10).map((imgUrl, i) => `
            <img src="${imgUrl}" alt="Ảnh ${i+1}" style="width: 76px; height: 54px; object-fit: cover; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15); cursor: pointer; flex-shrink: 0;" onclick="openApartmentGalleryModal('${apt.id}')" title="Bấm xem album ảnh thực tế">
          `).join('')}
          ${apt.images.length > 10 ? `
            <div style="width: 76px; height: 54px; background: rgba(255,255,255,0.1); border-radius: 4px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; color: #fff; cursor: pointer; flex-shrink: 0;" onclick="openApartmentGalleryModal('${apt.id}')">
              +${apt.images.length - 10} ảnh
            </div>
          ` : ''}
        </div>
      </div>
    `
    : `
      <div style="margin-top: 10px; font-size: 0.75rem; color: #f59e0b; background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.2); border-radius: 4px; padding: 6px 10px;">
        <i class="fa-solid fa-circle-info"></i> Căn hộ này chưa có ảnh trên Google Drive. Bạn có thể mở link Drive bên phải để tải ảnh lên.
      </div>
    `;

  card.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
          <span class="badge-pill warning" style="font-weight: 700;">Mã: ${escapeHtml(apt.projectCode || 'BĐS')}</span>
          <span class="badge-pill info">${apt.roomType || 'Studio'}</span>
          <span class="badge-pill success">Trống sẵn</span>
        </div>
        <h4 style="font-size: 1.05rem; font-weight: 700; color: #fff; margin: 4px 0;">${escapeHtml(apt.title)}</h4>
        <div style="font-size: 0.82rem; color: var(--text-muted); display: flex; gap: 16px; margin-top: 6px; flex-wrap: wrap;">
          <span><i class="fa-solid fa-location-dot text-danger"></i> ${escapeHtml(apt.address || apt.district + ', Đà Nẵng')}</span>
          <span><i class="fa-solid fa-ruler-combined text-primary"></i> ${apt.area ? apt.area + ' m²' : '--'}</span>
          <span><i class="fa-solid fa-money-bill-wave text-success"></i> <strong style="color: #34d399;">${priceText}</strong></span>
          <span><i class="fa-solid fa-phone text-success"></i> ${apt.contact?.phone || '0905123456'}</span>
        </div>
      </div>
      <div>
        ${driveBtn}
      </div>
    </div>
    ${imagesHtml}
  `;

  updateBdsPreview();
}

function updateBdsPreview() {
  const preview = document.getElementById('bds-post-preview-content');
  const caption = document.getElementById('bds-post-caption')?.value || '';
  if (preview) {
    preview.textContent = caption || 'Nội dung bài viết sẽ hiển thị tại đây...';
  }

  // Cập nhật ảnh đính kèm trong Facebook preview card
  const apt = bdsControllerState.selectedApartment;
  let previewCard = document.getElementById('bds-post-preview-card');
  if (previewCard && apt) {
    let imgSection = document.getElementById('bds-preview-post-images');
    if (!imgSection) {
      imgSection = document.createElement('div');
      imgSection.id = 'bds-preview-post-images';
      imgSection.style.marginTop = '10px';
      previewCard.appendChild(imgSection);
    }

    if (apt.images && apt.images.length > 0) {
      imgSection.innerHTML = `
        <div style="display: grid; grid-template-columns: ${apt.images.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(120px, 1fr))'}; gap: 4px; border-radius: 6px; overflow: hidden; max-height: 220px;">
          ${apt.images.slice(0, 4).map((url, i) => `
            <div style="position: relative; height: 105px; overflow: hidden;">
              <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;">
              ${i === 3 && apt.images.length > 4 ? `
                <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; color: #fff; font-size: 1.1rem; font-weight: 700;">
                  +${apt.images.length - 4}
                </div>
              ` : ''}
            </div>
          `).join('')}
        </div>
      `;
    } else {
      imgSection.innerHTML = '';
    }
  }
}

function regenerateBdsTemplate() {
  const apt = bdsControllerState.selectedApartment;
  if (!apt) return;
  fetch(`/api/apartments/${apt.id}/template`)
    .then(r => r.json())
    .then(res => {
      if (res.success && res.template) {
        const textarea = document.getElementById('bds-post-caption');
        if (textarea) textarea.value = res.template;
        updateBdsPreview();
        showToast('Đã Làm Mới', 'Đã nạp lại mẫu bài viết gốc!', 'info');
      }
    });
}

function spinBdsCaption() {
  const textarea = document.getElementById('bds-post-caption');
  if (!textarea || !textarea.value.trim()) return;

  const content = textarea.value;
  showToast('AI Spin', 'Đang tối ưu & đảo ngữ bài viết để chống Checkpoint Facebook...', 'info');

  fetch('/api/ai/spin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, preserveContact: true })
  }).then(r => r.json())
    .then(res => {
      if (res.success && res.content) {
        textarea.value = res.content;
        updateBdsPreview();
        showToast('AI Spin Hoàn Tất', 'Đã tạo biến thể bài viết tự nhiên mới!', 'success');
      } else {
        // Fallback local shuffle
        fallbackSpinBdsCaption(textarea);
      }
    }).catch(() => fallbackSpinBdsCaption(textarea));
}

function fallbackSpinBdsCaption(textarea) {
  const headerVariations = [
    '🔥 [SIÊU PHẨM CĂN HỘ ĐÀ NẴNG] CỰC ĐẸP - GIÁ TỐT NHẤT THÁNG',
    '✨ [CHO THUÊ CĂN HỘ ĐÀ NẴNG] FULL NỘI THẤT CAO CẤP - VÀO Ở NGAY',
    '🌟 [BẢNG HÀNG CĂN HỘ CHO THUÊ] VIEW ĐẸP - AN NINH 24/7'
  ];
  let text = textarea.value;
  const randH = headerVariations[Math.floor(Math.random() * headerVariations.length)];
  text = text.replace(/^🔥.*$/m, randH);
  textarea.value = text;
  updateBdsPreview();
  showToast('Đã Đổi Tiêu Đề', 'Đã áp dụng biến thể tiêu đề mới!', 'success');
}

function autoMatchBdsGroupsForApartment(district) {
  const distClean = (district || '').toLowerCase();
  bdsControllerState.selectedGroupIds.clear();

  const allGroups = bdsGroupState.groups || [];
  allGroups.forEach(g => {
    const name = (g.name || '').toLowerCase();
    const d = (g.district || '').toLowerCase();
    const p = (g.province || '').toLowerCase();

    // Khớp nếu cùng quận hoặc cùng Đà Nẵng
    if (g.isJoined && (name.includes(distClean) || d.includes(distClean) || p.includes('đà nẵng') || p.includes('da nang'))) {
      bdsControllerState.selectedGroupIds.add(g.id);
    }
  });

  renderBdsTargetGroups();
}

function renderBdsTargetGroups() {
  const container = document.getElementById('bds-target-groups-list');
  const countBadge = document.getElementById('bds-target-groups-count');
  if (!container) return;

  const allGroups = bdsGroupState.groups || [];
  const selectedCount = bdsControllerState.selectedGroupIds.size;
  if (countBadge) countBadge.textContent = `${selectedCount} / ${allGroups.length} nhóm`;

  if (allGroups.length === 0) {
    container.innerHTML = `
      <div style="padding: 20px; text-align: center; color: var(--text-muted); font-size: 0.85rem;">
        <i class="fa-solid fa-users fa-2x mb-2" style="opacity: 0.5;"></i>
        <p>Chưa có nhóm BĐS nào. Vào tab <strong>Quản Lý Nhóm BĐS</strong> để thêm nhóm.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = allGroups.map(g => {
    const isSelected = bdsControllerState.selectedGroupIds.has(g.id);
    return `
      <label style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--bg-body); border: 1px solid ${isSelected ? 'var(--primary)' : 'var(--border-color)'}; border-radius: var(--radius-sm); margin-bottom: 6px; cursor: pointer; transition: all 0.2s ease;">
        <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
          <input type="checkbox" value="${g.id}" ${isSelected ? 'checked' : ''} onchange="toggleBdsTargetGroupSelection('${g.id}', this.checked)" style="accent-color: #10b981; width: 16px; height: 16px;">
          <div>
            <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 380px;">
              ${escapeHtml(g.name)}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-muted);">
              <i class="fa-solid fa-location-dot text-danger"></i> ${escapeHtml(g.district || g.province)} &bull; Thành viên: ${g.members || 'N/A'}
            </div>
          </div>
        </div>
        <div>
          <span class="badge-pill ${g.isJoined ? 'success' : 'secondary'}" style="font-size: 0.68rem;">
            ${g.isJoined ? 'Đã Vào' : 'Chưa Vào'}
          </span>
        </div>
      </label>
    `;
  }).join('');
}

function toggleBdsTargetGroupSelection(groupId, isChecked) {
  if (isChecked) bdsControllerState.selectedGroupIds.add(groupId);
  else bdsControllerState.selectedGroupIds.delete(groupId);

  const countBadge = document.getElementById('bds-target-groups-count');
  if (countBadge) countBadge.textContent = `${bdsControllerState.selectedGroupIds.size} / ${bdsGroupState.groups.length} nhóm`;
}

function toggleBdsSelectAllTargetGroups(selectJoinedOnly = true) {
  const allGroups = bdsGroupState.groups || [];
  bdsControllerState.selectedGroupIds.clear();

  allGroups.forEach(g => {
    if (selectJoinedOnly) {
      if (g.isJoined) bdsControllerState.selectedGroupIds.add(g.id);
    } else {
      bdsControllerState.selectedGroupIds.add(g.id);
    }
  });

  renderBdsTargetGroups();
}

function clearBdsTargetGroups() {
  bdsControllerState.selectedGroupIds.clear();
  renderBdsTargetGroups();
}

// 5. BẮT ĐẦU ĐĂNG BÀI BẤT ĐỘNG SẢN QUA PUPPETEER STEALTH
async function startBdsPostCampaign() {
  const apt = bdsControllerState.selectedApartment;
  if (!apt) {
    showToast('Chưa Chọn Căn Hộ', 'Vui lòng chọn căn hộ cần đăng tin.', 'warning');
    return;
  }

  const customContent = document.getElementById('bds-post-caption')?.value.trim();
  if (!customContent) {
    showToast('Thiếu Nội Dung', 'Vui lòng nhập nội dung bài đăng.', 'warning');
    return;
  }

  const groupIds = Array.from(bdsControllerState.selectedGroupIds);
  if (groupIds.length === 0) {
    showToast('Chưa Chọn Nhóm', 'Vui lòng chọn ít nhất 1 Hội nhóm BĐS để đăng bài.', 'warning');
    return;
  }

  const minDelay = Number(document.getElementById('bds-delay-min')?.value) || 30;
  const maxDelay = Number(document.getElementById('bds-delay-max')?.value) || 60;

  if (!confirm(`Xác nhận đăng tin căn hộ "${apt.title}" lên ${groupIds.length} Hội nhóm BĐS mục tiêu?`)) {
    return;
  }

  showToast('Khởi Động Đăng Bài BĐS', `Bắt đầu xuất bản bài đăng lên ${groupIds.length} nhóm qua Puppeteer Stealth...`, 'info', 5000);

  // Cập nhật UI sang trạng thái Running
  setBdsCampaignRunningUI(true);

  try {
    const res = await fetch('/api/bds/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        apartmentId: apt.id,
        customContent,
        groupIds,
        delayConfig: { minSeconds: minDelay, maxSeconds: maxDelay }
      })
    });

    const result = await res.json();
    if (result.success) {
      showToast('Đang Thực Hiện Đăng Bài', 'Trình duyệt đang tự động đăng bài theo hàng đợi...', 'success', 5000);
      startBdsPolling();
    } else {
      showToast('Lỗi Khởi Động', result.message, 'danger', 7000);
      setBdsCampaignRunningUI(false);
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
    setBdsCampaignRunningUI(false);
  }
}

async function pauseBdsPostCampaign() {
  try {
    const res = await fetch('/api/bds/campaign/pause', { method: 'POST' });
    const result = await res.json();
    showToast('Tạm Dừng', 'Đã tạm dừng chiến dịch đăng bài.', 'warning');
  } catch (e) {}
}

async function resumeBdsPostCampaign() {
  try {
    const res = await fetch('/api/bds/campaign/resume', { method: 'POST' });
    const result = await res.json();
    showToast('Tiếp Tục', 'Đã tiếp tục tiến trình đăng bài.', 'info');
  } catch (e) {}
}

async function stopBdsPostCampaign() {
  if (!confirm('Bạn có chắc muốn DỪNG HOÀN TOÀN chiến dịch đăng bài BĐS đang chạy?')) return;
  try {
    const res = await fetch('/api/bds/campaign/stop', { method: 'POST' });
    const result = await res.json();
    showToast('Đã Dừng', 'Chiến dịch đăng bài đã dừng.', 'secondary');
    setBdsCampaignRunningUI(false);
    stopBdsPolling();
  } catch (e) {}
}

function startBdsPolling() {
  stopBdsPolling();
  bdsControllerState.pollTimer = setInterval(checkBdsCampaignStatus, 2000);
}

function stopBdsPolling() {
  if (bdsControllerState.pollTimer) {
    clearInterval(bdsControllerState.pollTimer);
    bdsControllerState.pollTimer = null;
  }
}

async function checkBdsCampaignStatus() {
  try {
    const res = await fetch('/api/bds/campaign/status');
    const data = await res.json();
    if (data.success) {
      const status = data.data;
      const logs = data.logs || [];
      renderBdsCampaignStatus(status);
      renderBdsCampaignLogs(logs);

      if (!status.isRunning) {
        setBdsCampaignRunningUI(false);
        stopBdsPolling();
      }
    }
  } catch (e) {}
}

function renderBdsCampaignStatus(status) {
  const banner = document.getElementById('bds-live-progress-banner');
  if (!banner) return;

  if (status.isRunning || status.currentCampaign) {
    banner.style.display = 'block';
    const c = status.currentCampaign || {};
    const total = c.total || 0;
    const completed = c.completed || 0;
    const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

    const progressBar = document.getElementById('bds-progress-bar');
    const progressText = document.getElementById('bds-progress-text');
    const progressStatus = document.getElementById('bds-progress-status-desc');

    if (progressBar) progressBar.style.width = `${pct}%`;
    if (progressText) progressText.textContent = `${pct}% (${completed}/${total} nhóm)`;
    if (progressStatus) {
      progressStatus.innerHTML = `
        Đang đăng: <strong>${escapeHtml(c.currentGroupName || 'Khởi tạo...')}</strong> &bull; 
        Thành công: <strong style="color: #34d399;">${c.successCount || 0}</strong> &bull; 
        Chờ duyệt: <strong style="color: #f59e0b;">${c.pendingCount || 0}</strong> &bull; 
        Lỗi: <strong style="color: #ef4444;">${c.errorCount || 0}</strong>
      `;
    }
  } else {
    banner.style.display = 'none';
  }
}

function renderBdsCampaignLogs(logs) {
  const terminal = document.getElementById('bds-controller-terminal-logs');
  if (!terminal) return;

  if (logs.length === 0) {
    terminal.innerHTML = '<div style="color: var(--text-dim); padding: 8px;">Chưa có log thao tác. Bấm "Bắt Đầu Đăng Bài" để khởi chạy.</div>';
    return;
  }

  terminal.innerHTML = logs.slice(-30).map(l => {
    let color = '#93c5fd';
    if (l.type === 'success') color = '#34d399';
    if (l.type === 'error') color = '#f87171';
    if (l.type === 'warn') color = '#fbbf24';

    return `<div style="margin-bottom: 4px; font-family: monospace; font-size: 0.78rem; line-height: 1.4;"><span style="color: var(--text-dim);">[${l.timestamp}]</span> <span style="color: ${color};">${escapeHtml(l.message)}</span></div>`;
  }).join('');

  terminal.scrollTop = terminal.scrollHeight;
}

function setBdsCampaignRunningUI(isRunning) {
  const startBtn = document.getElementById('btn-bds-start-post');
  const pauseBtn = document.getElementById('btn-bds-pause-post');
  const stopBtn = document.getElementById('btn-bds-stop-post');

  if (startBtn) startBtn.disabled = isRunning;
  if (pauseBtn) pauseBtn.disabled = !isRunning;
  if (stopBtn) stopBtn.disabled = !isRunning;
}

// Chạy tự động khởi tạo khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  // Event listener cập nhật preview khi gõ caption
  const cap = document.getElementById('bds-post-caption');
  if (cap) {
    cap.addEventListener('input', updateBdsPreview);
  }
});

// =========================================================
// 5. BỘ CÔNG CỤ TỰ ĐỘNG HÓA HỘI NHÓM BĐS (BDS AUTOMATION SUITE)
// =========================================================

let bdsVerifyInterval = null;
let bdsJoinInterval = null;
let bdsScrapeInterval = null;
let currentBdsScrapedGroups = [];
let bdsSelectedJoinGroupIds = new Set();
let bdsHideJoinedInJoiner = true;

/**
 * 5.1. Đồng bộ nhóm BĐS đã vào từ Facebook
 */
async function syncBdsMembershipFromFacebook() {
  const targetAccId = bdsGroupState.currentAccountId || 'acc_primary';
  const targetAcc = (state.accounts || []).find(a => a.id === targetAccId);
  const accName = targetAcc ? targetAcc.name : 'Nick hiện tại';

  showToast('Đang quét Facebook...', `Hệ thống đang mở trình duyệt quét danh sách nhóm nick "${accName}" đã tham gia...`, 'info', 5000);
  updateBdsGroupToolbarButtonsState('SYNC_JOINED', 0, 0);

  try {
    const res = await fetch('/api/bds/groups/sync-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: targetAccId })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Đồng Bộ Thành Công!', result.message, 'success', 6000);
      await loadBdsGroupsData();
    } else {
      showToast('Lỗi Đồng Bộ', result.message || 'Không thể đồng bộ nhóm từ Facebook', 'danger');
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  } finally {
    updateBdsGroupToolbarButtonsState(null);
  }
}

/**
 * 5.2. Kiểm tra Real-time 1 nhóm BĐS đơn lẻ
 */
async function checkSingleBdsGroupRealtime(groupId) {
  const btnGrid = document.getElementById(`btn-bds-verify-${groupId}`);
  const btnTable = document.getElementById(`btn-bds-verify-tbl-${groupId}`);
  const origGridHtml = btnGrid ? btnGrid.innerHTML : '';
  const origTableHtml = btnTable ? btnTable.innerHTML : '';

  [btnGrid, btnTable].forEach(b => {
    if (b) {
      b.disabled = true;
      b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
  });

  const targetAccId = bdsGroupState.currentAccountId || 'acc_primary';
  const targetAcc = (state.accounts || []).find(a => a.id === targetAccId);
  const accName = targetAcc ? targetAcc.name : 'Nick hiện tại';

  showToast('Đang kiểm tra...', `Mở Facebook kiểm tra nhóm cho nick "${accName}"...`, 'info', 3000);

  try {
    const res = await fetch(`/api/bds/groups/${groupId}/check-realtime`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: targetAccId })
    });
    const result = await res.json();

    if (result.success && result.data) {
      const isJoined = result.data.isJoined;
      const isPending = result.data.isPending;
      const statusTitle = isJoined ? 'ĐÃ THAM GIA' : (isPending ? 'ĐANG CHỜ DUYỆT' : 'CHƯA VÀO NHÓM');
      const toastType = isJoined ? 'success' : (isPending ? 'warning' : 'info');

      showToast(statusTitle, result.message, toastType, 4000);

      // Cập nhật state nhóm BĐS
      const g = (bdsGroupState.groups || []).find(x => x.id === groupId);
      if (g) {
        g.isJoined = isJoined;
        if (!g.memberships) g.memberships = {};
        g.memberships[targetAccId] = { isJoined };
      }

      if (result.stats) {
        bdsGroupState.stats = result.stats;
        renderBdsGroupKpis(result.stats);
        updateBdsAccountBadge(result.stats);
      }
      renderBdsGroupListing();
    } else {
      showToast('Lỗi Kiểm Tra', result.message || 'Không thể kiểm tra nhóm', 'danger');
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  } finally {
    if (btnGrid) {
      btnGrid.disabled = false;
      btnGrid.innerHTML = origGridHtml || '<i class="fa-solid fa-satellite-dish"></i>';
    }
    if (btnTable) {
      btnTable.disabled = false;
      btnTable.innerHTML = origTableHtml || '<i class="fa-solid fa-satellite-dish"></i>';
    }
  }
}

/**
 * 5.3. Cập nhật Badge chạy Realtime trên các nút tự động hóa BĐS
 */
function updateBdsGroupToolbarButtonsState(runningType, current, total) {
  const allBtns = [
    { id: 'btn-bds-scrape-groups', type: 'SCRAPE_GROUPS', label: 'Quét Nhóm Tự Động', icon: 'fa-magnifying-glass-location', color: '#06b6d4' },
    { id: 'btn-bds-auto-join', type: 'AUTO_JOIN', label: 'Tự Động Xin Vào Nhóm', icon: 'fa-user-plus', color: '#f59e0b' },
    { id: 'btn-bds-realtime-verify', type: 'REALTIME_VERIFY', label: 'Quét Trạng Thái Realtime', icon: 'fa-satellite-dish', color: '#10b981' },
    { id: 'btn-bds-sync-joined', type: 'SYNC_JOINED', label: 'Đồng Bộ Nhóm Đã Vào Từ FB', icon: 'fa-facebook', color: '#1877f2', isBrand: true }
  ];

  allBtns.forEach(item => {
    const btn = document.getElementById(item.id);
    if (!btn) return;

    if (!runningType) {
      btn.classList.remove('btn-tool-active-running', 'btn-tool-other-standby');
      const iconClass = item.isBrand ? 'fa-brands ' + item.icon : 'fa-solid ' + item.icon;
      btn.innerHTML = '<i class="' + iconClass + '" style="color: ' + item.color + ';"></i> <span class="btn-tool-label">' + item.label + '</span>';
      btn.title = '';
    } else if (item.type === runningType) {
      btn.classList.remove('btn-tool-other-standby');
      btn.classList.add('btn-tool-active-running');
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin" style="color: #10b981;"></i> <span class="btn-tool-label">' + item.label + '</span> <span class="badge-running-pill">' + (current || 0) + '/' + (total || 0) + '</span>';
      btn.title = 'Bấm để mở lại chi tiết tiến trình đang quét';
    } else {
      btn.classList.remove('btn-tool-active-running');
      btn.classList.add('btn-tool-other-standby');
      btn.title = 'Đang có tiến trình tự động khác hoạt động...';
    }
  });
}

// =========================================================
// 5.4. QUÉT & CÀO NHÓM BĐS TỰ ĐỘNG (BDS GROUP SCRAPER)
// =========================================================

function openBdsScrapeGroupsModal() {
  const modal = document.getElementById('bds-scrape-groups-modal');
  if (modal) modal.classList.add('active');
  const kw = document.getElementById('bds-scrape-input-keyword');
  if (kw && !kw.value) kw.value = 'Cho thuê căn hộ Đà Nẵng';
  if (kw) setTimeout(() => kw.focus(), 150);
}

function closeBdsScrapeGroupsModal() {
  const modal = document.getElementById('bds-scrape-groups-modal');
  if (modal) modal.classList.remove('active');
  if (bdsScrapeInterval) {
    clearInterval(bdsScrapeInterval);
    bdsScrapeInterval = null;
  }
}

async function startBdsScrapingGroups() {
  const keyword = (document.getElementById('bds-scrape-input-keyword')?.value || '').trim();
  const province = (document.getElementById('bds-scrape-input-province')?.value || '').trim();
  const minMembers = parseInt(document.getElementById('bds-scrape-select-min-members')?.value, 10) || 0;
  const privacyFilter = document.getElementById('bds-scrape-select-privacy')?.value || 'ALL';
  const maxResults = parseInt(document.getElementById('bds-scrape-select-max')?.value, 10) || 30;

  if (!keyword) {
    showToast('Thiếu Thông Tin', 'Vui lòng nhập từ khóa tìm kiếm nhóm BĐS!', 'warning');
    document.getElementById('bds-scrape-input-keyword')?.focus();
    return;
  }

  const btnStart = document.getElementById('btn-start-bds-scrape');
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang quét...';
  }

  const statusWrap = document.getElementById('bds-scrape-status-wrap');
  if (statusWrap) statusWrap.style.display = 'block';

  const statusPill = document.getElementById('bds-scrape-status-pill');
  if (statusPill) {
    statusPill.className = 'badge-pill purple';
    statusPill.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối Facebook...';
  }

  const logsBox = document.getElementById('bds-scrape-logs-box');
  if (logsBox) logsBox.innerHTML = `<div class="log-entry log-info"><span class="log-time">[Bắt đầu]</span> Đang mở Chrome tìm kiếm nhóm BĐS: "${keyword}"...</div>`;

  try {
    const res = await fetch('/api/bds/groups/scrape/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, province, minMembers, privacyFilter, maxResults })
    });
    const data = await res.json();

    if (!data.success) {
      showToast('Lỗi Cào Nhóm', data.message, 'danger');
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Quét Nhóm';
      }
      return;
    }

    showToast('Đang Quét Nhóm Facebook BĐS', `Bắt đầu tìm kiếm: "${keyword}"...`, 'info');
    if (bdsScrapeInterval) clearInterval(bdsScrapeInterval);
    bdsScrapeInterval = setInterval(pollBdsScrapeStatus, 2000);
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Quét Nhóm';
    }
  }
}

async function pollBdsScrapeStatus() {
  try {
    const res = await fetch('/api/bds/groups/scrape/status');
    const result = await res.json();
    if (!result.success) return;

    const { isScraping, progress, results, logs } = result.data;

    const logsBox = document.getElementById('bds-scrape-logs-box');
    if (logsBox && logs && logs.length > 0) {
      logsBox.innerHTML = logs.map(l => {
        const cls = l.type === 'error' ? 'log-error' : (l.type === 'success' ? 'log-success' : (l.type === 'warn' ? 'log-warn' : 'log-info'));
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${escapeHtml(l.message)}</div>`;
      }).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    const liveCounter = document.getElementById('bds-scrape-live-counter');
    if (liveCounter) {
      liveCounter.textContent = `Đã tìm: ${results ? results.length : 0} nhóm BĐS`;
    }

    if (results && results.length > 0) {
      currentBdsScrapedGroups = results;
      renderBdsScrapedGroupsTable(results);
    }

    const btnStart = document.getElementById('btn-start-bds-scrape');
    const statusPill = document.getElementById('bds-scrape-status-pill');

    if (!isScraping) {
      clearInterval(bdsScrapeInterval);
      bdsScrapeInterval = null;

      if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Quét Nhóm';
      }

      if (progress.status === 'COMPLETED') {
        if (statusPill) {
          statusPill.className = 'badge-pill emerald';
          statusPill.innerHTML = `<i class="fa-solid fa-circle-check"></i> Hoàn tất! Tìm được ${results ? results.length : 0} nhóm BĐS.`;
        }
      }
    }
  } catch (err) {
    console.error('[BDS Scrape Poll Error]', err);
  }
}

function renderBdsScrapedGroupsTable(groups) {
  const tbody = document.getElementById('bds-scraped-groups-tbody');
  const summary = document.getElementById('bds-scrape-result-summary');
  const btns = document.getElementById('bds-scrape-results-btns');
  const btnSave = document.getElementById('btn-save-bds-scraped-groups');

  if (!tbody) return;

  if (summary) summary.textContent = `Đã tìm thấy ${groups.length} nhóm BĐS trên Facebook.`;
  if (btns) btns.style.display = 'flex';
  if (btnSave) {
    btnSave.disabled = false;
    document.getElementById('bds-scrape-save-count').textContent = groups.length;
  }

  tbody.innerHTML = groups.map((g, idx) => `
    <tr>
      <td><input type="checkbox" class="bds-scrape-item-chk" data-idx="${idx}" checked onchange="updateBdsScrapeSaveCount()"></td>
      <td>
        <strong>${escapeHtml(g.name)}</strong>
        <br><a href="${g.url}" target="_blank" style="font-size: 0.75rem; color: #06b6d4;">${g.url}</a>
      </td>
      <td><span class="badge-pill info"><i class="fa-solid fa-users"></i> ${g.members || 'N/A'}</span></td>
      <td><span class="badge-pill ${g.privacy === 'PUBLIC' ? 'emerald' : 'purple'}">${g.privacy === 'PUBLIC' ? 'Công Khai' : 'Riêng Tư'}</span></td>
      <td>${escapeHtml(g.province || 'Đà Nẵng')}</td>
      <td><span class="badge-pill ${g.isJoined ? 'emerald' : 'secondary'}">${g.isJoined ? 'Đã Vào' : 'Chưa Vào'}</span></td>
    </tr>
  `).join('');
}

function toggleSelectAllBdsScraped(checked) {
  document.querySelectorAll('.bds-scrape-item-chk').forEach(c => c.checked = checked);
  const chkAll = document.getElementById('bds-scrape-chk-all');
  if (chkAll) chkAll.checked = checked;
  updateBdsScrapeSaveCount();
}

function updateBdsScrapeSaveCount() {
  const checked = document.querySelectorAll('.bds-scrape-item-chk:checked').length;
  const btn = document.getElementById('btn-save-bds-scraped-groups');
  const countEl = document.getElementById('bds-scrape-save-count');
  if (countEl) countEl.textContent = checked;
  if (btn) btn.disabled = checked === 0;
}

async function saveSelectedBdsScrapedGroups() {
  const selectedIdxs = Array.from(document.querySelectorAll('.bds-scrape-item-chk:checked')).map(c => parseInt(c.dataset.idx, 10));
  if (selectedIdxs.length === 0) {
    showToast('Chưa chọn', 'Vui lòng tích chọn ít nhất 1 nhóm BĐS để nạp!', 'warning');
    return;
  }

  const category = document.getElementById('bds-scrape-input-category')?.value || 'Cho Thuê Căn Hộ';
  const targetGroups = selectedIdxs.map(i => {
    const item = currentBdsScrapedGroups[i];
    return {
      name: item.name,
      url: item.url,
      members: item.members,
      province: item.province || 'Đà Nẵng',
      district: item.district || '',
      category: category,
      privacy: item.privacy,
      isJoined: Boolean(item.isJoined)
    };
  });

  const btn = document.getElementById('btn-save-bds-scraped-groups');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';
  }

  try {
    const res = await fetch('/api/bds/groups/scrape/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: targetGroups })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Nạp Nhóm Thành Công', result.message, 'success');
      closeBdsScrapeGroupsModal();
      await loadBdsGroupsData();
    } else {
      showToast('Lỗi Lưu Nhóm', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-cloud-arrow-up"></i> Nạp ${selectedIdxs.length} Nhóm Vào Kho BĐS`;
    }
  }
}

// =========================================================
// 5.5. TỰ ĐỘNG XIN VÀO NHÓM BĐS (BDS AUTO GROUP JOINER)
// =========================================================

function openBdsAutoJoinModal() {
  const modal = document.getElementById('bds-auto-join-modal');
  if (modal) modal.classList.add('active');

  loadAccountsIntoBdsJoiner();
  renderBdsJoinGroupsTable();
}

function closeBdsAutoJoinModal() {
  const modal = document.getElementById('bds-auto-join-modal');
  if (modal) modal.classList.remove('active');
  if (bdsJoinInterval) {
    clearInterval(bdsJoinInterval);
    bdsJoinInterval = null;
  }
}

function loadAccountsIntoBdsJoiner() {
  const sel = document.getElementById('bds-join-select-account');
  if (!sel) return;

  const accounts = state.accounts || [];
  sel.innerHTML = accounts.map(a => `
    <option value="${a.id}" ${a.id === bdsGroupState.currentAccountId ? 'selected' : ''}>
      ${a.name || a.id} (${a.fbUserId || 'FB User'}) ${a.status === 'LIVE' ? '🟢' : '🟡'}
    </option>
  `).join('');

  sel.onchange = () => {
    bdsGroupState.currentAccountId = sel.value;
    renderBdsJoinGroupsTable();
  };
}

function setBdsJoinSpeedPreset(min, max, btn) {
  document.getElementById('bds-join-delay-min').value = min;
  document.getElementById('bds-join-delay-max').value = max;
  btn.parentElement.querySelectorAll('button').forEach(b => {
    b.className = 'btn btn-sm btn-secondary';
  });
  btn.className = 'btn btn-sm btn-primary';
}

function renderBdsJoinGroupsTable() {
  const tbody = document.getElementById('bds-join-groups-tbody');
  const summary = document.getElementById('bds-join-selection-summary');
  if (!tbody) return;

  const targetAccId = document.getElementById('bds-join-select-account')?.value || bdsGroupState.currentAccountId || 'acc_primary';
  const allGroups = bdsGroupState.groups || [];

  let filtered = allGroups;
  if (bdsHideJoinedInJoiner) {
    filtered = allGroups.filter(g => {
      const isJ = g.memberships?.[targetAccId]?.isJoined ?? g.isJoined;
      return !isJ;
    });
  }

  if (summary) {
    summary.textContent = `Hiển thị ${filtered.length} nhóm BĐS (Tổng kho: ${allGroups.length} nhóm).`;
  }

  bdsSelectedJoinGroupIds.clear();
  filtered.forEach(g => {
    const isJ = g.memberships?.[targetAccId]?.isJoined ?? g.isJoined;
    if (!isJ) bdsSelectedJoinGroupIds.add(g.id);
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center py-4" style="color: var(--text-muted);">Tài khoản này đã tham gia hết tất cả nhóm BĐS trong hệ thống!</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(g => {
    const isJ = g.memberships?.[targetAccId]?.isJoined ?? g.isJoined;
    const isChecked = bdsSelectedJoinGroupIds.has(g.id);
    return `
      <tr>
        <td><input type="checkbox" class="bds-join-item-chk" value="${g.id}" ${isChecked ? 'checked' : ''} onchange="toggleSelectBdsJoinGroup('${g.id}', this.checked)"></td>
        <td><strong>${escapeHtml(g.name)}</strong></td>
        <td><span class="badge-pill info"><i class="fa-solid fa-users"></i> ${g.members || 'N/A'}</span></td>
        <td>${escapeHtml(g.district || g.province || 'Đà Nẵng')}</td>
        <td><span class="badge-pill ${isJ ? 'emerald' : 'secondary'}">${isJ ? 'Đã Tham Gia' : 'Chưa Tham Gia'}</span></td>
      </tr>
    `;
  }).join('');
}

function toggleHideJoinedInBdsJoiner(checked) {
  bdsHideJoinedInJoiner = checked;
  renderBdsJoinGroupsTable();
}

function selectOnlyUnjoinedInBdsJoiner() {
  const targetAccId = document.getElementById('bds-join-select-account')?.value || bdsGroupState.currentAccountId;
  bdsSelectedJoinGroupIds.clear();
  (bdsGroupState.groups || []).forEach(g => {
    const isJ = g.memberships?.[targetAccId]?.isJoined ?? g.isJoined;
    if (!isJ) bdsSelectedJoinGroupIds.add(g.id);
  });
  renderBdsJoinGroupsTable();
}

function toggleSelectAllBdsJoin(checked) {
  document.querySelectorAll('.bds-join-item-chk').forEach(c => {
    c.checked = checked;
    if (checked) bdsSelectedJoinGroupIds.add(c.value);
    else bdsSelectedJoinGroupIds.delete(c.value);
  });
}

function toggleSelectBdsJoinGroup(id, checked) {
  if (checked) bdsSelectedJoinGroupIds.add(id);
  else bdsSelectedJoinGroupIds.delete(id);
}

async function startBdsAutoJoin() {
  const groupIds = Array.from(bdsSelectedJoinGroupIds);
  if (groupIds.length === 0) {
    showToast('Chưa chọn nhóm', 'Vui lòng tích chọn ít nhất 1 nhóm BĐS để xin tham gia!', 'warning');
    return;
  }

  const accountId = document.getElementById('bds-join-select-account')?.value || bdsGroupState.currentAccountId;
  const delayMin = parseInt(document.getElementById('bds-join-delay-min')?.value, 10) || 15;
  const delayMax = parseInt(document.getElementById('bds-join-delay-max')?.value, 10) || 25;
  const autoAnswer = document.getElementById('bds-join-auto-answer')?.value || '';

  try {
    const res = await fetch('/api/bds/groups/join/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds, accountId, delayMin, delayMax, autoAnswer })
    });
    const result = await res.json();

    if (!result.success) {
      showToast('Lỗi', result.message, 'danger');
      return;
    }

    showToast('Bắt Đầu Auto-Join BĐS', result.message, 'success');
    document.getElementById('btn-start-bds-join').style.display = 'none';
    document.getElementById('btn-pause-bds-join').style.display = 'inline-flex';
    document.getElementById('btn-stop-bds-join').style.display = 'inline-flex';

    if (bdsJoinInterval) clearInterval(bdsJoinInterval);
    bdsJoinInterval = setInterval(pollBdsJoinStatus, 2000);
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  }
}

async function pollBdsJoinStatus() {
  try {
    const res = await fetch('/api/bds/groups/join/status');
    const result = await res.json();
    if (!result.success) return;

    const { isRunning, isPaused, progress, logs } = result.data;

    document.getElementById('bds-join-stat-success').textContent = progress.successCount || 0;
    document.getElementById('bds-join-stat-pending').textContent = progress.pendingCount || 0;
    document.getElementById('bds-join-stat-fail').textContent = progress.failCount || 0;
    document.getElementById('bds-join-live-counter').textContent = `Tiến độ: ${progress.current || 0} / ${progress.total || 0}`;

    const pill = document.getElementById('bds-join-status-pill');
    if (pill) {
      if (isRunning && !isPaused) {
        pill.className = 'badge-pill emerald';
        pill.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${escapeHtml(progress.message || 'Đang xử lý...')}`;
      } else if (isPaused) {
        pill.className = 'badge-pill warning';
        pill.innerHTML = `<i class="fa-solid fa-pause"></i> Tạm dừng: ${escapeHtml(progress.message)}`;
      } else {
        pill.className = 'badge-pill secondary';
        pill.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHtml(progress.message || 'Hoàn tất')}`;
      }
    }

    const logsBox = document.getElementById('bds-join-logs-box');
    if (logsBox && logs && logs.length > 0) {
      logsBox.innerHTML = logs.map(l => {
        const cls = l.type === 'error' ? 'log-error' : (l.type === 'success' ? 'log-success' : (l.type === 'warn' ? 'log-warn' : 'log-info'));
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${escapeHtml(l.message)}</div>`;
      }).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    if (!isRunning) {
      clearInterval(bdsJoinInterval);
      bdsJoinInterval = null;
      document.getElementById('btn-start-bds-join').style.display = 'inline-flex';
      document.getElementById('btn-pause-bds-join').style.display = 'none';
      document.getElementById('btn-resume-bds-join').style.display = 'none';
      document.getElementById('btn-stop-bds-join').style.display = 'none';
      await loadBdsGroupsData();
    }
  } catch (err) {
    console.error('[BDS Join Poll Error]', err);
  }
}

async function pauseBdsAutoJoin() {
  await fetch('/api/bds/groups/join/pause', { method: 'POST' });
  document.getElementById('btn-pause-bds-join').style.display = 'none';
  document.getElementById('btn-resume-bds-join').style.display = 'inline-flex';
}

async function resumeBdsAutoJoin() {
  await fetch('/api/bds/groups/join/resume', { method: 'POST' });
  document.getElementById('btn-resume-bds-join').style.display = 'none';
  document.getElementById('btn-pause-bds-join').style.display = 'inline-flex';
}

async function stopBdsAutoJoin() {
  await fetch('/api/bds/groups/join/stop', { method: 'POST' });
}

// =========================================================
// 5.6. QUÉT TRẠNG THÁI REALTIME HÀNG LOẠT (BDS REALTIME VERIFY)
// =========================================================

function openBdsRealtimeVerifyModal() {
  const modal = document.getElementById('bds-realtime-verify-modal');
  if (modal) modal.classList.add('active');

  loadAccountsIntoBdsVerify();
}

function closeBdsRealtimeVerifyModal() {
  const modal = document.getElementById('bds-realtime-verify-modal');
  if (modal) modal.classList.remove('active');
  if (bdsVerifyInterval) {
    clearInterval(bdsVerifyInterval);
    bdsVerifyInterval = null;
  }
}

function loadAccountsIntoBdsVerify() {
  const sel = document.getElementById('bds-verify-account-select');
  if (!sel) return;

  const accounts = state.accounts || [];
  sel.innerHTML = accounts.map(a => `
    <option value="${a.id}" ${a.id === bdsGroupState.currentAccountId ? 'selected' : ''}>
      ${a.name || a.id} (${a.fbUserId || 'FB User'}) ${a.status === 'LIVE' ? '🟢' : '🟡'}
    </option>
  `).join('');
}

async function startBdsRealtimeBatchVerify() {
  const accountId = document.getElementById('bds-verify-account-select')?.value || bdsGroupState.currentAccountId;
  const scope = document.getElementById('bds-verify-scope-select')?.value || 'ALL';

  let targetGroups = bdsGroupState.groups || [];
  if (scope === 'UNJOINED_ONLY') {
    targetGroups = targetGroups.filter(g => !(g.memberships?.[accountId]?.isJoined ?? g.isJoined));
  } else if (scope === 'JOINED_ONLY') {
    targetGroups = targetGroups.filter(g => Boolean(g.memberships?.[accountId]?.isJoined ?? g.isJoined));
  }

  const groupIds = targetGroups.map(g => g.id);
  if (groupIds.length === 0) {
    showToast('Không Có Nhóm', 'Không có nhóm BĐS nào phù hợp với phạm vi quét đã chọn!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/bds/groups/verify-batch/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds, accountId, delayMin: 2, delayMax: 4 })
    });
    const result = await res.json();

    if (!result.success) {
      showToast('Lỗi', result.message, 'danger');
      return;
    }

    showToast('Bắt Đầu Quét Realtime BĐS', result.message, 'success');
    document.getElementById('btn-start-bds-verify').style.display = 'none';
    document.getElementById('btn-pause-bds-verify').style.display = 'inline-flex';
    document.getElementById('btn-stop-bds-verify').style.display = 'inline-flex';

    updateBdsGroupToolbarButtonsState('REALTIME_VERIFY', 0, groupIds.length);

    if (bdsVerifyInterval) clearInterval(bdsVerifyInterval);
    bdsVerifyInterval = setInterval(pollBdsRealtimeVerifyStatus, 1500);
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  }
}

async function pollBdsRealtimeVerifyStatus() {
  try {
    const res = await fetch('/api/bds/groups/verify-batch/status');
    const result = await res.json();
    if (!result.success) return;

    const { isRunning, isPaused, progress, logs, results } = result.data;

    document.getElementById('bds-verify-stat-progress').textContent = `${progress.current || 0} / ${progress.total || 0}`;
    document.getElementById('bds-verify-stat-joined').textContent = progress.joinedCount || 0;
    document.getElementById('bds-verify-stat-notjoined').textContent = progress.notJoinedCount || 0;
    document.getElementById('bds-verify-stat-pending').textContent = progress.pendingCount || 0;
    document.getElementById('bds-verify-stat-error').textContent = progress.errorCount || 0;

    const percent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    document.getElementById('bds-verify-progress-percent').textContent = `${percent}%`;
    document.getElementById('bds-verify-progress-bar').style.width = `${percent}%`;
    document.getElementById('bds-verify-progress-message').textContent = progress.message || 'Đang quét...';

    // Cập nhật badge chạy trên nút Toolbar BĐS: "Quét Trạng Thái Realtime 3/157"
    if (isRunning) {
      updateBdsGroupToolbarButtonsState('REALTIME_VERIFY', progress.current || 0, progress.total || 0);
    }

    const logsBox = document.getElementById('bds-verify-logs-box');
    if (logsBox && logs && logs.length > 0) {
      logsBox.innerHTML = logs.map(l => {
        const cls = l.type === 'error' ? 'log-error' : (l.type === 'success' ? 'log-success' : (l.type === 'warn' ? 'log-warn' : 'log-info'));
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${escapeHtml(l.message)}</div>`;
      }).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    // Kết quả chi tiết
    const resContainer = document.getElementById('bds-verify-results-container');
    const resTbody = document.getElementById('bds-verify-results-tbody');
    if (results && results.length > 0 && resTbody) {
      resContainer.style.display = 'block';
      resTbody.innerHTML = results.slice(-20).reverse().map(r => `
        <tr>
          <td><strong>${escapeHtml(r.groupName)}</strong></td>
          <td><span class="badge-pill ${r.isJoined ? 'emerald' : (r.isPending ? 'warning' : 'secondary')}">${r.isJoined ? 'ĐÃ THAM GIA' : (r.isPending ? 'CHỜ DUYỆT' : 'CHƯA VÀO')}</span></td>
          <td style="font-size: 0.75rem; color: var(--text-dim);">${escapeHtml(r.note || '')}</td>
          <td style="font-size: 0.72rem; color: var(--text-muted);">${r.time || ''}</td>
        </tr>
      `).join('');
    }

    if (!isRunning) {
      clearInterval(bdsVerifyInterval);
      bdsVerifyInterval = null;
      document.getElementById('btn-start-bds-verify').style.display = 'inline-flex';
      document.getElementById('btn-pause-bds-verify').style.display = 'none';
      document.getElementById('btn-resume-bds-verify').style.display = 'none';
      document.getElementById('btn-stop-bds-verify').style.display = 'none';

      updateBdsGroupToolbarButtonsState(null);
      await loadBdsGroupsData();
    }
  } catch (err) {
    console.error('[BDS Verify Poll Error]', err);
  }
}

async function pauseBdsRealtimeVerify() {
  await fetch('/api/bds/groups/verify-batch/pause', { method: 'POST' });
  document.getElementById('btn-pause-bds-verify').style.display = 'none';
  document.getElementById('btn-resume-bds-verify').style.display = 'inline-flex';
}

async function resumeBdsRealtimeVerify() {
  await fetch('/api/bds/groups/verify-batch/resume', { method: 'POST' });
  document.getElementById('btn-resume-bds-verify').style.display = 'none';
  document.getElementById('btn-pause-bds-verify').style.display = 'inline-flex';
}

async function stopBdsRealtimeVerify() {
  await fetch('/api/bds/groups/verify-batch/stop', { method: 'POST' });
  updateBdsGroupToolbarButtonsState(null);
}

