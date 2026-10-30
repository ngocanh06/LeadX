/**
 * industryAssets.js - Quản Lý Kho Ảnh Ngành Nghề (Industry Asset Hub)
 * Phục vụ tạo AI Human Graphic Poster và Xuất bản Fanpage
 */

const iaState = {
  data: null,
  activeCategory: 'office_admin',
  searchQuery: '',
  pickerCallback: null,
  pickerActiveCategory: 'office_admin'
};

// 1. TẢI DỮ LIỆU KHO ẢNH
async function loadIndustryAssets(forceRefresh = false) {
  const container = document.getElementById('ia-photos-grid');
  if (container && (!iaState.data || forceRefresh)) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 50px 20px; color: var(--text-dim);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 12px; display: block; color: var(--primary);"></i>
        Đang nạp thư viện ảnh stock thực tế theo ngành nghề...
      </div>
    `;
  }

  try {
    const res = await fetch('/api/stock-photos?t=' + Date.now());
    const result = await res.json();
    if (!result.success || !result.data) {
      throw new Error(result.message || 'Không thể tải kho ảnh');
    }

    iaState.data = result.data;
    if (iaState.data && iaState.data.categories && iaState.data.categories.length > 0) {
      const exists = iaState.data.categories.some(c => c.id === iaState.activeCategory);
      if (!exists) {
        iaState.activeCategory = iaState.data.categories[0].id;
      }
    }
    renderIndustryStats();
    renderIndustryCategoryTabs();
    renderIndustryPhotosGrid();
  } catch (err) {
    console.error('Error loading industry assets:', err);
    if (container) {
      container.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: #ef4444;">
          <i class="fa-solid fa-circle-exclamation" style="font-size: 2rem; margin-bottom: 10px; display: block;"></i>
          Lỗi nạp kho ảnh: ${err.message}
          <div style="margin-top: 12px;">
            <button class="btn btn-sm btn-primary" onclick="loadIndustryAssets(true)">Thử lại</button>
          </div>
        </div>
      `;
    }
  }
}

// 2. HIỂN THỊ THỐNG KÊ TỔNG QUAN
function renderIndustryStats() {
  if (!iaState.data || !iaState.data.stats) return;
  const s = iaState.data.stats;

  const totalEl = document.getElementById('ia-stat-total-photos');
  const catEl = document.getElementById('ia-stat-total-categories');
  const sizeEl = document.getElementById('ia-stat-total-size');

  if (totalEl) totalEl.textContent = s.totalPhotos || 0;
  if (catEl) catEl.textContent = s.totalCategories || 0;
  if (sizeEl) sizeEl.textContent = s.totalBytesFormatted || '0 MB';
}

// 3. HIỂN THỊ DANH SÁCH TABS NGÀNH NGHỀ
function renderIndustryCategoryTabs() {
  const container = document.getElementById('ia-categories-tabs');
  if (!container || !iaState.data || !iaState.data.categories) return;

  const categories = iaState.data.categories;

  container.innerHTML = categories.map(cat => {
    const isActive = iaState.activeCategory === cat.id;
    const displayName = cat.shortName || cat.name || cat.id;
    const iconClass = cat.icon || 'fa-solid fa-folder-open';
    const iconColor = isActive ? '#fff' : (cat.color || '#3b82f6');
    return `
      <button 
        class="btn btn-sm ${isActive ? 'btn-primary active' : 'btn-secondary'}" 
        onclick="switchIndustryCategory('${cat.id}')"
        title="${escapeHtml(cat.name || displayName)}"
        style="display: flex; align-items: center; gap: 7px; padding: 7px 13px; border-radius: var(--radius-sm); font-size: 0.8rem; font-weight: 600; transition: all 0.2s;"
      >
        <i class="${iconClass}" style="color: ${iconColor};"></i>
        <span>${escapeHtml(displayName)}</span>
        <span class="badge-pill" style="font-size: 0.68rem; padding: 1px 6px; background: ${isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-card)'}; color: ${isActive ? '#fff' : 'var(--text-main)'};">
          ${cat.count}
        </span>
      </button>
    `;
  }).join('');
}

// 4. CHUYỂN ĐỔI NGÀNH NGHỀ ĐANG CHỌN
function switchIndustryCategory(catId) {
  iaState.activeCategory = catId;
  renderIndustryCategoryTabs();
  renderIndustryPhotosGrid();
}

// 5. HIỂN THỊ LƯỚI ẢNH THEO NGÀNH ĐANG CHỌN
function renderIndustryPhotosGrid() {
  const container = document.getElementById('ia-photos-grid');
  const descEl = document.getElementById('ia-active-category-desc');
  const nameEl = document.getElementById('ia-active-category-name');
  if (!container || !iaState.data) return;

  const currentCat = iaState.data.categories.find(c => c.id === iaState.activeCategory) || iaState.data.categories[0];
  if (!currentCat) return;

  if (nameEl) {
    nameEl.innerHTML = `<i class="${currentCat.icon}" style="color: ${currentCat.color}; margin-right: 6px;"></i> ${escapeHtml(currentCat.name)}`;
  }
  if (descEl) {
    descEl.textContent = currentCat.description;
  }

  let photos = currentCat.photos || [];

  // Lọc theo search
  if (iaState.searchQuery) {
    const q = iaState.searchQuery.toLowerCase();
    photos = photos.filter(p => p.filename.toLowerCase().includes(q));
  }

  if (photos.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 60px 20px; background: var(--bg-hover); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-images" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 12px; display: block; opacity: 0.5;"></i>
        <div style="font-weight: 600; color: var(--text-main); font-size: 0.95rem;">Chưa có ảnh nào trong ngành "${escapeHtml(currentCat.name)}"</div>
        <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 4px; margin-bottom: 16px;">
          Bạn có thể tải thêm ảnh chất lượng cao để AI sử dụng khi tạo poster tự động.
        </div>
        <button class="btn btn-sm btn-primary" onclick="openUploadIndustryPhotoModal('${currentCat.id}')">
          <i class="fa-solid fa-cloud-arrow-up"></i> Tải Ảnh Vào Ngành Này
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = photos.map(photo => {
    return `
      <div class="ia-photo-card" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 10px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.06); transition: transform 0.2s, box-shadow 0.2s; display: flex; flex-direction: column;">
        <div style="position: relative; width: 100%; height: 210px; background: #0f172a; overflow: hidden; cursor: pointer;" onclick="zoomIndustryPhoto('${photo.url}')" title="Bấm vào để xem ảnh lớn">
          <img 
            src="${photo.url}" 
            alt="${escapeHtml(photo.filename)}" 
            loading="lazy"
            style="width: 100%; height: 100%; object-fit: cover; display: block; transition: transform 0.3s ease;"
            onmouseover="this.style.transform='scale(1.05)'"
            onmouseout="this.style.transform='scale(1)'"
          />
          <div style="position: absolute; top: 10px; left: 10px; background: rgba(15, 23, 42, 0.75); backdrop-filter: blur(4px); color: #fff; font-size: 0.68rem; font-weight: 600; padding: 2px 7px; border-radius: 4px; border: 1px solid rgba(255,255,255,0.15);">
            <i class="fa-solid fa-weight-hanging"></i> ${photo.sizeFormatted}
          </div>
          <div style="position: absolute; bottom: 10px; right: 10px; background: rgba(15, 23, 42, 0.8); backdrop-filter: blur(4px); color: #fff; font-size: 0.68rem; font-weight: 600; padding: 3px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,0.15);">
            <i class="fa-solid fa-magnifying-glass-plus"></i> Xem lớn
          </div>
        </div>
        <div style="padding: 12px 14px; flex: 1; display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="font-weight: 600; font-size: 0.82rem; color: var(--text-main); word-break: break-all; margin-bottom: 4px;" title="${escapeHtml(photo.filename)}">
              ${escapeHtml(photo.filename)}
            </div>
            <div style="font-size: 0.72rem; color: var(--text-dim); display: flex; align-items: center; gap: 6px;">
              <span class="badge-pill info" style="font-size: 0.65rem; padding: 1px 5px;">
                <i class="${currentCat.icon}"></i> ${escapeHtml(currentCat.shortName)}
              </span>
              <span>Stock Thực Tế</span>
            </div>
          </div>
          <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 8px;">
            <a href="${photo.url}" target="_blank" class="btn btn-sm btn-outline" style="font-size: 0.72rem; padding: 3px 8px; text-decoration: none;" title="Mở link ảnh trong tab mới">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Link
            </a>
            <button class="btn btn-sm btn-outline-danger" onclick="deleteIndustryPhoto('${currentCat.id}', '${photo.filename}')" style="font-size: 0.72rem; padding: 3px 8px;" title="Xóa ảnh khỏi ngành này">
              <i class="fa-solid fa-trash-can"></i> Xóa
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// 6. XEM PHÓNG TO ẢNH (ZOOM PREVIEW)
function zoomIndustryPhoto(src) {
  if (typeof openPosterZoomModal === 'function') {
    openPosterZoomModal(src);
  } else {
    window.open(src, '_blank');
  }
}

// 7. MODAL TẢI ẢNH MỚI LÊN KHO
function openUploadIndustryPhotoModal(preferredCatId = '') {
  let modal = document.getElementById('ia-upload-modal');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'ia-upload-modal';
    div.className = 'modal-overlay';
    div.style.zIndex = '9999';
    div.innerHTML = `
      <div class="modal-card" style="max-width: 520px; width: 92vw; background: var(--bg-card); padding: 20px; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
          <strong style="color: var(--text-main); font-size: 1rem;">
            <i class="fa-solid fa-cloud-arrow-up text-primary"></i> Tải Thêm Ảnh Vào Kho Ngành Nghề
          </strong>
          <button class="btn-close" onclick="closeUploadIndustryPhotoModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <form id="ia-upload-form" onsubmit="handleIndustryPhotoUpload(event)">
          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">
              Chọn Nhóm Ngành Nghề Mục Tiêu:
            </label>
            <select id="ia-upload-cat-select" class="form-control" style="width: 100%; font-size: 0.85rem; padding: 8px 12px; background: var(--bg-card); color: var(--text-main); border: 1px solid var(--border-color); border-radius: var(--radius-sm);" required>
              <!-- Render categories -->
            </select>
          </div>

          <div style="margin-bottom: 14px;">
            <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-main); margin-bottom: 6px;">
              Chọn Tệp Ảnh (JPG, PNG, WEBP):
            </label>
            <div 
              id="ia-drop-zone"
              onclick="document.getElementById('ia-upload-file-input').click()"
              style="border: 2px dashed var(--border-color); border-radius: 8px; padding: 26px 16px; text-align: center; cursor: pointer; background: var(--bg-hover); transition: border-color 0.2s;"
            >
              <i class="fa-solid fa-image" style="font-size: 2.2rem; color: var(--primary); margin-bottom: 8px; display: block;"></i>
              <div style="font-size: 0.85rem; font-weight: 600; color: var(--text-main);">Kéo thả ảnh vào đây hoặc bấm để chọn tệp</div>
              <div style="font-size: 0.74rem; color: var(--text-dim); margin-top: 4px;">Khuyến nghị ảnh người thật chụp môi trường làm việc thực tế, tỉ lệ 1:1 hoặc 4:3 (Dung lượng &lt; 15MB)</div>
              <input type="file" id="ia-upload-file-input" accept=".jpg,.jpeg,.png,.webp" style="display: none;" onchange="handleIndustryFileSelect(this)">
            </div>
          </div>

          <!-- Xem trước ảnh -->
          <div id="ia-upload-preview-container" style="display: none; margin-bottom: 16px; text-align: center;">
            <img id="ia-upload-preview-img" src="" style="max-height: 160px; max-width: 100%; object-fit: contain; border-radius: 6px; border: 1px solid var(--border-color); margin: 0 auto; display: block;">
            <div id="ia-upload-preview-name" style="font-size: 0.75rem; color: var(--text-dim); margin-top: 5px;"></div>
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeUploadIndustryPhotoModal()">Hủy</button>
            <button type="submit" class="btn btn-primary btn-sm" id="ia-upload-submit-btn" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <i class="fa-solid fa-check"></i> Xác Nhận Tải Lên
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(div);
    modal = div;
  }

  // Populate categories dropdown
  const sel = document.getElementById('ia-upload-cat-select');
  if (sel && iaState.data && iaState.data.categories) {
    sel.innerHTML = iaState.data.categories.map(c => `
      <option value="${c.id}" ${(preferredCatId || iaState.activeCategory) === c.id ? 'selected' : ''}>
        ${escapeHtml(c.name)} (${c.count} ảnh)
      </option>
    `).join('');
  }

  // Reset file input & preview
  const fileInput = document.getElementById('ia-upload-file-input');
  if (fileInput) fileInput.value = '';
  const previewContainer = document.getElementById('ia-upload-preview-container');
  if (previewContainer) previewContainer.style.display = 'none';

  modal.style.display = 'flex';
  modal.classList.add('active');
}

function closeUploadIndustryPhotoModal() {
  const modal = document.getElementById('ia-upload-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function handleIndustryFileSelect(input) {
  if (input.files && input.files[0]) {
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = function(e) {
      const previewContainer = document.getElementById('ia-upload-preview-container');
      const previewImg = document.getElementById('ia-upload-preview-img');
      const previewName = document.getElementById('ia-upload-preview-name');
      if (previewContainer && previewImg) {
        previewImg.src = e.target.result;
        if (previewName) previewName.textContent = `${file.name} (${(file.size / 1024).toFixed(1)} KB)`;
        previewContainer.style.display = 'block';
      }
    };
    reader.readAsDataURL(file);
  }
}

async function handleIndustryPhotoUpload(event) {
  event.preventDefault();
  const fileInput = document.getElementById('ia-upload-file-input');
  const catSelect = document.getElementById('ia-upload-cat-select');
  const submitBtn = document.getElementById('ia-upload-submit-btn');

  if (!fileInput || !fileInput.files || !fileInput.files[0]) {
    if (typeof showToast === 'function') showToast('Lỗi', 'Vui lòng chọn file ảnh để tải lên.', 'warning');
    return;
  }

  const file = fileInput.files[0];
  const category = catSelect ? catSelect.value : 'general';

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('category', category);

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tải lên...';
  }

  try {
    const res = await fetch('/api/stock-photos/upload', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Lỗi khi tải ảnh lên');

    if (typeof showToast === 'function') {
      showToast('Thành công', 'Đã thêm ảnh vào kho ngành nghề thành công!', 'success');
    }

    closeUploadIndustryPhotoModal();
    iaState.activeCategory = category;
    loadIndustryAssets(true);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi tải ảnh', err.message, 'danger');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-check"></i> Xác Nhận Tải Lên';
    }
  }
}

// 8. XÓA ẢNH KHỎI KHO NGÀNH NGHỀ
async function deleteIndustryPhoto(categoryId, filename) {
  if (!confirm(`Bạn có chắc muốn xóa ảnh "${filename}" khỏi kho ảnh ngành nghề?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/stock-photos/${encodeURIComponent(categoryId)}/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Lỗi khi xóa ảnh');

    if (typeof showToast === 'function') {
      showToast('Đã xóa', 'Ảnh đã được xóa khỏi kho ngành nghề.', 'info');
    }
    loadIndustryAssets(true);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi xóa ảnh', err.message, 'danger');
  }
}

// 9. MODAL CHỌN ẢNH TỪ KHO NGÀNH (PICKER MODAL FOR POST INSPECTOR)
function openStockPhotoPickerModal(onSelectCallback, currentJobTitle = '') {
  iaState.pickerCallback = onSelectCallback;

  let modal = document.getElementById('stock-photo-picker-modal');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'stock-photo-picker-modal';
    div.className = 'modal-overlay';
    div.style.zIndex = '99999';
    div.innerHTML = `
      <div class="modal-card" style="max-width: 880px; width: 94vw; max-height: 88vh; display: flex; flex-direction: column; background: var(--bg-card); padding: 20px; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
          <div>
            <strong style="color: var(--text-main); font-size: 1.05rem; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-images text-primary"></i> Chọn Ảnh Poster Từ Kho Ngành Nghề
            </strong>
            <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
              Chọn tấm ảnh thực tế ưng ý nhất để thay thế làm Poster bài tuyển dụng trước khi xuất bản lên Fanpage.
            </div>
          </div>
          <button class="btn-close" onclick="closeStockPhotoPickerModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <!-- Category Filter Tabs inside Picker -->
        <div id="ia-picker-tabs" style="display: flex; gap: 6px; overflow-x: auto; padding-bottom: 8px; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); flex-wrap: wrap;">
          <!-- Tabs rendered dynamically -->
        </div>

        <!-- Photos Grid inside Picker -->
        <div id="ia-picker-grid" style="flex: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; padding: 6px 2px;">
          <!-- Photos rendered dynamically -->
        </div>

        <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 10px;">
          <div style="font-size: 0.74rem; color: var(--text-dim);">
            <i class="fa-solid fa-circle-info text-info"></i> Nhấp chuột vào bất kỳ ảnh nào để áp dụng ngay vào bài đăng.
          </div>
          <button class="btn btn-secondary btn-sm" onclick="closeStockPhotoPickerModal()">Đóng</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    modal = div;
  }

  // Detect matching category from job title
  if (currentJobTitle && iaState.data && iaState.data.categories) {
    const jt = currentJobTitle.toLowerCase();
    for (const cat of iaState.data.categories) {
      if (cat.keywords && cat.keywords.some(k => jt.includes(k.toLowerCase()))) {
        iaState.pickerActiveCategory = cat.id;
        break;
      }
    }
  }

  renderStockPhotoPickerContent();
  modal.style.display = 'flex';
  modal.classList.add('active');
}

function renderStockPhotoPickerContent() {
  if (!iaState.data || !iaState.data.categories) {
    // Nếu chưa nạp, gọi fetch
    fetch('/api/stock-photos').then(r => r.json()).then(res => {
      if (res.success && res.data) {
        iaState.data = res.data;
        renderStockPhotoPickerContent();
      }
    });
    return;
  }

  const tabsContainer = document.getElementById('ia-picker-tabs');
  const gridContainer = document.getElementById('ia-picker-grid');
  if (!tabsContainer || !gridContainer) return;

  const categories = iaState.data.categories;

  // Render Tabs
  tabsContainer.innerHTML = categories.map(c => {
    const isActive = iaState.pickerActiveCategory === c.id;
    const displayName = c.shortName || c.name || c.id;
    return `
      <button 
        class="btn btn-sm ${isActive ? 'btn-primary' : 'btn-outline'}" 
        onclick="switchPickerCategory('${c.id}')"
        title="${escapeHtml(c.name || displayName)}"
        style="font-size: 0.76rem; padding: 4px 10px; display: flex; align-items: center; gap: 5px;"
      >
        <i class="${c.icon || 'fa-solid fa-folder'}"></i> ${escapeHtml(displayName)} (${c.count})
      </button>
    `;
  }).join('');

  // Render Grid
  const currentCat = categories.find(c => c.id === iaState.pickerActiveCategory) || categories[0];
  const photos = currentCat ? currentCat.photos : [];

  if (photos.length === 0) {
    gridContainer.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--text-dim);">Chưa có ảnh trong danh mục này.</div>';
    return;
  }

  gridContainer.innerHTML = photos.map(p => {
    return `
      <div 
        class="ia-picker-card" 
        onclick="selectPhotoFromPicker('${p.url}')"
        style="cursor: pointer; border-radius: 8px; overflow: hidden; border: 2px solid var(--border-color); background: var(--bg-hover); transition: all 0.2s; position: relative;"
        onmouseover="this.style.borderColor='var(--primary)'; this.style.transform='scale(1.03)'"
        onmouseout="this.style.borderColor='var(--border-color)'; this.style.transform='scale(1)'"
        title="Bấm để chọn ảnh này làm Poster"
      >
        <div style="width: 100%; height: 140px; overflow: hidden;">
          <img src="${p.url}" alt="${escapeHtml(p.filename)}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
        </div>
        <div style="padding: 6px 8px; font-size: 0.7rem; font-weight: 600; color: var(--text-main); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: center;">
          ${escapeHtml(p.filename)}
        </div>
        <div style="position: absolute; top: 6px; right: 6px; background: rgba(16, 185, 129, 0.9); color: #fff; font-size: 0.65rem; font-weight: 700; padding: 2px 6px; border-radius: 4px;">
          Chọn ảnh
        </div>
      </div>
    `;
  }).join('');
}

function switchPickerCategory(catId) {
  iaState.pickerActiveCategory = catId;
  renderStockPhotoPickerContent();
}

function selectPhotoFromPicker(photoUrl) {
  if (typeof iaState.pickerCallback === 'function') {
    iaState.pickerCallback(photoUrl);
  }
  closeStockPhotoPickerModal();
}

function closeStockPhotoPickerModal() {
  const modal = document.getElementById('stock-photo-picker-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

// Search input handler
function handleIndustrySearchInput(value) {
  iaState.searchQuery = (value || '').trim();
  renderIndustryPhotosGrid();
}

// Global Exports
window.loadIndustryAssets = loadIndustryAssets;
window.switchIndustryCategory = switchIndustryCategory;
window.openUploadIndustryPhotoModal = openUploadIndustryPhotoModal;
window.closeUploadIndustryPhotoModal = closeUploadIndustryPhotoModal;
window.handleIndustryFileSelect = handleIndustryFileSelect;
window.handleIndustryPhotoUpload = handleIndustryPhotoUpload;
window.deleteIndustryPhoto = deleteIndustryPhoto;
window.zoomIndustryPhoto = zoomIndustryPhoto;
window.openStockPhotoPickerModal = openStockPhotoPickerModal;
window.closeStockPhotoPickerModal = closeStockPhotoPickerModal;
window.switchPickerCategory = switchPickerCategory;
window.selectPhotoFromPicker = selectPhotoFromPicker;
window.handleIndustrySearchInput = handleIndustrySearchInput;
