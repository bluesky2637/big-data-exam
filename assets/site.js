(() => {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  const serviceWorkerUrl = new URL('../sw.js', document.currentScript.src);

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register(serviceWorkerUrl);

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', async () => {
          if (worker.state !== 'installed' || !navigator.serviceWorker.controller) return;
          const accepted = window.ExamUI
            ? await window.ExamUI.confirm('检测到题库新版本，是否立即更新？', '已有更新', '立即更新')
            : false;
          if (accepted) registration.waiting?.postMessage({ type: 'SKIP_WAITING' });
        });
      });
    } catch (error) {
      console.warn('离线缓存暂时不可用。', error);
    }
  });
})();
