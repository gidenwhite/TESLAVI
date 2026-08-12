# Plan — Configuración de Cuotas durable + Cambio de Gestión (Financiero)

**Pedido:** en Financiero → Configuración, la parte de "cuotas" debe ser un valor institucional que dura en el tiempo pero se puede ajustar, y falta definir bien las **fechas de pago**. Además, el sistema tiene que poder repetirse gestión tras gestión: promover estudiantes de semestre, matricular nuevos, y que los reportes de plata trabajen sobre **una gestión a la vez**, sin mezclar gestiones pasadas con la actual.

## ✅ Estado: implementado (2026-08-08), falta correr la migración

Todo lo de abajo ya está escrito en el código. Lo único que falta para que funcione de verdad es que **vos corras `supabase/migraciones/017_cambio_de_gestion.sql` en Supabase → SQL Editor** (una sola vez, completo, después de la 016). Sin eso, la tarjeta "Cambio de Gestión" y las fechas de cuota van a tirar error al usarlas porque las tablas/funciones nuevas todavía no existen en la base real.

Qué se hizo en `index.html`:
- **Fase A (rediseñada, ver nota abajo)** — en vez de un "día del mes" único, ahora es una tabla **"Fechas de pago de cada cuota, por turno"**: para cada cuota (1..N, según "Número de cuotas por defecto") y cada turno, un rango Desde/Hasta. El "Hasta" es lo que se guarda como vencimiento real de esa cuota.
- **Fase C** — botón "Cerrar gestión actual" (mismo lugar), como red de seguridad manual.
- **Fase E** — opción "Egresado" en el estado del estudiante, excluida de Por Cobrar/Deudores igual que Retirado/Abandono.
- **Fase D** — tarjeta nueva "Cambio de Gestión": calcula sugerencia (promueve/repite/egresa) por estudiante activo cruzando sus materias reprobadas (motor de notas ya existente) contra el campo `pre` de `planEstudios`, y el admin tilda el resultado a mano fila por fila antes de confirmar. También agrega un aviso "⚠ Troncal" en la pantalla de Arrastres existente, con el mismo cálculo.
- **Nota sobre Fase B** (filtro de gestión en los paneles): no hizo falta un selector nuevo — `cargarTablaFinanciero` y `cargarDashboardFinanciero` ya filtran `estado_plan = 'activo'`, así que en cuanto `cerrar_gestion()` (Fase C) marca 'cerrado' los planes de la gestión que termina, esos paneles automáticamente dejan de mostrarlos, sin tocar esas consultas. Ver §3.2 para el detalle de por qué alcanza con esto.

### ⚠️ Rediseño de la Fase A (2026-08-08, segunda vuelta)
La primera versión de la Fase A (día de vencimiento único + excepción por semestre/turno, §3.1 original) quedó reemplazada antes de correr la migración — el pedido real era otro: **un rango de fechas por cada cuota**, no un día fijo del mes. Quedó así:

- Tabla `config_fechas_cuotas (turno, numero_cuota, fecha_inicio, fecha_fin)` — reemplaza a `dias_vencimiento_semestre` (que nunca se llegó a usar, no hace falta migrarla).
- `resolver_fecha_cuota(turno, numero_cuota)` reemplaza a `resolver_dia_vencimiento()`/`fecha_cuota_para()` — devuelve directo la `fecha_fin` de esa cuota/turno. Si falta cargarla, cae en un fallback de "hoy + 30 días por cuota" (avisando por `warning`, no rompe el alta de un estudiante).
- Ya **no varía por semestre del estudiante (1-6)**, solo por turno — todos los estudiantes de un mismo turno pagan sus 5 (o N) cuotas en las mismas fechas de calendario dentro de la gestión, sin importar en qué semestre del programa están. Si esto no es lo que se necesita (ej. si sí debe variar también por semestre 1-6), avisar para ajustar la clave primaria de `config_fechas_cuotas`.
- `config_semestres` (fecha de inicio/fin de la gestión) ya no se usa para calcular vencimientos — **y no la usa nada más en todo el código** (se confirmó por búsqueda: cero referencias fuera de su propia tarjeta), así que directamente se sacó: se borró la tarjeta "Configuración de Semestres" completa de `index.html` (HTML + las 5 funciones JS que la alimentaban). La tabla `config_semestres` en Supabase queda como está — no se borró de la base porque la migración 016 ya la creó y probablemente ya tiene datos reales cargados (se veía "2026-II" con fechas en la captura); borrarla es una acción destructiva sobre datos ya existentes, así que si la querés eliminar también de la base, avisame y armo el `drop table` aparte.
- **Efecto colateral encontrado y corregido:** la pantalla de Cobranza (`index.html`, sección Cobranza) tenía, aparte, una regla institucional hardcodeada de "todos pagan entre el día 1 y el día 10" — el banner de arriba, el ícono de "fuera de política" en la tabla, y el mensaje de WhatsApp que se manda a los papás. Quedó desactualizada por este mismo cambio (una cuota ahora puede vencer cualquier día del rango que configures), así que la actualicé: el banner ahora es genérico, "fuera de política" pasó a ser simplemente "está vencida" (ya no hay un día de corte único para comparar), y el WhatsApp automático menciona la fecha real de vencimiento de esa cuota en vez del "día 1 al 10" fijo.

Este documento sigue como referencia de diseño — no hace falta releerlo entero, pero queda todo explicado abajo por si hay que tocar algo más adelante. El resto de las secciones (§3.1 original, §4.1) describen la versión vieja del día fijo — quedan tachadas en espíritu por esta nota, no las reescribí una por una para no perder el historial de por qué se llegó a cada decisión.

---

## 1. Cómo funciona hoy (diagnóstico)

- `config_financiera` (clave/valor): `costo_semestre_default`, `numero_cuotas_default`, `gestion_actual` — un solo valor institucional de cada uno, editable desde la tarjeta "Configuración General de Cuotas".
- `config_semestres` (migración 016, recién reconectada): fecha de inicio y fin por gestión (ej. `2026-II` → 01/08/2026 – 31/12/2026).
- Al registrar un estudiante, el trigger `trg_estudiante_plan_default()` le genera automáticamente su plan de pago (`planes_pago` + `cuotas`), forzando el vencimiento de cada cuota al **día 10** de cada mes a partir del inicio de la gestión.
- `generar_planes_por_defecto(gestion)` hace lo mismo en lote, para estudiantes que quedaron sin plan.
- **El día 10 está escrito directo en el código SQL de esas dos funciones** (`make_date(..., 10)`), no es un valor de configuración — por eso hoy no hay dónde cambiarlo desde la interfaz.
- Los paneles financieros (Por Cobrar, Deudores, tabla de estudiantes) leen **todos** los planes con `estado='activo'`, sin filtrar por `gestion`. Esto funciona bien mientras exista una sola gestión activa a la vez, pero:

  > Si el día de mañana generás los planes de `2027-I` para estudiantes que ya tenían un plan `activo` de `2026-II`, **ambos quedan activos y se suman juntos** en Por Cobrar / Deudores — plata de dos gestiones mezclada en un solo total. `crear_plan_pago()` solo reemplaza el plan previo cuando coincide estudiante **+ semestre + gestión**; una gestión nueva no coincide, así que el plan viejo nunca se cierra solo.

- No existe ningún flujo para "pasar de gestión": hoy, promover a un estudiante de semestre o generarle el plan de la gestión siguiente es 100% manual, estudiante por estudiante.
- `estudiantes.estado` solo admite `Activo / Retirado / Abandono` — no hay `Egresado` para quien termina el último semestre (6°).

---

## 2. Objetivo de diseño

1. **Durable pero editable:** costo, número de cuotas y día de vencimiento son valores institucionales con default sensato, pero cualquiera lo puede ajustar desde Configuración sin tocar código, y el cambio no afecta planes ya generados (esto último ya es así hoy).
2. **Repetible cada gestión:** cambiar de gestión (semestre a semestre, o año a año) tiene que ser una acción del Admin en la interfaz, no trabajo manual estudiante por estudiante.
3. **Gestiones aisladas:** los reportes de "plata actual" (Por Cobrar, Deudores, etc.) siempre reflejan **una sola gestión**, la vigente por defecto. El historial de gestiones anteriores se conserva completo y consultable, nunca se borra.

---

## 3. Cambios en el modelo de datos (nueva migración 017)

### 3.1 Día de vencimiento configurable — ✅ decidido: las dos opciones
Dos niveles, para que sea durable Y flexible:

- **Default institucional** en `config_financiera.dia_vencimiento_cuota` (`'10'` por defecto, no cambia el comportamiento actual).
- **Excepción por semestre/turno** (opcional): tabla nueva `dias_vencimiento_semestre (semestre, turno, dia_pago)` — básicamente el viejo `dias_pago_mensual` que se eliminó en la migración 016, pero ahora es un **override opcional** encima del default, no obligatorio fila por fila. Si un semestre/turno no tiene fila propia, usa el default institucional.

`trg_estudiante_plan_default()` y `generar_planes_por_defecto()` pasan a resolver el día así: `dias_vencimiento_semestre` (si existe fila para ese semestre+turno) → si no, `config_financiera.dia_vencimiento_cuota`.

### 3.2 Que las gestiones no se mezclen — ✅ implementado, con un ajuste de alcance
La idea original era dos cambios (filtrar por gestión en las lecturas + cerrar la gestión saliente). Al revisar el código, `cargarTablaFinanciero` y el `vista_cuotas_estado` que usa `cargarDashboardFinanciero` **ya filtran `estado_plan = 'activo'`** — no leen por gestión, leen por "está activo". Eso significa que **alcanza con la segunda pieza sola**: en cuanto `cerrar_gestion(p_gestion)` marca `estado='cerrado'` los planes de la gestión que termina, esos paneles dejan de verlos automáticamente, sin tocar sus queries. Se implementó así:

- **`cerrar_gestion(p_gestion text)`** (nueva función, migración 017): marca `estado='cerrado'` en los planes `activo` de esa gestión (se sumó `'cerrado'` al check de `planes_pago.estado`, antes `activo/anulado/reemplazado`). No borra ni modifica cuotas ni pagos — el historial queda intacto, solo deja de contar como "deuda activa" en los reportes del día a día.
- Botón manual "Cerrar gestión actual" en la tarjeta de Configuración (por si se necesita cerrar una gestión sin pasar por el flujo completo de "Cambio de Gestión", que también la cierra sola al final).
- No se agregó un selector de gestión aparte en los paneles — no hacía falta para el objetivo de "que no se mezclen". Si más adelante hace falta *consultar* una gestión pasada ya cerrada (auditoría histórica), esa sería una pantalla nueva de solo lectura filtrando por `gestion`, no está construida todavía.

### 3.3 Promoción de estudiantes a la gestión siguiente

**Regla de repite/arrastra — ✅ decidido: automática, basada en las correlativas (`pre`) de `planEstudios`.**

`planEstudios` (`index.html` línea ~3133) ya tiene, para cada materia, su prerrequisito en el campo `pre` (ej. `MOG 400` tiene `pre: "MOG 300"`; `TER 300` tiene `pre: "Ninguno"`). Eso es exactamente la noción de "materia troncal que abre a otra" que describiste — no hay que inventar un dato nuevo, ya está en el plan de estudios. La regla queda así, para un estudiante que termina el semestre N con una o más materias reprobadas (`notaFinal < 61`, motor de calificación ya existente):

- Por cada materia reprobada X del semestre N: ¿alguna materia del semestre N+1 tiene `pre === X.codigo`?
  - **No** → X no es troncal para el siguiente paso → se puede arrastrar: se agrega a `estudiantes.materias_arrastre` y el estudiante **promueve** a N+1.
  - **Sí** → X es troncal (abre una materia de N+1) → el estudiante **repite** el semestre N entero (no promueve; en la gestión nueva su `semestre` queda igual).
- Si tiene varias reprobadas y **cualquiera** de ellas es troncal → repite (aunque las demás fueran arrastrables).

Esto se calcula automáticamente por estudiante al armar la tabla de "Cambio de Gestión" (§4.3), pero **✅ decidido: es una sugerencia, no una decisión automática** — cada fila arranca sin marcar, el sistema resalta "esta materia es troncal, sugerido: Repite" y el admin tiene que tildar Promueve/Repite/Egresa a mano en cada fila para que cuente. Nada se aplica solo.

**✅ decidido: la misma regla corre también en "Arrastres"** (la pantalla que ya existe, `index.html` ~línea 1262, donde el admin le asigna materias de semestres anteriores a un estudiante en cualquier momento del año). Ahí, si el admin intenta marcar como arrastre una materia que es troncal (abre otra del semestre al que el estudiante ya está o va a pasar), la pantalla avisa/bloquea con el mismo criterio — para que no queden casos sueltos fuera de "Cambio de Gestión" donde alguien arrastra algo que en realidad debería obligar a repetir.

**Función:** `promover_estudiantes(p_gestion_nueva text, p_promociones jsonb)` — recibe la gestión nueva y, por estudiante, el resultado ya calculado (promueve a N+1 / repite en N / egresa), actualiza `estudiantes.semestre` / `estado` / `materias_arrastre`, y llama internamente a `generar_planes_por_defecto(p_gestion_nueva)` para crearle a cada estudiante activo su plan de pago con el semestre ya actualizado.

Agregar `'Egresado'` a los valores válidos de `estudiantes.estado` (✅ decidido: se marca **a mano**, no automático — el admin lo tilda por estudiante en la tabla de Cambio de Gestión, típicamente los de 6° semestre sin materias troncales pendientes) para quien termina el programa y no debe recibir plan de pago nuevo. Hoy los filtros de "estudiante activo" en el código ya excluyen `Retirado`/`Abandono`; hay que sumarle `Egresado` en esos mismos lugares — están en `index.html` líneas ~9417 y ~9505 del dashboard financiero.

---

## 4. Cambios en la interfaz (`index.html` → Financiero → Configuración)

### 4.1 Tarjeta "Configuración General de Cuotas" (ya existe — se amplía)
Sumar el campo **Día de vencimiento de cuota (default institucional)** junto a costo y número de cuotas. Debajo, una tabla opcional chica (semestre × turno, igual a la vieja "Día de Pago Mensual") para poner excepciones — vacío = usa el default. Texto de ayuda: son los valores por defecto institucionales — se aplican a todo estudiante nuevo y a la generación masiva, cambiarlos no toca los planes que ya existen.

### 4.2 Tarjeta "Configuración de Semestres" (ya existe, migración 016)
Se mantiene igual: fecha de inicio/fin por gestión.

### 4.3 Tarjeta nueva: "Cambio de Gestión"
- Selector "Gestión que termina" → "Gestión nueva" (texto libre, **sugerido automáticamente** a partir de la gestión actual — ej. si termina `2026-II` propone `2027-I` — pero editable, ✅ decidido: los dos).
- Tabla de estudiantes activos agrupados por semestre/turno, con una columna **"Sugerido"** calculada por la regla de correlativas (§3.3) — muestra "Promueve a N+1" o "Repite N (por: MOG 300, ...)" a modo de ayuda — y una columna **"Resultado"** en blanco que el admin tiene que tildar a mano (Promueve / Repite / Egresa) fila por fila antes de confirmar. Nada se aplica sin que el admin lo marque explícitamente, aunque coincida con la sugerencia.
- Atajo "Matricular estudiantes nuevos de esta gestión" → abre el formulario de matrícula ya existente, con semestre 1 preseleccionado.
- Botón final "Confirmar cambio de gestión": muestra un resumen (cuántos promueven, cuántos repiten, cuántos egresan, cuántos planes se van a generar) y pide confirmación tipo `window.confirmarAccion` antes de ejecutar — es plata y notas, no debe poder deshacerse por error de un clic.

### 4.4 Selector de gestión en los paneles financieros — no se construyó (ver §3.2)
No hizo falta: los paneles ya filtran por plan `activo`, y `cerrar_gestion()` (§3.2) alcanza para que la gestión que termina deje de sumarse. Queda pendiente solo si más adelante se quiere un visor de solo-lectura de gestiones ya cerradas.

### 4.5 Aviso de troncal en "Arrastres" (pantalla existente, `vista-arrastre`)
Al tildar una materia para arrastre, si esa materia es troncal para el estudiante seleccionado (abre otra materia del semestre al que ya pasó o va a pasar), la pantalla lo avisa ahí mismo — con el mismo cálculo de §3.3 — en vez de dejar pasar el arrastre calladamente. Evita que se acumulen casos que en realidad deberían haber repetido semestre, fuera del momento puntual de "Cambio de Gestión".

---

## 5. Flujo de uso (cada semestre/año)

1. Cargar fecha de inicio/fin de la gestión nueva en "Configuración de Semestres".
2. Revisar costo, número de cuotas y día de vencimiento en "Configuración General de Cuotas" (solo si cambiaron).
3. Ir a "Cambio de Gestión": revisar la lista de activos, marcar repitentes/egresados, confirmar.
4. El sistema promueve semestres, genera los planes de la gestión nueva para todos los activos, y cierra los planes de la gestión anterior (que queda disponible como histórico).
5. Matricular a los estudiantes nuevos con el flujo de siempre — quedan en semestre 1, gestión nueva, con su plan generado automáticamente por el trigger.

---

## 6. Fases — todas implementadas en código (falta correr la migración)

| Fase | Qué incluye | Estado |
|---|---|---|
| A | Día de vencimiento configurable (§3.1 + §4.1) | ✅ Código listo |
| B | Filtro por gestión en paneles financieros | No hizo falta — ver §3.2/§4.4 |
| C | `cerrar_gestion()` + estado `'cerrado'` (§3.2) | ✅ Código listo |
| D | `promover_estudiantes()` + tarjeta "Cambio de Gestión" (§3.3 + §4.3) | ✅ Código listo — **probar con datos de prueba antes de usarla con la gestión real**, es la pieza más grande |
| E | Estado `'Egresado'` + ajustar los filtros que hoy solo excluyen Retirado/Abandono | ✅ Código listo |

Falta un solo paso manual: correr `supabase/migraciones/017_cambio_de_gestion.sql` en Supabase → SQL Editor (completo, una sola vez).

---

## 7. Decisiones — todas resueltas

1. **Día de vencimiento** → default institucional + excepción opcional por semestre/turno (§3.1).
2. **Egresados** → manual, el admin lo tilda en la tabla de Cambio de Gestión (§3.3).
3. **Repetir semestre** → calculado automáticamente por correlativas del `pre` de `planEstudios` (§3.3), pero es **sugerencia**: el admin tilda Promueve/Repite/Egresa a mano fila por fila, nada se aplica solo.
4. **Nombre de gestión nueva** → sugerido automáticamente + editable (§4.3).
5. **Alcance de la regla de troncales** → corre en los dos lugares: en "Cambio de Gestión" (§4.3) y también como aviso dentro de "Arrastres" (§4.5), mismo criterio todo el año.

Con esto ya puedo armar la migración `017` y los cambios de `index.html`. Orden sugerido: Fase A → B → C → E (bajo/medio riesgo, cada una deja el sistema funcionando) → Fase D al final (la más grande: función `promover_estudiantes()`, tarjeta "Cambio de Gestión" con el cálculo de sugerencias, y el aviso en Arrastres). Aviso antes de tocar la base de datos real y antes de cada fase, para ir verificando en el navegador — nada se ejecuta en Supabase sin que lo confirmes primero.
