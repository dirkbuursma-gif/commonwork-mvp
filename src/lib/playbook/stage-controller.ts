export function stageIndexFromHash(hash: string, ids: readonly string[]): number {
  let id = '';
  try { id = decodeURIComponent(hash.replace(/^#/, '')); } catch { return 0; }
  const found = ids.indexOf(id);
  return found < 0 ? 0 : found;
}

export function initializePlaybook(): void {
  const root = document.querySelector<HTMLElement>('[data-lr-mode]');
  if (!root || root.dataset.lrController === 'true') return;
  root.dataset.lrController = 'true';
  root.querySelector('[data-lr-print]')?.addEventListener('click', () => window.print());
  const playbackState = (video: HTMLVideoElement, message: string, failed: boolean) => {
    const media = video.closest('.lr-media');
    const status = media?.querySelector('.lr-playback-status');
    const reload = media?.querySelector<HTMLButtonElement>('[data-lr-reload]');
    if (status) status.textContent = message;
    if (reload) reload.hidden = !failed;
  };
  root.addEventListener('play', (event) => {
    if (!(event.target instanceof HTMLVideoElement)) return;
    const active = event.target;
    root.querySelectorAll('video').forEach((video) => { if (video !== active) video.pause(); });
  }, true);
  root.addEventListener('loadeddata', (event) => {
    if (event.target instanceof HTMLVideoElement) playbackState(event.target, '', false);
  }, true);
  root.addEventListener('error', (event) => {
    if (event.target instanceof HTMLVideoElement) playbackState(event.target, 'Playback failed. Reload the video or check access and connection.', true);
  }, true);
  root.querySelectorAll('[data-lr-reload]').forEach((button) => button.addEventListener('click', () => {
    const video = button.closest('.lr-media')?.querySelector('video');
    if (!video) return;
    const url = new URL(video.getAttribute('src') ?? '', location.origin);
    url.searchParams.set('refresh', String(Date.now()));
    video.src = url.pathname + url.search;
    playbackState(video, '', false);
    video.load();
    void video.play().catch(() => playbackState(video, 'Press play to retry.', true));
  }));
  if (root.dataset.lrMode !== 'presentation') return;
  const main = root.querySelector<HTMLElement>('.lr-main');
  const slides = Array.from(root.querySelectorAll<HTMLElement>('[data-lr-slide]'));
  if (!main || slides.length === 0) return;
  const dots = Array.from(root.querySelectorAll<HTMLAnchorElement>('[data-lr-dot]'));
  const prev = root.querySelector<HTMLButtonElement>('[data-lr-prev]');
  const next = root.querySelector<HTMLButtonElement>('[data-lr-next]');
  const debate = root.querySelector<HTMLDetailsElement>('.lr-debate');
  const fitStatus = root.querySelector<HTMLElement>('[data-lr-fit-status]');
  const ids = slides.map((slide) => slide.id);
  let current = 0;
  let frame = 0;
  document.documentElement.classList.add('lr-stage-document');
  root.dataset.lrEnhanced = 'true';
  const checkFit = () => {
    const overflow = main.scrollHeight > main.clientHeight + 3 || main.scrollWidth > main.clientWidth + 3;
    root.toggleAttribute('data-lr-overflow', overflow);
    if (fitStatus) fitStatus.hidden = !overflow;
  };
  const resetView = () => {
    window.scrollTo(0, 0);
    main.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };
  const schedule = (reset: boolean) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      if (reset) resetView();
      checkFit();
    });
  };
  const show = (index: number, updateHash: boolean) => {
    current = Math.max(0, Math.min(index, slides.length - 1));
    slides.forEach((slide, i) => slide.toggleAttribute('hidden', i !== current));
    dots.forEach((dot, i) => { if (i === current) dot.setAttribute('aria-current', 'step'); else dot.removeAttribute('aria-current'); });
    if (prev) prev.disabled = current === 0;
    if (next) next.disabled = current === slides.length - 1;
    if (debate) { debate.open = false; debate.hidden = current === 0; }
    root.querySelectorAll('video').forEach((video) => video.pause());
    if (updateHash) history.replaceState(null, '', `#${ids[current]}`);
    const announce = root.querySelector('[data-lr-announce]');
    if (announce) announce.textContent = `Slide ${current + 1} of ${slides.length}: ${slides[current].querySelector('h1')?.textContent ?? ''}`;
    resetView();
    schedule(true);
  };
  dots.forEach((dot, index) => dot.addEventListener('click', (event) => { event.preventDefault(); show(index, true); }));
  prev?.addEventListener('click', () => show(current - 1, true));
  next?.addEventListener('click', () => show(current + 1, true));
  window.addEventListener('hashchange', () => show(stageIndexFromHash(location.hash, ids), false));
  window.addEventListener('resize', () => schedule(false));
  window.addEventListener('pageshow', () => { resetView(); schedule(true); });
  document.addEventListener('keydown', (event) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.target instanceof Element && event.target.closest('a,button,input,textarea,select,summary,video,dialog,[contenteditable]')) return;
    if (debate?.open) return;
    if (['ArrowRight','PageDown',' '].includes(event.key)) show(current + (event.shiftKey && event.key === ' ' ? -1 : 1), true);
    else if (['ArrowLeft','PageUp'].includes(event.key)) show(current - 1, true);
    else if (event.key === 'Home') show(0, true);
    else if (event.key === 'End') show(slides.length - 1, true);
    else return;
    event.preventDefault();
  });
  const full = root.querySelector<HTMLButtonElement>('[data-lr-full]');
  if (full && document.fullscreenEnabled) {
    full.hidden = false;
    full.addEventListener('click', () => {
      if (document.fullscreenElement) void document.exitFullscreen();
      else void document.documentElement.requestFullscreen().catch(() => {});
    });
    document.addEventListener('fullscreenchange', () => { full.textContent = document.fullscreenElement ? 'Leave full screen' : 'Full screen'; schedule(true); });
  }
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => schedule(false)).observe(main);
  void document.fonts.ready.then(() => schedule(false));
  show(stageIndexFromHash(location.hash, ids), false);
}
