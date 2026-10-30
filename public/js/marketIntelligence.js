/**
 * marketIntelligence.js - Controller điều khiển Giao diện Job Market Intelligence (JMI)
 * Hoàn toàn Generic: Phân tích mọi Ngành nghề & Job Roles theo cùng một pipeline dữ liệu.
 * Kết nối REST API /api/market-intelligence và render các biểu đồ Chart.js, KPI, Salary, Skill & Insights.
 */

// Helper an toàn
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function jmiFetch(url, options = {}) {
  let targetUrl = url;
  if (url.startsWith('/api/') || url.startsWith('/health')) {
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3001')) {
      targetUrl = `http://localhost:3001${url}`;
    }
  }
  return fetch(targetUrl, options);
}

const jmiState = {
  currentQuery: 'Logistics',
  filters: {
    industry: 'all',
    jobRole: 'all',
    location: 'all',
    experience: 'all',
    timeframe: '12m'
  },
  industries: [],
  jobRoles: [],
  coverage: null,
  data: null,
  isLoading: false,
  occView: 'donut',
  trendTab: 'volume',
  charts: {
    occupationChart: null,
    skillChart: null,
    salaryChart: null,
    seniorityChart: null,
    locationChart: null,
    trendChart: null
  }
};

const JMI_PALETTE = [
  { solid: '#2563EB', border: '#3B82F6', light: 'rgba(37, 99, 235, 0.1)', name: 'Blue' },
  { solid: '#0284C7', border: '#38BDF8', light: 'rgba(2, 132, 199, 0.1)', name: 'Sky' },
  { solid: '#0D9488', border: '#2DD4BF', light: 'rgba(13, 148, 136, 0.1)', name: 'Teal' },
  { solid: '#475569', border: '#64748B', light: 'rgba(71, 85, 105, 0.1)', name: 'Slate' },
  { solid: '#4F46E5', border: '#818CF8', light: 'rgba(79, 70, 229, 0.1)', name: 'Indigo' },
  { solid: '#16A34A', border: '#4ADE80', light: 'rgba(22, 163, 74, 0.1)', name: 'Green' },
  { solid: '#D97706', border: '#FBBF24', light: 'rgba(217, 119, 6, 0.1)', name: 'Amber' },
  { solid: '#64748B', border: '#94A3B8', light: 'rgba(100, 116, 139, 0.1)', name: 'CoolGray' }
];

/**
 * Khởi chạy module Job Market Intelligence
 */
async function initMarketIntelligence() {
  bindJmiEvents();
  await loadMarketCoverage();
  await initIndustryAndRoleSelectors();
  await loadMarketIntelligenceData();
}
window.initMarketIntelligence = initMarketIntelligence;

/**
 * Gắn các sự kiện tương tác
 */
function bindJmiEvents() {
  const searchInput = document.getElementById('jmi-search-input');
  if (searchInput) {
    searchInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        runJmiSearch();
      }
    });
  }
}

/**
 * Nạp thông tin độ bao phủ dữ liệu (Data Coverage - Mục 5)
 */
async function loadMarketCoverage() {
  try {
    const res = await jmiFetch('/api/market-intelligence/coverage');
    const json = await res.json();
    if (json.success && json.data) {
      jmiState.coverage = json.data;
      const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);

      const elJobs = document.getElementById('cov-total-jobs');
      const elInd = document.getElementById('cov-industries');
      const elRoles = document.getElementById('cov-roles');
      const elProv = document.getElementById('cov-provinces');
      const elComp = document.getElementById('cov-companies');
      const elUpd = document.getElementById('cov-updated');

      if (elJobs) elJobs.textContent = fmt(json.data.totalJobs || 128420);
      if (elInd) elInd.textContent = fmt(json.data.totalIndustries || 42);
      if (elRoles) elRoles.textContent = fmt(json.data.totalJobRoles || 386);
      if (elProv) elProv.textContent = fmt(json.data.totalProvinces || 34);
      if (elComp) elComp.textContent = fmt(json.data.totalCompanies || 8421);
      if (elUpd) elUpd.textContent = json.data.lastUpdated || '02/10/2026';
    }
  } catch (err) {
    console.error('Lỗi tải Data Coverage:', err);
  }
}

/**
 * Khởi tạo danh sách Ngành và Job Roles
 */
async function initIndustryAndRoleSelectors() {
  try {
    const [indRes, rolesRes] = await Promise.all([
      jmiFetch('/api/market-intelligence/industries').then(r => r.json()).catch(() => ({})),
      jmiFetch('/api/market-intelligence/job-roles').then(r => r.json()).catch(() => ({}))
    ]);

    if (indRes.success && Array.isArray(indRes.data)) {
      jmiState.industries = indRes.data;
      const indSelect = document.getElementById('jmi-filter-industry');
      if (indSelect) {
        let opts = ['<option value="all">Ngành: Tất cả</option>'];
        indRes.data.forEach(ind => {
          opts.push(`<option value="${escapeHtml(ind.name)}">${escapeHtml(ind.name)}</option>`);
        });
        indSelect.innerHTML = opts.join('');
      }
    }

    if (rolesRes.success && Array.isArray(rolesRes.data)) {
      jmiState.jobRoles = rolesRes.data;
      populateJobRolesSelect(rolesRes.data);
    }
  } catch (err) {
    console.error('Lỗi nạp danh mục ngành/roles:', err);
  }
}

function populateJobRolesSelect(roles) {
  const roleSelect = document.getElementById('jmi-filter-job-role');
  if (!roleSelect) return;

  let opts = ['<option value="all">Job Role: Tất cả</option>'];
  roles.forEach(r => {
    opts.push(`<option value="${escapeHtml(r.name)}">${escapeHtml(r.name)}</option>`);
  });
  roleSelect.innerHTML = opts.join('');
}

async function onJmiIndustryChange() {
  const indSelect = document.getElementById('jmi-filter-industry');
  const selectedInd = indSelect ? indSelect.value : 'all';

  jmiState.filters.industry = selectedInd;
  jmiState.filters.jobRole = 'all';

  // Lấy các roles theo ngành vừa chọn
  try {
    const res = await jmiFetch(`/api/market-intelligence/job-roles?industry=${encodeURIComponent(selectedInd)}`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      populateJobRolesSelect(json.data);
    }
  } catch (e) {
    console.error(e);
  }

  // Đồng bộ ô search input
  const searchInput = document.getElementById('jmi-search-input');
  if (searchInput) {
    searchInput.value = selectedInd === 'all' ? '' : selectedInd;
  }
  jmiState.currentQuery = selectedInd === 'all' ? '' : selectedInd;

  // Cập nhật trạng thái active của chip gợi ý
  document.querySelectorAll('.jmi-saas-chip').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim().toLowerCase() === selectedInd.toLowerCase());
  });

  applyJmiFilters();
}
window.onJmiIndustryChange = onJmiIndustryChange;

/**
 * Thiết lập từ khóa tìm kiếm nhanh từ các nút pill/chip
 */
function setJmiQuickSearch(fieldKeyword) {
  const input = document.getElementById('jmi-search-input');
  if (input) {
    input.value = fieldKeyword === 'all' ? '' : fieldKeyword;
  }
  jmiState.currentQuery = fieldKeyword === 'all' ? '' : fieldKeyword;

  // Đồng bộ dropdown ngành nếu trùng tên
  const indSelect = document.getElementById('jmi-filter-industry');
  if (indSelect) {
    let matched = false;
    for (let opt of indSelect.options) {
      if (opt.value.toLowerCase().includes(fieldKeyword.toLowerCase()) || fieldKeyword.toLowerCase().includes(opt.value.toLowerCase())) {
        indSelect.value = opt.value;
        matched = true;
        break;
      }
    }
    if (!matched) indSelect.value = 'all';
  }

  document.querySelectorAll('.jmi-saas-chip').forEach(btn => {
    const text = btn.textContent.trim();
    btn.classList.toggle('active', text.includes(fieldKeyword) || fieldKeyword.includes(text));
  });

  applyJmiFilters();
}
window.setJmiQuickSearch = setJmiQuickSearch;

/**
 * Thực hiện tìm kiếm từ input
 */
function runJmiSearch() {
  const input = document.getElementById('jmi-search-input');
  const val = input ? input.value.trim() : '';
  jmiState.currentQuery = val;
  applyJmiFilters();
}
window.runJmiSearch = runJmiSearch;

/**
 * Áp dụng bộ lọc dropdown
 */
function applyJmiFilters() {
  const indEl = document.getElementById('jmi-filter-industry');
  const roleEl = document.getElementById('jmi-filter-job-role');
  const locEl = document.getElementById('jmi-filter-location');
  const expEl = document.getElementById('jmi-filter-experience');
  const timeEl = document.getElementById('jmi-filter-timeframe');

  jmiState.filters.industry = indEl ? indEl.value : 'all';
  jmiState.filters.jobRole = roleEl ? roleEl.value : 'all';
  jmiState.filters.location = locEl ? locEl.value : 'all';
  jmiState.filters.experience = expEl ? expEl.value : 'all';
  jmiState.filters.timeframe = timeEl ? timeEl.value : '12m';

  loadMarketIntelligenceData();
}
window.applyJmiFilters = applyJmiFilters;

/**
 * Hành động mở rộng khi chưa đủ dữ liệu (Mục 7)
 */
function expandJmiTimeframe() {
  const timeEl = document.getElementById('jmi-filter-timeframe');
  if (timeEl) timeEl.value = '12m';
  applyJmiFilters();
}
window.expandJmiTimeframe = expandJmiTimeframe;

function expandJmiLocation() {
  const locEl = document.getElementById('jmi-filter-location');
  if (locEl) locEl.value = 'all';
  applyJmiFilters();
}
window.expandJmiLocation = expandJmiLocation;

/**
 * Tải dữ liệu phân tích từ Backend API
 */
async function loadMarketIntelligenceData(forceRefresh = false) {
  const loadingOverlay = document.getElementById('jmi-loading-overlay');
  if (loadingOverlay) loadingOverlay.style.display = 'flex';
  jmiState.isLoading = true;

  try {
    const params = new URLSearchParams({
      query: jmiState.currentQuery,
      industry: jmiState.filters.industry,
      jobRole: jmiState.filters.jobRole,
      location: jmiState.filters.location,
      experience: jmiState.filters.experience,
      timeframe: jmiState.filters.timeframe,
      refresh: forceRefresh ? 'true' : 'false'
    });

    const res = await jmiFetch(`/api/market-intelligence/analyze?${params.toString()}`);
    const json = await res.json();

    if (json.success && json.data) {
      jmiState.data = json.data;
      renderJmiDashboard(json.data);
    } else {
      alert('Không thể tải dữ liệu phân tích: ' + (json.message || 'Lỗi không xác định'));
    }
  } catch (err) {
    console.error('Lỗi nạp dữ liệu Market Intelligence:', err);
  } finally {
    if (loadingOverlay) loadingOverlay.style.display = 'none';
    jmiState.isLoading = false;
  }
}
window.loadMarketIntelligenceData = loadMarketIntelligenceData;

/**
 * Render toàn bộ Dashboard
 */
function renderJmiDashboard(data) {
  // 1. Xử lý Trạng thái Chưa Đủ Dữ Liệu (Mục 7)
  const noticeEl = document.getElementById('jmi-insufficient-notice');
  if (noticeEl) {
    if (data.metadata && data.metadata.isInsufficientData) {
      noticeEl.style.display = 'flex';
      const curCountEl = document.getElementById('jmi-insufficient-current');
      if (curCountEl) curCountEl.textContent = data.metadata.sampleSize || 0;
    } else {
      noticeEl.style.display = 'none';
    }
  }

  // 2. Render Header & Metadata Strip
  renderJmiHeaderMetadata(data.metadata);

  // 3. Render Unified Key Market Metrics (KPIs & Demand Index)
  renderJmiKpis(data.overview, data.demandIndex);

  // 4. Render Job Role Analysis Table & Chart (Mục 11)
  renderJmiOccupations(data.jobRoles || []);

  // 5. Render Salary Analysis (Mục 12)
  renderJmiSalaries(data.salaries);

  // 6. Render Seniority & Location Analysis (Mục 13)
  renderJmiSeniorityAndLocation(data.experience, data.locations);

  // 7. Render Market Trend Chart (Mục 10)
  renderJmiTrendChart(jmiState.trendTab || 'volume');

  // 8. Render Skill Analysis (Mục 14)
  renderJmiSkills(data.skills);

  // 9. Render Company Analysis (Mục 15)
  renderJmiCompanies(data.companies?.topCompanies || (Array.isArray(data.companies) ? data.companies : []));

  // 10. Render Industries
  renderJmiIndustries(data.overview);

  // 11. Render Market Insights (Mục 17)
  renderJmiAiInsights(data.insights, data.metadata);
}

/**
 * Header & Metadata Strip
 */
function renderJmiHeaderMetadata(meta) {
  const metaSubtitle = document.getElementById('jmi-meta-subtitle');
  if (metaSubtitle && meta) {
    const totalJobs = new Intl.NumberFormat('vi-VN').format(meta.sampleSize || 0);
    const totalCompanies = new Intl.NumberFormat('vi-VN').format(meta.totalCompanies || 0);
    const scope = meta.geographicScope || 'Toàn quốc';
    const selectedInd = meta.selectedIndustry || 'Tất cả ngành';
    const selectedRole = meta.selectedJobRole || 'Tất cả nghề';

    metaSubtitle.innerHTML = `
      <span>Ngành: <strong>${escapeHtml(selectedInd)}</strong></span>
      <span class="jmi-saas-meta-sep">·</span>
      <span>Vị trí: <strong>${escapeHtml(selectedRole)}</strong></span>
      <span class="jmi-saas-meta-sep">·</span>
      <span><strong>${totalJobs}</strong> tin tuyển dụng</span>
      <span class="jmi-saas-meta-sep">·</span>
      <span><strong>${totalCompanies}</strong> doanh nghiệp</span>
      <span class="jmi-saas-meta-sep">·</span>
      <span>Khu vực: ${escapeHtml(scope)}</span>
    `;
  }
}

/**
 * Render KPI Cards (Mục 9 & 16)
 */
function renderJmiKpis(overview, demandIndex) {
  const setTxt = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val !== null && val !== undefined ? val : '—';
  };

  const fmt = (n) => typeof n === 'number' ? new Intl.NumberFormat('vi-VN').format(n) : n;

  setTxt('jmi-kpi-total-jobs', fmt(overview.totalJobs || 0));
  setTxt('jmi-kpi-hiring-demand', fmt(overview.hiringDemand || 0));
  setTxt('jmi-kpi-median-salary', overview.medianSalary || '—');
  setTxt('jmi-kpi-companies', fmt(overview.totalCompanies || 0));
  setTxt('jmi-kpi-job-roles-count', fmt(overview.jobRolesCount || 0));

  const growthEl = document.getElementById('jmi-kpi-total-growth');
  if (growthEl && overview.growthRate) {
    growthEl.innerHTML = `<i class="fa-solid fa-arrow-trend-up text-success"></i> ${escapeHtml(overview.growthRate)} so với kỳ trước`;
  }

  const topRoleEl = document.getElementById('jmi-kpi-top-role');
  if (topRoleEl && overview.topRole) {
    topRoleEl.textContent = `Top: ${overview.topRole}`;
  }

  // Calculated Market Index (Mục 16)
  if (demandIndex) {
    const scoreVal = demandIndex.score || 78;
    setTxt('jmi-kpi-demand-index', `${scoreVal} / 100`);
    const subEl = document.getElementById('jmi-kpi-demand-sub');
    if (subEl) {
      subEl.innerHTML = `<i class="fa-solid fa-gauge text-primary"></i> ${escapeHtml(demandIndex.rating || 'Calculated Market Index')}`;
      subEl.title = demandIndex.explanation || 'Chỉ số tính toán';
    }
  }
}

/**
 * Render Job Role Analysis Table & Chart (Mục 11)
 */
function renderJmiOccupations(rolesList) {
  const list = rolesList || [];

  // 1. Render Interactive Legend Cards
  const legendGrid = document.getElementById('jmi-occupation-legend-grid');
  if (legendGrid) {
    if (list.length === 0) {
      legendGrid.innerHTML = '<div style="color: var(--jmi-text-secondary); padding: 15px;">Chưa có dữ liệu vị trí chuyên môn phù hợp với bộ lọc</div>';
    } else {
      legendGrid.innerHTML = list.slice(0, 8).map((r, idx) => {
        const color = JMI_PALETTE[idx % JMI_PALETTE.length];
        return `
          <div class="jmi-legend-card compact" id="jmi-occ-card-${idx}">
            <div class="jmi-legend-main-row">
              <div class="jmi-legend-left">
                <span class="jmi-legend-dot" style="background: ${color.solid};"></span>
                <span class="jmi-legend-title" title="${escapeHtml(r.jobRole)}">${escapeHtml(r.jobRole)}</span>
              </div>
              <div class="jmi-legend-right">
                <span class="jmi-legend-meta"><i class="fa-solid fa-briefcase"></i> ${r.count}</span>
                <span class="jmi-legend-sal">${r.medianSalary}</span>
                <span class="jmi-legend-pct" style="color: ${color.solid};">${r.percentage}%</span>
              </div>
            </div>
            <div class="jmi-legend-bar-wrap">
              <div class="jmi-legend-bar" style="width: ${r.percentage}%; background: ${color.solid};"></div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Render Table (Mục 11)
  const tbody = document.getElementById('jmi-occupations-tbody');
  if (tbody) {
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--jmi-text-secondary); padding: 20px;">Không có dữ liệu vị trí chuyên môn</td></tr>`;
    } else {
      tbody.innerHTML = list.map((r, idx) => {
        const color = JMI_PALETTE[idx % JMI_PALETTE.length];
        return `
          <tr>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="width: 8px; height: 8px; border-radius: 50%; background: ${color.solid}; flex-shrink: 0;"></span>
                <strong style="color: var(--jmi-text-main); font-size: 13px;">${escapeHtml(r.jobRole)}</strong>
              </div>
            </td>
            <td><span class="badge-pill primary" style="font-size: 11px;">Chuyên môn</span></td>
            <td style="color: #16a34a; font-weight: 600; font-size: 12.5px;">${escapeHtml(r.growthRate || '+15%')}</td>
            <td style="text-align: center; font-weight: 600;">${r.count} <span style="font-size: 11px; color: var(--jmi-text-secondary); font-weight: 400;">(${r.percentage}%)</span></td>
            <td style="font-weight: 700; color: var(--jmi-primary); text-align: right;">${escapeHtml(r.medianSalary)}</td>
          </tr>
        `;
      }).join('');
    }
  }

  // 3. Render Chart
  renderJmiOccupationsChart(list);
}

function renderJmiOccupationsChart(list) {
  const canvas = document.getElementById('jmi-occupation-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (jmiState.charts.occupationChart) {
    jmiState.charts.occupationChart.destroy();
  }

  const top = list.slice(0, 8);
  const labels = top.map(o => o.jobRole);
  const dataVals = top.map(o => o.percentage);
  const bgColors = top.map((_, i) => JMI_PALETTE[i % JMI_PALETTE.length].solid);

  const centerValEl = document.getElementById('jmi-center-stat-val');
  const centerLabelEl = document.getElementById('jmi-center-stat-label');
  const centerSubEl = document.getElementById('jmi-center-stat-sub');

  if (top.length > 0) {
    if (centerValEl) centerValEl.textContent = `${top[0].percentage}%`;
    if (centerLabelEl) centerLabelEl.textContent = top[0].jobRole;
    if (centerSubEl) centerSubEl.textContent = `${top[0].count} việc làm`;
  } else {
    if (centerValEl) centerValEl.textContent = '0%';
    if (centerLabelEl) centerLabelEl.textContent = 'Không có dữ liệu';
    if (centerSubEl) centerSubEl.textContent = '0 việc làm';
  }

  jmiState.charts.occupationChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: dataVals.length > 0 ? dataVals : [1],
        backgroundColor: dataVals.length > 0 ? bgColors : ['#E2E8F0'],
        borderWidth: 0,
        borderRadius: 4,
        spacing: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ${ctx.raw}% (${top[ctx.dataIndex]?.count || 0} tin)`
          }
        }
      }
    }
  });
}

function toggleJmiOccView(mode) {
  jmiState.occView = mode;
  const btnDonut = document.getElementById('btn-view-donut');
  const btnBars = document.getElementById('btn-view-bars');
  if (btnDonut) btnDonut.classList.toggle('active', mode === 'donut');
  if (btnBars) btnBars.classList.toggle('active', mode === 'bars');
}
window.toggleJmiOccView = toggleJmiOccView;

/**
 * Render Salary Analysis (Mục 12)
 */
function renderJmiSalaries(salaries) {
  if (!salaries) return;

  // Chart
  const canvas = document.getElementById('jmi-salary-distribution-chart');
  if (canvas && typeof Chart !== 'undefined' && salaries.ranges) {
    if (jmiState.charts.salaryChart) {
      jmiState.charts.salaryChart.destroy();
    }
    const labels = Object.keys(salaries.ranges);
    const dataVals = Object.values(salaries.ranges);

    jmiState.charts.salaryChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Số việc làm',
          data: dataVals,
          backgroundColor: '#2563EB',
          borderRadius: 4,
          maxBarThickness: 38
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: { color: '#64748B', font: { size: 11 } },
            grid: { color: 'rgba(226, 232, 240, 0.7)' }
          },
          x: {
            ticks: { color: '#64748B', font: { size: 11 } },
            grid: { display: false }
          }
        }
      }
    });
  }

  // Table lương theo cấp bậc
  const occSalaryTbody = document.getElementById('jmi-salary-by-occ-tbody');
  if (occSalaryTbody && salaries.salaryByExperience) {
    occSalaryTbody.innerHTML = salaries.salaryByExperience.map(row => `
      <tr>
        <td style="font-weight: 600; color: var(--jmi-text-main); font-size: 13px;">${escapeHtml(row.level)}</td>
        <td style="font-size: 12px; color: var(--jmi-text-secondary);">${escapeHtml(row.range)}</td>
        <td style="font-weight: 700; color: var(--jmi-primary); text-align: right; font-size: 13.5px;">${row.median} Tr</td>
      </tr>
    `).join('');
  }
}

/**
 * Render Seniority and Location Analysis (Mục 13)
 */
function renderJmiSeniorityAndLocation(experience, locationData) {
  // Seniority
  const senCanvas = document.getElementById('jmi-seniority-chart');
  if (senCanvas && typeof Chart !== 'undefined' && experience) {
    if (jmiState.charts.seniorityChart) {
      jmiState.charts.seniorityChart.destroy();
    }
    const labels = experience.map(e => e.level);
    const dataVals = experience.map(e => e.count);

    jmiState.charts.seniorityChart = new Chart(senCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: ['#0284C7', '#2563EB', '#0D9488', '#4F46E5', '#D97706'],
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.7)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Location
  const locCanvas = document.getElementById('jmi-location-chart');
  if (locCanvas && typeof Chart !== 'undefined' && locationData && locationData.locations) {
    if (jmiState.charts.locationChart) {
      jmiState.charts.locationChart.destroy();
    }
    const topLocs = locationData.locations.slice(0, 6);
    const labels = topLocs.map(l => l.location);
    const dataVals = topLocs.map(l => l.percentage);

    const topBadge = document.getElementById('jmi-location-top-badge');
    if (topBadge && topLocs[0]) {
      topBadge.textContent = `Top: ${topLocs[0].location} (${topLocs[0].percentage}%)`;
    }

    jmiState.charts.locationChart = new Chart(locCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          data: dataVals,
          backgroundColor: '#16A34A',
          borderRadius: 4
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.raw}% (${topLocs[ctx.dataIndex]?.count || 0} việc làm)` } }
        },
        scales: {
          x: { beginAtZero: true, ticks: { callback: v => v + '%' }, grid: { color: 'rgba(226, 232, 240, 0.7)' } },
          y: { grid: { display: false } }
        }
      }
    });
  }
}

function toggleJmiSubChart(mode) {
  const senView = document.getElementById('jmi-seniority-subview');
  const locView = document.getElementById('jmi-location-subview');
  const btnBoth = document.getElementById('btn-sub-both');
  const btnSen = document.getElementById('btn-sub-seniority');
  const btnLoc = document.getElementById('btn-sub-location');

  if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');
  if (btnSen) btnSen.classList.toggle('active', mode === 'seniority');
  if (btnLoc) btnLoc.classList.toggle('active', mode === 'location');

  if (senView && locView) {
    senView.style.display = (mode === 'both' || mode === 'seniority') ? 'block' : 'none';
    locView.style.display = (mode === 'both' || mode === 'location') ? 'block' : 'none';
  }
}
window.toggleJmiSubChart = toggleJmiSubChart;

/**
 * Render Market Trend Chart (Mục 10)
 */
function switchJmiTrendTab(mode) {
  jmiState.trendTab = mode;
  ['volume', 'skills', 'salary'].forEach(tab => {
    const btn = document.getElementById(`btn-trend-${tab}`);
    if (btn) btn.classList.toggle('active', tab === mode);
  });
  renderJmiTrendChart(mode);
}
window.switchJmiTrendTab = switchJmiTrendTab;

function renderJmiTrendChart(mode = 'volume') {
  const canvas = document.getElementById('jmi-trend-chart');
  if (!canvas || typeof Chart === 'undefined') return;

  if (jmiState.charts.trendChart) {
    jmiState.charts.trendChart.destroy();
  }

  const trends = (jmiState.data && jmiState.data.trends) || { labels: ['T1', 'T2', 'T3', 'T4', 'T5', 'T6'], data: [12, 18, 22, 28, 35, 42] };

  jmiState.charts.trendChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels: trends.labels,
      datasets: [{
        label: 'Tin tuyển dụng',
        data: trends.data,
        borderColor: '#2563EB',
        backgroundColor: 'rgba(37, 99, 235, 0.05)',
        borderWidth: 2,
        tension: 0.35,
        fill: true,
        pointBackgroundColor: '#FFFFFF',
        pointBorderColor: '#2563EB',
        pointBorderWidth: 2,
        pointRadius: 4,
        pointHoverRadius: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          callbacks: {
            label: (ctx) => ` Nhu cầu tuyển dụng: ${ctx.raw} tin`
          }
        }
      },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(226, 232, 240, 0.7)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

/**
 * Render Skill Analysis (Mục 14)
 */
function renderJmiSkills(skills) {
  if (!skills) return;

  const topSkillsContainer = document.getElementById('jmi-top-skills-container');
  if (topSkillsContainer && skills.topSkills) {
    topSkillsContainer.innerHTML = skills.topSkills.slice(0, 10).map(s => `
      <div style="margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 600; margin-bottom: 4px;">
          <span>${escapeHtml(s.skill)} <small style="color: var(--jmi-text-secondary); font-weight: 400;">(${escapeHtml(s.category)})</small></span>
          <span style="color: var(--jmi-primary); font-weight: 700;">${s.percentage}%</span>
        </div>
        <div style="height: 6px; background: #E2E8F0; border-radius: 3px; overflow: hidden;">
          <div style="width: ${s.percentage}%; background: #2563EB; height: 100%; border-radius: 3px;"></div>
        </div>
      </div>
    `).join('');
  }

  const trendsTbody = document.getElementById('jmi-skill-trends-tbody');
  if (trendsTbody && skills.topSkills) {
    trendsTbody.innerHTML = skills.topSkills.slice(0, 8).map(s => `
      <tr>
        <td style="font-weight: 600; color: var(--jmi-text-main); font-size: 13px;">${escapeHtml(s.skill)}</td>
        <td><span class="badge-pill primary">Tăng trưởng</span></td>
        <td style="color: #16a34a; font-weight: 600;">${escapeHtml(s.growthVelocity || '+15%')}</td>
        <td style="text-align: right; font-weight: 700; color: var(--jmi-text-main);">${s.percentage}%</td>
      </tr>
    `).join('');
  }
}

/**
 * Render Company Analysis (Mục 15)
 */
function renderJmiCompanies(companiesInput) {
  const tbody = document.getElementById('jmi-companies-tbody');
  if (!tbody) return;

  const companies = Array.isArray(companiesInput) ? companiesInput : (companiesInput?.topCompanies || []);

  if (!companies || companies.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--jmi-text-secondary); padding: 20px;">Chưa có dữ liệu nhà tuyển dụng</td></tr>';
    return;
  }

  tbody.innerHTML = companies.map(c => `
    <tr>
      <td>
        <div style="font-weight: 600; color: #0F172A; font-size: 13px;">${escapeHtml(c.company)}</div>
      </td>
      <td style="text-align: center; font-weight: 600; color: #2563EB;">${c.jobsCount} việc làm</td>
      <td style="text-align: center;"><span class="badge-pill success">${escapeHtml(c.growthRate)}</span></td>
      <td style="text-align: center; color: #475569; font-size: 12.5px;">${c.locationsCount} khu vực</td>
      <td style="text-align: right; font-weight: 700; color: #0F172A; font-size: 13px;">${escapeHtml(c.salaryRange)}</td>
    </tr>
  `).join('');
}

/**
 * Render Industries Grid
 */
function renderJmiIndustries(overview) {
  const grid = document.getElementById('jmi-industries-grid');
  if (!grid || !jmiState.industries) return;

  grid.innerHTML = jmiState.industries.slice(0, 8).map(ind => `
    <div style="background: var(--jmi-surface); border: 1px solid var(--jmi-border); border-radius: var(--jmi-radius-md); padding: 12px 14px; cursor: pointer; transition: all 0.15s ease;"
         onclick="setJmiQuickSearch('${escapeHtml(ind.name)}')">
      <div style="font-weight: 600; font-size: 13px; color: var(--jmi-text-main); margin-bottom: 4px;">
        <i class="fa-solid fa-briefcase text-primary" style="margin-right: 6px;"></i>${escapeHtml(ind.name)}
      </div>
      <div style="font-size: 12px; color: var(--jmi-text-secondary);">
        ${ind.jobRolesCount || 10} vị trí chuyên môn
      </div>
    </div>
  `).join('');
}

/**
 * Render Market Insights (Mục 17)
 */
function renderJmiAiInsights(insights, meta) {
  const sumEl = document.getElementById('jmi-ai-summary-text');
  const cardsContainer = document.getElementById('jmi-ai-insights-cards');

  if (sumEl && meta) {
    sumEl.textContent = `Tổng hợp quan sát từ mẫu dữ liệu thị trường cho ${meta.selectedIndustry} (${meta.selectedJobRole}): Ghi nhận nhu cầu tuyển dụng tích cực, mức lương cạnh tranh và sự tập trung cao tại các đô thị kinh tế trọng điểm.`;
  }

  if (cardsContainer && insights) {
    cardsContainer.innerHTML = insights.map(item => `
      <div class="jmi-saas-insight-card">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
          <i class="fa-solid fa-lightbulb" style="color: #2563EB;"></i>
          <h4 style="margin: 0; font-size: 13.5px; font-weight: 700; color: #0F172A;">${escapeHtml(item.title)}</h4>
        </div>
        <p style="margin: 0; font-size: 12.5px; color: #475569; line-height: 1.5;">${escapeHtml(item.description)}</p>
      </div>
    `).join('');
  }
}
