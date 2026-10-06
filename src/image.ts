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
