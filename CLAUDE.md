# Factory — reglas del proyecto

Factory es un sistema de mantenimiento (CMMS) multiempresa; el primer cliente es CAB Logistics.
Next.js 15 (App Router) + React 19 + Tailwind 4 + Supabase (Postgres con RLS) + three.js / React Three Fiber.
Producción: https://factory-zeta-red.vercel.app (Vercel despliega `main`; `develop` se mantiene igual a `main`).

**Antes de cambiar algo, lee `docs/producto.md`**: ahí están las decisiones de producto y su bitácora.

## Comandos

| Para | Comando |
|---|---|
| Servidor local | `npm run dev` (en la app de escritorio: preview `factory-dev`, puerto 3000) |
| Tipos | `npm run typecheck` |
| Lint | `npm run lint` |
| Estilo (las reglas de abajo) | `npm run revisar` |
| Build de producción | `npm run build` (detén antes el servidor local: los dos usan `.next`) |

## Mapa

- `app/(app)/p/[pilar]/…`: páginas de un pilar (resumen, ordenes, cerradas, registro, equipos, planes, indicadores, analisis). Pilares: `moviles`, `criticos`, `infraestructura`.
- `app/(app)/(general)/…`: Historial, Configuración y Usuarios; llevan la barra lateral del último pilar abierto.
- `components/ui.tsx`: piezas comunes (Encabezado, Segmentado, Tarjeta, Kpi, Seccion, Vacio, Aviso, chips). `components/Desplegable.tsx`: listas y filtros.
- `components/home/` y `components/planta/`: planta 3D y los paneles que flotan sobre ella.
- `components/importar/`, `lib/planAnual.ts`, `lib/plantillaFactory.ts`: importadores de Excel.
- `lib/sesion.ts` (sesión, `exigirRol`, `sesionDePilar`), `lib/catalogos.ts` (roles, pilares, permisos), `lib/supabase/`.
- `supabase/migrations/`: esquema, RLS y funciones. `app/globals.css`: tokens de color y utilidades.

## Reglas que no se rompen

### Idioma
Interfaz, textos, comentarios, nombres y commits en español de México, con las palabras del oficio ("Mantto", "liberar", "almacén", "equipo").

### Sistema visual
Lo revisan `npm run revisar` y un hook que corre antes de cada edición (`.claude/hooks/revisar-cambios.mjs`); si te bloquea, corrige el cambio, no busques cómo saltarlo.
- Usa las piezas de `components/ui.tsx`; no inventes encabezados, tarjetas ni selectores nuevos.
- Título con `Encabezado` (34 px; 28 en celular), subtítulo gris de 15 px, filtros y acciones a la derecha en la misma fila.
- Filtros: `Desplegable` con `etiqueta` (píldora "Almacén · Todos"). Vista o periodo: `Segmentado`.
- Tarjetas: `caja-panel` con `p-5` (radio 22). Cifra principal: `.cifra` (32 px).
- Escala de letra: 10, 11, 12, 13, 14, 15, 17, 20, 22, 28, 34 y 38 px. Radios: 10, 12, 14, 18, 22 y 24 px.
- Colores solo con tokens (`tinta`, `suave`, `panel`, `papel`, `ok`, `paro`, `alerta`, `renta`, `azul`…); nada de hex ni de la paleta de Tailwind. El modo oscuro sale de los mismos tokens.
- Estados: verde `ok` = opera, rojo `paro` = detenido o en Mantto, ámbar `renta` = renta, naranja `alerta` = atención.
- Una sola acción principal por pantalla, azul (`btn-primario`); el resto `btn-sec`.
- El vidrio (`vidrio`) solo en lo que flota sobre la planta 3D.
- Funciona a 375 px sin scroll horizontal, con controles de 40 px o más, etiquetas y foco visibles.

### Datos (Supabase)
- **La base local es la de producción** (`.env.local` apunta al proyecto `oacvemqloyxqxzaszqxh`). Mientras no exista una base de pruebas, ningún agente escribe en la base: leer y simular con rollback sí; una migración solo se aplica con el OK explícito del usuario en el chat.
- Toda tabla nueva lleva `tenant_id`, RLS activado y políticas con `private.tenant_actual()` y `private.tiene_rol(...)` (y `private.pilares_actuales()` / `private.almacenes_actuales()` cuando aplica).
- Funciones con `set search_path = ''`; las `security definer` validan rol y empresa adentro; `revoke ... from public` y `grant execute ... to authenticated`.
- Una migración que ya está en git no se edita (el hook lo bloquea): se agrega una nueva, `AAAAMMDD` + 6 dígitos + `_nombre.sql`.
- Los cambios masivos se simulan primero (patrón de `simular_programa_anual`: corre, mide y deshace).
- Los errores de la base llegan a la persona traducidos al español (función `traducir` de cada `acciones.ts`).

### Seguridad
- Cada acción del servidor valida rol (`exigirRol`) y pilar (`sesionDePilar`) antes de tocar datos, y valida sus entradas (`esUuid`, `esPilar`, longitudes).
- `SUPABASE_SERVICE_ROLE_KEY` solo en el servidor; nunca en el cliente ni en una variable `NEXT_PUBLIC_`. Nunca imprimas llaves, tokens ni contraseñas.
- No descargues ni ejecutes código de terceros sin revisar. Librerías nuevas solo de npm y con un motivo claro.

### Planta 3D
- Presupuesto en `docs/producto.md` §7: 60 fps en movimiento, 0 trabajo de GPU en reposo, ≤150 llamadas de dibujo en la vista general y ≤400 en un almacén, <300 ms al entrar a un almacén, <150 MB de memoria de GPU.
- Lo que muestra el 3D también existe en 2D: el celular y los planes básicos no tienen 3D.
- Los colores de estado del 3D son los de la interfaz (`components/home/paleta.ts`).

## Equipo de agentes (`.claude/agents/`)

| Agente | Se encarga de | No toca |
|---|---|---|
| `diseno` | Pantallas y componentes con el sistema visual | Base de datos, acciones del servidor, escena 3D |
| `planta-3d` | Cómo se ve y qué tan rápida es la planta 3D | Paneles sobre la escena (son de `diseno`), datos |
| `datos` | Tablas, vistas, funciones, migraciones y consultas | Estilos |
| `seguridad` | Permisos, roles, aislamiento entre empresas, secretos, dependencias | Nada: solo lee y reporta |
| `pruebas` | Tipos, lint, estilo, build y recorridos en el navegador | Nada: solo verifica y reporta |

- Un solo agente escribe en cada archivo a la vez.
- Solo la sesión principal hace commit, push y despliegue; los agentes entregan su reporte y la sesión principal lo verifica antes de seguir.
- Toda decisión de producto va a `docs/producto.md` (su sección y una fila con fecha en la bitácora).
- Las herramientas de Supabase de los agentes usan el prefijo `mcp__e1aa57dd-516f-4587-be00-d555c2a436be__`; si cambia la conexión de Supabase en la app, actualízalo en `.claude/agents/`.

## Terminado significa
1. `npm run typecheck`, `npm run lint` y `npm run revisar` sin errores, y `npm run build` pasa.
2. Visto en el navegador en escritorio 1440×900, celular 375 y modo oscuro, con la consola sin errores.
3. `docs/producto.md` al día.
4. Commit en español, `git push origin main` y `git push origin main:develop`; el estado de Vercel del commit en "success" (API de estados de GitHub con el token de `git credential fill`, sin imprimirlo).

## Limitaciones conocidas
- No hay base de pruebas ni cuentas de prueba por rol: los flujos que escriben datos no se prueban hasta tenerlas.
- No hay pruebas automáticas todavía.
- Ningún agente ve los errores de producción (logs de Vercel).
