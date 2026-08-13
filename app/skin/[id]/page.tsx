import Image from "next/image";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import rawSkins from "@/data/skins.json";
import { sitePath } from "@/lib/site-path";

type Status = "Доступний" | "Недоступний";
type Method = "Безкоштовний" | "За дію" | "Доступні всім" | "Донат на банку" | "Підписка Base";
type AvailabilityEvent = { date: string; status: Status; reason?: string };
type Skin = { id: string; name: string; method: Method; status: Status; minimumValue: number; addedAt: string; description: string; sourceUrl: string; image: string; images?: string[]; isVisaOnly: boolean; isAdultOnly: boolean; lastVerifiedAt?: string; unavailableReason?: string; availabilityHistory?: AvailabilityEvent[] };

const skins = rawSkins as Skin[];

function displayMethod(skin: Skin) {
  if (skin.method === "Донат на банку") return "Донат на банку";
  if (skin.method === "Підписка Base") return "Підписка";
  if (skin.method === "Доступні всім") return "Доступні всім";
  return "Безкоштовно";
}

function money(skin: Skin) {
  if (skin.minimumValue) return `від ${skin.minimumValue.toLocaleString("uk-UA")} ₴`;
  return skin.method === "Підписка Base" ? "Сума в Base" : "Безкоштовно";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("uk-UA", { day: "numeric", month: "long", year: "numeric" }).format(new Date(value));
}

function isSecureUrl(value: string) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function history(skin: Skin): AvailabilityEvent[] {
  if (skin.availabilityHistory?.length) return [...skin.availabilityHistory].sort((left, right) => +new Date(right.date) - +new Date(left.date));
  return [{ date: skin.status === "Недоступний" ? skin.lastVerifiedAt || skin.addedAt : skin.addedAt, status: skin.status, reason: skin.status === "Недоступний" ? skin.unavailableReason : undefined }];
}

export function generateStaticParams() {
  return skins.map((skin) => ({ id: skin.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const skin = skins.find((item) => item.id === id);
  if (!skin) return { title: "Скін не знайдено · MONOSKIN" };
  return {
    title: `${skin.name} · MONOSKIN`,
    description: skin.description,
    openGraph: { images: [sitePath(skin.images?.[0] || skin.image)] },
  };
}

export default async function SkinPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const skin = skins.find((item) => item.id === id);
  if (!skin) notFound();
  const images = skin.images?.length ? skin.images : [skin.image];

  return <main className="skin-page">
    <header className="skin-page-header container"><a className="brand" href={sitePath("/")}><span className="brand-mark brand-avatar"><Image src={sitePath("monoskin-avatar.png")} alt="" fill sizes="27px" /></span>mono<span className="brand-light">skin</span></a><a className="direct-link" href={`${sitePath("/")}#catalog`}>← До каталогу</a></header>
    <section className="skin-page-content container">
      <div className="skin-page-copy"><p className="eyebrow"><span /> {skin.status}</p><h1>{skin.name}</h1><div className="detail-meta"><span>{displayMethod(skin)}</span><span>{money(skin)}</span>{skin.lastVerifiedAt && <span>Перевірено {formatDate(skin.lastVerifiedAt)}</span>}{skin.isVisaOnly && <span>Лише Visa</span>}{skin.isAdultOnly && <span>18+</span>}</div><div className="condition"><span>Умова отримання</span><p>{skin.status === "Недоступний" ? skin.unavailableReason ? `Видачу скіна завершено: ${skin.unavailableReason}` : "Видачу скіна завершено. Наразі отримати його неможливо." : skin.description}</p></div><div className="availability-history"><span>Історія доступності</span>{history(skin).map((event, index) => <p key={`${event.date}-${index}`}><b>{event.status}</b> · {formatDate(event.date)}{event.reason ? ` — ${event.reason}` : ""}</p>)}</div><div className="skin-page-actions">{skin.status === "Доступний" && isSecureUrl(skin.sourceUrl) && <a className="primary-button" href={skin.sourceUrl} target="_blank" rel="noreferrer">Отримати скін <span>↗</span></a>}{skin.status === "Доступний" && skin.method === "Доступні всім" && <span className="disabled-button">Скін видається автоматично</span>}<a className="direct-link report-link" href={`${sitePath("/")}?report=${encodeURIComponent(skin.id)}#suggest`}>Повідомити про неточність</a></div></div>
      <div className="skin-page-art">{images.map((image, index) => <figure key={image}><Image src={sitePath(image)} alt={`${skin.name}${images.length > 1 ? ` — фото ${index + 1}` : ""}`} width={1458} height={918} priority={index === 0} /></figure>)}</div>
    </section>
  </main>;
}
