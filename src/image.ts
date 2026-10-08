// Genera la tarjeta PNG (1080×1350, 4:5) con el titular, al estilo de la OG image de trek-ia.com
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";

const W = 1080;
const H = 1350;

const root = new URL("..", import.meta.url);
const font = (w: number) =>
  Bun.file(new URL(`node_modules/@fontsource/manrope/files/manrope-latin-${w}-normal.woff`, root)).arrayBuffer();
const fonts = Promise.all([500, 700, 800].map(async weight => ({
  name: "Manrope", data: await font(weight), weight: weight as 500 | 700 | 800, style: "normal" as const,
})));
const logo = Bun.file(new URL("assets/logo.png", root)).arrayBuffer()
  .then(b => `data:image/png;base64,${Buffer.from(b).toString("base64")}`);

// satori acepta árboles tipo React sin JSX
const h = (type: string, style: Record<string, unknown>, children?: unknown, extra: Record<string, unknown> = {}) =>
  ({ type, props: { style, children, ...extra } });

export async function renderCard(hook: string): Promise<Uint8Array> {
  const size = hook.length <= 28 ? 112 : hook.length <= 44 ? 100 : 84;

  const tree = h("div", {
    width: W, height: H, display: "flex", flexDirection: "column", justifyContent: "space-between",
    padding: "96px 88px", fontFamily: "Manrope", color: "#eef1f9", backgroundColor: "#050816",
    backgroundImage:
      "radial-gradient(circle at 85% 12%, rgba(79,140,255,0.32), rgba(5,8,22,0) 55%), " +
      "radial-gradient(circle at 8% 95%, rgba(124,92,255,0.35), rgba(5,8,22,0) 50%)",
  }, [
    h("div", { display: "flex", alignItems: "center", gap: 28 }, [
      h("img", { width: 96, height: 84 }, undefined, { src: await logo }),
      h("div", { fontSize: 56, fontWeight: 800 }, "Trek.IA"),
    ]),
    h("div", { display: "flex", flexDirection: "column", gap: 56 }, [
      h("div", { fontSize: size, fontWeight: 800, lineHeight: 1.12, letterSpacing: -2 }, hook),
      h("div", { width: 180, height: 10, borderRadius: 5, backgroundImage: "linear-gradient(90deg, #4f8cff, #38d6ff 50%, #7c5cff)" }),
    ]),
    h("div", { display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: 30, fontWeight: 500, color: "#a9b4d0" }, [
      h("div", {}, "IA y automatización para empresas"),
      h("div", { fontWeight: 700, color: "#5d95ff" }, "trek-ia.com"),
    ]),
  ]);

  const svg = await satori(tree as any, { width: W, height: H, fonts: await fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}

// Variante clara con foto de personas de fondo (post del viernes), al estilo de los anuncios de la web.
// La última palabra del titular va en azul.
export async function renderPhotoCard(hook: string, subtitle: string, photo: Uint8Array): Promise<Uint8Array> {
  const size = hook.length <= 24 ? 108 : hook.length <= 36 ? 92 : 80;
  const words = hook.trim().split(/\s+/);
  const last = words.pop()!;
  const blue = "#1557ff";
  const bg = `data:image/jpeg;base64,${Buffer.from(photo).toString("base64")}`;

  const tree = h("div", {
    width: W, height: H, display: "flex", position: "relative", fontFamily: "Manrope", color: "#0b0f1a",
    backgroundColor: "#f4efe8",
  }, [
    // la foto baja 320px: la parte de arriba queda bajo el velo y las personas en la mitad inferior
    h("img", { position: "absolute", top: 320, left: 0, width: W, height: H, objectFit: "cover" }, undefined, { src: bg }),
    // velo claro arriba para que el texto se lea, desaparece hacia la foto
    h("div", {
      position: "absolute", top: 0, left: 0, width: W, height: H,
      backgroundImage: "linear-gradient(180deg, rgba(248,245,240,1) 0%, rgba(248,245,240,1) 26%, rgba(248,245,240,0.94) 44%, rgba(248,245,240,0.5) 54%, rgba(248,245,240,0) 64%)",
    }),
    h("div", {
      position: "absolute", top: 0, left: 0, width: W, height: H, display: "flex", flexDirection: "column",
      justifyContent: "space-between", padding: "80px 88px 72px",
    }, [
      h("div", { display: "flex", flexDirection: "column" }, [
        h("div", { display: "flex", justifyContent: "flex-end", fontSize: 50, fontWeight: 800, letterSpacing: 1 }, [
          h("span", {}, "TREK"),
          h("span", { color: blue }, ".IA"),
        ]),
        h("div", { display: "flex", flexDirection: "column", gap: 30, marginTop: 44 }, [
          h("div", { display: "flex", flexWrap: "wrap", fontSize: size, fontWeight: 800, lineHeight: 1.08, letterSpacing: -3 },
            [...words, last].map((w, i) => h("span", { marginRight: size * 0.26, color: i === words.length ? blue : undefined }, w))),
          h("div", { width: 90, height: 6, borderRadius: 3, backgroundColor: blue }),
          h("div", { fontSize: 34, fontWeight: 500, lineHeight: 1.35, color: "#2a2f3a", maxWidth: 760 }, subtitle),
        ]),
      ]),
      h("div", { display: "flex" }, [
        h("div", {
          display: "flex", padding: "18px 34px", borderRadius: 18, fontSize: 32, fontWeight: 700, color: blue,
          backgroundColor: "rgba(255,255,255,0.88)",
        }, "trek-ia.com"),
      ]),
    ]),
  ]);

  const svg = await satori(tree as any, { width: W, height: H, fonts: await fonts });
  return new Resvg(svg, { fitTo: { mode: "width", value: W } }).render().asPng();
}
