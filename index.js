/**
 * NAI 自定义端点（存在酱）for SillyTavern
 * 功能：
 *  1. 从最后一条 AI 消息里提取 <pic prompt="..."> 的提示词
 *  2. 拼上自定义前缀/负向，直连自定义 NAI 端点（OpenAI 兼容 /v1/images/generations）
 *  3. 生成结果在悬浮面板显示，可下载/插入聊天
 * 作者：夜夏和他的白龙女儿
 */
const MODULE = 'nai_custom_endpoint';
const DEFAULT_SETTINGS = {
  endpoint: 'https://api.cunzaijiang.cn/v1/images/generations',
  apiKey: '',
  model: 'nai-diffusion-4-5-curated',
  width: 832,
  height: 1216,
  steps: 28,
  scale: 5.0,
  sampler: 'k_euler_ancestral',
  noise_schedule: 'karras',
  prefix: '',
  negative: '',
  usePicTag: true,
  manualPrompt: '',
  autoInsert: false,
};

function getSettings() {
  const ctx = SillyTavern.getContext();
  if (!ctx.extensionSettings[MODULE]) {
    ctx.extensionSettings[MODULE] = { ...DEFAULT_SETTINGS };
    ctx.saveSettingsDebounced();
  }
  return ctx.extensionSettings[MODULE];
}

function lastAiText() {
  const ctx = SillyTavern.getContext();
  for (let i = ctx.chat.length - 1; i >= 0; i--) {
    const m = ctx.chat[i];
    if (!m.is_user && m.mes) return m.mes;
  }
  return '';
}

function extractPicPrompt(text) {
  if (!text) return null;
  const re = /<pic\s+prompt\s*=\s*"([^"]*)"/i;
  const m = text.match(re);
  return m ? m[1] : null;
}

function buildPrompt() {
  const s = getSettings();
  let base = '';
  if (s.usePicTag) {
    base = extractPicPrompt(lastAiText()) || '';
  }
  if (!base) base = s.manualPrompt || '';
  if (!base) return null;
  return [s.prefix, base].filter(Boolean).join(', ');
}

async function generate() {
  const s = getSettings();
  const prompt = buildPrompt();
  if (!prompt) {
    toastr.warning('没找到 <pic prompt>，也没填手动提示词');
    return;
  }
  if (!s.apiKey) {
    toastr.warning('请先填 API Key');
    return;
  }
  const ui = document.getElementById('nce-status');
  if (ui) ui.textContent = '生成中…';
  const body = {
    model: s.model,
    prompt: prompt,
    negative_prompt: s.negative || undefined,
    size: `${s.width}x${s.height}`,
    steps: s.steps,
    scale: s.scale,
    sampler: s.sampler,
    noise_schedule: s.noise_schedule,
  };
  try {
    const r = await fetch(s.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + s.apiKey,
      },
      body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j?.error?.message || ('HTTP ' + r.status));
    const b64 = j?.data?.[0]?.b64_json;
    if (!b64) throw new Error('响应里没有图片数据');
    showImage('data:image/png;base64,' + b64, prompt);
    if (ui) ui.textContent = '完成 ✅';
  } catch (e) {
    console.error('[NCE] 生成失败', e);
    if (ui) ui.textContent = '❌ ' + e.message;
    toastr.error('生成失败：' + e.message);
  }
}

function showImage(dataUrl, prompt) {
  const box = document.getElementById('nce-image');
  if (!box) return;
  box.innerHTML = '';
  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.width = '100%';
  img.style.borderRadius = '8px';
  box.appendChild(img);
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = 'nce_' + Date.now() + '.png';
  a.textContent = '⬇ 下载';
  a.style.display = 'inline-block';
  a.style.marginTop = '6px';
  box.appendChild(a);
  const ins = document.createElement('button');
  ins.textContent = '📋 复制 Prompt';
  ins.style.marginLeft = '8px';
  ins.onclick = () => {
    navigator.clipboard.writeText(prompt).then(() => toastr.success('Prompt 已复制'));
  };
  box.appendChild(ins);
}

function buildPanel() {
  if (document.getElementById('nce-panel')) return;
  const panel = document.createElement('div');
  panel.id = 'nce-panel';
  panel.innerHTML = `
    <div class="nce-header">
      <b>NAI 自定义端点</b>
      <span id="nce-close" style="cursor:pointer;padding:0 6px">✕</span>
    </div>
    <div class="nce-body">
      <label>端点 URL</label>
      <input id="nce-endpoint" type="text" />
      <label>API Key</label>
      <input id="nce-apikey" type="password" />
      <label>模型</label>
      <input id="nce-model" type="text" />
      <div class="nce-row">
        <span>宽<input id="nce-width" type="number" style="width:64px" /></span>
        <span>高<input id="nce-height" type="number" style="width:64px" /></span>
      </div>
      <div class="nce-row">
        <span>步数<input id="nce-steps" type="number" style="width:56px" /></span>
        <span>CFG<input id="nce-scale" type="number" step="0.1" style="width:56px" /></span>
      </div>
      <label>常见提示词前缀（画师串）</label>
      <textarea id="nce-prefix" rows="2"></textarea>
      <label>负向提示词</label>
      <textarea id="nce-negative" rows="2"></textarea>
      <label><input id="nce-usepic" type="checkbox" /> 从最后一条 AI 消息提取 &lt;pic prompt&gt;</label>
      <label>手动提示词（找不到 tag 时用）</label>
      <textarea id="nce-manual" rows="2"></textarea>
      <div class="nce-buttons">
        <button id="nce-save">保存设置</button>
        <button id="nce-gen">🎨 生成</button>
      </div>
      <div id="nce-status"></div>
      <div id="nce-image"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const s = getSettings();
  panel.querySelector('#nce-endpoint').value = s.endpoint;
  panel.querySelector('#nce-apikey').value = s.apiKey;
  panel.querySelector('#nce-model').value = s.model;
  panel.querySelector('#nce-width').value = s.width;
  panel.querySelector('#nce-height').value = s.height;
  panel.querySelector('#nce-steps').value = s.steps;
  panel.querySelector('#nce-scale').value = s.scale;
  panel.querySelector('#nce-prefix').value = s.prefix;
  panel.querySelector('#nce-negative').value = s.negative;
  panel.querySelector('#nce-usepic').checked = s.usePicTag;
  panel.querySelector('#nce-manual').value = s.manualPrompt;

  panel.querySelector('#nce-save').onclick = () => {
    const t = getSettings();
    t.endpoint = panel.querySelector('#nce-endpoint').value.trim();
    t.apiKey = panel.querySelector('#nce-apikey').value.trim();
    t.model = panel.querySelector('#nce-model').value.trim() || t.model;
    t.width = parseInt(panel.querySelector('#nce-width').value) || t.width;
    t.height = parseInt(panel.querySelector('#nce-height').value) || t.height;
    t.steps = parseInt(panel.querySelector('#nce-steps').value) || t.steps;
    t.scale = parseFloat(panel.querySelector('#nce-scale').value) || t.scale;
    t.prefix = panel.querySelector('#nce-prefix').value;
    t.negative = panel.querySelector('#nce-negative').value;
    t.usePicTag = panel.querySelector('#nce-usepic').checked;
    t.manualPrompt = panel.querySelector('#nce-manual').value;
    const ctx = SillyTavern.getContext();
    ctx.saveSettingsDebounced();
    toastr.success('设置已保存');
  };
  panel.querySelector('#nce-gen').onclick = () => generate();
  panel.querySelector('#nce-close').onclick = () => { panel.style.display = 'none'; };
}

function buildButton() {
  if (document.getElementById('nce-fab')) return;
  const btn = document.createElement('div');
  btn.id = 'nce-fab';
  btn.title = 'NAI 自定义端点';
  btn.innerHTML = '🎨';
  btn.onclick = () => {
    const p = document.getElementById('nce-panel');
    if (!p) { buildPanel(); }
    const panel = document.getElementById('nce-panel');
    panel.style.display = panel.style.display === 'none' ? 'flex' : 'none';
  };
  document.body.appendChild(btn);
}

jQuery(async () => {
  buildPanel();
  buildButton();
  document.getElementById('nce-panel').style.display = 'none';
  console.log('[NCE] NAI 自定义端点扩展已加载');
});
