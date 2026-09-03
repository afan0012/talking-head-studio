let project = null;
let activeModelRoutes = {};
let activePanel = Math.min(5, Number(localStorage.getItem('talkforge_active_panel') || 1));
const $ = (selector) => document.querySelector(selector);
const notice = $('#notice');
const recreatePreviewButton = document.createElement('button');
recreatePreviewButton.id = 'recreate-preview';
recreatePreviewButton.type = 'button';
recreatePreviewButton.className = 'secondary hidden';
recreatePreviewButton.textContent = '重新生成试听';
$('#video-stage').insertAdjacentElement('afterend', recreatePreviewButton);
const api = async (url, options = {}) => {
  // 本地服务重启/打包更新的瞬间，旧 keep-alive 连接会让首次 fetch 直接失败；
  // 对幂等的 GET 自动重试一次，避免把设置页这类面板打成「Failed to fetch」。
  let response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if ((options.method || 'GET').toUpperCase() !== 'GET') throw error;
    await new Promise((resolve) => setTimeout(resolve, 400));
    response = await fetch(url, { ...options, headers: { ...(options.headers || {}), 'cache-control': 'no-cache' } });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    // 本地服务重启后，未点「保存」的项目只存在于旧进程内存里，后端会持续 404。
    // 此时清空本地状态并明确提示，否则所有按钮都像「点了没反应」
    // （报错原本写进了被样式隐藏的提示条，用户根本看不到）。
    if (response.status === 404 && project && (url.includes(`/api/projects/${project.id}`) || url.includes(`/api/jobs/${project.id}`))) {
      const staleName = project.source_name || '未命名项目';
      project = null;
      render();
      notice.textContent = `项目「${staleName}」尚未保存，本地服务重启后已丢失，请重新创建项目；重要进度请随手点「保存」。`;
      throw new Error(notice.textContent);
    }
    throw new Error(data.detail || data.message || '请求失败');
  }
  return data;
};
const media = (name) => `/api/projects/${project.id}/media/${name}?v=${Date.now()}`;
const seconds = (value) => { const n = Number(value || 0); return `${Math.floor(n / 60)}分${Math.round(n % 60)}秒`; };
const escapeHtml = (value) => { const node = document.createElement('div'); node.textContent = value; return node.innerHTML; };
// 旧项目记录可能没有名称或保留历史占位词；统一显示为「未命名项目」。
const PROJECT_NAME_PLACEHOLDERS = new Set(['参考视频改写']);
const projectTitle = (name) => {
  const trimmed = (name || '').trim();
  if (!trimmed || PROJECT_NAME_PLACEHOLDERS.has(trimmed)) return '未命名项目';
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/i.test(trimmed)) return '未命名项目';
  return trimmed;
};

function showPanel(panel) {
  const next = Math.min(5, Math.max(1, Number(panel) || 1));
  activePanel = next;
  localStorage.setItem('talkforge_active_panel', String(next));
  document.querySelectorAll('.studio .panel').forEach((item) => {
    item.classList.toggle('panel-active', Number(item.dataset.panel) === next);
  });
  document.querySelectorAll('[data-panel-nav]').forEach((item) => {
    item.classList.toggle('current', Number(item.dataset.panelNav) === next);
    item.classList.toggle('active', Number(item.dataset.panelNav) === next);
  });
}

function setAction(selector, enabled, reasonSelector, reason) {
  const button = $(selector);
  // 页面升级后若浏览器暂时混用了旧 HTML 和新 JS，缺少某个可选控件
  // 不应中断整个界面的初始化。
  if (!button) return;
  button.disabled = !enabled;
  button.classList.toggle('is-disabled', !enabled);
  if (reasonSelector) {
    const note = $(reasonSelector);
    if (!note) return;
    note.textContent = enabled ? '' : reason;
    note.classList.toggle('hidden', enabled);
  }
}

function needProject() {
  if (project) return true;
  notice.textContent = '请先让 AI 生成文案，或使用参考视频自动改写。';
  $('#ai-prompt').focus();
  return false;
}

function syncVoiceProviderControls() {
  const mode = document.querySelector('#voice-form input[name=mode]:checked')?.value || 'upload';
  const provider = document.querySelector('#voice-form [name=voice_clone_model]')?.value || activeModelRoutes.voice_clone || 'cosyvoice-v3.5-plus';
  const usesCosy = mode !== 'direct' && (provider === 'cosyvoice-v3.5-plus' || provider === 'qwen-voice');
  const usesMimo = mode !== 'direct' && provider === 'mimo-v2.5-tts-voiceclone';
  // Qwen3-TTS 复刻走裸参数（官方默认表达，音色相似度最高），不显示语速/情绪控件。
  const usesQwenVc = mode !== 'direct' && provider === 'qwen3-tts-vc';
  const voiceConsent = $('#voice-consent');
  if (voiceConsent) {
    voiceConsent.required = mode !== 'direct';
    if (mode === 'direct') voiceConsent.checked = false;
  }
  $('#voice-upload-detail').classList.toggle('hidden', mode !== 'upload');
  $('#voice-saved-detail').classList.toggle('hidden', mode !== 'saved');
  $('#voice-clone-model')?.classList.toggle('hidden', mode === 'direct');
  $('#direct-tts-model')?.classList.toggle('hidden', mode !== 'direct');
  const directModel = activeModelRoutes.direct_tts || 'mimo-v2.5-tts';
  const hasBuiltInVoice = directModel === 'qwen-builtin-tts' || directModel === 'mimo-v2.5-tts';
  $('#direct-tts-voice-detail')?.classList.toggle('hidden', mode !== 'direct' || !hasBuiltInVoice);
  const directVoice = document.querySelector('#voice-form [name=direct_tts_voice]');
  if (directVoice && mode === 'direct' && hasBuiltInVoice) {
    const qwen = directModel === 'qwen-builtin-tts';
    directVoice.value = qwen ? 'longanlingxin' : '冰糖';
    Array.from(directVoice.options).forEach((option) => {
      option.disabled = qwen ? option.value !== 'longanlingxin' : option.value !== '冰糖';
    });
  }
  $('#cosy-controls')?.classList.toggle('hidden', !usesCosy);
  $('#mimo-controls')?.classList.toggle('hidden', !usesMimo);
  $('#qwen-vc-note')?.classList.toggle('hidden', !usesQwenVc);
  $('#qwen-controls')?.classList.toggle('hidden', !usesQwenVc);
  $('#legacy-voice-controls').classList.toggle('hidden', usesMimo || usesQwenVc || mode === 'direct');
}

function render() {
  syncVoiceProviderControls();
  const backendStep = Number(project?.current_step || 1);
  const currentStep = project?.edit_output_name ? 5
    : project?.output_name ? 4
      : backendStep >= 4 ? 3
        : backendStep >= 2 ? 2
          : 1;
  document.querySelectorAll('[data-panel-nav]').forEach((item) => {
    const stage = Number(item.dataset.panelNav);
    item.classList.toggle('completed', stage < currentStep);
  });
  showPanel(activePanel);
  if (!project) {
    // ── 隐藏保存按钮 ──
    $('#save-btn').classList.add('hidden');
    // ── 锁定按钮 ──
    setAction('#save-rewritten', false);
    setAction('#person-submit', false, '#person-lock', '请先创建并确认文案');
    setAction('#voice-submit', false, '#voice-lock', '请先确认文案并准备声音来源');
    setAction('#generate-video', false, '#video-lock', '请先确认声音试听');
    setAction('#edit-submit', false, '#edit-lock', '请先生成改口型视频');
    $('#retry-rewrite').classList.add('hidden');
    $('#recreate-preview').classList.add('hidden');
    $('#auto-edit-btn').disabled = true;
    // ── 清空所有表单字段与媒体预览 ──
    $('#project-name').textContent = '未命名项目';
    const fields = ['#rewritten', '#ai-prompt'];
    fields.forEach((sel) => { const el = $(sel); if (el) el.value = ''; });
    $('#extract-form').reset();
    const _refName = $('#reference-file-name'); if (_refName) _refName.textContent = '未选择文件';
    $('#person-output').classList.add('hidden');
    ['#person-video', '#voice-audio', '#result-video', '#final-video'].forEach((sel) => { const el = $(sel); if (el) el.src = ''; });
    $('#voice-output').classList.add('hidden');
    $('#edit-output').classList.add('hidden');
    $('#result-placeholder').classList.remove('hidden');
    ['#person-duration', '#person-status', '#duration-status', '#video-stage'].forEach((sel) => { const el = $(sel); if (el) el.textContent = ''; });
    $('#person-ready').textContent = '等待人物视频';
    $('#duration-chip').textContent = '等待试听';
    $('#asset-person').textContent = '人物视频 · 待添加';
    $('#asset-voice').textContent = '声音样音 · 待选择';
    $('#asset-broll').textContent = 'B-roll · 可选';
    const _bcl = $('#broll-clips-list'); if (_bcl) _bcl.innerHTML = '';
    $('#person-risks').innerHTML = '';
    $('#cover-image').src = '';
    $('#download').href = '';
    $('#project-switcher').value = '';
    notice.textContent = '请描述需求让 AI 写文案，或使用参考视频自动改写。';
    return;
  }
  const running = project.status === 'running';
  const saved = project.saved === true;
  $('#save-btn').classList.remove('hidden');
  $('#save-btn').textContent = saved ? '✓ 已保存' : '💾 保存';
  $('#save-btn').classList.toggle('saved', saved);
  $('#save-btn').disabled = running;
  $('#project-name').textContent = projectTitle(project.source_name);
  const stageText = project.stage === '人物视频与原声已就绪' ? '人物视频已就绪' : project.stage;
  notice.textContent = project.error ? `处理失败：${project.error}` : `当前状态：${stageText}`;
  $('#rewritten').value = project.rewritten_text || '';
  setAction('#save-rewritten', Boolean(project.rewritten_text) && !running);
  // 兼容旧任务：此前“改写要求”留空时只完成了整理，可在这里补做改写。
  $('#retry-rewrite').classList.toggle('hidden', !(project.transcript && !project.rewritten_text && !running));
  setAction(
    '#person-submit',
    Boolean(project.script_confirmed) && !running,
    '#person-lock',
    !project.script_confirmed ? '请先确认文案' : '当前项目仍在处理中',
  );
  $('#person-output').classList.toggle('hidden', !project.person_video_name);
  if (project.person_video_name) $('#person-video').src = media(project.person_video_name);
  $('#person-duration').textContent = project.person_duration ? `人物视频 ${seconds(project.person_duration)}` : '';
  $('#person-status').textContent = project.person_status || '';
  $('#person-risks').innerHTML = (project.person_risks || []).map((risk) => `<p class="risk">${escapeHtml(risk)}</p>`).join('') || (project.person_video_name ? '<p class="ok-note">人物视频已就绪，可用于后续改口型。</p>' : '');
  $('#person-ready').textContent = project.person_duration ? '人物原声已就绪' : '等待人物视频';
  $('#asset-person').textContent = project.person_video_name ? '人物视频 · 已添加' : '人物视频 · 待添加';
  $('#asset-voice').textContent = project.voice_id || project.preview_audio_name ? '声音样音 · 已就绪' : '声音样音 · 待选择';
  $('#asset-broll').textContent = (project.broll_clips?.length || project.broll_name) ? `B-roll · ${project.broll_clips?.length || 1} 段` : 'B-roll · 可选';
  renderBrollClips();
  const voiceMode = document.querySelector('#voice-form input[name=mode]:checked')?.value || 'upload';
  // 按所选音色来源决定前置条件与提示，只在真正需要时才提示上传人物视频
  let voiceReady = false, voiceReason = '';
  if (voiceMode === 'direct') {
    voiceReady = true;
    voiceReason = '直接用文案配音，无需人物视频';
  } else if (voiceMode === 'upload') {
    const sampleFile = $('#voice-sample')?.files?.[0];
    voiceReady = Boolean(sampleFile);
    voiceReason = '请选择声音样音（声音复刻需要单独上传样音）';
  } else if (voiceMode === 'saved') {
    const vid = document.querySelector('#voice-form input[name=voice_id]')?.value?.trim();
    voiceReady = Boolean(vid);
    voiceReason = '请输入已保存的音色 ID';
  }
  const canVoice = Boolean(project.script_confirmed && voiceReady) && !running;
  setAction('#voice-submit', canVoice, '#voice-lock', running ? '声音试听处理中，请稍候' : (!project.script_confirmed ? '请先确认新文案' : voiceReason));
  $('#voice-output').classList.toggle('hidden', !project.preview_audio_name);
  if (project.preview_audio_name) $('#voice-audio').src = media(project.preview_audio_name);
  $('#duration-status')?.remove();
  const qualityNote = $('#voice-quality-note');
  if (qualityNote) {
    qualityNote.textContent = project.voice_quality_note || '';
    qualityNote.classList.toggle('hidden', !project.voice_quality_note);
  }
  setAction('#confirm-voice', Boolean(project.preview_audio_name) && !running);
  const needsNewPreview = Boolean(project.script_confirmed && project.person_video_name && !project.preview_audio_name && !running);
  $('#recreate-preview').classList.toggle('hidden', !needsNewPreview);
  $('#duration-chip').textContent = project.person_duration ? `人物时长 ${seconds(project.person_duration)}` : '等待试听';
  // 旧项目数据里存的时长说明可能漏了“裁配音”选项，显示时统一修正。
  $('#video-stage').textContent = project.preview_confirmed ? '声音试听已确认，可以生成改口型视频。' : '请先确认声音试听。';
  const tolerance = Math.max(0.8, Number(project.person_duration || 0) * 0.05);
  const selectedStrategy = document.querySelector('input[name=duration_strategy]:checked')?.value;
  // duration_delta = 配音时长 − 人物视频时长：正值表示配音更长，需要裁配音或补视频。
  const audioLonger = Number(project.duration_delta || 0) > tolerance;
  const canGenerate = Boolean(project.preview_confirmed && project.person_duration) && !audioLonger && !running;
  setAction('#generate-video', canGenerate, '#video-lock', !project.preview_confirmed ? '请先确认声音试听' : (audioLonger ? '当前配音比人物视频长；请重新生成较短配音，或准备更长的人物视频' : ''));
  $('#cancel-video').classList.toggle('hidden', !(running && currentStep === 4));
  $('#result-placeholder').classList.toggle('hidden', Boolean(project.output_name));
  $('#result-video').classList.toggle('hidden', !project.output_name);
  if (project.output_name) $('#result-video').src = media(project.output_name);
  const canEdit = Boolean(project.output_name) && !running;
  setAction('#edit-submit', canEdit, '#edit-lock', '请先生成改口型视频');
  setAction('#auto-edit-btn', canEdit, '#edit-lock', '请先生成改口型视频');
  $('#edit-output').classList.toggle('hidden', !project.edit_output_name);
  if (project.edit_output_name) {
    $('#final-video').src = media(project.edit_output_name);
    $('#download').href = `/api/projects/${project.id}/download`;
  }
  if (project.cover_name) $('#cover-image').src = media(project.cover_name);
  fillEditForm();
}

function fillEditForm() {
  const f = $('#edit-form');
  if (!f || !project) return;
  const field = (name) => f.querySelector(`[name="${name}"]`) || document.querySelector(`[form="edit-form"][name="${name}"]`);
  const set = (name, val) => { const el = field(name); if (el) el.value = val; };
  set('title', project.title || '');
  set('title_font_size', project.title_font_size || 'h/18');
  set('title_color', project.title_color || 'white');
  set('title_position', project.title_position || 'top');
  set('subtitle_font_size', String(project.subtitle_font_size ?? '42'));
  set('subtitle_color', project.subtitle_color || 'FFFFFF');
  set('subtitle_margin_v', String(project.subtitle_margin_v ?? '72'));
  set('subtitle_keywords', project.subtitle_keywords || '');
  set('subtitle_keyword_color', project.subtitle_keyword_color || 'FFFF00');
  set('music_volume', String(project.music_volume ?? 0.14));
  const se = field('subtitle_enabled');
  if (se) se.checked = project.subtitle_enabled !== false;
  const be = field('broll_enabled');
  if (be) be.checked = project.broll_enabled === true;
  renderBrollClips();
  renderMusicStatus();
  const volHint = document.querySelector('.vol-hint');
  if (volHint) volHint.textContent = Math.round((project.music_volume ?? 0.14) * 100) + '%';
}

// ── 背景音乐状态：明示当前项目挂了什么音频，可一键移除 ──
// 之前只上传不清理：测试时上传过的音频一直挂在记录上，UI 又不显示，
// 用户以为没加音乐，导出时却被 amix 混进成片（两种声音交杂）。
function renderMusicStatus() {
  const box = $('#music-current');
  if (!box) return;
  if (project?.music_name) {
    box.classList.remove('hidden');
    box.innerHTML = `当前已挂载背景音乐：<strong>${escapeHtml(project.music_name)}</strong>
      <button type="button" id="music-remove" class="file-button">移除</button>
      <span class="hint">（导出时会与口播混音）</span>`;
    $('#music-remove')?.addEventListener('click', async () => {
      try {
        project = await api(`/api/projects/${project.id}/music/remove`, { method: 'POST' });
        renderMusicStatus();
        const noteEl = $('#edit-notice');
        if (noteEl) noteEl.textContent = '已移除背景音乐。';
      } catch (error) {
        const noteEl = $('#edit-notice');
        if (noteEl) noteEl.textContent = `移除失败：${error.message}`;
      }
    });
  } else {
    box.classList.add('hidden');
    box.innerHTML = '';
  }
}

// ── 多段 B-roll：列表只显示可自定义名称的按钮，点击后打开独立编辑窗口 ──
function renderBrollClips() {
  const list = $('#broll-clips-list');
  if (!list) return;
  const clips = Array.isArray(project?.broll_clips) ? project.broll_clips : [];
  if (!clips.length) { list.innerHTML = '<p class="hint">尚无素材。支持 MP4、MOV、WebM 视频，以及 PNG、JPG、WEBP、GIF 图片。</p>'; return; }
  const isImage = (name) => /\.(png|jpe?g|webp|gif|bmp)$/i.test(name || '');
  list.innerHTML = clips.map((clip, i) => `
    <div class="broll-clip-row" data-index="${i}">
      <div class="broll-clip-head">
        <span class="broll-clip-tag">段 ${i + 1}</span>
        <button type="button" class="broll-clip-open" data-open-index="${i}">${escapeHtml(clip.title || clip.name)} <small>${isImage(clip.name) ? '图片' : '视频'}</small></button>
        <button type="button" class="broll-clip-remove" data-remove-index="${i}" title="删除该段">✕</button>
      </div>
    </div>`).join('');
}

function closeBrollEditor() { $('#broll-editor-dialog')?.classList.add('hidden'); }
function openBrollEditor(index) {
  const clip = project?.broll_clips?.[index];
  const dialog = $('#broll-editor-dialog');
  const content = $('#broll-editor-content');
  if (!clip || !dialog || !content) return;
  const image = /\.(png|jpe?g|webp|gif|bmp)$/i.test(clip.name || '');
  dialog.dataset.index = String(index);
  $('#broll-editor-heading').textContent = `编辑第 ${index + 1} 段 B-roll`;
  $('#broll-editor-status').textContent = '';
  content.innerHTML = `<label>按钮名称<input id="broll-editor-title" type="text" maxlength="80" value="${escapeHtml(clip.title || clip.name)}" placeholder="例如：产品图、片尾视频" /></label>
    ${image ? `<img class="broll-editor-preview" src="${media(clip.name)}" alt="B-roll 预览" />` : `<video class="broll-editor-preview" src="${media(clip.name)}" controls preload="metadata"></video>`}
    <div class="controls"><label>插入时间（秒）<input id="broll-editor-start" type="number" min="0" step="0.1" value="${clip.start ?? 0}" /></label>
    ${image ? `<label>图片持续（秒）<input id="broll-editor-duration" type="number" min="0.2" max="60" step="0.1" value="${clip.duration ?? 4}" /></label>` : '<span class="hint">视频使用上传文件的原始时长，无需设置持续时间。</span>'}</div>`;
  dialog.classList.remove('hidden');
}

$('#broll-editor-close')?.addEventListener('click', closeBrollEditor);
$('#broll-editor-cancel')?.addEventListener('click', closeBrollEditor);
$('#broll-editor-dialog')?.addEventListener('click', (event) => { if (event.target.id === 'broll-editor-dialog') closeBrollEditor(); });
$('#broll-editor-save')?.addEventListener('click', async () => {
  const dialog = $('#broll-editor-dialog');
  const index = Number(dialog?.dataset?.index);
  if (!project || Number.isNaN(index)) return;
  const clip = project.broll_clips[index];
  const image = /\.(png|jpe?g|webp|gif|bmp)$/i.test(clip.name || '');
  const title = $('#broll-editor-title')?.value.trim() || clip.name;
  const start = Math.max(0, Number($('#broll-editor-start')?.value) || 0);
  const duration = image ? Math.min(60, Math.max(0.2, Number($('#broll-editor-duration')?.value) || 4)) : clip.duration;
  const clips = project.broll_clips.map((item, i) => i === index ? { ...item, title, start, duration } : item);
  try {
    const body = new FormData();
    body.append('clips', JSON.stringify(clips.map((c) => ({ name: c.name, title: c.title, start: c.start, duration: c.duration, enabled: c.enabled !== false }))));
    project = await api(`/api/projects/${project.id}/broll-clips`, { method: 'POST', body });
    manualEditFields.add('broll_clips');
    closeBrollEditor();
    renderBrollClips();
  } catch (error) { const status = $('#broll-editor-status'); if (status) status.textContent = `保存失败：${error.message}`; }
});

// 删除单段。
$('#broll-clips-list')?.addEventListener('click', async (event) => {
  const open = event.target.closest('[data-open-index]');
  if (open) { openBrollEditor(Number(open.dataset.openIndex)); return; }
  const btn = event.target.closest('[data-remove-index]');
  if (!btn || !project) return;
  const index = Number(btn.dataset.removeIndex);
  if (!window.confirm(`删除第 ${index + 1} 段 B-roll？`)) return;
  try {
    project = await api(`/api/projects/${project.id}/broll/${index}`, { method: 'DELETE' });
    renderBrollClips();
  } catch (error) { $('#edit-notice') && ($('#edit-notice').textContent = error.message); }
});

// ── 手动设置追踪：用户在剪辑/包装表单里碰过的字段，一键成片时保留、不让 AI 覆盖 ──
const manualEditFields = new Set();
function markManualField(event) {
  const name = event.target?.name;
  if (name) manualEditFields.add(name);
}
function watchManualEditFields() {
  $('#edit-form')?.addEventListener('input', markManualField);
  $('#edit-form')?.addEventListener('change', markManualField);
  document.querySelectorAll('[form="edit-form"]').forEach((el) => {
    el.addEventListener('input', markManualField);
    el.addEventListener('change', markManualField);
  });
}
watchManualEditFields();

async function refresh() {
  if (!project) return;
  const id = project.id;
  const data = await api(`/api/jobs/${id}`).catch(() => null);
  if (!data || project?.id !== id) return;
  project = data;
  render();
  if (project.status === 'running') setTimeout(refresh, 2200);
}

const LAST_PROJECT_KEY = 'talkforge_last_project';
function rememberProject() {
  if (project?.id) localStorage.setItem(LAST_PROJECT_KEY, project.id);
}
function newProject() {
  project = null;
  manualEditFields.clear();
  localStorage.removeItem(LAST_PROJECT_KEY);
  render();
  loadProjects();
  notice.textContent = '请描述文案需求，或上传本地参考视频开始新项目。';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
window.newProject = newProject;

let _pendingNewProject = false;
function newProjectClick() {
  if (!project) { newProject(); return; }
  _pendingNewProject = true;
  $('#confirm-message').textContent = `要保存「${projectTitle(project.source_name)}」吗？`;
  $('#confirm-dialog').classList.remove('hidden');
}
async function saveProject() {
  if (!project) return;
  try {
    const result = await api(`/api/projects/${project.id}/save`, { method: 'POST' });
    project.updated_at = result.updated_at;
    project._saved = true;
    render();
    await loadProjects();
    notice.textContent = '项目已保存到历史记录。';
  } catch (error) { notice.textContent = '保存失败：' + error.message; }
}
async function doSaveAndNew() {
  if (project && project.id) {
    try { await api(`/api/projects/${project.id}/save`, { method: 'POST' }); } catch {}
  }
  _pendingNewProject = false;
  $('#confirm-dialog').classList.add('hidden');
  newProject();
}
async function doDiscardAndNew() {
  if (project && project.id) {
    try { await api(`/api/projects/${project.id}/forget`, { method: 'POST' }); } catch {}
  }
  _pendingNewProject = false;
  $('#confirm-dialog').classList.add('hidden');
  newProject();
}
function doCancelNew() {
  _pendingNewProject = false;
  $('#confirm-dialog').classList.add('hidden');
}
window._doSaveAndNew = doSaveAndNew;
window._doDiscardAndNew = doDiscardAndNew;
window._doCancelNew = doCancelNew;
async function restoreProject() {
  const saved = localStorage.getItem(LAST_PROJECT_KEY);
  if (!saved) return;
  try {
    project = await api(`/api/jobs/${saved}`);
    render();
    if (project.status === 'running') setTimeout(refresh, 700);
  } catch { project = null; }
}
async function loadProjects() {
  const select = $('#project-switcher');
  if (!select) return;
  try {
    const jobs = await api('/api/jobs');
    const labels = { queued: '排队', running: '处理中', ready: '待处理', failed: '失败', succeeded: '完成' };
    select.textContent = '';
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.textContent = '+ 新建项目…';
    select.appendChild(placeholder);
    const divider = document.createElement('option');
    divider.disabled = true;
    divider.textContent = '──────────';
    select.appendChild(divider);
    jobs.slice(0, 10).forEach((job) => {
      const option = document.createElement('option');
      option.value = job.id;
      option.textContent = `${projectTitle(job.source_name)} · ${labels[job.status] || job.status}`;
      select.appendChild(option);
    });
    if (project) select.value = project.id;
  } catch { /* 静默：列表加载失败不影响主流程 */ }
}
async function switchProject(id) {
  if (!id) { newProject(); return; }
  try {
    manualEditFields.clear();
    project = await api(`/api/jobs/${id}`);
    rememberProject();
    render();
    if (project.status === 'running') setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; }
}

async function doExtract(event) {
  if (event) event.preventDefault();
  const body = new FormData($('#extract-form'));
  const file = $('#reference-file')?.files[0];
  if (!file) {
    notice.textContent = '请先选择本地视频文件。';
    return;
  }
  try {
    body.append('video', file);
    notice.textContent = '处理中…';
    project = await api('/api/projects/extract-upload', {method: 'POST', body});
    rememberProject(); render(); setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; }
}
window._doExtract = doExtract;
document.querySelectorAll('[data-ai-template]').forEach((button) => button.addEventListener('click', () => { $('#ai-prompt').value = button.dataset.aiTemplate; $('#ai-prompt').focus(); }));
document.querySelectorAll('.path-tab').forEach((tab) => tab.addEventListener('click', () => {
  document.querySelectorAll('.path-tab').forEach((t) => {
    const active = t === tab;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  document.querySelectorAll('.path-card').forEach((card) => card.classList.toggle('hidden', card.dataset.path !== tab.dataset.scriptPath));
}));
document.querySelectorAll('[data-file-target]').forEach((button) => {
  const input = $(`#${button.dataset.fileTarget}`);
  // HTML 中文件名元素 id 是“{target}-file-name”，不依赖 id 拼接，直接在按钮
  // 所在的文件控件里找 .file-name，避免命名不一致导致永远显示“未选择文件”。
  const name = button.closest('.file-control')?.querySelector('.file-name') || null;
  if (!input) return;
  button.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    // B-roll：选完立即上传（多选逐个传），成功后下方立即出现分段列表。
    if (button.dataset.fileTarget === 'broll') {
      const count = input.files.length;
      if (name) name.textContent = count ? `已选 ${count} 个，正在上传…` : '未选择文件';
      const enable = document.querySelector('#edit-form [name=broll_enabled]');
      if (count && enable) enable.checked = true;
      if (count && project) {
        uploadSelectedAssets().then(() => {
          if (name) name.textContent = '未选择文件';
          const n = (project?.broll_clips || []).length;
          const noteEl = $('#edit-notice');
          if (noteEl && n) noteEl.textContent = `已添加 B-roll 素材，共 ${n} 段（下方可设置每段的时间与时长）`;
        }).catch((error) => {
          if (name) name.textContent = '上传失败，请重试';
          const noteEl = $('#edit-notice');
          if (noteEl) noteEl.textContent = `B-roll 上传失败：${error.message}`;
        });
      }
    } else {
      if (name) name.textContent = input.files[0]?.name || '未选择文件';
    }
  });
});
document.querySelectorAll('#voice-form input[name=mode]').forEach((input) => input.addEventListener('change', () => {
  syncVoiceProviderControls();
  render();
}));
document.querySelector('#voice-form [name=voice_clone_model]')?.addEventListener('change', () => {
  syncVoiceProviderControls();
  render();
});
// 阿里云 CosyVoice 表达指令模板：一键填入官方 instruction 文本框。
document.querySelectorAll('[data-voice-instruction]').forEach((button) => button.addEventListener('click', () => {
  const field = document.querySelector('#voice-form [name=voice_instruction]');
  if (field) { field.value = button.dataset.voiceInstruction; field.focus(); }
}));
// MiMo 表达指令模板：留空模板（最后一个按钮）用于恢复情绪档位默认。
document.querySelectorAll('[data-mimo-style]').forEach((button) => button.addEventListener('click', () => {
  const field = document.querySelector('#voice-form [name=mimo_style]');
  if (field) { field.value = button.dataset.mimoStyle; field.focus(); }
}));
const _voiceSample = $('#voice-sample'); if (_voiceSample) _voiceSample.addEventListener('change', render);
const _voiceId = document.querySelector('#voice-form input[name=voice_id]'); if (_voiceId) _voiceId.addEventListener('input', render);
$('#ai-script-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    notice.textContent = '处理中…';
    project = await api('/api/projects/ai-script', {method: 'POST', body: new FormData(event.currentTarget)});
    rememberProject(); render(); setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; }
});
$('#save-rewritten').addEventListener('click', async () => {
  if (!needProject()) return;
  try { const body = new FormData(); body.append('rewritten_text', $('#rewritten').value); project = await api(`/api/projects/${project.id}/rewritten`, {method: 'POST', body}); render(); } catch (error) { notice.textContent = error.message; }
});
$('#retry-rewrite').addEventListener('click', async () => {
  if (!needProject()) return;
  try {
    const body = new FormData();
    body.append('instruction', $('#extract-form [name=instruction]').value);
    await api(`/api/projects/${project.id}/rewrite`, {method: 'POST', body});
    notice.textContent = '处理中…';
    setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; }
});
$('#person-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!needProject()) return;
  try { await api(`/api/projects/${project.id}/person-video`, {method: 'POST', body: new FormData(event.currentTarget)}); notice.textContent = '处理中…'; setTimeout(refresh, 700); } catch (error) { notice.textContent = error.message; }
});
$('#voice-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!needProject()) return;
  try { const body = new FormData(event.currentTarget); await api(`/api/projects/${project.id}/voice-preview`, {method: 'POST', body}); notice.textContent = '处理中…'; setTimeout(refresh, 700); } catch (error) { notice.textContent = error.message; }
});
$('#confirm-voice').addEventListener('click', async () => {
  try { project = await api(`/api/projects/${project.id}/voice-confirm`, {method: 'POST'}); render(); } catch (error) { notice.textContent = error.message; }
});
$('#recreate-preview').addEventListener('click', async () => {
  if (!needProject()) return;
  try {
    const body = new FormData($('#voice-form'));
    await api(`/api/projects/${project.id}/voice-preview`, {method: 'POST', body});
    notice.textContent = '处理中…';
    $('#recreate-preview').classList.add('hidden');
    setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; }
});
document.querySelectorAll('input[name=duration_strategy]').forEach((input) => input.addEventListener('change', render));
$('#generate-video').addEventListener('click', async () => {
  if (!needProject()) return;
  try { const body = new FormData(); body.append('strategy', document.querySelector('input[name=duration_strategy]:checked').value); await api(`/api/projects/${project.id}/generate-video`, {method: 'POST', body}); notice.textContent = '处理中…'; setTimeout(refresh, 700); } catch (error) { notice.textContent = error.message; }
});
$('#cancel-video').addEventListener('click', async () => {
  try { await api(`/api/projects/${project.id}/cancel-video`, {method: 'POST'}); notice.textContent = '已请求取消：已提交的云端任务可能仍会完成，但不会保存为成片。'; setTimeout(refresh, 700); } catch (error) { notice.textContent = error.message; }
});
// ── 导出前先把本次选择的本地素材落盘（手动导出与 AI 一键成片共用）──
// 之前一键成片直接提交表单，后端 /auto-edit 不接收文件，选中的 B-roll
// 被静默丢弃，成片里自然什么都没有；这里在提交前显式上传一次。
async function uploadSelectedAssets() {
  let hadBroll = false;
  const music = $('#music').files[0], cover = $('#cover').files[0];
  const brolls = Array.from($('#broll')?.files || []);
  if (music) { const form = new FormData(); form.append('music', music); project = await api(`/api/projects/${project.id}/music`, {method: 'POST', body: form}); }
  for (const broll of brolls) {
    const form = new FormData(); form.append('broll', broll);
    project = await api(`/api/projects/${project.id}/broll`, {method: 'POST', body: form});
    hadBroll = true;
  }
  if (cover) { const form = new FormData(); form.append('cover', cover); project = await api(`/api/projects/${project.id}/cover`, {method: 'POST', body: form}); }
  if (brolls.length) {
    // 上传成功后清空文件选择器，防止下次提交重复上传同一批文件。
    const brollInput = $('#broll');
    if (brollInput) brollInput.value = '';
    const nameSpan = $('#broll-file-name');
    if (nameSpan) nameSpan.textContent = '未选择文件';
    renderBrollClips();
  }
  return hadBroll;
}
$('#edit-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!needProject()) return;
  const form = event.currentTarget;
  if (!window.confirm('本视频含 AI 口型/声音编辑；发布时请按目标平台规则操作，并确认已取得人物肖像和声音授权。是否继续？')) return;
  try {
    const hadBroll = await uploadSelectedAssets();
    // currentTarget 只在同步事件派发期间有效；在 await 之后会变为 null，
    // 曾导致“生成并导出成片”没有发出请求。
    await api(`/api/projects/${project.id}/edit`, {method: 'POST', body: new FormData(form)});
    notice.textContent = '处理中…';
    setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; }
});
// ── 项目名称点击编辑 ──
$('#project-name').addEventListener('click', () => {
  if (!project) return;
  const el = $('#project-name');
  const original = el.textContent;
  const input = document.createElement('input');
  input.value = original;
  input.className = 'project-name-input';
  const finish = async () => {
    const name = input.value.trim();
    el.textContent = name || original;
    input.replaceWith(el);
    if (name && name !== original) {
      try {
        const body = new FormData(); body.append('name', name);
        project = await api(`/api/projects/${project.id}/rename`, { method: 'POST', body });
        rememberProject();
        loadProjects();
        render();
      } catch (error) { notice.textContent = error.message; el.textContent = original; }
    }
  };
  input.addEventListener('blur', finish);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') { input.value = original; input.blur(); } });
  el.replaceWith(input);
  input.focus();
  input.select();
});
$('#project-switcher').addEventListener('change', (event) => switchProject(event.currentTarget.value));
$('#new-project-btn').addEventListener('click', newProjectClick);
$('#save-btn').addEventListener('click', saveProject);
$('#auto-edit-btn').addEventListener('click', async () => {
  if (!needProject()) return;
  if (project.status === 'running') { notice.textContent = '当前项目仍在处理中。'; return; }
  const kept = manualEditFields.size;
  const editSummary = kept
    ? `AI 将自动补齐你没有手动调整过的设置（保留你的 ${kept} 项手动设置），并直接导出成片。是否继续？`
    : 'AI 将自动决定标题、字幕高亮、贴纸与封面大字，并直接导出成片。是否继续？';
  const confirmText = `${editSummary}\n\n本视频含 AI 口型/声音编辑；发布时请按目标平台规则操作，并确认已取得人物肖像和声音授权。是否继续？`;
  if (!window.confirm(confirmText)) return;
  try {
    $('#auto-edit-btn').disabled = true;
    // 先落盘本次选择的 B-roll/音乐/封面，否则 /auto-edit 收不到文件、成片里没有素材。
    await uploadSelectedAssets();
    const body = new FormData($('#edit-form'));
    body.append('locked', [...manualEditFields].join(','));
    await api(`/api/projects/${project.id}/auto-edit`, { method: 'POST', body });
    notice.textContent = '处理中…';
    showPanel(5);
    setTimeout(refresh, 700);
  } catch (error) { notice.textContent = error.message; $('#auto-edit-btn').disabled = false; }
});
const volInput = $('#edit-form [name=music_volume]');
if (volInput) volInput.addEventListener('input', () => {
  const hint = document.querySelector('.vol-hint');
  if (hint) hint.textContent = Math.round(Number(volInput.value) * 100) + '%';
});
// ── 管理历史项目弹窗 ──
$('#manage-btn').addEventListener('click', openManage);
document.querySelectorAll('[data-panel-nav]').forEach((button) => button.addEventListener('click', () => showPanel(button.dataset.panelNav)));
async function openManage() {
  $('#manage-dialog').classList.remove('hidden');
  await refreshManageList();
}
async function refreshManageList() {
  const list = $('#manage-list');
  try {
    const jobs = await api('/api/jobs');
    const labels = { queued: '排队', running: '处理中', ready: '待处理', failed: '失败', succeeded: '完成' };
    list.innerHTML = jobs.length ? '' : '<p style="color:#8690a6;text-align:center;padding:20px">暂无已保存项目</p>';
    jobs.forEach((job) => {
      const row = document.createElement('div');
      row.className = 'manage-item';
      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = projectTitle(job.source_name);
      name.title = '点击打开此项目';
      name.addEventListener('click', () => { $('#manage-dialog').classList.add('hidden'); switchProject(job.id); });
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = `${labels[job.status] || job.status} · ${(job.updated_at || '').slice(5, 16)}`;
      const del = document.createElement('button');
      del.className = 'del';
      del.textContent = '删除';
      del.title = '永久删除此项目';
      del.addEventListener('click', async () => {
        if (!confirm(`永久删除「${projectTitle(job.source_name)}」？\n项目文件和历史记录将被清除，不可恢复。`)) return;
        try {
          await api(`/api/projects/${job.id}/delete`, { method: 'POST' });
          if (project?.id === job.id) { project = null; localStorage.removeItem(LAST_PROJECT_KEY); render(); }
          await refreshManageList();
          await loadProjects();
          notice.textContent = '项目已删除。';
        } catch (error) { notice.textContent = '删除失败：' + error.message; }
      });
      row.appendChild(name);
      row.appendChild(meta);
      row.appendChild(del);
      list.appendChild(row);
    });
  } catch { list.innerHTML = '<p style="color:#d64545;text-align:center">加载失败</p>'; }
}
function closeManage() { $('#manage-dialog').classList.add('hidden'); }
window._closeManage = closeManage;
$('#confirm-save').addEventListener('click', doSaveAndNew);
$('#confirm-discard').addEventListener('click', doDiscardAndNew);
$('#confirm-cancel').addEventListener('click', doCancelNew);
render();
(async () => {
  await restoreProject();
  await loadProjects();
  await populateStepModelSelectors();
})();

// ── 设置（网页设置页：API Key / 界面，浏览器里填，无需手动改文件）──
function switchSettingsTab(name) {
  document.querySelectorAll('#settings-dialog .settings-tab').forEach((b) => b.classList.toggle('active', b.dataset.settingsTab === name));
  ['accounts', 'services', 'ui'].forEach((p) => {
    const el = document.getElementById('settings-' + p);
    if (el) el.classList.toggle('hidden', p !== name);
  });
  const save = $('#settings-save');
  if (save) {
    save.classList.toggle('hidden', name === 'ui');
    save.dataset.settingsSaveMode = name;
    save.textContent = name === 'services' ? '保存模型分配' : '保存密钥';
  }
}
// API Key / 服务连接只负责登记能力；模型只在画布的具体环节中选择。
let settingsData = null;
const PROVIDER_ORDER = ['dashscope', 'mimo', 'system'];
const PROVIDER_FORMAT = { // 预设格式一句话提示
  dashscope: '格式：API Key + 业务空间 ID',
  mimo: '格式：API Key',
  system: '一般不需要填',
};
const PROVIDER_MODEL_CATALOG = {
  dashscope: ['Qwen3.7 Flash', 'Qwen Audio 3.0', 'Qwen Voice', 'VideoRetalk'],
  mimo: ['MiMo v2.5', 'MiMo ASR v2.5', 'MiMo v2.5 声音复刻', 'MiMo v2.5 TTS'],
};
// 支持在线拉取模型列表的预设供应商（OpenAI 兼容 /models 接口）。
const PROVIDER_LIVE_MODELS = { dashscope: true, mimo: true };
const PROVIDER_COMPAT_BASE = {
  dashscope: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  mimo: 'https://api.xiaomimimo.com/v1',
};
let routeDraft = {};
const MODEL_LABELS = {
  auto: '自动选择',
  'mimo-v2.5': 'MiMo v2.5',
  'mimo-v2.5-pro': 'MiMo v2.5 Pro',
  'qwen3.7-flash': '百炼 Qwen3.7 Flash',
  'mimo-v2.5-asr': 'MiMo ASR v2.5',
  'qwen-audio-3.0-asr-flash-filetrans': '百炼 Qwen Audio 3.0',
  'mimo-v2.5-tts-voiceclone': 'MiMo v2.5 声音复刻',
  'qwen-voice': '百炼 Qwen 声音复刻',
  'qwen3-tts-vc': '百炼 Qwen3-TTS 复刻',
  'mimo-v2.5-tts': 'MiMo v2.5 TTS',
  'qwen-builtin-tts': '百炼 Qwen Audio TTS',
  videoretalk: '百炼 VideoRetalk',
};
async function populateStepModelSelectors(data = null) {
  try {
    const settings = data || await api('/api/settings');
    activeModelRoutes = settings.model_routes || {};
    const modules = new Map((settings.modules || []).map((module) => [module.id, module]));
    const customs = settings.custom_providers || [];
    const localOllama = settings.local_ollama || null;
    document.querySelectorAll('select[data-model-step]').forEach((control) => {
      const step = control.dataset.modelStep;
      const module = modules.get(step);
      if (!module) return;
      const choices = (module.options || []).map((item) => typeof item === 'string' ? { value: item, label: MODEL_LABELS[item] || item } : item);
      if (module.supports_custom) {
        customs.forEach((provider) => choices.push({ value: `custom:${provider.id}`, label: `${provider.name}（${provider.model}）` }));
        if (localOllama) choices.push({ value: 'local:ollama', label: `Ollama（${localOllama.model}）` });
      }
      const previous = control.value;
      // There is deliberately no second "default model" control in Settings.
      // A saved choice stays on this canvas while it is open; otherwise use the
      // first available option and let the user decide for this run.
      const selected = [previous, choices[0]?.value].find((value) => choices.some((item) => item.value === value));
      control.innerHTML = choices.map((item) => {
        return `<option value="${escapeHtml(item.value)}"${item.value === selected ? ' selected' : ''}>${escapeHtml(item.label || item.value)}</option>`;
      }).join('');
    });
    syncVoiceProviderControls();
  } catch (_) {
    // A temporary settings failure must not break the editing surface.
  }
}
function providerReady(p, fields) {
  const items = fields.filter((f) => f.group === p);
  return items.some((f) => f.configured);
}
function fieldRow(f) {
  const placeholder = f.configured ? (f.secret && f.masked ? `已填（${f.masked}），留空则不修改` : `当前：${f.masked || '已填'}，留空则不修改`) : '';
  const type = f.secret ? 'password' : 'text';
  return `<label class="set-field">${escapeHtml(f.label)}
    <input type="${type}" data-field="${escapeHtml(f.key)}" placeholder="${escapeHtml(placeholder)}" autocomplete="off" />
    <span class="hint">${escapeHtml(f.hint)}</span></label>`;
}
function renderProviderCard(p, fields, titles) {
  const items = fields.filter((f) => f.group === p);
  if (!items.length) return '';
  const ready = providerReady(p, fields);
  const models = PROVIDER_MODEL_CATALOG[p] || [];
  return `<details class="settings-provider"${ready ? '' : ' open'} data-provider="${escapeHtml(p)}">
    <summary><span class="provider-status ${ready ? 'ready' : ''}"></span><span><b>${escapeHtml(titles[p] || p)}</b><small>${escapeHtml(PROVIDER_FORMAT[p] || '')}</small></span>
      <span class="settings-state ${ready ? 'ready' : ''}">${ready ? '已配置' : '待配置'}</span></summary>
    <div class="settings-provider-body"><div class="credential-grid">${items.map(fieldRow).join('')}</div>
      ${models.length ? `<div class="model-inventory"><span>可用模型</span>${models.map((model) => `<i>${escapeHtml(model)}</i>`).join('')}</div>` : ''}</div>
  </details>`;
}
function renderCustomProviderCard(c) {
  return `<details class="settings-provider" data-custom="${escapeHtml(c.id)}">
    <summary><span class="provider-status ready"></span><span><b>${escapeHtml(c.name)}</b><small>OpenAI 兼容 · ${escapeHtml(c.model)}</small></span><span class="settings-state ready">已配置</span></summary>
    <div class="settings-provider-body"><p class="hint">接口地址：${escapeHtml(c.base_url)} · 密钥：${escapeHtml(c.masked || '已填')}</p>
      <button type="button" class="secondary" style="margin-top:8px" onclick="window._deleteCustomProvider('${escapeHtml(c.id)}')">删除这个供应商</button>
    </div>
  </details>`;
}
let selectedKeyProvider = null;

function keyProviderItems(data, fields, titles) {
  const official = PROVIDER_ORDER.filter((id) => fields.some((field) => field.group === id)).map((id) => ({ id: `official:${id}`, kind: 'official', provider: id, name: titles[id] || id, note: PROVIDER_FORMAT[id] || '', ready: providerReady(id, fields) }));
  const ollama = [{ id: 'ollama', kind: 'ollama', name: '本地 Ollama', note: data.local_ollama ? data.local_ollama.base_url : '本机模型服务', ready: Boolean(data.local_ollama) }];
  const services = (data.service_connections || []).map((service) => ({ id: `service:${service.id}`, kind: 'service', service, name: service.name, note: service.base_url, ready: true }));
  const customs = (data.custom_providers || []).map((provider) => ({ id: `custom:${provider.id}`, kind: 'custom', provider, name: provider.name, note: 'OpenAI 兼容服务', ready: true }));
  return [...official, ...ollama, ...services, ...customs];
}

function renderOfficialKeyDetail(item, fields, data) {
  const models = PROVIDER_MODEL_CATALOG[item.provider] || [];
  const compatBase = PROVIDER_COMPAT_BASE[item.provider];
  const linkedService = compatBase ? (data?.service_connections || []).find((service) => service.base_url === compatBase) : null;
  return `<div class="key-detail-heading"><div><span class="eyebrow">预设供应商</span><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.note)}</p></div><span class="settings-state ${item.ready ? 'ready' : ''}">${item.ready ? '已配置' : '待配置'}</span></div><section class="key-detail-section"><h5>密钥信息</h5><div class="credential-grid">${fields.filter((field) => field.group === item.provider).map(fieldRow).join('')}</div></section>${models.length ? `<section class="key-detail-section"><h5>已适配模型（专用通道）</h5><p class="hint">以下能力已按供应商原生接口接入：文本、识别、配音、声音复刻和视频改口型分别走自己的专用通道。填好密钥后可直接在“模型分配”中选择。</p><div class="model-inventory compact">${models.map((model) => `<i>${escapeHtml(model)}</i>`).join('')}</div></section>` : ''}${PROVIDER_LIVE_MODELS[item.provider] ? `<section class="key-detail-section"><h5>获取文本模型列表</h5><p class="hint">只显示并登记本软件已支持的标准文本对话模型。语音识别、配音等能力必须使用上方已适配的专用通道，不会在这里出现。</p><div class="inline-actions"><button type="button" class="secondary" onclick="window._fetchProviderModels('${escapeHtml(item.provider)}')">获取文本模型</button><button type="button" id="provider-add-btn" class="hidden" onclick="window._addProviderModels('${escapeHtml(item.provider)}')">添加所选模型</button><span id="provider-models-status" class="hint"></span></div><input id="provider-models-search" class="provider-models-search hidden" type="search" placeholder="输入名称筛选，如 qwen、deepseek" oninput="window._filterProviderModels()" autocomplete="off" /><div id="provider-models-box" class="provider-models-box hidden"></div></section>` : ''}${linkedService ? `<section class="key-detail-section"><h5>已添加的文本模型</h5><div class="model-inventory compact">${(linkedService.connections || []).map((c) => '<i>' + escapeHtml((c.title || c.capability) + '：' + (c.models || []).join('、')) + '</i>').join('')}</div><p class="hint">以上模型已可在“模型分配”中用于文案创作、改写和剪辑方案。</p></section>` : ''}`;
}

function renderOllamaKeyDetail(config) {
  const baseUrl = config?.base_url || 'http://127.0.0.1:11434/v1';
  const model = config?.model || '';
  return `<div class="key-detail-heading"><div><span class="eyebrow">本地供应商</span><h4>本地 Ollama</h4><p>连接本机已运行的模型服务，不需要 API Key。</p></div><span class="settings-state ${config ? 'ready' : ''}">${config ? '已配置' : '待配置'}</span></div><section class="key-detail-section"><h5>连接与模型</h5><div class="stack"><label class="set-field">本地接口地址<input id="ollama-url" type="text" value="${escapeHtml(baseUrl)}" autocomplete="off" /></label><label class="set-field">模型名<input id="ollama-model" type="text" value="${escapeHtml(model)}" list="ollama-model-list" placeholder="先读取模型，再选择或填写" autocomplete="off" /></label><datalist id="ollama-model-list"></datalist><div class="inline-actions"><button type="button" class="secondary" onclick="window._testLocalOllama()">读取本机模型</button><button type="button" onclick="window._saveLocalOllama()">保存 Ollama</button>${config ? '<button type="button" class="secondary" onclick="window._deleteLocalOllama()">移除</button>' : ''}</div></div></section>`;
}

function renderServiceKeyDetail(service) {
  const capabilities = (service.connections || []).map((connection) => `<div class="capability-row"><b>${escapeHtml(connection.title)}</b><span class="hint">模型：${escapeHtml(connection.models.join('、'))}</span><span class="chip ${connection.available ? 'ok' : 'todo'}">${connection.available ? '可在画布选择' : '等待服务适配器'}</span></div>`).join('') || '<p class="hint">尚未登记模型。</p>';
  return `<div class="key-detail-heading"><div><span class="eyebrow">已添加供应商</span><h4>${escapeHtml(service.name)}</h4><p>${escapeHtml(service.base_url)}</p></div><span class="settings-state ready">已配置</span></div><section class="key-detail-section"><h5>已登记模型</h5>${capabilities}</section><div class="inline-actions"><button type="button" class="secondary" onclick="window._startProviderForm('${escapeHtml(service.id)}')">编辑供应商</button><button type="button" class="secondary" onclick="window._deleteServiceConnection('${escapeHtml(service.id)}')">删除</button></div>`;
}

function renderCustomKeyDetail(provider) {
  return `<div class="key-detail-heading"><div><span class="eyebrow">已添加供应商</span><h4>${escapeHtml(provider.name)}</h4><p>OpenAI 兼容 · ${escapeHtml(provider.base_url)}</p></div><span class="settings-state ready">已配置</span></div><section class="key-detail-section"><h5>已登记模型</h5><div class="model-inventory compact"><i>${escapeHtml(provider.model)}</i></div></section><div class="inline-actions"><button type="button" class="secondary" onclick="window._deleteCustomProvider('${escapeHtml(provider.id)}')">删除</button></div>`;
}

let providerModelsCache = {};
window._fetchProviderModels = async function(provider) {
  const status = document.querySelector('#provider-models-status');
  const box = document.querySelector('#provider-models-box');
  if (!status || !box) return;
  status.textContent = '正在获取模型列表…';
  try {
    const data = await api(`/api/providers/${encodeURIComponent(provider)}/models`);
    const models = data.models || [];
    const filtered = Number(data.filtered || 0);
    if (!models.length) {
      box.classList.add('hidden');
      document.querySelector('#provider-add-btn')?.classList.add('hidden');
      status.textContent = '该账号没有返回任何模型。';
      return;
    }
    providerModelsCache[provider] = models;
    box.innerHTML = models.map((m) => `<label class="model-pick"><input type="checkbox" value="${escapeHtml(m)}" /><span>${escapeHtml(m)}</span></label>`).join('');
    box.classList.remove('hidden');
    document.querySelector('#provider-add-btn')?.classList.remove('hidden');
    const search = document.querySelector('#provider-models-search');
    if (search) { search.value = ''; search.classList.remove('hidden'); }
    status.textContent = `共 ${models.length} 个可登记的文本模型${filtered ? `；已隐藏 ${filtered} 个需要专用适配的语音模型` : ''}。`;
  } catch (error) { status.textContent = error.message; }
};
window._filterProviderModels = function() {
  const input = document.querySelector('#provider-models-search');
  const box = document.querySelector('#provider-models-box');
  const status = document.querySelector('#provider-models-status');
  if (!input || !box) return;
  const query = input.value.trim().toLowerCase();
  let visible = 0;
  box.querySelectorAll('.model-pick').forEach((label) => {
    const hit = !query || label.textContent.toLowerCase().includes(query);
    label.style.display = hit ? '' : 'none';
    if (hit) visible += 1;
  });
  if (status && query) status.textContent = `匹配到 ${visible} 个模型`;
};
window._addProviderModels = async function(provider) {
  const box = document.querySelector('#provider-models-box');
  const status = document.querySelector('#provider-models-status');
  const picked = Array.from(box?.querySelectorAll('input[type=checkbox]:checked') || []).map((el) => el.value);
  if (!picked.length) { if (status) status.textContent = '请先勾选要添加的模型。'; return; }
  try {
    const data = await api(`/api/providers/${encodeURIComponent(provider)}/add-models`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ models: picked }) });
    if (status) status.textContent = `已添加 ${data.added.length} 个模型；到“② 模型分配”里即可选用。`;
  } catch (error) { if (status) status.textContent = error.message; }
};

function renderKeyWorkspace(data, fields, titles) {
  const providers = keyProviderItems(data, fields, titles);
  if (selectedKeyProvider !== '__provider_form__' && !providers.some((provider) => provider.id === selectedKeyProvider)) selectedKeyProvider = providers[0]?.id || null;
  let detail = '<p class="hint">请选择一个供应商。</p>';
  let selected = null;
  if (selectedKeyProvider === '__provider_form__') {
    detail = renderProviderForm();
  } else {
    selected = providers.find((provider) => provider.id === selectedKeyProvider) || providers[0];
    if (selected?.kind === 'official') detail = renderOfficialKeyDetail(selected, fields, data);
    if (selected?.kind === 'ollama') detail = renderOllamaKeyDetail(data.local_ollama);
    if (selected?.kind === 'service') detail = renderServiceKeyDetail(selected.service);
    if (selected?.kind === 'custom') detail = renderCustomKeyDetail(selected.provider);
  }
  return `<div class="key-workspace"><aside class="key-provider-list">${providers.map((provider) => `<button type="button" class="${provider.id === selected?.id ? 'active' : ''}" onclick="window._selectKeyProvider('${escapeHtml(provider.id)}')"><span class="provider-status ${provider.ready ? 'ready' : ''}"></span><span><b>${escapeHtml(provider.name)}</b><small>${escapeHtml(provider.note)}</small></span><em>${provider.ready ? '已配置' : '待配置'}</em></button>`).join('')}<button type="button" class="add-provider" onclick="window._startProviderForm()">＋ 添加供应商</button></aside><section class="key-provider-detail">${detail}</section></div>`;
}

function selectKeyProvider(id) {
  selectedKeyProvider = id;
  if (settingsData) renderSettings(settingsData);
}
window._selectKeyProvider = selectKeyProvider;
let selectedServiceId = null;
let providerForm = null;
function renderServiceAccountSummary(service) {
  const count = (service.connections || []).length;
  const models = (service.connections || []).flatMap((connection) => connection.models || []);
  return `<div class="account-summary"><div><b>${escapeHtml(service.name)}</b><p class="hint">${escapeHtml(service.base_url)} · 已配置 ${count} 项能力</p>${models.length ? `<div class="model-inventory compact"><span>模型</span>${models.map((model) => `<i>${escapeHtml(model)}</i>`).join('')}</div>` : ''}</div>
    <button type="button" class="secondary" onclick="window._manageService('${escapeHtml(service.id)}')">管理能力</button></div>`;
}
function renderServiceManager(services) {
  if (!services.length) return `<div class="service-detail"><h4>还没有服务账号</h4><p class="hint">先添加一个服务账号，再在这里查看和管理它的能力。</p><button type="button" onclick="window._startProviderForm()">＋ 添加服务账号</button></div>`;
  if (!services.some((service) => service.id === selectedServiceId)) selectedServiceId = services[0].id;
  const active = services.find((service) => service.id === selectedServiceId) || services[0];
  const items = services.map((service) => `<button type="button" class="${service.id === active.id ? 'active' : ''}" onclick="window._selectService('${escapeHtml(service.id)}')"><b>${escapeHtml(service.name)}</b><br><span class="hint">${(service.connections || []).length} 项能力</span></button>`).join('');
  const capabilities = (active.connections || []).map((connection) => {
    const state = connection.available ? '可在画布选择' : '等待服务适配器';
    return `<div class="capability-row"><b>${escapeHtml(connection.title)}</b><span class="hint">模型：${escapeHtml(connection.models.join('、'))}</span><br><span class="chip ${connection.available ? 'ok' : 'todo'}">${escapeHtml(state)}</span></div>`;
  }).join('') || '<p class="hint">尚未配置能力。</p>';
  return `<div class="service-manager"><aside class="service-list">${items}<button type="button" onclick="window._startProviderForm()">＋ 添加服务账号</button></aside>
    <section class="service-detail"><h4>${escapeHtml(active.name)}</h4><p class="hint">${escapeHtml(active.base_url)}</p><p class="hint">密钥：${escapeHtml(active.masked || '未填写（本地或免密服务）')}</p>${capabilities}
      <div class="wizard-actions"><button type="button" class="secondary" onclick="window._startProviderForm('${escapeHtml(active.id)}')">编辑服务账号</button><button type="button" class="secondary" onclick="window._deleteServiceConnection('${escapeHtml(active.id)}')">删除</button></div></section></div>`;
}
function startProviderForm(id = null) {
  const current = (settingsData?.service_connections || []).find((service) => service.id === id);
  providerForm = {
    editId: current?.id || null,
    name: current?.name || '',
    base_url: current?.base_url || '',
    api_key: '',
    detectedModels: [],
    discoveryMessage: '',
  };
  selectedKeyProvider = '__provider_form__';
  if (settingsData) renderSettings(settingsData);
}
function renderProviderForm() {
  const form = providerForm || {};
  const detected = form.detectedModels || [];
  const detectedList = detected.length
    ? `<div class="model-picker"><span class="hint">已检测到 ${detected.length} 个模型，勾选要登记的：</span><div class="model-picker-options">${detected.map((model) => `<label><input type="checkbox" data-form-model value="${escapeHtml(model)}" /> ${escapeHtml(model)}</label>`).join('')}</div></div>`
    : '<p class="hint">尚未获取模型列表；可点击「获取模型列表」自动读取，或在下方手动填写模型 ID。</p>';
  return `<div class="key-detail-heading"><div><span class="eyebrow">OpenAI 兼容服务</span><h4>${form.editId ? '编辑供应商' : '添加供应商'}</h4><p>适用于云端网关、中转站或任何 OpenAI 协议接口。</p></div></div><section class="key-detail-section"><h5>账号信息</h5><div class="stack">
    <label class="set-field">供应商名称<input id="pf-name" value="${escapeHtml(form.name)}" placeholder="例如：我的中转站" autocomplete="off" /></label>
    <label class="set-field">API 地址<input id="pf-url" value="${escapeHtml(form.base_url)}" placeholder="https://api.example.com/v1" autocomplete="off" /><span class="hint">预览：{API 地址}/chat/completions</span></label>
    <label class="set-field">API 密钥${form.editId ? '（留空则不修改）' : '（本地服务可留空）'}<input id="pf-key" type="password" placeholder="只保存在本机" autocomplete="off" /></label>
    <div class="inline-actions"><button type="button" class="secondary" onclick="window._discoverProviderModels()">获取模型列表</button></div>
    ${form.discoveryMessage ? `<p class="hint">${escapeHtml(form.discoveryMessage)}</p>` : ''}
    ${detectedList}
    <label class="set-field">手动登记模型<input id="pf-manual-models" placeholder="模型 ID，多个用逗号分隔" autocomplete="off" /><span class="hint">模型将登记为「文本对话」能力，可在「模型分配」中用于文案创作与改写。</span></label>
  </div>
  <div class="inline-actions"><button type="button" onclick="window._saveProviderForm()">保存供应商</button><button type="button" class="secondary" onclick="window._cancelProviderForm()">取消</button></div></section>`;
}
function collectProviderForm() {
  if (!providerForm) return;
  providerForm.name = $('#pf-name')?.value.trim() || '';
  providerForm.base_url = $('#pf-url')?.value.trim() || '';
  providerForm.api_key = $('#pf-key')?.value.trim() || '';
}
async function discoverProviderModels() {
  if (!providerForm) return;
  collectProviderForm();
  if (!providerForm.base_url) { $('#settings-status').textContent = '请先填写 API 地址。'; return; }
  $('#settings-status').textContent = '正在读取供应商模型列表…';
  providerForm.detectedModels = [];
  providerForm.discoveryMessage = '';
  renderSettings(settingsData);
  try {
    const result = await api('/api/service-connections/discover-models', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_url: providerForm.base_url, api_key: providerForm.api_key, provider_id: providerForm.editId }),
    });
    providerForm.detectedModels = result.models || [];
    providerForm.discoveryMessage = providerForm.detectedModels.length
      ? `已检测到 ${providerForm.detectedModels.length} 个模型。`
      : '连接成功，但供应商未返回模型列表；可手动填写模型 ID。';
  } catch (error) {
    providerForm.discoveryMessage = `未能读取模型列表：${error.message}。可手动填写模型 ID。`;
  }
  renderSettings(settingsData);
  $('#settings-status').textContent = '';
}
async function saveProviderForm() {
  if (!providerForm) return;
  collectProviderForm();
  if (!providerForm.name || !providerForm.base_url) { $('#settings-status').textContent = '请填写供应商名称和 API 地址。'; return; }
  const detected = [...document.querySelectorAll('#settings-dialog [data-form-model]:checked')].map((input) => input.value);
  const manual = ($('#pf-manual-models')?.value || '').replace(/，/g, ',').split(',').map((model) => model.trim()).filter(Boolean);
  const models = [...new Set([...detected, ...manual])];
  if (!models.length) { $('#settings-status').textContent = '请至少勾选或填写一个模型 ID。'; return; }
  const body = { name: providerForm.name, base_url: providerForm.base_url, api_key: providerForm.api_key, kind: 'compatible', connections: [{ capability: 'chat', models }] };
  try {
    const url = providerForm.editId ? `/api/service-connections/${providerForm.editId}/update` : '/api/service-connections';
    const data = await api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const savedId = providerForm.editId || data.service_connections.at(-1)?.id || null;
    providerForm = null;
    selectedKeyProvider = savedId ? `service:${savedId}` : null;
    renderSettings(data); await populateStepModelSelectors(data);
    $('#settings-status').textContent = '供应商已保存；可在「模型分配」中把模型指派到文案创作或改写。';
  } catch (error) { $('#settings-status').textContent = '保存失败：' + error.message; }
}
function cancelProviderForm() {
  providerForm = null;
  selectedKeyProvider = null;
  if (settingsData) renderSettings(settingsData);
}
function renderOllamaCard(config) {
  if (!config) return '';
  return `<details class="settings-provider" data-local-provider="ollama">
    <summary><span class="provider-status ready"></span><span><b>本地 Ollama</b><small>${escapeHtml(config.base_url)} · 不需要 API Key</small></span><span class="settings-state ready">已配置</span></summary>
    <div class="settings-provider-body"><div class="model-inventory compact"><span>模型</span><i>${escapeHtml(config.model)}</i></div>
      <button type="button" class="secondary" style="margin-top:8px" onclick="window._deleteLocalOllama()">移除本地 Ollama</button>
    </div>
  </details>`;
}
function renderOllamaAddForm(config) {
  const baseUrl = config?.base_url || 'http://127.0.0.1:11434/v1';
  const model = config?.model || '';
  return `<details class="settings-provider"${config ? '' : ' open'}>
    <summary><span class="provider-status ${config ? 'ready' : ''}"></span><span><b>添加本地 Ollama</b><small>仅连接已在本机运行的服务，不下载模型</small></span><span class="settings-state">未配置</span></summary>
    <div class="settings-provider-body">
      <label class="set-field">本地接口地址<input id="ollama-url" type="text" value="${escapeHtml(baseUrl)}" autocomplete="off" /></label>
      <label class="set-field">模型名<input id="ollama-model" type="text" value="${escapeHtml(model)}" list="ollama-model-list" placeholder="先测试连接，再选择或填写模型名" autocomplete="off" /></label>
      <datalist id="ollama-model-list"></datalist>
      <button type="button" class="secondary" style="margin-top:10px" onclick="window._testLocalOllama()">测试连接并读取模型</button>
      <button type="button" id="ollama-save-btn" style="margin:10px 0 0 8px" onclick="window._saveLocalOllama()">保存 Ollama</button>
      <p class="hint">默认地址为 127.0.0.1:11434。保存后可在“② 模型分配”中用于文案创作和改写。</p>
    </div>
  </details>`;
}
async function addCustomProvider() {
  const body = {
    name: $('#cp-name')?.value.trim(),
    base_url: $('#cp-url')?.value.trim(),
    api_key: $('#cp-key')?.value.trim(),
    model: $('#cp-model')?.value.trim(),
  };
  if (!body.name || !body.base_url || !body.api_key) {
    $('#settings-status').textContent = '名称、接口地址、API Key 都要填。';
    return;
  }
  try {
    await api('/api/custom-providers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    $('#settings-status').textContent = '已添加，可在文案步骤的模型下拉框中选择它。';
    const data = await api('/api/settings');
    renderSettings(data);
    await populateStepModelSelectors(data);
  } catch (error) { $('#settings-status').textContent = '添加失败：' + error.message; }
}
async function deleteCustomProvider(id) {
  try {
    await api(`/api/custom-providers/${id}/delete`, { method: 'POST' });
    $('#settings-status').textContent = '已删除。';
    const data = await api('/api/settings');
    renderSettings(data);
    await populateStepModelSelectors(data);
  } catch (error) { $('#settings-status').textContent = '删除失败：' + error.message; }
}
async function deleteServiceConnection(id) {
  try {
    const data = await api(`/api/service-connections/${id}/delete`, { method: 'POST' });
    renderSettings(data);
    await populateStepModelSelectors(data);
    selectedServiceId = null;
    $('#settings-status').textContent = '服务连接已删除。';
  } catch (error) { $('#settings-status').textContent = '删除失败：' + error.message; }
}
async function testLocalOllama() {
  const baseUrl = $('#ollama-url')?.value.trim();
  const button = document.querySelector('[onclick="window._testLocalOllama()"]');
  if (button) button.disabled = true;
  $('#settings-status').textContent = '正在连接本机 Ollama…';
  try {
    const result = await api('/api/local-ollama/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ base_url: baseUrl }) });
    const list = $('#ollama-model-list');
    if (list) list.innerHTML = (result.models || []).map((name) => `<option value="${escapeHtml(name)}"></option>`).join('');
    const model = $('#ollama-model');
    if (model && !model.value.trim() && result.models?.length) model.value = result.models[0];
    $('#settings-status').textContent = result.models?.length ? `连接成功，检测到 ${result.models.length} 个本地模型。` : '连接成功，但 Ollama 还没有已安装的模型。';
  } catch (error) { $('#settings-status').textContent = '连接失败：' + error.message; }
  finally { if (button) button.disabled = false; }
}
async function saveLocalOllama() {
  const body = { base_url: $('#ollama-url')?.value.trim(), model: $('#ollama-model')?.value.trim() };
  if (!body.model) { $('#settings-status').textContent = '请先测试连接并选择模型名。'; return; }
  try {
    const data = await api('/api/local-ollama', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    $('#settings-status').textContent = '本地 Ollama 已保存，可在文案步骤的模型下拉框中选择它。';
    renderSettings(data);
    await populateStepModelSelectors(data);
  } catch (error) { $('#settings-status').textContent = '保存失败：' + error.message; }
}
async function deleteLocalOllama() {
  try {
    const data = await api('/api/local-ollama/delete', { method: 'POST' });
    $('#settings-status').textContent = '本地 Ollama 已移除。';
    renderSettings(data);
    await populateStepModelSelectors(data);
  } catch (error) { $('#settings-status').textContent = '移除失败：' + error.message; }
}
window._addCustomProvider = addCustomProvider;
window._deleteCustomProvider = deleteCustomProvider;
window._deleteServiceConnection = deleteServiceConnection;
window._startProviderForm = startProviderForm;
window._discoverProviderModels = discoverProviderModels;
window._saveProviderForm = saveProviderForm;
window._cancelProviderForm = cancelProviderForm;
window._testLocalOllama = testLocalOllama;
window._saveLocalOllama = saveLocalOllama;
window._deleteLocalOllama = deleteLocalOllama;
function selectService(id) { selectedServiceId = id; if (settingsData) renderSettings(settingsData); }
function manageService(id) { selectedServiceId = id; switchSettingsTab('services'); if (settingsData) renderSettings(settingsData); }
window._selectService = selectService;
window._manageService = manageService;
function modelProvider(value) {
  if (value === 'auto') return '自动选择';
  if (value.startsWith('service:')) return '已添加服务';
  if (value.startsWith('custom:') || value === 'local:ollama') return '已添加服务';
  if (value.startsWith('mimo-')) return '小米 MiMo';
  return '阿里云百炼';
}
function modelChoicesForModule(module, data) {
  const options = (module.options || []).map((option) => typeof option === 'string' ? { value: option, label: MODEL_LABELS[option] || option } : option);
  const customs = data.custom_providers || [];
  if (module.supports_custom) {
    customs.forEach((provider) => options.push({ value: `custom:${provider.id}`, label: `${provider.name} · ${provider.model}` }));
    if (data.local_ollama) options.push({ value: 'local:ollama', label: `Ollama · ${data.local_ollama.model}` });
  }
  // The server already applies the stricter rule: credentials + implemented
  // adapter. Do not recreate a looser client-side approximation here.
  return options;
}
function renderModelRouteRow(module, data) {
  const choices = modelChoicesForModule(module, data);
  const current = routeDraft[module.id];
  const selected = choices.some((choice) => choice.value === current) ? current : choices[0]?.value || '';
  if (selected) routeDraft[module.id] = selected;
  else delete routeDraft[module.id];
  const groups = new Map();
  choices.forEach((choice) => {
    const group = modelProvider(choice.value);
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(choice);
  });
  const options = [...groups.entries()].map(([group, entries]) => `<optgroup label="${escapeHtml(group)}">${entries.map((choice) => `<option value="${escapeHtml(choice.value)}"${choice.value === selected ? ' selected' : ''}>${escapeHtml(choice.label || choice.value)}</option>`).join('')}</optgroup>`).join('');
  const control = choices.length
    ? `<select data-route="${escapeHtml(module.id)}">${options}</select>`
    : '<div class="model-route-unavailable">请先在“密钥”中配置一个已适配的服务商</div>';
  return `<div class="model-route-row"><div><b>${escapeHtml(module.title)}</b><span>${escapeHtml(module.note || '')}</span></div>${control}</div>`;
}
async function saveModelRoutes() {
  const button = $('#settings-save');
  button.disabled = true;
  try {
    const routes = Object.fromEntries(Object.entries(routeDraft).filter(([, value]) => value));
    const data = await api('/api/settings/model-routes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ routes }) });
    activeModelRoutes = data.model_routes || {};
    renderSettings(data);
    syncVoiceProviderControls();
    $('#settings-status').textContent = '模型分配已保存，所有画布步骤将按这里的设置运行。';
  } catch (error) { $('#settings-status').textContent = '保存失败：' + error.message; }
  finally { button.disabled = false; }
}
function renderSettings(data) {
  settingsData = data;
  const fields = data.fields || [];
  const titles = data.provider_titles || {};
  const services = data.service_connections || [];
  const providers = PROVIDER_ORDER.filter((p) => fields.some((f) => f.group === p));
  const configuredOfficial = providers.filter((provider) => provider !== 'system' && providerReady(provider, fields));
  const accounts = $('#settings-accounts-content');
  accounts.innerHTML =
    `<p class="settings-intro"><b>已配置 ${configuredOfficial.length + services.length} 个供应商</b>。选择左侧供应商后，在右侧填写密钥、查看已登记模型或管理本地模型。</p>` +
    renderKeyWorkspace(data, fields, titles);
  routeDraft = { ...(data.model_routes || {}) };
  $('#settings-services-content').innerHTML = `<p class="settings-intro">为每个工作环节指定一个默认模型。只有已配置的服务账号及其模型才会显示；这里是唯一的模型分配入口。</p><div class="model-route-table">${(data.modules || []).map((module) => renderModelRouteRow(module, data)).join('')}</div>`;
  $('#settings-services-content').querySelectorAll('select[data-route]').forEach((select) => select.addEventListener('change', () => { routeDraft[select.dataset.route] = select.value; }));
}
async function openSettings(tab = 'accounts') {
  $('#settings-dialog').classList.remove('hidden');
  switchSettingsTab(tab);
  $('#settings-status').textContent = '正在读取当前配置…';
  try {
    const data = await api('/api/settings');
    renderSettings(data);
    $('#settings-status').textContent = missingText(data) || '';
  } catch (error) { $('#settings-status').textContent = '读取失败：' + error.message; }
  loadDataLocation();
}

// ── 数据保存位置（偏好设置页）──
function formatBytes(n) {
  if (!n) return '0';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
  return `${n.toFixed(n >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}
async function loadDataLocation() {
  const cur = $('#data-location-current');
  if (!cur) return;
  try {
    const d = await api('/api/data-location');
    cur.textContent = `当前：${d.current}（已用 ${formatBytes(d.usage)}）${d.is_custom ? ' · 已自定义' : ' · 默认位置'}`;
    $('#data-location-input').value = '';
  } catch (error) { cur.textContent = '读取失败：' + error.message; }
}
async function chooseDataLocation() {
  const note = $('#data-location-note');
  try {
    note.textContent = '正在打开文件夹选择器…';
    const d = await api('/api/data-location/choose');
    if (d.path) {
      $('#data-location-input').value = d.path;
      note.textContent = '已选择文件夹，点击“迁移到此处”确认。';
    } else {
      note.textContent = '已取消选择。';
    }
  } catch (error) { note.textContent = '打开选择器失败：' + error.message; }
}
async function migrateDataLocation() {
  const input = $('#data-location-input');
  const target = input?.value?.trim();
  if (!target) { $('#data-location-note').textContent = '请先填写新的数据目录路径。'; return; }
  if (!window.confirm(`确定把全部项目数据迁移到：\n${target}\n\n本地配置也会同步（目标已有配置时不会覆盖）。迁移后需重启软件生效，原数据保留备份。`)) return;
  const note = $('#data-location-note');
  note.textContent = '正在迁移，请勿关闭软件…';
  try {
    const d = await api('/api/data-location', { method: 'POST', body: JSON.stringify({ path: target }) });
    note.textContent = d.message || '迁移完成，重启后生效。';
    loadDataLocation();
  } catch (error) { note.textContent = '迁移失败：' + error.message; }
}
async function resetDataLocation() {
  if (!window.confirm('恢复默认数据位置？数据和本地配置会搬回默认目录，重启软件后生效；原位置不会删除。')) return;
  try {
    const d = await api('/api/data-location/reset', { method: 'POST' });
    $('#data-location-note').textContent = d.message || '已恢复默认位置。';
    loadDataLocation();
  } catch (error) { $('#data-location-note').textContent = '操作失败：' + error.message; }
}
function missingText(data) {
  const configured = (data.fields || []).filter((f) => f.configured).length;
  return configured ? '' : '请先按你准备使用的功能填写对应供应商的 API Key。';
}
function closeSettings() { $('#settings-dialog').classList.add('hidden'); }
async function saveSettings() {
  if ($('#settings-save')?.dataset.settingsSaveMode === 'services') {
    await saveModelRoutes();
    return;
  }
  const payload = {};
  document.querySelectorAll('#settings-accounts-content input[data-field]').forEach((input) => {
    if (input.value.trim()) payload[input.dataset.field] = input.value.trim();
  });
  $('#settings-save').disabled = true;
  try {
    await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await api('/api/settings');
    renderSettings(data);
    await populateStepModelSelectors(data);
    $('#settings-status').textContent = '设置已保存。未配置的服务只会在使用对应功能时提示填写。';
  } catch (error) { $('#settings-status').textContent = '保存失败：' + error.message; }
  finally { $('#settings-save').disabled = false; }
}
window._openSettings = openSettings;
window._closeSettings = closeSettings;
window._saveSettings = saveSettings;
window._switchSettingsTab = switchSettingsTab;
window._chooseDataLocation = chooseDataLocation;
window._migrateDataLocation = migrateDataLocation;
window._resetDataLocation = resetDataLocation;
$('#data-location-choose')?.addEventListener('click', chooseDataLocation);
$('#data-location-migrate')?.addEventListener('click', migrateDataLocation);
$('#data-location-reset')?.addEventListener('click', resetDataLocation);
// 设置入口：左下角导航栏底部的「⚙ 设置」按钮（由 upgrade.js 注入），也用于首次密钥配置

// 不因未填写某一家供应商而强制弹出设置；用户按自己要用的环节配置即可。
// 调试钩子：?settings=open 自动打开设置弹窗（用于截图验收）
if (/[?&]settings=open/.test(location.search)) setTimeout(function () {
  var tm = location.search.match(/tab=(\w+)/);
  openSettings(tm ? tm[1] : 'accounts');
  if (/[?&]scroll=1/.test(location.search)) setTimeout(function () {
    var b = document.querySelector('#settings-dialog .settings-body');
    if (b) b.scrollTop = b.scrollHeight;
  }, 900);
}, 400);
