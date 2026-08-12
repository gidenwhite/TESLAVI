# TESLAVI — Brief de Rediseño de Interfaz, UX y Movimiento
### Documento de trabajo para Claude Code
**Producto:** Sistema Web Integral de Gestión Académica y Financiera — Instituto Tecnológico TESLAVI (Técnico Superior en Mecánica Automotriz, Sucre, Bolivia)
**Archivos actuales:** **tres** páginas HTML independientes, cada una con HTML + CSS + JS embebidos, sin build ni módulos compartidos (la duplicación entre archivos — `planEstudios`, el motor de cálculo de notas, la config de Supabase — es intencional, ver §0.1):
- `index.html` (~8.000 líneas) — Administración: estudiantes, docentes, materias, notas y asistencia (visor), centralizador, libretas, estadísticas, financiero, cobranza, caja, reportes, gastos e ingresos.
- `docente.html` (~1.700 líneas) — portal del docente: login propio (CI + contraseña, sin Supabase Auth), Mis Materias, Calificar (Trimestre 1 / Trimestre 2 / Recuperatorio — ver §6.6), Asistencia, Historial.
- `estudiante.html` (~800 líneas) — portal del estudiante: login propio, ver notas.

Backend: Supabase (Postgres + RLS; solo Admin usa Supabase Auth real, Docente y Estudiante entran con CI/contraseña validados directo contra sus tablas). ExcelJS / jsPDF / Chart.js por CDN.

**Objetivo:** llevar el sistema de "funciona pero se ve improvisado" a "producto premium de pago", sin romper una sola línea de lógica de negocio.

---

## 0. Cómo usar este documento

Claude Code: leé el documento completo **antes** de tocar código. Después trabajá por fases (§13), una fase por sesión, verificando en el navegador al terminar cada una.

### 0.1 Sobre los tres archivos

Este brief se escribió originalmente asumiendo un único `index.html`. El sistema evolucionó a tres páginas separadas **por rol de usuario** (no por capa CSS/JS) porque cada una necesita su propio login independiente y su propia sesión — no porque se haya adoptado un criterio de arquitectura distinto al del brief. Esto cambia el alcance de varias secciones:

- **§11 (Arquitectura de archivos)** aplica **dentro de cada uno** de los tres archivos, no como un único split global. `docente.html` y `estudiante.html` no van a importar los mismos `.js`/`.css` que `index.html`: siguen el patrón que ya usan (todo embebido, duplicado a propósito) salvo que se decida lo contrario en la Fase 0.
- El **sistema de tokens (§4)**, la **biblioteca de componentes (§5)** y la **especificación de movimiento (§7)** deben quedar **idénticos en los tres archivos** — es lo que hace que se sientan una sola marca aunque sean páginas separadas.
- El **Anexo A** está organizado por archivo para reflejar esto.

Reglas de oro para todo el trabajo:

1. **Nunca cambies nombres de tablas, columnas, ni funciones RPC de Supabase.** (`estudiantes`, `docentes`, `auditoria`, `cuotas`, `pagos`, `recibos`, `vista_cuotas_estado`, `vista_estado_financiero_estudiante`, `registrar_pago`, `aplicar_descuento_plan_activo`, `abrir_caja`, `cerrar_caja`, `registrar_gasto_institucional`, `registrar_ingreso_institucional`, `generar_planes_por_defecto`, `config_trimestres`, etc.)
2. **Nunca cambies un `id` de elemento HTML sin actualizar todas sus referencias en JS — dentro del archivo correspondiente.** El JS depende de `document.getElementById` en cientos de lugares y de `onclick="window.funcion()"` inline.
3. **Nunca cambies la firma ni el nombre de las funciones colgadas de `window.`** — el HTML las llama por nombre desde atributos `onclick`. Ojo: varias funciones (`calcularNotaMateria`, `ptsAsistenciaTrimestre`, `fmtNum`, `registrarAuditoria`, etc.) están **duplicadas a propósito** en los tres archivos — si corregís un bug o cambiás una fórmula en una, replicá el cambio en las otras dos.
4. Si una fase rompe algo, revertí esa fase completa antes de seguir. No acumules deuda.
5. Todo el texto de interfaz en **español**. Ver §9 sobre el registro (usted / vos).

---

## 1. Contexto real del producto

**Quién lo usa y cómo:**

| Perfil | Qué hace | Dónde y cuándo | Implicancia de diseño |
|---|---|---|---|
| Administración / secretaría | Matrícula, cobranza, caja, reportes, libretas | PC de escritorio, jornada completa | Densidad alta, teclado, atajos, exportar |
| Docentes | Cargar notas, pasar lista, ver historial | Celular o laptop, en el taller, entre clases | Móvil primero, pocos toques, autoguardado |
| Docentes turno noche | Lo mismo, con poca luz | Celular, aulas oscuras | **Modo oscuro no es capricho: es necesidad** |

**Consecuencia directa:** esto no es una landing. Es una herramienta que alguien mira seis horas seguidas. Cada decisión visual se juzga por: *¿se lee sin cansarse? ¿se llena rápido? ¿se entiende sin pensar?*

---

## 2. Diagnóstico del código actual

Esto es lo que hay que arreglar. Cada punto es concreto y verificable.

### 2.1 Fallas graves de experiencia

| # | Problema | Dónde | Impacto |
|---|---|---|---|
| 1 | `window.onerror` inyecta una **barra roja gigante** con el stack trace en producción | inicio del `<script>` | Cualquier error menor le tapa la pantalla al usuario con texto técnico. Es una herramienta de debug dejada encendida. |
| 2 | `alert()` y `confirm()` nativos en +15 lugares | eliminar estudiante, guardar arrastres, cerrar caja, errores de exportación | Bloquean la página, no se pueden estilizar, se ven a 2005 |
| 3 | `prompt()` para pedir el motivo de una falta justificada | `window.cambiarAsistencia` | Es el peor patrón de captura de datos posible, y encima ya existe un input al lado |
| 4 | `usuario_id` crudo (UUID) en la tabla de Auditoría | `cargarDatosInicio` | La pantalla de inicio muestra `a3f8-...` en vez de "Sandra Rojas". Información inútil |
| 5 | Sin sistema de notificaciones (toast) | global | Todo feedback es un `alert()` o un `<div class="mensaje">` escondido al final de un formulario largo |
| 6 | "Cargando información..." como texto plano | casi todas las tablas | Existe el helper `window.filaCargando()` pero se usa solo en Financiero |
| 7 | Estados vacíos sin dirección | todas las tablas | "No hay estudiantes" no dice qué hacer después |
| 8 | Modales sin ESC, sin trampa de foco, sin bloqueo de scroll, sin clic-fuera-para-cerrar | los 5 `.modal-overlay` | Accesibilidad y sensación de producto barato |
| 9 | Sin búsqueda global ni atajos de teclado | global | 13 módulos y cientos de estudiantes, y la única forma de llegar a algo es clic-clic-clic |
| 10 | Contraseñas de docentes en texto plano, visibles en la lista de docentes | `cargarDocentes` | Ver §12.4 |

### 2.2 Fallas de sistema visual

| # | Problema | Detalle |
|---|---|---|
| 11 | **Estilos inline por todos lados** | Prácticamente cada `<div>` tiene `style="..."`. Imposible mantener coherencia, imposible hacer modo oscuro, imposible cambiar nada globalmente |
| 12 | **Hex sueltos que rompen la paleta** | `#1B8557`, `#D32F2F`, `#1976D2`, `#F59E0B`, `#25D366`, `#DE3B3B`, `#2B579A`, `#1F6E43`, `#B71C1C`, `#E65100`, `#FFCDD2`, `#FFE0B2`, `#FFF9C4`... conviven con los tokens `--verde-*`. Hay al menos **tres rojos distintos** y **cuatro verdes distintos** en la misma pantalla |
| 13 | **Botones de exportar pintados con los colores de Microsoft** | Verde Excel + rojo PDF + azul Word, repetidos en 8 pantallas. Es el elemento más ruidoso de toda la app y grita "plantilla" |
| 14 | Un solo `--radio: 3px` para todo, y luego radios inventados inline (`100px`, `4px`, `6px`, `50%`) | Sin escala de radios |
| 15 | Dos sombras definidas, casi nunca usadas | Sin sistema de elevación |
| 16 | Escala tipográfica improvisada | `13px`, `13.5px`, `12.5px`, `14.5px`, `11.5px`, `10.5px`… valores arbitrarios en inline styles |
| 17 | El menú lateral numera los ítems `01`–`13` | Un menú no es una secuencia. La numeración decora, no informa. Y con 13 ítems planos, no hay jerarquía real |
| 18 | Bloques CSS duplicados | El `@media (max-width: 1024px)` con `.topbar` completo aparece dos veces con el mismo contenido |
| 19 | `outline: none` sin reemplazo en varios inputs | Existe la regla `:focus-visible` global (bien) pero varias reglas la pisan |

### 2.3 Fallas de captura de datos (lo más importante)

| # | Problema | Dónde | Costo real |
|---|---|---|---|
| 20 | **Cargar notas es lento y frágil** | `seccion-calificar` | Inputs sueltos, sin navegación por teclado, sin autoguardado, sin pegar desde Excel, sin aviso al salir con cambios sin guardar. Un docente con 35 alumnos hace 70 clics de mouse |
| 21 | Validación solo al enviar, en un `<div>` compartido al pie del formulario | todos los formularios | El usuario llena 8 campos, envía, y le dicen "complete todos los campos requeridos" sin decir cuál |
| 22 | Sin máscaras ni formato en CI, celular, montos | todos los formularios | Datos sucios en la base |
| 23 | `<select size="8">` como selector de estudiantes | pestaña Arrastres | Un combobox con búsqueda resuelve esto mucho mejor |
| 24 | Sin ordenamiento, paginación ni densidad en ninguna tabla | todas | La lista de estudiantes carga todo, sin poder ordenar por semestre |
| 25 | En móvil, las tablas **ocultan las columnas 4 en adelante** con `display:none` | `@media (max-width: 768px)` | Se pierde información de verdad. El docente en el taller no ve el turno ni los celulares |
| 26 | Sin confirmación de guardado persistente | Notas y Asistencia | El botón cambia a "¡Guardado!" por 2 segundos y vuelve. No hay registro visible de cuándo se guardó |
| 27 | Sin manejo de estado sucio | Notas, Asistencia, Financiero | Se puede navegar y perder todo lo escrito sin aviso |
| 28 | Mezcla de tratamiento en los textos | global | "Poné el monto", "Completá quién pagó" (voseo) conviven con "Ingrese con las credenciales", "Seleccione un docente" (usted) |

---

## 3. Dirección de diseño

### 3.1 Sobre el prompt de RIVR que me pasaste

Ese prompt es bueno **para lo que es**: un hero de landing page, glassmorphism sobre video, 30 segundos de atención. Lo que te gusta de ahí y **sí** vamos a traer:

- El nivel de terminación: radios generosos, capas, respiración, sombras honestas.
- El movimiento con intención: entradas escalonadas, `whileHover`/`whileTap` en cada control, curvas suaves.
- La disciplina cromática: una paleta corta y consistente, no 14 colores sueltos.
- Detalles de artesanía como las máscaras de esquina del `BottomRightCorner` — ese tipo de precisión es exactamente lo que separa "premium" de "plantilla".

Lo que **no** vamos a traer, y quiero ser claro en el porqué:

- **Glass sobre video de fondo en pantallas de trabajo.** Un `backdrop-blur` detrás de una tabla de 40 filas de notas destruye la legibilidad y castiga el rendimiento en los celulares de gama media que usan tus docentes. El vidrio va a existir, pero acotado: login, cabeceras flotantes, capa de modales, barra de selección masiva.
- **Texto gris claro `#5E6470` sobre fondo con imagen.** En un sistema donde alguien lee cifras seis horas, el contraste no se negocia.
- **La estética "cripto/fintech" genérica.** Tu instituto tiene un mundo propio mucho más interesante que un dashboard de DeFi. Ver abajo.

### 3.2 El concepto: **Ficha Técnica**

El sujeto de este producto es un taller de mecánica automotriz. Ese mundo tiene un lenguaje visual propio, preciso y reconocible: **planos técnicos, hojas de especificación, calibradores, órdenes de trabajo, señalética de seguridad.** Tu código ya lo insinúa sin desarrollarlo (la retícula `.grid-tecnica`, las marcas de esquina del `.sello`, los códigos en monoespaciada). Vamos a llevar eso hasta el final.

**La tesis:** la interfaz es un instrumento de precisión, no un panel de marketing. Cada entidad — un estudiante, una materia, un pago — se presenta como una **ficha técnica**: identificador en monoespaciada, datos en grilla con líneas de cabello, marcas de esquina, sin decoración que no informe.

**Por qué esta dirección y no glassmorphism genérico:** porque nace del tema. Un sistema para una carrera de mecánica que se ve como una hoja de especificación de taller es memorable y es *verdadero*. Un sistema que se ve como cualquier dashboard de 2026 no lo es.

### 3.3 El elemento firma: **la banda de calibre**

Un único elemento memorable, y todo lo demás disciplinado alrededor.

Debajo de la barra superior, una tira de **6px de alto con marcas tipo escala de calibrador** (ticks verticales, uno mayor cada 10). No es decoración: **es un indicador de contexto en vivo del módulo activo**, que se llena en verde institucional según el avance real:

- En **Calificar**: alumnos con nota cargada / total. La banda se llena mientras el docente escribe.
- En **Asistencia**: alumnos marcados hoy / total.
- En **Cobranza**: cobrado del mes / esperado del mes.
- En **Caja**: proporción entre movimientos registrados y saldo declarado.
- En **Inicio**: materias con docente asignado / total de materias-turno.
- Cuando no aplica: la banda queda como una escala neutra, apenas visible.

Con `title`/`aria-label` explicando el valor. Animación: la barra crece con `transform: scaleX()` y easing suave cuando el valor cambia. **Esta es la única pieza donde se permite “lucirse”.** Todo el resto es quieto y preciso.

Referencia de implementación:

```html
<div class="banda-calibre" role="progressbar" aria-valuemin="0" aria-valuemax="100"
     aria-valuenow="0" aria-label="Progreso de carga de notas">
  <div class="banda-calibre__ticks" aria-hidden="true"></div>
  <div class="banda-calibre__relleno"></div>
</div>
```

```css
.banda-calibre{
  position:relative; height:6px; background:var(--superficie-2);
  border-bottom:1px solid var(--borde);
}
.banda-calibre__ticks{
  position:absolute; inset:0;
  background-image:repeating-linear-gradient(90deg,
    var(--borde-fuerte) 0 1px, transparent 1px 12px);
  opacity:.5;
}
.banda-calibre__relleno{
  position:absolute; inset:0; transform-origin:left center;
  transform:scaleX(var(--avance,0));
  background:linear-gradient(90deg,var(--verde-600),var(--verde-500));
  transition:transform var(--dur-lenta) var(--ease-salida);
}
```

---

## 4. Sistema de tokens

Reemplazá el bloque `:root` actual completo por esto. **Todo color, radio, espacio, sombra y duración del proyecto debe salir de acá.** Cero hex sueltos.

```css
:root{
  /* ── COLOR: verde institucional (rampa completa) ─────────── */
  --verde-50:#F0F6F2;  --verde-100:#DCEBE2; --verde-200:#B7D6C4;
  --verde-300:#86BB9F; --verde-400:#4E9B75; --verde-500:#1B8557;
  --verde-600:#146C46; --verde-700:#0F5638; --verde-800:#0B402B;
  --verde-900:#082D1F; --verde-950:#04180F;

  /* ── COLOR: tinta (neutros con leve temperatura verde) ───── */
  --tinta-50:#F3F6F4;  --tinta-100:#E7ECE9; --tinta-200:#D2DAD5;
  --tinta-300:#AEBAB4; --tinta-400:#84968D; --tinta-500:#5C6B65;
  --tinta-600:#45544D; --tinta-700:#33443C; --tinta-800:#22302A;
  --tinta-900:#15211C; --tinta-950:#0B1310;

  /* ── COLOR: señal (acento único, uso ESTRICTAMENTE limitado)
     Naranja de seguridad de taller. Máximo UN uso por pantalla.
     Permitido en: la banda de calibre cuando hay alerta, el badge
     de mora crítica, el foco de un campo con error crítico.
     PROHIBIDO en: fondos, botones primarios, decoración. ────── */
  --senal-100:#FDEBE2; --senal-500:#E4572E; --senal-700:#B03C1B;

  /* ── COLOR: semánticos de estado ─────────────────────────── */
  --ok-bg:#E4EFE9;   --ok-borde:#B7D6C4; --ok-texto:#0F5638;
  --alerta-bg:#FDF3E3; --alerta-borde:#EBD3A8; --alerta-texto:#8A5A08;
  --error-bg:#FBEAE8;  --error-borde:#E9C6C2; --error-texto:#A7291F;
  --info-bg:#E8F0F6;   --info-borde:#C3D8E8; --info-texto:#1E5A8A;

  /* ── SUPERFICIES (redefinidas por el tema oscuro) ─────────── */
  --fondo:#F3F6F4;
  --superficie:#FFFFFF;
  --superficie-2:#F8FAF9;   /* cabeceras de tabla, campos en reposo */
  --superficie-inversa:var(--verde-950);
  --borde:#E2E8E5;
  --borde-fuerte:#CBD5D0;
  --texto:#15211C;
  --texto-suave:#5C6B65;
  --texto-tenue:#84968D;
  --texto-inverso:#EAF3EE;

  /* ── TIPOGRAFÍA ──────────────────────────────────────────── */
  --f-display:'Archivo',system-ui,sans-serif;   /* títulos, cifras grandes */
  --f-cuerpo:'Inter Tight',system-ui,sans-serif;/* interfaz general */
  --f-datos:'IBM Plex Mono',ui-monospace,monospace; /* códigos, montos, notas, CI, fechas */

  --t-3xl:2.25rem;  --lh-3xl:1.08;  /* título de sección */
  --t-2xl:1.75rem;  --lh-2xl:1.15;
  --t-xl:1.375rem;  --lh-xl:1.25;
  --t-lg:1.125rem;  --lh-lg:1.4;
  --t-base:0.9375rem; --lh-base:1.55;  /* 15px — cuerpo */
  --t-sm:0.8125rem; --lh-sm:1.5;       /* 13px — tablas, ayudas */
  --t-xs:0.6875rem; --lh-xs:1.4;       /* 11px — etiquetas, eyebrows */

  --tracking-etiqueta:0.09em;  /* solo para eyebrows en mayúsculas */

  /* ── ESPACIO (escala de 4) ───────────────────────────────── */
  --e-1:4px;  --e-2:8px;  --e-3:12px; --e-4:16px; --e-5:20px;
  --e-6:24px; --e-8:32px; --e-10:40px; --e-12:48px; --e-16:64px;

  /* ── RADIO ───────────────────────────────────────────────── */
  --r-xs:4px;    /* chips, badges */
  --r-sm:8px;    /* inputs, botones */
  --r-md:12px;   /* tarjetas */
  --r-lg:18px;   /* paneles, modales */
  --r-xl:28px;   /* contenedor de login, superficies grandes */
  --r-full:999px;

  /* ── ELEVACIÓN ───────────────────────────────────────────── */
  --sombra-0:none;
  --sombra-1:0 1px 2px rgba(11,19,16,.05), 0 1px 1px rgba(11,19,16,.03);
  --sombra-2:0 2px 4px rgba(11,19,16,.05), 0 4px 12px rgba(11,19,16,.05);
  --sombra-3:0 8px 16px rgba(11,19,16,.07), 0 16px 40px rgba(11,19,16,.08);
  --sombra-4:0 16px 32px rgba(11,19,16,.10), 0 32px 72px rgba(11,19,16,.14);
  --anillo-foco:0 0 0 3px var(--verde-200);

  /* ── MOVIMIENTO ──────────────────────────────────────────── */
  --dur-instant:90ms;   /* cambio de color en hover */
  --dur-rapida:150ms;   /* micro-interacción: botón, checkbox, chip */
  --dur-base:220ms;     /* estándar: tabs, acordeón, toast */
  --dur-lenta:340ms;    /* entrada/salida grande: modal, panel, sección */
  --ease-salida:cubic-bezier(.16,1,.3,1);      /* entradas — el 90% de los casos */
  --ease-entrada:cubic-bezier(.4,0,1,1);       /* salidas */
  --ease-estandar:cubic-bezier(.4,0,.2,1);     /* movimientos entre dos estados */
  --ease-resorte:cubic-bezier(.34,1.56,.64,1); /* solo confirmaciones de éxito */

  /* ── CAPAS ───────────────────────────────────────────────── */
  --z-base:0; --z-tabla-sticky:10; --z-topbar:50; --z-sidebar:100;
  --z-overlay:900; --z-modal:1000; --z-toast:1100; --z-tooltip:1200;
}
```

**Fuentes a cargar** (reemplazan Space Grotesk / Inter / JetBrains Mono):

```html
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=Inter+Tight:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet">
```

Por qué estas tres: **Archivo** tiene el carácter industrial-institucional que Space Grotesk no llega a dar (y se lee mejor en cifras grandes). **Inter Tight** es más compacta que Inter, lo que gana espacio real en tablas densas. **IBM Plex Mono** viene literalmente del mundo de la documentación técnica de ingeniería — es el tipo de letra que uno esperaría en un manual de servicio.

**Regla de uso de la monoespaciada:** todo dato que se compara verticalmente va en `--f-datos` con `font-variant-numeric: tabular-nums`. Es decir: notas, montos en Bs., CI, códigos de materia, fechas, porcentajes, números de recibo, horas. Todo lo que se lee como prosa va en `--f-cuerpo`.

### 4.1 Modo oscuro

No es opcional: el turno noche existe. Implementalo con un atributo en `<html>` y redefiniendo **solo** las superficies:

```css
html[data-tema="oscuro"]{
  --fondo:#0B1310; --superficie:#15211C; --superficie-2:#1B2A24;
  --borde:#2A3B33; --borde-fuerte:#3A4E44;
  --texto:#E7ECE9; --texto-suave:#AEBAB4; --texto-tenue:#84968D;
  --ok-bg:#0F3125; --ok-texto:#86BB9F;
  --alerta-bg:#3A2A10; --alerta-texto:#E8C87A;
  --error-bg:#3A1714; --error-texto:#F0A79E;
  --info-bg:#122834; --info-texto:#9BC4E0;
  --sombra-1:0 1px 2px rgba(0,0,0,.4);
  --sombra-2:0 2px 4px rgba(0,0,0,.4), 0 4px 12px rgba(0,0,0,.3);
  --sombra-3:0 8px 16px rgba(0,0,0,.45), 0 16px 40px rgba(0,0,0,.35);
  --sombra-4:0 16px 32px rgba(0,0,0,.5), 0 32px 72px rgba(0,0,0,.45);
}
```

Selector en el `topbar` con tres opciones: Claro / Oscuro / Sistema. Guardar en `localStorage`. Inicializar **antes** del primer render para evitar el destello blanco.

---

## 5. Biblioteca de componentes

Creá un archivo `componentes.css` con todo esto. Después, migrá pantalla por pantalla reemplazando los estilos inline.

### 5.1 Botones

Cuatro variantes, tres tamaños, cinco estados. Nada más.

| Variante | Uso | Aspecto |
|---|---|---|
| `.btn--primario` | La acción principal de la pantalla. **Máximo uno visible a la vez** | Relleno `--verde-700`, texto blanco |
| `.btn--secundario` | Acciones de apoyo (Cancelar, Volver, Exportar) | Borde `--borde-fuerte`, fondo `--superficie` |
| `.btn--fantasma` | Acciones dentro de tablas y listas | Sin borde ni fondo, hover con `--superficie-2` |
| `.btn--peligro` | Eliminar, anular, cerrar caja | Relleno `--error-texto`, texto blanco |

Tamaños: `.btn--sm` (32px alto), `.btn` (40px, por defecto), `.btn--lg` (48px, solo login y acciones de formulario largo).

**Estados obligatorios en los cuatro:** reposo, hover, activo, foco visible (`--anillo-foco`), deshabilitado, **cargando**.

Estado de carga: el botón conserva su ancho exacto (`min-width` calculado antes de cambiar el contenido, para que no salte el layout), muestra un spinner y `aria-busy="true"`, y queda deshabilitado.

```css
.btn{
  display:inline-flex; align-items:center; justify-content:center; gap:var(--e-2);
  height:40px; padding:0 var(--e-4);
  font:500 var(--t-base)/1 var(--f-cuerpo);
  border-radius:var(--r-sm); border:1px solid transparent;
  cursor:pointer; white-space:nowrap; position:relative;
  transition:background var(--dur-rapida) var(--ease-estandar),
             border-color var(--dur-rapida) var(--ease-estandar),
             transform var(--dur-instant) var(--ease-estandar),
             box-shadow var(--dur-rapida) var(--ease-estandar);
}
.btn:active:not(:disabled){ transform:translateY(1px) scale(.99); }
.btn:disabled{ opacity:.5; cursor:not-allowed; transform:none; }
.btn:focus-visible{ outline:none; box-shadow:var(--anillo-foco); }

.btn--primario{ background:var(--verde-700); color:#fff; }
.btn--primario:hover:not(:disabled){ background:var(--verde-600); box-shadow:var(--sombra-2); }
```

**Grupo de exportación — cambio importante.** Eliminá los tres botones de colores Excel/PDF/Word de las 8 pantallas donde aparecen. Reemplazalos por **un solo botón secundario "Exportar"** con ícono de descarga que abre un menú desplegable con las tres opciones (ícono monocromo + etiqueta + extensión en monoespaciada). Esto recupera espacio horizontal, elimina la mayor fuente de ruido cromático del sistema, y es el patrón que usa cualquier herramienta seria.

### 5.2 Campos de texto

Este es el componente que más impacto va a tener, porque tu sistema es fundamentalmente un capturador de datos.

**Estructura y reglas:**

- **Etiqueta siempre visible arriba del campo.** No uses placeholders como etiqueta ni etiquetas flotantes: desaparecen al escribir y son un problema conocido de accesibilidad y de revisión de formularios largos.
- El placeholder muestra **un ejemplo real** (`Ej. 1234567`), no repite la etiqueta. Esto ya lo estás haciendo bien en varios lugares — mantenelo y extendelo a todos.
- Marcá los campos **opcionales** con la palabra "opcional" en la etiqueta, en vez de marcar los obligatorios con asterisco. En tus formularios casi todo es obligatorio, así que marcar la excepción es más limpio.
- Línea de ayuda (`.campo__ayuda`) debajo, siempre presente aunque vacía, para que el mensaje de error no empuje el layout al aparecer.
- **Validación en el momento correcto:** validar al salir del campo (`blur`), no mientras se escribe. Una vez que el campo tiene error, revalidar en cada tecla para que el error desaparezca apenas se corrige.
- Mensajes de error específicos y accionables: "El CI debe tener entre 6 y 10 dígitos", no "Campo inválido". Sin disculpas, sin signos de exclamación.
- El error se anuncia con `aria-describedby` + `aria-invalid="true"` y el contenedor lleva `role="alert"`.
- Estado de éxito discreto: un check verde a la derecha del campo cuando pasa validación, solo en campos con reglas no triviales (CI, celular, monto).

**Teclado móvil correcto** (esto solo ya cambia la experiencia del docente en el taller):

| Campo | Atributos |
|---|---|
| CI | `inputmode="numeric" autocomplete="off" maxlength="10"` |
| Celular | `type="tel" inputmode="tel" autocomplete="tel"` |
| Montos (Bs.) | `inputmode="decimal"` + prefijo visual `Bs.` dentro del campo |
| Notas | `inputmode="numeric"` + `max` real (30 / 70) |
| Correo | `type="email" inputmode="email" autocomplete="email"` |
| Contraseña | `autocomplete="current-password"` / `"new-password"` |

**Afijos:** los campos de monto llevan `Bs.` como prefijo dentro del borde (no como texto de la etiqueta). Los campos de nota llevan el máximo como sufijo (`/30`, `/70`).

```css
.campo{ display:flex; flex-direction:column; gap:var(--e-2); }
.campo__label{
  font:500 var(--t-sm)/1.3 var(--f-cuerpo); color:var(--texto-suave);
}
.campo__label .opcional{ color:var(--texto-tenue); font-weight:400; }
.campo__control{
  position:relative; display:flex; align-items:center;
  background:var(--superficie-2);
  border:1px solid var(--borde-fuerte);
  border-radius:var(--r-sm);
  transition:border-color var(--dur-rapida) var(--ease-estandar),
             box-shadow var(--dur-rapida) var(--ease-estandar),
             background var(--dur-rapida) var(--ease-estandar);
}
.campo__control:focus-within{
  background:var(--superficie);
  border-color:var(--verde-500);
  box-shadow:var(--anillo-foco);
}
.campo__control input{
  flex:1; min-width:0; height:42px; padding:0 var(--e-3);
  border:0; background:transparent; outline:none;
  font:400 var(--t-base)/1 var(--f-cuerpo); color:var(--texto);
}
.campo__control input[data-tipo="dato"]{ font-family:var(--f-datos); }
.campo__afijo{
  padding:0 var(--e-3); color:var(--texto-tenue);
  font:500 var(--t-sm)/1 var(--f-datos);
}
.campo__ayuda{ min-height:16px; font:400 var(--t-xs)/1.4 var(--f-cuerpo); color:var(--texto-tenue); }
.campo[data-estado="error"] .campo__control{ border-color:var(--error-texto); background:var(--error-bg); }
.campo[data-estado="error"] .campo__ayuda{ color:var(--error-texto); }
.campo[data-estado="ok"] .campo__control{ border-color:var(--verde-400); }
```

**En móvil el `font-size` de los inputs no puede bajar de 16px** (iOS hace zoom automático si es menor). Ya tenés esa regla para ≤480px — extendela a ≤768px.

### 5.3 Selector con búsqueda (combobox)

Reemplaza a **todos** los `<select class="select-css">` que tienen más de 8 opciones, y muy especialmente al `<select size="8">` de la pestaña Arrastres y al selector de docente del modal de asignación.

Comportamiento: se abre al hacer clic o al escribir; filtra sin distinguir acentos ni mayúsculas; navegación con ↑ ↓, selección con Enter, cierre con Esc; resalta la coincidencia; muestra en cada fila el dato secundario que desambigua (para estudiantes: `Apellidos Nombres` + `CI` en monoespaciada + `2° Sem · Noche` como chip); estado vacío "Sin resultados para «xxx»".

Los selects de 2–6 opciones fijas (Turno, Semestre) se quedan como `<select>` nativo, pero **restilizado**: flecha propia, misma altura y borde que los inputs, sin la apariencia del sistema operativo.

### 5.4 Tablas

Tu sistema tiene ~15 tablas. Todas deben usar el mismo componente.

**Anatomía obligatoria:**

```
┌─ Barra de herramientas ─────────────────────────────┐
│ [buscar…]  [filtros ▾]   n resultados  [densidad][↧]│
├─ Cabecera fija (sticky) ────────────────────────────┤
│ ☐ │ # │ Estudiante ↕ │ CI │ Semestre ↕ │ … │ Acciones│
├─ Cuerpo ────────────────────────────────────────────┤
│ ☑ │ 1 │ …                                           │
├─ Pie ───────────────────────────────────────────────┤
│ Mostrando 1–50 de 214            [‹ 1 2 3 … 5 ›]    │
└─────────────────────────────────────────────────────┘
```

Requisitos:

1. **Cabecera fija** al hacer scroll (`position: sticky; top: 0`), con fondo sólido `--superficie-2` y borde inferior. Ya lo hacés en algunas — hacelo en todas.
2. **Primera columna de datos fija** horizontalmente en tablas anchas (Centralizador, Financiero, Historial de Asistencia). El nombre del estudiante nunca debe salir de pantalla al hacer scroll lateral. Ya lo hacés en Historial — extendelo a Centralizador y Financiero.
3. **Ordenamiento por columna** con clic en la cabecera; indicador ↑/↓ y `aria-sort`.
4. **Paginación de 50 filas** por defecto en Estudiantes, Cobranza, Historial de Gastos e Ingresos, Auditoría. Mantener todo en una sola vista solo donde el conteo es acotado (lista de una materia).
5. **Selector de densidad** (Cómoda / Compacta) persistido en `localStorage`. Compacta = alto de fila 34px; Cómoda = 46px. Administración va a querer compacta; los docentes en móvil, cómoda.
6. **Filas con hover** sutil (`--superficie-2`, no verde saturado) y **franja izquierda de 3px** en la fila activa/seleccionada, en `--verde-500`.
7. **Zebra apagada por defecto.** Con líneas de cabello bien definidas no hace falta; el zebra actual con `#f9fbf9` ensucia. Ofrecelo como opción en el selector de densidad si querés.
8. **Selección masiva:** al marcar filas aparece una **barra flotante inferior** (no botones que aparecen y desaparecen en la barra de filtros, como hoy) con: "n seleccionados · Exportar selección · Eliminar · Limpiar". Esa barra sí lleva `backdrop-filter` — es el lugar correcto para el vidrio.
9. **Cargando = skeleton, no texto.** Filas fantasma con animación de brillo. Un esqueleto le da al ojo el mapa espacial de lo que viene y hace que la espera se perciba más corta que con un spinner sobre pantalla vacía. Reutilizá y generalizá tu helper `window.filaCargando()` para que genere skeletons.
10. **Estados vacíos con dirección:** ícono monocromo + una frase que explica + un botón que resuelve. Ejemplos:
    - Estudiantes sin resultados: "Ningún estudiante coincide con estos filtros." → `[Limpiar filtros]`
    - Cobranza vacío: "Nadie tiene cuotas vencidas hoy." (sin botón — es una buena noticia)
    - Historial de asistencia vacío: "Todavía no pasaste lista en esta materia." → `[Pasar lista de hoy]`
11. **Números alineados a la derecha, en monoespaciada tabular.** Montos, notas, porcentajes, conteos. Texto a la izquierda. Estados centrados.
12. **Nunca ocultar columnas en móvil.** Ver §10.

### 5.5 Chips de estado

Un solo componente, `data-tono` en `ok | alerta | error | info | neutro`. Reemplaza a todas las combinaciones de `background`/`color` inline que hay hoy (`ESTADO_CUOTA_BADGE`, `ESTADO_FINANCIERO_BADGE`, aprobado/reprobado, presente/falta, etc.).

**Además del color, cada chip lleva un punto o ícono.** El color por sí solo no puede transmitir significado: hay docentes que no distinguen bien rojo de verde, y hay pantallas de celular baratas donde el verde 500 y el ámbar se parecen.

```html
<span class="chip" data-tono="error"><span class="chip__punto"></span>Vencido</span>
```

### 5.6 Notificaciones (toast)

**Reemplaza todos los `alert()` del sistema.** Esquina inferior derecha en escritorio, borde inferior en móvil.

- Tonos: éxito, error, info, y **acción** (con botón "Deshacer").
- Éxito: 4 s. Error: **no se cierra solo**, requiere cierre manual.
- Máximo 3 apilados; el resto se colapsa en "+n más".
- `role="status"` para éxito/info, `role="alert"` para error.
- Entrada: `translateY(8px) + opacity 0 → 0` en `--dur-base` con `--ease-salida`. Salida: `--dur-rapida` con `--ease-entrada`.
- **"Deshacer" en eliminaciones:** al borrar un estudiante, mostrá el toast con Deshacer durante 6 segundos y ejecutá el `DELETE` recién al vencer. Esto elimina la necesidad del `confirm()` para el 90% de los casos y es mucho mejor experiencia.

### 5.7 Diálogo de confirmación

Para lo que sí es irreversible (eliminación masiva, cierre de caja, anulación de pago). Reemplaza todos los `confirm()`.

- Título que nombra la acción concreta: "Cerrar la caja del 04/08/2026".
- Cuerpo con la consecuencia: "No vas a poder registrar más movimientos ni modificar los existentes."
- Botón de confirmación con **el verbo de la acción**, no "Aceptar": `[Cerrar caja]`. Variante peligro si corresponde.
- Para acciones destructivas de alto riesgo (eliminación masiva de estudiantes): pedir que se escriba la cantidad o la palabra `ELIMINAR` para habilitar el botón.
- Foco inicial en Cancelar. ESC = cancelar.

### 5.8 Modales

Los cinco modales existentes (`modalAsignar`, `modalRegistrarPago`, `modalGestionCobranza`, `modalPasswordEstudiante`, `modalDetalleItems`) deben pasar por un controlador común que garantice:

- Bloqueo del scroll del `<body>`.
- Trampa de foco (Tab cicla dentro del modal).
- Foco al primer campo al abrir; devolución del foco al elemento que lo abrió al cerrar.
- ESC cierra; clic en el overlay cierra (salvo si hay cambios sin guardar → confirmación).
- `role="dialog" aria-modal="true" aria-labelledby`.
- Entrada: overlay `opacity 0→1` en `--dur-rapida`; tarjeta `opacity 0 + translateY(12px) + scale(.98) → normal` en `--dur-lenta` con `--ease-salida`.
- **En móvil (<768px): hoja inferior (bottom sheet)**, no modal centrado. Entra desde abajo, esquinas superiores redondeadas `--r-xl`, con una barra de arrastre visual arriba.

### 5.9 Barra lateral

- **Quitar la numeración `01`–`13`.** No es una secuencia; numerarla es decoración.
- Grupos con encabezado tenue: **Académico** (Inicio, Estudiantes, Docentes, Materias, Notas y Asistencia, Centralizador, Libretas) · **Financiero** (Financiero, Cobranza, Caja, Reportes, Gastos e Ingresos) · **Analítica** (Estadísticas).
- Ítem activo: fondo sutil + **barra vertical de 3px a la izquierda** que se **desplaza** entre ítems (elemento compartido animado con `transform: translateY()`, no un borde que aparece y desaparece). Detalle chico, sensación enorme.
- Botón para **colapsar a 64px** (solo íconos + tooltip), persistido. Administración con 13 ítems en una laptop de 13" lo va a agradecer.
- Indicador de conteo a la derecha de los ítems que lo ameritan: Cobranza muestra cuántos vencen hoy; Materias muestra cuántas están sin docente asignado. Chip pequeño en `--senal-500` si es urgente.
- El bloque "Carrera: Téc. Superior Mec. Automotriz" actual ocupa `flex:1` y empuja el menú. Reducilo a una línea en el pie, junto al usuario.

### 5.10 Barra superior

Rediseñar completo. De izquierda a derecha:

`[☰ móvil] · Ruta ("Financiero / Cobranza") · [🔍 Buscar — ⌘K] · [tema] · [avatar + nombre real + rol]`

- La ruta reemplaza al texto fijo "Gestión Académica", que hoy no aporta nada.
- El avatar dice **el nombre real** del usuario, no "Usuario Activo". Ya tenés el dato en `usuarioLogueado.nombre_completo` para docentes; para admin traelo de la tabla `users`.
- Debajo, la **banda de calibre** (§3.3).

### 5.11 Paleta de comandos (⌘K / Ctrl+K)

Alto impacto, bajo costo. Una entrada de texto flotante que busca en tres grupos a la vez:

1. **Ir a** — los 13 módulos.
2. **Estudiantes** — busca por nombre, apellido o CI; Enter abre su ficha financiera o su libreta.
3. **Acciones** — "Registrar pago", "Abrir caja", "Nuevo estudiante", "Exportar lista", "Cambiar a modo oscuro".

Debounce de 250 ms en la consulta a Supabase. Navegación con flechas, Enter, Esc.

### 5.12 Tabs

Mantené el patrón actual (más legible que el de píldoras) pero:
- El indicador inferior es **un solo elemento que se desplaza y cambia de ancho** entre tabs (`transform` + `width`, `--dur-base`, `--ease-salida`).
- Navegación con flechas ← → y `role="tablist"` / `role="tab"` / `aria-selected`.
- En móvil: scroll horizontal con desvanecido en los bordes que indica que hay más.

### 5.13 Tarjeta de indicador (KPI)

Las 4 de Inicio y las 3 de Estadísticas.

- Cifra grande en `--f-display` con **contador animado** al entrar (de 0 al valor, `--dur-lenta`, easing de salida). Respetar `prefers-reduced-motion`: sin animación, valor directo.
- Etiqueta arriba en `--t-xs` mayúsculas con `--tracking-etiqueta`.
- **Contexto comparativo debajo**, que es lo que hoy falta: "+12 este semestre", "3 menos que ayer". Un número sin referencia no es información.
- Micro-gráfico de línea (sparkline) donde haya serie temporal: cobranza diaria, asistencia semanal. 40px de alto, sin ejes, sin leyenda.
- Toda la tarjeta es clicable y lleva al módulo correspondiente. Hoy son decorativas.
- La tarjeta de "Sin asignar" en rojo debe llevar acción: clic → Materias filtrado por sin asignar.

---

## 6. Rediseño pantalla por pantalla

### 6.1 Login — **tres pantallas, un solo lenguaje**

**Son las únicas pantallas donde el tratamiento tipo RIVR aplica en serio.** Cada una es un momento de marca, dura 8 segundos, no hay datos que leer. Ya no hay tabs Administrador/Docente: `index.html` tiene el login de Admin con un link a `docente.html` en el pie ("¿Es docente? Ingrese por acá"), y `docente.html` tiene su propio login con el link inverso hacia `index.html`. `estudiante.html` es una tercera pantalla de login independiente, hoy con un layout distinto (tarjeta centrada, sin panel izquierdo) — ver el último punto.

- **`index.html` y `docente.html`** comparten hoy el mismo layout split-screen (panel de marca a la izquierda, formulario a la derecha) — **debe seguir siendo el mismo componente visual en ambos**, con el copy propio de cada uno (institucional vs. "Portal Docente"). Mantener la retícula técnica, pero **animarla suavemente** (desplazamiento lentísimo, `transform: translate` en loop de 60 s, o parallax de 8px con el mouse). Sello con marcas de esquina que se dibujan al cargar (`stroke-dashoffset`).
- Tarjeta del formulario: `--r-xl`, `--sombra-4`, y ahí sí `backdrop-filter: blur(20px)` con `background: rgba(255,255,255,.72)` sobre el degradado verde.
- Entrada escalonada: eyebrow → título → descripción → campos → botón, con 60 ms entre cada uno, `translateY(10px) → 0`. Total bajo 600 ms.
- El link cruzado ("¿Es docente? / ¿Es administrador?") no puede ser un `<a>` de texto plano perdido en el pie — dale tratamiento de acción secundaria clara, coherente entre los dos archivos.
- Error de credenciales: además del mensaje, un **shake horizontal de 3px** en la tarjeta (`--dur-base`), que es la convención universal y se entiende sin leer. Aplica a los tres logins.
- El ojo de la contraseña ya funciona bien en `index.html`/`docente.html`; unificalo como componente y usalo también en `estudiante.html` (login y modal de cambio de contraseña).
- **`estudiante.html`** hoy es una tarjeta centrada sin panel izquierdo, más liviana — decidir en la Fase 8 si conviene llevarla al mismo layout split-screen por consistencia de marca, o mantenerla distinta a propósito por ser la de menor jerarquía (login más simple, un dato: CI + contraseña). Si se mantiene distinta, igual debe compartir tokens, tipografía y el mismo tratamiento de error/foco que las otras dos.

### 6.2 Inicio

Hoy son 4 números y una tabla de auditoría con UUIDs. Reconstruir como **tablero de decisión**, no como grilla de KPIs:

- **Fila 1 — Lo que requiere acción hoy** (esto es lo primero que debe ver administración): "n cuotas vencen hoy" → Cobranza · "n materias sin docente" → Materias · "Caja sin abrir" → Caja · "n estudiantes en mora" → Financiero. Tarjetas con verbo y destino.
- **Fila 2 — Los cuatro conteos actuales**, ahora con contexto y sparkline.
- **Fila 3 — Actividad reciente**: la tabla de auditoría, pero **legible**. Resolvé `usuario_id` contra la tabla `users` (o el nombre del docente) y mostrá: avatar con iniciales · nombre · acción en lenguaje humano · módulo como chip · tiempo relativo ("hace 12 min") con la fecha exacta en `title`. Agrupá por día con separadores "Hoy" / "Ayer" / fecha.
- Quitá el dispositivo del texto de la acción (`[Dispositivo: Windows - Chrome]` concatenado al string): pasalo a una columna aparte o a un tooltip. Hoy ensucia cada fila.

### 6.3 Estudiantes

- **Registrar**: mantener las tres secciones (Identidad / Académico / Contacto) — la estructura de dos columnas con explicación a la izquierda ya es buena, es lo mejor que tiene el sistema hoy. Mejorar: validación por campo, máscaras, y una **barra de acciones fija abajo** (sticky) con el botón Guardar, para que no haya que hacer scroll hasta el final.
- Al **editar**, el formulario debe verse distinto: cambiar el título a "Editar: Nombre Apellido", mostrar un chip "Editando" y un botón "Cancelar edición". Hoy solo cambia el texto del botón y es fácil no darse cuenta.
- **Lista**: aplicar el componente de tabla completo (§5.4). Filtros como chips removibles arriba de la tabla ("Semestre: 3°" ×, "Turno: Noche" ×) además de los selects.
- **Importar Excel**: convertir en asistente de 3 pasos con indicador de progreso. Zona de arrastrar y soltar real (no un `<input type=file>` desnudo dentro de un borde punteado). Y lo más importante: **previsualización antes de importar** — mostrar las primeras 10 filas leídas en una tabla, marcar en rojo las que tienen problemas (CI duplicado, celular vacío), y permitir importar solo las válidas. Hoy se importa a ciegas.
- **Arrastres**: reemplazar el `<select size="8">` por el combobox de §5.3. La tabla de materias con checkboxes está bien resuelta; agregarle un buscador y un contador "3 materias seleccionadas".

### 6.4 Docentes

- Lista con avatar de iniciales (ya lo hacés, se ve bien) pero como componente.
- **Quitar la contraseña en texto plano de la tabla.** Reemplazar por un botón "Restablecer contraseña" que abra el modal correspondiente. Ver §12.4.
- La carga horaria (que hoy se calcula y se muestra apilada) merece mejor tratamiento: chips de materia + total de horas en un chip destacado, y una **barra de capacidad** (ej. sobre 30 hrs/semana) que se pone en `--senal-500` si se pasa.
- Campos de títulos dinámicos: buen concepto, mala terminación. Cada título debe ser una fila con handle de arrastre para reordenar, y el botón de quitar debe ser `.btn--fantasma`, no un botón rojo con fondo.

### 6.5 Materias (plan de estudios)

Es una de las pantallas más lindas de rediseñar porque es puro contenido técnico.

- Cada semestre como un panel colapsable con resumen en la cabecera: "Primer Semestre · 7 materias · 30 hrs · **2 sin asignar**".
- La tabla mantiene la estructura, pero las celdas de docente pasan a usar el chip de §5.5 y el botón "+ Asignar" debe ser evidentemente accionable (hoy es un botón con borde punteado, se lee como deshabilitado).
- **Prerrequisitos:** hoy es una columna de texto. Al pasar el mouse sobre `MOG 100` en la columna prerrequisito, resaltá esa materia en el semestre correspondiente. Es un detalle de artesanía que hace sentir el producto vivo.
- Filtro rápido arriba: "Todas / Sin docente / Turno Mañana / Turno Noche".

### 6.6 Calificar (docente) — **la pantalla más importante del sistema**

Vive en `docente.html`. Es donde un docente pasa media hora cargando notas de dos trimestres. **Ya no es Teoría(30)/Práctica(70):** hoy tiene 3 pestañas — **Trimestre 1**, **Trimestre 2**, **Resumen y Recuperatorio** (ver `renderizarTablaCalificaciones`, `recalcularEstudiantePorId` y `guardarCalificacionesMasivas` en `docente.html`). Cada trimestre pondera: Asistencia (20, **automática, no editable** — viene de `config_trimestres` + la tabla de asistencia), Destreza (20), Investigación (20), Prácticas (10), Examen (30). El Resumen calcula la nota semestral (T1×0.70 + T2×0.30) y habilita el Recuperatorio solo si esa nota queda entre 42 y 60 (techo fijo de 61 si aprueba). Esto es lógica de negocio — **no se toca**, solo se rediseña la piel.

Convertir en una **planilla de precisión**, respetando las 3 pestañas:

1. **Navegación por teclado dentro de cada pestaña:** `Enter` o `↓` baja a la siguiente fila en la misma columna (Destreza→Destreza, Examen→Examen). `Tab` avanza a la columna siguiente. `↑` sube. `Esc` revierte el valor de la celda. Al llegar a la última fila, avisa y ofrece guardar. La celda de Asistencia **no es tabulable** (es de solo lectura).
2. **Pegar desde Excel:** al pegar en la primera celda de una columna editable (ej. Destreza de T1), distribuir el contenido del portapapeles por las filas siguientes de esa misma columna. Esto es lo que los docentes realmente hacen (tienen su planilla en Excel).
3. **Autoguardado con debounce de 2 s**, más indicador de estado permanente en la cabecera (visible en las 3 pestañas, no solo en la activa): `Sin cambios` / `Guardando…` / `Guardado a las 14:32`. El botón "Guardar Notas" queda como respaldo explícito y **guarda las 3 pestañas juntas** (ya lo hace hoy — mantenerlo).
4. **Aviso al salir con cambios sin guardar** (`beforeunload` + interceptar la navegación a Mis Materias / cambio de pestaña con cambios pendientes en más de una).
5. **Feedback inmediato al escribir:** el Subtotal de la fila (en T1/T2) y la Nota Semestral / Nota Final (en Resumen) se recalculan con una transición de color — esto ya lo hace `recalcularEstudiantePorId`, falta la transición visual, no el reemplazo brusco de `textContent`.
6. **Límites visibles y aplicados:** sufijo `/20`, `/10`, `/30` según el campo, dentro de cada input; si se pasa, el campo se pone en error y se recorta al máximo (ya lo hace `recalcularFila`, falta el feedback visual).
7. **La celda de Asistencia** (T1 y T2) se muestra siempre como dato de solo lectura con aspecto distinto al de los inputs editables — hoy ya no es un input, es texto (`${a.pts} pts (${a.presentes}/${a.total})`); dale tratamiento visual de "campo calculado" (fondo `--superficie-2`, ícono de candado o de fórmula) para que quede claro que no se toca a mano.
8. **El input de Recuperatorio** (pestaña Resumen) aparece deshabilitado con un estado visual claro ("No aplica") cuando la nota semestral está fuera del rango 42–60 — ya es así funcionalmente (`recInput.disabled`), falta el tratamiento visual acorde a un campo deshabilitado del sistema de componentes.
9. **Fila de resumen fija abajo, por pestaña:** en T1 y T2, promedio del curso en esa columna de subtotal; en Resumen, cuántos Aprobados/Reprobados/Sin evaluar según Nota Final. Se actualiza en vivo mientras se escribe.
10. **La banda de calibre** arriba muestra el avance de la pestaña activa: en T1/T2, alumnos con algún dato cargado en ese trimestre / total; en Resumen, alumnos con Nota Final ≥ 61 / total.
11. Resaltar la fila activa con la franja izquierda de 3px — la misma fila (por `data-id`) debe resaltarse en las 3 tablas si el usuario pasa de pestaña sin perder contexto.

### 6.7 Asistencia (docente)

- **Eliminar el `prompt()`.** El motivo se escribe en el input que ya existe, que aparece con una transición de altura cuando se elige "Falta Justificada", y recibe el foco automáticamente.
- **Acciones rápidas arriba:** `[Marcar todos presentes]` (el caso más común, ahorra 35 interacciones) y `[Limpiar]`. Después el docente solo cambia las excepciones.
- **Selector de estado como grupo de tres botones segmentados**, no un `<select>`: `P` / `F` / `FJ` con color y punto. Un toque en vez de dos.
- En móvil, cada estudiante es una tarjeta con los tres botones grandes (mínimo 44px). Esto es la diferencia entre pasar lista en 40 segundos o en 4 minutos.
- El contador "Faltas: 5/8 | Justificadas: 2/5" merece ser una **barra de progreso en miniatura** con umbrales de color, no texto.
- Estado "Fuera del Instituto" (8+ faltas): que sea un chip de peligro con ícono, y que la fila entera tenga fondo `--error-bg` muy tenue.
- Fecha: además del `<input type=date>`, botones `‹ Hoy ›` para saltar días rápido.

### 6.8 Historial de asistencia y Centralizador

Ambas son matrices anchas. Mismo tratamiento:

- Primera columna (nombre) fija horizontalmente; cabecera fija verticalmente; la **esquina** donde se cruzan también fija.
- Celdas: reemplazar `1` / `0` / `FJ` por **puntos de color de 8px** con `title`. Una matriz de 35×20 se lee infinitamente mejor como mapa de calor que como números. Los conteos totales sí van en cifras.
- Columnas de totales visualmente separadas del resto (borde izquierdo más fuerte, fondo `--superficie-2`).
- Al pasar el mouse sobre una celda, resaltar toda su fila y su columna (cross-highlight). Es un detalle chico y transforma la usabilidad de una matriz.
- En Centralizador: la fila "Promedio de la clase" fija al pie (`position: sticky; bottom: 0`).
- Las notas siguen la misma escala de color en toda la app: reprobado / al límite (61–70) / bien / excelente. Definir esos cuatro tonos en tokens y usarlos también en Libretas y Estadísticas.

### 6.9 Financiero, Cobranza, Caja, Reportes, Gastos

- **Financiero — lista de estudiantes:** las 5 columnas de cuota que hoy muestran el monto con fondo de color se leen mal. Reemplazar por **5 puntos/segmentos** que muestran el estado de un vistazo, y el monto solo en el tooltip. Al final, el saldo en monoespaciada grande. Así se escanean 40 estudiantes en 3 segundos.
- Al seleccionar un estudiante, el detalle **no debe aparecer abajo con scroll** (hoy hace `scrollIntoView`): debe abrirse en un **panel lateral deslizante** de 520px desde la derecha, con la lista todavía visible a la izquierda. Así se pasa de un estudiante a otro sin perder el contexto.
- El acordeón `<details>` "Agregar otro contacto" está bien pensado; darle el estilo del sistema (hoy usa `list-style:none` y nada más).
- **Cobranza:** cada fila necesita el "por qué" visible: cuánto debe, hace cuántos días, cuándo fue el último contacto y con qué resultado. Agregá una columna "Última gestión" con tiempo relativo. Los botones de teléfono/WhatsApp deben ser `.btn--fantasma` con ícono, no emojis sueltos (📞 💬).
- **Caja:** hoy se construye con `innerHTML` de un string enorme. Convertir en tres tarjetas claras (Apertura / Movimientos / Cierre) con la diferencia calculada en vivo mientras se escribe el monto contado — mostrando en verde/rojo si cuadra o no **antes** de confirmar.
- **Reportes:** los rangos de fecha necesitan atajos: `Hoy · Esta semana · Este mes · Mes pasado · Personalizado`. Es el 95% de los casos.
- **Gastos e Ingresos:** el editor de ítems es lo mejor para aplicar navegación por teclado (Enter en la última celda agrega una fila nueva). El total al pie debe animarse al cambiar (contador, `--dur-rapida`).

### 6.10 Estadísticas

- Los `Chart.js` actuales usan la configuración por defecto. Configuralos con los tokens: sin grillas verticales, grilla horizontal en `--borde`, tipografía `--f-cuerpo`, colores de la paleta, `borderRadius` en las barras, tooltip propio con el estilo del sistema.
- Animación de entrada de los gráficos: sí, pero corta (`--dur-lenta`) y desactivada bajo `prefers-reduced-motion`.
- El `<select>` "Top 5/10/15" dentro de la cabecera verde con `rgba(255,255,255,.2)` se ve mal; sacarlo de la cabecera y ponerlo como control segmentado sobre la tabla.
- Faltan dos cosas que administración va a pedir: **distribución de notas** (histograma por rangos) y **evolución de asistencia por semana**.

### 6.11 Libretas

Es un documento oficial. Es la pantalla donde la dirección "Ficha Técnica" debe verse más pura:

- Marcas de esquina en las cuatro esquinas del documento.
- Franja de identificación en monoespaciada arriba: `TESLAVI · LIBRETA · 2026-II · CI 1234567`.
- Datos del estudiante en grilla con líneas de cabello y etiquetas en `--t-xs` mayúsculas.
- La tabla de notas con la escala de color unificada.
- Vista previa en pantalla **idéntica** al PDF que se exporta (hoy divergen).
- Sombra de papel (`--sombra-3`) sobre el fondo, con un ancho fijo tipo A4 centrado.

---

## 7. Especificación de movimiento

Regla marco: **la animación aclara, no decora.** Si la quitás y no se pierde información ni contexto, sobra.

| Elemento | Propiedad | Duración | Curva |
|---|---|---|---|
| Hover de botón / fila / chip | `background`, `border-color` | `--dur-instant` | `--ease-estandar` |
| Presión de botón | `transform: translateY(1px) scale(.99)` | `--dur-instant` | `--ease-estandar` |
| Foco de campo | `border-color`, `box-shadow` | `--dur-rapida` | `--ease-estandar` |
| Indicador de tab / sidebar | `transform`, `width` | `--dur-base` | `--ease-salida` |
| Cambio de sección | `opacity 0→1` + `translateY(6px)→0` | `--dur-base` | `--ease-salida` |
| Filas de tabla al cargar | escalonado, 20 ms entre filas, máximo 12 filas | `--dur-rapida` | `--ease-salida` |
| Modal / panel lateral | `opacity` + `translateY(12px)` + `scale(.98)` | `--dur-lenta` | `--ease-salida` |
| Toast | `opacity` + `translateY(8px)` | `--dur-base` entrada / `--dur-rapida` salida | salida / entrada |
| Contadores KPI | interpolación numérica | `--dur-lenta` | `--ease-salida` |
| Banda de calibre | `transform: scaleX()` | `--dur-lenta` | `--ease-salida` |
| Skeleton | brillo en loop | 1400 ms | `linear` |
| Éxito de guardado | check con `scale` + resorte | `--dur-base` | `--ease-resorte` |

Reglas duras:

- **Animar solo `transform` y `opacity`.** Nunca `width`, `height`, `top`, `left` (salvo el indicador de tab, que va con `will-change`). Nada de animar `box-shadow` en listas largas.
- **Escalonado máximo 20 ms** entre filas y **máximo 12 elementos**. Si escalonás 40 filas a 40 ms cada una, la última tarda 1,6 s en aparecer: eso es peor que sin animación.
- **Nada bloquea la interacción.** La página debe ser usable en menos de 300 ms desde que aparece.
- **Sin parallax, sin blur pesado, sin partículas.** Los celulares de tus docentes no los aguantan.
- `prefers-reduced-motion: reduce` obligatorio:

```css
@media (prefers-reduced-motion: reduce){
  *,*::before,*::after{
    animation-duration:.01ms !important;
    animation-iteration-count:1 !important;
    transition-duration:.01ms !important;
    scroll-behavior:auto !important;
  }
}
```

Los cambios de estado deben seguir siendo evidentes sin movimiento: color, ícono y texto.

---

## 8. Accesibilidad — piso mínimo no negociable

1. Contraste de texto normal ≥ 4.5:1, texto grande y componentes ≥ 3:1. Verificá especialmente los chips (el ámbar sobre fondo claro suele fallar) y `--texto-tenue` sobre `--superficie-2`.
2. **El color nunca es el único portador de significado.** Todo chip lleva punto o ícono; toda celda de matriz lleva `title`; toda barra de progreso lleva valor numérico.
3. Foco visible en todo elemento interactivo, incluidas las filas clicables (`tabindex="0"` + activación con Enter/Espacio). Las filas de Financiero hoy tienen `onclick` sin ser alcanzables por teclado.
4. Toda entrada tiene `<label for>` real. Varios inputs de la app hoy tienen etiqueta puramente visual.
5. Toasts y validaciones con `aria-live` correcto.
6. Toda tabla con `<caption>` (visualmente oculto si hace falta), `<th scope>` y `aria-sort`.
7. Objetivos táctiles ≥ 44×44px en móvil. Los botones de acción de la lista de estudiantes (✏️ 🔑 🗑️) hoy miden ~20px.
8. Reemplazar los emojis usados como íconos funcionales (✏️ 🗑️ 🔑 📞 💬 🔍 ⏳ 📋 🧾 💸 💰 📱 ⬇️) por SVG del mismo set que ya usás. Los emojis se renderizan distinto en cada sistema, no heredan color, y los lectores de pantalla los leen literalmente ("emoji lápiz").
9. `lang="es"` ya está. Agregá `<html>` con el atributo de tema y un `<a class="saltar-al-contenido">` para saltar la navegación.

---

## 9. Reglas de contenido y voz

- **Elegí un tratamiento y sostenelo.** Hoy conviven "Poné el monto", "Completá quién pagó", "Dejá vacío" (voseo) con "Ingrese con las credenciales", "Seleccione un docente" (usted). **Recomendación: usted en todo el sistema** — es una institución educativa boliviana y el registro formal es el esperado, sobre todo en documentos como libretas y recibos.
- Los botones dicen **el verbo de lo que hacen**, y ese verbo se mantiene en toda la secuencia: el botón "Registrar pago" produce el toast "Pago registrado". Nunca "Enviar", "Aceptar", "OK".
- Los errores explican **qué pasó y cómo se arregla**, sin disculparse: "No se pudo eliminar: el estudiante tiene pagos registrados. Anule los pagos primero." Reemplazá los mensajes actuales que exponen detalles internos de Supabase al usuario final (por ejemplo el que dice "Ve a tu panel de Supabase > Authentication > Policies…"): eso va a consola, no a la pantalla de la secretaria.
- Los estados vacíos son una invitación a actuar, no un aviso de que algo falta.
- Nada de mayúsculas sostenidas fuera de las etiquetas tipo eyebrow.

---

## 10. Responsive

**El principio que hoy se está violando:** en móvil no se oculta información, se reorganiza.

- Reemplazar `@media (max-width:768px){ .semestre-card .materia-table th:nth-child(n+4){ display:none } }` y el `display:block; white-space:nowrap` en `.materia-table`.
- **Bajo 768px, las tablas se convierten en tarjetas:** cada fila es una tarjeta con el dato principal como título, los secundarios en pares etiqueta/valor, y las acciones abajo. Implementalo con un solo componente `.tabla-responsiva` que use `data-label` en cada `<td>`, para no duplicar el HTML.
- Excepciones donde la matriz debe seguir siendo matriz (Centralizador, Historial): scroll horizontal con la primera columna fija y un indicador de "hay más a la derecha" (degradado en el borde).
- Formularios: una sola columna bajo 768px. Ya lo hacés.
- Modales → hojas inferiores. Ver §5.8.
- Barra de acciones fija abajo en formularios largos, respetando `env(safe-area-inset-bottom)`.
- Probar en 360px de ancho, que es lo que tiene la mayoría de los celulares de gama media en Bolivia.

---

## 11. Arquitectura de archivos

Ya no es un archivo único: son **tres páginas de entrada** (`index.html`, `docente.html`, `estudiante.html`), cada una self-contained a propósito porque cada una tiene su propio login/sesión y las funciones colgadas de `window` no deben chocar entre sí. El corte de §11 no busca fusionarlas en una SPA — busca que **no se repita CSS que debe ser idéntico en las tres**, y reducir la duplicación de JS que sea puramente de interfaz (no de lógica de negocio).

Propuesta mínima (sigue siendo estático, se sube por FTP a cualquier hosting igual que hoy — los tres HTML solo agregan `<link>`/`<script src>` apuntando a los mismos archivos):

```
/index.html
/docente.html
/estudiante.html
/assets/css/01-tokens.css       ← §4 — IDÉNTICO en los 3 archivos, esto es lo crítico
/assets/css/02-base.css         ← reset, tipografía, utilidades — compartido
/assets/css/03-componentes.css  ← §5 (botones, campos, chips, tabs, tabla, modal, toast…) — compartido
/assets/js/01-ui.js             ← toast, confirm, modal (controlador genérico), skeleton, combobox — compartido, CERO lógica de negocio ni llamadas a Supabase
```

Cada HTML mantiene embebido (no se comparte, y la duplicación es intencional — ver §0.1):
- Config de Supabase (`SUPABASE_URL`/`SUPABASE_ANON_KEY` — son públicas, no hay riesgo en repetirlas).
- `planEstudios`.
- El motor de cálculo de notas (`obtenerNotaObj`, `ptsAsistenciaTrimestre`, `subtotalTrimestre`, `calcularNotaMateria`, `fmtNum`, `estadoBadgeHtml`) — **evaluar en la Fase 0** si conviene moverlo a `/assets/js/00-motor-notas.js` compartido, ya que hoy está triplicado carácter por carácter en los tres archivos y cualquier ajuste a la fórmula (§ recuperatorio, ponderación 70/30, etc.) hay que replicarlo a mano tres veces. Es candidato ideal para compartir porque es puro (no toca el DOM, no llama a Supabase) — decisión a confirmar conmigo antes de moverlo, no asumirlo.
- Todo el resto de la lógica específica del rol: login, queries a Supabase, render de secciones, exportaciones.

Condiciones para el corte:
- **No convertir a módulos ES ni a un framework.** Los `onclick` inline del HTML dependen de que las funciones estén en `window`. Usar `<script>` clásicos en orden — tanto los compartidos (`/assets/js/`) como los embebidos.
- Hacer el corte **antes** de empezar el rediseño visual, en una fase propia, verificando que las tres páginas sigan funcionando exactamente igual (login admin, login docente, login estudiante, guardar nota, guardar asistencia, registrar pago).
- Si hay una restricción de hosting que obliga a no usar rutas `/assets/`, decilo y trabajamos in-place; pero entonces al menos separá el CSS en un solo bloque ordenado por capas al inicio de cada uno de los tres archivos.

---

## 12. Riesgos no visuales que conviene corregir de paso

No son parte del rediseño, pero se cruzan con él y sería raro tocarlo todo y dejarlos:

1. **Quitar el manejador `window.onerror` que pinta la barra roja** con el stack en producción. Reemplazar por `console.error` + un toast genérico ("No se pudo completar la operación. Intente de nuevo.").
2. **Lo mismo con `unhandledrejection`** (la barra naranja).
3. **Las claves de docentes están en texto plano** en la columna `password_temporal`, se muestran en la lista de docentes (`index.html` → `cargarDocentes`), y el login de docente (ahora en `docente.html`) hace `select("*")` sobre la tabla y compara en el navegador — o sea que cualquiera que abra la consola puede leer todas las claves de todos los docentes. Lo mismo con `password_custom` de estudiantes en `estudiante.html`. Esto debería resolverse con una función RPC en Supabase que valide del lado del servidor y devuelva solo el perfil, y guardando un hash. Fuera del alcance de este rediseño, pero conviene planificarlo. Mientras tanto, **como mínimo sacá la contraseña de la vista de la lista de docentes**.
4. `estudiantes` se consulta con `select("*")` en varios lugares (los tres archivos) trayendo `calificaciones` y `asistencias` completos (JSON grande) aunque solo se necesiten 4 campos. En Estadísticas y Financiero esto va a pesar cuando haya 500 estudiantes. Seleccioná solo las columnas necesarias.
5. Duplicación del bloque `@media (max-width:1024px)` con `.topbar` en `index.html`.
6. **No es un bug:** las políticas RLS de `docentes`, `estudiantes` (columnas de notas/asistencia) y `config_trimestres` están abiertas al rol `anon` a propósito, porque `docente.html` y `estudiante.html` no usan Supabase Auth. No "arregles" eso pensando que es un descuido — es la misma decisión de arquitectura que el punto 3 ya señala como riesgo a resolver más adelante con RPC + hash, no algo para tocar en el rediseño visual.

---

## 13. Plan de fases

Cada fase termina con el sistema funcionando. No pases a la siguiente sin verificar.

| Fase | Qué se hace | Criterio de aceptación |
|---|---|---|
| **0. Corte** | Extraer §11 a `/assets/css/*.css` y `/assets/js/01-ui.js`, enlazados desde los **tres** HTML. Evaluar si el motor de cálculo de notas se comparte (§11). Quitar los manejadores de error que pintan barras — **en los tres archivos** (`index.html` y `docente.html` lo tienen, revisar `estudiante.html`). Eliminar el bloque `@media` duplicado en `index.html`. Sin cambios visuales. | Las tres apps se comportan **idénticas** a hoy. Login admin, login docente, login estudiante, guardar nota (T1/T2/Recuperatorio), guardar asistencia, registrar pago: todo funciona en los 3 archivos |
| **1. Fundaciones** | Tokens de §4, fuentes nuevas, `base.css`, modo oscuro, `prefers-reduced-motion` — vía `/assets/css/`, activo en los 3 archivos. Purga de hex sueltos módulo por módulo | Cero valores de color literales fuera de `01-tokens.css`. El tema oscuro funciona en las tres apps, incluida la pantalla de login de cada una |
| **2. Componentes** | Botones, campos, combobox, chips, toast, confirm, modal, skeleton, estados vacíos. Todo en `03-componentes.css` + `01-ui.js`, compartido por los 3 archivos | Cero `alert()`, `confirm()` y `prompt()` en el código, en ningún archivo. Cero `style="..."` en los componentes migrados |
| **3. Estructura** | Sidebar agrupado y colapsable, topbar con ruta y usuario real, banda de calibre, paleta de comandos ⌘K, transición entre secciones | Navegación completa con teclado. La banda refleja datos reales en al menos 3 módulos |
| **4. Tablas** | Componente de tabla único: sticky, orden, paginación, densidad, selección masiva con barra flotante, tarjetas en móvil | Ninguna tabla oculta columnas en móvil. Las 15 tablas usan el mismo componente |
| **5. Captura de datos** | Validación por campo, máscaras, teclados móviles, barra de acciones fija, asistente de importación con previsualización | Se puede completar el alta de un estudiante sin ver un solo mensaje de error genérico |
| **6. Pantallas críticas** | En `docente.html`: Calificar con sus 3 pestañas T1/T2/Resumen (teclado + pegado + autoguardado, §6.6) y Asistencia (segmentado + marcar todos + sin `prompt`) | Cargar notas de T1 y T2 de 35 alumnos sin tocar el mouse. Pasar lista de 35 alumnos en menos de 45 segundos en celular |
| **7. Documentos y datos** | Libretas, Centralizador, Estadísticas, Financiero con panel lateral, exportaciones unificadas en un menú | La vista en pantalla de la libreta y su PDF son visualmente equivalentes |
| **8. Pulido** | Login animado, contadores, sparklines, cross-highlight, revisión de contraste, prueba a 360px, prueba con teclado, prueba con motion reducido | Recorrido completo sin encontrar un solo estilo inline, un emoji funcional o un contraste bajo |

---

## 14. Anti-patrones — qué NO hacer

- ❌ **Glassmorphism sobre tablas y formularios.** Solo login, barra de selección masiva, capa de modal.
- ❌ **Degradados de color en botones, tarjetas o cabeceras.** Un solo degradado permitido: el fondo del panel de marca del login y la barra lateral, que ya existe.
- ❌ **Sombras coloreadas** (`box-shadow` con tinte verde o azul). Solo neutras.
- ❌ **Más de un botón primario visible por pantalla.**
- ❌ **Íconos emoji** para funciones. SVG del set actual.
- ❌ **Animaciones de más de 400 ms** en cualquier cosa que no sea la banda de calibre.
- ❌ **Ocultar datos en móvil.** Reorganizar, nunca esconder.
- ❌ **Colores de marca ajenos** (verde Excel, rojo Adobe, azul Word, verde WhatsApp). Los íconos de esas acciones van monocromos.
- ❌ **Texto por debajo de 12px** en cualquier parte, y por debajo de 16px en inputs móviles.
- ❌ **Zebra + hover + borde + sombra** en la misma tabla. Elegí dos.
- ❌ **Reemplazar `innerHTML` completo** de una tabla en cada actualización si eso mata el foco del usuario mientras escribe. En Calificar y Asistencia, actualizá celdas puntuales.
- ❌ **Inventar nombres de columnas o RPC de Supabase.** Si algo no existe, avisá; no lo asumas.

---

## 15. Prompt listo para pegar en Claude Code

> Tengo un sistema de gestión académica y financiera para el Instituto Tecnológico TESLAVI (carrera de Mecánica Automotriz, Bolivia), hecho con Supabase como backend y **tres páginas HTML independientes** (`index.html` para Administración, `docente.html` para el portal del docente, `estudiante.html` para el portal del estudiante), cada una con su propio login y su HTML+CSS+JS embebido. Funciona, pero la interfaz, la experiencia de uso y las animaciones están muy por debajo del nivel que necesito: quiero que se sienta un producto premium de pago, y que las tres páginas se sientan una sola marca.
>
> Te adjunto `TESLAVI-Rediseno-Brief.md`, que es la especificación completa del rediseño: dirección de diseño ("Ficha Técnica"), sistema de tokens, biblioteca de componentes, rediseño pantalla por pantalla, especificación de movimiento, accesibilidad, responsive, arquitectura de archivos (§0.1 y §11 explican cómo aplica con tres archivos) y un plan de 9 fases.
>
> Instrucciones:
> 1. Leé el brief completo antes de escribir código.
> 2. Trabajá **una fase por vez**, en orden, empezando por la Fase 0. No avances a la siguiente sin que yo confirme.
> 3. Al terminar cada fase, hacé un resumen corto de qué cambiaste, qué archivos tocaste (de los tres) y qué debo probar yo para validarla.
> 4. Restricciones absolutas: no cambies nombres de tablas, columnas ni funciones RPC de Supabase; no cambies `id` de elementos HTML sin actualizar todas sus referencias en JS del archivo correspondiente; no cambies los nombres de las funciones colgadas de `window.` que se invocan desde atributos `onclick`; no conviertas el proyecto a un framework ni a módulos ES; no fusiones los tres archivos en uno ni cambies cómo se autentica cada rol.
> 5. Si encontrás una contradicción entre el brief y el código, preguntame antes de decidir.
> 6. Antes de escribir el CSS de la Fase 1, mostrame el plan de tokens y una muestra de los componentes principales (botones, campos, chips, tabla) en un archivo HTML aparte, para que yo lo apruebe visualmente.
>
> Empezá por la Fase 0.

---

## Anexo A — Inventario de identificadores críticos

Estos `id` están referenciados desde JS. Si se tocan, hay que actualizar ambos lados — **en el archivo correspondiente**. `docente.html` y `estudiante.html` tienen su propio namespace de IDs, independiente del de `index.html` (aunque algunos nombres se repiten entre archivos, ej. `vistaLogin`/`vistaSistema`/`mensajeError`/`btnSalir`, no son el mismo elemento ni comparten JS).

### A.1 `index.html` (Administración)

**Login:** `vistaLogin`, `vistaSistema`, `pantallaVerificando`, `formLogin`, `correo`, `contrasena`, `btnIngresar`, `btnTexto`, `mensajeError`, `labelUsuario`, `btnTogglePassword`, `icono-ojo-abierto`, `icono-ojo-cerrado`, `labelRol`, `btnSalir`. *(Ya no tiene `tabAdmin`/`tabDocente`: el login docente se movió entero a `docente.html`, acá solo queda un link `<a href="docente.html">`.)*

**Layout:** `sidebarPrincipal`, `sidebarOverlay`, `btnHamburguesa`, `menu-admin-*`. *(`menu-docente-materias` ya no existe acá — vive en `docente.html`.)*

**Secciones:** `seccion-inicio`, `seccion-estudiantes`, `seccion-docentes`, `seccion-materias`, `seccion-admin-academico`, `seccion-estadisticas`, `seccion-centralizador`, `seccion-libretas`, `seccion-financiero`, `seccion-cobranza`, `seccion-caja`, `seccion-reportes-financieros`, `seccion-gastos-institucionales`, `seccion-visor-admin-notas`, `seccion-visor-admin-asistencia`. *(`seccion-mis-materias`, `seccion-calificar`, `seccion-asistencia`, `seccion-historial-asistencia` ya NO están en `index.html` — ver A.2.)*

**Config de Trimestres (nuevo, dentro de `seccion-admin-academico`):** `cfgT1Inicio`, `cfgT1Fin`, `cfgT2Inicio`, `cfgT2Fin`, `btnGuardarConfigTrimestres`, `mensajeConfigTrimestres`.

**Vistas internas (tabs):** `vista-registro`, `vista-lista`, `vista-importar`, `vista-arrastre`, `vista-registro-doc`, `vista-lista-doc`, `vista-financiero-estudiantes`, `vista-financiero-config`, `vista-gastos`, `vista-ingresos`.

**Cuerpos de tabla:** `tablaEstudiantesBody`, `tablaDocentesBody`, `tabla-auditoria`, `tablaAdminNotasHead`, `tablaAdminNotasBody`, `tablaAdminAsistenciaHead`, `tablaAdminAsistenciaBody`, `tablaCentralizadorHead/Body/Foot`, `tbody-resultados-libreta`, `tbody-materias-libreta`, `tfoot-materias-libreta`, `tbodyFinancieroLista`, `tbodyCuotasFinanciero`, `tbodyHistorialPagos`, `tbodyCobranza`, `tbodyDiaPagoMensual`, `tbodyItemsGasto`, `tbodyItemsIngreso`, `tbodyHistorialGastos`, `tbodyHistorialIngresos`, `tbodyDetalleItems`, `tabla-top-estudiantes`, `tabla-alertas-faltas`. *(`tablaCalificacionesBody`, `tablaAsistenciaBody`, `tablaHistorialBody`/`Head` ya no están acá.)*

**Modales:** `modalAsignar`, `modalRegistrarPago`, `modalGestionCobranza`, `modalPasswordEstudiante`, `modalDetalleItems`.

**Contenedores dinámicos:** `contenedorMaterias`, `contenedorAdminAcademico`, `contenedorTitulos`, `arrastreMateriasContenedor`, `cajaContenido`, `reportesResultado`, `reportesMorosidad`, `financieroDetalle`, `financieroResumenGrid`.

**Gráficos:** `chartRendimiento`, `chartAsistencia`.

### A.2 `docente.html` (portal del docente)

**Login:** `vistaLogin`, `vistaSistema`, `formLoginDocente`, `ci`, `contrasena`, `btnIngresar`, `btnTexto`, `mensajeError`, `btnSalir`.

**Layout:** `sidebarPrincipal`, `sidebarOverlay`, `btnHamburguesa`, `labelNombreDocente`, `labelRol`.

**Secciones:** `seccion-mis-materias`, `seccion-calificar`, `seccion-asistencia`, `seccion-historial-asistencia`.

**Tabs de Calificar (nuevo, §6.6):** `tabBtnCalificarT1` + botones de `tab-calificar-t2`/`tab-calificar-resumen`, contenedores `tab-calificar-t1`, `tab-calificar-t2`, `tab-calificar-resumen`.

**Cuerpos de tabla:** `tablaT1Body`, `tablaT2Body`, `tablaResumenBody` (Calificar — reemplazan a `tablaCalificacionesBody`), `tablaAsistenciaBody`, `tablaHistorialBody`, `tablaHistorialHead`.

**Otros:** `contenedorMisMaterias`, `fechaAsistencia`, `btnGuardarNotas`, `btnGuardarAsistencia`, `tituloMateriaCalificar`/`subtituloMateriaCalificar`, `tituloMateriaAsistencia`/`subtituloMateriaAsistencia`, `tituloMateriaHistorial`/`subtituloMateriaHistorial`.

### A.3 `estudiante.html` (portal del estudiante)

`vistaLoginEst`, `vistaBloqueoEst`, `vistaNotasEst`, `formLoginEstudiante`, `ciInput`, `passInput`, `btnEntrar`, `spinnerLogin`, `txtBtnEntrar`, `mensajeError`, `bloqueoNombreEst`, `zonaClaveEst`, `panelClaveEst`, `claveNueva1`, `claveNueva2`, `btnGuardarClave`, `notasNombreEst`, `notasDatosEst`, `tbodyNotasEst`, `promedioFinalEst`.

---

## Anexo B — Fuentes consultadas para los patrones de este brief

- Pencil & Paper — patrones de tablas de datos y dashboards empresariales
- Setproduct — guía de referencia de UI de tablas de datos (paginación como herramienta de rendimiento; Linear como referente de tabla densa y navegable por teclado)
- Aufait UX — principios de dashboards (esqueletos de carga frente a spinners)
- Interaction Design Foundation y UXPin — validación en línea y validación accesible de formularios
- Atlassian Design y Telerik/Kendo — sistemas de tokens de movimiento; elementos pequeños rápidos y sobrios, elementos grandes con más tiempo y expresión
- Nielsen Norman Group — duración y carácter de las animaciones de interfaz (preferencia por `ease-out` en entradas)
- Think Design — accesibilidad en dashboards: no depender solo del color, tablas con estructura y cabeceras correctas
