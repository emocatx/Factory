# Factory

GMAO y control de activos **multitenant** — Anacronyc y JRia.
Next.js 15 (App Router) · Supabase (Postgres + Auth + Realtime, RLS estricta) · Vercel.

## Qué incluye

El flujo sigue la app de Power Apps "Seguimiento de Fallas": eliges un **pilar** y trabajas con sus pestañas.

| Pantalla | Ruta | Notas |
|---|---|---|
| Login / registro | `/login` | Supabase Auth (correo + contraseña) |
| Alta de organización | `/onboarding` | El primer usuario crea el tenant y queda como admin |
| Selector de pilar | `/` | Móviles, Dorsales, Sistemas Críticos, Infraestructura (abiertas por pilar) |
| Órdenes abiertas | `/p/[pilar]/ordenes` | Tarjetas por prioridad; asignar, iniciar atención, **Concluir solicitud**, cancelar |
| Resumen de órdenes | `/p/[pilar]/resumen` | Backlog, tendencia semana/mes/año; salud por línea (Dorsales) o disponibilidad por almacén |
| Registro | `/p/[pilar]/registro` | Estándar (almacén → equipo) o Dorsales (folio único, línea, *validar*) |
| Indicadores | `/p/[pilar]/indicadores` | MTTR, MTBF, disponibilidad (base − paro real) y en paro, contra metas |
| Análisis de falla | `/p/[pilar]/analisis` | Pareto por horas o frecuencia, matriz de malos actores, equipo × componente/causa, reincidencia a 30 días y calidad del dato |
| Cerradas | `/p/[pilar]/cerradas` | Concluidas y canceladas con notas de cierre |
| Equipos | `/p/[pilar]/equipos` | Alta, edición, baja y cambio masivo de almacén/línea |
| Historial | `/historial` | Órdenes de todos los pilares + bitácora de movimientos |
| Configuración | `/configuracion` | Almacenes, líneas, componentes y causas de falla, metas y pilares activos |
| Usuarios | `/usuarios` | Invitaciones, rol y pilares de cada persona (admin) |

**Operaciones** ve solo *Seguimiento*, *Nueva solicitud* y *Cerradas*: levanta la solicitud (queda *Pendiente*) y mantenimiento la asigna, atiende y cierra definiendo origen y almacén.

Las vistas se actualizan solas vía Supabase Realtime (indicador "En vivo").

## Modelo de seguridad

- Cada tabla operativa lleva `tenant_id`, que **la base de datos asigna** (`default private.tenant_actual()`); el frontend nunca lo envía.
- Políticas RLS por tabla: lectura dentro del tenant; escritura según rol.
- Llaves foráneas compuestas `(tenant_id, id)`: es imposible ligar una orden a un equipo o línea de otro tenant.
- `tenant_id`, folio y pilar son inmutables por trigger.
- El estatus del equipo (`activo`/`en_paro`) lo calcula la base según sus órdenes abiertas.
- La bitácora la escriben triggers; los usuarios solo la leen.
- Invitaciones: el `tenant_id` va en `app_metadata` (solo editable con service role).

| Rol | Ve | Registra | Asigna / cancela | Inicia / cierra | Almacenes, equipos y catálogos | Usuarios | Metas |
|---|---|---|---|---|---|---|---|
| Administrador | todos los pilares | ✔ | ✔ | ✔ | ✔ | todos | ✔ |
| Gerente | todos los pilares | — | — | — | — | — | — |
| Coordinador | sus pilares | ✔ | ✔ | — | — | su equipo* | — |
| Supervisor | sus pilares | ✔ | ✔ | ✔ | — | — | — |
| Técnico | sus pilares | ✔ | — | ✔ | — | — | — |
| Operaciones | sus pilares | solo solicitudes (*Pendiente*) | las suyas pendientes | — | — | — | — |
| Solo lectura | sus pilares | — | — | — | — | — | — |

\* El coordinador invita y edita supervisores, técnicos, operaciones y lectores, solo con los pilares que él tiene.

## Puesta en marcha

```bash
cp .env.example .env.local   # ya viene .env.local con la URL y la llave pública del proyecto Factory
npm install
npm run dev
```

1. Abre `http://localhost:3000/login` → *Regístrala* → confirma el correo → crea tu organización.
2. En **Catálogos** da de alta almacenes, líneas y equipos.
3. Para invitar usuarios, pon `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API keys → secret) en `.env.local` y en Vercel.

### Supabase (una vez)

- **Authentication → URL Configuration:** *Site URL* = tu dominio de Vercel; agrega `https://TU-DOMINIO/auth/confirmar` y `http://localhost:3000/auth/confirmar` a *Redirect URLs*.
- **Authentication → Email Templates** (Confirm signup e Invite): cambia el enlace a
  `{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&type=email` (en Invite usa `type=invite`).
- Las migraciones de `supabase/migrations` **ya están aplicadas** en el proyecto `oacvemqloyxqxzaszqxh`.

## GitHub + Vercel (GitFlow)

```bash
git init && git add . && git commit -m "Factory: base"
git branch -M main && git checkout -b develop
git remote add origin git@github.com:TU-ORG/factory.git
git push -u origin main develop
```

- Ramas: `main` (producción) ← `develop` (integración) ← `feature/*`, `hotfix/*`.
- **Vercel:** importa el repo, framework Next.js, rama de producción `main`; cada PR obtiene un *Preview Deployment*. Variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SITE_URL`.
- **GitHub Actions** (`.github/workflows/ci.yml`): typecheck + lint + build en cada PR/push; al hacer push a `main` aplica migraciones con `supabase db push` (secretos `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`).

## Base de datos

`supabase/migrations/20261017000001_factory_esquema.sql` contiene todo: tipos, tablas, índices, triggers (folio, paro, bitácora, alta de usuario), RPCs (`crear_organizacion`, `concluir_orden`, `folio_disponible`, `tendencia_ordenes`), RLS y vistas (`v_ordenes_detalle`, `v_disponibilidad_almacen`, `v_resumen_ordenes`, `v_salud_lineas`).

Diferencias respecto a la spec original (decisiones de diseño):

- `fecha_ingreso` / `fecha_cierre` son `timestamptz` únicos; las columnas fecha/hora separadas se exponen en `v_ordenes_detalle` (`fecha_ingreso_local`, `hora_ingreso_local`…) en la zona horaria del tenant.
- `solicitante_info` → `solicitante_nombre` + `solicitante_correo`; `recibe_info` → `recibe_nombre`.
- `tiempo_paro_horas` es columna generada (no puede desincronizarse).
- Se añadió `pilar` a la orden, estatus `cancelada`, estatus de equipo `baja`, `notas_cierre`, `creado_por`, `cerrado_por` y la tabla `bitacora`.

## Clasificación de fallas

Al concluir una orden se piden dos datos por separado:
- **Qué falló** (`modos_falla`): componente o modo, por pilar (ruedas, hidráulico, banda, sensores…).
- **Por qué falló** (`origenes_falla`): causa (desgaste natural, mala operación, falta de mantenimiento…).

Así el análisis puede decir "ruedas por mala operación" en vez de mezclar componentes y causas en un solo campo.

## Diseño

Estructura de la app de Power Apps (pilar → secciones) con un lenguaje de tienda de producto: fondo gris claro, tarjetas blancas de radio amplio sin borde, títulos grandes, enlaces azules con "›", tira de navegación con iconos y listas desplegables con chevrón propio. Las ilustraciones de pilar y los iconos de sección están dibujados en código (SVG).
