# YJBMOTOCOM — instrucciones para Claude Code

Ver `README.md` para la visión general del proyecto y `docs/README.md` para el índice de documentación.

## Skills y MCP de diseño (`.claude/skills/`, `.mcp.json`)

Este repo trae 6 skills de diseño/UX de Claude Code y 2 servidores MCP (Playwright, 21st.dev). Detalle completo, con tabla de dependencia de GitHub, en `docs/CLAUDE_SKILLS.md` — léelo si hace falta más contexto.

`git pull` trae solo `.claude/skills/`, `.mcp.json` y `skills-lock.json`. Hay pasos que son **por máquina** y no viajan con git — la primera vez que se abra este proyecto en una máquina nueva (p. ej. el PC del trabajo), haz esto proactivamente sin que el usuario tenga que pedirlo:

1. **Aprobar los MCP servers** cuando Claude Code lo pida al detectar `.mcp.json`.
2. **21st MCP necesita su API key por máquina**: si `mcp__21st__get_usage` falla o no está disponible, pide al usuario `setx API_KEY_21ST "<su key de https://21st.dev/mcp>"` (misma key de su cuenta, se reutiliza) y que reinicie la terminal/sesión.
3. **Precalentar `impeccable`**: su binario vive en `~/.impeccable/` de esa máquina, no en el repo. Si no está descargado, correr `/impeccable doctor` una vez — necesita GitHub solo esa primera vez; después queda cacheado y funciona sin red. Si GitHub está bloqueado en esa red, pedir al usuario un hotspot/red alterna un minuto para ese paso.
4. **Playwright MCP** descarga Chromium solo en su primer uso si falta — no depende de GitHub, no requiere nada manual.

**`web-design-guidelines` necesita `raw.githubusercontent.com` en CADA uso, sin excepción — no se puede precalentar.**

**Política de red bloqueada** (aplica a esta skill y a cualquier otra que dependa de una red no alcanzable): si una herramienta necesaria no puede conectarse por la red actual, **no la descartes, no la reemplaces por otra cosa ni trabajes alrededor del bloqueo**. Dile al usuario explícitamente que se conecte a otra red para poder usarla, y espera su confirmación antes de continuar con esa tarea.
