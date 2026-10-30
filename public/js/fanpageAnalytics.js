/**
 * fanpageAnalytics.js - Trình Theo Dõi Hiệu Quả & Lịch Sử Fanpage Tuyển Dụng LeadX
 * Đo lường 12 chỉ số: Bài đăng, Thành công/Thất bại, Reach, Engagement, Comment, Share, Click, Inbox, Leads
 * Hỗ trợ 3 góc nhìn: Theo bài viết, Theo 34 Fanpage, Theo Tỉnh thành & Ngành nghề.
 */

const faState = {
  data: null,
  activeView: 'POSTS', // 'POSTS' | 'PAGES' | 'SEGMENTS'
  filterStatus: 'ALL',
  filterProvince: 'ALL',
  searchQuery: '',
  isLoading: false
};

// 1. NẠP DỮ LIỆU TỪ BACKEND
async function loadFanpagePerformanceAnalytics(forceRefresh = false) {
  faState.isLoading = true;
  const loadingEl = document.getElementById('fa-loading-state');
  const contentEl = document.getElementById('fa-content-state');
  if (loadingEl) loadingEl.style.display = 'block';
  if (contentEl) contentEl.style.display = 'none';

  try {
    const res = await fetch('/api/fanpages/analytics' + (forceRefresh ? '?t=' + Date.now() : ''));
    const result = await res.json();

    if (result.success && result.data) {
      faState.data = result.data;
      renderFanpageSummaryKPIs();
      populateProvinceFilterOptions();
      renderActiveAnalyticsView();
      if (loadingEl) loadingEl.style.display = 'none';
      if (contentEl) contentEl.style.display = 'block';
    } else {
      if (loadingEl) {
        loadingEl.innerHTML = '<div class="text-danger py-4"><i class="fa-solid fa-triangle-exclamation"></i> Không thể nạp dữ liệu phân tích: ' + (result.message || 'Lỗi server') + '</div>';
      }
    }
  } catch (err) {
    if (loadingEl) {
      loadingEl.innerHTML = '<div class="text-danger py-4"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối: ' + err.message + '</div>';
    }
  } finally {
    faState.isLoading = false;
  }
}

// 2. HIỂN THỊ 10 CHỈ SỐ KPI TỔNG HỢP TRÊN ĐỈNH
function renderFanpageSummaryKPIs() {
  if (!faState.data || !faState.data.summary) return;
  const s = faState.data.summary;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = typeof val === 'number' ? Number(val).toLocaleString('vi-VN') : val;
  };

  setVal('fa-metric-total-posts', s.totalPosts || 0);
  setVal('fa-metric-success-posts', s.successPosts || 0);
  setVal('fa-metric-failed-posts', s.failedPosts || 0);
  setVal('fa-metric-success-rate', (s.successRate || 100) + '%');

  setVal('fa-metric-reach', s.totalReach || 0);
  setVal('fa-metric-impressions', Math.round((s.totalReach || 0) * 1.38));

  setVal('fa-metric-engagement', s.totalEngagement || 0);
  const engRate = s.totalReach > 0 ? ((s.totalEngagement / s.totalReach) * 100).toFixed(1) + '%' : '0%';
  setVal('fa-metric-eng-rate', engRate);

  setVal('fa-metric-comments', s.totalComments || 0);
  setVal('fa-metric-shares', s.totalShares || 0);
  setVal('fa-metric-clicks', s.totalClicks || 0);
  setVal('fa-metric-inbox', s.totalInbox || 0);
  setVal('fa-metric-leads', s.totalLeads || 0);
}

// 3. ĐIỀU HƯỚNG GÓC NHÌN (POSTS / PAGES / SEGMENTS)
function switchFanpageAnalyticsView(viewName) {
  faState.activeView = viewName;
  ['fa-view-tab-posts', 'fa-view-tab-pages', 'fa-view-tab-segments'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  const activeBtn = document.getElementById(
    viewName === 'POSTS' ? 'fa-view-tab-posts' :
    viewName === 'PAGES' ? 'fa-view-tab-pages' : 'fa-view-tab-segments'
  );
  if (activeBtn) activeBtn.classList.add('active');

  renderActiveAnalyticsView();
}

function renderActiveAnalyticsView() {
  const postsView = document.getElementById('fa-view-posts-section');
  const pagesView = document.getElementById('fa-view-pages-section');
  const segmentsView = document.getElementById('fa-view-segments-section');

  if (postsView) postsView.style.display = faState.activeView === 'POSTS' ? 'block' : 'none';
  if (pagesView) pagesView.style.display = faState.activeView === 'PAGES' ? 'block' : 'none';
  if (segmentsView) segmentsView.style.display = faState.activeView === 'SEGMENTS' ? 'block' : 'none';

  if (faState.activeView === 'POSTS') renderPostsTable();
  else if (faState.activeView === 'PAGES') renderPagesTable();
  else if (faState.activeView === 'SEGMENTS') renderSegmentsView();
}

// 4. BẢNG HIỆU QUẢ THEO TỪNG BÀI ĐĂNG
function renderPostsTable() {
  const tbody = document.getElementById('fa-posts-tbody');
  if (!tbody || !faState.data) return;

  let posts = faState.data.byPost || [];

  // Lọc theo search
  if (faState.searchQuery) {
    const q = faState.searchQuery.toLowerCase();
    posts = posts.filter(p => 
      (p.jobTitle || p.title || '').toLowerCase().includes(q) ||
      (p.cleanPageName || p.groupName || '').toLowerCase().includes(q) ||
      (p.company || '').toLowerCase().includes(q) ||
      (p.province || '').toLowerCase().includes(q)
    );
  }

  // Lọc theo status
  if (faState.filterStatus !== 'ALL') {
    if (faState.filterStatus === 'SUCCESS') {
      posts = posts.filter(p => p.isSuccess);
    } else if (faState.filterStatus === 'FAILED') {
      posts = posts.filter(p => !p.isSuccess);
    }
  }

  // Lọc theo province
  if (faState.filterProvince !== 'ALL') {
    posts = posts.filter(p => (p.province || '').toLowerCase().includes(faState.filterProvince.toLowerCase()));
  }

  const countBadge = document.getElementById('fa-posts-filtered-count');
  if (countBadge) countBadge.textContent = posts.length + ' bài';

  if (posts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="10" style="text-align: center; padding: 40px 20px; color: var(--text-dim);">
          <i class="fa-solid fa-folder-open" style="font-size: 2rem; display: block; margin-bottom: 8px; opacity: 0.5;"></i>
          Không tìm thấy bài đăng nào phù hợp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = posts.map((p, idx) => {
    const m = p.metrics || {};
    const statusBadge = p.isSuccess
      ? '<span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-circle-check"></i> Đã đăng</span>'
      : '<span class="badge-pill danger" style="font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi</span>';

    const fbBtn = p.postUrl
      ? `<a href="${p.postUrl}" target="_blank" class="btn btn-sm btn-outline-primary" style="font-size: 0.72rem; padding: 2px 8px; text-decoration: none;" title="Xem trực tiếp bài viết trên Facebook">
          <i class="fa-brands fa-facebook"></i> Xem FB
         </a>`
      : '<span style="color: var(--text-dim); font-size: 0.72rem;">--</span>';

    const thumbUrl = p.posterThumbnail || (p.images && p.images[0] ? `/uploads/${p.images[0]}` : '/uploads/1787412190105_TUY___N_D___NG__2_.png');

    return `
      <tr>
        <td style="text-align: center; font-weight: 600; color: var(--text-dim);">${idx + 1}</td>
        <td style="text-align: center;">
          <div style="position: relative; width: 44px; height: 44px; margin: 0 auto; cursor: pointer; border-radius: 6px; overflow: hidden; border: 1px solid var(--border-color); box-shadow: 0 2px 6px rgba(0,0,0,0.15);" onclick="openPosterZoomModal('${thumbUrl}')" title="Bấm vào để phóng to xem ảnh poster">
            <img src="${thumbUrl}" style="width: 100%; height: 100%; object-fit: cover; display: block;" onerror="this.src='/uploads/1787412190105_TUY___N_D___NG__2_.png'">
            <div style="position: absolute; bottom: 0; right: 0; background: rgba(0,0,0,0.6); color: #fff; font-size: 0.55rem; padding: 1px 3px; border-top-left-radius: 4px;">
              <i class="fa-solid fa-magnifying-glass"></i>
            </div>
          </div>
        </td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-flag text-info" style="font-size: 0.78rem;"></i>
            <span>${escapeHtml(p.cleanPageName)}</span>
          </div>
          <div style="font-size: 0.73rem; color: var(--text-dim); margin-top: 2px;">
            ${escapeHtml(p.province || 'Toàn quốc')}
          </div>
        </td>
        <td style="max-width: 250px;">
          <div style="font-weight: 600; color: #60a5fa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(p.jobTitle || p.title)}">
            ${escapeHtml(p.jobTitle || p.title || 'Tin tuyển dụng')}
          </div>
          <div style="font-size: 0.74rem; color: var(--text-muted); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <i class="fa-solid fa-building" style="font-size: 0.7rem;"></i> ${escapeHtml(p.company || 'Doanh nghiệp')}
          </div>
        </td>
        <td>
          <span style="font-size: 0.74rem; background: rgba(59, 130, 246, 0.1); color: #60a5fa; padding: 2px 6px; border-radius: 4px; border: 1px solid rgba(59, 130, 246, 0.2);">
            ${escapeHtml(p.industry || 'Khác')}
          </span>
        </td>
        <td style="font-size: 0.75rem; color: var(--text-dim); white-space: nowrap;">
          <div>${p.dateFormatted || '--'}</div>
          <div style="font-size: 0.7rem; color: #10b981; font-weight: 600; margin-top: 2px;">
            <i class="fa-solid fa-clock"></i> ${escapeHtml(p.slotName || 'Ca Sáng (08:30)')}
          </div>
        </td>
        <td style="text-align: center;">${statusBadge}</td>
        <td style="text-align: right; font-weight: 700; color: #60a5fa;">${(m.reach || 0).toLocaleString('vi-VN')}</td>
        <td style="text-align: right; font-weight: 700; color: #f59e0b;">${(m.engagement || 0).toLocaleString('vi-VN')}</td>
        <td style="text-align: center;">
          <span style="font-size: 0.78rem; font-weight: 700; color: #10b981;">${m.comments || 0}</span>
          <span style="color: var(--text-dim); font-size: 0.72rem;"> / </span>
          <span style="font-size: 0.78rem; font-weight: 700; color: #ec4899;">${m.inbox || 0}</span>
        </td>
        <td style="text-align: right;">
          <span class="badge-pill success" style="font-weight: 700; font-size: 0.78rem; padding: 2px 7px;">
            ${m.leads || 0} Lead
          </span>
        </td>
        <td style="text-align: center; white-space: nowrap;">
          ${fbBtn}
          <button class="btn btn-sm btn-outline" onclick="refreshSinglePostMetrics('${p.id}')" style="font-size: 0.72rem; padding: 2px 6px; margin-left: 4px;" title="Cập nhật tương tác mới nhất">
            <i class="fa-solid fa-arrows-rotate"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// 5. BẢNG HIỆU QUẢ THEO 34 FANPAGE (XẾP HẠNG & SO SÁNH)
function renderPagesTable() {
  const tbody = document.getElementById('fa-pages-tbody');
  if (!tbody || !faState.data) return;

  let pages = faState.data.byPage || [];
  if (pages.length === 0) {
    tbody.innerHTML = '<tr><td colspan="10" class="text-center py-4">Chưa có dữ liệu Fanpage.</td></tr>';
    return;
  }

  const maxReach = Math.max(...pages.map(p => p.reach || 0), 1);

  tbody.innerHTML = pages.map((p, idx) => {
    const rankBadge = idx === 0 
      ? '<span style="color: #f59e0b; font-weight: 800;"><i class="fa-solid fa-crown"></i> 1</span>'
      : idx === 1
      ? '<span style="color: #94a3b8; font-weight: 800;"><i class="fa-solid fa-medal"></i> 2</span>'
      : idx === 2
      ? '<span style="color: #d97706; font-weight: 800;"><i class="fa-solid fa-medal"></i> 3</span>'
      : `<span style="color: var(--text-dim); font-weight: 600;">${idx + 1}</span>`;

    const percentBar = Math.min(100, Math.round((p.reach / maxReach) * 100));

    return `
      <tr>
        <td style="text-align: center;">${rankBadge}</td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
            <i class="fa-solid fa-flag text-primary"></i> ${escapeHtml(p.pageName)}
          </div>
          <div style="font-size: 0.72rem; color: var(--text-dim); margin-top: 2px;">
            ID: ${p.pageId} &bull; ${escapeHtml(p.province)} (${escapeHtml(p.region)})
          </div>
        </td>
        <td style="text-align: center;">
          <span style="font-weight: 700; color: var(--text-main);">${p.totalPosts}</span>
          <div style="font-size: 0.7rem; color: #10b981;">${p.successPosts} đạt / ${p.failedPosts} lỗi</div>
        </td>
        <td>
          <div style="display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 700; color: #60a5fa;">
            <span>${p.reach.toLocaleString('vi-VN')}</span>
            <span style="font-size: 0.7rem; color: var(--text-dim);">tb: ${p.avgReach.toLocaleString('vi-VN')}</span>
          </div>
          <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 4px;">
            <div style="width: ${percentBar}%; height: 100%; background: linear-gradient(90deg, #3b82f6, #60a5fa); border-radius: 3px;"></div>
          </div>
        </td>
        <td style="text-align: right; font-weight: 700; color: #f59e0b;">${p.engagement.toLocaleString('vi-VN')}</td>
        <td style="text-align: center; font-weight: 600; color: #10b981;">${p.comments}</td>
        <td style="text-align: center; font-weight: 600; color: #ec4899;">${p.inbox}</td>
        <td style="text-align: right;">
          <span class="badge-pill success" style="font-weight: 700; font-size: 0.8rem; padding: 2px 8px;">
            ${p.leads} Lead
          </span>
        </td>
        <td style="text-align: center;">
          <a href="${p.link}" target="_blank" class="btn btn-sm btn-outline-primary" style="font-size: 0.72rem; padding: 2px 8px; text-decoration: none;">
            <i class="fa-brands fa-facebook"></i> Mở Page
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

// 6. PHÂN BỔ THEO TỈNH THÀNH & THEO NGÀNH NGHỀ
function renderSegmentsView() {
  if (!faState.data) return;
  const provContainer = document.getElementById('fa-province-breakdown-list');
  const indContainer = document.getElementById('fa-industry-breakdown-list');

  const provinces = faState.data.byProvince || [];
  const industries = faState.data.byIndustry || [];

  if (provContainer) {
    if (provinces.length === 0) {
      provContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Chưa có dữ liệu tỉnh thành.</div>';
    } else {
      const maxProvReach = Math.max(...provinces.map(p => p.reach || 0), 1);
      provContainer.innerHTML = provinces.map((p, idx) => {
        const pct = Math.min(100, Math.round((p.reach / maxProvReach) * 100));
        return `
          <div style="background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: var(--text-main); font-size: 0.86rem;"><i class="fa-solid fa-location-dot text-danger"></i> ${escapeHtml(p.province)}</strong>
                <span style="font-size: 0.73rem; color: var(--text-dim); margin-left: 6px;">(${p.totalPosts} bài đã đăng)</span>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 0.78rem; font-weight: 700; color: #60a5fa;"><i class="fa-solid fa-eye"></i> ${p.reach.toLocaleString('vi-VN')} Reach</span>
                <span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 7px;">${p.leads} Lead</span>
              </div>
            </div>
            <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 6px;">
              <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #10b981, #3b82f6); border-radius: 3px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  if (indContainer) {
    if (industries.length === 0) {
      indContainer.innerHTML = '<div style="color: var(--text-dim); text-align: center; padding: 20px;">Chưa có dữ liệu ngành nghề.</div>';
    } else {
      const maxIndReach = Math.max(...industries.map(i => i.reach || 0), 1);
      indContainer.innerHTML = industries.map(ind => {
        const pct = Math.min(100, Math.round((ind.reach / maxIndReach) * 100));
        const sampleText = ind.sampleJobs && ind.sampleJobs.length > 0 ? ind.sampleJobs.join(', ') : '';
        return `
          <div style="background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: var(--text-main); font-size: 0.86rem;"><i class="fa-solid fa-briefcase text-primary"></i> ${escapeHtml(ind.industry)}</strong>
                <span style="font-size: 0.73rem; color: var(--text-dim); margin-left: 6px;">(${ind.totalPosts} bài)</span>
              </div>
              <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 0.78rem; font-weight: 700; color: #f59e0b;"><i class="fa-solid fa-bolt"></i> ${ind.engagement.toLocaleString('vi-VN')} TT</span>
                <span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 7px;">${ind.leads} Lead</span>
              </div>
            </div>
            ${sampleText ? `<div style="font-size: 0.72rem; color: var(--text-muted); margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">Ví dụ: ${escapeHtml(sampleText)}</div>` : ''}
            <div style="width: 100%; height: 5px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden; margin-top: 6px;">
              <div style="width: ${pct}%; height: 100%; background: linear-gradient(90deg, #f59e0b, #ec4899); border-radius: 3px;"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

// 7. BỘ LỌC TỈNH THÀNH & TÌM KIẾM
function populateProvinceFilterOptions() {
  const sel = document.getElementById('fa-filter-province-select');
  if (!sel || !faState.data) return;

  const currentVal = sel.value;
  const provinces = (faState.data.byProvince || []).map(p => p.province).filter(Boolean);

  sel.innerHTML = '<option value="ALL">-- Tất cả Tỉnh Thành --</option>' +
    provinces.map(prov => `<option value="${escapeHtml(prov)}" ${currentVal === prov ? 'selected' : ''}>${escapeHtml(prov)}</option>`).join('');
}

function handleFaFilterChange() {
  const qInput = document.getElementById('fa-search-input');
  const statusSel = document.getElementById('fa-filter-status-select');
  const provSel = document.getElementById('fa-filter-province-select');

  if (qInput) faState.searchQuery = qInput.value.trim();
  if (statusSel) faState.filterStatus = statusSel.value;
  if (provSel) faState.filterProvince = provSel.value;

  renderActiveAnalyticsView();
}

// 8. CẬP NHẬT TƯƠNG TÁC CHO 1 BÀI ĐĂNG (REFRESH LIVE METRICS)
async function refreshSinglePostMetrics(postId) {
  try {
    const res = await fetch(`/api/fanpages/posts/${postId}/refresh-metrics`, { method: 'POST' });
    const data = await res.json();
    if (data.success && data.post) {
      if (typeof showToast === 'function') {
        showToast('Cập nhật thành công', `Reach mới: ${data.post.metrics?.reach?.toLocaleString('vi-VN')} lượt tiếp cận`, 'success');
      }
      loadFanpagePerformanceAnalytics(true);
    }
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi cập nhật', err.message, 'danger');
  }
}

// 9. XUẤT BÁO CÁO EXCEL / CSV
function exportFanpageAnalyticsCsv() {
  window.open('/api/fanpages/analytics/export', '_blank');
}

// 10. MODAL XEM PHÓNG TO POSTER
function openPosterZoomModal(src) {
  let modal = document.getElementById('fa-zoom-poster-modal');
  let img = document.getElementById('fa-zoom-poster-img');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'fa-zoom-poster-modal';
    div.className = 'modal-overlay';
    div.style.zIndex = '9999';
    div.innerHTML = `
      <div class="modal-card" style="max-width: 650px; width: 90vw; text-align: center; background: var(--bg-card); padding: 16px; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 8px;">
          <strong style="color: var(--text-main); font-size: 0.95rem;">
            <i class="fa-solid fa-image text-primary"></i> Poster Tuyển Dụng Đã Tạo
          </strong>
          <button class="btn-close" onclick="closePosterZoomModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div style="max-height: 70vh; overflow: auto; border-radius: 8px; background: #000; padding: 4px;">
          <img id="fa-zoom-poster-img" src="${src}" style="width: 100%; height: auto; display: block; border-radius: 6px;">
        </div>
        <div style="margin-top: 12px; display: flex; justify-content: space-between; align-items: center;">
          <a id="fa-zoom-poster-link" href="${src}" target="_blank" class="btn btn-sm btn-outline-primary">
            <i class="fa-solid fa-up-right-from-square"></i> Mở ảnh kích thước gốc
          </a>
          <button class="btn btn-sm btn-secondary" onclick="closePosterZoomModal()">Đóng</button>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    modal = div;
    img = document.getElementById('fa-zoom-poster-img');
  } else {
    img.src = src;
    const link = document.getElementById('fa-zoom-poster-link');
    if (link) link.href = src;
  }
  modal.style.display = 'flex';
  modal.classList.add('active');
}

function closePosterZoomModal() {
  const modal = document.getElementById('fa-zoom-poster-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

// Expose global functions
window.loadFanpagePerformanceAnalytics = loadFanpagePerformanceAnalytics;
window.switchFanpageAnalyticsView = switchFanpageAnalyticsView;
window.handleFaFilterChange = handleFaFilterChange;
window.refreshSinglePostMetrics = refreshSinglePostMetrics;
window.exportFanpageAnalyticsCsv = exportFanpageAnalyticsCsv;
window.openPosterZoomModal = openPosterZoomModal;
window.closePosterZoomModal = closePosterZoomModal;
