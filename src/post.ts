// bun run post   → genera N posts con Claude y los mete en la cola de Buffer (IG + LinkedIn)
// bun run dry    → solo genera y muestra, no publica nada
// Claude se invoca vía Claude Code CLI (`claude -p`) con tu suscripción:
//   en local usa tu sesión; en CI, el secret CLAUDE_CODE_OAUTH_TOKEN (sale de `claude setup-token`).
import { createPost } from "./buffer";

const env = process.env;
const DRY_RUN = env.DRY_RUN === "1";
const POSTS_PER_RUN = Number(env.POSTS_PER_RUN ?? 3); // Buffer Free: máx. 10 en cola por canal
const MODEL = env.CLAUDE_MODEL ?? "sonnet";

// ── Temas: edítalos a tu gusto. Se rotan por semana para no repetir. ──────────
const TOPICS = [
  "caso práctico: automatizar la captación y cualificación de leads con IA",
  "errores típicos al implantar IA en una pyme (y cómo evitarlos)",
  "agentes de IA vs. automatizaciones clásicas tipo n8n/Zapier: cuándo usar cada uno",
  "cómo calcular el ROI de un proyecto de automatización",
  "tareas repetitivas de oficina que hoy se pueden automatizar en una semana",
  "IA aplicada a atención al cliente sin perder el trato humano",
  "por qué tus datos importan más que el modelo de IA que elijas",
  "checklist antes de contratar una consultora de IA",
  "automatizar informes y reporting con IA",
  "mitos sobre la IA en empresas B2B",
];

function weekTopics(n: number) {
  const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
  return Array.from({ length: n }, (_, i) => TOPICS[(week * n + i) % TOPICS.length]);
}

// ── Imagen para Instagram (obligatoria). Dos opciones vía env: ───────────────
//   OG_URL_TEMPLATE="https://trek-ia.com/api/og?title={title}"  → tarjeta generada con el titular
//   IMAGE_URLS="https://.../1.jpg,https://.../2.jpg"           → rota imágenes de tu banco
function imageFor(hook: string, i: number): string | undefined {
  if (env.OG_URL_TEMPLATE) return env.OG_URL_TEMPLATE.replace("{title}", encodeURIComponent(hook));
  const list = (env.IMAGE_URLS ?? "").split(",").map(s => s.trim()).filter(Boolean);
  if (list.length) {
    const week = Math.floor(Date.now() / (7 * 24 * 3600 * 1000));
    return list[(week * POSTS_PER_RUN + i) % list.length];
  }
  return undefined;
}

type Post = { hook: string; instagram: string; linkedin: string };

const SYSTEM = `Eres el community manager de Trek.ia (trek-ia.com), consultora B2B de IA y automatización.
Público: dueños y directivos de pymes y empresas de servicios en España.
Tono: experto, cercano y concreto. Nada de humo, nada de "revolucionario" ni "en la era de la IA".
Español de España. Usa ejemplos prácticos y cifras solo si son genéricas y razonables (no inventes casos de clientes reales).
Para cada tema escribe un titular para la imagen, un caption de Instagram y un post de LinkedIn.`;

const SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "titular de máx. 8 palabras para la imagen" },
    instagram: { type: "string", description: "caption de 400-1200 caracteres, saltos de línea, 1-2 emojis máximo, termina con 4-6 hashtags" },
    linkedin: { type: "string", description: "post de 700-1500 caracteres, primera línea gancho, párrafos cortos, CTA final a trek-ia.com, sin hashtags o máx. 3" },
  },
  required: ["hook", "instagram", "linkedin"],
  additionalProperties: false,
};

async function generate(topic: string): Promise<Post> {
  const proc = Bun.spawn(
    [
      "claude", "-p", `Tema: ${topic}`,
      "--system-prompt", SYSTEM,
      "--json-schema", JSON.stringify(SCHEMA),
      "--output-format", "json",
      "--model", MODEL,
      "--tools", "",              // sin herramientas: solo genera texto
      "--strict-mcp-config",      // ignora servidores MCP configurados en la máquina
      "--no-session-persistence",
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  const [out, err, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) throw new Error(`claude salió con código ${code}: ${err || out}`);

  const res = JSON.parse(out);
  if (res.is_error) throw new Error(`claude: ${res.result ?? res.subtype}`);
  const post = res.structured_output as Post | undefined;
  if (!post?.hook || !post.instagram || !post.linkedin) throw new Error(`JSON incompleto: ${out}`);
  return post;
}

async function main() {
  const topics = weekTopics(POSTS_PER_RUN);
  let failures = 0;

  for (const [i, topic] of topics.entries()) {
    console.log(`\n━━ Post ${i + 1}/${topics.length}: ${topic}`);
    let post: Post;
    try {
      post = await generate(topic);
    } catch (e) { failures++; console.error("✘ Generación:", (e as Error).message); continue; }
    const img = imageFor(post.hook, i);

    if (DRY_RUN) {
      console.log({ ...post, image: img ?? "(sin imagen → IG se saltaría)" });
      continue;
    }

    if (env.BUFFER_LI_CHANNEL) {
      try {
        const r = await createPost({ channelId: env.BUFFER_LI_CHANNEL, text: post.linkedin, imageUrl: img });
        console.log(`✔ LinkedIn en cola → ${r.dueAt}`);
      } catch (e) { failures++; console.error("✘ LinkedIn:", (e as Error).message); }
    }

    if (env.BUFFER_IG_CHANNEL) {
      if (!img) {
        console.warn("⚠ Instagram saltado: define OG_URL_TEMPLATE o IMAGE_URLS (IG exige imagen)");
      } else {
        try {
          const r = await createPost({ channelId: env.BUFFER_IG_CHANNEL, text: post.instagram, imageUrl: img, instagram: true });
          console.log(`✔ Instagram en cola → ${r.dueAt}`);
        } catch (e) { failures++; console.error("✘ Instagram:", (e as Error).message); }
      }
    }
  }

  if (failures) process.exit(1); // que GitHub Actions marque el run en rojo y te avise
}

await main();
