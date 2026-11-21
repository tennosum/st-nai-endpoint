/**
 * NAI 自定义端点（存在酱）for SillyTavern
 * 按 SillyTavern 官方 UI 扩展标准编写：
 *  - manifest.json（display_name/js/author 必填）
 *  - settings.html（renderExtensionTemplateAsync 加载）
 *  - APP_READY 事件初始化
 * 作者：夜夏和他的白龙女儿
 */
const NCE_MODULE = 'nai_custom_endpoint';

const NCE_DEFAULTS = Object.freeze({
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
});

function nceLog() {
  try { console.log.apply(console, ['[NCE]'].concat([].slice.call(arguments))); } catch (e) {}
}

function nceError(msg) {
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

function nceSettings() {
  const context = SillyTavern.getContext();
  if (!context.extensionSettings[NCE_MODULE]) {
    context.extensionSettings[NCE_MODULE] = structuredClone(NCE_DEFAULTS);
  }
  for (const key of Object.keys(NCE_DEFAULTS)) {
    if (!Object.hasOwn(context.extensionSettings[NCE_MODULE], key)) {
      context.extensionSettings[NCE_MODULE][key] = NCE_DEFAULTS[key];
    }
  }
  return context.extensionSettings[NCE_MODULE];
}

function nceLastAiText() {
  const context = SillyTavern.getContext();
  if (!context.chat || !context.chat.length) return '';
  for (let i = context.chat.length - 1; i >= 0; i--) {
    const m = context.chat[i];
    if (m && !m.is_user && m.mes) return m.mes;
  }
  return '';
}

function nceExtractPicPrompt(text) {
  if (!text) return null;
  const m = text.match(/<pic\s+prompt\s*=\s*"([^"]*)"/i);
  return m ? { prompt: m[1], index: -1 } : null;
}

function nceFindPicSource() {
  const context = SillyTavern.getContext();
  if (!context.chat || !context.chat.length) return null;
  for (let i = context.chat.length - 1; i >= 0; i--) {
    const m = context.chat[i];
    if (m && m.mes) {
      const hit = nceExtractPicPrompt(m.mes);
      if (hit) { hit.index = i; return hit; }
    }
  }
  return null;
}

function nceBuildPrompt() {
  const s = nceSettings();
  let base = '';
  let sourceIndex = -1;
  if (s.usePicTag) {
    const hit = nceFindPicSource();
    if (hit) { base = hit.prompt; sourceIndex = hit.index; }
  }
  if (!base) base = s.manualPrompt || '';
  if (!base) return null;
  return { prompt: [s.prefix, base].filter(Boolean).join(', '), sourceIndex };
}

function nceStatus(t) {
  const el = document.getElementById('nce-status');
  if (el) el.textContent = t;
}

function nceShowImage(dataUrl, prompt) {
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
  dl.className = 'menu_button';
  dl.style.flex = '1';
  dl.style.textAlign = 'center';
  dl.style.textDecoration = 'none';
  bar.appendChild(dl);
  const cp = document.createElement('button');
  cp.className = 'menu_button';
  cp.textContent = '📋 复制 Prompt';
  cp.style.flex = '1';
  cp.onclick = () => {
    if (navigator.clipboard) navigator.clipboard.writeText(prompt).then(() => { if (window.toastr) toastr.success('Prompt 已复制'); });
  };
  bar.appendChild(cp);
  box.appendChild(bar);
}


async function nceInsertImageToChat(dataUrl, prompt, preferredIndex) {
  try {
    const context = SillyTavern.getContext();
    const chat = context.chat;
    if (!chat || !Array.isArray(chat)) throw new Error('没有聊天上下文');

    const title = (prompt || 'Generated image').slice(0, 80);

    // 优先：提供 tag 的那条消息；否则最后一条非用户消息
    let idx = -1;
    if (Number.isInteger(preferredIndex) && preferredIndex >= 0 && preferredIndex < chat.length && chat[preferredIndex]) {
      idx = preferredIndex;
    }
    if (idx < 0) {
      for (let i = chat.length - 1; i >= 0; i--) {
        if (chat[i] && !chat[i].is_user) { idx = i; break; }
      }
    }
    if (idx < 0 && chat.length > 0) idx = chat.length - 1;

    if (idx >= 0 && typeof context.appendMediaToMessage === 'function') {
      const message = chat[idx];
      if (!message.extra || typeof message.extra !== 'object') message.extra = {};
      if (!Array.isArray(message.extra.media)) message.extra.media = [];
      if (!message.extra.media.length && !message.extra.media_display) message.extra.media_display = 'gallery';
      const mediaEntry = { url: dataUrl, type: 'image', title, source: 'generated' };
      message.extra.media.push(mediaEntry);
      message.extra.inline_image = true;
      message.extra.media_index = message.extra.media.length - 1;

      const el = $(`.mes[mesid="${idx}"]`);
      if (el.length) {
        context.appendMediaToMessage(message, el, 'adjust');
      } else {
        nceLog('消息元素没找到，跳过重渲染');
      }
      if (typeof context.saveChat === 'function') await context.saveChat();
      else if (typeof context.saveChatDebounced === 'function') context.saveChatDebounced();
      nceLog('图片已附加到消息', idx);
      return;
    }

    // 旧版兜底：附加到消息的 extra.image
    if (idx >= 0) {
      const message = chat[idx];
      if (!message.extra || typeof message.extra !== 'object') message.extra = {};
      message.extra.image = dataUrl;
      message.extra.inline_image = true;
      message.extra.title = title;
      if (typeof context.saveChat === 'function') await context.saveChat();
      nceLog('图片已附加（legacy）到消息', idx);
      return;
    }

    // 最后兜底：新建消息（聊天为空时）
    const message = {
      name: context.name2 || 'Assistant',
      is_user: false,
      is_system: false,
      send_date: new Date().toISOString(),
      mes: 'Generated image',
      extra: {
        media: [{ url: dataUrl, type: 'image', title, source: 'generated' }],
        media_display: 'gallery',
        media_index: 0,
        inline_image: true,
      },
    };
    chat.push(message);
    if (typeof context.addOneMessage === 'function') context.addOneMessage(message);
    if (typeof context.saveChat === 'function') await context.saveChat();
    nceLog('聊天为空，新建图片消息');
  } catch (e) {
    nceLog('插入聊天失败', e);
    nceError('插入聊天失败：' + (e && e.message ? e.message : e));
  }
}

function nceAddSendFormButton() {
  try {
    if ($('#nce_send_button').length) return;
    const btn = $(
      '<div id="nce_send_button" class="mes_button" title="用当前配置生成图像并插入聊天" style="cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 4px;">' +
      '<span style="font-size:17px;line-height:1;">🎨</span></div>'
    );
    btn.on('click', function (ev) {
      ev.preventDefault();
      ev.stopPropagation();
      nceGenerate();
    });
    const left = $('#leftSendForm');
    if (left.length) left.append(btn);
    else if ($('#rightSendForm').length) $('#rightSendForm').prepend(btn);
    else if ($('#send_form').length) $('#send_form').prepend(btn);
    else nceLog('找不到输入栏容器，按钮未添加');
  } catch (e) {
    nceLog('添加输入栏按钮失败', e);
  }
}

async function nceGenerate() {
  const s = nceSettings();
  const built = nceBuildPrompt();
  if (!built) { if (window.toastr) toastr.warning('没有找到 <pic prompt>，也没填手动提示词'); return; }
  const prompt = built.prompt;
  const sourceIndex = built.sourceIndex;
  if (!s.apiKey) { if (window.toastr) toastr.warning('请先填 API Key'); return; }
  nceStatus('生成中…');
  const body = {
    model: s.model,
    prompt: prompt,
    negative_prompt: s.negative || undefined,
    size: s.width + 'x' + s.height,
    steps: s.steps,
    scale: s.scale,
    sampler: s.sampler,
    noise_schedule: s.noise_schedule,
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
    const dataUrl = 'data:image/png;base64,' + b64;
    nceShowImage(dataUrl, prompt);
    await nceInsertImageToChat(dataUrl, prompt, sourceIndex);
    nceStatus('完成 ✅（已插入聊天）');
  } catch (e) {
    nceLog('生成失败', e);
    nceStatus('❌ ' + e.message);
    nceError('生成失败：' + e.message);
  }
}

function nceFillForm() {
  const s = nceSettings();
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

function nceBindForm() {
  const save = document.getElementById('nce-save');
  if (save) save.onclick = () => {
    const s = nceSettings();
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
    SillyTavern.getContext().saveSettingsDebounced();
    if (window.toastr) toastr.success('设置已保存');
  };
  const gen = document.getElementById('nce-gen');
  if (gen) gen.onclick = nceGenerate;
}

async function nceInit() {
  try {
    const settingsHtml = await SillyTavern.getContext().renderExtensionTemplateAsync(
      'third-party/st-nai-endpoint',
      'settings'
    );
    $('#extensions_settings2').append(settingsHtml);
    nceFillForm();
    nceBindForm();
    nceAddSendFormButton();
    nceLog('扩展初始化完成');
  } catch (e) {
    nceLog('初始化失败', e);
    nceError('初始化失败：' + (e && e.message ? e.message : e));
  }
}

// 官方标准：APP_READY 事件初始化（on 挂载后若已就绪会自动触发）
try {
  const context = SillyTavern.getContext();
  const { eventSource, event_types } = context;
  eventSource.on(event_types.APP_READY, nceInit);
  nceLog('已注册 APP_READY 初始化');
} catch (e) {
  nceLog('注册 APP_READY 失败', e);
  nceError('注册初始化失败：' + (e && e.message ? e.message : e));
}
