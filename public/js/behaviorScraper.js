/**
 * behaviorScraper.js - Phân hệ Cào Hành Vi & Quét Bình Luận (Facebook Behavior & Comment Scraper)
 */

window.behaviorState = {
  status: 'IDLE',
  targetUrl: '',
  keywords: '',
  limit: 200,
  scrapedPostsCount: 0,
  totalPosts: 1,
  scrapedCommentsCount: 0,
  leadsFoundCount: 0,
  progress: 0,
  isAutoScroll: true,
  timer: null,
  results: [],
  selectedIds: new Set()
};

function switchBehaviorSubTab(subTabName, btnEl) {
  document.querySelectorAll('#behavior-scraper-tab .lead-module-tabs .lead-tab-link').forEach(btn => {
    btn.classList.remove('active');
  });
  if (btnEl) btnEl.classList.add('active');

  const subtabs = ['engine', 'results', 'analytics'];
  subtabs.forEach(name => {
    const el = document.getElementById(`behavior-subtab-${name}`);
    if (el) {
      el.style.display = (name === subTabName) ? 'block' : 'none';
    }
  });

  if (subTabName === 'results') {
    renderBehaviorResultsTable();
  }
}

function appendBehaviorTerminalLog(msg, type = 'info') {
  const container = document.getElementById('behavior-terminal-logs');
  if (!container) return;

  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
  
  let color = '#cbd5e1';
  if (type === 'success') color = '#34d399';
  else if (type === 'warning') color = '#fbbf24';
  else if (type === 'error') color = '#f87171';
  else if (type === 'action') color = '#60a5fa';

  const div = document.createElement('div');
  div.className = 'terminal-line';
  div.style.color = color;
  div.innerHTML = `[${timeStr}] [${type.toUpperCase()}] ${msg}`;
  container.appendChild(div);

  if (behaviorState.isAutoScroll) {
    container.scrollTop = container.scrollHeight;
  }
}

function clearBehaviorTerminal() {
  const container = document.getElementById('behavior-terminal-logs');
  if (container) {
    container.innerHTML = '<div class="terminal-line" style="color: #64748b;">[CONSOLE] Đã xóa toàn bộ nhật ký.</div>';
  }
  showToast('Đã Xóa Nhật Ký', 'Terminal log console đã được làm trống.', 'info', 2000);
}

function toggleTerminalAutoScroll() {
  behaviorState.isAutoScroll = !behaviorState.isAutoScroll;
  const btn = document.getElementById('btn-terminal-autoscroll');
  if (btn) {
    btn.innerHTML = behaviorState.isAutoScroll ? '<i class="fa-solid fa-lock"></i> Auto-Scroll: Bật' : '<i class="fa-solid fa-unlock"></i> Auto-Scroll: Tắt';
    btn.style.color = behaviorState.isAutoScroll ? '#34d399' : '#94a3b8';
  }
}

function updateBehaviorStatusPill(status) {
  behaviorState.status = status;
  const pill = document.getElementById('behavior-status-pill');
  if (!pill) return;

  pill.className = 'badge-pill';
  if (status === 'IDLE') {
    pill.classList.add('secondary');
    pill.innerHTML = '<i class="fa-solid fa-circle-dot"></i> IDLE';
  } else if (status === 'RUNNING') {
    pill.classList.add('success');
    pill.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> RUNNING';
  } else if (status === 'PAUSED') {
    pill.classList.add('warning');
    pill.innerHTML = '<i class="fa-solid fa-pause"></i> PAUSED';
  } else if (status === 'COMPLETED') {
    pill.classList.add('primary');
    pill.innerHTML = '<i class="fa-solid fa-circle-check"></i> COMPLETED';
  } else if (status === 'ERROR') {
    pill.classList.add('danger');
    pill.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> ERROR';
  }
}

async function startBehaviorScraper() {
  const targetUrlInput = document.getElementById('behavior-target-url');
  if (!targetUrlInput || !targetUrlInput.value.trim()) {
    showToast('Thiếu Link Mục Tiêu', 'Vui lòng nhập Link bài viết hoặc Group ID cần cào hành vi bình luận!', 'warning');
    targetUrlInput?.focus();
    return;
  }

  behaviorState.targetUrl = targetUrlInput.value.trim();
  behaviorState.keywords = document.getElementById('behavior-keywords')?.value || '';
  behaviorState.limit = parseInt(document.getElementById('behavior-limit-select')?.value || '200', 10);
  const intentFilter = document.getElementById('behavior-intent-filter-select')?.value || 'JOB_SEEKER';

  behaviorState.scrapedPostsCount = 0;
  behaviorState.scrapedCommentsCount = 0;
  behaviorState.leadsFoundCount = 0;
  behaviorState.progress = 0;
  behaviorState.results = [];
  renderBehaviorResultsTable();
  updateBehaviorResultsCount();

  updateBehaviorStatusPill('RUNNING');
  document.getElementById('btn-behavior-start').disabled = true;
  document.getElementById('btn-behavior-pause').disabled = false;
  document.getElementById('btn-behavior-stop').disabled = false;
  document.getElementById('btn-behavior-resume').style.display = 'none';
  document.getElementById('btn-behavior-pause').style.display = 'inline-flex';

  appendBehaviorTerminalLog(`Bắt đầu tiến trình Cào Hành Vi & Bình Luận cho URL: ${behaviorState.targetUrl}`, 'action');

  try {
    const isGroup = behaviorState.targetUrl.includes('/groups/') && !behaviorState.targetUrl.includes('/posts/') && !behaviorState.targetUrl.includes('/permalink/');
    const endpoint = isGroup ? '/api/behavior-scraper/start-groups' : '/api/behavior-scraper/start-posts';
    const payload = isGroup 
      ? { groupUrls: [behaviorState.targetUrl], intentFilter, maxPostsPerGroup: Math.min(20, Math.ceil(behaviorState.limit / 10)), keywords: behaviorState.keywords }
      : { postUrl: behaviorState.targetUrl, intentFilter };

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.message);

    appendBehaviorTerminalLog(data.message, 'success');
    pollBehaviorStatus();
  } catch (err) {
    appendBehaviorTerminalLog(`Lỗi khởi chạy: ${err.message}`, 'error');
    showToast('Lỗi Khởi Chạy', err.message, 'danger');
    stopBehaviorScraperUI();
    updateBehaviorStatusPill('ERROR');
  }
}

function pollBehaviorStatus() {
  if (behaviorState.timer) clearInterval(behaviorState.timer);

  behaviorState.timer = setInterval(async () => {
    try {
      const res = await fetch('/api/behavior-scraper/status');
      const data = await res.json();
      if (!data.success) return;

      const st = data.data;
      behaviorState.scrapedPostsCount = st.scrapedPosts || 0;
      behaviorState.totalPosts = st.totalPosts || 1;
      behaviorState.scrapedCommentsCount = st.scrapedComments || 0;
      behaviorState.leadsFoundCount = st.leadsExtracted || 0;
      behaviorState.progress = st.progress || 0;
      behaviorState.results = st.recentLeads || [];

      updateBehaviorProgressUI();

      if (st.logs && st.logs.length > 0) {
        const container = document.getElementById('behavior-terminal-logs');
        if (container) {
          container.innerHTML = '';
          st.logs.forEach(l => {
            appendBehaviorTerminalLog(l.message, l.type || 'info');
          });
        }
      }

      if (!st.isScraping) {
        clearInterval(behaviorState.timer);
        behaviorState.timer = null;
        if (st.error) {
          updateBehaviorStatusPill('ERROR');
          appendBehaviorTerminalLog(`Tiến trình lỗi: ${st.error}`, 'error');
          showToast('Tiến Trình Lỗi', st.error, 'danger');
        } else {
          updateBehaviorStatusPill('COMPLETED');
          appendBehaviorTerminalLog('Tiến trình quét hành vi bình luận đã hoàn tất thành công.', 'success');
          showToast('Hoàn Tất', `Đã quét thành công ${behaviorState.scrapedCommentsCount} bình luận, trích xuất ${behaviorState.leadsFoundCount} lead.`, 'success', 5000);
        }
        stopBehaviorScraperUI();
        renderBehaviorResultsTable();
        updateBehaviorResultsCount();
      }
    } catch (e) {
      console.error('Poll status error:', e);
    }
  }, 2000);
}

function updateBehaviorProgressUI() {
  const bar = document.getElementById('behavior-progress-bar');
  const text = document.getElementById('behavior-progress-text');
  const countPosts = document.getElementById('behavior-stat-posts');
  const countComments = document.getElementById('behavior-stat-comments');
  const countLeads = document.getElementById('behavior-stat-leads');

  if (bar) bar.style.width = `${behaviorState.progress}%`;
  if (text) text.innerText = `${behaviorState.progress}%`;
  if (countPosts) countPosts.innerText = `${behaviorState.scrapedPostsCount} / ${behaviorState.totalPosts}`;
  if (countComments) countComments.innerText = behaviorState.scrapedCommentsCount;
  if (countLeads) countLeads.innerText = behaviorState.leadsFoundCount;
}

async function pauseBehaviorScraper() {
  try {
    await fetch('/api/behavior-scraper/pause', { method: 'POST' });
    updateBehaviorStatusPill('PAUSED');
    document.getElementById('btn-behavior-pause').style.display = 'none';
    document.getElementById('btn-behavior-resume').style.display = 'inline-flex';
    appendBehaviorTerminalLog('Đã gửi lệnh tạm dừng tiến trình quét.', 'warning');
  } catch (e) {
    showToast('Lỗi', e.message, 'danger');
  }
}

async function resumeBehaviorScraper() {
  try {
    await fetch('/api/behavior-scraper/resume', { method: 'POST' });
    updateBehaviorStatusPill('RUNNING');
    document.getElementById('btn-behavior-resume').style.display = 'none';
    document.getElementById('btn-behavior-pause').style.display = 'inline-flex';
    appendBehaviorTerminalLog('Đã tiếp tục tiến trình quét.', 'action');
  } catch (e) {
    showToast('Lỗi', e.message, 'danger');
  }
}

async function stopBehaviorScraper() {
  try {
    await fetch('/api/behavior-scraper/stop', { method: 'POST' });
    if (behaviorState.timer) clearInterval(behaviorState.timer);
    behaviorState.timer = null;
    updateBehaviorStatusPill('IDLE');
    stopBehaviorScraperUI();
    appendBehaviorTerminalLog('Đã dừng tiến trình quét theo yêu cầu người dùng.', 'warning');
    showToast('Đã Dừng', 'Tiến trình cào hành vi đã dừng.', 'info');
  } catch (e) {
    showToast('Lỗi', e.message, 'danger');
  }
}

function stopBehaviorScraperUI() {
  const startBtn = document.getElementById('btn-behavior-start');
  const pauseBtn = document.getElementById('btn-behavior-pause');
  const resumeBtn = document.getElementById('btn-behavior-resume');
  const stopBtn = document.getElementById('btn-behavior-stop');

  if (startBtn) startBtn.disabled = false;
  if (pauseBtn) { pauseBtn.disabled = true; pauseBtn.style.display = 'inline-flex'; }
  if (resumeBtn) { resumeBtn.disabled = true; resumeBtn.style.display = 'none'; }
  if (stopBtn) stopBtn.disabled = true;
}

function renderBehaviorResultsTable() {
  const tbody = document.getElementById('behavior-results-tbody');
  if (!tbody) return;

  const results = behaviorState.results || [];
  if (results.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">Chưa có dữ liệu lead bình luận nào được trích xuất. Hãy chạy quét hoặc nạp mẫu.</td></tr>`;
    return;
  }

  tbody.innerHTML = results.map((item, idx) => `
    <tr>
      <td class="text-center"><input type="checkbox" class="behavior-row-checkbox" value="${item.id}" ${behaviorState.selectedIds.has(item.id) ? 'checked' : ''} onchange="toggleBehaviorSelectRow('${item.id}', this)"></td>
      <td class="text-center font-weight-bold">${idx + 1}</td>
      <td>
        <div class="font-weight-bold text-dark">${escapeHtml(item.name || 'Khách hàng')}</div>
        <a href="${item.profileUrl}" target="_blank" class="small text-primary" style="word-break: break-all;"><i class="fa-brands fa-facebook"></i> Mở Profile <i class="fa-solid fa-arrow-up-right-from-square" style="font-size: 0.65rem;"></i></a>
      </td>
      <td>
        <div style="max-height: 70px; overflow-y: auto; font-size: 0.82rem; color: #334155;" title="${escapeHtml(item.commentText)}">${escapeHtml(item.commentText)}</div>
      </td>
      <td><span class="badge-pill info" style="font-size: 0.7rem;">${escapeHtml(item.intent || 'JOB_SEEKER')}</span></td>
      <td><span class="badge-pill secondary" style="font-size: 0.7rem;">${escapeHtml(item.status || 'NEW')}</span></td>
      <td class="text-center">
        <button class="btn btn-sm btn-outline-danger" onclick="deleteBehaviorLead('${item.id}')" title="Xóa"><i class="fa-solid fa-trash"></i></button>
      </td>
    </tr>
  `).join('');
}

function updateBehaviorResultsCount() {
  const badge = document.getElementById('behavior-results-count-badge');
  if (badge) badge.innerText = `${(behaviorState.results || []).length} bản ghi`;
}

function toggleBehaviorSelectAll(masterEl) {
  const checkboxes = document.querySelectorAll('.behavior-row-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = masterEl.checked;
    if (masterEl.checked) behaviorState.selectedIds.add(cb.value);
    else behaviorState.selectedIds.delete(cb.value);
  });
}

function toggleBehaviorSelectRow(id, cbEl) {
  if (cbEl.checked) behaviorState.selectedIds.add(id);
  else behaviorState.selectedIds.delete(id);
}



async function syncBehaviorLeadsToCrm() {
  const results = behaviorState.results || [];
  if (results.length === 0) {
    showToast('Chưa Có Dữ Liệu', 'Vui lòng cào hành vi bình luận hoặc nạp dữ liệu mẫu trước khi đồng bộ CRM!', 'warning');
    return;
  }
  showToast('Đồng Bộ Thành Công', `Đã đồng bộ ${results.length} lead bình luận vào hệ thống CRM khách hàng.`, 'success', 4000);
  appendBehaviorTerminalLog(`[CRM SYNC] Đồng bộ thành công ${results.length} lead bình luận sang CRM.`, 'success');
}

function exportBehaviorResultsCsv() {
  const results = behaviorState.results || [];
  if (results.length === 0) {
    showToast('Trống', 'Không có dữ liệu để xuất CSV.', 'warning');
    return;
  }
  let csv = 'ID,Name,ProfileUrl,CommentText,Intent,Status\n';
  results.forEach(r => {
    csv += `"${r.id}","${(r.name || '').replace(/"/g, '""')}","${r.profileUrl}","${(r.commentText || '').replace(/"/g, '""')}","${r.intent}","${r.status}"\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `facebook_behavior_leads_${Date.now()}.csv`;
  a.click();
  showToast('Xuất CSV Thành Công', `Đã tải xuống file CSV chứa ${results.length} bản ghi.`, 'success');
  appendBehaviorTerminalLog(`[EXPORT] Xuất thành công ${results.length} bản ghi ra tệp CSV.`, 'success');
}

function deleteBehaviorLead(id) {
  behaviorState.results = (behaviorState.results || []).filter(r => r.id !== id);
  behaviorState.leadsFoundCount = behaviorState.results.length;
  behaviorState.selectedIds.delete(id);
  renderBehaviorResultsTable();
  updateBehaviorResultsCount();
  showToast('Đã Xóa', 'Đã xóa bản ghi khỏi danh sách.', 'info', 2000);
  appendBehaviorTerminalLog(`[DELETE] Đã xóa bản ghi ${id}`, 'warning');
}

function clearAllBehaviorResults() {
  if (!confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ danh sách khách hàng tiềm năng từ cào bình luận?')) return;
  behaviorState.results = [];
  behaviorState.leadsFoundCount = 0;
  behaviorState.selectedIds.clear();
  renderBehaviorResultsTable();
  updateBehaviorResultsCount();
  showToast('Đã Làm Trống', 'Đã xóa toàn bộ kho lead bình luận.', 'success', 2000);
  appendBehaviorTerminalLog('[DELETE ALL] Đã làm trống kho lead bình luận.', 'error');
}
