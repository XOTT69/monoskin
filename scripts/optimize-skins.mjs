import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const dataPath = resolve(root, "data/skins.json");
const skins = JSON.parse(await readFile(dataPath, "utf8"));
const threshold = 900 * 1024;
let savedBytes = 0;
let optimized = 0;
const replacements = new Map();
const referencedImages = [...new Set(skins.flatMap((skin) => skin.images?.length ? skin.images : [skin.image]).filter((image) => image?.startsWith("skin/")))];

for (const image of referencedImages) {
  const input = resolve(root, "public", image);
  const inputSize = (await stat(input)).size;
  if (inputSize <= threshold || image.endsWith(".webp")) continue;
  const outputImage = image.replace(/\.[^.]+$/, ".webp");
  const output = resolve(root, "public", outputImage);
  const temporary = `${output}.tmp.webp`;
  await sharp(input).rotate().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 86, effort: 5 }).toFile(temporary);
  await rename(temporary, output);
  const outputSize = (await stat(output)).size;
  if (outputSize >= inputSize) {
    await unlink(output);
    continue;
  }
  await unlink(input);
  replacements.set(image, outputImage);
  optimized += 1;
  savedBytes += inputSize - outputSize;
  console.log(`${image}: ${(inputSize / 1024 / 1024).toFixed(2)} → ${(outputSize / 1024 / 1024).toFixed(2)} МБ`);
}

for (const skin of skins) {
  skin.image = replacements.get(skin.image) ?? skin.image;
  if (skin.images?.length) skin.images = skin.images.map((image) => replacements.get(image) ?? image);
}

await writeFile(dataPath, `${JSON.stringify(skins, null, 2)}\n`);
console.log(`Оптимізовано ${optimized} файлів, зекономлено ${(savedBytes / 1024 / 1024).toFixed(2)} МБ.`);
