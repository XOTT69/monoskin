"use client";

import { useEffect, useMemo, useState } from "react";
import rawSkins from "@/data/skins.json";

type Method = "Безкоштовний" | "За дію" | "Донат на банку" | "Підписка Base";
type Status = "Доступний" | "Недоступний";
type Filter = "Усі" | Method | Status;
type Skin = { id: string; name: string; method: Method; status: Status; minimumValue: number; date: string; description: string; sourceUrl: string; image: string; isVisaOnly: boolean; isAdultOnly: boolean };

const skins = rawSkins as Skin[];
const filters: Filter[] = ["Усі", "Безкоштовний", "За дію", "Донат на банку", "Підписка Base", "Доступний", "Недоступний"];
const methodClass: Record<Method, string> = { "Безкоштовний": "free", "За дію": "action", "Донат на банку": "donate", "Підписка Base": "base" };

function money(value: number) { return value ? `від ${value.toLocaleString("uk-UA")} ₴` : "Безкоштовно"; }
function date(value: string) { return new Intl.DateTimeFormat("uk-UA", { month: "short", year: "numeric" }).format(new Date(value)); }
function imageStyle(skin: Skin) { return { backgroundImage: `url('/monoskin/${skin.image}')` }; }

export default function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("Усі");
  const [selected, setSelected] = useState<Skin | null>(null);
  const activeCount = skins.filter((skin) => skin.status === "Доступний").length;

  const filtered = useMemo(() => skins.filter((skin) => {
    const matchesSearch = `${skin.name} ${skin.method} ${skin.status}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "Усі" || skin.method === filter || skin.status === filter;
    return matchesSearch && matchesFilter;
  }), [filter, query]);

  useEffect(() => { const close = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, []);

  return <main>
    <section className="hero" id="top">
      <nav className="nav container" aria-label="Головна навігація">
        <a className="brand" href="#top" aria-label="MONOSKIN — на початок"><span className="brand-mark">m</span><span>mono<span className="brand-light">skin</span></span></a>
        <div className="nav-actions"><a href="#guide">Як це працює</a><a className="nav-catalog" href="#catalog">Каталог <span>↓</span></a></div>
      </nav>
      <div className="hero-content container"><p className="eyebrow"><span /> Повний каталог скінів</p><h1>Твоя картка.<br /><em>Твій характер.</em></h1><p className="hero-copy">Усі відомі скіни карток mono в одному місці: безкоштовні, за дію, за донат, Base та недоступні.</p><a className="primary-button" href="#catalog">Переглянути каталог <span>→</span></a><div className="hero-stats"><div><strong>{skins.length}</strong><span>скінів у каталозі</span></div><div><strong>{activeCount}</strong><span>доступні зараз</span></div><div><strong>4</strong><span>способи отримання</span></div></div></div>
      <div className="hero-fade" />
    </section>

    <section className="catalog container" id="catalog">
      <div className="section-heading"><div><p className="eyebrow"><span /> Колекція</p><h2>Знайди свій скін</h2></div><p className="catalog-note">{filtered.length} з {skins.length} скінів</p></div>
      <div className="controls"><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за назвою або умовою" aria-label="Пошук скінів" /></label><div className="filters" aria-label="Фільтри каталогу">{filters.map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
      <div className="skin-grid">{filtered.map((skin) => <button className="skin-card" key={skin.id} onClick={() => setSelected(skin)} aria-label={`Деталі: ${skin.name}`}><div className="skin-image" style={imageStyle(skin)}><span className={`method ${methodClass[skin.method]}`}>{skin.method}</span>{skin.status === "Недоступний" && <span className="unavailable-mark">Недоступний</span>}<span className="open-mark" aria-hidden="true">↗</span></div><div className="skin-info"><div><h3>{skin.name}</h3><p>{date(skin.date)}</p></div><span className="price">{money(skin.minimumValue)}</span></div></button>)}</div>
      {filtered.length === 0 && <div className="empty"><strong>Нічого не знайдено</strong><p>Спробуй інший запит або фільтр.</p></div>}
    </section>

    <section className="guide container" id="guide"><div><p className="eyebrow"><span /> Як це працює</p><h2>Обери, перевір<br />і додай у гаманець</h2><p>Каталог відкритий для всіх. Знайди скін, переглянь деталі та умову отримання, а потім відкрий офіційне посилання зі сторінки скіна.</p></div><ol><li><b>01</b><span>Обери скін або скористайся пошуком і фільтрами</span></li><li><b>02</b><span>Відкрий картку та перевір умову отримання</span></li><li><b>03</b><span>Перейди за посиланням, якщо скін доступний</span></li></ol><div className="guide-update"><strong>Потрібно оновити каталог?</strong><p>Зображення та записи зберігаються у репозиторії окремо від дизайну — новий скін додається одним записом.</p></div><a className="text-link" href="https://github.com/XOTT69/monoskin/blob/main/data/README.md" target="_blank" rel="noreferrer">Як додати або оновити скін <span>↗</span></a></section>
    <footer className="container footer"><span className="brand"><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></span><span>Усі скіни карток mono · 2026</span></footer>

    {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}><section className="details" role="dialog" aria-modal="true" aria-labelledby="details-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelected(null)} aria-label="Закрити деталі">×</button><div className="detail-art" style={imageStyle(selected)}><span className={`method ${methodClass[selected.method]}`}>{selected.method}</span></div><div className="detail-body"><p className="eyebrow"><span /> {selected.status}</p><h2 id="details-title">{selected.name}</h2><p className="detail-description">{selected.status === "Недоступний" ? "Цей скін залишено в каталозі як частину колекції." : "Перевір умову нижче перед переходом за посиланням."}</p><div className="detail-meta"><span>{money(selected.minimumValue)}</span><span>{date(selected.date)}</span>{selected.isVisaOnly && <span>Лише Visa</span>}{selected.isAdultOnly && <span>18+</span>}</div><div className="condition"><span>Умова отримання</span><p>{selected.status === "Недоступний" ? "Видачу скіна завершено. Наразі отримати його неможливо." : selected.description || `Спосіб отримання: ${selected.method.toLowerCase()}.`}</p></div>{selected.sourceUrl ? <a className="primary-button detail-button" href={selected.sourceUrl} target="_blank" rel="noreferrer">Відкрити посилання <span>↗</span></a> : <span className="disabled-button">Посилання недоступне</span>}</div></section></div>}
  </main>;
}
