# Propinas del café: app para repartir la propina diaria

Proyecto iniciado el 2026-10-19. Este archivo resume el contexto, las decisiones tomadas y lo que falta definir, para retomar el trabajo en una carpeta de proyecto sin perder nada de lo conversado.

## 1. Contexto

La mamá de quien desarrolla esto trabaja en un café y se encarga de repartir las propinas entre el equipo.

**Proceso actual (todos los días):**
1. Le informan cuánto se generó de propina en el día.
2. En un Excel anota qué personas trabajaron y cuántas horas hicieron en turno AM y en turno PM.
3. El Excel calcula cuánto le corresponde a cada persona.
4. Ella le envía una **foto del Excel** a su jefa.
5. La jefa hace el depósito a cada persona.

**Objetivo:** reemplazar el Excel por una herramienta simple que pregunte los datos paso a paso y entregue al final un consolidado diario con el monto a pagar a cada persona, listo para enviar a la jefa.

## 2. Datos confirmados

- Hay **dos pozos de propina separados**: uno para el turno AM y otro para el turno PM.
- **Turno AM:** hasta las 15:30.
- **Turno PM:** hasta las 22:00.
- El resultado se envía hoy como foto, por lo que el consolidado debe verse bien en una captura de pantalla.
- Se calcula y se paga **por día**.

## 3. Reglas confirmadas (2026-10-19)

- Cada pozo se reparte **proporcional a las horas** que trabajó cada persona en ese turno. Las horas se anotan todos los días.
  `pago de una persona en un turno = propina del turno ÷ horas totales del turno × horas de la persona`
- Todas las horas valen lo mismo, sin importar el cargo.
- Le informan **la propina AM y la propina PM por separado**.
- **Redondeo al peso:** si el monto termina en ,5 o más se sube; si es menor, se baja. Cada monto por turno se redondea por separado y el total de la persona es la suma de ambos. Por eso lo repartido puede diferir en unos pocos pesos de la propina; el consolidado muestra esa diferencia cuando ocurre. **Decidido (2026-10-19): se mantiene así**, la diferencia de $1 no importa; no cambiar a un reparto que fuerce la suma exacta.
- Una persona puede trabajar AM y PM el mismo día.
- Las horas se ingresan con botones de 0,5 h o escribiéndolas (se aceptan cuartos de hora).
- El equipo cambia: se pueden agregar y quitar personas en cualquier momento.
- Reportes: diario obligatorio; además hay resumen semanal (lunes a domingo) y mensual.
- Dispositivo: celular **Android**. Se comparte como un link.

## 4. Detalles pendientes por definir

- [ ] Que la mamá pruebe con un día real y compare con su Excel.
- [ ] Foto o captura del Excel actual (con nombres tapados) para parecerse a lo que conoce la jefa.
- [ ] Privacidad: los nombres del equipo se guardan solo en el teléfono de ella (estado actual).

## 5. Decisión técnica

**Una página web en un solo archivo HTML** (sin frameworks ni servidor), pensada primero para celular.

Razones:
- Se abre desde un link y se puede dejar como ícono en el inicio del teléfono (PWA), sin pasar por tiendas de apps.
- Es mucho más fácil de mantener y modificar que una app nativa.
- No necesita backend: los datos se guardan en el propio teléfono con `localStorage`.

## 6. Estado actual

Existe un prototipo funcional en `index.html` (rehecho el 2026-10-19).

**Flujo de pantallas (4 pasos):**
1. **Fecha:** parte con el día de hoy.
2. **Propinas:** monto del turno AM y monto del turno PM.
3. **Personas y horas:** una tarjeta por persona con horas AM y horas PM (botones − / + de 0,5 h). Se pueden agregar y quitar personas de la lista guardada.
4. **Consolidado:** se guarda solo. Muestra montos de cada pozo, valor por hora, pago por turno y total por persona. Botones "Enviar por WhatsApp", "Copiar texto", "Corregir" y "Empezar un día nuevo".

Pestañas: **Día**, **Historial** (ver, corregir o borrar días), **Resumen** (semana o mes, con flechas para moverse) y **Equipo** (agregar y quitar personas).

**Otras funciones ya incluidas:**
- Historial de días anteriores, que se pueden abrir para corregir o borrar.
- Borrador automático: si se cierra el navegador a medio camino, no se pierde lo ingresado.
- Advertencia si hay propina en un turno en el que nadie tiene horas.

**Verificación:** el redondeo se comparó contra un cálculo exacto con enteros en más de 20.000 montos aleatorios, sin errores. Se revisó en un navegador con tamaño de celular; falta probarlo en el Android real.

Para probarlo en el computador: `python -m http.server 8765` en la carpeta y abrir `http://localhost:8765`.

## 7. Datos y almacenamiento

Todo se guarda en `localStorage` del navegador:

| Clave | Contenido |
|---|---|
| `prop_people` | Lista de nombres del equipo |
| `prop_history` | Días ya consolidados, por fecha (`AAAA-MM-DD`) |
| `prop_draft` | Borrador del día en curso y paso actual |

Forma de un día: `{date, tipAM, tipPM, hours: {Nombre: {am, pm}}}`. El borrador agrega `orig` (la fecha original cuando se corrige un día).

Además se guardan `prop_cloud` (URL y clave), `prop_sync` (contador de cambios sincronizados), `prop_deleted` (fecha → hora de borrado) y `prop_team_updated`. Cada día guardado lleva `updated` (hora de su última modificación, al segundo).

### Sincronización con Google Sheets (desde 2026-10-19)

- Varios teléfonos (por ejemplo mamá y papá) pueden anotar y corregir días. Se conectan abriendo una vez el **link de conexión** (`#conectar=<url>|<clave>`).
- Cada sincronización manda todo el estado y recibe la unión. Regla: **por fecha gana lo más reciente** entre el día (`updated`) y su borrado (`prop_deleted`); el equipo completo (orden y nombres) gana el más reciente (`prop_team_updated`). La misma regla está en `mergeState` (app) y `unir` (`respaldo/Codigo.gs`).
- Se sincroniza al guardar o borrar, al abrir la app y al volver a ella. Sin internet queda pendiente y se reintenta solo.
- Hojas: **Días** (con columna *Actualizado*), **Detalle** y **Equipo**, más dos ocultas: **Borrados** y **Sistema**. El script recalcula los montos con la misma regla de reparto que la app. Para que una corrección hecha a mano en la planilla gane sobre los teléfonos, hay que cambiar también su *Actualizado* a la hora actual.
- Límite conocido: si dos personas agregan a alguien al equipo casi al mismo tiempo, queda la lista del último que guardó.
- La clave y el link real están solo en `respaldo/Codigo-con-clave.gs` y `respaldo/link-conexion.txt`, que **no se suben al repo**. Si cambia el script, hay que pegarlo de nuevo en Apps Script y usar **Implementar → Administrar implementaciones → editar → Nueva versión**, para que la URL no cambie.
- En la hoja oculta Borrados queda una marca de la fecha 2000-01-01, que viene de una prueba.

## 8. Próximos pasos

1. ~~Publicar~~ Hecho el 2026-10-19: **https://juancavd20.github.io/propinas/** (GitHub Pages, rama `main`). Cada `git push` actualiza el link en 1–2 minutos.
2. Que la mamá pruebe el link con los datos de un día real y compare con su Excel.
3. Convertirlo en PWA instalable: agregar `manifest.json`, íconos y `service worker` para uso sin conexión.
5. Ajustar el consolidado cuando haya una foto del Excel.

## 9. Notas para quien continúe el trabajo (humano o Claude)

- Idioma de la interfaz: **español de Chile**. Montos en pesos chilenos con separador de miles `.` (ejemplo: `$12.500`).
- La interfaz debe ser muy simple: una pregunta por pantalla, botones grandes, pensada para una persona sin experiencia técnica.
- Mantener el cálculo en funciones puras (`splitPool`, `compute`) para poder probarlas fuera del navegador.
- No introducir dependencias externas salvo que sea necesario. Única excepción: las fuentes Marcellus y Open Sans de Google Fonts (si no hay internet se usan las del sistema).
- Estilo de La Florería Café (https://www.lafloreriacafe.cl/): encabezado rosado #efa6b9, botones fucsia, logo e ícono en `img/` tomados de su sitio.
- Cualquier cambio en la regla de reparto debe actualizarse también en la sección 3 de este archivo.
