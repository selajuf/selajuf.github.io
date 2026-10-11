import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const { owner, title, projects } = JSON.parse(readFileSync(join(root, 'content/projects.json'), 'utf8'));
const siteOrigin = 'https://selajuf.github.io';
const pages = ['index.html', ...projects.map((project) => `cases/${project.slug}/index.html`), '404.html'];
const outputs = [...pages, 'robots.txt', 'sitemap.xml', '.nojekyll'];
const read = (path) => readFileSync(join(root, path), 'utf8');
const escape = (value) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const decode = (value) => value.replace(/&(amp|lt|gt|quot|#39);/g, (match, entity) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[entity]);
const digest = (path) => createHash('sha256').update(readFileSync(join(root, path))).digest('hex');

test('Главная начинается с обычного h1 Работы без маркетингового intro', () => {
  const html = read('index.html');
  assert.match(html, /<main id="main">\s*<section class="works wrap"/);
  assert.match(html, /<h1 id="works-title">Работы<\/h1>/);
  for (const text of ['intro-title', 'Из повседневных задач', 'в понятный процесс.', 'Портфолио / ИИ и цифровые продукты', 'Проекты, прототипы и примеры интерфейсов.', 'От входящего сообщения до документа, заявки и видео.', 'Обсудить вашу задачу']) assert.ok(!html.includes(text), text);
});

test('Удаленные элементы отсутствуют на всех страницах и в стилях, включая адаптивные правила', () => {
  const removed = /(?<![\w-])(?:intro|intro-title|intro-bottom|lime-line|heading-count|work-count|filter-result|preview-label|preview-open|project-meta|project-arrow|project-short|project-status|media-kind|lightbox-caption|case-process|process-title|process-flow|flow-arrow)(?![\w-])|figcaption/;
  for (const page of pages) assert.doesNotMatch(read(page), removed, page);
  assert.doesNotMatch(read('assets/site.css'), removed);
  assert.match(read('assets/site.css'), /\.works h1\s*\{[^}]*font-size: 32px/);
  assert.match(read('assets/site.css'), /\.project-card:hover/);
  assert.match(read('assets/site.css'), /:focus-visible/);
});

function filesIn(directory) {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    return statSync(join(root, path)).isDirectory() ? filesIn(path) : [path];
  });
}

test('Сборка воспроизводима и не изменяет проверенные данные и материалы', () => {
  const sources = ['content/projects.json', ...filesIn('assets'), ...filesIn('cases').filter((file) => !file.endsWith('index.html'))];
  const before = new Map(sources.map((file) => [file, digest(file)]));
  const build = () => {
    const result = spawnSync(process.execPath, ['scripts/build.mjs'], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr || result.stdout);
  };
  build();
  const first = outputs.map(digest);
  build();
  assert.deepEqual(outputs.map(digest), first);
  for (const [file, hash] of before) assert.equal(digest(file), hash, `Изменен исходный материал: ${file}`);
});

test('Ровно шесть уникальных кейсов, 10 изображений и ни одного MP4', () => {
  assert.equal(projects.length, 6);
  assert.equal(new Set(projects.map((project) => project.slug)).size, 6);
  assert.equal(new Set(projects.map((project) => project.number)).size, 6);
  assert.deepEqual(projects.map((project) => project.slug), [
    'executive-assistant', 'meeting-assistant', 'report-control', 'telegram-miniapp', 'qr-quest', 'video-factory',
  ]);
  assert.deepEqual(projects.map((project) => project.category), ['agents', 'agents', 'agents', 'apps', 'apps', 'video']);
  assert.equal(projects.flatMap((project) => project.gallery).length, 10);
  assert.deepEqual(projects.filter((project) => project.video), []);
  const mediaFiles = filesIn('cases').filter((file) => /\.(webp|mp4)$/.test(file));
  assert.equal(mediaFiles.filter((file) => file.endsWith('.webp')).length, 10);
  assert.equal(mediaFiles.filter((file) => file.endsWith('.mp4')).length, 0);
});

test('Удаленные блоки, подсказка и кейс отсутствуют на всех публикационных страницах', () => {
  assert.ok(!existsSync(join(root, 'cases/product-visualization')));
  const generatedPages = ['index.html', '404.html', ...filesIn('cases').filter((file) => file.endsWith('.html'))];
  assert.deepEqual(new Set(generatedPages), new Set(pages));
  for (const page of generatedPages) {
    const html = read(page);
    assert.doesNotMatch(html, /class="[^"]*\b(?:evidence|tags)\b[^"]*"/);
    assert.ok(!html.includes('Изображения можно увеличить ↗'), page);
    assert.ok(!html.includes('product-visualization'), page);
    assert.ok(!html.includes('Товар в 3D: рендеры и видео'), page);
  }
  assert.ok(!read('sitemap.xml').includes('product-visualization'));
  assert.doesNotMatch(read('assets/site.css'), /\.(?:evidence|tags)\b|product-visualization|video-figure/);
});

test('Все локальные href, src, poster, CSS-ресурсы и якоря ведут к существующим файлам', () => {
  let checked = 0;
  for (const page of pages) {
    const html = read(page);
    for (const match of html.matchAll(/\b(href|src|poster)="([^"]*)"/g)) {
      const target = decode(match[2]);
      assert.ok(target, `${page}: пустой ${match[1]}`);
      const url = new URL(target, `${siteOrigin}/${page}`);
      assert.equal(url.origin, siteOrigin, `${page}: внешний ресурс ${target}`);
      let local = decodeURIComponent(url.pathname).slice(1);
      if (!local || local.endsWith('/')) local += 'index.html';
      assert.ok(existsSync(join(root, local)), `${page}: не найден ${target}`);
      if (url.hash) {
        const id = decodeURIComponent(url.hash.slice(1));
        assert.ok(read(local).includes(`id="${id}"`), `${page}: не найден якорь ${target}`);
      }
      checked++;
    }
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(ids.length, new Set(ids).size, `${page}: повторяющийся id`);
    assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${page}: нужен один h1`);
    assert.match(html, /<html lang="ru">/);
  }
  for (const match of read('assets/site.css').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
    assert.ok(existsSync(resolve(root, 'assets', match[1])), `Не найден CSS-ресурс: ${match[1]}`);
    checked++;
  }
  assert.equal(checked, 147, 'Проверка охватывает все ссылки и ресурсы; CTA удален вместе с intro');
});

test('Карточки содержат только изображения, заголовок и один дословный summary', () => {
  const cards = [...read('index.html').matchAll(/<article\b[\s\S]*?<\/article>/g)].map((match) => match[0]);
  assert.equal(cards.length, projects.length);
  for (const [index, project] of projects.entries()) {
    const card = cards[index];
    assert.doesNotMatch(card, /preview-label|preview-open|project-meta|project-arrow|project-short|project-status|Смотреть кейс|Открыть кейс/);
    assert.match(card, new RegExp(`href="\\./cases/${project.slug}/" aria-labelledby="title-${project.slug}"`));
    assert.ok(card.includes(`<h3 id="title-${project.slug}">${escape(project.title)}</h3>`));
    assert.deepEqual([...card.matchAll(/<p\b[^>]*>(.*?)<\/p>/g)].map((match) => match[1]), [escape(project.summary)]);
    const text = card.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
    assert.equal(text, `${escape(project.title)} ${escape(project.summary)}`);
    assert.equal([...card.matchAll(/<img\b/g)].length, project.category === 'apps' || project.slug === 'meeting-assistant' ? 2 : 1);
  }
});

test('Описания и доступные изображения сохранены дословно', () => {
  const home = read('index.html');
  assert.ok(home.includes(escape(owner)) && home.includes(escape(title)));
  let previousPosition = -1;
  for (const project of projects) {
    const html = read(`cases/${project.slug}/index.html`);
    for (const value of [project.title, project.summary, project.task, project.input, project.output, ...project.actions]) {
      assert.ok(html.includes(escape(value)), `${project.slug}: отсутствует ${value}`);
    }
    const position = home.indexOf(`id="title-${project.slug}"`);
    assert.ok(position > previousPosition, 'Порядок главной должен повторять JSON');
    previousPosition = position;
    for (const media of project.gallery) {
      assert.ok(html.includes(`alt="${escape(media.alt)}"`));
      assert.ok(html.includes(`href="../../${media.file}" data-lightbox`));
      assert.ok(html.includes(`aria-label="Увеличить: ${escape(media.alt)}"`));
    }
    assert.match(html, /<ul><li>/);
    assert.match(html, /rel="prev"/);
    assert.match(html, /rel="next"/);
    assert.ok(!html.includes('<video'));
  }
});

test('Повторный процесс удален; подход и разбор проекта сохранены', () => {
  for (const page of pages) assert.doesNotMatch(read(page), /case-process|process-title|process-flow|flow-arrow|Процесс в четырех шагах/);
  assert.doesNotMatch(read('assets/site.css'), /case-process|process-flow|flow-arrow/);
  const sectionHash = (html, pattern) => {
    const section = html.match(pattern)?.[0];
    assert.ok(section);
    return createHash('sha256').update(section).digest('hex');
  };
  assert.equal(sectionHash(read('index.html'), /<section class="approach wrap"[\s\S]*?<\/section>/), '8dde99a41209748f2a3306805d44079a8a7db98ff73cecd24e81f7160d4d95ce');
  assert.match(read('assets/site.css'), /\.step-number\s*\{/);
  assert.match(read('assets/site.css'), /\.eyebrow, \.step-number\s*\{[^}]*font-family:/);
  const storyHashes = [
    '77aa131b656c1aa5817ac689cdba6774a012b31d2c6de87912f2f69ab32576b7',
    '5b059373197082b9a8e4279a6ee34de35b9defd692760df3823e2232f85e71c2',
    '81eab29e6b6395308cc0bffd32d950a8fd897f08265f79a1699a0935385101eb',
    '22575cc285b4225ea24435806acfe0d7dade5a2f72517b12a18b264adafa666c',
    '96dc966ea14add4326038223f4333c5476d3422e9d4e3f457a1a0db4f53db707',
    'c873f510d9ae0c23ad8fca88e587d8314884e807984fd3693ce7693c9a21311b',
  ];
  for (const [index, project] of projects.entries()) {
    const path = `cases/${project.slug}/index.html`;
    assert.equal(sectionHash(read(path), /<section class="case-story"[\s\S]*?<\/section>/), storyHashes[index], project.slug);
  }
});

test('SEO, карта сайта, восстановление 404 и self-hosted шрифт', () => {
  for (const page of pages) {
    const html = read(page);
    const path = page === 'index.html' ? '/' : page === '404.html' ? '/404.html' : `/${dirname(page)}/`;
    assert.ok(html.includes(`<link rel="canonical" href="${siteOrigin}${path}">`));
    for (const field of ['title', 'description', 'url', 'image', 'image:alt', 'locale']) assert.ok(html.includes(`property="og:${field}"`));
    assert.match(html, /<meta name="description" content="[^"]+">/);
    assert.match(html, /<link rel="icon"/);
  }
  const sitemap = read('sitemap.xml');
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 7);
  for (const project of projects) assert.ok(sitemap.includes(`${siteOrigin}/cases/${project.slug}/`));
  assert.ok(!sitemap.includes('404.html'));
  assert.ok(read('robots.txt').includes(`Sitemap: ${siteOrigin}/sitemap.xml`));
  assert.ok(existsSync(join(root, '.nojekyll')));
  assert.ok(read('404.html').includes('href="/#works"'));
  assert.ok(read('404.html').includes('content="noindex"'));
  assert.match(read('assets/site.css'), /@font-face[\s\S]+Manrope\.ttf/);
  assert.match(read('assets/fonts/OFL.txt'), /SIL OPEN FONT LICENSE/);
  assert.match(read('assets/site.css'), /prefers-reduced-motion/);
  assert.match(read('assets/site.css'), /:focus-visible/);
});

test('Публикационные текстовые файлы не содержат приватных путей, секретов или внешнего клиентского кода', () => {
  const textFiles = [...pages, 'content/projects.json', 'assets/site.js', 'assets/site.css', 'assets/favicon.svg', 'README.md', 'package.json', 'robots.txt', 'sitemap.xml'];
  const privatePatterns = [/\/Users\//, /\/root\//, /\.hermes\//, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{16,}/, /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/];
  for (const file of textFiles) {
    const contents = read(file);
    for (const pattern of privatePatterns) assert.ok(!pattern.test(contents), `${file}: приватные сведения ${pattern}`);
    if (file.endsWith('.html')) {
      assert.ok(!/<(?:script|img|source)[^>]+src="https?:/i.test(contents));
      assert.ok(!contents.includes('<form'));
    }
  }
  const packageJson = JSON.parse(read('package.json'));
  assert.ok(!packageJson.dependencies && !packageJson.devDependencies);
});

test('JavaScript проходит реальную синтаксическую проверку Node.js', () => {
  for (const file of ['scripts/build.mjs', 'assets/site.js', 'tests/check-http.mjs']) {
    const result = spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

function node({ dataset = {}, textContent = '', href = '', alt = '' } = {}) {
  const events = new Map();
  const attributes = new Map();
  const classes = new Set();
  return {
    dataset, textContent, href, alt, hidden: false, scrollTop: 100,
    addEventListener(type, handler) { events.set(type, handler); },
    emit(type, extra = {}) {
      const event = { target: this, preventDefault() { this.prevented = true; }, ...extra };
      events.get(type)?.(event);
      return event;
    },
    setAttribute(name, value) { attributes.set(name, value); },
    getAttribute(name) { return attributes.get(name); },
    classList: { add(value) { classes.add(value); }, remove(value) { classes.delete(value); }, contains(value) { return classes.has(value); } },
    focus() { this.focused = true; },
  };
}

function filterFixture(url = `${siteOrigin}/`) {
  const buttons = ['all', 'agents', 'apps', 'video'].map((filter) => node({ dataset: { filter } }));
  const cards = projects.map((project) => node({ dataset: { category: project.category } }));
  const filters = node();
  filters.hidden = true;
  filters.querySelectorAll = () => buttons;
  const window = node();
  window.location = { href: url };
  window.history = { pushState(_state, _unused, updated) { window.location.href = String(updated); } };
  const document = {
    querySelector(selector) { return selector === '.filters' ? filters : null; },
    querySelectorAll(selector) { return selector === '.project[data-category]' ? cards : []; },
  };
  runInNewContext(read('assets/site.js'), { document, window, URL });
  return { buttons, cards, filters, window };
}

test('Фильтры без счетчиков меняют видимость, aria-pressed и URL; работают прямые ссылки и Back', () => {
  const html = read('index.html');
  assert.ok(!html.includes('filter-result'));
  assert.ok(!html.includes('heading-count'));
  assert.ok(!html.includes('work-count'));
  assert.ok(!html.includes('Показано:'));
  assert.ok(!html.includes('Сценарии · интерфейсы · результат'));
  const labels = ['Все работы', 'Агенты и процессы', 'Приложения', 'Видео и контент'];
  assert.deepEqual([...html.matchAll(/<button[^>]*data-filter=[^>]*>(.*?)<\/button>/g)].map((match) => match[1]), labels);
  const fixture = filterFixture(`${siteOrigin}/?filter=apps#works`);
  const { buttons, cards, filters, window } = fixture;
  assert.equal(filters.hidden, false);
  assert.deepEqual(cards.filter((card) => !card.hidden).map((card) => card.dataset.category), ['apps', 'apps']);
  assert.equal(buttons[2].getAttribute('aria-pressed'), 'true');
  buttons[1].emit('click');
  assert.equal(cards.filter((card) => !card.hidden).length, 3);
  assert.equal(new URL(window.location.href).searchParams.get('filter'), 'agents');
  assert.equal(new URL(window.location.href).hash, '#works');
  assert.equal(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true').length, 1);
  buttons[3].emit('click');
  assert.equal(cards.filter((card) => !card.hidden).length, 1);
  buttons[0].emit('click');
  assert.equal(cards.filter((card) => !card.hidden).length, 6);
  assert.equal(new URL(window.location.href).searchParams.has('filter'), false);
  window.location.href = `${siteOrigin}/?filter=apps`;
  window.emit('popstate');
  assert.equal(cards.filter((card) => !card.hidden).length, 2);
});

test('Неизвестный фильтр показывает все проекты; без JavaScript контент остается доступен', () => {
  const { cards, buttons } = filterFixture(`${siteOrigin}/?filter=invalid`);
  assert.equal(cards.filter((card) => !card.hidden).length, 6);
  assert.equal(buttons[0].getAttribute('aria-pressed'), 'true');
  const html = read('index.html');
  assert.equal([...html.matchAll(/<article class="project[^>]+data-category=/g)].length, 6);
  assert.ok(!/<article[^>]+\bhidden\b/.test(html));
  assert.ok(html.includes('class="filters" role="group" aria-label="Категория работ" hidden'));
  assert.ok(html.includes('<noscript>'));
  assert.match(html, /<nav class="main-nav"[\s\S]+href="#works"[\s\S]+href="#approach"/);
});

function galleryFixture(length = 3, supported = true) {
  const links = Array.from({ length }, (_value, index) => {
    const link = node({ href: `${siteOrigin}/cases/example/images/${index}.webp` });
    link.querySelector = () => node({ alt: `Изображение ${index}` });
    return link;
  });
  const controls = Object.fromEntries(['.lightbox-image', '.original-link', '.lightbox-count', '.lightbox-stage', '[data-prev]', '[data-next]', '[data-close]'].map((selector) => [selector, node()]));
  const dialog = node();
  dialog.querySelector = (selector) => controls[selector];
  dialog.open = false;
  if (supported) dialog.showModal = () => { dialog.open = true; };
  dialog.close = () => { dialog.open = false; dialog.emit('close'); };
  dialog.getBoundingClientRect = () => ({ left: 20, right: 800, top: 20, bottom: 600 });
  const document = {
    documentElement: node(),
    querySelector(selector) { return selector === '#lightbox' ? dialog : null; },
    querySelectorAll() { return links; },
  };
  runInNewContext(read('assets/site.js'), { document });
  return { links, controls, dialog, document };
}

test('Просмотр изображений без подписей: оригинал, alt, стрелки, прокрутка, закрытие и возврат фокуса', () => {
  for (const page of pages) {
    const html = read(page);
    assert.doesNotMatch(html, /figcaption|media-kind|lightbox-caption/);
    // Alt остается дословным, даже если в нем встречается название типа материала.
    const visible = html.replace(/<[^>]*>/g, '');
    for (const label of ['Демонстрация сценария', 'Демо-сценарий', 'Рабочий прототип', 'Клиентская поставка', 'Постановочный сценарий', ...projects.flatMap((project) => project.gallery.map((media) => media.caption))]) assert.ok(!visible.includes(escape(label)), `${page}: ${label}`);
  }
  assert.doesNotMatch(read('assets/site.js'), /lightbox-caption|media-kind|figcaption|\.closest\(/);
  const { links, controls, dialog, document } = galleryFixture();
  assert.equal(links[1].emit('click').prevented, true);
  assert.equal(dialog.open, true);
  assert.equal(document.documentElement.classList.contains('lightbox-open'), true);
  assert.equal(controls['.lightbox-image'].src, links[1].href);
  assert.equal(controls['.lightbox-image'].alt, 'Изображение 1');
  assert.equal(controls['.original-link'].href, links[1].href);
  assert.equal(controls['.lightbox-count'].textContent, '2 / 3');
  assert.equal(controls['.lightbox-stage'].scrollTop, 0);
  assert.equal(dialog.emit('keydown', { key: 'ArrowRight' }).prevented, true);
  assert.equal(controls['.lightbox-count'].textContent, '3 / 3');
  controls['[data-next]'].emit('click');
  assert.equal(controls['.lightbox-count'].textContent, '1 / 3');
  controls['[data-prev]'].emit('click');
  assert.equal(controls['.lightbox-count'].textContent, '3 / 3');
  dialog.emit('keydown', { key: 'ArrowLeft' });
  assert.equal(controls['.lightbox-count'].textContent, '2 / 3');
  dialog.emit('click', { clientX: 50, clientY: 50 });
  assert.equal(dialog.open, true, 'Нажатие внутри диалога не должно закрывать его');
  dialog.emit('click', { clientX: 0, clientY: 0 });
  assert.equal(dialog.open, false);
  assert.equal(links[1].focused, true);
  assert.equal(document.documentElement.classList.contains('lightbox-open'), false);
  links[0].emit('click');
  controls['[data-close]'].emit('click');
  assert.equal(dialog.open, false);
  assert.equal(links[0].focused, true);
  links[2].emit('click');
  dialog.close();
  assert.equal(links[2].focused, true, 'Нативное закрытие, включая Escape, должно возвращать фокус');
});

test('Одиночное изображение скрывает стрелки; без dialog API работают ссылки на оригиналы', () => {
  const single = galleryFixture(1);
  assert.equal(single.controls['[data-prev]'].hidden, true);
  assert.equal(single.controls['[data-next]'].hidden, true);
  single.links[0].emit('click');
  assert.equal(single.controls['.lightbox-count'].textContent, '1 / 1');
  const unsupported = galleryFixture(1, false);
  assert.notEqual(unsupported.links[0].emit('click').prevented, true);
});
