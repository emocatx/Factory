# Factory: producto y modelo de negocio

Documento vivo. Se actualiza cada vez que una decisión cambia lo que es núcleo, configuración o módulo.
Última actualización: 2026-10-28 (plantilla de nave).

## 1. Qué estamos construyendo

Factory nace como un sistema a la medida para **CAB Logistics** (mantenimiento de una flota grande de
montacargas y equipos en muchos almacenes). Al mismo tiempo es la **base de un producto por suscripción**
para cualquier empresa que mantenga equipos.

**Regla de oro:** un solo código y una sola base de datos para todos los clientes. Nunca se escribe
"si la empresa es CAB, haz esto": todo lo de CAB es configuración o un módulo encendido. Así cada mejora
para CAB también mejora el producto.

## 2. Las cuatro capas

| Capa | Qué contiene | Quién la cambia |
|---|---|---|
| **1. Núcleo** | Órdenes, equipos, ubicaciones, roles, alcance, indicadores (MTTR, MTBF, disponibilidad), análisis de falla, planes, usuarios autogestionados, importación | El equipo de Factory, igual para todos |
| **2. Configuración** | Nombres ("Almacén", "Planta"…), metas, interruptores (alcance por almacén), catálogos de fallas, logo | El admin de cada empresa, sin código |
| **3. Módulos activables** | Resumen 3D, coberturas temporales, metas por almacén, integraciones (SAP, WhatsApp) | Se encienden por empresa; sirven para planes de precio |
| **4. A la medida** | Lo que pide un cliente específico | Se construye como módulo genérico, apagado para los demás |

**Versión exclusiva:** solo como *instancia dedicada* (mismo código, servidor y base de datos propios) para
un cliente que exija aislamiento total. Se cobra como premium; no se mantiene un código aparte.

## 3. Empresas (multi-tenant)

- Cada empresa (tenant) solo ve sus datos: lo garantiza la base de datos (RLS), no las pantallas.
- Una empresa nueva se crea sola (`crear_organizacion`) y su admin da de alta a su gente.

## 4. Personas: rol + alcance

Cada persona tiene un **rol** (qué puede hacer) y un **alcance** (dónde): sus áreas y sus almacenes.
La regla de los dos: **nadie da más de lo que tiene**.

| Rol | Ve | Hace | Da de alta a |
|---|---|---|---|
| Admin | Todo | Todo, incluida la configuración | Cualquier rol |
| Gerente | Todo | Solo consulta y análisis; gestiona personas, almacenes y responsables. No opera órdenes | Coordinador, supervisor, técnico, operaciones, lector |
| Coordinador | Sus almacenes | Registra y asigna; no inicia ni cierra | Supervisor, técnico, operaciones, lector (en sus almacenes) |
| Supervisor | Sus almacenes | Registra, asigna, atiende y cierra | Técnico, operaciones (en sus almacenes) |
| Técnico | Sus almacenes | Registra, inicia y cierra | — |
| Operaciones | Sus almacenes | Levanta solicitudes y les da seguimiento | — |
| Lector | Sus almacenes o todos | Solo consulta | — |

- **Alcance por almacén** (`tenants.alcance_por_almacen`): se enciende por empresa. Apagado, cada quien
  ve todos los almacenes de sus áreas (útil para empresas chicas).
- **Todos los almacenes** (`usuarios_perfiles.todos_almacenes`): para planeación o un coordinador
  nacional. Solo lo otorgan admin y gerente.
- **Asignaciones** (`usuarios_almacenes`): almacén, responsable del almacén y vigencia (coberturas temporales).
- **Si alguien se va**, el admin o el gerente reasignan a su gente y sus almacenes.

## 5. Reglas de operación

- **Almacén de la orden:** se toma del equipo al registrarla y no cambia.
- **Traslado de equipo:** las órdenes abiertas las termina el almacén de origen; las nuevas caen en el
  nuevo almacén. El historial se queda donde ocurrió.
- **Metas:** una por empresa (lo que usa CAB). Metas por almacén quedan como módulo opcional.
- **Periodo y almacén** viajan entre páginas (Resumen, Órdenes, Indicadores, Análisis).

### Hallazgos automáticos (fase 1)

Frases con un número, su base y una acción a un clic, calculadas con reglas sobre los datos del pilar
(`lib/hallazgos.ts`; la carga, con los permisos de quien mira, en `lib/hallazgosDatos.ts`). Cada regla se calla si no
hay evidencia suficiente. Se ordenan por urgencia y, dentro de la misma, por horas de paro.

| # | Hallazgo | Aparece cuando | Acción | Quién lo ve |
|---|---|---|---|---|
| 1 | Órdenes sin asignar | Pendientes sin técnico por más de 24 h (avisa cuántas vienen del historial importado) | Asignar | Admin, supervisor, coordinador |
| 2 | Preventivos vencidos | Servicios con más de 7 días de atraso, por almacén | Ver calendario | Todos |
| 3 | Falla repetitiva | Un componente junta ≥30 % de las fallas de 30 días (mínimo 5 fallas y 3 del componente) y no hay plan con su nombre | Crear plan (prellenado) / Ver análisis | Todos |
| 4 | Equipo reincidente | ≥3 fallas en 30 días, o el mismo componente falla ≥2 veces a menos de 30 días de repararse | Ver en análisis | Todos |
| 5 | Órdenes sin movimiento | Asignadas o en proceso sin cambios por más de 7 días | Revisar órdenes | Admin, supervisor, coordinador |
| 6 | Calidad del dato | ≥20 % de las fallas cerradas en 30 días sin componente o sin causa (mínimo 5 cerradas) | Ver análisis | Admin, supervisor, coordinador |

- El componente sale de la falla capturada; si no lo trae, de palabras de la descripción ("rueda", "llanta", "batería"…).
  La familia del equipo sale de su categoría (programa anual); si no la tiene, del nombre ("Transpaleta…").
- Dónde: Resumen (tarjeta con los 3 primeros; en la planta 3D, botón "Hallazgos" que abre un panel), y Planes (solo
  la falla repetitiva, como sugerencia de plan).
- Pendiente: fase 2 (guardar "no aplica" por 30 días y medir el antes y el después de cada plan creado desde un
  hallazgo) y fase 3 (resumen semanal por correo o WhatsApp).

## 6. Generalización pendiente (lo que hoy es de CAB)

| Hoy | Hacia el producto |
|---|---|
| Pilares fijos en la base de datos (Móviles, Dorsales, Críticos, Infraestructura) | **Áreas opcionales** por empresa. Con una sola área la app oculta ese nivel |
| Almacenes de un nivel | **Ubicaciones en niveles** (empresa → sitio → almacén/zona) |
| Tipo de equipo deducido del modelo (montacargas) | **Categorías de equipo** configurables (montacargas, compresor, minisplit, rack, andén…) |
| Importación con el formato de Power Apps de CAB | Plantilla genérica de importación |
| Programa anual en el formato CABLOMTO-F01 | Hecho: **importador único** con plantilla Factory, mapeo de columnas guardado por empresa y CABLOMTO como traductor |
| Textos y folios pensados para CAB | Configuración por empresa |

### Importador único (en Planes, solo admin)

Un solo recuadro, **Importar programa de mantenimiento**, en tres pasos con indicador: **Subir archivo → Revisar →
Confirmar**. Reemplaza al cargador del programa anual y al "Cargar plan desde Excel", que se repetían. Todos los
caminos llegan a la misma vista previa y a la misma carga (`cargar_programa_anual`).

Dos entradas:

1. **Plantilla Factory** (`lib/plantillaFactory.ts`): el estándar que se vende. Excel plano, una fila por activo y
   frecuencia. Se descarga con los almacenes de la empresa y las frecuencias y categorías en listas desplegables
   (hojas Programa, Listas e Instrucciones; escritor propio en `lib/xlsx.ts`, sin dependencias).

   | Obligatorias | Opcionales |
   |---|---|
   | Almacén, Denominación, Frecuencia (1M…12M, "bimestral", "60 días", "3M-6M") | SAP, Clave, Categoría (si no, se deduce), Próxima fecha o Último servicio, Servicio (nombre del plan), Plan SAP, Tareas |

2. **Formato propio del cliente**:
   - **Tabla plana con otros títulos** (p. ej. "Sitio", "No. SAP", "Cada cuánto"): Factory une lo que reconoce y la
     persona completa el resto una vez; el mapeo queda guardado para la empresa (`tenants.mapeos_importacion`,
     por firma de encabezados) y el mes siguiente ya no se pregunta. Se salta renglones de título arriba.
   - **Formato de matriz conocido** (CABLOMTO-F01 de CAB): traductor dedicado. Para otro cliente con formato de
     matriz propio, el traductor se cobra como implementación (capa 4); los mapeos guardados son configuración (capa 2).

También se recuerda **a qué almacén de Factory va cada almacén del archivo** (incluido "No cargar"). Además el
empate sugiere por palabra ("CULIACAN Mari" → CDE Culiacan). Con varias opciones (AMSA, AGRO) pregunta solo la
primera vez.

**Simulación antes de confirmar.** Al llegar a Confirmar, Factory corre la carga completa en la base y la deshace
(`simular_programa_anual`: subtransacción que mide y revierte). El paso muestra lo que de verdad va a pasar:
equipos nuevos, equipos existentes que cambian (con antes → después de nombre, categoría y almacén), planes y
asignaciones nuevas, equipos que no vienen en el archivo y cómo queda la agenda (vencidos, próximos 30 días,
después). Si la carga fallaría, lo dice ahí y no deja cargar. La primera simulación real (2026-10-29) encontró dos
errores que habrían tirado la carga completa: consecutivos repetidos (Móviles y Críticos numeran por almacén) y una
fecha "31 SEP" en Inmueble.

Reglas que salieron de esa simulación:
- El consecutivo de los activos sin SAP es su clave (INF-784) **solo si no se repite en el archivo**. Si se repite,
  el archivo numera por almacén y esos activos se reconocen al recargar por almacén y nombre. Una clave repetida
  se conserva en su primera aparición.
- Una fecha con día imposible ("31 SEP 26") se toma como fin de mes.

Permisos: crea y actualiza equipos, así que solo el administrador. Los demás editores siguen creando planes y
asignándolos desde la pantalla. La carga de equipos con ficha técnica (serie, modelo, proveedor) sigue en Equipos, y
la de almacenes en Configuración.

### Programa anual CABLOMTO-F01 (traductor)

`lib/planAnual.ts` lee el Excel del programa anual (una fila por activo: almacén, número SAP, denominación,
plan por frecuencia 1M…12M, lanzamientos y horas por servicio) y lo convierte en:

- **Activos con categoría** (andén, louver, extractor, inyector, racks, oficinas, muros y pisos, áreas…),
  deducida de la denominación y revisable.
- **Planes propuestos**, uno por categoría y frecuencia, conservando los códigos de plan de SAP.
- **Fichas de almacén**: andenes ("Andén CDNQ 12"), pasillos ("racks/juntas y grietas pasillo 05") y zonas.
  Validado con CDN 5: 57 andenes y 35 pasillos, igual que su plano.
- **Problemas** a limpiar: consecutivos internos en lugar de número SAP, SAP repetidos, activos sin
  frecuencia y fichas incompletas.

Primer archivo (Infraestructura, 2026): 2,679 activos en 15 almacenes; 999 con consecutivo interno en vez de
SAP (CDN 1, 2, 3 y 5); faltan pasillos en 10 almacenes.

Segundo archivo (Servicios Críticos, 2026): mismo formato con variaciones que el lector ya tolera (todo corrido una
columna y una columna extra "MERCADO"). 948 activos en 49 sitios; 26 sitios (CPH y MDTEC) no existen en Factory y
se marcan "No cargar" (o se crean antes como almacenes). Categorías propias: climatización, refrigeración,
compresor, ósmosis, cárcamo e instalación eléctrica. No trae andenes ni pasillos, así que no toca las fichas.

Tercer archivo (Móviles, 2026): misma plantilla con otras variaciones, ya toleradas: la columna de almacén no
tiene título, los almacenes traen texto extra ("TORREON Mari") y una fecha puede juntar frecuencias
("06 MAY 26 3M-6M"). 1,141 activos en 24 almacenes y 21 planes; categorías de móviles: montacargas, transpaleta,
patineta, batería, cargador, cambiador de baterías, diablo, restregadora y plataforma o apilador. Las demás hojas
(programa semanal de órdenes) también se pueden subir como tabla plana.

**Estándar mínimo del programa anual** (lo que el lector necesita; el orden de columnas puede variar):

| Obligatorio | Opcional |
|---|---|
| Una fila de encabezados con **N°** y **DENOMINACIÓN** | Hoja llamada `CABLOMTO-F01-I41` (si no, se toma la primera que se reconozca) |
| Columna **ALMACEN** a la izquierda (en esa fila o arriba; sin título se toma la columna con texto) | **LANZAMIENTOS** y **TIEMPO POR FRECUENCIA (H)** |
| Bloque **PLAN DE MANTENIMIENTO** con la fila de frecuencias **1M · 2M · 3M · 4M · 6M · 12M** | Calendario a la derecha de **NÚMERO DE SEMANA** con celdas `DD MMM AA 4M` |
| Una fila por activo | Columnas extra (célula, mercado…): se ignoran |

**Carga** (`cargar_programa_anual`, migración `20261028000003`): todo en una transacción, con los permisos del
admin que la hace, y repetible sin duplicar.

- Equipos: se reconocen por SAP, por su clave (la de la plantilla, p. ej. `MC-04`, o el consecutivo con el prefijo
  del pilar: `INF-123`, `CRI-…`, `MOV-…`) o por nombre dentro del almacén. Si ya existen se actualizan nombre,
  categoría y almacén; se guarda `equipos.categoria`. Un SAP que ya usa otro pilar se carga sin SAP.
- Planes: uno por categoría y frecuencia (los que ya existen no se tocan); las tareas guardan los códigos SAP.
- Asignaciones: la fecha de asignación se calcula para que el **próximo servicio caiga en la fecha del
  programa**; si ya pasaron todas las fechas del año, la última se toma como hecha. Sin fechas, desde hoy.
  Las asignaciones que ya existían conservan su avance.
- Fichas: `almacenes.ficha` (andenes, pasillos, zonas, techo, fuente y fecha), mezclada con lo que ya tuviera.
- Bitácora: un solo registro con el resumen ("Carga del programa anual"), no uno por equipo.
- Medido: 2,700 activos en menos de 1 s.

## 7. Visualización 3D

- **Núcleo (todos los planes):** vista 2D (tarjetas, indicadores, listas). Funciona para cualquier equipo.
- **Módulo 3D (plan superior):** modelos genéricos por categoría hechos en código. Un equipo sin modelo se
  ve como ficha de color con su estado, nunca vacío.
- **Servicio a medida (cobro aparte):** modelos del cliente (generados con IA desde fotos o hechos por un
  modelador): su nave y sus equipos reales.

Presupuesto de rendimiento del módulo 3D (equipo de oficina con gráficos integrados):

| Medida | Meta |
|---|---|
| Cuadros por segundo | 60 con movimiento; 0 trabajo de GPU en reposo |
| Llamadas de dibujo | ≤ 150 en la vista general, ≤ 400 en un almacén |
| Entrar a un almacén | < 300 ms |
| Memoria de GPU | < 150 MB |
| Celular | Sin 3D: vista 2D |

**Reglas de lectura (2026-10-30, con el programa de Inmueble de CAB):**
- Un número que sigue la serie 1, 2, 3… del archivo es consecutivo, aunque tenga 4 dígitos (`serieConsecutiva`: el
  número más alto con al menos el 90 % de 1…n presente). En Inmueble la serie llega a 2127 y los SAP son de 5 dígitos;
  en Móviles (tope 158) y Críticos (tope 92) los SAP de 4 dígitos quedan fuera de la serie.
- Andenes con número romano en medio ("Anden MTY II 01") cuentan para la ficha.
- Fechas con errores de captura: "0CT", "25MAY", "OCT26", "264M", "18 MOV", "EN".
- **Equipo o servicio (2026-10-31).** Un equipo se nombra EQUIPO ALMACÉN NÚMERO ("Andén SMO 01"). Una fila que empieza
  con la actividad (revisión, reparación, inspección, resane, pintura, limpieza, balizamiento…; `SERVICIO`) es un
  servicio aparte: no se junta con el equipo que nombra, no cuenta para la ficha ni se dibuja (categoría pintura,
  limpieza o "Servicios generales"), y si no trae SAP su clave hace de número (INF-11). Un **equipo** sin SAP se carga
  con su consecutivo y queda "Falta alta SAP" en Equipos hasta que se capture.
- La plantilla Factory todavía admite varias actividades con la misma frecuencia en un equipo (filas con el mismo
  equipo y otro Servicio), pero el planeador ya no fusiona servicios del archivo con sus equipos.

### Plantilla de nave (en el Resumen; motor en `components/planta/Nave.tsx`, pruebas en `/prueba-planta`)

**Cómo se arma cada almacén (sin código por almacén).** Al entrar a un almacén en el Resumen se ve su nave armada con
una ficha y su flota real. La ficha se toma en este orden:
1. `almacenes.ficha` (capturada o cargada con el programa de Inmueble), si existe.
2. Derivada de los equipos registrados del almacén (`fichaDesdeEquipos`): andenes ("Andén…"), pasillos ("racks pasillo N"),
   zonas y techo, con las mismas reglas del importador.
3. Estimada por el tamaño de la flota (proporción de CDN 5, mínimo 6 andenes y 4 pasillos, solo taller) mientras el almacén
   solo tenga montacargas. Se vuelve exacta sola al cargar Inmueble y Críticos.

Adentro va la flota real: tipo según el modelo y color de estado (verde opera, ámbar renta, rojo en Mantto en el taller).
La escena dibuja a pedido: con 10 s sin actividad se detiene (0 trabajo de GPU en reposo); con "reducir movimiento" no anima.
Medición en desarrollo (GTX 1660 Ti, 1440×900): CDN 5 de 2,720 a 157 llamadas de dibujo, 144 fps, entrada de 184–394 ms.
Reglas (2026-10-30): el taller crece hasta que quepan todos los equipos en Mantto; con más de 40 andenes van en los dos
lados; el tipo de cada montacargas sale de su categoría y, si no la tiene, del modelo (RR5… es reach); en la planta de
Móviles los equipos de Críticos se ven neutros (su estado va en la planta de Críticos). Tamaño estimado: proporción de CDN 5.
Pendiente: confirmar en un equipo con gráficos integrados, memoria en pantallas de alta densidad, comedor y techo sin pieza.

#### Prototipo original

Cada almacén se dibuja desde una **ficha** corta, no desde un plano hecho a mano:

- **Ficha:** andenes (cantidad y si van en uno o dos lados), pasillos de racks y qué zonas existen (taller,
  carga de baterías, refacciones, soldadura, oficinas, baños, ósmosis, cárcamo, subestación, tarimas).
  Sale de las ubicaciones técnicas de SAP (contando `AND###`, `PAS###` y viendo qué zonas hay, como
  `TL5-CL05-ALMELE-PAS012`) o de un formulario en la configuración del almacén.
- **Estructura** (piso, muros, racks, andenes, zonas): siempre presente, como contexto.
- **Activos** (montacargas, cargadores, ósmosis, cárcamo, tableros, compresores, minisplits, puertas de
  andén): salen de los equipos registrados con su **categoría** y su **ubicación**; nada se cuenta a mano.
- **Vista por pilar:** cada pilar resalta sus activos con color de estado y deja lo demás en gris neutro.
  A qué pilar va cada categoría es configuración de la empresa (en CAB: ósmosis → Críticos, andenes y
  racks → Inmuebles). Una empresa sin pilares ve todo en una sola vista.
- **Marcas en pantalla:** lo importante del pilar y todo lo que está en falla lleva una etiqueta de tamaño
  fijo, para encontrarlo en naves de 300 m.
- **Movimiento:** los equipos de pasillo van y vienen por su pasillo; los de embarque circulan en un
  circuito cerrado en el mismo sentido, así nunca se enciman.

Medición del prototipo (modo desarrollo, 1440 × 860): CDN 5 (288 × 122 m, 57 andenes, 35 pasillos,
66 montacargas, 53 activos) a 110–138 fps con 196–301 llamadas de dibujo y 25–28 mil triángulos.

### Lenguaje visual común

El Resumen de Móviles y la barra lateral marcan el estilo de toda la app; las demás páginas usan las mismas piezas
(`components/ui.tsx`), así que un cambio ahí cambia todas:
- **Título** de 34 px (28 en celular) con subtítulo gris de 15 px; filtros y acciones a la derecha, en la misma fila.
- **Filtros en píldora** con la etiqueta dentro ("Almacén · Todos"), 40 px de alto.
- **Selector de vista o periodo** (`Segmentado`): pista blanca y la opción elegida en negro, igual que el periodo del Resumen.
- **Tarjetas** de radio 22 px (el de la barra lateral) y 20 px de relleno; la cifra principal mide 32 px en todas (`.cifra`).
- **Indicadores** sin icono en caja: icono gris pequeño junto a la etiqueta.
- **Un solo color de acción principal**: azul ("Registrar", "Crear plan", "Liberar equipo").
- **Escala cerrada**: letra de 10, 11, 12, 13, 14, 15, 17, 20, 22, 28, 34 y 38 px; radios de 10, 12, 14, 18, 22 y 24 px; colores solo
  con tokens. La revisa `npm run revisar` y un hook antes de cada edición de un agente (ver `CLAUDE.md`).
- El vidrio queda solo para lo que flota sobre la planta 3D; en las páginas planas las tarjetas son blancas y opacas.
- **La barra lateral está en toda la app de trabajo**: Historial, Configuración y Usuarios muestran la del último pilar
  abierto (cookie `pilar`; si no hay, el primero que la persona puede ver). Solo "Elige tu pilar" va sin barra.

## 8. Planes de suscripción (borrador)

| Plan | Incluye |
|---|---|
| Básico | Núcleo en 2D, hasta N equipos y usuarios |
| Profesional | + alcance por almacén, planes de mantenimiento, análisis completo |
| Empresarial | + módulo 3D, integraciones, coberturas, soporte |
| A la medida | Gemelo digital, instancia dedicada, desarrollos específicos |

## 9. Bitácora de decisiones

| Fecha | Decisión |
|---|---|
| 2026-10-27 | Altas en cascada; el coordinador conserva invitar supervisores y técnicos |
| 2026-10-27 | En celular no hay 3D: registro y métricas en 2D |
| 2026-10-28 | Alcance por almacén con interruptor por empresa (apagado por omisión) |
| 2026-10-28 | El gerente no opera: consulta y gestiona personas |
| 2026-10-28 | Traslado de equipo: la orden abierta la termina el almacén de origen |
| 2026-10-28 | Metas por empresa; por almacén como módulo opcional |
| 2026-10-28 | Pilares pasarán a áreas opcionales; ubicaciones y categorías en el núcleo |
| 2026-10-28 | 3D: genéricos por categoría como módulo; modelos reales como servicio a medida |
| 2026-10-28 | Plantilla de nave: cada almacén se arma desde su ficha (SAP o formulario), no se dibuja a mano |
| 2026-10-28 | Vista por pilar: el almacén es el mismo edificio; cada pilar resalta sus activos y lo demás queda neutro |
| 2026-10-28 | Ubicaciones técnicas de SAP como modelo de ubicaciones del producto (sitio → centro → zona → ubicación) |
| 2026-10-28 | El programa anual (CABLOMTO-F01) es la fuente de activos, planes y fichas de Infraestructura y Críticos; primero vista previa |
| 2026-10-28 | "AGRO" del programa anual = AGRO INSUMOS; las cuadrillas (célula A/B/C/E) ya no se validan |
| 2026-10-28 | Categoría de equipo y ficha de almacén en la base; carga del programa anual en una transacción, solo admin |
| 2026-10-28 | Las fechas pasadas del programa anual se consideran hechas; el próximo servicio sigue el calendario del archivo |
| 2026-10-28 | Críticos: los 26 sitios CPH y MDTEC no se cargan por ahora (no existen como almacenes en Factory) |
| 2026-10-29 | Importador único en 3 pasos: plantilla Factory como estándar; formatos propios por mapeo guardado (tabla) o traductor (matriz) |
| 2026-10-29 | Se recuerdan por empresa las columnas de cada formato y el almacén elegido para cada almacén del archivo |
| 2026-10-29 | El importador es solo del admin (crea equipos); el "Cargar plan desde Excel" de editores se retira |
| 2026-10-29 | Confirmar muestra una simulación real de la carga (se corre y se deshace); si fallaría, no deja cargar |
| 2026-10-29 | El consecutivo solo es clave si es único en el archivo (Móviles y Críticos numeran por almacén) |
| 2026-10-29 | Todas las páginas toman el estilo del Resumen y la barra lateral: título 34 px, filtros en píldora, selector negro, cifras de 32 px, acción principal azul |
| 2026-10-29 | Historial, Configuración y Usuarios conservan la barra lateral del último pilar abierto |
| 2026-10-30 | Equipo de agentes (diseño, planta 3D, datos, seguridad, pruebas) con reglas en `CLAUDE.md` y revisión automática de estilo y migraciones; ningún agente escribe en la base hasta tener una base de pruebas |
| 2026-10-30 | Hallazgos automáticos, fase 1: seis reglas con mínimo de evidencia y una acción, en Resumen y Planes; reemplazan la sugerencia única de Planes |
| 2026-10-30 | Movimiento y celular según las skills de Emil Kowalski: entrada de página de 200 ms, menús que crecen desde su botón, campos de 16 px en pantallas táctiles, toque inmediato y altura `dvh` |
| 2026-10-30 | Plantilla de nave para todos los almacenes: ficha capturada → derivada de sus equipos → estimada por flota; flota real adentro; escena a pedido |
| 2026-10-30 | Plantilla 3D: taller que crece con los equipos en Mantto, andenes en dos lados con más de 40, tipo por categoría y luego modelo, Críticos neutros en Móviles |
| 2026-10-30 | Agente planeador y reglas del importador: consecutivos de 4 dígitos, andenes con número romano, fechas mal escritas y varias actividades con la misma frecuencia por equipo |
| 2026-10-31 | Equipo y servicio son filas distintas: "Resane y pintura andén CDNF 03" no es un servicio del andén CDNF 3; los servicios usan su clave como SAP y sin render; los equipos sin SAP quedan por dar de alta |
