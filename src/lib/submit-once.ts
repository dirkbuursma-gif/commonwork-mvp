export function enableSubmitOnce(root: ParentNode = document) {
  root.querySelectorAll<HTMLFormElement>('form[data-submit-once]').forEach((form) => {
    form.addEventListener('submit', (event) => {
      if (form.dataset.submitting === 'true') {
        event.preventDefault();
        return;
      }
      form.dataset.submitting = 'true';
      form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((button) => {
        button.setAttribute('aria-disabled', 'true');
        button.disabled = true;
      });
    });
  });

  // Restoring the page from the back/forward cache must not leave the form locked.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    root.querySelectorAll<HTMLFormElement>('form[data-submit-once]').forEach((form) => {
      delete form.dataset.submitting;
      form.querySelectorAll<HTMLButtonElement>('button[type="submit"]').forEach((button) => {
        button.removeAttribute('aria-disabled');
        button.disabled = button.dataset.cooldownUntil ? Number(button.dataset.cooldownUntil) > Date.now() : false;
      });
    });
  });
}
