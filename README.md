# trekia-social

Cada lunes, GitHub Actions ejecuta `src/post.ts`:
1. **Claude** genera 3 posts (versión Instagram + versión LinkedIn) sobre temas de Trek.ia.
2. Los mete en la **cola de Buffer**, y Buffer los publica en los horarios que tengas configurados.

Coste: Buffer Free + GitHub Actions = 0 €. Solo pagas la API de Claude, que son céntimos al mes.

## Puesta en marcha

1. **Buffer** (plan Free): conecta la página de empresa de LinkedIn e Instagram Business/Creator.
   En cada canal, ve a *Settings → Posting Schedule* y elige días y horas (por ejemplo, L-X-V a las 9:00).
2. **API key de Buffer**: https://publish.buffer.com/settings/api
3. **API key de Claude**: https://console.anthropic.com
4. Saca los IDs de canal:
   ```bash
   bun install
   BUFFER_API_KEY=xxx bun run setup
   ```
5. Prueba sin publicar:
   ```bash
   ANTHROPIC_API_KEY=xxx OG_URL_TEMPLATE="https://trek-ia.com/api/og?title={title}" bun run dry
   ```
6. Sube el repo a GitHub y añade en *Settings → Secrets and variables → Actions*:
   - **Secrets:** `ANTHROPIC_API_KEY`, `BUFFER_API_KEY`, `BUFFER_IG_CHANNEL`, `BUFFER_LI_CHANNEL`
   - **Variables:** `OG_URL_TEMPLATE` **o** `IMAGE_URLS` (URLs públicas separadas por comas), y opcionalmente `POSTS_PER_RUN`
7. Lanza el workflow a mano desde *Actions → Run workflow* con `dry_run` marcado para ver el resultado en los logs. Cuando te guste, desmárcalo.

## Notas
- **Instagram exige imagen.** Si no defines `OG_URL_TEMPLATE` ni `IMAGE_URLS`, el script se salta Instagram.
- **Buffer Free** permite 10 posts en cola por canal. Con 3 por semana vas sobrado.
- **Para revisar antes de publicar**, pausa la cola en Buffer: los posts se quedan esperando hasta que la reanudes, y mientras tanto puedes editarlos o borrarlos desde la app.
- Los temas están en `TOPICS` dentro de `src/post.ts`, y el tono en `SYSTEM`.
