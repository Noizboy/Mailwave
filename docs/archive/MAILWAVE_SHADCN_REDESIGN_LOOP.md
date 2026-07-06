# MailWave — shadcn/ui Redesign Loop Engineering

Refactor completo del sistema de diseño de MailWave para adoptar de forma consistente la librería [shadcn/ui](https://ui.shadcn.com/).

**Objetivo global**: reemplazar los estilos inline con hex crudos y las clases Tailwind arbitrarias por tokens shadcn (`--primary`, `--foreground`, `--muted`, `--card`, `--border`, `--ring`, `--popover`, `--accent`, `--destructive`) y componentes canónicos shadcn/ui, sin regresiones funcionales.

**Regla de loop**: al terminar cada tarea, marcarla como `[x]` y correr los checks mínimos (typecheck + build parcial). Al terminar todas las tareas de una fase, correr los tests unitarios.

**Comandos base** (todos desde la raíz del repo):

- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Test unitario: `npm run test`
- Dev server: `npm run dev`

---

## Fase A — Fundaciones (tokens y config)

- [x] **MW-UI-001** — Reemplazar `app/globals.css` con tokens shadcn HSL en `@theme` (background, foreground, primary, primary-foreground, secondary, muted, muted-foreground, accent, accent-foreground, destructive, destructive-foreground, card, card-foreground, popover, popover-foreground, border, input, ring, sidebar, sidebar-foreground, sidebar-primary, sidebar-accent, sidebar-border, radius). Mantener paleta visual actual (fondo `#F8FAFC`, foreground `#111827`, primary `#2563EB`, sidebar `#000000`) pero expresada como HSL.
- [x] **MW-UI-002** — Crear `components.json` en la raíz con schema shadcn (style `new-york`, base color `slate`, css variables true, react server components, alias `@/components`, `@/lib/utils`).
- [x] **MW-UI-003** — `lib/utils.ts` `cn()` ya usa clsx+twMerge — sin cambios.

## Fase B — Refactor de primitivos existentes

- [x] **MW-UI-004** — Button refactor con tokens shadcn + CVA.
- [x] **MW-UI-005** — Card refactor con tokens.
- [x] **MW-UI-006** — Input refactor con tokens.
- [x] **MW-UI-007** — Textarea refactor con tokens.
- [x] **MW-UI-008** — Label refactor con tokens.
- [x] **MW-UI-009** — Badge CVA con todas las variantes de status.
- [x] **MW-UI-010** — Table con `bg-muted/50` header y `hover:bg-muted/40`.
- [x] **MW-UI-011** — Dialog con tokens.
- [x] **MW-UI-012** — DropdownMenu con `bg-popover`.
- [x] **MW-UI-013** — Select con `bg-popover` y ring-ring.
- [x] **MW-UI-014** — Tabs con `bg-muted` y `data-[state=active]:bg-background`.
- [x] **MW-UI-015** — Switch con `data-[state=checked]:bg-primary`.
- [x] **MW-UI-016** — Checkbox con `data-[state=checked]:bg-primary`.
- [x] **MW-UI-017** — Progress con `bg-primary/20` root + `bg-primary` indicator.
- [x] **MW-UI-018** — Alert con CVA + variantes tokenizadas.
- [x] **MW-UI-019** — SlideOver refactorizado con tokens; Sheet canónico en Fase C (MW-UI-030).
- [x] **MW-UI-020** — EmptyState con tokens.
- [x] **MW-UI-021** — Toaster con tokens.

## Fase C — Nuevos primitivos shadcn faltantes

- [x] **MW-UI-022** — Añadir `components/ui/skeleton.tsx` (`bg-muted animate-pulse rounded-md`).
- [x] **MW-UI-023** — Separator añadido.
- [x] **MW-UI-024** — Tooltip añadido.
- [x] **MW-UI-025** — Popover añadido.
- [x] **MW-UI-026** — ScrollArea añadido.
- [x] **MW-UI-027** — Avatar añadido.
- [x] **MW-UI-028** — Pagination añadido.
- [x] **MW-UI-029** — Command añadido.
- [x] **MW-UI-030** — Sheet añadido con variantes left/right/top/bottom.

## Fase D — Componentes compartidos de dominio

- [x] **MW-UI-031** — Crear `components/shared/page-header.tsx` (title, breadcrumb, description slot, actions slot).
- [x] **MW-UI-032** — Crear `components/shared/metric-card.tsx` (label, value, delta con `text-destructive` o `text-emerald-600`, href opcional, icon opcional).
- [x] **MW-UI-033** — Crear `components/shared/filter-bar.tsx` (search input + slots para selects + acciones bulk).
- [x] **MW-UI-034** — Crear `components/shared/data-pagination.tsx` (window de 5 páginas, prev/next) usando el nuevo `Pagination` primitive.
- [x] **MW-UI-035** — Crear `components/shared/status-badge.tsx` que consuma las variantes de `Badge` refactorizado — reemplaza el uso disperso de `getStatusColors` inline.
- [x] **MW-UI-036** — Simplificar `lib/status-colors.ts` para que devuelva la variante `BadgeProps["variant"]` (string) en vez de `{ bg, fg }` hex. Mantener export legacy si algo externo lo usa.

## Fase E — Layout global (sidebar y topbar)

- [x] **MW-UI-037** — Refactor `components/layout/sidebar.tsx`: eliminar todos los `style={{...}}` inline. Usar tokens `bg-sidebar text-sidebar-foreground` en `<aside>` con clases Tailwind. Nav items con `hover:bg-sidebar-accent`, activo `bg-sidebar-accent text-sidebar-foreground`. Section labels con `text-xs uppercase tracking-wider text-muted-foreground`.
- [x] **MW-UI-038** — Envolver el sidebar móvil con `Sheet` (side="left"). Reemplazar la lógica CSS `@media (max-width: 780px) [data-r="sidebar"]` de `globals.css`. Mantener `SidebarProvider` como wrapper de estado.
- [x] **MW-UI-039** — Refactor `components/layout/topbar.tsx`: eliminar todos los `style={{...}}` inline. Usar `bg-background border-b`. Reemplazar botón hamburguesa con `Button variant="ghost" size="icon"`.
- [x] **MW-UI-040** — En topbar, reemplazar el popover de notificaciones hand-rolled con `Popover` + `ScrollArea` + `Card`. Iconos + colores por tokens.
- [x] **MW-UI-041** — En topbar, reemplazar el popover de perfil por `DropdownMenu` (avatar como trigger via `Avatar` shadcn).
- [x] **MW-UI-042** — En topbar, convertir `StatusPill` (SMTP/AI) en `Badge variant="outline"` con dot indicator, usando `Tooltip` en hover.
- [x] **MW-UI-043** — `app/(dashboard)/layout.tsx`: usar `bg-background`. Añadir `Toaster` global (si no está ya en `providers.tsx`).
- [x] **MW-UI-044** — `components/layout/mobile-overlay.tsx`: eliminar (Sheet lo maneja) o convertir en no-op y borrar referencia en layout.

## Fase F — Refactor de páginas y features

- [x] **MW-UI-045** — `components/dashboard/dashboard-client.tsx`: reescribir con `MetricCard` compartido (grid `md:grid-cols-3 lg:grid-cols-6`) + `Card` + `Table` shadcn para recent campaigns + `Skeleton` en loading + quick actions con `Button`.
- [x] **MW-UI-046** — `components/campaigns/campaigns-client.tsx`: `FilterBar` compartido + `Input` + `Select` shadcn + `Table` shadcn + `StatusBadge` + `DataPagination`. Eliminar todos los inline styles.
- [x] **MW-UI-047** — `components/campaigns/create-campaign-wizard.tsx`: refactor stepper con `Tabs` (o divs con tokens) + `Card` por step + `Select`/`Input`/`Textarea` shadcn.
- [x] **MW-UI-048** — `components/campaigns/campaign-detail-client.tsx`: `PageHeader` + `Card` + `Progress` + `StatusBadge`, sin inline styles.
- [x] **MW-UI-049** — `components/campaigns/campaign-review-client.tsx`: `Card` list + `Textarea` shadcn + `Button` variants + `Badge`.
- [x] **MW-UI-050** — `components/contacts/contacts-client.tsx`: `FilterBar` + `Table` shadcn + `Checkbox` shadcn + `DropdownMenu` + `StatusBadge` + `DataPagination`. Eliminar todos los inline styles.
- [x] **MW-UI-051** — `components/contacts/add-contact-client.tsx`: `Card` + `Input`/`Select` shadcn + `Button`.
- [x] **MW-UI-052** — `components/contacts/contact-profile-client.tsx`: `PageHeader` + `Card` + `Badge` + `Table` para historial.
- [x] **MW-UI-053** — `components/lists/lists-client.tsx`: `Card` grid + `Button` + `Dialog` para crear/renombrar. Sin inline styles.
- [x] **MW-UI-054** — `components/lists/list-detail-client.tsx`: `PageHeader` + `Card` para stats + `Table` shadcn de miembros + `DataPagination`.
- [x] **MW-UI-055** — `components/settings/settings-client.tsx`: reemplazar los tabs hand-rolled con `Tabs` shadcn; reemplazar el toggle custom en `NotificationsSettings` con `Switch` shadcn; eliminar todos los `style={{...}}`. `SettingField` unificado.
- [x] **MW-UI-056** — `app/(dashboard)/reports/page.tsx` + client: `PageHeader` + `MetricCard` + `Table` + `Button` para export CSV.
- [x] **MW-UI-057** — `app/(dashboard)/import/**` (revisar rutas de import review): `Card` + `Table` + `Badge` + `Button`.
- [x] **MW-UI-058** — `app/(dashboard)/upload/page.tsx`: dropzone con tokens (`border-dashed border-2 border-input hover:border-primary`), `Card` de instrucciones, `Button` para pick file.

## Fase G — Auth

- [x] **MW-UI-059** — `app/(auth)/login/page.tsx`: usar `bg-background` en wrapper, `Card` shadcn como container del form, logo con `bg-primary text-primary-foreground`, mensajes de error con `Alert variant="destructive"`.

## Fase H — Limpieza global y consistencia

- [x] **MW-UI-060** — Grep todo el codebase por `style={{` en `components/` y `app/` — no debe quedar ninguno excepto casos justificados (dropzones dinámicos, keyframes inline). Documentar excepciones.
- [x] **MW-UI-061** — Grep por hex hardcoded (`#[0-9A-Fa-f]{6}`) en `components/` y `app/` — cero resultados excepto assets.
- [x] **MW-UI-062** — Eliminar `data-r="..."` atributos si ya no se usan tras el refactor del sidebar/topbar y su CSS asociado en `globals.css`.
- [x] **MW-UI-063** — Revisar `globals.css`: eliminar reglas obsoletas del sidebar mobile y del scrollbar custom si Sheet + tokens ya cubren el caso; conservar scrollbar si aporta valor.

## Fase I — Tests y verificación

- [x] **MW-UI-064** — Actualizar `components/ui/button.test.tsx` para nuevas variantes/tokens si algún assertion se rompe.
- [x] **MW-UI-065** — Actualizar `components/campaigns/create-campaign-wizard.test.tsx` si el DOM cambió lo suficiente para romper queries.
- [x] **MW-UI-066** — Correr `npm run typecheck` — 0 errores.
- [x] **MW-UI-067** — Correr `npm run lint` — 0 errores.
- [x] **MW-UI-068** — Correr `npm run test` — 156/156 verdes (o ajustados si UI cambió).
- [x] **MW-UI-069** — `npm run build` — succeeds.
- [x] **MW-UI-070** — Smoke test manual en dev server (`npm run dev`): login → dashboard → campaigns → contacts → lists → settings; verificar que sidebar mobile funciona (Sheet) y que popovers de topbar responden.

## Fase J — Documentación

- [x] **MW-UI-071** — Actualizar `README.md` con sección "Design System" que documente los tokens HSL, cómo añadir un nuevo componente shadcn, y el patrón de `StatusBadge`.

---

## Criterio de éxito

1. `MW-UI-066` a `MW-UI-070` verdes.
2. Cero `style={{` con hex crudos en `components/` y `app/`.
3. Todos los primitivos usan tokens shadcn (`bg-primary`, `text-foreground`, etc.).
4. Sidebar móvil usa `Sheet` en lugar de CSS `@media`.
5. Los popovers del TopBar usan `Popover` + `DropdownMenu`.

## Notas

- Preservar la paleta visual actual — no cambiar la identidad visual, sólo la implementación.
- No introducir dark mode en este loop (queda para un follow-up). Sí dejar los tokens preparados con `:root` para que un futuro `.dark` bloque sea trivial.
- Instalar dependencias faltantes de una sola vez al principio de la Fase C: `npm i @radix-ui/react-tooltip @radix-ui/react-scroll-area cmdk`.
