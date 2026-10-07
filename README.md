# trekia-social

Cada lunes, GitHub Actions ejecuta `src/post.ts`:
1. **Claude** (vía Claude Code CLI, con tu suscripción Pro/Max) genera 3 posts (versión Instagram + versión LinkedIn) sobre temas de Trek.ia.
2. Genera una **tarjeta PNG** con el titular para cada post (`src/image.ts`, estilo de la web) y la sube a `media/` en este repo.
3. Los mete en la **cola de Buffer**, y Buffer los publica en los horarios que tengas configurados.

Coste: Buffer Free + GitHub Actions + tu suscripción de Claude = 0 € extra. Cada run consume un poco de los límites de uso de tu plan.

## Puesta en marcha

1. **Buffer** (plan Free): conecta la página de empresa de LinkedIn e Instagram Business/Creator.
   En cada canal, ve a *Settings → Posting Schedule* y elige días y horas (ahora: L-X-V a las 9:00, hora de Madrid).
2. **API key de Buffer**: https://publish.buffer.com/settings/api
3. **Token de Claude Code** (desde tu terminal, con Claude Code instalado y tu sesión iniciada):
   ```bash
   claude setup-token
   ```
   Copia el token que imprime (`sk-ant-oat...`); es el secret `CLAUDE_CODE_OAUTH_TOKEN`.
4. Saca los IDs de canal:
   ```bash
   bun install
   BUFFER_API_KEY=xxx bun run setup
   ```
5. Prueba sin publicar (en local usa tu sesión de Claude Code, no hace falta token). Las imágenes quedan en `media/`:
   ```bash
   bun run dry
   ```
6. Sube el repo a GitHub y añade en *Settings → Secrets and variables → Actions*:
   - **Secrets:** `CLAUDE_CODE_OAUTH_TOKEN`, `BUFFER_API_KEY`, `BUFFER_IG_CHANNEL`, `BUFFER_LI_CHANNEL`
   - **Variables (opcionales):** `POSTS_PER_RUN` y `CLAUDE_MODEL` (por defecto `sonnet`)
7. Lanza el workflow a mano desde *Actions → Run workflow* con `dry_run` marcado para ver el resultado en los logs; las imágenes se descargan como artifact `imagenes` desde la página del run. Cuando te guste, desmárcalo.

## Notas
- **El repo tiene que ser público**: Buffer descarga las imágenes desde `raw.githubusercontent.com`. Los secrets siguen siendo privados.
- El diseño de la tarjeta (colores, logo en `assets/logo.png`, tipografía Manrope) está en `src/image.ts`.
- **Buffer Free** permite 10 posts en cola por canal. Con 3 por semana vas sobrado.
- **Para revisar antes de publicar**, pausa la cola en Buffer: los posts se quedan esperando hasta que la reanudes, y mientras tanto puedes editarlos o borrarlos desde la app.
- Los temas están en `TOPICS` dentro de `src/post.ts`, y el tono en `SYSTEM`. Se usan en orden; el siguiente está en `state.json` (solo avanza al publicar, no en dry run). Edítalo para saltar a otro tema.
- La versión de Claude Code está fijada en el workflow; súbela a mano cuando quieras actualizar.
