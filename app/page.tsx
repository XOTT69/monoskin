"use client";

import Image from "next/image";
import Script from "next/script";
import { useEffect, useMemo, useRef, useState } from "react";
import rawSkins from "@/data/skins.json";

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
  date: string;
  description: string;
  sourceUrl: string;
  image: string;
  isVisaOnly: boolean;
  isAdultOnly: boolean;
  featured?: boolean;
};

const skins = rawSkins as Skin[];
const categories: Category[] = ["Усі", "Безкоштовно", "Доступні всім", "Донат на банку", "Підписка", "Недоступні"];
const methodClass: Record<DisplayMethod, string> = {
  "Безкоштовно": "free",
  "Доступні всім": "everyone",
  "Донат на банку": "donate",
  "Підписка": "base",
};
const submissionApiUrl = process.env.NEXT_PUBLIC_SUBMISSION_API_URL ?? "";
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

function money(value: number) {
  return value ? `від ${value.toLocaleString("uk-UA")} ₴` : "Безкоштовно";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { month: "short", year: "numeric" }).format(new Date(value));
}

function skinImage(skin: Skin) {
  return `/monoskin/${skin.image}`;
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
  const [selected, setSelected] = useState<Skin | null>(null);
  const [copied, setCopied] = useState(false);
  const [submissionState, setSubmissionState] = useState<"idle" | "sending" | "success" | "error">("idle");
  const [submissionMessage, setSubmissionMessage] = useState("");
  const closeButton = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);
  const turnstileSlot = useRef<HTMLDivElement>(null);
  const turnstileWidgetId = useRef<string | undefined>(undefined);
  const turnstileToken = useRef("");

  const activeCount = skins.filter((skin) => skin.status === "Доступний").length;
  const heroSkin = useMemo(() => skins.find((skin) => skin.featured)
    ?? skins.filter((skin) => skin.status === "Доступний").sort((a, b) => +new Date(b.date) - +new Date(a.date))[0]
    ?? skins[0], []);
  const filtered = useMemo(() => skins
    .filter((skin) => {
      const searchable = `${skin.name} ${skin.method} ${skin.status} ${skin.description}`.toLocaleLowerCase("uk");
      return searchable.includes(query.toLocaleLowerCase("uk"))
        && (categoryFilter === "Усі" || categoryOf(skin) === categoryFilter);
    })
    .sort((left, right) => +new Date(right.date) - +new Date(left.date)), [categoryFilter, query]);

  useEffect(() => {
    if (!selected) return;
    lastFocused.current = document.activeElement as HTMLElement;
    closeButton.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
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

  const shareSkin = async () => {
    if (!selected) return;
    const url = selected.sourceUrl || window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: `${selected.name} — MONOSKIN`, text: "Скін картки mono", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // The share sheet may be dismissed by the user; this does not need an error message.
    }
  };

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
    const photo = payload.get("photo");
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

    payload.set("turnstileToken", turnstileToken.current);
    setSubmissionState("sending");
    setSubmissionMessage("");
    try {
      const response = await fetch(submissionApiUrl, { method: "POST", body: payload });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Не вдалося надіслати форму.");
      form.reset();
      turnstileToken.current = "";
      window.turnstile?.reset(turnstileWidgetId.current);
      setSubmissionState("success");
      setSubmissionMessage("Дякуємо! Заявку разом із фото вже передано на перевірку.");
    } catch (error) {
      setSubmissionState("error");
      setSubmissionMessage(error instanceof Error ? error.message : "Не вдалося надіслати форму.");
    }
  };

  return (
    <main className={`site ${theme}`}>
      <section className="hero" id="top" style={{ backgroundImage: `linear-gradient(90deg, var(--black) 0%, color-mix(in srgb, var(--black) 93%, transparent) 35%, color-mix(in srgb, var(--black) 14%, transparent) 73%), url('${skinImage(heroSkin)}')` }}>
        <nav className="nav container" aria-label="Головна навігація">
          <a className="brand" href="#top" aria-label="MONOSKIN — на початок"><span className="brand-mark">m</span><span>mono<span className="brand-light">skin</span></span></a>
          <div className="nav-actions"><button className="theme-toggle" onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")} aria-label={theme === "dark" ? "Увімкнути світлу тему" : "Увімкнути темну тему"}>{theme === "dark" ? "☼ Світла" : "◐ Темна"}</button><a className="nav-suggest" href="#suggest">Запропонувати скін</a><a className="nav-catalog" href="#catalog">Каталог <span>↓</span></a></div>
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
        <div className="catalog-controls"><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Шукай за назвою, темою або умовою" aria-label="Пошук скінів" /></label><div className="filters category-filters" aria-label="Категорії каталогу">{categories.map((item) => <button className={categoryFilter === item ? "active" : ""} key={item} onClick={() => setCategoryFilter(item)}>{item}</button>)}</div></div>

        <div className="skin-grid">
          {filtered.map((skin) => <button className="skin-card" key={skin.id} onClick={() => setSelected(skin)} aria-label={`Деталі: ${skin.name}`}>
            <div className="skin-visual"><Image src={skinImage(skin)} alt="" fill sizes="(max-width: 600px) 50vw, (max-width: 1200px) 25vw, 220px" />{skin.status === "Доступний" && <span className={`method ${methodClass[displayMethod(skin)]}`}>{displayMethod(skin)}</span>}{skin.status === "Недоступний" && <span className="unavailable-mark">Недоступний</span>}<span className="open-mark" aria-hidden="true">↗</span>{(skin.isVisaOnly || skin.isAdultOnly) && <span className="card-flags">{skin.isVisaOnly && "Visa"}{skin.isAdultOnly && "18+"}</span>}</div>
            <div className="skin-info"><div><h3>{skin.name}</h3><p>{formatDate(skin.date)}</p></div><span className="price">{money(skin.minimumValue)}</span></div>
          </button>)}
        </div>
        {filtered.length === 0 && <div className="empty"><strong>Нічого не знайдено</strong><p>Спробуй інший запит або категорію.</p></div>}
      </section>

      <section className="suggestion container" id="suggest" aria-labelledby="suggest-title">
        <div className="suggestion-copy">
          <p className="eyebrow"><span /> Доповнити каталог</p>
          <h2 id="suggest-title">Знаєш про новий скін?</h2>
          <p>Надішли назву, коротку умову та зображення. Ми перевіримо інформацію й додамо скін до каталогу.</p>
          <small>Не додавай персональні дані, банківські реквізити чи приватні посилання.</small>
        </div>
        <form className="suggestion-form" onSubmit={submitSuggestion}>
          <label>Назва скіна<input name="name" required maxLength={90} placeholder="Наприклад, mono котик" /></label>
          <label>Категорія<select name="category" required defaultValue=""><option value="" disabled>Обери категорію</option><option>Безкоштовно</option><option>Доступні всім</option><option>Донат на банку</option><option>Підписка</option><option>Недоступні</option></select></label>
          <label className="form-full">Посилання на умову або джерело <span>необов’язково</span><input name="sourceUrl" type="url" maxLength={500} placeholder="https://…" /></label>
          <label className="form-full">Що відомо про отримання<textarea name="description" required maxLength={1500} rows={4} placeholder="Коли та як можна було або можна отримати цей скін" /></label>
          <label className="form-full file-field"><span>Зображення скіна</span><input name="photo" type="file" accept="image/png,image/jpeg,image/webp" required /><strong>Обрати фото</strong><small>PNG, JPG або WebP · до 8 МБ</small></label>
          <div className="turnstile-slot form-full" ref={turnstileSlot} />
          {turnstileSiteKey && <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" strategy="afterInteractive" onLoad={renderTurnstile} />}
          {submissionState !== "idle" && <p className={`submission-message ${submissionState}`} role="status">{submissionMessage}</p>}
          <button className="primary-button form-submit" type="submit" disabled={submissionState === "sending"}>{submissionState === "sending" ? "Надсилаємо…" : "Надіслати на перевірку"}<span>→</span></button>
        </form>
      </section>

      <footer className="container footer"><span className="brand"><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></span><span>Відкритий каталог · 2026</span><a href="#suggest">Запропонувати скін</a></footer>

      {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}><section className="details" role="dialog" aria-modal="true" aria-labelledby="details-title" aria-describedby="details-description" onMouseDown={(event) => event.stopPropagation()}><button className="close" ref={closeButton} onClick={() => setSelected(null)} aria-label="Закрити деталі"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button><div className="detail-art"><Image src={skinImage(selected)} alt={`Скін ${selected.name}`} fill sizes="(max-width: 850px) 100vw, 410px" priority />{selected.status === "Доступний" && <span className={`method ${methodClass[displayMethod(selected)]}`}>{displayMethod(selected)}</span>}</div><div className="detail-body"><p className="eyebrow"><span /> {selected.status}</p><h2 id="details-title">{selected.name}</h2><p className="detail-description" id="details-description">{selected.status === "Недоступний" ? "Цей скін залишено в каталозі як частину колекції." : selected.method === "Доступні всім" ? "Банк видає цей скін автоматично — посилання не потрібне." : "Перевір умову нижче перед переходом за посиланням."}</p><div className="detail-meta"><span>{money(selected.minimumValue)}</span><span>{formatDate(selected.date)}</span>{selected.isVisaOnly && <span title="Скін доступний лише для карток Visa">Лише Visa</span>}{selected.isAdultOnly && <span title="Скін доступний лише повнолітнім">18+</span>}</div><div className="condition"><span>Умова отримання</span><p>{selected.status === "Недоступний" ? "Видачу скіна завершено. Наразі отримати його неможливо." : selected.description || `Спосіб отримання: ${selected.method.toLowerCase()}.`}</p></div><div className="detail-actions">{selected.method === "Доступні всім" ? <span className="disabled-button">Скін видається автоматично</span> : selected.sourceUrl ? <a className="primary-button detail-button" href={selected.sourceUrl} target="_blank" rel="noreferrer">Відкрити посилання <span>↗</span></a> : <span className="disabled-button">Посилання недоступне</span>}<button className="share-button" onClick={shareSkin}>{copied ? "Посилання скопійовано" : "Поділитися"}</button></div></div></section></div>}
    </main>
  );
}
