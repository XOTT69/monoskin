import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const CONFIG_PATH = path.join(ROOT, 'monitor', 'sources.json');
const CATALOG_PATH = path.join(ROOT, 'data', 'skins.json');
const REPORT_DIR = path.join(ROOT, 'monitor', 'reports');
const STATE_PATH = path.join(ROOT, 'monitor', 'state.json');
const IMAGE_DIR = path.join(ROOT, 'public', 'skin');

const MAX_HTML = 2_000_000;
const MAX_IMAGE = 8 * 1024 * 1024;
const USER_AGENT = 'MONOSKIN-SkinMonitor/1.0 (+https://monoskin.pages.dev/)';

const ALLOWED_IMAGE_HOSTS = new Set([
  'monobank.ua',
  'www.monobank.ua',
  'send.monobank.ua',
  'base.monobank.ua',
  't.me',
  'telegram.org',
  'github.com',
  'raw.githubusercontent.com',
  'images.unsplash.com',
  'cdn-images-1.medium.com',
  'i.imgur.com'
]);

function normalize(text = '') {
  return text
    .toLowerCase()
    .replaceAll('’', "'")
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text) {
  return normalize(text)
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 90) || `skin-${Date.now()}`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function decodeEntities(input = '') {
  return input
    .replaceAll('&amp;', '&')
    .replaceAll('&quot;', '"')
    .replaceAll('&#39;', "'")
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
}

async function fetchText(url, limit = MAX_HTML) {
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    redirect: 'follow'
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const text = await response.text();
  if (text.length > limit) return text.slice(0, limit);
  return text;
}

function absoluteUrl(value, baseUrl) {
  try { return new URL(value, baseUrl).toString(); } catch { return ''; }
}

function extractMeta(html, property) {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re1 = new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i');
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["']`, 'i');
  return decodeEntities((html.match(re1)?.[1] ?? html.match(re2)?.[1] ?? '').trim());
}

function stripHtml(html) {
  return decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function extractTitle(html) {
  return extractMeta(html, 'og:title') || decodeEntities(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').trim();
}

function extractImage(html, baseUrl) {
  const raw = extractMeta(html, 'og:image') || html.match(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/i)?.[1] || '';
  return absoluteUrl(raw, baseUrl);
}

function extractLinks(html, baseUrl) {
  const links = [];
  const re = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = re.exec(html))) {
    const href = absoluteUrl(match[1], baseUrl);
    const text = stripHtml(match[2]);
    if (href) links.push({ href, text });
  }
  return links;
}

function parseGoogleNewsRss(xml, source) {
  const results = [];
  const itemRe = /<item>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(xml))) {
    const block = match[1];
    const get = (tag) => decodeEntities(block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1] ?? '').trim();
    results.push({
      sourceId: source.id,
      sourceLabel: source.label,
      url: get('link'),
      title: get('title'),
      publishedAt: get('pubDate'),
      excerpt: get('description'),
      kind: 'news'
    });
  }
  return results;
}

function parseTelegram(html, source) {
  const results = [];
  const blocks = html.split('tgme_widget_message_wrap');
  for (const block of blocks.slice(-40)) {
    const text = stripHtml(block.match(/tgme_widget_message_text[\s\S]*?<\/div>/i)?.[0] ?? '');
    const time = block.match(/datetime="([^"]+)"/)?.[1] ?? '';
    const link = block.match(/href="(https:\/\/t\.me\/OGoMono\/\d+)"/)?.[1] ?? '';
    const image = block.match(/background-image:url\('([^']+)'\)/i)?.[1] ?? '';
    if (text || link) {
      results.push({ sourceId: source.id, sourceLabel: source.label, url: link || source.url, title: text.slice(0, 180), publishedAt: time, excerpt: text, imageUrl: image, kind: 'telegram' });
    }
  }
  return results;
}

function parseCatalog(html, source) {
  const text = stripHtml(html);
  const image = extractImage(html, source.url);
  const title = extractTitle(html);
  return [{ sourceId: source.id, sourceLabel: source.label, url: source.url, title, excerpt: text.slice(0, 6000), imageUrl: image, kind: 'catalog' }];
}

function findCandidateName(item) {
  const cleaned = (item.title || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) return '';
  const patterns = [
    /(?:новий|нова|нове)\s+(?:скін|скин|дизайн)[^:–-]*[:–-]?\s*(.+)$/i,
    /(?:скін|скин|дизайн)\s*(?:mono|monobank)?\s*[:–-]\s*(.+)$/i,
    /«([^»]{3,100})»/
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (m?.[1]) return m[1].trim().replace(/[.,!?]+$/, '');
  }
  return cleaned.slice(0, 100);
}

function inferMethod(text) {
  const t = normalize(text);
  const donation = t.match(/донат(?:у|ом)?(?:\s+від\s+)?\s*(\d[\d\s]{0,8})/i);
  if (donation) {
    const amount = Number(donation[1].replace(/\s/g, ''));
    return { method: 'Донат на банку', minimumValue: Number.isFinite(amount) ? amount : 0, confidence: 0.95 };
  }
  if (/безкоштовн|доступн.*всім|для всіх клієнт/i.test(t)) {
    return { method: 'Доступні всім', minimumValue: 0, confidence: 0.9 };
  }
  if (/qr|зошит|набор|код/i.test(t)) return { method: 'Безкоштовний', minimumValue: 0, confidence: 0.75 };
  return { method: 'Потребує перевірки', minimumValue: 0, confidence: 0.35 };
}

function looksLikeSkin(text, keywords) {
  const t = normalize(text);
  return keywords.some((keyword) => t.includes(normalize(keyword)));
}

function similarityKey(name) {
  return normalize(name).replace(/\b(?:monobank|mono|skin|skин|дизайн|картка|карта)\b/gu, '').replace(/\s+/g, ' ').trim();
}

function isProbablyNew(candidate, catalog) {
  const key = similarityKey(candidate.name);
  if (!key) return false;
  return !catalog.some((skin) => {
    const existing = similarityKey(skin.name);
    return existing === key || (key.length > 12 && (existing.includes(key) || key.includes(existing)));
  });
}

async function downloadImage(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (!ALLOWED_IMAGE_HOSTS.has(parsed.hostname)) return null;
    const response = await fetch(url, { headers: { 'user-agent': USER_AGENT }, redirect: 'follow' });
    if (!response.ok) return null;
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_IMAGE) return null;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_IMAGE) return null;
    const type = response.headers.get('content-type') || '';
    const ext = type.includes('png') ? 'png' : type.includes('jpeg') ? 'jpg' : type.includes('webp') ? 'webp' : type.includes('avif') ? 'avif' : 'jpg';
    return { buffer, ext, hash: sha256(buffer) };
  } catch {
    return null;
  }
}

async function loadJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function writeJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

async function main() {
  const config = await loadJson(CONFIG_PATH, { official: [], search: [], catalogs: [], keywords: [] });
  const catalog = await loadJson(CATALOG_PATH, []);
  const state = await loadJson(STATE_PATH, { seen: {}, lastRun: null });
  const allSources = [...config.official, ...config.search, ...config.catalogs];
  const discovered = [];
  const errors = [];

  for (const source of allSources) {
    try {
      const html = await fetchText(source.url);
      if (source.type === 'google-news-rss') discovered.push(...parseGoogleNewsRss(html, source));
      else if (source.type === 'telegram') discovered.push(...parseTelegram(html, source));
      else discovered.push(...parseCatalog(html, source));
    } catch (error) {
      errors.push({ source: source.label, error: String(error.message || error) });
    }
  }

  const candidates = [];
  for (const item of discovered) {
    const corpus = `${item.title || ''} ${item.excerpt || ''}`;
    if (!looksLikeSkin(corpus, config.keywords)) continue;
    const name = findCandidateName(item);
    if (!name || !isProbablyNew({ name }, catalog)) continue;

    let imageUrl = item.imageUrl || '';
    let articleText = item.excerpt || '';
    if (!imageUrl && item.url && /^https?:/i.test(item.url) && item.kind === 'news') {
      try {
        const article = await fetchText(item.url);
        imageUrl = extractImage(article, item.url);
        articleText = `${articleText} ${stripHtml(article).slice(0, 4000)}`;
      } catch {}
    }

    const method = inferMethod(articleText);
    const officialSignal = item.sourceId.startsWith('ogomono') || item.sourceId.startsWith('monobank-') || item.sourceId === 'monobank-site';
    const imageSignal = Boolean(imageUrl);
    const autoImport = officialSignal && imageSignal && method.confidence >= 0.9;
    const candidate = {
      id: slugify(name),
      name,
      method: method.method,
      minimumValue: method.minimumValue,
      status: method.method === 'Потребує перевірки' ? 'Потрібна перевірка' : 'Доступний',
      description: method.method === 'Потребує перевірки' ? 'Знайдено автоматичним моніторингом; умови отримання потрібно перевірити.' : `Автоматично знайдено: ${method.method.toLowerCase()}.`,
      sourceUrl: item.url,
      imageUrl,
      sourceLabel: item.sourceLabel,
      publishedAt: item.publishedAt || null,
      confidence: Math.round((0.45 + (officialSignal ? 0.25 : 0) + (imageSignal ? 0.15 : 0) + method.confidence * 0.15) * 100),
      autoImport
    };
    const dedupe = similarityKey(candidate.name);
    if (!candidates.some((existing) => similarityKey(existing.name) === dedupe)) candidates.push(candidate);
  }

  await fs.mkdir(REPORT_DIR, { recursive: true });
  const imported = [];
  const pending = [];

  for (const candidate of candidates.sort((a, b) => b.confidence - a.confidence)) {
    if (!candidate.autoImport) {
      pending.push(candidate);
      continue;
    }
    const downloaded = await downloadImage(candidate.imageUrl);
    if (!downloaded) {
      pending.push({ ...candidate, autoImport: false, reason: 'Не вдалося безпечно завантажити візуал.' });
      continue;
    }
    const fileName = `${candidate.id}-1.${downloaded.ext}`;
    const relativeImage = `skin/${fileName}`;
    await fs.writeFile(path.join(IMAGE_DIR, fileName), downloaded.buffer);
    const newSkin = {
      id: candidate.id,
      name: candidate.name,
      method: candidate.method,
      status: candidate.status,
      minimumValue: candidate.minimumValue,
      addedAt: new Date().toISOString(),
      lastVerifiedAt: new Date().toISOString().slice(0, 10),
      description: candidate.description,
      sourceUrl: candidate.sourceUrl,
      image: relativeImage,
      imageHashes: [downloaded.hash],
      isVisaOnly: false,
      isAdultOnly: false,
      featured: false,
      monitoring: {
        source: candidate.sourceLabel,
        confidence: candidate.confidence,
        autoImported: true
      }
    };
    catalog.unshift(newSkin);
    imported.push({ ...candidate, image: relativeImage, imageHash: downloaded.hash });
  }

  await writeJson(CATALOG_PATH, catalog);
  const now = new Date().toISOString();
  state.lastRun = now;
  for (const item of discovered) state.seen[`${item.sourceId}:${item.url}:${normalize(item.title)}`] = now;
  await writeJson(STATE_PATH, state);

  const report = [
    '# MONOSKIN — щотижневий моніторинг',
    '',
    `Дата: ${now}`,
    `Джерел перевірено: ${allSources.length}`,
    `Знахідок-кандидатів: ${candidates.length}`,
    `Автоматично додано: ${imported.length}`,
    `Потребують ручної перевірки: ${pending.length}`,
    '',
    '## Автоматично додано',
    ...(imported.length ? imported.map((x) => `- **${x.name}** — ${x.method}; [джерело](${x.sourceUrl || '#'})`): ['- Нічого нового.']),
    '',
    '## Потребують перевірки',
    ...(pending.length ? pending.map((x) => `- **${x.name}** — ${x.method}; ${x.confidence}% впевненості; [джерело](${x.sourceUrl || '#'})${x.reason ? ` — ${x.reason}` : ''}`) : ['- Нічого.']),
    '',
    '## Помилки джерел',
    ...(errors.length ? errors.map((x) => `- **${x.source}** — ${x.error}`) : ['- Немає.'])
  ].join('\n');
  const reportPath = path.join(REPORT_DIR, `${now.slice(0, 10)}.md`);
  await fs.writeFile(reportPath, report + '\n', 'utf8');
  await fs.writeFile(path.join(REPORT_DIR, 'latest.json'), JSON.stringify({ generatedAt: now, imported, pending, errors }, null, 2) + '\n', 'utf8');

  console.log(JSON.stringify({ imported, pending, errors, reportPath }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
