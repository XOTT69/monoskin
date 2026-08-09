const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_BOT_PHOTO_BYTES = 4 * 1024 * 1024;
const MAX_IMAGES_PER_SKIN = 6;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const OWNER = "XOTT69";
const REPO = "monoskin";
const BRANCH = "main";

type TelegramResult<T = unknown> = { ok: boolean; result?: T; description?: string };
type TurnstileResult = { success: boolean; hostname?: string };
type TelegramPhoto = { file_id: string; file_unique_id: string; file_size?: number; width: number; height: number };
type TelegramMessage = { message_id: number; chat: { id: number }; from?: { id: number }; text?: string; photo?: TelegramPhoto[] };
type TelegramCallback = { id: string; data?: string; from: { id: number }; message?: TelegramMessage };
type TelegramUpdate = { message?: TelegramMessage; callback_query?: TelegramCallback };
type Category = "Безкоштовно" | "Доступні всім" | "Донат на банку" | "Підписка" | "Недоступні";
type BotStep = "photos" | "name" | "category" | "minimum" | "description" | "source" | "preview" | "publishing";
type BotDraft = { step: BotStep; photos: TelegramPhoto[]; name?: string; category?: Category; minimumValue?: number; description?: string; sourceUrl?: string };
type Skin = { id: string; name: string; method: "Безкоштовний" | "Доступні всім" | "Донат на банку" | "Підписка Base"; status: "Доступний" | "Недоступний"; minimumValue: number; addedAt: string; lastVerifiedAt: string; description: string; sourceUrl: string; image: string; images?: string[]; isVisaOnly: boolean; isAdultOnly: boolean; featured: boolean };
type GitHubContent = { content: string; sha: string };
type GitHubRef = { object: { sha: string } };
type GitHubCommit = { tree: { sha: string } };
type GitHubBlob = { sha: string };
type GitHubTree = { sha: string };
type GitHubCreatedCommit = { sha: string };

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (origin !== env.ALLOWED_ORIGIN) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

function json(body: Record<string, string | boolean>, status: number, headers: Record<string, string>) {
  return Response.json(body, { status, headers: { ...headers, "Cache-Control": "no-store" } });
}

function field(form: FormData, name: string, limit: number) {
  const value = form.get(name);
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function escapeHtml(value: string) {
  return value.replace(/[&<>]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[character] ?? character);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function categoryFields(category: Category) {
  if (category === "Недоступні") return { method: "Безкоштовний" as const, status: "Недоступний" as const };
  if (category === "Донат на банку") return { method: "Донат на банку" as const, status: "Доступний" as const };
  if (category === "Підписка") return { method: "Підписка Base" as const, status: "Доступний" as const };
  if (category === "Доступні всім") return { method: "Доступні всім" as const, status: "Доступний" as const };
  return { method: "Безкоштовний" as const, status: "Доступний" as const };
}

function toId(value: string) {
  const letters: Record<string, string> = { а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya" };
  const transliterated = Array.from(value.toLocaleLowerCase("uk"), (letter) => letters[letter] ?? letter).join("");
  return transliterated.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `skin-${Date.now()}`;
}

function bytesToBase64(bytes: Uint8Array) {
  let output = "";
  for (let index = 0; index < bytes.length; index += 0x8000) output += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  return btoa(output);
}

function textToBase64(value: string) {
  return bytesToBase64(new TextEncoder().encode(value));
}

function base64ToText(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function inlineKeyboard(rows: Array<Array<{ text: string; callback_data: string }>>) {
  return { inline_keyboard: rows };
}

async function verifyTurnstile(token: string, request: Request, env: Env) {
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return response.json() as Promise<TurnstileResult>;
}

async function telegram<T>(endpoint: string, payload: FormData | Record<string, unknown>, env: Env) {
  const isForm = payload instanceof FormData;
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${endpoint}`, {
    method: "POST",
    headers: isForm ? undefined : { "Content-Type": "application/json" },
    body: isForm ? payload : JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({ ok: false })) as TelegramResult<T>;
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram delivery failed");
  return result.result as T;
}

async function sendBotMessage(chatId: number, text: string, env: Env, replyMarkup?: ReturnType<typeof inlineKeyboard>) {
  return telegram("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true, reply_markup: replyMarkup }, env);
}

async function answerCallback(id: string, env: Env, text?: string) {
  return telegram("answerCallbackQuery", { callback_query_id: id, text }, env);
}

function messageText(data: { name: string; category: string; sourceUrl: string; description: string }) {
  const source = data.sourceUrl || "не додано";
  return [
    "Нова пропозиція скіна — MONOSKIN",
    "",
    `Назва: ${data.name}`,
    `Категорія: ${data.category}`,
    `Умова / опис: ${data.description}`,
    `Джерело: ${source}`,
  ].join("\n").slice(0, 900);
}

async function rateLimitKey(request: Request) {
  const value = request.headers.get("CF-Connecting-IP") || "unknown";
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function loadDraft(chatId: number, env: Env) {
  return env.BOT_SESSIONS.get<BotDraft>(`draft:${chatId}`, "json");
}

async function saveDraft(chatId: number, draft: BotDraft, env: Env) {
  await env.BOT_SESSIONS.put(`draft:${chatId}`, JSON.stringify(draft), { expirationTtl: 60 * 60 * 24 });
}

async function clearDraft(chatId: number, env: Env) {
  await env.BOT_SESSIONS.delete(`draft:${chatId}`);
}

function isAdmin(chatId: number | undefined, env: Env) {
  return String(chatId ?? "") === env.TELEGRAM_CHAT_ID;
}

function isHttpsUrl(value: string) {
  try { return !value || new URL(value).protocol === "https:"; } catch { return false; }
}

function photoPrompt(count: number) {
  return `Надішли фото скіна (${count}/${MAX_IMAGES_PER_SKIN}). Після кожного фото обери: додати ще чи продовжити.`;
}

function previewText(draft: BotDraft) {
  return [
    "<b>Перевір перед публікацією</b>",
    "",
    `<b>Назва:</b> ${escapeHtml(draft.name ?? "—")}`,
    `<b>Категорія:</b> ${escapeHtml(draft.category ?? "—")}`,
    draft.category === "Донат на банку" ? `<b>Мінімальний донат:</b> ${draft.minimumValue ?? 0} грн` : "",
    `<b>Умова:</b> ${escapeHtml(draft.description ?? "—")}`,
    `<b>Посилання:</b> ${escapeHtml(draft.sourceUrl || "не додано")}`,
    `<b>Фото:</b> ${draft.photos.length}`,
    "",
    "Після «Опублікувати» скін з’явиться на сайті за кілька хвилин.",
  ].filter(Boolean).join("\n");
}

async function showPreview(chatId: number, draft: BotDraft, env: Env) {
  await sendBotMessage(chatId, previewText(draft), env, inlineKeyboard([
    [{ text: "Опублікувати", callback_data: "skin:publish" }],
    [{ text: "Почати заново", callback_data: "skin:new" }, { text: "Скасувати", callback_data: "skin:cancel" }],
  ]));
}

async function fetchTelegramPhoto(photo: TelegramPhoto, env: Env) {
  const file = await telegram<{ file_path: string }>("getFile", { file_id: photo.file_id }, env);
  const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!response.ok) throw new Error("Не вдалося завантажити фото з Telegram.");
  const contentType = response.headers.get("Content-Type")?.split(";")[0].toLowerCase() || "image/jpeg";
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!ALLOWED_IMAGE_TYPES.has(contentType) || !bytes.length || bytes.length > MAX_BOT_PHOTO_BYTES) throw new Error("Кожне фото має бути PNG, JPG або WebP до 4 МБ.");
  const extension = contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpg";
  return { bytes, extension };
}

async function github<T>(path: string, env: Env, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { message?: string } & T;
  if (!response.ok) throw new Error(body.message || "GitHub не прийняв зміни.");
  return body as T;
}

async function publishDraft(draft: BotDraft, env: Env) {
  if (!draft.name || !draft.category || !draft.description || !draft.photos.length) throw new Error("Чернетка неповна. Почни додавання заново.");
  const sourceUrl = draft.sourceUrl || "";
  if (!isHttpsUrl(sourceUrl)) throw new Error("Посилання має починатися з https://.");

  const repository = env.GITHUB_REPOSITORY || `${OWNER}/${REPO}`;
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Некоректна назва GitHub-репозиторію у налаштуваннях Worker.");
  const branch = env.GITHUB_BRANCH || BRANCH;
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [catalogFile, ref] = await Promise.all([
    github<GitHubContent>(`${base}/contents/data/skins.json?ref=${encodeURIComponent(branch)}`, env),
    github<GitHubRef>(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, env),
  ]);
  const records = JSON.parse(base64ToText(catalogFile.content)) as Skin[];
  const id = toId(draft.name);
  if (records.some((skin) => skin.id === id)) throw new Error(`Скін із ID «${id}» уже є в каталозі. Зміни назву та повтори.`);

  const downloaded = await Promise.all(draft.photos.map((photo) => fetchTelegramPhoto(photo, env)));
  const imagePaths = downloaded.map((file, index) => `skin/${id}${index ? `-${index + 1}` : ""}.${file.extension}`);
  const fields = categoryFields(draft.category);
  const now = new Date().toISOString();
  const record: Skin = {
    id,
    name: draft.name,
    ...fields,
    minimumValue: draft.category === "Донат на банку" ? draft.minimumValue ?? 0 : 0,
    addedAt: now,
    lastVerifiedAt: today(),
    description: draft.description,
    sourceUrl,
    image: imagePaths[0],
    ...(imagePaths.length > 1 ? { images: imagePaths } : {}),
    isVisaOnly: false,
    isAdultOnly: false,
    featured: false,
  };
  const nextCatalog = [record, ...records];
  const [commit] = await Promise.all([github<GitHubCommit>(`${base}/git/commits/${ref.object.sha}`, env)]);
  const blobs = await Promise.all([
    github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: textToBase64(`${JSON.stringify(nextCatalog, null, 2)}\n`), encoding: "base64" }) }),
    ...downloaded.map((file) => github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: bytesToBase64(file.bytes), encoding: "base64" }) })),
  ]);
  const tree = await github<GitHubTree>(`${base}/git/trees`, env, {
    method: "POST",
    body: JSON.stringify({
      base_tree: commit.tree.sha,
      tree: [
        { path: "data/skins.json", mode: "100644", type: "blob", sha: blobs[0].sha },
        ...imagePaths.map((path, index) => ({ path: `public/${path}`, mode: "100644", type: "blob", sha: blobs[index + 1].sha })),
      ],
    }),
  });
  const created = await github<GitHubCreatedCommit>(`${base}/git/commits`, env, {
    method: "POST",
    body: JSON.stringify({ message: `Додати скін через Telegram: ${record.name}`, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, env, {
    method: "PATCH",
    body: JSON.stringify({ sha: created.sha, force: false }),
  });
  return record;
}

async function startDraft(chatId: number, env: Env) {
  const draft: BotDraft = { step: "photos", photos: [] };
  await saveDraft(chatId, draft, env);
  await sendBotMessage(chatId, "<b>Новий скін</b>\n\n" + photoPrompt(0), env, inlineKeyboard([[{ text: "Скасувати", callback_data: "skin:cancel" }]]));
}

async function processMessage(message: TelegramMessage, env: Env) {
  const chatId = message.chat.id;
  const text = message.text?.trim() || "";
  if (text === "/start" || text === "/add") {
    await sendBotMessage(chatId, "Привіт. Я допоможу швидко додати скін у MONOSKIN.", env, inlineKeyboard([[{ text: "Додати скін", callback_data: "skin:new" }]]));
    return;
  }
  if (text === "/cancel") {
    await clearDraft(chatId, env);
    await sendBotMessage(chatId, "Чернетку скасовано.", env, inlineKeyboard([[{ text: "Додати скін", callback_data: "skin:new" }]]));
    return;
  }

  const draft = await loadDraft(chatId, env);
  if (!draft) {
    await sendBotMessage(chatId, "Натисни «Додати скін», щоб почати.", env, inlineKeyboard([[{ text: "Додати скін", callback_data: "skin:new" }]]));
    return;
  }
  if (message.photo?.length) {
    if (draft.step !== "photos") {
      await sendBotMessage(chatId, "Фото вже збережені. Продовжуй відповідати на запитання або почни нову чернетку.", env);
      return;
    }
    const photo = message.photo[message.photo.length - 1];
    if (photo.file_size && photo.file_size > MAX_BOT_PHOTO_BYTES) {
      await sendBotMessage(chatId, "Це фото більше 4 МБ. Надішли меншу версію.", env);
      return;
    }
    if (draft.photos.some((item) => item.file_unique_id === photo.file_unique_id)) {
      await sendBotMessage(chatId, "Це фото вже додано.", env);
      return;
    }
    draft.photos.push(photo);
    await saveDraft(chatId, draft, env);
    const buttons = draft.photos.length >= MAX_IMAGES_PER_SKIN
      ? [[{ text: "Продовжити", callback_data: "skin:photos-done" }]]
      : [[{ text: "Ще одне фото", callback_data: "skin:add-photo" }, { text: "Продовжити", callback_data: "skin:photos-done" }]];
    await sendBotMessage(chatId, `✓ Фото додано (${draft.photos.length}/${MAX_IMAGES_PER_SKIN}).`, env, inlineKeyboard(buttons));
    return;
  }
  if (!text) return;
  if (draft.step === "name") {
    draft.name = text.slice(0, 90);
    draft.step = "category";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Обери категорію.", env, inlineKeyboard([
      [{ text: "Безкоштовно", callback_data: "skin:category:free" }, { text: "Доступні всім", callback_data: "skin:category:all" }],
      [{ text: "Донат на банку", callback_data: "skin:category:donation" }, { text: "Підписка Base", callback_data: "skin:category:base" }],
      [{ text: "Недоступні", callback_data: "skin:category:unavailable" }],
    ]));
    return;
  }
  if (draft.step === "minimum") {
    const amount = Number(text.replace(/[^0-9.,]/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
      await sendBotMessage(chatId, "Вкажи мінімальну суму донату числом, наприклад: <b>200</b>.", env);
      return;
    }
    draft.minimumValue = amount;
    draft.step = "description";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Напиши коротку умову отримання або опис скіна.", env);
    return;
  }
  if (draft.step === "description") {
    draft.description = text.slice(0, 900);
    draft.step = "source";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Надішли посилання на отримання / банку / Base. Якщо посилання не потрібне — надішли <b>-</b>.", env);
    return;
  }
  if (draft.step === "source") {
    const sourceUrl = text === "-" ? "" : text.slice(0, 500);
    if (!isHttpsUrl(sourceUrl)) {
      await sendBotMessage(chatId, "Посилання має починатися з <b>https://</b>. Або надішли <b>-</b>, щоб пропустити.", env);
      return;
    }
    draft.sourceUrl = sourceUrl;
    draft.step = "preview";
    await saveDraft(chatId, draft, env);
    await showPreview(chatId, draft, env);
  }
}

async function processCallback(callback: TelegramCallback, env: Env) {
  const chatId = callback.message?.chat.id;
  if (!chatId) return;
  await answerCallback(callback.id, env).catch(() => undefined);
  const data = callback.data || "";
  if (data === "skin:new") {
    await startDraft(chatId, env);
    return;
  }
  if (data === "skin:cancel") {
    await clearDraft(chatId, env);
    await sendBotMessage(chatId, "Чернетку скасовано.", env, inlineKeyboard([[{ text: "Додати скін", callback_data: "skin:new" }]]));
    return;
  }
  const draft = await loadDraft(chatId, env);
  if (!draft) {
    await sendBotMessage(chatId, "Чернетка вже завершилась. Почни нову.", env, inlineKeyboard([[{ text: "Додати скін", callback_data: "skin:new" }]]));
    return;
  }
  if (data === "skin:add-photo") {
    draft.step = "photos";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, photoPrompt(draft.photos.length), env);
    return;
  }
  if (data === "skin:photos-done") {
    if (!draft.photos.length) {
      await sendBotMessage(chatId, "Спочатку додай хоча б одне фото.", env);
      return;
    }
    draft.step = "name";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Напиши назву скіна.", env);
    return;
  }
  if (data.startsWith("skin:category:")) {
    const categories: Record<string, Category> = { free: "Безкоштовно", all: "Доступні всім", donation: "Донат на банку", base: "Підписка", unavailable: "Недоступні" };
    const category = categories[data.slice("skin:category:".length)];
    if (!category) return;
    draft.category = category;
    if (category === "Донат на банку") {
      draft.step = "minimum";
      await saveDraft(chatId, draft, env);
      await sendBotMessage(chatId, "Вкажи мінімальну суму донату в гривнях, наприклад: <b>200</b>.", env);
      return;
    }
    draft.step = "description";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Напиши коротку умову отримання або опис скіна.", env);
    return;
  }
  if (data === "skin:publish") {
    if (draft.step === "publishing") {
      await sendBotMessage(chatId, "Публікація вже виконується. Зачекай кілька секунд.", env);
      return;
    }
    draft.step = "publishing";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Публікую скін у каталог…", env);
    try {
      const skin = await publishDraft(draft, env);
      await clearDraft(chatId, env);
      await sendBotMessage(chatId, `✓ <b>${escapeHtml(skin.name)}</b> додано. GitHub Pages оновить сайт за кілька хвилин.`, env, inlineKeyboard([[{ text: "Додати ще", callback_data: "skin:new" }]]));
    } catch (error) {
      draft.step = "preview";
      await saveDraft(chatId, draft, env);
      await sendBotMessage(chatId, `Не вдалося опублікувати: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: "skin:publish" }, { text: "Скасувати", callback_data: "skin:cancel" }]]));
    }
  }
}

async function handleTelegramUpdate(update: TelegramUpdate, env: Env) {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  if (!isAdmin(chatId, env)) return;
  if (update.callback_query) return processCallback(update.callback_query, env);
  if (update.message) return processMessage(update.message, env);
}

async function handleSubmission(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, env);
  if (request.method === "OPTIONS") return new Response(null, { status: origin === env.ALLOWED_ORIGIN ? 204 : 403, headers });
  if (origin !== env.ALLOWED_ORIGIN || request.method !== "POST") return json({ error: "Not found" }, 404, headers);
  const contentLength = Number(request.headers.get("Content-Length") || 0);
  if (contentLength > MAX_PHOTO_BYTES + 80_000) return json({ error: "Фото має бути меншим за 8 МБ." }, 413, headers);
  if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) return json({ error: "Некоректний формат форми." }, 415, headers);
  const rate = await env.SUBMISSION_RATE_LIMITER.limit({ key: await rateLimitKey(request) });
  if (!rate.success) return json({ error: "Забагато заявок. Спробуй ще раз через кілька хвилин." }, 429, headers);

  let form: FormData;
  try { form = await request.formData(); } catch { return json({ error: "Не вдалося прочитати форму." }, 400, headers); }
  const name = field(form, "name", 90);
  const category = field(form, "category", 40);
  const description = field(form, "description", 800);
  const sourceUrl = field(form, "sourceUrl", 500);
  const turnstileToken = field(form, "turnstileToken", 4096);
  const photo = form.get("photo");
  const validCategories = new Set(["Безкоштовно", "Доступні всім", "Донат на банку", "Підписка", "Недоступні"]);
  if (!name || !description || !validCategories.has(category)) return json({ error: "Заповни назву, категорію та опис." }, 400, headers);
  if (!isHttpsUrl(sourceUrl)) return json({ error: "Посилання має бути коректним URL." }, 400, headers);
  if (!(photo instanceof File) || !photo.size || photo.size > MAX_PHOTO_BYTES || !ALLOWED_IMAGE_TYPES.has(photo.type)) return json({ error: "Додай PNG, JPG або WebP до 8 МБ." }, 400, headers);
  if (!turnstileToken) return json({ error: "Підтвердь, що ти не робот." }, 400, headers);
  try {
    const verification = await verifyTurnstile(turnstileToken, request, env);
    if (!verification.success || verification.hostname !== env.TURNSTILE_HOSTNAME) return json({ error: "Перевірку безпеки не пройдено. Спробуй ще раз." }, 403, headers);
    const photoPayload = new FormData();
    photoPayload.set("chat_id", env.TELEGRAM_CHAT_ID);
    photoPayload.set("photo", photo, photo.name || "monoskin-upload");
    photoPayload.set("caption", messageText({ name, category, description, sourceUrl }));
    await telegram("sendPhoto", photoPayload, env);
    return json({ ok: true }, 200, headers);
  } catch (error) {
    console.error("Submission delivery failed", error);
    return json({ error: "Не вдалося передати заявку. Спробуй пізніше." }, 502, headers);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/telegram/webhook") {
      if (request.method !== "POST" || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.TELEGRAM_WEBHOOK_SECRET) return new Response("Not found", { status: 404 });
      try {
        await handleTelegramUpdate(await request.json() as TelegramUpdate, env);
        return new Response("ok");
      } catch (error) {
        console.error("Telegram webhook failed", error);
        return new Response("ok");
      }
    }
    if (url.pathname === "/submit") return handleSubmission(request, env);
    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
