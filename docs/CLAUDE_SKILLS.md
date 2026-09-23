# Skills de Claude Code y MCP instalados en este proyecto

Instalados el 2026-09-23 para mejorar el trabajo de frontend/UX. Viven en `.claude/skills/` (fijados en `skills-lock.json`, reinstalables con `npx skills@latest add <repo> --skill <nombre> -a claude-code -y`) y en `.mcp.json`.

> El checklist de qué hacer al abrir este proyecto en una máquina nueva (aprobar MCP, `API_KEY_21ST`, precalentar `impeccable`) está en `CLAUDE.md` en la raíz — Claude Code lo lee solo al iniciar sesión ahí, no hace falta pedirlo de nuevo.

## Skills de diseño

| Skill | Repo | Para qué sirve |
|---|---|---|
| `frontend-design` | [anthropics/claude-code](https://github.com/anthropics/claude-code) | Skill oficial de Anthropic para decisiones de diseño visual no genéricas |
| `ui-ux-pro-max` | [nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | Base de datos consultable de paletas, tipografías, guías UX (100% local) |
| `emil-design-eng` | [emilkowalski/skills](https://github.com/emilkowalski/skills) | Filosofía de pulido UI / animación de Emil Kowalski |
| `impeccable` | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) | Comandos `/impeccable audit`, `polish`, `critique`, `doctor`, etc. |
| `design-taste-frontend` | [Leonxlnx/taste-skill](https://github.com/Leonxlnx/taste-skill) | Skill "anti-slop" contra diseño genérico de IA |
| `web-design-guidelines` | [vercel-labs/agent-skills](https://github.com/vercel-labs/agent-skills) | Audita código UI contra las Web Interface Guidelines de Vercel |

`huashu-design` se probó e instaló el mismo día pero se removió: su propio `SKILL.md` indica que no aplica a apps de producción con backend (es para prototipos/slides HTML desechables), y traía ~33MB de audio innecesarios para este proyecto.

## MCP servers (`.mcp.json`)

- **playwright** (`npx @playwright/mcp@latest`) — deja a Claude manejar un navegador real (clicks, screenshots, DOM) para revisar cambios de UI. Sin API key.
- **21st** (`https://21st.dev/api/mcp`) — catálogo de 12,000+ componentes React/Tailwind, búsqueda de logos, generación de UI. Necesita `API_KEY_21ST` como variable de entorno local (cada desarrollador saca su propia key en https://21st.dev/mcp — la key nunca se commitea, solo la referencia `${API_KEY_21ST}` en `.mcp.json`).

## Dependencia de GitHub — importante si trabajas desde una red que lo bloquea

No todas las skills dependen de GitHub de la misma forma una vez instaladas:

| Componente | ¿Depende de GitHub para funcionar? |
|---|---|
| `frontend-design`, `emil-design-eng`, `design-taste-frontend`, `ui-ux-pro-max` | No — contenido y datos ya copiados localmente |
| `impeccable` | Solo la primera vez (descarga un binario firmado desde GitHub Releases y lo cachea en `~/.impeccable/`). **Ya se precalentó en este equipo** (`impeccable doctor --json`), así que funciona offline de aquí en adelante en esta máquina. En un equipo nuevo, correrlo una vez con red abierta antes de ir a un sitio con GitHub bloqueado |
| `web-design-guidelines` | **Sí, siempre.** Va a buscar las reglas frescas a `raw.githubusercontent.com` en cada ejecución, sin caché ni respaldo. No hay forma de precalentarla |
| Playwright MCP | No depende de GitHub (usa `npmjs.org` + Chromium ya descargado) |
| 21st MCP | No depende de GitHub (conexión HTTP directa a `21st.dev`) |

**Política acordada**: si una skill necesaria no puede conectarse a GitHub (ej. `web-design-guidelines` desde una red que lo bloquea), no se descarta ni se reemplaza por otra cosa — se avisa explícitamente "conéctate a otra red para poder usar esta skill" y se espera, en vez de trabajar alrededor del bloqueo o quitar la herramienta.
