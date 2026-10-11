import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://selajuf.github.io';
const content = JSON.parse(readFileSync(resolve(root, 'content/projects.json'), 'utf8'));
const { owner, title, description, projects } = content;
const categories = [
  ['all', 'Все работы'],
  ['agents', 'Агенты и процессы'],
  ['apps', 'Приложения'],
  ['video', 'Видео и контент'],
];
const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

function asset(file, project) {
  assert.match(file, new RegExp(`^cases/${project.slug}/images/[a-z0-9_-]+\\.webp$`));
  const path = resolve(root, file);
  assert.ok(existsSync(path), `Не найден материал: ${file}`);
  assert.ok(realpathSync(path).startsWith(realpathSync(root) + '/'), 'Материал должен находиться в репозитории');
  return path;
}

assert.equal(projects.length, 6, 'Ожидаются шесть проверенных кейсов');
assert.deepEqual(categories.slice(1).map(([category]) => projects.filter((project) => project.category === category).length), [3, 2, 1]);
assert.equal(projects.flatMap((project) => project.gallery).length, 10, 'Ожидаются десять изображений');
assert.equal(new Set(projects.map((project) => project.slug)).size, projects.length, 'Slug должны быть уникальны');
for (const field of ['owner', 'title', 'description']) assert.ok(typeof content[field] === 'string' && content[field].trim());
for (const project of projects) {
  assert.match(project.slug, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.ok(categories.slice(1).some(([category]) => category === project.category));
  for (const field of ['number', 'categoryLabel', 'title', 'shortTitle', 'summary', 'status', 'task', 'input', 'output', 'boundary']) {
    assert.ok(typeof project[field] === 'string' && project[field].trim(), `${project.slug}: ${field}`);
  }
  for (const field of ['actions', 'flow', 'tags', 'gallery']) assert.ok(Array.isArray(project[field]) && project[field].length);
  assert.equal(project.flow.length, 4, 'Процесс должен состоять из четырех шагов');
  for (const field of ['actions', 'flow', 'tags']) {
    assert.ok(project[field].every((value) => typeof value === 'string' && value.trim()));
  }
  for (const media of project.gallery) {
    asset(media.file, project);
    for (const field of ['alt', 'caption', 'kind']) assert.ok(typeof media[field] === 'string' && media[field].trim());
  }
  assert.ok(!project.video, 'Портфолио не содержит публикационных видео');
}

function imageSize(file) {
  const bytes = readFileSync(resolve(root, file));
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
  assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
  for (let offset = 12; offset + 8 < bytes.length;) {
    const chunk = bytes.toString('ascii', offset, offset + 4);
    const start = offset + 8;
    if (chunk === 'VP8 ') return [bytes.readUInt16LE(start + 6) & 0x3fff, bytes.readUInt16LE(start + 8) & 0x3fff];
    if (chunk === 'VP8X') return [bytes.readUIntLE(start + 4, 3) + 1, bytes.readUIntLE(start + 7, 3) + 1];
    if (chunk === 'VP8L') {
      const bits = bytes.readUInt32LE(start + 1);
      return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
    }
    const size = bytes.readUInt32LE(offset + 4);
    offset = start + size + (size % 2);
  }
  throw new Error(`Не удалось прочитать размер WebP: ${file}`);
}

function image(media, prefix, { eager = false, className = '' } = {}) {
  const [width, height] = imageSize(media.file);
  return `<img src="${prefix}${escape(media.file)}" alt="${escape(media.alt)}" width="${width}" height="${height}" class="${className}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
}

function header(prefix, isHome = false) {
  return `<a class="skip-link" href="#main">Перейти к содержанию</a>
  <header class="site-header wrap">
    <a class="identity" href="${prefix}" aria-label="${escape(owner)} — главная">
      <span class="monogram" aria-hidden="true">К</span>
      <span><strong>${escape(owner)}</strong><span class="identity-subtitle">${escape(title)}</span></span>
    </a>
    <nav class="main-nav" aria-label="Основная навигация">
      <a href="${isHome ? '' : prefix}#works">Работы</a>
      <a href="${isHome ? '' : prefix}#approach">Подход <span aria-hidden="true">↗</span></a>
    </nav>
  </header>`;
}

function footer(prefix) {
  return `<footer class="site-footer wrap">
    <p>${escape(owner)}<span>ИИ-агенты и автоматизация</span></p>
    <a href="${prefix}#works">К работам <span aria-hidden="true">↑</span></a>
  </footer>`;
}

function page({ pageTitle, pageDescription, canonical, prefix = './', body, ogImage, noindex = false }) {
  return `<!doctype html>
<!-- Сгенерировано scripts/build.mjs. Контент: content/projects.json. -->
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="dark light">
  <title>${escape(pageTitle)}</title>
  <meta name="description" content="${escape(pageDescription)}">
  ${noindex ? '<meta name="robots" content="noindex">' : ''}
  <link rel="canonical" href="${origin}${canonical}">
  <meta property="og:type" content="website">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:site_name" content="${escape(owner)} — ${escape(title)}">
  <meta property="og:title" content="${escape(pageTitle)}">
  <meta property="og:description" content="${escape(pageDescription)}">
  <meta property="og:url" content="${origin}${canonical}">
  <meta property="og:image" content="${origin}/${escape(ogImage.file)}">
  <meta property="og:image:alt" content="${escape(ogImage.alt)}">
  <link rel="icon" href="${prefix}assets/favicon.svg" type="image/svg+xml">
  <link rel="preload" href="${prefix}assets/fonts/Manrope.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="stylesheet" href="${prefix}assets/site.css">
  <script src="${prefix}assets/site.js" defer></script>
</head>
<body>
${body}
</body>
</html>
`;
}

function preview(project, index) {
  const media = project.gallery.slice(0, project.category === 'apps' || project.slug === 'meeting-assistant' ? 2 : 1);
  return `<div class="project-preview preview--${project.category} preview--${project.slug}" aria-hidden="true">
    <span class="preview-label">${escape(project.gallery[0].kind)}</span>
    <div class="preview-images ${media.length > 1 ? 'preview-pair' : ''}">
      ${media.map((item) => image({ ...item, alt: '' }, './', { eager: index === 0, className: 'preview-image' })).join('\n')}
    </div>
    <span class="preview-open">Смотреть кейс <span>↗</span></span>
  </div>`;
}

function card(project, index) {
  return `<article class="project ${index === 0 ? 'project--featured' : ''}" data-category="${project.category}">
    <a class="project-card" href="./cases/${project.slug}/" aria-labelledby="title-${project.slug}">
      ${preview(project, index)}
      <div class="project-copy">
        <div class="project-meta"><span>${escape(project.number)} / ${escape(project.categoryLabel)}</span><span class="project-arrow" aria-hidden="true">↗</span></div>
        <h3 id="title-${project.slug}">${escape(project.title)}</h3>
        <p class="project-short">${escape(project.shortTitle)}</p>
        <p class="project-summary">${escape(project.summary)}</p>
        <p class="project-status"><span aria-hidden="true"></span>${escape(project.status)}</p>
      </div>
    </a>
  </article>`;
}

function home() {
  return page({
    pageTitle: `${owner} — ${title}`,
    pageDescription: description,
    canonical: '/',
    ogImage: projects[0].gallery[0],
    body: `${header('./', true)}
    <main id="main">
      <section class="intro wrap" aria-labelledby="intro-title">
        <p class="eyebrow"><span class="lime-line" aria-hidden="true"></span>Портфолио / ИИ и цифровые продукты</p>
        <h1 id="intro-title">Из повседневных задач —<br><span>в понятный процесс.</span></h1>
        <div class="intro-bottom">
          <p>Проекты, прототипы и примеры интерфейсов.<br>От входящего сообщения до документа, заявки и видео.</p>
          <a class="text-link" href="#approach">Обсудить вашу задачу <span aria-hidden="true">↗</span></a>
        </div>
      </section>
      <section class="works wrap" id="works" aria-labelledby="works-title">
        <div class="section-heading"><h2 id="works-title">Работы<span class="heading-count">${String(projects.length).padStart(2, '0')}</span></h2><p class="eyebrow">Сценарии · интерфейсы · результат</p></div>
        <div class="work-toolbar">
          <div class="filters" role="group" aria-label="Категория работ" hidden>
            ${categories.map(([key, label]) => `<button type="button" data-filter="${key}" aria-pressed="${key === 'all'}" aria-controls="project-grid">${label}<span>${projects.filter((project) => key === 'all' || project.category === key).length}</span></button>`).join('\n')}
          </div>
          <p id="filter-result" class="work-count" role="status" aria-live="polite" aria-atomic="true">Показано: ${projects.length} из ${projects.length}</p>
        </div>
        <noscript><p class="no-script">Все работы показаны ниже. Фильтры доступны с JavaScript.</p></noscript>
        <div class="project-grid" id="project-grid">${projects.map(card).join('\n')}</div>
      </section>
      <section class="approach wrap" id="approach" aria-labelledby="approach-title">
        <div class="approach-heading"><p class="eyebrow">Подход к работе</p><h2 id="approach-title">Сначала процесс.<br>Потом инструменты.</h2><p>Начинаем с того, что приходит на вход и что должно получиться на выходе. Отдельно определяем, какие действия требуют вашего подтверждения.</p></div>
        <ol class="approach-steps">
          <li><span class="step-number">01</span><div><h3>Разобраться в задаче</h3><p>Описать текущий процесс, данные и нужный результат. Выбрать один конкретный сценарий.</p></div></li>
          <li><span class="step-number">02</span><div><h3>Собрать и проверить</h3><p>Собрать рабочий путь, пройти его на примерах и согласовать поведение в спорных ситуациях.</p></div></li>
          <li><span class="step-number">03</span><div><h3>Передать в работу</h3><p>Объяснить, как пользоваться результатом, где его ограничения и что нужно для дальнейшей работы.</p></div></li>
        </ol>
        <div class="contact"><span class="contact-arrow" aria-hidden="true">↗</span><div><h3>Есть повторяющаяся задача?</h3><p>Пришлите процесс или задачу в тот чат, где получили ссылку на это портфолио. Достаточно описать, что делаете сейчас и какой результат хотите получить.</p></div></div>
      </section>
    </main>
    ${footer('./')}`,
  });
}

function lightbox() {
  return `<dialog class="lightbox" id="lightbox" aria-labelledby="lightbox-title">
    <div class="lightbox-toolbar"><h2 id="lightbox-title">Просмотр изображения</h2><button type="button" data-close autofocus>Закрыть <span aria-hidden="true">×</span></button></div>
    <div class="lightbox-stage"><img class="lightbox-image" alt=""></div>
    <div class="lightbox-bottom"><div><p id="lightbox-caption"></p><a class="original-link" href="#">Открыть оригинал <span aria-hidden="true">↗</span></a></div><div class="lightbox-navigation"><button type="button" data-prev aria-label="Предыдущее изображение">←</button><span class="lightbox-count" aria-live="polite"></span><button type="button" data-next aria-label="Следующее изображение">→</button></div></div>
  </dialog>`;
}

function detail(project, index) {
  const prefix = '../../';
  const previous = projects[(index + projects.length - 1) % projects.length];
  const next = projects[(index + 1) % projects.length];
  return page({
    pageTitle: `${project.title} — ${owner}`,
    pageDescription: project.summary,
    canonical: `/cases/${project.slug}/`,
    prefix,
    ogImage: project.gallery[0],
    body: `${header(prefix)}
    <main id="main" class="case-main wrap">
      <a class="back-link" href="${prefix}#works"><span aria-hidden="true">←</span> Все работы</a>
      <section class="case-intro" aria-labelledby="case-title">
        <p class="eyebrow">${escape(project.number)} / ${escape(project.categoryLabel)}</p>
        <h1 id="case-title">${escape(project.title)}</h1>
        <p class="case-summary">${escape(project.summary)}</p>
      </section>
      <section class="case-gallery" aria-labelledby="gallery-title">
        <div class="section-heading"><h2 id="gallery-title">Материалы проекта</h2></div>
        <div class="gallery gallery--${project.category} ${project.gallery.length === 1 ? 'gallery--single' : ''} ${project.slug === 'video-factory' ? 'gallery--wide' : ''}">
          ${project.gallery.map((media, galleryIndex) => `<figure>
            <a class="gallery-link" href="${prefix}${escape(media.file)}" data-lightbox aria-haspopup="dialog" aria-label="Увеличить: ${escape(media.alt)}">
              ${image(media, prefix, { eager: galleryIndex === 0 })}<span class="zoom-mark" aria-hidden="true">↗</span>
            </a>
            <figcaption><span class="media-kind">${escape(media.kind)}</span><p>${escape(media.caption)}</p></figcaption>
          </figure>`).join('\n')}
        </div>
      </section>
      <section class="case-story" aria-labelledby="story-title"><div><p class="eyebrow">Разбор проекта</p><h2 id="story-title">От задачи<br>к результату.</h2></div>
        <dl class="case-facts"><div><dt>Задача</dt><dd>${escape(project.task)}</dd></div><div><dt>На входе</dt><dd>${escape(project.input)}</dd></div><div><dt>Что происходит</dt><dd><ul>${project.actions.map((action) => `<li>${escape(action)}</li>`).join('')}</ul></dd></div><div class="output-fact"><dt>На выходе</dt><dd>${escape(project.output)}</dd></div></dl>
      </section>
      <section class="case-process" aria-labelledby="process-title"><div class="section-heading"><h2 id="process-title">Процесс в четырех шагах</h2></div><ol class="process-flow">${project.flow.map((step, stepIndex) => `<li><span class="step-number">${String(stepIndex + 1).padStart(2, '0')}</span><p>${escape(step)}</p>${stepIndex < 3 ? '<span class="flow-arrow" aria-hidden="true">→</span>' : ''}</li>`).join('')}</ol></section>
      <nav class="case-navigation" aria-label="Другие проекты"><a href="../${previous.slug}/" rel="prev"><span class="eyebrow">← Предыдущий проект</span><strong>${escape(previous.title)}</strong></a><a href="../${next.slug}/" rel="next"><span class="eyebrow">Следующий проект →</span><strong>${escape(next.title)}</strong></a></nav>
      <div class="case-contact"><p>Хотите разобрать похожую задачу?</p><a class="text-link" href="${prefix}#approach">Как начать <span aria-hidden="true">↗</span></a></div>
    </main>
    ${footer(prefix)}
    ${lightbox()}`,
  });
}

function write(file, contents) {
  const path = resolve(root, file);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents.split('\n').map((line) => line.trimEnd()).join('\n'));
}

write('index.html', home());
for (const [index, project] of projects.entries()) write(`cases/${project.slug}/index.html`, detail(project, index));
write('404.html', page({
  pageTitle: `Страница не найдена — ${owner}`,
  pageDescription: 'Вернитесь к портфолио и выберите проект.',
  canonical: '/404.html',
  prefix: '/',
  ogImage: projects[0].gallery[0],
  noindex: true,
  body: `${header('/')}<main id="main" class="not-found wrap"><p class="eyebrow">Ошибка 404</p><h1>Здесь пока<br>нет страницы.</h1><p>Все проекты собраны на главной. Продолжим оттуда?</p><a class="button-link" href="/#works">Вернуться к работам <span aria-hidden="true">↗</span></a></main>${footer('/')}`,
}));
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${['/', ...projects.map((project) => `/cases/${project.slug}/`)].map((path) => `  <url><loc>${origin}${path}</loc></url>`).join('\n')}\n</urlset>\n`);
write('.nojekyll', '');
console.log(`Сборка готова: главная, ${projects.length} кейсов, 404, robots.txt, sitemap.xml, .nojekyll.`);
