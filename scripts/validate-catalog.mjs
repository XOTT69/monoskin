import { existsSync, readdirSync, statSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const skins = await readJson("data/skins.json");
const drafts = await readJson("data/drafts.json");
const issues = [];
const ids = new Set();
const images = new Map();
const allowedMethods = new Set(["Безкоштовний", "За дію", "Доступні всім", "Донат на банку", "Підписка Base"]);
const allowedStatuses = new Set(["Доступний", "Недоступний"]);

if (!Array.isArray(skins) || !Array.isArray(drafts)) fail("Файли даних мають містити масиви.");

for (const [index, skin] of skins.entries()) {
  const label = `skins.json[${index}]`;
  requiredString(skin.id, `${label}.id`);
  requiredString(skin.name, `${label}.name`);
  requiredString(skin.image, `${label}.image`);
  requiredString(skin.date, `${label}.date`);
  if (ids.has(skin.id)) fail(`${label}: дубльований id «${skin.id}».`);
  ids.add(skin.id);
  if (!allowedMethods.has(skin.method)) fail(`${label}: некоректний method «${skin.method}».`);
  if (!allowedStatuses.has(skin.status)) fail(`${label}: некоректний status «${skin.status}».`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(skin.date) || Number.isNaN(Date.parse(skin.date))) fail(`${label}: некоректна дата «${skin.date}».`);
  if (skin.lastVerifiedAt && (!/^\d{4}-\d{2}-\d{2}$/.test(skin.lastVerifiedAt) || Number.isNaN(Date.parse(skin.lastVerifiedAt)))) fail(`${label}: некоректна дата перевірки.`);
  if (!Number.isFinite(skin.minimumValue) || skin.minimumValue < 0) fail(`${label}: minimumValue має бути числом від 0.`);
  if (skin.status === "Доступний" && skin.method !== "Доступні всім" && !isSecureUrl(skin.sourceUrl)) fail(`${label}: доступному скіну потрібне HTTPS-посилання.`);
  if (skin.sourceUrl && !isSecureUrl(skin.sourceUrl)) fail(`${label}: sourceUrl має починатися з https://.`);
  const skinImages = skin.images?.length ? skin.images : [skin.image];
  if (skin.images && (!Array.isArray(skin.images) || !skin.images.length || !skin.images.every((image) => typeof image === "string"))) fail(`${label}: images має бути непорожнім масивом шляхів.`);
  if (!skinImages.includes(skin.image)) fail(`${label}: image має бути першим фото з images.`);
  for (const image of skinImages) {
    if (!image.startsWith("skin/") || image.includes("..")) fail(`${label}: некоректний шлях до зображення.`);
    const path = resolve(root, "public", image);
    if (!existsSync(path)) fail(`${label}: не знайдено ${image}.`);
    const shared = images.get(image) ?? [];
    shared.push(skin.name);
    images.set(image, shared);
  }
}

const featured = skins.filter((skin) => skin.featured);
if (featured.length > 1) fail(`У hero може бути лише один скін; зараз позначено: ${featured.map((skin) => skin.name).join(", ")}.`);

for (const [index, draft] of drafts.entries()) {
  const label = `drafts.json[${index}]`;
  requiredString(draft.id, `${label}.id`);
  if (ids.has(draft.id)) fail(`${label}: id «${draft.id}» уже опублікований.`);
  ids.add(draft.id);
  if (!allowedMethods.has(draft.method)) fail(`${label}: некоректний method.`);
  if (!allowedStatuses.has(draft.status)) fail(`${label}: некоректний status.`);
  if (draft.sourceUrl && !isSecureUrl(draft.sourceUrl)) fail(`${label}: sourceUrl має починатися з https://.`);
}

const oversized = readdirSync(resolve(root, "public/skin"))
  .map((file) => ({ file, bytes: statSync(resolve(root, "public/skin", file)).size }))
  .filter(({ bytes }) => bytes > 1_500_000);

if (oversized.length) {
  console.warn(`Попередження: великі файли (${oversized.map(({ file, bytes }) => `${file} ${(bytes / 1024 / 1024).toFixed(1)} МБ`).join(", ")}).`);
}

console.log(`Каталог перевірено: ${skins.length} опублікованих, ${drafts.length} чернеток.`);

async function readJson(file) {
  return JSON.parse(await (await import("node:fs/promises")).readFile(resolve(root, file), "utf8"));
}

function requiredString(value, label) {
  if (typeof value !== "string" || !value.trim()) fail(`${label}: обов'язкове текстове поле.`);
}

function isSecureUrl(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function fail(message) {
  issues.push(message);
  throw new Error(message);
}
