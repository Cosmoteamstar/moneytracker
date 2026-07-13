/**
 * Google Apps Script backend for Money Tracker.
 *
 * SETUP:
 * 1. Create a blank Google Sheet.
 * 2. Open Extensions > Apps Script.
 * 3. Delete the starter code, then paste this file.
 * 4. Deploy > New deployment > Web app.
 *    - Execute as: Me
 *    - Who has access: Anyone
 * 5. Copy the Web app URL ending with /exec.
 * 6. Open index.html, click Google Sheets, paste the URL, then connect.
 *
 * If you edit this script later, create a new deployment version.
 */

const SHEET_NAME = 'Transactions';
const HEADERS = ['id', 'type', 'date', 'category', 'amount', 'note'];
const BUDGET_SHEET_NAME = 'BudgetProfile';

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
      return jsonResponse({ ok: true, message: 'connected' });
    }

    if (action === 'budget_get') {
      return jsonResponse({ ok: true, budget: getBudgetProfile() });
    }

    if (action === 'budget_set') {
      saveBudgetProfile(e.parameter.payload || '{}');
      return jsonResponse({ ok: true });
    }

    return jsonResponse({ ok: false, error: 'unknown_action' });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}

function getBudgetProfile() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(BUDGET_SHEET_NAME);
  if (!sheet) return null;
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'state') {
      try {
        return JSON.parse(data[i][1] || '{}');
      } catch (err) {
        return null;
      }
    }
  }
  return null;
}

function saveBudgetProfile(payload) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(BUDGET_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(BUDGET_SHEET_NAME);
    sheet.appendRow(['key', 'value', 'updatedAt']);
    sheet.setFrozenRows(1);
  }
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === 'state') {
      sheet.getRange(i + 1, 2).setValue(payload);
      sheet.getRange(i + 1, 3).setValue(new Date());
      return;
    }
  }
  sheet.appendRow(['state', payload, new Date()]);
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

function formatDateValue(value) {
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return value;
}

function findRowIndexById(sheet, id) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) return i + 1;
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
