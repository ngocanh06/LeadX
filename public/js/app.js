/**
 * app.js - Frontend Controller cho FB Group Enterprise Engine Dashboard & Analytics
 */

const state = {
  theme: localStorage.getItem('fb_group_theme') || 'dark',
  currentTab: 'dashboard-tab',
  sheetJobs: [],
  filteredJobs: [],
  scrapedJobs: [],
  filteredScrapedJobs: [],
  scrapedTierFilter: 'ALL',
  groups: [],
  filteredGroups: [],
  images: [],
  selectedImageFilenames: new Set(),
  selectedJob: null,
  selectedGroupIds: new Set(),
  campaignInterval: null,
  isLoggedIn: false,
  // History & Statistics state
  historyData: [],
  filteredHistory: [],
  historyStats: null,
  activeHistorySubView: 'logs',
  selectedHistoryItem: null,
  accountHealth: null,
  accounts: [],
  currentAccountId: null,
  positionsReport: null,
  groupProvinceFilter: 'ALL',
  groupStats: null,
  groupViewMode: localStorage.getItem('group_view_mode') || 'table',
  groupSortCol: 'index',
  groupSortDir: 'asc',
  // Fanpage 34 state
  fanpages: [],
  filteredFanpages: [],
  selectedFanpageIds: new Set(),
  fanpageRegionFilter: 'ALL',
  publishChannels: { groups: true, fanpages: true },
  fanpageConfig: null,
  // Auto-Pilot 34 Fanpages (2 posts/page)
  autoPilotPlan: null,
  autoPilotFilter: 'ALL',
  activeInspectorPost: null
};

// =========================================================
// NETWORK HELPER: SMART FETCH CÓ RETRY & TỰ ĐỘNG FALLBACK
// =========================================================
async function smartFetch(url, options = {}, retries = 2) {
  let targetUrl = url;
  if (url.startsWith('/api/') || url.startsWith('/health')) {
    // Tự động định tuyến nếu mở qua file:// hoặc port khác
    if (window.location.protocol === 'file:' || (window.location.port && window.location.port !== '3001')) {
      targetUrl = `http://localhost:3001${url}`;
    }
  }

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(targetUrl, options);
      return res;
    } catch (err) {
      if (attempt < retries) {
        if (targetUrl.includes('localhost:3001')) {
          targetUrl = targetUrl.replace('localhost:3001', '127.0.0.1:3001');
        } else if (targetUrl.startsWith('/api/')) {
          targetUrl = `http://localhost:3001${url}`;
        }
        await new Promise(r => setTimeout(r, 700 * (attempt + 1)));
      } else {
        throw err;
      }
    }
  }
}

// =========================================================
// 1. KHỞI TẠO ỨNG DỤNG (INITIALIZATION)
// =========================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  initGroupViewMode();
  loadGoogleSheets();
  loadScrapedJobs();
  loadCustomersData();
  loadImages();
  await loadAccountsData();
  await loadGroups(state.currentAccountId);
  loadHistoryData();
  loadAccountHealthData();
  loadPositionsReportData();
  loadFanpages();
  checkBrowserProfileStatus();
  initImageDropzone();
  initNotificationCenter();
  checkActiveGroupAutomations();

  // Mở tab theo hash URL nếu có, mặc định là dashboard-tab
  let initialTab = (window.location.hash || '').replace('#', '');
  if (initialTab === 'scraped-jobs-tab') initialTab = 'customers-tab';
  if (initialTab && document.getElementById(initialTab)) {
    switchTab(initialTab);
  } else {
    switchTab('dashboard-tab');
  }
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;

  // Polling trạng thái chiến dịch và logs mỗi 3 giây
  state.campaignInterval = setInterval(pollCampaignStatus, 3000);
  // Polling trạng thái đăng nhập Facebook mỗi 15 giây
  setInterval(checkBrowserProfileStatus, 15000);
  // Polling sức khỏe tài khoản & rủi ro mỗi 20 giây
  setInterval(loadAccountHealthData, 20000);
  // Tự động làm mới Dashboard định kỳ mỗi 5 giây nếu đang ở tab Tổng Quan
  setInterval(() => {
    if (state.currentTab === 'dashboard-tab') {
      renderDashboard();
    }
  }, 5000);
});

// =========================================================
// BROWSER PROFILE & FACEBOOK LOGIN
// =========================================================
async function checkBrowserProfileStatus() {
  const indicator = document.getElementById('profile-indicator');
  const statusText = document.getElementById('profile-status-text');
  const badge = document.getElementById('fb-login-status-badge');

  try {
    const res = await fetch('/api/browser/status');
    const result = await res.json();

    if (result.success && result.data) {
      state.isLoggedIn = result.data.isLoggedIn;

      if (state.isLoggedIn) {
        const uidText = result.data.fbUserId ? `UID: ${result.data.fbUserId}` : 'Đã kết nối';
        if (indicator) indicator.style.backgroundColor = 'var(--success)';
        if (statusText) {
          statusText.textContent = uidText;
          statusText.style.color = 'var(--success)';
          statusText.style.fontWeight = '600';
        }
        if (badge) {
          badge.className = 'badge-pill success';
          badge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã kết nối Facebook (${uidText})`;
        }
      } else {
        if (indicator) indicator.style.backgroundColor = 'var(--danger)';
        if (statusText) {
          statusText.textContent = 'Chưa kết nối FB';
          statusText.style.color = 'var(--danger)';
        }
        if (badge) {
          badge.className = 'badge-pill danger';
          badge.innerHTML = '<i class="fa-solid fa-circle-xmark"></i> Chưa đăng nhập Facebook';
        }
      }
    }
  } catch (err) {
    if (indicator) indicator.style.backgroundColor = 'var(--warning)';
    if (statusText) statusText.textContent = 'Lỗi kiểm tra FB';
    if (badge) {
      badge.className = 'badge-pill warning';
      badge.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Lỗi kết nối';
    }
  }
}

async function openLoginWindow() {
  try {
    const badge = document.getElementById('fb-login-status-badge');
    if (badge) badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang mở Chrome...';

    const res = await fetch('/api/browser/open-login', { method: 'POST' });
    const result = await res.json();

    if (result.success) {
      alert('Đã mở cửa sổ Chrome của Tool! Vui lòng nhập tài khoản Facebook và 2FA trên cửa sổ Chrome vừa mở, sau đó quay lại trang này.');
      setTimeout(checkBrowserProfileStatus, 3000);
    } else {
      alert(`Lỗi: ${result.message}`);
    }
  } catch (err) {
    alert(`Lỗi kết nối: ${err.message}`);
  }
}

function openCookieLoginModal() {
  document.getElementById('cookie-login-modal').classList.add('active');
}

function closeCookieLoginModal() {
  document.getElementById('cookie-login-modal').classList.remove('active');
}

async function submitCookieLogin() {
  const cookieStr = document.getElementById('cookie-input-field').value.trim();
  if (!cookieStr) {
    alert('Vui lòng dán chuỗi Cookie Facebook vào khung!');
    return;
  }

  try {
    const badge = document.getElementById('fb-login-status-badge');
    if (badge) badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra Cookie...';

    const res = await fetch('/api/browser/import-cookies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cookieString: cookieStr })
    });
    const result = await res.json();

    if (result.success) {
      closeCookieLoginModal();
      document.getElementById('cookie-input-field').value = '';
      checkBrowserProfileStatus();
      alert('🎉 ' + result.message);
    } else {
      alert('Lỗi: ' + result.message);
      checkBrowserProfileStatus();
    }
  } catch (err) {
    alert('Lỗi kết nối: ' + err.message);
    checkBrowserProfileStatus();
  }
}

// =========================================================
// 2. THEME & NAVIGATION
// =========================================================
function initTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeButtonUI();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  localStorage.setItem('fb_group_theme', state.theme);
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeButtonUI();
  if (state.currentTab === 'dashboard-tab') {
    renderDashboardCharts(true);
  }
}

function updateThemeButtonUI() {
  const btn = document.getElementById('theme-toggle-btn');
  if (!btn) return;
  if (state.theme === 'light') {
    btn.innerHTML = `<i class="fa-solid fa-moon"></i> <span>Chế độ Tối</span>`;
  } else {
    btn.innerHTML = `<i class="fa-solid fa-sun"></i> <span>Chế độ Sáng</span>`;
  }
}

function toggleSidebar(forceState = null) {
  const sidebar = document.querySelector('.sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (!sidebar) return;
  const isCurrentlyOpen = sidebar.classList.contains('open');
  const nextState = forceState !== null ? forceState : !isCurrentlyOpen;
  if (nextState) {
    sidebar.classList.add('open');
    if (overlay) overlay.classList.add('active');
  } else {
    sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');
  }
}

// =========================================================
// 0. TRANG TỔNG QUAN (EXECUTIVE DASHBOARD & PROBLEM DIAGNOSTICS)
// =========================================================
function renderDashboard() {
  renderDashboardHero();
  renderDashboardMetrics();
  renderDashboardCharts();
  renderDashboardIssues();
  renderDashboardRunner();
  renderDashboardRecentPosts();
  renderMarketScraperOverview();
}

function renderDashboardHero() {
  const heroBanner = document.getElementById('dashboard-hero-banner');
  const heroBadge = document.getElementById('dash-hero-badge');
  const fbUidPill = document.getElementById('dash-fb-uid-pill');
  const heroTitle = document.getElementById('dash-hero-title');
  const heroDesc = document.getElementById('dash-hero-desc');
  const cooldownWrap = document.getElementById('dash-hero-cooldown-wrap');
  const cooldownText = document.getElementById('dash-cooldown-text');
  const gaugeCircle = document.getElementById('dash-gauge-circle');
  const gaugeScore = document.getElementById('dash-gauge-score');
  const gaugeStatus = document.getElementById('dash-gauge-status');

  const health = state.accountHealth;
  // 1. Tên & Facebook kết nối
  const currentAcc = (state.accounts || []).find(a => a.isCurrent) || (state.accounts || [])[0];
  const activeAccName = health?.accountName || (currentAcc ? currentAcc.name : 'Tài khoản hiện tại');

  if (fbUidPill) {
    if (state.isLoggedIn) {
      fbUidPill.className = 'badge-pill success';
      fbUidPill.innerHTML = `<i class="fa-brands fa-facebook"></i> Đã kết nối: ${escapeHtml(activeAccName)}`;
    } else {
      fbUidPill.className = 'badge-pill danger';
      fbUidPill.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Chưa kết nối FB (Cần Cookie)`;
    }
  }

  // 2. Tình trạng sức khỏe & Lệnh giới hạn của TÀI KHOẢN ĐANG KÍCH HOẠT
  if (health) {
    const isRestricted = health.isRestricted;
    const riskScore = health.riskScore || 0;
    const safetyScore = Math.max(0, 100 - riskScore);

    if (gaugeScore) gaugeScore.textContent = safetyScore;
    if (heroBanner) {
      heroBanner.className = isRestricted ? 'dashboard-hero-banner danger' : (riskScore >= 50 ? 'dashboard-hero-banner warning' : 'dashboard-hero-banner');
    }

    if (gaugeCircle) {
      gaugeCircle.className = isRestricted || riskScore >= 70 ? 'dash-gauge-circle danger' : (riskScore >= 40 ? 'dash-gauge-circle warning' : 'dash-gauge-circle');
    }

    if (gaugeStatus) {
      gaugeStatus.textContent = isRestricted ? 'Bị Meta Hạn Chế' : (riskScore >= 50 ? 'Cảnh Báo Tần Suất' : 'An Toàn Tuyệt Đối');
      gaugeStatus.style.color = isRestricted || riskScore >= 70 ? 'var(--danger)' : (riskScore >= 40 ? 'var(--warning)' : 'var(--success)');
    }

    if (isRestricted) {
      if (heroBadge) {
        heroBadge.className = 'badge-pill danger';
        heroBadge.innerHTML = `<i class="fa-solid fa-ban"></i> PHÁT HIỆN LỆNH GIỚI HẠN (${escapeHtml(activeAccName)})`;
      }
      if (heroTitle) heroTitle.textContent = `Tài Khoản "${escapeHtml(activeAccName)}" Đang Bị Facebook Tạm Giới Hạn Đăng Bài`;
      if (heroDesc) {
        heroDesc.textContent = `Lý do: "${health.lastRestrictionReason || 'Facebook tạm khóa tính năng đăng bài do bị giới hạn tần suất (Spam Limit)'}". Được ghi nhận tại nhóm "${health.lastRestrictionGroup || 'Facebook Group'}". Khuyến cáo: Tuyệt đối không cố bấm đăng tiếp để tránh bị khóa vĩnh viễn nick. Hãy chuyển sang tài khoản phụ hoặc để nick làm mát.`;
      }
      if (cooldownWrap) {
        cooldownWrap.style.display = 'block';
        if (cooldownText) cooldownText.textContent = `Thời gian làm mát an toàn còn lại của ${activeAccName}: ${health.cooldownRemainingText || 'Đang cập nhật...'}`;
      }
    } else if (riskScore >= 50) {
      if (heroBadge) {
        heroBadge.className = 'badge-pill warning';
        heroBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> CẢNH BÁO TẦN SUẤT ĐĂNG CAO (${escapeHtml(activeAccName)})`;
      }
      if (heroTitle) heroTitle.textContent = `Tần Suất Đăng Của "${escapeHtml(activeAccName)}" Đang Chạm Ngưỡng Nhận Diện Của Meta`;
      if (heroDesc) {
        heroDesc.textContent = `Hệ thống ghi nhận nick đã đăng ${health.stats24h?.total || 0} bài trong 24h qua. Hãy tăng khoảng giãn cách giữa các bài lên ít nhất 90s - 150s để bảo vệ tài khoản.`;
      }
      if (cooldownWrap) {
        if (health.otherAccountsInCooldown && health.otherAccountsInCooldown.length > 0) {
          cooldownWrap.style.display = 'block';
          const cooldownDetails = health.otherAccountsInCooldown.map(a => `<strong>${escapeHtml(a.name)}</strong> (còn ${a.cooldownRemainingText})`).join(', ');
          if (cooldownText) {
            cooldownText.innerHTML = `<strong>Lưu ý:</strong> Tài khoản ${cooldownDetails} đang làm mát an toàn. Bạn đang sử dụng <strong>${escapeHtml(activeAccName)}</strong>.`;
          }
        } else {
          cooldownWrap.style.display = 'none';
        }
      }
    } else {
      if (heroBadge) {
        heroBadge.className = 'badge-pill success';
        heroBadge.innerHTML = '<i class="fa-solid fa-shield-halved"></i> HỆ THỐNG AN TOÀN - SẴN SÀNG HOẠT ĐỘNG';
      }
      if (heroTitle) heroTitle.textContent = `Tài Khoản "${escapeHtml(activeAccName)}" Khỏe Mạnh - Sẵn Sàng Triển Khai`;
      if (heroDesc) {
        heroDesc.textContent = `Tài khoản ${escapeHtml(activeAccName)} đang ở trạng thái an toàn tuyệt đối (Điểm an toàn: ${safetyScore}/100), không có lệnh giới hạn nào từ Meta. Bạn có thể tự tin triển khai chiến dịch đăng bài.`;
      }
      if (cooldownWrap) {
        if (health.otherAccountsInCooldown && health.otherAccountsInCooldown.length > 0) {
          cooldownWrap.style.display = 'block';
          const cooldownDetails = health.otherAccountsInCooldown.map(a => `<strong>${escapeHtml(a.name)}</strong> (còn ${a.cooldownRemainingText})`).join(', ');
          if (cooldownText) {
            cooldownText.innerHTML = `<strong>Lưu ý:</strong> Tài khoản ${cooldownDetails} đang trong thời gian làm mát an toàn sau khi chạm giới hạn. Tool đã tự động chuyển và bảo vệ an toàn, hiện tại đang vận hành bằng <strong>${escapeHtml(activeAccName)}</strong>.`;
          }
        } else {
          cooldownWrap.style.display = 'none';
        }
      }
    }
  }
}

function renderDashboardMetrics() {
  const stats = state.historyStats;
  const history = state.historyData;
  const totalPosts = stats ? stats.totalPosts : (history ? history.length : 0);
  const published = stats ? stats.publishedDirect : (history ? history.filter(h => h.status === 'PUBLISHED').length : 0);
  const pending = stats ? stats.pendingApproval : (history ? history.filter(h => h.status === 'PENDING_APPROVAL').length : 0);
  const failed = stats ? stats.failed : (history ? history.filter(h => h.status === 'FAILED').length : 0);
  const jobsCount = state.sheetJobs?.length || 0;
  const groupsCount = state.groups?.length || 0;

  const successRate = totalPosts > 0 ? Math.round(((published + (stats?.approved || 0)) / totalPosts) * 100) : 100;

  const elTotal = document.getElementById('dash-stat-total-posts');
  const elRate = document.getElementById('dash-stat-success-rate');
  const elPublished = document.getElementById('dash-stat-published');
  const elPending = document.getElementById('dash-stat-pending');
  const elFailed = document.getElementById('dash-stat-failed');
  const elJobs = document.getElementById('dash-stat-jobs');
  const elGroups = document.getElementById('dash-stat-groups');

  if (elTotal) elTotal.textContent = totalPosts;
  if (elRate) elRate.innerHTML = `<i class="fa-solid fa-chart-line text-success"></i> Tỷ lệ thành công: ${successRate}%`;
  if (elPublished) elPublished.textContent = published;
  if (elPending) elPending.textContent = pending;
  if (elFailed) elFailed.textContent = failed;
  if (elJobs) elJobs.textContent = jobsCount;
  if (elGroups) elGroups.textContent = groupsCount;
}

// =========================================================
// DASHBOARD CHARTS & ANALYTICS
// =========================================================
let dashboardChartInstances = {
  trend: null,
  distribution: null
};
let currentDashboardChartMode = '7d';

function switchDashboardChartMode(mode, btn) {
  currentDashboardChartMode = mode;
  const container = document.getElementById('dash-chart-mode-group');
  if (container) {
    container.querySelectorAll('.chart-tab-btn').forEach(b => b.classList.remove('active'));
  }
  if (btn) btn.classList.add('active');
  renderDashboardCharts(true);
}

function renderDashboardCharts(forceRecreate = false) {
  if (typeof Chart === 'undefined') return;

  const trendCanvas = document.getElementById('dash-trend-chart');
  const distCanvas = document.getElementById('dash-distribution-chart');
  if (!trendCanvas || !distCanvas) return;

  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)';
  const tickColor = isDark ? '#94a3b8' : '#64748b';
  const history = state.historyData || [];
  const stats = state.historyStats;

  // 1. DATA CHO BIỂU ĐỒ XU HƯỚNG / TOP NHÓM
  const trendLegend = document.getElementById('dash-trend-legend');
  let trendConfig;

  if (currentDashboardChartMode === 'groups') {
    // Chế độ: Top Hội Nhóm Đăng Bài
    if (trendLegend) trendLegend.style.display = 'flex';
    const groupBreakdown = (stats?.groupBreakdown || []).slice(0, 6);
    
    let groupMap = [];
    if (groupBreakdown.length > 0) {
      groupMap = groupBreakdown;
    } else {
      const gObj = {};
      history.forEach(item => {
        const name = item.groupName || 'Nhóm Khác';
        if (!gObj[name]) {
          gObj[name] = { groupName: name, total: 0, published: 0, pending: 0, failed: 0 };
        }
        gObj[name].total++;
        if (item.status === 'PUBLISHED' || item.status === 'APPROVED') gObj[name].published++;
        else if (item.status === 'PENDING_APPROVAL') gObj[name].pending++;
        else gObj[name].failed++;
      });
      groupMap = Object.values(gObj).sort((a, b) => b.total - a.total).slice(0, 6);
    }

    const labels = groupMap.length > 0 
      ? groupMap.map(g => (g.groupName.length > 18 ? g.groupName.substring(0, 18) + '...' : g.groupName))
      : ['Chưa có nhóm'];
    const pubData = groupMap.length > 0 ? groupMap.map(g => g.publishedDirect || g.published || 0) : [0];
    const pendData = groupMap.length > 0 ? groupMap.map(g => g.pendingApproval || g.pending || 0) : [0];
    const failData = groupMap.length > 0 ? groupMap.map(g => (g.failed || 0) + (g.rejected || 0)) : [0];

    trendConfig = {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Trực tiếp',
            data: pubData,
            backgroundColor: '#10b981',
            borderRadius: 4,
            barThickness: 12
          },
          {
            label: 'Chờ duyệt',
            data: pendData,
            backgroundColor: '#f59e0b',
            borderRadius: 4,
            barThickness: 12
          },
          {
            label: 'Lỗi / Bị chặn',
            data: failData,
            backgroundColor: '#ef4444',
            borderRadius: 4,
            barThickness: 12
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            stacked: true,
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { family: 'Inter', size: 11 }, precision: 0 }
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { color: tickColor, font: { family: 'Inter', size: 11 } }
          }
        }
      }
    };
  } else {
    // Chế độ: 7 Ngày hoặc 14 Ngày
    if (trendLegend) trendLegend.style.display = 'flex';
    const numDays = currentDashboardChartMode === '14d' ? 14 : 7;
    const dayLabels = [];
    const dayMap = {};

    for (let i = numDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dayKey = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      dayLabels.push(dayKey);
      dayMap[dayKey] = { published: 0, pending: 0, failed: 0 };
    }

    history.forEach(item => {
      if (!item.postedAt) return;
      const d = new Date(item.postedAt);
      if (isNaN(d.getTime())) return;
      const dayKey = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (dayMap[dayKey]) {
        if (item.status === 'PUBLISHED' || item.status === 'APPROVED') {
          dayMap[dayKey].published++;
        } else if (item.status === 'PENDING_APPROVAL') {
          dayMap[dayKey].pending++;
        } else if (item.status === 'FAILED' || item.status === 'REJECTED') {
          dayMap[dayKey].failed++;
        }
      }
    });

    const pubData = dayLabels.map(k => dayMap[k].published);
    const pendData = dayLabels.map(k => dayMap[k].pending);
    const failData = dayLabels.map(k => dayMap[k].failed);

    trendConfig = {
      type: 'bar',
      data: {
        labels: dayLabels,
        datasets: [
          {
            label: 'Lên bài trực tiếp',
            data: pubData,
            backgroundColor: 'rgba(16, 185, 129, 0.85)',
            hoverBackgroundColor: '#10b981',
            borderRadius: 6,
            barPercentage: 0.65,
            categoryPercentage: 0.7
          },
          {
            label: 'Chờ duyệt Admin',
            data: pendData,
            backgroundColor: 'rgba(245, 158, 11, 0.85)',
            hoverBackgroundColor: '#f59e0b',
            borderRadius: 6,
            barPercentage: 0.65,
            categoryPercentage: 0.7
          },
          {
            label: 'Lỗi / Thất bại',
            data: failData,
            backgroundColor: 'rgba(239, 68, 68, 0.85)',
            hoverBackgroundColor: '#ef4444',
            borderRadius: 6,
            barPercentage: 0.65,
            categoryPercentage: 0.7
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)',
            titleColor: isDark ? '#f8fafc' : '#0f172a',
            bodyColor: isDark ? '#cbd5e1' : '#334155',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
            borderWidth: 1,
            padding: 10,
            cornerRadius: 8
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor, font: { family: 'Inter', size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { family: 'Inter', size: 11 }, precision: 0 },
            beginAtZero: true
          }
        }
      }
    };
  }

  // Khởi tạo hoặc cập nhật Trend Chart
  if (dashboardChartInstances.trend && !forceRecreate) {
    dashboardChartInstances.trend.data = trendConfig.data;
    dashboardChartInstances.trend.options = trendConfig.options;
    dashboardChartInstances.trend.update('none');
  } else {
    if (dashboardChartInstances.trend) dashboardChartInstances.trend.destroy();
    dashboardChartInstances.trend = new Chart(trendCanvas, trendConfig);
  }

  // 2. DATA CHO BIỂU ĐỒ PHÂN BỐ TRẠNG THÁI (DOUGHNUT)
  const published = stats ? (stats.publishedDirect + (stats.approved || 0)) : history.filter(h => h.status === 'PUBLISHED' || h.status === 'APPROVED').length;
  const pending = stats ? stats.pendingApproval : history.filter(h => h.status === 'PENDING_APPROVAL').length;
  const failed = stats ? (stats.failed + (stats.rejected || 0)) : history.filter(h => h.status === 'FAILED' || h.status === 'REJECTED').length;
  const total = published + pending + failed;

  const pubPct = total > 0 ? Math.round((published / total) * 100) : 0;
  const pendPct = total > 0 ? Math.round((pending / total) * 100) : 0;
  const failPct = total > 0 ? Math.round((failed / total) * 100) : 0;

  const elTotalPill = document.getElementById('dash-chart-total-pill');
  const elDonutPct = document.getElementById('dash-donut-pct');
  const elPubCount = document.getElementById('dash-donut-pub-count');
  const elPubPct = document.getElementById('dash-donut-pub-pct');
  const elPendCount = document.getElementById('dash-donut-pend-count');
  const elPendPct = document.getElementById('dash-donut-pend-pct');
  const elFailCount = document.getElementById('dash-donut-fail-count');
  const elFailPct = document.getElementById('dash-donut-fail-pct');
  const elSafetyNote = document.getElementById('dash-donut-safety-note');

  if (elTotalPill) elTotalPill.textContent = `${total} Bài Đăng`;
  if (elDonutPct) elDonutPct.textContent = total > 0 ? `${pubPct}%` : '0%';
  if (elPubCount) elPubCount.textContent = published;
  if (elPubPct) elPubPct.textContent = `${pubPct}%`;
  if (elPendCount) elPendCount.textContent = pending;
  if (elPendPct) elPendPct.textContent = `${pendPct}%`;
  if (elFailCount) elFailCount.textContent = failed;
  if (elFailPct) elFailPct.textContent = `${failPct}%`;

  if (elSafetyNote) {
    const health = state.accountHealth;
    const isRestricted = health?.isRestricted;
    const score = health ? Math.max(0, 100 - (health.riskScore || 0)) : 100;

    if (isRestricted || score < 40) {
      elSafetyNote.className = 'donut-safety-note danger';
      elSafetyNote.innerHTML = `<i class="fa-solid fa-triangle-exclamation text-danger"></i> Điểm an toàn Meta: <strong class="text-danger">${score}/100 (Bị hạn chế)</strong>`;
    } else if (score < 70) {
      elSafetyNote.className = 'donut-safety-note warning';
      elSafetyNote.innerHTML = `<i class="fa-solid fa-circle-exclamation text-warning"></i> Điểm an toàn Meta: <strong class="text-warning">${score}/100 (Cần theo dõi)</strong>`;
    } else {
      elSafetyNote.className = 'donut-safety-note';
      elSafetyNote.innerHTML = `<i class="fa-solid fa-shield-halved text-success"></i> Điểm an toàn Meta: <strong class="text-success">${score}/100 (Rất an toàn)</strong>`;
    }
  }

  const donutData = total > 0 ? [published, pending, failed] : [1, 0, 0];
  const donutColors = total > 0 ? ['#10b981', '#f59e0b', '#ef4444'] : [isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'];

  const distConfig = {
    type: 'doughnut',
    data: {
      labels: ['Lên bài trực tiếp', 'Chờ duyệt Admin', 'Lỗi / Thất bại'],
      datasets: [{
        data: donutData,
        backgroundColor: donutColors,
        borderWidth: 2,
        borderColor: isDark ? '#1e293b' : '#ffffff',
        hoverOffset: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '72%',
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: total > 0,
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)',
          titleColor: isDark ? '#f8fafc' : '#0f172a',
          bodyColor: isDark ? '#cbd5e1' : '#334155',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
          borderWidth: 1,
          padding: 8,
          cornerRadius: 8
        }
      }
    }
  };

  if (dashboardChartInstances.distribution && !forceRecreate) {
    dashboardChartInstances.distribution.data = distConfig.data;
    dashboardChartInstances.distribution.options = distConfig.options;
    dashboardChartInstances.distribution.update('none');
  } else {
    if (dashboardChartInstances.distribution) dashboardChartInstances.distribution.destroy();
    dashboardChartInstances.distribution = new Chart(distCanvas, distConfig);
  }
}

function renderDashboardIssues() {
  const grid = document.getElementById('dash-issues-grid');
  const summaryBadge = document.getElementById('dash-issues-summary-badge');
  const navAlertBadge = document.getElementById('dashboard-nav-alert-badge');
  if (!grid) return;

  const issues = [];
  let dangerCount = 0;
  let warningCount = 0;

  // 1. TÀI KHOẢN & COOKIE FACEBOOK
  const accounts = state.accounts || [];
  const currentAcc = accounts.find(a => a.id === state.currentAccountId) || accounts[0];
  const hasAccounts = accounts.length > 0;

  if (!hasAccounts) {
    dangerCount++;
    issues.push({
      category: 'Tài Khoản Facebook',
      type: 'danger',
      icon: 'fa-solid fa-key',
      title: 'Chưa cấu hình tài khoản Facebook',
      desc: 'Hệ thống chưa có tài khoản Facebook nào. Bạn cần thêm tài khoản vào danh mục quản lý.',
      statusTag: '<span class="issue-status-tag text-danger"><i class="fa-solid fa-circle-xmark"></i> Chưa có tài khoản</span>',
      actionBtn: '<button class="btn btn-sm btn-primary" onclick="switchTab(\'accounts-tab\')"><i class="fa-solid fa-user-plus"></i> Thêm Tài Khoản</button>'
    });
  } else if (state.accountHealth?.isRestricted) {
    dangerCount++;
    issues.push({
      category: 'Tài Khoản Facebook',
      type: 'danger',
      icon: 'fa-solid fa-ban',
      title: 'Tài khoản đang bị Facebook Action Block',
      desc: `Facebook tạm thời giới hạn quyền đăng bài. Thời gian làm mát còn lại: ${state.accountHealth.cooldownRemainingText || 'chưa rõ'}. Cần chuyển nick ngay.`,
      statusTag: '<span class="issue-status-tag text-danger"><i class="fa-solid fa-lock"></i> Đang bị khóa tính năng</span>',
      actionBtn: '<button class="btn btn-sm btn-warning" onclick="switchTab(\'accounts-tab\')"><i class="fa-solid fa-users-gear"></i> Đổi Sang Nick Khác</button>'
    });
  } else if ((state.accountHealth?.riskScore || 0) >= 70) {
    warningCount++;
    issues.push({
      category: 'Tài Khoản Facebook',
      type: 'warning',
      icon: 'fa-solid fa-triangle-exclamation',
      title: 'Tần suất đăng bài chạm ngưỡng cảnh báo',
      desc: `Đã đăng ${state.accountHealth.stats24h?.total || 0} bài trong 24h qua. Nên để nick nghỉ ngơi hoặc luân phiên qua nick khác.`,
      statusTag: '<span class="issue-status-tag text-warning"><i class="fa-solid fa-gauge-high"></i> Cảnh báo tần suất</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="switchTab(\'health-tab\')"><i class="fa-solid fa-shield-heart"></i> Xem Chi Tiết</button>'
    });
  } else {
    issues.push({
      category: 'Tài Khoản Facebook',
      type: 'success',
      icon: 'fa-solid fa-circle-check',
      title: `Tài khoản ${currentAcc ? currentAcc.name : 'Facebook'} sẵn sàng`,
      desc: state.isLoggedIn 
        ? 'Phiên trình duyệt Facebook đang kết nối và sẵn sàng hoạt động.' 
        : 'Cookie tài khoản đã lưu trữ an toàn trong hệ thống. Trình duyệt tự động kết nối khi bắt đầu tác vụ.',
      statusTag: '<span class="issue-status-tag text-success"><i class="fa-solid fa-circle-check"></i> ' + (state.isLoggedIn ? 'Live Connected' : 'Cookie Sẵn Sàng') + '</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="probeAccountHealthLive(this)"><i class="fa-solid fa-stethoscope"></i> Kiểm Tra Live</button>'
    });
  }

  // 2. HỘI NHÓM & KIỂM DUYỆT BÀI ĐĂNG
  const pendingCount = state.historyStats?.pendingApproval || 0;
  const failedCount = state.historyStats?.failed || 0;
  const groupsCount = state.groups?.length || 0;

  if (groupsCount === 0) {
    warningCount++;
    issues.push({
      category: 'Hội Nhóm Facebook',
      type: 'warning',
      icon: 'fa-solid fa-users-slash',
      title: 'Chưa có Hội Nhóm Facebook nào',
      desc: 'Hệ thống chưa có danh sách nhóm mục tiêu. Bạn có thể Quét Nhóm Tự Động hoặc nạp nhóm từ Google Sheets.',
      statusTag: '<span class="issue-status-tag text-warning"><i class="fa-solid fa-triangle-exclamation"></i> Danh sách rỗng</span>',
      actionBtn: '<button class="btn btn-sm btn-primary" onclick="openScrapeGroupsModal()"><i class="fa-solid fa-magnifying-glass"></i> Quét Nhóm Ngay</button>'
    });
  } else if (failedCount > 0 || pendingCount > 0) {
    warningCount++;
    issues.push({
      category: 'Hội Nhóm Facebook',
      type: 'warning',
      icon: 'fa-solid fa-clock-rotate-left',
      title: `Ghi nhận ${pendingCount} bài chờ duyệt & ${failedCount} bài bị lỗi`,
      desc: 'Một số nhóm Facebook bật chế độ kiểm duyệt quản trị viên hoặc lỗi quyền thành viên. Hãy kiểm tra các nhóm này để tinh chỉnh danh sách.',
      statusTag: '<span class="issue-status-tag text-warning"><i class="fa-solid fa-shield-halved"></i> Cần theo dõi</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="switchTab(\'history-tab\')"><i class="fa-solid fa-chart-pie"></i> Xem Báo Cáo Nhóm</button>'
    });
  } else {
    issues.push({
      category: 'Hội Nhóm Facebook',
      type: 'success',
      icon: 'fa-solid fa-users',
      title: `Quản lý ${groupsCount} nhóm mục tiêu`,
      desc: 'Tất cả các nhóm đều mở và cho phép đăng bài tự động mà không gặp trở ngại.',
      statusTag: '<span class="issue-status-tag text-success"><i class="fa-solid fa-circle-check"></i> Sẵn sàng đăng</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="switchTab(\'groups-tab\')"><i class="fa-solid fa-gear"></i> Quản Lý Nhóm</button>'
    });
  }

  // 3. NGUỒN VIỆC LÀM GOOGLE SHEETS
  const jobsCount = state.sheetJobs?.length || 0;
  if (jobsCount === 0) {
    warningCount++;
    issues.push({
      category: 'Google Sheets Pipeline',
      type: 'warning',
      icon: 'fa-solid fa-file-excel',
      title: 'Chưa có dữ liệu từ Google Sheets',
      desc: 'Bảng tính tuyển dụng chưa nạp dữ liệu hoặc đang sử dụng dữ liệu Lead tự động. Bấm Đồng Bộ nếu bạn dùng Google Sheets.',
      statusTag: '<span class="issue-status-tag text-warning"><i class="fa-solid fa-info-circle"></i> Chưa đồng bộ</span>',
      actionBtn: '<button class="btn btn-sm btn-primary" onclick="syncGoogleSheets(true)"><i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Lại</button>'
    });
  } else {
    issues.push({
      category: 'Google Sheets Pipeline',
      type: 'success',
      icon: 'fa-solid fa-table-list',
      title: `Đã nạp ${jobsCount} vị trí việc làm`,
      desc: 'Dữ liệu được trích xuất hoàn chỉnh với chức danh, tên công ty, địa điểm, mức lương và thông tin liên hệ ứng tuyển.',
      statusTag: '<span class="issue-status-tag text-success"><i class="fa-solid fa-circle-check"></i> Dữ liệu đầy đủ</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="syncGoogleSheets(true)"><i class="fa-solid fa-arrows-rotate"></i> Làm Mới Sheet</button>'
    });
  }

  // 4. KHO ẢNH & MEDIA TUYỂN DỤNG
  const imagesCount = state.images?.length || 0;
  const selectedImgsCount = state.selectedImageFilenames?.size || 0;
  if (imagesCount === 0) {
    warningCount++;
    issues.push({
      category: 'Kho Ảnh Tuyển Dụng',
      type: 'warning',
      icon: 'fa-solid fa-images',
      title: 'Kho ảnh tuyển dụng đang trống',
      desc: 'Bài viết chỉ có chữ mà không có hình ảnh sẽ bị Facebook bóp tương tác hiển thị và dễ bị xem là nội dung đơn điệu.',
      statusTag: '<span class="issue-status-tag text-warning"><i class="fa-solid fa-image"></i> Chưa có ảnh</span>',
      actionBtn: '<button class="btn btn-sm btn-primary" onclick="switchTab(\'images-tab\')"><i class="fa-solid fa-upload"></i> Tải Ảnh Lên</button>'
    });
  } else {
    issues.push({
      category: 'Kho Ảnh Tuyển Dụng',
      type: 'success',
      icon: 'fa-solid fa-image',
      title: `Kho ảnh có ${imagesCount} banner/poster`,
      desc: selectedImgsCount > 0 ? `Đang chọn sẵn ${selectedImgsCount} hình ảnh để tự động đính kèm khi lên bài.` : 'Hình ảnh đã sẵn sàng đính kèm vào bất kỳ bài đăng nào.',
      statusTag: '<span class="issue-status-tag text-success"><i class="fa-solid fa-circle-check"></i> Sẵn sàng đính kèm</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="switchTab(\'images-tab\')"><i class="fa-solid fa-images"></i> Xem Kho Ảnh</button>'
    });
  }

  // 5. CẤU HÌNH AN TOÀN TRÌNH DUYỆT (STEALTH & ANTI-SPAM)
  const accountsCount = state.accounts?.length || 0;
  if (accountsCount <= 1) {
    issues.push({
      category: 'An Toàn Thuật Toán',
      type: 'info',
      icon: 'fa-solid fa-shield-halved',
      title: 'Khuyến nghị thêm tài khoản dự phòng',
      desc: 'Hiện chỉ có 1 nick Facebook kết nối. Bạn nên thêm 2-3 nick để luân phiên đăng bài khi một nick cần nghỉ ngơi (cooldown).',
      statusTag: '<span class="issue-status-tag text-info"><i class="fa-solid fa-lightbulb"></i> Gợi ý tối ưu</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="switchTab(\'accounts-tab\')"><i class="fa-solid fa-user-plus"></i> Thêm Nick Phụ</button>'
    });
  } else {
    issues.push({
      category: 'An Toàn Thuật Toán',
      type: 'success',
      icon: 'fa-solid fa-user-ninja',
      title: 'Đã thiết lập hệ thống đa tài khoản',
      desc: `Đang có ${accountsCount} tài khoản Facebook sẵn sàng luân phiên. Tính năng Zero-Width Salting và giãn cách ngẫu nhiên đang hoạt động.`,
      statusTag: '<span class="issue-status-tag text-success"><i class="fa-solid fa-circle-check"></i> Đạt chuẩn an toàn</span>',
      actionBtn: '<button class="btn btn-sm btn-secondary" onclick="switchTab(\'controller-tab\')"><i class="fa-solid fa-sliders"></i> Tinh Chỉnh Delay</button>'
    });
  }

  // Render Grid
  grid.innerHTML = issues.map(iss => `
    <div class="issue-card ${iss.type}">
      <div class="issue-card-top">
        <div class="issue-icon-wrap">
          <i class="${iss.icon}"></i>
        </div>
        <div class="issue-info-wrap">
          <div class="issue-header-line">
            <span class="issue-category-name">${iss.category}</span>
          </div>
          <h4 class="issue-title">${iss.title}</h4>
          <p class="issue-desc">${iss.desc}</p>
        </div>
      </div>
      <div class="issue-bottom">
        ${iss.statusTag}
        ${iss.actionBtn}
      </div>
    </div>
  `).join('');

  // Summary badge update
  if (summaryBadge) {
    if (dangerCount > 0) {
      summaryBadge.className = 'badge-pill danger';
      summaryBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Phát hiện ${dangerCount} vấn đề nghiêm trọng${warningCount > 0 ? ` & ${warningCount} cảnh báo` : ''}`;
    } else if (warningCount > 0) {
      summaryBadge.className = 'badge-pill warning';
      summaryBadge.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> Có ${warningCount} vấn đề cần lưu ý`;
    } else {
      summaryBadge.className = 'badge-pill success';
      summaryBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Toàn bộ 5 thành phần đều hoạt động tốt`;
    }
  }

  // Sidebar badge update: CHỈ HIỂN THỊ KHI CÓ SỰ CỐ DANGER THẬT SỰ (VD: Nick bị block, mất hoàn toàn nick)
  if (navAlertBadge) {
    if (dangerCount > 0) {
      navAlertBadge.style.display = 'inline-flex';
      navAlertBadge.textContent = '!';
      navAlertBadge.title = `Có ${dangerCount} sự cố nghiêm trọng cần xử lý trên Trang Tổng Quan`;
    } else {
      navAlertBadge.style.display = 'none';
    }
  }
}

function renderDashboardRunner() {
  const runnerBox = document.getElementById('dash-runner-box');
  if (!runnerBox) return;

  const isRunning = lastCampaignSnapshot && lastCampaignSnapshot.isRunning;
  const isPaused = lastCampaignSnapshot && lastCampaignSnapshot.isPaused;

  if (isRunning) {
    const snap = lastCampaignSnapshot;
    const progressPct = snap.totalGroups > 0 ? Math.round((snap.currentGroupIndex / snap.totalGroups) * 100) : 0;

    runnerBox.innerHTML = `
      <div class="runner-status-card">
        <div class="runner-status-header">
          <span class="runner-live-pill text-primary">
            <i class="fa-solid fa-spinner fa-spin text-primary"></i> ${isPaused ? 'CHIẾN DỊCH ĐANG TẠM DỪNG' : 'ĐANG TIẾN HÀNH ĐĂNG BÀI TỰ ĐỘNG'}
          </span>
          <span class="badge-pill ${isPaused ? 'warning' : 'success'}">${isPaused ? 'Tạm Dừng' : 'Đang Chạy'}</span>
        </div>
        <div style="font-size: 0.88rem; font-weight: 700;">
          ${snap.currentJobTitle ? `<i class="fa-solid fa-briefcase text-success"></i> ${escapeHtml(snap.currentJobTitle)}` : 'Đang xử lý bài viết'}
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted);">
          Đang xử lý nhóm: <strong>${snap.currentGroupName ? escapeHtml(snap.currentGroupName) : '...'}</strong>
        </div>
        <div class="runner-progress-bar-wrap">
          <div class="runner-progress-bar-fill" style="width: ${progressPct}%;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.78rem; color: var(--text-dim);">
          <span>Tiến độ: ${snap.currentGroupIndex}/${snap.totalGroups} nhóm (${progressPct}%)</span>
          <span>Thành công: ${snap.successCount || 0} | Lỗi: ${snap.failCount || 0}</span>
        </div>
        <div style="display: flex; gap: 8px; margin-top: 4px;">
          <button class="btn btn-sm btn-secondary" onclick="switchTab('controller-tab')">
            <i class="fa-solid fa-sliders"></i> Mở Điều Khiển
          </button>
          <button class="btn btn-sm btn-danger" onclick="stopCampaign()">
            <i class="fa-solid fa-stop"></i> Dừng Khẩn Cấp
          </button>
        </div>
      </div>
    `;
  } else {
    runnerBox.innerHTML = `
      <div class="runner-status-card">
        <div class="runner-status-header">
          <span class="runner-live-pill text-muted">
            <i class="fa-solid fa-circle text-muted" style="font-size: 0.6rem;"></i> Trình chạy đang ở trạng thái Chờ (Idle)
          </span>
          <span class="badge-pill">Sẵn Sàng</span>
        </div>
        <p style="font-size: 0.84rem; color: var(--text-muted); margin: 0;">
          Không có chiến dịch nào đang chạy nền. Bạn có thể chọn việc làm từ Google Sheets và danh sách nhóm để bắt đầu đăng bài tự động bất kỳ lúc nào.
        </p>
      </div>
    `;
  }
}

function renderDashboardRecentPosts() {
  const listEl = document.getElementById('dash-recent-posts-list');
  if (!listEl) return;

  const history = state.historyData || [];
  const recent = history.slice(0, 6);

  if (recent.length === 0) {
    listEl.innerHTML = `
      <div style="padding: 28px; text-align: center; color: var(--text-muted); font-size: 0.88rem;">
        <i class="fa-solid fa-inbox" style="font-size: 2rem; margin-bottom: 10px; opacity: 0.4;"></i>
        <p>Chưa có lịch sử đăng bài nào được ghi nhận.</p>
        <button class="btn btn-sm btn-primary" onclick="switchTab('controller-tab')" style="margin-top: 8px;">
          <i class="fa-solid fa-paper-plane"></i> Đăng Bài Đầu Tiên
        </button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = recent.map(item => {
    let iconClass = 'published';
    let icon = 'fa-solid fa-circle-check';
    let statusText = 'Lên bài trực tiếp';

    if (item.status === 'PENDING_APPROVAL') {
      iconClass = 'pending';
      icon = 'fa-solid fa-clock';
      statusText = 'Chờ duyệt';
    } else if (item.status === 'FAILED') {
      iconClass = 'failed';
      icon = 'fa-solid fa-triangle-exclamation';
      statusText = 'Thất bại';
    }

    const timeStr = item.postedAt ? formatTimeAgo(new Date(item.postedAt)) : 'Vừa xong';

    return `
      <div class="recent-post-item">
        <div class="rpi-left">
          <div class="rpi-icon ${iconClass}">
            <i class="${icon}"></i>
          </div>
          <div class="rpi-details">
            <span class="rpi-group-name" title="${escapeHtml(item.groupName || '')}">${escapeHtml(item.groupName || 'Nhóm Facebook')}</span>
            <span class="rpi-job-title" title="${escapeHtml(item.jobTitle || '')}">${escapeHtml(item.jobTitle || 'Tin tuyển dụng')}</span>
          </div>
        </div>
        <div class="rpi-right">
          <span class="rpi-time">${timeStr}</span>
          ${item.postUrl ? `
            <a href="${item.postUrl}" target="_blank" class="rpi-link-btn" title="Mở bài viết trực tiếp trên Facebook">
              <i class="fa-solid fa-arrow-up-right-from-square"></i> Xem bài
            </a>
          ` : `
            <span class="badge-pill ${iconClass === 'published' ? 'success' : (iconClass === 'pending' ? 'warning' : 'danger')}" style="font-size: 0.72rem; padding: 2px 8px;">
              ${statusText}
            </span>
          `}
        </div>
      </div>
    `;
  }).join('');
}

function formatTimeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  if (seconds < 60) return 'Vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

async function refreshDashboardDiagnostics() {
  showToast('Đang quét toàn diện', 'Hệ thống đang kiểm tra lại tất cả các thành phần của tool...', 'info', 2000);
  await Promise.allSettled([
    loadGoogleSheets(false),
    loadGroups(),
    loadImages(),
    loadHistoryData(),
    loadAccountHealthData(),
    loadAccountsData(),
    checkBrowserProfileStatus()
  ]);
  renderDashboard();
  showToast('Hoàn tất chẩn đoán', 'Đã cập nhật toàn bộ trạng thái và các vấn đề của tool.', 'success', 2500);
}

function toggleNavGroup(groupId) {
  const grp = document.getElementById(groupId);
  if (grp) {
    grp.classList.toggle('open');
  }
}

function switchTab(tabId) {
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  if (tabId === 'scraped-jobs-tab') tabId = 'customers-tab';
  if (tabId === 'autopilot-tab') tabId = 'page-controller-tab';
  state.currentTab = tabId;
  // toggleSidebar(false); // Sidebar is permanently docked

  const mainContent = document.querySelector('.main-content');
  if (mainContent) mainContent.scrollTop = 0;

  document.querySelectorAll('.nav-item').forEach(item => {
    const href = item.getAttribute('href'); const onclick = item.getAttribute('onclick') || ''; const isActive = href === `#${tabId}` || onclick.includes(`switchTab('${tabId}')`);
    item.classList.toggle('active', isActive);
    if (isActive) {
      const parentGroup = item.closest('.nav-group');
      if (parentGroup) {
        parentGroup.classList.add('open');
      }
    }
  });

  document.querySelectorAll('.nav-group').forEach(grp => {
    const hasActive = grp.querySelector('.nav-item.active') !== null;
    grp.classList.toggle('has-active', hasActive);
  });

  document.querySelectorAll('.fb-nav-tab').forEach(item => {
    item.classList.toggle('active', item.getAttribute('data-tab') === tabId);
  });

  document.querySelectorAll('.tab-content').forEach(tab => {
    tab.classList.toggle('active', tab.id === tabId);
  });

  const titles = {
    'dashboard-tab': {
      title: '<i class="fa-solid fa-gauge-high text-primary"></i> Trung Tâm Điều Hành & Trang Tổng Quan',
      subtitle: 'Toàn cảnh hiệu suất đăng bài, chẩn đoán sức khỏe tài khoản, cảnh báo rủi ro & tình trạng hội nhóm'
    },
    'sheet-tab': {
      title: '<i class="fa-solid fa-file-excel text-success"></i> Nguồn Tuyển Dụng Google Sheets',
      subtitle: 'Dữ liệu việc làm được đồng bộ trực tiếp thời gian thực từ bảng tính Google Sheets'
    },
    'lead-dashboard-tab': {
      title: '<i class="fa-solid fa-chart-pie text-primary"></i> Tổng Quan Dashboard Khai Thác Lead &amp; Doanh Thu',
      subtitle: 'Toàn cảnh 12 chỉ số KPI, tỷ lệ chuyển đổi phễu, phân tích doanh thu và bảng xếp hạng nhân viên'
    },
    'lead-sources-tab': {
      title: '<i class="fa-solid fa-network-wired text-primary"></i> Quản Lý Nguồn Lead &amp; Hội Nhóm Facebook',
      subtitle: 'Quản lý danh sách hội nhóm, tần suất quét cào bài tự động và đo lường chất lượng từng nguồn'
    },
    'lead-radar-tab': {
      title: '<i class="fa-solid fa-crosshairs text-danger"></i> Radar Dò Lead &amp; Trí Tuệ Nhân Tạo (Lead Intelligence)',
      subtitle: 'Phát hiện tín hiệu tuyển dụng khẩn cấp (Buying Signals), chấm điểm tiềm năng và gợi ý xử lý tức thì'
    },
    'raw-leads-tab': {
      title: '<i class="fa-solid fa-filter text-primary"></i> Quản Lý Lead &amp; Quy Trình Tiếp Cận',
      subtitle: 'Bảng dữ liệu Lead cào được, bóc tách NLP, chống trùng công ty và quy trình Kanban 8 bước tiếp cận'
    },
    'customers-tab': {
      title: '<i class="fa-solid fa-id-card-clip text-success"></i> Quản Lý Khách Hàng CRM (Theo Chuẩn Google Sheets)',
      subtitle: 'Bảng quản lý khách hàng 10 mã màu, hồ sơ doanh nghiệp 360°, nhiều đầu mối liên hệ và theo dõi sức khỏe khách hàng'
    },
    'lead-followup-tab': {
      title: '<i class="fa-solid fa-calendar-check text-warning"></i> Chăm Sóc Khách Hàng &amp; Quản Lý Lịch Hẹn',
      subtitle: 'Nhắc việc tự động: Danh sách gọi điện trong ngày, lịch hẹn định kỳ và cảnh báo quá hạn'
    },
    'lead-orders-tab': {
      title: '<i class="fa-solid fa-file-invoice-dollar text-success"></i> Quản Lý Đơn Hàng, Gói Dịch Vụ &amp; Doanh Thu',
      subtitle: 'Bảng giá gói dịch vụ tuyển dụng, theo dõi lịch sử thanh toán nhiều kỳ, cơ hội Upsell và doanh thu nhóm'
    },
    'scraped-jobs-tab': {
      title: '<i class="fa-solid fa-user-tie text-success"></i> Quản Lý Khách Hàng (Lead CRM)',
      subtitle: 'Bảng quản lý quy chuẩn 10 mã màu theo Google Sheets: theo dõi liên hệ, tư vấn, báo giá, chốt đơn và doanh thu'
    },
    'images-tab': {
      title: '<i class="fa-solid fa-images text-primary"></i> Quản Lý Kho Ảnh Tuyển Dụng',
      subtitle: 'Kho hình ảnh banner, poster từ máy tính dùng để đính kèm vào bài đăng nhóm'
    },
    'groups-tab': {
      title: '<i class="fa-solid fa-users text-primary"></i> Quản Lý Hội Nhóm Facebook',
      subtitle: 'Danh sách các Hội Nhóm Tuyển Dụng mục tiêu theo từng Tỉnh Thành'
    },
    'controller-tab': {
      title: '<i class="fa-solid fa-paper-plane text-primary"></i> Trình Điều Khiển Auto-Post Nhóm',
      subtitle: 'Điều phối đăng bài mô phỏng người thật với cơ chế giãn cách an toàn chống Checkpoint'
    },
    'health-tab': {
      title: '<i class="fa-solid fa-shield-heart text-danger"></i> Giám Sát Sức Khỏe & Rủi Ro Tài Khoản',
      subtitle: 'Theo dõi chỉ số rủi ro thuật toán Meta, phát hiện giới hạn đăng bài và hướng dẫn bảo vệ tài khoản'
    },
    'accounts-tab': {
      title: '<i class="fa-solid fa-users-gear text-primary"></i> Quản Lý Dàn Nick & Cookie Facebook',
      subtitle: 'Quản lý nhiều tài khoản, chuyển đổi phiên 1-chạm, kiểm soát số bài và nạp/đổi cookie tự động'
    },
    'positions-tab': {
      title: '<i class="fa-solid fa-briefcase text-success"></i> Bảng Đo Lường Hiệu Quả Tuyển Dụng',
      subtitle: 'Theo dõi chi tiết số bài đăng, link bài viết cụ thể trên Facebook và thống kê hiệu quả từng vị trí việc làm'
    },
    'history-tab': {
      title: '<i class="fa-solid fa-chart-pie text-primary"></i> Thống Kê & Lịch Sử Đăng Bài',
      subtitle: 'Theo dõi chi tiết mọi tin tuyển dụng đã đăng, nhóm đã duyệt, nhóm chờ duyệt để tối ưu hiệu quả'
    },
    'fanpages-tab': {
      title: '<i class="fa-solid fa-flag text-info"></i> Hệ Thống 34 Facebook Fanpage Tuyển Dụng',
      subtitle: 'Quản trị mạng lưới 34 Fanpage khu vực, xuất bản tin tuyển dụng đa kênh tự động qua Meta Graph API'
    },
    'page-controller-tab': {
      title: '<i class="fa-solid fa-bullhorn text-info"></i> Trình Điều Khiển Đăng Trang (Fanpage Auto-Post)',
      subtitle: 'Trung tâm điều phối xuất bản nội dung, chọn tin tuyển dụng và phủ sóng trực tiếp trên 34 Fanpage khu vực kèm Live Terminal theo dõi'
    },
    'page-analytics-tab': {
      title: '<i class="fa-solid fa-chart-line text-success"></i> Thống Kê & Lịch Sử Fanpage',
      subtitle: 'Đo lường 12 chỉ số toàn diện: Số bài đăng, Thành công/Thất bại, Reach, Engagement, Comments, Shares, Clicks, Inbox, Leads theo bài, 34 Fanpage và Ngành nghề'
    },
    'industry-assets-tab': {
      title: '<i class="fa-solid fa-photo-film text-warning"></i> Kho Ảnh Ngành Nghề (Industry Asset Hub)',
      subtitle: 'Thư viện ảnh stock thực tế chuyên nghiệp theo từng ngành nghề phục vụ AI Human Graphic Poster và xuất bản Fanpage'
    },
    'marketing-brands-tab': {
      title: '<i class="fa-solid fa-dna text-primary"></i> Brand Profiles &amp; Content Strategy (AI Marketing Engine)',
      subtitle: 'Quản trị DNA thương hiệu, chân dung độc giả, ma trận Content Pillars và bộ lọc chống văn phong AI cho từng Fanpage'
    },
    'marketing-studio-tab': {
      title: '<i class="fa-solid fa-wand-magic-sparkles text-success"></i> AI Content Studio &amp; Multi-Angle Writing (AI Marketing Engine)',
      subtitle: 'Sinh 3 góc nhìn nội dung (Storytelling, Thực chiến, Thảo luận) + Định hướng ảnh AI Midjourney/Flux + Kiểm định chất lượng Anti-AI'
    },
    'apartments-tab': {
      title: '<i class="fa-solid fa-building-user text-warning"></i> Kho Căn Hộ &amp; Google Sheets <span class="badge-pill warning" style="font-size: 0.72rem; vertical-align: middle; margin-left: 8px;"><i class="fa-solid fa-city"></i> Đà Nẵng</span> <span class="badge-pill success" style="font-size: 0.72rem; vertical-align: middle; margin-left: 4px;"><i class="fa-solid fa-file-excel"></i> Live Sync</span>',
      subtitle: 'Quản lý bảng hàng 27 căn hộ Đà Nẵng, album ảnh thực tế, tiện ích, link Drive & xuất bản hàng loạt'
    },
    'bds-groups-tab': {
      title: '<i class="fa-solid fa-users text-warning"></i> Quản Lý Hội Nhóm <span class="badge-pill warning" style="font-size: 0.72rem; vertical-align: middle; margin-left: 8px;"><i class="fa-solid fa-building"></i> Đà Nẵng</span> <span class="badge-pill success" style="font-size: 0.72rem; vertical-align: middle; margin-left: 4px;"><i class="fa-solid fa-shield-halved"></i> Group Manager</span>',
      subtitle: 'Quản lý các Hội Nhóm Cho Thuê Căn Hộ, Studio theo Quận/Huyện (Sơn Trà, Ngũ Hành Sơn, Hải Châu...)'
    },
    'bds-controller-tab': {
      title: '<i class="fa-solid fa-paper-plane text-warning"></i> Điều Khiển Đăng Bài <span class="badge-pill success" style="font-size: 0.72rem; vertical-align: middle; margin-left: 8px;"><i class="fa-solid fa-robot"></i> Puppeteer Stealth</span> <span class="badge-pill info" style="font-size: 0.72rem; vertical-align: middle; margin-left: 4px;"><i class="fa-solid fa-bolt"></i> Auto-Post</span>',
      subtitle: 'Điều phối xuất bản tin căn hộ, studio tự động kèm album ảnh tới các Hội Nhóm mục tiêu'
    },
    'market-intelligence-tab': {
      title: '<i class="fa-solid fa-brain text-primary"></i> Phân Tích Thị Trường Việc Làm (Job Market Intelligence)',
      subtitle: 'Biến dữ liệu tuyển dụng thô thành insight có cấu trúc: phân bổ nghề, kỹ năng, lương median, xu hướng và skill gap'
    },
    'terminal-tab': {
      title: '<i class="fa-solid fa-terminal text-primary"></i> Nhật Ký Hoạt Động (Live Terminal)',
      subtitle: 'Theo dõi chi tiết các bước đăng bài và trạng thái Chrome Profile'
    },
    'automation-center-tab': {
      title: '<i class="fa-solid fa-bolt-lightning text-primary"></i> Trung Tâm Điều Khiển Tự Động Hóa',
      subtitle: 'Toàn cảnh hàng đợi đăng bài thống nhất, tài khoản Facebook, lịch trình tự động & nhật ký kiểm toán'
    },
    'campaigns-tab': {
      title: '<i class="fa-solid fa-bullhorn text-primary"></i> Quản Lý Chiến Dịch &amp; Biến Thể Nội Dung',
      subtitle: 'Điều phối chiến dịch đa kênh, tạo biến thể nội dung Fanpage vs Nhóm và theo dõi tiến độ thời gian thực'
    },
    'crm-pipeline-tab': {
      title: '<i class="fa-solid fa-arrows-split-up-and-left text-success"></i> Quy Trình Chuyển Đổi Kép &amp; Lịch Hẹn CRM',
      subtitle: 'Quy trình Kanban phân đoạn chuyên biệt: Tuyển Dụng (8 bước) & Bất Động Sản (8 bước), cảnh báo quá hạn SLA'
    },
    'attribution-tab': {
      title: '<i class="fa-solid fa-chart-line text-success"></i> Báo Cáo Phân Bổ Doanh Thu Thực Tế',
      subtitle: 'Toàn chuỗi chuyển đổi: Kênh / Nhóm → Bài Đăng → Chiến Dịch → Khách Hàng → Đơn Hàng → Doanh Thu VNĐ'
    },
    'email-automation-tab': {
      title: '<i class="fa-solid fa-envelope-circle-check text-primary"></i> Hệ Thống Gửi Email Tự Động &amp; Chăm Sóc CRM',
      subtitle: 'Gửi Email tự động hóa đa kênh (Ứng Viên & Doanh Nghiệp) với Nodemailer, Mã hóa AES-256 & Drip Sequence thực tế'
    }
  };

  if (titles[tabId]) {
    document.getElementById('page-title').innerHTML = titles[tabId].title;
    document.getElementById('page-subtitle').textContent = titles[tabId].subtitle;
  }

  const titleBanner = document.querySelector('.page-title-banner');
  if (titleBanner) {
    const isLeadTab = tabId === 'market-intelligence-tab' || 
                      tabId === 'email-automation-tab' || 
                      tabId === 'raw-leads-tab' || 
                      tabId === 'lead-dashboard-tab' || 
                      tabId === 'lead-sources-tab' || 
                      tabId === 'lead-posts-tab' || 
                      tabId === 'lead-radar-tab';
    titleBanner.style.display = isLeadTab ? 'none' : '';
  }

  // Cập nhật Header Actions tương ứng với từng tab
  const headerActions = document.getElementById('header-actions-container');
  if (headerActions) {
    if (tabId === 'dashboard-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="refreshDashboardDiagnostics()">
          <i class="fa-solid fa-rotate"></i> Làm Mới Tổng Quan
        </button>
        <button class="btn btn-primary" onclick="switchTab('controller-tab')">
          <i class="fa-solid fa-paper-plane"></i> Đăng Bài Ngay
        </button>
      `;
    } else if (tabId === 'page-controller-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="openMetaTokenModal()">
          <i class="fa-solid fa-key"></i> Token Meta API
        </button>
        <button class="btn btn-primary" onclick="openPageJobPickerModal()">
          <i class="fa-solid fa-file-excel"></i> Chọn Tin Tuyển Dụng
        </button>
      `;
    } else if (tabId === 'group-accounts-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-primary" onclick="openAddAccountModal('GROUP')">
          <i class="fa-solid fa-plus"></i> Thêm Nick Nhóm
        </button>
      `;
    } else if (tabId === 'page-accounts-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-primary" onclick="openAddAccountModal('PAGE')">
          <i class="fa-solid fa-plus"></i> Thêm Nick Fanpage
        </button>
      `;
    } else if (tabId === 'sheet-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="openSheetConfigModal()">
          <i class="fa-solid fa-link"></i> Cấu Hình Link Sheet
        </button>
        <button class="btn btn-primary" onclick="syncGoogleSheets(true)">
          <i class="fa-solid fa-arrows-rotate"></i> Đồng Bộ Lại Sheet
        </button>
      `;
    } else if (tabId === 'raw-leads-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="loadScrapedJobs(true)">
          <i class="fa-solid fa-rotate"></i> Làm Mới Dữ Liệu
        </button>
        <button class="btn btn-primary" onclick="openScrapeModal()">
          <i class="fa-solid fa-magnifying-glass-plus"></i> Cào Lead Tuyển Dụng
        </button>
      `;
    } else if (tabId === 'customers-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="exportCustomersToCsv()">
          <i class="fa-solid fa-file-excel"></i> Xuất File CRM
        </button>
        <button class="btn btn-primary" onclick="openAddCustomerModal()">
          <i class="fa-solid fa-user-plus"></i> Thêm Khách Hàng
        </button>
      `;
    } else if (tabId === 'fanpages-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="openMetaTokenModal()">
          <i class="fa-solid fa-key"></i> Cấu Hình Meta Token
        </button>
        <button class="btn btn-primary" onclick="loadFanpages(true)">
          <i class="fa-solid fa-rotate"></i> Tải Lại Fanpage
        </button>
      `;
    } else if (tabId === 'groups-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="openBulkAddModal()">
          <i class="fa-solid fa-plus-circle"></i> Thêm Hàng Loạt
        </button>
        <button class="btn btn-primary" onclick="openAddGroupModal()">
          <i class="fa-solid fa-user-group"></i> Thêm Nhóm Mới
        </button>
      `;
    } else if (tabId === 'accounts-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="openAddAccountModal()">
          <i class="fa-solid fa-user-plus"></i> Thêm Tài Khoản
        </button>
        <button class="btn btn-primary" onclick="probeAccountHealthLive()">
          <i class="fa-solid fa-stethoscope"></i> Kiểm Tra Live
        </button>
      `;
    } else if (tabId === 'positions-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="loadPositionsReportData(true)">
          <i class="fa-solid fa-rotate"></i> Tải Lại Báo Cáo
        </button>
        <button class="btn btn-primary" onclick="exportRecruitmentCsv()">
          <i class="fa-solid fa-file-excel"></i> Xuất CSV Tuyển Dụng
        </button>
      `;
    } else if (tabId === 'email-automation-tab') {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="EmailEngine.loadOverview()">
          <i class="fa-solid fa-rotate"></i> Làm Mới
        </button>
        <button class="btn btn-secondary" onclick="EmailEngine.openAddProviderModal()">
          <i class="fa-solid fa-server"></i> Cấu Hình SMTP
        </button>
        <button class="btn btn-primary" onclick="EmailEngine.openQuickSendModal()">
          <i class="fa-solid fa-paper-plane"></i> Gửi Email Nhanh
        </button>
      `;
    } else {
      headerActions.innerHTML = `
        <button class="btn btn-secondary" onclick="switchTab('dashboard-tab')">
          <i class="fa-solid fa-gauge-high"></i> Trang Tổng Quan
        </button>
        <button class="btn btn-primary" onclick="switchTab('controller-tab')">
          <i class="fa-solid fa-paper-plane"></i> Đăng Bài
        </button>
      `;
    }
  }

  if (tabId === 'dashboard-tab') {
    renderDashboard();
  }
  if (tabId === 'lead-dashboard-tab') {
    if (typeof loadLeadDashboardData === 'function') loadLeadDashboardData();
  }
  if (tabId === 'lead-sources-tab') {
    if (typeof loadLeadSourcesData === 'function') loadLeadSourcesData();
  }
  if (tabId === 'lead-posts-tab') {
    if (typeof loadLeadPostsData === 'function') loadLeadPostsData();
  }
  if (tabId === 'lead-radar-tab') {
    if (typeof loadDedicatedRadarData === 'function') loadDedicatedRadarData();
  }
  if (tabId === 'raw-leads-tab') {
    if (typeof initLeadCrm === 'function') {
      initLeadCrm();
    } else {
      loadScrapedJobs();
    }
  }
  if (tabId === 'customers-tab') {
    loadCustomersData();
  }
  if (tabId === 'lead-followup-tab') {
    if (typeof loadFollowUpData === 'function') loadFollowUpData();
  }
  if (tabId === 'lead-orders-tab') {
    if (typeof loadLeadOrdersData === 'function') loadLeadOrdersData();
  }
  if (tabId === 'fanpages-tab') {
    loadFanpages();
  }
  if (tabId === 'history-tab') {
    loadHistoryData();
  }
  if (tabId === 'accounts-tab') {
    loadAccountsData();
  }
  if (tabId === 'health-tab') {
    loadAccountHealthData();
  }
  if (tabId === 'positions-tab') {
    loadPositionsReportData();
  }
  if (tabId === 'market-intelligence-tab') {
    if (typeof initMarketIntelligence === 'function' && !jmiState.data) {
      initMarketIntelligence();
    }
  }
  if (tabId === 'page-controller-tab') {
    if (typeof renderPageControllerTab === 'function') {
      renderPageControllerTab();
    } else {
      if (typeof loadFanpageAccountsBar === 'function') loadFanpageAccountsBar();
      if (typeof loadAutoPilotPlan === 'function') loadAutoPilotPlan();
      if (typeof startFanpagePolling === 'function') startFanpagePolling();
    }
  }
  if (tabId === 'page-analytics-tab') {
    if (typeof loadFanpagePerformanceAnalytics === 'function') {
      loadFanpagePerformanceAnalytics();
    }
  }
  if (tabId === 'industry-assets-tab') {
    if (typeof loadIndustryAssets === 'function') {
      loadIndustryAssets();
    }
  }
  if (tabId === 'marketing-brands-tab') {
    if (typeof loadMarketingBrandProfiles === 'function') {
      loadMarketingBrandProfiles();
    }
  }
  if (tabId === 'marketing-studio-tab') {
    if (typeof loadMarketingStudio === 'function') {
      loadMarketingStudio();
    }
  }
  if (tabId === 'apartments-tab') {
    if (typeof initApartmentsTab === 'function') initApartmentsTab();
  }
  if (tabId === 'bds-groups-tab') {
    if (typeof initBdsGroupsTab === 'function') initBdsGroupsTab();
  }
  if (tabId === 'bds-controller-tab') {
    if (typeof initBdsControllerTab === 'function') initBdsControllerTab();
  }
  if (tabId === 'automation-center-tab') {
    if (window.AutomationCenter && typeof window.AutomationCenter.loadControlCenter === 'function') {
      window.AutomationCenter.loadControlCenter();
    }
  }
  if (tabId === 'campaigns-tab') {
    if (window.AutomationCenter && typeof window.AutomationCenter.loadCampaigns === 'function') {
      window.AutomationCenter.loadCampaigns();
    }
  }
  if (tabId === 'crm-pipeline-tab') {
    if (window.AutomationCenter && typeof window.AutomationCenter.loadPipelineKanban === 'function') {
      window.AutomationCenter.loadPipelineKanban();
    }
  }
  if (tabId === 'attribution-tab') {
    if (window.AutomationCenter && typeof window.AutomationCenter.loadAttributionReport === 'function') {
      window.AutomationCenter.loadAttributionReport();
    }
  }
  if (tabId === 'email-automation-tab') {
    if (window.EmailEngine && typeof window.EmailEngine.loadOverview === 'function') {
      window.EmailEngine.loadOverview();
    }
  }
}

// =========================================================
// 3. GOOGLE SHEETS INGESTION
// =========================================================
async function loadGoogleSheets(forceReload = false) {
  const tbody = document.getElementById('sheet-table-body');
  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu từ Google Sheets...</td></tr>`;

  try {
    const res = await fetch(`/api/sheet/jobs?force=${forceReload ? 'true' : 'false'}`);
    const result = await res.json();

    if (result.success) {
      state.sheetJobs = result.data || [];
      state.filteredJobs = [...state.sheetJobs];

      document.getElementById('sheet-total-badge').innerHTML = `<i class="fa-solid fa-database"></i> ${result.total} việc làm`;
      renderSheetTable();
      if (state.currentTab === 'dashboard-tab') renderDashboard();
      appendTerminalLog(`[SHEET] Đã đồng bộ thành công ${result.total} việc làm từ Google Sheets.`, 'success');
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi: ${result.message}</td></tr>`;
      appendTerminalLog(`[SHEET ERROR] ${result.message}`, 'error');
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Không thể kết nối Google Sheets: ${err.message}</td></tr>`;
    appendTerminalLog(`[SHEET ERROR] ${err.message}`, 'error');
  }
}

function syncGoogleSheets(force = true) {
  loadGoogleSheets(force);
}

function renderSheetTable() {
  const tbody = document.getElementById('sheet-table-body');
  tbody.innerHTML = '';

  if (state.filteredJobs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4" style="color: var(--text-dim);">Không có dữ liệu việc làm phù hợp.</td></tr>`;
    return;
  }

  state.filteredJobs.forEach((job) => {
    const tr = document.createElement('tr');
    const customBadge = (job.source === 'LeadX App') 
      ? `<span class="badge-pill success" style="font-size: 0.68rem; margin-top: 3px; display: inline-flex; align-items: center; gap: 4px; padding: 2px 6px;"><i class="fa-solid fa-cloud-arrow-up"></i> Thêm từ App</span>` 
      : '';
    const subtitle = (job.industry ? `<div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">${escapeHtml(job.industry)}</div>` : '') + customBadge;
    const workingTimeDisplay = job.workingTime
      ? `<div style="display: flex; align-items: flex-start; gap: 6px; color: var(--text-main); font-weight: 500; font-size: 0.78rem; line-height: 1.35;"><i class="fa-solid fa-clock text-primary" style="margin-top: 2px; flex-shrink: 0;"></i> <span>${escapeHtml(job.workingTime)}</span></div>`
      : `<span style="color: var(--text-dim); font-size: 0.78rem;"><i class="fa-regular fa-clock"></i> Giờ hành chính / Thỏa thuận</span>`;
    const deadlineSub = job.deadline ? `<div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 3px;"><i class="fa-solid fa-hourglass-half text-warning"></i> Hạn: ${escapeHtml(job.deadline)}</div>` : '';

    tr.innerHTML = `
      <td class="text-center nowrap"><strong>#${job.id}</strong></td>
      <td>
        <strong style="display: block; line-height: 1.35; margin-bottom: 2px;">${escapeHtml(job.title)}</strong>
        ${subtitle}
      </td>
      <td><div style="line-height: 1.35;">${escapeHtml(job.company || 'N/A')}</div></td>
      <td class="nowrap">
        <div class="location-compact" title="${escapeHtml(job.province || job.location || 'Toàn quốc')}">
          <i class="fa-solid fa-location-dot"></i>
          <span>${escapeHtml(job.province || job.location || 'Toàn quốc')}</span>
        </div>
      </td>
      <td><strong style="color: var(--success); line-height: 1.35; display: block;">${escapeHtml(job.salary || 'Thỏa thuận')}</strong></td>
      <td>
        ${workingTimeDisplay}
        ${deadlineSub}
      </td>
      <td class="text-center nowrap">
        <button class="btn btn-sm btn-primary" onclick="selectJobForCampaign('${job.id}')" title="Chọn tin tuyển dụng này để tiến hành đăng nhóm">
          <i class="fa-solid fa-paper-plane"></i> Chọn Đăng
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function filterSheetJobs() {
  const q = (document.getElementById('sheet-search').value || '').toLowerCase().trim();
  state.filteredJobs = state.sheetJobs.filter(job =>
    (job.title && job.title.toLowerCase().includes(q)) ||
    (job.company && job.company.toLowerCase().includes(q)) ||
    (job.province && job.province.toLowerCase().includes(q)) ||
    (job.industry && job.industry.toLowerCase().includes(q))
  );
  renderSheetTable();
}

// =========================================================
// 3.5. PHÂN HỆ KHAI THÁC LEAD & CRM TƯ VẤN BÁN HÀNG
// Chuẩn 10 mã màu Google Sheets & Đo lường tần suất đăng bài
// =========================================================

const LEAD_STATUS_CONFIG = {
  VIP_URGENT: {
    code: 'VIP_URGENT',
    name: 'Tuyển Gấp / VIP',
    label: '👑 Tuyển Gấp / VIP',
    className: 'chip-VIP_URGENT',
    hex: '#EAB308',
    bg: '#FDF8C3',
    textColor: '#854D0E',
    desc: 'Đăng dồn dập >4 nhóm hoặc gắn nhãn Tuyển Gấp, nhu cầu cấp bách'
  },
  POTENTIAL: {
    code: 'POTENTIAL',
    name: 'Khách Tiềm Năng',
    label: '⚡ Khách Tiềm Năng',
    className: 'chip-POTENTIAL',
    hex: '#06B6D4',
    bg: '#CFF9FD',
    textColor: '#0E7490',
    desc: 'Đăng 2-3 nhóm, thông tin công việc rõ ràng, nhu cầu thực tế'
  },
  NEW: {
    code: 'NEW',
    name: 'Khách Hàng Mới',
    label: '🆕 Khách Mới',
    className: 'chip-NEW',
    hex: '#3B82F6',
    bg: '#DBEAFD',
    textColor: '#1D4ED8',
    desc: 'Mới cào lần đầu, chưa tương tác hoặc mới đăng bài 1 nhóm'
  },
  CONSULTING: {
    code: 'CONSULTING',
    name: 'Đang Tư Vấn',
    label: '💬 Đang Tư Vấn',
    className: 'chip-CONSULTING',
    hex: '#F59E0B',
    bg: '#FDF3C6',
    textColor: '#B45208',
    desc: 'Đã kết nối qua Zalo/Phone/Messenger, đang trao đổi gói đăng'
  },
  QUOTING: {
    code: 'QUOTING',
    name: 'Chờ Báo Giá',
    label: '⏳ Chờ Báo Giá',
    className: 'chip-QUOTING',
    hex: '#8B5CF6',
    bg: '#ECE9FD',
    textColor: '#6C28D9',
    desc: 'Đã gửi bảng giá dịch vụ đăng bài / gói Fanpage, chờ khách duyệt'
  },
  PAID: {
    code: 'PAID',
    name: 'Đã Thanh Toán',
    label: '✅ Đã Chốt / Paid',
    className: 'chip-PAID',
    hex: '#10B981',
    bg: '#D1F9E4',
    textColor: '#047856',
    desc: 'Đã chốt hợp đồng dịch vụ đăng bài tuyển dụng, thanh toán xong'
  },
  CALLBACK: {
    code: 'CALLBACK',
    name: 'Hẹn Liên Hệ Lại',
    label: '📞 Hẹn Gọi Lại',
    className: 'chip-CALLBACK',
    hex: '#65A30D',
    bg: '#EBFBCA',
    textColor: '#4D7B0F',
    desc: 'Khách đang bận hoặc hẹn giờ cụ thể để tư vấn lại'
  },
  LOYAL: {
    code: 'LOYAL',
    name: 'Khách Thân Thiết',
    label: '⭐ Khách Thân Thiết',
    className: 'chip-LOYAL',
    hex: '#EC4899',
    bg: '#FBE7F3',
    textColor: '#BD175D',
    desc: 'Khách quen từng mua nhiều gói đăng hoặc hợp tác định kỳ'
  },
  NO_REPLY: {
    code: 'NO_REPLY',
    name: 'Không Phản Hồi',
    label: '💤 Không Phản Hồi',
    className: 'chip-NO_REPLY',
    hex: '#64748B',
    bg: '#F1F5F9',
    textColor: '#475569',
    desc: 'Đã gọi / nhắn tin nhiều lần nhưng không phản hồi'
  },
  SPAM: {
    code: 'SPAM',
    name: 'Spam / Bỏ Qua',
    label: '🚫 Bỏ Qua / Spam',
    className: 'chip-SPAM',
    hex: '#475569',
    bg: '#E2E8F0',
    textColor: '#1E293B',
    desc: 'Đa cấp trá hình, sai số điện thoại hoặc tin rác'
  }
};

// Phân tích khoá định danh lead: ưu tiên SĐT, sau đó là Tên quán/Công ty
function getLeadIdentityKey(job) {
  if (job.contactPhone) {
    const cleanPhone = String(job.contactPhone).replace(/[^0-9]/g, '');
    if (cleanPhone.length >= 9) return 'phone_' + cleanPhone;
  }
  const emp = (job.employerName || job.employer || '').trim().toLowerCase();
  if (emp.length >= 3) {
    return 'emp_' + emp.replace(/\s+/g, '_');
  }
  return 'job_' + (job.id || 'unknown');
}

// Lưu trữ trạng thái và ghi chú vào LocalStorage
function getStoredLeadStatus(leadKey, defaultStatus = 'NEW') {
  try {
    const map = JSON.parse(localStorage.getItem('lead_crm_status_map') || '{}');
    return map[leadKey] || defaultStatus;
  } catch (e) {
    return defaultStatus;
  }
}

function setStoredLeadStatus(leadKey, newStatus) {
  try {
    const map = JSON.parse(localStorage.getItem('lead_crm_status_map') || '{}');
    map[leadKey] = newStatus;
    localStorage.setItem('lead_crm_status_map', JSON.stringify(map));
  } catch (e) {}
}

function getStoredLeadNote(leadKey) {
  try {
    const map = JSON.parse(localStorage.getItem('lead_crm_notes_map') || '{}');
    return map[leadKey] || '';
  } catch (e) {
    return '';
  }
}

function setStoredLeadNote(leadKey, note) {
  try {
    const map = JSON.parse(localStorage.getItem('lead_crm_notes_map') || '{}');
    map[leadKey] = note;
    localStorage.setItem('lead_crm_notes_map', JSON.stringify(map));
  } catch (e) {}
}

// Phân tích tần suất và đo lường hành vi đăng tuyển
function analyzeLeadPostingMetrics(jobs) {
  const map = {};
  const urgentKeywords = ['gấp', 'tuyển gấp', 'cần gấp', 'đi làm ngay', 'urgent', 'hỏa tốc', 'ngay trong ngày', 'gấp gấp'];

  (jobs || []).forEach(job => {
    const key = getLeadIdentityKey(job);
    if (!map[key]) {
      map[key] = {
        key,
        jobs: [],
        groupNames: new Set(),
        isUrgentText: false
      };
    }
    map[key].jobs.push(job);
    if (job.groupName) map[key].groupNames.add(job.groupName);

    const fullText = `${job.title || ''} ${job.postText || ''} ${job.originalText || ''}`.toLowerCase();
    if (urgentKeywords.some(kw => fullText.includes(kw))) {
      map[key].isUrgentText = true;
    }
  });

  // Gán metrics ngược lại cho từng job
  (jobs || []).forEach(job => {
    const key = getLeadIdentityKey(job);
    const data = map[key] || { groupNames: new Set([job.groupName || 'Nhóm FB']), isUrgentText: false };
    const groupCount = Math.max(1, data.groupNames.size);
    const isUrgent = groupCount >= 4 || data.isUrgentText;

    let suggestedStatus = 'NEW';
    if (groupCount >= 4 || (data.isUrgentText && job.contactPhone)) {
      suggestedStatus = 'VIP_URGENT';
    } else if (groupCount >= 2 || job.leadTier === 'GOLD_LEAD') {
      suggestedStatus = 'POTENTIAL';
    }

    job._metrics = {
      leadKey: key,
      groupCount,
      groupNames: Array.from(data.groupNames),
      isUrgent,
      suggestedStatus
    };
  });
}

// =========================================================
// 1. PHÂN HỆ: THU THẬP DỮ LIỆU GROUP (DỮ LIỆU GỐC)
// =========================================================
state.rawLeadFilterTier = 'ALL';
state.filteredRawLeads = [];

async function loadScrapedJobs(forceReload = false) {
  const tbody = document.getElementById('raw-leads-table-body') || document.getElementById('scraped-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu gốc từ Scraper Engine...</td></tr>`;

  try {
    const res = await fetch(`/api/scraped/jobs?force=${forceReload ? 'true' : 'false'}`);
    const result = await res.json();

    if (result.success) {
      state.scrapedJobs = result.data || [];
      analyzeLeadPostingMetrics(state.scrapedJobs);
      filterRawLeads();

      const totalBadge = document.getElementById('raw-leads-total-badge') || document.getElementById('scraped-total-badge');
      const goldBadge = document.getElementById('raw-leads-gold-badge') || document.getElementById('scraped-gold-badge');
      const potBadge = document.getElementById('raw-leads-potential-badge');

      const goldCount = (state.scrapedJobs || []).filter(j => j.leadTier === 'GOLD_LEAD').length;
      const potCount = (state.scrapedJobs || []).filter(j => j.leadTier === 'POTENTIAL_LEAD').length;

      if (totalBadge) totalBadge.innerHTML = `<i class="fa-solid fa-database"></i> ${state.scrapedJobs.length} bài quét`;
      if (goldBadge) goldBadge.innerHTML = `<i class="fa-solid fa-crown"></i> ${goldCount} Lead Vàng`;
      if (potBadge) potBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> ${potCount} Tiềm Năng`;

      appendTerminalLog(`[SCRAPER] Đã nạp thành công ${state.scrapedJobs.length} tin tuyển dụng gốc (${goldCount} Lead Vàng) từ Scraper.`, 'success');
    } else {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi: ${result.message}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Không thể kết nối tới Scraper Engine: ${err.message}</td></tr>`;
  }
}

function setRawLeadFilterTier(tier) {
  state.rawLeadFilterTier = tier;
  const pillIds = ['ALL', 'GOLD', 'POTENTIAL'];
  pillIds.forEach(id => {
    const el = document.getElementById(`pill-raw-${id}`);
    if (el) el.classList.remove('active');
  });

  const activeId = tier === 'GOLD_LEAD' ? 'GOLD' : (tier === 'POTENTIAL_LEAD' ? 'POTENTIAL' : 'ALL');
  const activePill = document.getElementById(`pill-raw-${activeId}`);
  if (activePill) activePill.classList.add('active');

  filterRawLeads();
}

function filterRawLeads() {
  const q = (document.getElementById('raw-leads-search')?.value || document.getElementById('scraped-search')?.value || '').toLowerCase().trim();
  const tier = state.rawLeadFilterTier || 'ALL';

  state.filteredRawLeads = (state.scrapedJobs || []).filter(job => {
    if (job.leadTier === 'UNQUALIFIED' || job.isAnonymous) return false;
    const titleLower = (job.title || '').toLowerCase();
    if (titleLower.includes('tìm việc') || titleLower.includes('kiếm việc')) return false;

    if (tier !== 'ALL' && job.leadTier !== tier) {
      return false;
    }

    if (!q) return true;
    return (
      (job.title && job.title.toLowerCase().includes(q)) ||
      (job.employerName && job.employerName.toLowerCase().includes(q)) ||
      (job.posterName && job.posterName.toLowerCase().includes(q)) ||
      (job.location && job.location.toLowerCase().includes(q)) ||
      (job.contact && job.contact.toLowerCase().includes(q)) ||
      (job.groupName && job.groupName.toLowerCase().includes(q)) ||
      (job.originalText && job.originalText.toLowerCase().includes(q))
    );
  });

  renderRawLeadsTable();
}

// Giữ tương thích ngược với nút gọi cũ nếu có
function filterScrapedJobs() { filterRawLeads(); }
function setLeadFilterStatus(status) { setCustomerFilterStatus(status); }

function getEffectivePostUrl(job) {
  if (!job) return '#';
  const url = (job.postUrl || '').trim();
  if (url && (url.includes('/posts/') || url.includes('/permalink/') || url.includes('story_fbid=') || url.includes('/multi_permalinks/'))) {
    return url;
  }

  const groupUrl = (job.groupUrl || url || '').trim();
  if (groupUrl && groupUrl.includes('facebook.com/groups/')) {
    const cleanGroup = groupUrl.split('?')[0].replace(/\/+$/, '');
    const searchKey = job.contactPhone || job.employerName || job.employer || job.title || '';
    if (searchKey) {
      return `${cleanGroup}/search/?q=${encodeURIComponent(searchKey)}`;
    }
    return cleanGroup;
  }

  return url || groupUrl || '#';
}

function renderRawLeadsTable() {
  const tbody = document.getElementById('raw-leads-table-body') || document.getElementById('scraped-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!state.filteredRawLeads || state.filteredRawLeads.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4" style="color: var(--text-dim);">Chưa có tin tuyển dụng nào trong bộ lọc hoặc chưa chạy cào bài viết.</td></tr>`;
    return;
  }

  state.filteredRawLeads.forEach((job, idx) => {
    const tr = document.createElement('tr');
    const metrics = job._metrics || { leadKey: getLeadIdentityKey(job), groupCount: 1, isUrgent: false };
    const postLink = getEffectivePostUrl(job);

    // Cột Nhóm Facebook
    const grpHtml = `
      <div style="font-weight: 600; color: var(--text-main); font-size: 0.85rem;">
        <i class="fa-solid fa-users text-primary"></i> ${escapeHtml(job.groupName || 'Nhóm FB')}
      </div>
      ${job.groupUrl ? `<a href="${escapeHtml(job.groupUrl)}" target="_blank" style="font-size: 0.73rem; color: var(--text-muted); text-decoration: none;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở nhóm</a>` : ''}
    `;

    // Cột Người đăng
    const posterHtml = `
      <div style="font-size: 0.84rem; font-weight: 600; color: var(--text-main);">
        <i class="fa-brands fa-facebook" style="color: #1877f2;"></i> ${escapeHtml(job.posterName || job.authorName || 'Nhà Tuyển Dụng')}
      </div>
      ${job.authorUrl ? `<a href="${escapeHtml(job.authorUrl)}" target="_blank" style="font-size: 0.72rem; color: var(--text-muted); text-decoration: none;">Xem profile</a>` : ''}
    `;

    // Cột Vị trí & Trích đoạn
    let badgesHtml = '';
    if (metrics.groupCount > 1) {
      badgesHtml += `<span class="lead-frequency-tag"><i class="fa-solid fa-repeat"></i> Đăng ${metrics.groupCount} nhóm</span>`;
    }
    if (metrics.isUrgent) {
      badgesHtml += `<span class="lead-urgent-badge"><i class="fa-solid fa-fire"></i> Gấp</span>`;
    }

    const titleHtml = `
      <div>
        <a href="${escapeHtml(postLink)}" target="_blank" style="color: var(--primary); font-size: 0.88rem; font-weight: 700; text-decoration: none; display: inline-flex; align-items: center; gap: 5px;">
          ${escapeHtml(job.title || 'Tuyển Dụng')} <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.7rem;"></i>
        </a>
        <div style="font-size: 0.76rem; color: var(--text-muted); margin-top: 3px; max-height: 48px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${escapeHtml(job.originalText || '')}">
          ${escapeHtml(job.originalText ? job.originalText.substring(0, 180) + '...' : '')}
        </div>
        <div style="display: flex; gap: 5px; margin-top: 4px; flex-wrap: wrap;">
          ${badgesHtml}
        </div>
      </div>
    `;

    // Cột Địa điểm & Lương
    const locSalaryHtml = `
      <div class="location-compact" title="${escapeHtml(job.location || 'Chưa rõ')}">
        <i class="fa-solid fa-location-dot"></i>
        <span>${escapeHtml(job.location || 'Toàn quốc')}</span>
      </div>
      <div style="color: var(--success); font-weight: 700; font-size: 0.78rem; margin-top: 3px;">
        ${escapeHtml(job.salary || 'Thỏa thuận')}
      </div>
    `;

    // Cột Liên hệ & Đánh giá
    const isGold = job.leadTier === 'GOLD_LEAD';
    const tierBadge = isGold
      ? `<span class="badge-pill warning" style="font-size: 0.72rem; padding: 2px 7px; font-weight: 700;"><i class="fa-solid fa-crown"></i> Lead Vàng 100đ</span>`
      : `<span class="badge-pill info" style="font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-bolt"></i> Tiềm Năng 75đ</span>`;

    const contactHtml = `
      ${job.contactPhone ? `<div style="font-weight: 700; color: var(--text-main); font-size: 0.82rem;"><i class="fa-solid fa-phone text-success"></i> ${escapeHtml(job.contactPhone)}</div>` : '<div style="color: var(--text-dim); font-size: 0.76rem;">Chưa rõ SĐT</div>'}
      <div style="margin-top: 4px;">${tierBadge}</div>
    `;

    // Cột Hành động
    const isAlreadyConverted = (customersList || []).some(c => (job.contactPhone && c.phone === job.contactPhone) || (job.postUrl && c.postUrl === job.postUrl));

    const actionsHtml = `
      <div style="display: flex; gap: 5px; justify-content: center; align-items: center; flex-wrap: wrap;">
        <button class="btn btn-sm ${isAlreadyConverted ? 'btn-success' : 'btn-primary'}" 
          id="btn-convert-lead-${job.id}" 
          onclick="convertLeadToCustomer('${job.id}')" 
          style="padding: 4px 8px; font-size: 0.74rem; font-weight: 600;" 
          title="Chuyển Lead này sang bảng Quản Lý Khách Hàng CRM">
          <i class="fa-solid ${isAlreadyConverted ? 'fa-check' : 'fa-user-plus'}"></i> ${isAlreadyConverted ? 'Đã Vào CRM' : 'Khai Thác KH'}
        </button>
        <button class="btn btn-sm btn-outline" onclick="publishLeadToFanpages('${job.id}')" style="border-color: #8b5cf6; color: #8b5cf6; font-size: 0.74rem; padding: 4px 7px;" title="Đăng lên 34 Fanpage">
          <i class="fa-solid fa-bullhorn"></i>
        </button>
        <a href="${escapeHtml(postLink)}" target="_blank" class="btn btn-sm btn-outline" style="border-color: #1877f2; color: #1877f2; font-size: 0.74rem; padding: 4px 7px;" title="Mở bài gốc trên Facebook">
          <i class="fa-brands fa-facebook"></i>
        </a>
      </div>
    `;

    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td>${grpHtml}</td>
      <td>${posterHtml}</td>
      <td>${titleHtml}</td>
      <td>${locSalaryHtml}</td>
      <td>${contactHtml}</td>
      <td class="text-center">${actionsHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Chuyển 1 Lead sang Khách Hàng CRM
async function convertLeadToCustomer(jobId) {
  const job = (state.scrapedJobs || []).find(j => String(j.id) === String(jobId));
  if (!job) return;

  const btn = document.getElementById(`btn-convert-lead-${jobId}`);
  if (btn) btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu...';

  try {
    const res = await fetch('/api/customers/convert-from-lead', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(job)
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Thêm Khách Hàng', result.message, 'success');
      if (btn) {
        btn.className = 'btn btn-sm btn-success';
        btn.innerHTML = '<i class="fa-solid fa-check"></i> Đã Vào CRM';
      }
      loadCustomersData();
    } else {
      showToast('Lỗi Chuyển Đổi', result.message, 'danger');
      if (btn) btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Khai Thác KH';
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
    if (btn) btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Khai Thác KH';
  }
}

// Chuyển toàn bộ Lead Vàng vào Khách Hàng CRM
async function convertAllGoldLeadsToCustomers() {
  const goldLeads = (state.scrapedJobs || []).filter(j => j.leadTier === 'GOLD_LEAD');
  if (goldLeads.length === 0) {
    showToast('Chưa Có Lead Vàng', 'Không tìm thấy Lead Vàng nào trong danh sách hiện tại.', 'warning');
    return;
  }

  showToast('Đang Chuyển Đổi', `Đang nạp ${goldLeads.length} Lead Vàng vào bảng Quản Lý Khách Hàng...`, 'info', 4000);

  let successCount = 0;
  for (const lead of goldLeads) {
    try {
      await fetch('/api/customers/convert-from-lead', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(lead)
      });
      successCount++;
    } catch (e) {}
  }

  showToast('Chuyển Đổi Thành Công', `Đã nạp thành công ${successCount} Lead Vàng vào bảng Quản Lý Khách Hàng CRM!`, 'success', 5000);
  loadCustomersData(true);
  renderRawLeadsTable();
}

// =========================================================
// 2. PHÂN HỆ: BẢNG QUẢN LÝ KHÁCH HÀNG CRM (CHUẨN GOOGLE SHEETS)
// =========================================================
let customersList = [];
let filteredCustomers = [];
let currentCustomerFilterStatus = 'ALL';

async function loadCustomersData(forceReload = false) {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải dữ liệu khách hàng CRM...</td></tr>`;

  try {
    const res = await fetch('/api/customers');
    const result = await res.json();

    if (result.success) {
      customersList = result.data || [];
      updateCustomerKpis(result.stats);
      filterCustomers();
    } else {
      tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi: ${result.message}</td></tr>`;
    }
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối CRM: ${err.message}</td></tr>`;
  }
}

function updateCustomerKpis(stats) {
  if (!stats) return;
  // Modern KPI Stat Cards
  const valTotal = document.getElementById('cust-kpi-total-val');
  const valConsulting = document.getElementById('cust-kpi-consulting-val');
  const valQuoting = document.getElementById('cust-kpi-quoting-val');
  const valRevenue = document.getElementById('cust-kpi-revenue-val');

  if (valTotal) valTotal.textContent = (stats.total || 0).toLocaleString('vi-VN');
  if (valConsulting) valConsulting.textContent = (stats.byStatus?.CONSULTING || 0).toLocaleString('vi-VN');
  if (valQuoting) valQuoting.textContent = (stats.byStatus?.QUOTING || 0).toLocaleString('vi-VN');
  if (valRevenue) {
    const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats.totalRevenue || 0);
    valRevenue.textContent = formatted;
  }

  // Backward compatibility badges if present
  const elTotal = document.getElementById('cust-kpi-total');
  const elConsulting = document.getElementById('cust-kpi-consulting');
  const elQuoting = document.getElementById('cust-kpi-quoting');
  const elRevenue = document.getElementById('cust-kpi-revenue');
  if (elTotal) elTotal.innerHTML = `<i class="fa-solid fa-users"></i> ${stats.total || 0} khách`;
  if (elConsulting) elConsulting.innerHTML = `<i class="fa-solid fa-comments"></i> ${stats.byStatus?.CONSULTING || 0} tư vấn`;
  if (elQuoting) elQuoting.innerHTML = `<i class="fa-solid fa-file-invoice-dollar"></i> ${stats.byStatus?.QUOTING || 0} báo giá`;
  if (elRevenue) {
    const formatted = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(stats.totalRevenue || 0);
    elRevenue.innerHTML = `<i class="fa-solid fa-circle-dollar-to-slot"></i> ${formatted}`;
  }
}

// Global action dropdown controllers
function toggleCustFilterDropdown() {
  const dd = document.getElementById('cust-filter-dropdown');
  const chevron = document.getElementById('cust-filter-chevron');
  if (!dd) return;
  const isOpen = dd.style.display !== 'none';
  dd.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

function toggleActionDropdown(id) {
  const menu = document.getElementById(id);
  if (!menu) return;
  const isShown = menu.style.display === 'block';
  closeAllActionDropdowns();
  if (!isShown) {
    menu.style.display = 'block';
  }
}

function closeAllActionDropdowns() {
  document.querySelectorAll('.action-dropdown-menu').forEach(m => m.style.display = 'none');
}

// Click outside handler for all dropdown menus
document.addEventListener('click', function(e) {
  if (!e.target.closest('.action-dropdown-wrap')) {
    closeAllActionDropdowns();
  }
  const custWrap = document.querySelector('.cust-status-dropdown-wrap');
  if (custWrap && !custWrap.contains(e.target)) {
    const dd = document.getElementById('cust-filter-dropdown');
    const chevron = document.getElementById('cust-filter-chevron');
    if (dd) dd.style.display = 'none';
    if (chevron) chevron.style.transform = '';
  }
});

function setCustomerFilterStatus(status) {
  currentCustomerFilterStatus = status;
  const pillIds = ['ALL', 'NEW', 'VIP_URGENT', 'CONSULTING', 'QUOTING', 'PAID', 'LOYAL', 'COMPLAINT', 'POTENTIAL', 'CALLBACK', 'SUPPORT'];
  pillIds.forEach(id => {
    const el = document.getElementById(`pill-cust-${id}`);
    if (el) el.classList.remove('active');
  });

  const activePill = document.getElementById(`pill-cust-${status}`);
  if (activePill) activePill.classList.add('active');

  // Update label on toggle button
  const labelEl = document.getElementById('cust-filter-label');
  if (labelEl && activePill) labelEl.textContent = activePill.textContent.trim();

  // Close dropdown
  const dd = document.getElementById('cust-filter-dropdown');
  const chevron = document.getElementById('cust-filter-chevron');
  if (dd) dd.style.display = 'none';
  if (chevron) chevron.style.transform = '';

  filterCustomers();
}

function filterCustomers() {
  const q = (document.getElementById('customers-search')?.value || '').toLowerCase().trim();
  const filterStatus = currentCustomerFilterStatus || 'ALL';

  filteredCustomers = (customersList || []).filter(c => {
    if (filterStatus !== 'ALL' && c.status !== filterStatus) {
      return false;
    }

    if (!q) return true;
    return (
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.phone && c.phone.includes(q)) ||
      (c.notes && c.notes.toLowerCase().includes(q)) ||
      (c.channel && c.channel.toLowerCase().includes(q))
    );
  });

  renderCustomersTable();
}

function renderCustomersTable() {
  const tbody = document.getElementById('customers-table-body');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!filteredCustomers || filteredCustomers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4" style="color: var(--text-dim);">Không có khách hàng nào phù hợp bộ lọc trạng thái.</td></tr>`;
    return;
  }

  filteredCustomers.forEach((c, idx) => {
    const tr = document.createElement('tr');
    const statusCfg = LEAD_STATUS_CONFIG[c.status] || LEAD_STATUS_CONFIG.NEW;

    // Tên Khách Hàng
    const nameHtml = `
      <div style="font-weight: 700; color: var(--text-main); font-size: 0.88rem; display: flex; align-items: center; gap: 6px;">
        <i class="fa-solid fa-store" style="color: #f59e0b;"></i> ${escapeHtml(c.name)}
      </div>
      <div style="margin-top: 3px; display: flex; flex-wrap: wrap; gap: 4px; align-items: center;">
        ${c.jobTitle ? `<span class="badge-pill" style="background: rgba(37,99,235,0.08); color: #2563eb; border: 1px solid #bfdbfe; font-size: 0.72rem; padding: 1px 6px; font-weight: 600;"><i class="fa-solid fa-briefcase"></i> ${escapeHtml(c.jobTitle)}</span>` : ''}
        ${c.source === 'facebook_group' ? `<span class="badge-pill info" style="font-size: 0.68rem; padding: 1px 5px;"><i class="fa-solid fa-bolt"></i> Lead từ Group</span>` : ''}
      </div>
    `;

    // Số Điện Thoại + Zalo
    const phoneHtml = `
      ${c.phone ? `
        <div style="font-weight: 700; color: #16a34a; font-size: 0.85rem;"><i class="fa-solid fa-phone"></i> ${escapeHtml(c.phone)}</div>
        <a href="https://zalo.me/${escapeHtml(c.phone)}" target="_blank" class="btn btn-sm" style="background: #0068ff; color: #fff; padding: 2px 7px; font-size: 0.72rem; margin-top: 3px; border-radius: 4px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px;">
          <i class="fa-solid fa-comment-dots"></i> Chat Zalo
        </a>
      ` : '<span style="color: var(--text-dim); font-size: 0.76rem;">Chưa có SĐT</span>'}
    `;

    // Kênh Liên Hệ & Group Facebook
    const channelIcon = c.channelIcon || (c.channel === 'Zalo OA' ? 'fa-solid fa-comment-dots' : (c.channel === 'Facebook Page' ? 'fa-brands fa-facebook' : (c.channel === 'Meta Messenger' ? 'fa-brands fa-facebook-messenger' : 'fa-brands fa-facebook')));
    const channelHtml = `
      <div>
        <span class="badge-pill" style="background: var(--bg-input); color: var(--text-main); font-size: 0.78rem; padding: 3px 8px; border: 1px solid var(--border-color); display: inline-flex; align-items: center; gap: 5px;">
          <i class="${channelIcon}" style="color: #1877f2;"></i> ${escapeHtml(c.groupName || c.channel || 'Facebook Group')}
        </span>
      </div>
      ${c.postCount && c.postCount > 1 ? `
        <div style="margin-top: 3px;">
          <span class="badge-pill" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a; font-size: 0.70rem; padding: 2px 6px; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;" title="Khách hàng đã đăng ${c.postCount} lần trên các nhóm">
            <i class="fa-solid fa-repeat"></i> Đã đăng ${c.postCount} lần
          </span>
        </div>
      ` : `
        <div style="margin-top: 3px;">
          <span class="badge-pill" style="background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; font-size: 0.68rem; padding: 1px 5px;" title="Đăng 1 lần trên nhóm">
            <i class="fa-regular fa-clock"></i> Đăng 1 lần
          </span>
        </div>
      `}
    `;

    // Dropdown Chip 10 Mã Màu Chuẩn Google Sheets (Chỉ 1 mũi tên)
    let statusOptions = '';
    Object.values(LEAD_STATUS_CONFIG).forEach(cfg => {
      statusOptions += `<option value="${cfg.code}" ${cfg.code === c.status ? 'selected' : ''}>${cfg.name}</option>`;
    });

    const statusDropdownHtml = `
      <div class="lead-chip-select-wrap">
        <select class="lead-chip-select ${statusCfg.className}" 
          id="select-cust-status-${c.id}"
          onchange="updateCustomerStatusDirectly('${c.id}', this.value)"
          title="${statusCfg.desc}">
          ${statusOptions}
        </select>
      </div>
    `;

    // Giá Trị Đơn Hàng
    const valFormatted = c.orderValue ? new Intl.NumberFormat('vi-VN').format(c.orderValue) + ' đ' : '0 đ';
    const valHtml = `<div style="font-weight: 700; color: var(--text-main); font-size: 0.82rem;">${valFormatted}</div>`;

    // Ngày Cập Nhật
    const dateHtml = `<div style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(c.updatedAt || '')}</div>`;

    // Ghi Chú Xử Lý (Khai Thác Sale)
    const notesHtml = `
      <div style="font-size: 0.78rem; color: var(--text-main); max-height: 50px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;" title="${escapeHtml(c.notes || '')}">
        ${escapeHtml(c.notes || 'Chưa có ghi chú xử lý')}
      </div>
    `;

    // Thao Tác
    const fbBtn = c.postUrl ? `
      <a href="${escapeHtml(c.postUrl)}" target="_blank" class="btn btn-sm btn-outline" style="font-size: 0.74rem; padding: 4px 7px; color: #1877f2; border-color: #1877f2;" title="Mở bài viết Facebook gốc">
        <i class="fa-brands fa-facebook"></i>
      </a>
    ` : '';

    const actionsHtml = `
      <div style="display: flex; gap: 5px; justify-content: center; align-items: center;">
        <button class="btn btn-sm" onclick="openConsultCustomerModal('${c.id}')" style="background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: #fff; font-size: 0.74rem; padding: 4px 8px; font-weight: 600;" title="Mở kịch bản tư vấn Zalo">
          <i class="fa-solid fa-wand-magic-sparkles"></i> Tư Vấn
        </button>
        ${fbBtn}
        <button class="btn btn-sm btn-outline" onclick="openEditCustomerModal('${c.id}')" style="font-size: 0.74rem; padding: 4px 7px;" title="Chỉnh sửa thông tin">
          <i class="fa-solid fa-pen"></i>
        </button>
        <button class="btn btn-sm btn-outline text-danger" onclick="deleteCustomerRecord('${c.id}')" style="font-size: 0.74rem; padding: 4px 7px; border-color: var(--danger);" title="Xóa khách hàng">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </div>
    `;

    // Sức Khỏe Khách Hàng (Customer Health - Mục 18)
    let healthBadge = '<span class="badge" style="background: #f0fdf4; color: #16a34a; font-weight: 700;">🟢 Khỏe Mạnh</span>';
    if (c.status === 'COMPLAINT' || c.status === 'LOST') {
      healthBadge = '<span class="badge" style="background: #fef2f2; color: #dc2626; font-weight: 700;">🔴 Nguy Cơ</span>';
    } else if (c.status === 'CALLBACK' || c.status === 'CONSULTING' || c.status === 'SUPPORT') {
      healthBadge = '<span class="badge" style="background: #fffbeb; color: #d97706; font-weight: 700;">🟡 Cần Chú Ý</span>';
    }
    const healthHtml = `<div style="text-align: center;">${healthBadge}</div>`;

    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td>${nameHtml}</td>
      <td>${phoneHtml}</td>
      <td>${channelHtml}</td>
      <td>${statusDropdownHtml}</td>
      <td>${healthHtml}</td>
      <td>${valHtml}</td>
      <td>${dateHtml}</td>
      <td>${notesHtml}</td>
      <td class="text-center">${actionsHtml}</td>
    `;
    tbody.appendChild(tr);
  });
}

// Đồng bộ khách hàng thực tế từ Facebook Group Scraper
async function syncCustomersFromScraper(btnEl) {
  const btn = btnEl || document.getElementById('btn-sync-cust-scraper');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đồng bộ...';
    btn.disabled = true;
  }

  try {
    const res = await fetch('/api/customers/sync-scraper', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Đồng Bộ Thành Công', result.message, 'success');
      await loadCustomersData();
    } else {
      showToast('Lỗi Đồng Bộ', result.message || 'Không thể đồng bộ', 'danger');
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  } finally {
    if (btn) {
      btn.innerHTML = originalHtml || '<i class="fa-solid fa-cloud-arrow-down"></i> Đồng Bộ Từ Group Scraper';
      btn.disabled = false;
    }
  }
}

// Cập nhật trạng thái trực tiếp từ chip dropdown
async function updateCustomerStatusDirectly(id, newStatus) {
  const cfg = LEAD_STATUS_CONFIG[newStatus] || LEAD_STATUS_CONFIG.NEW;
  try {
    const res = await fetch(`/api/customers/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, statusLabel: cfg.name })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Cập Nhật', `Đã đổi trạng thái khách sang "${cfg.name}"`, 'success');
      const sel = document.getElementById(`select-cust-status-${id}`);
      if (sel) {
        sel.className = `lead-chip-select ${cfg.className}`;
        sel.title = cfg.desc;
      }
      loadCustomersData();
    }
  } catch (err) {
    showToast('Lỗi Cập Nhật', err.message, 'danger');
  }
}

function openAddCustomerModal() {
  document.getElementById('customer-modal-title').textContent = 'Thêm Khách Hàng Mới';
  document.getElementById('cust-modal-id').value = '';
  document.getElementById('cust-modal-name').value = '';
  document.getElementById('cust-modal-phone').value = '';
  document.getElementById('cust-modal-channel').value = 'Facebook Group';
  document.getElementById('cust-modal-status').value = 'NEW';
  document.getElementById('cust-modal-value').value = '0';
  document.getElementById('cust-modal-notes').value = '';
  document.getElementById('customer-modal').classList.add('active');
}

function openEditCustomerModal(id) {
  const cust = (customersList || []).find(c => c.id === id);
  if (!cust) return;

  document.getElementById('customer-modal-title').textContent = 'Chỉnh Sửa Thông Tin Khách Hàng';
  document.getElementById('cust-modal-id').value = cust.id;
  document.getElementById('cust-modal-name').value = cust.name || '';
  document.getElementById('cust-modal-phone').value = cust.phone || '';
  document.getElementById('cust-modal-channel').value = cust.channel || 'Facebook Group';
  document.getElementById('cust-modal-status').value = cust.status || 'NEW';
  document.getElementById('cust-modal-value').value = cust.orderValue || 0;
  document.getElementById('cust-modal-notes').value = cust.notes || '';
  document.getElementById('customer-modal').classList.add('active');
}

function closeCustomerModal() {
  document.getElementById('customer-modal').classList.remove('active');
}

async function saveCustomerFromModal() {
  const id = document.getElementById('cust-modal-id').value;
  const name = document.getElementById('cust-modal-name').value.trim();
  const phone = document.getElementById('cust-modal-phone').value.trim();
  const channel = document.getElementById('cust-modal-channel').value;
  const status = document.getElementById('cust-modal-status').value;
  const orderValue = parseFloat(document.getElementById('cust-modal-value').value) || 0;
  const notes = document.getElementById('cust-modal-notes').value.trim();

  if (!name) {
    showToast('Thiếu Thông Tin', 'Vui lòng nhập tên khách hàng hoặc tên cơ sở!', 'warning');
    return;
  }

  const statusCfg = LEAD_STATUS_CONFIG[status] || LEAD_STATUS_CONFIG.NEW;

  try {
    let res;
    if (id) {
      res = await fetch(`/api/customers/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, channel, status, statusLabel: statusCfg.name, orderValue, notes })
      });
    } else {
      res = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, channel, status, statusLabel: statusCfg.name, orderValue, notes })
      });
    }
    const result = await res.json();
    if (result.success) {
      showToast('Lưu Thành Công', result.message, 'success');
      closeCustomerModal();
      loadCustomersData(true);
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi Lưu', err.message, 'danger');
  }
}

async function deleteCustomerRecord(id) {
  if (!confirm('Bạn có chắc chắn muốn xóa khách hàng này khỏi hệ thống CRM không?')) return;

  try {
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Xóa', 'Đã xóa khách hàng khỏi CRM!', 'success');
      loadCustomersData(true);
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi Xóa', err.message, 'danger');
  }
}

// ============================================================================
// MODAL TẠO ĐƠN HÀNG DỊCH VỤ TUYỂN DỤNG & GHI NHẬN DOANH THU
// ============================================================================

let cachedCommerceServices = [];

async function loadCommerceServices() {
  if (cachedCommerceServices && cachedCommerceServices.length > 0) return cachedCommerceServices;
  try {
    const res = await fetch('/api/commerce/services');
    const result = await res.json();
    if (result.success && result.data) {
      cachedCommerceServices = result.data;
    }
  } catch (err) {
    console.error('Lỗi tải danh mục dịch vụ:', err);
  }
  return cachedCommerceServices || [];
}

async function openCreateOrderModal(customerId = null) {
  const services = await loadCommerceServices();
  const selectSrv = document.getElementById('order-modal-service');
  if (selectSrv) {
    selectSrv.innerHTML = services.map(s => `
      <option value="${s.id}" data-price="${s.price}">
        ${s.name} - ${new Intl.NumberFormat('vi-VN').format(s.price)} đ (${s.durationDays} ngày)
      </option>
    `).join('');
  }

  // Nếu mở từ một khách hàng cụ thể
  if (customerId) {
    const cust = (customersList || []).find(c => c.id === customerId);
    if (cust) {
      document.getElementById('order-modal-customer-id').value = cust.id;
      document.getElementById('order-modal-customer-name').value = cust.name || '';
      document.getElementById('order-modal-phone').value = cust.phone || '';
      document.getElementById('order-modal-source-group').value = cust.groupName || cust.channel || 'Facebook Group';
    }
  } else {
    document.getElementById('order-modal-customer-id').value = '';
    document.getElementById('order-modal-customer-name').value = '';
    document.getElementById('order-modal-phone').value = '';
    document.getElementById('order-modal-source-group').value = 'Facebook Group';
  }

  // Khởi tạo giá dịch vụ đầu tiên
  if (services.length > 0) {
    onOrderServiceChange(services[0].id);
  }

  document.getElementById('order-modal').classList.add('active');
}

function openCreateOrderModalForLead(leadId, companyName, phone, sourceGroup) {
  openCreateOrderModal().then(() => {
    const idEl = document.getElementById('order-modal-customer-id');
    const nameEl = document.getElementById('order-modal-customer-name');
    const phoneEl = document.getElementById('order-modal-phone');
    const grpEl = document.getElementById('order-modal-source-group');
    if (idEl) idEl.value = leadId || '';
    if (nameEl) nameEl.value = companyName || '';
    if (phoneEl) phoneEl.value = phone || '';
    if (grpEl) grpEl.value = sourceGroup || 'Facebook Group';
  });
}

function closeOrderModal() {
  const modal = document.getElementById('order-modal');
  if (modal) modal.classList.remove('active');
}

function onOrderServiceChange(serviceId) {
  const srv = (cachedCommerceServices || []).find(s => s.id === serviceId);
  const amountInput = document.getElementById('order-modal-amount');
  if (srv && amountInput) {
    amountInput.value = srv.price;
  }
  calculateOrderTotal();
}

function calculateOrderTotal() {
  const amount = parseFloat(document.getElementById('order-modal-amount').value) || 0;
  const discount = parseFloat(document.getElementById('order-modal-discount').value) || 0;
  const finalVal = Math.max(0, amount - discount);
  const displayEl = document.getElementById('order-modal-final-display');
  if (displayEl) {
    displayEl.textContent = new Intl.NumberFormat('vi-VN').format(finalVal) + ' đ';
  }
}

async function submitCreateOrder() {
  const customerId = document.getElementById('order-modal-customer-id').value;
  const customerName = document.getElementById('order-modal-customer-name').value.trim();
  const phone = document.getElementById('order-modal-phone').value.trim();
  const sourceGroup = document.getElementById('order-modal-source-group').value.trim();
  const serviceId = document.getElementById('order-modal-service').value;
  const amount = parseFloat(document.getElementById('order-modal-amount').value) || 0;
  const discount = parseFloat(document.getElementById('order-modal-discount').value) || 0;
  const salesStaff = document.getElementById('order-modal-sales').value.trim() || 'Quản trị viên';
  const notes = document.getElementById('order-modal-notes').value.trim();

  if (!customerName) {
    showToast('Thiếu Thông Tin', 'Vui lòng nhập tên doanh nghiệp hoặc khách hàng!', 'warning');
    return;
  }
  if (!serviceId) {
    showToast('Thiếu Thông Tin', 'Vui lòng chọn gói dịch vụ!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/commerce/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerId,
        customerName,
        phone,
        sourceGroup,
        serviceId,
        amount,
        discount,
        salesStaff,
        notes
      })
    });

    const result = await res.json();
    if (result.success) {
      showToast('Thành Công', result.message || 'Đã tạo đơn hàng thành công!', 'success');
      closeOrderModal();
      // Làm mới bảng khách hàng nếu đang mở
      if (typeof loadCustomersData === 'function') {
        loadCustomersData(true);
      }
      // Nếu đang mở Funnel thì làm mới
      if (typeof loadFunnelAndGroupRoi === 'function' && typeof leadCrmState !== 'undefined' && leadCrmState.viewMode === 'funnel') {
        loadFunnelAndGroupRoi();
      }
    } else {
      showToast('Lỗi Tạo Đơn', result.message || 'Không thể tạo đơn hàng', 'danger');
    }
  } catch (err) {
    showToast('Lỗi Kết Nối', err.message, 'danger');
  }
}

function openConsultCustomerModal(id) {
  const cust = (customersList || []).find(c => c.id === id);
  if (!cust) return;

  const fakeJob = {
    id: cust.id,
    employerName: cust.name,
    employer: cust.name,
    title: cust.notes && cust.notes.includes('Tuyển') ? (cust.notes.match(/Tuyển\s+([^(\n,]+)/) || [])[1] || 'nhân sự' : 'nhân sự',
    contactPhone: cust.phone,
    zaloLink: cust.phone ? `https://zalo.me/${cust.phone}` : '',
    location: cust.channel,
    originalText: cust.notes,
    groupName: cust.groupName || cust.channel,
    postUrl: cust.postUrl || ''
  };

  openScrapedJobDetailModal(cust.id, fakeJob);
}

function exportCustomersToCsv() {
  if (!customersList || customersList.length === 0) {
    showToast('Chưa Có Dữ Liệu', 'Không có dữ liệu khách hàng để xuất!', 'warning');
    return;
  }

  let csvContent = '\uFEFFSTT,Tên Khách Hàng,Số Điện Thoại,Kênh Liên Hệ,Nhãn Trạng Thái,Giá Trị Đơn (VNĐ),Ngày Cập Nhật,Ghi Chú Xử Lý\n';
  customersList.forEach((c, i) => {
    const row = [
      i + 1,
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.phone || ''}"`,
      `"${c.channel || ''}"`,
      `"${c.statusLabel || c.status || ''}"`,
      c.orderValue || 0,
      `"${c.updatedAt || ''}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`
    ];
    csvContent += row.join(',') + '\n';
  });

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.setAttribute('download', `Mau_Quan_Ly_Khach_Hang_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast('Xuất Thành Công', 'Đã tải xuống file CSV Bảng Quản Lý Khách Hàng!', 'success');
}

// Sinh kịch bản tư vấn bán dịch vụ đăng tuyển cá nhân hoá (Sales Pitch Generator)
function generateSalesPitch(job, metrics = {}) {
  const emp = job.employerName || 'Anh/Chị Quản Lý';
  const role = job.title || 'nhân sự';
  const groupCount = metrics.groupCount || 1;
  const isUrgent = metrics.isUrgent;

  let pitch = `Dạ em chào ${emp}! Em thấy bên mình đang đăng bài tuyển dụng vị trí "${role}" ${groupCount > 1 ? `trên khoảng ${groupCount} hội nhóm Facebook` : 'trên nhóm'}`;

  if (isUrgent || groupCount >= 3) {
    pitch += ` và quán mình đang cần người đi làm gấp đúng không ạ?\n\nVì tự đăng tay trên nhóm rất hay bị trôi bài và tốn thời gian lọc ứng viên, bên em đang có gói Dịch Vụ Đăng Bài Tuyển Dụng Phủ Sóng 30-50 Hội Nhóm FB & 34 Fanpage khu vực tương tác cao, cam kết bài nổi bật giúp quán chốt đủ ${role} chỉ trong 24h - 48h tới.\n\nEm gửi anh/chị xem thử một số bài đăng mẫu bên em đang chạy hiệu quả cho các quán cùng khu vực nhé ạ!`;
  } else {
    pitch += `.\n\nBên em có hệ thống đăng tuyển phủ sóng hàng loạt group việc làm lớn và 34 Fanpage tuyển dụng vệ tinh, giúp bài đăng của mình tiếp cận ngay hàng nghìn ứng viên chất lượng mỗi ngày mà không lo bị trôi hay Facebook khóa tính năng đăng nhóm.\n\nAnh/chị có tiện để em tư vấn nhanh gói đăng bài tuyển cấp tốc tiết kiệm chi phí không ạ?`;
  }
  return pitch;
}

// Mở Modal xem chi tiết bài cào, đo lường tần suất & kịch bản tư vấn
function openScrapedJobDetailModal(jobId, overrideJob = null) {
  const job = overrideJob || (state.scrapedJobs || []).find(j => String(j.id) === String(jobId));
  if (!job) return;

  state.activeLeadJob = job;
  const metrics = job._metrics || { leadKey: getLeadIdentityKey(job), groupCount: 1, isUrgent: false, suggestedStatus: 'NEW' };
  const currentStatus = getStoredLeadStatus(metrics.leadKey, metrics.suggestedStatus);
  const statusCfg = LEAD_STATUS_CONFIG[currentStatus] || LEAD_STATUS_CONFIG.NEW;

  // 1. Huy hiệu trạng thái
  document.getElementById('modal-scraped-tier-badge').innerHTML = `
    <span class="badge-pill ${statusCfg.className}" style="font-weight: 700; font-size: 0.85rem; padding: 4px 10px; border-radius: 6px;">
      ${statusCfg.label}
    </span>
  `;
  document.getElementById('modal-scraped-group-info').innerHTML = `<i class="fa-solid fa-users-rectangle text-primary"></i> ${escapeHtml(job.groupName || 'Group Facebook')}`;

  // 2. Thẻ Đo lường tần suất & Nhu cầu (Lead Intelligence)
  const intelEl = document.getElementById('modal-scraped-intelligence');
  const intelContent = document.getElementById('modal-scraped-intel-content');
  if (intelEl && intelContent) {
    intelEl.style.display = 'block';
    let intelHtml = `Khách hàng đã đăng bài trên <strong>${metrics.groupCount} nhóm</strong> việc làm khác nhau. `;
    if (metrics.groupCount >= 4) {
      intelHtml += `Tần suất đăng dồn dập cho thấy quán <strong>đang thiếu người trầm trọng</strong>, tỷ lệ chốt gói dịch vụ tuyển dụng phủ sóng cực cao!`;
    } else if (metrics.isUrgent) {
      intelHtml += `Nội dung chứa từ khóa <strong>Tuyển gấp / Đi làm ngay</strong>. Hãy đánh mạnh vào giải pháp cung ứng nhân sự cấp tốc trong 24h.`;
    } else {
      intelHtml += `Khách có nhu cầu tuyển thực tế, thông tin công việc rõ ràng. Thích hợp tư vấn gói phủ sóng mở rộng.`;
    }
    intelContent.innerHTML = intelHtml;
  }

  // 3. Dropdown đổi trạng thái trong modal
  const modalStatusSelect = document.getElementById('modal-scraped-status-select');
  if (modalStatusSelect) {
    let options = '';
    Object.values(LEAD_STATUS_CONFIG).forEach(cfg => {
      options += `<option value="${cfg.code}" ${cfg.code === currentStatus ? 'selected' : ''}>${cfg.name}</option>`;
    });
    modalStatusSelect.innerHTML = options;
    modalStatusSelect.className = `lead-chip-select ${statusCfg.className}`;
  }

  // 4. Kịch bản tư vấn bán hàng
  const pitchTextEl = document.getElementById('modal-scraped-pitch-text');
  if (pitchTextEl) {
    pitchTextEl.textContent = generateSalesPitch(job, metrics);
  }

  // 5. Sổ nhật ký chăm sóc khách hàng
  const noteTextarea = document.getElementById('modal-scraped-note');
  if (noteTextarea) {
    noteTextarea.value = getStoredLeadNote(metrics.leadKey);
  }
  const noteSavedMsg = document.getElementById('modal-lead-note-saved');
  if (noteSavedMsg) noteSavedMsg.style.display = 'none';

  // 6. Các trường thông tin cơ bản
  document.getElementById('modal-scraped-employer').textContent = job.employerName || job.employer || 'Chưa rõ doanh nghiệp';
  document.getElementById('modal-scraped-poster').textContent = job.posterName || job.authorName ? `Đăng bởi: ${job.posterName || job.authorName}` : '';
  document.getElementById('modal-scraped-salary').textContent = job.salary || 'Thỏa thuận';
  document.getElementById('modal-scraped-time').textContent = job.workingTime ? `Thời gian: ${job.workingTime}` : '';
  document.getElementById('modal-scraped-location').textContent = job.location || 'Chưa rõ địa chỉ cụ thể';
  document.getElementById('modal-scraped-fulltext').textContent = job.originalText || job.postText || job.content || '';

  // 7. Các nút liên kết
  const postUrl = getEffectivePostUrl(job);
  const fbBtn = document.getElementById('modal-scraped-fblink');
  if (fbBtn) {
    fbBtn.href = postUrl;
    fbBtn.style.display = postUrl && postUrl !== '#' ? 'inline-flex' : 'none';
  }

  const zaloBtn = document.getElementById('modal-scraped-zalolink');
  if (zaloBtn) {
    if (job.zaloLink) {
      zaloBtn.href = job.zaloLink;
      zaloBtn.style.display = 'inline-flex';
    } else {
      zaloBtn.style.display = 'none';
    }
  }

  const callBtn = document.getElementById('modal-scraped-callbtn');
  if (callBtn) {
    if (job.contactPhone) {
      callBtn.href = `tel:${job.contactPhone}`;
      callBtn.style.display = 'inline-flex';
    } else {
      callBtn.style.display = 'none';
    }
  }

  document.getElementById('scraped-job-detail-modal').classList.add('active');
}

function closeScrapedJobDetailModal() {
  const modal = document.getElementById('scraped-job-detail-modal');
  if (modal) modal.classList.remove('active');
  state.activeLeadJob = null;
}

function onModalStatusChanged(newStatus) {
  if (!state.activeLeadJob) return;
  const metrics = state.activeLeadJob._metrics || { leadKey: getLeadIdentityKey(state.activeLeadJob) };
  changeLeadStatusDirectly(state.activeLeadJob.id, metrics.leadKey, newStatus);

  const cfg = LEAD_STATUS_CONFIG[newStatus] || LEAD_STATUS_CONFIG.NEW;
  const modalStatusSelect = document.getElementById('modal-scraped-status-select');
  if (modalStatusSelect) {
    modalStatusSelect.className = `lead-chip-select ${cfg.className}`;
  }
  const badgeEl = document.getElementById('modal-scraped-tier-badge');
  if (badgeEl) {
    badgeEl.innerHTML = `
      <span class="badge-pill ${cfg.className}" style="font-weight: 700; font-size: 0.85rem; padding: 4px 10px; border-radius: 6px;">
        ${cfg.label}
      </span>
    `;
  }
}

let _leadNoteTimeout = null;
function onModalNoteChanged(newNote) {
  if (!state.activeLeadJob) return;
  const metrics = state.activeLeadJob._metrics || { leadKey: getLeadIdentityKey(state.activeLeadJob) };
  
  clearTimeout(_leadNoteTimeout);
  _leadNoteTimeout = setTimeout(() => {
    setStoredLeadNote(metrics.leadKey, newNote);
    const noteSavedMsg = document.getElementById('modal-lead-note-saved');
    if (noteSavedMsg) {
      noteSavedMsg.style.display = 'inline-block';
      setTimeout(() => { noteSavedMsg.style.display = 'none'; }, 2000);
    }
  }, 400);
}

function copySalesPitchFromModal() {
  const el = document.getElementById('modal-scraped-pitch-text');
  if (el && el.textContent) {
    navigator.clipboard.writeText(el.textContent);
    showToast('Đã Sao Chép Kịch Bản', 'Đã copy kịch bản tư vấn mẫu vào clipboard. Hãy dán vào Zalo/Messenger của khách!', 'success');
  }
}

function copyScrapedOriginalText() {
  const pre = document.getElementById('modal-scraped-fulltext');
  if (pre && pre.textContent) {
    navigator.clipboard.writeText(pre.textContent);
    showToast('Đã sao chép', 'Đã copy toàn bộ nội dung bài gốc vào clipboard!', 'info');
  }
}

// Xuất bản bài cào lên Hệ thống 34 Fanpage
function publishLeadToFanpages(jobId) {
  const job = (state.scrapedJobs || []).find(j => String(j.id) === String(jobId));
  if (!job) return;

  const content = `📢 [TUYỂN DỤNG] ${job.title.toUpperCase()}\n🏢 Đơn vị: ${job.employerName || job.employer || 'Doanh Nghiệp / Quán'}\n📍 Địa điểm: ${job.location || 'Toàn quốc'}\n💰 Thu nhập: ${job.salary || 'Thỏa thuận'}\n⏰ Thời gian: ${job.workingTime || 'Theo ca / Thỏa thuận'}\n\n📝 Chi tiết công việc:\n${job.postText || job.content || job.originalText || ''}\n\n☎️ LIÊN HỆ ỨNG TUYỂN:\n- Hotline / Zalo: ${job.contactPhone || 'Xem tại bài viết'}\n- Ứng viên vui lòng bình luận hoặc nhắn tin trực tiếp Fanpage để được hỗ trợ ứng tuyển ngay!\n#tuyendung #vieclam #tuyendungnhanh`;

  navigator.clipboard.writeText(content).catch(() => {});

  appendTerminalLog(`[FANPAGE-PIPELINE] Đã chuyển đổi tin cào #${job.id} (${job.employerName || job.title}) sang bản tin xuất bản 34 Fanpage.`, 'success');

  showToast(
    'Đã Chọn Xuất Bản 34 Fanpage',
    `Đã chuẩn bị nội dung chuẩn SEO cho bài "${job.title}" và lưu vào bộ nhớ tạm. Bạn có thể sang mục Quản Lý Trang để xuất bản ngay!`,
    'success'
  );
}

function publishLeadToFanpagesCurrentModal() {
  if (state.activeLeadJob) {
    publishLeadToFanpages(state.activeLeadJob.id);
  }
}

// Đồng bộ hội nhóm từ Scraper Tool sang Auto-Poster
async function syncGroupsFromScraperTool() {
  if (!confirm('Bạn có muốn đồng bộ toàn bộ hội nhóm cào được từ Scraper Tool (Port 5050) vào danh sách nhóm của Auto-Poster không?')) return;
  try {
    const res = await fetch('/api/scraped/sync-groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const json = await res.json();
    if (json.success) {
      showToast('Đồng bộ thành công', `Đã thêm ${json.data.addedCount} nhóm mới. Tổng cộng: ${json.data.totalGroups} nhóm.`, 'success', 5000);
      appendTerminalLog(`[SCRAPER SYNC] Đã đồng bộ ${json.data.addedCount} nhóm mới từ Scraper Tool. Tổng nhóm: ${json.data.totalGroups}.`, 'success');
      await loadGroups(state.currentAccountId);
    } else {
      showToast('Lỗi đồng bộ', json.message || 'Không thể đồng bộ', 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

// =========================================================
// 4. KHO ẢNH TUYỂN DỤNG
// =========================================================
async function loadImages() {
  const grid = document.getElementById('images-gallery-grid');
  grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải kho ảnh...</div>';

  try {
    const res = await fetch('/api/images');
    const result = await res.json();

    if (result.success) {
      state.images = result.data || [];
      renderImagesGallery();
      renderSelectedImagesStrip();
    }
  } catch (err) {
    grid.innerHTML = `<div style="grid-column: 1/-1; color: var(--danger); text-align: center;">Lỗi tải ảnh: ${err.message}</div>`;
  }
}

function renderImagesGallery() {
  const grid = document.getElementById('images-gallery-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!state.images || state.images.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">
        <i class="fa-regular fa-image" style="font-size: 3rem; margin-bottom: 12px; display: block;"></i>
        <p>Kho ảnh đang trống. Hãy tải lên ảnh banner/poster tuyển dụng để đính kèm khi đăng nhóm.</p>
      </div>
    `;
    return;
  }

  state.images.forEach(img => {
    const isSelected = state.selectedImageFilenames.has(img.filename);
    const card = document.createElement('div');
    card.className = `image-card ${isSelected ? 'selected' : ''}`;
    card.style.cursor = 'pointer';
    card.onclick = () => toggleSelectImage(img.filename);

    const sizeKb = Math.round((img.sizeBytes || 0) / 1024);

    card.innerHTML = `
      <img src="${img.url}" class="image-card-thumb" alt="${escapeHtml(img.filename)}" loading="lazy">
      <div class="image-card-info">
        <div>
          <div class="image-card-title" title="${escapeHtml(img.filename)}">${escapeHtml(img.filename)}</div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
            <span style="font-size: 0.75rem; color: var(--text-dim);">${sizeKb} KB</span>
            ${isSelected ? '<span class="badge badge-success" style="font-size: 0.7rem; padding: 2px 6px;"><i class="fa-solid fa-check"></i> Đang chọn</span>' : ''}
          </div>
        </div>
        <div class="image-card-actions">
          <button class="btn btn-sm ${isSelected ? 'btn-success' : 'btn-outline'}" onclick="event.stopPropagation(); toggleSelectImage('${escapeHtml(img.filename)}')" title="${isSelected ? 'Bỏ chọn ảnh này' : 'Chọn ảnh đính kèm bài đăng'}">
            <i class="fa-solid fa-${isSelected ? 'check' : 'plus'}"></i> ${isSelected ? 'Đã Chọn' : 'Đính Kèm'}
          </button>
          <div style="display: flex; gap: 4px;">
            <a href="${img.url}" target="_blank" onclick="event.stopPropagation()" class="btn btn-sm btn-outline" title="Xem ảnh gốc">
              <i class="fa-solid fa-up-right-from-square"></i>
            </a>
            <button class="btn btn-sm btn-outline text-danger" onclick="event.stopPropagation(); deleteImage('${escapeHtml(img.filename)}')" title="Xóa ảnh khỏi kho">
              <i class="fa-solid fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  updateImageSelectionBanner();
}

function updateImageSelectionBanner() {
  const count = state.selectedImageFilenames.size;
  const bannerText = document.getElementById('images-selection-status-text');
  if (bannerText) {
    bannerText.textContent = `Đang chọn ${count} ảnh để đính kèm vào bài đăng`;
  }
  const pickerCount = document.getElementById('picker-selected-count');
  if (pickerCount) {
    pickerCount.textContent = `Đã chọn ${count} ảnh`;
  }
}

function toggleSelectImage(filename) {
  if (state.selectedImageFilenames.has(filename)) {
    state.selectedImageFilenames.delete(filename);
  } else {
    state.selectedImageFilenames.add(filename);
  }
  renderImagesGallery();
  renderSelectedImagesStrip();
  renderPickerGallery();
  updateImageSelectionBanner();
}

function clearSelectedImages() {
  state.selectedImageFilenames.clear();
  renderSelectedImagesStrip();
  renderPickerGallery();
  updateImageSelectionBanner();
}

function renderSelectedImagesStrip() {
  const strip = document.getElementById('selected-images-strip');
  const clearBtn = document.getElementById('btn-clear-images');
  if (!strip) return;
  strip.innerHTML = '';

  if (state.selectedImageFilenames.size === 0) {
    strip.innerHTML = `<span style="font-size: 0.82rem; color: var(--text-dim); display: flex; align-items: center; gap: 6px;"><i class="fa-solid fa-circle-info text-primary"></i> <em>Chưa gắn ảnh đính kèm (Hệ thống không tự ý gắn ảnh vị trí khác. Bạn có thể bấm <strong>"Mở Kho Ảnh"</strong> để chọn hoặc <strong>"Tải Thêm Ảnh Mới"</strong> nếu cần).</em></span>`;
    if (clearBtn) clearBtn.style.display = 'none';
    return;
  }

  if (clearBtn) clearBtn.style.display = 'inline-flex';

  state.selectedImageFilenames.forEach(fn => {
    const imgObj = state.images.find(i => i.filename === fn);
    if (!imgObj) return;

    const thumb = document.createElement('div');
    thumb.className = 'thumb-wrap';
    thumb.innerHTML = `
      <img src="${imgObj.url}" alt="${escapeHtml(fn)}" class="thumb-img">
      <button class="thumb-remove" onclick="toggleSelectImage('${fn}')" title="Bỏ chọn ảnh"><i class="fa-solid fa-xmark"></i></button>
    `;
    strip.appendChild(thumb);
  });
}

function openImagePickerModal() {
  renderPickerGallery();
  updateImageSelectionBanner();
  document.getElementById('image-picker-modal').classList.add('active');
}

function closeImagePickerModal() {
  document.getElementById('image-picker-modal').classList.remove('active');
  renderSelectedImagesStrip();
}

function renderPickerGallery() {
  const grid = document.getElementById('picker-gallery-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (state.images.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-dim);">
        <i class="fa-regular fa-image" style="font-size: 2.5rem; margin-bottom: 8px; display: block;"></i>
        <p>Kho ảnh đang trống. Hãy bấm "Tải Thêm Ảnh Mới" để nạp ảnh từ máy tính.</p>
      </div>
    `;
    return;
  }

  state.images.forEach(img => {
    const isSelected = state.selectedImageFilenames.has(img.filename);
    const card = document.createElement('div');
    card.className = `image-card ${isSelected ? 'selected' : ''}`;
    card.style.cursor = 'pointer';
    card.onclick = () => toggleSelectImage(img.filename);

    const sizeKb = Math.round(img.sizeBytes / 1024);
    card.innerHTML = `
      <img src="${img.url}" alt="${escapeHtml(img.filename)}" loading="lazy">
      <div class="image-overlay">
        <span class="image-name" title="${escapeHtml(img.filename)}">${escapeHtml(img.filename)} (${sizeKb} KB)</span>
        ${isSelected ? '<span class="badge-pill success" style="font-size: 0.72rem;"><i class="fa-solid fa-check"></i> Đã chọn</span>' : ''}
      </div>
    `;
    grid.appendChild(card);
  });
}

function initImageDropzone() {
  const dropzone = document.getElementById('image-dropzone');
  if (!dropzone) return;

  ['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    }, false);
  });

  ['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
    }, false);
  });

  dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files && files.length > 0) {
      uploadImageFiles(files);
    }
  });
}

function handleImageFileInput(event) {
  const files = event.target.files;
  if (files && files.length > 0) {
    uploadImageFiles(files);
  }
}

async function uploadImageFiles(files) {
  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('images', files[i]);
  }

  appendTerminalLog(`[ẢNH] Đang tải lên ${files.length} hình ảnh...`);

  try {
    const res = await fetch('/api/images/upload', {
      method: 'POST',
      body: formData
    });
    const result = await res.json();

    if (result.success) {
      appendTerminalLog(`[ẢNH THÀNH CÔNG] Đã tải lên ${result.data.length} hình ảnh.`, 'success');
      result.data.forEach(img => state.selectedImageFilenames.add(img.filename));
      loadImages();
    } else {
      appendTerminalLog(`[ẢNH LỖI] ${result.message}`, 'error');
      alert(`Lỗi tải ảnh: ${result.message}`);
    }
  } catch (err) {
    appendTerminalLog(`[ẢNH LỖI] ${err.message}`, 'error');
    alert(`Lỗi: ${err.message}`);
  }
}

async function deleteImage(filename) {
  if (!confirm(`Bạn có chắc muốn xóa file ảnh: ${filename}?`)) return;

  try {
    const res = await fetch(`/api/images/${encodeURIComponent(filename)}`, { method: 'DELETE' });
    const result = await res.json();

    if (result.success) {
      state.selectedImageFilenames.delete(filename);
      loadImages();
      appendTerminalLog(`[ẢNH] Đã xóa ảnh: ${filename}`);
    }
  } catch (err) {
    alert(`Lỗi xóa ảnh: ${err.message}`);
  }
}

// =========================================================
// 5. QUẢN LÝ HỘI NHÓM (GROUPS)
// =========================================================
async function loadGroups(customAccountId = null, isAutoRetry = false) {
  const grid = document.getElementById('groups-grid');
  const tbody = document.getElementById('groups-table-body');
  if (tbody && (!state.groups || state.groups.length === 0)) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center py-4" style="color: var(--text-dim);"><i class="fa-solid fa-spinner fa-spin"></i> Đang nạp danh sách Hội Nhóm Facebook...</td></tr>';
  }
  if (grid && (!state.groups || state.groups.length === 0)) {
    grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 20px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang nạp danh sách Hội Nhóm...</div>';
  }

  try {
    const accId = customAccountId || state.currentAccountId || '';
    const res = await smartFetch(`/api/groups${accId ? `?accountId=${encodeURIComponent(accId)}` : ''}`);
    const result = await res.json();

    if (result.success) {
      state.groups = result.data || [];
      state.groupStats = result.stats || computeGroupStats(state.groups);
      updateGroupStatsUI();
      renderProvinceChips();
      updateGroupAccountSelectorUI();
      applyGroupFilters();
      renderGroupCheckboxList();
      if (state.currentTab === 'dashboard-tab') renderDashboard();
    } else {
      throw new Error(result.message || 'Không thể tải danh sách Hội Nhóm');
    }
  } catch (err) {
    console.warn('Cảnh báo nạp Hội Nhóm:', err);
    const errorHtml = `
      <div style="padding: 20px; text-align: center; background: rgba(239, 68, 68, 0.05); border: 1px dashed rgba(239, 68, 68, 0.3); border-radius: 8px; margin: 8px auto; max-width: 500px;">
        <div style="font-size: 1.4rem; color: var(--danger); margin-bottom: 6px;">
          <i class="fa-solid fa-triangle-exclamation"></i>
        </div>
        <div style="font-weight: 700; color: var(--danger); font-size: 0.92rem; margin-bottom: 6px;">
          Lỗi tải Hội Nhóm: ${escapeHtml(err.message || 'Không có phản hồi từ máy chủ')}
        </div>
        <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; line-height: 1.4;">
          Máy chủ đang chạy tại cổng <code>3001</code>. Hãy bấm nút dưới đây để kết nối lại.
        </p>
        <button class="btn btn-primary btn-sm" onclick="loadGroups(state.currentAccountId)" style="display: inline-flex; align-items: center; gap: 6px; margin: 0 auto;">
          <i class="fa-solid fa-rotate-right"></i> Thử Lại Ngay
        </button>
      </div>
    `;

    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center py-3">${errorHtml}</td></tr>`;
    }
    if (grid) {
      grid.innerHTML = `<div style="grid-column: 1/-1;">${errorHtml}</div>`;
    }

    // Tự động thử lại 1 lần sau 2.5 giây nếu gặp lỗi Failed to fetch
    if (!isAutoRetry) {
      setTimeout(() => {
        if (!state.groups || state.groups.length === 0) {
          console.log('Tự động thử lại nạp Hội Nhóm...');
          loadGroups(customAccountId, true);
        }
      }, 2500);
    }
  }
}

function computeGroupStats(groups = []) {
  const total = groups.length;
  let daNangCount = 0;
  let hcmCount = 0;
  let otherCount = 0;
  const provinceBreakdown = {};

  groups.forEach(g => {
    const rawP = (g.province || 'Toàn quốc').trim();
    let normP = rawP;
    if (/hồ chí minh|hcm|tp hcm|sài gòn/i.test(rawP)) {
      normP = 'TP Hồ Chí Minh';
    } else if (/đà nẵng|da nang/i.test(rawP)) {
      normP = 'Đà Nẵng';
    } else if (/bình dương|binh duong/i.test(rawP)) {
      normP = 'Bình Dương';
    } else if (/quảng nam|quang nam/i.test(rawP)) {
      normP = 'Quảng Nam';
    } else if (/toàn quốc|toan quoc/i.test(rawP)) {
      normP = 'Toàn quốc';
    }

    provinceBreakdown[normP] = (provinceBreakdown[normP] || 0) + 1;

    if (normP === 'Đà Nẵng') {
      daNangCount++;
    } else if (normP === 'TP Hồ Chí Minh') {
      hcmCount++;
    } else {
      otherCount++;
    }
  });

  return { total, daNangCount, hcmCount, otherCount, provinceBreakdown };
}

function updateGroupStatsUI() {
  const stats = state.groupStats || computeGroupStats(state.groups);
  const totalEl = document.getElementById('kpi-group-total');
  const danangEl = document.getElementById('kpi-group-danang');
  const danangPct = document.getElementById('kpi-danang-percent');
  const danangSub = document.getElementById('kpi-danang-sub');
  const hcmEl = document.getElementById('kpi-group-hcm');
  const hcmPct = document.getElementById('kpi-hcm-percent');
  const hcmSub = document.getElementById('kpi-hcm-sub');
  const otherEl = document.getElementById('kpi-group-other');

  if (totalEl) totalEl.textContent = stats.total;
  if (danangEl) danangEl.textContent = stats.daNangCount;
  if (hcmEl) hcmEl.textContent = stats.hcmCount;
  if (otherEl) otherEl.textContent = stats.otherCount;

  if (danangPct && stats.total > 0) {
    const pct = Math.round((stats.daNangCount / stats.total) * 100);
    danangPct.textContent = `${pct}%`;
  }
  if (danangSub) {
    danangSub.textContent = `${stats.daNangCount} nhóm việc làm tại Đà Nẵng`;
  }

  if (hcmPct && stats.total > 0) {
    const pct = Math.round((stats.hcmCount / stats.total) * 100);
    hcmPct.textContent = `${pct}%`;
  }
  if (hcmSub) {
    hcmSub.textContent = `${stats.hcmCount} nhóm việc làm tại TP.HCM`;
  }
}

// State bộ lọc hội nhóm thông minh
if (!state.groupFilters) {
  state.groupFilters = {
    province: 'ALL',
    membership: 'ALL',
    category: 'ALL',
    sort: 'DEFAULT',
    search: ''
  };
}

function parseMemberCount(val) {
  if (!val) return 0;
  if (typeof val === 'number') return val;
  const str = String(val).trim().toUpperCase();
  if (str.endsWith('M')) {
    return (parseFloat(str.replace('M', '')) || 0) * 1000000;
  }
  if (str.endsWith('K')) {
    return (parseFloat(str.replace('K', '')) || 0) * 1000;
  }
  const clean = str.replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
}

function renderProvinceChips() {
  renderGroupFilterToolbar();
}

function renderGroupFilterToolbar() {
  const groups = state.groups || [];
  const stats = state.groupStats || computeGroupStats(groups);
  const bd = stats.provinceBreakdown || {};

  // 1. NẠP DROPDOWN TỈNH THÀNH (Tự động gộp và co giãn linh hoạt hàng trăm tỉnh thành)
  const provSelect = document.getElementById('filter-province-select');
  if (provSelect) {
    const currentProvVal = state.groupFilters?.province || state.groupProvinceFilter || 'ALL';
    const sortedProvinces = Object.keys(bd).sort((a, b) => {
      if (a === 'Đà Nẵng') return -1;
      if (b === 'Đà Nẵng') return 1;
      if (a === 'TP Hồ Chí Minh') return -1;
      if (b === 'TP Hồ Chí Minh') return 1;
      return bd[b] - bd[a];
    });

    let provOptions = `<option value="ALL">Tất Cả Tỉnh Thành (${stats.total || groups.length})</option>`;
    sortedProvinces.forEach(prov => {
      const isSelected = currentProvVal === prov ? 'selected' : '';
      provOptions += `<option value="${escapeHtml(prov)}" ${isSelected}>${escapeHtml(prov)} (${bd[prov]} nhóm)</option>`;
    });
    provSelect.innerHTML = provOptions;
  }

  // 2. NẠP DROPDOWN TRẠNG THÁI THÀNH VIÊN
  const memberSelect = document.getElementById('filter-membership-select');
  if (memberSelect) {
    const joinedCount = groups.filter(g => g.isJoined === true).length;
    const unjoinedCount = groups.filter(g => g.isJoined !== true).length;
    const curMemVal = state.groupFilters?.membership || 'ALL';

    memberSelect.innerHTML = `
      <option value="ALL" ${curMemVal === 'ALL' ? 'selected' : ''}>Tất Cả Trạng Thái (${groups.length})</option>
      <option value="JOINED" ${curMemVal === 'JOINED' ? 'selected' : ''}>Đã Tham Gia (${joinedCount})</option>
      <option value="UNJOINED" ${curMemVal === 'UNJOINED' ? 'selected' : ''}>Chưa Vào Nhóm (${unjoinedCount})</option>
    `;
  }

  // 3. NẠP DROPDOWN CHUYÊN MỤC / NGÀNH NGHỀ
  const catSelect = document.getElementById('filter-category-select');
  if (catSelect) {
    const catMap = {};
    groups.forEach(g => {
      const cat = (g.category || 'Tổng hợp').trim();
      if (cat) catMap[cat] = (catMap[cat] || 0) + 1;
    });
    const curCatVal = state.groupFilters?.category || 'ALL';

    let catOptions = `<option value="ALL" ${curCatVal === 'ALL' ? 'selected' : ''}>Tất Cả Ngành Nghề</option>`;
    Object.keys(catMap).sort((a, b) => catMap[b] - catMap[a]).forEach(cat => {
      const isSelected = curCatVal === cat ? 'selected' : '';
      catOptions += `<option value="${escapeHtml(cat)}" ${isSelected}>${escapeHtml(cat)} (${catMap[cat]})</option>`;
    });
    catSelect.innerHTML = catOptions;
  }

  // 4. RENDER PHÍM TẮT LỌC NHANH (QUICK TAGS 1-CHẠM)
  const quickTagsList = document.getElementById('group-quick-tags-list');
  if (quickTagsList) {
    const curProv = state.groupFilters?.province || 'ALL';
    const curMem = state.groupFilters?.membership || 'ALL';
    const joinedCount = groups.filter(g => g.isJoined === true).length;
    const unjoinedCount = groups.filter(g => g.isJoined !== true).length;
    const daNangCount = stats.daNangCount || 0;
    const hcmCount = stats.hcmCount || 0;

    const isAllActive = curProv === 'ALL' && curMem === 'ALL';
    const isDaNangActive = curProv === 'Đà Nẵng';
    const isHcmActive = curProv === 'TP Hồ Chí Minh';
    const isJoinedActive = curMem === 'JOINED';
    const isUnjoinedActive = curMem === 'UNJOINED';

    quickTagsList.innerHTML = `
      <button class="quick-tag-btn ${isAllActive ? 'active' : ''}" onclick="selectQuickFilter('ALL')">
        <i class="fa-solid fa-border-all"></i> Tất Cả <span class="quick-tag-count">${groups.length}</span>
      </button>
      <button class="quick-tag-btn chip-danang ${isDaNangActive ? 'active' : ''}" onclick="selectQuickFilter('PROVINCE', 'Đà Nẵng')">
        <i class="fa-solid fa-location-dot"></i> Đà Nẵng <span class="quick-tag-count">${daNangCount}</span>
      </button>
      <button class="quick-tag-btn chip-hcm ${isHcmActive ? 'active' : ''}" onclick="selectQuickFilter('PROVINCE', 'TP Hồ Chí Minh')">
        <i class="fa-solid fa-city"></i> TP.HCM <span class="quick-tag-count">${hcmCount}</span>
      </button>
      <button class="quick-tag-btn chip-joined ${isJoinedActive ? 'active' : ''}" onclick="selectQuickFilter('MEMBERSHIP', 'JOINED')">
        <i class="fa-solid fa-circle-check"></i> Đã Vào <span class="quick-tag-count">${joinedCount}</span>
      </button>
      <button class="quick-tag-btn chip-unjoined ${isUnjoinedActive ? 'active' : ''}" onclick="selectQuickFilter('MEMBERSHIP', 'UNJOINED')">
        <i class="fa-solid fa-user-plus"></i> Chưa Vào <span class="quick-tag-count">${unjoinedCount}</span>
      </button>
    `;
  }
}

function onGroupFilterChange(key, value) {
  if (!state.groupFilters) {
    state.groupFilters = { province: 'ALL', membership: 'ALL', category: 'ALL', sort: 'DEFAULT', search: '' };
  }
  state.groupFilters[key] = value;

  // Giữ tương thích với biến cũ
  if (key === 'province') {
    state.groupProvinceFilter = value;
    syncKpiCardsActive(value);
  }

  // Quản lý hiển thị nút [x] xóa tìm kiếm
  const clearBtn = document.getElementById('btn-clear-group-search');
  if (clearBtn) {
    clearBtn.style.display = (key === 'search' && value.trim()) ? 'flex' : 'none';
  }

  renderGroupFilterToolbar();
  applyGroupFilters();
}

function selectQuickFilter(type, value = null) {
  if (!state.groupFilters) {
    state.groupFilters = { province: 'ALL', membership: 'ALL', category: 'ALL', sort: 'DEFAULT', search: '' };
  }

  if (type === 'ALL') {
    state.groupFilters.province = 'ALL';
    state.groupFilters.membership = 'ALL';
    state.groupProvinceFilter = 'ALL';
  } else if (type === 'PROVINCE') {
    state.groupFilters.province = (state.groupFilters.province === value) ? 'ALL' : value;
    state.groupProvinceFilter = state.groupFilters.province;
  } else if (type === 'MEMBERSHIP') {
    state.groupFilters.membership = (state.groupFilters.membership === value) ? 'ALL' : value;
  }

  // Đồng bộ lại value trên các ô <select>
  const provSelect = document.getElementById('filter-province-select');
  if (provSelect) provSelect.value = state.groupFilters.province;

  const memSelect = document.getElementById('filter-membership-select');
  if (memSelect) memSelect.value = state.groupFilters.membership;

  syncKpiCardsActive(state.groupFilters.province);
  renderGroupFilterToolbar();
  applyGroupFilters();
}

function clearGroupSearch() {
  const input = document.getElementById('group-search');
  if (input) input.value = '';
  onGroupFilterChange('search', '');
}

function resetAllGroupFilters() {
  state.groupFilters = {
    province: 'ALL',
    membership: 'ALL',
    category: 'ALL',
    sort: 'DEFAULT',
    search: ''
  };
  state.groupProvinceFilter = 'ALL';

  const searchInput = document.getElementById('group-search');
  if (searchInput) searchInput.value = '';

  const clearBtn = document.getElementById('btn-clear-group-search');
  if (clearBtn) clearBtn.style.display = 'none';

  const provSelect = document.getElementById('filter-province-select');
  if (provSelect) provSelect.value = 'ALL';

  const memSelect = document.getElementById('filter-membership-select');
  if (memSelect) memSelect.value = 'ALL';

  const catSelect = document.getElementById('filter-category-select');
  if (catSelect) catSelect.value = 'ALL';

  const sortSelect = document.getElementById('filter-sort-select');
  if (sortSelect) sortSelect.value = 'DEFAULT';

  syncKpiCardsActive('ALL');
  renderGroupFilterToolbar();
  applyGroupFilters();
  showToast('Đã đặt lại', 'Đã khôi phục toàn bộ danh sách nhóm ban đầu.', 'info', 1500);
}

function syncKpiCardsActive(provKey) {
  const cardAll = document.getElementById('kpi-card-all');
  const cardDanang = document.getElementById('kpi-card-danang');
  const cardHcm = document.getElementById('kpi-card-hcm');
  const cardOther = document.getElementById('kpi-card-other');

  if (cardAll) cardAll.classList.toggle('active', provKey === 'ALL');
  if (cardDanang) cardDanang.classList.toggle('active', provKey === 'Đà Nẵng');
  if (cardHcm) cardHcm.classList.toggle('active', provKey === 'TP Hồ Chí Minh');
  if (cardOther) cardOther.classList.toggle('active', provKey === 'OTHER');
}

function selectProvinceFilter(filterKey) {
  selectQuickFilter('PROVINCE', filterKey);
}

function filterGroups() {
  applyGroupFilters();
}

function applyGroupFilters() {
  const filters = state.groupFilters || { province: 'ALL', membership: 'ALL', category: 'ALL', sort: 'DEFAULT', search: '' };
  const q = (filters.search || document.getElementById('group-search')?.value || '').toLowerCase().trim();
  const provFilter = filters.province || state.groupProvinceFilter || 'ALL';
  const memFilter = filters.membership || 'ALL';
  const catFilter = filters.category || 'ALL';
  const sortMode = filters.sort || 'DEFAULT';

  let result = state.groups.filter(g => {
    // 1. Lọc theo Tỉnh Thành
    const rawP = (g.province || 'Toàn quốc').trim();
    let normP = rawP;
    if (/hồ chí minh|hcm|tp hcm|sài gòn/i.test(rawP)) normP = 'TP Hồ Chí Minh';
    else if (/đà nẵng|da nang/i.test(rawP)) normP = 'Đà Nẵng';
    else if (/bình dương|binh duong/i.test(rawP)) normP = 'Bình Dương';
    else if (/quảng nam|quang nam/i.test(rawP)) normP = 'Quảng Nam';
    else if (/toàn quốc|toan quoc/i.test(rawP)) normP = 'Toàn quốc';

    if (provFilter !== 'ALL') {
      if (provFilter === 'OTHER') {
        if (normP === 'Đà Nẵng' || normP === 'TP Hồ Chí Minh') return false;
      } else {
        if (normP.toLowerCase() !== provFilter.toLowerCase() && !rawP.toLowerCase().includes(provFilter.toLowerCase())) {
          return false;
        }
      }
    }

    // 2. Lọc theo Trạng Thái Thành Viên
    if (memFilter === 'JOINED' && g.isJoined !== true) {
      return false;
    }
    if (memFilter === 'UNJOINED' && g.isJoined === true) {
      return false;
    }

    // 3. Lọc theo Chuyên Mục / Ngành Nghề
    if (catFilter !== 'ALL') {
      const gCat = (g.category || 'Tổng hợp').trim().toLowerCase();
      if (gCat !== catFilter.toLowerCase()) return false;
    }

    // 4. Tìm kiếm từ khóa (tên nhóm, link, tỉnh thành)
    if (q) {
      const matchName = g.name && g.name.toLowerCase().includes(q);
      const matchUrl = g.url && g.url.toLowerCase().includes(q);
      const matchProv = g.province && g.province.toLowerCase().includes(q);
      const matchCat = g.category && g.category.toLowerCase().includes(q);
      if (!matchName && !matchUrl && !matchProv && !matchCat) return false;
    }

    return true;
  });

  // 5. Sắp Xếp Nhóm
  if (sortMode === 'MEMBERS_DESC') {
    result.sort((a, b) => parseMemberCount(b.members) - parseMemberCount(a.members));
  } else if (sortMode === 'MEMBERS_ASC') {
    result.sort((a, b) => parseMemberCount(a.members) - parseMemberCount(b.members));
  } else if (sortMode === 'NAME_ASC') {
    result.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'vi'));
  } else if (sortMode === 'POSTED_RECENT') {
    result.sort((a, b) => {
      const timeA = a.lastPostedAt ? new Date(a.lastPostedAt).getTime() : 0;
      const timeB = b.lastPostedAt ? new Date(b.lastPostedAt).getTime() : 0;
      return timeB - timeA;
    });
  }

  state.filteredGroups = result;

  // Cập nhật counter báo cáo kết quả
  const counter = document.getElementById('group-display-counter');
  if (counter) {
    const activeFiltersText = [];
    if (provFilter !== 'ALL') activeFiltersText.push(provFilter === 'OTHER' ? 'Tỉnh khác' : provFilter);
    if (memFilter === 'JOINED') activeFiltersText.push('Đã vào nhóm');
    if (memFilter === 'UNJOINED') activeFiltersText.push('Chưa vào nhóm');
    if (catFilter !== 'ALL') activeFiltersText.push(catFilter);
    if (q) activeFiltersText.push(`"${q}"`);

    const filterNote = activeFiltersText.length > 0 ? ` (Đang lọc: ${activeFiltersText.join(' + ')})` : '';
    counter.innerHTML = `Đang hiển thị <strong>${state.filteredGroups.length}</strong> / ${state.groups.length} nhóm${escapeHtml(filterNote)}`;
  }

  renderGroups();
}

// =========================================================
// XUẤT TRANG TÍNH / EXCEL CHO HỘI NHÓM (EXPORT GROUPS TO CSV/SHEETS)
// =========================================================
function openExportGroupsModal() {
  const modal = document.getElementById('export-groups-modal');
  if (!modal) return;

  const currentAcc = (state.accounts || []).find(a => a.id === state.currentAccountId) || state.accounts?.[0];
  const accNameEl = document.getElementById('export-modal-acc-name');
  const filteredEl = document.getElementById('export-modal-filtered-count');
  const totalEl = document.getElementById('export-modal-total-count');
  const scopeFilteredText = document.getElementById('export-scope-filtered-text');
  const scopeAllText = document.getElementById('export-scope-all-text');

  const groups = state.groups || [];
  const filtered = state.filteredGroups || groups;

  if (accNameEl) accNameEl.textContent = currentAcc ? currentAcc.name : 'Tất cả nick';
  if (filteredEl) filteredEl.textContent = `${filtered.length} nhóm`;
  if (totalEl) totalEl.textContent = `${groups.length} nhóm`;
  if (scopeFilteredText) scopeFilteredText.textContent = `${filtered.length} nhóm`;
  if (scopeAllText) scopeAllText.textContent = `${groups.length} nhóm`;

  modal.classList.add('active');
}

function closeExportGroupsModal() {
  const modal = document.getElementById('export-groups-modal');
  if (modal) modal.classList.remove('active');
}

function getExportGroupsData(scope = 'FILTERED') {
  const groups = state.groups || [];
  const targetList = (scope === 'ALL') ? groups : (state.filteredGroups || groups);
  const currentAcc = (state.accounts || []).find(a => a.id === state.currentAccountId) || state.accounts?.[0];
  const currentAccName = currentAcc ? currentAcc.name : 'Nick hiện tại';

  return targetList.map((g, idx) => {
    const isJoined = g.isJoined === true ? 'Đã tham gia' : 'Chưa vào nhóm';
    const lastPosted = g.lastPostedAt ? new Date(g.lastPostedAt).toLocaleDateString('vi-VN') : 'Chưa đăng';

    return {
      stt: idx + 1,
      name: g.name || '',
      url: g.url || '',
      province: g.province || 'Toàn quốc',
      category: g.category || 'Tổng hợp',
      members: g.members || 'N/A',
      membershipStatus: isJoined,
      accountRef: currentAccName,
      lastPostedAt: lastPosted,
      lastPostTitle: g.lastPostTitle || ''
    };
  });
}

function downloadGroupsCsvFile() {
  const scope = document.querySelector('input[name="export-scope"]:checked')?.value || 'FILTERED';
  const data = getExportGroupsData(scope);

  if (data.length === 0) {
    showToast('Không có dữ liệu', 'Không có hội nhóm nào để xuất file.', 'warning');
    return;
  }

  const headers = [
    'STT',
    'Tên Hội Nhóm Facebook',
    'Đường Dẫn Group (URL)',
    'Tỉnh / Thành Phố',
    'Chuyên Mục / Ngành Nghề',
    'Số Lượng Thành Viên',
    'Trạng Thái Tham Gia',
    'Tài Khoản Đối Chiếu',
    'Lần Đăng Gần Nhất',
    'Tiêu Đề Tin Đăng Gần Nhất'
  ];

  const rows = [headers];

  data.forEach(item => {
    rows.push([
      item.stt,
      `"${item.name.replace(/"/g, '""')}"`,
      `"${item.url.replace(/"/g, '""')}"`,
      `"${item.province.replace(/"/g, '""')}"`,
      `"${item.category.replace(/"/g, '""')}"`,
      `"${item.members.replace(/"/g, '""')}"`,
      `"${item.membershipStatus.replace(/"/g, '""')}"`,
      `"${item.accountRef.replace(/"/g, '""')}"`,
      `"${item.lastPostedAt.replace(/"/g, '""')}"`,
      `"${item.lastPostTitle.replace(/"/g, '""')}"`
    ]);
  });

  // Thêm UTF-8 BOM (\uFEFF) để Excel & Google Sheets hiển thị tiếng Việt có dấu chuẩn 100%
  const csvContent = '\uFEFF' + rows.map(r => r.join(',')).join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  const suffix = scope === 'ALL' ? 'Tat_Ca' : 'Bo_Loc';
  a.href = url;
  a.download = `Danh_Sach_Hoi_Nhom_Facebook_${suffix}_${dateStr}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  closeExportGroupsModal();
  showToast('Xuất File Thành Công!', `Đã tải xuống ${data.length} hội nhóm Facebook dạng file CSV/Excel.`, 'success', 4000);
}

function copyGroupsTableToClipboard() {
  const scope = document.querySelector('input[name="export-scope"]:checked')?.value || 'FILTERED';
  const data = getExportGroupsData(scope);

  if (data.length === 0) {
    showToast('Không có dữ liệu', 'Không có hội nhóm nào để sao chép.', 'warning');
    return;
  }

  const headers = [
    'STT',
    'Tên Hội Nhóm Facebook',
    'Đường Dẫn Group (URL)',
    'Tỉnh / Thành Phố',
    'Chuyên Mục / Ngành Nghề',
    'Số Lượng Thành Viên',
    'Trạng Thái Tham Gia',
    'Tài Khoản Đối Chiếu',
    'Lần Đăng Gần Nhất',
    'Tiêu Đề Tin Đăng Gần Nhất'
  ];

  // Định dạng chuẩn TSV (Tab-Separated Values) giúp dán Ctrl+V trực tiếp vào Google Sheets / Excel
  const tsvRows = [headers.join('\t')];
  data.forEach(item => {
    tsvRows.push([
      item.stt,
      item.name,
      item.url,
      item.province,
      item.category,
      item.members,
      item.membershipStatus,
      item.accountRef,
      item.lastPostedAt,
      item.lastPostTitle
    ].join('\t'));
  });

  const tsvText = tsvRows.join('\r\n');

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(tsvText).then(() => {
      closeExportGroupsModal();
      showToast('Đã Sao Chép Bảng Dữ Liệu!', `Đã copy ${data.length} nhóm. Hãy mở Google Sheets và ấn Ctrl + V để dán ngay!`, 'success', 5000);
    }).catch(err => {
      fallbackCopyText(tsvText, data.length);
    });
  } else {
    fallbackCopyText(tsvText, data.length);
  }
}

function fallbackCopyText(text, count) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    document.execCommand('copy');
    closeExportGroupsModal();
    showToast('Đã Sao Chép Bảng Dữ Liệu!', `Đã copy ${count} nhóm. Hãy mở Google Sheets và ấn Ctrl + V để dán ngay!`, 'success', 5000);
  } catch (e) {
    showToast('Lỗi sao chép', 'Trình duyệt chặn sao chép, vui lòng tải file CSV.', 'danger');
  }
  document.body.removeChild(textarea);
}

// =========================================================
// CHẾ ĐỘ XEM TRANG TÍNH (GOOGLE SHEETS STYLE) & THẺ LƯỚI CHO HỘI NHÓM
// =========================================================
function initGroupViewMode() {
  const currentMode = state.groupViewMode || localStorage.getItem('group_view_mode') || 'table';
  setGroupViewMode(currentMode, false);
}

function setGroupViewMode(mode, triggerRender = true) {
  state.groupViewMode = mode;
  localStorage.setItem('group_view_mode', mode);

  const btnTable = document.getElementById('btn-view-table');
  const btnGrid = document.getElementById('btn-view-grid');
  const tableContainer = document.getElementById('groups-table-container');
  const gridContainer = document.getElementById('groups-grid');

  if (btnTable && btnGrid) {
    if (mode === 'table') {
      btnTable.classList.add('active');
      btnGrid.classList.remove('active');
    } else {
      btnGrid.classList.add('active');
      btnTable.classList.remove('active');
    }
  }

  if (tableContainer && gridContainer) {
    if (mode === 'table') {
      tableContainer.style.display = 'block';
      gridContainer.style.display = 'none';
    } else {
      tableContainer.style.display = 'none';
      gridContainer.style.display = 'grid';
    }
  }

  if (triggerRender) {
    renderGroups();
  }
}

function renderGroups() {
  if (state.groupViewMode === 'grid') {
    renderGroupsGrid();
  } else {
    renderGroupsTable();
  }
}

function renderGroupsTable() {
  const tbody = document.getElementById('groups-table-body');
  const tfoot = document.getElementById('groups-table-foot');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (!state.filteredGroups || state.filteredGroups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4" style="color: var(--text-dim);"><i class="fa-solid fa-circle-info"></i> Không có Hội Nhóm Facebook nào phù hợp với bộ lọc hiện tại.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  const activeAcc = (state.accounts || []).find(a => a.id === state.currentAccountId);
  const activeAccName = activeAcc ? (activeAcc.name.split(' ')[0] || activeAcc.name) : 'Nick hiện tại';

  let joinedCount = 0;
  let unjoinedCount = 0;

  state.filteredGroups.forEach((group, idx) => {
    const tr = document.createElement('tr');

    const lastPostedText = group.lastPostedAt
      ? `<span style="color: var(--success); font-weight: 600; font-size: 0.72rem; white-space: nowrap;"><i class="fa-solid fa-clock-rotate-left"></i> ${new Date(group.lastPostedAt).toLocaleDateString('vi-VN')}</span>`
      : `<span style="color: var(--text-dim); font-size: 0.72rem;">-</span>`;

    const provName = group.province || 'Toàn quốc';
    const provBadge = `
      <div class="location-compact" title="${escapeHtml(provName)}">
        <i class="fa-solid fa-location-dot"></i>
        <span>${escapeHtml(provName)}</span>
      </div>
    `;

    let memberCell = '';
    let otherJoinedPill = '';

    if (group.isJoined === true) {
      joinedCount++;
      memberCell = `<div class="group-sheet-status-pill joined" onclick="toggleGroupMembership('${group.id}', false)" title="Bấm để đổi sang: Chưa vào nhóm (cho nick ${escapeHtml(activeAccName)})"><i class="fa-solid fa-circle-check"></i> Đã vào</div>`;
    } else {
      unjoinedCount++;
      memberCell = `<div class="group-sheet-status-pill unjoined" onclick="toggleGroupMembership('${group.id}', true)" title="Bấm để đổi sang: Đã tham gia (cho nick ${escapeHtml(activeAccName)})"><i class="fa-solid fa-user-plus"></i> Chưa vào</div>`;
      if (group.joinedAccounts && group.joinedAccounts.length > 0) {
        const otherNames = group.joinedAccounts
          .filter(id => id !== state.currentAccountId)
          .map(id => {
            const acc = (state.accounts || []).find(a => a.id === id);
            return acc ? (acc.name.split(' ')[0] || acc.name) : 'Nick khác';
          }).filter(Boolean);
        if (otherNames.length > 0) {
          otherJoinedPill = `<div style="font-size: 0.64rem; color: var(--text-muted); margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Tài khoản khác đã tham gia: ${otherNames.join(', ')}"><i class="fa-solid fa-circle-info text-info"></i> ${otherNames.join(', ')}</div>`;
        }
      }
    }

    const groupShortId = group.groupId || (group.url ? group.url.replace(/https?:\/\/(www\.)?facebook\.com\/groups\/?/i, '').replace(/\/.*$/, '') : group.id);

    tr.innerHTML = `
      <td class="text-center" style="font-weight: 700; color: var(--text-muted); font-size: 0.74rem;">
        #${idx + 1}
      </td>
      <td>
        <div class="group-sheet-cell-title">
          <div class="group-sheet-name-row">
            <i class="fa-brands fa-facebook text-primary" style="font-size: 0.85rem; flex-shrink: 0;"></i>
            <a href="${group.url}" target="_blank" class="group-sheet-name-link" title="Mở nhóm: ${escapeHtml(group.name)}">
              ${escapeHtml(group.name)}
            </a>
          </div>
          <div class="group-sheet-meta-tags">
            <span class="group-sheet-cat-badge">${escapeHtml(group.category || 'Tuyển dụng')}</span>
            <span class="group-sheet-id-badge" title="ID / Slug nhóm">${escapeHtml(groupShortId)}</span>
          </div>
        </div>
      </td>
      <td>
        ${provBadge}
      </td>
      <td class="text-center">
        <span style="font-weight: 600; font-size: 0.76rem; white-space: nowrap;"><i class="fa-solid fa-users text-muted" style="margin-right: 3px; font-size: 0.72rem;"></i>${escapeHtml(group.members || 'N/A')}</span>
      </td>
      <td class="text-center">
        ${memberCell}
        ${otherJoinedPill}
      </td>
      <td class="text-center">
        ${lastPostedText}
      </td>
      <td class="text-center">
        <div class="group-sheet-actions">
          <button class="btn-sheet-action-icon verify" id="btn-verify-tbl-${group.id}" onclick="checkSingleGroupRealtime('${group.id}')" title="Kiểm tra trực tiếp Facebook (Nick ${escapeHtml(activeAccName)})">
            <i class="fa-solid fa-satellite-dish"></i>
          </button>
          <a href="${group.url}" target="_blank" class="btn-sheet-action-icon fb" title="Mở nhóm trên Facebook">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
          <button class="btn-sheet-action-icon danger" onclick="deleteGroup('${group.id}')" title="Xóa nhóm khỏi danh sách">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td class="text-center" style="font-weight: 700; font-size: 0.72rem;">TỔNG</td>
        <td style="font-weight: 700; color: var(--primary); font-size: 0.76rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
          ${state.filteredGroups.length} / ${state.groups.length} Hội Nhóm
        </td>
        <td class="text-center" style="font-size: 0.72rem; color: var(--text-muted);">-</td>
        <td class="text-center" style="font-size: 0.72rem; color: var(--text-muted);">-</td>
        <td class="text-center" style="font-size: 0.7rem; white-space: nowrap;">
          <span style="color: var(--success); font-weight: 700; margin-right: 5px;"><i class="fa-solid fa-circle-check"></i> ${joinedCount}</span>
          <span style="color: var(--danger); font-weight: 700;"><i class="fa-solid fa-user-plus"></i> ${unjoinedCount}</span>
        </td>
        <td class="text-center" style="font-size: 0.72rem; color: var(--text-muted);">-</td>
        <td class="text-center" style="font-size: 0.7rem; color: var(--text-muted);">
          <i class="fa-solid fa-table-cells text-success"></i>
        </td>
      </tr>
    `;
  }
}

function renderGroupsGrid() {
  const grid = document.getElementById('groups-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (state.filteredGroups.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-dim);">Không có Hội Nhóm Facebook nào phù hợp với bộ lọc hiện tại.</div>`;
    return;
  }

  state.filteredGroups.forEach(group => {
    const card = document.createElement('div');
    card.className = 'group-card';

    const lastPostedText = group.lastPostedAt
      ? `<span style="color: var(--success);"><i class="fa-solid fa-clock-rotate-left"></i> ${new Date(group.lastPostedAt).toLocaleDateString('vi-VN')}</span>`
      : `<span style="color: var(--text-dim);">Chưa đăng</span>`;

    let cardProv = (group.province || '').trim();
    if (!cardProv || cardProv.length <= 1 || cardProv.toLowerCase() === 'a') cardProv = 'Toàn quốc';
    const provBadge = `<div class="location-compact"><i class="fa-solid fa-location-dot"></i> <span>${escapeHtml(cardProv)}</span></div>`;

    let memberBadge = '';
    let otherJoinedPill = '';
    const activeAcc = (state.accounts || []).find(a => a.id === state.currentAccountId);
    const activeAccName = activeAcc ? (activeAcc.name.split(' ')[0] || activeAcc.name) : 'Nick hiện tại';

    if (group.isJoined === true) {
      memberBadge = `<span class="badge-pill success" onclick="toggleGroupMembership('${group.id}', false)" title="Bấm để đổi sang: Chưa vào nhóm (cho nick ${escapeHtml(activeAccName)})" style="font-size: 0.72rem; padding: 2px 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: transform 0.15s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"><i class="fa-solid fa-circle-check"></i> Đã tham gia</span>`;
    } else {
      memberBadge = `<span class="badge-pill danger" onclick="toggleGroupMembership('${group.id}', true)" title="Bấm để đổi sang: Đã tham gia (cho nick ${escapeHtml(activeAccName)})" style="font-size: 0.72rem; padding: 2px 7px; cursor: pointer; display: inline-flex; align-items: center; gap: 4px; transition: transform 0.15s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'"><i class="fa-solid fa-user-plus"></i> Chưa vào nhóm</span>`;
      if (group.joinedAccounts && group.joinedAccounts.length > 0) {
        const otherNames = group.joinedAccounts
          .filter(id => id !== state.currentAccountId)
          .map(id => {
            const acc = (state.accounts || []).find(a => a.id === id);
            return acc ? (acc.name.split(' ')[0] || acc.name) : 'Nick khác';
          }).filter(Boolean);
        if (otherNames.length > 0) {
          otherJoinedPill = `<span class="badge-pill info" style="font-size: 0.68rem; padding: 1px 6px; opacity: 0.85;" title="Tài khoản khác đã tham gia: ${otherNames.join(', ')}"><i class="fa-solid fa-circle-info"></i> ${otherNames.join(', ')} đã vào</span>`;
        }
      }
    }

    let cardMembers = (group.members || '').trim();
    if (!cardMembers || cardMembers === 'N/A') cardMembers = 'Cộng đồng FB';
    else if (!cardMembers.toLowerCase().includes('thành viên') && !cardMembers.toLowerCase().includes('member')) cardMembers += ' thành viên';

    card.innerHTML = `
      <div class="group-header">
        <span class="group-name" title="${escapeHtml(group.name)}">${escapeHtml(group.name)}</span>
        <button class="btn-icon" onclick="deleteGroup('${group.id}')" title="Xóa nhóm"><i class="fa-solid fa-trash"></i></button>
      </div>
      <div class="group-meta" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        ${provBadge}
        ${memberBadge}
        ${otherJoinedPill}
        <span><i class="fa-solid fa-users"></i> ${escapeHtml(cardMembers)}</span>
      </div>
      <div class="group-footer" style="display: flex; justify-content: space-between; align-items: center; gap: 6px; flex-wrap: wrap;">
        <div style="display: flex; gap: 5px; align-items: center;">
          <a href="${group.url}" target="_blank" class="btn btn-sm btn-outline" style="font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-arrow-up-right-from-square"></i> Mở FB</a>
          <button class="btn btn-sm btn-outline" id="btn-verify-${group.id}" onclick="checkSingleGroupRealtime('${group.id}')" title="Kiểm tra trực tiếp trên Facebook xem nick đang chọn đã vào nhóm hay chưa" style="font-size: 0.72rem; padding: 2px 7px; color: #10b981; border-color: rgba(16, 185, 129, 0.45); background: rgba(16, 185, 129, 0.05);">
            <i class="fa-solid fa-satellite-dish"></i> Check Realtime
          </button>
        </div>
        <div style="font-size: 0.75rem;">${lastPostedText}</div>
      </div>
    `;
    grid.appendChild(card);
  });
}

// Sắp xếp cột trên bảng Trang Tính khi bấm vào Header
function sortGroupsByColumn(colKey) {
  if (state.groupSortCol === colKey) {
    state.groupSortDir = state.groupSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    state.groupSortCol = colKey;
    state.groupSortDir = colKey === 'members' || colKey === 'posted' ? 'desc' : 'asc';
  }

  // Cập nhật icon sort trên tất cả headers
  const colKeys = ['index', 'name', 'province', 'members', 'status', 'posted'];
  colKeys.forEach(k => {
    const icon = document.getElementById(`sort-icon-${k}`);
    const th = icon ? icon.closest('th') : null;
    if (icon) {
      if (k === colKey) {
        icon.className = state.groupSortDir === 'asc' ? 'fa-solid fa-sort-up sort-icon-col' : 'fa-solid fa-sort-down sort-icon-col';
        if (th) th.classList.add('sorted');
      } else {
        icon.className = 'fa-solid fa-sort sort-icon-col';
        if (th) th.classList.remove('sorted');
      }
    }
  });

  const dirMul = state.groupSortDir === 'asc' ? 1 : -1;

  state.filteredGroups.sort((a, b) => {
    if (colKey === 'index') {
      const idxA = state.groups.indexOf(a);
      const idxB = state.groups.indexOf(b);
      return (idxA - idxB) * dirMul;
    }
    if (colKey === 'name') {
      return (a.name || '').localeCompare(b.name || '', 'vi') * dirMul;
    }
    if (colKey === 'province') {
      return (a.province || '').localeCompare(b.province || '', 'vi') * dirMul;
    }
    if (colKey === 'members') {
      const parseNum = (str) => {
        if (!str) return 0;
        const s = String(str).toLowerCase().replace(/,/g, '.');
        if (s.includes('k')) return parseFloat(s) * 1000;
        if (s.includes('m') || s.includes('tr')) return parseFloat(s) * 1000000;
        return parseFloat(s.replace(/[^0-9.]/g, '')) || 0;
      };
      return (parseNum(a.members) - parseNum(b.members)) * dirMul;
    }
    if (colKey === 'status') {
      const statusA = a.isJoined ? 1 : 0;
      const statusB = b.isJoined ? 1 : 0;
      return (statusA - statusB) * dirMul;
    }
    if (colKey === 'posted') {
      const timeA = a.lastPostedAt ? new Date(a.lastPostedAt).getTime() : 0;
      const timeB = b.lastPostedAt ? new Date(b.lastPostedAt).getTime() : 0;
      return (timeA - timeB) * dirMul;
    }
    return 0;
  });

  renderGroups();
}

function updateGroupAccountSelectorUI() {
  const select = document.getElementById('group-filter-account-select');
  const badge = document.getElementById('group-account-joined-badge');
  if (!select) return;

  const accounts = state.accounts || [];
  if (accounts.length > 0) {
    const activeAccId = state.currentAccountId || accounts[0].id;
    select.innerHTML = accounts.map(acc => {
      const isSelected = acc.id === activeAccId ? 'selected' : '';
      return `<option value="${acc.id}" ${isSelected}>${escapeHtml(acc.name)} (UID: ${acc.fbUserId}) ${acc.isCurrent ? '⭐ [Đang dùng]' : ''}</option>`;
    }).join('');

    const joinedForThis = (state.groups || []).filter(g => g.isJoined === true).length;
    if (badge) {
      badge.innerHTML = `<i class="fa-solid fa-circle-check" style="color: var(--success);"></i> Đã vào: <strong>${joinedForThis}</strong> / ${state.groups.length} nhóm`;
    }
  }
}

function onGroupAccountViewChange(newAccId) {
  state.currentAccountId = newAccId;
  loadGroups(newAccId);
}

async function copyMembershipFromPrimary() {
  const accounts = state.accounts || [];
  const primaryAcc = accounts.find(a => a.id === 'acc_primary') || accounts[0];
  const targetAcc = accounts.find(a => a.id === state.currentAccountId) || accounts[0];

  if (!primaryAcc || !targetAcc) {
    showToast('Lỗi', 'Không tìm thấy tài khoản hợp lệ.', 'danger');
    return;
  }

  if (primaryAcc.id === targetAcc.id) {
    showToast('Thông báo', `Nick "${primaryAcc.name}" chính là Nick Gốc, không thể sao chép sang chính nó.`, 'info');
    return;
  }

  if (!confirm(`Bạn có muốn sao chép toàn bộ trạng thái các nhóm đã tham gia từ nick "${primaryAcc.name}" sang nick "${targetAcc.name}" không?\n(Dữ liệu các nhóm nick chính đã vào sẽ được cập nhật đồng bộ sang nick này)`)) {
    return;
  }

  try {
    const res = await fetch('/api/groups/copy-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceAccountId: primaryAcc.id, targetAccountId: targetAcc.id })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Thành Công', result.message, 'success', 4000);
      await loadGroups(targetAcc.id);
      await loadAccountsData();
    } else {
      showToast('Thất bại', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function resetGroupMembershipsToUnjoined() {
  const targetAcc = (state.accounts || []).find(a => a.id === state.currentAccountId) || state.accounts?.[0];
  const accName = targetAcc ? targetAcc.name : 'tài khoản đang chọn';

  if (!confirm(`Bạn có chắc chắn muốn đặt lại toàn bộ danh sách nhóm về trạng thái "Chưa vào nhóm" cho nick "${accName}" không?\n(Dữ liệu ảo hoặc sao chép cũ sẽ được dọn sạch để bạn bắt đầu kiểm tra hoặc quản lý chuẩn xác)`)) {
    return;
  }

  try {
    const res = await fetch('/api/groups/reset-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: state.currentAccountId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Đặt Lại Trạng Thái', result.message, 'success', 4000);
      await loadGroups(state.currentAccountId);
      await loadAccountsData();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function toggleGroupMembership(groupId, newJoinedState) {
  try {
    const targetAccId = state.currentAccountId || 'acc_primary';
    const res = await fetch(`/api/groups/${groupId}/toggle-membership`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isJoined: newJoinedState, accountId: targetAccId })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Đổi Trạng Thái', result.message, 'success', 2000);
      const g = (state.groups || []).find(x => x.id === groupId);
      if (g) {
        g.isJoined = newJoinedState;
        if (!g.memberships) g.memberships = {};
        g.memberships[targetAccId] = { isJoined: newJoinedState };
        if (newJoinedState) {
          if (!g.joinedAccounts) g.joinedAccounts = [];
          if (!g.joinedAccounts.includes(targetAccId)) g.joinedAccounts.push(targetAccId);
        } else if (g.joinedAccounts) {
          g.joinedAccounts = g.joinedAccounts.filter(x => x !== targetAccId);
        }
      }
      updateGroupAccountSelectorUI();
      applyGroupFilters();
      loadAccountsData();
    } else {
      showToast('Lỗi cập nhật', result.message, 'danger');
    }
  } catch (e) {
    showToast('Lỗi kết nối', e.message, 'danger');
  }
}

async function syncMembershipFromFacebook() {
  const currentAcc = (state.accounts || []).find(a => a.id === state.currentAccountId) || state.accounts?.[0];
  const accName = currentAcc ? currentAcc.name : 'tài khoản hiện tại';

  if (!confirm(`Bạn có muốn tự động mở Facebook để quét các nhóm mà nick "${accName}" đã tham gia và cập nhật vào hệ thống không?`)) {
    return;
  }

  showToast('Đang quét nhóm đã vào...', `Đang mở Facebook để đồng bộ nhóm của "${accName}"...`, 'info', 5000);

  try {
    const res = await fetch('/api/groups/sync-membership', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: state.currentAccountId })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Đồng Bộ Hoàn Tất!', result.message, 'success', 6000);
      await loadGroups();
      await loadAccountsData();
    } else {
      showToast('Lỗi đồng bộ', result.message, 'danger', 6000);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

// =========================================================
// 5.1. KIỂM TRA TRẠNG THÁI REAL-TIME TỪNG NHÓM & QUÉT HÀNG LOẠT
// =========================================================
let verifyInterval = null;

async function checkSingleGroupRealtime(groupId) {
  const btnGrid = document.getElementById(`btn-verify-${groupId}`);
  const btnTable = document.getElementById(`btn-verify-tbl-${groupId}`);
  const origGridHtml = btnGrid ? btnGrid.innerHTML : '';
  const origTableHtml = btnTable ? btnTable.innerHTML : '';

  [btnGrid, btnTable].forEach(b => {
    if (b) {
      b.disabled = true;
      b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Check...';
    }
  });

  const targetAccId = state.currentAccountId || 'acc_primary';
  const targetAcc = (state.accounts || []).find(a => a.id === targetAccId);
  const accName = targetAcc ? targetAcc.name : 'Nick hiện tại';

  showToast('Đang kiểm tra Real-time...', `Đang mở Facebook kiểm tra nhóm cho nick "${accName}"...`, 'info', 4000);

  try {
    const res = await fetch(`/api/groups/${groupId}/check-realtime`, {
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

      // Cập nhật dữ liệu nhóm trong state
      const g = (state.groups || []).find(x => x.id === groupId);
      if (g) {
        g.isJoined = isJoined;
        if (!g.memberships) g.memberships = {};
        g.memberships[targetAccId] = { isJoined };
        if (isJoined) {
          if (!g.joinedAccounts) g.joinedAccounts = [];
          if (!g.joinedAccounts.includes(targetAccId)) g.joinedAccounts.push(targetAccId);
        } else if (g.joinedAccounts) {
          g.joinedAccounts = g.joinedAccounts.filter(x => x !== targetAccId);
        }
      }

      if (result.stats) state.groupStats = result.stats;
      updateGroupStatsUI();
      renderProvinceChips();
      updateGroupAccountSelectorUI();
      applyGroupFilters();
      renderGroupCheckboxList();
    } else {
      showToast('Lỗi kiểm tra', result.message || 'Không thể kiểm tra nhóm', 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  } finally {
    if (btnGrid) {
      btnGrid.disabled = false;
      btnGrid.innerHTML = origGridHtml || '<i class="fa-solid fa-satellite-dish"></i> Check Realtime';
    }
    if (btnTable) {
      btnTable.disabled = false;
      btnTable.innerHTML = origTableHtml || '<i class="fa-solid fa-satellite-dish"></i> Check Live';
    }
  }
}


// =============================================================================
// GLOBAL AUTOMATION SUPERVISOR & FLOATING DYNAMIC TASKBAR MONITOR
// Quản lý trạng thái hiển thị của toàn bộ bộ nút Tự Động Hóa & Thanh Taskbar nổi
// =============================================================================

const globalAutoSupervisor = {
  // Multi-task: mỗi taskType có data riêng
  activeTasks: {}, // { [taskType]: { data, isCompleted, dismissTimer } }
  isMinimized: false,

  // Backward-compat getter: trả về task đầu tiên đang chạy (hoặc null)
  get activeTask() {
    const running = Object.keys(this.activeTasks).find(t => !this.activeTasks[t].isCompleted);
    return running || null;
  },
  // Backward-compat getter: data của activeTask
  get data() {
    const t = this.activeTask;
    return t ? (this.activeTasks[t]?.data || {}) : {};
  },

  setRunning(taskType, taskData) {
    if (!this.activeTasks[taskType]) {
      this.activeTasks[taskType] = { data: {}, isCompleted: false, dismissTimer: null };
    }
    const entry = this.activeTasks[taskType];
    if (entry.dismissTimer) { clearTimeout(entry.dismissTimer); entry.dismissTimer = null; }
    entry.isCompleted = false;
    entry.data = { ...entry.data, ...(taskData || {}), isRunning: true, isCompleted: false };
    this.updateUI();
  },

  setCompleted(taskType, summaryData) {
    if (!this.activeTasks[taskType]) {
      this.activeTasks[taskType] = { data: {}, isCompleted: false, dismissTimer: null };
    }
    const entry = this.activeTasks[taskType];
    entry.isCompleted = true;
    entry.data = { ...entry.data, ...(summaryData || {}), isCompleted: true, isRunning: false };

    this.flashToolbarCompleted(taskType, summaryData);
    this.updateUI();

    playNotificationChime(summaryData.failCount === 0 || !summaryData.failCount ? 'success' : 'warn');

    if (entry.dismissTimer) clearTimeout(entry.dismissTimer);
    entry.dismissTimer = setTimeout(() => {
      this.clearTask(taskType);
    }, 16000);
  },

  clearTask(taskType) {
    delete this.activeTasks[taskType];
    this.updateUI();
    // Nếu không còn task nào thì ẩn widget
    if (Object.keys(this.activeTasks).length === 0) {
      const widget = document.getElementById('floating-auto-widget');
      if (widget) widget.style.display = 'none';
      this.resetToolbar();
    }
  },

  clear() {
    // Xóa tất cả tasks
    Object.keys(this.activeTasks).forEach(t => {
      if (this.activeTasks[t].dismissTimer) clearTimeout(this.activeTasks[t].dismissTimer);
    });
    this.activeTasks = {};
    const widget = document.getElementById('floating-auto-widget');
    if (widget) widget.style.display = 'none';
    this.resetToolbar();
  },

  updateUI() {
    this.renderToolbar();
    this.renderFloatingWidget();
  },

  resetToolbar() {
    const rowTag = document.getElementById('automation-toolbar-tag');
    if (rowTag) {
      rowTag.className = 'toolbar-row-tag';
      rowTag.innerHTML = '<i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> Tự Động Hóa:';
    }

    const btnIds = ['btn-auto-verify', 'btn-auto-join', 'btn-auto-scrape-groups', 'btn-auto-scrape-leads', 'btn-auto-sync-fb'];
    btnIds.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.className = 'btn-tool';
        const origTitle = el.getAttribute('data-orig-title');
        if (origTitle) el.title = origTitle;
        const badge = el.querySelector('.btn-live-badge');
        if (badge) badge.style.display = 'none';
      }
    });
  },

  renderToolbar() {
    const rowTag = document.getElementById('automation-toolbar-tag');
    const allButtons = [
      { id: 'REALTIME_VERIFY', elId: 'btn-auto-verify', theme: 'theme-emerald', badgeTheme: 'emerald', label: 'Quét Trạng Thái Realtime' },
      { id: 'AUTO_JOIN', elId: 'btn-auto-join', theme: 'theme-amber', badgeTheme: 'amber', label: 'Tự Động Xin Vào Nhóm' },
      { id: 'SCRAPE_GROUPS', elId: 'btn-auto-scrape-groups', theme: 'theme-cyan', badgeTheme: 'cyan', label: 'Quét Nhóm Tự Động' },
      { id: 'SCRAPE_LEADS', elId: 'btn-auto-scrape-leads', theme: 'theme-amber', badgeTheme: 'amber', label: 'Cào Lead Tuyển Dụng' },
      { id: 'SYNC_FB', elId: 'btn-auto-sync-fb', theme: 'theme-blue', badgeTheme: 'blue', label: 'Đồng Bộ Nhóm Đã Vào Từ FB' }
    ];

    const runningCount = Object.keys(this.activeTasks).filter(t => !this.activeTasks[t].isCompleted).length;

    if (runningCount === 0) {
      this.resetToolbar();
      return;
    }

    if (rowTag) {
      rowTag.className = 'toolbar-row-tag is-active-running';
      rowTag.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Đang Chạy (${runningCount}):`;
    }

    allButtons.forEach(b => {
      const el = document.getElementById(b.elId);
      if (!el) return;
      if (!el.hasAttribute('data-orig-title')) el.setAttribute('data-orig-title', el.title);

      const entry = this.activeTasks[b.id];
      if (entry && !entry.isCompleted) {
        // Nút này đang chạy
        el.className = `btn-tool is-running-active ${b.theme}`;
        el.title = `Đang chạy [${b.label}]. Bấm để mở chi tiết!`;
        const badge = el.querySelector('.btn-live-badge');
        if (badge) {
          badge.style.display = 'inline-flex';
          badge.className = `btn-live-badge ${b.badgeTheme}`;
          const d = entry.data;
          const progressTxt = d.progressText || (d.total ? `${d.current || 0}/${d.total}` : 'Đang chạy...');
          badge.innerHTML = `<span class="pulse-dot"></span> ${progressTxt}`;
        }
      } else if (!entry) {
        // Nút không có task — reset về normal (không hiện bận vì các task khác chạy độc lập)
        el.className = 'btn-tool';
        const origTitle = el.getAttribute('data-orig-title');
        if (origTitle) el.title = origTitle;
        const badge = el.querySelector('.btn-live-badge');
        if (badge) badge.style.display = 'none';
      }
    });
  },

  flashToolbarCompleted(taskType, summary) {
    const btnIdMap = {
      REALTIME_VERIFY: 'btn-auto-verify',
      AUTO_JOIN: 'btn-auto-join',
      SCRAPE_GROUPS: 'btn-auto-scrape-groups',
      SCRAPE_LEADS: 'btn-auto-scrape-leads',
      SYNC_FB: 'btn-auto-sync-fb'
    };
    const btn = document.getElementById(btnIdMap[taskType]);
    if (btn) {
      btn.className = 'btn-tool is-completed-flash';
      const badge = btn.querySelector('.btn-live-badge');
      if (badge) {
        badge.style.display = 'inline-flex';
        badge.className = 'btn-live-badge emerald';
        badge.innerHTML = `<i class="fa-solid fa-check"></i> Xong (${summary.total || 0})`;
      }
      setTimeout(() => {
        btn.className = 'btn-tool';
        if (badge) badge.style.display = 'none';
      }, 12000);
    }
  },

  renderFloatingWidget() {
    const widget = document.getElementById('floating-auto-widget');
    if (!widget) return;

    const taskEntries = Object.entries(this.activeTasks);
    if (taskEntries.length === 0) {
      widget.style.display = 'none';
      return;
    }

    // Kiểm tra nếu TẤT CẢ modals của các task đang chạy đều đang mở thì ẩn widget
    const runningTasks = taskEntries.filter(([, e]) => !e.isCompleted);
    const allModalsOpen = runningTasks.length > 0 && runningTasks.every(([t]) => this._isModalOpen(t));
    if (allModalsOpen) {
      widget.style.display = 'none';
      return;
    }

    widget.style.display = 'block';

    // Render nội dung widget với nhiều progress bar
    const body = document.getElementById('auto-widget-body');
    const mini = document.getElementById('auto-widget-mini');
    const miniText = document.getElementById('auto-widget-mini-text');

    if (this.isMinimized) {
      if (mini) mini.style.display = 'flex';
      if (body) body.style.display = 'none';
      const totalRunning = runningTasks.length;
      if (miniText) miniText.textContent = `${totalRunning} tiến trình đang chạy`;
      return;
    } else {
      if (mini) mini.style.display = 'none';
      if (body) body.style.display = 'flex';
    }

    // Render dynamic multi-task list vào widget body
    this._renderMultiTaskBody(taskEntries);
  },

  _renderMultiTaskBody(taskEntries) {
    const multiContainer = document.getElementById('auto-widget-multi-tasks');
    if (!multiContainer) return;

    multiContainer.innerHTML = taskEntries.map(([taskType, entry]) => {
      const d = entry.data;
      const isCompleted = entry.isCompleted;
      const isPaused = Boolean(d.isPaused);
      const label = this.getTaskLabel(taskType);
      const icon = this.getTaskIcon(taskType);
      const current = d.current || 0;
      const total = d.total || 0;
      const pct = total > 0 ? Math.round((current / total) * 100) : (isCompleted ? 100 : 0);
      const currentName = d.currentGroupName || d.message || '';
      const statOk = d.joinedCount ?? d.successCount ?? 0;
      const statPending = d.pendingCount ?? 0;
      const statFail = d.notJoinedCount ?? d.failCount ?? 0;

      const themeColor = {
        REALTIME_VERIFY: '#10b981',
        AUTO_JOIN: '#f59e0b',
        SCRAPE_GROUPS: '#06b6d4',
        SCRAPE_LEADS: '#f59e0b',
        SYNC_FB: '#3b82f6'
      }[taskType] || '#10b981';

      const pillBg = isCompleted ? 'rgba(16,185,129,0.2)' : isPaused ? 'rgba(245,158,11,0.2)' : `${themeColor}22`;
      const pillColor = isCompleted ? '#10b981' : isPaused ? '#f59e0b' : themeColor;
      const pillText = isCompleted ? 'HOÀN TẤT ✅' : isPaused ? 'TẠM DỪNG' : 'ĐANG CHẠY NGẦM';

      const pauseBtn = (!isCompleted && (taskType === 'REALTIME_VERIFY' || taskType === 'AUTO_JOIN' || taskType === 'SCRAPE_LEADS'))
        ? `<button class="widget-action-btn" onclick="_widgetPause('${taskType}')" title="${isPaused ? 'Tiếp tục' : 'Tạm dừng'}">
            <i class="fa-solid ${isPaused ? 'fa-play' : 'fa-pause'}"></i>
           </button>` : '';
      const stopBtn = !isCompleted
        ? `<button class="widget-action-btn danger" onclick="_widgetStop('${taskType}')" title="Dừng tiến trình">
            <i class="fa-solid fa-stop"></i>
           </button>` : '';
      const dismissBtn = isCompleted
        ? `<button class="widget-action-btn" onclick="globalAutoSupervisor.clearTask('${taskType}')" title="Đóng">
            <i class="fa-solid fa-xmark"></i>
           </button>` : '';

      return `
        <div class="widget-task-row" data-task="${taskType}">
          <div class="widget-task-header">
            <div class="widget-task-left">
              <i class="${icon}" style="color:${themeColor};font-size:0.85rem;"></i>
              <span class="widget-task-label">${label}</span>
              <span class="widget-status-pill-sm" style="background:${pillBg};color:${pillColor};">${pillText}</span>
            </div>
            <div class="widget-task-actions">
              ${pauseBtn}${stopBtn}${dismissBtn}
            </div>
          </div>
          ${currentName ? `<div class="widget-task-current">${currentName}</div>` : ''}
          <div class="widget-task-progress-row">
            <div class="widget-progress-track">
              <div class="widget-progress-fill" style="width:${pct}%;background:${themeColor};"></div>
            </div>
            <span class="widget-pct">${pct}%</span>
          </div>
          <div class="widget-task-stats">
            <span class="widget-stat ok"><i class="fa-solid fa-circle-check"></i> ${statOk}</span>
            <span class="widget-stat pending"><i class="fa-solid fa-clock"></i> ${statPending}</span>
            <span class="widget-stat fail"><i class="fa-solid fa-circle-xmark"></i> ${statFail}</span>
            <span class="widget-ratio">${current} / ${total}</span>
          </div>
        </div>
      `;
    }).join('<div class="widget-task-divider"></div>');
  },

  _isModalOpen(taskType) {
    const modalMap = {
      REALTIME_VERIFY: 'realtime-verify-modal',
      AUTO_JOIN: 'auto-join-modal',
      SCRAPE_GROUPS: 'scrape-groups-modal',
      SCRAPE_LEADS: 'scrape-leads-modal'
    };
    const id = modalMap[taskType];
    return id ? !!document.getElementById(id)?.classList.contains('active') : false;
  },

  isModalCurrentlyOpen() {
    // Backward compat
    return this._isModalOpen(this.activeTask);
  },

  getTaskLabel(task) {
    switch (task) {
      case 'REALTIME_VERIFY': return 'Quét Trạng Thái Realtime';
      case 'AUTO_JOIN': return 'Tự Động Xin Vào Nhóm';
      case 'SCRAPE_GROUPS': return 'Quét Nhóm Tự Động';
      case 'SCRAPE_LEADS': return 'Cào Lead Tuyển Dụng';
      case 'SYNC_FB': return 'Đồng Bộ Nhóm Đã Vào Từ FB';
      default: return 'Tiến Trình Tự Động Hóa';
    }
  },

  getTaskIcon(task) {
    switch (task) {
      case 'REALTIME_VERIFY': return 'fa-solid fa-satellite-dish';
      case 'AUTO_JOIN': return 'fa-solid fa-user-plus';
      case 'SCRAPE_GROUPS': return 'fa-solid fa-magnifying-glass-location';
      case 'SCRAPE_LEADS': return 'fa-solid fa-bolt';
      case 'SYNC_FB': return 'fa-brands fa-facebook';
      default: return 'fa-solid fa-bolt';
    }
  }
};

// Helper: pause/stop per-task từ widget buttons
function _widgetPause(taskType) {
  if (taskType === 'REALTIME_VERIFY') {
    if (globalAutoSupervisor.activeTasks[taskType]?.data?.isPaused) resumeRealtimeVerify();
    else pauseRealtimeVerify();
  } else if (taskType === 'AUTO_JOIN') {
    if (globalAutoSupervisor.activeTasks[taskType]?.data?.isPaused) resumeAutoJoin();
    else pauseAutoJoin();
  } else if (taskType === 'SCRAPE_LEADS') {
    togglePauseScrapeLeads();
  }
}
function _widgetStop(taskType) {
  if (taskType === 'REALTIME_VERIFY') stopRealtimeVerify();
  else if (taskType === 'AUTO_JOIN') stopAutoJoin();
  else if (taskType === 'SCRAPE_LEADS') stopScrapingLeads();
}

function openCurrentAutoModal() {
  const task = globalAutoSupervisor.activeTask || 'REALTIME_VERIFY';
  if (task === 'REALTIME_VERIFY') openRealtimeVerifyModal();
  else if (task === 'AUTO_JOIN') openAutoJoinModal();
  else if (task === 'SCRAPE_GROUPS') openScrapeGroupsModal();
  else if (task === 'SCRAPE_LEADS') openScrapeLeadsModal();
}

function togglePauseCurrentAuto() {
  const task = globalAutoSupervisor.activeTask;
  if (task === 'REALTIME_VERIFY') {
    if (globalAutoSupervisor.data.isPaused) resumeRealtimeVerify();
    else pauseRealtimeVerify();
  } else if (task === 'AUTO_JOIN') {
    if (globalAutoSupervisor.data.isPaused) resumeAutoJoin();
    else pauseAutoJoin();
  } else if (task === 'SCRAPE_LEADS') {
    togglePauseScrapeLeads();
  }
}

function stopCurrentAuto() {
  const task = globalAutoSupervisor.activeTask;
  if (task === 'REALTIME_VERIFY') stopRealtimeVerify();
  else if (task === 'AUTO_JOIN') stopAutoJoin();
  else if (task === 'SCRAPE_LEADS') stopScrapingLeads();
}

function minimizeAutoWidget() {
  globalAutoSupervisor.isMinimized = true;
  globalAutoSupervisor.renderFloatingWidget(false);
}

function expandAutoWidget() {
  globalAutoSupervisor.isMinimized = false;
  globalAutoSupervisor.renderFloatingWidget(false);
}

function dismissAutoWidget() {
  globalAutoSupervisor.clear();
}

async function checkAllBackgroundAutomations() {
  // Kiểm tra TẤT CẢ tiến trình song song (không dùng return sớm)

  // 1. Quét Realtime Verify
  if (!wasVerifyRunning) {
    try {
      const res = await fetch('/api/groups/verify-batch/status');
      const r = await res.json();
      if (r.success && r.data && r.data.isRunning) {
        wasVerifyRunning = true;
        if (!verifyInterval) {
          verifyInterval = setInterval(pollRealtimeVerifyStatus, 1500);
        }
        pollRealtimeVerifyStatus();
      }
    } catch (e) {}
  }

  // 2. Tự Động Xin Vào Nhóm (Auto Joiner)
  if (!wasJoinRunning) {
    try {
      const res = await fetch('/api/groups/join/status');
      const r = await res.json();
      if (r.success && r.data && r.data.isRunning) {
        wasJoinRunning = true;
        if (!joinPollInterval) {
          joinPollInterval = setInterval(pollJoinStatus, 2000);
        }
        pollJoinStatus();
      }
    } catch (e) {}
  }

  // 3. Quét Nhóm Tự Động
  try {
    const res = await fetch('/api/groups/scrape/status');
    const r = await res.json();
    if (r.success && r.data && r.data.isScraping) {
      if (!scrapePollInterval) {
        scrapePollInterval = setInterval(pollScrapeStatus, 2000);
      }
      pollScrapeStatus();
    }
  } catch (e) {}

  // 4. Cào Lead Tuyển Dụng
  try {
    const res = await fetch('/api/scraped/scrape-status');
    const r = await res.json();
    if (r.success && r.data && r.data.isScraping) {
      if (!scrapeLeadsPollInterval) {
        scrapeLeadsPollInterval = setInterval(pollScrapeLeadsStatus, 2000);
      }
      pollScrapeLeadsStatus();
    }
  } catch (e) {}
}

async function openRealtimeVerifyModal() {
  const modal = document.getElementById('realtime-verify-modal');
  const accSelect = document.getElementById('verify-account-select');
  if (!modal) return;

  const accounts = state.accounts || [];
  if (accSelect && accounts.length > 0) {
    const activeAccId = state.currentAccountId || accounts[0].id;
    accSelect.innerHTML = accounts.map(acc => {
      const isSelected = acc.id === activeAccId ? 'selected' : '';
      return `<option value="${acc.id}" ${isSelected}>${escapeHtml(acc.name)} (UID: ${acc.fbUserId}) ${acc.isCurrent ? '⭐ [Đang dùng]' : ''}</option>`;
    }).join('');
  }

  modal.classList.add('active');

  // Lập tức đồng bộ trạng thái thực tế đang chạy từ backend
  await pollRealtimeVerifyStatus();

  // Bắt đầu chu kỳ cập nhật liên tục
  if (verifyInterval) clearInterval(verifyInterval);
  verifyInterval = setInterval(pollRealtimeVerifyStatus, 1500);
}

function closeRealtimeVerifyModal() {
  const modal = document.getElementById('realtime-verify-modal');
  if (modal) modal.classList.remove('active');
  if (verifyInterval) {
    clearInterval(verifyInterval);
    verifyInterval = null;
  }
}


// =========================================================
// QUẢN LÝ TIẾN TRÌNH TỰ ĐỘNG HÓA HỘI NHÓM & BANNER REALTIME
// =========================================================
let activeGroupAutoType = null; // 'REALTIME_VERIFY' | 'AUTO_JOIN' | null
let autoBannerDismissTimeout = null;

function updateGroupAutoBanner({
  type,
  title,
  icon,
  badgeText,
  isPaused,
  current,
  total,
  percent,
  substats,
  isCompleted
}) {
  const banner = document.getElementById('group-automation-live-banner');
  if (!banner) return;

  if (autoBannerDismissTimeout) {
    clearTimeout(autoBannerDismissTimeout);
    autoBannerDismissTimeout = null;
  }

  activeGroupAutoType = type;
  banner.style.display = 'flex';

  const iconEl = document.getElementById('auto-banner-icon');
  const titleEl = document.getElementById('auto-banner-title');
  const badgeEl = document.getElementById('auto-banner-badge');
  const countEl = document.getElementById('auto-banner-count');
  const pctEl = document.getElementById('auto-banner-pct');
  const barEl = document.getElementById('auto-banner-progress-bar');
  const barTextEl = document.getElementById('auto-banner-progress-text');
  const pauseBtn = document.getElementById('auto-banner-btn-pause');
  const stopBtn = document.getElementById('auto-banner-btn-stop');
  const viewBtn = document.getElementById('auto-banner-btn-view');
  const dismissBtn = document.getElementById('auto-banner-btn-dismiss');

  if (isCompleted) {
    banner.classList.add('completed');
    if (iconEl) iconEl.className = 'fa-solid fa-circle-check text-success';
    if (titleEl) titleEl.innerHTML = '🎉 HOÀN THÀNH: ' + (title || 'TIẾN TRÌNH TỰ ĐỘNG');
    if (badgeEl) {
      badgeEl.textContent = 'Hoàn tất 100%';
      badgeEl.style.background = 'rgba(16, 185, 129, 0.25)';
      badgeEl.style.color = '#10b981';
      badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.5)';
    }
    if (pauseBtn) pauseBtn.style.display = 'none';
    if (stopBtn) stopBtn.style.display = 'none';
    if (dismissBtn) dismissBtn.style.display = 'inline-flex';
    if (barEl) barEl.style.width = '100%';
    if (barTextEl) barTextEl.textContent = '100%';

    autoBannerDismissTimeout = setTimeout(() => {
      dismissAutoBanner();
    }, 15000);
    return;
  }

  banner.classList.remove('completed');
  if (dismissBtn) dismissBtn.style.display = 'none';
  if (pauseBtn) pauseBtn.style.display = 'inline-flex';
  if (stopBtn) stopBtn.style.display = 'inline-flex';

  if (iconEl) iconEl.className = 'fa-solid ' + (icon || 'fa-satellite-dish');
  if (titleEl) titleEl.textContent = title || 'ĐANG CHẠY TỰ ĐỘNG HÓA';
  
  if (badgeEl) {
    if (isPaused) {
      badgeEl.textContent = 'Đang tạm dừng';
      badgeEl.style.background = 'rgba(245, 158, 11, 0.2)';
      badgeEl.style.color = '#f59e0b';
      badgeEl.style.borderColor = 'rgba(245, 158, 11, 0.4)';
      if (pauseBtn) pauseBtn.innerHTML = '<i class="fa-solid fa-play"></i> <span>Tiếp tục</span>';
    } else {
      badgeEl.textContent = badgeText || 'Đang chạy ngầm';
      badgeEl.style.background = 'rgba(16, 185, 129, 0.2)';
      badgeEl.style.color = '#10b981';
      badgeEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
      if (pauseBtn) pauseBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Tạm dừng</span>';
    }
  }

  const descEl = document.getElementById('auto-banner-desc');
  if (descEl) {
    if (type === 'REALTIME_VERIFY') {
      descEl.innerHTML = 'Đang quét giao diện Facebook từng nhóm • Đã quét: <strong>' + (current || 0) + '/' + (total || 0) + '</strong> nhóm (<span>' + (percent || 0) + '%</span>)';
    } else if (type === 'AUTO_JOIN') {
      descEl.innerHTML = 'Đang gửi yêu cầu xin vào nhóm Facebook • Tiến độ: <strong>' + (current || 0) + '/' + (total || 0) + '</strong> nhóm (<span>' + (percent || 0) + '%</span>)';
    }
  }

  if (countEl) countEl.textContent = (current || 0) + '/' + (total || 0);
  if (pctEl) pctEl.textContent = (percent || 0) + '%';
  if (barEl) barEl.style.width = (percent || 0) + '%';
  if (barTextEl) barTextEl.textContent = (percent || 0) + '%';

  const substatsBox = document.getElementById('auto-banner-substats');
  if (substatsBox && substats) {
    if (type === 'REALTIME_VERIFY') {
      substatsBox.innerHTML = 
        '<span class="substat-item success"><i class="fa-solid fa-circle-check"></i> Đã vào: <strong>' + (substats.joined || 0) + '</strong></span>' +
        '<span class="substat-item warning"><i class="fa-solid fa-clock"></i> Chờ duyệt: <strong>' + (substats.pending || 0) + '</strong></span>' +
        '<span class="substat-item danger"><i class="fa-solid fa-circle-xmark"></i> Chưa vào: <strong>' + (substats.notjoined || 0) + '</strong></span>';
    } else if (type === 'AUTO_JOIN') {
      substatsBox.innerHTML = 
        '<span class="substat-item success"><i class="fa-solid fa-circle-check"></i> Thành công: <strong>' + (substats.success || 0) + '</strong></span>' +
        '<span class="substat-item warning"><i class="fa-solid fa-clock"></i> Chờ duyệt: <strong>' + (substats.pending || 0) + '</strong></span>' +
        '<span class="substat-item danger"><i class="fa-solid fa-circle-xmark"></i> Lỗi: <strong>' + (substats.fail || 0) + '</strong></span>';
    }
  }
}

function updateGroupToolbarButtonsState(runningType, current, total) {
  const allBtns = [
    { id: 'btn-tool-scrape-groups', type: 'SCRAPE_GROUPS', label: 'Quét Nhóm Tự Động', icon: 'fa-magnifying-glass-location', color: '#06b6d4' },
    { id: 'btn-tool-scrape-leads', type: 'SCRAPE_LEADS', label: 'Cào Lead Tuyển Dụng', icon: 'fa-bolt', color: '#f59e0b' },
    { id: 'btn-tool-auto-join', type: 'AUTO_JOIN', label: 'Tự Động Xin Vào Nhóm', icon: 'fa-user-plus', color: '#f59e0b' },
    { id: 'btn-tool-realtime-verify', type: 'REALTIME_VERIFY', label: 'Quét Trạng Thái Realtime', icon: 'fa-satellite-dish', color: '#10b981' },
    { id: 'btn-tool-sync-joined', type: 'SYNC_JOINED', label: 'Đồng Bộ Nhóm Đã Vào Từ FB', icon: 'fa-facebook', color: '#1877f2', isBrand: true }
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
      btn.title = 'Đang có tiến trình quét tự động khác chạy ngầm...';
    }
  });
}

function dismissAutoBanner() {
  const banner = document.getElementById('group-automation-live-banner');
  if (banner) banner.style.display = 'none';
  if (autoBannerDismissTimeout) {
    clearTimeout(autoBannerDismissTimeout);
    autoBannerDismissTimeout = null;
  }
}

function openCurrentActiveAutoModal() {
  if (activeGroupAutoType === 'REALTIME_VERIFY') {
    openRealtimeVerifyModal();
  } else if (activeGroupAutoType === 'AUTO_JOIN') {
    openAutoJoinModal();
  } else if (activeGroupAutoType === 'SCRAPE_LEADS') {
    openScrapeLeadsModal();
  } else if (activeGroupAutoType === 'SCRAPE_GROUPS') {
    openScrapeGroupsModal();
  } else {
    openRealtimeVerifyModal();
  }
}

async function toggleCurrentActiveAutoPause() {
  if (activeGroupAutoType === 'REALTIME_VERIFY') {
    const badge = document.getElementById('auto-banner-badge');
    const isPaused = badge && badge.textContent.includes('tạm dừng');
    if (isPaused) {
      await resumeRealtimeVerify();
    } else {
      await pauseRealtimeVerify();
    }
  } else if (activeGroupAutoType === 'AUTO_JOIN') {
    const badge = document.getElementById('auto-banner-badge');
    const isPaused = badge && badge.textContent.includes('tạm dừng');
    if (isPaused) {
      await resumeAutoJoin();
    } else {
      await pauseAutoJoin();
    }
  }
}

async function stopCurrentActiveAuto() {
  if (activeGroupAutoType === 'REALTIME_VERIFY') {
    await stopRealtimeVerify();
  } else if (activeGroupAutoType === 'AUTO_JOIN') {
    await stopAutoJoin();
  }
}

async function checkActiveGroupAutomations() {
  try {
    const resVerify = await fetch('/api/groups/verify-batch/status');
    const dataVerify = await resVerify.json();
    if (dataVerify && dataVerify.success && dataVerify.data && dataVerify.data.isRunning) {
      if (verifyInterval) clearInterval(verifyInterval);
      verifyInterval = setInterval(pollRealtimeVerifyStatus, 1500);
      pollRealtimeVerifyStatus();
      return;
    }

    const resJoin = await fetch('/api/groups/join/status');
    const dataJoin = await resJoin.json();
    if (dataJoin && dataJoin.success && dataJoin.data && dataJoin.data.isRunning) {
      if (joinPollInterval) clearInterval(joinPollInterval);
      joinPollInterval = setInterval(pollJoinStatus, 1500);
      pollJoinStatus();
      return;
    }
  } catch (e) {}
}

let wasVerifyRunning = false;

async function startRealtimeBatchVerify() {
  const accId = document.getElementById('verify-account-select')?.value || state.currentAccountId;
  const scope = document.getElementById('verify-scope-select')?.value || 'ALL';

  let targetGroupIds = [];
  if (scope === 'UNJOINED_ONLY') {
    targetGroupIds = (state.groups || []).filter(g => g.isJoined !== true).map(g => g.id);
  } else if (scope === 'JOINED_ONLY') {
    targetGroupIds = (state.groups || []).filter(g => g.isJoined === true).map(g => g.id);
  } else if (scope === 'FILTERED') {
    targetGroupIds = (state.filteredGroups || []).map(g => g.id);
  } else {
    targetGroupIds = (state.groups || []).map(g => g.id);
  }

  if (targetGroupIds.length === 0) {
    showToast('Thông báo', 'Không có nhóm nào trong phạm vi đã chọn để kiểm tra.', 'info');
    return;
  }

  const btnStart = document.getElementById('btn-start-verify');
  const btnPause = document.getElementById('btn-pause-verify');
  const btnStop = document.getElementById('btn-stop-verify');

  if (btnStart) btnStart.style.display = 'none';
  if (btnPause) btnPause.style.display = 'inline-flex';
  if (btnStop) btnStop.style.display = 'inline-flex';

  document.getElementById('verify-stat-progress').textContent = `0 / ${targetGroupIds.length}`;
  document.getElementById('verify-progress-message').textContent = `Đang kết nối trình duyệt và bắt đầu kiểm tra...`;

  try {
    const res = await fetch('/api/groups/verify-batch/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groupIds: targetGroupIds,
        accountId: accId,
        delayMin: 2,
        delayMax: 3
      })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Bắt Đầu Quét Real-time', `Đang kiểm tra ${targetGroupIds.length} nhóm...`, 'success', 4000);
      if (verifyInterval) clearInterval(verifyInterval);
      verifyInterval = setInterval(pollRealtimeVerifyStatus, 1500);
    } else {
      showToast('Lỗi', result.message, 'danger');
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnPause) btnPause.style.display = 'none';
    if (btnStop) btnStop.style.display = 'none';
  }
}

async function pollRealtimeVerifyStatus() {
  try {
    const res = await fetch('/api/groups/verify-batch/status');
    const result = await res.json();

    if (!result.success || !result.data) return;
    const { isRunning, isPaused, progress, results, logs } = result.data;

    // Cập nhật counters
    const progressEl = document.getElementById('verify-stat-progress');
    const joinedEl = document.getElementById('verify-stat-joined');
    const notJoinedEl = document.getElementById('verify-stat-notjoined');
    const pendingEl = document.getElementById('verify-stat-pending');
    const errorEl = document.getElementById('verify-stat-error');
    const msgEl = document.getElementById('verify-progress-message');
    const pctEl = document.getElementById('verify-progress-percent');
    const barEl = document.getElementById('verify-progress-bar');

    if (progressEl) progressEl.textContent = `${progress.current} / ${progress.total}`;
    if (joinedEl) joinedEl.textContent = progress.joinedCount;
    if (notJoinedEl) notJoinedEl.textContent = progress.notJoinedCount;
    if (pendingEl) pendingEl.textContent = progress.pendingCount;
    if (errorEl) errorEl.textContent = progress.errorCount;
    if (msgEl) msgEl.textContent = progress.message;

    const pct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (barEl) barEl.style.width = `${pct}%`;

    // Cập nhật Logs
    const logBox = document.getElementById('verify-logs-box');
    if (logBox && logs && logs.length > 0) {
      logBox.innerHTML = logs.map(l => {
        let cls = 'log-info';
        if (l.type === 'error') cls = 'log-error';
        else if (l.type === 'success') cls = 'log-success';
        else if (l.type === 'warn') cls = 'log-warn';
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${escapeHtml(l.message)}</div>`;
      }).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }

    // Cập nhật Results Table
    const resContainer = document.getElementById('verify-results-container');
    const tbody = document.getElementById('verify-results-tbody');
    if (results && results.length > 0) {
      if (resContainer) resContainer.style.display = 'block';
      if (tbody) {
        tbody.innerHTML = results.slice(-15).reverse().map(r => {
          let badge = '<span class="badge-pill danger">Chưa vào</span>';
          if (r.isJoined) badge = '<span class="badge-pill success">Đã vào</span>';
          else if (r.isPending) badge = '<span class="badge-pill warning">Chờ duyệt</span>';
          else if (r.status === 'ERROR') badge = '<span class="badge-pill">Lỗi</span>';

          return `
            <tr>
              <td><strong>${escapeHtml(r.groupName)}</strong></td>
              <td>${badge}</td>
              <td><small style="color: var(--text-muted);">${escapeHtml(r.note || '')}</small></td>
              <td><small>${r.time || ''}</small></td>
            </tr>
          `;
        }).join('');
      }
    }

    // Điều khiển nút bấm
    const btnStart = document.getElementById('btn-start-verify');
    const btnPause = document.getElementById('btn-pause-verify');
    const btnResume = document.getElementById('btn-resume-verify');
    const btnStop = document.getElementById('btn-stop-verify');

    if (isRunning) {
      wasVerifyRunning = true;

      // Cập nhật banner trạng thái sống ngoài màn hình chính
      updateGroupAutoBanner({
        type: 'REALTIME_VERIFY',
        title: 'QUÉT TRẠNG THÁI REAL-TIME TỪ FACEBOOK',
        icon: 'fa-satellite-dish',
        badgeText: 'Đang chạy ngầm',
        isPaused,
        current: progress.current,
        total: progress.total,
        percent: pct,
        substats: {
          joined: progress.joinedCount || 0,
          pending: progress.pendingCount || 0,
          notjoined: progress.notJoinedCount || 0
        },
        isCompleted: false
      });

      // Cập nhật toàn bộ hàng nút bấm trên Action Toolbar
      updateGroupToolbarButtonsState('REALTIME_VERIFY', progress.current, progress.total);

      if (isPaused) {
        if (btnPause) btnPause.style.display = 'none';
        if (btnResume) btnResume.style.display = 'inline-flex';
      } else {
        if (btnPause) btnPause.style.display = 'inline-flex';
        if (btnResume) btnResume.style.display = 'none';
      }
      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';
    } else {
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'none';
      if (btnResume) btnResume.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';

      // Phát hiện thời điểm vừa hoàn tất quét nhóm
      if (wasVerifyRunning) {
        wasVerifyRunning = false;
        playNotificationChime(progress.errorCount === 0 ? 'success' : 'warn');
        sendDesktopNotification(
          '📡 Quét Real-time Hoàn Tất!',
          `Đã tham gia: ${progress.joinedCount || 0} nhóm | Chờ duyệt: ${progress.pendingCount || 0} | Chưa vào: ${progress.notJoinedCount || 0}`
        );
        showToast('Quét Real-time Hoàn Tất!', `Đã xác thực xong ${progress.total || 0} nhóm Facebook! (Đã vào: ${progress.joinedCount || 0}, Chưa vào: ${progress.notJoinedCount || 0})`, 'success', 8000);

        // Hiển thị banner hoàn tất ăn mừng trên màn hình
        updateGroupAutoBanner({
          type: 'REALTIME_VERIFY',
          title: 'QUÉT TRẠNG THÁI REAL-TIME TỪ FACEBOOK',
          icon: 'fa-circle-check',
          current: progress.total,
          total: progress.total,
          percent: 100,
          substats: {
            joined: progress.joinedCount || 0,
            pending: progress.pendingCount || 0,
            notjoined: progress.notJoinedCount || 0
          },
          isCompleted: true
        });

        // Đưa bộ nút bấm trở về bình thường
        updateGroupToolbarButtonsState(null);

        showProcessResultModal({
          title: 'Quét & Xác Thực Trạng Thái Nhóm Real-Time',
          subtitle: `Đã kiểm tra thực tế trên Facebook cho ${progress.total || 0} hội nhóm.`,
          okCount: progress.joinedCount || 0,
          pendingCount: progress.pendingCount || 0,
          failCount: progress.errorCount || 0,
          results: results || []
        });

        // Làm mới toàn bộ dữ liệu nhóm trên Dashboard khi hoàn tất
        const accId = document.getElementById('verify-account-select')?.value || state.currentAccountId;
        await loadGroups(accId);
        await loadAccountsData();
      }

      if (verifyInterval) {
        clearInterval(verifyInterval);
        verifyInterval = null;
      }
    }
  } catch (e) {}
}

async function pauseRealtimeVerify() {
  try {
    await fetch('/api/groups/verify-batch/pause', { method: 'POST' });
    showToast('Tạm dừng', 'Đã gửi lệnh tạm dừng quét.', 'info');
  } catch (e) {}
}

async function resumeRealtimeVerify() {
  try {
    await fetch('/api/groups/verify-batch/resume', { method: 'POST' });
    showToast('Tiếp tục', 'Tiếp tục kiểm tra nhóm...', 'info');
  } catch (e) {}
}

async function stopRealtimeVerify() {
  try {
    await fetch('/api/groups/verify-batch/stop', { method: 'POST' });
    showToast('Dừng quét', 'Đã gửi lệnh dừng tiến trình.', 'warn');
  } catch (e) {}
}

function removeVietnameseTones(str) {
  if (!str) return '';
  str = String(str).toLowerCase().trim();
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  str = str.replace(/[đĐ]/g, 'd');
  return str;
}

function detectProvinceKey(text) {
  if (!text) return null;
  const norm = removeVietnameseTones(text);
  if (norm.includes('da nang') || norm.includes('dn')) return 'DANANG';
  if (norm.includes('ho chi minh') || norm.includes('hcm') || norm.includes('sai gon') || norm.includes('tphcm') || norm.includes('binh thanh') || norm.includes('tan phu') || norm.includes('thu duc')) return 'HCM';
  if (norm.includes('binh duong') || norm.includes('thu dau mot') || norm.includes('di an') || norm.includes('thuan an') || norm.includes('ben cat')) return 'BINHDUONG';
  if (norm.includes('ha noi') || norm.includes('hn')) return 'HANOI';
  if (norm.includes('quang nam') || norm.includes('tam ky') || norm.includes('hoi an')) return 'QUANGNAM';
  if (norm.includes('dong nai') || norm.includes('bien hoa')) return 'DONGNAI';
  if (norm.includes('hai phong')) return 'HAIPHONG';
  if (norm.includes('can tho')) return 'CANTHO';
  if (norm.includes('toan quoc')) return 'ALL';
  return null;
}

function computeGroupMatch(job, group) {
  if (!job || !group) return { score: 0, reasons: [], isDistrictMatch: false, isIndustryMatch: false, isProvinceMatch: false };

  const reasons = [];
  let score = 0;

  const jobTitleLower = (job.title || '').toLowerCase();
  const jobTitleNorm = removeVietnameseTones(job.title);
  const jobCompanyLower = (job.company || '').toLowerCase();
  const jobIndustryLower = (job.industry || '').toLowerCase();
  const jobIndustryNorm = removeVietnameseTones(job.industry);
  const jobLocText = ((job.province || '') + ' ' + (job.location || '') + ' ' + (job.detailedLocation || '')).toLowerCase();
  const jobLocNorm = removeVietnameseTones(jobLocText);
  const jobExpText = ((job.requirements || '') + ' ' + (job.description || '') + ' ' + (job.experience || '') + ' ' + (job.kinh_nghiem || '')).toLowerCase();

  const groupNameLower = (group.name || '').toLowerCase();
  const groupNameNorm = removeVietnameseTones(group.name);
  const groupProvinceLower = (group.province || '').toLowerCase();
  const groupProvinceNorm = removeVietnameseTones(group.province);
  const groupCategoryLower = (group.category || '').toLowerCase();
  const groupCategoryNorm = removeVietnameseTones(group.category);

  // KIỂM TRA ĐỐI TƯỢNG: SINH VIÊN / THỰC TẬP VS TIN YÊU CẦU KINH NGHIỆM
  const isStudentGroup = groupNameLower.includes('sinh viên') || groupNameLower.includes('thực tập') || groupNameLower.includes('intern') || groupNameLower.includes('thời vụ') || groupCategoryLower.includes('sinh viên');
  const isStudentJob = jobTitleLower.includes('sinh viên') || jobTitleLower.includes('thực tập') || jobTitleLower.includes('intern') || jobTitleLower.includes('part-time') || jobTitleLower.includes('thời vụ') || jobExpText.includes('không yêu cầu kinh nghiệm');
  const isExperienceJob = jobExpText.includes('kinh nghiệm') || jobExpText.includes('năm') || jobTitleLower.includes('interior') || jobTitleLower.includes('thiết kế') || jobTitleLower.includes('kiến trúc') || jobTitleLower.includes('kỹ sư') || jobTitleLower.includes('trưởng') || jobTitleLower.includes('chuyên viên');

  // Nếu tin yêu cầu kinh nghiệm chuyên môn mà nhóm là nhóm sinh viên/thời vụ -> Loại trừ
  if (isStudentGroup && isExperienceJob && !isStudentJob) {
    return {
      score: 0,
      reasons: [{ icon: 'fa-solid fa-user-xmark', text: 'Nhóm Sinh Viên (Tin yêu cầu kinh nghiệm)', type: 'mismatch' }],
      isDistrictMatch: false,
      isIndustryMatch: false,
      isProvinceMatch: false
    };
  }

  // 1. NHẬN DIỆN VÀ SO SÁNH TỈNH THÀNH (PROVINCE MATCHING)
  const jobProvinceKey = detectProvinceKey(jobLocText);
  const groupProvinceKey = detectProvinceKey((group.province || '') + ' ' + (group.name || ''));
  const isGroupNationwide = groupProvinceNorm.includes('toan quoc') || groupNameNorm.includes('toan quoc') || groupProvinceKey === 'ALL';

  let isProvinceMatch = false;

  // Nếu cả 2 đều có Tỉnh/Thành cụ thể nhưng KHÁC NHAU hoàn toàn -> LOẠI TRỪ (Không đăng việc Đà Nẵng vào nhóm TP.HCM/Bình Dương)
  if (jobProvinceKey && groupProvinceKey && groupProvinceKey !== 'ALL' && jobProvinceKey !== groupProvinceKey) {
    return {
      score: 0,
      reasons: [{ icon: 'fa-solid fa-ban', text: `Khác Tỉnh/Thành (${group.province || 'Khu vực khác'})`, type: 'mismatch' }],
      isDistrictMatch: false,
      isIndustryMatch: false,
      isProvinceMatch: false
    };
  }

  if (jobProvinceKey && groupProvinceKey && jobProvinceKey === groupProvinceKey) {
    isProvinceMatch = true;
    score += 50;
    const provLabels = {
      DANANG: 'Đà Nẵng',
      HCM: 'TP. Hồ Chí Minh',
      BINHDUONG: 'Bình Dương',
      HANOI: 'Hà Nội',
      QUANGNAM: 'Quảng Nam',
      DONGNAI: 'Đồng Nai',
      HAIPHONG: 'Hải Phòng',
      CANTHO: 'Cần Thơ'
    };
    reasons.push({ icon: 'fa-solid fa-map-pin', text: `Khu vực ${provLabels[jobProvinceKey] || group.province || 'Mục tiêu'}`, type: 'high' });
  } else if (isGroupNationwide) {
    score += 20;
    reasons.push({ icon: 'fa-solid fa-globe', text: 'Nhóm Toàn Quốc', type: 'medium' });
  }

  // 2. KIỂM TRA KHỚP QUẬN / HUYỆN (DISTRICT MATCH)
  let isDistrictMatch = false;
  let relevantDistricts = [];

  if (jobProvinceKey === 'DANANG') {
    relevantDistricts = ['liên chiểu', 'hải châu', 'thanh khê', 'sơn trà', 'ngũ hành sơn', 'cẩm lệ', 'hòa vang'];
  } else if (jobProvinceKey === 'HCM') {
    relevantDistricts = ['bình thạnh', 'tân phú', 'gò vấp', 'tân bình', 'quận 1', 'quận 2', 'quận 3', 'quận 7', 'quận 9', 'quận 12', 'bình chánh', 'thủ đức', 'bình tân', 'hóc môn', 'củ chi', 'nhà bè'];
  } else if (jobProvinceKey === 'BINHDUONG') {
    relevantDistricts = ['thủ dầu một', 'dĩ an', 'thuận an', 'bến cát', 'tân uyên', 'bàu bàng'];
  } else if (jobProvinceKey === 'HANOI') {
    relevantDistricts = ['cầu giấy', 'đống đa', 'hoàng mai', 'nam từ liêm', 'bắc từ liêm', 'ba đình', 'hoàn kiếm', 'hai bà trưng', 'thanh xuân', 'hà đông', 'long biên'];
  } else {
    relevantDistricts = ['quận 1', 'quận 2', 'quận 3', 'bình thạnh', 'tân phú', 'thủ dầu một', 'cầu giấy', 'hải châu', 'liên chiểu'];
  }

  for (const d of relevantDistricts) {
    const dNorm = removeVietnameseTones(d);
    if (groupNameNorm.includes(dNorm) || groupCategoryNorm.includes(dNorm)) {
      if (jobLocNorm.includes(dNorm)) {
        isDistrictMatch = true;
        score += 40;
        const dName = d.charAt(0).toUpperCase() + d.slice(1);
        reasons.push({ icon: 'fa-solid fa-location-crosshairs', text: `Đúng ${dName}`, type: 'district' });
      }
      break;
    }
  }

  // 3. KIỂM TRA KHỚP NGÀNH NGHỀ & CHUYÊN MÔN (INDUSTRY MATCH)
  let isIndustryMatch = false;

  // A. Ngành Thiết kế / Nội thất / Xây dựng / 2D / 3D
  const isJobInterior = jobTitleNorm.includes('2d') || jobTitleNorm.includes('3d') || jobTitleNorm.includes('noi that') || jobTitleNorm.includes('thiet ke') || jobTitleNorm.includes('kien truc') || jobTitleNorm.includes('kts') || jobTitleNorm.includes('xay dung') || jobTitleNorm.includes('do hoa') || jobIndustryNorm.includes('noi that') || jobCompanyLower.includes('homes') || jobCompanyLower.includes('iris');
  if (isJobInterior) {
    const isGroupInterior = groupNameNorm.includes('2d') || groupNameNorm.includes('3d') || groupNameNorm.includes('noi that') || groupNameNorm.includes('thiet ke') || groupNameNorm.includes('kien truc') || groupNameNorm.includes('xay dung') || groupNameNorm.includes('kts') || groupNameNorm.includes('do hoa') || groupNameNorm.includes('ngoai that') || groupCategoryNorm.includes('noi that') || groupCategoryNorm.includes('kien truc');
    if (isGroupInterior) {
      isIndustryMatch = true;
      score += 50;
      reasons.push({ icon: 'fa-solid fa-briefcase', text: 'Ngành Thiết Kế / Nội Thất', type: 'high' });
    }
  }

  // B. Ngành Kinh doanh / Bán hàng / Sales Online / Telesales
  const isJobSales = jobTitleNorm.includes('sale') || jobTitleNorm.includes('kinh doanh') || jobTitleNorm.includes('ban hang') || jobTitleNorm.includes('telesale') || jobTitleNorm.includes('tu van') || jobIndustryNorm.includes('kinh doanh') || jobIndustryNorm.includes('ban hang');
  if (isJobSales) {
    const isGroupSales = groupNameNorm.includes('sale') || groupNameNorm.includes('kinh doanh') || groupNameNorm.includes('ban hang') || groupCategoryNorm.includes('kinh doanh');
    if (isGroupSales) {
      isIndustryMatch = true;
      score += 40;
      reasons.push({ icon: 'fa-solid fa-chart-line', text: 'Ngành Kinh Doanh / Sales', type: 'high' });
    }
  }

  // C. Nhóm việc làm tổng hợp tại đúng tỉnh thành (hub tuyển dụng chính)
  const isGeneralRecruitmentGroup = groupNameNorm.includes('viec lam') || groupNameNorm.includes('tuyen dung') || groupNameNorm.includes('tim viec') || groupCategoryNorm.includes('tong hop') || groupCategoryNorm.includes('tuyen dung');
  if (isProvinceMatch && isGeneralRecruitmentGroup && !isIndustryMatch) {
    score += 20;
    reasons.push({ icon: 'fa-solid fa-bullhorn', text: 'Hội Tuyển Dụng Tổng Hợp', type: 'medium' });
  }

  return {
    score,
    reasons,
    isDistrictMatch,
    isIndustryMatch,
    isProvinceMatch
  };
}

let activeControllerGroupFilter = 'ALL_MATCHED';

function filterControllerGroups(filterType) {
  activeControllerGroupFilter = filterType;

  ['pill-all-smart', 'pill-province', 'pill-district', 'pill-industry', 'pill-joined', 'pill-all'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  if (filterType === 'ALL_MATCHED') document.getElementById('pill-all-smart')?.classList.add('active');
  else if (filterType === 'PROVINCE') document.getElementById('pill-province')?.classList.add('active');
  else if (filterType === 'DISTRICT') document.getElementById('pill-district')?.classList.add('active');
  else if (filterType === 'INDUSTRY') document.getElementById('pill-industry')?.classList.add('active');
  else if (filterType === 'JOINED_ONLY') document.getElementById('pill-joined')?.classList.add('active');
  else if (filterType === 'ALL') document.getElementById('pill-all')?.classList.add('active');

  renderGroupCheckboxList();
}

function renderGroupCheckboxList() {
  const container = document.getElementById('group-checkbox-list');
  if (!container) return;
  container.innerHTML = '';

  if (state.groups.length === 0) {
    container.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 15px;">Danh sách Nhóm trống. Hãy thêm nhóm tại Tab Quản Lý Hội Nhóm.</div>`;
    return;
  }

  // Tính điểm match cho tất cả nhóm theo bài viết đang chọn
  const groupsWithScore = state.groups.map(g => {
    const matchInfo = computeGroupMatch(state.selectedJob, g);
    return {
      ...g,
      matchScore: matchInfo.score,
      reasons: matchInfo.reasons,
      isDistrictMatch: matchInfo.isDistrictMatch,
      isIndustryMatch: matchInfo.isIndustryMatch,
      isProvinceMatch: matchInfo.isProvinceMatch
    };
  });

  // Cập nhật số lượng trên các filter pills
  const matchedCount = groupsWithScore.filter(g => g.matchScore >= 35).length;
  const provinceCount = groupsWithScore.filter(g => g.isProvinceMatch).length;
  const districtCount = groupsWithScore.filter(g => g.isDistrictMatch).length;
  const industryCount = groupsWithScore.filter(g => g.isIndustryMatch).length;
  const joinedCount = groupsWithScore.filter(g => g.isJoined === true).length;
  const allCount = groupsWithScore.length;

  if (document.getElementById('count-matched-groups')) document.getElementById('count-matched-groups').textContent = matchedCount;
  if (document.getElementById('count-province-groups')) document.getElementById('count-province-groups').textContent = provinceCount;
  if (document.getElementById('count-district-groups')) document.getElementById('count-district-groups').textContent = districtCount;
  if (document.getElementById('count-industry-groups')) document.getElementById('count-industry-groups').textContent = industryCount;
  if (document.getElementById('count-joined-groups')) document.getElementById('count-joined-groups').textContent = joinedCount;
  if (document.getElementById('count-all-groups')) document.getElementById('count-all-groups').textContent = allCount;

  // Lọc danh sách theo filter đang chọn
  let displayGroups = groupsWithScore;
  if (activeControllerGroupFilter === 'JOINED_ONLY') {
    displayGroups = groupsWithScore.filter(g => g.isJoined === true);
  } else if (state.selectedJob) {
    if (activeControllerGroupFilter === 'ALL_MATCHED') {
      displayGroups = groupsWithScore.filter(g => g.matchScore >= 35);
    } else if (activeControllerGroupFilter === 'PROVINCE') {
      displayGroups = groupsWithScore.filter(g => g.isProvinceMatch);
    } else if (activeControllerGroupFilter === 'DISTRICT') {
      displayGroups = groupsWithScore.filter(g => g.isDistrictMatch);
    } else if (activeControllerGroupFilter === 'INDUSTRY') {
      displayGroups = groupsWithScore.filter(g => g.isIndustryMatch);
    }
  }

  // Sắp xếp nhóm: điểm match cao nhất lên đầu
  displayGroups.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));

  if (displayGroups.length === 0) {
    const jobLoc = state.selectedJob ? (state.selectedJob.location || state.selectedJob.province || 'khu vực này') : 'tin này';
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 25px 15px; border: 1px dashed var(--border-color); border-radius: var(--radius-md); background: rgba(239, 68, 68, 0.03);">
        <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.8rem; color: var(--warning); margin-bottom: 8px; display: block;"></i>
        <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Không tìm thấy nhóm mục tiêu phù hợp cho ${escapeHtml(jobLoc)} trong bộ lọc này</div>
        <div style="font-size: 0.85rem;">Bạn có thể bấm sang <strong>"Tất Cả"</strong> hoặc vào Tab <strong>"Quản Lý Hội Nhóm"</strong> để thêm nhóm tại ${escapeHtml(jobLoc)}.</div>
      </div>
    `;
    return;
  }

  displayGroups.forEach(g => {
    const isChecked = state.selectedGroupIds.has(g.id);
    const item = document.createElement('div');
    item.className = 'group-checkbox-item';
    item.onclick = () => toggleSelectGroup(g.id);

    // Render tag lý do gợi ý với Font Awesome
    let reasonBadges = '';
    if (g.reasons && g.reasons.length > 0) {
      reasonBadges = g.reasons.map(r => {
        return `<span class="match-reason-tag ${r.type}"><i class="${r.icon}"></i> ${escapeHtml(r.text)}</span>`;
      }).join('');
    }

    // Badge trạng thái đã tham gia / chưa vào nhóm
    let membershipBadge = '';
    if (g.isJoined === true) {
      membershipBadge = `<span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-check"></i> Đã tham gia</span>`;
    } else if (g.isJoined === false || g.status === 'NOT_JOINED') {
      membershipBadge = `<span class="badge-pill danger" style="font-size: 0.72rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-user-plus"></i> Chưa vào nhóm</span>`;
    } else {
      membershipBadge = `<span class="badge-pill warning" style="font-size: 0.72rem; padding: 2px 7px; display: inline-flex; align-items: center; gap: 4px;"><i class="fa-solid fa-circle-question"></i> Chưa xác thực</span>`;
    }

    let provClean = (g.province || '').trim();
    if (!provClean || provClean.length <= 1 || provClean.toLowerCase() === 'a') {
      provClean = 'Toàn quốc';
    }

    let membersClean = (g.members || '').trim();
    if (!membersClean || membersClean === 'N/A' || membersClean === 'UNKNOWN') {
      membersClean = 'Cộng đồng Facebook';
    } else if (!membersClean.toLowerCase().includes('thành viên') && !membersClean.toLowerCase().includes('member')) {
      membersClean += ' thành viên';
    }

    item.innerHTML = `
      <input type="checkbox" ${isChecked ? 'checked' : ''} onclick="event.stopPropagation(); toggleSelectGroup('${g.id}')">
      <div class="group-info" style="flex: 1;">
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span class="name" style="font-weight: 600;">${escapeHtml(g.name)}</span>
            ${membershipBadge}
          </div>
          <div>${reasonBadges}</div>
        </div>
        <span class="province"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(provClean)} &bull; ${escapeHtml(membersClean)}</span>
      </div>
    `;
    container.appendChild(item);
  });

  // Cập nhật số lượng trên nút đăng bài dưới cùng
  const countEl = document.getElementById('btn-post-group-count');
  if (countEl) countEl.textContent = `${state.selectedGroupIds.size}`;
  const bottomBtn = document.getElementById('btn-start-campaign-bottom');
  if (bottomBtn) {
    bottomBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> BẮT ĐẦU ĐĂNG BÀI LÊN ${state.selectedGroupIds.size} NHÓM ĐÃ CHỌN`;
  }
}

function selectOnlyMatchedGroups() {
  if (!state.selectedJob) {
    alert('Vui lòng chọn bài viết trước!');
    return;
  }

  state.selectedGroupIds.clear();
  state.groups.forEach(g => {
    const match = computeGroupMatch(state.selectedJob, g);
    if (match.score >= 35) {
      state.selectedGroupIds.add(g.id);
    }
  });

  renderGroupCheckboxList();
  alert(`Đã tự động chọn ${state.selectedGroupIds.size} Hội Nhóm phù hợp nhất cho tin này!`);
}

function toggleSelectGroup(id) {
  if (state.selectedGroupIds.has(id)) {
    state.selectedGroupIds.delete(id);
  } else {
    state.selectedGroupIds.add(id);
  }
  renderGroupCheckboxList();
}

function toggleSelectAllGroups() {
  if (state.selectedGroupIds.size === state.groups.length) {
    state.selectedGroupIds.clear();
  } else {
    state.groups.forEach(g => state.selectedGroupIds.add(g.id));
  }
  renderGroupCheckboxList();
}

function deselectAllGroups() {
  state.selectedGroupIds.clear();
  renderGroupCheckboxList();
}

async function deleteGroup(id) {
  if (!confirm('Bạn có chắc muốn xóa Hội Nhóm này khỏi danh sách mục tiêu?')) return;

  try {
    const res = await fetch(`/api/groups/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      state.selectedGroupIds.delete(id);
      loadGroups();
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

// =========================================================
// 6. ĐIỀU KHIỂN ĐĂNG BÀI (CONTROLLER)
// =========================================================
function selectJobForCampaign(jobId) {
  const job = state.sheetJobs.find(j => String(j.id) === String(jobId));
  if (!job) return;

  state.selectedJob = job;
  renderSelectedJobPreview();

  // 1. TỰ ĐỘNG KHỚP ẢNH THEO ĐÚNG VỊ TRÍ TUYỂN DỤNG
  state.selectedImageFilenames.clear(); // Luôn làm mới để không dính ảnh sót từ tin trước
  if (state.images.length > 0) {
    const jobTitleNorm = removeVietnameseTones(job.title);
    
    // Tìm ảnh có tên khớp với chức danh/ngành nghề
    const matchedImg = state.images.find(img => {
      const fnNorm = removeVietnameseTones(img.filename);
      const fn = img.filename.toLowerCase();
      
      // Khớp vị trí 2D
      if (jobTitleNorm.includes('2d') && (fnNorm.includes('2d') || fn.includes('2d'))) return true;
      // Khớp vị trí 3D
      if (jobTitleNorm.includes('3d') && (fnNorm.includes('3d') || fn.includes('3d'))) return true;
      // Khớp Thiết Kế / Nội Thất
      if ((jobTitleNorm.includes('noi that') || jobTitleNorm.includes('interior')) && 
          (fnNorm.includes('noi_that') || fnNorm.includes('noithat') || fnNorm.includes('interior'))) return true;
      // Khớp Sales / Bán hàng / Kinh doanh
      if ((jobTitleNorm.includes('sales') || jobTitleNorm.includes('kinh doanh') || jobTitleNorm.includes('ban hang')) &&
          (fnNorm.includes('sale') || fnNorm.includes('kinh_doanh') || fnNorm.includes('kd'))) return true;
      // Khớp Kế toán
      if (jobTitleNorm.includes('ke toan') && (fnNorm.includes('ke_toan') || fnNorm.includes('ketoan'))) return true;
      
      return false;
    });

    if (matchedImg) {
      state.selectedImageFilenames.add(matchedImg.filename);
      appendTerminalLog(`[ẢNH TỰ ĐỘNG] Đã chọn ảnh phù hợp với vị trí "${job.title}": ${matchedImg.filename}`, 'info');
    } else {
      // TUYỆT ĐỐI KHÔNG TỰ Ý GẮN ẢNH VỊ TRÍ KHÁC (như 2D, 3D) NẾU KHÔNG PHÙ HỢP!
      // Để trống để người dùng tự chọn hoặc tải ảnh mới
      appendTerminalLog(`[ẢNH] Vị trí "${job.title}" chưa có ảnh riêng trong kho. Giữ trống ảnh để người dùng tự chọn.`, 'info');
    }
  }
  renderSelectedImagesStrip();

  // 2. TỰ ĐỘNG TÌM VÀ CHỌN CÁC NHÓM MỤC TIÊU PHÙ HỢP NHẤT CHO TIN NÀY
  state.selectedGroupIds.clear();
  const matched = state.groups.filter(g => computeGroupMatch(job, g).score >= 35);
  if (matched.length > 0) {
    matched.forEach(g => state.selectedGroupIds.add(g.id));
    filterControllerGroups('ALL_MATCHED');
  } else {
    // Nếu không có nhóm nào phù hợp khu vực, KHÔNG tự chọn toàn bộ nhóm tỉnh khác
    filterControllerGroups('ALL');
    const locText = job.location || job.province || 'khu vực này';
    showToast('Chưa có nhóm khớp khu vực', `Không tìm thấy nhóm mục tiêu tại ${locText} trong danh sách hiện có. Bạn có thể thêm nhóm tại Tab Quản Lý Hội Nhóm.`, 'warning', 6000);
  }

  renderGroupCheckboxList();
  selectMatchedFanpages();
  updatePublishChannelUI();
  switchTab('controller-tab');
}

function renderSelectedJobPreview() {
  const container = document.getElementById('selected-job-preview');
  if (!state.selectedJob) {
    container.innerHTML = `
      <div class="empty-state">
        <i class="fa-solid fa-hand-pointer"></i>
        <p>Chưa chọn bài viết. Vui lòng bấm <strong>"Chọn Đăng Nhóm"</strong> tại Tab Google Sheets.</p>
      </div>
    `;
    return;
  }

  const job = state.selectedJob;
  const postText = job.formattedGroupPost || job.description || '';
  const linesCount = postText.split('\n').filter(Boolean).length;
  const charCount = postText.length;

  container.innerHTML = `
    <div class="job-card-active">
      <div class="job-header" style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 10px;">
        <div>
          <span class="badge-pill success"><i class="fa-solid fa-check"></i> Đang chọn đăng</span>
          <h3 style="margin-top: 6px; margin-bottom: 4px; font-size: 1.15rem;">${escapeHtml(job.title)}</h3>
          <span style="color: var(--text-muted); font-size: 0.85rem;"><i class="fa-solid fa-building"></i> ${escapeHtml(job.company || 'N/A')} &bull; <i class="fa-solid fa-location-dot"></i> ${escapeHtml(job.location || job.province || 'Toàn quốc')}</span>
        </div>
        <div style="display: flex; gap: 6px; flex-wrap: wrap;">
          <button class="btn btn-sm btn-outline" onclick="regenerateUltraShortPost()" title="Định dạng lại bài đăng đầy đủ chuẩn tuyển dụng: Mô tả, Yêu cầu, Lương & Quyền lợi, Liên hệ" style="font-size: 0.8rem; font-weight: 600; color: var(--primary); border-color: var(--primary);">
            <i class="fa-solid fa-wand-magic-sparkles"></i> Định Dạng Chuẩn Tuyển Dụng
          </button>
          <button class="btn btn-sm btn-outline" onclick="copyPostPreviewText()" title="Sao chép nội dung bài đăng" style="font-size: 0.8rem;">
            <i class="fa-regular fa-copy"></i> Sao chép
          </button>
        </div>
      </div>
      <div style="margin-top: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; font-size: 0.82rem; color: var(--text-dim);">
          <span><i class="fa-solid fa-pen-nib text-primary"></i> <strong>Nội dung bài đăng</strong> <em>(Đầy đủ nội dung tuyển dụng – có thể gõ chỉnh sửa trực tiếp):</em></span>
          <span id="post-meta-stats" style="font-weight: 600; color: var(--text-main);">${linesCount} dòng &bull; ${charCount} ký tự</span>
        </div>
        <textarea id="edit-post-content" class="post-preview-textarea" rows="15" oninput="handlePostContentEdit(this)" placeholder="Nội dung bài đăng lên nhóm...">${escapeHtml(postText)}</textarea>
      </div>
    </div>
  `;
}

function handlePostContentEdit(textarea) {
  if (state.selectedJob) {
    state.selectedJob.formattedGroupPost = textarea.value;
    const linesCount = textarea.value.split('\n').filter(Boolean).length;
    const charCount = textarea.value.length;
    const statsEl = document.getElementById('post-meta-stats');
    if (statsEl) statsEl.textContent = `${linesCount} dòng • ${charCount} ký tự`;
  }
}

async function regenerateUltraShortPost() {
  if (!state.selectedJob) return;
  try {
    const res = await fetch('/api/sheet/jobs?force=true');
    const result = await res.json();
    if (result.success && result.data) {
      state.sheetJobs = result.data;
      const freshJob = result.data.find(j => String(j.id) === String(state.selectedJob.id));
      if (freshJob) {
        state.selectedJob = freshJob;
        renderSelectedJobPreview();
        showToast('Định dạng chuẩn tuyển dụng', 'Đã cập nhật bài đăng đầy đủ nội dung: Mô tả, Yêu cầu, Lương & Quyền lợi, Liên hệ!', 'success');
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function copyPostPreviewText() {
  const textarea = document.getElementById('edit-post-content');
  if (textarea) {
    navigator.clipboard.writeText(textarea.value);
    showToast('Đã sao chép', 'Đã copy nội dung bài đăng vào clipboard!', 'info');
  }
}

async function startCampaign() {
  if (!state.selectedJob) {
    alert('Vui lòng chọn bài viết từ Google Sheets hoặc Scraper Leads trước!');
    switchTab('sheet-tab');
    return;
  }

  const publishGroups = state.publishChannels.groups;
  const publishFanpages = state.publishChannels.fanpages;

  if (!publishGroups && !publishFanpages) {
    alert('Vui lòng chọn ít nhất 1 kênh phân phối (Hội Nhóm hoặc Hệ Thống Fanpage)!');
    return;
  }

  if (publishGroups && state.selectedGroupIds.size === 0 && !publishFanpages) {
    alert('Vui lòng tích chọn ít nhất 1 Hội Nhóm Facebook mục tiêu!');
    return;
  }

  if (publishFanpages && state.selectedFanpageIds.size === 0 && !publishGroups) {
    alert('Vui lòng tích chọn ít nhất 1 Fanpage mục tiêu hoặc bấm "Khớp Theo Tin"!');
    return;
  }

  const selectedImages = Array.from(state.selectedImageFilenames);

  // 1. NẾU CÓ BẬT KÊNH FANPAGE VÀ CÓ CHỌN FANPAGE: ĐĂNG FANPAGE QUA GRAPH API TRƯỚC HOẶC ĐỒNG THỜI
  if (publishFanpages && state.selectedFanpageIds.size > 0) {
    appendTerminalLog(`[OMNI-CHANNEL] Đang xuất bản bài đăng "${state.selectedJob.title}" lên ${state.selectedFanpageIds.size} Fanpage qua Meta Graph API...`, 'info');
    showToast('Đang đăng Fanpage', `Đang xuất bản lên ${state.selectedFanpageIds.size} Fanpage...`, 'info', 4000);
    try {
      const fpRes = await fetch('/api/fanpages/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: state.selectedJob,
          fanpageIds: Array.from(state.selectedFanpageIds),
          selectedImages
        })
      });
      const fpResult = await fpRes.json();
      if (fpResult.success) {
        appendTerminalLog(`[FANPAGE THÀNH CÔNG] Đã xuất bản lên ${fpResult.data.results.length} Fanpage (Thành công: ${fpResult.data.successCount}, Lỗi: ${fpResult.data.failedCount}).`, 'success');
        showToast('Fanpage thành công', `Đã đăng lên ${fpResult.data.successCount}/${fpResult.data.results.length} Fanpage thành công!`, 'success', 5000);
        setTimeout(loadHistoryData, 1000);
      } else {
        appendTerminalLog(`[FANPAGE LỖI] ${fpResult.message}`, 'error');
        showToast('Lỗi xuất bản Fanpage', fpResult.message, 'warning', 6000);
      }
    } catch (fpErr) {
      appendTerminalLog(`[FANPAGE LỖI KẾT NỐI] ${fpErr.message}`, 'error');
      showToast('Lỗi kết nối Fanpage', fpErr.message, 'danger', 6000);
    }
  }

  // 2. NẾU CÓ BẬT KÊNH HỘI NHÓM VÀ CÓ CHỌN NHÓM: BẮT ĐẦU CHIẾN DỊCH PUPPETEER GROUP
  if (publishGroups && state.selectedGroupIds.size > 0) {
    const speedSelect = document.getElementById('campaign-speed-select');
    const speedMode = speedSelect ? speedSelect.value : 'BALANCED';
    let delayConfig = { minDelay: 45, maxDelay: 90 };
    if (speedMode === 'SUPER_FAST') {
      delayConfig = { minDelay: 10, maxDelay: 20 };
    } else if (speedMode === 'FAST') {
      delayConfig = { minDelay: 20, maxDelay: 45 };
    } else if (speedMode === 'BALANCED') {
      delayConfig = { minDelay: 45, maxDelay: 90 };
    } else if (speedMode === 'VERY_SAFE' || speedMode === 'MAX_SAFE') {
      delayConfig = { minDelay: 120, maxDelay: 240 };
    }

    try {
      const res = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job: state.selectedJob,
          groupIds: Array.from(state.selectedGroupIds),
          selectedImages,
          delayConfig
        })
      });
      const result = await res.json();

      if (result.success) {
        showToast('Bắt đầu chiến dịch nhóm!', `Đang đăng bài "${state.selectedJob.title}" lên ${state.selectedGroupIds.size} nhóm (${delayConfig.minDelay}s - ${delayConfig.maxDelay}s/nhóm)...`, 'info', 5000);
        appendTerminalLog(`[BẮT ĐẦU CHIẾN DỊCH NHÓM] Đã kích hoạt chiến dịch đăng "${state.selectedJob.title}" kèm ${selectedImages.length} ảnh (Tốc độ: ${delayConfig.minDelay}s - ${delayConfig.maxDelay}s, bảo vệ nghỉ 3p mỗi 5 nhóm).`, 'success');
        document.getElementById('btn-start-campaign').style.display = 'none';
        document.getElementById('btn-pause-campaign').style.display = 'inline-flex';
        document.getElementById('btn-stop-campaign').style.display = 'inline-flex';
        document.getElementById('campaign-stats-card').style.display = 'block';
      } else {
        showToast('Không thể bắt đầu nhóm', result.message, 'danger', 6000);
        alert(`Không thể bắt đầu đăng nhóm: ${result.message}`);
      }
    } catch (err) {
      showToast('Lỗi kết nối nhóm', err.message, 'danger', 6000);
      alert(`Lỗi kết nối nhóm: ${err.message}`);
    }
  } else if (!publishGroups) {
    appendTerminalLog(`[OMNI-CHANNEL] Đã xuất bản xong kênh Fanpage. Kênh Hội nhóm đang tắt.`, 'info');
  }
}

function handleSpeedChange() {
  const sel = document.getElementById('campaign-speed-select');
  const badge = document.getElementById('speed-label-badge');
  if (!sel || !badge) return;
  const val = sel.value;
  if (val === 'SUPER_FAST') {
    badge.textContent = '10s – 20s / Nhóm (Tốc độ cao - Nguy cơ gậy)';
    badge.className = 'speed-badge danger';
  } else if (val === 'FAST') {
    badge.textContent = '20s – 45s / Nhóm (Nhanh & Ổn định)';
    badge.className = 'speed-badge warning';
  } else if (val === 'BALANCED') {
    badge.textContent = '45s – 90s / Nhóm (Khuyên dùng)';
    badge.className = 'speed-badge success';
  } else if (val === 'VERY_SAFE' || val === 'MAX_SAFE') {
    badge.textContent = '120s – 240s / Nhóm (Rất an toàn - Nick mới)';
    badge.className = 'speed-badge purple';
  }
}


async function pauseCampaign() {
  try {
    await fetch('/api/campaign/pause', { method: 'POST' });
    showToast('Tạm dừng chiến dịch', 'Chiến dịch đăng bài đang được tạm dừng.', 'warning');
    const btnPause = document.getElementById('btn-pause-campaign');
    const btnPauseBottom = document.getElementById('btn-pause-campaign-bottom');
    if (btnPause) {
      btnPause.innerHTML = '<i class="fa-solid fa-play"></i> Tiếp Tục';
      btnPause.onclick = resumeCampaign;
    }
    if (btnPauseBottom) {
      btnPauseBottom.innerHTML = '<i class="fa-solid fa-play"></i> Tiếp Tục';
      btnPauseBottom.onclick = resumeCampaign;
    }
  } catch (err) {
    console.error(err);
  }
}

async function resumeCampaign() {
  try {
    await fetch('/api/campaign/resume', { method: 'POST' });
    showToast('Tiếp tục chiến dịch', 'Chiến dịch đăng bài đang tiếp tục chạy.', 'info');
    const btnPause = document.getElementById('btn-pause-campaign');
    const btnPauseBottom = document.getElementById('btn-pause-campaign-bottom');
    if (btnPause) {
      btnPause.innerHTML = '<i class="fa-solid fa-pause"></i> Tạm Dừng';
      btnPause.onclick = pauseCampaign;
    }
    if (btnPauseBottom) {
      btnPauseBottom.innerHTML = '<i class="fa-solid fa-pause"></i> Tạm Dừng';
      btnPauseBottom.onclick = pauseCampaign;
    }
  } catch (err) {
    console.error(err);
  }
}

async function stopCampaign() {
  if (!confirm('Bạn có chắc muốn dừng hẳn chiến dịch đăng bài hiện tại?')) return;
  try {
    await fetch('/api/campaign/stop', { method: 'POST' });
    showToast('Đã dừng chiến dịch', 'Chiến dịch đăng bài đã bị dừng.', 'warning');
  } catch (err) {
    console.error(err);
  }
}

// Biến theo dõi trạng thái chiến dịch để phát hiện hoàn thành & bắn thông báo
let wasCampaignRunning = false;
let lastCampaignSnapshot = null;
let lastSeenLogIndex = 0;

// Âm thanh thông báo nhẹ nhàng bằng Web Audio API (không cần file mp3 ngoài)
function playNotificationChime(type = 'success') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'success') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.12); // E5
      osc.frequency.setValueAtTime(783.99, now + 0.24); // G5
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
      osc.start(now);
      osc.stop(now + 0.65);
    } else {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(440, now);
      osc.frequency.setValueAtTime(349.23, now + 0.15);
      gain.gain.setValueAtTime(0.25, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.start(now);
      osc.stop(now + 0.45);
    }
  } catch (e) {}
}

// Thông báo màn hình Desktop (HTML5 Notification API)
function sendDesktopNotification(title, message) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    try {
      new Notification(title, {
        body: message,
        icon: 'https://static.xx.fbcdn.net/rsrc.php/yb/r/4Dxpaqi55qQ.ico'
      });
    } catch (e) {}
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(title, { body: message });
      }
    });
  }
}

// Modal Báo Cáo Tiến Trình & Danh Sách Nhóm OK
let currentProcResultsData = [];
let currentProcResultsFilter = 'ALL';

function showProcessResultModal({ title, subtitle, okCount = 0, pendingCount = 0, failCount = 0, results = [] }) {
  currentProcResultsData = results || [];
  currentProcResultsFilter = 'ALL';

  const modal = document.getElementById('process-completion-modal');
  if (!modal) return;

  const titleEl = document.getElementById('proc-complete-modal-title');
  const bannerTitle = document.getElementById('proc-complete-banner-title');
  const bannerDesc = document.getElementById('proc-complete-banner-desc');
  const statOk = document.getElementById('proc-stat-ok');
  const statPending = document.getElementById('proc-stat-pending');
  const statFail = document.getElementById('proc-stat-fail');

  if (titleEl) titleEl.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> ${escapeHtml(title || 'Hoàn Tất Tiến Trình')}`;
  if (bannerTitle) bannerTitle.innerHTML = `🎉 ${escapeHtml(title || 'Tiến trình hoàn tất')} thành công!`;
  if (bannerDesc) bannerDesc.textContent = subtitle || `Đã hoàn tất xử lý ${results.length} hội nhóm Facebook mục tiêu.`;

  if (statOk) statOk.textContent = okCount;
  if (statPending) statPending.textContent = pendingCount;
  if (statFail) statFail.textContent = failCount;

  filterProcResults('ALL');
  modal.classList.add('active');
}

function closeProcessCompletionModal() {
  document.getElementById('process-completion-modal')?.classList.remove('active');
}

function filterProcResults(filterType) {
  currentProcResultsFilter = filterType;
  ['ALL', 'OK', 'PENDING', 'FAIL'].forEach(t => {
    const btn = document.getElementById(`btn-filter-proc-${t.toLowerCase()}`);
    if (btn) {
      if (t === filterType) {
        btn.classList.remove('btn-secondary');
        btn.classList.add('btn-primary');
      } else {
        btn.classList.remove('btn-primary');
        btn.classList.add('btn-secondary');
      }
    }
  });
  renderProcResultsTable();
}

function renderProcResultsTable() {
  const tbody = document.getElementById('proc-complete-tbody');
  if (!tbody) return;

  let list = currentProcResultsData;
  if (currentProcResultsFilter === 'OK') {
    list = list.filter(r => r.status === 'JOINED_SUCCESS' || r.status === 'ALREADY_MEMBER' || r.isJoined === true || r.status === 'PUBLISHED_DIRECT');
  } else if (currentProcResultsFilter === 'PENDING') {
    list = list.filter(r => r.status === 'PENDING_APPROVAL' || r.status === 'SUBMITTED_SURVEY' || r.isPending === true);
  } else if (currentProcResultsFilter === 'FAIL') {
    list = list.filter(r => r.status === 'FAILED' || r.status === 'ERROR' || (!r.isJoined && !r.isPending && r.status !== 'JOINED_SUCCESS' && r.status !== 'ALREADY_MEMBER'));
  }

  if (list.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">Không có nhóm nào thuộc bộ lọc này.</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map(r => {
    let badge = '<span class="badge badge-secondary">Chưa vào</span>';
    const isOk = r.status === 'JOINED_SUCCESS' || r.status === 'ALREADY_MEMBER' || r.isJoined === true || r.status === 'PUBLISHED_DIRECT';
    const isPending = r.status === 'PENDING_APPROVAL' || r.status === 'SUBMITTED_SURVEY' || r.isPending === true;
    
    if (isOk) {
      badge = '<span class="badge badge-success">🟢 ĐÃ THÀNH CÔNG (OK)</span>';
    } else if (isPending) {
      badge = '<span class="badge badge-warning">🟡 ĐANG CHỜ DUYỆT</span>';
    } else {
      badge = '<span class="badge badge-danger">🔴 LỖI / BỎ QUA</span>';
    }

    const note = r.note || r.approvalStatusText || r.message || (isOk ? 'Đã là thành viên' : '');
    const url = r.groupUrl || (r.groupId ? `https://www.facebook.com/groups/${r.groupId}/` : '#');

    return `
      <tr>
        <td><strong>${escapeHtml(r.groupName || 'Nhóm Facebook')}</strong></td>
        <td>${badge}</td>
        <td><small style="color: var(--text-muted);">${escapeHtml(note)}</small></td>
        <td style="text-align: center;">
          <a href="${url}" target="_blank" class="btn btn-sm btn-secondary" style="padding: 2px 6px;" title="Mở nhóm trên Facebook">
            <i class="fa-solid fa-arrow-up-right-from-square"></i>
          </a>
        </td>
      </tr>
    `;
  }).join('');
}

function copyOkGroupLinks() {
  const okList = currentProcResultsData.filter(r => r.status === 'JOINED_SUCCESS' || r.status === 'ALREADY_MEMBER' || r.isJoined === true || r.status === 'PUBLISHED_DIRECT');
  if (okList.length === 0) {
    showToast('Thông báo', 'Chưa có nhóm nào chạy OK thành công để copy.', 'warning');
    return;
  }
  const links = okList.map(r => r.groupUrl || (r.groupId ? `https://www.facebook.com/groups/${r.groupId}/` : '')).filter(Boolean);
  navigator.clipboard.writeText(links.join('\n')).then(() => {
    showToast('Đã Copy Thành Công!', `Đã copy ${links.length} link nhóm Facebook chạy OK vào bộ nhớ tạm.`, 'success');
  }).catch(() => {
    showToast('Thông báo', `Không thể copy tự động, bạn có thể xem trực tiếp danh sách.`, 'info');
  });
}

// Hệ thống Toast Notifications
function showToast(title, message, type = 'info', duration = 4500) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  
  let iconHtml = '<i class="fa-solid fa-circle-info"></i>';
  if (type === 'success') iconHtml = '<i class="fa-solid fa-circle-check"></i>';
  else if (type === 'danger') iconHtml = '<i class="fa-solid fa-circle-xmark"></i>';
  else if (type === 'warning') iconHtml = '<i class="fa-solid fa-triangle-exclamation"></i>';

  toast.innerHTML = `
    <div class="toast-icon">${iconHtml}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-message">${escapeHtml(message)}</div>
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()"><i class="fa-solid fa-xmark"></i></button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastFadeOut 0.3s forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

function showCampaignSummaryModal(c) {
  const modal = document.getElementById('campaign-summary-modal');
  if (!modal) return;

  const total = c.totalGroups || (c.completed + c.failed) || 1;
  const published = c.publishedDirect || 0;
  const pending = c.pendingApproval || 0;
  const failed = c.failed || 0;

  document.getElementById('summary-job-title').textContent = c.jobTitle || (state.selectedJob ? state.selectedJob.title : 'Tin tuyển dụng');
  document.getElementById('summary-stat-published').textContent = published;
  document.getElementById('summary-stat-pending').textContent = pending;
  document.getElementById('summary-stat-failed').textContent = failed;
  document.getElementById('summary-stat-images').textContent = `${c.imageCount || (state.selectedImageFilenames ? state.selectedImageFilenames.size : 0)} ảnh`;
  document.getElementById('summary-stat-total').textContent = `${total} nhóm`;

  const banner = document.getElementById('summary-modal-banner');
  const title = document.getElementById('summary-modal-title');
  const subtitle = document.getElementById('summary-modal-subtitle');

  if (failed === 0) {
    title.innerHTML = '<i class="fa-solid fa-circle-check text-success"></i> Chiến Dịch Đăng Bài Hoàn Hảo!';
    banner.style.background = 'rgba(16, 185, 129, 0.15)';
    banner.style.borderColor = 'rgba(16, 185, 129, 0.35)';
    subtitle.textContent = `Tất cả bài viết đã được gửi thành công đến ${total} nhóm Facebook!`;
    showToast('Chiến dịch hoàn tất!', `Đã đăng thành công lên ${total} nhóm Facebook.`, 'success', 6000);
  } else if (published + pending > 0) {
    title.innerHTML = '<i class="fa-solid fa-circle-exclamation text-warning"></i> Chiến Dịch Hoàn Tất (Có Một Số Lỗi)';
    banner.style.background = 'rgba(245, 158, 11, 0.15)';
    banner.style.borderColor = 'rgba(245, 158, 11, 0.35)';
    subtitle.textContent = `Đã hoàn thành ${published + pending}/${total} nhóm (Thất bại: ${failed} nhóm).`;
    showToast('Chiến dịch hoàn tất', `Thành công: ${published + pending} nhóm | Thất bại: ${failed} nhóm`, 'warning', 6000);
  } else {
    title.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-danger"></i> Chiến Dịch Đăng Thất Bại';
    banner.style.background = 'rgba(239, 68, 68, 0.15)';
    banner.style.borderColor = 'rgba(239, 68, 68, 0.35)';
    subtitle.textContent = `Không thể đăng lên các nhóm đã chọn. Vui lòng kiểm tra lại Cookie Facebook hoặc quyền của nhóm.`;
    showToast('Chiến dịch thất bại', `Không thể đăng bài lên các nhóm đã chọn.`, 'danger', 6000);
  }

  modal.classList.add('active');
}

function closeCampaignSummaryModal() {
  document.getElementById('campaign-summary-modal')?.classList.remove('active');
}

function viewHistoryFromSummary() {
  closeCampaignSummaryModal();
  switchTab('history-tab');
}

async function pollCampaignStatus() {
  try {
    const res = await fetch('/api/campaign/status');
    const result = await res.json();

    if (result.success) {
      const { data, logs } = result;

      // Xử lý Logs mới và bắn Toast thông báo từng nhóm
      if (logs && logs.length > 0) {
        if (logs.length > lastSeenLogIndex) {
          for (let i = lastSeenLogIndex; i < logs.length; i++) {
            const l = logs[i];
            if (l.message.includes('[THÀNH CÔNG]')) {
              showToast('Đăng Thành Công!', l.message.replace(/🎉\s*\[THÀNH CÔNG\]\s*/i, ''), 'success', 5000);
            } else if (l.message.includes('[CHỜ DUYỆT]')) {
              showToast('Đang Chờ Duyệt (Admin)', l.message.replace(/⏳\s*\[CHỜ DUYỆT\]\s*/i, ''), 'warning', 5000);
            } else if (l.message.includes('[LỖI]')) {
              showToast('Đăng Thất Bại!', l.message.replace(/\[LỖI\]\s*/i, ''), 'danger', 6000);
            }
          }
          lastSeenLogIndex = logs.length;
        }
        renderTerminalLogs(logs);
      }

      // Lưu snapshot chiến dịch
      if (data.currentCampaign) {
        lastCampaignSnapshot = data.currentCampaign;
      }

      // Phát hiện thời điểm CHIẾN DỊCH VỪA KẾT THÚC
      if (wasCampaignRunning && !data.isRunning) {
        wasCampaignRunning = false;
        loadHistoryData(); // Tự động cập nhật tab lịch sử & thống kê
        
        playNotificationChime(lastCampaignSnapshot && lastCampaignSnapshot.failed === 0 ? 'success' : 'warn');
        sendDesktopNotification(
          '🚀 Chiến Dịch Đăng Bài Hoàn Tất!',
          `Đã xuất bản: ${lastCampaignSnapshot?.publishedDirect || 0} bài trực tiếp | ${lastCampaignSnapshot?.pendingApproval || 0} chờ duyệt | ${lastCampaignSnapshot?.failed || 0} lỗi`
        );

        if (lastCampaignSnapshot) {
          showCampaignSummaryModal(lastCampaignSnapshot);
        }
      }

      // Render Controller Status
      const btnStart = document.getElementById('btn-start-campaign');
      const btnStartBottom = document.getElementById('btn-start-campaign-bottom');
      const btnPause = document.getElementById('btn-pause-campaign');
      const btnPauseBottom = document.getElementById('btn-pause-campaign-bottom');
      const btnStop = document.getElementById('btn-stop-campaign');
      const btnStopBottom = document.getElementById('btn-stop-campaign-bottom');
      const statusPill = document.getElementById('bottom-campaign-status-pill');
      const statsCard = document.getElementById('campaign-stats-card');

      const bottomProgressCard = document.getElementById('bottom-realtime-progress-card');

      if (data.isRunning) {
        wasCampaignRunning = true;
        if (btnStart) btnStart.style.display = 'none';
        if (btnStartBottom) {
          btnStartBottom.disabled = true;
          btnStartBottom.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ĐANG TIẾN HÀNH ĐĂNG...';
          btnStartBottom.style.opacity = '0.7';
        }
        if (btnPause) btnPause.style.display = 'inline-flex';
        if (btnPauseBottom) btnPauseBottom.style.display = 'inline-flex';
        if (btnStop) btnStop.style.display = 'inline-flex';
        if (btnStopBottom) btnStopBottom.style.display = 'inline-flex';
        if (statusPill) {
          statusPill.style.display = 'inline-flex';
          statusPill.className = data.isPaused ? 'badge-pill warning' : 'badge-pill info';
          statusPill.innerHTML = data.isPaused ? '<i class="fa-solid fa-pause"></i> Đang tạm dừng' : '<i class="fa-solid fa-spinner fa-spin"></i> Đang chạy đăng bài...';
        }
        if (statsCard) statsCard.style.display = 'block';
        if (bottomProgressCard) bottomProgressCard.style.display = 'block';

        if (data.currentCampaign) {
          const c = data.currentCampaign;
          const total = c.totalGroups || 1;
          const current = c.completed + c.failed;
          const percent = Math.min(100, Math.round((current / total) * 100));

          const progText = `${current} / ${total} (${percent}%)`;
          const statProg = document.getElementById('stat-progress');
          const progFill = document.getElementById('progress-fill');
          if (statProg) statProg.textContent = progText;
          if (progFill) progFill.style.width = `${percent}%`;

          // Cập nhật thanh tiến độ dưới (ngay trên nút bấm)
          const bottomStatProg = document.getElementById('bottom-stat-progress');
          const bottomProgFill = document.getElementById('bottom-progress-fill');
          const bottomDirect = document.getElementById('bottom-stat-direct');
          const bottomPending = document.getElementById('bottom-stat-pending');
          const bottomFailed = document.getElementById('bottom-stat-failed');
          const bottomStatusText = document.getElementById('bottom-current-status-text');

          if (bottomStatProg) bottomStatProg.textContent = progText;
          if (bottomProgFill) bottomProgFill.style.width = `${percent}%`;
          if (bottomDirect) bottomDirect.textContent = c.publishedDirect || 0;
          if (bottomPending) bottomPending.textContent = c.pendingApproval || 0;
          if (bottomFailed) bottomFailed.textContent = c.failed || 0;

          if (bottomStatusText) {
            const statusMsg = c.currentStatusText || `Đang đăng bài... (${current}/${total})`;
            bottomStatusText.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${statusMsg}`;
          }

          // CẬP NHẬT PANEL 5: BỘ ĐO LƯỜNG TIẾN TRÌNH & TERMINAL NHẬT KÝ
          const liveProgText = document.getElementById('live-target-progress-text');
          const liveProgFill = document.getElementById('live-target-progress-fill');
          const liveGroupName = document.getElementById('live-target-group-name');
          const liveBadge = document.getElementById('live-target-status-badge');
          const liveDirect = document.getElementById('live-count-direct');
          const livePending = document.getElementById('live-count-pending');
          const liveFailed = document.getElementById('live-count-failed');
          const liveEta = document.getElementById('live-target-eta');

          if (liveProgText) liveProgText.textContent = `${current} / ${total} nhóm (${percent}%)`;
          if (liveProgFill) liveProgFill.style.width = `${percent}%`;
          if (liveDirect) liveDirect.textContent = c.publishedDirect || 0;
          if (livePending) livePending.textContent = c.pendingApproval || 0;
          if (liveFailed) liveFailed.textContent = c.failed || 0;
          
          if (liveGroupName) {
            const activeMsg = c.currentStatusText || (current < total ? `Đang đăng nhóm ${current + 1} / ${total}...` : 'Đã hoàn tất toàn bộ nhóm');
            liveGroupName.innerHTML = data.isRunning 
              ? `<i class="fa-solid fa-circle-notch fa-spin text-primary" style="margin-right: 6px;"></i> ${escapeHtml(activeMsg)}`
              : escapeHtml(activeMsg);
          }

          if (liveBadge) {
            if (data.isRunning) {
              liveBadge.className = 'badge-pill success';
              liveBadge.innerHTML = '<i class="fa-solid fa-circle-play"></i> Đang chạy...';
            } else if (data.isPaused) {
              liveBadge.className = 'badge-pill warning';
              liveBadge.innerHTML = '<i class="fa-solid fa-circle-pause"></i> Tạm dừng';
            } else {
              liveBadge.className = 'badge-pill info';
              liveBadge.innerHTML = '<i class="fa-solid fa-circle-check"></i> Hoàn thành';
            }
          }

          if (liveEta && data.isRunning) {
            const remaining = total - current;
            const avgSeconds = 60; // 60s per group average
            const etaMinutes = Math.ceil((remaining * avgSeconds) / 60);
            liveEta.innerHTML = `<i class="fa-solid fa-hourglass-half"></i> Còn ~${etaMinutes} phút (${remaining} nhóm)`;
          }
        }
      } else {
        if (btnStart) btnStart.style.display = 'inline-flex';
        if (btnStartBottom) {
          btnStartBottom.disabled = false;
          btnStartBottom.style.opacity = '1';
          btnStartBottom.innerHTML = `<i class="fa-solid fa-paper-plane"></i> BẮT ĐẦU ĐĂNG BÀI LÊN ${state.selectedGroupIds.size} NHÓM ĐÃ CHỌN`;
        }
        if (btnPause) btnPause.style.display = 'none';
        if (btnPauseBottom) btnPauseBottom.style.display = 'none';
        if (btnStop) btnStop.style.display = 'none';
        if (btnStopBottom) btnStopBottom.style.display = 'none';
        if (statusPill) statusPill.style.display = 'none';
        if (bottomProgressCard) bottomProgressCard.style.display = 'none';
      }
    }
  } catch (err) {
    // Tránh spam log khi polling
  }
}

// =========================================================
// 7. THỐNG KÊ & LỊCH SỬ ĐĂNG BÀI (HISTORY & ANALYTICS)
// =========================================================
async function loadHistoryData() {
  try {
    const [histRes, statsRes] = await Promise.all([
      fetch('/api/history?limit=300'),
      fetch('/api/history/stats')
    ]);

    const histData = await histRes.json();
    const statsData = await statsRes.json();

    if (histData.success) {
      state.historyData = histData.data || [];
      state.filteredHistory = [...state.historyData];
      renderHistoryTable();
    }

    if (statsData.success) {
      state.historyStats = statsData.data;
      renderHistoryMetrics();
      renderJobMatrix();
      renderGroupPerformance();
      if (state.currentTab === 'dashboard-tab') renderDashboard();
    }
  } catch (err) {
    console.error('Lỗi tải lịch sử đăng bài:', err);
  }
}

function renderHistoryMetrics() {
  if (!state.historyStats) return;
  const s = state.historyStats;

  document.getElementById('stat-total-posts').textContent = s.totalPosts || 0;
  document.getElementById('stat-unique-jobs').textContent = `${s.uniqueJobsCount || 0} tin tuyển dụng khác nhau`;
  document.getElementById('stat-published-posts').textContent = s.publishedDirect || 0;
  document.getElementById('stat-pending-posts').textContent = s.pendingApproval || 0;
  document.getElementById('stat-approved-posts').textContent = s.approved || 0;
  document.getElementById('stat-failed-posts').textContent = s.failed || 0;
  document.getElementById('stat-approval-rate').textContent = `${s.approvalRate || 0}%`;
}

function getStatusBadgeHtml(status) {
  switch (status) {
    case 'PUBLISHED':
      return `<span class="badge-pill success"><i class="fa-solid fa-circle-check"></i> Đã lên trực tiếp</span>`;
    case 'PENDING_APPROVAL':
      return `<span class="badge-pill warning"><i class="fa-solid fa-clock"></i> Đang chờ duyệt</span>`;
    case 'APPROVED':
      return `<span class="badge-pill purple"><i class="fa-solid fa-award"></i> Đã được duyệt</span>`;
    case 'REJECTED':
      return `<span class="badge-pill danger"><i class="fa-solid fa-ban"></i> Bị từ chối</span>`;
    case 'FAILED':
      return `<span class="badge-pill danger"><i class="fa-solid fa-triangle-exclamation"></i> Thất bại / Lỗi</span>`;
    default:
      return `<span class="badge-pill">${escapeHtml(status)}</span>`;
  }
}

function renderHistoryTable() {
  const tbody = document.getElementById('history-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (state.filteredHistory.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4" style="color: var(--text-dim);">Chưa có lịch sử đăng bài nào được lưu.</td></tr>`;
    return;
  }

  state.filteredHistory.forEach((item, idx) => {
    const tr = document.createElement('tr');
    const timeFormatted = new Date(item.postedAt).toLocaleString('vi-VN', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const imagesCount = item.images && item.images.length > 0
      ? `<span class="badge-pill"><i class="fa-solid fa-images"></i> ${item.images.length}</span>`
      : `<span style="color: var(--text-dim); font-size: 0.75rem;">Không</span>`;

    const safeGroupUrl = (item.groupUrl && item.groupUrl.startsWith('http'))
      ? item.groupUrl
      : (item.groupId && /^\d+$/.test(String(item.groupId).trim())
          ? `https://www.facebook.com/profile.php?id=${String(item.groupId).trim()}`
          : (item.groupId && String(item.groupId).startsWith('http') ? item.groupId : 'https://www.facebook.com/JobCentralVietNam/'));

    let cleanPostUrl = (item.postUrl || '').trim();
    if (cleanPostUrl.includes('_mock_')) {
      cleanPostUrl = safeGroupUrl;
    }

    // Đảm bảo tất cả các bài đã đăng (PUBLISHED, APPROVED hoặc PENDING_APPROVAL) đều có nút "Xem bài viết" trực tiếp:
    if (!cleanPostUrl) {
      if ((item.status === 'PUBLISHED' || item.status === 'APPROVED') && safeGroupUrl) {
        const gUrl = safeGroupUrl.replace(/\/+$/, '');
        cleanPostUrl = gUrl.includes('/groups/') ? `${gUrl}/?sorting_setting=CHRONOLOGICAL` : gUrl;
      } else if (item.status === 'PENDING_APPROVAL' && safeGroupUrl) {
        const gUrl = safeGroupUrl.replace(/\/+$/, '');
        cleanPostUrl = gUrl.includes('/groups/') ? `${gUrl}/pending_posts` : gUrl;
      }
    }

    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td><small style="color: var(--text-muted);">${timeFormatted}</small></td>
      <td>
        <strong>${escapeHtml(item.jobTitle)}</strong>
        <div style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(item.company || 'N/A')}</div>
      </td>
      <td>
        <a href="${escapeHtml(safeGroupUrl)}" target="_blank" rel="noopener noreferrer" class="group-link-text" title="Mở trang Facebook">
          <i class="fa-brands fa-facebook"></i> ${escapeHtml(item.groupName)}
        </a>
        <div style="margin-top: 5px; display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
          ${
            cleanPostUrl
              ? `<a href="${escapeHtml(cleanPostUrl)}" target="_blank" rel="noopener noreferrer" class="post-direct-link" title="${escapeHtml(cleanPostUrl)}"><i class="fa-solid fa-arrow-up-right-from-square"></i> Xem bài viết</a>
                 <button class="btn btn-xs btn-outline" style="font-size: 0.7rem; padding: 2px 5px; opacity: 0.85;" onclick="openAttachPostUrlModal('${item.id}', '${escapeHtml(item.jobTitle)}', '${escapeHtml(item.groupName)}', '${escapeHtml(item.postUrl || cleanPostUrl)}')" title="Sửa đường link bài viết cụ thể"><i class="fa-solid fa-pen"></i></button>`
              : `<button class="btn btn-xs btn-outline" style="font-size: 0.72rem; padding: 2px 6px;" onclick="openAttachPostUrlModal('${item.id}', '${escapeHtml(item.jobTitle)}', '${escapeHtml(item.groupName)}', '')"><i class="fa-solid fa-link"></i> + Gắn link bài</button>`
          }
        </div>
      </td>
      <td style="min-width: 160px; max-width: 210px;">
        <div style="margin-bottom: 5px;">${getStatusBadgeHtml(item.status)}</div>
        ${item.errorMessage ? `<div style="font-size: 0.75rem; color: var(--danger); font-weight: 500; line-height: 1.35; word-break: break-word;"><i class="fa-solid fa-circle-exclamation"></i> Lỗi: ${escapeHtml(item.errorMessage)}</div>` : (item.approvalStatusText ? `<div style="font-size: 0.74rem; color: var(--text-dim); line-height: 1.35; word-break: break-word;">${escapeHtml(item.approvalStatusText)}</div>` : '')}
      </td>
      <td class="text-center">
        ${renderEngagementBadges(item.engagement)}
      </td>
      <td class="text-center">${imagesCount}</td>
      <td class="text-center">
        <button class="btn btn-sm btn-secondary" onclick="openHistoryDetailModal('${item.id}')" title="Xem nội dung & Đánh giá">
          <i class="fa-solid fa-eye"></i> Chi Tiết
        </button>
        <button class="btn-icon" onclick="deleteHistoryRecord('${item.id}')" title="Xóa bản ghi"><i class="fa-solid fa-trash"></i></button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderEngagementBadges(eng) {
  if (!eng || (!eng.likes && !eng.comments && !eng.inquiryCount)) {
    return `<span style="color: var(--text-dim); font-size: 0.75rem;">Chưa quét</span>`;
  }
  let html = `<div class="engagement-pills-wrap">`;
  html += `<span class="engagement-pill likes" title="${eng.likes} Lượt thích"><i class="fa-solid fa-thumbs-up"></i> ${eng.likes}</span>`;
  html += `<span class="engagement-pill comments" title="${eng.comments} Bình luận"><i class="fa-solid fa-comments"></i> ${eng.comments}</span>`;
  if (eng.inquiryCount > 0) {
    html += `<span class="engagement-pill inquiries" title="${eng.inquiryCount} Ứng viên hỏi việc"><i class="fa-solid fa-user-check"></i> ${eng.inquiryCount} hỏi</span>`;
  }
  html += `</div>`;
  return html;
}

function filterHistoryLogs() {
  const q = (document.getElementById('history-search').value || '').toLowerCase().trim();
  const statusFilter = document.getElementById('history-status-filter').value;

  state.filteredHistory = state.historyData.filter(item => {
    const matchQuery = !q ||
      (item.jobTitle && item.jobTitle.toLowerCase().includes(q)) ||
      (item.company && item.company.toLowerCase().includes(q)) ||
      (item.groupName && item.groupName.toLowerCase().includes(q)) ||
      (item.postText && item.postText.toLowerCase().includes(q));

    const matchStatus = statusFilter === 'ALL' || item.status === statusFilter;
    return matchQuery && matchStatus;
  });

  renderHistoryTable();
}

function switchHistorySubView(view) {
  state.activeHistorySubView = view;

  document.getElementById('btn-view-logs').classList.toggle('active', view === 'logs');
  document.getElementById('btn-view-matrix').classList.toggle('active', view === 'matrix');
  document.getElementById('btn-view-groups').classList.toggle('active', view === 'groups');

  document.getElementById('history-logs-view').style.display = view === 'logs' ? 'block' : 'none';
  document.getElementById('history-matrix-view').style.display = view === 'matrix' ? 'block' : 'none';
  document.getElementById('history-groups-view').style.display = view === 'groups' ? 'block' : 'none';
}

function renderJobMatrix() {
  const container = document.getElementById('history-job-matrix-grid');
  if (!container || !state.historyStats) return;
  container.innerHTML = '';

  const jobBreakdown = state.historyStats.jobBreakdown || [];
  if (jobBreakdown.length === 0) {
    container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 30px;">Chưa có dữ liệu bài đăng tuyển dụng nào.</div>`;
    return;
  }

  jobBreakdown.forEach(job => {
    const card = document.createElement('div');
    card.className = 'matrix-card';

    const groupsHtml = (job.groups || []).map(g => {
      let badgeClass = 'success';
      let icon = 'fa-circle-check';
      let label = 'Lên trực tiếp';

      if (g.status === 'PENDING_APPROVAL') {
        badgeClass = 'warning';
        icon = 'fa-clock';
        label = 'Chờ duyệt';
      } else if (g.status === 'APPROVED') {
        badgeClass = 'purple';
        icon = 'fa-award';
        label = 'Đã duyệt';
      } else if (g.status === 'FAILED' || g.status === 'REJECTED') {
        badgeClass = 'danger';
        icon = 'fa-ban';
        label = 'Lỗi/Từ chối';
      }

      return `
        <div class="matrix-group-pill ${badgeClass}">
          <a href="${g.groupUrl}" target="_blank" title="Mở nhóm Facebook">${escapeHtml(g.groupName)}</a>
          <span class="matrix-status"><i class="fa-solid ${icon}"></i> ${label}</span>
        </div>
      `;
    }).join('');

    card.innerHTML = `
      <div class="matrix-card-header">
        <div>
          <h4>${escapeHtml(job.jobTitle)}</h4>
          <span class="company"><i class="fa-solid fa-building"></i> ${escapeHtml(job.company || 'N/A')}</span>
        </div>
        <span class="badge-pill primary">${job.totalPosts} nhóm đã đăng</span>
      </div>
      <div class="matrix-groups-list">
        ${groupsHtml}
      </div>
    `;
    container.appendChild(card);
  });
}

function renderGroupPerformance() {
  const tbody = document.getElementById('history-groups-table-body');
  if (!tbody || !state.historyStats) return;
  tbody.innerHTML = '';

  const groupBreakdown = state.historyStats.groupBreakdown || [];
  if (groupBreakdown.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4" style="color: var(--text-dim);">Chưa có dữ liệu thống kê Hội nhóm.</td></tr>`;
    return;
  }

  groupBreakdown.forEach(g => {
    const tr = document.createElement('tr');
    const approvedOrLive = g.publishedDirect + g.approved;
    const rate = g.totalPosts > 0 ? Math.round((approvedOrLive / g.totalPosts) * 100) : 0;

    tr.innerHTML = `
      <td>
        <strong>${escapeHtml(g.groupName)}</strong>
        ${g.groupUrl ? `<a href="${g.groupUrl}" target="_blank" class="group-link-icon" style="margin-left: 6px;"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>` : ''}
      </td>
      <td class="text-center"><strong>${g.totalPosts}</strong></td>
      <td class="text-center"><span style="color: var(--success);">${g.publishedDirect}</span></td>
      <td class="text-center"><span style="color: var(--warning);">${g.pendingApproval}</span></td>
      <td class="text-center"><span style="color: #a855f7;">${g.approved}</span></td>
      <td class="text-center"><span style="color: var(--danger);">${g.failed + g.rejected}</span></td>
      <td class="text-center">
        <span class="badge-pill ${rate >= 70 ? 'success' : (rate >= 40 ? 'warning' : 'danger')}">${rate}%</span>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// =========================================================
// 8. MODAL CHI TIẾT & ĐỔI TRẠNG THÁI LỊCH SỬ
// =========================================================
function openHistoryDetailModal(id) {
  const record = state.historyData.find(r => r.id === id);
  if (!record) return;

  state.selectedHistoryItem = record;

  document.getElementById('detail-job-title').textContent = record.jobTitle || 'Tin tuyển dụng';
  document.getElementById('detail-company').innerHTML = `<i class="fa-solid fa-building"></i> ${escapeHtml(record.company || 'N/A')}`;
  document.getElementById('detail-location').innerHTML = `<i class="fa-solid fa-location-dot"></i> ${escapeHtml(record.province || 'Toàn quốc')} &bull; Thu nhập: ${escapeHtml(record.salary || 'Thỏa thuận')}`;
  document.getElementById('detail-time').innerHTML = `<i class="fa-solid fa-clock"></i> Đăng lúc: ${new Date(record.postedAt).toLocaleString('vi-VN')}`;

  const detailSafeGroupUrl = (record.groupUrl && record.groupUrl.startsWith('http'))
    ? record.groupUrl
    : (record.groupId && /^\d+$/.test(String(record.groupId).trim())
        ? `https://www.facebook.com/profile.php?id=${String(record.groupId).trim()}`
        : (record.groupId && String(record.groupId).startsWith('http') ? record.groupId : 'https://www.facebook.com/JobCentralVietNam/'));

  document.getElementById('detail-group-name').textContent = record.groupName || 'Facebook Group';
  document.getElementById('detail-group-link').href = detailSafeGroupUrl;

  const postUrlRow = document.getElementById('detail-post-url-row');
  const postLink = document.getElementById('detail-post-link');
  let effectivePostUrl = (record.postUrl || '').trim();
  if (!effectivePostUrl && (record.status === 'PUBLISHED' || record.status === 'APPROVED')) {
    effectivePostUrl = detailSafeGroupUrl.includes('/groups/') ? `${detailSafeGroupUrl.replace(/\/+$/, '')}/?sorting_setting=CHRONOLOGICAL` : detailSafeGroupUrl;
  }
  if (postUrlRow && postLink) {
    if (effectivePostUrl) {
      postUrlRow.style.display = 'flex';
      postLink.href = effectivePostUrl;
    } else {
      postUrlRow.style.display = 'none';
    }
  }

  document.getElementById('detail-edit-status').value = record.status || 'PUBLISHED';
  document.getElementById('detail-edit-notes').value = record.notes || '';
  document.getElementById('detail-post-text').textContent = record.postText || 'Không có nội dung.';

  // Hiển thị lý do lỗi nếu có
  const errorBox = document.getElementById('detail-error-box');
  const errorText = document.getElementById('detail-error-text');
  if (record.status === 'FAILED' || record.errorMessage) {
    errorBox.style.display = 'block';
    errorText.textContent = record.errorMessage || 'Lỗi không xác định trong quá trình đăng bài.';
  } else {
    errorBox.style.display = 'none';
  }

  // Render ảnh kèm theo
  const imagesSection = document.getElementById('detail-images-section');
  const imagesGrid = document.getElementById('detail-images-grid');
  imagesGrid.innerHTML = '';

  if (record.images && record.images.length > 0) {
    imagesSection.style.display = 'block';
    document.getElementById('detail-images-count').textContent = record.images.length;
    record.images.forEach(imgName => {
      const imgDiv = document.createElement('div');
      imgDiv.className = 'detail-img-card';
      imgDiv.innerHTML = `<img src="/uploads/${encodeURIComponent(imgName)}" alt="${escapeHtml(imgName)}" loading="lazy">`;
      imagesGrid.appendChild(imgDiv);
    });
  } else {
    imagesSection.style.display = 'none';
  }

  document.getElementById('history-detail-modal').classList.add('active');
}

function closeHistoryDetailModal() {
  document.getElementById('history-detail-modal').classList.remove('active');
  state.selectedHistoryItem = null;
}

async function saveRecordStatusUpdate() {
  if (!state.selectedHistoryItem) return;

  const id = state.selectedHistoryItem.id;
  const status = document.getElementById('detail-edit-status').value;
  const notes = document.getElementById('detail-edit-notes').value.trim();

  try {
    const res = await fetch(`/api/history/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, notes })
    });
    const result = await res.json();

    if (result.success) {
      closeHistoryDetailModal();
      loadHistoryData();
      appendTerminalLog(`[CẬP NHẬT TRẠNG THÁI] Đã đổi trạng thái bản ghi sang: ${status}`, 'success');
    } else {
      alert(`Lỗi: ${result.message}`);
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

async function deleteHistoryRecord(id) {
  if (!confirm('Bạn có chắc muốn xóa bản ghi lịch sử này?')) return;

  try {
    const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      loadHistoryData();
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

async function confirmClearHistory() {
  if (!confirm('CẢNH BÁO: Bạn có chắc muốn XÓA TOÀN BỘ lịch sử hoạt động và thống kê? Thao tác này không thể hoàn tác!')) return;

  try {
    const res = await fetch('/api/history', { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      loadHistoryData();
      alert('Đã xóa toàn bộ lịch sử thành công!');
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

function exportHistoryData(format) {
  window.open(`/api/history/export?format=${format}`, '_blank');
}

// =========================================================
// 9. TERMINAL & CHROME PROFILE CONTROLLER
// =========================================================
function appendTerminalLog(msg, type = 'info') {
  const container = document.getElementById('terminal-logs');
  if (!container) return;

  const time = new Date().toLocaleTimeString('vi-VN');
  const line = document.createElement('div');
  line.className = `log-line ${type}`;
  line.textContent = `[${time}] ${msg}`;
  container.appendChild(line);
  container.scrollTop = container.scrollHeight;
}

function renderTerminalLogs(logs) {
  // Feed Tab 6 terminal-logs
  const container = document.getElementById('terminal-logs');
  if (container) {
    container.innerHTML = '';
    logs.forEach(l => {
      const line = document.createElement('div');
      line.className = `log-line ${l.type || 'info'}`;
      line.textContent = `[${l.timestamp}] ${l.message}`;
      container.appendChild(line);
    });
    container.scrollTop = container.scrollHeight;
  }

  // Feed Tab 4 Panel 5 LIVE CONTROLLER TERMINAL
  const liveTerm = document.getElementById('live-controller-terminal-logs');
  if (liveTerm && logs && logs.length > 0) {
    liveTerm.innerHTML = '';
    logs.forEach(l => {
      const line = document.createElement('div');
      let color = '#cbd5e1';
      let icon = 'ℹ️';
      const msg = l.message || '';
      if (msg.includes('[THANH CONG]') || msg.includes('thành công') || msg.includes('DIRECT')) {
        color = '#34d399';
        icon = '✅';
      } else if (msg.includes('[CHỜ DUYỆT]') || msg.includes('chờ duyệt') || msg.includes('PENDING')) {
        color = '#fbbf24';
        icon = '⏳';
      } else if (msg.includes('[LỖI]') || msg.includes('lỗi') || msg.includes('ERROR') || msg.includes('Thất bại')) {
        color = '#f87171';
        icon = '❌';
      } else if (msg.includes('Khởi') || msg.includes('Đang') || msg.includes('Bắt đầu')) {
        color = '#60a5fa';
        icon = '🚀';
      } else if (msg.includes('Nghỉ') || msg.includes('Cooldown')) {
        color = '#a78bfa';
        icon = '☕';
      }

      line.style.color = color;
      line.style.marginBottom = '4px';
      line.style.display = 'flex';
      line.style.alignItems = 'flex-start';
      line.style.gap = '6px';
      line.innerHTML = `<span style="color: #64748b; font-size: 0.72rem; flex-shrink: 0;">[${l.timestamp}]</span> <span>${icon} ${escapeHtml(msg)}</span>`;
      liveTerm.appendChild(line);
    });
    liveTerm.scrollTop = liveTerm.scrollHeight;
  }
}

function clearLiveTerminal() {
  const liveTerm = document.getElementById('live-controller-terminal-logs');
  if (liveTerm) {
    liveTerm.innerHTML = '<div style="color: #64748b;">[System] Đã xóa log console. Sẵn sàng...</div>';
  }
}

function clearLogs() {
  const container = document.getElementById('terminal-logs');
  if (container) container.innerHTML = '';
}

async function checkBrowserProfileStatus() {
  const indicator = document.getElementById('profile-indicator');
  const statusText = document.getElementById('profile-status-text');

  try {
    const res = await fetch('/api/browser/status');
    const result = await res.json();

    if (result.success && result.data.isLoggedIn) {
      indicator.className = 'profile-status-indicator online';
      statusText.textContent = 'Đã đăng nhập Facebook';
      state.isLoggedIn = true;
    } else {
      indicator.className = 'profile-status-indicator offline';
      statusText.textContent = 'Chưa đăng nhập FB';
      state.isLoggedIn = false;
    }
  } catch (err) {
    indicator.className = 'profile-status-indicator offline';
    statusText.textContent = 'Mất kết nối Chrome';
  }
}

async function openLoginWindow() {
  appendTerminalLog(`[CHROME] Đang mở trình duyệt để đăng nhập tài khoản Facebook...`);
  try {
    const res = await fetch('/api/browser/open-login', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      appendTerminalLog(`[CHROME] ${result.message}`, 'success');
      setTimeout(checkBrowserProfileStatus, 5000);
    }
  } catch (err) {
    appendTerminalLog(`[CHROME LỖI] ${err.message}`, 'error');
  }
}

// =========================================================
// 10. MODAL CẤU HÌNH & HELPER
// =========================================================
function openSheetConfigModal() {
  document.getElementById('sheet-modal').classList.add('active');
}

function closeSheetConfigModal() {
  document.getElementById('sheet-modal').classList.remove('active');
}

async function saveSheetConfig() {
  const url = document.getElementById('modal-sheet-url').value.trim();
  if (!url) {
    alert('Vui lòng dán link Google Sheets hợp lệ!');
    return;
  }

  try {
    const res = await fetch('/api/sheet/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: url })
    });
    const result = await res.json();

    if (result.success) {
      closeSheetConfigModal();
      loadGoogleSheets(true);
      alert('Đã cập nhật link Google Sheets thành công!');
    } else {
      alert(`Lỗi: ${result.message}`);
    }
  } catch (err) {
    alert(`Lỗi kết nối: ${err.message}`);
  }
}

async function openGroupSheetConfigModal() {
  try {
    const res = await fetch('/api/groups/sheet-config');
    const data = await res.json();
    if (data.success && data.data?.groupSheetUrl) {
      document.getElementById('modal-group-sheet-url').value = data.data.groupSheetUrl;
    }
  } catch (e) {}
  document.getElementById('group-sheet-modal').classList.add('active');
}

function closeGroupSheetConfigModal() {
  document.getElementById('group-sheet-modal').classList.remove('active');
}

async function saveGroupSheetConfig() {
  const url = document.getElementById('modal-group-sheet-url').value.trim();
  if (!url) {
    alert('Vui lòng dán link Google Sheets nhóm hợp lệ!');
    return;
  }

  try {
    showToast('Đang lưu & đồng bộ...', 'Đang nạp danh sách nhóm từ link Google Sheets mới...', 'info', 4000);
    const saveRes = await fetch('/api/groups/sheet-config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: url })
    });
    const saveResult = await saveRes.json();

    if (!saveResult.success) {
      alert(`Lỗi: ${saveResult.message}`);
      return;
    }

    // Đồng bộ ngay từ link mới
    const syncRes = await fetch('/api/groups/sync-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: url, override: false })
    });
    const syncResult = await syncRes.json();

    if (syncResult.success) {
      closeGroupSheetConfigModal();
      loadGroups();
      showToast('Đồng bộ thành công!', `Đã nạp ${syncResult.totalGroups} nhóm vào hệ thống!`, 'success', 5000);
      alert(`🎉 Đã cấu hình và đồng bộ thành công ${syncResult.totalGroups} nhóm từ Google Sheets!`);
    } else {
      alert(`Đã lưu link nhưng không trích xuất được nhóm: ${syncResult.message}`);
    }
  } catch (err) {
    alert(`Lỗi kết nối: ${err.message}`);
  }
}

function openAddGroupModal() {
  document.getElementById('group-modal').classList.add('active');
}


function closeAddGroupModal() {
  document.getElementById('group-modal').classList.remove('active');
}

async function saveNewGroup() {
  const name = document.getElementById('new-group-name').value.trim();
  const url = document.getElementById('new-group-url').value.trim();
  const province = document.getElementById('new-group-province').value.trim() || 'Toàn quốc';
  const members = document.getElementById('new-group-members').value.trim() || 'N/A';

  if (!name || !url) {
    alert('Vui lòng nhập đầy đủ Tên Nhóm và Đường dẫn URL Nhóm!');
    return;
  }

  try {
    const res = await fetch('/api/groups', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, province, members })
    });
    const result = await res.json();

    if (result.success) {
      closeAddGroupModal();
      document.getElementById('new-group-name').value = '';
      document.getElementById('new-group-url').value = '';
      loadGroups();
      alert('Đã thêm Hội Nhóm mới thành công!');
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

function openBulkGroupModal() {
  document.getElementById('bulk-group-modal').classList.add('active');
}

function closeBulkGroupModal() {
  document.getElementById('bulk-group-modal').classList.remove('active');
}

async function parseAndSaveBulkGroups() {
  const rawText = document.getElementById('bulk-group-input').value.trim();
  if (!rawText) {
    alert('Vui lòng dán danh sách link nhóm Facebook vào ô văn bản!');
    return;
  }

  const lines = rawText.split('\n');
  const groupList = [];

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Hỗ trợ cú pháp: Tên | Link | Tỉnh hoặc chỉ có Link
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim());
      const name = parts[0];
      const url = parts[1];
      const province = parts[2] || 'Toàn quốc';
      if (url && (url.includes('facebook.com') || url.includes('fb.com') || url.startsWith('http'))) {
        groupList.push({ name, url, province, category: 'Tuyển dụng', members: 'N/A' });
      }
    } else {
      // Dòng chỉ chứa link
      const matchUrl = line.match(/(https?:\/\/(www\.)?(facebook|fb)\.com\/groups\/[^\s/?#]+)/i);
      if (matchUrl) {
        const url = matchUrl[0];
        // Trích xuất slug hoặc id làm tên tạm
        const slug = url.split('/groups/')[1].replace(/\/$/, '');
        const name = `Nhóm FB (${slug})`;
        groupList.push({ name, url, province: 'Toàn quốc', category: 'Tuyển dụng', members: 'N/A' });
      }
    }
  }

  if (groupList.length === 0) {
    alert('Không tìm thấy đường link Facebook Group hợp lệ nào trong nội dung bạn dán. Vui lòng kiểm tra lại định dạng link (ví dụ: https://www.facebook.com/groups/...)');
    return;
  }

  try {
    const res = await fetch('/api/groups/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: groupList })
    });
    const result = await res.json();

    if (result.success) {
      closeBulkGroupModal();
      document.getElementById('bulk-group-input').value = '';
      loadGroups();
      alert(`🎉 Đã nạp thành công ${result.added} Hội Nhóm mới vào danh sách!`);
    } else {
      alert(`Lỗi: ${result.message}`);
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

async function clearAllGroups() {
  if (!confirm('Bạn có chắc muốn XÓA TOÀN BỘ danh sách nhóm hiện tại để nạp lại danh sách nhóm thật của bạn?')) return;

  try {
    const res = await fetch('/api/groups/clear-all', { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      state.selectedGroupIds.clear();
      loadGroups();
      alert('Đã dọn dẹp toàn bộ danh sách nhóm!');
    }
  } catch (err) {
    alert(`Lỗi: ${err.message}`);
  }
}

// =========================================================
// DỌN DẸP / XÓA NHÓM CHƯA THAM GIA (CLEAN UNJOINED GROUPS)
// =========================================================
function openCleanUnjoinedModal() {
  const modal = document.getElementById('clean-unjoined-modal');
  if (!modal) return;

  const currentAcc = (state.accounts || []).find(a => a.id === state.currentAccountId) || state.accounts?.[0];
  const groups = state.groups || [];
  const filtered = state.filteredGroups || groups;

  const joinedCount = groups.filter(g => g.isJoined).length;
  const unjoinedCount = groups.length - joinedCount;

  const accNameEl = document.getElementById('clean-modal-acc-name');
  const scopeAccNameEl = document.getElementById('clean-scope-acc-name');
  const joinedCountEl = document.getElementById('clean-modal-joined-count');
  const unjoinedCountEl = document.getElementById('clean-modal-unjoined-count');
  const totalCountEl = document.getElementById('clean-modal-total-count');
  const filteredLabelEl = document.getElementById('clean-scope-filtered-label');
  const filteredCountEl = document.getElementById('clean-scope-filtered-count');

  if (accNameEl) accNameEl.textContent = currentAcc ? `${currentAcc.name} (${currentAcc.id})` : 'Mặc định';
  if (scopeAccNameEl) scopeAccNameEl.textContent = currentAcc ? currentAcc.name : 'Nick hiện tại';
  if (joinedCountEl) joinedCountEl.textContent = `${joinedCount} nhóm`;
  if (unjoinedCountEl) unjoinedCountEl.textContent = `${unjoinedCount} nhóm`;
  if (totalCountEl) totalCountEl.textContent = `${groups.length} nhóm`;

  if (filteredCountEl) filteredCountEl.textContent = `${filtered.length} nhóm`;
  if (filteredLabelEl) {
    // Chỉ hiển thị tùy chọn lọc nếu đang có bộ lọc làm giảm bớt số nhóm
    filteredLabelEl.style.display = (filtered.length < groups.length) ? 'flex' : 'none';
  }

  updateCleanModalPreview();
  modal.classList.add('active');
}

function closeCleanUnjoinedModal() {
  const modal = document.getElementById('clean-unjoined-modal');
  if (modal) modal.classList.remove('active');
}

function updateCleanModalPreview() {
  const selectedRadio = document.querySelector('input[name="clean-unjoined-scope"]:checked');
  const scope = selectedRadio ? selectedRadio.value : 'current';
  const btnTextEl = document.getElementById('clean-confirm-btn-text');
  if (!btnTextEl) return;

  const groups = state.groups || [];
  const filtered = state.filteredGroups || groups;

  if (scope === 'all_accounts') {
    const unjoinedAllCount = groups.filter(g => {
      const hasJoined = Object.values(g.memberships || {}).some(m => m && m.isJoined);
      return !hasJoined && !g.isJoined;
    }).length;
    btnTextEl.textContent = `Xác Nhận Xóa ${unjoinedAllCount} Nhóm Chưa Nick Nào Vào`;
  } else if (scope === 'filtered') {
    btnTextEl.textContent = `Xác Nhận Xóa ${filtered.length} Nhóm Trong Bộ Lọc`;
  } else {
    // current
    const unjoinedCount = groups.filter(g => !g.isJoined).length;
    btnTextEl.textContent = `Xác Nhận Xóa ${unjoinedCount} Nhóm Chưa Vào Của Nick Này`;
  }
}

async function executeCleanUnjoinedGroups() {
  const selectedRadio = document.querySelector('input[name="clean-unjoined-scope"]:checked');
  const scope = selectedRadio ? selectedRadio.value : 'current';
  const currentAccId = state.currentAccountId || 'acc_primary';
  const currentAcc = (state.accounts || []).find(a => a.id === currentAccId);
  const accName = currentAcc ? currentAcc.name : 'Nick hiện tại';

  const groups = state.groups || [];
  const filtered = state.filteredGroups || groups;

  let confirmMsg = '';
  if (scope === 'all_accounts') {
    const unjoinedAllCount = groups.filter(g => {
      const hasJoined = Object.values(g.memberships || {}).some(m => m && m.isJoined);
      return !hasJoined && !g.isJoined;
    }).length;
    confirmMsg = `Bạn có chắc muốn xóa ${unjoinedAllCount} nhóm mà CHƯA CÓ BẤT KỲ NICK NÀO tham gia?`;
  } else if (scope === 'filtered') {
    confirmMsg = `Bạn có chắc muốn xóa ${filtered.length} nhóm đang hiển thị trong bộ lọc hiện tại?`;
  } else {
    const unjoinedCount = groups.filter(g => !g.isJoined).length;
    confirmMsg = `Bạn có chắc muốn XÓA ${unjoinedCount} NHÓM CHƯA THAM GIA của nick "${accName}"?\n(Toàn bộ ${groups.length - unjoinedCount} nhóm đã vào sẽ được bảo lưu an toàn 100%)`;
  }

  if (!confirm(confirmMsg)) return;

  const btnConfirm = document.getElementById('btn-confirm-clean-unjoined');
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang xóa...';
  }

  try {
    let result;
    if (scope === 'filtered') {
      const idsToDelete = filtered.map(g => g.id);
      if (idsToDelete.length === 0) {
        alert('Không có nhóm nào trong bộ lọc để xóa!');
        if (btnConfirm) { btnConfirm.disabled = false; updateCleanModalPreview(); }
        return;
      }
      const res = await fetch('/api/groups/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: idsToDelete })
      });
      result = await res.json();
    } else {
      const res = await fetch('/api/groups/clear-unjoined', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: currentAccId,
          scope
        })
      });
      result = await res.json();
    }

    if (result.success) {
      closeCleanUnjoinedModal();
      state.selectedGroupIds.clear();
      await loadGroups();
      showToast('Dọn dẹp thành công!', result.message, 'success', 5000);
      alert(`🎉 ${result.message}`);
    } else {
      showToast('Lỗi dọn dẹp', result.message || 'Không thể xóa nhóm', 'danger', 5000);
      alert(`Lỗi: ${result.message}`);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger', 5000);
    alert(`Lỗi: ${err.message}`);
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      updateCleanModalPreview();
    }
  }
}

async function syncGroupsFromSheet() {
  try {
    const configRes = await fetch('/api/groups/sheet-config');
    const configData = await configRes.json();
    const currentUrl = configData.data?.groupSheetUrl;

    if (!currentUrl) {
      // Nếu chưa có link, mở modal cấu hình để người dùng nhập
      openGroupSheetConfigModal();
      return;
    }

    if (!confirm('Bạn có muốn đồng bộ danh sách nhóm trực tiếp từ Google Sheets của bạn?')) return;

    showToast('Đang đồng bộ...', 'Đang nạp dữ liệu nhóm mới từ Google Sheets...', 'info', 4000);
    const res = await fetch('/api/groups/sync-sheet', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl: currentUrl, override: false })
    });
    const result = await res.json();

    if (result.success) {
      loadGroups();
      showToast('Đồng bộ thành công!', result.message, 'success', 5000);
      alert(`🎉 ${result.message} Tổng cộng: ${result.totalGroups} nhóm.`);
    } else {
      showToast('Lỗi đồng bộ', result.message, 'danger', 6000);
      alert(`Lỗi: ${result.message}`);
    }
  } catch (err) {
    alert(`Lỗi kết nối: ${err.message}`);
  }
}


function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// =========================================================
// 11. GIÁM SÁT SỨC KHỎE & QUẢN TRỊ RỦI RO (ACCOUNT HEALTH & RISK)
// =========================================================
async function loadAccountHealthData(showToastAlert = false) {
  try {
    const accId = state.currentAccountId || '';
    const res = await fetch(`/api/account-health${accId ? `?accountId=${encodeURIComponent(accId)}` : ''}`);
    const result = await res.json();
    if (!result.success || !result.data) return;

    state.accountHealth = result.data;
    renderAccountHealthDashboard(result.data);
    if (state.currentTab === 'dashboard-tab') renderDashboard();

    if (showToastAlert) {
      showToast('Đã làm mới dữ liệu', 'Đã cập nhật tình trạng rủi ro và sức khỏe tài khoản.', 'info', 3000);
    }
  } catch (err) {
    console.error('Lỗi nạp dữ liệu sức khỏe:', err);
  }
}

function renderAccountHealthDashboard(data) {
  // 1. Cập nhật Sidebar Pill & Alert Badge
  const sidebarDesc = document.getElementById('health-sidebar-text');
  const sidebarIcon = document.getElementById('health-sidebar-icon');
  const alertBadge = document.getElementById('health-nav-alert-badge');

  if (data.isRestricted) {
    if (alertBadge) alertBadge.style.display = 'inline-flex';
    if (sidebarDesc) sidebarDesc.textContent = `Bị giới hạn (${data.accountName || 'Nick'} nghỉ ${data.cooldownRemainingText})`;
    if (sidebarIcon) {
      sidebarIcon.className = 'health-sidebar-icon danger';
      sidebarIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-danger"></i>';
    }
  } else if (data.riskScore > 50) {
    if (alertBadge) alertBadge.style.display = 'none';
    if (sidebarDesc) sidebarDesc.textContent = 'Cảnh báo tần suất cao';
    if (sidebarIcon) {
      sidebarIcon.className = 'health-sidebar-icon warning';
      sidebarIcon.innerHTML = '<i class="fa-solid fa-triangle-exclamation text-warning"></i>';
    }
  } else {
    if (alertBadge) alertBadge.style.display = 'none';
    if (sidebarDesc) sidebarDesc.textContent = `${data.accountName || 'Tài khoản'} an toàn (Khỏe)`;
    if (sidebarIcon) {
      sidebarIcon.className = 'health-sidebar-icon success';
      sidebarIcon.innerHTML = '<i class="fa-solid fa-shield-halved text-success"></i>';
    }
  }

  // 2. Cập nhật Hero Banner
  const heroBadge = document.getElementById('health-hero-badge');
  const heroTitle = document.getElementById('health-hero-status-title');
  const heroHeading = document.getElementById('health-hero-heading');
  const heroDesc = document.getElementById('health-hero-desc');
  const cooldownBox = document.getElementById('health-cooldown-box');
  const cooldownTimer = document.getElementById('health-cooldown-timer');

  const scoreNum = document.getElementById('health-score-number');
  const scoreLevel = document.getElementById('health-score-level');
  const scoreCircle = document.getElementById('health-score-circle');

  if (scoreNum) scoreNum.textContent = data.riskScore;
  if (scoreLevel) {
    if (data.riskScore >= 70) {
      scoreLevel.textContent = 'NGUY HIỂM / BỊ CHẶN';
      scoreLevel.className = 'score-level-badge badge-pill danger';
      if (scoreCircle) scoreCircle.className = 'score-circle-wrap';
    } else if (data.riskScore >= 40) {
      scoreLevel.textContent = 'CẢNH BÁO TẦN SUẤT';
      scoreLevel.className = 'score-level-badge badge-pill warning';
      if (scoreCircle) scoreCircle.className = 'score-circle-wrap warning';
    } else {
      scoreLevel.textContent = 'AN TOÀN / KHỎE MẠNH';
      scoreLevel.className = 'score-level-badge badge-pill success';
      if (scoreCircle) scoreCircle.className = 'score-circle-wrap success';
    }
  }

  if (data.isRestricted) {
    if (heroBadge) {
      heroBadge.className = 'health-badge-status danger';
      if (heroTitle) heroTitle.textContent = `PHÁT HIỆN LỆNH GIỚI HẠN (${data.accountName || 'TÀI KHOẢN'})`;
    }
    if (heroHeading) heroHeading.textContent = `Tài Khoản "${data.accountName || ''}" Đang Bị Facebook Tạm Khóa Đăng Bài`;
    if (heroDesc) {
      heroDesc.textContent = `Lý do: "${data.lastRestrictionReason || 'Tạm thời bị hạn chế'}". Được phát hiện gần nhất tại nhóm "${data.lastRestrictionGroup || 'Facebook Group'}". Meta thường áp dụng chặn từ 24h đến 48h.`;
    }
    if (cooldownBox) cooldownBox.style.display = 'flex';
    if (cooldownTimer) cooldownTimer.textContent = data.cooldownRemainingText || 'Đang tính toán...';
  } else {
    if (heroBadge) {
      heroBadge.className = 'health-badge-status success';
      if (heroTitle) heroTitle.textContent = `TÀI KHOẢN "${data.accountName || ''}" HOÀN TOÀN BÌNH THƯỜNG`;
    }
    if (heroHeading) heroHeading.textContent = `Tài Khoản "${data.accountName || ''}" Sẵn Sàng Chạy Chiến Dịch`;
    if (heroDesc) {
      heroDesc.textContent = `Không phát hiện bất kỳ lệnh giới hạn nào từ Meta đối với ${data.accountName || 'tài khoản này'}. Bạn có thể tự tin triển khai chiến dịch đăng bài.`;
    }
    if (cooldownBox) {
      if (data.otherAccountsInCooldown && data.otherAccountsInCooldown.length > 0) {
        cooldownBox.style.display = 'flex';
        const otherNames = data.otherAccountsInCooldown.map(a => `${a.name} (còn ${a.cooldownRemainingText})`).join(', ');
        if (cooldownTimer) cooldownTimer.textContent = `Lưu ý: ${otherNames} đang làm mát an toàn.`;
      } else {
        cooldownBox.style.display = 'none';
      }
    }
  }

  // 3. Render 5 Risk Vectors
  const vectorsGrid = document.getElementById('risk-vectors-grid');
  if (vectorsGrid && Array.isArray(data.riskVectors)) {
    vectorsGrid.innerHTML = '';
    data.riskVectors.forEach(v => {
      const card = document.createElement('div');
      card.className = `risk-vector-card ${v.color || 'success'}`;
      card.innerHTML = `
        <div class="risk-vector-header">
          <span class="risk-vector-title">${escapeHtml(v.name)}</span>
          <div class="risk-vector-icon ${v.color || 'success'}">
            <i class="${v.icon || 'fa-solid fa-shield'}"></i>
          </div>
        </div>
        <div class="risk-vector-status" style="color: var(--${v.color || 'text-main'});">
          ${escapeHtml(v.label)}
        </div>
        <div class="risk-vector-desc">${escapeHtml(v.description)}</div>
      `;
      vectorsGrid.appendChild(card);
    });
  }

  // 4. Render Incidents
  const incidentContainer = document.getElementById('incident-list-container');
  const incidentBadge = document.getElementById('incident-count-badge');
  if (incidentBadge) incidentBadge.textContent = `${data.incidents ? data.incidents.length : 0} sự cố`;

  if (incidentContainer) {
    incidentContainer.innerHTML = '';
    if (!data.incidents || data.incidents.length === 0) {
      incidentContainer.innerHTML = `
        <div class="empty-state" style="padding: 24px;">
          <i class="fa-solid fa-shield-check text-success" style="font-size: 2rem;"></i>
          <p style="font-size: 0.88rem; margin-top: 8px;">Chưa ghi nhận sự cố bị Facebook cảnh báo nào.</p>
        </div>
      `;
    } else {
      data.incidents.forEach(inc => {
        const item = document.createElement('div');
        item.className = 'incident-card';
        const timeStr = new Date(inc.timestamp).toLocaleString('vi-VN');
        item.innerHTML = `
          <div class="incident-header">
            <span><i class="fa-solid fa-clock"></i> ${timeStr}</span>
            <span class="badge-pill danger"><i class="fa-solid fa-bolt"></i> ${inc.type || 'ACTION_BLOCK'}</span>
          </div>
          <div class="incident-reason"><i class="fa-solid fa-ban"></i> ${escapeHtml(inc.reason)}</div>
          <div class="incident-group"><i class="fa-solid fa-users"></i> Nhóm: <strong>${escapeHtml(inc.groupName || 'Hội Nhóm FB')}</strong></div>
        `;
        incidentContainer.appendChild(item);
      });
    }
  }

  // 5. Render Recovery Checklist
  const checklistContainer = document.getElementById('recovery-checklist-container');
  if (checklistContainer && Array.isArray(data.recoveryChecklist)) {
    checklistContainer.innerHTML = '';
    data.recoveryChecklist.forEach(c => {
      const step = document.createElement('div');
      step.className = 'recovery-step-item';
      const isCompleted = c.status === 'COMPLETED';
      step.innerHTML = `
        <div class="recovery-step-badge ${isCompleted ? 'completed' : ''}">
          ${isCompleted ? '<i class="fa-solid fa-check"></i>' : c.step}
        </div>
        <div class="recovery-step-content">
          <h4>${escapeHtml(c.title)}</h4>
          <p>${escapeHtml(c.desc)}</p>
        </div>
      `;
      checklistContainer.appendChild(step);
    });
  }
}

async function runLiveHealthProbe() {
  const btn = document.getElementById('btn-run-health-probe');
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang mở Chrome kiểm tra trực tiếp (10s)...';
  }

  showToast('Đang kiểm tra...', 'Bot đang truy cập Facebook ngầm để kiểm tra hộp thoại đăng bài...', 'info', 5000);

  try {
    const res = await fetch('/api/account-health/probe', { method: 'POST' });
    const result = await res.json();

    if (result.success && result.data) {
      await loadAccountHealthData();
      if (result.data.isRestricted) {
        showToast('Facebook Vẫn Đang Giới Hạn', result.data.message, 'danger', 7000);
        alert(`⚠️ KẾT QUẢ KIỂM TRA:\n${result.data.message}\n\nChi tiết: ${result.data.details || 'Không thể tạo bài viết lúc này.'}\n\nLời khuyên: Vui lòng để tài khoản nghỉ ngơi thêm như đồng hồ đếm ngược trên màn hình.`);
      } else {
        showToast('Tài Khoản Đã Sạch Gậy!', result.data.message, 'success', 7000);
        alert(`🎉 CHÚC MỪNG!\n${result.data.message}\n\nQuyền đăng bài trên tài khoản Facebook của bạn đã hoạt động bình thường.`);
      }
    } else {
      showToast('Lỗi kiểm tra', result.message || 'Không thể kiểm tra lúc này.', 'danger');
      alert(`Lỗi kiểm tra: ${result.message}`);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

// =========================================================
// 8. QUẢN LÝ ĐA TÀI KHOẢN (MULTI-ACCOUNT MANAGER)
// =========================================================

// =============================================================================
// SEPARATE GROUP & FANPAGE ACCOUNTS CONTROLLER (CHUYÊN BIỆT NHÓM & FANPAGE)
// =============================================================================

let masterAccountsScopeFilter = 'ALL';

function filterMasterAccountsScope(scope) {
  masterAccountsScopeFilter = scope;
  ['all', 'group', 'page', 'both'].forEach(s => {
    const btn = document.getElementById(`pill-acc-scope-${s}`);
    if (btn) btn.classList.toggle('active', s.toUpperCase() === scope);
  });
  renderAccountsTab(state.accounts || [], state.currentAccountId);
}

function updatePageAccountSelectorUI() {
  const select = document.getElementById('fanpage-active-account-select');
  if (!select) return;

  const accounts = (state.pageAccounts && state.pageAccounts.length > 0)
    ? state.pageAccounts
    : (state.accounts || []).filter(a => a.targetType === 'PAGE' || a.targetType === 'BOTH');

  if (accounts.length > 0) {
    const activeAccId = state.currentPageAccountId || accounts.find(a => a.isPageCurrent)?.id || accounts[0].id;
    select.innerHTML = accounts.map(acc => {
      const isSelected = acc.id === activeAccId ? 'selected' : '';
      const isCurr = acc.isPageCurrent ? '⭐ [Đang dùng]' : '';
      return `<option value="${acc.id}" ${isSelected}>${escapeHtml(acc.name)} (UID: ${acc.fbUserId}) ${isCurr}</option>`;
    }).join('');
  } else {
    select.innerHTML = `<option value="">Chưa có tài khoản Fanpage riêng (Bấm "Thiết Lập Nick Fanpage")</option>`;
  }
}

async function onPageAccountSelectChange(accId) {
  if (!accId) return;
  await switchPageAccount(accId);
}

async function switchGroupAccount(id) {
  try {
    const res = await fetch(`/api/accounts/${id}/switch-group`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Tài Khoản Đăng Nhóm', result.message, 'success');
      state.currentGroupAccountId = id;
      state.currentAccountId = id;
      await loadAccountsData();
      await loadGroups(id);
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function switchPageAccount(id) {
  try {
    const res = await fetch(`/api/accounts/${id}/switch-page`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Tài Khoản Fanpage', result.message, 'success');
      state.currentPageAccountId = id;
      await loadAccountsData();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function changeAccountTargetType(id, targetType) {
  try {
    const res = await fetch(`/api/accounts/${id}/set-target-type`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetType })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Cập nhật phân loại', result.message, 'success');
      await loadAccountsData();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

function selectAccountScopeModal(scope) {
  const target = (scope || 'GROUP').toUpperCase();
  window._currentAddAccountScope = target;
  ['group', 'page', 'both'].forEach(s => {
    const opt = document.getElementById(`scope-opt-${s}`);
    const input = opt?.querySelector('input');
    if (opt && input) {
      const match = s.toUpperCase() === target;
      opt.classList.toggle('active', match);
      input.checked = match;
    }
  });
}

function renderGroupAccountsTab() {
  const accounts = state.accounts || [];
  const groupAccs = accounts.filter(a => a.targetType === 'GROUP' || a.targetType === 'BOTH' || !a.targetType);
  const currentAcc = groupAccs.find(a => a.isGroupCurrent) || groupAccs.find(a => a.id === state.currentGroupAccountId) || groupAccs[0];

  // Update Hero Banner
  const nameEl = document.getElementById('group-banner-account-name');
  const uidEl = document.getElementById('group-banner-account-uid');
  const groupsEl = document.getElementById('group-banner-account-groups');
  const todayEl = document.getElementById('group-banner-account-today');
  const totalEl = document.getElementById('group-banner-account-total');
  const countEl = document.getElementById('group-accounts-count');

  if (countEl) countEl.textContent = groupAccs.length;

  if (currentAcc) {
    if (nameEl) nameEl.textContent = currentAcc.name;
    if (uidEl) uidEl.textContent = currentAcc.fbUserId || 'Chưa rõ UID';
    if (groupsEl) groupsEl.textContent = currentAcc.joinedGroupsCount || 0;
    if (todayEl) todayEl.textContent = (currentAcc.postsToday || 0) + ' bài';
    if (totalEl) totalEl.textContent = (currentAcc.totalPosts || 0) + ' bài';
  } else {
    if (nameEl) nameEl.textContent = 'Chưa có tài khoản Đăng Nhóm';
    if (uidEl) uidEl.textContent = '--';
    if (groupsEl) groupsEl.textContent = '0';
  }

  // Render Grid
  const grid = document.getElementById('group-accounts-cards-grid');
  if (!grid) return;

  if (groupAccs.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-users-slash" style="font-size: 2.2rem; color: #06b6d4; margin-bottom: 12px; display: block;"></i>
        <h4 style="color: var(--text-main); margin-bottom: 6px;">Chưa có tài khoản nào được phân loại cho Hội Nhóm</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 16px auto;">
          Bấm "Thêm Nick Đăng Nhóm Mới" để nạp tài khoản Facebook chuyên dùng cho việc cào lead, quét nhóm và đăng bài vào các group.
        </p>
        <button class="btn btn-primary" style="background: #06b6d4; border-color: #06b6d4;" onclick="openAddAccountModal('GROUP')">
          <i class="fa-solid fa-user-plus"></i> Thêm Nick Đăng Nhóm Ngay
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = groupAccs.map(acc => {
    const isCurr = acc.isGroupCurrent || (currentAcc && acc.id === currentAcc.id);
    const scopeBadge = acc.targetType === 'BOTH'
      ? '<span class="badge-scope both"><i class="fa-solid fa-arrows-split-up-and-left"></i> Dùng Cả Hai</span>'
      : '<span class="badge-scope group"><i class="fa-solid fa-users"></i> Chuyên Đăng Nhóm</span>';

    return `
      <div class="account-card ${isCurr ? 'is-active' : ''}">
        <div class="account-card-header">
          <div class="account-user-meta">
            <div class="account-avatar-wrap">
              <i class="fa-solid fa-users" style="color: #06b6d4;"></i>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700;">${escapeHtml(acc.name)}</h4>
                ${isCurr ? '<span class="badge-pill info" style="font-size: 0.68rem; padding: 1px 6px;"><i class="fa-solid fa-check"></i> Đang dùng cho Nhóm</span>' : ''}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">UID: ${escapeHtml(acc.fbUserId)}</div>
            </div>
          </div>
          <div>${scopeBadge}</div>
        </div>

        <div class="account-card-stats" style="grid-template-columns: repeat(3, 1fr); margin-top: 12px;">
          <div class="acc-stat-box">
            <div class="acc-stat-label">Đã Vào Nhóm</div>
            <div class="acc-stat-val text-success">${acc.joinedGroupsCount || 0}</div>
          </div>
          <div class="acc-stat-box">
            <div class="acc-stat-label">Hôm Nay</div>
            <div class="acc-stat-val text-primary">${acc.postsToday || 0} bài</div>
          </div>
          <div class="acc-stat-box">
            <div class="acc-stat-label">Tổng Bài Nhóm</div>
            <div class="acc-stat-val">${acc.totalPosts || 0}</div>
          </div>
        </div>

        <div class="account-card-actions" style="margin-top: 14px; display: flex; gap: 8px; justify-content: space-between; align-items: center;">
          <div>
            ${isCurr 
              ? '<button class="btn-switch-group is-current"><i class="fa-solid fa-circle-check"></i> Đang Chọn Cho Nhóm</button>'
              : `<button class="btn-switch-group" onclick="switchGroupAccount('${acc.id}')"><i class="fa-solid fa-star"></i> Chọn Đăng Nhóm Này</button>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-outline" onclick="openEditAccountModal('${acc.id}')" title="Cập nhật cookie / đổi tên"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline text-danger" onclick="deleteAccount('${acc.id}')" title="Xóa tài khoản"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function renderPageAccountsTab() {
  const accounts = state.accounts || [];
  const pageAccs = accounts.filter(a => a.targetType === 'PAGE' || a.targetType === 'BOTH');
  const currentAcc = pageAccs.find(a => a.isPageCurrent) || pageAccs.find(a => a.id === state.currentPageAccountId) || pageAccs[0];

  // Update Hero Banner
  const nameEl = document.getElementById('page-banner-account-name');
  const uidEl = document.getElementById('page-banner-account-uid');
  const pagesEl = document.getElementById('page-banner-account-pages');
  const apiEl = document.getElementById('page-banner-account-api');
  const countEl = document.getElementById('page-accounts-count');

  if (countEl) countEl.textContent = pageAccs.length;

  if (currentAcc) {
    if (nameEl) nameEl.textContent = currentAcc.name;
    if (uidEl) uidEl.textContent = currentAcc.fbUserId || (currentAcc.metaToken ? 'Meta Token' : 'Chưa rõ ID');
    if (pagesEl) pagesEl.textContent = '34 / 34 Fanpage';
    if (apiEl) apiEl.textContent = currentAcc.metaToken ? 'Meta Token Đã Gắn' : 'Cookie Sẵn Sàng';
  } else {
    if (nameEl) nameEl.textContent = 'Chưa có tài khoản Quản Trị Fanpage';
    if (uidEl) uidEl.textContent = '--';
    if (pagesEl) pagesEl.textContent = '0 / 34 Fanpage';
  }

  // Render Grid
  const grid = document.getElementById('page-accounts-cards-grid');
  if (!grid) return;

  if (pageAccs.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 36px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-flag" style="font-size: 2.2rem; color: #a855f7; margin-bottom: 12px; display: block;"></i>
        <h4 style="color: var(--text-main); margin-bottom: 6px;">Chưa có tài khoản nào được phân loại cho Fanpage</h4>
        <p style="font-size: 0.85rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 16px auto;">
          Bấm "Thêm Nick Quản Trị Page" để nạp tài khoản Facebook hoặc Token Meta Graph API chuyên biệt cho việc quản trị 34 Fanpage tỉnh thành.
        </p>
        <button class="btn btn-primary" style="background: #a855f7; border-color: #a855f7;" onclick="openAddAccountModal('PAGE')">
          <i class="fa-solid fa-user-plus"></i> Thêm Nick Quản Trị Page
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = pageAccs.map(acc => {
    const isCurr = acc.isPageCurrent || (currentAcc && acc.id === currentAcc.id);
    const scopeBadge = acc.targetType === 'BOTH'
      ? '<span class="badge-scope both"><i class="fa-solid fa-arrows-split-up-and-left"></i> Dùng Cả Hai</span>'
      : '<span class="badge-scope page"><i class="fa-solid fa-flag"></i> Quản Trị Page</span>';

    return `
      <div class="account-card ${isCurr ? 'is-active' : ''}" style="border-top: 3px solid #a855f7;">
        <div class="account-card-header">
          <div class="account-user-meta">
            <div class="account-avatar-wrap" style="background: rgba(168, 85, 247, 0.15); color: #a855f7;">
              <i class="fa-solid fa-flag"></i>
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700;">${escapeHtml(acc.name)}</h4>
                ${isCurr ? '<span class="badge-pill purple" style="font-size: 0.68rem; padding: 1px 6px;"><i class="fa-solid fa-check"></i> Đang dùng cho Page</span>' : ''}
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted); font-family: monospace;">UID/ID: ${escapeHtml(acc.fbUserId)}</div>
            </div>
          </div>
          <div>${scopeBadge}</div>
        </div>

        <div style="background: var(--bg-hover); padding: 8px 10px; border-radius: 6px; margin-top: 10px; font-size: 0.8rem;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: var(--text-muted);">Quyền quản trị:</span>
            <strong>34 Fanpage Tỉnh Thành</strong>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: var(--text-muted);">Meta API Token:</span>
            <span class="text-success font-mono">${acc.metaToken ? 'Đã kích hoạt' : 'Dùng Token Hệ Thống'}</span>
          </div>
        </div>

        <div class="account-card-actions" style="margin-top: 14px; display: flex; gap: 8px; justify-content: space-between; align-items: center;">
          <div>
            ${isCurr 
              ? '<button class="btn-switch-page is-current"><i class="fa-solid fa-circle-check"></i> Đang Chọn Cho Fanpage</button>'
              : `<button class="btn-switch-page" onclick="switchPageAccount('${acc.id}')"><i class="fa-solid fa-flag"></i> Chọn Quản Trị Page Này</button>`
            }
          </div>
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-sm btn-outline" onclick="openEditAccountModal('${acc.id}')" title="Cập nhật cookie / đổi tên"><i class="fa-solid fa-pen"></i></button>
            <button class="btn btn-sm btn-outline text-danger" onclick="deleteAccount('${acc.id}')" title="Xóa tài khoản"><i class="fa-solid fa-trash"></i></button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

async function loadAccountsData(showFeedback = false) {
  try {
    const res = await fetch('/api/accounts');
    const result = await res.json();

    if (result.success && Array.isArray(result.data)) {
      state.accounts = result.data;
      state.currentAccountId = result.current;

      // Cập nhật số lượng tài khoản trên thanh sidebar
      const badge = document.getElementById('accounts-count-badge');
      if (badge) badge.textContent = result.data.length;

      // Cập nhật tên nick đang kích hoạt trên Sidebar Profile Card
      const currentAcc = result.data.find(a => a.id === result.current) || result.data[0];
      const profileName = document.querySelector('.profile-name');
      if (profileName && currentAcc) {
        profileName.textContent = currentAcc.name;
        profileName.title = `Nick: ${currentAcc.name} (UID: ${currentAcc.fbUserId})`;
      }

      renderAccountsTab(result.data, result.current);
      updateGroupAccountSelectorUI();
      updateHeaderActiveAccountWidget();
      refreshNotificationCenter();

      if (showFeedback) {
        showToast('Đã làm mới danh sách', `Đang quản lý ${result.data.length} tài khoản Facebook.`, 'info');
      }
    }
  } catch (err) {
    console.error('Lỗi nạp danh sách tài khoản:', err);
    if (showFeedback) {
      showToast('Lỗi tải dữ liệu', err.message, 'danger');
    }
  }
}

function renderAccountsTab(accounts, currentId) {
  // Cập nhật số lượng đếm trên các Tab Filter
  const countAllEl = document.getElementById('count-master-all');
  const countGroupEl = document.getElementById('count-master-group');
  const countPageEl = document.getElementById('count-master-page');
  const countBothEl = document.getElementById('count-master-both');

  if (countAllEl) countAllEl.textContent = accounts.length;
  if (countGroupEl) countGroupEl.textContent = accounts.filter(a => a.targetType === 'GROUP' || !a.targetType).length;
  if (countPageEl) countPageEl.textContent = accounts.filter(a => a.targetType === 'PAGE').length;
  if (countBothEl) countBothEl.textContent = accounts.filter(a => a.targetType === 'BOTH').length;

  // Lọc theo masterAccountsScopeFilter nếu có
  let displayAccounts = accounts;
  if (masterAccountsScopeFilter === 'GROUP') {
    displayAccounts = accounts.filter(a => a.targetType === 'GROUP' || !a.targetType);
  } else if (masterAccountsScopeFilter === 'PAGE') {
    displayAccounts = accounts.filter(a => a.targetType === 'PAGE');
  } else if (masterAccountsScopeFilter === 'BOTH') {
    displayAccounts = accounts.filter(a => a.targetType === 'BOTH');
  }

  const currentAcc = accounts.find(a => a.id === currentId) || accounts.find(a => a.isCurrent) || accounts[0];

  // 1. Render Hero Banner
  const bannerName = document.getElementById('banner-account-name');
  const bannerUid = document.getElementById('banner-account-uid');
  const bannerToday = document.getElementById('banner-account-today');
  const bannerTotal = document.getElementById('banner-account-total');
  const bannerGroups = document.getElementById('banner-account-groups');
  const bannerBadge = document.getElementById('banner-account-badge');
  const bannerCooldown = document.getElementById('banner-cooldown-text');

  if (currentAcc) {
    if (bannerName) bannerName.textContent = currentAcc.name;
    if (bannerUid) bannerUid.textContent = currentAcc.fbUserId || 'Chưa rõ UID';
    if (bannerToday) bannerToday.textContent = (currentAcc.postsToday || 0) + ' bài';
    if (bannerTotal) bannerTotal.textContent = (currentAcc.totalPosts || 0) + ' bài';
    if (bannerGroups) bannerGroups.textContent = `${currentAcc.joinedGroupsCount || 0} / ${currentAcc.totalGroupsCount || 84} nhóm`;

    const isActionBlocked = currentAcc.status === 'ACTION_BLOCKED' || Boolean(currentAcc.actionBlock);
    const isCooldown = currentAcc.cooldownUntil && new Date(currentAcc.cooldownUntil) > new Date();

    if (isActionBlocked && bannerCooldown) {
      bannerCooldown.style.display = 'inline';
      bannerCooldown.style.background = 'rgba(245, 158, 11, 0.15)';
      bannerCooldown.style.color = '#d97706';
      bannerCooldown.style.border = '1px solid rgba(245, 158, 11, 0.4)';
      bannerCooldown.innerHTML = `<i class="fa-solid fa-hand"></i> Đang bị FB tạm khóa tính năng Xin Nhóm (Action Block)`;
    } else if (isCooldown && bannerCooldown) {
      const remainHours = Math.ceil((new Date(currentAcc.cooldownUntil) - new Date()) / (3600 * 1000));
      bannerCooldown.style.display = 'inline';
      bannerCooldown.style.background = '';
      bannerCooldown.style.color = '';
      bannerCooldown.style.border = '';
      bannerCooldown.innerHTML = `⚠️ Đang làm mát (còn ~${remainHours}h)`;
    } else if (bannerCooldown) {
      bannerCooldown.style.display = 'none';
    }
  } else {
    if (bannerName) bannerName.textContent = 'Chưa có tài khoản nào';
    if (bannerUid) bannerUid.textContent = '--';
    if (bannerGroups) bannerGroups.textContent = '0 / 0 nhóm';
  }

  // 2. Render Cards Grid
  const grid = document.getElementById('accounts-cards-grid');
  if (!grid) return;

  if (accounts.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 40px 20px; background: var(--bg-card); border-radius: var(--radius-lg); border: 1px dashed var(--border-color);">
        <i class="fa-solid fa-users-slash" style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 12px; display: block;"></i>
        <h4 style="color: var(--text-main); margin-bottom: 6px;">Chưa có tài khoản Facebook nào</h4>
        <p style="font-size: 0.88rem; color: var(--text-muted); max-width: 460px; margin: 0 auto 16px auto;">
          Bấm "Thêm Tài Khoản Mới" để dán Cookie đăng nhập nick tuyển dụng của bạn.
        </p>
        <button class="btn btn-primary" onclick="openAddAccountModal()">
          <i class="fa-solid fa-user-plus"></i> Thêm Tài Khoản Ngay
        </button>
      </div>
    `;
    return;
  }

  grid.innerHTML = '';
  displayAccounts.forEach(acc => {
    const isCurrent = (acc.id === currentId) || acc.isCurrent;
    const isCheckpoint = acc.status === 'CHECKPOINT';
    const isActionBlocked = acc.status === 'ACTION_BLOCKED' || Boolean(acc.actionBlock);
    const isCooldown = !isCheckpoint && !isActionBlocked && acc.cooldownUntil && new Date(acc.cooldownUntil) > new Date();
    const card = document.createElement('div');
    card.className = `account-card ${isCurrent ? 'is-active' : ''} ${isCheckpoint ? 'is-checkpoint' : ''} ${isActionBlocked ? 'is-action-blocked' : ''}`;

    const targetType = acc.targetType || 'GROUP';
    let scopeBadgeHtml = '';
    if (targetType === 'PAGE') {
      scopeBadgeHtml = '<span class="badge-scope page"><i class="fa-solid fa-flag"></i> Quản Trị Page</span>';
    } else if (targetType === 'BOTH') {
      scopeBadgeHtml = '<span class="badge-scope both"><i class="fa-solid fa-arrows-split-up-and-left"></i> Dùng Cả Hai</span>';
    } else {
      scopeBadgeHtml = '<span class="badge-scope group"><i class="fa-solid fa-users"></i> Chuyên Đăng Nhóm</span>';
    }

    let statusBadgeHtml = '';
    if (isCheckpoint) {
      statusBadgeHtml = `<span class="badge-pill danger" style="background: rgba(239, 68, 68, 0.15); color: var(--danger); border: 1px solid rgba(239, 68, 68, 0.4);"><i class="fa-solid fa-triangle-exclamation"></i> CHECKPOINT 282</span>`;
    } else if (isActionBlocked) {
      statusBadgeHtml = `<span class="badge-pill warning" style="background: rgba(245, 158, 11, 0.15); color: #d97706; border: 1px solid rgba(245, 158, 11, 0.4);"><i class="fa-solid fa-hand"></i> BỊ FB CHẶN TÍNH NĂNG</span>`;
    } else if (isCurrent) {
      statusBadgeHtml = `<span class="badge-pill success"><i class="fa-solid fa-circle-check"></i> ĐANG DÙNG</span>`;
    } else if (isCooldown) {
      statusBadgeHtml = `<span class="badge-pill warning"><i class="fa-solid fa-hourglass-half"></i> LÀM MÁT</span>`;
    } else {
      statusBadgeHtml = `<span class="badge-pill secondary"><i class="fa-solid fa-clock"></i> SẴN SÀNG</span>`;
    }

    let cooldownAlertHtml = '';
    if (isCheckpoint) {
      cooldownAlertHtml = `
        <div class="account-cooldown-alert" style="background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.35); color: var(--danger);">
          <i class="fa-solid fa-shield-virus" style="font-size: 1.1rem; margin-top: 2px;"></i>
          <div style="flex: 1;">
            <strong>Cảnh Báo: Dính Checkpoint 282 (Xác minh khuôn mặt)</strong>
            <div style="font-size: 0.78rem; margin-top: 3px; color: var(--text-main); line-height: 1.4;">
              ${escapeHtml(acc.checkpointReason || 'Facebook yêu cầu quay video selfie xác minh người thật do tham gia nhóm/đăng bài dồn dập.')}
            </div>
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" style="font-size: 0.75rem; padding: 4px 10px;" onclick="openLoginWindow()">
                <i class="fa-solid fa-camera"></i> Mở Chrome Xác Minh Selfie
              </button>
              <button class="btn btn-sm btn-outline" style="font-size: 0.75rem; padding: 4px 10px; color: var(--success); border-color: var(--success);" onclick="resolveCheckpoint('${acc.id}')">
                <i class="fa-solid fa-circle-check"></i> Đã Gỡ Xong (Kích Hoạt Lại)
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (isActionBlocked) {
      const block = acc.actionBlock || {};
      const hasUnblockAt = block.unblockAt && new Date(block.unblockAt) > new Date();
      let timerHtml = '';
      if (hasUnblockAt) {
        const diffMs = new Date(block.unblockAt) - new Date();
        const diffH = Math.floor(diffMs / (3600 * 1000));
        const diffM = Math.floor((diffMs % (3600 * 1000)) / (60 * 1000));
        const timeStr = `${diffH > 0 ? `${diffH} giờ ` : ''}${diffM} phút`;
        timerHtml = `
          <div style="font-size: 0.75rem; color: #b45309; margin-top: 5px; font-weight: 600; display: flex; align-items: center; gap: 5px;">
            <i class="fa-solid fa-hourglass-half"></i> 
            <span>Tự động hết hạn sau: <strong>${timeStr}</strong> (lúc ${new Date(block.unblockAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})</span>
          </div>
        `;
      }
      cooldownAlertHtml = `
        <div class="account-cooldown-alert" style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.35); color: #b45309; padding: 10px 12px; border-radius: 8px;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 1.15rem; margin-top: 2px; color: #d97706;"></i>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
              <strong style="color: #b45309; font-size: 0.85rem;">⚠️ Tạm Khóa Tính Năng: ${escapeHtml(block.featureName || 'Xin Vào Nhóm')}</strong>
              <span style="font-size: 0.72rem; background: rgba(245, 158, 11, 0.2); color: #d97706; padding: 2px 6px; border-radius: 4px; font-weight: 600;">Action Block</span>
            </div>
            <div style="font-size: 0.79rem; color: var(--text-main); line-height: 1.45; margin-top: 4px;">
              ${escapeHtml(block.reason || 'Do nick đã xin vào hơn 20 nhóm liên tiếp, thuật toán chống spam của Facebook đã tạm thời khóa tính năng xin vào nhóm của tài khoản này trong vài giờ. Facebook không chấp nhận lệnh tham gia nhóm, do đó nút trên Facebook vẫn giữ nguyên là "Tham gia nhóm".')}
            </div>
            <div style="font-size: 0.75rem; color: #d97706; margin-top: 5px; font-weight: 500;">
              💡 <em>Khuyến nghị:</em> ${escapeHtml(block.recommendation || 'Để tài khoản nghỉ ngơi từ 2 - 6 tiếng, tạm dừng xin vào nhóm để tránh Facebook quét Checkpoint 282.')}
            </div>
            ${timerHtml}
            <div style="margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap;">
              <button class="btn btn-sm btn-primary" id="btn-probe-${acc.id}" style="font-size: 0.74rem; padding: 4px 10px; background: #d97706; border-color: #b45309; color: #fff;" onclick="testActionBlock('${acc.id}', this)" title="Dùng Chrome ngầm thử tương tác để kiểm tra Facebook đã mở lại tính năng chưa">
                <i class="fa-solid fa-magnifying-glass"></i> Tự Động Kiểm Tra Ngay
              </button>
              <button class="btn btn-sm btn-outline" style="font-size: 0.74rem; padding: 4px 10px; color: #b45309; border-color: rgba(245, 158, 11, 0.5);" onclick="clearActionBlock('${acc.id}')" title="Bấm khi bạn đã kiểm tra nick trên FB và thấy nút tham gia nhóm hoạt động lại bình thường">
                <i class="fa-solid fa-rotate-left"></i> Đã Hết Chặn (Gỡ Thủ Công)
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (isCooldown) {
      const remainMs = new Date(acc.cooldownUntil) - new Date();
      const remainH = Math.floor(remainMs / (3600 * 1000));
      const remainM = Math.floor((remainMs % (3600 * 1000)) / (60 * 1000));
      cooldownAlertHtml = `
        <div class="account-cooldown-alert">
          <i class="fa-solid fa-triangle-exclamation"></i>
          <div>
            <strong>Đang nghỉ làm mát an toàn:</strong> Còn ${remainH}h ${remainM}p
          </div>
        </div>
      `;
    }

    card.innerHTML = `
      <div class="account-card-header">
        <div class="account-avatar" style="${isCheckpoint ? 'background: rgba(239, 68, 68, 0.15); color: var(--danger);' : ''}">
          <i class="${isCheckpoint ? 'fa-solid fa-user-shield' : 'fa-brands fa-facebook-f'}"></i>
        </div>
        <div class="account-title-wrap">
          <div style="display: flex; justify-content: space-between; align-items: center; gap: 6px;">
            <h3 title="${escapeHtml(acc.name)}" style="${isCheckpoint ? 'color: var(--danger);' : ''}">${escapeHtml(acc.name)}</h3>
            ${statusBadgeHtml}
          </div>
          <div class="account-uid-row">
            <span>UID:</span>
            <span class="account-uid-code" onclick="copyTextToClipboard('${escapeHtml(acc.fbUserId)}')" title="Bấm để copy UID">${escapeHtml(acc.fbUserId || 'N/A')}</span>
            <button class="btn-icon" style="padding: 2px 4px; font-size: 0.75rem;" onclick="copyTextToClipboard('${escapeHtml(acc.fbUserId)}')" title="Copy UID">
              <i class="fa-regular fa-copy"></i>
            </button>
          </div>
        </div>
      </div>

      <div class="account-stats-row">
        <div class="account-stat-item">
          <span>Bài Hôm Nay</span>
          <strong class="text-success">${acc.postsToday || 0} bài</strong>
        </div>
        <div class="account-stat-item">
          <span>Tổng Đã Đăng</span>
          <strong class="text-primary">${acc.totalPosts || 0} bài</strong>
        </div>
        <div class="account-stat-item" title="Số lượng hội nhóm tài khoản này đã tham gia">
          <span>Nhóm Đã Vào</span>
          <strong style="color: #0284c7;">${acc.joinedGroupsCount || 0} <span style="font-size: 0.75rem; font-weight: 500; color: var(--text-muted);">/ ${acc.totalGroupsCount || 84}</span></strong>
        </div>
      </div>

      <div class="account-proxy-badge-row" style="margin: 8px 0 12px 0; padding: 7px 10px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: 8px; display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.78rem;">
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${acc.proxy ? `
            <i class="fa-solid fa-shield-halved text-success" style="font-size: 0.85rem;" title="Đã có Proxy bảo vệ"></i>
            <span style="color: var(--text-muted); font-size: 0.72rem;">Proxy:</span>
            <strong style="font-family: monospace; color: #059669;" title="${escapeHtml(acc.proxy)}">${escapeHtml(formatProxyDisplay(acc.proxy))}</strong>
          ` : `
            <i class="fa-solid fa-triangle-exclamation" style="color: #f59e0b; font-size: 0.85rem;" title="Chưa gán Proxy, đang dùng IP mạng nhà"></i>
            <span style="color: var(--text-muted); font-size: 0.72rem;">Mạng:</span>
            <span style="color: #d97706; font-weight: 500;">IP Mạng Nhà</span>
          `}
        </div>
        <div>
          ${acc.proxy ? `
            <span style="font-size: 0.68rem; background: rgba(16, 185, 129, 0.12); color: #059669; padding: 2px 7px; border-radius: 4px; font-weight: 600; border: 1px solid rgba(16, 185, 129, 0.3);">
              <i class="fa-solid fa-lock"></i> Đã Ẩn IP
            </span>
          ` : `
            <button class="btn btn-sm btn-outline" style="padding: 2px 8px; font-size: 0.72rem; color: #d97706; border-color: rgba(245, 158, 11, 0.4);" onclick="openEditAccountModal('${acc.id}')" title="Thêm Proxy riêng cho nick này">
              + Gán Proxy
            </button>
          `}
        </div>
      </div>

      ${cooldownAlertHtml}

      <div class="account-card-actions">
        <div>
          ${
            isCheckpoint
              ? `<button class="btn btn-sm btn-outline" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.4); opacity: 0.7;" disabled><i class="fa-solid fa-ban"></i> Tạm Khóa (Đợi Gỡ)</button>`
              : isCurrent
                ? `<button class="btn btn-sm btn-success" disabled style="opacity: 0.9;"><i class="fa-solid fa-circle-check"></i> Đang là Nick Chính</button>`
                : `<button class="btn btn-sm btn-primary" onclick="switchActiveAccount('${acc.id}')"><i class="fa-solid fa-right-left"></i> Kích Hoạt Nick Này</button>`
          }
        </div>
        <div class="account-actions-group">
          <button class="btn btn-sm btn-secondary" onclick="openEditAccountModal('${acc.id}')" title="Chỉnh sửa tên hoặc đổi Cookie">
            <i class="fa-solid fa-pen"></i> Sửa
          </button>
          ${
            accounts.length > 1
              ? `<button class="btn btn-sm btn-outline" style="color: var(--danger); border-color: rgba(239, 68, 68, 0.3);" onclick="confirmDeleteAccount('${acc.id}', '${escapeHtml(acc.name)}')" title="Xóa tài khoản này">
                  <i class="fa-solid fa-trash"></i>
                </button>`
              : ''
          }
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function formatProxyDisplay(proxyStr) {
  if (!proxyStr) return '';
  try {
    if (proxyStr.includes('@')) {
      const url = new URL(proxyStr.startsWith('http') ? proxyStr : `http://${proxyStr}`);
      return `${url.hostname}:${url.port}`;
    }
    const parts = proxyStr.split(':');
    if (parts.length >= 2) {
      return `${parts[0]}:${parts[1]}`;
    }
    return proxyStr;
  } catch (e) {
    return proxyStr;
  }
}

async function testProxyInput(mode) {
  const inputId = mode === 'new' ? 'new-account-proxy' : 'edit-account-proxy';
  const btnId = mode === 'new' ? 'btn-test-new-proxy' : 'btn-test-edit-proxy';
  const feedbackId = mode === 'new' ? 'new-account-proxy-feedback' : 'edit-account-proxy-feedback';

  const inputEl = document.getElementById(inputId);
  const btnEl = document.getElementById(btnId);
  const feedbackEl = document.getElementById(feedbackId);

  const proxyStr = inputEl ? inputEl.value.trim() : '';
  if (!proxyStr) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = 'rgba(239, 68, 68, 0.1)';
      feedbackEl.style.color = 'var(--danger)';
      feedbackEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      feedbackEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng nhập thông tin Proxy trước khi bấm kiểm tra!';
    }
    return;
  }

  const originalBtnHtml = btnEl ? btnEl.innerHTML : '';
  if (btnEl) {
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang test...';
  }
  if (feedbackEl) {
    feedbackEl.style.display = 'block';
    feedbackEl.style.background = 'rgba(59, 130, 246, 0.1)';
    feedbackEl.style.color = '#2563eb';
    feedbackEl.style.border = '1px solid rgba(59, 130, 246, 0.3)';
    feedbackEl.innerHTML = '<i class="fa-solid fa-circle-notch fa-spin"></i> Đang kết nối thử nghiệm qua Proxy...';
  }

  try {
    const res = await fetch('/api/accounts/test-proxy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proxy: proxyStr })
    });
    const data = await res.json();

    if (data.success) {
      if (feedbackEl) {
        feedbackEl.style.display = 'block';
        feedbackEl.style.background = 'rgba(16, 185, 129, 0.12)';
        feedbackEl.style.color = '#059669';
        feedbackEl.style.border = '1px solid rgba(16, 185, 129, 0.35)';
        feedbackEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <strong>Proxy Sống Tốt!</strong> IP ra ngoài: <span style="font-family: monospace; font-weight: bold;">${data.ip}</span> (Độ trễ: ${data.latencyMs}ms). Đã ẩn an toàn IP thật.`;
      }
      showToast('Proxy hoạt động!', `IP ra ngoài: ${data.ip} (${data.latencyMs}ms)`, 'success');
    } else {
      if (feedbackEl) {
        feedbackEl.style.display = 'block';
        feedbackEl.style.background = 'rgba(239, 68, 68, 0.12)';
        feedbackEl.style.color = 'var(--danger)';
        feedbackEl.style.border = '1px solid rgba(239, 68, 68, 0.35)';
        feedbackEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> <strong>Proxy không kết nối được:</strong> ${data.message || 'Lỗi kết nối'}`;
      }
      showToast('Proxy không hoạt động', data.message || 'Lỗi kết nối', 'danger');
    }
  } catch (err) {
    if (feedbackEl) {
      feedbackEl.style.display = 'block';
      feedbackEl.style.background = 'rgba(239, 68, 68, 0.12)';
      feedbackEl.style.color = 'var(--danger)';
      feedbackEl.style.border = '1px solid rgba(239, 68, 68, 0.35)';
      feedbackEl.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Lỗi hệ thống: ${err.message}`;
    }
    showToast('Lỗi kiểm tra proxy', err.message, 'danger');
  } finally {
    if (btnEl) {
      btnEl.disabled = false;
      btnEl.innerHTML = originalBtnHtml;
    }
  }
}

function openAddAccountModal(presetScope = 'GROUP') {
  const modal = document.getElementById('add-account-modal');
  if (!modal) return;
  const nameEl = document.getElementById('new-account-name');
  const cookieEl = document.getElementById('new-account-cookie');
  const proxyEl = document.getElementById('new-account-proxy');
  const proxyFeedbackEl = document.getElementById('new-account-proxy-feedback');

  if (nameEl) nameEl.value = '';
  if (cookieEl) cookieEl.value = '';
  if (proxyEl) proxyEl.value = '';
  if (proxyFeedbackEl) {
    proxyFeedbackEl.style.display = 'none';
    proxyFeedbackEl.innerHTML = '';
  }
  selectAccountScopeModal(presetScope);
  modal.classList.add('active');
  if (nameEl) setTimeout(() => nameEl.focus(), 100);
}

function closeAddAccountModal() {
  const modal = document.getElementById('add-account-modal');
  if (modal) modal.classList.remove('active');
}

async function submitNewAccount() {
  const nameInput = document.getElementById('new-account-name');
  const cookieInput = document.getElementById('new-account-cookie');
  const proxyInput = document.getElementById('new-account-proxy');

  const name = nameInput ? nameInput.value.trim() : '';
  const cookieString = cookieInput ? cookieInput.value.trim() : '';
  const proxy = proxyInput ? proxyInput.value.trim() : '';

  if (!name) {
    showToast('Thiếu thông tin', 'Vui lòng nhập tên gợi nhớ cho tài khoản (Ví dụ: Nick Tuyển Dụng 2).', 'warning');
    if (nameInput) nameInput.focus();
    return;
  }

  if (!cookieString) {
    showToast('Thiếu Cookie', 'Vui lòng dán chuỗi Cookie Facebook vào khung.', 'warning');
    if (cookieInput) cookieInput.focus();
    return;
  }

  showToast('Đang lưu tài khoản...', 'Hệ thống đang trích xuất UID và xác thực Cookie Facebook...', 'info');

  const selectedScopeInput = document.querySelector('input[name="account-target-type"]:checked');
  const targetType = selectedScopeInput ? selectedScopeInput.value : (window._currentAddAccountScope || 'GROUP');

  try {
    const res = await fetch('/api/accounts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cookieString, targetType, proxy })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Thêm Thành Công!', result.message, 'success', 5000);
      closeAddAccountModal();
      await loadAccountsData();
      await checkBrowserProfileStatus();
    } else {
      showToast('Lỗi Thêm Tài Khoản', result.message, 'danger', 7000);
      alert(`❌ Lỗi: ${result.message}`);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

function openEditAccountModal(id) {
  const acc = state.accounts.find(a => a.id === id);
  if (!acc) return;

  const modal = document.getElementById('edit-account-modal');
  const idInput = document.getElementById('edit-account-id');
  const nameInput = document.getElementById('edit-account-name');
  const cookieInput = document.getElementById('edit-account-cookie');
  const proxyInput = document.getElementById('edit-account-proxy');
  const feedbackEl = document.getElementById('edit-account-proxy-feedback');

  if (idInput) idInput.value = acc.id;
  if (nameInput) nameInput.value = acc.name;
  if (cookieInput) cookieInput.value = '';
  if (proxyInput) proxyInput.value = acc.proxy || '';
  if (feedbackEl) {
    feedbackEl.style.display = 'none';
    feedbackEl.innerHTML = '';
  }

  if (modal) modal.classList.add('active');
}

function closeEditAccountModal() {
  const modal = document.getElementById('edit-account-modal');
  if (modal) modal.classList.remove('active');
}

async function submitEditAccount() {
  const idInput = document.getElementById('edit-account-id');
  const nameInput = document.getElementById('edit-account-name');
  const cookieInput = document.getElementById('edit-account-cookie');
  const proxyInput = document.getElementById('edit-account-proxy');

  const id = idInput ? idInput.value : '';
  const name = nameInput ? nameInput.value.trim() : '';
  const cookieString = cookieInput ? cookieInput.value.trim() : '';
  const proxy = proxyInput ? proxyInput.value.trim() : '';

  if (!id) return;
  if (!name) {
    showToast('Thiếu thông tin', 'Vui lòng nhập tên tài khoản.', 'warning');
    return;
  }

  try {
    const res = await fetch(`/api/accounts/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, cookieString, proxy })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Cập Nhật Thành Công', result.message, 'success');
      closeEditAccountModal();
      await loadAccountsData();
      await checkBrowserProfileStatus();
    } else {
      showToast('Lỗi Cập Nhật', result.message, 'danger');
      alert(`❌ Lỗi: ${result.message}`);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function switchActiveAccount(id) {
  const target = state.accounts.find(a => a.id === id);
  const targetName = target ? target.name : 'tài khoản này';

  if (!confirm(`Bạn có chắc chắn muốn chuyển sang nick "${targetName}" để làm tài khoản đăng bài chính không?`)) {
    return;
  }

  showToast('Đang chuyển đổi nick...', `Đang nạp Cookie của "${targetName}" vào trình duyệt Chrome...`, 'info', 4000);

  try {
    const res = await fetch(`/api/accounts/${id}/switch`, { method: 'POST' });
    const result = await res.json();

    if (result.success) {
      showToast('Chuyển Nick Thành Công!', result.message, 'success', 6000);
      await loadAccountsData();
      await checkBrowserProfileStatus();
      await loadAccountHealthData();
      await loadGroups();
    } else {
      showToast('Lỗi chuyển nick', result.message, 'danger', 6000);
      alert(`❌ Lỗi chuyển tài khoản: ${result.message}`);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function resolveCheckpoint(id) {
  if (!confirm('Bạn đã hoàn tất quay video selfie trên Facebook và tài khoản đã được Facebook mở lại hoạt động bình thường?')) {
    return;
  }
  try {
    const res = await fetch(`/api/accounts/${id}/resolve-checkpoint`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Gỡ Checkpoint', result.message, 'success');
      await loadAccountsData();
      await loadAccountHealthData();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (e) {
    showToast('Lỗi kết nối', e.message, 'danger');
  }
}

async function clearActionBlock(id) {
  if (!confirm('Bạn có muốn gỡ bỏ cảnh báo chặn tính năng cho tài khoản này không?')) {
    return;
  }
  try {
    const res = await fetch(`/api/accounts/${id}/clear-action-block`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Đã Gỡ Cảnh Báo Chặn Tính Năng', result.message, 'success');
      await loadAccountsData();
      await loadAccountHealthData();
    } else {
      showToast('Lỗi', result.message, 'danger');
    }
  } catch (e) {
    showToast('Lỗi kết nối', e.message, 'danger');
  }
}

async function testActionBlock(id, btn) {
  const originalHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kiểm tra...';
  }
  showToast('Đang Kiểm Tra Tự Động', 'Hệ thống đang mở Chrome ngầm để kiểm tra tính năng trên Facebook...', 'info');

  try {
    const res = await fetch(`/api/accounts/${id}/test-action-block`, { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      if (!result.isBlocked) {
        showToast('Đã Hết Chặn!', result.message, 'success');
      } else {
        showToast('Vẫn Đang Bị Chặn', result.message, 'warning');
      }
      await loadAccountsData();
      await loadAccountHealthData();
    } else {
      showToast('Kiểm tra thất bại', result.message || 'Lỗi không xác định', 'danger');
    }
  } catch (e) {
    showToast('Lỗi kết nối', e.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }
}

async function confirmDeleteAccount(id, name) {
  if (!confirm(`Bạn có chắc chắn muốn xóa tài khoản "${name}" khỏi hệ thống không?`)) {
    return;
  }

  try {
    const res = await fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    const result = await res.json();

    if (result.success) {
      showToast('Đã xóa tài khoản', result.message, 'info');
      await loadAccountsData();
      await checkBrowserProfileStatus();
    } else {
      showToast('Lỗi xóa tài khoản', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

function copyTextToClipboard(text) {
  if (!text || text === 'N/A' || text === '--') return;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Đã sao chép!', `Link: ${text}`, 'success', 2000);
  }).catch(() => {
    const tempInput = document.createElement('input');
    tempInput.value = text;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand('copy');
    document.body.removeChild(tempInput);
    showToast('Đã sao chép!', `Link: ${text}`, 'success', 2000);
  });
}

// =========================================================
// 9. BẢNG ĐO LƯỜNG TUYỂN DỤNG & VỊ TRÍ VIỆC LÀM (POSITIONS TRACKER)
// =========================================================
async function loadPositionsReportData(showFeedback = false) {
  try {
    const res = await fetch('/api/positions/kpi');
    const result = await res.json();

    if (result.success && result.data && result.data.report) {
      const rep = result.data.report;
      state.positionsReport = rep;
      state.positionsKpi = result.data.kpi || {};

      // Cập nhật các thẻ KPI tổng hợp
      const kpiPosts = document.getElementById('kpi-total-posts');
      const kpiLiveRate = document.getElementById('kpi-live-rate');
      const kpiCv = document.getElementById('kpi-total-cv');
      const kpiCvBar = document.getElementById('kpi-cv-progress-bar');
      const kpiPostsPerCv = document.getElementById('kpi-posts-per-cv');
      const kpiCompleted = document.getElementById('kpi-completed-positions');

      if (kpiPosts) kpiPosts.textContent = `${rep.totalPosts} bài`;
      if (kpiLiveRate) kpiLiveRate.textContent = `${rep.totalDirect} bài sống trên nhóm`;

      const targetSum = rep.totalTargetCv || 1;
      const cvSum = rep.totalCv || 0;
      if (kpiCv) kpiCv.textContent = `${cvSum} / ${rep.totalTargetCv || 0} CV`;
      if (kpiCvBar) {
        const pct = Math.min(100, Math.round((cvSum / targetSum) * 100));
        kpiCvBar.style.width = `${pct}%`;
      }

      // Tỷ lệ bài / 1 CV trung bình
      if (kpiPostsPerCv) {
        if (cvSum > 0) {
          const ratio = Math.round((rep.totalDirect / cvSum) * 10) / 10;
          kpiPostsPerCv.textContent = `~${ratio} bài / 1 CV`;
        } else if (rep.totalDirect > 0) {
          kpiPostsPerCv.textContent = `> ${rep.totalDirect} bài`;
        } else {
          kpiPostsPerCv.textContent = `--`;
        }
      }

      if (kpiCompleted) {
        kpiCompleted.textContent = `${rep.completedPositions || 0} / ${rep.totalPositions || 0} vị trí`;
      }

      // 1. Render Bảng Tổng Hợp Vị Trí kèm KPI
      renderPositionsSummaryTable(rep.positions || [], rep.totalPosts || 0);

      // 2. Cập nhật Filter Dropdown
      updatePositionsFilterDropdown(rep.positions || []);

      // 3. Render Bảng Chi Tiết Bài Đăng
      filterPositionsRecords();

      // 4. Nếu chưa có từ khóa phân tích thị trường, tự động điền vị trí đầu tiên
      const marketQueryInput = document.getElementById('market-query-title');
      if (marketQueryInput && !marketQueryInput.value && rep.positions && rep.positions.length > 0) {
        marketQueryInput.value = rep.positions[0].positionName;
      }

      if (showFeedback) {
        showToast('Đã làm mới dữ liệu', `Đã đồng bộ báo cáo ${rep.totalPositions} vị trí tuyển dụng.`, 'info');
      }
    }
  } catch (err) {
    console.error('Lỗi tải báo cáo vị trí tuyển dụng:', err);
    if (showFeedback) {
      showToast('Lỗi kết nối', err.message, 'danger');
    }
  }
}

function renderPositionsSummaryTable(positions, totalPosts) {
  const tbody = document.getElementById('positions-summary-tbody');
  const tfoot = document.getElementById('positions-summary-tfoot');
  if (!tbody) return;

  if (positions.length === 0) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center py-4" style="color: var(--text-dim);">Chưa có bài tuyển dụng nào được chạy.</td></tr>`;
    if (tfoot) tfoot.innerHTML = '';
    return;
  }

  tbody.innerHTML = '';
  positions.forEach((pos, idx) => {
    const tr = document.createElement('tr');

    let statusBadge = `<span class="badge-pill info"><i class="fa-solid fa-paper-plane"></i> Đang tuyển</span>`;
    if (pos.status === 'TARGET_MET') {
      statusBadge = `<span class="badge-pill success"><i class="fa-solid fa-check"></i> Đã đủ CV</span>`;
    } else if (pos.status === 'POST_CAP_REACHED') {
      statusBadge = `<span class="badge-pill danger"><i class="fa-solid fa-hand"></i> Chạm trần</span>`;
    }

    const postsRatioDisplay = pos.postsPerCv === '--'
      ? `<span style="color: var(--text-dim); font-size: 0.8rem;">--</span>`
      : `<strong style="color: var(--success); font-size: 0.88rem;">${pos.postsPerCv}</strong> <small style="color: var(--text-muted);">(${pos.cvConversionRate}%)</small>`;

    tr.innerHTML = `
      <td><strong>#${idx + 1}</strong></td>
      <td>
        <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(pos.positionName)}</strong>
        <div style="font-size: 0.76rem; color: var(--text-muted);">${escapeHtml(pos.company)}</div>
      </td>
      <td class="text-center">
        <span class="badge-pill primary" style="font-size: 0.88rem; font-weight: 700; padding: 3px 10px;">${pos.totalLive} / ${pos.totalPosts}</span>
      </td>
      <td class="text-center">
        <strong style="color: var(--text-main); font-size: 0.9rem;">${pos.targetCv} CV</strong>
      </td>
      <td class="text-center">
        <div class="cv-counter-wrap">
          <button class="btn-cv-adjust minus" onclick="adjustPositionCv('${escapeHtml(pos.positionName)}', -1)" title="Giảm 1 CV"><i class="fa-solid fa-minus"></i></button>
          <span class="cv-count-display">${pos.cvCount}</span>
          <button class="btn-cv-adjust plus" onclick="adjustPositionCv('${escapeHtml(pos.positionName)}', 1)" title="Thêm 1 CV"><i class="fa-solid fa-plus"></i></button>
        </div>
      </td>
      <td class="text-center">${postsRatioDisplay}</td>
      <td class="text-center">
        <span style="font-size: 0.86rem; color: var(--text-muted);">${pos.maxPostsCap} bài</span>
      </td>
      <td class="text-center">${statusBadge}</td>
      <td class="text-center">
        <label class="switch-autostop" title="Tự động dừng khi đạt KPI">
          <input type="checkbox" ${pos.autoStopEnabled ? 'checked' : ''} onchange="toggleAutoStop('${escapeHtml(pos.positionName)}', this.checked)">
          <span style="color: ${pos.autoStopEnabled ? 'var(--emerald)' : 'var(--text-muted)'};">${pos.autoStopEnabled ? 'Bật' : 'Tắt'}</span>
        </label>
      </td>
      <td class="text-center">
        <button class="btn btn-xs btn-outline" onclick="openPositionKpiModal('${escapeHtml(pos.positionName)}')" title="Cài đặt chỉ tiêu vị trí này">
          <i class="fa-solid fa-gear"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  const totalReceivedCv = positions.reduce((acc, p) => acc + (p.cvCount || 0), 0);
  const totalTargetCv = positions.reduce((acc, p) => acc + (p.targetCv || 0), 0);

  if (tfoot) {
    tfoot.innerHTML = `
      <tr>
        <td colspan="2" style="font-size: 0.92rem; color: var(--text-main); text-transform: uppercase;"><strong>Tổng Cộng:</strong></td>
        <td class="text-center" style="font-size: 1rem; color: var(--primary); font-weight: 800;">${totalPosts} bài</td>
        <td class="text-center" style="font-size: 0.95rem; font-weight: 700;">${totalTargetCv} CV</td>
        <td class="text-center" style="font-size: 1rem; color: var(--warning); font-weight: 800;">${totalReceivedCv} CV</td>
        <td colspan="5"></td>
      </tr>
    `;
  }
}

function updatePositionsFilterDropdown(positions) {
  const sel = document.getElementById('filter-position-select');
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = `<option value="ALL">Tất Cả Vị Trí Tuyển Dụng (${positions.length})</option>`;

  positions.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.positionName;
    opt.textContent = `${p.positionName} (${p.totalPosts} bài)`;
    if (p.positionName === currentVal) opt.selected = true;
    sel.appendChild(opt);
  });
}

function filterPositionsRecords() {
  if (!state.positionsReport || !Array.isArray(state.positionsReport.records)) return;

  const sel = document.getElementById('filter-position-select');
  const posFilter = sel ? sel.value : 'ALL';
  const q = (document.getElementById('positions-record-search')?.value || '').toLowerCase().trim();

  const filtered = state.positionsReport.records.filter(r => {
    const matchPos = posFilter === 'ALL' || r.positionName === posFilter;
    const matchQuery = !q ||
      (r.company && r.company.toLowerCase().includes(q)) ||
      (r.positionName && r.positionName.toLowerCase().includes(q)) ||
      (r.groupName && r.groupName.toLowerCase().includes(q)) ||
      (r.postUrl && r.postUrl.toLowerCase().includes(q)) ||
      (r.dateFormatted && r.dateFormatted.includes(q));

    return matchPos && matchQuery;
  });

  renderPositionsRecordsTable(filtered);
}

function filterBySpecificPosition(posName) {
  const sel = document.getElementById('filter-position-select');
  if (sel) {
    sel.value = posName;
  }
  filterPositionsRecords();

  const sec = document.getElementById('positions-records-tbody');
  if (sec) {
    sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function renderPositionsRecordsTable(records) {
  const tbody = document.getElementById('positions-records-tbody');
  if (!tbody) return;

  if (records.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4" style="color: var(--text-dim);">Không có bài đăng nào khớp với bộ lọc hiện tại.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  records.forEach(r => {
    const tr = document.createElement('tr');

    let linkHtml = '';
    const safePosGroupUrl = (r.groupUrl && r.groupUrl.startsWith('http'))
      ? r.groupUrl
      : (r.groupId && /^\d+$/.test(String(r.groupId).trim())
          ? `https://www.facebook.com/profile.php?id=${String(r.groupId).trim()}`
          : (r.groupId && String(r.groupId).startsWith('http') ? r.groupId : 'https://www.facebook.com/JobCentralVietNam/'));

    let cleanPosPostUrl = (r.postUrl || '').trim();
    if (cleanPosPostUrl.includes('_mock_')) {
      cleanPosPostUrl = safePosGroupUrl;
    }

    if (cleanPosPostUrl) {
      const shortUrl = cleanPosPostUrl.length > 30 ? cleanPosPostUrl.substring(0, 30) + '...' : cleanPosPostUrl;
      linkHtml = `
        <div class="post-link-actions-cell">
          <a href="${escapeHtml(cleanPosPostUrl)}" target="_blank" rel="noopener noreferrer" class="post-direct-link" title="${escapeHtml(cleanPosPostUrl)}">
            <i class="fa-brands fa-facebook"></i> <span>${escapeHtml(shortUrl)}</span>
            <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.75rem;"></i>
          </a>
          <button class="btn-icon-copy" onclick="copyTextToClipboard('${escapeHtml(cleanPosPostUrl)}')" title="Sao chép link bài viết">
            <i class="fa-regular fa-copy"></i>
          </button>
          <button class="btn-icon-copy" onclick="openAttachPostUrlModal('${r.id}', '${escapeHtml(r.positionName)}', '${escapeHtml(r.groupName)}', '${escapeHtml(cleanPosPostUrl)}')" title="Sửa đường link bài viết">
            <i class="fa-solid fa-pen"></i>
          </button>
        </div>
      `;
    } else {
      linkHtml = `
        <button class="btn btn-xs btn-outline" onclick="openAttachPostUrlModal('${r.id}', '${escapeHtml(r.positionName)}', '${escapeHtml(r.groupName)}', '')" style="color: var(--primary); border-color: rgba(59, 130, 246, 0.4); padding: 3px 8px; font-size: 0.76rem;">
          <i class="fa-solid fa-link"></i> + Gắn link bài viết
        </button>
      `;
    }

    tr.innerHTML = `
      <td><strong>${escapeHtml(r.dateFormatted)}</strong></td>
      <td>
        <span style="font-weight: 600; color: var(--text-main); font-size: 0.88rem;">${escapeHtml(r.company)}</span>
      </td>
      <td>
        <strong style="color: var(--primary); font-size: 0.92rem;">${escapeHtml(r.positionName)}</strong>
      </td>
      <td class="text-center">
        <span class="badge-pill primary" style="background: rgba(24, 119, 242, 0.12); color: #1877f2; border: 1px solid rgba(24, 119, 242, 0.25);">
          <i class="fa-brands fa-facebook"></i> Facebook
        </span>
      </td>
      <td>
        <a href="${escapeHtml(r.groupUrl)}" target="_blank" class="group-link-text" title="Xem hội nhóm Facebook">
          <i class="fa-brands fa-facebook"></i> ${escapeHtml(r.groupName)}
        </a>
      </td>
      <td>${linkHtml}</td>
      <td class="text-center">${getStatusBadgeHtml(r.status)}</td>
      <td class="text-center">
        <div style="display: flex; gap: 4px; justify-content: center;">
          <button class="btn-icon" onclick="openHistoryDetailModal('${r.id}')" title="Xem chi tiết nội dung"><i class="fa-solid fa-eye"></i></button>
          <button class="btn-icon" onclick="deleteHistoryRecord('${r.id}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openAttachPostUrlModal(recordId, jobTitle, groupName, currentUrl = '') {
  const modal = document.getElementById('post-url-modal');
  const idInput = document.getElementById('attach-post-record-id');
  const titleEl = document.getElementById('attach-modal-job-title');
  const groupEl = document.getElementById('attach-modal-group-name');
  const urlInput = document.getElementById('attach-modal-input-url');

  if (idInput) idInput.value = recordId;
  if (titleEl) titleEl.textContent = jobTitle || 'Tin tuyển dụng';
  if (groupEl) groupEl.textContent = groupName || 'Hội nhóm Facebook';
  if (urlInput) urlInput.value = currentUrl || '';

  if (modal) modal.classList.add('active');
  if (urlInput) setTimeout(() => urlInput.focus(), 100);
}

function closeAttachPostUrlModal() {
  const modal = document.getElementById('post-url-modal');
  if (modal) modal.classList.remove('active');
}

async function submitAttachPostUrl() {
  const idInput = document.getElementById('attach-post-record-id');
  const urlInput = document.getElementById('attach-modal-input-url');

  const recordId = idInput ? idInput.value : '';
  const postUrl = urlInput ? urlInput.value.trim() : '';

  if (!recordId) return;

  try {
    const res = await fetch(`/api/history/${recordId}/post-url`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postUrl })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Cập nhật thành công!', 'Đã lưu đường link bài viết Facebook.', 'success');
      closeAttachPostUrlModal();
      await loadPositionsReportData();
      await loadHistoryData();
    } else {
      showToast('Lỗi cập nhật', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

/* =========================================================
   TÍNH NĂNG 1: AUTO GROUP SCRAPER (QUÉT NHÓM TỰ ĐỘNG)
   ========================================================= */

let currentScrapedGroups = [];
let scrapePollInterval = null;

function openScrapeGroupsModal() {
  const modal = document.getElementById('scrape-groups-modal');
  if (modal) modal.classList.add('active');
  const kwInput = document.getElementById('scrape-input-keyword');
  if (kwInput) setTimeout(() => kwInput.focus(), 150);
}

function closeScrapeGroupsModal() {
  const modal = document.getElementById('scrape-groups-modal');
  if (modal) modal.classList.remove('active');
  if (scrapePollInterval) {
    clearInterval(scrapePollInterval);
    scrapePollInterval = null;
  }
}

async function startScrapingGroups() {
  const keyword = (document.getElementById('scrape-input-keyword')?.value || '').trim();
  const province = (document.getElementById('scrape-input-province')?.value || '').trim();
  const minMembers = parseInt(document.getElementById('scrape-select-min-members')?.value, 10) || 0;
  const privacyFilter = document.getElementById('scrape-select-privacy')?.value || 'ALL';
  const maxResults = parseInt(document.getElementById('scrape-select-max')?.value, 10) || 30;

  if (!keyword) {
    showToast('Thiếu thông tin', 'Vui lòng nhập từ khóa tìm kiếm nhóm Facebook!', 'warning');
    document.getElementById('scrape-input-keyword')?.focus();
    return;
  }

  const btnStart = document.getElementById('btn-start-scrape');
  if (btnStart) {
    btnStart.disabled = true;
    btnStart.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang quét...';
  }

  const statusWrap = document.getElementById('scrape-status-wrap');
  if (statusWrap) statusWrap.style.display = 'block';

  const statusPill = document.getElementById('scrape-status-pill');
  if (statusPill) {
    statusPill.className = 'badge-pill purple';
    statusPill.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối Facebook...';
  }

  const logsBox = document.getElementById('scrape-logs-box');
  if (logsBox) logsBox.innerHTML = '<div class="log-entry log-info"><span class="log-time">[Bắt đầu]</span> Đang mở Chrome và tìm kiếm: "' + keyword + '"...</div>';

  try {
    const res = await fetch('/api/groups/scrape/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keyword, province, minMembers, privacyFilter, maxResults })
    });
    const data = await res.json();

    if (!data.success) {
      showToast('Lỗi cào nhóm', data.message, 'danger');
      if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Quét';
      }
      return;
    }

    showToast('Đang quét nhóm Facebook', `Bắt đầu tìm kiếm: "${keyword}"...`, 'info');

    // Bắt đầu vòng lặp polling
    if (scrapePollInterval) clearInterval(scrapePollInterval);
    scrapePollInterval = setInterval(pollScrapeStatus, 2000);
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
    if (btnStart) {
      btnStart.disabled = false;
      btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Quét';
    }
  }
}

async function pollScrapeStatus() {
  try {
    const res = await fetch('/api/groups/scrape/status');
    const result = await res.json();

    if (!result.success) return;
    const { isScraping, progress, results, logs } = result.data;

    // Cập nhật logs
    const logsBox = document.getElementById('scrape-logs-box');
    if (logsBox && logs && logs.length > 0) {
      logsBox.innerHTML = logs.map(l => {
        const cls = l.type === 'error' ? 'log-error' : (l.type === 'success' ? 'log-success' : (l.type === 'warn' ? 'log-warn' : 'log-info'));
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${l.message}</div>`;
      }).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    // Cập nhật counter
    const liveCounter = document.getElementById('scrape-live-counter');
    if (liveCounter) {
      liveCounter.textContent = `Đã tìm: ${results ? results.length : 0} nhóm`;
    }

    // Render bảng kết quả tạm thời hoặc cuối cùng
    if (results && results.length > 0) {
      currentScrapedGroups = results;
      renderScrapedGroupsTable(results);
    }

    const btnStart = document.getElementById('btn-start-scrape');
    const statusPill = document.getElementById('scrape-status-pill');

    if (!isScraping) {
      clearInterval(scrapePollInterval);
      scrapePollInterval = null;

      if (btnStart) {
        btnStart.disabled = false;
        btnStart.innerHTML = '<i class="fa-solid fa-play"></i> Bắt Đầu Quét';
      }

      if (progress.status === 'COMPLETED') {
        if (statusPill) {
          statusPill.className = 'badge-pill emerald';
          statusPill.innerHTML = `<i class="fa-solid fa-circle-check"></i> Hoàn tất! Tìm được ${results.length} nhóm.`;
        }
        playNotificationChime('success');
        sendDesktopNotification('🔍 Cào Nhóm Facebook Hoàn Tất!', `Đã tìm thấy ${results.length} hội nhóm Facebook mới phù hợp tiêu chí!`);
        showToast('Quét nhóm hoàn tất!', `Đã tìm thấy ${results.length} nhóm phù hợp tiêu chí.`, 'success');
      } else if (progress.status === 'ERROR') {
        if (statusPill) {
          statusPill.className = 'badge-pill danger';
          statusPill.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> ${progress.message || 'Lỗi quét nhóm'}`;
        }
      }
    }
  } catch (err) {
    console.error('Lỗi khi kiểm tra tiến trình cào nhóm:', err);
  }
}

function renderScrapedGroupsTable(groups) {
  const tbody = document.getElementById('scraped-groups-tbody');
  const resultsBtns = document.getElementById('scrape-results-btns');
  const saveBtn = document.getElementById('btn-save-scraped-groups');

  if (!tbody) return;

  if (!groups || groups.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">Không tìm thấy nhóm nào phù hợp.</td></tr>`;
    if (resultsBtns) resultsBtns.style.display = 'none';
    if (saveBtn) saveBtn.disabled = true;
    return;
  }

  if (resultsBtns) resultsBtns.style.display = 'flex';

  tbody.innerHTML = groups.map((g, idx) => {
    const isChecked = g.selected !== false ? 'checked' : '';
    const joinedBadge = g.isJoined 
      ? '<span class="badge badge-success"><i class="fa-solid fa-check"></i> Đã tham gia</span>'
      : '<span class="badge badge-secondary">Chưa vào</span>';

    return `
      <tr>
        <td>
          <input type="checkbox" data-idx="${idx}" class="scrape-item-chk" ${isChecked} onchange="toggleScrapedItemCheck(${idx}, this.checked)">
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main);">${g.name}</div>
          <a href="${g.url}" target="_blank" style="font-size: 0.78rem; color: var(--primary); word-break: break-all;">
            <i class="fa-solid fa-arrow-up-right-from-square"></i> ${g.url}
          </a>
        </td>
        <td><strong style="color: var(--warning);">${g.members || 'N/A'}</strong></td>
        <td><span class="badge badge-info">${g.privacy || 'Công khai'}</span></td>
        <td><div class="location-compact"><i class="fa-solid fa-location-dot"></i> <span>${escapeHtml(g.province || 'Toàn quốc')}</span></div></td>
        <td>${joinedBadge}</td>
      </tr>
    `;
  }).join('');

  updateScrapedSelectionCounts();
}

function toggleScrapedItemCheck(idx, checked) {
  if (currentScrapedGroups[idx]) {
    currentScrapedGroups[idx].selected = checked;
    updateScrapedSelectionCounts();
  }
}

function toggleSelectAllScraped(selectAll) {
  currentScrapedGroups.forEach(g => g.selected = selectAll);
  const chks = document.querySelectorAll('.scrape-item-chk');
  chks.forEach(c => c.checked = selectAll);
  const chkAll = document.getElementById('scrape-chk-all');
  if (chkAll) chkAll.checked = selectAll;
  updateScrapedSelectionCounts();
}

function updateScrapedSelectionCounts() {
  const selected = currentScrapedGroups.filter(g => g.selected !== false);
  const total = currentScrapedGroups.length;

  const summaryEl = document.getElementById('scrape-result-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `Tìm thấy <strong>${total}</strong> nhóm | Đã chọn: <strong style="color: var(--primary);">${selected.length}</strong> nhóm`;
  }

  const saveBtn = document.getElementById('btn-save-scraped-groups');
  const saveJoinBtn = document.getElementById('btn-save-and-join-scraped');
  const saveCountSpan = document.getElementById('scrape-save-count');

  if (saveCountSpan) saveCountSpan.textContent = selected.length;
  if (saveBtn) saveBtn.disabled = (selected.length === 0);
  if (saveJoinBtn) saveJoinBtn.disabled = (selected.length === 0);
}

async function saveSelectedScrapedGroups() {
  const selected = currentScrapedGroups.filter(g => g.selected !== false);
  if (selected.length === 0) {
    showToast('Chưa chọn nhóm', 'Vui lòng tích chọn ít nhất một hội nhóm để nạp vào hệ thống!', 'warning');
    return;
  }

  const saveBtn = document.getElementById('btn-save-scraped-groups');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu vào hệ thống...';
  }

  try {
    const res = await fetch('/api/groups/scrape/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: selected })
    });
    const result = await res.json();

    if (result.success) {
      const addedMsg = result.added > 0 ? `Đã thêm ${result.added} nhóm mới` : `Đã cập nhật ${selected.length} nhóm`;
      showToast('Nạp nhóm thành công!', `${addedMsg} vào hệ thống (Tổng: ${result.total} nhóm).`, 'success');
      closeScrapeGroupsModal();
      await loadGroups(); // Nạp lại bảng nhóm
    } else {
      showToast('Lỗi nạp nhóm', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Nạp <span id="scrape-save-count">0</span> Nhóm Đã Chọn';
    }
  }
}

async function saveAndJoinScrapedGroups() {
  const selected = currentScrapedGroups.filter(g => g.selected !== false);
  if (selected.length === 0) {
    showToast('Chưa chọn nhóm', 'Vui lòng tích chọn ít nhất một hội nhóm để nạp!', 'warning');
    return;
  }

  const btn = document.getElementById('btn-save-and-join-scraped');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang nạp & chuẩn bị...';
  }

  try {
    const res = await fetch('/api/groups/scrape/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groups: selected })
    });
    const result = await res.json();

    if (result.success) {
      const addedMsg = result.added > 0 ? `Đã nạp ${result.added} nhóm mới` : `Đã cập nhật ${selected.length} nhóm`;
      showToast('Đã nạp nhóm thành công!', `${addedMsg} (Tổng: ${result.total} nhóm). Đang mở Tự Động Xin Vào Nhóm ngay...`, 'success');
      closeScrapeGroupsModal();
      await loadGroups();

      // Mở modal Auto-Joiner và tích chọn sẵn các nhóm chưa tham gia
      const norm = (u) => (u || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^m\./, '').replace(/\/+$/, '');
      const unjoinedList = selected.filter(g => !g.isJoined);
      const targetList = unjoinedList.length > 0 ? unjoinedList : selected;
      const targetUrls = new Set(targetList.map(g => norm(g.url)));
      await openAutoJoinModal(targetUrls);
    } else {
      showToast('Lỗi nạp nhóm', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Nạp & Xin Vào Các Nhóm Chưa Tham Gia Ngay';
    }
  }
}

/* =========================================================
   TÍNH NĂNG 2: AUTO GROUP JOINER (TỰ ĐỘNG XIN VÀO NHÓM)
   ========================================================= */

let joinPollInterval = null;
let currentJoinGroupsList = [];

async function openAutoJoinModal(targetUrlsSet = null) {
  const modal = document.getElementById('auto-join-modal');
  if (modal) modal.classList.add('active');

  // Đảm bảo danh sách nhóm đã được tải
  if (!state.groups || state.groups.length === 0) {
    await loadGroups();
  }

  // Nạp danh sách accounts
  await loadJoinAccountsList();

  // Nạp danh sách groups hiện có để người dùng chọn
  renderJoinGroupsTable(targetUrlsSet);

  // Kiểm tra xem có đang chạy hay không
  await pollJoinStatus();
}

function closeAutoJoinModal() {
  const modal = document.getElementById('auto-join-modal');
  if (modal) modal.classList.remove('active');
  if (joinPollInterval) {
    clearInterval(joinPollInterval);
    joinPollInterval = null;
  }
}

async function loadJoinAccountsList() {
  const select = document.getElementById('join-select-account');
  if (!select) return;

  try {
    const res = await fetch('/api/accounts');
    const result = await res.json();
    if (result.success && Array.isArray(result.data)) {
      select.innerHTML = result.data.map(acc => {
        const isSelected = (acc.id === state.currentAccountId || acc.isCurrent) ? 'selected' : '';
        return `<option value="${acc.id}" ${isSelected}>${acc.name} (UID: ${acc.fbUserId}) ${acc.isCurrent ? '⭐ [Đang dùng]' : ''}</option>`;
      }).join('');

      select.onchange = () => {
        renderJoinGroupsTable();
      };
    }
  } catch (e) {
    console.error('Lỗi khi tải danh sách tài khoản cho joiner:', e);
  }
}

function renderJoinGroupsTable(targetUrlsSet = null) {
  const tbody = document.getElementById('join-groups-tbody');
  const summary = document.getElementById('join-selection-summary');
  if (!tbody) return;

  const select = document.getElementById('join-select-account');
  const targetAccId = select ? select.value : (state.currentAccountId || 'acc_primary');

  const groups = state.groups || [];
  
  // Tính trạng thái tham gia theo tài khoản được chọn trong dropdown
  const getIsJoined = (g) => {
    if (g.memberships && g.memberships[targetAccId] !== undefined) {
      return g.memberships[targetAccId].isJoined === true;
    }
    return g.isJoined === true;
  };

  const hasUnjoined = groups.some(g => !getIsJoined(g));
  const norm = (u) => (u || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/^m\./, '').replace(/\/+$/, '');
  
  // Nếu có targetUrlsSet, ưu tiên chọn nhóm nằm trong targetUrlsSet;
  // nếu không nhưng có nhóm chưa vào, ưu tiên chọn nhóm chưa vào đối với nick này
  currentJoinGroupsList = groups.map(g => {
    const isJoinedThis = getIsJoined(g);
    let isSelected = true;
    if (targetUrlsSet && targetUrlsSet.size > 0) {
      const gNorm = norm(g.url);
      isSelected = Array.from(targetUrlsSet).some(target => target === gNorm);
    } else if (hasUnjoined) {
      isSelected = !isJoinedThis;
    }
    return { ...g, isJoinedThis, selected: isSelected };
  });

  // Đưa các nhóm được chọn lên đầu danh sách nếu mở từ công cụ nạp
  if (targetUrlsSet && targetUrlsSet.size > 0) {
    currentJoinGroupsList.sort((a, b) => (b.selected ? 1 : 0) - (a.selected ? 1 : 0));
  }

  renderJoinGroupsTableRows();
}

function toggleHideJoinedInJoiner(checked) {
  renderJoinGroupsTableRows();
}

function renderJoinGroupsTableRows() {
  const tbody = document.getElementById('join-groups-tbody');
  const summary = document.getElementById('join-selection-summary');
  if (!tbody) return;

  const select = document.getElementById('join-select-account');
  const targetAccId = select ? select.value : (state.currentAccountId || 'acc_primary');

  const hideJoinedChk = document.getElementById('join-hide-joined-chk');
  const shouldHide = hideJoinedChk ? hideJoinedChk.checked : true;

  const listToDisplay = shouldHide
    ? currentJoinGroupsList.filter(g => !g.isJoinedThis)
    : currentJoinGroupsList;

  if (currentJoinGroupsList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có hội nhóm nào trong hệ thống. Vui lòng quét nhóm hoặc nạp từ Sheet trước!</td></tr>`;
    if (summary) summary.textContent = '0 nhóm';
    return;
  }

  if (listToDisplay.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--success); padding: 24px;"><i class="fa-solid fa-circle-check"></i> Tuyệt vời! Tài khoản này đã tham gia tất cả các nhóm trong hệ thống (Đã ẩn ${currentJoinGroupsList.length} nhóm đã vào).</td></tr>`;
    updateJoinSelectionCounts();
    return;
  }

  tbody.innerHTML = listToDisplay.map((g, idx) => {
    const isChecked = g.selected ? 'checked' : '';
    let memberBadge = '';
    if (g.isJoinedThis) {
      memberBadge = '<span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-circle-check"></i> Đã tham gia</span>';
    } else {
      memberBadge = '<span class="badge-pill danger" style="font-size: 0.72rem; padding: 2px 7px;"><i class="fa-solid fa-user-plus"></i> Chưa vào nhóm</span>';
    }

    // Hiển thị ghi chú nếu có tài khoản khác trong hệ thống đã vào nhóm này
    let otherJoinedHtml = '';
    if (g.memberships) {
      const otherNames = [];
      for (const [accId, mem] of Object.entries(g.memberships)) {
        if (accId !== targetAccId && mem.isJoined) {
          const accObj = state.accounts?.find(a => a.id === accId);
          otherNames.push(accObj ? (accObj.name.split(' ')[0] || accObj.name) : accId);
        }
      }
      if (otherNames.length > 0) {
        otherJoinedHtml = `<span style="font-size: 0.68rem; color: var(--text-muted); background: rgba(0,0,0,0.04); padding: 1px 5px; border-radius: 4px; margin-left: 4px;">(${otherNames.join(', ')} đã vào)</span>`;
      }
    }

    return `
      <tr>
        <td>
          <input type="checkbox" data-id="${g.id}" class="join-item-chk" ${isChecked} onchange="toggleJoinItemCheck('${g.id}', this.checked)">
        </td>
        <td>
          <div style="font-weight: 600; color: var(--text-main); display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
            <span>${escapeHtml(g.name)}</span>
            ${memberBadge}
            ${otherJoinedHtml}
          </div>
          <a href="${g.url}" target="_blank" style="font-size: 0.78rem; color: var(--primary);">
            ${escapeHtml(g.url)}
          </a>
        </td>
        <td><span style="color: var(--warning); font-weight: 600;">${escapeHtml(g.members || 'N/A')}</span></td>
        <td>${escapeHtml(g.province || 'Toàn quốc')}</td>
        <td><span class="badge badge-secondary" id="join-status-cell-${g.id}">Chưa chạy</span></td>
      </tr>
    `;
  }).join('');

  updateJoinSelectionCounts();
}

function toggleJoinItemCheck(id, checked) {
  const item = currentJoinGroupsList.find(g => g.id === id);
  if (item) item.selected = checked;
  updateJoinSelectionCounts();
}

function toggleSelectAllJoin(selectAll) {
  const hideJoinedChk = document.getElementById('join-hide-joined-chk');
  const shouldHide = hideJoinedChk ? hideJoinedChk.checked : true;

  currentJoinGroupsList.forEach(g => {
    if (!shouldHide || !g.isJoinedThis) {
      g.selected = selectAll;
    }
  });
  const chks = document.querySelectorAll('.join-item-chk');
  chks.forEach(c => c.checked = selectAll);
  const chkAll = document.getElementById('join-chk-all');
  if (chkAll) chkAll.checked = selectAll;
  updateJoinSelectionCounts();
}

function selectOnlyUnjoinedInJoiner() {
  currentJoinGroupsList.forEach(g => {
    g.selected = (g.isJoinedThis !== true);
  });
  const chks = document.querySelectorAll('.join-item-chk');
  chks.forEach(c => {
    const id = c.getAttribute('data-id');
    const item = currentJoinGroupsList.find(g => g.id === id);
    if (item) c.checked = item.selected;
  });
  const chkAll = document.getElementById('join-chk-all');
  if (chkAll) chkAll.checked = false;
  updateJoinSelectionCounts();
}

function updateJoinSelectionCounts() {
  const selected = currentJoinGroupsList.filter(g => g.selected !== false);
  const unjoinedCount = currentJoinGroupsList.filter(g => g.isJoinedThis !== true).length;
  const hideJoinedChk = document.getElementById('join-hide-joined-chk');
  const shouldHide = hideJoinedChk ? hideJoinedChk.checked : true;
  const displayedCount = shouldHide ? unjoinedCount : currentJoinGroupsList.length;

  const summary = document.getElementById('join-selection-summary');
  if (summary) {
    summary.innerHTML = `Đã chọn <strong>${selected.length}</strong> / <strong>${currentJoinGroupsList.length}</strong> nhóm (Hiển thị <strong>${displayedCount}</strong> nhóm chưa vào)`;
  }
}

function setJoinSpeedPreset(min, max, btn) {
  const minInput = document.getElementById('join-delay-min');
  const maxInput = document.getElementById('join-delay-max');
  if (minInput) minInput.value = min;
  if (maxInput) maxInput.value = max;

  if (btn && btn.parentElement) {
    Array.from(btn.parentElement.children).forEach(b => {
      b.classList.remove('btn-primary');
      b.classList.add('btn-secondary');
    });
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');
  }
}

async function startAutoJoin() {
  const selectedIds = currentJoinGroupsList.filter(g => g.selected !== false).map(g => g.id);
  if (selectedIds.length === 0) {
    showToast('Chưa chọn nhóm', 'Vui lòng tích chọn ít nhất 1 hội nhóm để xin tham gia!', 'warning');
    return;
  }

  const accountId = document.getElementById('join-select-account')?.value;
  const delayMin = parseInt(document.getElementById('join-delay-min')?.value, 10) || 15;
  const delayMax = parseInt(document.getElementById('join-delay-max')?.value, 10) || 25;
  const autoAnswer = (document.getElementById('join-auto-answer')?.value || '').trim();

  try {
    const res = await fetch('/api/groups/join/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupIds: selectedIds, accountId, delayMin, delayMax, autoAnswer })
    });
    const result = await res.json();

    if (!result.success) {
      showToast('Không thể bắt đầu', result.message, 'danger');
      return;
    }

    showToast('Đã khởi động Auto-Joiner', `Bắt đầu xin vào ${selectedIds.length} nhóm...`, 'success');

    // Bắt đầu poll
    if (joinPollInterval) clearInterval(joinPollInterval);
    joinPollInterval = setInterval(pollJoinStatus, 2000);
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

async function pauseAutoJoin() {
  try {
    const res = await fetch('/api/groups/join/pause', { method: 'POST' });
    const data = await res.json();
    if (data.success) showToast('Tạm dừng', 'Đã tạm dừng tiến trình xin vào nhóm.', 'warning');
  } catch (e) {}
}

async function resumeAutoJoin() {
  try {
    const res = await fetch('/api/groups/join/resume', { method: 'POST' });
    const data = await res.json();
    if (data.success) showToast('Tiếp tục', 'Tiếp tục tiến trình xin vào nhóm...', 'info');
  } catch (e) {}
}

async function stopAutoJoin() {
  if (!confirm('Bạn có chắc chắn muốn dừng toàn bộ tiến trình xin vào nhóm đang chạy?')) return;
  try {
    const res = await fetch('/api/groups/join/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) showToast('Đã dừng', 'Tiến trình Auto-Joiner đã dừng.', 'warning');
  } catch (e) {}
}

let wasJoinRunning = false;

async function pollJoinStatus() {
  try {
    const res = await fetch('/api/groups/join/status');
    const result = await res.json();
    if (!result.success) return;

    const { isRunning, isPaused, progress, results, logs } = result.data;

    // Cập nhật Buttons điều khiển
    const btnStart = document.getElementById('btn-start-join');
    const btnPause = document.getElementById('btn-pause-join');
    const btnResume = document.getElementById('btn-resume-join');
    const btnStop = document.getElementById('btn-stop-join');

    if (isRunning) {
      wasJoinRunning = true;
      const joinPct = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0;

      // Cập nhật banner trạng thái sống ngoài màn hình chính
      updateGroupAutoBanner({
        type: 'AUTO_JOIN',
        title: 'TỰ ĐỘNG XIN VÀO NHÓM FACEBOOK',
        icon: 'fa-user-plus',
        badgeText: 'Đang gửi yêu cầu...',
        isPaused,
        current: progress.current,
        total: progress.total,
        percent: joinPct,
        substats: {
          success: progress.successCount || 0,
          pending: progress.pendingCount || 0,
          fail: progress.failCount || 0
        },
        isCompleted: false
      });

      // Cập nhật toàn bộ hàng nút bấm trên Action Toolbar
      updateGroupToolbarButtonsState('AUTO_JOIN', progress.current, progress.total);

      if (btnStart) btnStart.style.display = 'none';
      if (btnStop) btnStop.style.display = 'inline-flex';

      if (isPaused) {
        if (btnPause) btnPause.style.display = 'none';
        if (btnResume) btnResume.style.display = 'inline-flex';
      } else {
        if (btnPause) btnPause.style.display = 'inline-flex';
        if (btnResume) btnResume.style.display = 'none';
      }
    } else {
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'none';
      if (btnResume) btnResume.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';

      // Phát hiện thời điểm vừa hoàn tất tiến trình
      if (wasJoinRunning) {
        wasJoinRunning = false;
        playNotificationChime(progress.failCount === 0 ? 'success' : 'warn');
        sendDesktopNotification(
          '🎉 Auto-Joiner Hoàn Tất!',
          `Thành công: ${progress.successCount || 0} nhóm | Chờ duyệt: ${progress.pendingCount || 0} | Lỗi: ${progress.failCount || 0}`
        );
        showToast('Auto-Joiner Hoàn Tất!', `Thành công: ${progress.successCount || 0} nhóm | Chờ duyệt: ${progress.pendingCount || 0}`, 'success', 8000);

        // Hiển thị banner hoàn tất ăn mừng trên màn hình
        updateGroupAutoBanner({
          type: 'AUTO_JOIN',
          title: 'TỰ ĐỘNG XIN VÀO NHÓM FACEBOOK',
          icon: 'fa-circle-check',
          current: progress.total,
          total: progress.total,
          percent: 100,
          substats: {
            success: progress.successCount || 0,
            pending: progress.pendingCount || 0,
            fail: progress.failCount || 0
          },
          isCompleted: true
        });

        // Đưa bộ nút bấm trở về bình thường
        updateGroupToolbarButtonsState(null);

        showProcessResultModal({
          title: 'Tự Động Xin Vào Nhóm (Auto-Joiner)',
          subtitle: `Đã hoàn tất tiến trình xin vào ${progress.total || 0} hội nhóm Facebook mục tiêu.`,
          okCount: progress.successCount || 0,
          pendingCount: progress.pendingCount || 0,
          failCount: progress.failCount || 0,
          results: results || []
        });
        loadGroups();
      }

      if (joinPollInterval && (progress.status === 'COMPLETED' || progress.status === 'STOPPED' || progress.status === 'ERROR')) {
        clearInterval(joinPollInterval);
        joinPollInterval = null;
      }
    }

    // Cập nhật KPI thống kê
    if (document.getElementById('join-stat-success')) document.getElementById('join-stat-success').textContent = progress.successCount || 0;
    if (document.getElementById('join-stat-pending')) document.getElementById('join-stat-pending').textContent = progress.pendingCount || 0;
    if (document.getElementById('join-stat-already')) document.getElementById('join-stat-already').textContent = progress.alreadyMemberCount || 0;
    if (document.getElementById('join-stat-fail')) document.getElementById('join-stat-fail').textContent = progress.failCount || 0;

    // Cập nhật status pill & counter
    const statusPill = document.getElementById('join-status-pill');
    if (statusPill) {
      if (isRunning) {
        statusPill.className = isPaused ? 'badge-pill warning' : 'badge-pill emerald';
        statusPill.innerHTML = isPaused 
          ? '<i class="fa-solid fa-pause"></i> Đang tạm dừng' 
          : '<i class="fa-solid fa-spinner fa-spin"></i> Đang chạy: ' + (progress.currentGroupName || '...');
      } else if (progress.status === 'COMPLETED') {
        statusPill.className = 'badge-pill emerald';
        statusPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Hoàn tất toàn bộ!';
      } else if (progress.status === 'STOPPED') {
        statusPill.className = 'badge-pill warning';
        statusPill.innerHTML = '<i class="fa-solid fa-stop"></i> Đã dừng tiến trình';
      } else {
        statusPill.className = 'badge-pill info';
        statusPill.innerHTML = '<i class="fa-solid fa-circle-info"></i> Sẵn sàng';
      }
    }

    const liveCounter = document.getElementById('join-live-counter');
    if (liveCounter) {
      liveCounter.textContent = `Tiến độ: ${progress.current || 0} / ${progress.total || 0}`;
    }

    // Cập nhật logs box
    const logsBox = document.getElementById('join-logs-box');
    if (logsBox && logs && logs.length > 0) {
      logsBox.innerHTML = logs.map(l => {
        const cls = l.type === 'error' ? 'log-error' : (l.type === 'success' ? 'log-success' : (l.type === 'warn' ? 'log-warn' : 'log-info'));
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${l.message}</div>`;
      }).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    // Cập nhật trạng thái từng dòng trong table
    if (results && results.length > 0) {
      results.forEach(r => {
        const cell = document.getElementById(`join-status-cell-${r.groupId}`);
        if (cell) {
          if (r.status === 'JOINED_SUCCESS') {
            cell.className = 'badge badge-success';
            cell.textContent = 'Đã vào nhóm';
          } else if (r.status === 'ALREADY_MEMBER') {
            cell.className = 'badge badge-success';
            cell.textContent = 'Đã là thành viên';
          } else if (r.status === 'SUBMITTED_SURVEY') {
            cell.className = 'badge badge-warning';
            cell.textContent = 'Đã nộp khảo sát';
          } else if (r.status === 'PENDING_APPROVAL') {
            cell.className = 'badge badge-warning';
            cell.textContent = 'Chờ admin duyệt';
          } else if (r.status === 'ACTION_BLOCKED') {
            cell.className = 'badge badge-danger';
            cell.textContent = 'Bị FB chặn spam';
          } else {
            cell.className = 'badge badge-danger';
            cell.textContent = 'Lỗi / Bỏ qua';
          }
        }
      });
    }
  } catch (err) {
    console.error('Lỗi khi kiểm tra trạng thái auto-joiner:', err);
  }
}

// =========================================================
// 12. SMART KPI & AUTO-STOP CONTROLLER
// =========================================================

async function adjustPositionCv(positionName, delta) {
  try {
    const res = await fetch('/api/positions/kpi/adjust-cv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionName, delta })
    });
    const result = await res.json();
    if (result.success) {
      // Tải lại báo cáo để cập nhật các chỉ số và tỷ lệ
      await loadPositionsReportData();
    } else {
      showToast('Lỗi cập nhật', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi mạng', err.message, 'danger');
  }
}

function openPositionKpiModal(positionName) {
  const modal = document.getElementById('position-kpi-modal');
  if (!modal) return;

  const currentKpi = (state.positionsKpi && state.positionsKpi[positionName]) || {
    targetCv: 5,
    receivedCv: 0,
    maxPostsCap: 15,
    autoStopEnabled: true,
    costEstimate: 0
  };

  document.getElementById('kpi-modal-pos-name').value = positionName;
  document.getElementById('kpi-modal-display-name').value = positionName;
  document.getElementById('kpi-modal-target-cv').value = currentKpi.targetCv || 5;
  document.getElementById('kpi-modal-received-cv').value = currentKpi.receivedCv || 0;
  document.getElementById('kpi-modal-max-posts').value = currentKpi.maxPostsCap || 15;
  document.getElementById('kpi-modal-cost').value = currentKpi.costEstimate || 0;
  document.getElementById('kpi-modal-autostop').checked = currentKpi.autoStopEnabled !== false;

  modal.classList.add('active');
}

function closePositionKpiModal() {
  const modal = document.getElementById('position-kpi-modal');
  if (modal) modal.classList.remove('active');
}

async function savePositionKpiModal() {
  const positionName = document.getElementById('kpi-modal-pos-name').value;
  const targetCv = parseInt(document.getElementById('kpi-modal-target-cv').value, 10) || 5;
  const receivedCv = parseInt(document.getElementById('kpi-modal-received-cv').value, 10) || 0;
  const maxPostsCap = parseInt(document.getElementById('kpi-modal-max-posts').value, 10) || 15;
  const costEstimate = parseInt(document.getElementById('kpi-modal-cost').value, 10) || 0;
  const autoStopEnabled = document.getElementById('kpi-modal-autostop').checked;

  try {
    const res = await fetch('/api/positions/kpi/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionName,
        targetCv,
        receivedCv,
        maxPostsCap,
        costEstimate,
        autoStopEnabled
      })
    });
    const result = await res.json();
    if (result.success) {
      showToast('Đã lưu KPI', `Cập nhật thành công cho "${positionName}".`, 'success');
      closePositionKpiModal();
      await loadPositionsReportData();
    } else {
      showToast('Lỗi lưu', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi mạng', err.message, 'danger');
  }
}

async function toggleAutoStop(positionName, isEnabled) {
  try {
    const res = await fetch('/api/positions/kpi/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        positionName,
        autoStopEnabled: isEnabled
      })
    });
    const result = await res.json();
    if (result.success) {
      const msg = isEnabled ? `Đã BẬT Auto-Stop cho "${positionName}". Tool sẽ tự dừng khi đủ CV.` : `Đã TẮT Auto-Stop cho "${positionName}".`;
      showToast('Cập nhật Auto-Stop', msg, 'info');
      await loadPositionsReportData();
    }
  } catch (err) {
    console.error('Lỗi toggle Auto-Stop:', err);
  }
}

// =========================================================
// 13. MARKET INTELLIGENCE CONTROLLER
// =========================================================

async function runMarketAnalysis() {
  const title = (document.getElementById('market-query-title')?.value || '').trim();
  const province = document.getElementById('market-query-province')?.value || '';

  if (!title) {
    showToast('Vui lòng nhập vị trí', 'Hãy gõ tên vị trí cần phân tích (ví dụ: Kế toán, Sales, Lái xe...).', 'warning');
    return;
  }

  const resultBox = document.getElementById('market-analysis-result-box');
  if (resultBox) resultBox.style.display = 'block';

  document.getElementById('market-salary-val').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang tính...';
  document.getElementById('market-comp-level').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang quét...';
  document.getElementById('market-est-posts').innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang dự báo...';
  document.getElementById('market-recommendation-text').innerHTML = 'Hệ thống đang đối chiếu dữ liệu thị trường việc làm toàn quốc...';

  try {
    const url = `/api/market/analyze?jobTitle=${encodeURIComponent(title)}&province=${encodeURIComponent(province)}`;
    const res = await fetch(url);
    const result = await res.json();

    if (result.success && result.data) {
      renderMarketAnalysisResult(result.data);
    } else {
      showToast('Lỗi phân tích', result.message || 'Không có dữ liệu.', 'danger');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger');
  }
}

function renderMarketAnalysisResult(d) {
  // 1. Phổ lương
  const salVal = document.getElementById('market-salary-val');
  if (salVal) {
    salVal.textContent = d.salaryMarket.display;
  }

  // 2. Mức độ cạnh tranh
  const compVal = document.getElementById('market-comp-level');
  const openingsCount = document.getElementById('market-openings-count');
  if (compVal) {
    let color = 'var(--success)';
    if (d.competitionLevel === 'HIGH') color = 'var(--warning)';
    if (d.competitionLevel === 'VERY_HIGH') color = 'var(--danger)';
    compVal.innerHTML = `<span style="color: ${color}; font-weight: 800;">${d.competitionText}</span>`;
  }
  if (openingsCount) {
    openingsCount.textContent = `${d.totalOpenings} tin đang tuyển tại ${d.query.targetProvince || 'Toàn quốc'}`;
  }

  // 3. Dự báo số bài đăng cần thiết
  const estVal = document.getElementById('market-est-posts');
  const estDays = document.getElementById('market-est-days');
  if (estVal) {
    estVal.textContent = `~${d.estimatedPostsPerCv} bài / 1 CV`;
  }
  if (estDays) {
    estDays.textContent = `Ước tính thu về trong ${d.estimatedDays}`;
  }

  // 4. Khuyến nghị
  const recText = document.getElementById('market-recommendation-text');
  if (recText) {
    recText.innerHTML = d.recommendations.map(r => `<p style="margin: 4px 0;">• ${escapeHtml(r)}</p>`).join('');
  }

  // 5. Đối thủ cạnh tranh
  const compWrap = document.getElementById('market-competitors-wrap');
  const compList = document.getElementById('market-competitors-list');
  if (compWrap && compList) {
    if (d.sampleCompetitors && d.sampleCompetitors.length > 0) {
      compWrap.style.display = 'block';
      compList.innerHTML = d.sampleCompetitors.map(c => `
        <div class="competitor-chip">
          <span class="comp-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
            <span class="comp-salary">${escapeHtml(c.salary || 'Thoả thuận')}</span>
            <span class="badge-pill info" style="font-size: 0.68rem; padding: 1px 6px;">${escapeHtml(c.source)}</span>
          </div>
          <span class="comp-company">${escapeHtml(c.company || 'Doanh nghiệp')}</span>
        </div>
      `).join('');
    } else {
      compWrap.style.display = 'none';
    }
  }
}

// =========================================================
// 14. ENGAGEMENT SCANNER CONTROLLER
// =========================================================

let engScanPollInterval = null;

function openEngagementScanModal() {
  const modal = document.getElementById('engagement-scan-modal');
  if (modal) modal.classList.add('active');
}

function closeEngagementScanModal() {
  const modal = document.getElementById('engagement-scan-modal');
  if (modal) modal.classList.remove('active');
  if (engScanPollInterval) {
    clearInterval(engScanPollInterval);
    engScanPollInterval = null;
  }
}

async function startEngagementScanning() {
  const limit = parseInt(document.getElementById('eng-scan-limit')?.value, 10) || 10;
  const forceAll = document.getElementById('eng-scan-mode')?.value === 'ALL';

  const btnStart = document.getElementById('btn-start-eng-scan');
  const btnStop = document.getElementById('btn-stop-eng-scan');
  if (btnStart) btnStart.style.display = 'none';
  if (btnStop) btnStop.style.display = 'inline-block';

  document.getElementById('eng-progress-wrap').style.display = 'block';
  document.getElementById('eng-stats-summary').style.display = 'grid';

  try {
    const res = await fetch('/api/engagement/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit, forceAll })
    });
    const result = await res.json();
    if (!result.success) {
      showToast('Thông báo', result.message, 'warning');
      if (btnStart) btnStart.style.display = 'inline-block';
      if (btnStop) btnStop.style.display = 'none';
      return;
    }

    if (engScanPollInterval) clearInterval(engScanPollInterval);
    engScanPollInterval = setInterval(pollEngagementStatus, 2000);
    pollEngagementStatus();
  } catch (err) {
    showToast('Lỗi mạng', err.message, 'danger');
    if (btnStart) btnStart.style.display = 'inline-block';
    if (btnStop) btnStop.style.display = 'none';
  }
}

async function stopEngagementScanning() {
  try {
    const res = await fetch('/api/engagement/stop', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast('Đã dừng quét', 'Tiến trình quét tương tác đã dừng lại.', 'info');
    }
  } catch (err) {
    console.error('Lỗi dừng quét:', err);
  }
}

async function pollEngagementStatus() {
  try {
    const res = await fetch('/api/engagement/status');
    const result = await res.json();
    if (!result.success || !result.data) return;

    const { isScanning, progress, logs } = result.data;

    // Cập nhật thống kê live
    if (document.getElementById('eng-stat-likes')) document.getElementById('eng-stat-likes').textContent = progress.totalLikes || 0;
    if (document.getElementById('eng-stat-comments')) document.getElementById('eng-stat-comments').textContent = progress.totalComments || 0;
    if (document.getElementById('eng-stat-inquiries')) document.getElementById('eng-stat-inquiries').textContent = progress.totalInquiries || 0;

    // Cập nhật status pill & counter
    const statusPill = document.getElementById('eng-status-pill');
    if (statusPill) {
      if (isScanning) {
        statusPill.className = 'badge-pill purple';
        statusPill.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> ' + (progress.message || 'Đang quét...');
      } else if (progress.status === 'COMPLETED') {
        statusPill.className = 'badge-pill success';
        statusPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Hoàn tất quét!';
      } else if (progress.status === 'STOPPED') {
        statusPill.className = 'badge-pill warning';
        statusPill.innerHTML = '<i class="fa-solid fa-stop"></i> Đã dừng';
      } else {
        statusPill.className = 'badge-pill info';
        statusPill.innerHTML = '<i class="fa-solid fa-circle-info"></i> Sẵn sàng';
      }
    }

    const counter = document.getElementById('eng-counter-text');
    if (counter) {
      counter.textContent = `${progress.current || 0} / ${progress.total || 0} bài`;
    }

    // Cập nhật logs
    const logsBox = document.getElementById('eng-logs-box');
    if (logsBox && logs && logs.length > 0) {
      logsBox.innerHTML = logs.map(l => {
        const cls = l.type === 'error' ? 'log-error' : (l.type === 'success' ? 'log-success' : (l.type === 'warn' ? 'log-warn' : 'log-info'));
        return `<div class="log-entry ${cls}"><span class="log-time">[${l.timestamp}]</span> ${escapeHtml(l.message)}</div>`;
      }).join('');
      logsBox.scrollTop = logsBox.scrollHeight;
    }

    // Điều khiển nút bấm
    const btnStart = document.getElementById('btn-start-eng-scan');
    const btnStop = document.getElementById('btn-stop-eng-scan');
    if (!isScanning) {
      if (btnStart) btnStart.style.display = 'inline-block';
      if (btnStop) btnStop.style.display = 'none';
      if (engScanPollInterval && (progress.status === 'COMPLETED' || progress.status === 'STOPPED' || progress.status === 'ERROR')) {
        clearInterval(engScanPollInterval);
        engScanPollInterval = null;
      }
    }
  } catch (err) {
    console.error('Lỗi polling tương tác:', err);
  }
}

// =========================================================
// HEADER NOTIFICATION CENTER & ACTIVE ACCOUNT WIDGET
// =========================================================
let systemNotifications = [];

function initNotificationCenter() {
  // Lắng nghe sự kiện click ra ngoài để tự đóng panel thông báo
  document.addEventListener('click', (e) => {
    const container = document.getElementById('notif-bell-container');
    const panel = document.getElementById('notif-dropdown-panel');
    if (!container || !panel) return;
    if (!container.contains(e.target)) {
      toggleNotificationDropdown(false);
    }
  });

  // Tải thông báo ban đầu
  refreshNotificationCenter();
}

function toggleNotificationDropdown(forceState = null) {
  const panel = document.getElementById('notif-dropdown-panel');
  const btn = document.getElementById('notif-bell-btn');
  if (!panel || !btn) return;

  const isCurrentlyActive = panel.classList.contains('active');
  const nextState = forceState !== null ? forceState : !isCurrentlyActive;

  if (nextState) {
    panel.classList.add('active');
    btn.classList.add('active');
    refreshNotificationCenter();
  } else {
    panel.classList.remove('active');
    btn.classList.remove('active');
  }
}

function getStoredCustomNotifications() {
  try {
    const raw = localStorage.getItem('fb_engine_user_notifications');
    if (raw) {
      const list = JSON.parse(raw);
      if (Array.isArray(list)) return list;
    }
  } catch (e) {}
  return [];
}

function saveStoredCustomNotifications(list) {
  try {
    localStorage.setItem('fb_engine_user_notifications', JSON.stringify(list.slice(0, 30)));
  } catch (e) {}
}

function refreshNotificationCenter() {
  const readMap = {};
  try {
    const rawRead = localStorage.getItem('fb_engine_read_notifications');
    if (rawRead) Object.assign(readMap, JSON.parse(rawRead));
  } catch (e) {}

  const notifs = [];

  // 1. CẢNH BÁO TÀI KHOẢN (CHECKPOINT 282, ACTION BLOCK, COOLDOWN)
  (state.accounts || []).forEach(acc => {
    if (acc.status === 'CHECKPOINT') {
      const id = `cp_${acc.id}`;
      notifs.push({
        id,
        type: 'danger',
        icon: 'fa-solid fa-shield-virus',
        title: `Dính Checkpoint 282: ${acc.name}`,
        desc: acc.checkpointReason || 'Facebook yêu cầu quay video selfie xác minh danh tính người thật. Bấm để xử lý.',
        time: acc.checkpointAt ? new Date(acc.checkpointAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Gần đây',
        linkTab: 'accounts-tab',
        isRead: Boolean(readMap[id])
      });
    } else if (acc.status === 'ACTION_BLOCKED' || acc.actionBlock) {
      const id = `ab_${acc.id}`;
      const reason = acc.actionBlock?.reason || 'Facebook tạm khóa tính năng xin vào nhóm do thao tác quá nhanh.';
      notifs.push({
        id,
        type: 'warning',
        icon: 'fa-solid fa-hand',
        title: `Bị Chặn Tính Năng: ${acc.name}`,
        desc: reason,
        time: acc.actionBlock?.blockedAt ? new Date(acc.actionBlock.blockedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : 'Hôm nay',
        linkTab: 'accounts-tab',
        isRead: Boolean(readMap[id])
      });
    } else if (acc.cooldownUntil && new Date(acc.cooldownUntil) > new Date()) {
      const id = `cd_${acc.id}`;
      const remainH = Math.ceil((new Date(acc.cooldownUntil) - new Date()) / (3600 * 1000));
      notifs.push({
        id,
        type: 'warning',
        icon: 'fa-solid fa-hourglass-half',
        title: `Đang Làm Mát: ${acc.name}`,
        desc: `Tài khoản đang nghỉ an toàn chống spam (còn ~${remainH} giờ).`,
        time: 'Đang chạy',
        linkTab: 'accounts-tab',
        isRead: Boolean(readMap[id])
      });
    }
  });

  // 2. TÀI KHOẢN CHÍNH ĐANG HOẠT ĐỘNG
  const currentAcc = (state.accounts || []).find(a => a.isCurrent) || (state.accounts || [])[0];
  if (currentAcc && currentAcc.status === 'ACTIVE') {
    const id = `act_${currentAcc.id}`;
    notifs.push({
      id,
      type: 'success',
      icon: 'fa-solid fa-circle-check',
      title: `Nick Sẵn Sàng Đăng Bài: ${currentAcc.name}`,
      desc: `Đã kết nối UID ${currentAcc.fbUserId}, đã tham gia ${currentAcc.joinedGroupsCount || 0} hội nhóm.`,
      time: 'Hiện tại',
      linkTab: 'accounts-tab',
      isRead: Boolean(readMap[id])
    });
  }

  // 3. THÔNG BÁO TÙY CHỈNH TỪ CÁC TIẾN TRÌNH TRƯỚC ĐÓ
  const customNotifs = getStoredCustomNotifications();
  customNotifs.forEach(cn => {
    notifs.push({
      ...cn,
      isRead: Boolean(readMap[cn.id])
    });
  });

  systemNotifications = notifs;

  // Render danh sách và badge
  renderNotificationList(notifs);
  updateHeaderActiveAccountWidget();
}

function renderNotificationList(notifs) {
  const badge = document.getElementById('header-notif-badge');
  const countPill = document.getElementById('notif-unread-count-pill');
  const listContainer = document.getElementById('notif-panel-list');
  const bellIcon = document.querySelector('#notif-bell-btn i');

  const unreadCount = notifs.filter(n => !n.isRead).length;

  if (badge) {
    if (unreadCount > 0) {
      badge.style.display = 'flex';
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
    } else {
      badge.style.display = 'none';
    }
  }

  if (countPill) {
    countPill.textContent = `${unreadCount} chưa đọc`;
    countPill.style.background = unreadCount > 0 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)';
    countPill.style.color = unreadCount > 0 ? 'var(--danger)' : 'var(--primary)';
  }

  if (bellIcon) {
    if (unreadCount > 0) {
      bellIcon.className = 'fa-solid fa-bell text-warning';
    } else {
      bellIcon.className = 'fa-regular fa-bell';
    }
  }

  if (!listContainer) return;

  if (notifs.length === 0) {
    listContainer.innerHTML = `
      <div class="notif-empty-state">
        <i class="fa-regular fa-bell-slash"></i>
        <p>Hiện không có thông báo hoặc cảnh báo nào mới.</p>
      </div>
    `;
    return;
  }

  listContainer.innerHTML = notifs.map(n => `
    <div class="notif-item ${n.isRead ? '' : 'unread'}" onclick="handleNotificationClick('${n.id}', '${n.linkTab || 'dashboard-tab'}')">
      <div class="notif-item-icon ${n.type || 'info'}">
        <i class="${n.icon || 'fa-solid fa-info'}"></i>
      </div>
      <div class="notif-item-content">
        <div class="notif-item-top">
          <span class="notif-item-title">${escapeHtml(n.title)}</span>
          <span class="notif-item-time">${escapeHtml(n.time || '')}</span>
        </div>
        <div class="notif-item-desc">${escapeHtml(n.desc || '')}</div>
      </div>
    </div>
  `).join('');
}

function handleNotificationClick(id, linkTab) {
  markNotificationAsRead(id);
  toggleNotificationDropdown(false);
  if (linkTab) {
    switchTab(linkTab);
  }
}

function markNotificationAsRead(id) {
  try {
    const raw = localStorage.getItem('fb_engine_read_notifications');
    const map = raw ? JSON.parse(raw) : {};
    map[id] = true;
    localStorage.setItem('fb_engine_read_notifications', JSON.stringify(map));
  } catch (e) {}
  refreshNotificationCenter();
}

function markAllNotificationsAsRead() {
  try {
    const map = {};
    systemNotifications.forEach(n => { map[n.id] = true; });
    localStorage.setItem('fb_engine_read_notifications', JSON.stringify(map));
  } catch (e) {}
  refreshNotificationCenter();
  showToast('Đã đọc thông báo', 'Đã đánh dấu tất cả thông báo là đã đọc.', 'info', 2000);
}

function clearAllNotifications() {
  try {
    localStorage.removeItem('fb_engine_user_notifications');
    const map = {};
    systemNotifications.forEach(n => { map[n.id] = true; });
    localStorage.setItem('fb_engine_read_notifications', JSON.stringify(map));
  } catch (e) {}
  refreshNotificationCenter();
  showToast('Đã dọn dẹp', 'Đã xóa toàn bộ thông báo tùy chỉnh.', 'info', 2000);
}

function addSystemNotification({ title, desc, message, type = 'info', linkTab = 'dashboard-tab' }) {
  const custom = getStoredCustomNotifications();
  const id = `notif_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  custom.unshift({
    id,
    type,
    icon: type === 'danger' ? 'fa-solid fa-circle-exclamation' : (type === 'warning' ? 'fa-solid fa-triangle-exclamation' : (type === 'success' ? 'fa-solid fa-circle-check' : 'fa-solid fa-info-circle')),
    title: title || 'Thông báo mới',
    desc: desc || message || '',
    time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
    linkTab,
    isRead: false
  });
  saveStoredCustomNotifications(custom);
  refreshNotificationCenter();
}

function updateHeaderActiveAccountWidget() {
  const nameEl = document.getElementById('header-user-name');
  const statusEl = document.getElementById('header-user-status');
  const avatarEl = document.getElementById('header-user-avatar');

  if (!nameEl || !statusEl) return;

  const currentAcc = (state.accounts || []).find(a => a.isCurrent) || (state.accounts || [])[0];

  if (currentAcc) {
    nameEl.textContent = currentAcc.name || 'Nick Facebook';
    nameEl.title = `${currentAcc.name} (UID: ${currentAcc.fbUserId || 'N/A'})`;

    if (avatarEl) {
      avatarEl.className = 'header-user-avatar';
      if (currentAcc.status === 'CHECKPOINT') {
        avatarEl.classList.add('is-checkpoint');
        avatarEl.innerHTML = '<i class="fa-solid fa-user-shield"></i>';
      } else if (currentAcc.status === 'ACTION_BLOCKED' || currentAcc.actionBlock) {
        avatarEl.classList.add('is-blocked');
        avatarEl.innerHTML = '<i class="fa-solid fa-hand"></i>';
      } else {
        avatarEl.innerHTML = '<i class="fa-solid fa-user"></i>';
      }
    }

    if (currentAcc.status === 'CHECKPOINT') {
      statusEl.textContent = 'Checkpoint 282';
      statusEl.className = 'header-user-sub danger';
    } else if (currentAcc.status === 'ACTION_BLOCKED' || currentAcc.actionBlock) {
      statusEl.textContent = 'Bị Khóa Xin Nhóm';
      statusEl.className = 'header-user-sub warning';
    } else if (currentAcc.cooldownUntil && new Date(currentAcc.cooldownUntil) > new Date()) {
      statusEl.textContent = 'Đang Làm Mát';
      statusEl.className = 'header-user-sub warning';
    } else {
      statusEl.textContent = 'Đang Kích Hoạt';
      statusEl.className = 'header-user-sub';
    }
  } else {
    nameEl.textContent = 'Chưa có nick';
    statusEl.textContent = 'Chưa nạp';
    statusEl.className = 'header-user-sub warning';
    if (avatarEl) {
      avatarEl.className = 'header-user-avatar';
      avatarEl.innerHTML = '<i class="fa-solid fa-user-plus"></i>';
    }
  }
}

// =========================================================
// FIXED FACEBOOK TOP HEADER CONTROLLERS
// =========================================================

function toggleNotificationDropdown(forceState) {
  const panel = document.getElementById('notif-dropdown-panel');
  if (!panel) return;
  const isCurrentlyOpen = panel.classList.contains('active') || panel.style.display === 'flex';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    toggleFbAppsMenu(false);
    toggleFbUserDropdown(false);
    const searchDd = document.getElementById('fb-search-dropdown');
    if (searchDd) searchDd.style.display = 'none';
  }

  panel.style.display = shouldOpen ? 'flex' : 'none';
  panel.classList.toggle('active', shouldOpen);

  const bellBtn = document.getElementById('notif-bell-btn');
  if (bellBtn) bellBtn.classList.toggle('active', shouldOpen);
}

function toggleFbAppsMenu(forceState) {
  const panel = document.getElementById('fb-apps-dropdown');
  if (!panel) return;
  const isCurrentlyOpen = panel.style.display === 'block';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    toggleNotificationDropdown(false);
    toggleFbUserDropdown(false);
    const searchDd = document.getElementById('fb-search-dropdown');
    if (searchDd) searchDd.style.display = 'none';
  }

  panel.style.display = shouldOpen ? 'block' : 'none';
  const appsBtn = document.getElementById('fb-apps-menu-btn');
  if (appsBtn) appsBtn.classList.toggle('active', shouldOpen);
}

function toggleFbUserDropdown(forceState) {
  const panel = document.getElementById('fb-user-dropdown');
  if (!panel) return;
  const isCurrentlyOpen = panel.style.display === 'block';
  const shouldOpen = forceState !== undefined ? forceState : !isCurrentlyOpen;

  if (shouldOpen) {
    toggleNotificationDropdown(false);
    toggleFbAppsMenu(false);
    const searchDd = document.getElementById('fb-search-dropdown');
    if (searchDd) searchDd.style.display = 'none';
  }

  panel.style.display = shouldOpen ? 'block' : 'none';
  const userBtn = document.getElementById('fb-user-profile-btn');
  if (userBtn) userBtn.classList.toggle('active', shouldOpen);
}

// Global click listener to close all FB dropdowns when clicking outside
document.addEventListener('click', function (e) {
  // Notif panel
  const notifContainer = document.getElementById('notif-bell-container');
  if (notifContainer && !notifContainer.contains(e.target)) {
    toggleNotificationDropdown(false);
  }

  // Apps dropdown
  const appsContainer = document.getElementById('fb-apps-menu-container');
  if (appsContainer && !appsContainer.contains(e.target)) {
    toggleFbAppsMenu(false);
  }

  // User dropdown
  const userContainer = document.getElementById('fb-user-menu-container');
  if (userContainer && !userContainer.contains(e.target)) {
    toggleFbUserDropdown(false);
  }

  // Search dropdown
  const searchContainer = document.getElementById('fb-search-container');
  if (searchContainer && !searchContainer.contains(e.target)) {
    const searchDd = document.getElementById('fb-search-dropdown');
    if (searchDd) searchDd.style.display = 'none';
  }
});

// GLOBAL FB SEARCH FUNCTIONALITY
function handleFbGlobalSearch(query) {
  const clearBtn = document.getElementById('fb-search-clear');
  const dropdown = document.getElementById('fb-search-dropdown');
  const resultsList = document.getElementById('fb-search-results-list');
  const countPill = document.getElementById('fb-search-count-pill');

  const q = (query || '').trim().toLowerCase();
  if (clearBtn) clearBtn.style.display = q ? 'flex' : 'none';

  if (!q) {
    if (dropdown) dropdown.style.display = 'none';
    return;
  }

  const matched = [];

  // 1. Navigation items matching
  const navShortcuts = [
    { title: 'Bảng Tính Tuyển Dụng (Google Sheets)', sub: 'Đồng bộ bài viết từ Sheets', tab: 'sheet-tab', icon: 'fa-solid fa-file-excel', color: '#10b981' },
    { title: 'Quản Lý Hội Nhóm Tuyển Dụng', sub: 'Danh sách và kiểm tra nhóm', tab: 'groups-tab', icon: 'fa-solid fa-users', color: '#1877f2' },
    { title: 'Trình Điều Khiển Auto-Post', sub: 'Thiết lập và đăng bài tự động', tab: 'controller-tab', icon: 'fa-solid fa-paper-plane', color: '#1877f2' },
    { title: 'Sức Khỏe & Giám Sát Rủi Ro', sub: 'Chẩn đoán thuật toán Facebook & Checkpoint', tab: 'health-tab', icon: 'fa-solid fa-shield-heart', color: '#ef4444' },
    { title: 'Quản Lý Đa Tài Khoản Facebook', sub: 'Quản lý nick, cookie, làm mát', tab: 'accounts-tab', icon: 'fa-solid fa-users-gear', color: '#1877f2' },
    { title: 'Kho Ảnh Banner Tuyển Dụng', sub: 'Upload và quản lý ảnh bài đăng', tab: 'images-tab', icon: 'fa-solid fa-images', color: '#8b5cf6' },
    { title: 'Đo Lường Hiệu Quả Tuyển Dụng', sub: 'Thống kê bài đăng theo vị trí việc làm', tab: 'positions-tab', icon: 'fa-solid fa-briefcase', color: '#10b981' },
    { title: 'Lịch Sử & Báo Cáo Đăng Bài', sub: 'Xem lại các bài viết đã duyệt hoặc chờ duyệt', tab: 'history-tab', icon: 'fa-solid fa-chart-pie', color: '#0ea5e9' }
  ];

  navShortcuts.forEach(item => {
    if (item.title.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q)) {
      matched.push({
        type: 'feature',
        title: item.title,
        sub: `Tính năng • ${item.sub}`,
        icon: item.icon,
        color: item.color,
        action: `switchTab('${item.tab}'); clearFbGlobalSearch();`
      });
    }
  });

  // 2. Groups matching
  const groups = state.groups || [];
  const matchedGroups = groups.filter(g => 
    (g.name && g.name.toLowerCase().includes(q)) || 
    (g.id && String(g.id).includes(q)) || 
    (g.location && g.location.toLowerCase().includes(q))
  ).slice(0, 8);

  matchedGroups.forEach(g => {
    matched.push({
      type: 'group',
      title: g.name || `Nhóm ID ${g.id}`,
      sub: `${g.location || 'Toàn quốc'} • ${g.members ? g.members.toLocaleString() + ' thành viên' : 'Nhóm Facebook'} • ${g.joined ? 'Đã tham gia' : 'Chưa tham gia'}`,
      icon: 'fa-solid fa-users-rectangle',
      color: '#1877f2',
      action: `switchTab('groups-tab'); focusGroupInTable('${g.id}'); clearFbGlobalSearch();`
    });
  });

  if (countPill) countPill.textContent = `${matched.length} kết quả`;

  if (matched.length === 0) {
    resultsList.innerHTML = `
      <div style="padding: 24px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-magnifying-glass" style="font-size: 1.8rem; opacity: 0.4; margin-bottom: 8px; display: block;"></i>
        <span>Không tìm thấy kết quả nào cho "${escapeHtml(q)}"</span>
      </div>
    `;
  } else {
    resultsList.innerHTML = matched.map(m => `
      <div class="fb-search-item" onclick="${m.action}">
        <div class="fb-search-item-icon" style="color: ${m.color}; background: ${m.color}22;">
          <i class="${m.icon}"></i>
        </div>
        <div class="fb-search-item-info">
          <span class="fb-search-item-title">${escapeHtml(m.title)}</span>
          <span class="fb-search-item-sub">${escapeHtml(m.sub)}</span>
        </div>
      </div>
    `).join('');
  }

  if (dropdown) dropdown.style.display = 'block';
}

function clearFbGlobalSearch() {
  const input = document.getElementById('fb-global-search');
  if (input) input.value = '';
  const clearBtn = document.getElementById('fb-search-clear');
  if (clearBtn) clearBtn.style.display = 'none';
  const dropdown = document.getElementById('fb-search-dropdown');
  if (dropdown) dropdown.style.display = 'none';
}

function handleFbGlobalSearchKeydown(event) {
  if (event.key === 'Escape') {
    clearFbGlobalSearch();
  }
}

function focusGroupInTable(groupId) {
  const searchInput = document.getElementById('search-group-input') || document.getElementById('filter-group-search');
  if (searchInput) {
    searchInput.value = groupId;
    searchInput.dispatchEvent(new Event('input', { bubbles: true }));
  }
}

// =========================================================
// 12. HỆ THỐNG 34 FACEBOOK FANPAGE (META GRAPH API)
// =========================================================

async function loadFanpages(forceReload = false) {
  const tbody = document.getElementById('fanpages-table-body');
  if (tbody && state.fanpages.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách 34 Fanpage...</td></tr>`;
  }

  try {
    const res = await smartFetch('/api/fanpages');
    const result = await res.json();

    if (result.success && result.data) {
      state.fanpages = result.data.fanpages || [];
      state.filteredFanpages = [...state.fanpages];
      state.fanpageConfig = result.data.config || {};

      // Cập nhật thẻ KPI
      const totalEl = document.getElementById('kpi-fanpage-total');
      const southEl = document.getElementById('kpi-fanpage-south');
      const centralEl = document.getElementById('kpi-fanpage-central');
      const northEl = document.getElementById('kpi-fanpage-north');

      const southCount = state.fanpages.filter(p => p.region === 'Miền Nam').length;
      const centralCount = state.fanpages.filter(p => p.region === 'Miền Trung').length;
      const northCount = state.fanpages.filter(p => p.region === 'Miền Bắc').length;

      if (totalEl) totalEl.textContent = state.fanpages.length;
      if (southEl) southEl.textContent = southCount;
      if (centralEl) centralEl.textContent = centralCount;
      if (northEl) northEl.textContent = northCount;

      // Cập nhật Badge Token
      const tokenBadge = document.getElementById('fanpage-token-status-badge');
      if (tokenBadge) {
        if (result.data.hasToken || (state.fanpageConfig && state.fanpageConfig.hasSystemToken)) {
          tokenBadge.className = 'badge-pill success';
          tokenBadge.innerHTML = '<i class="fa-solid fa-shield-check"></i> Meta Token Hoạt Động';
        } else {
          tokenBadge.className = 'badge-pill danger';
          tokenBadge.innerHTML = '<i class="fa-solid fa-key"></i> Chưa Có Token Meta API';
        }
      }

      filterFanpages();
      renderFanpageCheckboxList();
      updatePublishChannelUI();
    }
  } catch (err) {
    console.error('Lỗi nạp danh sách Fanpage:', err);
    if (tbody) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger py-4"><i class="fa-solid fa-circle-exclamation"></i> Lỗi nạp Fanpage: ${escapeHtml(err.message)}</td></tr>`;
    }
  }
}

function selectFanpageRegionFilter(region) {
  state.fanpageRegionFilter = region;

  // Cập nhật UI pill buttons
  const pills = {
    'ALL': document.getElementById('pill-fanpage-region-all'),
    'Miền Nam': document.getElementById('pill-fanpage-region-south'),
    'Miền Trung': document.getElementById('pill-fanpage-region-central'),
    'Miền Bắc': document.getElementById('pill-fanpage-region-north')
  };
  Object.keys(pills).forEach(k => {
    if (pills[k]) pills[k].classList.toggle('active', k === region);
  });

  // Cập nhật UI KPI cards
  const cards = {
    'ALL': document.getElementById('kpi-card-fanpage-all'),
    'Miền Nam': document.getElementById('kpi-card-fanpage-south'),
    'Miền Trung': document.getElementById('kpi-card-fanpage-central'),
    'Miền Bắc': document.getElementById('kpi-card-fanpage-north')
  };
  Object.keys(cards).forEach(k => {
    if (cards[k]) cards[k].classList.toggle('active', k === region);
  });

  filterFanpages();
}

function filterFanpages() {
  const query = (document.getElementById('fanpage-search')?.value || '').trim().toLowerCase();

  state.filteredFanpages = state.fanpages.filter(p => {
    const matchRegion = state.fanpageRegionFilter === 'ALL' || p.region === state.fanpageRegionFilter;
    const matchQuery = !query ||
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.province && p.province.toLowerCase().includes(query)) ||
      (p.pageId && String(p.pageId).toLowerCase().includes(query)) ||
      (p.region && p.region.toLowerCase().includes(query));
    return matchRegion && matchQuery;
  });

  renderFanpagesTable();
}

function renderFanpagesTable() {
  const tbody = document.getElementById('fanpages-table-body');
  if (!tbody) return;

  if (state.filteredFanpages.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4" style="color: var(--text-dim);">
          <i class="fa-solid fa-filter-circle-xmark" style="font-size: 1.5rem; display: block; margin-bottom: 8px;"></i>
          Không tìm thấy Fanpage nào phù hợp với bộ lọc.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = state.filteredFanpages.map((p, idx) => {
    const isHub = p.isMainHub || p.pageId === 'PAGE_TONG_VIEC_LAM';
    const regionBadgeClass = p.region === 'Miền Nam' ? 'warning' : (p.region === 'Miền Trung' ? 'success' : 'purple');
    const pageUrl = p.pageId && !p.pageId.startsWith('PAGE_') ? `https://facebook.com/${p.pageId}` : null;
    const isSelected = state.selectedFanpageIds.has(p.id || p.pageId);

    return `
      <tr class="${isSelected ? 'selected-row' : ''}">
        <td class="text-center" style="width: 45px; font-weight: 600; color: var(--text-dim);">${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 10px;">
            <div style="width: 32px; height: 32px; border-radius: 8px; background: rgba(0, 132, 255, 0.12); display: flex; align-items: center; justify-content: center; color: #0084ff; font-size: 0.95rem; flex-shrink: 0;">
              <i class="fa-solid ${isHub ? 'fa-star' : 'fa-flag'}"></i>
            </div>
            <div>
              <div style="font-weight: 600; font-size: 0.9rem; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                ${escapeHtml(p.name)}
                ${isHub ? '<span class="badge-pill primary" style="font-size: 0.68rem; padding: 2px 6px;">PAGE TỔNG</span>' : ''}
              </div>
              <span style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(p.alias || p.province || '')}</span>
            </div>
          </div>
        </td>
        <td>
          <span class="badge-pill ${regionBadgeClass}">${escapeHtml(p.region)}</span>
        </td>
        <td>
          <span style="font-weight: 500;"><i class="fa-solid fa-location-dot" style="font-size: 0.78rem; color: var(--text-muted); margin-right: 4px;"></i>${escapeHtml(p.province)}</span>
        </td>
        <td>
          <code style="font-size: 0.78rem; padding: 2px 6px; border-radius: 4px; background: var(--bg-hover); color: var(--text-main); font-family: monospace;">${escapeHtml(p.pageId || 'CHƯA GÁN ID')}</code>
        </td>
        <td>
          <span class="badge-pill success">
            <i class="fa-solid fa-circle-check"></i> Sẵn Sàng
          </span>
        </td>
        <td class="text-center">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn btn-sm ${isSelected ? 'btn-danger' : 'btn-primary'}" onclick="toggleSelectFanpage('${p.id || p.pageId}')" style="font-size: 0.76rem; padding: 4px 8px;">
              <i class="fa-solid ${isSelected ? 'fa-check' : 'fa-paper-plane'}"></i> ${isSelected ? 'Đã Chọn' : 'Chọn Đăng'}
            </button>
            ${pageUrl ? `
              <a href="${pageUrl}" target="_blank" class="btn btn-sm btn-outline" style="font-size: 0.76rem; padding: 4px 8px;" title="Mở Fanpage trên Facebook">
                <i class="fa-solid fa-arrow-up-right-from-square"></i>
              </a>
            ` : ''}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleSelectFanpage(pageId) {
  if (state.selectedFanpageIds.has(pageId)) {
    state.selectedFanpageIds.delete(pageId);
  } else {
    state.selectedFanpageIds.add(pageId);
  }
  renderFanpagesTable();
  renderFanpageCheckboxList();
  updatePublishChannelUI();
}

// OMNI-CHANNEL CONTROLLER HELPERS
function togglePublishChannel(channel) {
  if (channel === 'GROUPS') {
    state.publishChannels.groups = !state.publishChannels.groups;
  } else if (channel === 'FANPAGES') {
    state.publishChannels.fanpages = !state.publishChannels.fanpages;
  }

  // Đảm bảo không bị tắt cả 2 kênh
  if (!state.publishChannels.groups && !state.publishChannels.fanpages) {
    if (channel === 'GROUPS') state.publishChannels.fanpages = true;
    else state.publishChannels.groups = true;
    showToast('Cần ít nhất 1 kênh', 'Hệ thống cần ít nhất một kênh phân phối (Hội Nhóm hoặc Fanpage).', 'warning');
  }

  updatePublishChannelUI();
}

function updatePublishChannelUI() {
  const btnGroups = document.getElementById('btn-chan-groups');
  const btnFanpages = document.getElementById('btn-chan-fanpages');
  const countGroups = document.getElementById('chan-groups-count');
  const countFanpages = document.getElementById('chan-fanpages-count');
  const fanpageBlock = document.getElementById('fanpage-selection-block');

  if (btnGroups) {
    btnGroups.classList.toggle('active', !!state.publishChannels.groups);
  }
  if (btnFanpages) {
    btnFanpages.classList.toggle('active', !!state.publishChannels.fanpages);
  }

  if (countGroups) {
    countGroups.textContent = state.selectedGroupIds.size;
  }
  if (countFanpages) {
    countFanpages.textContent = state.selectedFanpageIds.size;
  }

  if (fanpageBlock) {
    fanpageBlock.style.display = state.publishChannels.fanpages ? 'block' : 'none';
  }
}

function renderFanpageCheckboxList() {
  const container = document.getElementById('fanpage-checkbox-list');
  if (!container) return;

  if (state.fanpages.length === 0) {
    container.innerHTML = `<span style="font-size: 0.82rem; color: var(--text-dim); padding: 8px;">Đang tải danh sách Fanpage...</span>`;
    return;
  }

  container.innerHTML = state.fanpages.map(p => {
    const isChecked = state.selectedFanpageIds.has(p.id || p.pageId);
    const pId = p.id || p.pageId;
    const isHub = p.isMainHub || p.pageId === 'PAGE_TONG_VIEC_LAM';

    return `
      <label style="display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-radius: 6px; background: ${isChecked ? 'rgba(0, 132, 255, 0.12)' : 'var(--bg-card)'}; border: 1px solid ${isChecked ? '#0084ff' : 'var(--border-color)'}; cursor: pointer; transition: all 0.15s ease;">
        <input type="checkbox" value="${pId}" ${isChecked ? 'checked' : ''} onchange="onFanpageCheckboxChange('${pId}', this.checked)" style="width: 16px; height: 16px; accent-color: #0084ff; cursor: pointer;">
        <div style="flex: 1; min-width: 0;">
          <div style="font-size: 0.82rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-main);">
            ${isHub ? '<i class="fa-solid fa-star text-warning" style="font-size: 0.72rem; margin-right: 3px;"></i>' : ''}${escapeHtml(p.name)}
          </div>
          <span style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(p.province)} &bull; ${escapeHtml(p.region)}</span>
        </div>
      </label>
    `;
  }).join('');

  updatePublishChannelUI();
}

function onFanpageCheckboxChange(pageId, checked) {
  if (checked) {
    state.selectedFanpageIds.add(pageId);
  } else {
    state.selectedFanpageIds.delete(pageId);
  }
  updatePublishChannelUI();
  renderFanpagesTable();
}

function toggleSelectAllFanpages() {
  if (state.selectedFanpageIds.size === state.fanpages.length) {
    state.selectedFanpageIds.clear();
  } else {
    state.fanpages.forEach(p => state.selectedFanpageIds.add(p.id || p.pageId));
  }
  renderFanpageCheckboxList();
  renderFanpagesTable();
  updatePublishChannelUI();
}

function deselectAllFanpages() {
  state.selectedFanpageIds.clear();
  renderFanpageCheckboxList();
  renderFanpagesTable();
  updatePublishChannelUI();
}

async function selectMatchedFanpages() {
  if (!state.selectedJob) {
    showToast('Chưa chọn bài viết', 'Vui lòng chọn bài viết từ Google Sheets hoặc Scraper Leads trước!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/fanpages/match', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ job: state.selectedJob })
    });
    const result = await res.json();

    const matchedList = (result.data && (result.data.matchedFanpages || result.data.matchedPages)) || result.matchedPages || result.matchedFanpages || [];
    if (result.success && matchedList.length > 0) {
      state.selectedFanpageIds.clear();
      matchedList.forEach(p => {
        state.selectedFanpageIds.add(p.id || p.pageId);
      });

      renderFanpageCheckboxList();
      renderFanpagesTable();
      updatePublishChannelUI();

      const matchedNames = matchedList.map(p => p.name).join(', ');
      showToast('Khớp Fanpage mục tiêu', `Đã tự động chọn ${matchedList.length} Fanpage phù hợp: ${matchedNames}`, 'success', 5000);
      appendTerminalLog(`[FANPAGE MATCHER] Đã khớp ${matchedList.length} Fanpage cho tin "${state.selectedJob.title}": ${matchedNames}`, 'info');
    }
  } catch (err) {
    console.error('Lỗi khớp Fanpage:', err);
    // Fallback nếu API có sự cố: chọn ít nhất Page Tổng
    const hub = state.fanpages.find(p => p.isMainHub || p.pageId === 'PAGE_TONG_VIEC_LAM');
    if (hub) state.selectedFanpageIds.add(hub.id || hub.pageId);
    renderFanpageCheckboxList();
    renderFanpagesTable();
    updatePublishChannelUI();
  }
}

// TOKEN CONFIG MODAL HELPERS
async function openMetaTokenModal() {
  const modal = document.getElementById('meta-token-modal');
  if (!modal) return;

  const input = document.getElementById('input-meta-token');
  const inputSouth = document.getElementById('input-meta-token-south');
  const inputCentral = document.getElementById('input-meta-token-central');
  const inputNorth = document.getElementById('input-meta-token-north');
  const resultBox = document.getElementById('meta-token-test-result');

  if (input) input.value = '';
  if (inputSouth) inputSouth.value = '';
  if (inputCentral) inputCentral.value = '';
  if (inputNorth) inputNorth.value = '';
  if (resultBox) resultBox.style.display = 'none';

  modal.classList.add('active');

  try {
    const res = await fetch('/api/fanpages/config');
    const data = await res.json();
    if (data.success && data.data) {
      if (input && data.data.systemUserTokenMasked) {
        input.placeholder = `Đang lưu: ${data.data.systemUserTokenMasked} (Nhập mới nếu đổi)`;
      }
      if (inputSouth && data.data.regionTokens?.['Miền Nam']) {
        inputSouth.placeholder = `Đang lưu: ${data.data.regionTokens['Miền Nam']} (Nhập mới nếu đổi)`;
      }
      if (inputCentral && data.data.regionTokens?.['Miền Trung']) {
        inputCentral.placeholder = `Đang lưu: ${data.data.regionTokens['Miền Trung']} (Nhập mới nếu đổi)`;
      }
      if (inputNorth && data.data.regionTokens?.['Miền Bắc']) {
        inputNorth.placeholder = `Đang lưu: ${data.data.regionTokens['Miền Bắc']} (Nhập mới nếu đổi)`;
      }
    }
  } catch (e) {
    console.warn('[MetaTokenModal] Không tải được cấu hình:', e);
  }
}

function closeMetaTokenModal() {
  const modal = document.getElementById('meta-token-modal');
  if (modal) modal.classList.remove('active');
}
window.openFanpageConfigModal = openMetaTokenModal;

async function saveMetaTokenConfig() {
  const token = (document.getElementById('input-meta-token')?.value || '').trim();
  const tokenSouth = (document.getElementById('input-meta-token-south')?.value || '').trim();
  const tokenCentral = (document.getElementById('input-meta-token-central')?.value || '').trim();
  const tokenNorth = (document.getElementById('input-meta-token-north')?.value || '').trim();

  const payload = {};
  if (token) payload.token = token;

  const regionTokens = {};
  if (tokenSouth) regionTokens['Miền Nam'] = tokenSouth;
  if (tokenCentral) regionTokens['Miền Trung'] = tokenCentral;
  if (tokenNorth) regionTokens['Miền Bắc'] = tokenNorth;

  if (Object.keys(regionTokens).length > 0) {
    payload.regionTokens = regionTokens;
  }

  try {
    const res = await fetch('/api/fanpages/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await res.json();

    if (result.success) {
      showToast('Lưu cấu hình thành công', result.message || 'Đã cập nhật cấu hình Meta Graph API thật cho các Fanpage khu vực.', 'success');
      closeMetaTokenModal();
      await loadFanpages(true);
      if (typeof loadFanpageAccountsBar === 'function') {
        await loadFanpageAccountsBar();
      }
    } else {
      showToast('Lưu thất bại', result.message, 'danger');
    }
  } catch (err) {
    showToast('Lỗi lưu cấu hình', err.message, 'danger');
  }
}

async function testMetaTokenConnection() {
  const token = (document.getElementById('input-meta-token')?.value || '').trim();
  const resultBox = document.getElementById('meta-token-test-result');
  if (!resultBox) return;

  resultBox.style.display = 'block';
  resultBox.style.background = 'rgba(59, 130, 246, 0.1)';
  resultBox.style.color = 'var(--text-main)';
  resultBox.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang kết nối tới Graph API...';

  try {
    const res = await fetch('/api/fanpages/test-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token })
    });
    const result = await res.json();

    if (result.success && (result.valid || result.data?.valid || result.user)) {
      resultBox.style.background = 'rgba(16, 185, 129, 0.15)';
      resultBox.style.color = 'var(--success)';
      const userName = result.user?.name || result.data?.name || 'Hợp lệ';
      const pagesCount = result.managedPagesCount !== undefined ? result.managedPagesCount : (result.data?.managedPagesCount || result.managedPages?.length || 0);
      resultBox.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-circle-check"></i> Kết Nối Meta Thành Công!</div>
        <div style="font-size: 0.78rem;">Tài khoản/App: <strong>${escapeHtml(userName)}</strong> &bull; Quản lý: <strong>${pagesCount} Fanpage</strong> &bull; Quyền: <code>pages_manage_posts</code> OK</div>
      `;
    } else {
      resultBox.style.background = 'rgba(239, 68, 68, 0.15)';
      resultBox.style.color = 'var(--danger)';
      resultBox.innerHTML = `
        <div style="font-weight: 600; margin-bottom: 4px;"><i class="fa-solid fa-circle-xmark"></i> Kiểm Tra Thất Bại</div>
        <div style="font-size: 0.78rem;">${escapeHtml(result.data?.reason || result.message || 'Token không hợp lệ hoặc đã hết hạn')}</div>
      `;
    }
  } catch (err) {
    resultBox.style.background = 'rgba(239, 68, 68, 0.15)';
    resultBox.style.color = 'var(--danger)';
    resultBox.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Lỗi kết nối: ${escapeHtml(err.message)}`;
  }
}

// =========================================================
// 13. CHẾ ĐỘ AUTO-PILOT 34 TỈNH THÀNH (2 BÀI/PAGE/NGÀY)
// =========================================================

function openAutoPilotModal() {
  const modal = document.getElementById('autopilot-modal');
  if (!modal) return;
  modal.classList.add('active');
  if (!state.autoPilotPlan) {
    loadAutoPilotPlan();
  } else {
    renderAutoPilotPlan();
  }
}

function closeAutoPilotModal() {
  const modal = document.getElementById('autopilot-modal');
  if (modal) modal.classList.remove('active');
}

async function loadAutoPilotPlan(forceReload = false) {
  const loadings = document.querySelectorAll('#autopilot-loading, #autopilot-page-loading');
  const contents = document.querySelectorAll('#autopilot-content, #autopilot-page-content');

  loadings.forEach(el => { if (el) el.style.display = 'block'; });
  contents.forEach(el => { if (el) el.style.display = 'none'; });

  try {
    const res = await smartFetch('/api/fanpages/autopilot/plan?postsPerPage=2' + (forceReload ? '&refresh=true' : ''));
    const result = await res.json();

    if (result.success) {
      state.autoPilotPlan = result;
      if (typeof currentAutoPilotPlan !== 'undefined') {
        currentAutoPilotPlan = result.plan;
      }
      loadings.forEach(el => { if (el) el.style.display = 'none'; });
      contents.forEach(el => { if (el) el.style.display = 'block'; });
      renderAutoPilotPlan();
    } else {
      loadings.forEach(el => {
        if (el) el.innerHTML = `<div class="text-danger py-4"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi lập kế hoạch: ${escapeHtml(result.message)}</div>`;
      });
    }
  } catch (err) {
    loadings.forEach(el => {
      if (el) el.innerHTML = `<div class="text-danger py-4"><i class="fa-solid fa-circle-exclamation"></i> Lỗi kết nối máy chủ: ${escapeHtml(err.message)}</div>`;
    });
  }
}

function filterAutoPilotTab(tabType, syncSelect = true) {
  state.autoPilotFilter = tabType;

  ['ap-tab-all', 'ap-page-tab-all'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tabType === 'ALL');
  });
  ['ap-tab-south', 'ap-page-tab-south'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tabType === 'SOUTH');
  });
  ['ap-tab-central', 'ap-page-tab-central'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tabType === 'CENTRAL');
  });
  ['ap-tab-north', 'ap-page-tab-north'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tabType === 'NORTH');
  });
  ['ap-tab-full', 'ap-page-tab-full'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tabType === 'FULL');
  });
  ['ap-tab-issues', 'ap-page-tab-issues'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', tabType === 'ISSUES');
  });

  if (syncSelect) {
    let regVal = 'ALL';
    if (tabType === 'SOUTH') regVal = 'Miền Nam';
    else if (tabType === 'CENTRAL') regVal = 'Miền Trung';
    else if (tabType === 'NORTH') regVal = 'Miền Bắc';

    ['autopilot-region-select', 'autopilot-page-region-select'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = regVal;
    });
    updateAutoPilotButtonLabels(regVal);
  }

  renderAutoPilotPlan();
}

function onAutoPilotRegionChange(val) {
  ['autopilot-region-select', 'autopilot-page-region-select'].forEach(id => {
    const sel = document.getElementById(id);
    if (sel && sel.value !== val) sel.value = val;
  });

  if (val === 'Miền Nam') filterAutoPilotTab('SOUTH', false);
  else if (val === 'Miền Trung') filterAutoPilotTab('CENTRAL', false);
  else if (val === 'Miền Bắc') filterAutoPilotTab('NORTH', false);
  else filterAutoPilotTab('ALL', false);

  updateAutoPilotButtonLabels(val);
}
window.onAutoPilotRegionChange = onAutoPilotRegionChange;

function updateAutoPilotButtonLabels(val) {
  const launchLabels = ['btn-launch-autopilot-label', 'btn-page-launch-label'];
  const genPostersLabels = ['btn-gen-posters-label'];
  
  let labelText = 'XUẤT BẢN TỰ ĐỘNG';
  let posterText = 'Tạo Tự Động Poster (34 Trang)';
  let statusText = 'Sẵn sàng xuất bản 68 bài viết cho hệ thống 34 Fanpage';

  if (val === 'Miền Nam') {
    labelText = 'XUẤT BẢN MIỀN NAM (12 TRANG)';
    posterText = 'Tạo Poster Miền Nam (12 Trang)';
    statusText = '🌴 Sẵn sàng xuất bản 24 bài viết cho 12 Fanpage Miền Nam';
  } else if (val === 'Miền Trung') {
    labelText = 'XUẤT BẢN MIỀN TRUNG (11 TRANG)';
    posterText = 'Tạo Poster Miền Trung (11 Trang)';
    statusText = '🌊 Sẵn sàng xuất bản 22 bài viết cho 11 Fanpage Miền Trung';
  } else if (val === 'Miền Bắc') {
    labelText = 'XUẤT BẢN MIỀN BẮC (11 TRANG)';
    posterText = 'Tạo Poster Miền Bắc (11 Trang)';
    statusText = '🏔️ Sẵn sàng xuất bản 22 bài viết cho 11 Fanpage Miền Bắc';
  } else {
    labelText = 'XUẤT BẢN TOÀN QUỐC (34 TRANG)';
    posterText = 'Tạo Tự Động Poster (34 Trang)';
    statusText = 'Sẵn sàng xuất bản 68 bài viết cho hệ thống 34 Fanpage';
  }

  launchLabels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = labelText;
  });
  genPostersLabels.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = posterText;
  });
  const bText = document.getElementById('ap-bottom-status-text');
  if (bText) bText.innerHTML = `<i class="fa-solid fa-circle-check text-success"></i> ${statusText}`;
}
window.updateAutoPilotButtonLabels = updateAutoPilotButtonLabels;

function renderAutoPilotPlan() {
  if (!state.autoPilotPlan) return;

  const { metrics, plan } = state.autoPilotPlan;

  // Cập nhật metrics đồng bộ cả modal và trang riêng
  const updateMetric = (ids, val) => {
    ids.forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    });
  };

  updateMetric(['ap-metric-full', 'ap-page-metric-full'], `${metrics.fullCount} Tỉnh`);
  updateMetric(['ap-metric-partial', 'ap-page-metric-partial'], `${metrics.partialCount} Tỉnh`);
  updateMetric(['ap-metric-nodata', 'ap-page-metric-nodata'], `${metrics.noDataCount} Tỉnh`);
  updateMetric(['ap-total-posts', 'ap-page-total-posts'], `${state.autoPilotPlan.totalScheduledPosts} Bài`);

  // Cập nhật dropdown chọn page để test trên cả modal và trang riêng
  ['autopilot-test-page-select', 'autopilot-page-test-page-select'].forEach(selId => {
    const testSelect = document.getElementById(selId);
    if (testSelect && plan) {
      const curVal = testSelect.value;
      testSelect.innerHTML = '<option value="">-- Chọn 1 Fanpage để test --</option>' + 
        plan.map(p => `<option value="${escapeHtml(p.pageId)}">${escapeHtml(p.pageName)} (${p.posts.length} bài)</option>`).join('');
      if (curVal) testSelect.value = curVal;
    }
  });

  // Lọc danh sách theo tab
  let filtered = plan || [];
  if (state.autoPilotFilter === 'SOUTH') {
    filtered = filtered.filter(p => (p.region || '').includes('Nam'));
  } else if (state.autoPilotFilter === 'CENTRAL') {
    filtered = filtered.filter(p => (p.region || '').includes('Trung'));
  } else if (state.autoPilotFilter === 'NORTH') {
    filtered = filtered.filter(p => (p.region || '').includes('Bắc'));
  } else if (state.autoPilotFilter === 'FULL') {
    filtered = filtered.filter(p => p.readinessStatus === 'FULL');
  } else if (state.autoPilotFilter === 'ISSUES') {
    filtered = filtered.filter(p => p.readinessStatus === 'PARTIAL' || p.readinessStatus === 'NO_DATA');
  }

  const containers = Array.from(document.querySelectorAll('#autopilot-plan-list, #autopilot-page-plan-list'));

  // Đảm bảo hiển thị khu vực nội dung và ẩn loading spinner
  document.querySelectorAll('#autopilot-content, #autopilot-page-content').forEach(el => {
    el.style.display = 'block';
  });
  document.querySelectorAll('#autopilot-loading, #autopilot-page-loading').forEach(el => {
    el.style.display = 'none';
  });

  if (containers.length === 0) return;

  if (filtered.length === 0) {
    const emptyHtml = `
      <div style="grid-column: 1 / -1; padding: 30px; text-align: center; color: var(--text-dim);">
        <i class="fa-solid fa-filter-circle-xmark" style="font-size: 2rem; display: block; margin-bottom: 10px;"></i>
        Không có tỉnh thành nào trong danh mục này.
      </div>
    `;
    containers.forEach(c => c.innerHTML = emptyHtml);
    return;
  }

  const cardsHtml = filtered.map(item => {
    let statusBadge = '';
    if (item.readinessStatus === 'FULL') {
      statusBadge = `<span class="badge-pill success" style="padding: 3px 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-check"></i> Đủ 2 bài</span>`;
    } else if (item.readinessStatus === 'PARTIAL') {
      statusBadge = `<span class="badge-pill warning" style="padding: 3px 8px; font-size: 0.72rem;"><i class="fa-solid fa-circle-half-stroke"></i> Ghép 1/2 bài</span>`;
    } else {
      statusBadge = `<span class="badge-pill danger" style="padding: 3px 8px; font-size: 0.72rem;"><i class="fa-solid fa-triangle-exclamation"></i> Chưa có bài</span>`;
    }

    return `
      <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 14px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
        <div>
          <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
            <div>
              <div style="font-weight: 700; font-size: 0.95rem; color: var(--text-main); display: flex; align-items: center; gap: 6px;">
                <i class="fa-solid fa-flag text-primary" style="font-size: 0.85rem;"></i> ${escapeHtml(item.pageName)}
              </div>
              <div style="font-size: 0.75rem; color: var(--text-dim); margin-top: 2px;">
                Tỉnh: <strong>${escapeHtml(item.province)}</strong> &bull; Khu vực: ${escapeHtml(item.region)}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 6px;">
              ${statusBadge}
              <button class="btn btn-sm btn-outline-success" onclick="launchSinglePageAutoPilot('${item.pageId}')" style="font-size: 0.72rem; padding: 3px 8px; font-weight: 600;" title="Đăng thử nghiệm bài viết cho riêng trang ${escapeHtml(item.pageName)}">
                <i class="fa-solid fa-paper-plane"></i> Test Page Này
              </button>
            </div>
          </div>

          ${item.reason && item.readinessStatus !== 'FULL' ? `
            <div style="font-size: 0.75rem; color: var(--text-muted); background: rgba(239, 68, 68, 0.08); border: 1px solid rgba(239, 68, 68, 0.2); padding: 6px 10px; border-radius: 4px; margin-top: 8px;">
              <i class="fa-solid fa-circle-info text-danger"></i> ${escapeHtml(item.reason)}
            </div>
          ` : ''}

          <!-- Danh sách bài theo ca -->
          <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 8px;">
            ${item.posts.map((post, idx) => {
              const posterSrc = post.posterUrl || (post.mediaUrls && post.mediaUrls[0]) || '/uploads/1787412190105_TUY___N_D___NG__2_.png';
              return `
              <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg-hover); padding: 8px 10px; border-radius: 6px; font-size: 0.8rem; border: 1px solid var(--border-color); gap: 10px;">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1;">
                  <img src="${escapeHtml(posterSrc)}" 
                       alt="Poster" 
                       style="width: 44px; height: 44px; object-fit: cover; border-radius: 6px; border: 1px solid rgba(0,0,0,0.1); background: #fff; flex-shrink: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.05);"
                       onerror="this.src='/uploads/1787412190105_TUY___N_D___NG__2_.png'" />
                  <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span class="badge-pill primary" style="font-size: 0.68rem; padding: 1px 6px;">${post.slot}</span>
                      <span style="font-size: 0.72rem; color: var(--text-dim);">${escapeHtml(post.company || '')}</span>
                    </div>
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; color: var(--text-main); margin-top: 2px;" title="${escapeHtml(post.jobTitle)}">
                      ${escapeHtml(post.jobTitle)}
                    </div>
                  </div>
                </div>
                <button class="btn btn-sm btn-outline" onclick="openAutoPilotInspector('${item.pageId}', ${idx})" style="font-size: 0.72rem; padding: 4px 10px; flex-shrink: 0;" title="Xem nội dung chi tiết bài đăng & poster">
                  <i class="fa-solid fa-eye"></i> Xem bài
                </button>
              </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }).join('');

  // Gán nội dung cardsHtml vào tất cả containers tương ứng
  containers.forEach(c => {
    c.innerHTML = cardsHtml;
  });
}

function openAutoPilotInspector(pageId, slotIdx) {
  if (!state.autoPilotPlan || !state.autoPilotPlan.plan) return;
  const pagePlan = state.autoPilotPlan.plan.find(p => p.pageId === pageId);
  if (!pagePlan || !pagePlan.posts || !pagePlan.posts[slotIdx]) return;

  const post = pagePlan.posts[slotIdx];
  state.activeInspectorPost = { pagePlan, post, slotIdx };

  const modal = document.getElementById('autopilot-inspector-modal') || document.getElementById('post-inspector-modal');
  const slotBadge = document.getElementById('inspector-slot-badge');
  const pageBadge = document.getElementById('inspector-page-badge');
  const jobTitle = document.getElementById('inspector-job-title');
  const companyEl = document.getElementById('inspector-company');
  const textarea = document.getElementById('inspector-post-content');
  const imgEl = document.getElementById('inspector-poster-img');

  if (slotBadge) slotBadge.innerHTML = `<i class="fa-solid fa-clock"></i> ${escapeHtml(post.slot)}`;
  if (pageBadge) pageBadge.innerHTML = `<i class="fa-brands fa-facebook"></i> ${escapeHtml(pagePlan.pageName)}`;
  if (jobTitle) jobTitle.textContent = post.jobTitle || 'Tin Tuyển Dụng';
  if (companyEl) companyEl.innerHTML = `<i class="fa-solid fa-building"></i> ${escapeHtml(post.company || 'Doanh nghiệp Tuyển dụng')}`;
  if (textarea) textarea.value = post.formattedContent || post.content || '';

  if (imgEl) {
    imgEl.onerror = () => {
      imgEl.onerror = null;
      console.warn('[Inspector] Poster chưa có trên đĩa, tự động tạo mới tức thì...');
      regenerateInspectorPoster();
    };
    if (post.posterExists && post.posterUrl) {
      imgEl.src = post.posterUrl;
    } else if (post.mediaUrls && post.mediaUrls[0]) {
      imgEl.src = post.mediaUrls[0];
    } else {
      imgEl.src = '/uploads/1787412190105_TUY___N_D___NG__2_.png';
    }
  }

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closeAutoPilotInspector() {
  const modal = document.getElementById('post-inspector-modal') || document.getElementById('autopilot-inspector-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  state.activeInspectorPost = null;
}

window.openAutoPilotInspector = openAutoPilotInspector;
window.closeAutoPilotInspector = closeAutoPilotInspector;
window.closePostInspector = closeAutoPilotInspector;

function saveInspectorChanges() {
  if (!state.activeInspectorPost) return;
  const textarea = document.getElementById('inspector-post-content');
  if (textarea && state.activeInspectorPost.post) {
    state.activeInspectorPost.post.formattedContent = textarea.value;
    state.activeInspectorPost.post.content = textarea.value;
    if (typeof showToast === 'function') {
      showToast('Đã lưu thay đổi', 'Nội dung bài viết đã được cập nhật thành công!', 'success');
    }
  }
  closeAutoPilotInspector();
}

window.saveInspectorChanges = saveInspectorChanges;
window.saveInspectedPost = saveInspectorChanges;

function pickStockPhotoForInspector() {
  let jobTitle = '';
  if (state.activeInspectorPost && state.activeInspectorPost.post) {
    jobTitle = state.activeInspectorPost.post.jobTitle || '';
  }

  if (typeof openStockPhotoPickerModal === 'function') {
    openStockPhotoPickerModal(chosenPhotoUrl => {
      const imgEl = document.getElementById('inspector-poster-img');
      if (imgEl) imgEl.src = chosenPhotoUrl;

      if (state.activeInspectorPost && state.activeInspectorPost.post) {
        state.activeInspectorPost.post.posterUrl = chosenPhotoUrl;
        state.activeInspectorPost.post.mediaUrls = [chosenPhotoUrl];
        state.activeInspectorPost.post.posterExists = true;
      }

      if (typeof renderAutoPilotPlan === 'function') {
        renderAutoPilotPlan();
      }

      if (typeof showToast === 'function') {
        showToast('Đã chọn ảnh poster', 'Poster bài đăng đã được cập nhật từ Kho ảnh ngành nghề!', 'success');
      }
    }, jobTitle);
  } else {
    alert('Chức năng chọn ảnh kho ngành nghề đang được khởi tạo.');
  }
}
window.pickStockPhotoForInspector = pickStockPhotoForInspector;

async function regenerateInspectorPoster() {
  if (!state.activeInspectorPost) return;
  const { pagePlan, post } = state.activeInspectorPost;
  const imgEl = document.getElementById('inspector-poster-img');
  const btn = document.getElementById('btn-inspector-regen-poster');

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tạo lại...`;
  }

  try {
    const res = await fetch('/api/recruitment/generate-poster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job: post.job || {
          title: post.jobTitle,
          company: post.company,
          location: post.location || pagePlan.province,
          salary: post.salary,
          category: post.category
        },
        pageInfo: { name: pagePlan.pageName, province: pagePlan.province },
        force: true
      })
    });
    const data = await res.json();
    if (data.success && data.imageUrl) {
      const freshUrl = `${data.imageUrl}?t=${Date.now()}`;
      if (imgEl) imgEl.src = freshUrl;
      post.posterUrl = data.imageUrl;
      post.mediaUrls = [data.imageUrl];
      post.posterExists = true;
      showToast('Đã tạo poster mới', 'Poster đã được làm mới thành công chuẩn Human Graphic Design!', 'success');
      renderAutoPilotPlan();
    } else {
      showToast('Lỗi', data.message || 'Không thể tạo lại poster.', 'error');
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> Tạo lại ảnh này`;
    }
  }
}

async function generateAllAutoPilotPosters() {
  if (!state.autoPilotPlan || !state.autoPilotPlan.plan) {
    showToast('Chưa có kế hoạch', 'Vui lòng bấm Phân Tích Lại để nạp danh sách 34 fanpage.', 'warning');
    return;
  }

  const btn = document.getElementById('btn-autopilot-gen-posters');
  const lbl = document.getElementById('btn-gen-posters-label');

  if (btn) btn.disabled = true;
  if (lbl) lbl.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang tự động sinh poster...`;

  try {
    showToast('Bắt đầu sinh poster', 'Đang tự động sinh poster cho toàn bộ bài đăng 34 fanpage...', 'info');

    const res = await fetch('/api/fanpages/autopilot/generate-all-posters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: state.autoPilotPlan })
    });
    const result = await res.json();

    if (result.success) {
      showToast('Hoàn tất sinh poster', `Đã tạo ${result.generated} ảnh mới (${result.cached} từ cache, ${result.failed} lỗi) / tổng ${result.total} bài!`, 'success');
      if (result.plan) {
        state.autoPilotPlan = result.plan;
      }
      renderAutoPilotPlan();
    } else {
      showToast('Lỗi tạo poster', result.message || 'Không thể hoàn tất tạo poster hàng loạt.', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'error');
  } finally {
    if (btn) btn.disabled = false;
    if (lbl) lbl.textContent = 'Tạo Tự Động Poster (34 Trang)';
  }
}

function copyInspectorContent() {
  const textarea = document.getElementById('inspector-post-content');
  if (textarea) {
    navigator.clipboard.writeText(textarea.value);
    showToast('Đã sao chép', 'Đã copy nội dung bài đăng vào clipboard!', 'info');
  }
}

async function launchAutoPilotCampaign() {
  if (!state.autoPilotPlan || !state.autoPilotPlan.plan) {
    alert('Chưa có kế hoạch Auto-Pilot nào được nạp!');
    return;
  }

  const regionSelect = document.getElementById('autopilot-region-select') || document.getElementById('autopilot-page-region-select');
  const targetRegion = regionSelect ? regionSelect.value : 'ALL';

  let targetedPlan = state.autoPilotPlan.plan;
  if (targetRegion && targetRegion !== 'ALL') {
    const regNorm = targetRegion.toLowerCase().replace(/[-_ ]/g, '');
    targetedPlan = targetedPlan.filter(p => {
      const pReg = (p.region || '').toLowerCase().replace(/[-_ ]/g, '');
      return pReg.includes(regNorm) || regNorm.includes(pReg);
    });
  }

  const targetedPosts = targetedPlan.reduce((acc, p) => acc + (p.posts ? p.posts.length : 0), 0);
  if (targetedPosts === 0) {
    alert(`Hiện chưa có bài viết nào sẵn sàng cho khu vực: ${targetRegion}!`);
    return;
  }

  const regionLabel = targetRegion === 'ALL' 
    ? 'Toàn bộ 34 Fanpage tỉnh thành' 
    : `khu vực ${targetRegion.toUpperCase()} (${targetedPlan.length} Fanpage)`;

  const confirmMsg = `Bạn có chắc chắn muốn kích hoạt Auto-Pilot xuất bản ${targetedPosts} bài đăng cho ${regionLabel} (2 bài/trang) ngay bây giờ không?`;
  if (!confirm(confirmMsg)) return;

  closeAutoPilotModal();

  // Chuyển sang Tab Auto-Pilot chuyên dụng để theo dõi trực tiếp trên Live Terminal
  if (state.currentTab !== 'page-controller-tab') {
    if (typeof switchTab === 'function') switchTab('page-controller-tab');
  }
  const controllerEl = document.getElementById('fanpage-live-panel') || document.getElementById('autopilot-live-panel') || document.getElementById('fanpage-live-controller-panel');
  if (controllerEl) {
    controllerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Khởi chạy chiến dịch qua Live Controller
  if (typeof startFanpageLiveCampaign === 'function') {
    startFanpageLiveCampaign({ noConfirm: true, plan: state.autoPilotPlan, targetRegion });
  } else {
    showToast('Kích hoạt Auto-Pilot', `Đang xuất bản ${targetedPosts} bài đăng cho ${regionLabel}...`, 'info', 6000);
    fetch('/api/fanpages/campaign/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: state.autoPilotPlan, targetRegion })
    });
  }
}

// ĐĂNG THỬ 1 FANPAGE CỤ THỂ
async function launchSinglePageAutoPilot(targetPageId) {
  if (!state.autoPilotPlan || !state.autoPilotPlan.plan) {
    alert('Chưa có kế hoạch Auto-Pilot nào được nạp!');
    return;
  }
  if (!targetPageId) {
    alert('Vui lòng chọn 1 Fanpage trong danh sách để đăng thử!');
    return;
  }

  const pagePlan = state.autoPilotPlan.plan.find(p => p.pageId === targetPageId);
  if (!pagePlan) {
    alert('Không tìm thấy thông tin Fanpage được chọn!');
    return;
  }

  const postCount = pagePlan.posts.length;
  if (postCount === 0) {
    alert(`Fanpage "${pagePlan.pageName}" hiện chưa có bài viết nào được ghép! Vui lòng chọn page khác.`);
    return;
  }

  const confirmMsg = `Bạn có chắc muốn ĐĂNG THỬ ${postCount} bài lên riêng Fanpage "${pagePlan.pageName}" để kiểm tra kết quả thực tế trên Facebook?`;
  if (!confirm(confirmMsg)) return;

  const btn = document.getElementById('btn-test-single-page');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang test...';
  }

  appendTerminalLog(`[TEST 1 PAGE] Bắt đầu đăng thử ${postCount} bài lên "${pagePlan.pageName}"...`, 'info');
  showToast('Đang đăng thử', `Đang xuất bản ${postCount} bài lên "${pagePlan.pageName}"...`, 'info', 5000);

  try {
    const res = await fetch('/api/fanpages/autopilot/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: state.autoPilotPlan,
        targetPageId: targetPageId
      })
    });
    const result = await res.json();

    if (result.success) {
      const okItem = (result.results || []).find(r => r.success);
      const postLink = okItem && okItem.postUrl ? `\\nLink bài viết: ${okItem.postUrl}` : '';
      appendTerminalLog(`[TEST 1 PAGE THÀNH CÔNG] Đã đăng xong: ${result.successCount} thành công, ${result.failedCount} lỗi.${postLink}`, 'success');
      showToast('Đăng thử thành công', `Đã xuất bản thành công ${result.successCount}/${result.totalPosts} bài lên "${pagePlan.pageName}"!`, 'success', 8000);
      if (okItem && okItem.postUrl) {
        if (confirm(`Đăng thử thành công lên "${pagePlan.pageName}"!\\n\\nBạn có muốn mở xem bài viết trên Facebook ngay bây giờ không?`)) {
          window.open(okItem.postUrl, '_blank');
        }
      }
      setTimeout(loadHistoryData, 1200);
    } else {
      appendTerminalLog(`[TEST 1 PAGE LỖI] ${result.message}`, 'error');
      showToast('Lỗi đăng thử', result.message, 'danger', 6000);
    }
  } catch (err) {
    appendTerminalLog(`[TEST LỖI KẾT NỐI] ${err.message}`, 'error');
    showToast('Lỗi kết nối', err.message, 'danger', 6000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Đăng Thử Page Này';
    }
  }
}

// ĐĂNG THỬ BÀI VIẾT ĐANG XEM TRONG MODAL
async function testPublishCurrentInspectedPost() {
  if (!state.activeInspectorPost) return;
  const { pagePlan, post } = state.activeInspectorPost;
  const textarea = document.getElementById('inspector-post-content');
  const btn = document.getElementById('btn-inspector-test-publish');

  const contentToPublish = textarea ? textarea.value.trim() : (post.formattedContent || post.content);
  if (!contentToPublish) {
    alert('Nội dung bài viết đang để trống!');
    return;
  }

  const confirmMsg = `Bạn có chắc muốn ĐĂNG THỬ bài viết này ngay lập tức lên Fanpage "${pagePlan.pageName}"?`;
  if (!confirm(confirmMsg)) return;

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang đăng lên Facebook...';
  }

  // Cập nhật lại nội dung vừa sửa nếu có
  post.formattedContent = contentToPublish;

  try {
    const res = await fetch('/api/fanpages/autopilot/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        singlePost: {
          ...post,
          formattedContent: contentToPublish,
          mediaUrls: post.mediaUrls || (post.posterUrl ? [post.posterUrl] : [])
        }
      })
    });
    const result = await res.json();

    if (result.success) {
      const okItem = (result.results || [])[0];
      const postUrl = okItem && okItem.postUrl ? okItem.postUrl : '';
      showToast('Đăng thử thành công', `Đã xuất bản bài viết lên "${pagePlan.pageName}"!`, 'success', 8000);
      appendTerminalLog(`[TEST BÀI VIẾT THÀNH CÔNG] Đã đăng lên ${pagePlan.pageName}: ${postUrl}`, 'success');
      if (postUrl) {
        if (confirm(`Đã đăng thử bài viết thành công lên "${pagePlan.pageName}"!\\n\\nBấm OK để mở xem trực tiếp trên Facebook.`)) {
          window.open(postUrl, '_blank');
        }
      }
      closeAutoPilotInspector();
      setTimeout(loadHistoryData, 1200);
    } else {
      showToast('Lỗi đăng bài', result.message || 'Không thể đăng bài lên Fanpage.', 'danger', 6000);
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger', 6000);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> ĐĂNG THỬ BÀI NÀY LÊN FANPAGE';
    }
  }
}

// =============================================================================
// TÍNH NĂNG: CÀO BÀI VIẾT TUYỂN DỤNG & KHAI THÁC LEAD VÀNG (FACEBOOK GROUP)
// =============================================================================

let scrapeLeadsPollInterval = null;
let isScrapeLeadsRunning = false;
let isScrapeLeadsPaused = false;

function openScrapeLeadsModal() {
  const modal = document.getElementById('scrape-leads-modal');
  if (!modal) return;

  // Cập nhật số lượng nhóm
  const joinedCount = (state.groups || []).filter(g => g.isJoined === true).length;
  const filteredCount = (state.filteredGroups || []).length;

  const elJoined = document.getElementById('scrape-leads-joined-count');
  if (elJoined) elJoined.textContent = `${joinedCount} nhóm`;

  const elFiltered = document.getElementById('scrape-leads-filtered-count');
  if (elFiltered) elFiltered.textContent = `${filteredCount} nhóm`;

  modal.classList.add('active');

  // Kiểm tra trạng thái hiện tại từ backend
  pollScrapeLeadsStatus();
  if (scrapeLeadsPollInterval) clearInterval(scrapeLeadsPollInterval);
  scrapeLeadsPollInterval = setInterval(pollScrapeLeadsStatus, 1500);
}

function closeScrapeLeadsModal() {
  const modal = document.getElementById('scrape-leads-modal');
  if (modal) modal.classList.remove('active');

  if (!isScrapeLeadsRunning && scrapeLeadsPollInterval) {
    clearInterval(scrapeLeadsPollInterval);
    scrapeLeadsPollInterval = null;
  }
}

function toggleScrapeSourceUI() {
  const sel = document.querySelector('input[name="scrape-leads-source"]:checked')?.value;
  const box = document.getElementById('scrape-leads-custom-box');
  if (box) {
    box.style.display = sel === 'custom' ? 'block' : 'none';
  }
}

async function startScrapingLeads() {
  const source = document.querySelector('input[name="scrape-leads-source"]:checked')?.value || 'joined';
  let targetGroups = [];

  if (source === 'joined') {
    targetGroups = (state.groups || []).filter(g => g.isJoined === true).map(g => ({
      id: g.id,
      name: g.name || g.url,
      url: g.url,
      province: g.province || ''
    }));
  } else if (source === 'filtered') {
    targetGroups = (state.filteredGroups || []).map(g => ({
      id: g.id,
      name: g.name || g.url,
      url: g.url,
      province: g.province || ''
    }));
  } else if (source === 'custom') {
    const rawText = document.getElementById('scrape-leads-custom-urls')?.value || '';
    const lines = rawText.split('\n').map(l => l.trim()).filter(l => l.length > 5 && l.includes('facebook.com'));
    targetGroups = lines.map((url, idx) => ({
      id: `custom_${idx + 1}`,
      name: `Nhóm ${url.replace(/.*groups\//, '').replace(/\/.*/, '') || (idx + 1)}`,
      url,
      province: 'Toàn quốc'
    }));
  }

  if (targetGroups.length === 0) {
    if (source === 'joined') {
      showToast('Chưa có nhóm đã tham gia', 'Nick hiện tại chưa có nhóm nào được đánh dấu ĐÃ VÀO. Bạn có thể chọn "Dán trực tiếp URL" hoặc chọn nhóm từ Bộ lọc hiện tại.', 'warning', 6000);
    } else if (source === 'custom') {
      showToast('Chưa nhập URL nhóm', 'Vui lòng dán ít nhất 1 đường link nhóm Facebook hợp lệ vào khung bên dưới.', 'warning', 5000);
    } else {
      showToast('Danh sách trống', 'Không có nhóm nào trong bộ lọc hiện tại để cào.', 'warning', 5000);
    }
    return;
  }

  const maxPostsPerGroup = parseInt(document.getElementById('scrape-leads-max-posts')?.value, 10) || 20;
  const filterJobSeekers = document.getElementById('scrape-filter-seekers')?.checked !== false;
  const filterScam = document.getElementById('scrape-filter-scam')?.checked !== false;
  const goldOnly = document.getElementById('scrape-gold-only')?.checked === true;

  const btnStart = document.getElementById('btn-start-scrape-leads');
  const btnPause = document.getElementById('btn-pause-scrape-leads');
  const btnStop = document.getElementById('btn-stop-scrape-leads');

  if (btnStart) btnStart.style.display = 'none';
  if (btnPause) btnPause.style.display = 'inline-flex';
  if (btnStop) btnStop.style.display = 'inline-flex';

  isScrapeLeadsRunning = true;
  isScrapeLeadsPaused = false;

  showToast('Khởi động cào Lead', `Đang mở trình duyệt để cào ${targetGroups.length} nhóm mục tiêu...`, 'info', 4000);

  try {
    const res = await fetch('/api/scraped/start-scrape-leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        groups: targetGroups,
        maxPostsPerGroup,
        goldOnly,
        filterJobSeekers,
        filterScam
      })
    });

    const result = await res.json();
    if (!result.success) {
      showToast('Lỗi bắt đầu cào', result.message, 'danger', 5000);
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';
      isScrapeLeadsRunning = false;
      return;
    }

    if (scrapeLeadsPollInterval) clearInterval(scrapeLeadsPollInterval);
    scrapeLeadsPollInterval = setInterval(pollScrapeLeadsStatus, 1500);

  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'danger', 5000);
    if (btnStart) btnStart.style.display = 'inline-flex';
    if (btnPause) btnPause.style.display = 'none';
    if (btnStop) btnStop.style.display = 'none';
    isScrapeLeadsRunning = false;
  }
}

async function pollScrapeLeadsStatus() {
  try {
    const res = await fetch('/api/scraped/scrape-status');
    const result = await res.json();
    if (!result.success || !result.data) return;

    const data = result.data;
    const prog = data.progress || {};

    isScrapeLeadsRunning = Boolean(data.isScraping);
    isScrapeLeadsPaused = Boolean(data.isPaused);

    // Cập nhật badges
    const statusBadge = document.getElementById('scrape-leads-status-badge');
    const statusMsg = document.getElementById('scrape-leads-status-msg');
    const scannedBadge = document.getElementById('scrape-leads-scanned-badge');
    const goldBadge = document.getElementById('scrape-leads-gold-badge');
    const potBadge = document.getElementById('scrape-leads-potential-badge');
    const pBar = document.getElementById('scrape-leads-progress-bar');

    if (scannedBadge) scannedBadge.innerHTML = `<i class="fa-solid fa-eye"></i> ${prog.postsScanned || 0} bài quét`;
    if (goldBadge) goldBadge.innerHTML = `<i class="fa-solid fa-crown"></i> ${prog.goldLeadsCount || 0} Lead Vàng`;
    if (potBadge) potBadge.innerHTML = `<i class="fa-solid fa-bolt"></i> ${prog.potentialLeadsCount || 0} Tiềm Năng`;

    if (statusMsg) statusMsg.textContent = prog.message || 'Sẵn sàng';

    if (statusBadge) {
      if (prog.status === 'RUNNING') {
        statusBadge.textContent = 'ĐANG CÀO BÀI';
        statusBadge.style.background = 'rgba(245, 158, 11, 0.2)';
        statusBadge.style.color = '#f59e0b';
      } else if (prog.status === 'PAUSED') {
        statusBadge.textContent = 'TẠM DỪNG';
        statusBadge.style.background = 'rgba(107, 114, 128, 0.2)';
        statusBadge.style.color = 'var(--text-muted)';
      } else if (prog.status === 'COMPLETED') {
        statusBadge.textContent = 'HOÀN TẤT';
        statusBadge.style.background = 'rgba(16, 185, 129, 0.2)';
        statusBadge.style.color = '#10b981';
      } else if (prog.status === 'STOPPED') {
        statusBadge.textContent = 'ĐÃ DỪNG';
        statusBadge.style.background = 'rgba(239, 68, 68, 0.2)';
        statusBadge.style.color = '#ef4444';
      } else {
        statusBadge.textContent = 'SẴN SÀNG';
        statusBadge.style.background = 'var(--bg-input)';
        statusBadge.style.color = 'var(--text-main)';
      }
    }

    // Tính % thanh tiến độ
    if (pBar) {
      if (prog.totalGroups > 0 && prog.status === 'RUNNING') {
        const pct = Math.min(95, Math.round((prog.groupIndex / prog.totalGroups) * 100));
        pBar.style.width = `${pct}%`;
      } else if (prog.status === 'COMPLETED') {
        pBar.style.width = '100%';
      } else if (prog.status === 'IDLE') {
        pBar.style.width = '0%';
      }
    }

    // Hiển thị logs
    const logBox = document.getElementById('scrape-leads-live-log');
    if (logBox && Array.isArray(data.logs) && data.logs.length > 0) {
      logBox.innerHTML = data.logs.map(l => {
        let color = '#58a6ff';
        if (l.type === 'error') color = '#f85149';
        else if (l.type === 'success') color = '#3fb950';
        else if (l.type === 'warn') color = '#d29922';
        return `<div><span style="color: #8b949e;">[${escapeHtml(l.timestamp)}]</span> <span style="color: ${color};">${escapeHtml(l.message)}</span></div>`;
      }).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }

    // Nút điều khiển
    const btnStart = document.getElementById('btn-start-scrape-leads');
    const btnPause = document.getElementById('btn-pause-scrape-leads');
    const btnStop = document.getElementById('btn-stop-scrape-leads');

    if (data.isScraping) {
      if (btnStart) btnStart.style.display = 'none';
      if (btnPause) {
        btnPause.style.display = 'inline-flex';
        btnPause.innerHTML = data.isPaused
          ? '<i class="fa-solid fa-play"></i> Tiếp Tục'
          : '<i class="fa-solid fa-pause"></i> Tạm Dừng';
      }
      if (btnStop) btnStop.style.display = 'inline-flex';
    } else {
      if (btnStart) btnStart.style.display = 'inline-flex';
      if (btnPause) btnPause.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';

      if (scrapeLeadsPollInterval && (prog.status === 'COMPLETED' || prog.status === 'STOPPED')) {
        clearInterval(scrapeLeadsPollInterval);
        scrapeLeadsPollInterval = null;

        // Tự động làm mới bảng Nguồn Tin Tuyển Dụng để người dùng thấy bài mới cào
        loadScrapedJobs(true);
      }
    }

  } catch (err) {
    // ignore polling error
  }
}

async function stopScrapingLeads() {
  try {
    await fetch('/api/scraped/stop-scrape', { method: 'POST' });
    showToast('Dừng cào', 'Đã gửi yêu cầu dừng cào bài viết.', 'warning');
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

async function togglePauseScrapeLeads() {
  try {
    if (isScrapeLeadsPaused) {
      await fetch('/api/scraped/resume-scrape', { method: 'POST' });
    } else {
      await fetch('/api/scraped/pause-scrape', { method: 'POST' });
    }
  } catch (err) {
    showToast('Lỗi', err.message, 'danger');
  }
}

// =============================================================================
// =============================================================================
// BÁO CÁO TỔNG QUAN DỮ LIỆU CÀO ĐA NGUỒN (TOPCV, JOBSGO, VIECLAM24H, CAREERVIET, VIETNAMWORKS, FB)
// TỰ ĐỘNG ĐỒNG BỘ LIÊN TỤC THEO THỜI GIAN THỰC (REAL-TIME LIVE SYNC & SSE STREAM)
// =============================================================================

let marketScraperChartInstances = {
  sources: null,
  provinces: null
};

let cachedMarketOverviewData = null;
let marketLiveSyncInitialized = false;
let marketSyncIntervalSec = 30;
let marketAutoSyncActive = true;
let marketPollIntervalTimer = null;
let marketEventSource = null;
let lastKnownTotalJobs = null;
let lastKnownCompanies = null;

async function renderMarketScraperOverview(forceReload = false, providedData = null) {
  const panel = document.getElementById('market-scraper-overview-panel');
  if (!panel) return;

  // Tự động khởi tạo kết nối SSE / Polling nếu chưa chạy
  if (!marketLiveSyncInitialized) {
    initMarketOverviewLiveSync();
  }

  try {
    if (providedData) {
      cachedMarketOverviewData = providedData;
    } else if (!cachedMarketOverviewData || forceReload) {
      const res = await fetch('/api/scraped/market-overview');
      const result = await res.json();
      if (result.success && result.data) {
        cachedMarketOverviewData = result.data;
      }
    }

    const data = cachedMarketOverviewData;
    if (!data) return;

    const currentJobs = data.total_jobs || 0;
    const currentCompanies = data.total_companies || 0;
    const hasJobIncrement = lastKnownTotalJobs !== null && currentJobs > lastKnownTotalJobs;
    
    // Ghi nhận số liệu mới
    lastKnownTotalJobs = currentJobs;
    lastKnownCompanies = currentCompanies;

    // 1. CẬP NHẬT 4 THẺ CHỈ SỐ KPI LỚN
    const elJobs = document.getElementById('market-stat-total-jobs');
    const elCompanies = document.getElementById('market-stat-total-companies');
    const elGold = document.getElementById('market-stat-gold-leads');
    const elSources = document.getElementById('market-stat-total-sources');
    const elUpdated = document.getElementById('market-overview-updated-badge');

    if (elJobs) {
      elJobs.textContent = currentJobs.toLocaleString('vi-VN');
      if (hasJobIncrement) {
        elJobs.classList.remove('stat-updated-glow');
        void elJobs.offsetWidth; // trigger reflow
        elJobs.classList.add('stat-updated-glow');
      }
    }

    if (elCompanies) {
      elCompanies.textContent = currentCompanies.toLocaleString('vi-VN');
      if (hasJobIncrement) {
        elCompanies.classList.remove('stat-updated-glow');
        void elCompanies.offsetWidth;
        elCompanies.classList.add('stat-updated-glow');
      }
    }

    if (elGold) {
      const goldCnt = data.facebook_leads?.gold_leads || (data.sources?.find(s => s.id === 'facebook_group')?.count || 2);
      elGold.textContent = `${goldCnt} Lead Vàng`;
    }
    if (elSources) elSources.textContent = `${data.total_sources || 6} Nền Tảng`;

    if (elUpdated && data.updated_at) {
      const d = new Date(data.updated_at);
      const timeStr = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
      elUpdated.innerHTML = `<i class="fa-solid fa-clock"></i> Cập nhật: ${timeStr}`;
    }

    // 2. VẼ BIỂU ĐỒ 1: THỊ PHẦN DỮ LIỆU CÀO THEO WEBSITE (DOUGHNUT)
    if (typeof Chart !== 'undefined') {
      const srcCanvas = document.getElementById('market-sources-chart');
      if (srcCanvas) {
        const sources = data.sources || [];
        const labels = sources.map(s => s.name);
        const counts = sources.map(s => s.count);
        const colors = sources.map(s => s.color || '#3b82f6');

        if (marketScraperChartInstances.sources) {
          marketScraperChartInstances.sources.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        marketScraperChartInstances.sources = new Chart(srcCanvas, {
          type: 'doughnut',
          data: {
            labels,
            datasets: [{
              data: counts,
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: isDark ? '#1e293b' : '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '62%',
            plugins: {
              legend: {
                position: 'right',
                labels: {
                  color: isDark ? '#cbd5e1' : '#334155',
                  font: { size: 11, weight: '600' },
                  boxWidth: 12,
                  padding: 8
                }
              },
              tooltip: {
                callbacks: {
                  label: function(ctx) {
                    const val = ctx.raw || 0;
                    const total = data.total_jobs || 1;
                    const pct = Math.round((val / total) * 100);
                    return ` ${ctx.label}: ${val.toLocaleString('vi-VN')} việc làm (${pct}%)`;
                  }
                }
              }
            }
          }
        });
      }

      // 3. VẼ BIỂU ĐỒ 2: TOP TỈNH THÀNH TUYỂN DỤNG (BAR CHART)
      const provCanvas = document.getElementById('market-provinces-chart');
      if (provCanvas) {
        const provinces = (data.provinces || []).slice(0, 6);
        const pLabels = provinces.map(p => p.name);
        const pCounts = provinces.map(p => p.count);

        if (marketScraperChartInstances.provinces) {
          marketScraperChartInstances.provinces.destroy();
        }

        const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
        marketScraperChartInstances.provinces = new Chart(provCanvas, {
          type: 'bar',
          data: {
            labels: pLabels,
            datasets: [{
              label: 'Số việc làm',
              data: pCounts,
              backgroundColor: [
                'rgba(0, 177, 79, 0.85)',
                'rgba(24, 119, 242, 0.85)',
                'rgba(245, 158, 11, 0.85)',
                'rgba(139, 92, 246, 0.85)',
                'rgba(6, 182, 212, 0.85)',
                'rgba(239, 68, 68, 0.85)'
              ],
              borderRadius: 6
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: function(ctx) {
                    return ` Tuyển dụng: ${ctx.raw.toLocaleString('vi-VN')} việc làm`;
                  }
                }
              }
            },
            scales: {
              x: {
                ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 11 } },
                grid: { display: false }
              },
              y: {
                ticks: { color: isDark ? '#94a3b8' : '#64748b', font: { size: 10 } },
                grid: { color: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)' }
              }
            }
          }
        });
      }
    }

    // 4. HIỂN THỊ BẢNG MA TRẬN TỪNG NGUỒN CÀO (SOURCES MATRIX TABLE)
    const tbody = document.getElementById('market-sources-table-body');
    if (tbody) {
      const sources = data.sources || [];
      const totalJobs = data.total_jobs || 1;

      tbody.innerHTML = sources.map((s, idx) => {
        const pct = Math.round((s.count / totalJobs) * 100);
        const isFb = s.id === 'facebook_group';

        return `
          <tr>
            <td><strong>#${idx + 1}</strong></td>
            <td>
              <div style="display: flex; align-items: center; gap: 8px;">
                <span style="display: inline-flex; width: 28px; height: 28px; border-radius: 6px; background: ${s.color}20; color: ${s.color}; align-items: center; justify-content: center; font-size: 0.95rem;">
                  <i class="${s.icon || 'fa-solid fa-globe'}"></i>
                </span>
                <div>
                  <strong style="color: var(--text-main); font-size: 0.9rem;">${escapeHtml(s.name)}</strong>
                  <div style="font-size: 0.72rem; color: var(--text-muted);">${isFb ? 'Quét realtime nhóm FB' : 'Cào tự động & lưu DB'}</div>
                </div>
              </div>
            </td>
            <td>
              <strong style="font-size: 0.92rem; color: ${s.color};">${s.count.toLocaleString('vi-VN')}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">tin</span>
            </td>
            <td>
              <strong style="color: var(--text-main);">${(s.companies_count || 0).toLocaleString('vi-VN')}</strong> <span style="font-size: 0.75rem; color: var(--text-muted);">công ty/quán</span>
            </td>
            <td>
              <div style="display: flex; align-items: center; gap: 6px;">
                <div style="flex: 1; max-width: 60px; height: 6px; background: var(--bg-input); border-radius: 3px; overflow: hidden;">
                  <div style="width: ${pct}%; height: 100%; background: ${s.color};"></div>
                </div>
                <span style="font-weight: 700; font-size: 0.8rem; color: var(--text-main);">${pct}%</span>
              </div>
            </td>
            <td>
              <span style="font-size: 0.78rem; color: var(--text-muted);">${escapeHtml(s.latest_time || 'Mới cập nhật')}</span>
            </td>
            <td>
              <span class="badge-pill ${isFb ? 'warning' : 'success'}" style="font-size: 0.74rem;">
                <i class="fa-solid fa-circle-check"></i> ${escapeHtml(s.status || 'Hoạt động')}
              </span>
            </td>
            <td style="text-align: center;" class="nowrap">
              <button class="btn btn-sm ${isFb ? 'btn-primary' : 'btn-secondary'}" onclick="openSourceDetailModal('${s.id}')" style="padding: 4px 10px; font-size: 0.76rem; border-radius: var(--radius-sm); font-weight: 600;" title="Xem chi tiết danh sách tin cào từ ${escapeHtml(s.name)}">
                <i class="${isFb ? 'fa-solid fa-crown text-warning' : 'fa-solid fa-arrow-up-right-from-square'}"></i> Chi Tiết
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }

  } catch (err) {
    console.warn('Lỗi render báo cáo tổng quan cào:', err);
  }
}

// KHỞI TẠO HỆ THỐNG TỰ ĐỘNG ĐỒNG BỘ LIÊN TỤC (SSE + POLLING FALLBACK)
function initMarketOverviewLiveSync() {
  if (marketLiveSyncInitialized) return;
  marketLiveSyncInitialized = true;

  // Đọc thiết lập đã lưu
  const savedAutoSync = localStorage.getItem('leadx_market_auto_sync');
  marketAutoSyncActive = savedAutoSync !== 'false';

  const savedInterval = localStorage.getItem('leadx_market_sync_interval');
  if (savedInterval) {
    marketSyncIntervalSec = parseInt(savedInterval, 10) || 30;
    const intervalSelect = document.getElementById('market-sync-interval-select');
    if (intervalSelect) intervalSelect.value = String(marketSyncIntervalSec);
  }

  updateMarketAutoSyncUI();

  // 1. Kết nối SSE (Server-Sent Events) Stream
  setupMarketEventSource();

  // 2. Chạy Polling định kỳ fallback (mỗi marketSyncIntervalSec giây)
  startMarketPollingLoop();
}

function setupMarketEventSource() {
  if (marketEventSource) {
    try { marketEventSource.close(); } catch (e) {}
    marketEventSource = null;
  }

  if (typeof EventSource === 'undefined') return;

  try {
    marketEventSource = new EventSource('/api/scraped/live-stream');

    marketEventSource.addEventListener('init', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.overview) {
          renderMarketScraperOverview(false, payload.overview);
        }
      } catch (err) {}
    });

    marketEventSource.addEventListener('stats_updated', (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.overview) {
          renderMarketScraperOverview(false, payload.overview);
          if (payload.diff && payload.diff.added > 0) {
            showToast('Dữ liệu cào mới!', `Hệ thống vừa nạp thêm +${payload.diff.added.toLocaleString('vi-VN')} việc làm mới từ tiến trình cào!`, 'success', 4000);
          }
        }
      } catch (err) {}
    });

    marketEventSource.addEventListener('sync_status', (e) => {
      try {
        const payload = JSON.parse(e.data);
        const icon = document.getElementById('icon-refresh-market');
        if (payload.isSyncing) {
          if (icon) icon.classList.add('fa-spin');
        } else {
          if (icon) icon.classList.remove('fa-spin');
          if (payload.overview) {
            renderMarketScraperOverview(false, payload.overview);
          }
        }
      } catch (err) {}
    });

    marketEventSource.onerror = () => {
      // Tự kết nối lại sau 10s nếu đứt kết nối
      setTimeout(() => {
        if (marketAutoSyncActive) setupMarketEventSource();
      }, 10000);
    };
  } catch (err) {
    console.warn('[LiveSync] Không thể tạo SSE stream:', err);
  }
}

function startMarketPollingLoop() {
  if (marketPollIntervalTimer) {
    clearInterval(marketPollIntervalTimer);
  }

  marketPollIntervalTimer = setInterval(async () => {
    if (!marketAutoSyncActive) return;

    try {
      const res = await fetch('/api/scraped/market-overview');
      const result = await res.json();
      if (result.success && result.data) {
        // Chỉ re-render nếu tổng số việc làm hoặc timestamp thay đổi
        if (!cachedMarketOverviewData || 
            cachedMarketOverviewData.total_jobs !== result.data.total_jobs ||
            cachedMarketOverviewData.updated_at !== result.data.updated_at) {
          renderMarketScraperOverview(false, result.data);
        }
      }
    } catch (e) {}
  }, marketSyncIntervalSec * 1000);
}

function toggleMarketAutoSync() {
  marketAutoSyncActive = !marketAutoSyncActive;
  localStorage.setItem('leadx_market_auto_sync', marketAutoSyncActive ? 'true' : 'false');
  
  updateMarketAutoSyncUI();

  // Báo cho backend
  fetch('/api/scraped/auto-sync-toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: marketAutoSyncActive, intervalSeconds: marketSyncIntervalSec })
  }).catch(() => {});

  if (marketAutoSyncActive) {
    showToast('Tự Động Đồng Bộ: BẬT', `Hệ thống sẽ liên tục làm mới dữ liệu cào mỗi ${marketSyncIntervalSec} giây.`, 'success', 3000);
    setupMarketEventSource();
    startMarketPollingLoop();
    renderMarketScraperOverview(true);
  } else {
    showToast('Tự Động Đồng Bộ: TẠM DỪNG', 'Đã tắt cập nhật ngầm. Bạn có thể bấm Cập Nhật Báo Cáo khi cần.', 'warning', 3000);
    if (marketPollIntervalTimer) clearInterval(marketPollIntervalTimer);
  }
}

function changeMarketAutoSyncInterval(seconds) {
  marketSyncIntervalSec = parseInt(seconds, 10) || 30;
  localStorage.setItem('leadx_market_sync_interval', String(marketSyncIntervalSec));
  
  updateMarketAutoSyncUI();
  startMarketPollingLoop();

  // Báo cho backend
  fetch('/api/scraped/auto-sync-toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled: marketAutoSyncActive, intervalSeconds: marketSyncIntervalSec })
  }).catch(() => {});

  showToast('Chu kỳ đồng bộ', `Đã đổi chu kỳ tự động cập nhật sang mỗi ${marketSyncIntervalSec} giây.`, 'info', 2500);
}

function updateMarketAutoSyncUI() {
  const pill = document.getElementById('market-live-sync-indicator');
  const label = document.getElementById('market-live-sync-label');
  const dot = document.getElementById('market-live-sync-dot');

  if (!pill || !label) return;

  if (marketAutoSyncActive) {
    pill.classList.remove('disabled');
    label.textContent = `Đồng bộ liên tục: BẬT (${marketSyncIntervalSec}s)`;
    if (dot) dot.style.display = 'inline-block';
  } else {
    pill.classList.add('disabled');
    label.textContent = 'Đồng bộ: TẠM DỪNG';
    if (dot) dot.style.display = 'none';
  }
}

async function refreshMarketOverviewReport(showNotification = true) {
  const btn = document.getElementById('btn-refresh-market-overview');
  const icon = document.getElementById('icon-refresh-market');

  if (btn) btn.disabled = true;
  if (icon) icon.classList.add('fa-spin');

  if (showNotification) {
    showToast('Đang quét dữ liệu mới', 'Hệ thống đang truy vấn SQL Server và kiểm tra các file Excel cào...', 'info', 3000);
  }

  try {
    const res = await fetch('/api/scraped/refresh-market-overview', { method: 'POST' });
    const result = await res.json();
    if (result.success && result.data) {
      cachedMarketOverviewData = result.data;
      await renderMarketScraperOverview(true, result.data);
      if (showNotification) {
        const addedMsg = result.diff && result.diff > 0 
          ? ` (+${result.diff.toLocaleString('vi-VN')} việc làm mới!)` 
          : '';
        showToast('Cập nhật thành công', `Báo cáo dữ liệu cào đã được làm mới thành công${addedMsg}`, 'success', 4000);
      }
    } else {
      await renderMarketScraperOverview(true);
      if (showNotification) {
        showToast('Cập nhật thành công', 'Báo cáo tổng quan dữ liệu cào đã được làm mới thành công!', 'success', 3000);
      }
    }
  } catch (err) {
    showToast('Lỗi cập nhật', err.message, 'danger', 4000);
  } finally {
    if (btn) btn.disabled = false;
    if (icon) icon.classList.remove('fa-spin');
  }
}








// =========================================================
// QUẢN LÝ MODAL CHI TIẾT NGUỒN CÀO TUYỂN DỤNG (TOPCV, JOBSGO, ETC.)
// =========================================================
let currentSourceDetailJobs = [];

async function openSourceDetailModal(sourceId = 'topcv') {
  const modal = document.getElementById('source-detail-modal');
  if (!modal) return;
  modal.classList.add('active');

  const titleEl = document.getElementById('source-detail-title');
  const iconEl = document.getElementById('source-detail-icon');
  const subtitleEl = document.getElementById('source-detail-subtitle');
  const statTotal = document.getElementById('source-stat-total');
  const statCompanies = document.getElementById('source-stat-companies');
  const statRatio = document.getElementById('source-stat-ratio');
  const statUpdated = document.getElementById('source-stat-updated');
  const tbody = document.getElementById('source-detail-table-body');
  const searchInput = document.getElementById('source-detail-search');
  const footerInfo = document.getElementById('source-detail-footer-info');

  if (searchInput) searchInput.value = '';
  if (tbody) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Đang trích xuất dữ liệu việc làm từ nguồn...</td></tr>';
  }

  try {
    const res = await fetch(`/api/scraped/source-detail?source=${encodeURIComponent(sourceId)}`);
    const result = await res.json();
    if (!result.success || !result.data) {
      if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Không thể tải dữ liệu: ${result.message || 'Lỗi không xác định'}</td></tr>`;
      return;
    }

    const data = result.data;
    if (titleEl) titleEl.textContent = `Chi Tiết Nguồn Cào Tuyển Dụng: ${data.name}`;
    if (subtitleEl) subtitleEl.textContent = `Kho dữ liệu ${data.name} đồng bộ từ SQL Server (job_market) & Excel`;
    if (iconEl) {
      iconEl.style.color = data.color || 'var(--primary)';
      iconEl.style.background = `${data.color || '#3b82f6'}20`;
      iconEl.innerHTML = `<i class="${data.icon || 'fa-solid fa-database'}"></i>`;
    }

    if (statTotal) {
      statTotal.textContent = (data.count || 0).toLocaleString('vi-VN');
      statTotal.style.color = data.color || 'var(--primary)';
    }
    if (statCompanies) statCompanies.textContent = (data.companies_count || 0).toLocaleString('vi-VN');
    if (statRatio) statRatio.textContent = `${data.ratio || 0}%`;
    if (statUpdated) statUpdated.textContent = data.latest_time || 'Mới cập nhật';
    if (footerInfo) footerInfo.textContent = data.file ? `scraper_data/${data.file}` : 'scraper_data (SQL Server)';

    currentSourceDetailJobs = data.jobs || [];
    renderSourceDetailTable(currentSourceDetailJobs);

  } catch (err) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-danger"><i class="fa-solid fa-triangle-exclamation"></i> Lỗi kết nối: ${err.message}</td></tr>`;
  }
}

function closeSourceDetailModal() {
  const modal = document.getElementById('source-detail-modal');
  if (modal) modal.classList.remove('active');
}

function renderSourceDetailTable(jobs) {
  const tbody = document.getElementById('source-detail-table-body');
  const countBadge = document.getElementById('source-jobs-count-badge');
  if (!tbody) return;

  if (countBadge) {
    countBadge.innerHTML = `<i class="fa-solid fa-list-check"></i> Hiển thị ${jobs.length} việc làm`;
  }

  if (jobs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-4" style="color: var(--text-dim);">Không tìm thấy tin tuyển dụng nào phù hợp.</td></tr>';
    return;
  }

  tbody.innerHTML = jobs.map((job, idx) => {
    const linkBtn = job.url ? `
      <a href="${escapeHtml(job.url)}" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-secondary" style="padding: 3px 7px; font-size: 0.72rem; text-decoration: none;" title="Mở bài đăng gốc trên website">
        <i class="fa-solid fa-arrow-up-right-from-square"></i> Xem Gốc
      </a>
    ` : `<span style="font-size: 0.72rem; color: var(--text-dim);">--</span>`;

    const jobDataEsc = encodeURIComponent(JSON.stringify({
      title: job.title || '',
      company: job.company || '',
      location: job.location || '',
      salary: job.salary || ''
    }));

    const useJobBtn = `
      <button class="btn btn-sm btn-primary" onclick="useJobForCampaign('${jobDataEsc}')" style="padding: 3px 8px; font-size: 0.72rem;" title="Dùng tin này để soạn đăng Facebook">
        <i class="fa-solid fa-paper-plane"></i> Đăng
      </button>
    `;

    return `
      <tr>
        <td class="text-center nowrap"><strong>#${idx + 1}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-main); font-size: 0.8rem; line-height: 1.35; margin-bottom: 2px;">
            ${escapeHtml(job.title)}
          </div>
          ${job.industry ? `<div style="font-size: 0.72rem; color: var(--text-muted);">${escapeHtml(job.industry)}</div>` : ''}
        </td>
        <td>
          <div style="font-size: 0.8rem; line-height: 1.35; color: var(--text-main);">${escapeHtml(job.company || 'Chưa cập nhật')}</div>
        </td>
        <td class="nowrap">
          <div class="location-compact">
            <i class="fa-solid fa-location-dot"></i>
            <span>${escapeHtml(job.location || 'Toàn quốc')}</span>
          </div>
        </td>
        <td>
          <strong style="color: var(--success); font-size: 0.78rem; line-height: 1.35; display: block;">${escapeHtml(job.salary || 'Thỏa thuận')}</strong>
        </td>
        <td class="nowrap text-center">
          <div style="display: flex; gap: 4px; justify-content: center; align-items: center;">
            ${linkBtn}
            ${useJobBtn}
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function filterSourceDetailJobs() {
  const q = (document.getElementById('source-detail-search')?.value || '').toLowerCase().trim();
  if (!q) {
    renderSourceDetailTable(currentSourceDetailJobs);
    return;
  }
  const filtered = currentSourceDetailJobs.filter(j => 
    (j.title && j.title.toLowerCase().includes(q)) ||
    (j.company && j.company.toLowerCase().includes(q)) ||
    (j.location && j.location.toLowerCase().includes(q)) ||
    (j.salary && j.salary.toLowerCase().includes(q))
  );
  renderSourceDetailTable(filtered);
}

function useJobForCampaign(jobJsonStr) {
  try {
    const job = JSON.parse(decodeURIComponent(jobJsonStr));
    closeSourceDetailModal();
    if (typeof switchTab === 'function') switchTab('controller-tab');

    const titleInput = document.getElementById('post-title');
    const contentTextarea = document.getElementById('post-content');
    if (titleInput) {
      titleInput.value = `[TUYỂN DỤNG] ${job.title} - ${job.company}`;
    }
    if (contentTextarea) {
      contentTextarea.value = `🔥 [TUYỂN DỤNG] ${job.title}\n🏢 Doanh nghiệp: ${job.company}\n📍 Địa điểm: ${job.location}\n💰 Mức thu nhập: ${job.salary}\n\n👉 Ứng tuyển ngay bằng cách Inbox trực tiếp hoặc để lại bình luận bên dưới!`;
    }
    if (typeof showToast === 'function') {
      showToast('Đã chọn tin tuyển dụng', `Đã nạp tin "${job.title}" vào bảng Điều khiển đăng bài!`, 'success', 3500);
    }
  } catch (e) {
    console.error('Error using job:', e);
  }
}


// =========================================================
// THÊM VIỆC LÀM MỚI VÀ ĐỒNG BỘ 2 CHIỀU VỚI GOOGLE SHEETS
// =========================================================

// =========================================================
// BỘ TỰ ĐỘNG BÓC TÁCH & PHÂN CHIA CỘT THÔNG MINH TỪ TIN TUYỂN DỤNG THÔ
// =========================================================
function parseRawJobText(text) {
  if (!text || typeof text !== 'string') return {};

  const clean = text.trim();
  const lines = clean.split('\n').map(l => l.trim()).filter(Boolean);

  const result = {
    title: '',
    company: '',
    province: 'Toàn Quốc',
    salary: 'Thỏa thuận',
    workingTime: '',
    deadline: 'Tuyển liên tục / Nhận việc ngay',
    industry: 'Lao Động / Việc Làm Chung',
    detailedLocation: '',
    description: '',
    requirements: '',
    benefits: '',
    contact: ''
  };

  // 1. TỈNH THÀNH (PROVINCE) - Đầy đủ 63 Tỉnh Thành Việt Nam & Quận/Huyện/KCN
  const PROVINCE_MAP = [
    { key: 'TP. Hồ Chí Minh', keywords: ['hồ chí minh', 'tp.hcm', 'tphcm', 'tp hcm', 'tp. hcm', 'sài gòn', 'saigon', 'bình thạnh', 'thủ đức', 'tân bình', 'gò vấp', 'quận 1', 'quận 2', 'quận 3', 'quận 4', 'quận 5', 'quận 6', 'quận 7', 'quận 8', 'quận 9', 'quận 10', 'quận 11', 'quận 12', 'bình tân', 'phú nhuận', 'tân phú', 'hóc môn', 'củ chi', 'nhà bè', 'bình chánh', 'kcx tân thuận'] },
    { key: 'Hà Nội', keywords: ['hà nội', 'ha noi', 'hn', 'cầu giấy', 'đống đa', 'ba đình', 'hoàn kiếm', 'thanh xuân', 'nam từ liêm', 'bắc từ liêm', 'long biên', 'hà đông', 'hoàng mai', 'hai bà trưng', 'tây hồ', 'gia lâm', 'hoài đức', 'thanh trì', 'sóc sơn', 'đông anh'] },
    { key: 'Bình Dương', keywords: ['bình dương', 'binh duong', 'thủ dầu một', 'thuận an', 'dĩ an', 'bến cát', 'tân uyên', 'kcn vsip', 'kcn sóng thần', 'sóng thần', 'bàu bàng'] },
    { key: 'Đồng Nai', keywords: ['đồng nai', 'dong nai', 'biên hòa', 'long thành', 'nhơn trạch', 'trảng bom', 'vĩnh cửu', 'kcn amata', 'long khánh'] },
    { key: 'Đà Nẵng', keywords: ['đà nẵng', 'da nang', 'hải châu', 'thanh khê', 'sơn trà', 'ngũ hành sơn', 'liên chiểu', 'cẩm lệ', 'hòa vang'] },
    { key: 'Hải Phòng', keywords: ['hải phòng', 'hai phong', 'ngô quyền', 'lê chân', 'hồng bàng', 'an dương', 'thủy nguyên', 'kiến an', 'đồ sơn'] },
    { key: 'Cần Thơ', keywords: ['cần thơ', 'can tho', 'ninh kiều', 'bình thủy', 'cái răng', 'ô môn', 'thốt nốt'] },
    { key: 'Bà Rịa - Vũng Tàu', keywords: ['bà rịa', 'vũng tàu', 'vung tau', 'phú mỹ', 'tân thành', 'long điền', 'đất đỏ'] },
    { key: 'Bắc Ninh', keywords: ['bắc ninh', 'bac ninh', 'từ sơn', 'yên phong', 'quế võ', 'tiên du', 'thuận thành'] },
    { key: 'Bắc Giang', keywords: ['bắc giang', 'bac giang', 'việt yên', 'hiệp hòa', 'lạng giang'] },
    { key: 'Long An', keywords: ['long an', 'tân an', 'bến lức', 'đức hòa', 'cần giuộc', 'cần đước'] },
    { key: 'Quảng Ninh', keywords: ['quảng ninh', 'hạ long', 'cẩm phả', 'uông bí', 'móng cái', 'đông triều'] },
    { key: 'Hải Dương', keywords: ['hải dương', 'hai duong', 'chí linh', 'kinh môn', 'cẩm giàng'] },
    { key: 'Hưng Yên', keywords: ['hưng yên', 'hung yen', 'mỹ hào', 'văn giang', 'yên mỹ'] },
    { key: 'Thái Nguyên', keywords: ['thái nguyên', 'thai nguyen', 'sông công', 'phổ yên'] },
    { key: 'Vĩnh Phúc', keywords: ['vĩnh phúc', 'vinh phuc', 'vĩnh yên', 'phúc yên', 'bình xuyên'] },
    { key: 'Khánh Hòa', keywords: ['khánh hòa', 'nha trang', 'cam ranh', 'ninh hòa', 'diên khánh'] },
    { key: 'Lâm Đồng', keywords: ['lâm đồng', 'đà lạt', 'bảo lộc', 'da lat', 'đức trọng'] },
    { key: 'Thanh Hóa', keywords: ['thanh hóa', 'thanh hoa', 'sầm sơn', 'bỉm sơn', 'nghi sơn'] },
    { key: 'Nghệ An', keywords: ['nghệ an', 'nghe an', 'vinh', 'cửa lò', 'diễn châu'] },
    { key: 'Hà Tĩnh', keywords: ['hà tĩnh', 'ha tinh', 'kỳ anh', 'hồng lĩnh'] },
    { key: 'Thừa Thiên Huế', keywords: ['thừa thiên huế', 'huế', 'thua thien hue', 'hương thủy', 'hương trà'] },
    { key: 'Quảng Nam', keywords: ['quảng nam', 'hội an', 'tam kỳ', 'điện bàn'] },
    { key: 'Quảng Ngãi', keywords: ['quảng ngãi', 'quang ngai', 'dung quất'] },
    { key: 'Bình Định', keywords: ['bình định', 'binh dinh', 'quy nhơn', 'an nhơn'] },
    { key: 'Phú Yên', keywords: ['phú yên', 'tuy hòa', 'sông cầu'] },
    { key: 'Ninh Thuận', keywords: ['ninh thuận', 'phan rang', 'tháp chàm'] },
    { key: 'Bình Thuận', keywords: ['bình thuận', 'phan thiết', 'la gi'] },
    { key: 'Đắk Lắk', keywords: ['đắk lắk', 'dak lak', 'buôn ma thuột', 'bmt'] },
    { key: 'Gia Lai', keywords: ['gia lai', 'pleiku', 'an khê'] },
    { key: 'Đắk Nông', keywords: ['đắk nông', 'dak nong', 'gia nghĩa'] },
    { key: 'Kon Tum', keywords: ['kon tum', 'kontum'] },
    { key: 'Tây Ninh', keywords: ['tây ninh', 'trảng bàng', 'gò dầu', 'hòa thành'] },
    { key: 'Bình Phước', keywords: ['bình phước', 'đồng xoài', 'chơn thành', 'phước long'] },
    { key: 'Tiền Giang', keywords: ['tiền giang', 'mỹ tho', 'gò công', 'cai lậy'] },
    { key: 'Bến Tre', keywords: ['bến tre', 'ben tre', 'ba tri', 'châu thành'] },
    { key: 'Trà Vinh', keywords: ['trà vinh', 'tra vinh', 'duyên hải'] },
    { key: 'Vĩnh Long', keywords: ['vĩnh long', 'vinh long', 'bình minh'] },
    { key: 'Đồng Tháp', keywords: ['đồng tháp', 'cao lãnh', 'sa đéc', 'hồng ngự'] },
    { key: 'An Giang', keywords: ['an giang', 'long xuyên', 'châu đốc'] },
    { key: 'Kiên Giang', keywords: ['kiên giang', 'rạch giá', 'phú quốc', 'hà tiên'] },
    { key: 'Hậu Giang', keywords: ['hậu giang', 'vị thanh', 'ngã bảy'] },
    { key: 'Sóc Trăng', keywords: ['sóc trăng', 'soc trang', 'ngã năm'] },
    { key: 'Bạc Liêu', keywords: ['bạc liêu', 'bac lieu', 'giá rai'] },
    { key: 'Cà Mau', keywords: ['cà mau', 'ca mau', 'năm căn'] },
    { key: 'Nam Định', keywords: ['nam định', 'nam dinh'] },
    { key: 'Thái Bình', keywords: ['thái bình', 'thai binh'] },
    { key: 'Ninh Bình', keywords: ['ninh bình', 'ninh binh', 'tam điệp'] },
    { key: 'Hà Nam', keywords: ['hà nam', 'phủ lý', 'duy tiên'] },
    { key: 'Phú Thọ', keywords: ['phú thọ', 'việt trì'] },
    { key: 'Hòa Bình', keywords: ['hòa bình', 'hoa binh', 'lương sơn'] },
    { key: 'Lạng Sơn', keywords: ['lạng sơn', 'lang son'] },
    { key: 'Lào Cai', keywords: ['lào cai', 'lao cai', 'sa pa', 'sapa'] },
    { key: 'Yên Bái', keywords: ['yên bái', 'yen bai'] },
    { key: 'Tuyên Quang', keywords: ['tuyên quang', 'tuyen quang'] },
    { key: 'Hà Giang', keywords: ['hà giang', 'ha giang'] },
    { key: 'Cao Bằng', keywords: ['cao bằng', 'cao bang'] },
    { key: 'Bắc Kạn', keywords: ['bắc kạn', 'bac kan'] },
    { key: 'Sơn La', keywords: ['sơn la', 'son la', 'mộc châu'] },
    { key: 'Điện Biên', keywords: ['điện biên', 'dien bien'] },
    { key: 'Lai Châu', keywords: ['lai châu', 'lai chau'] },
    { key: 'Quảng Bình', keywords: ['quảng bình', 'đồng hới'] },
    { key: 'Quảng Trị', keywords: ['quảng trị', 'đông hà'] }
  ];

  const lowerText = clean.toLowerCase();
  for (const prov of PROVINCE_MAP) {
    if (prov.keywords.some(kw => lowerText.includes(kw))) {
      result.province = prov.key;
      break;
    }
  }

  // 2. MỨC THU NHẬP / LƯƠNG
  const salaryRegex = /(?:mức lương|thu nhập|lương cứng|lương|thu nhập từ|lương từ)[:\s\-\.]*([^\n\r]+)/i;
  const salaryMatch = clean.match(salaryRegex);
  if (salaryMatch) {
    let s = salaryMatch[1].trim();
    s = s.replace(/[\(（].*?[\)）]/g, '').trim();
    if (s.length > 50) s = s.substring(0, 50);
    result.salary = s;
  } else {
    const rangeMatch = clean.match(/(\d+(?:[\.,]\d+)?\s*(?:[-–]|đến)\s*\d+(?:[\.,]\d+)?\s*(?:triệu|tr|trđ|k|vnđ|usd)(?:\s*\/\s*(?:tháng|ca|ngày|giờ|h))?)/i);
    if (rangeMatch) {
      result.salary = rangeMatch[1].trim();
    } else if (/thỏa thuận|thoa thuan|cạnh tranh/i.test(clean)) {
      result.salary = 'Thỏa thuận theo năng lực';
    }
  }

  // 3. DOANH NGHIỆP / CÔNG TY
  const compRegex = /(?:^|\n)\s*(?:[🔥⚡📢🌟🎯📋🎁📲📍💰🏢🔹\-\*\•\s]*)(công ty|doanh nghiệp|cty|đơn vị|tập đoàn|hệ thống|nhà hàng|quán|shop|store)(?:[:\s\-\.]+([^\n\r]+))?/i;
  const compMatch = clean.match(compRegex);
  if (compMatch) {
    let comp = '';
    if (compMatch[2] && compMatch[2].trim().length > 2) {
      const prefix = compMatch[1].trim();
      const rest = compMatch[2].trim();
      if (!new RegExp('^' + prefix, 'i').test(rest)) {
        comp = prefix.charAt(0).toUpperCase() + prefix.slice(1) + ' ' + rest;
      } else {
        comp = rest;
      }
    } else {
      comp = compMatch[0].trim();
    }
    comp = comp.replace(/^[🏢🏛️🏠🔹\-\*\•\s\[\]【】\(\)]+/, '').trim();
    comp = comp.replace(/\s*(?:tuyển dụng|cần tuyển|tuyển gấp)$/i, '').trim();
    if (comp.length > 80) comp = comp.substring(0, 80);
    result.company = comp;
  } else {
    const formalCompMatch = clean.match(/(?:công ty\s+(?:tnhh|cổ phần|cp|liên doanh|đầu tư)[\w\s\.\&]+)/i);
    if (formalCompMatch) {
      result.company = formalCompMatch[0].trim();
    } else {
      result.company = 'Doanh Nghiệp Tuyển Dụng';
    }
  }

  // 4. VỊ TRÍ / CHỨC DANH
  const explicitTitleRegex = /(?:^|\n)\s*(?:[🔥⚡📢🌟🎯📋🎁📲📍💰🏢🔹\-\*\•\s]*)(?:vị trí tuyển dụng|vị trí|chức danh)[:\s\-\.]+([^\n\r]+)/i;
  const explicitMatch = clean.match(explicitTitleRegex);

  if (explicitMatch && explicitMatch[1].trim().length > 2) {
    let t = explicitMatch[1].trim();
    t = t.replace(/^[🔥⚡📢🌟🎯📋🎁📲📍💰🏢🔹\-\*\•\s\[\]【】\(\)]+/, '').replace(/[🔥⚡📢🌟🎯📋🎁📲📍💰🏢\[\]【】\(\)]+$/, '').trim();
    if (t.length > 80) t = t.substring(0, 80);
    result.title = t;
  } else {
    let candidateTitle = '';
    for (let i = 0; i < Math.min(3, lines.length); i++) {
      let l = lines[i].trim();
      if (/^(chào|xin chào|thông báo|alo|chào mọi người|tuyển dụng:?$)/i.test(l)) continue;
      while (/^[\[【(][^\]】)]*[\]】)]\s*/.test(l)) {
        l = l.replace(/^[\[【(][^\]】)]*[\]】)]\s*/, '');
      }
      l = l.replace(/^[🔥⚡📢🌟🎯📋🎁📲📍💰🏢🔹\-\*\•\s\[\]【】\(\)]+/, '').replace(/[🔥⚡📢🌟🎯📋🎁📲📍💰🏢\[\]【】\(\)]+$/, '').trim();
      l = l.replace(/^(?:tuyển gấp|cần tuyển|tuyển dụng|tuyển)\s*[:\-]?\s*/i, '');
      if (l.length >= 4 && l.length <= 90) {
        candidateTitle = l;
        break;
      }
    }
    result.title = candidateTitle || 'Nhân Viên Tuyển Dụng Mới';
  }

  // 5. THỜI GIAN LÀM VIỆC
  const timeRegex = /(?:thời gian làm việc|thời gian|giờ làm việc|ca làm việc|ca làm|lịch làm)[:\s\-\.]*([^\n\r]+)/i;
  const timeMatch = clean.match(timeRegex);
  if (timeMatch) {
    result.workingTime = timeMatch[1].trim().replace(/^[⏰⌛🔹\-\*\•\s]+/, '');
  } else if (/hành chính/i.test(clean)) {
    result.workingTime = 'Giờ hành chính (Thứ 2 - Thứ 6 / Thứ 7)';
  } else if (/xoay ca|ca gãy/i.test(clean)) {
    result.workingTime = 'Xoay ca linh hoạt (Đăng ký lịch theo tuần)';
  }

  // 6. HẠN NỘP HỒ SƠ
  const deadlineRegex = /(?:hạn nộp hồ sơ|hạn nộp|hạn chót|nhận hồ sơ đến|thời hạn)[:\s\-\.]*([^\n\r]+)/i;
  const deadlineMatch = clean.match(deadlineRegex);
  if (deadlineMatch) {
    result.deadline = deadlineMatch[1].trim().replace(/^[📅🎯🔹\-\*\•\s]+/, '');
  }

  // 7. ĐỊA ĐIỂM CHI TIẾT
  const locRegex = /(?:địa điểm làm việc|địa chỉ làm việc|địa điểm|địa chỉ|nơi làm việc|làm việc tại|chi nhánh|văn phòng|trụ sở|đ\/c|đc)[:\s\-\.]*([^\n\r]+)/i;
  const locMatch = clean.match(locRegex);
  if (locMatch) {
    let loc = locMatch[1].trim().replace(/^[📍🏠🏢🔹\-\*\•\s]+/, '');
    if (loc.length > 120) loc = loc.substring(0, 120);
    result.detailedLocation = loc;
  } else {
    result.detailedLocation = result.province;
  }

  // 8. LIÊN HỆ / HOTLINE / ZALO
  const phones = clean.match(/((?:0[3|5|7|8|9]\d{8})|(?:1900\s*\d{4}))/g);
  const emails = clean.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
  const contactParts = [];
  if (phones && phones.length > 0) {
    contactParts.push('Hotline/Zalo: ' + Array.from(new Set(phones)).join(' - '));
  }
  if (emails && emails.length > 0) {
    contactParts.push('Email: ' + emails[0]);
  }
  if (contactParts.length > 0) {
    result.contact = contactParts.join(' | ');
  } else {
    const contactLine = clean.match(/(?:liên hệ|hotline|zalo|inbox|sđt|gọi)[:\s\-\.]*([^\n\r]+)/i);
    if (contactLine) result.contact = contactLine[1].trim();
  }

  // 9. NGÀNH NGHỀ / LĨNH VỰC
  const fullCheck = (result.title + ' ' + clean).toLowerCase();
  if (/bán hàng|sales|kinh doanh|telesales|tư vấn bán|chăm sóc khách|sale online/i.test(fullCheck)) {
    result.industry = 'Kinh Doanh / Bán Hàng';
  } else if (/kế toán|thu ngân|kiểm toán|thủ quỹ/i.test(fullCheck)) {
    result.industry = 'Kế Toán / Thu Ngân';
  } else if (/phục vụ|pha chế|barista|bếp|phụ bếp|tạp vụ|nhà hàng|quán ăn|f&b|trà sữa/i.test(fullCheck)) {
    result.industry = 'F&B / Nhà Hàng - Khách Sạn';
  } else if (/kho|phụ kho|soạn hàng|bốc xếp|giao hàng|shipper|tài xế|lái xe/i.test(fullCheck)) {
    result.industry = 'Kho Vận / Vận Tải';
  } else if (/công nhân|may mặc|đóng gói|lắp ráp|cơ khí|thợ hàn|sản xuất/i.test(fullCheck)) {
    result.industry = 'Lao Động Phổ Thông / Sản Xuất';
  } else if (/marketing|content|thiết kế|designer|seo|quảng cáo|media/i.test(fullCheck)) {
    result.industry = 'Marketing / Truyền Thông';
  } else if (/lập trình|it|developer|phần mềm|cntt/i.test(fullCheck)) {
    result.industry = 'Công Nghệ Thông Tin';
  } else if (/bảo vệ|an ninh|giữ xe/i.test(fullCheck)) {
    result.industry = 'Bảo Vệ / An Ninh';
  } else if (/nhân sự|tuyển dụng|hành chính|văn phòng|lễ tân/i.test(fullCheck)) {
    result.industry = 'Hành Chính / Nhân Sự';
  } else {
    result.industry = 'Lao Động / Ngành Nghề Khác';
  }

  // 10. MÔ TẢ CÔNG VIỆC, YÊU CẦU & QUYỀN LỢI (Theo Phân Khúc)
  function extractSection(startKeywords, stopKeywords) {
    const startPattern = new RegExp('(?:' + startKeywords.join('|') + ')[:\\s\\-\\.]*', 'i');
    const startMatch = clean.match(startPattern);
    if (!startMatch) return '';

    const startIdx = startMatch.index + startMatch[0].length;
    let endIdx = clean.length;

    for (const kw of stopKeywords) {
      const stopPattern = new RegExp('\\n\\s*(?:[🔥⚡📢🌟🎯📋🎁📲📍💰🏢🔹\\-\\*\\•\\s]*)?(?:' + kw + ')[:\\s\\-\\.]*', 'i');
      const sub = clean.substring(startIdx);
      const stopMatch = sub.match(stopPattern);
      if (stopMatch && stopMatch.index < endIdx) {
        endIdx = stopMatch.index;
      }
    }

    return clean.substring(startIdx, startIdx + endIdx).trim();
  }

  result.description = extractSection(
    ['mô tả công việc', 'nhiệm vụ', 'công việc phải làm', 'chi tiết công việc', 'mô tả'],
    ['yêu cầu', 'quyền lợi', 'phúc lợi', 'chế độ', 'liên hệ', 'hotline', 'địa chỉ', 'thời gian', 'đ\/c', 'đc']
  );

  result.requirements = extractSection(
    ['yêu cầu ứng viên', 'yêu cầu công việc', 'yêu cầu', 'tiêu chuẩn', 'tiêu chí', 'hồ sơ bao gồm'],
    ['quyền lợi', 'phúc lợi', 'chế độ', 'được hưởng', 'liên hệ', 'hotline', 'địa chỉ', 'đ\/c', 'đc', 'inbox', 'gọi']
  );

  result.benefits = extractSection(
    ['quyền lợi được hưởng', 'quyền lợi & phúc lợi', 'quyền lợi', 'phúc lợi', 'chế độ', 'được hưởng'],
    ['liên hệ', 'hotline', 'hồ sơ', 'cách thức ứng tuyển', 'địa chỉ', 'đ\/c', 'đc', 'inbox', 'gọi']
  );

  return result;
}

function parseRawJobPost() {
  const textarea = document.getElementById('raw-job-paste-textarea');
  const rawText = (textarea?.value || '').trim();
  const feedback = document.getElementById('parse-status-feedback');

  if (!rawText) {
    if (typeof showToast === 'function') {
      showToast('Chưa có nội dung', 'Vui lòng dán tin tuyển dụng vào ô trước khi bóc tách!', 'warning');
    }
    if (feedback) {
      feedback.style.display = 'flex';
      feedback.style.background = 'rgba(239, 68, 68, 0.1)';
      feedback.style.color = '#ef4444';
      feedback.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Vui lòng dán tin bài tuyển dụng vào ô phía trên!';
    }
    textarea?.focus();
    return;
  }

  const p = parseRawJobText(rawText);

  // Gán giá trị vào form
  const fieldMap = [
    { id: 'job-input-title', val: p.title },
    { id: 'job-input-company', val: p.company },
    { id: 'job-input-location', val: p.province },
    { id: 'job-input-salary', val: p.salary },
    { id: 'job-input-working-time', val: p.workingTime },
    { id: 'job-input-deadline', val: p.deadline },
    { id: 'job-input-industry', val: p.industry },
    { id: 'job-input-detailed-location', val: p.detailedLocation },
    { id: 'job-input-description', val: p.description },
    { id: 'job-input-requirements', val: p.requirements },
    { id: 'job-input-benefits', val: p.benefits },
    { id: 'job-input-contact', val: p.contact }
  ];

  let filledCount = 0;
  fieldMap.forEach(item => {
    const el = document.getElementById(item.id);
    if (el) {
      if (item.val) {
        el.value = item.val;
        filledCount++;
      }
      el.classList.remove('input-auto-filled');
      void el.offsetWidth; // Trigger reflow for animation
      el.classList.add('input-auto-filled');
      setTimeout(() => el.classList.remove('input-auto-filled'), 1500);
    }
  });

  if (feedback) {
    feedback.style.display = 'flex';
    feedback.style.background = 'rgba(16, 185, 129, 0.12)';
    feedback.style.color = '#10b981';
    feedback.innerHTML = `<i class="fa-solid fa-circle-check"></i> Đã tự động phân bổ thành công 12 cột thông tin (${filledCount} trường có dữ liệu)! Bạn có thể kiểm tra và chỉnh sửa trước khi Lưu.`;
  }

  if (typeof showToast === 'function') {
    showToast('Bóc tách thành công', `Đã tự động điền các cột: "${p.title || 'Vị trí'}" - "${p.company || 'Công ty'}"`, 'success', 3500);
  }
}

async function pasteFromClipboardToJobParser() {
  const textarea = document.getElementById('raw-job-paste-textarea');
  if (!textarea) return;

  try {
    if (navigator.clipboard && navigator.clipboard.readText) {
      const text = await navigator.clipboard.readText();
      if (text && text.trim().length > 0) {
        textarea.value = text;
        parseRawJobPost();
        return;
      }
    }
  } catch (e) {
    console.warn('Clipboard readText blocked or not permitted:', e);
  }

  textarea.focus();
  if (typeof showToast === 'function') {
    showToast('Dán nội dung', 'Vui lòng nhấn Ctrl + V (hoặc chuột phải -> Dán) vào ô để dán tin!', 'info', 3000);
  }
}

function clearRawJobParser() {
  const textarea = document.getElementById('raw-job-paste-textarea');
  if (textarea) textarea.value = '';
  const feedback = document.getElementById('parse-status-feedback');
  if (feedback) {
    feedback.style.display = 'none';
    feedback.innerHTML = '';
  }
}

function openAddJobModal() {
  const modal = document.getElementById('add-job-modal');
  if (!modal) return;
  const form = document.getElementById('add-job-form');
  if (form) form.reset();
  clearRawJobParser();
  modal.classList.add('active');

  const rawTextarea = document.getElementById('raw-job-paste-textarea');
  if (rawTextarea && !rawTextarea.dataset.listenerBound) {
    rawTextarea.dataset.listenerBound = 'true';
    rawTextarea.addEventListener('paste', () => {
      setTimeout(() => parseRawJobPost(), 60);
    });
  }

  setTimeout(() => {
    rawTextarea?.focus();
  }, 100);
}

function closeAddJobModal() {
  const modal = document.getElementById('add-job-modal');
  if (modal) modal.classList.remove('active');
}

async function submitNewJob(event) {
  if (event) event.preventDefault();

  const title = (document.getElementById('job-input-title')?.value || '').trim();
  const company = (document.getElementById('job-input-company')?.value || '').trim();
  const location = (document.getElementById('job-input-location')?.value || '').trim();
  const salary = (document.getElementById('job-input-salary')?.value || '').trim();
  const workingTime = (document.getElementById('job-input-working-time')?.value || '').trim();
  const deadline = (document.getElementById('job-input-deadline')?.value || '').trim();
  const industry = (document.getElementById('job-input-industry')?.value || '').trim();
  const detailedLocation = (document.getElementById('job-input-detailed-location')?.value || '').trim();
  const description = (document.getElementById('job-input-description')?.value || '').trim();
  const requirements = (document.getElementById('job-input-requirements')?.value || '').trim();
  const benefits = (document.getElementById('job-input-benefits')?.value || '').trim();
  const contactInfo = (document.getElementById('job-input-contact')?.value || '').trim();

  if (!title || !company) {
    showToast('Thiếu thông tin', 'Vui lòng nhập Vị trí tuyển dụng và Tên công ty!', 'warning');
    return;
  }

  const btn = document.getElementById('btn-save-job');
  const originalText = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang lưu & đồng bộ...';
  }

  try {
    const res = await fetch('/api/sheet/add-job', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        company,
        location,
        salary,
        workingTime,
        deadline,
        industry,
        detailedLocation,
        description,
        requirements,
        benefits,
        contactInfo
      })
    });

    const result = await res.json();
    if (result.success) {
      closeAddJobModal();
      showToast('Thành công', result.message || 'Đã thêm việc làm mới thành công!', 'success', 5000);
      appendTerminalLog(`[JOB CREATED] ${title} - ${company} (${result.syncedToSheet ? 'Đã đồng bộ Google Sheet' : 'Lưu tại App'})`, 'success');
      
      // Tải lại bảng để hiển thị ngay
      await loadGoogleSheets(true);
    } else {
      showToast('Lỗi', result.message || 'Không thể lưu việc làm!', 'error');
    }
  } catch (err) {
    showToast('Lỗi kết nối', err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalText;
    }
  }
}

async function openSheetConfigModal() {
  const modal = document.getElementById('sheet-modal');
  if (!modal) return;
  modal.classList.add('active');

  try {
    const res = await fetch('/api/sheet/config');
    const result = await res.json();
    if (result.success) {
      const urlInput = document.getElementById('modal-sheet-url');
      const webhookInput = document.getElementById('modal-sheet-webhook-url');
      if (urlInput) urlInput.value = result.sheetUrl || '';
      if (webhookInput) webhookInput.value = result.webhookUrl || '';
    }
  } catch (e) {}
}

async function saveSheetConfig() {
  const sheetUrl = (document.getElementById('modal-sheet-url')?.value || '').trim();
  const webhookUrl = (document.getElementById('modal-sheet-webhook-url')?.value || '').trim();

  if (!sheetUrl && !webhookUrl) {
    showToast('Thiếu thông tin', 'Vui lòng nhập link Google Sheet hoặc Webhook URL!', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/sheet/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetUrl, webhookUrl })
    });

    const result = await res.json();
    if (result.success) {
      closeSheetConfigModal();
      showToast('Cập nhật thành công', result.message || 'Đã lưu cấu hình Google Sheets!', 'success');
      loadGoogleSheets(true);
    } else {
      showToast('Lỗi', result.message || 'Không thể lưu cấu hình.', 'error');
    }
  } catch (err) {
    showToast('Lỗi', 'Không thể kết nối máy chủ: ' + err.message, 'error');
  }
}

function copyAppsScriptCode() {
  const code = `function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    sheet.appendRow([
      sheet.getLastRow(), // STT
      data.title || '',
      data.company || '',
      data.location || '',
      data.salary || '',
      data.workingTime || '',
      data.jobType || '',
      data.industry || '',
      data.description || '',
      data.requirements || '',
      data.benefits || '',
      data.deadline || '',
      data.contactInfo || '',
      data.detailedLocation || '',
      new Date().toLocaleString('vi-VN')
    ]);
    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: err.message })).setMimeType(ContentService.MimeType.JSON);
  }
}`;

  navigator.clipboard.writeText(code).then(() => {
    showToast('Đã sao chép mã Apps Script', 'Hãy dán vào Tiện ích mở rộng > Apps Script trên Google Sheets của bạn!', 'info', 4000);
  }).catch(() => {
    prompt('Sao chép mã kịch bản sau:', code);
  });
}


function viewFullInspectorPoster() {
  const img = document.getElementById('inspector-poster-img');
  if (img && img.src) {
    window.open(img.src, '_blank');
  }
}
window.viewFullInspectorPoster = viewFullInspectorPoster;

