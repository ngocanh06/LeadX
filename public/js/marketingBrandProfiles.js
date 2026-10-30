/**
 * marketingBrandProfiles.js - Quản Lý Hồ Sơ Thương Hiệu & Brand Writing DNA
 * Phân hệ AI Marketing Engine cho LeadX
 */

const mbState = {
  profiles: [],
  activeBrandId: null,
  activeDetailTab: 'overview', // 'overview', 'pillars', 'rules', 'dna'
  currentProfileData: null
};

// 1. TẢI TOÀN BỘ DANH SÁCH BRAND PROFILES
async function loadMarketingBrandProfiles(forceRefresh = false) {
  const container = document.getElementById('mb-brand-list-container');
  if (container && (!mbState.profiles.length || forceRefresh)) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-dim);">
        <i class="fa-solid fa-spinner fa-spin" style="font-size: 1.8rem; margin-bottom: 10px; color: var(--primary);"></i>
        <div>Đang nạp hồ sơ thương hiệu và Brand DNA...</div>
      </div>
    `;
  }

  try {
    const res = await fetch('/api/marketing/brands?t=' + Date.now());
    const result = await res.json();
    if (!result.success || !result.data) {
      throw new Error(result.message || 'Không thể tải danh sách thương hiệu');
    }

    mbState.profiles = result.data;
    renderBrandQuickStats();
    renderBrandSelectorList();

    if (!mbState.activeBrandId && mbState.profiles.length > 0) {
      mbState.activeBrandId = mbState.profiles[0].id;
    }

    if (mbState.activeBrandId) {
      loadBrandProfileDetail(mbState.activeBrandId);
    }
  } catch (err) {
    console.error('Error loading brand profiles:', err);
    if (container) {
      container.innerHTML = `
        <div style="text-align: center; padding: 30px; color: #ef4444;">
          <i class="fa-solid fa-triangle-exclamation" style="font-size: 2rem; margin-bottom: 8px;"></i>
          <div>Lỗi: ${err.message}</div>
          <button class="btn btn-sm btn-primary mt-3" onclick="loadMarketingBrandProfiles(true)">Thử lại</button>
        </div>
      `;
    }
  }
}

// 2. THỐNG KÊ NHANH TRÊN ĐỈNH
function renderBrandQuickStats() {
  const totalProfilesEl = document.getElementById('mb-stat-total-brands');
  const totalPillarsEl = document.getElementById('mb-stat-total-pillars');
  const totalDnaEl = document.getElementById('mb-stat-total-dna');

  let totalPillars = 0;
  let totalDna = 0;

  mbState.profiles.forEach(p => {
    totalPillars += (p.pillars || []).length;
    if (p.hasDna) totalDna++;
  });

  if (totalProfilesEl) totalProfilesEl.textContent = mbState.profiles.length;
  if (totalPillarsEl) totalPillarsEl.textContent = totalPillars;
  if (totalDnaEl) totalDnaEl.textContent = `${totalDna} / ${mbState.profiles.length}`;
}

// 3. DANH SÁCH BRAND SELECTOR (SIDEBAR TRÁI)
function renderBrandSelectorList() {
  const container = document.getElementById('mb-brand-list-container');
  if (!container) return;

  if (mbState.profiles.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 30px 16px; color: var(--text-dim);">
        <i class="fa-solid fa-folder-open" style="font-size: 2rem; margin-bottom: 8px; opacity: 0.5;"></i>
        <div>Chưa có hồ sơ thương hiệu nào.</div>
        <button class="btn btn-sm btn-primary mt-3" onclick="openCreateBrandModal()">
          <i class="fa-solid fa-plus"></i> Tạo Profile Mới
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = mbState.profiles.map(p => {
    const isActive = mbState.activeBrandId === p.id;
    const pillarCount = (p.pillars || []).length;
    return `
      <div 
        class="mb-brand-item ${isActive ? 'active' : ''}" 
        onclick="selectActiveBrand('${p.id}')"
        style="padding: 12px 14px; border-radius: var(--radius-sm); margin-bottom: 8px; cursor: pointer; transition: all 0.2s; border: 1.5px solid ${isActive ? 'var(--primary)' : 'var(--border-color)'}; background: ${isActive ? 'rgba(59, 130, 246, 0.08)' : 'var(--bg-hover)'};"
      >
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <strong style="color: var(--text-main); font-size: 0.88rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${escapeHtml(p.brandName)}
          </strong>
          ${p.hasDna 
            ? '<span class="badge-pill success" style="font-size: 0.65rem; padding: 1px 6px;"><i class="fa-solid fa-dna"></i> DNA</span>'
            : '<span class="badge-pill secondary" style="font-size: 0.65rem; padding: 1px 6px;">Chưa DNA</span>'}
        </div>
        <div style="font-size: 0.74rem; color: var(--text-dim); margin-top: 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${escapeHtml(p.tagline || p.description || 'Chưa có mô tả')}
        </div>
        <div style="display: flex; gap: 8px; font-size: 0.7rem; color: var(--text-muted); margin-top: 6px;">
          <span><i class="fa-solid fa-layer-group"></i> ${pillarCount} Pillars</span>
          <span>&bull;</span>
          <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(p.location || 'Toàn quốc')}</span>
        </div>
      </div>
    `;
  }).join('');
}

function selectActiveBrand(brandId) {
  mbState.activeBrandId = brandId;
  renderBrandSelectorList();
  loadBrandProfileDetail(brandId);
}

// 4. CHI TIẾT BRAND PROFILE ĐANG CHỌN (KHU VỰC CHÍNH)
async function loadBrandProfileDetail(brandId) {
  const detailContainer = document.getElementById('mb-brand-detail-container');
  if (!detailContainer) return;

  detailContainer.innerHTML = `
    <div style="text-align: center; padding: 60px; color: var(--text-dim);">
      <i class="fa-solid fa-spinner fa-spin" style="font-size: 2rem; margin-bottom: 12px; color: var(--primary);"></i>
      <div>Đang nạp chi tiết Brand Profile & DNA...</div>
    </div>
  `;

  try {
    const res = await fetch(`/api/marketing/brands/${brandId}?t=` + Date.now());
    const result = await res.json();
    if (!result.success || !result.data) throw new Error(result.message || 'Không thể tải chi tiết');

    mbState.currentProfileData = result.data;
    renderBrandDetailContent();
  } catch (err) {
    detailContainer.innerHTML = `
      <div style="text-align: center; padding: 40px; color: #ef4444;">
        Lỗi nạp chi tiết: ${err.message}
      </div>
    `;
  }
}

function switchBrandDetailTab(tabName) {
  mbState.activeDetailTab = tabName;
  renderBrandDetailContent();
}

function renderBrandDetailContent() {
  const container = document.getElementById('mb-brand-detail-container');
  if (!container || !mbState.currentProfileData) return;

  const p = mbState.currentProfileData;
  const dna = p.dna;

  container.innerHTML = `
    <!-- HEADER CHI TIẾT PROFILE -->
    <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 20px; margin-bottom: 20px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 12px;">
        <div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <h2 style="font-size: 1.25rem; font-weight: 800; margin: 0; color: var(--text-main);">
              <i class="fa-solid fa-flag text-primary"></i> ${escapeHtml(p.brandName)}
            </h2>
            <span class="badge-pill info" style="font-size: 0.72rem; padding: 2px 8px;">
              Page ID: ${escapeHtml(p.pageId || 'Chưa gán')}
            </span>
            ${p.dna ? '<span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 8px;"><i class="fa-solid fa-circle-check"></i> Đã Có Writing DNA</span>' : ''}
          </div>
          <div style="font-size: 0.83rem; color: var(--text-dim); margin-top: 4px;">
            <strong>Tagline:</strong> "${escapeHtml(p.tagline || 'Đang cập nhật')}" &bull; <strong>Địa bàn:</strong> ${escapeHtml(p.location || 'Toàn quốc')}
          </div>
          <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 4px; max-width: 800px;">
            ${escapeHtml(p.description || '')}
          </div>
        </div>

        <div style="display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn btn-sm btn-outline-primary" onclick="openAnalyzePastPostsModal('${p.id}')">
            <i class="fa-solid fa-dna"></i> Phân Tích Bài Viết Cũ (DNA)
          </button>
          <button class="btn btn-sm btn-secondary" onclick="openEditBrandModal('${p.id}')">
            <i class="fa-solid fa-pen"></i> Chỉnh Sửa Profile
          </button>
          <button class="btn btn-sm btn-outline-danger" onclick="deleteBrandProfile('${p.id}')" title="Xóa thương hiệu này">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>

      <!-- TABS ĐIỀU HƯỚNG BÊN TRONG PROFILE -->
      <div style="display: flex; gap: 6px; border-bottom: 1px solid var(--border-color); margin-top: 18px; padding-bottom: 10px; flex-wrap: wrap;">
        <button class="btn btn-sm ${mbState.activeDetailTab === 'overview' ? 'btn-primary' : 'btn-secondary'}" onclick="switchBrandDetailTab('overview')">
          <i class="fa-solid fa-users"></i> Đối Tượng &amp; Định Vị
        </button>
        <button class="btn btn-sm ${mbState.activeDetailTab === 'pillars' ? 'btn-primary' : 'btn-secondary'}" onclick="switchBrandDetailTab('pillars')">
          <i class="fa-solid fa-chart-pie"></i> Ma Trận Content Pillars (${(p.pillars || []).length})
        </button>
        <button class="btn btn-sm ${mbState.activeDetailTab === 'rules' ? 'btn-primary' : 'btn-secondary'}" onclick="switchBrandDetailTab('rules')">
          <i class="fa-solid fa-shield-halved"></i> Quy Tắc Viết &amp; Chống "Mùi AI"
        </button>
        <button class="btn btn-sm ${mbState.activeDetailTab === 'dna' ? 'btn-primary' : 'btn-secondary'}" onclick="switchBrandDetailTab('dna')">
          <i class="fa-solid fa-dna"></i> Brand Writing DNA &amp; Mẫu
        </button>
      </div>
    </div>

    <!-- NỘI DUNG TỪNG TAB -->
    <div id="mb-tab-content-area">
      ${renderActiveTabBody(p, dna)}
    </div>
  `;
}

function renderActiveTabBody(p, dna) {
  if (mbState.activeDetailTab === 'overview') {
    const aud = p.targetAudience || {};
    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm);">
          <h4 style="font-size: 0.92rem; color: var(--text-main); margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-id-badge text-primary"></i> Chân Dung Độc Giả Mục Tiêu (Target Persona)
          </h4>
          <p style="font-size: 0.82rem; color: var(--text-dim); line-height: 1.6; margin: 0;">
            ${escapeHtml(aud.persona || 'Chưa thiết lập chân dung độc giả.')}
          </p>
        </div>

        <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm);">
          <h4 style="font-size: 0.92rem; color: #ef4444; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-triangle-exclamation"></i> Nỗi Đau &amp; Vấn Đề Cần Giải Quyết (Pain Points)
          </h4>
          <p style="font-size: 0.82rem; color: var(--text-dim); line-height: 1.6; margin: 0;">
            ${escapeHtml(aud.painPoints || 'Chưa thiết lập nỗi đau độc giả.')}
          </p>
        </div>

        <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm); grid-column: 1 / -1;">
          <h4 style="font-size: 0.92rem; color: #10b981; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-bullseye"></i> Mong Muốn &amp; Giá Trị Tìm Kiếm (Desires)
          </h4>
          <p style="font-size: 0.82rem; color: var(--text-dim); line-height: 1.6; margin: 0;">
            ${escapeHtml(aud.desires || 'Chưa thiết lập mong muốn độc giả.')}
          </p>
        </div>
      </div>
    `;
  }

  if (mbState.activeDetailTab === 'pillars') {
    const pillars = p.pillars || [];
    const totalPct = pillars.reduce((s, item) => s + (item.percentage || 0), 0);

    return `
      <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: var(--radius-sm);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 10px;">
          <div>
            <strong style="color: var(--text-main); font-size: 0.95rem;">Ma Trận Phân Bổ Content Pillars</strong>
            <div style="font-size: 0.78rem; color: var(--text-dim); margin-top: 2px;">
              Tỷ lệ này quyết định số lượng bài viết AI sẽ tự động phân bổ khi lập kế hoạch 7/14/30 ngày.
            </div>
          </div>
          <div style="display: flex; align-items: center; gap: 10px;">
            <span class="badge-pill ${totalPct === 100 ? 'success' : 'danger'}" style="font-size: 0.8rem; padding: 4px 10px;">
              Tổng: ${totalPct}% ${totalPct === 100 ? '✓ Chuẩn' : '⚠ Cần đúng 100%'}
            </span>
            <button class="btn btn-sm btn-primary" onclick="openPillarsEditorModal('${p.id}')">
              <i class="fa-solid fa-sliders"></i> Chỉnh Sửa Trọng Số Pillars
            </button>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 12px;">
          ${pillars.map(pil => `
            <div style="background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 16px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                <div style="font-weight: 700; color: var(--text-main); font-size: 0.86rem;">
                  ${escapeHtml(pil.name)}
                </div>
                <div style="font-weight: 800; color: var(--primary); font-size: 0.92rem;">
                  ${pil.percentage}%
                </div>
              </div>
              <div style="background: rgba(255,255,255,0.08); height: 8px; border-radius: 4px; overflow: hidden; margin-bottom: 8px;">
                <div style="width: ${pil.percentage}%; background: linear-gradient(90deg, #3b82f6 0%, #10b981 100%); height: 100%; border-radius: 4px;"></div>
              </div>
              <div style="font-size: 0.76rem; color: var(--text-dim);">
                ${escapeHtml(pil.description || 'Chưa có mô tả định hướng')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  if (mbState.activeDetailTab === 'rules') {
    const tone = p.toneOfVoice || {};
    const style = p.writingStyle || {};
    const rules = p.contentRules || {};
    const cta = p.ctaRules || {};
    const vocab = p.vocabularyPreferences || {};
    const forbidden = p.forbiddenPatterns || [];

    return `
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
        
        <!-- Tone & Giọng Văn -->
        <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm);">
          <h4 style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-microphone-lines text-primary"></i> Tone of Voice (Âm Hưởng Giọng Văn)
          </h4>
          <div style="font-size: 0.8rem; margin-bottom: 6px;"><strong>Giọng chính:</strong> <span style="color: #60a5fa;">${escapeHtml(tone.primary || '--')}</span></div>
          <div style="font-size: 0.8rem; margin-bottom: 6px;"><strong>Giọng phụ:</strong> <span style="color: var(--text-dim);">${escapeHtml(tone.secondary || '--')}</span></div>
          <div style="font-size: 0.8rem; color: #ef4444;"><strong>Tuyệt đối cấm giọng:</strong> ${escapeHtml(tone.forbiddenTone || '--')}</div>
        </div>

        <!-- Nhịp Điệu & Cấu Trúc -->
        <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm);">
          <h4 style="font-size: 0.9rem; color: var(--text-main); margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-pen-ruler text-info"></i> Nhịp Điệu &amp; Độ Dài Bài Viết
          </h4>
          <div style="font-size: 0.8rem; margin-bottom: 6px;"><strong>Độ dài bài:</strong> ${escapeHtml(rules.postLength || '200 - 350 từ')}</div>
          <div style="font-size: 0.8rem; margin-bottom: 6px;"><strong>Ngôi xưng hô:</strong> ${escapeHtml(style.perspective || 'Ngôi thứ nhất')}</div>
          <div style="font-size: 0.8rem; margin-bottom: 6px;"><strong>Giới hạn Emoji:</strong> Tối đa ${rules.maxEmojis || 3} icon / bài</div>
          <div style="font-size: 0.78rem; color: var(--text-dim);">${escapeHtml(style.sentenceLength || '')}</div>
        </div>

        <!-- Chống Mùi AI (Forbidden Lexicon & Patterns) -->
        <div class="panel" style="background: var(--bg-card); border: 1px solid rgba(239, 68, 68, 0.3); padding: 18px; border-radius: var(--radius-sm); grid-column: 1 / -1;">
          <h4 style="font-size: 0.9rem; color: #ef4444; margin-bottom: 10px; display: flex; align-items: center; gap: 8px;">
            <i class="fa-solid fa-ban"></i> Bộ Lọc Chống "Văn Phong AI" (Anti-AI Guard)
          </h4>
          <div style="font-size: 0.78rem; color: var(--text-dim); margin-bottom: 10px;">
            Các mẫu câu và cụm từ sau đây sẽ bị hệ thống AI chặn đứng hoàn toàn, không xuất hiện trong bất kỳ bài viết nào:
          </div>
          <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px;">
            ${forbidden.map(pat => `
              <span style="font-size: 0.75rem; background: rgba(239, 68, 68, 0.1); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3); padding: 3px 8px; border-radius: 4px;">
                <i class="fa-solid fa-xmark"></i> "${escapeHtml(pat)}"
              </span>
            `).join('')}
          </div>
          <div style="font-size: 0.78rem; color: var(--text-muted);">
            <strong>Từ cấm lạm dụng:</strong> ${(vocab.forbiddenTerms || []).map(t => `<code style="color: #f87171; margin-right: 4px;">${escapeHtml(t)}</code>`).join(' ')}
          </div>
        </div>

      </div>
    `;
  }

  if (mbState.activeDetailTab === 'dna') {
    if (!dna) {
      return `
        <div class="panel" style="text-align: center; padding: 40px 20px; background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: var(--radius-md);">
          <i class="fa-solid fa-dna" style="font-size: 2.8rem; color: var(--primary); opacity: 0.6; margin-bottom: 12px; display: block;"></i>
          <h3 style="font-size: 1.05rem; color: var(--text-main); margin-bottom: 6px;">Chưa Trích Xuất Brand Writing DNA</h3>
          <p style="font-size: 0.8rem; color: var(--text-dim); max-width: 600px; margin: 0 auto 18px auto;">
            Hãy nhập vào 3 - 10 bài viết cũ có tương tác tốt của Fanpage này. AI sẽ tự động phân tích độ dài câu, cấu trúc mở bài (hook), tần suất dùng từ và nhịp điệu người thật để tạo DNA độc quyền cho Brand.
          </p>
          <button class="btn btn-primary" onclick="openAnalyzePastPostsModal('${p.id}')">
            <i class="fa-solid fa-upload"></i> Nạp Bài Viết Cũ &amp; Phân Tích DNA
          </button>
        </div>
      `;
    }

    const m = dna.metrics || {};
    return `
      <div style="display: flex; flex-direction: column; gap: 16px;">
        <!-- Card tổng kết DNA -->
        <div class="panel" style="background: linear-gradient(135deg, rgba(59, 130, 246, 0.1) 0%, rgba(16, 185, 129, 0.08) 100%); border: 1.5px solid rgba(59, 130, 246, 0.3); padding: 18px; border-radius: var(--radius-sm);">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <strong style="color: #60a5fa; font-size: 0.95rem; display: flex; align-items: center; gap: 8px;">
              <i class="fa-solid fa-dna"></i> Tổng Kết Brand Writing DNA
            </strong>
            <span class="badge-pill success" style="font-size: 0.72rem; padding: 2px 8px;">
              Dựa trên ${dna.totalPostsAnalyzed} bài viết đã phân tích
            </span>
          </div>
          <p style="font-size: 0.84rem; color: var(--text-main); margin-bottom: 12px; line-height: 1.6;">
            ${escapeHtml(dna.dnaSummary || '')}
          </p>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px;">
            <div style="background: var(--bg-card); padding: 10px; border-radius: 6px; text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-dim);">ĐIỂM NHỊP ĐIỆU NGƯỜI THẬT</div>
              <div style="font-size: 1.3rem; font-weight: 800; color: #10b981; margin-top: 2px;">${m.humanRhythmScore || 85} / 100</div>
            </div>
            <div style="background: var(--bg-card); padding: 10px; border-radius: 6px; text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-dim);">TRUNG BÌNH TỪ / BÀI</div>
              <div style="font-size: 1.3rem; font-weight: 800; color: #3b82f6; margin-top: 2px;">${m.avgWordsPerPost || 0} từ</div>
            </div>
            <div style="background: var(--bg-card); padding: 10px; border-radius: 6px; text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-dim);">TRUNG BÌNH TỪ / CÂU</div>
              <div style="font-size: 1.3rem; font-weight: 800; color: #f59e0b; margin-top: 2px;">${m.avgWordsPerSentence || 0} từ</div>
            </div>
            <div style="background: var(--bg-card); padding: 10px; border-radius: 6px; text-align: center;">
              <div style="font-size: 0.7rem; color: var(--text-dim);">MỨC ĐỘ TRANG TRỌNG</div>
              <div style="font-size: 1.3rem; font-weight: 800; color: #ec4899; margin-top: 2px;">${m.formalityScore || 5} / 10</div>
            </div>
          </div>
        </div>

        <!-- Quy tắc học được & Hook mẫu -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 16px;">
          <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm);">
            <h4 style="font-size: 0.88rem; color: var(--text-main); margin-bottom: 10px;">
              <i class="fa-solid fa-list-check text-success"></i> Các Quy Tắc Viết AI Đã Trích Xuất:
            </h4>
            <ul style="font-size: 0.8rem; color: var(--text-dim); padding-left: 18px; margin: 0; line-height: 1.8;">
              ${(dna.extractedRules || []).map(r => `<li>${escapeHtml(r)}</li>`).join('')}
            </ul>
          </div>

          <div class="panel" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 18px; border-radius: var(--radius-sm);">
            <h4 style="font-size: 0.88rem; color: var(--text-main); margin-bottom: 10px;">
              <i class="fa-solid fa-quote-left text-warning"></i> Câu Mở Đầu (Hook) Tiêu Biểu:
            </h4>
            <div style="display: flex; flex-direction: column; gap: 8px;">
              ${(dna.hooks || []).map(h => `
                <div style="font-size: 0.78rem; font-style: italic; color: #60a5fa; background: var(--bg-hover); padding: 6px 10px; border-radius: 4px; border-left: 3px solid #3b82f6;">
                  "${escapeHtml(h)}"
                </div>
              `).join('')}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  return '';
}

// 5. MODAL TẠO BRAND PROFILE MỚI
function openCreateBrandModal() {
  let modal = document.getElementById('mb-create-brand-modal');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'mb-create-brand-modal';
    div.className = 'modal-overlay';
    div.style.zIndex = '9999';
    div.innerHTML = `
      <div class="modal-card" style="max-width: 650px; width: 92vw; max-height: 88vh; display: flex; flex-direction: column; background: var(--bg-card); padding: 22px; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
          <strong style="color: var(--text-main); font-size: 1.05rem;">
            <i class="fa-solid fa-plus text-primary"></i> Tạo Brand Profile Cho Fanpage Mới
          </strong>
          <button class="btn-close" onclick="closeCreateBrandModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <form id="mb-create-brand-form" onsubmit="handleCreateBrandSubmit(event)" style="flex: 1; overflow-y: auto; padding-right: 6px;">
          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Tên Thương Hiệu (Brand Name) *</label>
            <input type="text" id="mb-input-brandName" class="form-control" placeholder="Ví dụ: VHFresh - Thực Phẩm Sạch" required style="width: 100%; font-size: 0.84rem; padding: 7px 10px;">
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 12px;">
            <div>
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Page ID (Facebook)</label>
              <input type="text" id="mb-input-pageId" class="form-control" placeholder="61580123456789" style="width: 100%; font-size: 0.84rem; padding: 7px 10px;">
            </div>
            <div>
              <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Khu Vực / Địa Bàn</label>
              <input type="text" id="mb-input-location" class="form-control" placeholder="Toàn quốc hoặc Hà Nội / HCM" style="width: 100%; font-size: 0.84rem; padding: 7px 10px;">
            </div>
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Khẩu Hiệu / Tagline</label>
            <input type="text" id="mb-input-tagline" class="form-control" placeholder="Ví dụ: Tươi ngon từ nông trại tới mâm cơm" style="width: 100%; font-size: 0.84rem; padding: 7px 10px;">
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Mô Tả Thương Hiệu</label>
            <textarea id="mb-input-description" class="form-control" rows="2" placeholder="Tóm tắt lĩnh vực hoạt động, sản phẩm, dịch vụ..." style="width: 100%; font-size: 0.84rem; padding: 7px 10px;"></textarea>
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Chân Dung Độc Giả (Target Audience Persona)</label>
            <textarea id="mb-input-persona" class="form-control" rows="2" placeholder="Độ tuổi, thói quen, mối quan tâm..." style="width: 100%; font-size: 0.84rem; padding: 7px 10px;"></textarea>
          </div>

          <div style="margin-bottom: 12px;">
            <label style="display: block; font-size: 0.8rem; font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Tone of Voice (Giọng Văn Chính)</label>
            <input type="text" id="mb-input-tone" class="form-control" placeholder="Ví dụ: Tự nhiên, gần gũi, đời thường, không văn phong AI" style="width: 100%; font-size: 0.84rem; padding: 7px 10px;">
          </div>

          <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border-color); padding-top: 12px; margin-top: 16px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="closeCreateBrandModal()">Hủy</button>
            <button type="submit" class="btn btn-primary btn-sm" style="background: linear-gradient(135deg, #10b981 0%, #059669 100%);">
              <i class="fa-solid fa-check"></i> Lưu &amp; Khởi Tạo Profile
            </button>
          </div>
        </form>
      </div>
    `;
    document.body.appendChild(div);
    modal = div;
  }

  modal.style.display = 'flex';
  modal.classList.add('active');
}

function closeCreateBrandModal() {
  const modal = document.getElementById('mb-create-brand-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

async function handleCreateBrandSubmit(e) {
  e.preventDefault();
  const brandName = document.getElementById('mb-input-brandName').value.trim();
  const pageId = document.getElementById('mb-input-pageId').value.trim();
  const location = document.getElementById('mb-input-location').value.trim();
  const tagline = document.getElementById('mb-input-tagline').value.trim();
  const description = document.getElementById('mb-input-description').value.trim();
  const persona = document.getElementById('mb-input-persona').value.trim();
  const tone = document.getElementById('mb-input-tone').value.trim();

  try {
    const res = await fetch('/api/marketing/brands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandName,
        pageId,
        location,
        tagline,
        description,
        targetAudience: { persona },
        toneOfVoice: { primary: tone || 'Tự nhiên, đời thường' }
      })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Lỗi khi tạo Brand Profile');

    if (typeof showToast === 'function') {
      showToast('Thành công', 'Đã khởi tạo Brand Profile mới!', 'success');
    }
    closeCreateBrandModal();
    mbState.activeBrandId = result.data.id;
    loadMarketingBrandProfiles(true);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi', err.message, 'danger');
  }
}

// 6. MODAL PHÂN TÍCH BÀI VIẾT CŨ ĐỂ TRÍCH XUẤT DNA
function openAnalyzePastPostsModal(brandId) {
  let modal = document.getElementById('mb-analyze-dna-modal');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'mb-analyze-dna-modal';
    div.className = 'modal-overlay';
    div.style.zIndex = '9999';
    div.innerHTML = `
      <div class="modal-card" style="max-width: 680px; width: 92vw; background: var(--bg-card); padding: 22px; border-radius: var(--radius-md);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
          <strong style="color: var(--text-main); font-size: 1.05rem;">
            <i class="fa-solid fa-dna text-primary"></i> Nạp Bài Viết Cũ &amp; Trích Xuất Brand Writing DNA
          </strong>
          <button class="btn-close" onclick="closeAnalyzePastPostsModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>

        <p style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 12px; line-height: 1.5;">
          Dán nội dung <strong>3 đến 10 bài viết cũ</strong> đã từng đăng trên Fanpage (mỗi bài phân cách bằng dòng <code style="color: #60a5fa;">---</code>). AI sẽ tự động phân tích độ dài câu, phong cách mở bài, nhịp điệu hành văn thực tế để khóa cấu trúc văn phong cho Brand này.
        </p>

        <textarea 
          id="mb-dna-posts-textarea" 
          class="form-control" 
          rows="12" 
          placeholder="Bài viết 1...&#10;---&#10;Bài viết 2...&#10;---&#10;Bài viết 3..." 
          style="width: 100%; font-family: inherit; font-size: 0.84rem; padding: 10px; margin-bottom: 14px;"
        ></textarea>

        <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px;">
          <span style="font-size: 0.75rem; color: var(--text-muted);">
            Tối thiểu 1 bài, khuyến khích 3 - 5 bài viết thực tế.
          </span>
          <div style="display: flex; gap: 8px;">
            <button class="btn btn-secondary btn-sm" onclick="closeAnalyzePastPostsModal()">Đóng</button>
            <button class="btn btn-primary btn-sm" id="mb-btn-run-dna" onclick="submitAnalyzePastPosts('${brandId}')" style="background: linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);">
              <i class="fa-solid fa-brain"></i> Bắt Đầu Phân Tích DNA
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(div);
    modal = div;
  }

  modal.style.display = 'flex';
  modal.classList.add('active');
}

function closeAnalyzePastPostsModal() {
  const modal = document.getElementById('mb-analyze-dna-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

async function submitAnalyzePastPosts(brandId) {
  const textarea = document.getElementById('mb-dna-posts-textarea');
  const btn = document.getElementById('mb-btn-run-dna');
  if (!textarea || !textarea.value.trim()) {
    if (typeof showToast === 'function') showToast('Cảnh báo', 'Vui lòng dán ít nhất 1 bài viết cũ để phân tích.', 'warning');
    return;
  }

  const posts = textarea.value.split(/\n---+\n/).map(t => t.trim()).filter(Boolean);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích nhịp điệu...';
  }

  try {
    const res = await fetch(`/api/marketing/brands/${brandId}/analyze-posts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ posts })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Lỗi phân tích DNA');

    if (typeof showToast === 'function') {
      showToast('Thành công', 'Đã phân tích và trích xuất Brand Writing DNA thành công!', 'success');
    }
    closeAnalyzePastPostsModal();
    mbState.activeDetailTab = 'dna';
    loadBrandProfileDetail(brandId);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi', err.message, 'danger');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-brain"></i> Bắt Đầu Phân Tích DNA';
    }
  }
}

// 7. MODAL CHỈNH SỬA CONTENT PILLARS
function openPillarsEditorModal(brandId) {
  const p = mbState.currentProfileData;
  if (!p) return;

  const pillars = p.pillars || [];
  let modal = document.getElementById('mb-edit-pillars-modal');
  if (!modal) {
    const div = document.createElement('div');
    div.id = 'mb-edit-pillars-modal';
    div.className = 'modal-overlay';
    div.style.zIndex = '9999';
    document.body.appendChild(div);
    modal = div;
  }

  modal.innerHTML = `
    <div class="modal-card" style="max-width: 620px; width: 92vw; background: var(--bg-card); padding: 22px; border-radius: var(--radius-md);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; border-bottom: 1px solid var(--border-color); padding-bottom: 10px;">
        <strong style="color: var(--text-main); font-size: 1.05rem;">
          <i class="fa-solid fa-sliders text-primary"></i> Điều Chỉnh Ma Trận Content Pillars
        </strong>
        <button class="btn-close" onclick="closePillarsEditorModal()"><i class="fa-solid fa-xmark"></i></button>
      </div>

      <div style="font-size: 0.8rem; color: var(--text-dim); margin-bottom: 14px;">
        Tổng tỷ lệ phần trăm các Content Pillars <strong>bắt buộc phải bằng đúng 100%</strong>.
      </div>

      <div id="mb-pillars-inputs-list" style="max-height: 50vh; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px;">
        ${pillars.map((pil, idx) => `
          <div style="background: var(--bg-hover); padding: 10px 12px; border-radius: 6px; border: 1px solid var(--border-color); display: grid; grid-template-columns: 1fr 90px; gap: 10px; align-items: center;">
            <div>
              <input type="text" class="form-control mb-pil-name" value="${escapeHtml(pil.name)}" style="font-size: 0.84rem; padding: 5px 8px; font-weight: 600;">
              <input type="text" class="form-control mb-pil-desc" value="${escapeHtml(pil.description || '')}" placeholder="Mô tả..." style="font-size: 0.74rem; padding: 4px 8px; margin-top: 4px;">
            </div>
            <div>
              <div style="display: flex; align-items: center; gap: 4px;">
                <input type="number" class="form-control mb-pil-pct" value="${pil.percentage}" min="1" max="100" oninput="updatePillarsTotalSum()" style="font-size: 0.9rem; font-weight: 800; padding: 5px; text-align: center;">
                <span style="font-size: 0.85rem; font-weight: 700;">%</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>

      <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid var(--border-color); padding-top: 12px;">
        <div style="font-size: 0.85rem; font-weight: 700;">
          Tổng cộng: <span id="mb-pillars-sum-display">100%</span>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-secondary btn-sm" onclick="closePillarsEditorModal()">Hủy</button>
          <button class="btn btn-primary btn-sm" onclick="savePillarsChanges('${brandId}')">
            <i class="fa-solid fa-check"></i> Lưu Trọng Số
          </button>
        </div>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
  modal.classList.add('active');
  updatePillarsTotalSum();
}

function updatePillarsTotalSum() {
  const pcts = document.querySelectorAll('.mb-pil-pct');
  let sum = 0;
  pcts.forEach(input => { sum += parseInt(input.value, 10) || 0; });

  const disp = document.getElementById('mb-pillars-sum-display');
  if (disp) {
    disp.textContent = sum + '%';
    disp.style.color = sum === 100 ? '#10b981' : '#ef4444';
  }
}

function closePillarsEditorModal() {
  const modal = document.getElementById('mb-edit-pillars-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

async function savePillarsChanges(brandId) {
  const names = document.querySelectorAll('.mb-pil-name');
  const descs = document.querySelectorAll('.mb-pil-desc');
  const pcts = document.querySelectorAll('.mb-pil-pct');

  const updatedPillars = [];
  let sum = 0;
  for (let i = 0; i < names.length; i++) {
    const percentage = parseInt(pcts[i].value, 10) || 0;
    sum += percentage;
    updatedPillars.push({
      id: `pil_${Date.now()}_${i}`,
      name: names[i].value.trim(),
      description: descs[i].value.trim(),
      percentage
    });
  }

  if (sum !== 100) {
    if (typeof showToast === 'function') {
      showToast('Lỗi trọng số', `Tổng tỷ lệ phần trăm phải bằng đúng 100% (Hiện tại là ${sum}%).`, 'warning');
    }
    return;
  }

  try {
    const res = await fetch(`/api/marketing/brands/${brandId}/pillars`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pillars: updatedPillars })
    });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Lỗi khi cập nhật pillars');

    if (typeof showToast === 'function') showToast('Thành công', 'Đã cập nhật ma trận Content Pillars!', 'success');
    closePillarsEditorModal();
    loadBrandProfileDetail(brandId);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi', err.message, 'danger');
  }
}

// 8. XÓA BRAND PROFILE
async function deleteBrandProfile(brandId) {
  if (!confirm('Bạn có chắc muốn xóa Brand Profile này không?')) return;
  try {
    const res = await fetch(`/api/marketing/brands/${brandId}`, { method: 'DELETE' });
    const result = await res.json();
    if (!result.success) throw new Error(result.message || 'Lỗi khi xóa profile');

    if (typeof showToast === 'function') showToast('Đã xóa', 'Brand Profile đã được xóa.', 'info');
    mbState.activeBrandId = null;
    loadMarketingBrandProfiles(true);
  } catch (err) {
    if (typeof showToast === 'function') showToast('Lỗi', err.message, 'danger');
  }
}

// Global Exports
window.loadMarketingBrandProfiles = loadMarketingBrandProfiles;
window.selectActiveBrand = selectActiveBrand;
window.switchBrandDetailTab = switchBrandDetailTab;
window.openCreateBrandModal = openCreateBrandModal;
window.closeCreateBrandModal = closeCreateBrandModal;
window.handleCreateBrandSubmit = handleCreateBrandSubmit;
window.openAnalyzePastPostsModal = openAnalyzePastPostsModal;
window.closeAnalyzePastPostsModal = closeAnalyzePastPostsModal;
window.submitAnalyzePastPosts = submitAnalyzePastPosts;
window.openPillarsEditorModal = openPillarsEditorModal;
window.closePillarsEditorModal = closePillarsEditorModal;
window.updatePillarsTotalSum = updatePillarsTotalSum;
window.savePillarsChanges = savePillarsChanges;
window.deleteBrandProfile = deleteBrandProfile;
