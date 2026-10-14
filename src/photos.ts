// Fotos de personas para el post del lunes: las que haya en assets/personas/ (jpg/png, descargadas a mano
// de Unsplash, cuya licencia permite uso comercial). Rotan en orden alfabético a partir de la última usada
// (guardada en state.json), así no se repiten hasta acabar la carpeta aunque haya varios runs en la misma semana.
import { readdirSync } from "node:fs";

const dir = new URL("../assets/personas/", import.meta.url);

export async function pickPhoto(last?: string): Promise<{ data: Uint8Array; name: string }> {
  const files = readdirSync(dir).filter(f => /\.(jpe?g|png)$/i.test(f)).sort();
  if (!files.length) throw new Error("No hay fotos en assets/personas/");
  const name = files.find(f => !last || f > last) ?? files[0];
  return { data: await Bun.file(new URL(name, dir)).bytes(), name };
}
