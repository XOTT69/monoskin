import { readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const root = process.cwd();
const dataPath = resolve(root, "data/skins.json");
const skins = JSON.parse(await readFile(dataPath, "utf8"));
const threshold = 900 * 1024;
let savedBytes = 0;
let optimized = 0;

for (const skin of skins) {
  if (!skin.image?.startsWith("skin/")) continue;
  const input = resolve(root, "public", skin.image);
  const inputSize = (await stat(input)).size;
  if (inputSize <= threshold || skin.image.endsWith(".webp")) continue;
  const outputImage = skin.image.replace(/\.[^.]+$/, ".webp");
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
  skin.image = outputImage;
  optimized += 1;
  savedBytes += inputSize - outputSize;
  console.log(`${skin.name}: ${(inputSize / 1024 / 1024).toFixed(2)} → ${(outputSize / 1024 / 1024).toFixed(2)} МБ`);
}

await writeFile(dataPath, `${JSON.stringify(skins, null, 2)}\n`);
console.log(`Оптимізовано ${optimized} файлів, зекономлено ${(savedBytes / 1024 / 1024).toFixed(2)} МБ.`);
