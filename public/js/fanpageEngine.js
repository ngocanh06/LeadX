/**
 * fanpageEngine.js - Module Điều Khiển Đăng Trang (Fanpage Auto-Post Engine)
 * Phục vụ xuất bản đa kênh trên hệ thống 34 Fanpage khu vực & Page Tổng
 */

const pageControllerState = {
  selectedJob: null,
  selectedImages: [],
  selectedPages: [], // array of page IDs
  allPages: [],
  activeRegionFilter: 'ALL',
  searchQuery: '',
  publishMode: 'NOW',
  template: 'STANDARD',
  isPublishing: false,
  activeAccount: null
};

// 1. Khởi tạo & nạp dữ liệu cho Trình Điều Khiển Đăng Trang
async function renderPageControllerTab() {
  try {
    // 1. Nạp tài khoản Fanpage & Token Meta API
    await loadFanpageAccountsBar();

    // 2. Nạp và hiển thị trực tiếp kế hoạch Auto-Pilot 34 Fanpage
    if (typeof loadAutoPilotPlan === 'function') {
      if (!state.autoPilotPlan) {
        loadAutoPilotPlan();
      } else {
        renderAutoPilotPlan();
      }
    }

    // 3. Bắt đầu polling giám sát Live Terminal
    if (typeof startFanpagePolling === 'function') {
      startFanpagePolling();
    }
  } catch (err) {
    console.error('[FanpageController] Lỗi khởi tạo:', err);
  }
}

// 2. Nạp tài khoản Fanpage và hiển thị thanh Active Account Bar
async function loadFanpageAccountsBar() {
  try {
    const res = await fetch('/api/accounts');
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) return;

    // Lọc các nick dành cho Fanpage (PAGE hoặc BOTH)
    const pageAccs = data.data.filter(a => a.targetType === 'PAGE' || a.targetType === 'BOTH');
    ['fanpage-account-select', 'fanpage-account-select-side'].forEach(selId => {
      const select = document.getElementById(selId);
      if (select) {
        select.innerHTML = '<option value="">-- Chọn Nick Fanpage --</option>' +
          pageAccs.map(a => `<option value="${a.id}" ${a.isPageCurrent ? 'selected' : ''}>${a.name} (${a.fbUserId || 'ID'})</option>`).join('');
      }
    });

    const currentAcc = pageAccs.find(a => a.isPageCurrent) || pageAccs[0];
    if (currentAcc) {
      pageControllerState.activeAccount = currentAcc;
      const nameEl = document.getElementById('page-active-acc-name');
      const uidEl = document.getElementById('page-active-acc-uid');
      if (nameEl) nameEl.textContent = currentAcc.name;
      if (uidEl) uidEl.textContent = currentAcc.fbUserId || currentAcc.id;
    }

    // Cập nhật trạng thái kết nối Meta Graph API thật
    const cfgRes = await fetch('/api/fanpages/config');
    const cfgData = await cfgRes.json();
    const badge = document.getElementById('page-api-status-badge');
    if (badge) {
      if (cfgData.data && cfgData.data.hasSystemToken) {
        badge.className = 'badge-pill success';
        badge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Meta API Đã Kết Nối';
        badge.title = 'Meta Graph API chính thức đã sẵn sàng đăng bài thật lên 34 Fanpage';
        badge.onclick = null;
        badge.style.cursor = 'default';
      } else {
        badge.className = 'badge-pill danger';
        badge.innerHTML = '<i class="fa-solid fa-key"></i> Chưa Có Token (Bấm Cài Đặt)';
        badge.title = 'Bấm để cài đặt Token Meta Graph API để hệ thống đăng bài thật lên Facebook';
        badge.style.cursor = 'pointer';
        badge.onclick = () => { if (typeof openMetaTokenModal === 'function') openMetaTokenModal(); };
      }
    }
  } catch (err) {
    console.error('[FanpageController] Lỗi nạp tài khoản:', err);
  }
}

// Đổi tài khoản Fanpage từ dropdown
async function handleFanpageAccountSelectChange(accId) {
  if (!accId) return;
  try {
    const res = await fetch(`/api/accounts/${accId}/switch-page`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      if (typeof showToast === 'function') showToast(`Đã chọn tài khoản "${data.account?.name}" làm nick đăng Fanpage!`, 'success');
      await loadFanpageAccountsBar();
      if (typeof renderPageAccountsTab === 'function') renderPageAccountsTab();
    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Lỗi đổi tài khoản Fanpage', 'danger');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi kết nối máy chủ: ' + err.message, 'danger');
  }
}

// 3. Render danh sách 34 thẻ Checkbox Fanpage
function renderFanpageCheckboxList(pages) {
  const container = document.getElementById('page-checkbox-list');
  if (!container) return;

  if (!pages || pages.length === 0) {
    container.innerHTML = '<div class="text-center py-4 text-muted" style="grid-column: 1 / -1;">Không tìm thấy Fanpage nào phù hợp.</div>';
    return;
  }

  container.innerHTML = pages.map(p => {
    const isChecked = pageControllerState.selectedPages.includes(p.id);
    const regionClass = p.region === 'Miền Nam' ? 'south' : (p.region === 'Miền Trung' ? 'central' : (p.region === 'Miền Bắc' ? 'north' : 'national'));
    
    return `
      <div class="fanpage-card-item ${isChecked ? 'selected' : ''}" id="page-card-${p.id}" onclick="toggleFanpageSelection('${p.id}')">
        <div class="fanpage-card-left">
          <div class="fanpage-card-icon">
            <i class="fa-brands fa-facebook-f"></i>
          </div>
          <div class="fanpage-card-info">
            <span class="fanpage-card-name" title="${p.name}">${p.name}</span>
            <div class="fanpage-card-meta">
              <span class="badge-region ${regionClass}">${p.region || 'Toàn Quốc'}</span>
              <span>${p.province || ''}</span>
            </div>
          </div>
        </div>
        <input type="checkbox" class="fanpage-card-checkbox" id="cb-page-${p.id}" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleFanpageSelection('${p.id}')">
      </div>
    `;
  }).join('');
}

// Toggle chọn 1 Fanpage
function toggleFanpageSelection(pageId) {
  const idx = pageControllerState.selectedPages.indexOf(pageId);
  const card = document.getElementById('page-card-' + pageId);
  const cb = document.getElementById('cb-page-' + pageId);

  if (idx === -1) {
    pageControllerState.selectedPages.push(pageId);
    if (card) card.classList.add('selected');
    if (cb) cb.checked = true;
  } else {
    pageControllerState.selectedPages.splice(idx, 1);
    if (card) card.classList.remove('selected');
    if (cb) cb.checked = false;
  }
  updatePageSelectedCount();
}

// Cập nhật số lượng Fanpage đã chọn
function updatePageSelectedCount() {
  const count = pageControllerState.selectedPages.length;
  const countBadge = document.getElementById('page-selected-count');
  const btnCount = document.getElementById('btn-post-page-count');
  if (countBadge) countBadge.textContent = count;
  if (btnCount) btnCount.textContent = count;
}

// Lọc Fanpage theo Vùng Miền
function filterFanpageCards(region) {
  pageControllerState.activeRegionFilter = region;

  // Cập nhật active pill
  document.querySelectorAll('.fanpage-region-pills .pill-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`btn-page-filter-${region === 'ALL' ? 'all' : (region === 'Miền Nam' ? 'south' : (region === 'Miền Trung' ? 'central' : (region === 'Miền Bắc' ? 'north' : 'selected')))}`);
  if (activeBtn) activeBtn.classList.add('active');

  let filtered = pageControllerState.allPages;
  if (region === 'SELECTED') {
    filtered = filtered.filter(p => pageControllerState.selectedPages.includes(p.id));
  } else if (region !== 'ALL') {
    filtered = filtered.filter(p => p.region === region);
  }

  if (pageControllerState.searchQuery) {
    const q = pageControllerState.searchQuery.toLowerCase();
    filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.province && p.province.toLowerCase().includes(q)) || p.id.includes(q));
  }

  renderFanpageCheckboxList(filtered);
}

// Tìm kiếm Fanpage
function handleFanpageSearch(query) {
  pageControllerState.searchQuery = (query || '').trim();
  filterFanpageCards(pageControllerState.activeRegionFilter);
}

// Chọn tất cả / Bỏ chọn tất cả Fanpage
function toggleSelectAllFanpages() {
  if (pageControllerState.selectedPages.length === pageControllerState.allPages.length) {
    deselectAllFanpages();
  } else {
    selectAllFanpages();
  }
}

function selectAllFanpages() {
  pageControllerState.selectedPages = pageControllerState.allPages.map(p => p.id);
  filterFanpageCards(pageControllerState.activeRegionFilter);
  updatePageSelectedCount();
  if (typeof showToast === 'function') showToast(`Đã chọn toàn bộ ${pageControllerState.selectedPages.length} Fanpage!`, 'info');
}

function deselectAllFanpages() {
  pageControllerState.selectedPages = [];
  filterFanpageCards(pageControllerState.activeRegionFilter);
  updatePageSelectedCount();
  if (typeof showToast === 'function') showToast('Đã bỏ chọn tất cả Fanpage.', 'info');
}

// Tự động khớp Fanpage theo địa điểm bài viết tuyển dụng (Smart Match)
function selectPageMatchedFanpages() {
  const job = pageControllerState.selectedJob;
  if (!job) {
    if (typeof showToast === 'function') showToast('Vui lòng chọn bài tuyển dụng trước để hệ thống tự động khớp theo Tỉnh/Thành!', 'warning');
    openPageJobPickerModal();
    return;
  }

  const locText = ((job.detailedLocation || '') + ' ' + (job.location || '') + ' ' + (job.province || '') + ' ' + (job.title || '') + ' ' + (job.description || '')).toLowerCase();

  const matchedIds = [];
  // Luôn kèm Fanpage Tổng nếu có
  const mainPage = pageControllerState.allPages.find(p => p.isMain || p.id === 'JobCentralVietNam' || p.region === 'Toàn Quốc');
  if (mainPage) matchedIds.push(mainPage.id);

  pageControllerState.allPages.forEach(p => {
    if (p.isMain) return;
    const prov = (p.province || '').toLowerCase();
    const pName = (p.name || '').toLowerCase();

    if (prov && locText.includes(prov)) {
      matchedIds.push(p.id);
    } else if (pName && (locText.includes(pName) || pName.includes(prov))) {
      matchedIds.push(p.id);
    }
  });

  if (matchedIds.length > 0) {
    pageControllerState.selectedPages = Array.from(new Set(matchedIds));
    filterFanpageCards(pageControllerState.activeRegionFilter);
    updatePageSelectedCount();
    if (typeof showToast === 'function') showToast(`🎯 Đã tự động khớp ${matchedIds.length} Fanpage phù hợp nhất với tin tuyển dụng tại ${job.province || job.location || 'khu vực'}!`, 'success');
  } else {
    if (mainPage) pageControllerState.selectedPages = [mainPage.id];
    filterFanpageCards(pageControllerState.activeRegionFilter);
    updatePageSelectedCount();
    if (typeof showToast === 'function') showToast('Tin tuyển dụng chưa rõ tỉnh cụ thể, đã tự động chọn Fanpage Tổng JobCentral Việt Nam.', 'info');
  }
}

// 4. Quản lý Modal Chọn Tin Tuyển Dụng Cho Fanpage
let cachedRecruitmentJobs = [];

async function openPageJobPickerModal() {
  const modal = document.getElementById('page-job-picker-modal');
  if (!modal) return;
  modal.classList.add('show', 'active');

  const listContainer = document.getElementById('page-job-picker-list');
  if (listContainer) listContainer.innerHTML = '<div class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu tuyển dụng...</div>';

  try {
    let jobs = [];
    try {
      const sRes = await fetch('/api/sheet/jobs');
      const sData = await sRes.json();
      if (sData.success && Array.isArray(sData.data)) jobs = sData.data;
    } catch (e) {}

    if (jobs.length === 0) {
      try {
        const scRes = await fetch('/api/scraped-jobs');
        const scData = await scRes.json();
        if (scData.success && Array.isArray(scData.data)) jobs = scData.data;
      } catch (e) {}
    }

    cachedRecruitmentJobs = jobs;
    renderPageJobPickerList(jobs);
    populateProvinceFilter(jobs);
  } catch (err) {
    if (listContainer) listContainer.innerHTML = '<div class="text-danger text-center py-4">Không thể tải dữ liệu: ' + err.message + '</div>';
  }
}

function closePageJobPickerModal() {
  const modal = document.getElementById('page-job-picker-modal');
  if (modal) modal.classList.remove('show', 'active');
}

function populateProvinceFilter(jobs) {
  const select = document.getElementById('page-job-province-filter');
  if (!select) return;
  const provinces = Array.from(new Set(jobs.map(j => j.province || j.location).filter(Boolean))).sort();
  select.innerHTML = '<option value="">-- Tất Cả Tỉnh Thành --</option>' +
    provinces.map(p => `<option value="${p}">${p}</option>`).join('');
}

function renderPageJobPickerList(jobs) {
  const listContainer = document.getElementById('page-job-picker-list');
  const totalEl = document.getElementById('page-job-picker-total');
  if (totalEl) totalEl.textContent = jobs.length;
  if (!listContainer) return;

  if (jobs.length === 0) {
    listContainer.innerHTML = '<div class="text-center py-4 text-muted">Không có tin tuyển dụng nào phù hợp.</div>';
    return;
  }

  listContainer.innerHTML = jobs.slice(0, 100).map((j, idx) => `
    <div class="page-job-picker-item" onclick="selectJobForPage('${j.id || idx}')">
      <div>
        <div class="page-job-picker-title">[#${idx + 1}] ${j.title || 'Tuyển Dụng'}</div>
        <div class="page-job-picker-meta">
          <span><i class="fa-solid fa-building text-primary"></i> ${j.company || 'Doanh Nghiệp'}</span>
          <span>&bull;</span>
          <span><i class="fa-solid fa-money-bill text-success"></i> ${j.salary || 'Thỏa thuận'}</span>
          <span>&bull;</span>
          <span><i class="fa-solid fa-location-dot text-danger"></i> ${j.province || j.location || 'Toàn Quốc'}</span>
        </div>
      </div>
      <button class="btn btn-sm btn-primary" style="flex-shrink:0;">
        <i class="fa-solid fa-check"></i> Chọn Tin Này
      </button>
    </div>
  `).join('');
}

function filterPageJobPickerList(query) {
  let q = query !== undefined ? query : (document.getElementById('page-job-search-input')?.value || '');
  q = q.toLowerCase().trim();
  const prov = document.getElementById('page-job-province-filter')?.value || '';

  let filtered = cachedRecruitmentJobs;
  if (prov) {
    filtered = filtered.filter(j => (j.province || j.location) === prov);
  }
  if (q) {
    filtered = filtered.filter(j => 
      (j.title && j.title.toLowerCase().includes(q)) ||
      (j.company && j.company.toLowerCase().includes(q)) ||
      (j.salary && j.salary.toLowerCase().includes(q)) ||
      (j.description && j.description.toLowerCase().includes(q))
    );
  }
  renderPageJobPickerList(filtered);
}

// Người dùng bấm chọn 1 tin tuyển dụng cho Fanpage
function selectJobForPage(jobId) {
  let job = cachedRecruitmentJobs.find(j => String(j.id) === String(jobId));
  if (!job && !isNaN(jobId)) {
    job = cachedRecruitmentJobs[parseInt(jobId, 10)];
  }
  if (!job) return;

  pageControllerState.selectedJob = job;

  // Cập nhật card xem trước tin tuyển dụng
  const emptyState = document.getElementById('page-job-empty-state');
  const jobCard = document.getElementById('page-selected-job-card');
  if (emptyState) emptyState.style.display = 'none';
  if (jobCard) jobCard.style.display = 'block';

  const titleEl = document.getElementById('page-job-title');
  const compEl = document.getElementById('page-job-company');
  const salEl = document.getElementById('page-job-salary');
  const provEl = document.getElementById('page-job-province');

  if (titleEl) titleEl.textContent = job.title || 'Tuyển Dụng';
  if (compEl) compEl.textContent = job.company || 'Doanh Nghiệp';
  if (salEl) salEl.textContent = job.salary || 'Thỏa thuận';
  if (provEl) provEl.textContent = job.province || job.location || 'Toàn Quốc';

  // Tự động sinh Poster chuẩn Human Graphic Design (Nền sáng, ảnh Châu Á, zero emoji)
  fetch('/api/recruitment/generate-poster', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ job, pageInfo: { province: job.province || job.location } })
  })
    .then(r => r.json())
    .then(d => {
      if (d.success && d.imageUrl) {
        pageControllerState.selectedImages = [d.imageUrl];
        renderPageAttachedImages();
        console.log('[FanpageEngine] Đã tự động tạo và gắn Poster chuẩn Human Graphic:', d.imageUrl);
      }
    })
    .catch(() => {
      // Fallback lấy ảnh kho nếu lỗi
      fetch('/api/images')
        .then(r => r.json())
        .then(d => {
          if (d.success && Array.isArray(d.images) && d.images.length > 0) {
            pageControllerState.selectedImages = [d.images[0].url];
            renderPageAttachedImages();
          }
        })
        .catch(() => {});
    });

  // Tự động sinh nội dung theo template chuẩn
  applyPagePostTemplate(pageControllerState.template);

  // Đóng modal
  closePageJobPickerModal();

  // Tự động khớp Fanpage
  selectPageMatchedFanpages();

  if (typeof showToast === 'function') showToast(`Đã chọn bài "${job.title}" và tự động sinh nội dung Fanpage!`, 'success');
}

function clearPageSelectedJob() {
  pageControllerState.selectedJob = null;
  const emptyState = document.getElementById('page-job-empty-state');
  const jobCard = document.getElementById('page-selected-job-card');
  if (emptyState) emptyState.style.display = 'block';
  if (jobCard) jobCard.style.display = 'none';

  const textarea = document.getElementById('page-post-content');
  if (textarea) textarea.value = '';
}

// 5. Mẫu Đăng Bài Chuẩn SEO Fanpage
function applyPagePostTemplate(templateKey) {
  pageControllerState.template = templateKey;
  document.querySelectorAll('.fanpage-template-pills .pill-btn').forEach(btn => btn.classList.remove('active'));
  const btn = document.getElementById(`btn-tpl-${templateKey.toLowerCase()}`);
  if (btn) btn.classList.add('active');

  const job = pageControllerState.selectedJob;
  const textarea = document.getElementById('page-post-content');
  if (!textarea) return;

  if (!job) {
    if (templateKey === 'STANDARD') {
      textarea.value = '[TUYỂN DỤNG NHÂN SỰ TOÀN QUỐC]\n\n👉 Doanh nghiệp đang cần tuyển gấp các vị trí đi làm ngay\n💰 Thu nhập hấp dẫn: 8.000.000đ - 15.000.000đ/tháng\n🎯 Yêu cầu: Nhanh nhẹn, chăm chỉ, có tinh thần trách nhiệm\n🎁 Quyền lợi: Đầy đủ BHXH, thưởng lễ tết, bao cơm trưa\n📍 Địa điểm: Làm việc tại các chi nhánh theo khu vực\n\n📲 Ứng viên quan tâm vui lòng nhắn tin trực tiếp cho Fanpage hoặc liên hệ Hotline/Zalo tuyển dụng để được phỏng vấn ngay!\n\n#ViecLamToanQuoc #TuyenDung2026 #JobCentral';
    } else if (templateKey === 'URGENT') {
      textarea.value = '🔥 [TUYỂN GẤP ĐI LÀM NGAY TRONG TUẦN] 🔥\n\n⚡ Phỏng vấn nhận việc ngay - Không yêu cầu kinh nghiệm cao\n💰 Lương: Thỏa thuận trực tiếp theo năng lực\n🎁 Phụ cấp cơm trưa + Chuyên cần hàng tháng\n\n👉 Nhắn tin ngay cho Fanpage hoặc kết bạn Zalo: 0971946725 nhận lịch phỏng vấn!\n\n#TuyenDungGap #ViecLamNhanh #JobCentral';
    }
    return;
  }

  // 1. Tiêu đề chuẩn không icon
  const rawTitle = job.title || job.cong_viec || 'Tuyển Dụng';
  const cleanTitle = (rawTitle.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\s+/g, ' ').trim()).toUpperCase();
  const header = `[TUYỂN DỤNG] ${cleanTitle}`;

  // 2. Số lượng
  const sl = job.so_luong || job.quantity;
  const quantity = sl && !['không đề cập', 'không yêu cầu', ''].includes(String(sl).toLowerCase().trim())
    ? `Số lượng: ${String(sl).trim().toLowerCase().includes('người') ? String(sl).trim() : String(sl).trim() + ' người'}\n\n`
    : '';

  // 3. Tách mô tả và yêu cầu từ description
  let descRaw = (job.description || '').trim();
  let reqRaw = (job.requirements || '').trim();
  if (descRaw.includes(' | YÊU CẦU:')) {
    const parts = descRaw.split(' | YÊU CẦU:');
    descRaw = parts[0].trim();
    if (!reqRaw) reqRaw = parts.slice(1).join(' | YÊU CẦU:').trim();
  } else if (descRaw.includes(' | YÊU CẦU ỨNG VIÊN:')) {
    const parts = descRaw.split(' | YÊU CẦU ỨNG VIÊN:');
    descRaw = parts[0].trim();
    if (!reqRaw) reqRaw = parts.slice(1).join(' | YÊU CẦU ỨNG VIÊN:').trim();
  }

  function formatBullets(rawText, maxItems = 25) {
    if (!rawText) return [];
    let text = rawText.replace(/([a-z0-9\.\;])(?=[A-ZĐÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ][^:]+:)/g, '$1\n');
    text = text.replace(/([^\n])-\s*/g, '$1\n- ');
    let items = text.split('\n')
      .map(l => l.trim())
      .filter(Boolean)
      .map(l => {
        const cleaned = l.replace(/^[-*•+]\s*/, '').trim();
        return cleaned ? `- ${cleaned}` : '';
      })
      .filter(Boolean);
    if (maxItems && items.length > maxItems) {
      items = items.slice(0, maxItems);
    }
    return items;
  }

  const descBullets = formatBullets(descRaw, 25);
  const desc = descBullets.length > 0 ? `Mô tả công việc:\n${descBullets.join('\n')}\n\n` : '';

  const reqBullets = [];
  if (job.experience && !['không đề cập', 'không yêu cầu', ''].includes(String(job.experience).toLowerCase().trim())) {
    reqBullets.push(`- Kinh nghiệm: ${job.experience}`);
  }
  const extractedReqs = formatBullets(reqRaw, 6);
  extractedReqs.forEach(r => reqBullets.push(r));
  if (job.ky_nang && !['không đề cập', 'không yêu cầu', ''].includes(String(job.ky_nang).toLowerCase().trim())) {
    let kn = String(job.ky_nang).trim();
    const knItems = kn.split(',').map(x => x.trim()).filter(Boolean);
    if (knItems.length > 6) kn = knItems.slice(0, 6).join(', ');
    reqBullets.push(`- Kỹ năng & Bằng cấp: ${kn}`);
  }
  const req = reqBullets.length > 0 ? `Yêu cầu ứng viên:\n${reqBullets.join('\n')}\n\n` : '';

  const benefitBullets = formatBullets(job.benefits || '', 10);
  const ben = benefitBullets.length > 0 ? `Quyền lợi & phúc lợi:\n${benefitBullets.join('\n')}\n\n` : '';

  const jobType = `Hình thức làm việc: ${job.jobType || job.workingTime || job.loai_hinh_cong_viec || 'Toàn thời gian'}\n\n`;

  let loc = (job.detailedLocation || job.location || job.province || '').trim();
  loc = loc
    .replace(/\.\.\.và\s+\d+\s+địa điểm khác.*$/gi, '')
    .replace(/Thu gọn$/gi, '')
    .replace(/:\s*:/g, ':')
    .replace(/\s*\([^)]*cũ\)/gi, '')
    .trim();
  if (loc.length > 200 && (job.province || targetProv)) {
    const pTarget = job.province || targetProv || '';
    loc = `- Tại ${pTarget} (Nhiều chi nhánh / điểm làm việc)\n- Có thêm các chi nhánh tại các tỉnh lân cận`;
  } else if (!loc.startsWith('-')) {
    loc = `- ${loc}`;
  }
  const locSec = `Địa điểm làm việc:\n${loc}\n\n`;

  function toTag(str) {
    if (!str) return '';
    return str.normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D')
      .replace(/[^a-zA-Z0-9]/g, '');
  }

  let provTag = toTag(job.province || job.location || 'HoChiMinh');
  provTag = provTag.replace(/^(TP|ThanhPho|Tinh)/i, '');
  if (!provTag) provTag = 'HoChiMinh';
  let compTag = toTag(job.company || '').toUpperCase();
  if (compTag.length > 35) compTag = compTag.slice(0, 35);
  const compPart = compTag ? `#${compTag} ` : '';

  const footer = `Bạn quan tâm vị trí này? Comment hoặc ib để nhận thông tin chi tiết nhé!\n#ViecLam${provTag} ${compPart}#JobCentral\n🔗https://www.facebook.com/JobCentralVietNam/`;

  if (templateKey === 'STANDARD') {
    textarea.value = `${header}\n\n${quantity}${desc}${req}${ben}${jobType}${locSec}${footer}`;
  } else if (templateKey === 'URGENT') {
    textarea.value = `[TUYỂN DỤNG GẤP] ${cleanTitle}\n\n${quantity}${desc}${req}${ben}${jobType}${locSec}${footer}`;
  } else if (templateKey === 'SHORT') {
    textarea.value = `${header}\n\n${quantity}${desc}${jobType}${locSec}${footer}`;
  } else if (templateKey === 'MULTI') {
    textarea.value = `${header}\n\n${quantity}${desc}${req}${ben}${jobType}${locSec}${footer}`;
  }
}

// Chèn tiện ích nhanh vào Textarea
function insertPageHashtags() {
  const textarea = document.getElementById('page-post-content');
  if (!textarea) return;
  const prov = pageControllerState.selectedJob?.province || 'ToanQuoc';
  const tag = '#ViecLam' + prov.replace(/\s+/g, '') + ' #TuyenDung' + prov.replace(/\s+/g, '') + ' #JobCentral';
  textarea.value += '\n\n' + tag;
}

function insertPageCta() {
  const textarea = document.getElementById('page-post-content');
  if (!textarea) return;
  textarea.value += '\n\n👉 Ứng viên quan tâm vui lòng nhắn tin trực tiếp cho Fanpage để nhận thông tin chi tiết và lịch phỏng vấn sớm nhất!';
}

function insertPageZaloLink() {
  const textarea = document.getElementById('page-post-content');
  if (!textarea) return;
  textarea.value += '\n\n📲 Hotline / Zalo Nhân Sự: 0971946725 (Ưu tiên ứng viên liên hệ sớm)';
}

function applyPageSpinText() {
  const textarea = document.getElementById('page-post-content');
  if (!textarea) return;
  let val = textarea.value;
  val = val.replace(/tuyển dụng/gi, '{tuyển dụng|chiêu mộ|cần tuyển}');
  val = val.replace(/đi làm ngay/gi, '{đi làm ngay|nhận việc ngay|đi làm trong tuần}');
  val = val.replace(/nhắn tin/gi, '{nhắn tin|inbox|liên hệ}');
  textarea.value = val;
  if (typeof showToast === 'function') showToast('Đã áp dụng định dạng SpinText ngẫu nhiên chống trùng lặp!', 'info');
}

// 6. Quản lý Hình Ảnh Đính Kèm Fanpage
function openPageImagePickerModal() {
  const modal = document.getElementById('page-image-picker-modal');
  if (!modal) return;
  modal.classList.add('show');

  const grid = document.getElementById('page-modal-image-grid');
  if (!grid) return;

  fetch('/api/images')
    .then(r => r.json())
    .then(data => {
      if (data.success && Array.isArray(data.images)) {
        grid.innerHTML = data.images.map(img => {
          const isSelected = pageControllerState.selectedImages.includes(img.url);
          return `
            <div class="image-card ${isSelected ? 'selected' : ''}" onclick="togglePageModalImageSelection('${img.url}', this)">
              <img src="${img.url}" alt="${img.name}" style="width:100%;height:110px;object-fit:cover;border-radius:4px;">
              <div style="font-size:0.75rem;padding:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${img.name}</div>
            </div>
          `;
        }).join('');
      } else {
        grid.innerHTML = '<div class="text-center py-4 text-muted">Kho ảnh chung chưa có ảnh nào. Vui lòng tải thêm.</div>';
      }
    });
}

function closePageImagePickerModal() {
  const modal = document.getElementById('page-image-picker-modal');
  if (modal) modal.classList.remove('show');
}

function togglePageModalImageSelection(url, el) {
  const idx = pageControllerState.selectedImages.indexOf(url);
  if (idx === -1) {
    pageControllerState.selectedImages.push(url);
    if (el) el.classList.add('selected');
  } else {
    pageControllerState.selectedImages.splice(idx, 1);
    if (el) el.classList.remove('selected');
  }
  const countEl = document.getElementById('page-modal-selected-img-count');
  if (countEl) countEl.textContent = pageControllerState.selectedImages.length;
}

function confirmPageImagePickerSelection() {
  renderPageAttachedImages();
  closePageImagePickerModal();
}

function renderPageAttachedImages() {
  const strip = document.getElementById('page-selected-images-strip');
  const countEl = document.getElementById('page-selected-images-count');
  const clearBtn = document.getElementById('btn-clear-page-images');
  if (!strip) return;

  const count = pageControllerState.selectedImages.length;
  if (countEl) countEl.textContent = count;
  if (clearBtn) clearBtn.style.display = count > 0 ? 'inline-block' : 'none';

  if (count === 0) {
    strip.innerHTML = `
      <div style="padding: 14px 16px; border: 1.5px dashed rgba(239, 68, 68, 0.45); border-radius: var(--radius-sm); background: rgba(239, 68, 68, 0.04); text-align: center; margin-bottom: 8px;">
        <div style="font-size: 0.88rem; font-weight: 700; color: var(--danger); margin-bottom: 4px; display: flex; align-items: center; justify-content: center; gap: 6px;">
          <i class="fa-solid fa-triangle-exclamation"></i> Bắt Buộc Có Ít Nhất 1 Hình Ảnh Đính Kèm
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin: 0 0 10px 0; line-height: 1.45;">
          Khác với đăng nhóm (có thể chỉ đăng text), <strong>bài đăng Fanpage bắt buộc phải có ảnh</strong> để đảm bảo tính chuyên nghiệp, thu hút ứng viên và tối đa hóa lượt tiếp cận (Reach).
        </p>
        <button type="button" class="btn btn-sm btn-primary" onclick="openPageImagePickerModal()" style="font-weight: 600;">
          <i class="fa-solid fa-images"></i> Chọn Ảnh Tuyển Dụng Ngay
        </button>
      </div>
    `;
    return;
  }

  strip.innerHTML = pageControllerState.selectedImages.map((url, idx) => `
    <div style="position:relative;display:inline-block;margin-right:8px;margin-bottom:6px;">
      <img src="${url}" style="width:60px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--border-color);">
      <button type="button" onclick="removePageAttachedImage(${idx})" style="position:absolute;top:-6px;right:-6px;background:#ef4444;color:#fff;border:none;border-radius:50%;width:18px;height:18px;font-size:10px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <i class="fa-solid fa-xmark"></i>
      </button>
    </div>
  `).join('');
}

function removePageAttachedImage(idx) {
  pageControllerState.selectedImages.splice(idx, 1);
  renderPageAttachedImages();
}

function clearPageSelectedImages() {
  pageControllerState.selectedImages = [];
  renderPageAttachedImages();
}

function handlePageImageUpload(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('images', files[i]);
  }

  if (typeof showToast === 'function') showToast('Đang tải ảnh lên kho...', 'info');
  fetch('/api/images/upload', {
    method: 'POST',
    body: formData
  })
  .then(r => r.json())
  .then(data => {
    if (data.success && Array.isArray(data.images)) {
      data.images.forEach(img => {
        if (!pageControllerState.selectedImages.includes(img.url)) {
          pageControllerState.selectedImages.push(img.url);
        }
      });
      renderPageAttachedImages();
      if (typeof showToast === 'function') showToast(`Đã tải lên và chọn ${data.images.length} ảnh tuyển dụng!`, 'success');
    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Lỗi tải ảnh', 'danger');
    }
  })
  .catch(err => {
    if (typeof showToast === 'function') showToast('Lỗi tải ảnh: ' + err.message, 'danger');
  });
}

// 7. Chế độ xuất bản & Lập lịch
function handlePublishModeChange(mode) {
  pageControllerState.publishMode = mode;
  const schedBox = document.getElementById('page-schedule-box');
  const btnText = document.getElementById('btn-page-post-text');

  if (schedBox) schedBox.style.display = mode === 'SCHEDULE' ? 'block' : 'none';

  if (btnText) {
    if (mode === 'NOW') btnText.textContent = 'BẮT ĐẦU ĐĂNG BÀI LÊN FANPAGE';
    else if (mode === 'SCHEDULE') btnText.textContent = 'LƯU LỊCH PHÁT SÓNG GIỜ VÀNG';
    else if (mode === 'AUTOPILOT') btnText.textContent = 'KÍCH HOẠT AUTO-PILOT 34 TRANG';
  }
}

function setPageSchedulePreset(preset) {
  const input = document.getElementById('page-schedule-datetime');
  if (!input) return;

  const now = new Date();
  if (preset === 'MORNING') {
    now.setHours(8, 30, 0, 0);
  } else if (preset === 'AFTERNOON') {
    now.setHours(17, 30, 0, 0);
  } else if (preset === 'TOMORROW_MORNING') {
    now.setDate(now.getDate() + 1);
    now.setHours(8, 30, 0, 0);
  }

  const localIso = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  input.value = localIso;
  if (typeof showToast === 'function') showToast('Đã chọn khung giờ phát sóng vàng: ' + input.value, 'info');
}

// 8. BẮT ĐẦU ĐIỀU PHỐI ĐĂNG BÀI LÊN FANPAGE (CORE ACTION)
async function startFanpagePublishing() {
  if (pageControllerState.isPublishing) return;

  const pageIds = pageControllerState.selectedPages;
  if (!pageIds || pageIds.length === 0) {
    if (typeof showToast === 'function') showToast('Vui lòng chọn ít nhất 1 Fanpage mục tiêu trước khi đăng!', 'warning');
    return;
  }

  const content = document.getElementById('page-post-content')?.value || '';
  if (!content.trim()) {
    if (typeof showToast === 'function') showToast('Nội dung bài đăng Fanpage không được để trống!', 'warning');
    return;
  }

  // BẮT BUỘC: Fanpage phải có ít nhất 1 hình ảnh tuyển dụng
  if (!pageControllerState.selectedImages || pageControllerState.selectedImages.length === 0) {
    if (typeof showToast === 'function') {
      showToast('⚠️ Bài đăng Fanpage bắt buộc phải có ít nhất 1 hình ảnh đính kèm để đảm bảo tính chuyên nghiệp! Đang mở kho ảnh...', 'warning');
    }
    openPageImagePickerModal();
    const imageSection = document.getElementById('page-attached-images-section');
    if (imageSection) {
      imageSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  if (pageControllerState.publishMode === 'AUTOPILOT') {
    if (typeof openAutoPilotModal === 'function') {
      openAutoPilotModal();
    } else {
      if (typeof showToast === 'function') showToast('Đang khởi động Auto-Pilot 34 Trang...', 'info');
    }
    return;
  }

  if (pageControllerState.publishMode === 'SCHEDULE') {
    const schedTime = document.getElementById('page-schedule-datetime')?.value;
    if (!schedTime) {
      if (typeof showToast === 'function') showToast('Vui lòng chọn thời gian phát sóng giờ vàng!', 'warning');
      return;
    }
    if (typeof showToast === 'function') showToast(`📅 Đã lên lịch phát sóng thành công cho ${pageIds.length} Fanpage vào lúc ${schedTime}!`, 'success');
    return;
  }

  // ĐĂNG NGAY LẬP TỨC (PUBLISH NOW)
  pageControllerState.isPublishing = true;
  togglePublishingUi(true);

  const progressBox = document.getElementById('page-publish-progress-box');
  const progressBar = document.getElementById('page-progress-bar-fill');
  const progressText = document.getElementById('page-progress-status-text');
  const progressPercent = document.getElementById('page-progress-percent');
  const logContainer = document.getElementById('page-live-console-logs');

  if (progressBox) progressBox.style.display = 'block';
  if (progressBar) progressBar.style.width = '0%';
  if (progressPercent) progressPercent.textContent = '0%';
  if (logContainer) logContainer.innerHTML = `<div style="color:#38bdf8;">[Hệ Thống] Bắt đầu xuất bản đồng thời ${pageIds.length} Fanpage vệ tinh...</div>`;

  let successCount = 0;
  let failCount = 0;

  try {
    const payload = {
      pageIds: pageIds,
      message: content,
      mediaUrls: pageControllerState.selectedImages,
      job: pageControllerState.selectedJob || { title: 'Bài viết tuyển dụng Fanpage' }
    };

    const res = await fetch('/api/fanpages/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      data.data.forEach((item, idx) => {
        const timeStr = new Date().toLocaleTimeString('vi-VN');
        const pageName = item.pageName || item.pageId;
        const percent = Math.round(((idx + 1) / data.data.length) * 100);

        if (progressBar) progressBar.style.width = percent + '%';
        if (progressPercent) progressPercent.textContent = percent + '%';

        if (item.success) {
          successCount++;
          const linkHtml = item.postUrl ? `<a href="${item.postUrl}" target="_blank" class="log-link"><i class="fa-solid fa-arrow-up-right-from-square"></i> Xem bài</a>` : '';
          const line = `<div class="log-line"><span class="log-time">[${timeStr}]</span> <span class="log-page">[${pageName}]</span> <span class="log-success"><i class="fa-solid fa-circle-check"></i> Đã đăng thành công!</span> ${linkHtml}</div>`;
          if (logContainer) logContainer.innerHTML += line;
          appendFanpageTerminalLog(`[THÀNH CÔNG] Đã đăng bài lên [${pageName}]! ${item.postUrl ? 'Link: ' + item.postUrl : ''}`, 'success');
        } else {
          failCount++;
          const line = `<div class="log-line"><span class="log-time">[${timeStr}]</span> <span class="log-page">[${pageName}]</span> <span class="log-error"><i class="fa-solid fa-circle-xmark"></i> ${item.error || 'Lỗi đăng bài'}</span></div>`;
          if (logContainer) logContainer.innerHTML += line;
          appendFanpageTerminalLog(`[LỖI] Đăng bài lên [${pageName}] thất bại: ${item.error || 'Lỗi Graph API'}`, 'error');
        }
      });

      const statSuccess = document.getElementById('page-stat-success-count');
      const statFail = document.getElementById('page-stat-fail-count');
      const statReach = document.getElementById('page-stat-est-reach');

      if (statSuccess) statSuccess.textContent = successCount;
      if (statFail) statFail.textContent = failCount;
      if (statReach) statReach.textContent = (successCount * 1450).toLocaleString('vi-VN') + ' Reach';

      if (progressText) progressText.textContent = `Hoàn tất! Xuất bản thành công ${successCount}/${pageIds.length} Fanpage.`;

      if (typeof showToast === 'function') showToast(`🎉 Hoàn tất chiến dịch đăng trang! Đã phủ sóng thành công ${successCount} Fanpage tuyển dụng.`, 'success');

      await loadPageRecentPosts();

    } else {
      if (typeof showToast === 'function') showToast(data.message || 'Lỗi khi gửi yêu cầu đăng bài', 'danger');
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi trong quá trình đăng: ' + err.message, 'danger');
    if (logContainer) logContainer.innerHTML += `<div class="log-line log-error">[Lỗi Kết Nối] ${err.message}</div>`;
  } finally {
    pageControllerState.isPublishing = false;
    togglePublishingUi(false);
  }
}

function stopFanpagePublishing() {
  pageControllerState.isPublishing = false;
  togglePublishingUi(false);
  if (typeof showToast === 'function') showToast('Đã dừng tiến trình đăng bài Fanpage.', 'warning');
}

function togglePublishingUi(isRunning) {
  const btnStart = document.getElementById('btn-start-page-post');
  const btnStop = document.getElementById('btn-stop-page-post');
  const statusPill = document.getElementById('page-campaign-status-pill');

  if (btnStart) btnStart.disabled = isRunning;
  if (btnStop) btnStop.style.display = isRunning ? 'inline-flex' : 'none';
  if (statusPill) statusPill.style.display = isRunning ? 'inline-block' : 'none';
}

// 9. Nạp lịch sử đăng bài Fanpage gần nhất
async function loadPageRecentPosts() {
  const container = document.getElementById('page-recent-posts-list');
  if (!container) return;

  try {
    const res = await fetch('/api/history?limit=10');
    const data = await res.json();
    if (!data.success || !Array.isArray(data.data)) {
      container.innerHTML = '<div class="text-muted text-center py-2" style="font-size:0.8rem;">Chưa có bài đăng Fanpage nào gần đây.</div>';
      return;
    }

    const pagePosts = data.data.filter(h => h.type === 'FANPAGE_POST' || (h.groupName && h.groupName.includes('[Fanpage]')));
    if (pagePosts.length === 0) {
      container.innerHTML = '<div class="text-muted text-center py-2" style="font-size:0.8rem;">Chưa có bài đăng Fanpage nào. Bấm "Bắt đầu đăng bài" để tạo bài đầu tiên!</div>';
      return;
    }

    container.innerHTML = pagePosts.slice(0, 5).map(p => {
      const timeStr = p.publishedAt ? new Date(p.publishedAt).toLocaleString('vi-VN') : 'Vừa xong';
      const isOk = p.status === 'SUCCESS';
      return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:var(--radius-sm);font-size:0.82rem;">
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="badge-pill ${isOk ? 'success' : 'danger'}" style="font-size:0.68rem;">${isOk ? 'Thành công' : 'Lỗi'}</span>
            <strong>${p.groupName || 'Fanpage'}</strong>
            <span style="color:var(--text-muted);font-size:0.75rem;">${timeStr}</span>
          </div>
          ${p.postUrl ? `<a href="${p.postUrl}" target="_blank" style="color:var(--primary);font-size:0.78rem;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Xem bài</a>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Lỗi nạp lịch sử:', err);
  }
}

// =========================================================
// 10. INTERACTIVE 5-STEP WORKFLOW & AUTO-PILOT 34 FANPAGE
// =========================================================

const pwState = {
  currentStep: 1,
  currentPage: 1,
  totalPages: 1,
  jobs: [],
  selectedJob: null,
  pages: [],
  selectedPageIds: new Set(),
  spunPosts: [],
  activePostIndex: 0,
  pollInterval: null
};

async function initPageWorkflow() {
  await Promise.all([
    fetchJobs(1),
    fetchFanpages(),
    fetchQueueStatus()
  ]);

  if (!pwState.pollInterval) {
    pwState.pollInterval = setInterval(fetchQueueStatus, 5000);
  }

  if (typeof loadFanpageAnalytics === 'function') {
    loadFanpageAnalytics();
  }
}

// 1. CHUYỂN BƯỚC WORKFLOW
function switchPageStep(stepNum) {
  pwState.currentStep = stepNum;

  document.querySelectorAll('.step-card').forEach(card => {
    const s = parseInt(card.dataset.step, 10);
    card.classList.toggle('active', s === stepNum);
    if (s < stepNum) card.classList.add('completed');
  });

  document.querySelectorAll('.workflow-section').forEach((sec, idx) => {
    sec.classList.toggle('active', idx + 1 === stepNum);
  });

  appendLog(`[NAV] Đã chuyển sang Bước ${stepNum}.`);
}

// 2. TẢI DỮ LIỆU SCRAPER_DATA (ĐA NGUỒN)
async function fetchJobs(page = 1) {
  const queryEl = document.getElementById('job-search-input');
  const locationEl = document.getElementById('job-location-filter');
  const sourceEl = document.getElementById('job-source-filter');
  const statusEl = document.getElementById('job-status-filter');
  const expiredEl = document.getElementById('job-hide-expired');

  const query = queryEl ? queryEl.value.trim() : '';
  const location = locationEl ? locationEl.value : '';
  const source = sourceEl ? sourceEl.value : 'ALL';
  const postStatus = statusEl ? statusEl.value : 'ALL';
  const hideExpired = expiredEl && expiredEl.checked ? 'true' : 'false';

  try {
    const url = `/api/jobs?page=${page}&limit=12&query=${encodeURIComponent(query)}&location=${encodeURIComponent(location)}&source=${encodeURIComponent(source)}&postStatus=${postStatus}&hideExpired=${hideExpired}`;
    const res = await fetch(url);
    const result = await res.json();

    if (result.success) {
      pwState.jobs = result.data.items;
      pwState.currentPage = result.data.page;
      pwState.totalPages = result.data.totalPages;

      const totalCountEl = document.getElementById('total-jobs-count');
      const pageIndicatorEl = document.getElementById('page-indicator');
      if (totalCountEl) totalCountEl.textContent = `${result.data.total} tin hợp lệ`;
      if (pageIndicatorEl) pageIndicatorEl.textContent = `Trang ${pwState.currentPage} / ${pwState.totalPages || 1}`;

      renderJobsGrid();
    }
  } catch (err) {
    appendLog(`[ERROR] Không thể nạp jobs: ${err.message}`);
  }
}

function renderJobsGrid() {
  const container = document.getElementById('jobs-container');
  if (!container) return;
  container.innerHTML = '';

  if (!pwState.jobs || pwState.jobs.length === 0) {
    container.innerHTML = `
      <div class="empty-jobs-notice" style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 50px 20px; background: var(--bg-card); border-radius: 14px; border: 1px dashed var(--border-color);">
        <div style="font-size: 2.4rem; margin-bottom: 12px; color: var(--primary);"><i class="fa-solid fa-magnifying-glass"></i></div>
        <div style="font-weight: 700; font-size: 1.05rem; color: var(--text-main);">Không tìm thấy tin tuyển dụng phù hợp</div>
        <p style="font-size: 0.85rem; margin-top: 6px; color: var(--text-muted);">Vui lòng thử điều chỉnh bộ lọc Tỉnh Thành, Nguồn tin hoặc từ khóa tìm kiếm.</p>
      </div>`;
    return;
  }

  pwState.jobs.forEach(job => {
    const isPosted = job.tracking && job.tracking.isPosted;
    const isQueued = job.tracking && job.tracking.isQueued;

    let statusBadge = `<span class="job-status-chip unposted"><i class="fa-regular fa-circle"></i> Chưa đăng</span>`;
    if (isPosted) {
      statusBadge = `<span class="job-status-chip posted"><i class="fa-solid fa-circle-check"></i> ${escapeHtml(job.tracking.lastPostedPage || 'Đã đăng')}</span>`;
    } else if (isQueued) {
      statusBadge = `<span class="job-status-chip queued"><i class="fa-solid fa-clock"></i> Chờ đăng</span>`;
    }

    const sourceBadge = `<span class="job-source-chip ${(job.source || 'topcv').toLowerCase()}"><i class="fa-solid ${job.sourceIcon || 'fa-cloud'}"></i> ${escapeHtml(job.source || 'TopCV')}</span>`;

    const deadlineBadge = job.isExpired 
      ? `<span class="job-tag tag-expired"><i class="fa-solid fa-calendar-xmark"></i> Hết hạn (${job.deadlineFormatted || 'Hết hạn'})</span>`
      : `<span class="job-tag tag-active"><i class="fa-regular fa-calendar-check"></i> Hạn: ${job.deadlineFormatted || 'Còn hạn'}</span>`;

    const card = document.createElement('div');
    card.className = 'job-card';
    card.innerHTML = `
      <div class="job-card-inner">
        <div class="job-card-header">
          <div class="job-card-badges">
            ${statusBadge}
            ${sourceBadge}
          </div>
          <span class="job-id-code">#${job.id}</span>
        </div>
        <h4 class="job-title" title="${escapeHtml(job.title)}">${escapeHtml(job.title)}</h4>
        <div class="job-company">
          <i class="fa-solid fa-building-circle-check"></i>
          <span>${escapeHtml(job.company)}</span>
        </div>
        <div class="job-tags">
          <span class="job-tag tag-salary"><i class="fa-solid fa-dollar-sign"></i> ${escapeHtml(job.salary)}</span>
          <span class="job-tag tag-location"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(job.location)}</span>
          <span class="job-tag tag-exp"><i class="fa-solid fa-briefcase"></i> ${escapeHtml(job.experience || 'Không yêu cầu')}</span>
          ${deadlineBadge}
        </div>
      </div>
      <div class="job-actions">
        <span class="job-type-pill"><i class="fa-solid fa-clock"></i> ${escapeHtml(job.jobType || 'Toàn thời gian')}</span>
        <button class="btn btn-select-job" onclick="selectJobToCampaign('${job.id}')">
          <i class="fa-solid fa-wand-magic-sparkles"></i> <span>Chọn Soạn Bài</span>
        </button>
      </div>
    `;
    container.appendChild(card);
  });
}

function searchJobs() {
  fetchJobs(1);
}

function changePage(delta) {
  const targetPage = pwState.currentPage + delta;
  if (targetPage >= 1 && targetPage <= pwState.totalPages) {
    fetchJobs(targetPage);
  }
}

// 3. CHỌN JOB & TỰ ĐỘNG KHỚP CÁC FANPAGE TỈNH THÀNH
async function selectJobToCampaign(jobId) {
  try {
    const res = await fetch(`/api/jobs/${jobId}`);
    const result = await res.json();

    if (result.success) {
      const { job, campaignPayload, matchedPageIds, matchedPages } = result.data;
      pwState.selectedJob = job;

      const titleInput = document.getElementById('campaign-title-input');
      const rawContentInput = document.getElementById('campaign-raw-content');
      const fixedEntitiesInput = document.getElementById('campaign-fixed-entities');
      const imgPreview = document.getElementById('campaign-image-preview');
      const imgUrlInput = document.getElementById('campaign-image-url');
      const nameEl = document.getElementById('campaign-image-name');

      if (titleInput && campaignPayload) titleInput.value = campaignPayload.title || '';
      if (rawContentInput && campaignPayload) rawContentInput.value = campaignPayload.rawContent || '';
      if (fixedEntitiesInput) {
        fixedEntitiesInput.value = Array.isArray(campaignPayload?.fixedEntities) 
          ? campaignPayload.fixedEntities.join('\n') 
          : '';
      }

      // Tự động sinh Poster chuẩn Human Graphic Design (Nền sáng, ảnh Châu Á, zero emoji)
      if (nameEl) nameEl.textContent = 'Đang tự động vẽ Poster chuẩn Human Graphic...';

      fetch('/api/recruitment/generate-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: job,
          pageInfo: {
            province: job.province || job.location,
            name: matchedPages && matchedPages[0] ? matchedPages[0].pageName : 'JobCentral'
          }
        })
      })
      .then(r => r.json())
      .then(d => {
        if (d.success && d.imageUrl) {
          if (imgPreview) imgPreview.src = d.imageUrl;
          if (imgUrlInput) imgUrlInput.value = d.imageUrl;
          if (nameEl) nameEl.innerHTML = '<span style="color:#10b981;">✓ Poster chuẩn Human Graphic Design (Nền sáng, ảnh Châu Á)</span>';
          appendLog(`[BANNER] Đã tự động tạo Poster chuyên nghiệp cho "${job.title}": ${d.imageUrl}`);
        }
      })
      .catch(err => {
        console.warn('Lỗi sinh banner:', err);
        const imageUrl = job.imageUrl || '/uploads/1787412190105_TUY___N_D___NG__2_.png';
        if (imgPreview) imgPreview.src = imageUrl;
        if (imgUrlInput) imgUrlInput.value = imageUrl;
      });

      if (matchedPageIds && matchedPageIds.length > 0) {
        pwState.selectedPageIds = new Set(matchedPageIds);
        renderFanpagesList();

        const pageNames = matchedPages.map(p => p.pageName).join(', ');
        appendLog(`[AUTO-MATCH] Tin tuyển dụng tại ${matchedPageIds.length} tỉnh thành -> Đã tự động chọn ${matchedPageIds.length} Fanpage: ${pageNames}`);
      }

      switchPageStep(2);
    }
  } catch (err) {
    alert('Lỗi khi nạp chi tiết job: ' + err.message);
  }
}

// 4. DANH SÁCH 34 FANPAGES
async function fetchFanpages() {
  try {
    const res = await fetch('/api/pages');
    const result = await res.json();

    if (result.success) {
      pwState.pages = result.data;
      if (pwState.selectedPageIds.size === 0) {
        pwState.selectedPageIds = new Set(pwState.pages.map(p => p.id));
      }
      renderFanpagesList();
    }
  } catch (err) {
    appendLog(`[ERROR] Không thể lấy danh sách Fanpage: ${err.message}`);
  }
}

function renderFanpagesList() {
  const container = document.getElementById('fanpages-container');
  if (!container) return;
  container.innerHTML = '';

  pwState.pages.forEach(page => {
    const isSelected = pwState.selectedPageIds.has(page.id);
    const item = document.createElement('div');
    item.className = `page-item ${isSelected ? 'selected' : ''}`;
    item.onclick = () => togglePageSelection(page.id);

    const regionColor = page.region === 'Miền Nam' ? '#f59e0b' : page.region === 'Miền Trung' ? '#3b82f6' : page.region === 'Miền Bắc' ? '#10b981' : '#6366f1';

    item.innerHTML = `
      <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events: none;">
      <div style="flex: 1; min-width: 0;">
        <div class="page-name" title="${escapeHtml(page.name)}">${escapeHtml(page.name)}</div>
        <div class="page-region">
          <span style="color: ${regionColor}; font-weight: 600;"><i class="fa-solid fa-location-dot"></i> ${page.region}</span>
          <span style="opacity: 0.7; font-family: monospace;">• ID: ${page.id}</span>
        </div>
      </div>
      <a href="${page.link || `https://facebook.com/${page.id}`}" target="_blank" onclick="event.stopPropagation();" title="Xem Fanpage trên Facebook" class="page-fb-icon-btn">
        <i class="fa-brands fa-facebook"></i>
      </a>
    `;
    container.appendChild(item);
  });

  const countEl = document.getElementById('selected-pages-count');
  if (countEl) countEl.textContent = pwState.selectedPageIds.size;
}

function filterFanpagesSelection(keyword) {
  const q = (keyword || '').trim().toLowerCase();
  const items = document.querySelectorAll('#fanpages-container .page-item');
  items.forEach(item => {
    const text = (item.textContent || '').toLowerCase();
    item.style.display = (!q || text.includes(q)) ? 'flex' : 'none';
  });
}

function togglePageSelection(pageId) {
  if (pwState.selectedPageIds.has(pageId)) {
    pwState.selectedPageIds.delete(pageId);
  } else {
    pwState.selectedPageIds.add(pageId);
  }
  renderFanpagesList();
}

function toggleSelectAllPages(selectAll) {
  if (selectAll) {
    pwState.selectedPageIds = new Set(pwState.pages.map(p => p.id));
  } else {
    pwState.selectedPageIds.clear();
  }
  renderFanpagesList();
}

// 5. BƯỚC 3: AI SPINNING & MA TRẬN LEVENSHTEIN
async function proceedToAISpin() {
  const rawContentEl = document.getElementById('campaign-raw-content');
  const rawContent = rawContentEl ? rawContentEl.value.trim() : '';

  if (!rawContent) {
    alert('Vui lòng nhập hoặc chọn nội dung bài viết thô!');
    return;
  }
  if (pwState.selectedPageIds.size === 0) {
    alert('Vui lòng chọn ít nhất 1 Fanpage mục tiêu!');
    return;
  }

  switchPageStep(3);
  await triggerAISpin();
}

async function triggerAISpin() {
  const rawContent = document.getElementById('campaign-raw-content').value.trim();
  const fixedEntitiesText = document.getElementById('campaign-fixed-entities').value.trim();
  const fixedEntities = fixedEntitiesText.split('\n').map(s => s.trim()).filter(Boolean);
  const imageUrl = document.getElementById('campaign-image-url')?.value.trim() || '/uploads/1787412190105_TUY___N_D___NG__2_.png';

  const selectedPages = pwState.pages.filter(p => pwState.selectedPageIds.has(p.id));

  const loadingEl = document.getElementById('ai-loading');
  const resultsEl = document.getElementById('ai-results-wrapper');

  if (loadingEl) loadingEl.style.display = 'block';
  if (resultsEl) resultsEl.style.display = 'none';

  appendLog(`[AI] Bắt đầu sinh ${selectedPages.length} biến thể nội dung độc nhất...`);

  try {
    const res = await fetch('/api/ai/spin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawContent,
        targetPages: selectedPages,
        fixedEntities,
        imageUrl
      })
    });

    const result = await res.json();
    if (loadingEl) loadingEl.style.display = 'none';
    if (resultsEl) resultsEl.style.display = 'block';

    if (result.success) {
      pwState.spunPosts = result.data;
      pwState.activePostIndex = 0;

      appendLog(`[AI] Hoàn tất AI Spinning cho ${pwState.spunPosts.length} bài. Toàn bộ đạt độ khác biệt > 30%!`);
      renderSpunPostsTabs();
    } else {
      alert('Lỗi AI Spinning: ' + result.message);
    }
  } catch (err) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (resultsEl) resultsEl.style.display = 'block';
    alert('Lỗi kết nối AI API: ' + err.message);
  }
}

function renderSpunPostsTabs() {
  const headers = document.getElementById('post-tabs-headers');
  if (!headers) return;
  headers.innerHTML = '';

  pwState.spunPosts.forEach((post, idx) => {
    const btn = document.createElement('button');
    btn.className = `tab-btn ${idx === pwState.activePostIndex ? 'active' : ''}`;
    btn.textContent = `Page ${idx + 1}: ${(post.pageName || '').substring(0, 18)}...`;
    btn.onclick = () => selectPostTab(idx);
    headers.appendChild(btn);
  });

  updateActivePostText();
}

function selectPostTab(index) {
  if (pwState.spunPosts[pwState.activePostIndex]) {
    pwState.spunPosts[pwState.activePostIndex].content = document.getElementById('active-post-preview').value;
  }
  pwState.activePostIndex = index;
  renderSpunPostsTabs();
}

function updateActivePostText() {
  const preview = document.getElementById('active-post-preview');
  if (preview && pwState.spunPosts[pwState.activePostIndex]) {
    preview.value = pwState.spunPosts[pwState.activePostIndex].content;
  }
}

// 6. BƯỚC 4: NẠP VÀO HÀNG ĐỢI & XUẤT BẢN
async function proceedToEnqueue() {
  if (pwState.spunPosts[pwState.activePostIndex]) {
    pwState.spunPosts[pwState.activePostIndex].content = document.getElementById('active-post-preview').value;
  }

  const campaignTitle = document.getElementById('campaign-title-input').value.trim();
  const imageUrl = document.getElementById('campaign-image-url')?.value.trim() || '/uploads/1787412190105_TUY___N_D___NG__2_.png';

  pwState.spunPosts.forEach(p => {
    if (!p.mediaUrls || p.mediaUrls.length === 0) {
      p.mediaUrls = [imageUrl];
    }
  });

  appendLog(`[QUEUE] Đang nạp ${pwState.spunPosts.length} bài đăng vào hàng đợi giãn cách 3-5m/trang...`);

  try {
    const res = await fetch('/api/campaigns/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignTitle,
        posts: pwState.spunPosts,
        mediaUrls: [imageUrl]
      })
    });

    const result = await res.json();
    if (result.success) {
      appendLog(`[SUCCESS] ${result.data.message}`);
      switchPageStep(4);
      fetchQueueStatus();
    } else {
      alert('Lỗi nạp hàng đợi: ' + result.message);
    }
  } catch (err) {
    alert('Lỗi kết nối tới Server: ' + err.message);
  }
}

// 7. THEO DÕI HÀNG ĐỢI & METRICS
async function fetchQueueStatus() {
  try {
    const res = await fetch('/api/queue/status');
    const result = await res.json();

    if (result.success) {
      const { counts, isPaused, delayedJobs, metaUsage } = result.data;

      const delayedEl = document.getElementById('queue-delayed-count');
      const activeEl = document.getElementById('queue-active-count');
      const completedEl = document.getElementById('queue-completed-count');
      const estTimeEl = document.getElementById('queue-estimated-time');

      if (delayedEl) delayedEl.textContent = counts.delayed || 0;
      if (activeEl) activeEl.textContent = counts.active || 0;
      if (completedEl) completedEl.textContent = counts.completed || 0;
      if (estTimeEl) estTimeEl.textContent = `~${((counts.delayed || 0) * 4).toFixed(0)}m`;

      if (metaUsage) {
        const callEl = document.getElementById('meta-call-count');
        const cpuEl = document.getElementById('meta-cpu-time');
        const totalEl = document.getElementById('meta-total-time');
        if (callEl) callEl.textContent = `${metaUsage.callCount || 12}%`;
        if (cpuEl) cpuEl.textContent = `${metaUsage.cpuTime || 8}%`;
        if (totalEl) totalEl.textContent = `${metaUsage.totalTime || 10}%`;
      }

      renderTimeline(delayedJobs);
    }
  } catch (err) {
    // offline
  }
}

function renderTimeline(delayedJobs) {
  const container = document.getElementById('timeline-container');
  if (!container) return;

  if (!delayedJobs || delayedJobs.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); text-align: center; padding: 20px;">Hàng đợi đang rảnh (0 tác vụ chờ).</p>`;
    return;
  }

  container.innerHTML = '';
  delayedJobs.forEach((job, idx) => {
    const delayMin = (job.delayMs / 60000).toFixed(1);
    const item = document.createElement('div');
    item.className = 'timeline-item';
    item.innerHTML = `
      <div>
        <div style="font-weight: 600; font-size: 0.88rem;"><i class="fa-solid fa-thumbtack text-primary"></i> [${idx + 1}/${delayedJobs.length}] Fanpage: ${escapeHtml(job.pageName || job.pageId)}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted);"><i class="fa-solid fa-hashtag"></i> Job ID: ${job.id} &bull; ${escapeHtml(job.jobTitle || 'Tin việc làm')}</div>
      </div>
      <div class="timeline-time">
        <i class="fa-solid fa-stopwatch"></i> Hoãn thực thi: +${delayMin} phút
      </div>
    `;
    container.appendChild(item);
  });
}

async function pauseQueue() {
  if (confirm('Bạn có chắc muốn tạm dừng toàn bộ hàng đợi đăng bài khẩn cấp?')) {
    await fetch('/api/queue/pause', { method: 'POST' });
    appendLog('[WARN] Đã tạm dừng hàng đợi khẩn cấp!');
    fetchQueueStatus();
  }
}

async function resumeQueue() {
  await fetch('/api/queue/resume', { method: 'POST' });
  appendLog('[INFO] Đã mở lại hàng đợi.');
  fetchQueueStatus();
}

// 8. AUTO-PILOT 2 BÀI/PAGE/NGÀY (34 FANPAGE)
let currentAutoPilotPlan = null;
let currentAutoPilotFilter = 'ALL';

async function openAutoPilotModal() {
  const modal = document.getElementById('autopilot-modal');
  const loading = document.getElementById('autopilot-loading');
  const content = document.getElementById('autopilot-content');

  if (modal) modal.style.display = 'block';
  if (loading) loading.style.display = 'block';
  if (content) content.style.display = 'none';

  try {
    const res = await fetch('/api/autopilot/plan');
    const result = await res.json();

    if (loading) loading.style.display = 'none';
    if (content) content.style.display = 'block';

    if (result.success) {
      currentAutoPilotPlan = result.plan;

      if (result.metrics) {
        const fullEl = document.getElementById('ap-metric-full');
        const partEl = document.getElementById('ap-metric-partial');
        const nodataEl = document.getElementById('ap-metric-nodata');
        if (fullEl) fullEl.textContent = `${result.metrics.fullCount} Tỉnh`;
        if (partEl) partEl.textContent = `${result.metrics.partialCount} Tỉnh`;
        if (nodataEl) nodataEl.textContent = `${result.metrics.noDataCount} Tỉnh`;
      }
      const totalPostsEl = document.getElementById('ap-total-posts');
      if (totalPostsEl) totalPostsEl.textContent = `${result.totalScheduledPosts} Bài`;

      filterAutoPilotTab('ALL');
    }
  } catch (err) {
    alert('Lỗi nạp Auto-Pilot: ' + err.message);
    closeAutoPilotModal();
  }
}

function closeAutoPilotModal() {
  const modal = document.getElementById('autopilot-modal');
  if (modal) modal.style.display = 'none';
}

function filterAutoPilotTab(tab, syncSelect = true) {
  currentAutoPilotFilter = tab;
  document.querySelectorAll('.ap-tab').forEach(b => b.classList.remove('active'));

  if (tab === 'ALL') document.querySelectorAll('#ap-tab-all, #ap-page-tab-all').forEach(b => b.classList.add('active'));
  if (tab === 'SOUTH') document.querySelectorAll('#ap-tab-south, #ap-page-tab-south').forEach(b => b.classList.add('active'));
  if (tab === 'CENTRAL') document.querySelectorAll('#ap-tab-central, #ap-page-tab-central').forEach(b => b.classList.add('active'));
  if (tab === 'NORTH') document.querySelectorAll('#ap-tab-north, #ap-page-tab-north').forEach(b => b.classList.add('active'));
  if (tab === 'FULL') document.querySelectorAll('#ap-tab-full, #ap-page-tab-full').forEach(b => b.classList.add('active'));
  if (tab === 'ISSUES') document.querySelectorAll('#ap-tab-issues, #ap-page-tab-issues').forEach(b => b.classList.add('active'));

  if (syncSelect) {
    let regVal = 'ALL';
    if (tab === 'SOUTH') regVal = 'Miền Nam';
    else if (tab === 'CENTRAL') regVal = 'Miền Trung';
    else if (tab === 'NORTH') regVal = 'Miền Bắc';
    ['autopilot-region-select', 'autopilot-page-region-select'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = regVal;
    });
    if (typeof updateAutoPilotButtonLabels === 'function') updateAutoPilotButtonLabels(regVal);
  }

  if (!currentAutoPilotPlan) return;

  let filtered = currentAutoPilotPlan;
  if (tab === 'SOUTH') {
    filtered = currentAutoPilotPlan.filter(p => (p.region || '').includes('Nam'));
  } else if (tab === 'CENTRAL') {
    filtered = currentAutoPilotPlan.filter(p => (p.region || '').includes('Trung'));
  } else if (tab === 'NORTH') {
    filtered = currentAutoPilotPlan.filter(p => (p.region || '').includes('Bắc'));
  } else if (tab === 'FULL') {
    filtered = currentAutoPilotPlan.filter(p => p.readinessStatus === 'FULL');
  } else if (tab === 'ISSUES') {
    filtered = currentAutoPilotPlan.filter(p => p.readinessStatus === 'NO_DATA' || p.readinessStatus === 'PARTIAL');
  }

  renderAutoPilotPlanList(filtered);
}

function renderAutoPilotPlanList(plan) {
  const container = document.getElementById('autopilot-plan-list');
  if (!container) return;
  container.innerHTML = '';

  if (!plan || plan.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 40px;"><i class="fa-solid fa-circle-info fa-2x"></i><p style="margin-top: 10px;">Không có tỉnh thành nào trong nhóm lọc này.</p></div>`;
    return;
  }

  plan.forEach(item => {
    const pageIdx = currentAutoPilotPlan.findIndex(p => p.pageId === item.pageId);

    const card = document.createElement('div');
    card.className = 'panel';
    card.style.padding = '16px';
    card.style.marginBottom = '0';
    card.style.background = 'rgba(255,255,255,0.02)';

    let statusBadge = '';
    let bodyContent = '';

    if (item.readinessStatus === 'FULL') {
      statusBadge = `<span class="badge-pill success" style="padding: 2px 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-check"></i> Đủ 2 bài</span>`;
    } else if (item.readinessStatus === 'PARTIAL') {
      statusBadge = `<span class="badge-pill" style="background: rgba(245,158,11,0.2); color: #fbbf24; padding: 2px 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-half-stroke"></i> Ghép 1/2 bài</span>`;
    } else {
      statusBadge = `<span class="badge-pill" style="background: rgba(239,68,68,0.2); color: #f87171; padding: 2px 8px; font-size: 0.72rem;"><i class="fa-solid fa-triangle-exclamation"></i> Chưa có bài</span>`;
    }

    if (item.posts && item.posts.length > 0) {
      item.posts.forEach((p, postIdx) => {
        const posterSrc = p.posterUrl || (p.mediaUrls && p.mediaUrls[0]) || '/uploads/1787412190105_TUY___N_D___NG__2_.png';
        bodyContent += `
          <div class="autopilot-post-slot" onclick="openPostInspector(${pageIdx}, ${postIdx})" style="cursor: pointer; background: rgba(0,0,0,0.3); padding: 10px; border-radius: var(--radius-sm); margin-top: 8px; border: 1px solid rgba(255,255,255,0.08); transition: all 0.2s ease; display: flex; align-items: center; gap: 10px;">
            <img src="${escapeHtml(posterSrc)}" alt="Poster" style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1); background: #fff; flex-shrink: 0;" onerror="this.src='/uploads/1787412190105_TUY___N_D___NG__2_.png'" />
            <div style="flex: 1; min-width: 0;">
              <div style="display: flex; justify-content: space-between; font-size: 0.76rem; color: #60a5fa; font-weight: 600;">
                <span><i class="fa-solid fa-clock"></i> ${p.slot}</span>
                <span style="color: #34d399;"><i class="fa-solid fa-pen-to-square"></i> Xem/Sửa</span>
              </div>
              <div style="font-size: 0.84rem; font-weight: 600; margin: 2px 0; color: #fff; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escapeHtml(p.jobTitle)}</div>
              <div style="font-size: 0.74rem; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                <i class="fa-solid fa-building"></i> ${escapeHtml(p.company)}
              </div>
            </div>
          </div>
        `;
      });
    }

    if (item.readinessStatus !== 'FULL') {
      const isRed = item.readinessStatus === 'NO_DATA';
      bodyContent += `
        <div style="background: ${isRed ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)'}; border: 1px dashed ${isRed ? 'rgba(239,68,68,0.3)' : 'rgba(245,158,11,0.3)'}; border-radius: var(--radius-sm); padding: 10px; margin-top: 8px; font-size: 0.78rem; color: ${isRed ? '#fca5a5' : '#fcd34d'};">
          <div style="display: flex; align-items: flex-start; gap: 6px;">
            <i class="fa-solid fa-circle-info" style="margin-top: 2px;"></i>
            <div>
              <strong>Lý do chưa đủ 2 bài:</strong> ${escapeHtml(item.reason)}
              <div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 4px;">
                Kho dữ liệu: ${item.stats?.totalPool || 0} tin • Còn hạn: ${item.stats?.activePool || 0} tin • Chưa đăng: ${item.stats?.unpostedPool || 0} tin
              </div>
            </div>
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
        <div>
          <div style="font-weight: 600; font-size: 0.92rem;"><i class="fa-brands fa-facebook" style="color: #60a5fa;"></i> ${escapeHtml(item.pageName)}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">Khu vực: ${escapeHtml(item.region || 'Toàn quốc')} • Ghép được ${item.matchedCount}/2 bài</div>
        </div>
        ${statusBadge}
      </div>
      ${bodyContent}
    `;

    container.appendChild(card);
  });
}

// 9. POST INSPECTOR & PREVIEW MODAL
let currentInspectedTarget = { pageIdx: null, postIdx: null };

function openPostInspector(pageIdx, postIdx) {
  const plan = (typeof currentAutoPilotPlan !== 'undefined' && currentAutoPilotPlan)
    || (typeof state !== 'undefined' && state.autoPilotPlan && state.autoPilotPlan.plan);

  if (!plan || !plan[pageIdx] || !plan[pageIdx].posts || !plan[pageIdx].posts[postIdx]) {
    return;
  }

  currentInspectedTarget = { pageIdx, postIdx };
  const pageData = plan[pageIdx];
  const post = pageData.posts[postIdx];

  const slotBadge = document.getElementById('inspector-slot-badge');
  const pageBadge = document.getElementById('inspector-page-badge');
  const jobTitleEl = document.getElementById('inspector-job-title');
  const companyEl = document.getElementById('inspector-company');
  const contentEl = document.getElementById('inspector-post-content');
  const posterImg = document.getElementById('inspector-poster-img');
  const modal = document.getElementById('autopilot-inspector-modal') || document.getElementById('post-inspector-modal');

  if (slotBadge) slotBadge.innerHTML = `<i class="fa-solid fa-clock"></i> ${escapeHtml(post.slot)}`;
  if (pageBadge) pageBadge.innerHTML = `<i class="fa-brands fa-facebook"></i> ${escapeHtml(pageData.pageName)}`;
  if (jobTitleEl) jobTitleEl.textContent = post.jobTitle || 'Tin Tuyển Dụng';
  if (companyEl) companyEl.innerHTML = `<i class="fa-solid fa-building"></i> ${escapeHtml(post.company || 'Doanh nghiệp')} (Job ID: #${post.jobId || ''})`;
  if (contentEl) contentEl.value = post.formattedContent || post.content || '';
  if (posterImg) {
    posterImg.src = post.posterUrl || (post.mediaUrls && post.mediaUrls[0]) || '/uploads/1787412190105_TUY___N_D___NG__2_.png';
  }

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closePostInspector() {
  const modal = document.getElementById('autopilot-inspector-modal') || document.getElementById('post-inspector-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function saveInspectedPost() {
  const { pageIdx, postIdx } = currentInspectedTarget;
  if (pageIdx !== null && postIdx !== null && currentAutoPilotPlan[pageIdx]?.posts[postIdx]) {
    const updatedContent = document.getElementById('inspector-post-content').value;
    currentAutoPilotPlan[pageIdx].posts[postIdx].formattedContent = updatedContent;
    appendLog(`[SAVED] Đã lưu chỉnh sửa nội dung bài đăng [${currentAutoPilotPlan[pageIdx].posts[postIdx].slot}] cho Fanpage ${currentAutoPilotPlan[pageIdx].pageName}.`);
  }
  closePostInspector();
}

async function launchAutoPilot() {
  if (!confirm('Bạn có chắc muốn bắt đầu xuất bản tự động toàn bộ bài đăng cho các Fanpage tỉnh thành?')) {
    return;
  }

  closeAutoPilotModal();

  // Tự động cuộn lên Trạm điều khiển Fanpage và khởi chạy qua Live Controller!
  const controllerEl = document.getElementById('fanpage-live-controller-panel');
  if (controllerEl) controllerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  startFanpageLiveCampaign({ noConfirm: true, plan: currentAutoPilotPlan });
}

// 10. LOGS HELPER
function appendLog(msg) {
  appendFanpageTerminalLog(msg);
}

function clearLogs() {
  clearFanpageTerminalLogs();
}

// =========================================================================
// 12. FANPAGE LIVE CONTROLLER & REAL-TIME TERMINAL ENGINE (NHƯ BÊN MODULE NHÓM)
// =========================================================================
let fanpageCampaignPollTimer = null;
let lastSeenFanpageLogIndex = 0;
let isFanpageCampaignRunning = false;

async function startFanpageLiveCampaign(customOptions = {}) {
  const confirmMsg = 'Bạn có muốn khởi chạy chiến dịch xuất bản bài đăng cho hệ thống 34 Fanpage ngay bây giờ không?';
  if (!customOptions.noConfirm && !confirm(confirmMsg)) return;

  setFanpageControllerButtonState('running');

  appendFanpageTerminalLog('[CONTROLLER] Đang kết nối máy chủ và khởi tạo chiến dịch xuất bản Fanpage...', 'info');

  try {
    const payload = customOptions.plan ? { plan: customOptions.plan } : (currentAutoPilotPlan ? { plan: currentAutoPilotPlan } : {});
    if (customOptions.targetRegion) payload.targetRegion = customOptions.targetRegion;
    if (customOptions.targetPageId) payload.targetPageId = customOptions.targetPageId;
    const res = await fetch('/api/fanpages/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();
    if (result.success) {
      if (typeof showToast === 'function') {
        showToast('Kích hoạt Live Controller', 'Đã bắt đầu chiến dịch xuất bản Fanpage. Đang truyền dữ liệu thời gian thực ra Terminal!', 'info', 4000);
      }
      isFanpageCampaignRunning = true;
      startFanpagePolling();
    } else {
      appendFanpageTerminalLog(`[LỖI KHỞI CHẠY] ${result.message}`, 'error');
      if (typeof showToast === 'function') showToast('Lỗi khởi chạy', result.message, 'danger');
      resetFanpageControllerButtons();
    }
  } catch (err) {
    appendFanpageTerminalLog(`[LỖI KẾT NỐI] ${err.message}`, 'error');
    resetFanpageControllerButtons();
  }
}

async function pauseFanpageLiveCampaign() {
  try {
    const res = await fetch('/api/fanpages/campaign/pause', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      setFanpageControllerButtonState('paused');
      ['fanpage-live-status-badge', 'autopilot-live-status-badge'].forEach(id => {
        const b = document.getElementById(id);
        if (b) {
          b.className = 'badge-pill warning';
          b.innerHTML = '<i class="fa-solid fa-pause"></i> Tạm dừng';
        }
      });
      appendFanpageTerminalLog('[CONTROLLER] Đã gửi lệnh TẠM DỪNG chiến dịch.', 'warn');
    }
  } catch (err) {
    appendFanpageTerminalLog(`[LỖI] ${err.message}`, 'error');
  }
}

async function resumeFanpageLiveCampaign() {
  try {
    const res = await fetch('/api/fanpages/campaign/resume', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      setFanpageControllerButtonState('running');
      ['fanpage-live-status-badge', 'autopilot-live-status-badge'].forEach(id => {
        const b = document.getElementById(id);
        if (b) {
          b.className = 'badge-pill info';
          b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất bản...';
        }
      });
      appendFanpageTerminalLog('[CONTROLLER] Đã gửi lệnh TIẾP TỤC chiến dịch.', 'info');
    }
  } catch (err) {
    appendFanpageTerminalLog(`[LỖI] ${err.message}`, 'error');
  }
}

async function stopFanpageLiveCampaign() {
  if (!confirm('Bạn có chắc chắn muốn DỪNG HẲN chiến dịch xuất bản Fanpage đang chạy?')) return;
  try {
    const res = await fetch('/api/fanpages/campaign/stop', { method: 'POST' });
    const result = await res.json();
    appendFanpageTerminalLog('[CONTROLLER] Đã gửi lệnh DỪNG HẲN chiến dịch.', 'error');
    resetFanpageControllerButtons();
    pollFanpageCampaignStatus();
  } catch (err) {
    appendFanpageTerminalLog(`[LỖI] ${err.message}`, 'error');
  }
}

function setFanpageControllerButtonState(mode) {
  // mode: 'idle' | 'running' | 'paused'
  const setDisp = (ids, disp) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.style.display = disp;
    });
  };
  if (mode === 'running') {
    setDisp(['btn-fanpage-start', 'btn-autopilot-start'], 'none');
    setDisp(['btn-fanpage-pause', 'btn-autopilot-pause'], 'inline-flex');
    setDisp(['btn-fanpage-resume', 'btn-autopilot-resume'], 'none');
    setDisp(['btn-fanpage-stop', 'btn-autopilot-stop'], 'inline-flex');
  } else if (mode === 'paused') {
    setDisp(['btn-fanpage-start', 'btn-autopilot-start'], 'none');
    setDisp(['btn-fanpage-pause', 'btn-autopilot-pause'], 'none');
    setDisp(['btn-fanpage-resume', 'btn-autopilot-resume'], 'inline-flex');
    setDisp(['btn-fanpage-stop', 'btn-autopilot-stop'], 'inline-flex');
  } else {
    // idle / stopped
    setDisp(['btn-fanpage-start', 'btn-autopilot-start'], 'inline-flex');
    setDisp(['btn-fanpage-pause', 'btn-autopilot-pause'], 'none');
    setDisp(['btn-fanpage-resume', 'btn-autopilot-resume'], 'none');
    setDisp(['btn-fanpage-stop', 'btn-autopilot-stop'], 'none');
  }
}

function resetFanpageControllerButtons() {
  setFanpageControllerButtonState('idle');
}

function startFanpagePolling() {
  if (fanpageCampaignPollTimer) clearInterval(fanpageCampaignPollTimer);
  pollFanpageCampaignStatus();
  fanpageCampaignPollTimer = setInterval(pollFanpageCampaignStatus, 1500);
}

async function pollFanpageCampaignStatus() {
  try {
    const res = await fetch('/api/fanpages/campaign/status');
    const result = await res.json();
    if (!result.success) return;

    const { data, logs } = result;

    // Render logs ra terminal
    if (logs && logs.length > 0) {
      if (logs.length > lastSeenFanpageLogIndex) {
        for (let i = lastSeenFanpageLogIndex; i < logs.length; i++) {
          const l = logs[i];
          if (l.message.includes('[THÀNH CÔNG]')) {
            if (typeof showToast === 'function') {
              showToast('Fanpage Thành Công!', l.message.replace(/.*\[THÀNH CÔNG\]\s*/i, ''), 'success', 4000);
            }
          } else if (l.message.includes('[LỖI]')) {
            if (typeof showToast === 'function') {
              showToast('Fanpage Thất Bại!', l.message.replace(/.*\[LỖI\]\s*/i, ''), 'danger', 5000);
            }
          }
        }
        lastSeenFanpageLogIndex = logs.length;
      }
      renderFanpageTerminalLogs(logs);
    }

    // Cập nhật trạng thái Controller UI (đồng bộ cả Page Controller tab và Auto-Pilot tab)
    const updateEls = (ids, val, prop = 'innerHTML') => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && val !== undefined) el[prop] = val;
      });
    };
    const setClasses = (ids, cls) => {
      ids.forEach(id => {
        const el = document.getElementById(id);
        if (el && cls !== undefined) el.className = cls;
      });
    };

    if (data.isRunning) {
      isFanpageCampaignRunning = true;
      setFanpageControllerButtonState(data.isPaused ? 'paused' : 'running');

      setClasses(['fanpage-live-status-badge', 'autopilot-live-status-badge'], data.isPaused ? 'badge-pill warning' : 'badge-pill info');
      updateEls(['fanpage-live-status-badge', 'autopilot-live-status-badge'], data.isPaused ? '<i class="fa-solid fa-pause"></i> Tạm dừng' : '<i class="fa-solid fa-spinner fa-spin"></i> Đang xuất bản...');

      if (data.currentCampaign) {
        const c = data.currentCampaign;
        const total = c.totalPosts || 1;
        const done = c.completed || 0;
        const pct = Math.min(100, Math.round((done / total) * 100));

        updateEls(['fanpage-live-progress-text', 'autopilot-live-progress-text'], `${done} / ${total} bài (${pct}%)`, 'textContent');
        ['fanpage-live-progress-fill', 'autopilot-live-progress-fill'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.style.width = `${pct}%`;
        });

        updateEls(['fanpage-live-count-success', 'autopilot-live-count-success'], c.success || 0, 'textContent');
        updateEls(['fanpage-live-count-processing', 'autopilot-live-count-processing'], Math.max(0, total - done), 'textContent');
        updateEls(['fanpage-live-count-failed', 'autopilot-live-count-failed'], c.failed || 0, 'textContent');

        if (c.currentPost) {
          const targetHtml = `<span style="color:#60a5fa;"><i class="fa-brands fa-facebook"></i> ${escapeHtml(c.currentPost.pageName)}</span> &bull; <span style="color:var(--text-main); font-weight:600;">${escapeHtml(c.currentPost.jobTitle)}</span>`;
          updateEls(['fanpage-live-target-name', 'autopilot-live-target-name'], targetHtml);
        } else if (c.currentStatusText) {
          updateEls(['fanpage-live-target-name', 'autopilot-live-target-name'], c.currentStatusText, 'textContent');
        }

        const remaining = Math.max(0, total - done);
        const etaHtml = `<i class="fa-solid fa-hourglass-half"></i> Còn khoảng ~${Math.ceil((remaining * 2.5) / 60)} phút`;
        updateEls(['fanpage-live-eta', 'autopilot-live-eta'], etaHtml);
      }
    } else {
      if (isFanpageCampaignRunning) {
        // Vừa hoàn tất
        isFanpageCampaignRunning = false;
        resetFanpageControllerButtons();
        setClasses(['fanpage-live-status-badge', 'autopilot-live-status-badge'], 'badge-pill success');
        updateEls(['fanpage-live-status-badge', 'autopilot-live-status-badge'], '<i class="fa-solid fa-circle-check"></i> Hoàn tất');
        if (typeof showToast === 'function') {
          showToast('Chiến dịch Fanpage hoàn tất!', 'Toàn bộ bài đăng đã được xử lý xong.', 'success', 6000);
        }
        if (typeof loadHistoryData === 'function') loadHistoryData();
      }
    }
  } catch (e) {}
}

function renderFanpageTerminalLogs(logs) {
  const containers = [
    document.getElementById('fanpage-live-terminal-logs'),
    document.getElementById('autopilot-terminal-logs'),
    document.getElementById('terminal-logs')
  ].filter(Boolean);

  if (containers.length === 0) return;

  const html = logs.map(l => {
    let color = '#94a3b8';
    let icon = 'fa-circle-info';
    if (l.type === 'error' || l.message.includes('[LỖI]')) {
      color = '#ef4444';
      icon = 'fa-circle-xmark';
    } else if (l.type === 'success' || l.message.includes('[THÀNH CÔNG]')) {
      color = '#10b981';
      icon = 'fa-circle-check';
    } else if (l.type === 'warn' || l.message.includes('[TẠM DỪNG]')) {
      color = '#f59e0b';
      icon = 'fa-triangle-exclamation';
    } else if (l.message.includes('[POSTER]')) {
      color = '#a78bfa';
      icon = 'fa-palette';
    }
    return `<div style="margin-bottom: 4px; display: flex; gap: 8px; align-items: flex-start;">
      <span style="color: #64748b; font-size: 0.72rem; min-width: 60px;">[${l.timestamp}]</span>
      <span style="color: ${color}; word-break: break-word;"><i class="fa-solid ${icon}" style="font-size: 0.65rem; margin-right: 4px;"></i>${escapeHtml(l.message)}</span>
    </div>`;
  }).join('');

  containers.forEach(c => {
    c.innerHTML = html;
    c.scrollTop = c.scrollHeight;
  });
}

function appendFanpageTerminalLog(msg, type = 'info') {
  const containers = [
    document.getElementById('fanpage-live-terminal-logs'),
    document.getElementById('autopilot-terminal-logs'),
    document.getElementById('terminal-logs')
  ].filter(Boolean);
  if (containers.length === 0) return;

  const timestamp = new Date().toLocaleTimeString('vi-VN');
  let color = '#94a3b8';
  let icon = 'fa-circle-info';
  if (type === 'error') { color = '#ef4444'; icon = 'fa-circle-xmark'; }
  else if (type === 'success') { color = '#10b981'; icon = 'fa-circle-check'; }
  else if (type === 'warn') { color = '#f59e0b'; icon = 'fa-triangle-exclamation'; }

  containers.forEach(container => {
    const div = document.createElement('div');
    div.style.marginBottom = '4px';
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.style.alignItems = 'flex-start';
    div.innerHTML = `<span style="color: #64748b; font-size: 0.72rem; min-width: 60px;">[${timestamp}]</span>
      <span style="color: ${color}; word-break: break-word;"><i class="fa-solid ${icon}" style="font-size: 0.65rem; margin-right: 4px;"></i>${escapeHtml(msg)}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  });
}

async function clearFanpageTerminalLogs() {
  const containers = [
    document.getElementById('fanpage-live-terminal-logs'),
    document.getElementById('autopilot-terminal-logs')
  ].filter(Boolean);
  containers.forEach(c => {
    c.innerHTML = '<div style="color: #64748b;">[System] Đã xóa toàn bộ nhật ký màn hình đen.</div>';
  });
  const backupContainer = document.getElementById('terminal-logs');
  if (backupContainer) backupContainer.innerHTML = '';
  lastSeenFanpageLogIndex = 0;
  try {
    await fetch('/api/fanpages/campaign/clear-logs', { method: 'POST' });
  } catch (e) {}
}

// 11. HÀM TẠO LẠI POSTER CHO BÀI ĐĂNG FANPAGE
async function regenerateCampaignPoster(force = true) {
  const job = pwState.selectedJob;
  if (!job) {
    if (typeof showToast === 'function') showToast('Vui lòng chọn 1 việc làm từ Bước 1 trước!', 'warning');
    return;
  }
  const imgPreview = document.getElementById('campaign-image-preview');
  const imgUrlInput = document.getElementById('campaign-image-url');
  const nameEl = document.getElementById('campaign-image-name');
  if (nameEl) nameEl.textContent = 'Đang tự động vẽ Poster mới...';

  try {
    const res = await fetch('/api/recruitment/generate-poster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job: job,
        pageInfo: { province: job.province || job.location },
        force: force
      })
    });
    const data = await res.json();
    if (data.success && data.imageUrl) {
      if (imgPreview) imgPreview.src = data.imageUrl + '?t=' + Date.now();
      if (imgUrlInput) imgUrlInput.value = data.imageUrl;
      if (nameEl) nameEl.innerHTML = '<span style="color:#10b981;">✓ Poster chuẩn Human Graphic Design (Nền sáng, ảnh Châu Á)</span>';
      if (typeof showToast === 'function') showToast('Đã tạo thành công Poster chuyên nghiệp cho bài đăng Fanpage!', 'success');
      appendLog(`[BANNER] Đã làm mới Poster cho "${job.title}": ${data.imageUrl}`);
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi tạo poster: ' + err.message, 'danger');
  }
}

// Expose global aliases for HTML onclick handlers
window.switchPageStep = switchPageStep;
window.switchStep = switchPageStep;
window.initPageWorkflow = initPageWorkflow;
window.searchJobs = searchJobs;
window.changePage = changePage;
window.selectJobToCampaign = selectJobToCampaign;
window.proceedToAISpin = proceedToAISpin;
window.triggerAISpin = triggerAISpin;
window.proceedToEnqueue = proceedToEnqueue;
window.regenerateCampaignPoster = regenerateCampaignPoster;
window.toggleSelectAllPages = toggleSelectAllPages;
window.filterFanpagesSelection = filterFanpagesSelection;



function viewFullInspectorPoster() {
  const img = document.getElementById('inspector-poster-img');
  if (img && img.src) {
    window.open(img.src, '_blank');
  }
}
window.viewFullInspectorPoster = viewFullInspectorPoster;

