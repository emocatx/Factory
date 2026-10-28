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

## 6. Generalización pendiente (lo que hoy es de CAB)

| Hoy | Hacia el producto |
|---|---|
| Pilares fijos en la base de datos (Móviles, Dorsales, Críticos, Infraestructura) | **Áreas opcionales** por empresa. Con una sola área la app oculta ese nivel |
| Almacenes de un nivel | **Ubicaciones en niveles** (empresa → sitio → almacén/zona) |
| Tipo de equipo deducido del modelo (montacargas) | **Categorías de equipo** configurables (montacargas, compresor, minisplit, rack, andén…) |
| Importación con el formato de Power Apps de CAB | Plantilla genérica de importación |
| Textos y folios pensados para CAB | Configuración por empresa |

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

### Plantilla de nave (prototipo en `components/planta`, página de desarrollo `/prueba-planta`)

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
