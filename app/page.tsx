"use client";

import Image from "next/image";
import Script from "next/script";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useMemo, useRef, useState } from "react";
import rawSkins from "@/data/skins.json";
import { sitePath } from "@/lib/site-path";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      reset: (widgetId?: string) => void;
    };
  }
}

type Method = "Безкоштовний" | "За дію" | "Доступні всім" | "Донат на банку" | "Підписка Base";
type Status = "Доступний" | "Недоступний";
type DisplayMethod = "Безкоштовно" | "Доступні всім" | "Донат на банку" | "Підписка";
type Category = "Усі" | DisplayMethod | "Недоступні";
type Theme = "dark" | "light";
type Skin = {
  id: string;
  name: string;
  method: Method;
  status: Status;
  minimumValue: number;
  addedAt: string;
  description: string;
  sourceUrl: string;
  image: string;
  images?: string[];
  isVisaOnly: boolean;
  isAdultOnly: boolean;
  featured?: boolean;
  lastVerifiedAt?: string;
  unavailableReason?: string;
};
type Sort = "newest" | "oldest" | "name" | "price";
type DonationRange = "all" | "free" | "under-100" | "100-499" | "500-plus";

const skins = rawSkins as Skin[];
const categories: Category[] = ["Усі", "Безкоштовно", "Доступні всім", "Донат на банку", "Підписка", "Недоступні"];
const submissionApiUrl = process.env.NEXT_PUBLIC_SUBMISSION_API_URL ?? "";
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
const visualHashWidth = 20;
const visualHashHeight = 12;
const themePreferenceKey = "monoskin-theme-preference";
type ImageCrop = { x: number; y: number; width: number; height: number };
const photoSearchCrops = [
  { x: 0, y: 0, width: 1, height: 1 },
  { x: .02, y: .03, width: .96, height: .94 },
  { x: .03, y: .04, width: .94, height: .91 },
] as const satisfies readonly ImageCrop[];

function money(value: number) {
  return value ? `від ${value.toLocaleString("uk-UA")} ₴` : "Безкоштовно";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { month: "short", year: "numeric" }).format(new Date(value));
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} КБ`;
  return `${(bytes / (1024 * 1024)).toLocaleString("uk-UA", { maximumFractionDigits: 1 })} МБ`;
}

function imageFromClipboard(items: DataTransferItemList) {
  const item = Array.from(items).find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  return item?.getAsFile() ?? null;
}

async function imageFromSystemClipboard() {
  if (!navigator.clipboard?.read) return null;
  try {
    for (const clipboardItem of await navigator.clipboard.read()) {
      const type = clipboardItem.types.find((entry) => entry.startsWith("image/"));
      if (!type) continue;
      const blob = await clipboardItem.getType(type);
      return new File([blob], `вставлене-зображення.${type.split("/")[1] || "png"}`, { type });
    }
  } catch {
    // Some browsers deny clipboard.read(); the standard paste payload still works there.
  }
  return null;
}

async function imageFingerprint(source: File | string, crop: ImageCrop = photoSearchCrops[0]) {
  const objectUrl = source instanceof File ? URL.createObjectURL(source) : source;
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new window.Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("Не вдалося прочитати зображення."));
      element.src = objectUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = visualHashWidth;
    canvas.height = visualHashHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Браузер не підтримує пошук за фото.");
    context.drawImage(
      image,
      image.width * crop.x,
      image.height * crop.y,
      image.width * crop.width,
      image.height * crop.height,
      0,
      0,
      visualHashWidth,
      visualHashHeight,
    );
    const pixels = context.getImageData(0, 0, visualHashWidth, visualHashHeight).data;
    const luminance = Array.from({ length: visualHashWidth * visualHashHeight }, (_, index) => {
      const offset = index * 4;
      return pixels[offset] * .2126 + pixels[offset + 1] * .7152 + pixels[offset + 2] * .0722;
    });
    const average = luminance.reduce((sum, value) => sum + value, 0) / luminance.length;
    return luminance.map((value) => value > average ? 1 : 0);
  } finally {
    if (source instanceof File) URL.revokeObjectURL(objectUrl);
  }
}

function fingerprintSimilarity(left: number[], right: number[]) {
  const equal = left.reduce((sum, value, index) => sum + Number(value === right[index]), 0);
  return equal / left.length;
}

function skinImage(skin: Skin) {
  return sitePath(skin.image);
}

function skinImages(skin: Skin) {
  return skin.images?.length ? skin.images : [skin.image];
}

function isSecureUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function displayMethod(skin: Skin): DisplayMethod {
  if (skin.method === "Донат на банку") return "Донат на банку";
  if (skin.method === "Підписка Base") return "Підписка";
  if (skin.method === "Доступні всім") return "Доступні всім";
  return "Безкоштовно";
}

function categoryOf(skin: Skin): Exclude<Category, "Усі"> {
  return skin.status === "Недоступний" ? "Недоступні" : displayMethod(skin);
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [theme, setTheme] = useState<Theme>("dark");
  const [categoryFilter, setCategoryFilter] = useState<Category>("Усі");
  const [donationRange, setDonationRange] = useState<DonationRange>("all");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<Skin | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [showQr, setShowQr] = useState(false);
  const [submissionState, setSubmissionState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const [suggestionPhoto, setSuggestionPhoto] = useState<File | null>(null);
  const [visualSearch, setVisualSearch] = useState<{ state: "idle" | "searching" | "found" | "missing" | "error"; skin?: Skin; similarity?: number; matches?: Array<{ skin: Skin; similarity: number }> }>({ state: "idle" });
  const closeButton = useRef<HTMLButtonElement>(null);
  const qrCloseButton = useRef<HTMLButtonElement>(null);
  const showQrRef = useRef(false);
  const lastFocused = useRef<HTMLElement | null>(null);
  const turnstileSlot = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | undefined>(undefined);
  const turnstileToken = useRef("");
  const visualHashCache = useRef(new Map<string, Promise<number[][]>>());

  const activeCount = skins.filter((skin) => skin.status === "Доступний").length;
  const heroSkin = useMemo(() => skins.find((skin) => skin.featured)
    ?? skins.filter((skin) => skin.status === "Доступний").sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt))[0]
    ?? skins[0], []);
  const filtered = useMemo(() => skins
    .filter((skin) => {
      const searchable = `${skin.name} ${skin.method} ${skin.status} ${skin.description}`.toLocaleLowerCase("uk");
      return searchable.includes(query.toLocaleLowerCase("uk"))
        && (categoryFilter === "Усі" || categoryOf(skin) === categoryFilter)
        && (donationRange === "all" || donationRange === "free" && skin.minimumValue === 0 || donationRange === "under-100" && skin.minimumValue > 0 && skin.minimumValue < 100 || donationRange === "100-499" && skin.minimumValue >= 100 && skin.minimumValue < 500 || donationRange === "500-plus" && skin.minimumValue >= 500);
    })
    .sort((left, right) => {
      if (sort === "name") return left.name.localeCompare(right.name, "uk");
      if (sort === "price") return left.minimumValue - right.minimumValue;
      return sort === "oldest" ? +new Date(left.addedAt) - +new Date(right.addedAt) : +new Date(right.addedAt) - +new Date(left.addedAt);
    }), [categoryFilter, donationRange, query, sort]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(themePreferenceKey) as Theme | null;
    const preferredTheme: Theme = "dark";
    const skinId = new URLSearchParams(window.location.search).get("skin");
    const skin = skinId ? skins.find((item) => item.id === skinId) : null;
    const frame = window.requestAnimationFrame(() => {
      setTheme(storedTheme === "light" || storedTheme === "dark" ? storedTheme : preferredTheme);
      if (skin) { setSelected(skin); setSelectedImageIndex(0); }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(themePreferenceKey, theme);
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selected) url.searchParams.set("skin", selected.id);
    else url.searchParams.delete("skin");
    window.history.replaceState(null, "", url);
  }, [selected]);

  useEffect(() => {
    if (!selected && !showQr) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [selected, showQr]);

  useEffect(() => {
    showQrRef.current = showQr;
  }, [showQr]);

  useEffect(() => {
    if (!selected) return;
    lastFocused.current = document.activeElement as HTMLElement;
    closeButton.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (showQrRef.current) setShowQr(false);
        else setSelected(null);
      }
      if (showQrRef.current) return;
      if (event.key !== "Tab") return;
      const dialog = closeButton.current?.closest<HTMLElement>("[role='dialog']");
      const focusable = dialog?.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), [tabindex]:not([tabindex='-1'])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      lastFocused.current?.focus();
    };
  }, [selected]);

  useEffect(() => {
    if (!showQr) return;
    qrCloseButton.current?.focus();
    const handleQrKeys = (event: KeyboardEvent) => {
      if (event.key === "Escape") setShowQr(false);
      if (event.key !== "Tab") return;
      const dialog = qrCloseButton.current?.closest<HTMLElement>("[role='dialog']");
      const focusable = dialog?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])");
      if (!focusable?.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handleQrKeys);
    return () => window.removeEventListener("keydown", handleQrKeys);
  }, [showQr]);

  const renderTurnstile = () => {
    if (!turnstileSiteKey || !turnstileSlot.current || !window.turnstile || turnstileWidgetId.current) return;
    turnstileWidgetId.current = window.turnstile.render(turnstileSlot.current, {
      sitekey: turnstileSiteKey,
      theme: "auto",
      callback: (token: unknown) => { turnstileToken.current = typeof token === "string" ? token : ""; },
      "expired-callback": () => { turnstileToken.current = ""; },
      "error-callback": () => { turnstileToken.current = ""; },
    });
  };

  const submitSuggestion = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!submissionApiUrl || !turnstileSiteKey) {
      setSubmissionState("error");
      setSubmissionMessage("Форму ще налаштовують. Спробуй трохи пізніше.");
      return;
    }
    if (!turnstileToken.current) {
      setSubmissionState("error");
      setSubmissionMessage("Підтвердь, будь ласка, що ти не робот.");
      return;
    }

    const form = event.currentTarget;
    const payload = new FormData(form);
    const photo = suggestionPhoto ?? payload.get("photo");
    if (!(photo instanceof File) || !photo.size) {
      setSubmissionState("error");
      setSubmissionMessage("Додай зображення скіна.");
      return;
    }
    if (photo.size > 8 * 1024 * 1024) {
      setSubmissionState("error");
      setSubmissionMessage("Фото має бути меншим за 8 МБ.");
      return;
    }

    payload.set("photo", photo);
    payload.set("turnstileToken", turnstileToken.current);
    setSubmissionState("sending");
    setSubmissionMessage("");
    try {
      const response = await fetch(submissionApiUrl, { method: "POST", body: payload });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося надіслати форму.");
      form.reset();
      setSuggestionPhoto(null);
      turnstileToken.current = "";
      window.turnstile?.reset(turnstileWidgetId.current);
      setSubmissionState("success");
      setSubmissionMessage("Дякуємо! Заявку разом із фото вже передано на перевірку.");
    } catch (error) {
      setSubmissionState("error");
      setSubmissionMessage(error instanceof Error ? error.message : "Не вдалося надіслати форму.");
    }
  };

  const findSkinByImage = async (file: File | null) => {
    if (!file) return;
    setVisualSearch({ state: "searching" });
    try {
      const queryHashes = await Promise.all(photoSearchCrops.map((crop) => imageFingerprint(file, crop)));
      const candidates = await Promise.all(skins.map(async (skin) => {
        const existing = visualHashCache.current.get(skin.id) ?? Promise.all(skinImages(skin).map((image) => imageFingerprint(sitePath(image))));
        visualHashCache.current.set(skin.id, existing);
        const imageHashes = await existing;
        return { skin, similarity: Math.max(...queryHashes.flatMap((queryHash) => imageHashes.map((imageHash) => fingerprintSimilarity(queryHash, imageHash)))) };
      }));
      const matches = candidates.sort((left, right) => right.similarity - left.similarity).slice(0, 3);
      const closest = matches[0];
      setVisualSearch(closest.similarity >= .72 ? { state: "found", ...closest, matches } : { state: "missing", similarity: closest.similarity, matches });
    } catch {
      setVisualSearch({ state: "error" });
    }
  };

  const openSkin = (skin: Skin) => {
    setSelected(skin);
    setSelectedImageIndex(0);
    setShowQr(false);
  };

  const copySkinLink = async (skin: Skin) => {
    const url = `${window.location.origin}${window.location.pathname}?skin=${encodeURIComponent(skin.id)}`;
    try { await navigator.clipboard.writeText(url); }
    catch { window.prompt("Скопіюй посилання:", url); }
  };

  return (
    <main className={`site ${theme}`}>
      <section className="hero" id="top" style={{ backgroundImage: `linear-gradient(90deg, var(--black) 0%, color-mix(in srgb, var(--black) 93%, transparent) 35%, color-mix(in srgb, var(--black) 14%, transparent) 73%), url('${skinImage(heroSkin)}')` }}>
        <nav className="nav container" aria-label="Головна навігація">
          <a className="brand" href="#top" aria-label="MONOSKIN — на початок"><span className="brand-mark brand-avatar"><Image src={sitePath("monoskin-avatar.png")} alt="" fill sizes="27px" priority /></span><span>mono<span className="brand-light">skin</span></span></a>
          <div className="nav-actions"><button type="button" className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему"}>{theme === "dark" ? "☼ Світла" : "◐ Темна"}</button><a className="nav-suggest" href="#suggest">Запропонувати скін</a><a className="nav-catalog" href="#catalog">Каталог <span>↓</span></a></div>
        </nav>
        <div className="hero-content container">
          <p className="eyebrow"><span /> Відкритий каталог скінів</p>
          <h1>Твоя картка.<br /><em>Твій характер.</em></h1>
          <p className="hero-copy">Знаходь актуальні скіни карток mono, перевіряй умови та переходь до отримання — усе в одному каталозі.</p>
          <a className="primary-button" href="#catalog">Переглянути каталог <span>→</span></a>
          <div className="hero-stats"><div><strong>{skins.length}</strong><span>скінів у каталозі</span></div><div><strong>{activeCount}</strong><span>доступні зараз</span></div><div><strong>4</strong><span>способи отримання</span></div></div>
        </div>
        <div className="hero-fade" />
      </section>

      <section className="catalog container" id="catalog">
        <div className="section-heading"><div><p className="eyebrow"><span /> Колекція</p><h2>Знайди свій скін</h2></div><p className="catalog-note">{filtered.length} з {skins.length} скінів</p></div>
        <div className="catalog-controls">
          <div className="search-row">
            <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Шукай за назвою, темою або умовою" aria-label="Пошук скінів" /></label>
            <label className="image-search" tabIndex={0} onPaste={(event) => { const file = imageFromClipboard(event.clipboardData.items); if (file) { event.preventDefault(); void findSkinByImage(file); } }}><input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void findSkinByImage(event.target.files?.[0] ?? null)} /><span aria-hidden="true">▧</span>{visualSearch.state === "searching" ? "Шукаємо…" : "Знайти за фото"}</label>
            <label className="sort"><span>Сортування</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)}><option value="newest">Нещодавно додані</option><option value="oldest">Додані раніше</option><option value="name">За назвою</option><option value="price">За сумою</option></select></label>
          </div>
          <div className="filters category-filters" aria-label="Категорії каталогу">{categories.map((item) => <button type="button" className={categoryFilter === item ? "active" : ""} key={item} onClick={() => setCategoryFilter(item)}>{item}</button>)}</div>
          <div className="filters amount-filters" aria-label="Сума отримання"><span>Сума:</span>{([['all', 'Усі'], ['free', 'Безкоштовно'], ['under-100', 'до 100 ₴'], ['100-499', '100–499 ₴'], ['500-plus', 'від 500 ₴']] as const).map(([value, label]) => <button type="button" className={donationRange === value ? "active" : ""} key={value} onClick={() => setDonationRange(value)}>{label}</button>)}</div>
          {visualSearch.state !== "idle" && <div className={`image-search-result ${visualSearch.state}`} role="status">
            {visualSearch.state === "searching" && "Порівнюємо зображення з каталогом…"}
            {visualSearch.state === "found" && <><span>Найближчий збіг: <b>{visualSearch.skin?.name}</b></span><button type="button" onClick={() => { if (visualSearch.skin) openSkin(visualSearch.skin); }}>Відкрити скін →</button></>}
            {visualSearch.state === "missing" && "Точного збігу не знайдено. Спробуй обрізати скрін до самої картки."}
            {visualSearch.state === "error" && "Не вдалося прочитати зображення. Спробуй PNG, JPG або WebP."}
            {visualSearch.matches && visualSearch.state !== "searching" && <div className="visual-matches">{visualSearch.matches.map(({ skin, similarity }) => <button type="button" key={skin.id} onClick={() => openSkin(skin)}>{skin.name} <small>{Math.round(similarity * 100)}%</small></button>)}</div>}
          </div>}
        </div>

        <div className="skin-grid">
          {filtered.map((skin) => <button className="skin-card" key={skin.id} onClick={() => openSkin(skin)} aria-label={`Деталі: ${skin.name}`}>
            <div className="skin-visual"><Image src={skinImage(skin)} alt="" fill sizes="(max-width: 600px) 50vw, (max-width: 1200px) 25vw, 220px" />{skin.status === "Недоступний" && <span className="unavailable-mark">Недоступний</span>}<span className="open-mark" aria-hidden="true">↗</span>{(skin.isVisaOnly || skin.isAdultOnly) && <span className="card-flags">{skin.isVisaOnly && "Visa"}{skin.isAdultOnly && "18+"}</span>}</div>
            <div className="skin-info"><div><h3>{skin.name}</h3><p>{categoryOf(skin)}</p></div><span className="price">{money(skin.minimumValue)}</span></div>
          </button>)}
        </div>
        {filtered.length === 0 && <div className="empty"><strong>Нічого не знайдено</strong><p>Спробуй інший запит або категорію.</p></div>}
      </section>

      <section className="suggestion container" id="suggest" aria-labelledby="suggest-title">
        <div className="suggestion-copy">
          <div className="suggestion-avatar" aria-hidden="true"><Image src={sitePath("monoskin-avatar.png")} alt="" fill sizes="92px" /></div>
          <p className="eyebrow"><span /> Доповнити каталог</p>
          <h2 id="suggest-title">Знаєш про новий скін?</h2>
          <p>Надішли назву, коротку умову та зображення. Ми перевіримо інформацію й додамо скін до каталогу.</p>
          <small>Не додавай персональні дані, банківські реквізити чи приватні посилання. Фото й текст заявки надсилаються в Telegram для модерації.</small>
        </div>
        <form className="suggestion-form" onSubmit={submitSuggestion} onPaste={async (event) => { const directImage = imageFromClipboard(event.clipboardData.items); if (directImage) { event.preventDefault(); setSuggestionPhoto(directImage); return; } const systemImage = await imageFromSystemClipboard(); if (systemImage) setSuggestionPhoto(systemImage); }}>
          <label>Назва скіна<input name="name" required maxLength={90} placeholder="Наприклад, mono котик" /></label>
          <label>Категорія<select name="category" required defaultValue=""><option value="" disabled>Обери категорію</option><option>Безкоштовно</option><option>Доступні всім</option><option>Донат на банку</option><option>Підписка</option><option>Недоступні</option></select></label>
          <label className="form-full">Посилання на умову або джерело <span>необов’язково</span><input name="sourceUrl" type="url" maxLength={500} placeholder="https://…" /></label>
          <label className="form-full">Що відомо про отримання<textarea name="description" required maxLength={800} rows={4} placeholder="Коли та як можна було або можна отримати цей скін" /></label>
          <label className="form-full file-field" tabIndex={0}><span>Зображення скіна</span><input name="photo" type="file" accept="image/png,image/jpeg,image/webp" required onChange={(event) => setSuggestionPhoto(event.target.files?.[0] ?? null)} />{suggestionPhoto ? <span className="file-selected" role="status"><b aria-hidden="true">✓</b><i>{suggestionPhoto.name || "Вставлене зображення"}</i><small>{formatFileSize(suggestionPhoto.size)}</small></span> : <><strong>Обрати фото</strong><small>PNG, JPG або WebP · до 8 МБ · або встав Ctrl/Cmd + V</small></>}</label>
          <div className="turnstile-slot form-full" ref={turnstileSlot} />
          {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderTurnstile} />}
          {submissionState !== "idle" && <p className={`submission-message ${submissionState}`} role="status">{submissionMessage}</p>}
          <button className="primary-button form-submit" type="submit" disabled={submissionState === "sending"}>{submissionState === "sending" ? "Надсилаємо…" : "Надіслати на перевірку"}<span>→</span></button>
        </form>
      </section>

      <footer className="container footer"><span className="brand"><span className="brand-mark brand-avatar"><Image src={sitePath("monoskin-avatar.png")} alt="" fill sizes="23px" /></span> mono<span className="brand-light">skin</span></span><span>Відкритий каталог · 2026</span><a href="#suggest">Запропонувати скін</a></footer>

      {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}>
        <section className="details" role="dialog" aria-modal="true" aria-labelledby="details-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="close" ref={closeButton} onClick={() => setSelected(null)} aria-label="Закрити деталі"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
          <div className="detail-body">
            <p className="eyebrow"><span /> {selected.status}</p>
            <h2 id="details-title">{selected.name}</h2>
            <div className="detail-meta"><span>{displayMethod(selected)}</span><span>{money(selected.minimumValue)}</span>{selected.lastVerifiedAt && <span title="Дата останньої перевірки умови">Перевірено {formatDate(selected.lastVerifiedAt)}</span>}{selected.isVisaOnly && <span title="Скін доступний лише для карток Visa">Лише Visa</span>}{selected.isAdultOnly && <span title="Скін доступний лише повнолітнім">18+</span>}</div>
            <div className="condition"><span>Умова отримання</span><p>{selected.status === "Недоступний" ? selected.unavailableReason ? `Видачу скіна завершено: ${selected.unavailableReason}` : "Видачу скіна завершено. Наразі отримати його неможливо." : selected.description || `Спосіб отримання: ${selected.method.toLowerCase()}.`}</p></div>
            <div className="detail-actions">{selected.status !== "Доступний" ? <span className="disabled-button">Скін більше недоступний</span> : selected.method === "Доступні всім" ? <span className="disabled-button">Скін видається автоматично</span> : isSecureUrl(selected.sourceUrl) ? <><button className="primary-button detail-button" type="button" onClick={() => setShowQr(true)}>Отримати скін <span>→</span></button><a className="direct-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">Перейти за посиланням ↗</a></> : <span className="disabled-button">Посилання недоступне</span>}<button className="direct-link copy-link" type="button" onClick={() => void copySkinLink(selected)}>Скопіювати посилання</button></div>
          </div>
          <div className="detail-art"><Image src={sitePath(skinImages(selected)[selectedImageIndex] ?? selected.image)} alt={`Скін ${selected.name}`} fill sizes="(max-width: 850px) 100vw, 470px" priority />{skinImages(selected).length > 1 && <div className="detail-gallery" aria-label="Варіанти скіна">{skinImages(selected).map((image, index) => <button type="button" key={image} className={selectedImageIndex === index ? "active" : ""} aria-label={`Показати варіант ${index + 1}`} onClick={() => setSelectedImageIndex(index)}><Image src={sitePath(image)} alt="" fill sizes="72px" /></button>)}</div>}</div>
        </section>
      </div>}
      {showQr && selected?.status === "Доступний" && selected.sourceUrl && <div className="qr-overlay" role="presentation" onMouseDown={() => setShowQr(false)}>
        <section className="qr-dialog" role="dialog" aria-modal="true" aria-labelledby="qr-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="qr-close" ref={qrCloseButton} onClick={() => setShowQr(false)} aria-label="Закрити QR-код"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
          <p className="eyebrow"><span /> Отримання</p>
          <h2 id="qr-title">Відскануйте QR-код</h2>
          <p>Або відкрийте посилання на цьому пристрої.</p>
          <div className="qr-code"><QRCodeSVG value={selected.sourceUrl} level="M" size={224} marginSize={2} bgColor="#ffffff" fgColor="#111111" title={`QR-код для скіна ${selected.name}`} /></div>
          <a className="primary-button qr-link" href={selected.sourceUrl} target="_blank" rel="noreferrer">Перейти за посиланням <span>↗</span></a>
        </section>
      </div>}
    </main>
  );
}
