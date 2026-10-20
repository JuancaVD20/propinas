/**
 * Respaldo de la app de propinas en Google Sheets.
 *
 * Va pegado en Extensiones > Apps Script de la planilla, y se implementa como
 * "Aplicación web" (ejecutar como: yo; acceso: cualquier persona).
 * La app manda todo el historial cada vez que algo cambia, y esta planilla
 * queda con tres hojas: Días, Detalle y Equipo. Para recuperar, la app lee
 * esas mismas hojas, así que una corrección hecha a mano en la planilla
 * también se recupera.
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
      if (req.action === 'guardar') res = guardar(req);
      else if (req.action === 'leer') res = leer();
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
  return ContentService.createTextOutput('Respaldo de propinas activo.');
}

const HOJAS = {
  dias: { nombre: 'Días', enc: ['Fecha', 'Propina AM', 'Propina PM', 'Horas AM', 'Horas PM', 'Total repartido'],
          fmt: ['@', '"$"#,##0', '"$"#,##0', '0.##', '0.##', '"$"#,##0'] },
  detalle: { nombre: 'Detalle', enc: ['Fecha', 'Nombre', 'Horas AM', 'Pago AM', 'Horas PM', 'Pago PM', 'Total'],
             fmt: ['@', '@', '0.##', '"$"#,##0', '0.##', '"$"#,##0', '"$"#,##0'] },
  equipo: { nombre: 'Equipo', enc: ['Orden', 'Nombre'], fmt: ['0', '@'] }
};

function hoja(def) {
  const ss = SpreadsheetApp.getActive();
  let sh = ss.getSheetByName(def.nombre);
  if (!sh) {
    // La primera vez, reutiliza la hoja vacía que trae una planilla nueva.
    const unica = ss.getSheets();
    if (unica.length === 1 && unica[0].getLastRow() === 0 && !Object.values(HOJAS).some(h => h.nombre === unica[0].getName())) {
      sh = unica[0].setName(def.nombre);
    } else {
      sh = ss.insertSheet(def.nombre);
    }
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

function guardar(req) {
  const dias = (req.days || []).slice().sort((a, b) => a.date < b.date ? -1 : 1);
  const filasDias = [], filasDetalle = [];
  dias.forEach(d => {
    const hAM = d.rows.reduce((s, r) => s + r.hAM, 0);
    const hPM = d.rows.reduce((s, r) => s + r.hPM, 0);
    const total = d.rows.reduce((s, r) => s + r.total, 0);
    filasDias.push([d.date, d.tipAM, d.tipPM, hAM, hPM, total]);
    d.rows.forEach(r => filasDetalle.push([d.date, r.name, r.hAM, r.pAM, r.hPM, r.pPM, r.total]));
  });
  escribir(HOJAS.dias, filasDias);
  escribir(HOJAS.detalle, filasDetalle);
  escribir(HOJAS.equipo, (req.team || []).map((n, i) => [i + 1, n]));
  return { dias: filasDias.length };
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

function leer() {
  const history = {};
  leerFilas(HOJAS.dias).forEach(r => {
    const d = fecha(r[0]);
    if (d) history[d] = { date: d, tipAM: Number(r[1]) || 0, tipPM: Number(r[2]) || 0, hours: {} };
  });
  leerFilas(HOJAS.detalle).forEach(r => {
    const d = fecha(r[0]), n = String(r[1]).trim();
    if (history[d] && n) history[d].hours[n] = { am: Number(r[2]) || 0, pm: Number(r[4]) || 0 };
  });
  const team = leerFilas(HOJAS.equipo).map(r => String(r[1]).trim()).filter(Boolean);
  return { history, team };
}
