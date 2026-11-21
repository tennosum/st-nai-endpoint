/**
 * NAI 自定义端点（存在酱）for SillyTavern
 * 标准酒馆扩展：设置在「扩展」抽屉里
 * 作者：夜夏和他的白龙女儿
 */
jQuery(async () => {
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
        d.style.cssText = 'position:fixed;top:8px;left:8px;right:8px;z-index:2147483647;background:#7a1f1f;color:#fff;padding:8px 10px;border-radius:8px;font-size:12px;white-space:pre-wrap;';
        document.body.appendChild(d);
      }
      d.textContent = 'NCE 错误：' + msg;
    } catch (e) {}
  }

  const ctx = () => SillyTavern.getContext();

  function getSettings() {
    const c = ctx();
    if (!c.extensionSettings[MODULE]) {
      c.extensionSettings[MODULE] = Object.assign({}, DEFAULT_SETTINGS);
      c.saveSettingsDebounced();
    }
    return c.extensionSettings[MODULE];
  }

  function lastAiText() {
    const c = ctx();
    if (!c || !c.chat) return '';
    for (let i = c.chat.length - 1; i >= 0; i--) {
      const m = c.chat[i];
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
    dl.style.cssText = 'flex:1;text-align:center;padding:6px 0;background:#2e2e38;border:1px solid #555;border-radius:6px;color:#eee;text-decoration:none;font-size:12px;';
    bar.appendChild(dl);
    const cp = document.createElement('button');
    cp.textContent = '📋 复制 Prompt';
    cp.className = 'menu_button';
    cp.style.flex = '1';
    cp.onclick = () => { if (navigator.clipboard) navigator.clipboard.writeText(prompt).then(() => toastr.success('Prompt 已复制')); };
    bar.appendChild(cp);
    box.appendChild(bar);
  }

  async function generate() {
    const s = getSettings();
    const prompt = buildPrompt();
    if (!prompt) { toastr.warning('没有找到 <pic prompt>，也没填手动提示词'); return; }
    if (!s.apiKey) { toastr.warning('请先填 API Key'); return; }
    setStatus('生成中…');
    const body = {
      model: s.model, prompt,
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

  function fillForm() {
    const s = getSettings();
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v; };
    set('nce-endpoint', s.endpoint);
    set('nce-apikey', s.apiKey);
    set('nce-model', s.model);
    set('nce-width', s.width);
    set('nce-height', s.height);
    set('nce-steps', s.steps);
    set('nce-scale', s.scale);
    set('nce-prefix', s.prefix);
    set('nce-negative', s.negative);
    set('nce-manual', s.manualPrompt);
    const cb = document.getElementById('nce-usepic');
    if (cb) cb.checked = s.usePicTag;
  }

  function bindForm() {
    const save = document.getElementById('nce-save');
    if (save) save.onclick = () => {
      const s = getSettings();
      const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
      s.endpoint = val('nce-endpoint').trim();
      s.apiKey = val('nce-apikey').trim();
      s.model = val('nce-model').trim() || s.model;
      s.width = parseInt(val('nce-width')) || s.width;
      s.height = parseInt(val('nce-height')) || s.height;
      s.steps = parseInt(val('nce-steps')) || s.steps;
      s.scale = parseFloat(val('nce-scale')) || s.scale;
      s.prefix = val('nce-prefix');
      s.negative = val('nce-negative');
      s.manualPrompt = val('nce-manual');
      const cb = document.getElementById('nce-usepic');
      s.usePicTag = cb ? cb.checked : true;
      ctx().saveSettingsDebounced();
      toastr.success('设置已保存');
    };
    const gen = document.getElementById('nce-gen');
    if (gen) gen.onclick = generate;
  }

  try {
    let html = '';
    try {
      html = await renderExtensionTemplateAsync('third-party/st-nai-endpoint', 'settings');
    } catch (e) {
      log('渲染模板失败，用内联兜底', e);
      html = document.getElementById('nce-inline-fallback')?.outerHTML || '';
    }
    const containers = ['#extensions_settings2', '#extensions_settings', '#extensions_settings_content'];
    let appended = false;
    for (const sel of containers) {
      const el = $(sel);
      if (el.length > 0) {
        el.append(html);
        appended = true;
        log('已注入到', sel);
        break;
      }
    }
    if (!appended) {
      // 最后兜底：放 body 顶部
      $('body').append(html);
      log('已注入到 body');
    }
    fillForm();
    bindForm();
    log('扩展初始化完成');
  } catch (e) {
    console.error('[NCE] 初始化失败', e);
    showError('初始化失败：' + (e && e.message ? e.message : e));
  }
});
