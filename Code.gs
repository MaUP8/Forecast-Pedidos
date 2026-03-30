// ═══════════════════════════════════════════════════════════════
//  FORECAST COMPRAS — Backend Google Apps Script
//  PBGroup · v4.0 — Sesiones + Revisiones
// ═══════════════════════════════════════════════════════════════
//
//  HOJAS:
//    "Revisiones"   → cod | ciclo | estado | comentario | ts
//    "FC_Sesiones"  → id | nombre | tipo | estado | ciclo | mes | ts_creacion | ts_mod | resumen
//    "FC_Snapshots" → session_id | chunk_idx | data
//
//  DEPLOY: Publicar como Web App → "Cualquiera, incluso anónimos"
//  Copiar la URL y pegarla en REVISIONES_API del HTML
// ═══════════════════════════════════════════════════════════════

var SS = SpreadsheetApp.getActiveSpreadsheet();
var CHUNK_SIZE = 45000; // chars per cell (Sheets limit ~50K, dejamos margen)

// ── Helpers ──────────────────────────────────────────────────
function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function getOrCreateSheet(name, headers) {
  var sh = SS.getSheetByName(name);
  if (!sh) {
    sh = SS.insertSheet(name);
    if (headers) sh.getRange(1, 1, 1, headers.length).setValues([headers]);
  }
  return sh;
}

// ── Router ───────────────────────────────────────────────────
function doGet(e) {
  try {
    var action = (e.parameter || {}).action || '';
    if (action === 'getRevisiones')  return handleGetRevisiones(e);
    if (action === 'getSesiones')    return handleGetSesiones(e);
    if (action === 'getSesion')      return handleGetSesion(e);
    if (action === 'ping')           return jsonResponse({ ok: true, v: '4.0' });
    return jsonResponse({ ok: false, error: 'GET: unknown action "' + action + '"' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action || '';
    if (action === 'setRevisiones')  return handleSetRevisiones(payload);
    if (action === 'saveSesion')     return handleSaveSesion(payload);
    if (action === 'deleteSesion')   return handleDeleteSesion(payload);
    return jsonResponse({ ok: false, error: 'POST: unknown action "' + action + '"' });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}


// ═══════════════════════════════════════════════════════════════
//  REVISIONES (existente — compatible con v3.5)
// ═══════════════════════════════════════════════════════════════

function handleGetRevisiones(e) {
  var ciclo = (e.parameter || {}).ciclo || '';
  if (!ciclo) return jsonResponse({ ok: false, error: 'Falta ciclo' });

  var sh = getOrCreateSheet('Revisiones', ['cod', 'ciclo', 'estado', 'comentario', 'ts']);
  var data = sh.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === ciclo) {
      result.push({ cod: data[i][0], estado: data[i][2], comentario: data[i][3] || '' });
    }
  }
  return jsonResponse({ ok: true, data: result });
}

function handleSetRevisiones(payload) {
  var ciclo = payload.ciclo || '';
  var revs  = payload.revisiones || [];
  if (!ciclo || !revs.length) return jsonResponse({ ok: false, error: 'Datos incompletos' });

  var sh = getOrCreateSheet('Revisiones', ['cod', 'ciclo', 'estado', 'comentario', 'ts']);
  var data = sh.getDataRange().getValues();
  var ts = new Date().toISOString();
  var guardadas = 0;

  revs.forEach(function(r) {
    var found = false;
    for (var i = 1; i < data.length; i++) {
      if (data[i][0] === r.cod && data[i][1] === ciclo) {
        sh.getRange(i + 1, 3, 1, 3).setValues([[r.estado, r.comentario || '', ts]]);
        data[i][2] = r.estado; data[i][3] = r.comentario; data[i][4] = ts;
        found = true;
        break;
      }
    }
    if (!found) {
      sh.appendRow([r.cod, ciclo, r.estado, r.comentario || '', ts]);
      data.push([r.cod, ciclo, r.estado, r.comentario, ts]);
    }
    guardadas++;
  });

  return jsonResponse({ ok: true, guardadas: guardadas });
}


// ═══════════════════════════════════════════════════════════════
//  SESIONES — CRUD completo
// ═══════════════════════════════════════════════════════════════

// GET — lista todas las sesiones (solo metadata, sin snapshot)
function handleGetSesiones(e) {
  var sh = getOrCreateSheet('FC_Sesiones',
    ['id', 'nombre', 'tipo', 'estado', 'ciclo', 'mes', 'ts_creacion', 'ts_mod', 'resumen']);
  var data = sh.getDataRange().getValues();
  var result = [];
  for (var i = 1; i < data.length; i++) {
    result.push({
      id:           data[i][0],
      nombre:       data[i][1],
      tipo:         data[i][2],
      estado:       data[i][3],
      ciclo:        data[i][4] || '',
      mes:          data[i][5] || '',
      ts_creacion:  data[i][6],
      ts_mod:       data[i][7],
      resumen:      data[i][8] || ''
    });
  }
  return jsonResponse({ ok: true, data: result });
}

// GET — carga una sesión completa (metadata + snapshot reconstruido de chunks)
function handleGetSesion(e) {
  var id = (e.parameter || {}).id || '';
  if (!id) return jsonResponse({ ok: false, error: 'Falta id' });

  // Metadata
  var shMeta = getOrCreateSheet('FC_Sesiones',
    ['id', 'nombre', 'tipo', 'estado', 'ciclo', 'mes', 'ts_creacion', 'ts_mod', 'resumen']);
  var meta = null;
  var dataMeta = shMeta.getDataRange().getValues();
  for (var i = 1; i < dataMeta.length; i++) {
    if (dataMeta[i][0] === id) {
      meta = {
        id: dataMeta[i][0], nombre: dataMeta[i][1], tipo: dataMeta[i][2],
        estado: dataMeta[i][3], ciclo: dataMeta[i][4], mes: dataMeta[i][5],
        ts_creacion: dataMeta[i][6], ts_mod: dataMeta[i][7], resumen: dataMeta[i][8]
      };
      break;
    }
  }
  if (!meta) return jsonResponse({ ok: false, error: 'Sesión no encontrada: ' + id });

  // Snapshot — reconstruct from chunks
  var shSnap = getOrCreateSheet('FC_Snapshots', ['session_id', 'chunk_idx', 'data']);
  var dataSnap = shSnap.getDataRange().getValues();
  var chunks = [];
  for (var j = 1; j < dataSnap.length; j++) {
    if (dataSnap[j][0] === id) {
      chunks.push({ idx: dataSnap[j][1], data: dataSnap[j][2] });
    }
  }
  chunks.sort(function(a, b) { return a.idx - b.idx; });
  var jsonStr = chunks.map(function(c) { return c.data; }).join('');

  var snapshot = null;
  try { snapshot = JSON.parse(jsonStr); } catch (err) {
    return jsonResponse({ ok: false, error: 'Error parsing snapshot: ' + err.message });
  }

  meta.snapshot = snapshot;
  return jsonResponse({ ok: true, data: meta });
}

// POST — guarda sesión (upsert metadata + reescribe chunks)
function handleSaveSesion(payload) {
  var sesion = payload.sesion;
  if (!sesion || !sesion.id) return jsonResponse({ ok: false, error: 'Falta sesion.id' });

  var id = sesion.id;
  var ts = new Date().toISOString();

  // 1. Metadata — upsert
  var shMeta = getOrCreateSheet('FC_Sesiones',
    ['id', 'nombre', 'tipo', 'estado', 'ciclo', 'mes', 'ts_creacion', 'ts_mod', 'resumen']);
  var dataMeta = shMeta.getDataRange().getValues();
  var found = false;
  for (var i = 1; i < dataMeta.length; i++) {
    if (dataMeta[i][0] === id) {
      shMeta.getRange(i + 1, 2, 1, 8).setValues([[
        sesion.nombre, sesion.tipo, sesion.estado || 'activo',
        sesion.ciclo || '', sesion.mes || '',
        dataMeta[i][6], // keep original ts_creacion
        ts, sesion.resumen || ''
      ]]);
      found = true;
      break;
    }
  }
  if (!found) {
    shMeta.appendRow([id, sesion.nombre, sesion.tipo, sesion.estado || 'activo',
      sesion.ciclo || '', sesion.mes || '', ts, ts, sesion.resumen || '']);
  }

  // 2. Snapshot — delete old chunks, write new ones
  var shSnap = getOrCreateSheet('FC_Snapshots', ['session_id', 'chunk_idx', 'data']);
  var dataSnap = shSnap.getDataRange().getValues();
  // Delete old chunks (reverse to avoid index shift)
  var rowsToDelete = [];
  for (var j = 1; j < dataSnap.length; j++) {
    if (dataSnap[j][0] === id) rowsToDelete.push(j + 1);
  }
  for (var k = rowsToDelete.length - 1; k >= 0; k--) {
    shSnap.deleteRow(rowsToDelete[k]);
  }

  // Write new chunks
  var jsonStr = JSON.stringify(sesion.snapshot || {});
  var nChunks = Math.ceil(jsonStr.length / CHUNK_SIZE);
  for (var c = 0; c < nChunks; c++) {
    shSnap.appendRow([id, c, jsonStr.substring(c * CHUNK_SIZE, (c + 1) * CHUNK_SIZE)]);
  }

  return jsonResponse({ ok: true, id: id, chunks: nChunks, saved: ts });
}

// POST — elimina sesión (metadata + chunks)
function handleDeleteSesion(payload) {
  var id = payload.id;
  if (!id) return jsonResponse({ ok: false, error: 'Falta id' });

  // Delete metadata
  var shMeta = SS.getSheetByName('FC_Sesiones');
  if (shMeta) {
    var dm = shMeta.getDataRange().getValues();
    for (var i = dm.length - 1; i >= 1; i--) {
      if (dm[i][0] === id) shMeta.deleteRow(i + 1);
    }
  }

  // Delete chunks
  var shSnap = SS.getSheetByName('FC_Snapshots');
  if (shSnap) {
    var ds = shSnap.getDataRange().getValues();
    for (var j = ds.length - 1; j >= 1; j--) {
      if (ds[j][0] === id) shSnap.deleteRow(j + 1);
    }
  }

  return jsonResponse({ ok: true, deleted: id });
}
