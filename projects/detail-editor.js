// ---------- Inline editor for project detail pages (shows only on local machine) ----------
// Shared by projects/project-*.html. Requires the local server (편집시작.cmd / serve.ps1)
// running on localhost so the File System Access API can write straight back to disk.
(function () {
  const IS_LOCAL =
    ['localhost', '127.0.0.1', '::1', ''].includes(location.hostname) ||
    location.protocol === 'file:';
  if (!IS_LOCAL) return; // never shown on the public site

  const SELECTORS = [
    '.detail-hero h1', '.detail-meta b',
    '.project-tags .tag',
    '.callout',
    '.detail-body p', '.detail-body li',
    '.detail-figure figcaption'
  ];
  const editables = () => document.querySelectorAll(SELECTORS.join(','));
  let editing = false, fileHandle = null, assetsDirHandle = null, galleryEl = null;

  // ---------- Toolbar ----------
  const bar = document.createElement('div');
  bar.id = 'edit-toolbar';
  bar.innerHTML =
    '<span class="status"></span>' +
    '<button id="ed-toggle">✏️ 편집</button>' +
    '<button id="ed-img" style="display:none">🖼️ 이미지 추가</button>' +
    '<button id="ed-yt" style="display:none">▶ 유튜브 추가</button>' +
    '<button id="ed-save" class="primary" style="display:none">💾 저장</button>';
  document.body.appendChild(bar);
  const status = bar.querySelector('.status');
  const btnToggle = bar.querySelector('#ed-toggle');
  const btnImg = bar.querySelector('#ed-img');
  const btnYt = bar.querySelector('#ed-yt');
  const btnSave = bar.querySelector('#ed-save');

  function setEditing(on) {
    editing = on;
    document.body.classList.toggle('editing', on);
    editables().forEach((el) => {
      if (on) { el.setAttribute('contenteditable', 'true'); el.spellcheck = false; }
      else { el.removeAttribute('contenteditable'); }
    });
    btnToggle.textContent = on ? '✖ 끝내기' : '✏️ 편집';
    btnImg.style.display = on ? '' : 'none';
    btnYt.style.display = on ? '' : 'none';
    btnSave.style.display = on ? '' : 'none';
    status.textContent = on ? '텍스트 클릭 수정 · 이미지/유튜브 추가 가능 · Ctrl+S 저장' : '';
  }
  btnToggle.addEventListener('click', () => setEditing(!editing));

  // Don't follow links while editing
  document.addEventListener('click', (e) => {
    if (editing) { const a = e.target.closest('a'); if (a) e.preventDefault(); }
  }, true);

  // ---------- Gallery (multiple images) ----------
  function getGallery() {
    if (galleryEl && document.body.contains(galleryEl)) return galleryEl;
    galleryEl = document.querySelector('.detail-gallery');
    if (!galleryEl) {
      galleryEl = document.createElement('div');
      galleryEl.className = 'detail-gallery';
      const firstFigure = document.querySelector('.detail-figure');
      if (firstFigure) firstFigure.insertAdjacentElement('afterend', galleryEl);
      else document.querySelector('.detail-body .wrap').appendChild(galleryEl);
    }
    return galleryEl;
  }

  function addRemoveButton(container) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'detail-remove-btn';
    btn.textContent = '✕ 삭제';
    btn.addEventListener('click', () => container.remove());
    container.appendChild(btn);
  }

  async function ensureAssetsDir() {
    if (assetsDirHandle) return assetsDirHandle;
    if (!window.showDirectoryPicker) {
      toast('⚠️ 이 브라우저는 이미지 자동 저장을 지원하지 않아요 (Chrome/Edge 사용)');
      return null;
    }
    try {
      assetsDirHandle = await window.showDirectoryPicker({ id: 'project-assets', mode: 'readwrite' });
      return assetsDirHandle;
    } catch (err) {
      return null; // user cancelled
    }
  }

  async function uniqueFileName(dirHandle, name) {
    let candidate = name;
    let i = 1;
    while (true) {
      try {
        await dirHandle.getFileHandle(candidate);
        const dot = name.lastIndexOf('.');
        const base = dot === -1 ? name : name.slice(0, dot);
        const ext = dot === -1 ? '' : name.slice(dot);
        candidate = `${base}-${i}${ext}`;
        i++;
      } catch (e) {
        return candidate; // doesn't exist yet
      }
    }
  }

  async function addImages() {
    if (!window.showOpenFilePicker) {
      toast('⚠️ 이 브라우저는 이미지 추가를 지원하지 않아요 (Chrome/Edge 사용)');
      return;
    }
    let files;
    try {
      files = await window.showOpenFilePicker({
        multiple: true,
        types: [{ description: 'Images', accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp'] } }]
      });
    } catch (err) { return; } // cancelled

    const dir = await ensureAssetsDir();
    const gallery = getGallery();

    for (const handle of files) {
      const file = await handle.getFile();
      let src = null;

      if (dir) {
        try {
          const name = await uniqueFileName(dir, file.name);
          const destHandle = await dir.getFileHandle(name, { create: true });
          const writable = await destHandle.createWritable();
          await writable.write(file);
          await writable.close();
          src = `assets/${name}`;
        } catch (err) { /* fall through to data URL */ }
      }
      if (!src) src = await new Promise((res) => {
        const reader = new FileReader();
        reader.onload = () => res(reader.result);
        reader.readAsDataURL(file);
      });

      const fig = document.createElement('figure');
      fig.className = 'detail-figure';
      const img = document.createElement('img');
      img.src = src; img.alt = file.name;
      const caption = document.createElement('figcaption');
      caption.textContent = file.name.replace(/\.[^.]+$/, '');
      fig.appendChild(img); fig.appendChild(caption);
      addRemoveButton(fig);
      gallery.appendChild(fig);
    }
    toast(dir ? `🖼️ 이미지 ${files.length}개 추가 (projects/assets/ 에 저장됨)` : `🖼️ 이미지 ${files.length}개 추가 (저장 시 파일에 직접 포함돼요)`);
  }
  btnImg.addEventListener('click', addImages);

  // ---------- YouTube embed ----------
  function extractYouTubeId(input) {
    const s = input.trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    const patterns = [
      /youtu\.be\/([\w-]{11})/,
      /youtube\.com\/watch\?v=([\w-]{11})/,
      /youtube\.com\/embed\/([\w-]{11})/,
      /youtube\.com\/shorts\/([\w-]{11})/
    ];
    for (const re of patterns) { const m = s.match(re); if (m) return m[1]; }
    return null;
  }

  function addYouTube() {
    const input = window.prompt('유튜브 URL 또는 영상 ID를 입력하세요');
    if (!input) return;
    const id = extractYouTubeId(input);
    if (!id) { toast('⚠️ 유효한 유튜브 링크가 아니에요'); return; }

    const wrap = document.createElement('div');
    wrap.className = 'video-embed';
    const iframe = document.createElement('iframe');
    const rawOrigin = location.origin && location.origin !== 'null' ? location.origin : 'https://dulgikim.github.io';
    const origin = encodeURIComponent(rawOrigin);
    iframe.src = `https://www.youtube.com/embed/${id}?rel=0&origin=${origin}`;
    iframe.title = 'YouTube video';
    iframe.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
    iframe.allowFullscreen = true;
    wrap.appendChild(iframe);
    addRemoveButton(wrap);

    const container = document.querySelector('.detail-body .wrap');
    container.appendChild(wrap);
    toast('▶ 유튜브 영상 추가');
  }
  btnYt.addEventListener('click', addYouTube);

  // ---------- Save ----------
  function cleanHTML() {
    const clone = document.documentElement.cloneNode(true);
    const tb = clone.querySelector('#edit-toolbar'); if (tb) tb.remove();
    clone.querySelectorAll('.edit-toast').forEach((n) => n.remove());
    clone.querySelectorAll('.detail-remove-btn').forEach((n) => n.remove());
    clone.querySelectorAll('[contenteditable]').forEach((el) => {
      el.removeAttribute('contenteditable'); el.removeAttribute('spellcheck');
    });
    const b = clone.querySelector('body'); if (b) b.classList.remove('editing');
    return '<!DOCTYPE html>\n' + clone.outerHTML + '\n';
  }

  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'edit-toast'; t.textContent = msg;
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 250); }, 3000);
  }

  async function save() {
    const html = cleanHTML();
    const suggestedName = location.pathname.split('/').pop() || 'project.html';
    if (window.showSaveFilePicker) {
      try {
        if (!fileHandle) {
          fileHandle = await window.showSaveFilePicker({
            suggestedName,
            types: [{ description: 'HTML file', accept: { 'text/html': ['.html'] } }]
          });
        }
        const w = await fileHandle.createWritable();
        await w.write(html); await w.close();
        toast('✅ 저장 완료 — commit/push 하면 사이트에 반영돼요');
        return;
      } catch (err) { if (err.name === 'AbortError') return; }
    }
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = suggestedName; a.click();
    URL.revokeObjectURL(url);
    toast(`⬇️ ${suggestedName} 내려받음 — 폴더의 파일과 교체하세요`);
  }
  btnSave.addEventListener('click', save);

  document.addEventListener('keydown', (e) => {
    if (editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault(); save();
    }
  });
})();
