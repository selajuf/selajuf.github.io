import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'http://127.0.0.1:4173';
const { projects } = JSON.parse(readFileSync(join(root, 'content/projects.json'), 'utf8'));
const pages = ['/', ...projects.map((project) => `/cases/${project.slug}/`), '/404.html'];
const paths = new Set([...pages, '/robots.txt', '/sitemap.xml', '/.nojekyll']);
const localFile = (path) => join(root, path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1));
const decode = (value) => value.replace(/&amp;/g, '&');

for (const page of pages) {
  const html = readFileSync(localFile(page), 'utf8');
  for (const match of html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
    const url = new URL(decode(match[1]), `${origin}${page}`);
    if (url.origin !== origin) {
      assert.equal(url.origin, 'https://selajuf.github.io');
      continue;
    }
    paths.add(url.pathname);
  }
}
for (const match of readFileSync(join(root, 'assets/site.css'), 'utf8').matchAll(/url\(['"]?([^'")]+)['"]?\)/g)) {
  paths.add(new URL(match[1], `${origin}/assets/site.css`).pathname);
}
const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'javascript', '.webp': 'image/webp', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
for (const path of paths) {
  const response = await fetch(`${origin}${path}`);
  assert.equal(response.status, 200, `${path}: HTTP ${response.status}`);
  const file = localFile(path);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), readFileSync(file), `${path}: сервер отдает другой файл`);
  const mime = mimeTypes[extname(file)];
  if (mime) assert.ok(response.headers.get('content-type')?.includes(mime), `${path}: неверный Content-Type`);
}
console.log(`HTTP-проверка пройдена: ${pages.length} страниц и ${paths.size} уникальных локальных URL; все ответы 200, содержимое совпало с файлами.`);
