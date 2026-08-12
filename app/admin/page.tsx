"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { sitePath } from "@/lib/site-path";

type Method = "Безкоштовний" | "За дію" | "Доступні всім" | "Донат на банку" | "Підписка Base";
type Status = "Доступний" | "Недоступний";
type Category = "Безкоштовно" | "Доступні всім" | "Донат на банку" | "Підписка" | "Недоступні";
type LinkCheck = { checkedAt: string; status: number; finalUrl: string; ok: boolean };
type Skin = { id: string; name: string; method: Method; status: Status; minimumValue: number; addedAt: string; description: string; sourceUrl: string; image: string; images?: string[]; imageHashes?: string[]; isVisaOnly: boolean; isAdultOnly: boolean; featured?: boolean; lastVerifiedAt?: string; unavailableReason?: string; publishAt?: string; linkCheck?: LinkCheck };
type FormValues = { id: string; name: string; category: Category; minimumValue: string; lastVerifiedAt: string; publishAt: string; unavailableReason: string; description: string; sourceUrl: string; isVisaOnly: boolean; isAdultOnly: boolean; featured: boolean };
type ContentFile = { content: string };
type Editor = { skin: Skin; draft: boolean };
type ImportRecord = { id?: string; name?: string; method?: Category; status?: string; minimumValue?: number | string | null; description?: string; sourceUrl?: string; imageFile?: string; isVisaOnly?: boolean; isAdultOnly?: boolean };
type AdminSort = "newest" | "oldest" | "name" | "needs-verification";
type VerificationFilter = "all" | "needs-verification" | "verified-today";
type LinkFilter = "all" | "unchecked" | "healthy" | "broken" | "missing";
type CommitHistory = { sha: string; html_url: string; commit: { message: string; author: { date: string } }; author?: { login: string } | null };

const owner = "XOTT69";
const repo = "monoskin";
const branch = "main";
const adminSessionTokenKey = "monoskin-admin-token";
const today = new Date().toISOString().slice(0, 10);
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxImageBytes = 4 * 1024 * 1024;
const maxImagesPerSkin = 6;
const verificationWindowDays = 30;
const workerUrl = "https://monoskin-telegram.ai-beta69690.workers.dev";
const emptyForm = (): FormValues => ({ id: "", name: "", category: "Безкоштовно", minimumValue: "0", lastVerifiedAt: "", publishAt: "", unavailableReason: "", description: "", sourceUrl: "", isVisaOnly: false, isAdultOnly: false, featured: false });

function categoryOf(skin: Skin): Category {
  if (skin.status === "Недоступний") return "Недоступні";
  if (skin.method === "Донат на банку") return "Донат на банку";
  if (skin.method === "Підписка Base") return "Підписка";
  if (skin.method === "Доступні всім") return "Доступні всім";
  return "Безкоштовно";
}

function categoryFields(category: Category) {
  if (category === "Недоступні") return { method: "Безкоштовний" as Method, status: "Недоступний" as Status };
  if (category === "Донат на банку") return { method: "Донат на банку" as Method, status: "Доступний" as Status };
  if (category === "Підписка") return { method: "Підписка Base" as Method, status: "Доступний" as Status };
  if (category === "Доступні всім") return { method: "Доступні всім" as Method, status: "Доступний" as Status };
  return { method: "Безкоштовний" as Method, status: "Доступний" as Status };
}

function needsVerification(skin: Skin) {
  if (!skin.lastVerifiedAt) return true;
  const date = new Date(`${skin.lastVerifiedAt}T00:00:00`);
  return Number.isNaN(+date) || Date.now() - +date >= verificationWindowDays * 24 * 60 * 60 * 1000;
}

function normalizedName(value: string) {
  return value.toLocaleLowerCase("uk").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function toBase64(value: string) {
  const bytes = new TextEncoder().encode(value);
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function fromBase64(value: string) {
  const bytes = Uint8Array.from(atob(value.replace(/\n/g, "")), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const ukrainianTransliteration: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ye", ж: "zh", з: "z", и: "y", і: "i", ї: "yi", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "yu", я: "ya",
};

function toId(value: string) {
  const transliterated = Array.from(value.toLocaleLowerCase("uk"), (letter) => ukrainianTransliteration[letter] ?? letter).join("");
  return transliterated.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || `skin-${Date.now()}`;
}

function isSecureUrl(value: string) {
  try { return !value || new URL(value).protocol === "https:"; } catch { return false; }
}

function imageFromClipboard(items: DataTransferItemList) {
  const item = Array.from(items).find((entry) => entry.kind === "file" && entry.type.startsWith("image/"));
  const file = item?.getAsFile();
  if (!file) return null;
  const extension = file.type.split("/")[1] || "png";
  return /\.[a-z0-9]+$/i.test(file.name) ? file : new File([file], `вставлений-скін.${extension}`, { type: file.type });
}

async function imageFromSystemClipboard() {
  if (!navigator.clipboard?.read) return null;
  try {
    for (const clipboardItem of await navigator.clipboard.read()) {
      const type = clipboardItem.types.find((entry) => entry.startsWith("image/"));
      if (!type) continue;
      return new File([await clipboardItem.getType(type)], `вставлений-скін.${type.split("/")[1] || "png"}`, { type });
    }
  } catch { /* Standard paste remains available when permission is denied. */ }
  return null;
}

async function github<T>(path: string, token: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", ...(init.headers ?? {}) } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "GitHub не прийняв зміни.");
  return data as T;
}

async function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Не вдалося прочитати зображення."));
    reader.readAsDataURL(file);
  });
}

async function fileHash(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function cropToCard(file: File) {
  if (!window.createImageBitmap) throw new Error("Браузер не підтримує кадрування.");
  const bitmap = await createImageBitmap(file);
  const targetRatio = 729 / 459;
  const sourceRatio = bitmap.width / bitmap.height;
  const sourceWidth = sourceRatio > targetRatio ? Math.round(bitmap.height * targetRatio) : bitmap.width;
  const sourceHeight = sourceRatio > targetRatio ? bitmap.height : Math.round(bitmap.width / targetRatio);
  const sourceX = Math.round((bitmap.width - sourceWidth) / 2);
  const sourceY = Math.round((bitmap.height - sourceHeight) / 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(1600, sourceWidth);
  canvas.height = Math.round(canvas.width / targetRatio);
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не вдалося кадрувати фото.");
  context.drawImage(bitmap, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .9));
  if (!blob) throw new Error("Не вдалося зберегти кадрування.");
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}-card.webp`, { type: "image/webp" });
}

async function optimizeImage(file: File) {
  if (file.size <= 900 * 1024 || !window.createImageBitmap) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxWidth = 1600;
    const ratio = Math.min(1, maxWidth / bitmap.width);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * ratio);
    canvas.height = Math.round(bitmap.height * ratio);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", .88));
    bitmap.close();
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "")}.webp`, { type: "image/webp" });
  } catch { return file; }
}

async function inBatches<T, R>(items: T[], limit: number, task: (item: T) => Promise<R>) {
  const results: R[] = [];
  for (let index = 0; index < items.length; index += limit) results.push(...await Promise.all(items.slice(index, index + limit).map(task)));
  return results;
}

export default function AdminPage() {
  const [token, setToken] = useState("");
  const [tokenDraft, setTokenDraft] = useState("");
  const [login, setLogin] = useState("");
  const [records, setRecords] = useState<Skin[]>([]);
  const [drafts, setDrafts] = useState<Skin[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editing, setEditing] = useState<Editor | null>(null);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [photoHashes, setPhotoHashes] = useState<string[]>([]);
  const [existingImageOrder, setExistingImageOrder] = useState<string[]>([]);
  const [importRecords, setImportRecords] = useState<ImportRecord[]>([]);
  const [importPhotos, setImportPhotos] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [adminQuery, setAdminQuery] = useState("");
  const [adminCategory, setAdminCategory] = useState<Category | "Усі">("Усі");
  const [verificationFilter, setVerificationFilter] = useState<VerificationFilter>("all");
  const [linkFilter, setLinkFilter] = useState<LinkFilter>("all");
  const [adminSort, setAdminSort] = useState<AdminSort>("newest");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkCategory, setBulkCategory] = useState<Category>("Безкоштовно");
  const [bulkLink, setBulkLink] = useState("");
  const [history, setHistory] = useState<CommitHistory[]>([]);
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(() => new Set());
  const [savePreview, setSavePreview] = useState<{ asDraft: boolean; changes: string[] } | null>(null);
  const [skinHistory, setSkinHistory] = useState<Array<{ commit: CommitHistory; skin: Skin }> | null>(null);
  const [historySkinName, setHistorySkinName] = useState("");

  const visibleRecords = useMemo(() => {
    const query = adminQuery.trim().toLocaleLowerCase("uk");
    return records.filter((skin) => {
      const matchesQuery = !query || [skin.name, skin.id, skin.description, skin.sourceUrl].join(" ").toLocaleLowerCase("uk").includes(query);
      const matchesCategory = adminCategory === "Усі" || categoryOf(skin) === adminCategory;
      const matchesVerification = verificationFilter === "all" || verificationFilter === "needs-verification" ? (verificationFilter !== "needs-verification" || needsVerification(skin)) : skin.lastVerifiedAt === today;
      const linkState: LinkFilter = !skin.sourceUrl ? "missing" : !skin.linkCheck ? "unchecked" : skin.linkCheck.ok ? "healthy" : "broken";
      const matchesLink = linkFilter === "all" || linkFilter === linkState;
      return matchesQuery && matchesCategory && matchesVerification && matchesLink;
    }).sort((left, right) => {
      if (adminSort === "oldest") return +new Date(left.addedAt) - +new Date(right.addedAt);
      if (adminSort === "name") return left.name.localeCompare(right.name, "uk");
      if (adminSort === "needs-verification") return Number(needsVerification(right)) - Number(needsVerification(left)) || +new Date(right.addedAt) - +new Date(left.addedAt);
      return +new Date(right.addedAt) - +new Date(left.addedAt);
    });
  }, [adminCategory, adminQuery, adminSort, linkFilter, records, verificationFilter]);
  const dashboard = useMemo(() => ({
    available: records.filter((skin) => skin.status === "Доступний").length,
    unavailable: records.filter((skin) => skin.status === "Недоступний").length,
    needsVerification: records.filter(needsVerification).length,
    brokenLinks: records.filter((skin) => Boolean(skin.sourceUrl && skin.linkCheck && !skin.linkCheck.ok)).length,
    uncheckedLinks: records.filter((skin) => Boolean(skin.sourceUrl && !skin.linkCheck)).length,
  }), [records]);
  const sortedDrafts = useMemo(() => [...drafts].sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt)), [drafts]);
  const selectedVisibleIds = useMemo(() => visibleRecords.filter((skin) => selectedIds.has(skin.id)).map((skin) => skin.id), [selectedIds, visibleRecords]);
  const possibleDuplicates = useMemo(() => {
    const name = normalizedName(form.name);
    const sourceUrl = form.sourceUrl.trim();
    if (name.length < 4 && !sourceUrl) return [];
    return [...records, ...drafts].filter((skin) => skin.id !== editing?.skin.id && ((name.length >= 4 && (normalizedName(skin.name).includes(name) || name.includes(normalizedName(skin.name)))) || Boolean(sourceUrl && skin.sourceUrl === sourceUrl))).slice(0, 3);
  }, [drafts, editing?.skin, form.name, form.sourceUrl, records]);
  const duplicatePhotoNames = useMemo(() => {
    if (!photoHashes.length) return [];
    return [...records, ...drafts].filter((skin) => skin.id !== editing?.skin.id && skin.imageHashes?.some((hash) => photoHashes.includes(hash))).map((skin) => skin.name);
  }, [drafts, editing?.skin, photoHashes, records]);
  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setForm((current) => ({ ...current, [key]: value }));

  const loadCatalog = async (accessToken: string) => {
    const [skinsFile, draftsFile] = await Promise.all([
      github<ContentFile>(`/repos/${owner}/${repo}/contents/data/skins.json?ref=${branch}`, accessToken),
      github<ContentFile>(`/repos/${owner}/${repo}/contents/data/drafts.json?ref=${branch}`, accessToken),
    ]);
    const nextRecords = JSON.parse(fromBase64(skinsFile.content)) as Skin[];
    const nextDrafts = JSON.parse(fromBase64(draftsFile.content)) as Skin[];
    setRecords(nextRecords); setDrafts(nextDrafts); setSelectedIds(new Set());
    return { nextRecords, nextDrafts };
  };

  const loadHistory = async (accessToken: string) => {
    const commits = await github<CommitHistory[]>(`/repos/${owner}/${repo}/commits?path=data/skins.json&per_page=12`, accessToken);
    setHistory(commits);
  };

  const refreshHistory = () => { void loadHistory(token).catch(() => undefined); };

  useEffect(() => {
    const accessToken = window.sessionStorage.getItem(adminSessionTokenKey);
    if (!accessToken) return;
    let active = true;
    void (async () => {
      setBusy(true); setError("");
      try {
        const profile = await github<{ login: string }>("/user", accessToken);
        if (profile.login.toLowerCase() !== owner.toLowerCase()) throw new Error("Ця адмінка дозволена лише для акаунта XOTT69.");
        await loadCatalog(accessToken);
        void loadHistory(accessToken).catch(() => undefined);
        if (!active) return;
        setToken(accessToken); setLogin(profile.login); setNotice("Сеанс відновлено.");
      } catch {
        window.sessionStorage.removeItem(adminSessionTokenKey);
        if (active) setError("Сеанс завершено. Встав token ще раз.");
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, []);

  const signOut = () => { window.sessionStorage.removeItem(adminSessionTokenKey); setToken(""); setLogin(""); setRecords([]); setDrafts([]); setHistory([]); setSelectedIds(new Set()); setNotice("Ви вийшли з адмінки."); };

  const connect = async () => {
    const accessToken = tokenDraft.trim();
    if (!accessToken) { setError("Вставте GitHub token."); return; }
    setBusy(true); setError("");
    try {
      const profile = await github<{ login: string }>("/user", accessToken);
      if (profile.login.toLowerCase() !== owner.toLowerCase()) throw new Error("Ця адмінка дозволена лише для акаунта XOTT69.");
      await loadCatalog(accessToken);
      void loadHistory(accessToken).catch(() => undefined);
      window.sessionStorage.setItem(adminSessionTokenKey, accessToken);
      setToken(accessToken); setLogin(profile.login); setTokenDraft(""); setNotice("Підключено до GitHub. Каталог завантажено.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не вдалося підключитися до GitHub."); }
    finally { setBusy(false); }
  };

  const clearSelectedPhotos = () => {
    previews.forEach((preview) => URL.revokeObjectURL(preview));
    setPhotos([]);
    setPreviews([]);
    setPhotoHashes([]);
  };

  const edit = (skin: Skin, draft = false) => {
    clearSelectedPhotos(); setEditing({ skin, draft }); setError("");
    setExistingImageOrder(skin.images?.length ? skin.images : skin.image ? [skin.image] : []);
    setForm({ id: skin.id, name: skin.name, category: categoryOf(skin), minimumValue: String(skin.minimumValue), lastVerifiedAt: skin.lastVerifiedAt ?? "", publishAt: skin.publishAt ? skin.publishAt.slice(0, 16) : "", unavailableReason: skin.unavailableReason ?? "", description: skin.description, sourceUrl: skin.sourceUrl, isVisaOnly: skin.isVisaOnly, isAdultOnly: skin.isAdultOnly, featured: Boolean(skin.featured) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => { clearSelectedPhotos(); setExistingImageOrder([]); setEditing(null); setForm(emptyForm()); setError(""); };

  const setChosenPhotos = async (selected: File[], append = false) => {
    if (!selected.length) { if (!append) clearSelectedPhotos(); return; }
    if (selected.some((file) => !allowedImageTypes.has(file.type) || file.size > maxImageBytes)) { setError("Додай PNG, JPG або WebP до 4 МБ кожне."); return; }
    if ((append ? photos.length : 0) + selected.length > maxImagesPerSkin) { setError(`Для одного скіна можна додати до ${maxImagesPerSkin} фото.`); return; }
    const prepared = await Promise.all(selected.map(optimizeImage));
    const hashes = await Promise.all(prepared.map(fileHash));
    const nextPhotos = append ? [...photos, ...prepared] : prepared;
    const nextPreviews = append ? [...previews, ...prepared.map((file) => URL.createObjectURL(file))] : prepared.map((file) => URL.createObjectURL(file));
    if (!append) previews.forEach((preview) => URL.revokeObjectURL(preview));
    setError(""); setPhotos(nextPhotos); setPreviews(nextPreviews); setPhotoHashes(append ? [...photoHashes, ...hashes] : hashes);
  };

  const reorderChosenPhoto = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= photos.length) return;
    const move = <T,>(items: T[]) => { const next = [...items]; [next[index], next[target]] = [next[target], next[index]]; return next; };
    setPhotos(move); setPreviews(move); setPhotoHashes(move);
  };

  const reorderExistingPhoto = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= existingImageOrder.length) return;
    const next = [...existingImageOrder]; [next[index], next[target]] = [next[target], next[index]]; setExistingImageOrder(next);
  };

  const cropChosenPhoto = async (index: number) => {
    try {
      const cropped = await cropToCard(photos[index]);
      const optimized = await optimizeImage(cropped);
      const nextPhotos = [...photos]; const nextPreviews = [...previews]; const nextHashes = [...photoHashes];
      URL.revokeObjectURL(nextPreviews[index]); nextPhotos[index] = optimized; nextPreviews[index] = URL.createObjectURL(optimized); nextHashes[index] = await fileHash(optimized);
      setPhotos(nextPhotos); setPreviews(nextPreviews); setPhotoHashes(nextHashes); setNotice("Фото кадровано під формат картки.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не вдалося кадрувати фото."); }
  };

  const currentHead = async () => {
    const [ref, branchCommit] = await Promise.all([
      github<{ object: { sha: string } }>(`/repos/${owner}/${repo}/git/ref/heads/${branch}`, token),
      github<{ sha: string; commit: { tree: { sha: string } } }>(`/repos/${owner}/${repo}/commits/${branch}`, token),
    ]);
    if (ref.object.sha === branchCommit.sha) return { sha: ref.object.sha, tree: branchCommit.commit.tree.sha };
    const commit = await github<{ tree: { sha: string } }>(`/repos/${owner}/${repo}/git/commits/${ref.object.sha}`, token);
    return { sha: ref.object.sha, tree: commit.tree.sha };
  };

  const commit = async (message: string, nextRecords: Skin[], nextDrafts: Skin[], files: Array<{ path: string; content?: string; delete?: boolean }>) => {
    setNotice(files.length ? "Завантажуємо фото та готуємо зміни…" : "Готуємо зміни…");
    const head = await currentHead();
    const changedFiles = files.concat(
      { path: "data/skins.json", content: toBase64(`${JSON.stringify(nextRecords, null, 2)}\n`) },
      { path: "data/drafts.json", content: toBase64(`${JSON.stringify(nextDrafts, null, 2)}\n`) },
    );
    const tree = await inBatches(changedFiles, 4, async (file) => {
      if (file.delete) return { path: file.path, mode: "100644", type: "blob", sha: null };
      const blob = await github<{ sha: string }>(`/repos/${owner}/${repo}/git/blobs`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: file.content, encoding: "base64" }) });
      return { path: file.path, mode: "100644", type: "blob", sha: blob.sha };
    });
    setNotice("Зберігаємо зміни в GitHub…");
    const nextTree = await github<{ sha: string }>(`/repos/${owner}/${repo}/git/trees`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ base_tree: head.tree, tree }) });
    const nextCommit = await github<{ sha: string }>(`/repos/${owner}/${repo}/git/commits`, token, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message, tree: nextTree.sha, parents: [head.sha] }) });
    setNotice("Запускаємо оновлення каталогу…");
    await github(`/repos/${owner}/${repo}/git/refs/heads/${branch}`, token, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sha: nextCommit.sha, force: false }) });
  };

  const recoverFromConflict = async (caught: unknown) => {
    const message = caught instanceof Error ? caught.message : "Не вдалося зберегти зміни.";
    if (/reference|fast forward|update failed/i.test(message)) {
      await loadCatalog(token);
      setError("Каталог щойно змінили в іншій вкладці. Дані оновлено, ваша форма не втрачена — натисніть збереження ще раз.");
      return;
    }
    setError(message);
  };

  const recordFromForm = (image: string, images: string[], hashes: string[], addedAt: string): Skin => ({
    id: form.id.trim() || toId(form.name), name: form.name.trim(), ...categoryFields(form.category), minimumValue: form.category === "Донат на банку" ? Number(form.minimumValue) || 0 : 0, addedAt, lastVerifiedAt: form.lastVerifiedAt || undefined, ...(form.publishAt ? { publishAt: new Date(form.publishAt).toISOString() } : {}), ...(form.category === "Недоступні" && form.unavailableReason.trim() ? { unavailableReason: form.unavailableReason.trim() } : {}), description: form.description.trim(), sourceUrl: form.sourceUrl.trim(), image, images: images.length > 1 ? images : undefined, imageHashes: hashes.length ? hashes : undefined, isVisaOnly: form.isVisaOnly, isAdultOnly: form.isAdultOnly, featured: form.featured,
  });

  const assertForm = (forDraft: boolean) => {
    if (!form.name.trim()) throw new Error("Вкажіть назву скіна.");
    if (!isSecureUrl(form.sourceUrl.trim())) throw new Error("Посилання має починатися з https://.");
    if (!forDraft && !editing?.skin.image && !existingImageOrder.length && !photos.length) throw new Error("Додайте фото скіна.");
  };

  const save = async (asDraft: boolean) => {
    setError(""); setNotice("");
    try {
      assertForm(asDraft);
      setBusy(true); setNotice(photos.length ? "Готуємо фото…" : "Готуємо зміни…");
      const id = form.id.trim() || toId(form.name);
      const sameEditor = editing?.skin.id === id;
      const duplicate = [...records, ...drafts].find((skin) => skin.id === id);
      if (!sameEditor && duplicate) throw new Error(`У каталозі вже є запис «${duplicate.name}» з технічним ID ${id}.`);
      const existingImages = existingImageOrder.length ? existingImageOrder : editing?.skin.images?.length ? editing.skin.images : editing?.skin.image ? [editing.skin.image] : [];
      const images = photos.length ? photos.map((photo, index) => `skin/${id}-${index + 1}-${photoHashes[index]?.slice(0, 8) || Date.now()}.${photo.name.split(".").pop()?.toLowerCase() || "png"}`) : existingImages;
      const image = images[0] || "";
      const record = recordFromForm(image, images, photos.length ? photoHashes : editing?.skin.imageHashes ?? [], editing?.skin.addedAt ?? new Date().toISOString());
      const adjustedRecords = record.featured && !asDraft ? records.map((skin) => ({ ...skin, featured: false })) : records;
      const adjustedDrafts = record.featured && asDraft ? drafts.map((skin) => ({ ...skin, featured: false })) : drafts;
      let nextRecords = adjustedRecords;
      let nextDrafts = adjustedDrafts;
      if (asDraft) nextDrafts = editing?.draft ? adjustedDrafts.map((skin) => skin.id === editing.skin.id ? record : skin) : [record, ...adjustedDrafts];
      else if (editing?.draft) { nextRecords = [record, ...adjustedRecords]; nextDrafts = adjustedDrafts.filter((skin) => skin.id !== editing.skin.id); }
      else nextRecords = editing ? adjustedRecords.map((skin) => skin.id === editing.skin.id ? record : skin) : [record, ...adjustedRecords];
      const files: Array<{ path: string; content?: string; delete?: boolean }> = photos.length ? await Promise.all(photos.map(async (photo, index) => ({ path: `public/${images[index]}`, content: await fileBase64(photo) }))) : [];
      const oldImages = editing?.skin.images?.length ? editing.skin.images : editing?.skin.image ? [editing.skin.image] : [];
      const usedImages = new Set([...nextRecords, ...nextDrafts].flatMap((skin) => skin.images?.length ? skin.images : [skin.image]));
      oldImages.filter((oldImage) => !images.includes(oldImage) && !usedImages.has(oldImage)).forEach((oldImage) => files.push({ path: `public/${oldImage}`, delete: true }));
      await commit(asDraft ? `Зберегти чернетку: ${record.name}` : editing?.draft ? `Опублікувати скін: ${record.name}` : editing ? `Оновити скін: ${record.name}` : `Додати скін: ${record.name}`, nextRecords, nextDrafts, files);
      setRecords(nextRecords); setDrafts(nextDrafts); cancelEdit(); refreshHistory(); setNotice(asDraft ? "Чернетку збережено. Вона ще не видна відвідувачам." : "Зміни збережено. GitHub Pages оновить каталог за кілька хвилин.");
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const remove = async (skin: Skin, draft: boolean) => {
    if (!window.confirm(`Вилучити «${skin.name}» ${draft ? "з чернеток" : "з каталогу"}?`)) return;
    setBusy(true); setError(""); setNotice("Готуємо видалення…");
    try {
      const nextRecords = draft ? records : records.filter((record) => record.id !== skin.id);
      const nextDrafts = draft ? drafts.filter((record) => record.id !== skin.id) : drafts;
      const images = skin.images?.length ? skin.images : skin.image ? [skin.image] : [];
      const usedImages = new Set([...nextRecords, ...nextDrafts].flatMap((record) => record.images?.length ? record.images : [record.image]));
      await commit(`Вилучити ${draft ? "чернетку" : "скін"}: ${skin.name}`, nextRecords, nextDrafts, images.filter((image) => !usedImages.has(image)).map((image) => ({ path: `public/${image}`, delete: true })));
      setRecords(nextRecords); setDrafts(nextDrafts); if (editing?.skin.id === skin.id) cancelEdit(); refreshHistory(); setNotice("Запис вилучено.");
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const markVerified = async (skin: Skin) => {
    setBusy(true); setError("");
    try {
      const nextRecords = records.map((record) => record.id === skin.id ? { ...record, lastVerifiedAt: today } : record);
      await commit(`Перевірити скін: ${skin.name}`, nextRecords, drafts, []);
      setRecords(nextRecords); refreshHistory(); setNotice("Позначено як перевірений сьогодні.");
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const toggleSelected = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleVisibleSelection = () => setSelectedIds((current) => {
    const next = new Set(current);
    const allVisibleSelected = visibleRecords.length > 0 && visibleRecords.every((skin) => next.has(skin.id));
    visibleRecords.forEach((skin) => allVisibleSelected ? next.delete(skin.id) : next.add(skin.id));
    return next;
  });

  const selectUnverified = () => setSelectedIds((current) => new Set([...current, ...visibleRecords.filter(needsVerification).map((skin) => skin.id)]));

  const applyDashboardFilter = (next: { verification?: VerificationFilter; links?: LinkFilter; category?: Category | "Усі" }) => {
    setVerificationFilter(next.verification ?? "all");
    setLinkFilter(next.links ?? "all");
    setAdminCategory(next.category ?? "Усі");
    setAdminQuery("");
    document.getElementById("admin-catalog")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const updateSelected = async (action: "verify" | "category") => {
    const selected = records.filter((skin) => selectedIds.has(skin.id));
    if (!selected.length) { setError("Обери хоча б один скін."); return; }
    const actionLabel = action === "verify" ? "позначити перевіреними" : `змінити категорію на «${bulkCategory}»`;
    if (!window.confirm(`Підтвердити: ${actionLabel} для ${selected.length} скінів? Це створить одне оновлення каталогу.`)) return;
    setBusy(true); setError("");
    try {
      const nextRecords = records.map((skin) => {
        if (!selectedIds.has(skin.id)) return skin;
        if (action === "verify") return { ...skin, lastVerifiedAt: today };
        return { ...skin, ...categoryFields(bulkCategory), minimumValue: bulkCategory === "Донат на банку" ? skin.minimumValue : 0 };
      });
      const message = action === "verify" ? `Перевірити ${selected.length} скінів` : `Змінити категорію для ${selected.length} скінів`;
      await commit(message, nextRecords, drafts, []);
      setRecords(nextRecords); setSelectedIds(new Set()); refreshHistory(); setNotice(`Готово: ${selected.length} скінів оновлено одним збереженням.`);
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const requestSave = (asDraft: boolean) => {
    try {
      assertForm(asDraft);
      const current = editing?.skin;
      const values = [
        ["Назва", current?.name, form.name.trim()], ["Категорія", current ? categoryOf(current) : "", form.category], ["Сума", current ? String(current.minimumValue) : "", form.minimumValue], ["Посилання", current?.sourceUrl, form.sourceUrl.trim()], ["Умова", current?.description, form.description.trim()], ["Причина недоступності", current?.unavailableReason, form.unavailableReason.trim()], ["Публікація", current?.publishAt?.slice(0, 16), form.publishAt],
      ].filter(([, before, after]) => before !== after).map(([label, before, after]) => `${label}: ${before || "—"} → ${after || "—"}`);
      if (photos.length) values.push(`Фото: буде завантажено ${photos.length}`);
      setSavePreview({ asDraft, changes: values.length ? values : ["Значущих змін у даних немає."] }); setError("");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Перевір форму."); }
  };

  const publishSelectedDrafts = async () => {
    const selected = drafts.filter((skin) => selectedDraftIds.has(skin.id));
    if (!selected.length) { setError("Обери хоча б одну чернетку."); return; }
    if (!window.confirm(`Опублікувати ${selected.length} чернеток одним оновленням?`)) return;
    setBusy(true); setError("");
    try {
      const nextRecords = [...selected.map((skin) => ({ ...skin, publishAt: undefined, lastVerifiedAt: skin.lastVerifiedAt || today })), ...records];
      const nextDrafts = drafts.filter((skin) => !selectedDraftIds.has(skin.id));
      await commit(`Опублікувати ${selected.length} чернеток`, nextRecords, nextDrafts, []);
      setRecords(nextRecords); setDrafts(nextDrafts); setSelectedDraftIds(new Set()); refreshHistory(); setNotice(`Опубліковано ${selected.length} скінів одним комітом.`);
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const changeSelectedLinks = async (replaceWith: string) => {
    if (!selectedIds.size) { setError("Обери скіни для зміни посилання."); return; }
    if (!isSecureUrl(replaceWith)) { setError("Посилання має починатися з https:// або бути порожнім."); return; }
    if (!window.confirm(replaceWith ? `Замінити посилання у ${selectedIds.size} скінів?` : `Очистити посилання у ${selectedIds.size} скінів?`)) return;
    setBusy(true); setError("");
    try {
      const nextRecords = records.map((skin) => selectedIds.has(skin.id) ? { ...skin, sourceUrl: replaceWith } : skin);
      await commit(`Оновити посилання для ${selectedIds.size} скінів`, nextRecords, drafts, []);
      setRecords(nextRecords); setSelectedIds(new Set()); refreshHistory(); setNotice("Посилання оновлено одним збереженням.");
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const cloneSkin = (skin: Skin) => {
    edit(skin);
    setEditing(null);
    setForm((current) => ({ ...current, id: "", name: `${skin.name} — копія`, publishAt: "" }));
    setNotice("Створено копію у формі. Зміни назву, фото або умови та збережи.");
  };

  const download = (filename: string, content: string, type: string) => {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([content], { type }));
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(link.href), 0);
  };

  const exportCatalog = (format: "json" | "csv") => {
    if (format === "json") { download("monoskin-catalog.json", `${JSON.stringify(records, null, 2)}\n`, "application/json"); return; }
    const headers = ["id", "name", "category", "status", "minimumValue", "addedAt", "lastVerifiedAt", "description", "sourceUrl"];
    const escape = (value: unknown) => `"${String(value ?? "").replaceAll("\"", "\"\"")}"`;
    const rows = records.map((skin) => [skin.id, skin.name, categoryOf(skin), skin.status, skin.minimumValue, skin.addedAt, skin.lastVerifiedAt, skin.description, skin.sourceUrl].map(escape).join(","));
    download("monoskin-catalog.csv", `\uFEFF${headers.join(",")}\n${rows.join("\n")}\n`, "text/csv;charset=utf-8");
  };

  const loadSkinHistory = async (skin: Skin) => {
    setBusy(true); setError(""); setHistorySkinName(skin.name);
    try {
      const commits = await github<CommitHistory[]>(`/repos/${owner}/${repo}/commits?path=data/skins.json&per_page=100`, token);
      const found = (await inBatches(commits, 4, async (commit) => {
        try {
          const file = await github<ContentFile>(`/repos/${owner}/${repo}/contents/data/skins.json?ref=${commit.sha}`, token);
          const version = (JSON.parse(fromBase64(file.content)) as Skin[]).find((item) => item.id === skin.id);
          return version ? { commit, skin: version } : null;
        } catch { return null; }
      })).filter((item): item is { commit: CommitHistory; skin: Skin } => Boolean(item));
      setSkinHistory(found);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не вдалося завантажити історію."); setSkinHistory(null); }
    finally { setBusy(false); }
  };

  const restoreSkinVersion = async (version: Skin) => {
    if (!window.confirm(`Відновити версію «${version.name}»? Це створить новий коміт, старі дані не буде втрачено.`)) return;
    setBusy(true); setError("");
    try {
      const nextRecords = records.map((skin) => skin.id === version.id ? { ...version, addedAt: skin.addedAt } : skin);
      await commit(`Відновити версію скіна: ${version.name}`, nextRecords, drafts, []);
      setRecords(nextRecords); setSkinHistory(null); refreshHistory(); setNotice("Версію скіна відновлено.");
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const checkLinks = async (ids: string[]) => {
    const targets = records.filter((skin) => ids.includes(skin.id) && skin.sourceUrl).map((skin) => ({ id: skin.id, url: skin.sourceUrl }));
    if (!targets.length) { setError("У вибраних скінів немає посилань для перевірки."); return; }
    setBusy(true); setError(""); setNotice(`Перевіряємо ${targets.length} посилань…`);
    try {
      const response = await fetch(`${workerUrl}/admin/check-links`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ links: targets }) });
      const result = await response.json().catch(() => ({})) as { error?: string; results?: Array<{ id: string; status: number; finalUrl: string; ok: boolean }> };
      if (!response.ok || !result.results) throw new Error(result.error || "Не вдалося перевірити посилання.");
      const checkedAt = new Date().toISOString();
      const checks = new Map(result.results.map((item) => [item.id, { ...item, checkedAt }]));
      const nextRecords = records.map((skin) => checks.has(skin.id) ? { ...skin, linkCheck: checks.get(skin.id) } : skin);
      await commit(`Перевірити ${targets.length} посилань`, nextRecords, drafts, []);
      setRecords(nextRecords); refreshHistory(); setNotice(`Перевірено ${targets.length} посилань. Результати збережено.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не вдалося перевірити посилання."); }
    finally { setBusy(false); }
  };

  const selectImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    try {
      const data = JSON.parse(await file.text()) as { records?: ImportRecord[] };
      if (!Array.isArray(data.records)) throw new Error();
      setImportRecords(data.records); setNotice(`Пакет прочитано: ${data.records.length} записів. Тепер обери всі чисті фото.`); setError("");
    } catch { setError("Не вдалося прочитати JSON-пакет імпорту."); }
  };

  const importAsDrafts = async () => {
    if (!importRecords.length) { setError("Спочатку обери файл missing-skins.json."); return; }
    setBusy(true); setError("");
    try {
      const photos = new Map(importPhotos.map((file) => [file.name, file]));
      const occupied = new Set([...records, ...drafts].map((skin) => skin.id));
      const accepted = importRecords.filter((item) => item.id && item.name && item.imageFile && photos.has(item.imageFile.split("/").pop()!) && !occupied.has(item.id));
      if (!accepted.length) throw new Error("Не знайдено відповідних фото. Назви файлів мають збігатися з полем imageFile.");
      const nextDrafts = [...drafts];
      const files: Array<{ path: string; content: string }> = [];
      for (const item of accepted) {
        const sourceFile = photos.get(item.imageFile!.split("/").pop()!)!;
        if (!allowedImageTypes.has(sourceFile.type) || sourceFile.size > maxImageBytes) continue;
        const file = await optimizeImage(sourceFile);
        const extension = file.name.split(".").pop()?.toLowerCase() || "png";
        const image = `skin/${item.id}.${extension}`;
        nextDrafts.push({ id: item.id!, name: item.name!, method: item.method === "Донат на банку" ? "Донат на банку" : item.method === "Підписка" ? "Підписка Base" : item.method === "Доступні всім" ? "Доступні всім" : "Безкоштовний", status: item.status === "Недоступний" ? "Недоступний" : "Доступний", minimumValue: Number(item.minimumValue) || 0, addedAt: new Date().toISOString(), description: item.description || "", sourceUrl: isSecureUrl(item.sourceUrl || "") ? item.sourceUrl || "" : "", image, isVisaOnly: Boolean(item.isVisaOnly), isAdultOnly: Boolean(item.isAdultOnly), featured: false });
        files.push({ path: `public/${image}`, content: await fileBase64(file) });
      }
      if (!files.length) throw new Error("Фото мають бути PNG, JPG або WebP до 4 МБ.");
      await commit(`Імпортувати ${files.length} чернеток зі списку Telegram`, records, nextDrafts, files);
      setDrafts(nextDrafts); setImportRecords([]); setImportPhotos([]); setNotice(`Імпортовано ${files.length} чернеток. Перевір їх і опублікуй, коли будеш готовий.`);
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  if (!token) return <main className="admin-page"><header className="admin-header"><a className="brand" href={sitePath("/")}><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></a><span>Адмінка</span></header><section className="login-card"><p className="eyebrow"><span /> Тільки для редактора каталогу</p><h1>Керуй скінами<br /><em>без коду.</em></h1><div className="admin-error"><strong>Підключи GitHub token із доступом лише до цього репозиторію.</strong><p>Створи fine-grained token для <code>XOTT69/monoskin</code> з дозволом <b>Contents: Read and write</b>. Токен зберігається лише до закриття вкладки; не використовуй його на чужому пристрої.</p></div><label className="token-field">GitHub token<input type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="github_pat_…" autoComplete="off" /></label><button className="primary-button" onClick={connect} disabled={busy}>{busy ? "Підключаю…" : "Підключити GitHub"}</button>{error && <p className="form-error">{error}</p>}</section></main>;

  return <main className="admin-page"><header className="admin-header"><a className="brand" href={sitePath("/")}><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></a><div><span>{login || owner}</span><button onClick={signOut}>Вийти</button></div></header><section className="admin-shell"><div className="admin-heading"><div><p className="eyebrow"><span /> Редактор каталогу</p><h1>{editing ? editing.draft ? "Перевірити чернетку" : "Редагувати скін" : "Додати скін"}</h1></div><p>{records.length} скінів · {drafts.length} чернеток</p></div>
    <section className="admin-dashboard" aria-label="Стан каталогу"><button type="button" onClick={() => applyDashboardFilter({})}><strong>{records.length}</strong><span>Усього скінів</span></button><button type="button" onClick={() => applyDashboardFilter({ category: "Усі" })}><strong>{dashboard.available}</strong><span>Доступні</span></button><button type="button" onClick={() => applyDashboardFilter({ category: "Недоступні" })}><strong>{dashboard.unavailable}</strong><span>Недоступні</span></button><button type="button" onClick={() => applyDashboardFilter({ verification: "needs-verification" })}><strong>{dashboard.needsVerification}</strong><span>Потрібно перевірити</span></button><button type="button" onClick={() => applyDashboardFilter({ links: "unchecked" })}><strong>{dashboard.uncheckedLinks}</strong><span>URL не перевірено</span></button><button className={dashboard.brokenLinks ? "attention" : ""} type="button" onClick={() => applyDashboardFilter({ links: "broken" })}><strong>{dashboard.brokenLinks}</strong><span>Проблемні URL</span></button></section>
    {notice && <p className="form-notice">{notice}</p>}{error && <p className="form-error">{error}</p>}
    {savePreview && <section className="save-preview" role="dialog" aria-label="Підтвердження змін"><strong>Перевір зміни перед збереженням</strong><ul>{savePreview.changes.map((change) => <li key={change}>{change}</li>)}</ul><div><button className="primary-button" type="button" disabled={busy} onClick={() => { const asDraft = savePreview.asDraft; setSavePreview(null); void save(asDraft); }}>{savePreview.asDraft ? "Підтвердити чернетку" : "Підтвердити збереження"}</button><button className="secondary-button" type="button" onClick={() => setSavePreview(null)}>Повернутися до редагування</button></div></section>}
    <form className="skin-form" onSubmit={(event) => { event.preventDefault(); requestSave(false); }} onPaste={async (event) => { const direct = imageFromClipboard(event.clipboardData.items); if (direct) { event.preventDefault(); void setChosenPhotos([direct], true); return; } const systemImage = await imageFromSystemClipboard(); if (systemImage) void setChosenPhotos([systemImage], true); }}>
      <label>Назва<input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Наприклад, Київ. Каштан" required />{possibleDuplicates.length > 0 && <small className="duplicate-hint">Можливий збіг: {possibleDuplicates.map((skin) => skin.name).join(" · ")}</small>}</label>
      <label>Категорія<select value={form.category} onChange={(event) => setField("category", event.target.value as Category)}><option>Безкоштовно</option><option>Доступні всім</option><option>Донат на банку</option><option>Підписка</option><option>Недоступні</option></select></label>
      <label>Мінімальна сума, ₴<input type="number" min="0" value={form.minimumValue} onChange={(event) => setField("minimumValue", event.target.value)} /></label>
      <label>Перевірено<input type="date" value={form.lastVerifiedAt} onChange={(event) => setField("lastVerifiedAt", event.target.value)} /></label>
      <label>Запланувати публікацію<input type="datetime-local" value={form.publishAt} onChange={(event) => setField("publishAt", event.target.value)} disabled={Boolean(editing && !editing.draft)} /><small>{editing && !editing.draft ? "Доступно для нової або наявної чернетки." : "Збережи як чернетку — Worker опублікує її в цей час."}</small></label>
      {form.category === "Недоступні" && <label className="full">Чому недоступний<textarea value={form.unavailableReason} onChange={(event) => setField("unavailableReason", event.target.value)} placeholder="Наприклад, банка закрита або акція завершилась" rows={2} /></label>}
      <label className="verify-help">Час додавання формується автоматично. Дата перевірки не показує строк дії скіна.</label>
      <label className="full">Опис / умова отримання<textarea value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Коротко поясни, як отримати цей скін" rows={5} /></label>
      <label className="full">Посилання на скін<input type="url" value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} placeholder="https://…" /></label>
      <label className="full upload-field" tabIndex={0}>Фото скіна
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void setChosenPhotos(Array.from(event.target.files ?? []))} />
        <span>{photos.length ? `✓ Обрано фото: ${photos.length}` : editing ? "Залишити поточні фото, обрати нові або вставити Ctrl/Cmd + V" : `PNG, JPG або WebP · до 4 МБ кожне · до ${maxImagesPerSkin} фото`}</span>
        {photos.length > 0 && <span className="upload-hint">Новий набір замінить поточну галерею після збереження.</span>}
        {duplicatePhotoNames.length > 0 && <span className="duplicate-hint">Таке саме фото вже є у: {duplicatePhotoNames.join(" · ")}</span>}
        <span className="photo-previews">{(previews.length ? previews : existingImageOrder.map(sitePath)).map((preview, index) => <span className="photo-preview" key={preview} style={{ backgroundImage: `url('${preview}')` }} title={`Фото ${index + 1}`}><span className="photo-preview-actions"><button type="button" disabled={index === 0} onClick={(event) => { event.preventDefault(); if (photos.length) reorderChosenPhoto(index, -1); else reorderExistingPhoto(index, -1); }}>←</button><button type="button" disabled={index === (photos.length ? photos.length : existingImageOrder.length) - 1} onClick={(event) => { event.preventDefault(); if (photos.length) reorderChosenPhoto(index, 1); else reorderExistingPhoto(index, 1); }}>→</button>{photos.length > 0 && <button type="button" onClick={(event) => { event.preventDefault(); void cropChosenPhoto(index); }}>Кадрувати</button>}</span></span>)}</span>
      </label>
      <div className="checkboxes"><label><input type="checkbox" checked={form.isVisaOnly} onChange={(event) => setField("isVisaOnly", event.target.checked)} /> Лише Visa</label><label><input type="checkbox" checked={form.isAdultOnly} onChange={(event) => setField("isAdultOnly", event.target.checked)} /> Лише 18+</label><label><input type="checkbox" checked={form.featured} onChange={(event) => setField("featured", event.target.checked)} /> Показувати в hero</label></div>
      <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Зберігаю…" : editing?.draft ? "Опублікувати скін" : editing ? "Зберегти зміни" : "Додати скін"}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => requestSave(true)}>{form.publishAt ? "Запланувати як чернетку" : "Зберегти чернетку"}</button>{editing && <button className="secondary-button" type="button" onClick={cancelEdit}>Скасувати</button>}</div>
    </form>
    <section className="admin-live-preview"><div><p className="eyebrow"><span /> Перед публікацією</p><h2>Як це побачить відвідувач</h2><p>Перевір назву, категорію та головне фото у форматі картки й деталей.</p></div><div className="preview-devices"><article className="preview-catalog-card"><span style={{ backgroundImage: `url('${previews[0] || (existingImageOrder[0] ? sitePath(existingImageOrder[0]) : "")}')` }} /><strong>{form.name || "Назва скіна"}</strong><small>{form.category}</small></article><article className="preview-details-card"><span style={{ backgroundImage: `url('${previews[0] || (existingImageOrder[0] ? sitePath(existingImageOrder[0]) : "")}')` }} /><div><strong>{form.name || "Назва скіна"}</strong><small>{form.category}</small><p>{form.description || "Тут буде коротка умова отримання скіна."}</p></div></article></div></section>
    <section className="admin-import"><div><p className="eyebrow"><span /> Масовий імпорт</p><h2>Чернетки з фото</h2><p>Обери `missing-skins.json`, а потім усі чисті зображення. Файли зі збігом назви буде додано в чернетки, не одразу на сайт.</p></div><label>Файл списку<input type="file" accept="application/json" onChange={selectImport} /></label><label>Чисті фото<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setImportPhotos(Array.from(event.target.files ?? []))} /></label><button className="secondary-button" type="button" disabled={busy || !importRecords.length} onClick={() => void importAsDrafts}>Імпортувати {importRecords.length ? `${importRecords.length} записів` : "чернетки"}</button></section>
    {sortedDrafts.length > 0 && <section className="admin-list drafts-list"><div><p className="eyebrow"><span /> Не опубліковано</p><h2>Чернетки</h2></div><div className="admin-bulk"><label><input type="checkbox" checked={sortedDrafts.length > 0 && sortedDrafts.every((skin) => selectedDraftIds.has(skin.id))} onChange={() => setSelectedDraftIds((current) => {
      const allSelected = sortedDrafts.every((skin) => current.has(skin.id));
      return allSelected ? new Set<string>() : new Set(sortedDrafts.map((skin) => skin.id));
    })} /> Вибрати всі</label><strong>Обрано: {selectedDraftIds.size}</strong><button className="primary-button" type="button" disabled={busy || !selectedDraftIds.size} onClick={() => void publishSelectedDrafts()}>Опублікувати вибрані</button></div><div className="admin-grid">{sortedDrafts.map((skin) => <article key={skin.id}><label className="admin-row-select"><input type="checkbox" checked={selectedDraftIds.has(skin.id)} onChange={() => setSelectedDraftIds((current) => { const next = new Set(current); if (next.has(skin.id)) next.delete(skin.id); else next.add(skin.id); return next; })} aria-label={`Обрати ${skin.name}`} /></label><span className="admin-thumb" style={{ backgroundImage: skin.image ? `url('${sitePath(skin.image)}')` : undefined }} /><div><strong>{skin.name}</strong><p>Чернетка · {categoryOf(skin)} · додано {new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(skin.addedAt))}{skin.publishAt ? ` · заплановано ${new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(skin.publishAt))}` : ""}</p></div><div><button onClick={() => edit(skin, true)}>Перевірити</button><button className="danger" onClick={() => void remove(skin, true)} disabled={busy}>Вилучити</button></div></article>)}</div></section>}
    <section className="admin-list admin-catalog-list" id="admin-catalog"><div><p className="eyebrow"><span /> Каталог</p><h2>Усі скіни <small>{visibleRecords.length} з {records.length}</small></h2></div>
      <div className="admin-tools">
        <input value={adminQuery} onChange={(event) => setAdminQuery(event.target.value)} placeholder="Пошук за назвою, описом або ID" aria-label="Пошук у каталозі" />
        <select value={adminCategory} onChange={(event) => setAdminCategory(event.target.value as Category | "Усі")} aria-label="Категорія"><option>Усі</option><option>Безкоштовно</option><option>Доступні всім</option><option>Донат на банку</option><option>Підписка</option><option>Недоступні</option></select>
        <select value={verificationFilter} onChange={(event) => setVerificationFilter(event.target.value as VerificationFilter)} aria-label="Стан перевірки"><option value="all">Усі перевірки</option><option value="needs-verification">Потрібна перевірка</option><option value="verified-today">Перевірені сьогодні</option></select>
        <select value={linkFilter} onChange={(event) => setLinkFilter(event.target.value as LinkFilter)} aria-label="Стан посилання"><option value="all">Усі URL</option><option value="unchecked">URL не перевірено</option><option value="healthy">URL працюють</option><option value="broken">Проблемні URL</option><option value="missing">Без URL</option></select>
        <select value={adminSort} onChange={(event) => setAdminSort(event.target.value as AdminSort)} aria-label="Сортування"><option value="newest">Спершу нові</option><option value="oldest">Спершу старі</option><option value="name">За назвою</option><option value="needs-verification">Спершу неперевірені</option></select>
        <button type="button" onClick={() => exportCatalog("json")}>JSON</button><button type="button" onClick={() => exportCatalog("csv")}>CSV</button>
      </div>
      <div className="admin-bulk">
        <label><input type="checkbox" checked={visibleRecords.length > 0 && selectedVisibleIds.length === visibleRecords.length} onChange={toggleVisibleSelection} /> Вибрати видимі</label>
        <button type="button" onClick={selectUnverified} disabled={busy}>Обрати неперевірені</button>
        <strong>Обрано: {selectedIds.size}</strong>
        <button className="primary-button" type="button" onClick={() => void updateSelected("verify")} disabled={busy || !selectedIds.size}>Підтвердити перевірку</button>
        <select value={bulkCategory} onChange={(event) => setBulkCategory(event.target.value as Category)} aria-label="Нова категорія"><option>Безкоштовно</option><option>Доступні всім</option><option>Донат на банку</option><option>Підписка</option><option>Недоступні</option></select>
        <button type="button" onClick={() => void updateSelected("category")} disabled={busy || !selectedIds.size}>Змінити категорію</button>
        <button type="button" onClick={() => void checkLinks(selectedIds.size ? Array.from(selectedIds) : visibleRecords.map((skin) => skin.id))} disabled={busy}>Перевірити URL ({selectedIds.size || visibleRecords.filter((skin) => Boolean(skin.sourceUrl)).length})</button>
        <input value={bulkLink} onChange={(event) => setBulkLink(event.target.value)} placeholder="Нове https://… або порожньо" aria-label="Нове посилання" />
        <button type="button" onClick={() => void changeSelectedLinks(bulkLink.trim())} disabled={busy || !selectedIds.size}>Замінити URL</button>
        <button type="button" onClick={() => void changeSelectedLinks("")} disabled={busy || !selectedIds.size}>Очистити URL</button>
        {selectedIds.size > 0 && <button type="button" onClick={() => setSelectedIds(new Set())}>Очистити вибір</button>}
      </div>
      <div className="admin-grid">{visibleRecords.map((skin) => <article key={skin.id}><label className="admin-row-select" title={`Обрати ${skin.name}`}><input type="checkbox" checked={selectedIds.has(skin.id)} onChange={() => toggleSelected(skin.id)} aria-label={`Обрати ${skin.name}`} /></label><span className="admin-thumb" style={{ backgroundImage: `url('${sitePath(skin.image)}')` }} /><div><strong>{skin.name}</strong><p>{categoryOf(skin)} · додано {new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(skin.addedAt))}{needsVerification(skin) ? " · потрібна перевірка" : ` · перевірено ${skin.lastVerifiedAt}`}{skin.linkCheck ? ` · URL ${skin.linkCheck.ok ? "✓" : "⚠"} ${skin.linkCheck.status}` : ""}</p></div><div><button onClick={() => void markVerified(skin)} disabled={busy}>Перевірено сьогодні</button><button onClick={() => cloneSkin(skin)}>Копія</button><button onClick={() => void loadSkinHistory(skin)} disabled={busy}>Історія</button><button onClick={() => edit(skin)}>Редагувати</button><button className="danger" onClick={() => void remove(skin, false)} disabled={busy}>Вилучити</button></div></article>)}</div>
      {visibleRecords.length === 0 && <p className="admin-empty">За цими фільтрами скінів немає.</p>}
    </section>
    <section className="admin-history"><p className="eyebrow"><span /> Історія</p><h2>Останні зміни каталогу</h2>{history.length ? <ol>{history.map((item) => <li key={item.sha}><a href={item.html_url} target="_blank" rel="noreferrer">{item.commit.message}</a><span>{new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.commit.author.date))}{item.author?.login ? ` · ${item.author.login}` : ""}</span></li>)}</ol> : <p>Історія завантажується…</p>}</section>
    {skinHistory && <section className="skin-version-history"><div><p className="eyebrow"><span /> Версії скіна</p><h2>{historySkinName}</h2></div><button type="button" onClick={() => setSkinHistory(null)}>Закрити</button>{skinHistory.length ? <ol>{skinHistory.map(({ commit, skin }) => <li key={commit.sha}><div><strong>{commit.commit.message}</strong><p>{new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(commit.commit.author.date))} · {categoryOf(skin)} · {skin.sourceUrl || "без посилання"}</p></div><button type="button" disabled={busy} onClick={() => void restoreSkinVersion(skin)}>Відновити цю версію</button></li>)}</ol> : <p>У доступній історії немає попередніх версій.</p>}</section>}
  </section></main>;
}
