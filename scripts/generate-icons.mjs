// Genera los iconos PNG de la PWA y el favicon a partir de los SVG de marca.
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const appIcon = await readFile("public/brand/cortana-app-icon.svg");
for (const size of [192, 512]) {
  await sharp(appIcon).resize(size, size).png().toFile(`public/icons/icon-${size}.png`);
}
// Maskable: el contenido ya respeta la zona segura (escala 0.78)
await sharp(appIcon).resize(512, 512).png().toFile("public/icons/icon-maskable-512.png");
await sharp(appIcon).resize(180, 180).png().toFile("src/app/apple-icon.png");
await sharp(appIcon).resize(32, 32).png().toFile("public/icons/favicon-32.png");
await writeFile("src/app/icon.svg", await readFile("public/brand/cortana-icon.svg"));
console.log("Iconos generados");
