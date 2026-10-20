/**
 * Sincronización de la app de propinas con Google Sheets.
 *
 * Va pegado en Extensiones > Apps Script de la planilla, implementado como
 * "Aplicación web" (ejecutar como: yo; acceso: cualquier persona).
 *
 * Varios teléfonos pueden anotar y corregir días. Cada día lleva la hora de su
 * última modificación ("Actualizado") y gana la versión más reciente. Los días
 * borrados se anotan en la hoja oculta "Borrados" para que no reaparezcan desde
 * otro teléfono. El equipo completo (orden y nombres) también gana el más reciente.
 *
 * Hojas visibles: Días, Detalle y Equipo. Una corrección hecha a mano en la
 * planilla también llega a los teléfonos (para que gane sobre ellos, cambia
 * además su "Actualizado" a la fecha y hora actual).
 *
 * CLAVE debe coincidir con la del link de conexión. No subir la clave real al repo.
 */
const CLAVE = 'CAMBIAR';

function doPost(e) {
  let res;
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.key !== CLAVE) throw new Error('Clave incorrecta');
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (req.action === 'sync') res = sincronizar(req.state || {});
      else if (req.action === 'leer') res = { state: leerEstado() };
      else if (req.action === 'guardar') throw new Error('Recarga la app para actualizarla');
      else throw new Error('Acción desconocida');
    } finally {
      lock.releaseLock();
    }
    res.ok = true;
  } catch (err) {
    res = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Sincronización de propinas activa.');
}

/* ---------- Reglas de reparto (iguales a las de la app) ---------- */
function repartir(tip, cuartos) {
  const total = cuartos.reduce((a, b) => a + b, 0);
  if (!total || !tip) return cuartos.map(() => 0);
  return cuartos.map(q => Math.floor((2 * tip * q + total) / (2 * total)));
}
function calcular(dia) {
  const nombres = Object.keys(dia.hours).filter(n => (dia.hours[n].am || 0) > 0 || (dia.hours[n].pm || 0) > 0);
  const qAM = nombres.map(n => Math.round((dia.hours[n].am || 0) * 4));
  const qPM = nombres.map(n => Math.round((dia.hours[n].pm || 0) * 4));
  const pAM = repartir(dia.tipAM || 0, qAM), pPM = repartir(dia.tipPM || 0, qPM);
  return nombres.map((n, i) => ({ name: n, hAM: qAM[i] / 4, hPM: qPM[i] / 4, pAM: pAM[i], pPM: pPM[i], total: pAM[i] + pPM[i] }));
}

/* ---------- Unión de dos estados (misma regla que la app) ----------
   Para cada fecha gana lo más reciente entre el día guardado y su borrado.
   En empate gana "a" (aquí, la planilla). */
function unir(a, b) {
  const history = {}, deleted = {};
  const fechas = {};
  [a, b].forEach(s => { Object.keys(s.history || {}).concat(Object.keys(s.deleted || {})).forEach(d => { fechas[d] = true; }); });
  Object.keys(fechas).forEach(d => {
    let mejor = null;
    [a, b].forEach(s => {
      const dia = (s.history || {})[d], borr = (s.deleted || {})[d];
      if (dia && (!mejor || (dia.updated || 0) > mejor.t)) mejor = { t: dia.updated || 0, dia: dia };
      if (borr && (!mejor || borr > mejor.t)) mejor = { t: borr, dia: null };
    });
    if (mejor.dia) history[d] = mejor.dia; else deleted[d] = mejor.t;
  });
  const eq = (a.teamUpdated || 0) >= (b.teamUpdated || 0) ? a : b;
  return { history: history, deleted: deleted, team: eq.team || [], teamUpdated: eq.teamUpdated || 0 };
}

function sincronizar(estadoTelefono) {
  const actual = leerEstado();
  const unido = unir(actual, estadoTelefono);
  if (canonico(unido) !== canonico(actual)) escribirEstado(unido);
  return { state: unido };
}

// JSON con las claves ordenadas, para comparar estados sin importar el orden.
function canonico(v) {
  if (Array.isArray(v)) return '[' + v.map(canonico).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canonico(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

/* ---------- Hojas ---------- */
const HOJAS = {
  dias: { nombre: 'Días', enc: ['Fecha', 'Propina AM', 'Propina PM', 'Horas AM', 'Horas PM', 'Total repartido', 'Actualizado'],
          fmt: ['@', '"$"#,##0', '"$"#,##0', '0.##', '0.##', '"$"#,##0', 'dd/MM/yyyy HH:mm:ss'] },
  detalle: { nombre: 'Detalle', enc: ['Fecha', 'Nombre', 'Horas AM', 'Pago AM', 'Horas PM', 'Pago PM', 'Total'],
             fmt: ['@', '@', '0.##', '"$"#,##0', '0.##', '"$"#,##0', '"$"#,##0'] },
  equipo: { nombre: 'Equipo', enc: ['Orden', 'Nombre'], fmt: ['0', '@'] },
  borrados: { nombre: 'Borrados', enc: ['Fecha', 'Borrado'], fmt: ['@', 'dd/MM/yyyy HH:mm:ss'], oculta: true },
  sistema: { nombre: 'Sistema', enc: ['Dato', 'Valor'], fmt: ['@', 'dd/MM/yyyy HH:mm:ss'], oculta: true }
};

function hoja(def) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(def.nombre);
  if (!sh) {
    // La primera vez, reutiliza la hoja vacía que trae una planilla nueva.
    const todas = ss.getSheets();
    const nombres = Object.keys(HOJAS).map(k => HOJAS[k].nombre);
    if (!def.oculta && todas.length === 1 && todas[0].getLastRow() === 0 && nombres.indexOf(todas[0].getName()) < 0) {
      sh = todas[0].setName(def.nombre);
    } else {
      sh = ss.insertSheet(def.nombre);
    }
    if (def.oculta) sh.hideSheet();
  }
  return sh;
}

function escribir(def, filas) {
  const sh = hoja(def);
  sh.clearContents();
  const n = def.enc.length;
  const alto = Math.max(filas.length, 1);
  def.fmt.forEach((f, i) => sh.getRange(2, i + 1, alto, 1).setNumberFormat(f));
  sh.getRange(1, 1, 1, n).setValues([def.enc]).setFontWeight('bold');
  if (filas.length) sh.getRange(2, 1, filas.length, n).setValues(filas);
  sh.setFrozenRows(1);
}

const fechaHora = ms => ms ? new Date(ms) : '';

function escribirEstado(st) {
  const fechas = Object.keys(st.history).sort();
  const filasDias = [], filasDetalle = [];
  fechas.forEach(d => {
    const dia = st.history[d], filas = calcular(dia);
    const suma = k => filas.reduce((s, r) => s + r[k], 0);
    filasDias.push([d, dia.tipAM || 0, dia.tipPM || 0, suma('hAM'), suma('hPM'), suma('total'), fechaHora(dia.updated)]);
    filas.forEach(r => filasDetalle.push([d, r.name, r.hAM, r.pAM, r.hPM, r.pPM, r.total]));
  });
  escribir(HOJAS.dias, filasDias);
  escribir(HOJAS.detalle, filasDetalle);
  escribir(HOJAS.equipo, st.team.map((n, i) => [i + 1, n]));
  escribir(HOJAS.borrados, Object.keys(st.deleted).sort().map(d => [d, fechaHora(st.deleted[d])]));
  escribir(HOJAS.sistema, [['Equipo actualizado', fechaHora(st.teamUpdated)]]);
}

function leerFilas(def) {
  const sh = SpreadsheetApp.getActive().getSheetByName(def.nombre);
  if (!sh || sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, def.enc.length).getValues();
}

function fecha(v) {
  if (v instanceof Date) return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  return String(v).trim();
}
const ms = v => v instanceof Date ? v.getTime() : (Number(v) || 0);

function leerEstado() {
  const history = {}, deleted = {};
  leerFilas(HOJAS.dias).forEach(r => {
    const d = fecha(r[0]);
    if (d) history[d] = { date: d, tipAM: Number(r[1]) || 0, tipPM: Number(r[2]) || 0, hours: {}, updated: ms(r[6]) };
  });
  leerFilas(HOJAS.detalle).forEach(r => {
    const d = fecha(r[0]), n = String(r[1]).trim();
    if (history[d] && n) history[d].hours[n] = { am: Number(r[2]) || 0, pm: Number(r[4]) || 0 };
  });
  leerFilas(HOJAS.borrados).forEach(r => {
    const d = fecha(r[0]);
    if (d) deleted[d] = ms(r[1]);
  });
  const team = leerFilas(HOJAS.equipo).map(r => String(r[1]).trim()).filter(Boolean);
  const sis = leerFilas(HOJAS.sistema);
  const teamUpdated = sis.length ? ms(sis[0][1]) : 0;
  return { history: history, deleted: deleted, team: team, teamUpdated: teamUpdated };
}
