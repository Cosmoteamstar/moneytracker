/**
 * Google Apps Script backend for the รายรับ-รายจ่าย tracker.
 *
 * SETUP:
 * 1. Go to https://sheets.google.com and create a new blank spreadsheet.
 *    Name it anything, e.g. "รายรับ-รายจ่าย".
 * 2. In the sheet menu: Extensions > Apps Script.
 * 3. Delete any starter code in the editor, then paste this entire file in.
 * 4. Click "Deploy" > "New deployment".
 *    - Select type: "Web app"
 *    - Description: anything
 *    - Execute as: "Me"
 *    - Who has access: "Anyone" (this lets your deployed tracker call it;
 *      it is still only readable/writable by whoever has the secret URL)
 * 5. Click Deploy, authorize the permissions Google asks for.
 * 6. Copy the "Web app URL" you get at the end — paste it into the tracker's
 *    "ตั้งค่า Google Sheets" box.
 * 7. Every time you edit this script again, you must create a NEW deployment
 *    version (Deploy > Manage deployments > Edit > New version) for changes
 *    to take effect on the same URL.
 */

const SHEET_NAME = 'Transactions';
const HEADERS = ['id', 'type', 'date', 'category', 'amount', 'note'];

function doGet(e) {
  try {
    const action = (e.parameter.action || 'list').toLowerCase();
    const sheet = getOrCreateSheet();

    if (action === 'list') {
      return jsonResponse({ ok: true, transactions: getAllRows(sheet) });
    }
    if (action === 'add') {
      const row = {
        id: e.parameter.id || Utilities.getUuid(),
        type: e.parameter.type || 'expense',
        date: e.parameter.date || todayString(),
        category: e.parameter.category || 'อื่นๆ',
        amount: Number(e.parameter.amount) || 0,
        note: e.parameter.note || ''
      };
      sheet.appendRow([row.id, row.type, row.date, row.category, row.amount, row.note]);
      return jsonResponse({ ok: true, id: row.id });
    }
    if (action === 'update') {
      const rowIndex = findRowIndexById(sheet, e.parameter.id);
      if (rowIndex === -1) return jsonResponse({ ok: false, error: 'not_found' });
      if (e.parameter.type) sheet.getRange(rowIndex, 2).setValue(e.parameter.type);
      if (e.parameter.date) sheet.getRange(rowIndex, 3).setValue(e.parameter.date);
      if (e.parameter.category) sheet.getRange(rowIndex, 4).setValue(e.parameter.category);
      if (e.parameter.amount) sheet.getRange(rowIndex, 5).setValue(Number(e.parameter.amount));
      if (e.parameter.note !== undefined) sheet.getRange(rowIndex, 6).setValue(e.parameter.note);
      return jsonResponse({ ok: true });
    }
    if (action === 'delete') {
      const rowIndex = findRowIndexById(sheet, e.parameter.id);
      if (rowIndex === -1) return jsonResponse({ ok: false, error: 'not_found' });
      sheet.deleteRow(rowIndex);
      return jsonResponse({ ok: true });
    }
    if (action === 'ping') {
      return jsonResponse({ ok: true, message: 'เชื่อมต่อสำเร็จ' });
    }

    return jsonResponse({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function getAllRows(sheet) {
  const data = sheet.getDataRange().getValues();
  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!r[0]) continue;
    rows.push({
      id: String(r[0]),
      type: r[1],
      date: formatDateValue(r[2]),
      category: r[3],
      amount: Number(r[4]) || 0,
      note: r[5] || ''
    });
  }
  return rows;
}

function formatDateValue(d) {
  if (Object.prototype.toString.call(d) === '[object Date]') {
    return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return d;
}

function findRowIndexById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1; // 1-indexed sheet row
  }
  return -1;
}

function todayString() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
