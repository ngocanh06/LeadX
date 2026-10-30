/**
 * emailEngine.js - Giao Diện Điều Khiển Module Auto Email Chuẩn B2B SaaS
 * Điều phối Hàng đợi, Quản lý Hộp thư SMTP, Mẫu Email, Chiến Dịch & Drip Automations
 */

const EmailEngine = {
  activeSubTab: 'queue',
  queueFilter: { status: 'ALL', category: 'ALL', search: '', page: 1 },

  init() {
    console.log('[EmailEngine] Khởi tạo Auto Email Engine');
  },

  switchSubTab(tabName) {
    this.activeSubTab = tabName;
    document.querySelectorAll('.email-sub-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-subtab') === tabName);
    });
    document.querySelectorAll('.email-subtab-pane').forEach(pane => {
      pane.style.display = pane.id === `email-pane-${tabName}` ? 'block' : 'none';
    });

    if (tabName === 'queue') this.loadQueue();
    if (tabName === 'providers') this.loadProviders();
    if (tabName === 'templates') this.loadTemplates();
    if (tabName === 'campaigns') {
      this.loadCampaigns();
      this.loadAutomations();
    }
  },

  // ==========================================
  // 1. OVERVIEW & QUEUE
  // ==========================================
  async loadOverview() {
    try {
      const res = await fetch('/api/email/overview');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const data = json.data;

      // Render KPI Cards
      const kpiContainer = document.getElementById('email-kpi-grid');
      if (kpiContainer) {
        kpiContainer.innerHTML = `
          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Hàng Đợi Email</span>
              <i class="fa-solid fa-envelope-open-text text-primary"></i>
            </div>
            <div class="kpi-v2-val">${data.queue.queued || 0} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">/ ${data.queue.total || 0} tổng</span></div>
            <div class="kpi-v2-sub">
              <span class="badge-status ${data.queue.isPaused ? 'badge-danger' : 'badge-success'}">
                ${data.queue.isPaused ? 'ĐÃ TẠM DỪNG' : 'HỆ THỐNG ĐANG CHẠY'}
              </span>
              ${data.queue.sending > 0 ? `<span class="badge-status badge-info">${data.queue.sending} đang gửi</span>` : ''}
            </div>
          </div>

          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Tỷ Lệ Gửi Thành Công</span>
              <i class="fa-solid fa-circle-check text-success"></i>
            </div>
            <div class="kpi-v2-val">${data.queue.successRate || 100}%</div>
            <div class="kpi-v2-sub text-muted">
              Đã gửi: <strong>${data.queue.sent || 0}</strong> | Thất bại: <strong>${data.queue.failed || 0}</strong>
            </div>
          </div>

          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Hạn Ngạch Trong Ngày</span>
              <i class="fa-solid fa-gauge text-warning"></i>
            </div>
            <div class="kpi-v2-val">${data.providers.totalDailySent || 0} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">/ ${data.providers.totalDailyLimit || 500}</span></div>
            <div class="kpi-v2-sub text-success">
              Còn lại ${data.providers.quotaRemaining || 0} lượt gửi hôm nay
            </div>
          </div>

          <div class="kpi-card-v2">
            <div class="kpi-v2-header">
              <span class="kpi-v2-label">Hộp Thư &amp; Kịch Bản</span>
              <i class="fa-solid fa-network-wired text-info"></i>
            </div>
            <div class="kpi-v2-val">${data.providers.activeCount || 0} <span style="font-size: 1rem; color: var(--text-muted); font-weight: normal;">hộp thư gửi</span></div>
            <div class="kpi-v2-sub text-muted">
              ${data.templatesCount || 0} mẫu email • ${data.activeAutomationsCount || 0} kịch bản tự động
            </div>
          </div>
        `;
      }

      // Sync Pause/Resume Button
      const toggleBtn = document.getElementById('email-queue-toggle-btn');
      if (toggleBtn) {
        toggleBtn.className = data.queue.isPaused ? 'btn btn-sm btn-success' : 'btn btn-sm btn-warning';
        toggleBtn.innerHTML = data.queue.isPaused 
          ? '<i class="fa-solid fa-play"></i> Tiếp Tục Hàng Đợi' 
          : '<i class="fa-solid fa-pause"></i> Tạm Dừng Hàng Đợi';
        toggleBtn.onclick = () => EmailEngine.toggleQueuePause(data.queue.isPaused);
      }

      await this.loadQueue();

    } catch (err) {
      console.error('[EmailEngine] Lỗi load overview:', err);
    }
  },

  async toggleQueuePause(currentlyPaused) {
    try {
      const endpoint = currentlyPaused ? '/api/email/queue/resume' : '/api/email/queue/pause';
      const res = await fetch(endpoint, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(currentlyPaused ? 'Đã tiếp tục hàng đợi email' : 'Đã tạm dừng hàng đợi email', 'info');
        this.loadOverview();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async loadQueue() {
    try {
      const { status, category, search, page } = this.queueFilter;
      const res = await fetch(`/api/email/queue?status=${status}&category=${category}&search=${encodeURIComponent(search)}&page=${page}&limit=15`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      const tbody = document.getElementById('email-queue-tbody');
      if (!tbody) return;

      if (json.data.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted" style="padding: 24px;">Không có email nào trong hàng đợi.</td></tr>`;
        return;
      }

      tbody.innerHTML = json.data.map(job => {
        let statusBadge = '<span class="badge-status badge-info">Chờ gửi</span>';
        if (job.status === 'SENT') statusBadge = '<span class="badge-status badge-success"><i class="fa-solid fa-check"></i> Đã gửi</span>';
        if (job.status === 'SENDING') statusBadge = '<span class="badge-status badge-info"><i class="fa-solid fa-spinner fa-spin"></i> Đang gửi</span>';
        if (job.status === 'FAILED') statusBadge = `<span class="badge-status badge-danger" title="${job.error || ''}">Gửi thất bại</span>`;
        if (job.status === 'RETRYING') statusBadge = `<span class="badge-status badge-warning">Đang thử lại (${job.retryCount})</span>`;
        if (job.status === 'CANCELLED') statusBadge = '<span class="badge-status badge-muted">Đã hủy</span>';

        const categoryLabel = {
          candidate: '<span class="badge-pill primary" style="font-size: 0.72rem;">Ứng Viên</span>',
          employer: '<span class="badge-pill info" style="font-size: 0.72rem;">Doanh Nghiệp</span>',
          bds: '<span class="badge-pill warning" style="font-size: 0.72rem;">Bất Động Sản</span>'
        }[job.category] || '<span class="badge-pill" style="font-size: 0.72rem;">Email</span>';

        const scheduledTime = job.scheduledAt ? new Date(job.scheduledAt).toLocaleString('vi-VN') : 'Ngay lập tức';

        return `
          <tr>
            <td><code>${job.id.substring(job.id.length - 8)}</code></td>
            <td>${categoryLabel}</td>
            <td>
              <div style="font-weight: 600; color: var(--text-heading);">${job.toName || job.to}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${job.to}</div>
            </td>
            <td style="max-width: 250px;">
              <div style="font-weight: 500; font-size: 0.82rem; color: var(--text-heading);">${job.subject}</div>
              ${job.deliveryResponse?.messageId ? `<div style="font-size: 0.7rem; color: var(--text-muted); font-family: monospace;">ID: ${job.deliveryResponse.messageId}</div>` : ''}
            </td>
            <td style="font-size: 0.8rem;">${scheduledTime}</td>
            <td>${statusBadge}</td>
            <td>
              <div class="table-actions">
                ${job.status === 'FAILED' ? `
                  <button class="btn-icon btn-sm" title="Thử lại ngay" onclick="EmailEngine.retryJob('${job.id}')">
                    <i class="fa-solid fa-rotate-right text-primary"></i>
                  </button>
                ` : ''}
                ${(job.status === 'QUEUED' || job.status === 'RETRYING') ? `
                  <button class="btn-icon btn-sm" title="Hủy gửi" onclick="EmailEngine.cancelJob('${job.id}')">
                    <i class="fa-solid fa-ban text-danger"></i>
                  </button>
                ` : ''}
              </div>
            </td>
          </tr>
        `;
      }).join('');

    } catch (err) {
      console.error('[EmailEngine] Lỗi load queue:', err);
    }
  },

  async retryJob(jobId) {
    try {
      const res = await fetch(`/api/email/queue/${jobId}/retry`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Đã đưa email trở lại hàng đợi', 'success');
        this.loadOverview();
      }
    } catch (err) {
      showToast('Lỗi retry: ' + err.message, 'error');
    }
  },

  async cancelJob(jobId) {
    if (!confirm('Bạn có chắc muốn hủy email này?')) return;
    try {
      const res = await fetch(`/api/email/queue/${jobId}/cancel`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast('Đã hủy email', 'info');
        this.loadOverview();
      }
    } catch (err) {
      showToast('Lỗi hủy job: ' + err.message, 'error');
    }
  },

  // ==========================================
  // 2. PROVIDERS & SMTP MANAGEMENT
  // ==========================================
  async loadProviders() {
    try {
      const res = await fetch('/api/email/providers');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const container = document.getElementById('email-providers-grid');
      if (!container) return;

      container.innerHTML = json.data.map(p => {
        let statusBadge = p.status === 'ACTIVE' 
          ? '<span class="badge-status badge-success">Sẵn sàng</span>' 
          : '<span class="badge-status badge-danger">Lỗi kết nối</span>';

        return `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
                <span class="badge-pill ${p.type === 'GMAIL_APP_PASS' ? 'primary' : 'info'}">
                  ${p.type === 'GMAIL_APP_PASS' ? 'Gmail App Pass' : 'Custom SMTP'}
                </span>
                ${statusBadge}
              </div>

              <h3 style="font-size: 1.05rem; font-weight: 700; color: var(--text-heading); margin-bottom: 4px;">
                ${p.name}
              </h3>
              <div style="font-size: 0.82rem; color: var(--primary); font-weight: 600; margin-bottom: 12px;">
                <i class="fa-solid fa-at"></i> ${p.user}
              </div>

              <div style="background: var(--bg-tertiary); padding: 10px; border-radius: 6px; font-size: 0.78rem; color: var(--text-muted); margin-bottom: 12px;">
                <div>Máy chủ: <strong>${p.host}:${p.port}</strong> (SSL/TLS: ${p.secure ? 'Có' : 'Không'})</div>
                <div>Người gửi hiển thị: <strong>${p.fromName}</strong></div>
                <div style="margin-top: 4px;">Hôm nay đã gửi: <strong>${p.dailySent || 0} / ${p.dailyLimit || 500}</strong></div>
              </div>

              ${p.lastTestResult ? `
                <div style="font-size: 0.75rem; padding: 6px 10px; border-radius: 4px; margin-bottom: 12px; background: ${p.lastTestResult.success ? '#D1FAE5' : '#FEE2E2'}; color: ${p.lastTestResult.success ? '#065F46' : '#991B1B'};">
                  ${p.lastTestResult.success ? '<i class="fa-solid fa-check"></i> ' + p.lastTestResult.message : '<i class="fa-solid fa-xmark"></i> ' + p.lastTestResult.error}
                </div>
              ` : ''}
            </div>

            <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
              <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="EmailEngine.testProviderConnection('${p.id}')">
                <i class="fa-solid fa-plug-circle-check"></i> Kiểm Tra Kết Nối
              </button>
              <button class="btn btn-sm btn-danger" onclick="EmailEngine.deleteProvider('${p.id}')" title="Xóa hộp thư">
                <i class="fa-solid fa-trash"></i>
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[EmailEngine] Lỗi load providers:', err);
    }
  },

  async testProviderConnection(providerId) {
    showToast('Đang kiểm tra kết nối SMTP thực tế...', 'info');
    try {
      const res = await fetch(`/api/email/providers/${providerId}/test`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'success');
      } else {
        showToast(json.error, 'error');
      }
      this.loadProviders();
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async deleteProvider(id) {
    if (!confirm('Bạn có chắc muốn xóa cấu hình hộp thư này?')) return;
    try {
      const res = await fetch(`/api/email/providers/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'info');
        this.loadProviders();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  openAddProviderModal() {
    const modal = document.getElementById('email-add-provider-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeAddProviderModal() {
    const modal = document.getElementById('email-add-provider-modal');
    if (modal) modal.style.display = 'none';
  },

  async submitNewProvider(event) {
    event.preventDefault();
    const name = document.getElementById('prov-name').value;
    const type = document.getElementById('prov-type').value;
    const user = document.getElementById('prov-user').value;
    const pass = document.getElementById('prov-pass').value;
    const fromName = document.getElementById('prov-from-name').value;
    const host = document.getElementById('prov-host').value;
    const port = document.getElementById('prov-port').value;
    const dailyLimit = document.getElementById('prov-limit').value;

    try {
      const res = await fetch('/api/email/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type, user, pass, fromName, host, port, dailyLimit })
      });
      const json = await res.json();
      if (json.success) {
        showToast('Đã thêm hộp thư SMTP mới thành công', 'success');
        this.closeAddProviderModal();
        this.loadProviders();
      } else {
        showToast('Lỗi: ' + json.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  // ==========================================
  // 3. TEMPLATES STUDIO
  // ==========================================
  async loadTemplates() {
    try {
      const res = await fetch('/api/email/templates');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const container = document.getElementById('email-templates-grid');
      if (!container) return;

      container.innerHTML = json.data.map(t => {
        return `
          <div class="card" style="display: flex; flex-direction: column; justify-content: space-between;">
            <div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span class="badge-pill ${t.category === 'candidate' ? 'primary' : (t.category === 'employer' ? 'info' : 'warning')}">
                  ${t.category === 'candidate' ? 'Ứng Viên' : (t.category === 'employer' ? 'Doanh Nghiệp' : 'Bất Động Sản')}
                </span>
                <code style="font-size: 0.72rem;">${t.id}</code>
              </div>

              <h4 style="font-size: 1.05rem; font-weight: 700; color: var(--text-heading); margin-bottom: 6px;">
                ${t.name}
              </h4>
              <p style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 12px; font-weight: 500;">
                <i class="fa-solid fa-heading"></i> ${t.subject}
              </p>

              <div style="margin-bottom: 12px;">
                <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 4px;">Biến khả dụng:</div>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${(t.variables || []).map(v => `<span style="background: var(--bg-tertiary); font-family: monospace; font-size: 0.7rem; padding: 2px 6px; border-radius: 4px;">{{${v}}}</span>`).join('')}
                </div>
              </div>
            </div>

            <div style="display: flex; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 12px;">
              <button class="btn btn-sm btn-primary" style="flex: 1;" onclick="EmailEngine.previewTemplate('${t.id}')">
                <i class="fa-solid fa-eye"></i> Xem Trước Mẫu
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[EmailEngine] Lỗi load templates:', err);
    }
  },

  async previewTemplate(templateId) {
    try {
      const res = await fetch(`/api/email/templates/${templateId}`);
      const json = await res.json();
      if (!json.success || !json.data) return;

      const t = json.data;
      const modal = document.getElementById('email-template-preview-modal');
      const body = document.getElementById('email-template-preview-body');
      const title = document.getElementById('email-template-preview-title');

      if (modal && body) {
        if (title) title.textContent = t.name;
        body.innerHTML = `
          <div style="margin-bottom: 14px; background: var(--bg-tertiary); padding: 10px 14px; border-radius: 6px; font-size: 0.85rem;">
            <strong>Tiêu đề:</strong> ${t.subject}
          </div>
          <div style="background: #ffffff; border-radius: 8px; padding: 12px; border: 1px solid var(--border-color);">
            ${t.bodyHtml}
          </div>
        `;
        modal.style.display = 'flex';
      }
    } catch (err) {
      showToast('Lỗi xem trước: ' + err.message, 'error');
    }
  },

  closePreviewModal() {
    const modal = document.getElementById('email-template-preview-modal');
    if (modal) modal.style.display = 'none';
  },

  // ==========================================
  // 4. CAMPAIGNS & DRIP SEQUENCES
  // ==========================================
  async loadCampaigns() {
    try {
      const res = await fetch('/api/email/campaigns');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const container = document.getElementById('email-campaigns-list');
      if (!container) return;

      if (json.data.length === 0) {
        container.innerHTML = `<div class="text-center text-muted" style="padding: 24px;">Chưa có chiến dịch email nào.</div>`;
        return;
      }

      container.innerHTML = json.data.map(c => {
        let statusBadge = '<span class="badge-status badge-info">DRAFT</span>';
        if (c.status === 'RUNNING') statusBadge = '<span class="badge-status badge-success"><i class="fa-solid fa-spinner fa-spin"></i> ĐANG GỬI</span>';
        if (c.status === 'COMPLETED') statusBadge = '<span class="badge-status badge-muted">HOÀN TẤT</span>';
        if (c.status === 'PAUSED') statusBadge = '<span class="badge-status badge-warning">TẠM DỪNG</span>';

        const stats = c.stats || {};

        return `
          <div class="card" style="margin-bottom: 14px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <h4 style="margin: 0; font-size: 1.05rem; font-weight: 700;">${c.name}</h4>
              ${statusBadge}
            </div>

            <div style="font-size: 0.82rem; color: var(--text-muted); margin-bottom: 12px;">
              Gửi tới: <strong>${stats.totalRecipients || 0} người nhận</strong> • Giãn cách: <strong>${c.throttleSeconds}s/email</strong>
            </div>

            <!-- Progress bar -->
            <div style="background: var(--bg-tertiary); border-radius: 6px; height: 8px; overflow: hidden; margin-bottom: 8px;">
              <div style="background: var(--primary); width: ${stats.progressRate || 0}%; height: 100%;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted); margin-bottom: 12px;">
              <span>Đã gửi: ${stats.sent || 0}</span>
              <span>Tiến độ: ${stats.progressRate || 0}%</span>
            </div>

            <div style="display: flex; gap: 8px;">
              ${c.status !== 'RUNNING' && c.status !== 'COMPLETED' ? `
                <button class="btn btn-sm btn-primary" onclick="EmailEngine.launchCampaign('${c.id}')">
                  <i class="fa-solid fa-rocket"></i> Bắt Đầu Gửi
                </button>
              ` : ''}
              ${c.status === 'RUNNING' ? `
                <button class="btn btn-sm btn-warning" onclick="EmailEngine.pauseCampaign('${c.id}')">
                  <i class="fa-solid fa-pause"></i> Tạm Dừng
                </button>
              ` : ''}
              ${c.status === 'PAUSED' ? `
                <button class="btn btn-sm btn-success" onclick="EmailEngine.resumeCampaign('${c.id}')">
                  <i class="fa-solid fa-play"></i> Tiếp Tục
                </button>
              ` : ''}
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[EmailEngine] Lỗi load campaigns:', err);
    }
  },

  async launchCampaign(id) {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/launch`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'success');
        this.loadCampaigns();
      } else {
        showToast('Lỗi: ' + json.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async pauseCampaign(id) {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/pause`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'info');
        this.loadCampaigns();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async resumeCampaign(id) {
    try {
      const res = await fetch(`/api/email/campaigns/${id}/resume`, { method: 'POST' });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'success');
        this.loadCampaigns();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  async loadAutomations() {
    try {
      const res = await fetch('/api/email/automations');
      const json = await res.json();
      if (!json.success || !json.data) return;

      const container = document.getElementById('email-automations-list');
      if (!container) return;

      container.innerHTML = json.data.map(a => {
        return `
          <div class="card" style="margin-bottom: 12px; display: flex; justify-content: space-between; align-items: center;">
            <div>
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                <h4 style="margin: 0; font-size: 0.98rem; font-weight: 700;">${a.name}</h4>
                <span class="badge-pill info" style="font-size: 0.68rem;">Trigger: ${a.trigger}</span>
              </div>
              <div style="font-size: 0.78rem; color: var(--text-muted);">
                Số bước: <strong>${(a.steps || []).length} bước</strong> • Tự động dừng khi: <code>${(a.autoStopConditions || []).join(', ')}</code>
              </div>
            </div>

            <div>
              <button class="btn btn-sm ${a.enabled ? 'btn-success' : 'btn-secondary'}" onclick="EmailEngine.toggleAutomation('${a.id}', ${!a.enabled})">
                ${a.enabled ? '<i class="fa-solid fa-toggle-on"></i> Đang Bật' : '<i class="fa-solid fa-toggle-off"></i> Đã Tắt'}
              </button>
            </div>
          </div>
        `;
      }).join('');

    } catch (err) {
      console.error('[EmailEngine] Lỗi load automations:', err);
    }
  },

  async toggleAutomation(id, enabled) {
    try {
      const res = await fetch(`/api/email/automations/${id}/toggle`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled })
      });
      const json = await res.json();
      if (json.success) {
        showToast(enabled ? 'Đã bật kịch bản' : 'Đã tắt kịch bản', 'info');
        this.loadAutomations();
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  },

  // ==========================================
  // 5. QUICK WORKFLOW SEND MODALS
  // ==========================================
  openQuickSendModal() {
    const modal = document.getElementById('email-quick-send-modal');
    if (modal) modal.style.display = 'flex';
  },

  closeQuickSendModal() {
    const modal = document.getElementById('email-quick-send-modal');
    if (modal) modal.style.display = 'none';
  },

  async submitQuickSend(event) {
    event.preventDefault();
    const type = document.getElementById('quick-email-type').value;
    const recipientEmail = document.getElementById('quick-email-to').value;
    const recipientName = document.getElementById('quick-email-name').value;
    const jobTitle = document.getElementById('quick-email-job').value;
    const companyName = document.getElementById('quick-email-company').value;

    let endpoint = '/api/email/workflow/candidate/ack';
    let payload = { candidateEmail: recipientEmail, candidateName: recipientName, jobTitle, companyName };

    if (type === 'INVITE') {
      endpoint = '/api/email/workflow/candidate/invite';
      payload.interviewTime = document.getElementById('quick-email-time').value || '09:00 ngày mai';
    } else if (type === 'OUTREACH') {
      endpoint = '/api/email/workflow/employer/outreach';
      payload = { recipientEmail, recipientName, companyName, jobTitle };
    } else if (type === 'QUOTE') {
      endpoint = '/api/email/workflow/employer/quote';
      payload = { recipientEmail, recipientName, companyName };
    }

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (json.success) {
        showToast(json.message, 'success');
        this.closeQuickSendModal();
        this.loadOverview();
      } else {
        showToast('Lỗi: ' + json.error, 'error');
      }
    } catch (err) {
      showToast('Lỗi: ' + err.message, 'error');
    }
  }
};

window.EmailEngine = EmailEngine;
