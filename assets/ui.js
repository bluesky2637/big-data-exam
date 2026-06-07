(() => {
  let activeElement = null;
  let dialogQueue = Promise.resolve();

  function ensureLiveRegion() {
    let region = document.querySelector('#site-live-region');
    if (region) return region;
    region = document.createElement('div');
    region.id = 'site-live-region';
    region.className = 'sr-only';
    region.setAttribute('role', 'status');
    region.setAttribute('aria-live', 'polite');
    region.setAttribute('aria-atomic', 'true');
    document.body.appendChild(region);
    return region;
  }

  function announce(message) {
    const region = ensureLiveRegion();
    region.textContent = '';
    window.setTimeout(() => { region.textContent = message; }, 20);
  }

  function ensureDialog() {
    let backdrop = document.querySelector('#site-dialog');
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = 'site-dialog';
    backdrop.className = 'modal-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `
      <section class="summary-modal site-dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="site-dialog-title" aria-describedby="site-dialog-copy">
        <span class="eyebrow">操作确认</span>
        <h2 id="site-dialog-title">请确认</h2>
        <p id="site-dialog-copy"></p>
        <div class="site-dialog-actions">
          <button class="button button-quiet" type="button" data-dialog-cancel>取消</button>
          <button class="button button-primary" type="button" data-dialog-confirm>确定</button>
        </div>
      </section>`;
    document.body.appendChild(backdrop);
    return backdrop;
  }

  function closeDialog(backdrop, result, resolve) {
    backdrop.hidden = true;
    document.removeEventListener('keydown', backdrop._escapeHandler);
    if (activeElement && typeof activeElement.focus === 'function') activeElement.focus();
    resolve(result);
  }

  function showDialog({ title, message, confirmText = '确定', cancelText = '取消', confirmOnly = false }) {
    const backdrop = ensureDialog();
    const confirmButton = backdrop.querySelector('[data-dialog-confirm]');
    const cancelButton = backdrop.querySelector('[data-dialog-cancel]');
    activeElement = document.activeElement;
    backdrop.querySelector('#site-dialog-title').textContent = title;
    backdrop.querySelector('#site-dialog-copy').textContent = message;
    confirmButton.textContent = confirmText;
    cancelButton.textContent = cancelText;
    cancelButton.hidden = confirmOnly;
    backdrop.hidden = false;
    announce(message);

    return new Promise((resolve) => {
      const finish = (result) => closeDialog(backdrop, result, resolve);
      confirmButton.onclick = () => finish(true);
      cancelButton.onclick = () => finish(false);
      backdrop.onclick = (event) => {
        if (event.target === backdrop && !confirmOnly) finish(false);
      };
      backdrop._escapeHandler = (event) => {
        if (event.key === 'Escape' && !confirmOnly) finish(false);
      };
      document.addEventListener('keydown', backdrop._escapeHandler);
      window.setTimeout(() => (confirmOnly ? confirmButton : cancelButton).focus(), 0);
    });
  }

  function openDialog(options) {
    const pending = dialogQueue.then(() => showDialog(options));
    dialogQueue = pending.catch(() => false);
    return pending;
  }

  window.ExamUI = {
    announce,
    message(message, title = '提示') {
      return openDialog({ title, message, confirmText: '知道了', confirmOnly: true });
    },
    confirm(message, title = '请确认', confirmText = '确定') {
      return openDialog({ title, message, confirmText });
    },
  };
})();
