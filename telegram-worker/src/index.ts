const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type TelegramResult = { ok: boolean; description?: string };
type TurnstileResult = { success: boolean };

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

async function verifyTurnstile(token: string, request: Request, env: Env) {
  const form = new FormData();
  form.set("secret", env.TURNSTILE_SECRET_KEY);
  form.set("response", token);
  const remoteIp = request.headers.get("CF-Connecting-IP");
  if (remoteIp) form.set("remoteip", remoteIp);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
  return response.json() as Promise<TurnstileResult>;
}

async function telegram(endpoint: string, form: FormData, env: Env) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${endpoint}`, { method: "POST", body: form });
  const result = await response.json().catch(() => ({ ok: false })) as TelegramResult;
  if (!response.ok || !result.ok) throw new Error(result.description || "Telegram delivery failed");
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
  ].join("\n").slice(0, 4000);
}

export default {
  async fetch(request, env): Promise<Response> {
    const origin = request.headers.get("Origin");
    const headers = corsHeaders(origin, env);
    if (request.method === "OPTIONS") return new Response(null, { status: origin === env.ALLOWED_ORIGIN ? 204 : 403, headers });
    if (origin !== env.ALLOWED_ORIGIN || request.method !== "POST" || new URL(request.url).pathname !== "/submit") {
      return json({ error: "Not found" }, 404, headers);
    }
    const contentLength = Number(request.headers.get("Content-Length") || 0);
    if (contentLength > MAX_PHOTO_BYTES + 80_000) return json({ error: "Фото має бути меншим за 8 МБ." }, 413, headers);
    if (!request.headers.get("Content-Type")?.includes("multipart/form-data")) return json({ error: "Некоректний формат форми." }, 415, headers);

    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return json({ error: "Не вдалося прочитати форму." }, 400, headers);
    }

    const name = field(form, "name", 90);
    const category = field(form, "category", 40);
    const description = field(form, "description", 1500);
    const sourceUrl = field(form, "sourceUrl", 500);
    const turnstileToken = field(form, "turnstileToken", 4096);
    const photo = form.get("photo");
    const validCategories = new Set(["Безкоштовно", "Доступні всім", "Донат на банку", "Підписка", "Недоступні"]);
    if (!name || !description || !validCategories.has(category)) return json({ error: "Заповни назву, категорію та опис." }, 400, headers);
    if (sourceUrl) {
      try {
        const url = new URL(sourceUrl);
        if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
      } catch {
        return json({ error: "Посилання має бути коректним URL." }, 400, headers);
      }
    }
    if (!(photo instanceof File) || !photo.size || photo.size > MAX_PHOTO_BYTES || !ALLOWED_IMAGE_TYPES.has(photo.type)) {
      return json({ error: "Додай PNG, JPG або WebP до 8 МБ." }, 400, headers);
    }
    if (!turnstileToken) return json({ error: "Підтвердь, що ти не робот." }, 400, headers);

    try {
      const verification = await verifyTurnstile(turnstileToken, request, env);
      if (!verification.success) return json({ error: "Перевірку безпеки не пройдено. Спробуй ще раз." }, 403, headers);

      const photoPayload = new FormData();
      photoPayload.set("chat_id", env.TELEGRAM_CHAT_ID);
      photoPayload.set("photo", photo, photo.name || "monoskin-upload");
      photoPayload.set("caption", `Нова пропозиція: ${name}`.slice(0, 950));
      await telegram("sendPhoto", photoPayload, env);

      const messagePayload = new FormData();
      messagePayload.set("chat_id", env.TELEGRAM_CHAT_ID);
      messagePayload.set("text", messageText({ name, category, description, sourceUrl }));
      messagePayload.set("disable_web_page_preview", "true");
      await telegram("sendMessage", messagePayload, env);
      return json({ ok: true }, 200, headers);
    } catch (error) {
      console.error("Submission delivery failed", error);
      return json({ error: "Не вдалося передати заявку. Спробуй пізніше." }, 502, headers);
    }
  },
} satisfies ExportedHandler<Env>;
