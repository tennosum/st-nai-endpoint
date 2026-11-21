/**
 * NAI 自定义端点（存在酱）for SillyTavern
 * 防御式实现：任何一步失败都会在页面显示错误信息，方便排查
 * 作者：夜夏和他的白龙女儿
 */
(function () {
  'use strict';
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
  };

  function log() { try { console.log.apply(console, ['[NCE]'].concat([].slice.call(arguments))); } catch (e) {} }

  function showError(msg) {
    try {
      let d = document.getElementById('nce-errorbar');
      if (!d) {
        d = document.createElement('div');
        d.id = 'nce-errorbar';
        d.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:99999;background:#7a1f1f;color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;white-space:pre-wrap;';
        document.body.appendChild(d);
      }
      d.textContent = 'NCE 错误：' + msg;
    } catch (e) {}
  }

  function ctxOrNull() {
    try { return window.SillyTavern && window.SillyTavern.getContext ? window.SillyTavern.getContext() : null; } catch (e) { return null; }
  }

  function getSettings() {
    const ctx = ctxOrNull();
    if (!ctx) throw new Error('拿不到 SillyTavern 上下文（context）');
    if (!ctx.extensionSettings[MODULE]) {
      ctx.extensionSettings[MODULE] = Object.assign({}, DEFAULT_SETTINGS);
      if (ctx.saveSettingsDebounced) ctx.saveSettingsDebounced();
    }
    return ctx.extensionSettings[MODULE];
  }

  function lastAiText() {
    const ctx = ctxOrNull();
    if (!ctx || !ctx.chat) return '';
    for (let i = ctx.chat.length - 1; i >= 0; i--) {
      const m = ctx.chat[i];
      if (m && !m.is_user && m.mes) return m.mes;
    }
    return '';
  }

  function extractPicPrompt(text) {
    if (!text) return null;
    const m = text.match(/<pic\s+prompt\s*=\s*"([^"]*)"/i);
    return m ? m[1] : null;
  }

  function buildPrompt() {
    const s = getSettings();
    let base = '';
    if (s.usePicTag) base = extractPicPrompt(lastAiText()) || '';
    if (!base) base = s.manualPrompt || '';
    if (!base) return null;
    return [s.prefix, base].filter(Boolean).join(', ');
  }

  function setStatus(t) {
    const el = document.getElementById('nce-status');
    if (el) el.textContent = t;
  }

  function showImage(dataUrl, prompt) {
    const box = document.getElementById('nce-image');
    if (!box) return;
    box.innerHTML = '';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width:100%;border-radius:8px;display:block;';
    box.appendChild(img);
    const bar = document.createElement('div');
    bar.style.cssText = 'display:flex;gap:8px;margin-top:6px;';
    const dl = document.createElement('a');
    dl.href = dataUrl;
    dl.download = 'nce_' + Date.now() + '.png';
    dl.textContent = '⬇ 下载';
    dl.style.cssText = 'flex:1;text-align:center;padding:5px 0;background:#2e2e38;border:1px solid #555;border-radius:6px;color:#eee;text-decoration:none;font-size:12px;';
    bar.appendChild(dl);
    const cp = document.createElement('button');
    cp.textContent = '📋 复制 Prompt';
    cp.style.cssText = 'flex:1;padding:5px 0;background:#2e2e38;border:1px solid #555;border-radius:6px;color:#eee;font-size:12px;cursor:pointer;';
    cp.onclick = function () {
      if (navigator.clipboard) navigator.clipboard.writeText(prompt).then(function () { if (window.toastr) toastr.success('Prompt 已复制'); });
    };
    bar.appendChild(cp);
    box.appendChild(bar);
  }

  async function generate() {
    let s;
    try { s = getSettings(); } catch (e) { showError(e.message); return; }
    const prompt = buildPrompt();
    if (!prompt) { if (window.toastr) toastr.warning('没有找到 <pic prompt>，也没填手动提示词'); return; }
    if (!s.apiKey) { if (window.toastr) toastr.warning('请先填 API Key'); return; }
    setStatus('生成中…');
    const body = {
      model: s.model, prompt: prompt,
      negative_prompt: s.negative || undefined,
      size: s.width + 'x' + s.height,
      steps: s.steps, scale: s.scale,
      sampler: s.sampler, noise_schedule: s.noise_schedule,
    };
    try {
      const r = await fetch(s.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + s.apiKey },
        body: JSON.stringify(body),
      });
      const j = await r.json();
      if (!r.ok) throw new Error((j && j.error && j.error.message) || ('HTTP ' + r.status));
      const b64 = j && j.data && j.data[0] && j.data[0].b64_json;
      if (!b64) throw new Error('响应里没有图片数据');
      showImage('data:image/png;base64,' + b64, prompt);
      setStatus('完成 ✅');
    } catch (e) {
      log('生成失败', e);
      setStatus('❌ ' + e.message);
      showError('生成失败：' + e.message);
    }
  }

  function buildPanel() {
    if (document.getElementById('nce-panel')) return;
    const panel = document.createElement('div');
    panel.id = 'nce-panel';
    panel.style.display = 'none';
    panel.innerHTML =
      '<div class="nce-header"><b>NAI 自定义端点</b><span id="nce-close" style="cursor:pointer;padding:0 8px">✕</span></div>' +
      '<div class="nce-body">' +
      '<label>端点 URL</label><input id="nce-endpoint" type="text" />' +
      '<label>API Key</label><input id="nce-apikey" type="password" />' +
      '<label>模型</label><input id="nce-model" type="text" />' +
      '<div class="nce-row"><span>宽<input id="nce-width" type="number" /></span><span>高<input id="nce-height" type="number" /></span></div>' +
      '<div class="nce-row"><span>步数<input id="nce-steps" type="number" /></span><span>CFG<input id="nce-scale" type="number" step="0.1" /></span></div>' +
      '<label>常见提示词前缀（画师串）</label><textarea id="nce-prefix" rows="2"></textarea>' +
      '<label>负向提示词</label><textarea id="nce-negative" rows="2"></textarea>' +
      '<label><input id="nce-usepic" type="checkbox" /> 从最后一条 AI 消息提取 &lt;pic prompt&gt;</label>' +
      '<label>手动提示词（找不到 tag 时用）</label><textarea id="nce-manual" rows="2"></textarea>' +
      '<div class="nce-buttons"><button id="nce-save">保存设置</button><button id="nce-gen">🎨 生成</button></div>' +
      '<div id="nce-status"></div><div id="nce-image"></div>' +
      '</div>';
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

    panel.querySelector('#nce-save').onclick = function () {
      const t = gsSafe();
      if (!t) return;
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
      const c = ctxOrNull();
      if (c && c.saveSettingsDebounced) c.saveSettingsDebounced();
      if (window.toastr) toastr.success('设置已保存');
    };
    panel.querySelector('#nce-gen').onclick = generate;
    panel.querySelector('#nce-close').onclick = function () { panel.style.display = 'none'; };
  }

  function gsSafe() {
    try { return getSettings(); } catch (e) { showError(e.message); return null; }
  }

  function togglePanel() {
    try {
      buildPanel();
      const p = document.getElementById('nce-panel');
      p.style.display = (p.style.display === 'none' || !p.style.display) ? 'flex' : 'none';
    } catch (e) { showError(e.message); }
  }

  function buildButton() {
    if (document.getElementById('nce-fab')) return;
    const btn = document.createElement('div');
    btn.id = 'nce-fab';
    btn.title = 'NAI 自定义端点';
    btn.textContent = '🎨';
    btn.onclick = togglePanel;
    document.body.appendChild(btn);

    // 也放进扩展菜单（如果存在）
    try {
      const menu = document.getElementById('extensionsMenu');
      if (menu && menu.querySelectorAll) {
        const item = document.createElement('div');
        item.className = 'extension_container';
        item.style.cssText = 'padding:6px 10px;cursor:pointer;';
        item.textContent = '🎨 NAI 自定义端点';
        item.onclick = togglePanel;
        menu.appendChild(item);
      }
    } catch (e) {}
  }

  function init() {
    try {
      buildPanel();
      buildButton();
      log('扩展已加载');
    } catch (e) {
      log('初始化失败', e);
      showError(e.message || String(e));
    }
  }

  // 等待酒馆上下文可用再初始化
  let tries = 0;
  const timer = setInterval(function () {
    tries++;
    if (ctxOrNull()) {
      clearInterval(timer);
      init();
    } else if (tries > 100) {
      clearInterval(timer);
      showError('等了很久也没拿到 SillyTavern 上下文，扩展可能被禁用了');
    }
  }, 200);
})();
