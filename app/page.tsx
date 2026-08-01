"use client";

import { useEffect, useMemo, useState } from "react";

type Status = "Доступний" | "Промо" | "Архівний";

type Skin = {
  id: number;
  name: string;
  game: string;
  status: Status;
  rarity: string;
  season: string;
  condition: string;
  description: string;
  sourceUrl: string;
  sourceLabel: string;
  position: string;
  accent: string;
};

const skins: Skin[] = [
  {
    id: 1,
    name: "Lime Flow",
    game: "Картка mono",
    status: "Доступний",
    rarity: "Стандартний",
    season: "Постійна колекція",
    condition: "Доступний для підключення в Apple Pay та Google Pay за стандартною інструкцією.",
    description: "Контрастний чорний скін із яскравою лаймовою лінією.",
    sourceUrl: "https://monobank.ua/",
    sourceLabel: "Інструкція для клієнта",
    position: "38% center",
    accent: "lime",
  },
  {
    id: 2,
    name: "Blue Current",
    game: "Картка mono",
    status: "Доступний",
    rarity: "Стандартний",
    season: "Постійна колекція",
    condition: "Клієнт обирає скін у застосунку; додавання в гаманець виконується стандартно.",
    description: "Динамічний синій потік для цифрової картки.",
    sourceUrl: "https://monobank.ua/",
    sourceLabel: "Інструкція для клієнта",
    position: "55% center",
    accent: "blue",
  },
  {
    id: 3,
    name: "Sunset Grid",
    game: "Картка mono",
    status: "Промо",
    rarity: "Лімітований",
    season: "Літня промокампанія",
    condition: "Надається лише за правилами активної кампанії. Перед передачею перевір статус промо.",
    description: "Теплий градієнтний скін для спеціальних добірок і промо.",
    sourceUrl: "https://monobank.ua/",
    sourceLabel: "Перевірити умови",
    position: "72% center",
    accent: "gold",
  },
  {
    id: 4,
    name: "Topo Black",
    game: "Картка mono",
    status: "Архівний",
    rarity: "Лімітований",
    season: "Архів колекцій",
    condition: "Видача завершена. Не обіцяй клієнту підключення; використовуй лише як довідковий запис.",
    description: "Графітовий скін із топографічним патерном.",
    sourceUrl: "https://monobank.ua/",
    sourceLabel: "Відкрити архів",
    position: "90% center",
    accent: "graphite",
  },
];

const statusClass: Record<Status, string> = {
  Доступний: "free",
  Промо: "paid",
  Архівний: "unavailable",
};

export default function Home() {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"Усі" | Status>("Усі");
  const [selected, setSelected] = useState<Skin | null>(null);

  const filteredSkins = useMemo(
    () =>
      skins.filter((skin) => {
        const matchesQuery = `${skin.name} ${skin.game} ${skin.rarity}`
          .toLowerCase()
          .includes(query.toLowerCase());
        return matchesQuery && (filter === "Усі" || skin.status === filter);
      }),
    [filter, query],
  );

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelected(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  return (
    <main>
      <section className="hero">
        <nav className="nav container" aria-label="Головна навігація">
          <a className="brand" href="#top" aria-label="MONOSKIN — на початок">
            <span className="brand-mark">M</span>
            <span>MONOSKIN <small>operators</small></span>
          </a>
          <a className="nav-link" href="#catalog">Каталог <span>↓</span></a>
        </nav>

        <div className="hero-content container" id="top">
          <p className="eyebrow"><span /> Внутрішній каталог операторів</p>
          <h1>Скіни карток.<br /><em>Чіткі умови видачі.</em></h1>
          <p className="hero-copy">Усі доступні, промо та архівні скіни для карток mono — із правилами підключення в Apple Pay і Google Pay.</p>
          <a className="primary-button" href="#catalog">Переглянути каталог <span>→</span></a>
          <div className="hero-stats" aria-label="Статистика каталогу">
            <div><strong>4</strong><span>скінів у каталозі</span></div>
            <div><strong>2</strong><span>цифрові гаманці</span></div>
          </div>
        </div>
        <div className="hero-fade" />
      </section>

      <section className="catalog container" id="catalog">
        <div className="section-heading">
          <div>
            <p className="eyebrow"><span /> Картки</p>
            <h2>Каталог скінів карток</h2>
          </div>
          <p className="catalog-note">Відкрий картку, щоб побачити умови для оператора.</p>
        </div>

        <div className="controls">
          <label className="search">
            <span aria-hidden="true">⌕</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук за назвою або типом" aria-label="Пошук скінів" />
          </label>
          <div className="filters" aria-label="Фільтр за доступністю">
            {(["Усі", "Доступний", "Промо", "Архівний"] as const).map((item) => (
              <button className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>
            ))}
          </div>
        </div>

        <div className="skin-grid">
          {filteredSkins.map((skin) => (
            <button className="skin-card" key={skin.id} onClick={() => setSelected(skin)} aria-label={`Деталі: ${skin.name}`}>
              <div className="skin-image" style={{ backgroundPosition: skin.position }}>
                <span className={`status ${statusClass[skin.status]}`}>{skin.status}</span>
                <span className="open-mark" aria-hidden="true">↗</span>
              </div>
              <div className="skin-info">
                <div><h3>{skin.name}</h3><p>{skin.game}</p></div>
                <span className={`rarity ${skin.accent}`}>{skin.rarity}</span>
              </div>
            </button>
          ))}
        </div>
        {filteredSkins.length === 0 && <div className="empty"><strong>Нічого не знайдено</strong><p>Спробуй інший запит або фільтр.</p></div>}
      </section>

      <footer className="container footer"><span className="brand"><span className="brand-mark">M</span> MONOSKIN</span><p>Внутрішній каталог операторів. Не додавай сюди дані клієнтів або непублічні посилання.</p><span>© 2026</span></footer>

      {selected && (
        <div className="overlay" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="details" role="dialog" aria-modal="true" aria-labelledby="details-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="close" onClick={() => setSelected(null)} aria-label="Закрити деталі">×</button>
            <div className="detail-art" style={{ backgroundPosition: selected.position }}><span className={`status ${statusClass[selected.status]}`}>{selected.status}</span></div>
            <div className="detail-body">
              <p className="eyebrow"><span /> {selected.game}</p>
              <h2 id="details-title">{selected.name}</h2>
              <p className="detail-description">{selected.description}</p>
              <div className="detail-meta"><span>{selected.rarity}</span><span>{selected.season}</span></div>
              <div className="condition"><span>Умова для оператора</span><p>{selected.condition}</p></div>
              <a className="primary-button detail-button" href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.sourceLabel} <span>↗</span></a>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
