// bun run post   → genera N posts con Claude y los programa en Buffer (IG + LinkedIn) para L-X-V de la semana siguiente
// bun run dry    → solo genera y muestra, no publica nada
// Claude se invoca vía Claude Code CLI (`claude -p`) con tu suscripción:
//   en local usa tu sesión; en CI, el secret CLAUDE_CODE_OAUTH_TOKEN (sale de `claude setup-token`).
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { createPost } from "./buffer";
import { renderCard, renderPhotoCard } from "./image";
import { pickPhoto } from "./photos";

const env = process.env;
const DRY_RUN = env.DRY_RUN === "1";
const SHARE_NOW = env.SHARE_NOW === "1"; // publica al momento en vez de programar
const SCHEDULED = env.SCHEDULED === "1"; // lanzado por el cron (no a mano)
const POSTS_PER_RUN = Number(env.POSTS_PER_RUN || 3); // Buffer Free: máx. 10 en cola por canal
const MODEL = env.CLAUDE_MODEL ?? "sonnet";
const PHOTO_POST = 1; // el 1.º de la tanda (el del lunes) lleva foto de personas de assets/personas/

// ── Calendario: cada post se programa a una hora fija de Madrid, sin depender de la cola de Buffer ──
const TZ = "Europe/Madrid";
const RUN_HOUR = 15;          // el cron se lanza a las 13:00 y 14:00 UTC; solo sigue el que cae a partir de las 15:00 en Madrid
const POST_HOUR = 9;          // hora de publicación
const POST_DAYS = [0, 2, 4];  // L-X-V, en días desde el lunes

function madrid(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", weekday: "short", hourCycle: "h23" })
      .formatToParts(d).map(x => [x.type, x.value]),
  );
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour), weekday: p.weekday as string };
}

function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Lunes siguiente a `date` (si es lunes, el de la semana que viene)
function nextMonday(date: string) {
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, (8 - dow) % 7 || 7);
}

// Hora de Madrid → instante UTC, teniendo en cuenta el cambio de hora
function madridToUTC(date: string, hour: number) {
  const guess = new Date(`${date}T${String(hour).padStart(2, "0")}:00:00Z`);
  return new Date(guess.getTime() - (madrid(guess).hour - hour) * 3600_000);
}

// Post i → L, X, V de la semana `monday` (si hay más de 3, siguen la semana siguiente)
function slot(monday: string, i: number) {
  const day = addDays(monday, POST_DAYS[i % POST_DAYS.length] + 7 * Math.floor(i / POST_DAYS.length));
  return madridToUTC(day, POST_HOUR).toISOString();
}

// Fallar antes de gastar cuota de Claude o subir imágenes que no se van a usar
function checkConfig() {
  const errors: string[] = [];
  if (!Number.isInteger(POSTS_PER_RUN) || POSTS_PER_RUN < 1 || POSTS_PER_RUN > 10) {
    errors.push(`POSTS_PER_RUN debe ser un entero entre 1 y 10 (es "${env.POSTS_PER_RUN}")`);
  }
  if (!DRY_RUN) {
    if (!env.BUFFER_API_KEY) errors.push("Falta BUFFER_API_KEY");
    if (!env.BUFFER_LI_CHANNEL && !env.BUFFER_IG_CHANNEL) errors.push("Falta BUFFER_LI_CHANNEL o BUFFER_IG_CHANNEL");
  }
  if (errors.length) {
    for (const e of errors) console.error("✘", e);
    process.exit(1);
  }
}

// ── Temas: edítalos a tu gusto. Se usan en orden; el siguiente se guarda en state.json. ──
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
  "cómo elegir el primer proceso a automatizar en tu empresa",
  "IA y protección de datos (RGPD): qué tener en cuenta antes de empezar",
  "automatizar la gestión de facturas y documentos con IA",
  "cómo formar a tu equipo para trabajar con IA sin resistencias",
  "prueba piloto de IA: cómo plantearla para que salga bien",
  "chatbots que funcionan vs. chatbots que frustran al cliente",
  "integrar la IA con tu CRM y tu ERP sin cambiar de herramientas",
  "cuánto cuesta de verdad un proyecto de IA en una pyme",
  "IA para el equipo comercial: preparar reuniones, propuestas y seguimientos",
  "señales de que tu empresa está lista (o no) para automatizar",
];

// Solo avanza cuando se publica de verdad, así los dry runs y los runs manuales no repiten ni saltan temas.
// `history` guarda los titulares publicados para que Claude no repita enfoques; `lastPhoto`, la última foto de personas usada;
// `week`, el lunes de la última semana programada (evita programar dos tandas para la misma semana).
const STATE_FILE = "state.json";
const HISTORY_SIZE = 60;
type Published = { date: string; topic: string; hook: string };
type State = { nextTopic: number; history: Published[]; lastPhoto?: string; week?: string };

async function readState(): Promise<State> {
  const f = Bun.file(STATE_FILE);
  const s = (await f.exists()) ? await f.json() : {};
  return { nextTopic: s.nextTopic ?? 0, history: s.history ?? [], lastPhoto: s.lastPhoto, week: s.week };
}

// Titulares anteriores del mismo tema + los más recientes de cualquier tema
function previousHooks(history: Published[], topic: string) {
  const sameTopic = history.filter(h => h.topic === topic).map(h => h.hook);
  const recent = history.slice(-9).map(h => h.hook);
  return [...new Set([...sameTopic, ...recent])];
}

function pickTopics(state: State, n: number) {
  return Array.from({ length: n }, (_, i) => TOPICS[(state.nextTopic + i) % TOPICS.length]);
}

// ── Imagen: tarjeta generada con el titular (src/image.ts). Se guarda en media/ y se
// publica en el propio repo (público), así Buffer la descarga de raw.githubusercontent.com.
const REPO = env.GITHUB_REPOSITORY ?? "acastantrek/trek-social";

function git(...args: string[]) {
  const r = Bun.spawnSync(["git", ...args], { stdout: "pipe", stderr: "pipe" });
  if (r.exitCode !== 0) throw new Error(`git ${args.join(" ")}: ${r.stderr.toString() || r.stdout.toString()}`);
  return r.stdout.toString().trim();
}

// Sube las imágenes (y el estado de los temas) al repo y devuelve el commit, para URLs inmutables
function pushImages(files: string[]): string {
  git("add", STATE_FILE, ...files);
  git("commit", "-m", `Imágenes de posts ${files.map(f => f.split("/").pop()).join(", ")}`);
  git("pull", "--rebase");
  git("push");
  return git("rev-parse", "HEAD");
}

// raw.githubusercontent.com puede tardar unos segundos en servir un commit recién subido
async function waitPublic(url: string) {
  for (let i = 0; i < 10; i++) {
    if ((await fetch(url, { method: "HEAD" })).ok) return;
    await Bun.sleep(3000);
  }
  throw new Error(`La imagen no es accesible: ${url}`);
}

type Post = { hook: string; subtitle: string; instagram: string; linkedin: string };

const SYSTEM = `Eres el community manager de Trek.ia (trek-ia.com), consultora B2B de IA y automatización.
Público: dueños y directivos de pymes y empresas de servicios en España.
Tono: experto, cercano y concreto. Nada de humo, nada de "revolucionario" ni "en la era de la IA".
Español de España. Usa ejemplos prácticos y cifras solo si son genéricas y razonables (no inventes casos de clientes reales).
Para cada tema escribe un titular y un subtítulo para la imagen, un caption de Instagram y un post de LinkedIn.`;

const SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string", description: "titular de máx. 8 palabras para la imagen" },
    subtitle: { type: "string", description: "subtítulo de la imagen, 1 frase de máx. 15 palabras que amplía el titular" },
    instagram: { type: "string", description: "caption de 400-1200 caracteres, saltos de línea, 1-2 emojis máximo, termina con 4-6 hashtags" },
    linkedin: { type: "string", description: "post de 700-1500 caracteres, primera línea gancho, párrafos cortos, CTA final a trek-ia.com, sin hashtags o máx. 3" },
  },
  required: ["hook", "subtitle", "instagram", "linkedin"],
  additionalProperties: false,
};

// En Windows `claude` es un shim .cmd y cmd.exe corta los argumentos multilínea (SYSTEM),
// perdiendo el resto de flags; se llama directamente al .exe al que apunta el shim.
function claudeBin() {
  const shim = Bun.which("claude");
  if (process.platform !== "win32" || !shim) return "claude";
  const exe = join(dirname(shim), "node_modules/@anthropic-ai/claude-code/bin/claude.exe");
  return existsSync(exe) ? exe : "claude";
}

async function generate(topic: string, avoid: string[]): Promise<Post> {
  const prompt = avoid.length
    ? `Tema: ${topic}\n\nYa publicamos estos titulares; busca un enfoque, ejemplo y titular distintos:\n${avoid.map(h => `- ${h}`).join("\n")}`
    : `Tema: ${topic}`;
  const proc = Bun.spawn(
    [
      claudeBin(), "-p", prompt,
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

// Tarjeta con foto si toca; si falla, la tarjeta normal (mejor publicar sin foto que no publicar)
// Devuelve también el nombre de la foto usada, para guardarlo en state.json
async function card(post: Post, withPhoto: boolean, lastPhoto?: string): Promise<{ png: Uint8Array; photo?: string }> {
  if (withPhoto) {
    try {
      const photo = await pickPhoto(lastPhoto);
      console.log(`📷 Foto: ${photo.name}`);
      return { png: await renderPhotoCard(post.hook, post.subtitle, photo.data), photo: photo.name };
    } catch (e) { console.error("⚠ Sin foto, uso la tarjeta normal:", (e as Error).message); }
  }
  return { png: await renderCard(post.hook) };
}

async function main() {
  checkConfig();
  const state = await readState();
  const now = madrid();
  const monday = nextMonday(now.date);

  // El cron se lanza dos veces (verano/invierno): solo sigue el que cae a partir de las 15:00 y si la semana está sin programar
  if (SCHEDULED && now.weekday === "Fri" && now.hour < RUN_HOUR) {
    console.log(`Son las ${now.hour}:00 en Madrid; se espera al cron de las ${RUN_HOUR}:00.`);
    return;
  }
  if (!DRY_RUN && !SHARE_NOW && state.week === monday) {
    const msg = `La semana del ${monday} ya está programada (state.json → week).`;
    if (SCHEDULED) { console.log(msg); return; }
    console.error(`✘ ${msg} Si la has borrado en Buffer, quita "week" de state.json y vuelve a lanzarlo.`);
    process.exit(1);
  }

  const topics = pickTopics(state, POSTS_PER_RUN);
  const date = env.RUN_DATE || new Date().toISOString().slice(0, 10); // RUN_DATE lo fija el workflow
  let failures = 0;
  let lastPhoto = state.lastPhoto;

  // 1) Generar textos e imágenes
  const posts: { post: Post; file: string; topic: string; dueAt: string }[] = [];
  for (const [i, topic] of topics.entries()) {
    const dueAt = slot(monday, i);
    console.log(`
━━ Post ${i + 1}/${topics.length} (${SHARE_NOW ? "ahora" : dueAt}): ${topic}`);
    try {
      const post = await generate(topic, previousHooks(state.history, topic));
      const file = `media/${date}-${i + 1}.png`;
      const { png, photo } = await card(post, i + 1 === PHOTO_POST, state.lastPhoto);
      await Bun.write(file, png);
      if (photo) lastPhoto = photo;
      console.log({ ...post, image: file });
      posts.push({ post, file, topic, dueAt });
    } catch (e) { failures++; console.error("✘ Generación:", (e as Error).message); }
  }

  if (DRY_RUN || !posts.length) {
    if (failures) process.exit(1);
    return;
  }

  // 2) Publicar las imágenes en el repo y avanzar la rotación de temas
  const next: State = {
    nextTopic: (state.nextTopic + topics.length) % TOPICS.length,
    history: [...state.history, ...posts.map(p => ({ date, topic: p.topic, hook: p.post.hook }))].slice(-HISTORY_SIZE),
    lastPhoto,
    week: SHARE_NOW ? state.week : monday,
  };
  await Bun.write(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
  const sha = pushImages(posts.map(p => p.file));
  console.log(`
✔ Imágenes subidas (commit ${sha.slice(0, 7)})`);

  // 3) Programar en Buffer a la hora fija de cada post, igual en las dos redes
  for (const { post, file, dueAt } of posts) {
    const img = `https://raw.githubusercontent.com/${REPO}/${sha}/${file}`;
    console.log(`
━━ ${post.hook}
   ${img}`);
    try { await waitPublic(img); } catch (e) { failures++; console.error("✘", (e as Error).message); continue; }

    if (env.BUFFER_LI_CHANNEL) {
      try {
        const r = await createPost({ channelId: env.BUFFER_LI_CHANNEL.trim(), text: post.linkedin, imageUrl: img, shareNow: SHARE_NOW, dueAt });
        console.log(`✔ LinkedIn ${SHARE_NOW ? "publicado" : "programado"} → ${r.dueAt}`);
      } catch (e) { failures++; console.error("✘ LinkedIn:", (e as Error).message); }
    }

    if (env.BUFFER_IG_CHANNEL) {
      try {
        const r = await createPost({ channelId: env.BUFFER_IG_CHANNEL.trim(), text: post.instagram, imageUrl: img, instagram: true, shareNow: SHARE_NOW, dueAt });
        console.log(`✔ Instagram ${SHARE_NOW ? "publicado" : "programado"} → ${r.dueAt}`);
      } catch (e) { failures++; console.error("✘ Instagram:", (e as Error).message); }
    }
  }

  if (failures) process.exit(1); // que GitHub Actions marque el run en rojo y te avise
}

await main();
