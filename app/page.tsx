"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import rawSkins from "@/data/skins.json";

type Method = "Безкоштовний" | "За дію" | "Донат на банку" | "Підписка Base";
type Status = "Доступний" | "Недоступний";
type DisplayMethod = "Безкоштовний" | "Донат на банку" | "Підписка Base";
type Sort = "newest" | "oldest" | "price-low" | "price-high" | "name";
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
const methods: Array<DisplayMethod | "Усі"> = ["Усі", "Безкоштовний", "Донат на банку", "Підписка Base"];
const statuses: Array<Status | "Усі"> = ["Усі", "Доступний", "Недоступний"];
const methodClass: Record<DisplayMethod, string> = {
  "Безкоштовний": "free",
  "Донат на банку": "donate",
  "Підписка Base": "base",
};

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
  return skin.method === "Донат на банку" || skin.method === "Підписка Base"
    ? skin.method
    : "Безкоштовний";
}

function compareSkins(left: Skin, right: Skin, sort: Sort) {
  if (sort === "newest") return +new Date(right.date) - +new Date(left.date);
  if (sort === "oldest") return +new Date(left.date) - +new Date(right.date);
  if (sort === "price-low") return left.minimumValue - right.minimumValue;
  if (sort === "price-high") return right.minimumValue - left.minimumValue;
  return left.name.localeCompare(right.name, "uk");
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<DisplayMethod | "Усі">("Усі");
  const [statusFilter, setStatusFilter] = useState<Status | "Усі">("Усі");
  const [sort, setSort] = useState<Sort>("newest");
  const [selected, setSelected] = useState<Skin | null>(null);
  const [copied, setCopied] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  const activeCount = skins.filter((skin) => skin.status === "Доступний").length;
  const heroSkin = useMemo(() => skins.find((skin) => skin.featured)
    ?? skins.filter((skin) => skin.status === "Доступний").sort((a, b) => +new Date(b.date) - +new Date(a.date))[0]
    ?? skins[0], []);
  const filtered = useMemo(() => skins
    .filter((skin) => {
      const searchable = `${skin.name} ${skin.method} ${skin.status} ${skin.description}`.toLocaleLowerCase("uk");
      return searchable.includes(query.toLocaleLowerCase("uk"))
        && (methodFilter === "Усі" || (skin.status === "Доступний" && displayMethod(skin) === methodFilter))
        && (statusFilter === "Усі" || skin.status === statusFilter);
    })
    .sort((left, right) => compareSkins(left, right, sort)), [methodFilter, query, sort, statusFilter]);

  const hasActiveFilters = query || methodFilter !== "Усі" || statusFilter !== "Усі" || sort !== "newest";
  const resetFilters = () => {
    setQuery("");
    setMethodFilter("Усі");
    setStatusFilter("Усі");
    setSort("newest");
  };

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

  return (
    <main>
      <section className="hero" id="top" style={{ backgroundImage: `linear-gradient(90deg, #090909 0%, rgba(9,9,9,.93) 35%, rgba(9,9,9,.14) 73%), url('${skinImage(heroSkin)}')` }}>
        <nav className="nav container" aria-label="Головна навігація">
          <a className="brand" href="#top" aria-label="MONOSKIN — на початок"><span className="brand-mark">m</span><span>mono<span className="brand-light">skin</span></span></a>
          <div className="nav-actions"><a href="#guide">Як це працює</a><a className="nav-catalog" href="#catalog">Каталог <span>↓</span></a></div>
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
        <div className="search-row">
          <label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Шукай за назвою, темою або умовою" aria-label="Пошук скінів" /></label>
          <label className="sort"><span>Сортування</span><select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="Сортування скінів"><option value="newest">Спочатку нові</option><option value="oldest">Спочатку старі</option><option value="price-low">Від дешевших</option><option value="price-high">Від дорожчих</option><option value="name">За назвою</option></select></label>
        </div>
        <div className="filter-groups">
          <div className="filter-group"><span className="filter-label">Спосіб отримання</span><div className="filters" aria-label="Фільтр за способом отримання">{methods.map((item) => <button className={methodFilter === item ? "active" : ""} key={item} onClick={() => setMethodFilter(item)}>{item}</button>)}</div></div>
          <div className="filter-group"><span className="filter-label">Доступність</span><div className="filters" aria-label="Фільтр за доступністю">{statuses.map((item) => <button className={statusFilter === item ? "active" : ""} key={item} onClick={() => setStatusFilter(item)}>{item}</button>)}</div></div>
          {hasActiveFilters && <button className="reset-button" onClick={resetFilters}>Скинути все</button>}
        </div>

        <div className="skin-grid">
          {filtered.map((skin) => <button className="skin-card" key={skin.id} onClick={() => setSelected(skin)} aria-label={`Деталі: ${skin.name}`}>
            <div className="skin-visual"><Image src={skinImage(skin)} alt="" fill sizes="(max-width: 600px) 50vw, (max-width: 1200px) 25vw, 220px" />{skin.status === "Доступний" && <span className={`method ${methodClass[displayMethod(skin)]}`}>{displayMethod(skin)}</span>}{skin.status === "Недоступний" && <span className="unavailable-mark">Недоступний</span>}<span className="open-mark" aria-hidden="true">↗</span>{(skin.isVisaOnly || skin.isAdultOnly) && <span className="card-flags">{skin.isVisaOnly && "Visa"}{skin.isAdultOnly && "18+"}</span>}</div>
            <div className="skin-info"><div><h3>{skin.name}</h3><p>{formatDate(skin.date)}</p></div><span className="price">{money(skin.minimumValue)}</span></div>
          </button>)}
        </div>
        {filtered.length === 0 && <div className="empty"><strong>Нічого не знайдено</strong><p>Спробуй інший запит або скинь фільтри.</p>{hasActiveFilters && <button className="reset-button" onClick={resetFilters}>Скинути фільтри</button>}</div>}
      </section>

      <section className="guide container" id="guide"><div><p className="eyebrow"><span /> Як це працює</p><h2>Обери, перевір<br />і додай у гаманець</h2><p>Каталог відкритий для всіх. У кожній картці є стан доступності, спосіб отримання та посилання на джерело.</p></div><div className="guide-steps"><div><b>01</b><span>Обери скін або скористайся пошуком</span></div><div><b>02</b><span>Перевір умову та обмеження в деталях</span></div><div><b>03</b><span>Відкрий посилання, якщо скін доступний</span></div></div><div className="guide-update"><strong>Є новий скін або уточнення?</strong><p>Каталог оновлюється через відкритий репозиторій — записи й зображення зберігаються окремо від дизайну.</p></div><a className="text-link" href="https://github.com/XOTT69/monoskin/blob/main/data/README.md" target="_blank" rel="noreferrer">Як додати або оновити скін <span>↗</span></a></section>
      <footer className="container footer"><span className="brand"><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></span><div><a href="https://github.com/XOTT69/monoskin" target="_blank" rel="noreferrer">GitHub</a><span>Відкритий каталог · 2026</span></div></footer>

      {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}><section className="details" role="dialog" aria-modal="true" aria-labelledby="details-title" aria-describedby="details-description" onMouseDown={(event) => event.stopPropagation()}><button className="close" ref={closeButton} onClick={() => setSelected(null)} aria-label="Закрити деталі"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button><div className="detail-art"><Image src={skinImage(selected)} alt={`Скін ${selected.name}`} fill sizes="(max-width: 850px) 100vw, 410px" priority />{selected.status === "Доступний" && <span className={`method ${methodClass[displayMethod(selected)]}`}>{displayMethod(selected)}</span>}</div><div className="detail-body"><p className="eyebrow"><span /> {selected.status}</p><h2 id="details-title">{selected.name}</h2><p className="detail-description" id="details-description">{selected.status === "Недоступний" ? "Цей скін залишено в каталозі як частину колекції." : "Перевір умову нижче перед переходом за посиланням."}</p><div className="detail-meta"><span>{money(selected.minimumValue)}</span><span>{formatDate(selected.date)}</span>{selected.isVisaOnly && <span title="Скін доступний лише для карток Visa">Лише Visa</span>}{selected.isAdultOnly && <span title="Скін доступний лише повнолітнім">18+</span>}</div><div className="condition"><span>Умова отримання</span><p>{selected.status === "Недоступний" ? "Видачу скіна завершено. Наразі отримати його неможливо." : selected.description || `Спосіб отримання: ${selected.method.toLowerCase()}.`}</p></div><div className="detail-actions">{selected.sourceUrl ? <a className="primary-button detail-button" href={selected.sourceUrl} target="_blank" rel="noreferrer">Відкрити посилання <span>↗</span></a> : <span className="disabled-button">Посилання недоступне</span>}<button className="share-button" onClick={shareSkin}>{copied ? "Посилання скопійовано" : "Поділитися"}</button></div></div></section></div>}
    </main>
  );
}
