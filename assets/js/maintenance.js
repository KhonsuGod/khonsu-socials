(() => {
  const page = document.querySelector('.maintenance-page');
  if (!page) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const finish = () => {
    page.classList.remove('is-animating');
    page.dataset.scene = 'complete';
  };

  if (reducedMotion.matches) {
    finish();
    return;
  }

  page.classList.add('is-animating');
  page.dataset.scene = 'dark';

  [
    [90, 'dark'],
    [980, 'gesture'],
    [2550, 'ignition'],
    [4150, 'complete']
  ].forEach(([delay, scene]) => {
    window.setTimeout(() => {
      page.dataset.scene = scene;
      if (scene === 'complete') page.classList.remove('is-animating');
    }, delay);
  });

  reducedMotion.addEventListener?.('change', (event) => {
    if (event.matches) finish();
  });
})();
