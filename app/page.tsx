"use client";

import { useEffect, useMemo, useState } from "react";
import rawSkins from "@/data/skins.json";

type Status = "Безкоштовний" | "За донат" | "Недоступний";

type Skin = {
  id: number;
  name: string;
  category: string;
  availability: Status;
  type: string;
  period: string;
  wallets: string;
  condition: string;
  description: string;
  sourceUrl: string;
  sourceLabel: string;
  image: string;
  position: string;
  accent: string;
};

const skins = rawSkins as Skin[];
const statuses: Array<"Усі" | Status> = ["Усі", "Безкоштовний", "За донат", "Недоступний"];
const statusClass: Record<Status, string> = { "Безкоштовний": "free", "За донат": "donate", "Недоступний": "unavailable" };

function imageStyle(skin: Skin) {
  return { backgroundImage: `linear-gradient(0deg, rgba(7,8,9,.48), transparent 62%), url('/monoskin/${skin.image}')`, backgroundPosition: skin.position };
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Усі" | Status>("Усі");
  const [selected, setSelected] = useState<Skin | null>(null);
  const freeCount = skins.filter((skin) => skin.availability === "Безкоштовний").length;

  const filteredSkins = useMemo(() => skins.filter((skin) => {
    const searchable = `${skin.name} ${skin.category} ${skin.type} ${skin.availability}`.toLowerCase();
    return searchable.includes(query.toLowerCase()) && (filter === "Усі" || skin.availability === filter);
  }), [filter, query]);

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => event.key === "Escape" && setSelected(null);
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <main>
      <section className="hero" id="top">
        <nav className="nav container" aria-label="Головна навігація">
          <a className="brand" href="#top" aria-label="MONOSKIN — на початок"><span className="brand-mark">m</span><span>mono<span className="brand-light">skin</span></span></a>
          <div className="nav-actions"><a href="#guide">Як додати</a><a className="nav-catalog" href="#catalog">Каталог <span>↓</span></a></div>
        </nav>
        <div className="hero-content container">
          <p className="eyebrow"><span /> Каталог скінів карток</p>
          <h1>Картка,<br /><em>яка має вигляд.</em></h1>
          <p className="hero-copy">Усі скіни для Apple Pay та Google Pay: безкоштовні, за донат і ті, що вже недоступні.</p>
          <a className="primary-button" href="#catalog">Переглянути скіни <span>→</span></a>
          <div className="hero-stats" aria-label="Статистика каталогу"><div><strong>{skins.length}</strong><span>скінів у каталозі</span></div><div><strong>{freeCount}</strong><span>безкоштовні зараз</span></div><div><strong>2</strong><span>цифрові гаманці</span></div></div>
        </div>
        <div className="hero-fade" />
      </section>

      <section className="catalog container" id="catalog">
        <div className="section-heading"><div><p className="eyebrow"><span /> Всі колекції</p><h2>Знайди потрібний скін</h2></div><p className="catalog-note">{filteredSkins.length} з {skins.length} записів</p></div>
        <div className="controls"><label className="search"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Назва, категорія або статус" aria-label="Пошук скінів" /></label><div className="filters" aria-label="Фільтр за доступністю">{statuses.map((item) => <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</div></div>
        <div className="skin-grid">{filteredSkins.map((skin) => <button className="skin-card" key={skin.id} onClick={() => setSelected(skin)} aria-label={`Деталі: ${skin.name}`}><div className="skin-image" style={imageStyle(skin)}><span className={`status ${statusClass[skin.availability]}`}>{skin.availability}</span><span className="open-mark" aria-hidden="true">↗</span></div><div className="skin-info"><div><h3>{skin.name}</h3><p>{skin.type}</p></div><span className={`rarity ${skin.accent}`}>{skin.period}</span></div></button>)}</div>
        {filteredSkins.length === 0 && <div className="empty"><strong>Нічого не знайдено</strong><p>Спробуй інший запит або фільтр.</p></div>}
      </section>

      <section className="guide container" id="guide"><div><p className="eyebrow"><span /> Керування каталогом</p><h2>Новий скін за хвилину</h2><p>Усі записи зберігаються в одному зрозумілому файлі. Додавай хоч 10, хоч 1 000 скінів — пошук і фільтри вже готові.</p></div><ol><li><b>01</b><span>Додай зображення в <code>public/skins</code></span></li><li><b>02</b><span>Скопіюй один запис у <code>data/skins.json</code></span></li><li><b>03</b><span>Зроби push — сайт оновиться автоматично</span></li></ol><a className="text-link" href="https://github.com/XOTT69/monoskin/blob/main/data/skins.json" target="_blank" rel="noreferrer">Відкрити список скінів <span>↗</span></a></section>

      <footer className="container footer"><span className="brand"><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></span><span>Каталог скінів карток · 2026</span></footer>

      {selected && <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}><section className="details" role="dialog" aria-modal="true" aria-labelledby="details-title" onMouseDown={(event) => event.stopPropagation()}><button className="close" onClick={() => setSelected(null)} aria-label="Закрити деталі">×</button><div className="detail-art" style={imageStyle(selected)}><span className={`status ${statusClass[selected.availability]}`}>{selected.availability}</span></div><div className="detail-body"><p className="eyebrow"><span /> {selected.category}</p><h2 id="details-title">{selected.name}</h2><p className="detail-description">{selected.description}</p><div className="detail-meta"><span>{selected.type}</span><span>{selected.wallets}</span></div><div className="condition"><span>Умова отримання</span><p>{selected.condition}</p></div><a className="primary-button detail-button" href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.sourceLabel} <span>↗</span></a></div></section></div>}
    </main>
  );
}
