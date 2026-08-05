"use client";

import { ChangeEvent, useEffect, useMemo, useState } from "react";

type Method = "Безкоштовний" | "За дію" | "Доступні всім" | "Донат на банку" | "Підписка Base";
type Status = "Доступний" | "Недоступний";
type Category = "Безкоштовно" | "Доступні всім" | "Донат на банку" | "Підписка" | "Недоступні";
type Skin = { id: string; name: string; method: Method; status: Status; minimumValue: number; addedAt: string; description: string; sourceUrl: string; image: string; images?: string[]; isVisaOnly: boolean; isAdultOnly: boolean; featured?: boolean; lastVerifiedAt?: string };
type FormValues = { id: string; name: string; category: Category; minimumValue: string; lastVerifiedAt: string; description: string; sourceUrl: string; isVisaOnly: boolean; isAdultOnly: boolean; featured: boolean };
type ContentFile = { content: string };
type Editor = { skin: Skin; draft: boolean };
type ImportRecord = { id?: string; name?: string; method?: Category; status?: string; minimumValue?: number | string | null; date?: string; description?: string; sourceUrl?: string; imageFile?: string; isVisaOnly?: boolean; isAdultOnly?: boolean };

const owner = "XOTT69";
const repo = "monoskin";
const branch = "main";
const adminSessionTokenKey = "monoskin-admin-token";
const today = new Date().toISOString().slice(0, 10);
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
const maxImageBytes = 4 * 1024 * 1024;
const maxImagesPerSkin = 6;
const emptyForm = (): FormValues => ({ id: "", name: "", category: "Безкоштовно", minimumValue: "0", lastVerifiedAt: "", description: "", sourceUrl: "", isVisaOnly: false, isAdultOnly: false, featured: false });

function categoryOf(skin: Skin): Category {
  if (skin.status === "Недоступний") return "Недоступні";
  if (skin.method === "Донат на банку") return "Донат на банку";
  if (skin.method === "Підписка Base") return "Підписка";
  if (skin.method === "Доступні всім") return "Доступні всім";
  return "Безкоштовно";
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
  const [importRecords, setImportRecords] = useState<ImportRecord[]>([]);
  const [importPhotos, setImportPhotos] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...records].sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt)), [records]);
  const sortedDrafts = useMemo(() => [...drafts].sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt)), [drafts]);
  const setField = <K extends keyof FormValues>(key: K, value: FormValues[K]) => setForm((current) => ({ ...current, [key]: value }));

  const loadCatalog = async (accessToken: string) => {
    const [skinsFile, draftsFile] = await Promise.all([
      github<ContentFile>(`/repos/${owner}/${repo}/contents/data/skins.json?ref=${branch}`, accessToken),
      github<ContentFile>(`/repos/${owner}/${repo}/contents/data/drafts.json?ref=${branch}`, accessToken),
    ]);
    const nextRecords = JSON.parse(fromBase64(skinsFile.content)) as Skin[];
    const nextDrafts = JSON.parse(fromBase64(draftsFile.content)) as Skin[];
    setRecords(nextRecords); setDrafts(nextDrafts);
    return { nextRecords, nextDrafts };
  };

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
        if (!active) return;
        setToken(accessToken); setLogin(profile.login); setNotice("Сеанс відновлено.");
      } catch {
        window.sessionStorage.removeItem(adminSessionTokenKey);
        if (active) setError("Сеанс завершено. Встав token ще раз.");
      } finally { if (active) setBusy(false); }
    })();
    return () => { active = false; };
  }, []);

  const signOut = () => { window.sessionStorage.removeItem(adminSessionTokenKey); setToken(""); setLogin(""); setRecords([]); setDrafts([]); setNotice("Ви вийшли з адмінки."); };

  const connect = async () => {
    const accessToken = tokenDraft.trim();
    if (!accessToken) { setError("Вставте GitHub token."); return; }
    setBusy(true); setError("");
    try {
      const profile = await github<{ login: string }>("/user", accessToken);
      if (profile.login.toLowerCase() !== owner.toLowerCase()) throw new Error("Ця адмінка дозволена лише для акаунта XOTT69.");
      await loadCatalog(accessToken);
      window.sessionStorage.setItem(adminSessionTokenKey, accessToken);
      setToken(accessToken); setLogin(profile.login); setTokenDraft(""); setNotice("Підключено до GitHub. Каталог завантажено.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Не вдалося підключитися до GitHub."); }
    finally { setBusy(false); }
  };

  const clearSelectedPhotos = () => {
    previews.forEach((preview) => URL.revokeObjectURL(preview));
    setPhotos([]);
    setPreviews([]);
  };

  const edit = (skin: Skin, draft = false) => {
    clearSelectedPhotos(); setEditing({ skin, draft }); setError("");
    setForm({ id: skin.id, name: skin.name, category: categoryOf(skin), minimumValue: String(skin.minimumValue), lastVerifiedAt: skin.lastVerifiedAt ?? "", description: skin.description, sourceUrl: skin.sourceUrl, isVisaOnly: skin.isVisaOnly, isAdultOnly: skin.isAdultOnly, featured: Boolean(skin.featured) });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const cancelEdit = () => { clearSelectedPhotos(); setEditing(null); setForm(emptyForm()); setError(""); };

  const setChosenPhotos = async (selected: File[], append = false) => {
    if (!selected.length) { if (!append) clearSelectedPhotos(); return; }
    if (selected.some((file) => !allowedImageTypes.has(file.type) || file.size > maxImageBytes)) { setError("Додай PNG, JPG або WebP до 4 МБ кожне."); return; }
    if ((append ? photos.length : 0) + selected.length > maxImagesPerSkin) { setError(`Для одного скіна можна додати до ${maxImagesPerSkin} фото.`); return; }
    const prepared = await Promise.all(selected.map(optimizeImage));
    const nextPhotos = append ? [...photos, ...prepared] : prepared;
    const nextPreviews = append ? [...previews, ...prepared.map((file) => URL.createObjectURL(file))] : prepared.map((file) => URL.createObjectURL(file));
    if (!append) previews.forEach((preview) => URL.revokeObjectURL(preview));
    setError(""); setPhotos(nextPhotos); setPreviews(nextPreviews);
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

  const recordFromForm = (image: string, images: string[], addedAt: string): Skin => ({
    id: form.id.trim() || toId(form.name), name: form.name.trim(), method: form.category === "Донат на банку" ? "Донат на банку" : form.category === "Підписка" ? "Підписка Base" : form.category === "Доступні всім" ? "Доступні всім" : "Безкоштовний", status: form.category === "Недоступні" ? "Недоступний" : "Доступний", minimumValue: Number(form.minimumValue) || 0, addedAt, lastVerifiedAt: form.lastVerifiedAt || undefined, description: form.description.trim(), sourceUrl: form.sourceUrl.trim(), image, images: images.length > 1 ? images : undefined, isVisaOnly: form.isVisaOnly, isAdultOnly: form.isAdultOnly, featured: form.featured,
  });

  const assertForm = (forDraft: boolean) => {
    if (!form.name.trim()) throw new Error("Вкажіть назву скіна.");
    if (!isSecureUrl(form.sourceUrl.trim())) throw new Error("Посилання має починатися з https://.");
    if (!forDraft && !editing?.skin.image && !photos.length) throw new Error("Додайте фото скіна.");
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
      const existingImages = editing?.skin.images?.length ? editing.skin.images : editing?.skin.image ? [editing.skin.image] : [];
      const images = photos.length ? photos.map((photo, index) => `skin/${id}${index ? `-${index + 1}` : ""}.${photo.name.split(".").pop()?.toLowerCase() || "png"}`) : existingImages;
      const image = images[0] || "";
      const record = recordFromForm(image, images, editing?.skin.addedAt ?? new Date().toISOString());
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
      setRecords(nextRecords); setDrafts(nextDrafts); cancelEdit(); setNotice(asDraft ? "Чернетку збережено. Вона ще не видна відвідувачам." : "Зміни збережено. GitHub Pages оновить каталог за кілька хвилин.");
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
      setRecords(nextRecords); setDrafts(nextDrafts); if (editing?.skin.id === skin.id) cancelEdit(); setNotice("Запис вилучено.");
    } catch (caught) { await recoverFromConflict(caught); }
    finally { setBusy(false); }
  };

  const markVerified = async (skin: Skin) => {
    setBusy(true); setError("");
    try {
      const nextRecords = records.map((record) => record.id === skin.id ? { ...record, lastVerifiedAt: today } : record);
      await commit(`Перевірити скін: ${skin.name}`, nextRecords, drafts, []);
      setRecords(nextRecords); setNotice("Позначено як перевірений сьогодні.");
    } catch (caught) { await recoverFromConflict(caught); }
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

  if (!token) return <main className="admin-page"><header className="admin-header"><a className="brand" href="/monoskin/"><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></a><span>Адмінка</span></header><section className="login-card"><p className="eyebrow"><span /> Тільки для редактора каталогу</p><h1>Керуй скінами<br /><em>без коду.</em></h1><div className="admin-error"><strong>Підключи GitHub token із доступом лише до цього репозиторію.</strong><p>Створи fine-grained token для <code>XOTT69/monoskin</code> з дозволом <b>Contents: Read and write</b>. Токен зберігається лише до закриття вкладки; не використовуй його на чужому пристрої.</p></div><label className="token-field">GitHub token<input type="password" value={tokenDraft} onChange={(event) => setTokenDraft(event.target.value)} placeholder="github_pat_…" autoComplete="off" /></label><button className="primary-button" onClick={connect} disabled={busy}>{busy ? "Підключаю…" : "Підключити GitHub"}</button>{error && <p className="form-error">{error}</p>}</section></main>;

  return <main className="admin-page"><header className="admin-header"><a className="brand" href="/monoskin/"><span className="brand-mark">m</span> mono<span className="brand-light">skin</span></a><div><span>{login || owner}</span><button onClick={signOut}>Вийти</button></div></header><section className="admin-shell"><div className="admin-heading"><div><p className="eyebrow"><span /> Редактор каталогу</p><h1>{editing ? editing.draft ? "Перевірити чернетку" : "Редагувати скін" : "Додати скін"}</h1></div><p>{records.length} скінів · {drafts.length} чернеток</p></div>{notice && <p className="form-notice">{notice}</p>}{error && <p className="form-error">{error}</p>}
    <form className="skin-form" onSubmit={(event) => { event.preventDefault(); void save(false); }} onPaste={async (event) => { const direct = imageFromClipboard(event.clipboardData.items); if (direct) { event.preventDefault(); void setChosenPhotos([direct], true); return; } const systemImage = await imageFromSystemClipboard(); if (systemImage) void setChosenPhotos([systemImage], true); }}>
      <label>Назва<input value={form.name} onChange={(event) => setField("name", event.target.value)} placeholder="Наприклад, Київ. Каштан" required /></label>
      <label>Категорія<select value={form.category} onChange={(event) => setField("category", event.target.value as Category)}><option>Безкоштовно</option><option>Доступні всім</option><option>Донат на банку</option><option>Підписка</option><option>Недоступні</option></select></label>
      <label>Мінімальна сума, ₴<input type="number" min="0" value={form.minimumValue} onChange={(event) => setField("minimumValue", event.target.value)} /></label>
      <label>Перевірено<input type="date" value={form.lastVerifiedAt} onChange={(event) => setField("lastVerifiedAt", event.target.value)} /></label>
      <label className="verify-help">Час додавання формується автоматично. Дата перевірки не показує строк дії скіна.</label>
      <label className="full">Опис / умова отримання<textarea value={form.description} onChange={(event) => setField("description", event.target.value)} placeholder="Коротко поясни, як отримати цей скін" rows={5} /></label>
      <label className="full">Посилання на скін<input type="url" value={form.sourceUrl} onChange={(event) => setField("sourceUrl", event.target.value)} placeholder="https://…" /></label>
      <label className="full upload-field" tabIndex={0}>Фото скіна
        <input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => void setChosenPhotos(Array.from(event.target.files ?? []))} />
        <span>{photos.length ? `✓ Обрано фото: ${photos.length}` : editing ? "Залишити поточні фото, обрати нові або вставити Ctrl/Cmd + V" : `PNG, JPG або WebP · до 4 МБ кожне · до ${maxImagesPerSkin} фото`}</span>
        {photos.length > 0 && <span className="upload-hint">Новий набір замінить поточну галерею після збереження.</span>}
        <span className="photo-previews">{(previews.length ? previews : (editing?.skin.images?.length ? editing.skin.images : editing?.skin.image ? [editing.skin.image] : []).map((image) => `/monoskin/${image}`)).map((preview, index) => <span className="photo-preview" key={preview} style={{ backgroundImage: `url('${preview}')` }} title={`Фото ${index + 1}`} />)}</span>
      </label>
      <div className="checkboxes"><label><input type="checkbox" checked={form.isVisaOnly} onChange={(event) => setField("isVisaOnly", event.target.checked)} /> Лише Visa</label><label><input type="checkbox" checked={form.isAdultOnly} onChange={(event) => setField("isAdultOnly", event.target.checked)} /> Лише 18+</label><label><input type="checkbox" checked={form.featured} onChange={(event) => setField("featured", event.target.checked)} /> Показувати в hero</label></div>
      <div className="form-actions"><button className="primary-button" type="submit" disabled={busy}>{busy ? "Зберігаю…" : editing?.draft ? "Опублікувати скін" : editing ? "Зберегти зміни" : "Додати скін"}</button><button className="secondary-button" type="button" disabled={busy} onClick={() => void save(true)}>Зберегти чернетку</button>{editing && <button className="secondary-button" type="button" onClick={cancelEdit}>Скасувати</button>}</div>
    </form>
    <section className="admin-import"><div><p className="eyebrow"><span /> Масовий імпорт</p><h2>Чернетки з фото</h2><p>Обери `missing-skins.json`, а потім усі чисті зображення. Файли зі збігом назви буде додано в чернетки, не одразу на сайт.</p></div><label>Файл списку<input type="file" accept="application/json" onChange={selectImport} /></label><label>Чисті фото<input type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(event) => setImportPhotos(Array.from(event.target.files ?? []))} /></label><button className="secondary-button" type="button" disabled={busy || !importRecords.length} onClick={() => void importAsDrafts}>Імпортувати {importRecords.length ? `${importRecords.length} записів` : "чернетки"}</button></section>
    {sortedDrafts.length > 0 && <section className="admin-list drafts-list"><div><p className="eyebrow"><span /> Не опубліковано</p><h2>Чернетки</h2></div><div className="admin-grid">{sortedDrafts.map((skin) => <article key={skin.id}><span className="admin-thumb" style={{ backgroundImage: skin.image ? `url('/monoskin/${skin.image}')` : undefined }} /><div><strong>{skin.name}</strong><p>Чернетка · {categoryOf(skin)} · додано {new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(skin.addedAt))}</p></div><div><button onClick={() => edit(skin, true)}>Перевірити</button><button className="danger" onClick={() => void remove(skin, true)} disabled={busy}>Вилучити</button></div></article>)}</div></section>}
    <section className="admin-list"><div><p className="eyebrow"><span /> Каталог</p><h2>Усі скіни</h2></div><div className="admin-grid">{sorted.map((skin) => <article key={skin.id}><span className="admin-thumb" style={{ backgroundImage: `url('/monoskin/${skin.image}')` }} /><div><strong>{skin.name}</strong><p>{categoryOf(skin)} · додано {new Intl.DateTimeFormat("uk-UA", { dateStyle: "medium", timeStyle: "short" }).format(new Date(skin.addedAt))}{skin.lastVerifiedAt ? ` · перевірено ${skin.lastVerifiedAt}` : " · не перевірено"}</p></div><div><button onClick={() => void markVerified(skin)} disabled={busy}>Перевірено сьогодні</button><button onClick={() => edit(skin)}>Редагувати</button><button className="danger" onClick={() => void remove(skin, false)} disabled={busy}>Вилучити</button></div></article>)}</div></section>
  </section></main>;
}
