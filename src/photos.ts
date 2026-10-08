// Fotos de personas para el post del viernes: las que haya en assets/personas/ (jpg/png, descargadas a mano
// de Unsplash, cuya licencia permite uso comercial). Rota una por semana, así no se repiten hasta acabar la carpeta.
import { readdirSync } from "node:fs";

const dir = new URL("../assets/personas/", import.meta.url);

export async function pickPhoto(): Promise<{ data: Uint8Array; name: string }> {
  const files = readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  if (!files.length) throw new Error("No hay fotos en assets/personas/");
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  const name = files[week % files.length];
  return { data: await Bun.file(new URL(name, dir)).bytes(), name };
}
