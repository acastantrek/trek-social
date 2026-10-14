# trekia-social

Cada viernes a las 15:00 (hora de Madrid), GitHub Actions ejecuta `src/post.ts`:
1. **Claude** (vía Claude Code CLI, con tu suscripción Pro/Max) genera 3 posts (versión Instagram + versión LinkedIn) sobre temas de Trek.ia.
2. Genera una **tarjeta PNG** con el titular para cada post (`src/image.ts`, estilo de la web) y la sube a `media/` en este repo. El 1.º post (el del lunes, en las dos redes) lleva de fondo una **foto de personas** de `assets/personas/` (rotan en orden, a partir de la última usada guardada en `state.json`; añade más descargándolas de Unsplash).
3. Los **programa en Buffer** para el lunes, miércoles y viernes siguientes a las 09:00 (hora de Madrid), a la misma hora en LinkedIn e Instagram. No usa la cola de Buffer, así que el horario de *Posting Schedule* no influye.

Coste: Buffer Free + GitHub Actions + tu suscripción de Claude = 0 € extra. Cada run consume un poco de los límites de uso de tu plan.

## Puesta en marcha

1. **Buffer** (plan Free): conecta la página de empresa de LinkedIn e Instagram Business/Creator.
   El horario de *Settings → Posting Schedule* no hace falta: las horas las fija `src/post.ts` (`POST_HOUR` y `POST_DAYS`).
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
- **Buffer Free** permite 10 posts programados por canal. Con 3 por semana vas sobrado.
- **Para revisar antes de publicar**, tienes del viernes al lunes: los posts aparecen programados en Buffer y puedes editarlos o borrarlos desde la app.
- Los temas están en `TOPICS` dentro de `src/post.ts`, y el tono en `SYSTEM`. Se usan en orden; el siguiente está en `state.json` (solo avanza al publicar, no en dry run). Edítalo para saltar a otro tema. `state.json` también guarda los últimos titulares publicados, que se le pasan a Claude para que no repita enfoques.
- `state.json` guarda en `week` el lunes de la última semana programada, para no programar dos tandas para la misma semana. El cron se lanza a las 13:00 y a las 14:00 UTC (por el cambio de hora) y solo sigue el que llega a partir de las 15:00 en Madrid. Si borras una tanda en Buffer y quieres regenerarla a mano, quita `week` de `state.json` antes de lanzar el workflow.
- La versión de Claude Code está fijada en el workflow; súbela a mano cuando quieras actualizar.
