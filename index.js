// NCE 最小加载测试
try {
  console.log('[NCE] index.js 已执行');
  function nceTestBox() {
    try {
      if (!document || !document.body) { setTimeout(nceTestBox, 200); return; }
      if (document.getElementById('nce-testbox')) return;
      const d = document.createElement('div');
      d.id = 'nce-testbox';
      d.style.cssText = 'position:fixed;left:8px;bottom:40px;z-index:999999;background:#c0392b;color:#fff;padding:8px 12px;border-radius:8px;font-size:13px;';
      d.textContent = 'NCE TEST OK ✅（扩展已加载）';
      document.body.appendChild(d);
    } catch (e) { setTimeout(nceTestBox, 500); }
  }
  nceTestBox();
} catch (e) {
  try { alert('NCE 加载失败: ' + (e && e.message)); } catch (e2) {}
}
