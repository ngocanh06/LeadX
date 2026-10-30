/**
 * automationCenter.js - Giao Diện Điều Khiển Automation, Chiến Dịch, Pipeline & Phân Bổ Doanh Thu
 * Chuẩn Enterprise B2B SaaS: Dữ liệu thật 100%, không neon, không fake metric.
 */

const AutomationCenter = {
  activePipelineIndustry: 'recruitment',
  queueFilter: { industry: 'ALL', status: 'ALL', search: '', page: 1 },
  autoRefreshInterval: null,

  init() {
    console.log('[AutomationCenter] Khởi tạo module Automation Platform');
  },

  // ==========================================
  // 1. UNIFIED CONTROL CENTER TAB
  // ==========================================
  async loadControlCenter() {
    try {
      const res = await fetch('/api/control-center/overview');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const data = json.data;

      // Render KPI Cards
      const kpiContainer = document.getElementById('acc-kpi-grid');
      if (kpiContainer) {
        const totalCompleted = (data.queue.success || 0) + (data.queue.failed || 0);
        const realSuccessRate = totalCompleted > 0 
          ? Math.round(((data.queue.success || 0) / totalCompleted) * 100) 
          : (data.queue.successRate !== undefined ? data.queue.successRate : 100);

        kpiContainer.innerHTML = `
          <div class="kpi-card-v2 accent-info">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Tài Khoản Hoạt Động</span>
              <div class="kpi-v2-icon"><i class="fa-solid fa-users"></i></div>
            </div>
            <div class="kpi-v2-val">${data.accounts.totalAccounts || 0}</div>
            <div class="kpi-v2-sub">
              <span class="badge-status badge-success"><i class="fa-solid fa-circle-check"></i> ${data.accounts.activeAccounts || 0} đang chạy</span>
              <span style="font-size: 0.73rem; color: var(--text-dim);">(${data.accounts.recruitmentPoolAccounts} Tuyển Dụng, ${data.accounts.bdsPoolAccounts} BĐS)</span>
            </div>
          </div>

          <div class="kpi-card-v2 accent-warning">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Hàng Đợi Đăng Bài</span>
              <div class="kpi-v2-icon warning"><i class="fa-solid fa-list-check"></i></div>
            </div>
            <div class="kpi-v2-val">${data.queue.queued || 0} <span style="font-size: 0.95rem; color: var(--text-dim); font-weight: 500;">/ ${data.queue.total || 0} tổng</span></div>
            <div class="kpi-v2-sub">
              <span class="badge-status ${data.queue.isPaused ? 'badge-danger' : 'badge-success'}">
                <i class="fa-solid ${data.queue.isPaused ? 'fa-pause' : 'fa-play'}"></i> ${data.queue.isPaused ? 'ĐÃ TẠM DỪNG' : 'ĐANG CHẠY NỀN'}
              </span>
              ${data.queue.processing > 0 ? `<span class="badge-status badge-info"><i class="fa-solid fa-spinner fa-spin"></i> ${data.queue.processing} đang xử lý</span>` : ''}
            </div>
          </div>

          <div class="kpi-card-v2 accent-success">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Tỷ Lệ Đăng Thành Công</span>
              <div class="kpi-v2-icon success"><i class="fa-solid fa-circle-check"></i></div>
            </div>
            <div class="kpi-v2-val">${realSuccessRate}%</div>
            <div class="kpi-v2-sub">
              <span style="color: #10b981; font-weight: 600;">${data.queue.success || 0} thành công</span>
              <span style="color: var(--text-dim);">/</span>
              <span style="color: ${data.queue.failed > 0 ? '#ef4444' : 'var(--text-muted)'}; font-weight: 600;">${data.queue.failed || 0} thất bại</span>
            </div>
          </div>

          <div class="kpi-card-v2 accent-info">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Chiến Dịch & Lịch Trình</span>
              <div class="kpi-v2-icon info"><i class="fa-solid fa-bullhorn"></i></div>
            </div>
            <div class="kpi-v2-val">${data.schedules.totalActiveSchedules || 0} <span style="font-size: 0.95rem; color: var(--text-dim); font-weight: 500;">lịch chạy</span></div>
            <div class="kpi-v2-sub" style="font-size: 0.74rem;">
              <span class="badge-status badge-info"><i class="fa-solid fa-code-branch"></i> ${data.rules.totalActiveRules || 0} luật IF/THEN</span>
              <span style="color: var(--text-dim);">kích hoạt tự động</span>
            </div>
          </div>
        `;
      }

      // Render Queue Action Controls
      const queueStatusPill = document.getElementById('acc-queue-status-indicator');
      if (queueStatusPill) {
        queueStatusPill.className = data.queue.isPaused ? 'badge-pill danger' : 'badge-pill success';
        queueStatusPill.innerHTML = data.queue.isPaused 
          ? '<i class="fa-solid fa-pause"></i> Hàng Đợi: Tạm Dừng' 
          : '<i class="fa-solid fa-play"></i> Hàng Đợi: Đang Hoạt Động';
      }

      const pauseBtn = document.getElementById('acc-queue-toggle-btn');
      if (pauseBtn) {
        pauseBtn.className = data.queue.isPaused ? 'btn btn-sm btn-success' : 'btn btn-sm btn-warning';
        pauseBtn.innerHTML = data.queue.isPaused 
          ? '<i class="fa-solid fa-play"></i> Tiếp Tục Hàng Đợi' 
          : '<i class="fa-solid fa-pause"></i> Tạm Dừng Hàng Đợi';
        pauseBtn.onclick = () => AutomationCenter.toggleQueuePause(data.queue.isPaused);
      }

      // Render Audit Log Table
      this.renderAuditLogs(data.recentAuditLogs || []);

      // Load queue items
      await this.loadQueueItems();

    } catch (err) {
      console.error('[AutomationCenter] Lỗi load Control Center:', err);
    }
  },

  async toggleQueuePause(currentlyPaused) {
    try {
      const endpoint = currentlyPaused ? '/api/control-center/queue/resume' : '/api/control-center/queue/pause';
      const res = await fetch(endpoint, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(currentlyPaused ? 'Đã tiếp tục hàng đợi đăng bài' : 'Đã tạm dừng hàng đợi đăng bài', 'info');
        this.loadControlCenter();
      }
    } catch (err) {
      showToast('Lỗi thay đổi trạng thái hàng đợi: ' + err.message, 'error');
    }
  },

  async loadQueueItems() {
    try {
      const { industry, status, search, page } = this.queueFilter;
      const res = await fetch(`/api/control-center/queue?industry=${industry}&status=${status}&search=${encodeURIComponent(search)}&page=${page}&limit=15`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      const tbody = document.getElementById('acc-queue-tbody');
      if (!tbody) return;

      if (json.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">Không có bài đăng nào trong hàng đợi.</td></tr>`;
        return;
      }

      tbody.innerHTML = json.data.map(job => {
        let statusBadge = '<span class="badge-status badge-info"><i class="fa-solid fa-clock"></i> Chờ xử lý</span>';
        if (job.status === 'SUCCESS') statusBadge = '<span class="badge-status badge-success"><i class="fa-solid fa-circle-check"></i> Thành công</span>';
        if (job.status === 'PROCESSING') statusBadge = '<span class="badge-status badge-info"><i class="fa-solid fa-spinner fa-spin"></i> Đang đăng</span>';
        if (job.status === 'FAILED') statusBadge = '<span class="badge-status badge-danger"><i class="fa-solid fa-triangle-exclamation"></i> Thất bại</span>';
        if (job.status === 'RETRYING') statusBadge = '<span class="badge-status badge-warning"><i class="fa-solid fa-rotate-right fa-spin"></i> Đang thử lại</span>';
        if (job.status === 'CANCELLED') statusBadge = '<span class="badge-status badge-muted"><i class="fa-solid fa-ban"></i> Đã hủy</span>';

        const contentPreview = job.content ? (job.content.substring(0, 65) + (job.content.length > 65 ? '...' : '')) : '';
        const scheduledTime = job.scheduledAt ? new Date(job.scheduledAt).toLocaleString('vi-VN') : 'Ngay lập tức';

        return `
          <tr>
            <td style="white-space: nowrap;">
              <span style="font-family: 'Fira Code', Consolas, monospace; font-weight: 700; color: #2563eb; background: rgba(37, 99, 235, 0.08); padding: 3px 8px; border-radius: 6px; font-size: 0.76rem; border: 1px solid rgba(37, 99, 235, 0.2); white-space: nowrap;">
                #${job.id.substring(job.id.length - 7)}
              </span>
            </td>
            <td>
              <span class="badge-pill ${job.targetType === 'FANPAGE' ? 'info' : 'primary'}" style="font-size: 0.72rem; font-weight: 700; display: inline-flex; align-items: center; gap: 4px;">
                <i class="fa-solid ${job.targetType === 'FANPAGE' ? 'fa-flag' : 'fa-users'}"></i> ${job.targetType}
              </span>
            </td>
            <td>
              <div style="font-weight: 700; color: var(--text-main); font-size: 0.85rem;">${job.targetName || 'Facebook Target'}</div>
              <div style="font-size: 0.73rem; color: var(--text-muted); display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                <i class="fa-solid ${job.industry === 'bds' ? 'fa-building text-warning' : 'fa-briefcase text-primary'}"></i> ${job.industry === 'bds' ? 'Bất Động Sản' : 'Tuyển Dụng'}
              </div>
            </td>
            <td style="max-width: 250px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">${contentPreview}</td>
            <td style="font-size: 0.78rem; white-space: nowrap; color: var(--text-dim);">${scheduledTime}</td>
            <td>${statusBadge}</td>
            <td style="text-align: center;">
              <div class="table-actions" style="justify-content: center;">
                ${job.status === 'FAILED' ? `
                  <button class="btn btn-xs btn-outline-primary" title="Thử lại ngay" onclick="AutomationCenter.retryQueueJob('${job.id}')" style="padding: 3px 8px;">
                    <i class="fa-solid fa-rotate-right"></i>
                  </button>
                ` : ''}
                ${(job.status === 'QUEUED' || job.status === 'SCHEDULED') ? `
                  <button class="btn btn-xs btn-outline-danger" title="Hủy bài đăng" onclick="AutomationCenter.cancelQueueJob('${job.id}')" style="padding: 3px 8px;">
                    <i class="fa-solid fa-ban"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('[AutomationCenter] Lỗi load queue items:', err);
    }
  },

  async retryQueueJob(jobId) {
    try {
      const res = await fetch(`/api/control-center/queue/${jobId}/retry`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Đã đưa bài đăng trở lại hàng đợi', 'success');
        this.loadControlCenter();
      }
    } catch (err) {
      showToast('Lỗi retry: ' + err.message, 'error');
    }
  },

  async cancelQueueJob(jobId) {
    if (!confirm('Bạn có chắc muốn hủy bài đăng này khỏi hàng đợi?')) return;
    try {
      const res = await fetch(`/api/control-center/queue/${jobId}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Đã hủy bài đăng', 'info');
        this.loadControlCenter();
      }
    } catch (err) {
      showToast('Lỗi hủy job: ' + err.message, 'error');
    }
  },

  renderAuditLogs(logs) {
    const container = document.getElementById('acc-audit-log-list');
    if (!container) return;

    if (!logs || logs.length === 0) {
      container.innerHTML = `<div class="text-center text-muted" style="padding: 24px; font-size: 0.85rem;"><i class="fa-solid fa-clock-rotate-left" style="font-size: 1.5rem; opacity: 0.3; margin-bottom: 8px; display: block;"></i> Chưa có nhật ký hoạt động nào.</div>`;
      return;
    }

    container.innerHTML = logs.slice(0, 15).map(item => {
      const timeStr = new Date(item.timestamp).toLocaleTimeString('vi-VN');
      let badgeClass = 'badge-info';
      let statusIcon = 'fa-solid fa-info-circle';
      if (item.status === 'SUCCESS') { badgeClass = 'badge-success'; statusIcon = 'fa-solid fa-circle-check'; }
      if (item.status === 'FAILED' || item.status === 'ERROR') { badgeClass = 'badge-danger'; statusIcon = 'fa-solid fa-circle-exclamation'; }
      if (item.status === 'WARNING') { badgeClass = 'badge-warning'; statusIcon = 'fa-solid fa-triangle-exclamation'; }

      // Actor Icon
      let actorIcon = 'fa-solid fa-robot text-primary';
      const actorLower = (item.actor || '').toLowerCase();
      if (actorLower.includes('ingestion') || actorLower.includes('pipeline') || actorLower.includes('sync')) {
        actorIcon = 'fa-solid fa-cloud-arrow-down text-info';
      } else if (actorLower.includes('queue') || actorLower.includes('worker') || actorLower.includes('post')) {
        actorIcon = 'fa-solid fa-paper-plane text-warning';
      } else if (actorLower.includes('user') || actorLower.includes('admin')) {
        actorIcon = 'fa-solid fa-user-shield text-success';
      }

      // Smart format details
      let detailsHtml = '';
      if (item.details) {
        if (typeof item.details === 'object') {
          const d = item.details;
          if (d.postsFound !== undefined || d.postsNew !== undefined || d.leadsCreated !== undefined) {
            detailsHtml = `
              <div class="audit-log-details-tag" style="display: flex; gap: 8px; flex-wrap: wrap;">
                <span>Quét: <strong>${d.postsFound || 0}</strong> bài</span>
                <span>Mới: <strong style="color: #10b981;">+${d.postsNew || 0}</strong></span>
                <span>Lead tạo: <strong style="color: #3b82f6;">${d.leadsCreated || 0}</strong></span>
              </div>
            `;
          } else if (d.error || d.message) {
            detailsHtml = `<div class="audit-log-details-tag" style="color: #ef4444;"><i class="fa-solid fa-triangle-exclamation"></i> ${d.error || d.message}</div>`;
          } else {
            const keys = Object.keys(d).slice(0, 3);
            detailsHtml = `<div class="audit-log-details-tag">${keys.map(k => `${k}: <strong>${d[k]}</strong>`).join(' &bull; ')}</div>`;
          }
        } else {
          detailsHtml = `<div class="audit-log-details-tag">${item.details}</div>`;
        }
      }

      return `
        <div class="audit-log-card">
          <div class="audit-log-header">
            <span class="audit-log-actor">
              <i class="${actorIcon}"></i> ${item.actor}
            </span>
            <span class="audit-log-time"><i class="fa-regular fa-clock"></i> ${timeStr}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 4px; font-size: 0.74rem;">
            <span class="badge-status ${badgeClass}" style="font-size: 0.68rem; padding: 2px 7px;">
              <i class="${statusIcon}"></i> ${item.action}
            </span>
            <span style="color: var(--text-muted); font-size: 0.72rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${item.target ? `&rarr; ${item.target}` : ''}
            </span>
          </div>
          ${detailsHtml}
        </div>
      `;
    }).join('');
  },

  // ==========================================
  // 2. CAMPAIGNS & CONTENT STUDIO TAB
  // ==========================================
  async loadCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const json = await res.json();
      if (!json.success || !json.campaigns) return;

      const container = document.getElementById('acc-campaigns-grid');
      if (!container) return;

      if (json.campaigns.length === 0) {
        container.innerHTML = `<div class="text-center text-muted" style="padding: 40px; grid-column: 1 / -1;">Chưa có chiến dịch nào được tạo.</div>`;
        return;
      }

      container.innerHTML = json.campaigns.map(camp => {
        let statusBadge = `<span class="badge-status badge-info">${camp.status}</span>`;
        if (camp.status === 'RUNNING') statusBadge = `<span class="badge-status badge-success"><i class="fa-solid fa-spinner fa-spin"></i> ĐANG CHẠY</span>`;
        if (camp.status === 'READY') statusBadge = `<span class="badge-status badge-primary">SẴN SÀNG</span>`;
        if (camp.status === 'PAUSED') statusBadge = `<span class="badge-status badge-warning">TẠM DỪNG</span>`;
        if (camp.status === 'COMPLETED') statusBadge = `<span class="badge-status badge-muted">HOÀN TẤT</span>`;

        const stats = camp.stats || {};
        const successRate = stats.successRate || 0;

        return `
          <div class="card campaign-card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <span class="badge-pill ${camp.industry === 'bds' ? 'warning' : 'primary'}">
                  ${camp.industry === 'bds' ? 'Bất Động Sản' : 'Tuyển Dụng'}
                </span>
                ${statusBadge}
              </div>

              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-heading); margin-bottom: 8px;">
                ${camp.name}
              </h3>
              <p style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 16px;">
                Mục tiêu: <strong>${camp.targets ? camp.targets.length : 0} kênh</strong> (Hội nhóm & Fanpage)
              </p>

              <!-- Progress bar -->
              <div style="background: var(--bg-tertiary); border-radius: 6px; height: 8px; overflow: hidden; margin-bottom: 8px;">
                <div style="background: var(--primary); width: ${successRate}%; height: 100%;"></div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 16px;">
                <span>Đã phát: ${stats.totalDispatchedJobs || 0} bài</span>
                <span>Thành công: ${stats.success || 0} (${successRate}%)</span>
              </div>
            </div>

            <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 14px;">
              ${camp.status !== 'RUNNING' && camp.status !== 'COMPLETED' ? `
                <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="AutomationCenter.launchCampaign('${camp.id}')">
                  <i class="fa-solid fa-rocket"></i> Khởi Chạy
                </button>
              ` : ''}

              ${camp.status === 'RUNNING' ? `
                <button class="btn btn-sm btn-warning" style="flex: 1;" onclick="AutomationCenter.pauseCampaign('${camp.id}')">
                  <i class="fa-solid fa-pause"></i> Tạm Dừng
                </button>
              ` : ''}

              ${camp.status === 'PAUSED' ? `
                <button class="btn btn-sm btn-success" style="flex: 1;" onclick="AutomationCenter.resumeCampaign('${camp.id}')">
                  <i class="fa-solid fa-play"></i> Tiếp Tục
                </button>
              ` : ''}

              <button class="btn btn-sm btn-secondary" onclick="AutomationCenter.previewCampaignVariations('${camp.id}')" title="Xem biến thể đa kênh">
                <i class="fa-solid fa-eye"></i> Biến Thể
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[AutomationCenter] Lỗi load campaigns:', err);
    }
  },

  async launchCampaign(campId) {
    try {
      const res = await fetch(`/api/campaigns/${campId}/launch`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message || 'Khởi chạy chiến dịch thành công', 'success');
        this.loadCampaigns();
      } else {
        showToast('Lỗi: ' + json.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async pauseCampaign(campId) {
    try {
      const res = await fetch(`/api/campaigns/${campId}/pause`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Đã tạm dừng chiến dịch', 'info');
        this.loadCampaigns();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async resumeCampaign(campId) {
    try {
      const res = await fetch(`/api/campaigns/${campId}/resume`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Đã tiếp tục chiến dịch', 'success');
        this.loadCampaigns();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async previewCampaignVariations(campId) {
    try {
      const res = await fetch(`/api/campaigns/${campId}`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      const camp = json.data;
      const previewRes = await fetch('/api/campaigns/templates/preview-variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          baseContent: camp.baseContent,
          industry: camp.industry,
          targetName: 'Hội Nhóm Mục Tiêu',
          location: 'Đà Nẵng'
        })
      });
      const previewJson = await previewRes.json();
      if (!previewJson.success) return;

      const modal = document.getElementById('acc-variations-modal');
      const modalBody = document.getElementById('acc-variations-modal-body');
      if (modal && modalBody) {
        modalBody.innerHTML = `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px;">
              <h4 style="color: var(--primary); margin-bottom: 8px;"><i class="fa-solid fa-flag"></i> Biến Thể Fanpage (Chuyên nghiệp & Hashtag)</h4>
              <pre style="white-space: pre-wrap; font-size: 0.82rem; font-family: inherit; color: var(--text-color);">${previewJson.data.fanpage.pageContent}</pre>
            </div>
            <div style="background: var(--bg-tertiary); padding: 16px; border-radius: 8px;">
              <h4 style="color: var(--success); margin-bottom: 8px;"><i class="fa-solid fa-users"></i> Biến Thể Group (Trực diện & Kích thích Comment)</h4>
              <pre style="white-space: pre-wrap; font-size: 0.82rem; font-family: inherit; color: var(--text-color);">${previewJson.data.group.groupContent}</pre>
            </div>
          </div>
        `;
        modal.style.display = 'flex';
      }
    } catch (err) {
      showToast('Lỗi xem biến thể: ' + err.message, 'error');
    }
  },

  // ==========================================
  // 3. DUAL CRM PIPELINES & KANBAN TAB
  // ==========================================
  async switchPipelineIndustry(industry) {
    this.activePipelineIndustry = industry;
    const recBtn = document.getElementById('pipeline-btn-recruitment');
    const bdsBtn = document.getElementById('pipeline-btn-bds');
    if (recBtn && bdsBtn) {
      recBtn.className = industry === 'recruitment' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
      bdsBtn.className = industry === 'bds' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-secondary';
    }
    await this.loadPipelineKanban();
  },

  async loadPipelineKanban() {
    try {
      const res = await fetch(`/api/pipelines/kanban?industry=${this.activePipelineIndustry}`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      const board = json.data;
      const boardContainer = document.getElementById('acc-kanban-board');
      if (!boardContainer) return;

      boardContainer.innerHTML = board.columns.map(col => {
        return `
          <div class="kanban-col" style="min-width: 260px; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; display: flex; flex-direction: column;">
            <div style="padding: 12px; border-bottom: 2px solid ${col.color}; display: flex; justify-content: space-between; align-items: center;">
              <span style="font-weight: 700; font-size: 0.88rem; color: var(--text-heading);">${col.label}</span>
              <span class="badge-status" style="background: ${col.color}20; color: ${col.color}; font-weight: 700;">${col.count}</span>
            </div>

            <div class="kanban-cards-wrap" style="padding: 10px; display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; max-height: 600px;">
              ${col.leads.length === 0 ? `<div style="font-size: 0.78rem; color: var(--text-muted); text-align: center; padding: 20px 0;">Trống</div>` : ''}
              ${col.leads.map(lead => {
                return `
                  <div class="kanban-card" style="background: var(--bg-primary); border: 1px solid var(--border-color); border-radius: 6px; padding: 10px; font-size: 0.82rem; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                      <span style="font-weight: 700; color: var(--text-heading);">${lead.posterName || 'Khách hàng'}</span>
                      <span class="badge-status ${lead.leadTier === 'HOT' ? 'badge-danger' : (lead.leadTier === 'WARM' ? 'badge-warning' : 'badge-muted')}" style="font-size: 0.68rem;">
                        ${lead.leadScore || 50}đ
                      </span>
                    </div>

                    ${lead.phone ? `
                      <div style="color: var(--primary); font-size: 0.78rem; font-weight: 600; margin-bottom: 4px;">
                        <i class="fa-solid fa-phone"></i> ${lead.phone}
                      </div>
                    ` : ''}

                    <div style="color: var(--text-muted); font-size: 0.75rem; margin-bottom: 8px;">
                      ${lead.originalText ? lead.originalText.substring(0, 50) + '...' : ''}
                    </div>

                    ${lead.isOverdue ? `
                      <div style="background: #FEE2E2; color: #DC2626; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; margin-bottom: 8px;">
                        <i class="fa-solid fa-triangle-exclamation"></i> Quá hạn SLA (${lead.hoursInStage}h)
                      </div>
                    ` : ''}

                    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 6px;">
                      <button class="btn btn-sm btn-secondary" style="font-size: 0.7rem; padding: 2px 6px;" onclick="AutomationCenter.openMoveStageModal('${lead.id}')">
                        Chuyển Stage <i class="fa-solid fa-arrow-right"></i>
                      </button>
                      <button class="btn btn-sm btn-primary" style="font-size: 0.7rem; padding: 2px 6px;" onclick="AutomationCenter.openAppointmentModal('${lead.id}')">
                        <i class="fa-solid fa-calendar-plus"></i> Hẹn
                      </button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[AutomationCenter] Lỗi load Kanban:', err);
    }
  },

  openMoveStageModal(leadId) {
    const stage = prompt('Nhập mã giai đoạn tiếp theo (VD: CONTACTED, INTERVIEW_SCHEDULED, HIRED, LOST):', 'CONTACTED');
    if (!stage) return;
    const note = prompt('Ghi chú tương tác:', 'Chuyển stage sau liên hệ');
    this.moveLeadStage(leadId, stage.toUpperCase().trim(), note);
  },

  async moveLeadStage(leadId, targetStage, note) {
    try {
      const res = await fetch('/api/pipelines/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leadId, targetStage, note, staffName: 'Chuyên viên LeadX' })
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'success');
        this.loadPipelineKanban();
      } else {
        showToast('Lỗi: ' + json.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  openAppointmentModal(leadId) {
    const scheduledAt = prompt('Nhập thời gian hẹn (YYYY-MM-DD HH:mm):', '2026-10-05 10:00');
    if (!scheduledAt) return;
    const location = prompt('Địa điểm:', 'Tầng 5 LeadX Tower');
    const type = this.activePipelineIndustry === 'bds' ? 'VIEWING' : 'INTERVIEW';
    this.createAppointment(leadId, type, scheduledAt, location);
  },

  async createAppointment(leadId, type, scheduledAt, location) {
    try {
      const res = await fetch('/api/pipelines/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leadId,
          type,
          scheduledAt,
          location,
          assignedStaff: 'Chuyên viên LeadX'
        })
      });
      const json = await res.json();
      if (json.success) {
        showToast('Đã đặt lịch hẹn thành công', 'success');
        this.loadPipelineKanban();
      } else {
        showToast('Lỗi: ' + json.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  // ==========================================
  // 4. REVENUE ATTRIBUTION TAB
  // ==========================================
  async loadAttributionReport() {
    try {
      const res = await fetch('/api/pipelines/attribution');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const data = json.data;

      // Render Summary Cards
      const container = document.getElementById('acc-attribution-summary');
      if (container) {
        container.innerHTML = `
          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Tổng Doanh Thu Thực Tế</span>
              <i class="fa-solid fa-dollar-sign text-success"></i>
            </div>
            <div class="kpi-v2-val">${(data.totalRevenue || 0).toLocaleString('vi-VN')} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">VNĐ</span></div>
            <div class="kpi-v2-sub text-success">
              ${data.paidOrdersCount || 0} đơn hàng đã thanh toán thành công
            </div>
          </div>

          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Doanh Thu Tuyển Dụng</span>
              <i class="fa-solid fa-user-tie text-primary"></i>
            </div>
            <div class="kpi-v2-val">${(data.recruitmentRevenue || 0).toLocaleString('vi-VN')} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">VNĐ</span></div>
            <div class="kpi-v2-sub text-muted">Từ các gói đẩy tin & ghim nhóm VIP</div>
          </div>

          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Doanh Thu Bất Động Sản</span>
              <i class="fa-solid fa-building text-warning"></i>
            </div>
            <div class="kpi-v2-val">${(data.bdsRevenue || 0).toLocaleString('vi-VN')} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">VNĐ</span></div>
            <div class="kpi-v2-sub text-muted">Từ hoa hồng căn hộ cho thuê</div>
          </div>

          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Tỷ Lệ Chốt Đơn (Lead → Order)</span>
              <i class="fa-solid fa-chart-line text-info"></i>
            </div>
            <div class="kpi-v2-val">${data.funnel ? data.funnel.leadToOrderRate : 0}%</div>
            <div class="kpi-v2-sub text-muted">${data.funnel ? data.funnel.totalLeads : 0} Leads → ${data.paidOrdersCount} Đơn hàng</div>
          </div>
        `;
      }

      // Render Top Groups Table
      const topGroupsTbody = document.getElementById('acc-top-groups-tbody');
      if (topGroupsTbody && data.topRevenueGroups) {
        topGroupsTbody.innerHTML = data.topRevenueGroups.map((g, index) => {
          return `
            <tr>
              <td><strong>#${index + 1}</strong></td>
              <td><span style="font-weight: 600; color: var(--text-heading);">${g.groupName}</span></td>
              <td>${g.orderCount} đơn</td>
              <td style="font-weight: 700; color: var(--success);">${g.revenue.toLocaleString('vi-VN')} đ</td>
            </tr>
          `;
        }).join('');
      }

      // Render Funnel Visual
      const funnelContainer = document.getElementById('acc-funnel-visual');
      if (funnelContainer && data.funnel) {
        const f = data.funnel;
        funnelContainer.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0;">
            <span>1. Bài đăng hàng đợi (Posting Queue)</span>
            <strong>${f.totalDispatchedPosts} bài</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid var(--border-color);">
            <span>2. Lead thu thập & phân giải danh tính</span>
            <strong>${f.totalLeads} leads (${f.hotLeads} Hot Leads)</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid var(--border-color);">
            <span>3. Hồ sơ khách hàng chuyển đổi (CRM Customers)</span>
            <strong>${f.totalCustomers} khách hàng</strong>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-top: 1px solid var(--border-color); color: var(--success);">
            <span>4. Đơn hàng phát sinh doanh thu</span>
            <strong>${f.paidOrders} đơn (${(f.totalRevenueVND || 0).toLocaleString('vi-VN')} đ)</strong>
          </div>
        `;
      }

    } catch (err) {
      console.error('[AutomationCenter] Lỗi load attribution:', err);
    }
  }
};

window.AutomationCenter = AutomationCenter;
