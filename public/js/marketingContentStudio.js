/**
 * marketingContentStudio.js - Frontend Controller Cho AI Content Studio (Phase 2)
 * Hỗ trợ sinh đề tài thông minh, tạo 3 góc nhìn nội dung, định hướng hình ảnh AI và kiểm định Anti-AI
 */

let studioCurrentBrandId = '';
let studioBrandsList = [];
let studioCurrentDraft = null;
let studioSuggestedTopics = [];

function studioToast(title, msg, type = 'info') {
  if (typeof showToast === 'function') {
    showToast(title, msg, type);
  } else {
    console.log(`[Toast] ${title}: ${msg}`);
  }
}

// Khởi tạo Studio khi chuyển tab
async function initMarketingStudio() {
  await loadStudioBrandList();
}

/**
 * Tải danh sách thương hiệu vào Selector của Studio
 */
async function loadStudioBrandList() {
  try {
    const res = await fetch('/api/marketing/brands');
    const json = await res.json();
    if (!json.success || !json.data || json.data.length === 0) {
      console.warn('Chưa có Brand Profile');
      return;
    }

    studioBrandsList = json.data;
    const selector = document.getElementById('ms-brand-selector');
    if (!selector) return;

    selector.innerHTML = studioBrandsList.map(b => `
      <option value="${b.id}" ${b.id === studioCurrentBrandId ? 'selected' : ''}>
        ${escapeHtml(b.brandName)} (${b.pillars?.length || 0} Pillars)
      </option>
    `).join('');

    if (!studioCurrentBrandId && studioBrandsList.length > 0) {
      studioCurrentBrandId = studioBrandsList[0].id;
    }

    updateStudioBrandMeta();
    await loadStudioTopics();
    await loadBrandDraftsHistory();
  } catch (err) {
    console.error('Lỗi loadStudioBrandList:', err);
  }
}

/**
 * Cập nhật thông tin nhanh của Brand được chọn (Tone, Pillars, DNA)
 */
function updateStudioBrandMeta() {
  const brand = studioBrandsList.find(b => b.id === studioCurrentBrandId);
  if (!brand) return;

  const metaEl = document.getElementById('ms-brand-meta-display');
  if (metaEl) {
    metaEl.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap; font-size: 0.8rem;">
        <span style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; padding: 3px 10px; border-radius: 6px; font-weight: 600; border: 1px solid rgba(59, 130, 246, 0.3);">
          <i class="fa-solid fa-microphone"></i> Tone: ${escapeHtml(brand.toneOfVoice?.primary || 'Tự nhiên')}
        </span>
        <span style="background: rgba(16, 185, 129, 0.15); color: #34d399; padding: 3px 10px; border-radius: 6px; font-weight: 600; border: 1px solid rgba(16, 185, 129, 0.3);">
          <i class="fa-solid fa-shield-halved"></i> Chống AI: Tối đa ${brand.contentRules?.maxEmojis || 3} Emojis
        </span>
        <span style="background: rgba(245, 158, 11, 0.15); color: #fbbf24; padding: 3px 10px; border-radius: 6px; font-weight: 600; border: 1px solid rgba(245, 158, 11, 0.3);">
          <i class="fa-solid fa-bullseye"></i> Đối tượng: ${escapeHtml(brand.targetAudience?.persona ? brand.targetAudience.persona.slice(0, 45) + '...' : 'Khách hàng')}
        </span>
      </div>
    `;
  }

  // Cập nhật Pillar dropdown
  const pillarSelect = document.getElementById('ms-pillar-filter');
  if (pillarSelect && brand.pillars) {
    pillarSelect.innerHTML = `<option value="">-- Tất cả Content Pillars (${brand.pillars.length}) --</option>` +
      brand.pillars.map(p => `
        <option value="${p.id}">${escapeHtml(p.name)} (${p.percentage}%)</option>
      `).join('');
  }
}

/**
 * Xử lý khi người dùng đổi Brand
 */
async function onStudioBrandChange(brandId) {
  studioCurrentBrandId = brandId;
  updateStudioBrandMeta();

  // Reset active inputs
  const titleInput = document.getElementById('ms-active-topic-title');
  const hookInput = document.getElementById('ms-active-topic-hook');
  const instructionInput = document.getElementById('ms-custom-instruction');
  const badge = document.getElementById('ms-active-pillar-badge');
  if (titleInput) titleInput.value = '';
  if (hookInput) hookInput.value = '';
  if (instructionInput) instructionInput.value = '';
  if (badge) badge.style.display = 'none';

  // Tải danh sách đề tài & lịch sử bản nháp
  await loadStudioTopics();
  await loadBrandDraftsHistory();

  // Kiểm tra xem có bản nháp nào trước đó không
  const container = document.getElementById('ms-3angles-container');
  if (container) {
    try {
      const res = await fetch(`/api/marketing/content/drafts?brandId=${brandId}`);
      const json = await res.json();
      if (json.data && json.data.length > 0) {
        studioCurrentDraft = json.data[0];
        if (titleInput) titleInput.value = studioCurrentDraft.topicTitle || '';
        render3AnglesView(studioCurrentDraft);
      } else {
        studioCurrentDraft = null;
        container.innerHTML = `
          <div style="grid-column: 1 / -1; background: var(--bg-card); border: 2px dashed var(--border-color); border-radius: 12px; padding: 50px 20px; text-align: center;">
            <div style="font-size: 2.5rem; color: var(--text-dim); margin-bottom: 12px;">
              <i class="fa-solid fa-newspaper"></i>
            </div>
            <h3 style="font-size: 1.1rem; font-weight: 700; color: var(--text-main); margin-bottom: 6px;">
              Chưa Có Bản Viết Nào Được Tạo Cho Thương Hiệu Này
            </h3>
            <p style="font-size: 0.83rem; color: var(--text-muted); max-width: 480px; margin: 0 auto 16px auto; line-height: 1.5;">
              Hãy chọn một đề tài gợi ý ở cột bên trái hoặc tự nhập chủ đề, sau đó bấm <strong>"TẠO 3 GÓC NHÌN NỘI DUNG"</strong>.
            </p>
          </div>
        `;
      }
    } catch (e) {
      studioCurrentDraft = null;
    }
  }
}

/**
 * Tải danh sách đề tài đã sinh
 */
async function loadStudioTopics() {
  if (!studioCurrentBrandId) return;
  const listEl = document.getElementById('ms-topics-container');
  if (!listEl) return;

  listEl.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; padding: 12px;"><i class="fa-solid fa-spinner fa-spin"></i> Đang tải danh sách đề tài...</div>`;

  try {
    const res = await fetch(`/api/marketing/topics?brandId=${studioCurrentBrandId}`);
    const json = await res.json();
    studioSuggestedTopics = json.data || [];

    if (studioSuggestedTopics.length === 0) {
      listEl.innerHTML = `
        <div style="background: var(--bg-hover); border: 1px dashed var(--border-color); border-radius: 8px; padding: 18px; text-align: center;">
          <div style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 8px;">Chưa có đề tài nào cho thương hiệu này.</div>
          <button class="btn btn-sm btn-primary" onclick="triggerGenerateTopics()">
            <i class="fa-solid fa-wand-magic-sparkles"></i> AI Tự Động Sinh 4 Đề Tài
          </button>
        </div>
      `;
      return;
    }

    listEl.innerHTML = studioSuggestedTopics.slice(0, 8).map((top, idx) => `
      <div class="ms-topic-card" onclick="selectTopicForStudio(${idx})" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px 14px; cursor: pointer; transition: all 0.2s ease; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
          <span style="font-size: 0.7rem; font-weight: 700; color: #60a5fa; background: rgba(59, 130, 246, 0.12); padding: 2px 7px; border-radius: 4px;">
            ${escapeHtml(top.pillarName || 'Pillar')}
          </span>
          <span style="font-size: 0.68rem; font-weight: 700; color: #10b981; background: rgba(16, 185, 129, 0.12); padding: 2px 6px; border-radius: 4px;">
            <i class="fa-solid fa-fire"></i> ${top.estimatedEngagementScore || 85} điểm
          </span>
        </div>
        <div style="font-size: 0.85rem; font-weight: 700; color: var(--text-main); line-height: 1.4;">
          ${escapeHtml(top.title)}
        </div>
        <div style="font-size: 0.74rem; color: var(--text-muted); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">
          <em>${escapeHtml(top.angle || top.suggestedHook || '')}</em>
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
          <span style="font-size: 0.68rem; color: var(--text-dim);"><i class="fa-solid fa-bullseye"></i> ${escapeHtml(top.objective || 'Tương tác')}</span>
          <span style="font-size: 0.72rem; color: #3b82f6; font-weight: 600;">Chọn đề tài này <i class="fa-solid fa-arrow-right"></i></span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    listEl.innerHTML = `<div style="color: #ef4444; font-size: 0.8rem; padding: 10px;">Lỗi: ${err.message}</div>`;
  }
}

/**
 * Kích hoạt sinh đề tài mới
 */
async function triggerGenerateTopics() {
  if (!studioCurrentBrandId) return;

  const btn = document.getElementById('ms-btn-gen-topics');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang phân tích Brand &amp; Pillars...`;
  }

  const pillarId = document.getElementById('ms-pillar-filter')?.value || null;
  const customContext = document.getElementById('ms-topic-context-input')?.value || '';
  const objective = document.getElementById('ms-objective-filter')?.value || null;

  try {
    const res = await fetch('/api/marketing/topics/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId: studioCurrentBrandId,
        pillarId,
        count: 5,
        customContext,
        objective
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    studioToast('Đã Sinh Đề Tài', `Đã sinh thành công ${json.data.length} đề tài sáng tạo mới!`, 'success');
    await loadStudioTopics();
  } catch (err) {
    alert('Lỗi sinh đề tài: ' + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fa-solid fa-wand-magic-sparkles"></i> AI Sinh Đề Tài`;
    }
  }
}

/**
 * Chọn một đề tài từ danh sách đưa vào khung soạn thảo Studio
 */
function selectTopicForStudio(index) {
  const top = studioSuggestedTopics[index];
  if (!top) return;

  const titleInput = document.getElementById('ms-active-topic-title');
  const hookInput = document.getElementById('ms-active-topic-hook');
  const pillarBadge = document.getElementById('ms-active-pillar-badge');

  if (titleInput) titleInput.value = top.title;
  if (hookInput) hookInput.value = top.suggestedHook || '';
  if (pillarBadge) {
    pillarBadge.textContent = top.pillarName;
    pillarBadge.style.display = 'inline-block';
  }

  // Cuộn nhẹ xuống khu vực tạo nội dung
  document.getElementById('ms-content-action-box')?.scrollIntoView({ behavior: 'smooth' });
}

/**
 * KÍCH HOẠT SINH 3 GÓC NHÌN NỘI DUNG (AI 3 ANGLES ENGINE)
 */
async function triggerGenerate3Angles() {
  if (!studioCurrentBrandId) {
    alert('Vui lòng chọn Brand Profile!');
    return;
  }

  const topicTitle = document.getElementById('ms-active-topic-title')?.value.trim();
  if (!topicTitle) {
    alert('Vui lòng nhập hoặc chọn một Đề tài (Topic) bài viết trước!');
    document.getElementById('ms-active-topic-title')?.focus();
    return;
  }

  const topicHook = document.getElementById('ms-active-topic-hook')?.value.trim();
  const customInstruction = document.getElementById('ms-custom-instruction')?.value.trim();
  const pillarName = document.getElementById('ms-active-pillar-badge')?.textContent || '';

  const btn = document.getElementById('ms-btn-gen-content');
  const loader = document.getElementById('ms-content-generating-loader');
  const resultContainer = document.getElementById('ms-3angles-container');

  if (btn) btn.disabled = true;
  if (loader) loader.style.display = 'flex';
  if (resultContainer) resultContainer.style.opacity = '0.4';

  try {
    const res = await fetch('/api/marketing/content/generate-angles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        brandId: studioCurrentBrandId,
        topic: {
          title: topicTitle,
          suggestedHook: topicHook,
          pillarName: pillarName
        },
        customInstruction
      })
    });

    const json = await res.json();
    if (!json.success) throw new Error(json.message);

    studioCurrentDraft = json.data;
    render3AnglesView(studioCurrentDraft);
    await loadBrandDraftsHistory();

    studioToast('Hoàn Tất Viết Bài', 'Đã tạo thành công 3 góc nhìn nội dung kèm Visual Direction!', 'success');
  } catch (err) {
    alert('Lỗi tạo nội dung: ' + err.message);
  } finally {
    if (btn) btn.disabled = false;
    if (loader) loader.style.display = 'none';
    if (resultContainer) resultContainer.style.opacity = '1';
  }
}

/**
 * Hiển thị giao diện 3 cột so sánh (Storytelling, Educational, Conversational)
 */
function render3AnglesView(draft) {
  const container = document.getElementById('ms-3angles-container');
  if (!container || !draft || !draft.variants) return;

  container.innerHTML = draft.variants.map((v, idx) => {
    const isSelected = draft.selectedVariantIndex === idx;
    const scoreColor = v.qualityScore >= 90 ? '#10b981' : (v.qualityScore >= 80 ? '#3b82f6' : '#f59e0b');

    return `
      <div class="ms-angle-column ${isSelected ? 'selected-variant' : ''}" id="ms-variant-col-${idx}" style="background: var(--bg-card); border: 2px solid ${isSelected ? '#3b82f6' : 'var(--border-color)'}; border-radius: 12px; display: flex; flex-direction: column; overflow: hidden; box-shadow: ${isSelected ? '0 8px 24px rgba(59, 130, 246, 0.2)' : 'none'};">
        
        <!-- Header góc nhìn -->
        <div style="background: var(--bg-hover); padding: 14px 16px; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center;">
          <div>
            <span style="font-size: 0.75rem; font-weight: 800; color: #60a5fa; text-transform: uppercase; letter-spacing: 0.5px;">
              ${escapeHtml(v.angleBadge || 'Góc Nhìn')}
            </span>
            <h4 style="margin: 2px 0 0 0; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">
              ${escapeHtml(v.angleTitle)}
            </h4>
          </div>

          <!-- Quality Badge -->
          <div style="display: flex; align-items: center; gap: 6px; cursor: pointer;" title="Điểm Anti-AI & Brand Voice" onclick="toggleQualityBreakdown(${idx})">
            <span style="font-size: 0.72rem; font-weight: 800; background: ${scoreColor}22; color: ${scoreColor}; border: 1px solid ${scoreColor}55; padding: 3px 8px; border-radius: 6px; display: flex; align-items: center; gap: 4px;">
              <i class="fa-solid fa-shield-check"></i> ${v.qualityScore}/100
            </span>
          </div>
        </div>

        <!-- Breakdown chi tiết (ẩn mặc định) -->
        <div id="ms-breakdown-${idx}" style="display: none; background: #0f172a; padding: 10px 14px; border-bottom: 1px solid var(--border-color); font-size: 0.72rem; color: #cbd5e1;">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 6px;">
            <div>🛡️ Chống AI: <strong>${v.qualityBreakdown?.antiAiScore || 100}%</strong></div>
            <div>🎯 Chuẩn Brand: <strong>${v.qualityBreakdown?.brandFitScore || 90}%</strong></div>
            <div>🎵 Nhịp điệu: <strong>${v.qualityBreakdown?.rhythmScore || 90}%</strong></div>
            <div>💬 Tương tác: <strong>${v.qualityBreakdown?.engagementScore || 85}%</strong></div>
          </div>
          <div style="font-size: 0.68rem; color: #94a3b8;">
            Độ dài: ${v.stats?.wordCount || 0} từ | Câu: ${v.stats?.sentenceCount || 0} | Emojis: ${v.stats?.emojiCount || 0} | Phương sai nhịp: ${v.stats?.varianceWords || 0}
          </div>
        </div>

        <!-- Khung soạn thảo văn bản -->
        <div style="padding: 14px 16px; flex: 1; display: flex; flex-direction: column; gap: 10px;">
          <textarea id="ms-variant-text-${idx}" oninput="onVariantTextChange(${idx})" style="width: 100%; height: 260px; background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: 8px; padding: 12px; font-family: inherit; font-size: 0.85rem; line-height: 1.6; color: var(--text-main); resize: vertical;">${escapeHtml(v.content)}</textarea>

          <!-- Thẻ chỉ số phụ -->
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.7rem; color: var(--text-muted);">
            <span id="ms-word-count-${idx}"><i class="fa-solid fa-file-lines"></i> ${v.content.split(/\s+/).filter(Boolean).length} từ</span>
            <button class="btn btn-xs btn-outline-secondary" onclick="autoCleanVariantText(${idx})" title="Tự động loại bỏ cụm từ sáo rỗng AI">
              <i class="fa-solid fa-wand-magic"></i> Lọc Sạch AI
            </button>
          </div>

          <!-- VISUAL DIRECTION BOX (ĐỊNH HƯỚNG ẢNH AI) -->
          <div style="background: rgba(30, 41, 59, 0.7); border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 8px; padding: 12px; margin-top: 6px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
              <span style="font-size: 0.72rem; font-weight: 700; color: #fbbf24; display: flex; align-items: center; gap: 5px;">
                <i class="fa-solid fa-image"></i> Visual Direction (Ảnh AI)
              </span>
              <span style="font-size: 0.65rem; background: #3b82f622; color: #60a5fa; padding: 1px 6px; border-radius: 4px; font-weight: 600;">
                Tỉ lệ: ${v.visualDirection?.aspectRatio || '4:5'}
              </span>
            </div>
            
            <div style="font-size: 0.75rem; color: #e2e8f0; line-height: 1.4; margin-bottom: 6px;">
              <strong>Ý tưởng:</strong> ${escapeHtml(v.visualDirection?.concept || '')}
            </div>

            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
              <span style="font-size: 0.68rem; background: #10b98122; color: #34d399; padding: 2px 7px; border-radius: 4px;">
                Chữ trên ảnh: <strong>"${escapeHtml(v.visualDirection?.textOverlay || 'Tiêu Đề')}"</strong>
              </span>
            </div>

            <!-- Midjourney Prompt & Nút Copy -->
            <div style="background: #020617; border: 1px solid #1e293b; border-radius: 6px; padding: 8px; display: flex; justify-content: space-between; align-items: flex-start; gap: 8px;">
              <div style="font-size: 0.7rem; color: #94a3b8; font-family: monospace; line-height: 1.4; max-height: 60px; overflow-y: auto;" id="ms-prompt-text-${idx}">
                ${escapeHtml(v.visualDirection?.aiPrompt || '')}
              </div>
              <button class="btn btn-xs btn-secondary" onclick="copyVisualPrompt(${idx})" title="Sao chép prompt Midjourney/Flux">
                <i class="fa-solid fa-copy"></i> Copy
              </button>
            </div>
          </div>
        </div>

        <!-- Footer Hành Động -->
        <div style="padding: 12px 16px; background: var(--bg-hover); border-top: 1px solid var(--border-color); display: flex; gap: 8px;">
          <button class="btn btn-sm ${isSelected ? 'btn-primary' : 'btn-outline-primary'}" onclick="selectDraftVariant(${idx})" style="flex: 1; font-weight: 700;">
            <i class="fa-solid ${isSelected ? 'fa-circle-check' : 'fa-check'}"></i> ${isSelected ? 'Đang Chọn Bản Này' : 'Chọn Bản Này'}
          </button>
          <button class="btn btn-sm btn-secondary" onclick="copyVariantText(${idx})" title="Sao chép toàn bộ nội dung">
            <i class="fa-solid fa-clipboard"></i>
          </button>
        </div>

      </div>
    `;
  }).join('');
}

/**
 * Mở/đóng phân tích điểm chi tiết
 */
function toggleQualityBreakdown(idx) {
  const el = document.getElementById(`ms-breakdown-${idx}`);
  if (el) {
    el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }
}

/**
 * Chọn biến thể làm bản chính thức
 */
async function selectDraftVariant(idx) {
  if (!studioCurrentDraft) return;
  studioCurrentDraft.selectedVariantIndex = idx;
  render3AnglesView(studioCurrentDraft);

  try {
    await fetch(`/api/marketing/content/drafts/${studioCurrentDraft.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ selectedVariantIndex: idx })
    });
    studioToast('Đã Chọn Bài', `Đã chọn bản ${studioCurrentDraft.variants[idx]?.angleTitle || 'nội dung'} làm bài chính thức!`, 'success');
  } catch (e) {}
}

/**
 * Xử lý khi người dùng chỉnh sửa văn bản trực tiếp trên textarea
 */
function onVariantTextChange(idx) {
  if (!studioCurrentDraft || !studioCurrentDraft.variants[idx]) return;
  const textarea = document.getElementById(`ms-variant-text-${idx}`);
  if (!textarea) return;

  const newText = textarea.value;
  studioCurrentDraft.variants[idx].content = newText;

  // Cập nhật số từ
  const countEl = document.getElementById(`ms-word-count-${idx}`);
  if (countEl) {
    countEl.innerHTML = `<i class="fa-solid fa-file-lines"></i> ${newText.split(/\s+/).filter(Boolean).length} từ`;
  }
}

/**
 * Tự động lọc sạch AI Cliché cho 1 biến thể
 */
async function autoCleanVariantText(idx) {
  if (!studioCurrentDraft || !studioCurrentDraft.variants[idx]) return;
  const textarea = document.getElementById(`ms-variant-text-${idx}`);
  if (!textarea) return;

  const raw = textarea.value;
  // Làm sạch văn phong AI
  let cleaned = raw.replace(/bạn có biết rằng\s*/gi, '')
                   .replace(/trong cuộc sống hiện đại,?\s*/gi, 'Ngày thường, ')
                   .replace(/trong thời đại 4\.0,?\s*/gi, 'Thời buổi này, ')
                   .replace(/hãy cùng chúng tôi khám phá\s*/gi, 'Cùng xem ')
                   .replace(/không chỉ ([\w\s]+) mà còn/gi, 'Vừa $1, lại còn');

  textarea.value = cleaned;
  onVariantTextChange(idx);
  studioToast('Lọc Sạch AI', 'Đã lọc sạch các mẫu câu AI khuôn mẫu!', 'info');
}

/**
 * Sao chép nội dung bài viết
 */
function copyVariantText(idx) {
  const textarea = document.getElementById(`ms-variant-text-${idx}`);
  if (!textarea) return;

  navigator.clipboard.writeText(textarea.value).then(() => {
    studioToast('Đã Sao Chép', 'Đã sao chép nội dung bài viết vào Clipboard!', 'success');
  }).catch(() => {
    alert('Không thể sao chép tự động, vui lòng chọn và Ctrl+C');
  });
}

/**
 * Sao chép Prompt Midjourney
 */
function copyVisualPrompt(idx) {
  const el = document.getElementById(`ms-prompt-text-${idx}`);
  if (!el) return;

  navigator.clipboard.writeText(el.innerText.trim()).then(() => {
    studioToast('Đã Sao Chép Prompt', 'Đã sao chép Midjourney/Flux Prompt!', 'success');
  }).catch(() => {
    alert('Không thể sao chép');
  });
}

/**
 * Tải lịch sử các bản nháp trước đó
 */
async function loadBrandDraftsHistory() {
  if (!studioCurrentBrandId) return;
  const container = document.getElementById('ms-drafts-history-list');
  if (!container) return;

  try {
    const res = await fetch(`/api/marketing/content/drafts?brandId=${studioCurrentBrandId}`);
    const json = await res.json();
    const drafts = json.data || [];

    if (drafts.length === 0) {
      container.innerHTML = `<div style="font-size: 0.75rem; color: var(--text-muted); padding: 8px;">Chưa có bản nháp nào được lưu.</div>`;
      return;
    }

    container.innerHTML = drafts.slice(0, 10).map(d => `
      <div onclick="openSavedDraft('${d.id}')" style="background: var(--bg-hover); border: 1px solid var(--border-color); border-radius: 6px; padding: 8px 10px; cursor: pointer; transition: all 0.2s ease;">
        <div style="font-size: 0.78rem; font-weight: 700; color: var(--text-main); line-height: 1.3;">
          ${escapeHtml(d.topicTitle || 'Chủ đề bài viết')}
        </div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px; font-size: 0.68rem; color: var(--text-dim);">
          <span><i class="fa-solid fa-clock"></i> ${new Date(d.createdAt).toLocaleDateString('vi-VN')}</span>
          <span style="color: #60a5fa; font-weight: 600;">3 Biến thể &gt;</span>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Lỗi loadBrandDraftsHistory:', e);
  }
}

/**
 * Mở lại một bản nháp cũ
 */
async function openSavedDraft(draftId) {
  try {
    const res = await fetch(`/api/marketing/content/drafts/${draftId}`);
    const json = await res.json();
    if (json.success && json.data) {
      studioCurrentDraft = json.data;
      
      const titleInput = document.getElementById('ms-active-topic-title');
      if (titleInput) titleInput.value = studioCurrentDraft.topicTitle || '';

      render3AnglesView(studioCurrentDraft);
      document.getElementById('ms-3angles-container')?.scrollIntoView({ behavior: 'smooth' });
    }
  } catch (e) {
    alert('Không thể mở bản nháp: ' + e.message);
  }
}

window.loadMarketingStudio = initMarketingStudio;
window.onStudioBrandChange = onStudioBrandChange;
window.triggerGenerateTopics = triggerGenerateTopics;
window.selectTopicForStudio = selectTopicForStudio;
window.triggerGenerate3Angles = triggerGenerate3Angles;
window.selectDraftVariant = selectDraftVariant;
window.onVariantTextChange = onVariantTextChange;
window.autoCleanVariantText = autoCleanVariantText;
window.copyVariantText = copyVariantText;
window.copyVisualPrompt = copyVisualPrompt;
window.toggleQualityBreakdown = toggleQualityBreakdown;
window.openSavedDraft = openSavedDraft;
