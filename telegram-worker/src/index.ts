const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const MAX_BOT_PHOTO_BYTES = 8 * 1024 * 1024;
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
type ManageStep = "browse" | "search" | "edit-text" | "photos" | "delete-confirm";
type ManageField = "name" | "description" | "sourceUrl" | "minimumValue";
type ManagePhotoMode = "append" | "replace";
type ManageSession = { step: ManageStep; ids: string[]; page: number; selectedId?: string; field?: ManageField; photoMode?: ManagePhotoMode; photos?: TelegramPhoto[] };
type ReviewRequest = { draft: BotDraft; editorChatId: number; submittedAt: string; status: "pending" | "publishing" };
type AvailabilityEvent = { date: string; status: "Доступний" | "Недоступний"; reason?: string };
type LinkCheckResult = { id: string; status: number; finalUrl: string; ok: boolean; checkedAt: string };
type LinkMonitorState = { ids: string[]; cursor: number; results: LinkCheckResult[]; startedAt: string };
type PublicSubmission = { id: string; status: "received"; kind: "suggestion" | "correction"; createdAt: string; name: string };
type EditorAccessEnv = Env & { TELEGRAM_EDITOR_CHAT_IDS?: string };
type Skin = { id: string; name: string; method: "Безкоштовний" | "Доступні всім" | "Донат на банку" | "Підписка Base"; status: "Доступний" | "Недоступний"; minimumValue: number; addedAt: string; lastVerifiedAt?: string; description: string; sourceUrl: string; image: string; images?: string[]; imageHashes?: string[]; isVisaOnly: boolean; isAdultOnly: boolean; featured: boolean; unavailableReason?: string; availabilityHistory?: AvailabilityEvent[]; publishAt?: string; linkCheck?: { checkedAt: string; status: number; finalUrl: string; ok: boolean } };
type GitHubContent = { content: string; sha: string };
type GitHubRef = { object: { sha: string } };
type GitHubCommit = { tree: { sha: string } };
type GitHubBlob = { sha: string };
type GitHubTree = { sha: string };
type GitHubCreatedCommit = { sha: string };

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!isAllowedOrigin(origin, env)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    Vary: "Origin",
  };
}

function isAllowedOrigin(origin: string | null, env: Env) {
  return origin === env.ALLOWED_ORIGIN || origin === "https://monoskin.pages.dev";
}

function isAllowedTurnstileHostname(hostname: string | undefined, env: Env) {
  return hostname === env.TURNSTILE_HOSTNAME || hostname === "monoskin.pages.dev";
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

function initialAvailabilityHistory(status: Skin["status"], reason?: string): AvailabilityEvent[] {
  return [{ date: new Date().toISOString(), status, ...(reason ? { reason } : {}) }];
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

async function sha256(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function base64ToText(value: string) {
  const binary = atob(value.replace(/\n/g, ""));
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

async function telegramWebhookToken(env: Env) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(env.TELEGRAM_WEBHOOK_SECRET));
  return bytesToBase64(new Uint8Array(digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
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

function messageText(data: { name: string; category: string; sourceUrl: string; description: string; trackingId?: string }) {
  const source = data.sourceUrl || "не додано";
  return [
    "Нова пропозиція скіна — MONOSKIN",
    "",
    `Назва: ${data.name}`,
    `Категорія: ${data.category}`,
    `Умова / опис: ${data.description}`,
    `Джерело: ${source}`,
    data.trackingId ? `Номер заявки: ${data.trackingId}` : "",
  ].join("\n").slice(0, 900);
}

function correctionText(data: { skinId: string; name: string; category: string; sourceUrl: string; description: string; trackingId?: string }) {
  return [
    "Уточнення до скіна — MONOSKIN",
    "",
    `Скін: ${data.name} (${data.skinId})`,
    `Категорія: ${data.category}`,
    `Що виправити: ${data.description}`,
    `Посилання: ${data.sourceUrl || "не змінювали"}`,
    data.trackingId ? `Номер заявки: ${data.trackingId}` : "",
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

function manageKey(chatId: number) {
  return `manage:${chatId}`;
}

async function loadManage(chatId: number, env: Env) {
  return env.BOT_SESSIONS.get<ManageSession>(manageKey(chatId), "json");
}

async function saveManage(chatId: number, session: ManageSession, env: Env) {
  await env.BOT_SESSIONS.put(manageKey(chatId), JSON.stringify(session), { expirationTtl: 60 * 60 });
}

async function clearManage(chatId: number, env: Env) {
  await env.BOT_SESSIONS.delete(manageKey(chatId));
}

function isOwner(chatId: number | undefined, env: Env) {
  return String(chatId ?? "") === env.TELEGRAM_CHAT_ID;
}

function isEditor(chatId: number | undefined, env: EditorAccessEnv) {
  const editors = (env.TELEGRAM_EDITOR_CHAT_IDS || "").split(/[\s,]+/).filter(Boolean);
  return isOwner(chatId, env) || editors.includes(String(chatId ?? ""));
}

async function loadReview(id: string, env: Env) {
  return env.BOT_SESSIONS.get<ReviewRequest>(`review:${id}`, "json");
}

async function saveReview(id: string, review: ReviewRequest, env: Env) {
  await env.BOT_SESSIONS.put(`review:${id}`, JSON.stringify(review), { expirationTtl: 60 * 60 * 24 * 7 });
}

async function clearReview(id: string, env: Env) {
  await env.BOT_SESSIONS.delete(`review:${id}`);
}

function isHttpsUrl(value: string) {
  try { return !value || new URL(value).protocol === "https:"; } catch { return false; }
}

function photoPrompt(count: number) {
  return `Надішли фото скіна (${count}/${MAX_IMAGES_PER_SKIN}). Після кожного фото обери: додати ще чи продовжити.`;
}

function previewText(draft: BotDraft, review = false) {
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
    review ? "Натисни «Надіслати на перевірку» — власник каталогу отримає чернетку." : "Після «Опублікувати» скін з’явиться на сайті за кілька хвилин.",
  ].filter(Boolean).join("\n");
}

async function showPreview(chatId: number, draft: BotDraft, env: Env) {
  const review = !isOwner(chatId, env);
  await sendBotMessage(chatId, previewText(draft, review), env, inlineKeyboard([
    [{ text: review ? "Надіслати на перевірку" : "Опублікувати", callback_data: "skin:publish" }],
    [{ text: "Почати заново", callback_data: "skin:new" }, { text: "Скасувати", callback_data: "skin:cancel" }],
  ]));
}

async function sendReview(chatId: number, draft: BotDraft, env: Env) {
  const reviewId = crypto.randomUUID();
  await saveReview(reviewId, { draft, editorChatId: chatId, submittedAt: new Date().toISOString(), status: "pending" }, env);
  const ownerChatId = Number(env.TELEGRAM_CHAT_ID);
  if (draft.photos.length > 1) {
    await telegram("sendMediaGroup", { chat_id: ownerChatId, media: draft.photos.map((photo) => ({ type: "photo", media: photo.file_id })) }, env);
  } else if (draft.photos[0]) {
    await telegram("sendPhoto", { chat_id: ownerChatId, photo: draft.photos[0].file_id }, env);
  }
  await sendBotMessage(ownerChatId, `<b>Чернетка від редактора</b> · ID ${chatId}\n\n${previewText(draft, true)}`, env, inlineKeyboard([
    [{ text: "✓ Опублікувати", callback_data: `review:approve:${reviewId}` }, { text: "✕ Відхилити", callback_data: `review:reject:${reviewId}` }],
  ]));
}

async function processReviewCallback(callback: TelegramCallback, chatId: number, env: Env) {
  const [, action, reviewId] = (callback.data || "").split(":");
  if (!reviewId || (action !== "approve" && action !== "reject")) return;
  const review = await loadReview(reviewId, env);
  if (!review) {
    await sendBotMessage(chatId, "Ця чернетка вже оброблена або термін її дії сплив.", env, startKeyboard(chatId, env));
    return;
  }
  if (action === "reject") {
    await clearReview(reviewId, env);
    await sendBotMessage(review.editorChatId, "Чернетку не опубліковано. Уточни дані та створи нову — усе збережене фото можна надіслати повторно.", env, startKeyboard(review.editorChatId, env));
    await sendBotMessage(chatId, "Чернетку відхилено. Редактор отримав повідомлення.", env, startKeyboard(chatId, env));
    return;
  }
  if (review.status === "publishing") {
    await sendBotMessage(chatId, "Публікація вже виконується. Зачекай кілька секунд.", env);
    return;
  }
  review.status = "publishing";
  await saveReview(reviewId, review, env);
  await sendBotMessage(chatId, "Публікую скін у каталог…", env);
  try {
    const skin = await publishDraft(review.draft, env);
    await clearReview(reviewId, env);
    await sendBotMessage(review.editorChatId, `✓ <b>${escapeHtml(skin.name)}</b> опубліковано. Сайт оновиться за кілька хвилин.`, env, startKeyboard(review.editorChatId, env));
    await sendBotMessage(chatId, `✓ <b>${escapeHtml(skin.name)}</b> опубліковано. Редактор отримав повідомлення.`, env, startKeyboard(chatId, env));
  } catch (error) {
    review.status = "pending";
    await saveReview(reviewId, review, env);
    await sendBotMessage(chatId, `Не вдалося опублікувати: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: `review:approve:${reviewId}` }, { text: "Відхилити", callback_data: `review:reject:${reviewId}` }]]));
  }
}

async function fetchTelegramPhoto(photo: TelegramPhoto, env: Env) {
  const file = await telegram<{ file_path: string }>("getFile", { file_id: photo.file_id }, env);
  const response = await fetch(`https://api.telegram.org/file/bot${env.TELEGRAM_BOT_TOKEN}/${file.file_path}`);
  if (!response.ok) throw new Error("Не вдалося завантажити фото з Telegram.");
  const responseType = response.headers.get("Content-Type")?.split(";")[0].toLowerCase() || "";
  const extensionFromPath = file.file_path.split(".").pop()?.toLowerCase();
  const inferredType = extensionFromPath === "png" ? "image/png" : extensionFromPath === "webp" ? "image/webp" : extensionFromPath === "jpg" || extensionFromPath === "jpeg" ? "image/jpeg" : "";
  const contentType = ALLOWED_IMAGE_TYPES.has(responseType) ? responseType : inferredType;
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!ALLOWED_IMAGE_TYPES.has(contentType) || !bytes.length || bytes.length > MAX_BOT_PHOTO_BYTES) throw new Error("Кожне фото має бути PNG, JPG або WebP до 8 МБ.");
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
      "User-Agent": "MONOSKIN-Telegram-Bot",
      ...(init.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({})) as { message?: string } & T;
  if (!response.ok) throw new Error(body.message ? `GitHub: ${body.message}` : `GitHub повернув помилку ${response.status}.`);
  return body as T;
}

type PendingImage = { path: string; bytes: Uint8Array };

async function mutateCatalog(
  env: Env,
  message: string,
  mutate: (records: Skin[]) => Skin[],
  pendingImages: PendingImage[] = [],
) {
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
  const nextRecords = mutate(records);
  const current = await github<GitHubCommit>(`${base}/git/commits/${ref.object.sha}`, env);
  const blobs = await Promise.all([
    github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: textToBase64(`${JSON.stringify(nextRecords, null, 2)}\n`), encoding: "base64" }) }),
    ...pendingImages.map((file) => github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: bytesToBase64(file.bytes), encoding: "base64" }) })),
  ]);
  const tree = await github<GitHubTree>(`${base}/git/trees`, env, {
    method: "POST",
    body: JSON.stringify({
      base_tree: current.tree.sha,
      tree: [
        { path: "data/skins.json", mode: "100644", type: "blob", sha: blobs[0].sha },
        ...pendingImages.map((file, index) => ({ path: `public/${file.path}`, mode: "100644", type: "blob", sha: blobs[index + 1].sha })),
      ],
    }),
  });
  const created = await github<GitHubCreatedCommit>(`${base}/git/commits`, env, {
    method: "POST",
    body: JSON.stringify({ message, tree: tree.sha, parents: [ref.object.sha] }),
  });
  await github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, env, {
    method: "PATCH",
    body: JSON.stringify({ sha: created.sha, force: false }),
  });
  return nextRecords;
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
    imageHashes: await Promise.all(downloaded.map((file) => sha256(file.bytes))),
    isVisaOnly: false,
    isAdultOnly: false,
    featured: false,
    availabilityHistory: initialAvailabilityHistory(fields.status),
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

async function recentSkins(env: Env) {
  const repository = env.GITHUB_REPOSITORY || `${OWNER}/${REPO}`;
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Некоректна назва GitHub-репозиторію у налаштуваннях Worker.");
  const branch = env.GITHUB_BRANCH || BRANCH;
  const catalogFile = await github<GitHubContent>(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/data/skins.json?ref=${encodeURIComponent(branch)}`, env);
  return (JSON.parse(base64ToText(catalogFile.content)) as Skin[])
    .sort((left, right) => +new Date(right.addedAt) - +new Date(left.addedAt))
    .slice(0, 6);
}

async function catalogAndDrafts(env: Env) {
  const repository = env.GITHUB_REPOSITORY || `${OWNER}/${REPO}`;
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Некоректна назва GitHub-репозиторію у налаштуваннях Worker.");
  const branch = env.GITHUB_BRANCH || BRANCH;
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [catalogFile, draftsFile] = await Promise.all([
    github<GitHubContent>(`${base}/contents/data/skins.json?ref=${encodeURIComponent(branch)}`, env),
    github<GitHubContent>(`${base}/contents/data/drafts.json?ref=${encodeURIComponent(branch)}`, env),
  ]);
  return { records: JSON.parse(base64ToText(catalogFile.content)) as Skin[], drafts: JSON.parse(base64ToText(draftsFile.content)) as Skin[] };
}

async function sendDraftSummary(chatId: number, env: Env) {
  const { drafts } = await catalogAndDrafts(env);
  if (!drafts.length) { await sendBotMessage(chatId, "У репозиторії немає чернеток.", env, startKeyboard(chatId, env)); return; }
  const lines = drafts.slice(0, 12).map((skin) => `• <b>${escapeHtml(skin.name)}</b> · ${escapeHtml(categoryOfBot(skin))}`);
  await sendBotMessage(chatId, `<b>Чернетки (${drafts.length})</b>\n\n${lines.join("\n")}${drafts.length > 12 ? "\n\nПоказано перші 12." : ""}\n\nВідкрий адмінку, щоб перевірити й опублікувати вибрані.`, env, startKeyboard(chatId, env));
}

function categoryOfBot(skin: Skin) {
  if (skin.status === "Недоступний") return "Недоступні";
  if (skin.method === "Донат на банку") return "Донат на банку";
  if (skin.method === "Підписка Base") return "Підписка";
  if (skin.method === "Доступні всім") return "Доступні всім";
  return "Безкоштовно";
}

const MANAGE_PAGE_SIZE = 6;

function skinImages(skin: Skin) {
  return skin.images?.length ? skin.images : [skin.image];
}

function shortButtonLabel(value: string) {
  return value.length > 34 ? `${value.slice(0, 31)}…` : value;
}

async function showManageList(chatId: number, env: Env, ids?: string[], page = 0, heading = "Усі скіни") {
  const { records } = await loadCatalogForWorker(env);
  const availableIds = ids ?? records
    .slice()
    .sort((left, right) => +new Date(right.addedAt) - +new Date(left.addedAt))
    .map((skin) => skin.id);
  const byId = new Map(records.map((skin) => [skin.id, skin]));
  const matchingIds = availableIds.filter((id) => byId.has(id));
  if (!matchingIds.length) {
    await clearManage(chatId, env);
    await sendBotMessage(chatId, "За цим запитом скінів не знайдено.", env, startKeyboard(chatId, env));
    return;
  }
  const pageCount = Math.ceil(matchingIds.length / MANAGE_PAGE_SIZE);
  const safePage = Math.max(0, Math.min(page, pageCount - 1));
  const visibleIds = matchingIds.slice(safePage * MANAGE_PAGE_SIZE, (safePage + 1) * MANAGE_PAGE_SIZE);
  await saveManage(chatId, { step: "browse", ids: matchingIds, page: safePage }, env);
  const buttons = visibleIds.map((id, index) => {
    const skin = byId.get(id)!;
    return [{ text: shortButtonLabel(`${categoryOfBot(skin)} · ${skin.name}`), callback_data: `manage:pick:${index}` }];
  });
  buttons.push([
    { text: "←", callback_data: "manage:prev" },
    { text: `${safePage + 1}/${pageCount}`, callback_data: "manage:refresh" },
    { text: "→", callback_data: "manage:next" },
  ]);
  buttons.push([{ text: "🔎 Знайти скін", callback_data: "manage:search" }, { text: "↻ Оновити", callback_data: "manage:refresh" }]);
  buttons.push([{ text: "← До меню", callback_data: "manage:close" }]);
  await sendBotMessage(chatId, `<b>${escapeHtml(heading)}</b> · ${matchingIds.length}\n\nОбери скін для редагування.`, env, inlineKeyboard(buttons));
}

async function selectedManagedSkin(chatId: number, env: Env) {
  const session = await loadManage(chatId, env);
  if (!session?.selectedId) return { session, skin: undefined };
  const { records } = await loadCatalogForWorker(env);
  return { session, skin: records.find((record) => record.id === session.selectedId) };
}

function managedSkinText(skin: Skin) {
  const source = skin.sourceUrl ? escapeHtml(skin.sourceUrl) : "немає";
  return [
    `<b>${escapeHtml(skin.name)}</b>`,
    `<code>${escapeHtml(skin.id)}</code>`,
    "",
    `<b>Категорія:</b> ${escapeHtml(categoryOfBot(skin))}`,
    skin.method === "Донат на банку" ? `<b>Мінімум:</b> ${skin.minimumValue || 0} грн` : "",
    `<b>Статус:</b> ${escapeHtml(skin.status)}`,
    `<b>Фото:</b> ${skinImages(skin).length}`,
    `<b>Посилання:</b> ${source}`,
    "",
    `<b>Умова:</b> ${escapeHtml(skin.description || "—")}`,
  ].filter(Boolean).join("\n");
}

async function showManageSkin(chatId: number, env: Env) {
  const { session, skin } = await selectedManagedSkin(chatId, env);
  if (!session || !skin) {
    await sendBotMessage(chatId, "Скін уже змінено або видалено. Відкрий список ще раз.", env, startKeyboard(chatId, env));
    return;
  }
  const imageUrl = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${env.GITHUB_BRANCH || BRANCH}/public/${skin.image}`;
  try {
    await telegram("sendPhoto", { chat_id: chatId, photo: imageUrl, caption: managedSkinText(skin).slice(0, 1000), parse_mode: "HTML" }, env);
  } catch {
    await sendBotMessage(chatId, managedSkinText(skin), env);
  }
  await sendBotMessage(chatId, "Що змінити?", env, inlineKeyboard([
    [{ text: "Назву", callback_data: "manage:edit:name" }, { text: "Умову", callback_data: "manage:edit:description" }],
    [{ text: "Посилання", callback_data: "manage:edit:sourceUrl" }, { text: "Суму", callback_data: "manage:edit:minimumValue" }],
    [{ text: "Категорію", callback_data: "manage:category" }, { text: "Фото", callback_data: "manage:photos" }],
    [{ text: "🗑 Видалити скін", callback_data: "manage:delete" }],
    [{ text: "← До списку", callback_data: "manage:back" }],
  ]));
}

async function updateManagedSkin(id: string, env: Env, message: string, update: (skin: Skin) => Skin, pendingImages: PendingImage[] = []) {
  const records = await mutateCatalog(env, message, (current) => {
    let found = false;
    const next = current.map((skin) => {
      if (skin.id !== id) return skin;
      found = true;
      return update(skin);
    });
    if (!found) throw new Error("Скін уже видалено з каталогу.");
    return next;
  }, pendingImages);
  const skin = records.find((record) => record.id === id);
  if (!skin) throw new Error("Скін уже видалено з каталогу.");
  return skin;
}

function categoryButtons() {
  return inlineKeyboard([
    [{ text: "Безкоштовно", callback_data: "manage:category:free" }, { text: "Доступні всім", callback_data: "manage:category:all" }],
    [{ text: "Донат на банку", callback_data: "manage:category:donation" }, { text: "Підписка Base", callback_data: "manage:category:base" }],
    [{ text: "Недоступні", callback_data: "manage:category:unavailable" }],
    [{ text: "Скасувати", callback_data: "manage:details" }],
  ]);
}

async function sendBrokenLinkSummary(chatId: number, env: Env) {
  const { records } = await catalogAndDrafts(env);
  const broken = records.filter((skin) => skin.sourceUrl && skin.linkCheck && !skin.linkCheck.ok);
  if (!broken.length) { await sendBotMessage(chatId, "✓ За останньою перевіркою проблемних URL немає.", env, startKeyboard(chatId, env)); return; }
  const lines = broken.slice(0, 12).map((skin) => `• <a href="https://monoskin.pages.dev/skin/${encodeURIComponent(skin.id)}/">${escapeHtml(skin.name)}</a> · HTTP ${skin.linkCheck?.status || "—"}`);
  await sendBotMessage(chatId, `<b>Проблемні URL (${broken.length})</b>\n\n${lines.join("\n")}${broken.length > 12 ? "\n\nПоказано перші 12." : ""}\n\nВідкрий адмінку, щоб оновити або вимкнути посилання.`, env, startKeyboard(chatId, env));
}

function startKeyboard(chatId?: number, env?: Env) {
  const owner = env && isOwner(chatId, env);
  return inlineKeyboard([
    [{ text: "Додати скін", callback_data: "skin:new" }, { text: "Моя чернетка", callback_data: "skin:current" }],
    [{ text: "Останні додані", callback_data: "skin:recent" }, ...(owner ? [{ text: "Чернетки", callback_data: "skin:drafts" }] : [])],
    ...(owner ? [[{ text: "Керувати скінами", callback_data: "manage:open" }]] : []),
    ...(owner ? [[{ text: "Проблемні URL", callback_data: "skin:broken-links" }]] : []),
  ]);
}

async function startDraft(chatId: number, env: Env) {
  const draft: BotDraft = { step: "photos", photos: [] };
  await saveDraft(chatId, draft, env);
  await sendBotMessage(chatId, "<b>Новий скін</b>\n\n" + photoPrompt(0), env, inlineKeyboard([[{ text: "Скасувати", callback_data: "skin:cancel" }]]));
}

async function startManage(chatId: number, env: Env) {
  await clearDraft(chatId, env);
  await showManageList(chatId, env);
}

async function processManageMessage(message: TelegramMessage, session: ManageSession, env: Env) {
  const chatId = message.chat.id;
  const text = message.text?.trim() || "";
  if (session.step === "photos" && message.photo?.length) {
    const photo = message.photo[message.photo.length - 1];
    const current = session.photos ?? [];
      const limit = MAX_IMAGES_PER_SKIN;
    if (photo.file_size && photo.file_size > MAX_BOT_PHOTO_BYTES) {
      await sendBotMessage(chatId, "Це фото більше 8 МБ. Надішли меншу версію.", env);
      return;
    }
    if (photo.width < 480 || photo.height < 280) {
      await sendBotMessage(chatId, `Фото замале (${photo.width} × ${photo.height} px). Надішли щонайменше 480 × 280 px.`, env);
      return;
    }
    if (current.some((item) => item.file_unique_id === photo.file_unique_id)) {
      await sendBotMessage(chatId, "Це фото вже додано.", env);
      return;
    }
    if (current.length >= limit) {
      await sendBotMessage(chatId, `Можна додати до ${limit} фото за раз. Натисни «Зберегти фото».`, env);
      return;
    }
    session.photos = [...current, photo];
    await saveManage(chatId, session, env);
    await sendBotMessage(chatId, `✓ Фото додано (${session.photos.length}/${limit}).`, env, inlineKeyboard([
      [{ text: "Ще одне фото", callback_data: "manage:photos-more" }, { text: "Зберегти фото", callback_data: "manage:photos-done" }],
      [{ text: "Скасувати", callback_data: "manage:details" }],
    ]));
    return;
  }
  if (!text) return;
  if (session.step === "search") {
    const query = text.toLocaleLowerCase("uk").slice(0, 90);
    const { records } = await loadCatalogForWorker(env);
    const ids = records
      .filter((skin) => `${skin.name} ${skin.id} ${skin.description} ${skin.method}`.toLocaleLowerCase("uk").includes(query))
      .sort((left, right) => +new Date(right.addedAt) - +new Date(left.addedAt))
      .map((skin) => skin.id);
    await showManageList(chatId, env, ids, 0, `Результати: «${text.slice(0, 50)}»`);
    return;
  }
  if (session.step !== "edit-text" || !session.selectedId || !session.field) return;
  const field = session.field;
  let value: string | number = text;
  if (field === "name") {
    value = text.slice(0, 90);
    if (!value) { await sendBotMessage(chatId, "Назва не може бути порожньою.", env); return; }
  }
  if (field === "description") {
    value = text.slice(0, 900);
    if (!value) { await sendBotMessage(chatId, "Умова не може бути порожньою.", env); return; }
  }
  if (field === "sourceUrl") {
    value = text === "-" ? "" : text.slice(0, 500);
    if (!isHttpsUrl(String(value))) { await sendBotMessage(chatId, "Надішли https-посилання або «-», щоб прибрати його.", env); return; }
  }
  if (field === "minimumValue") {
    const amount = Number(text.replace(/[^0-9.,]/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) { await sendBotMessage(chatId, "Вкажи суму числом від 0 до 1 000 000.", env); return; }
    value = amount;
  }
  try {
    await updateManagedSkin(session.selectedId, env, `Оновити скін через Telegram: ${field}`, (skin) => ({ ...skin, [field]: value, lastVerifiedAt: today() }));
    await saveManage(chatId, { ...session, step: "browse", field: undefined }, env);
    await sendBotMessage(chatId, "✓ Зміни збережено. Сайт оновиться за кілька хвилин.", env);
    await showManageSkin(chatId, env);
  } catch (error) {
    await sendBotMessage(chatId, `Не вдалося зберегти: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: "manage:retry-text" }, { text: "Скасувати", callback_data: "manage:details" }]]));
  }
}

async function processMessage(message: TelegramMessage, env: Env) {
  const chatId = message.chat.id;
  const text = message.text?.trim() || "";
  if (text === "/start" || text === "/add") {
    await sendBotMessage(chatId, "Привіт. Я допоможу швидко додати скін у MONOSKIN.", env, startKeyboard(chatId, env));
    return;
  }
  if (text === "/manage") {
    if (!isOwner(chatId, env)) {
      await sendBotMessage(chatId, "Керування каталогом доступне лише власнику MONOSKIN.", env, startKeyboard(chatId, env));
      return;
    }
    await startManage(chatId, env);
    return;
  }
  if (text === "/cancel") {
    await clearDraft(chatId, env);
    await clearManage(chatId, env);
    await sendBotMessage(chatId, "Чернетку скасовано.", env, startKeyboard(chatId, env));
    return;
  }

  const management = isOwner(chatId, env) ? await loadManage(chatId, env) : undefined;
  if (management) {
    await processManageMessage(message, management, env);
    return;
  }
  const draft = await loadDraft(chatId, env);
  if (!draft) {
    await sendBotMessage(chatId, "Натисни «Додати скін», щоб почати.", env, startKeyboard(chatId, env));
    return;
  }
  if (message.photo?.length) {
    if (draft.step !== "photos") {
      await sendBotMessage(chatId, "Фото вже збережені. Продовжуй відповідати на запитання або почни нову чернетку.", env);
      return;
    }
    const photo = message.photo[message.photo.length - 1];
    if (photo.file_size && photo.file_size > MAX_BOT_PHOTO_BYTES) {
      await sendBotMessage(chatId, "Це фото більше 8 МБ. Надішли меншу версію.", env);
      return;
    }
    if (photo.width < 480 || photo.height < 280) {
      await sendBotMessage(chatId, `Фото замале (${photo.width} × ${photo.height} px). Надішли щонайменше 480 × 280 px.`, env);
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
  if (data.startsWith("review:")) {
    if (!isOwner(callback.from.id, env)) return;
    await processReviewCallback(callback, chatId, env);
    return;
  }
  if (data.startsWith("manage:")) {
    if (!isOwner(callback.from.id, env)) return;
    if (data === "manage:open") { await startManage(chatId, env); return; }
    if (data === "manage:close") { await clearManage(chatId, env); await sendBotMessage(chatId, "Керування каталогом закрито.", env, startKeyboard(chatId, env)); return; }
    const session = await loadManage(chatId, env);
    if (!session) { await startManage(chatId, env); return; }
    if (data === "manage:refresh") { await showManageList(chatId, env, session.ids, session.page); return; }
    if (data === "manage:prev" || data === "manage:next") {
      await showManageList(chatId, env, session.ids, session.page + (data === "manage:next" ? 1 : -1));
      return;
    }
    if (data.startsWith("manage:pick:")) {
      const index = Number(data.slice("manage:pick:".length));
      const id = session.ids[session.page * MANAGE_PAGE_SIZE + index];
      if (!id) { await showManageList(chatId, env, session.ids, session.page); return; }
      await saveManage(chatId, { ...session, step: "browse", selectedId: id }, env);
      await showManageSkin(chatId, env);
      return;
    }
    if (data === "manage:back") { await showManageList(chatId, env, session.ids, session.page); return; }
    if (data === "manage:details") { await saveManage(chatId, { ...session, step: "browse", field: undefined, photoMode: undefined, photos: undefined }, env); await showManageSkin(chatId, env); return; }
    if (data === "manage:search") {
      await saveManage(chatId, { ...session, step: "search", selectedId: undefined, field: undefined }, env);
      await sendBotMessage(chatId, "Надішли назву, тему або ID скіна для пошуку.", env, inlineKeyboard([[{ text: "Скасувати", callback_data: "manage:back" }]]));
      return;
    }
    if (data.startsWith("manage:edit:")) {
      const field = data.slice("manage:edit:".length) as ManageField;
      if (!session.selectedId || !["name", "description", "sourceUrl", "minimumValue"].includes(field)) return;
      const prompts: Record<ManageField, string> = {
        name: "Надішли нову назву скіна.",
        description: "Надішли нову умову або опис.",
        sourceUrl: "Надішли нове https-посилання або «-», щоб прибрати його.",
        minimumValue: "Надішли суму в гривнях. Для безкоштовних скинь 0.",
      };
      await saveManage(chatId, { ...session, step: "edit-text", field }, env);
      await sendBotMessage(chatId, prompts[field], env, inlineKeyboard([[{ text: "Скасувати", callback_data: "manage:details" }]]));
      return;
    }
    if (data === "manage:retry-text") {
      if (!session.field) return;
      const labels: Record<ManageField, string> = { name: "назву", description: "умову", sourceUrl: "https-посилання або «-»", minimumValue: "суму в гривнях" };
      await sendBotMessage(chatId, `Надішли ${labels[session.field]}.`, env);
      return;
    }
    if (data === "manage:category") { await sendBotMessage(chatId, "Обери нову категорію.", env, categoryButtons()); return; }
    if (data.startsWith("manage:category:")) {
      if (!session.selectedId) return;
      const categories: Record<string, Category> = { free: "Безкоштовно", all: "Доступні всім", donation: "Донат на банку", base: "Підписка", unavailable: "Недоступні" };
      const category = categories[data.slice("manage:category:".length)];
      if (!category) return;
      try {
        await updateManagedSkin(session.selectedId, env, `Змінити категорію через Telegram`, (skin) => {
          const fields = categoryFields(category);
          const statusChanged = skin.status !== fields.status;
          return {
            ...skin,
            ...fields,
            minimumValue: fields.method === "Донат на банку" ? skin.minimumValue : 0,
            lastVerifiedAt: today(),
            ...(statusChanged ? { availabilityHistory: [...(skin.availabilityHistory ?? []), ...initialAvailabilityHistory(fields.status)] } : {}),
          };
        });
        if (category === "Донат на банку") {
          await saveManage(chatId, { ...session, step: "edit-text", field: "minimumValue" }, env);
          await sendBotMessage(chatId, "✓ Категорію змінено. Тепер надішли мінімальну суму донату в гривнях.", env);
        } else {
          await saveManage(chatId, { ...session, step: "browse", field: undefined }, env);
          await sendBotMessage(chatId, "✓ Категорію змінено. Сайт оновиться за кілька хвилин.", env);
          await showManageSkin(chatId, env);
        }
      } catch (error) {
        await sendBotMessage(chatId, `Не вдалося зберегти: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, categoryButtons());
      }
      return;
    }
    if (data === "manage:photos") {
      await sendBotMessage(chatId, "Як оновити галерею? Старі файли безпечно лишаться в репозиторії, але не показуватимуться на сайті.", env, inlineKeyboard([
        [{ text: "Додати фото", callback_data: "manage:photos:append" }, { text: "Замінити всі фото", callback_data: "manage:photos:replace" }],
        [{ text: "Скасувати", callback_data: "manage:details" }],
      ]));
      return;
    }
    if (data === "manage:photos:append" || data === "manage:photos:replace") {
      if (!session.selectedId) return;
      await saveManage(chatId, { ...session, step: "photos", photoMode: data.endsWith("append") ? "append" : "replace", photos: [] }, env);
      await sendBotMessage(chatId, data.endsWith("append") ? "Надішли фото, яке треба додати до галереї." : "Надішли нове перше фото. Можна додати до 6 фото перед збереженням.", env, inlineKeyboard([[{ text: "Скасувати", callback_data: "manage:details" }]]));
      return;
    }
    if (data === "manage:photos-more") { await sendBotMessage(chatId, "Надішли ще одне фото.", env); return; }
    if (data === "manage:photos-done") {
      if (!session.selectedId || session.step !== "photos" || !session.photos?.length || !session.photoMode) return;
      const { skin } = await selectedManagedSkin(chatId, env);
      if (!skin) { await sendBotMessage(chatId, "Скін не знайдено. Відкрий каталог ще раз.", env, startKeyboard(chatId, env)); return; }
      const currentImages = skinImages(skin);
      if (session.photoMode === "append" && currentImages.length + session.photos.length > MAX_IMAGES_PER_SKIN) {
        await sendBotMessage(chatId, `У картці вже ${currentImages.length} фото. Разом можна максимум ${MAX_IMAGES_PER_SKIN}.`, env, inlineKeyboard([[{ text: "Замінити всі фото", callback_data: "manage:photos:replace" }, { text: "Скасувати", callback_data: "manage:details" }]]));
        return;
      }
      try {
        const downloaded = await Promise.all(session.photos.map((photo) => fetchTelegramPhoto(photo, env)));
        const stamp = Date.now();
        const addedPaths = downloaded.map((file, index) => `skin/${skin.id}-telegram-${stamp}-${index + 1}.${file.extension}`);
        const nextImages = session.photoMode === "replace" ? addedPaths : [...currentImages, ...addedPaths];
        const nextHashes = session.photoMode === "replace"
          ? await Promise.all(downloaded.map((file) => sha256(file.bytes)))
          : [...(skin.imageHashes ?? []), ...await Promise.all(downloaded.map((file) => sha256(file.bytes)))];
        await updateManagedSkin(skin.id, env, `Оновити фото скіна через Telegram: ${skin.name}`, (current) => ({ ...current, image: nextImages[0], images: nextImages, imageHashes: nextHashes, lastVerifiedAt: today() }), downloaded.map((file, index) => ({ path: addedPaths[index], bytes: file.bytes })));
        await saveManage(chatId, { ...session, step: "browse", photos: undefined, photoMode: undefined }, env);
        await sendBotMessage(chatId, "✓ Фото збережено. Сайт оновиться за кілька хвилин.", env);
        await showManageSkin(chatId, env);
      } catch (error) {
        await sendBotMessage(chatId, `Не вдалося зберегти фото: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: "manage:photos-done" }, { text: "Скасувати", callback_data: "manage:details" }]]));
      }
      return;
    }
    if (data === "manage:delete") {
      if (!session.selectedId) return;
      await saveManage(chatId, { ...session, step: "delete-confirm" }, env);
      await sendBotMessage(chatId, "Точно вилучити цей скін з каталогу? Фото залишаться в історії GitHub, але з сайту скін зникне.", env, inlineKeyboard([[{ text: "Так, вилучити", callback_data: "manage:delete-confirm" }, { text: "Скасувати", callback_data: "manage:details" }]]));
      return;
    }
    if (data === "manage:delete-confirm") {
      if (!session.selectedId || session.step !== "delete-confirm") return;
      try {
        const { records } = await loadCatalogForWorker(env);
        const skin = records.find((record) => record.id === session.selectedId);
        if (!skin) throw new Error("Скін уже вилучено.");
        await mutateCatalog(env, `Вилучити скін через Telegram: ${skin.name}`, (current) => current.filter((record) => record.id !== skin.id));
        await clearManage(chatId, env);
        await sendBotMessage(chatId, `✓ «${escapeHtml(skin.name)}» вилучено. Сайт оновиться за кілька хвилин.`, env, startKeyboard(chatId, env));
      } catch (error) {
        await sendBotMessage(chatId, `Не вдалося вилучити: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: "manage:delete-confirm" }, { text: "Скасувати", callback_data: "manage:details" }]]));
      }
      return;
    }
    return;
  }
  if (data === "skin:new") {
    await startDraft(chatId, env);
    return;
  }
  if (data === "skin:current") {
    const current = await loadDraft(chatId, env);
    if (!current) { await sendBotMessage(chatId, "Активної чернетки немає. Натисни «Додати скін», щоб почати.", env, startKeyboard(chatId, env)); return; }
    await sendBotMessage(chatId, `<b>Твоя активна чернетка</b>\n\n${previewText(current, !isOwner(chatId, env))}\n\nПовернись до останнього повідомлення бота, щоб продовжити з поточного кроку.`, env, inlineKeyboard([[{ text: "Скасувати", callback_data: "skin:cancel" }, { text: "Почати нову", callback_data: "skin:new" }]]));
    return;
  }
  if (data === "skin:drafts") {
    if (!isOwner(chatId, env)) return;
    try { await sendDraftSummary(chatId, env); }
    catch (error) { await sendBotMessage(chatId, `Не вдалося завантажити чернетки: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, startKeyboard(chatId, env)); }
    return;
  }
  if (data === "skin:broken-links") {
    if (!isOwner(chatId, env)) return;
    try { await sendBrokenLinkSummary(chatId, env); }
    catch (error) { await sendBotMessage(chatId, `Не вдалося перевірити звіт URL: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, startKeyboard(chatId, env)); }
    return;
  }
  if (data === "skin:recent") {
    try {
      const records = await recentSkins(env);
      if (!records.length) { await sendBotMessage(chatId, "Каталог поки порожній.", env, startKeyboard(chatId, env)); return; }
      await sendBotMessage(chatId, "<b>Останні додані скіни</b>", env);
      for (const skin of records) {
        const url = `https://monoskin.pages.dev/skin/${encodeURIComponent(skin.id)}/`;
        await sendBotMessage(chatId, `• <a href="${url}">${escapeHtml(skin.name)}</a>\n${escapeHtml(skin.addedAt.slice(0, 10))}`, env);
      }
      await sendBotMessage(chatId, "Що хочеш зробити далі?", env, startKeyboard(chatId, env));
    } catch (error) {
      await sendBotMessage(chatId, `Не вдалося завантажити каталог: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, startKeyboard(chatId, env));
    }
    return;
  }
  if (data === "skin:cancel") {
    await clearDraft(chatId, env);
    await sendBotMessage(chatId, "Чернетку скасовано.", env, startKeyboard(chatId, env));
    return;
  }
  const draft = await loadDraft(chatId, env);
  if (!draft) {
    await sendBotMessage(chatId, "Чернетка вже завершилась. Почни нову.", env, startKeyboard(chatId, env));
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
    if (!isOwner(chatId, env)) {
      try {
        await sendReview(chatId, draft, env);
        await clearDraft(chatId, env);
        await sendBotMessage(chatId, "✓ Чернетку та всі фото надіслано власнику каталогу. Напишемо сюди після рішення.", env, startKeyboard(chatId, env));
      } catch (error) {
        await sendBotMessage(chatId, `Не вдалося надіслати чернетку: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: "skin:publish" }, { text: "Скасувати", callback_data: "skin:cancel" }]]));
      }
      return;
    }
    draft.step = "publishing";
    await saveDraft(chatId, draft, env);
    await sendBotMessage(chatId, "Публікую скін у каталог…", env);
    try {
      const skin = await publishDraft(draft, env);
      await clearDraft(chatId, env);
      await sendBotMessage(chatId, `✓ <b>${escapeHtml(skin.name)}</b> додано. GitHub Pages оновить сайт за кілька хвилин.`, env, startKeyboard(chatId, env));
    } catch (error) {
      draft.step = "preview";
      await saveDraft(chatId, draft, env);
      await sendBotMessage(chatId, `Не вдалося опублікувати: ${escapeHtml(error instanceof Error ? error.message : "невідома помилка")}`, env, inlineKeyboard([[{ text: "Спробувати ще раз", callback_data: "skin:publish" }, { text: "Скасувати", callback_data: "skin:cancel" }]]));
    }
  }
}

async function handleTelegramUpdate(update: TelegramUpdate, env: Env) {
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id;
  const message = update.message;
  if (typeof chatId === "number" && message?.text?.trim() === "/id" && message.from?.id === chatId) {
    await sendBotMessage(chatId, `Твій Telegram ID: <code>${chatId}</code>\nНадішли його власнику MONOSKIN, щоб отримати роль редактора.`, env);
    return;
  }
  if (!isEditor(chatId, env)) return;
  if (update.callback_query) return processCallback(update.callback_query, env);
  if (update.message) return processMessage(update.message, env);
}

async function handleSubmission(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, env);
  if (request.method === "OPTIONS") return new Response(null, { status: isAllowedOrigin(origin, env) ? 204 : 403, headers });
  if (!isAllowedOrigin(origin, env) || request.method !== "POST") return json({ error: "Not found" }, 404, headers);
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
  const kind = field(form, "kind", 20);
  const skinId = field(form, "skinId", 160);
  const turnstileToken = field(form, "turnstileToken", 4096);
  const photo = form.get("photo");
  const validCategories = new Set(["Безкоштовно", "Доступні всім", "Донат на банку", "Підписка", "Недоступні"]);
  const correction = kind === "correction";
  if (!name || !description || !validCategories.has(category) || (correction && !skinId)) return json({ error: "Заповни назву, категорію та опис." }, 400, headers);
  if (!isHttpsUrl(sourceUrl)) return json({ error: "Посилання має бути коректним URL." }, 400, headers);
  if (!correction && (!(photo instanceof File) || !photo.size)) return json({ error: "Додай PNG, JPG або WebP до 8 МБ." }, 400, headers);
  if (photo instanceof File && photo.size && (photo.size > MAX_PHOTO_BYTES || !ALLOWED_IMAGE_TYPES.has(photo.type))) return json({ error: "Додай PNG, JPG або WebP до 8 МБ." }, 400, headers);
  if (!turnstileToken) return json({ error: "Підтвердь, що ти не робот." }, 400, headers);
  try {
    const verification = await verifyTurnstile(turnstileToken, request, env);
    if (!verification.success || !isAllowedTurnstileHostname(verification.hostname, env)) return json({ error: "Перевірку безпеки не пройдено. Спробуй ще раз." }, 403, headers);
    const trackingId = crypto.randomUUID().slice(0, 8).toUpperCase();
    const text = correction ? correctionText({ skinId, name, category, description, sourceUrl, trackingId }) : messageText({ name, category, description, sourceUrl, trackingId });
    if (photo instanceof File && photo.size) {
      const photoPayload = new FormData();
      photoPayload.set("chat_id", env.TELEGRAM_CHAT_ID);
      photoPayload.set("photo", photo, photo.name || "monoskin-upload");
      photoPayload.set("caption", text);
      await telegram("sendPhoto", photoPayload, env);
    } else await sendBotMessage(Number(env.TELEGRAM_CHAT_ID), text, env);
    const submission: PublicSubmission = { id: trackingId, status: "received", kind: correction ? "correction" : "suggestion", createdAt: new Date().toISOString(), name };
    await env.BOT_SESSIONS.put(`submission:${trackingId}`, JSON.stringify(submission), { expirationTtl: 60 * 60 * 24 * 30 });
    return json({ ok: true, trackingId }, 200, headers);
  } catch (error) {
    console.error("Submission delivery failed", error);
    return json({ error: "Не вдалося передати заявку. Спробуй пізніше." }, 502, headers);
  }
}

async function handleSubmissionStatus(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, env);
  if (!isAllowedOrigin(origin, env) || request.method !== "GET") return json({ error: "Not found" }, 404, headers);
  const id = new URL(request.url).searchParams.get("id")?.trim().toUpperCase() || "";
  if (!/^[A-Z0-9-]{8,36}$/.test(id)) return json({ error: "Некоректний номер заявки." }, 400, headers);
  const submission = await env.BOT_SESSIONS.get<PublicSubmission>(`submission:${id}`, "json");
  if (!submission) return json({ error: "Заявку не знайдено або строк відстеження завершився." }, 404, headers);
  return Response.json({ id: submission.id, status: submission.status, createdAt: submission.createdAt, kind: submission.kind }, { headers: { ...headers, "Cache-Control": "no-store" } });
}

function safeExternalUrl(value: string) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const privateIp = /^(127\.|0\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host);
    return url.protocol === "https:" && !url.port && host !== "localhost" && !host.endsWith(".local") && !privateIp;
  } catch { return false; }
}

async function isGithubOwnerToken(token: string) {
  const response = await fetch("https://api.github.com/user", { headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28" } });
  const data = await response.json().catch(() => ({})) as { login?: string };
  return response.ok && data.login?.toLowerCase() === OWNER.toLowerCase();
}

async function inspectLink(url: string) {
  if (!safeExternalUrl(url)) return { status: 0, finalUrl: url, ok: false };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    let response = await fetch(url, { method: "HEAD", redirect: "follow", signal: controller.signal });
    if (response.status === 405 || response.status === 403) response = await fetch(url, { method: "GET", redirect: "follow", signal: controller.signal, headers: { Range: "bytes=0-0" } });
    return { status: response.status, finalUrl: response.url || url, ok: response.status >= 200 && response.status < 400 };
  } catch { return { status: 0, finalUrl: url, ok: false }; }
  finally { clearTimeout(timeout); }
}

async function handleLinkCheck(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get("Origin");
  const headers = corsHeaders(origin, env);
  if (request.method === "OPTIONS") return new Response(null, { status: isAllowedOrigin(origin, env) ? 204 : 403, headers });
  if (!isAllowedOrigin(origin, env) || request.method !== "POST") return json({ error: "Not found" }, 404, headers);
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token || !await isGithubOwnerToken(token)) return json({ error: "Адмін-доступ не підтверджено." }, 401, headers);
  const body = await request.json().catch(() => null) as { links?: Array<{ id?: string; url?: string }> } | null;
  const links = body?.links?.filter((item) => typeof item.id === "string" && typeof item.url === "string").slice(0, 50) ?? [];
  if (!links.length) return json({ error: "Немає посилань для перевірки." }, 400, headers);
  const results = await Promise.all(links.map(async (item) => ({ id: item.id!, ...await inspectLink(item.url!) })));
  return Response.json({ results }, { headers: { ...headers, "Cache-Control": "no-store" } });
}

const linkMonitorStateKey = "link-monitor:state";
const linkMonitorLastCompletedKey = "link-monitor:last-completed";
const linkMonitorIntervalMs = 7 * 24 * 60 * 60 * 1000;
const linkMonitorBatchSize = 25;

async function loadCatalogForWorker(env: Env) {
  const repository = env.GITHUB_REPOSITORY || `${OWNER}/${REPO}`;
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Некоректна назва GitHub-репозиторію.");
  const branch = env.GITHUB_BRANCH || BRANCH;
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [catalogFile, ref] = await Promise.all([
    github<GitHubContent>(`${base}/contents/data/skins.json?ref=${encodeURIComponent(branch)}`, env),
    github<GitHubRef>(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, env),
  ]);
  return { base, branch, records: JSON.parse(base64ToText(catalogFile.content)) as Skin[], ref };
}

async function commitCatalogChecks(records: Skin[], env: Env) {
  const { base, branch, ref } = await loadCatalogForWorker(env);
  const current = await github<GitHubCommit>(`${base}/git/commits/${ref.object.sha}`, env);
  const blob = await github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: textToBase64(`${JSON.stringify(records, null, 2)}\n`), encoding: "base64" }) });
  const tree = await github<GitHubTree>(`${base}/git/trees`, env, { method: "POST", body: JSON.stringify({ base_tree: current.tree.sha, tree: [{ path: "data/skins.json", mode: "100644", type: "blob", sha: blob.sha }] }) });
  const commit = await github<GitHubCreatedCommit>(`${base}/git/commits`, env, { method: "POST", body: JSON.stringify({ message: "Щотижнева перевірка посилань", tree: tree.sha, parents: [ref.object.sha] }) });
  await github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, env, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
}

async function runWeeklyLinkMonitor(env: Env) {
  let state = await env.BOT_SESSIONS.get<LinkMonitorState>(linkMonitorStateKey, "json");
  if (!state) {
    const lastCompleted = Number(await env.BOT_SESSIONS.get(linkMonitorLastCompletedKey) || 0);
    if (Date.now() - lastCompleted < linkMonitorIntervalMs) return;
    const { records } = await loadCatalogForWorker(env);
    state = { ids: records.filter((skin) => Boolean(skin.sourceUrl)).map((skin) => skin.id), cursor: 0, results: [], startedAt: new Date().toISOString() };
    if (!state.ids.length) { await env.BOT_SESSIONS.put(linkMonitorLastCompletedKey, String(Date.now())); return; }
  }

  const { records } = await loadCatalogForWorker(env);
  const currentById = new Map(records.map((skin) => [skin.id, skin]));
  const batchIds = state.ids.slice(state.cursor, state.cursor + linkMonitorBatchSize);
  const checkedAt = new Date().toISOString();
  const batch = await Promise.all(batchIds.map(async (id): Promise<LinkCheckResult | null> => {
    const skin = currentById.get(id);
    if (!skin?.sourceUrl) return null;
    return { id, ...await inspectLink(skin.sourceUrl), checkedAt };
  }));
  const updates = new Map(batch.filter((item): item is LinkCheckResult => Boolean(item)).map((item) => [item.id, item]));
  const resultMap = new Map(state.results.map((item) => [item.id, item]));
  updates.forEach((result, id) => resultMap.set(id, result));
  state = { ...state, cursor: state.cursor + batchIds.length, results: [...resultMap.values()] };
  if (state.cursor < state.ids.length) {
    await env.BOT_SESSIONS.put(linkMonitorStateKey, JSON.stringify(state), { expirationTtl: 60 * 60 * 12 });
    return;
  }

  const checks = new Map(state.results.map((item) => [item.id, item]));
  let changed = false;
  const nextRecords = records.map((skin) => {
    const check = checks.get(skin.id);
    if (!check) return skin;
    const nextCheck = { checkedAt: check.checkedAt, status: check.status, finalUrl: check.finalUrl, ok: check.ok };
    // Record the current check as well: the admin panel then shows that every
    // URL was actually checked this week, even when its response did not change.
    if (
      skin.linkCheck?.status !== nextCheck.status
      || skin.linkCheck?.finalUrl !== nextCheck.finalUrl
      || skin.linkCheck?.ok !== nextCheck.ok
      || skin.linkCheck?.checkedAt?.slice(0, 10) !== nextCheck.checkedAt.slice(0, 10)
    ) changed = true;
    return { ...skin, linkCheck: nextCheck };
  });
  if (changed) await commitCatalogChecks(nextRecords, env);
  await env.BOT_SESSIONS.delete(linkMonitorStateKey);
  await env.BOT_SESSIONS.put(linkMonitorLastCompletedKey, String(Date.now()));
  const broken = state.results.filter((item) => !item.ok);
  const brokenNames = broken.slice(0, 8)
    .map((item) => currentById.get(item.id)?.name)
    .filter((name): name is string => Boolean(name))
    .map(escapeHtml);
  const report = broken.length
    ? `<b>Щотижнева перевірка URL</b>\n\nПеревірено: ${state.results.length}\nПроблемних: ${broken.length}\n\n${brokenNames.map((name) => `• ${name}`).join("\n")}${broken.length > brokenNames.length ? "\n…" : ""}\n\nВідкрий «Проблемні URL» у боті або адмінці.`
    : `<b>Щотижнева перевірка URL</b>\n\n✓ Перевірено ${state.results.length} посилань. Проблем не знайдено.`;
  await sendBotMessage(Number(env.TELEGRAM_CHAT_ID), report, env, startKeyboard(Number(env.TELEGRAM_CHAT_ID), env));
}

async function publishScheduledDrafts(env: Env) {
  const repository = env.GITHUB_REPOSITORY || `${OWNER}/${REPO}`;
  const [owner, repo] = repository.split("/");
  if (!owner || !repo) throw new Error("Некоректна назва GitHub-репозиторію.");
  const branch = env.GITHUB_BRANCH || BRANCH;
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const [catalogFile, draftsFile, ref] = await Promise.all([
    github<GitHubContent>(`${base}/contents/data/skins.json?ref=${encodeURIComponent(branch)}`, env),
    github<GitHubContent>(`${base}/contents/data/drafts.json?ref=${encodeURIComponent(branch)}`, env),
    github<GitHubRef>(`${base}/git/ref/heads/${encodeURIComponent(branch)}`, env),
  ]);
  const records = JSON.parse(base64ToText(catalogFile.content)) as Skin[];
  const drafts = JSON.parse(base64ToText(draftsFile.content)) as Skin[];
  const now = Date.now();
  const ready = drafts.filter((skin) => skin.publishAt && +new Date(skin.publishAt) <= now);
  if (!ready.length) return;
  const dueIds = new Set(ready.map((skin) => skin.id));
  const nextRecords = [...ready.map((skin) => ({ ...skin, publishAt: undefined, lastVerifiedAt: skin.lastVerifiedAt || today() })), ...records];
  const nextDrafts = drafts.filter((skin) => !dueIds.has(skin.id));
  const current = await github<GitHubCommit>(`${base}/git/commits/${ref.object.sha}`, env);
  const blobs = await Promise.all([
    github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: textToBase64(`${JSON.stringify(nextRecords, null, 2)}\n`), encoding: "base64" }) }),
    github<GitHubBlob>(`${base}/git/blobs`, env, { method: "POST", body: JSON.stringify({ content: textToBase64(`${JSON.stringify(nextDrafts, null, 2)}\n`), encoding: "base64" }) }),
  ]);
  const tree = await github<GitHubTree>(`${base}/git/trees`, env, { method: "POST", body: JSON.stringify({ base_tree: current.tree.sha, tree: [{ path: "data/skins.json", mode: "100644", type: "blob", sha: blobs[0].sha }, { path: "data/drafts.json", mode: "100644", type: "blob", sha: blobs[1].sha }] }) });
  const commit = await github<GitHubCreatedCommit>(`${base}/git/commits`, env, { method: "POST", body: JSON.stringify({ message: `Опублікувати заплановані скіни: ${ready.length}`, tree: tree.sha, parents: [ref.object.sha] }) });
  await github(`${base}/git/refs/heads/${encodeURIComponent(branch)}`, env, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
}

function setupPage(message = "") {
  const notice = message ? `<p class="notice">${escapeHtml(message)}</p>` : "";
  return `<!doctype html><html lang="uk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MONOSKIN · Підключити бота</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#101010;color:#fff;font-family:Arial,sans-serif}.card{box-sizing:border-box;width:min(100% - 32px,460px);padding:32px;border:1px solid #363636;border-radius:20px;background:#171717}h1{margin:0 0 12px;font-size:28px}p{color:#b9b9b9;line-height:1.55}.notice{padding:12px 14px;border:1px solid #5a401f;border-radius:10px;color:#ffd2ac;background:#2c1d14}input,button{box-sizing:border-box;width:100%;min-height:48px;border-radius:10px;font-size:16px}input{margin:14px 0;border:1px solid #444;padding:0 13px;color:#fff;background:#0d0d0d}button{border:0;color:#fff;background:#ff6b00;font-weight:700;cursor:pointer}small{display:block;margin-top:16px;color:#858585;line-height:1.45}</style></head><body><main class="card"><h1>Підключити Telegram-бота</h1><p>Встав <b>TELEGRAM_WEBHOOK_SECRET</b> зі секретів Cloudflare. Сторінка підключить бота до цього Worker; токен Telegram тут не вводиться.</p>${notice}<form method="post"><input name="secret" type="password" autocomplete="off" placeholder="Webhook secret" required><button type="submit">Підключити бота</button></form><small>Після успішного підключення відкрий чат із ботом і надішли <b>/start</b>.</small></main></body></html>`;
}

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Frame-Options": "DENY" } });
}

async function connectTelegramWebhook(request: Request, env: Env) {
  if (request.method === "GET") return html(setupPage());
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const form = await request.formData();
  const suppliedSecret = field(form, "secret", 200);
  if (!suppliedSecret || suppliedSecret !== env.TELEGRAM_WEBHOOK_SECRET) return html(setupPage("Невірний секрет. Спробуй ще раз."), 403);
  try {
    const origin = new URL(request.url).origin;
    await telegram("setWebhook", { url: `${origin}/telegram/webhook`, secret_token: await telegramWebhookToken(env), allowed_updates: ["message", "callback_query"] }, env);
    return html(setupPage("Готово — webhook підключено. Відкрий чат із ботом і надішли /start."));
  } catch (error) {
    console.error("Telegram webhook setup failed", error);
    return html(setupPage("Telegram не підтвердив підключення. Перевір токен бота у секретах Cloudflare та спробуй ще раз."), 502);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/telegram/connect") return connectTelegramWebhook(request, env);
    if (url.pathname === "/telegram/webhook") {
      if (request.method !== "POST" || request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== await telegramWebhookToken(env)) return new Response("Not found", { status: 404 });
      try {
        await handleTelegramUpdate(await request.json() as TelegramUpdate, env);
        return new Response("ok");
      } catch (error) {
        console.error("Telegram webhook failed", error);
        return new Response("ok");
      }
    }
    if (url.pathname === "/submit") return handleSubmission(request, env);
    if (url.pathname === "/submission-status") return handleSubmissionStatus(request, env);
    if (url.pathname === "/admin/check-links") return handleLinkCheck(request, env);
    return new Response("Not found", { status: 404 });
  },
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil((async () => {
      try { await publishScheduledDrafts(env); }
      catch (error) { console.error("Scheduled publication failed", error); }
      try { await runWeeklyLinkMonitor(env); }
      catch (error) { console.error("Weekly link monitor failed", error); }
    })());
  },
} satisfies ExportedHandler<Env>;
