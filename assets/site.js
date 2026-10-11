(() => {
  const filters = document.querySelector('.filters');
  if (filters) {
    const buttons = [...filters.querySelectorAll('[data-filter]')];
    const cards = [...document.querySelectorAll('.project[data-category]')];
    const applyFilter = (value) => {
      const category = buttons.some((button) => button.dataset.filter === value) ? value : 'all';
      for (const button of buttons) button.setAttribute('aria-pressed', String(button.dataset.filter === category));
      for (const card of cards) card.hidden = category !== 'all' && card.dataset.category !== category;
    };
    const readFilter = () => applyFilter(new URL(window.location.href).searchParams.get('filter'));
    filters.hidden = false;
    readFilter();
    for (const button of buttons) {
      button.addEventListener('click', () => {
        const url = new URL(window.location.href);
        if (button.dataset.filter === 'all') url.searchParams.delete('filter');
        else url.searchParams.set('filter', button.dataset.filter);
        window.history.pushState(null, '', url);
        applyFilter(button.dataset.filter);
      });
    }
    window.addEventListener('popstate', readFilter);
  }

  const dialog = document.querySelector('#lightbox');
  const links = [...document.querySelectorAll('[data-lightbox]')];
  if (!dialog || !links.length || typeof dialog.showModal !== 'function') return;
  const image = dialog.querySelector('.lightbox-image');
  const original = dialog.querySelector('.original-link');
  const count = dialog.querySelector('.lightbox-count');
  const stage = dialog.querySelector('.lightbox-stage');
  const previous = dialog.querySelector('[data-prev]');
  const next = dialog.querySelector('[data-next]');
  let index = 0;
  let trigger;

  const showImage = (value) => {
    index = (value + links.length) % links.length;
    const link = links[index];
    image.src = link.href;
    image.alt = link.querySelector('img').alt;
    original.href = link.href;
    count.textContent = `${index + 1} / ${links.length}`;
    stage.scrollTop = 0;
  };

  previous.hidden = next.hidden = links.length === 1;
  for (const [position, link] of links.entries()) {
    link.addEventListener('click', (event) => {
      event.preventDefault();
      trigger = link;
      showImage(position);
      dialog.showModal();
      document.documentElement.classList.add('lightbox-open');
    });
  }
  dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
  previous.addEventListener('click', () => showImage(index - 1));
  next.addEventListener('click', () => showImage(index + 1));
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      showImage(index + (event.key === 'ArrowRight' ? 1 : -1));
    }
  });
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return;
    const bounds = dialog.getBoundingClientRect();
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.classList.remove('lightbox-open');
    trigger?.focus({ preventScroll: true });
  });
})();
