const SHEET_NAME = "";
const HEADERS = ["id", "payer", "category", "description", "amount", "date"];

function doGet(e) {
  const monthFilter = normalizeMonthParam(e && e.parameter ? e.parameter.month : "");
  const sheet = getSheet();
  const rows = getRows(sheet, monthFilter);

  return jsonResponse({
    features: {
      mutations: true
    },
    months: rows.months,
    transactions: rows.transactions
  });
}

function doPost(e) {
  const payload = JSON.parse(e.postData.contents || "{}");
  const sheet = getSheet();
  const rows = getRows(sheet);

  if (payload.action === "update") {
    updateTransaction(sheet, rows, payload);
    return jsonResponse({ ok: true });
  }

  if (payload.action === "delete") {
    deleteTransaction(sheet, rows, payload);
    return jsonResponse({ ok: true });
  }

  appendTransaction(sheet, payload.item || payload);
  return jsonResponse({ ok: true });
}

function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = SHEET_NAME
    ? spreadsheet.getSheetByName(SHEET_NAME)
    : findTransactionSheet(spreadsheet);

  if (!sheet) {
    throw new Error("Sheet not found");
  }

  ensureHeaders(sheet);
  return sheet;
}

function findTransactionSheet(spreadsheet) {
  const sheets = spreadsheet.getSheets();
  const transactionSheet = sheets.find(sheet => {
    const lastColumn = Math.max(sheet.getLastColumn(), 1);
    const firstRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(normalizeHeader);
    return firstRow.includes("payer") || firstRow.includes("category") || firstRow.includes("amount");
  });

  if (transactionSheet) return transactionSheet;

  return sheets[0] || null;
}

function ensureHeaders(sheet) {
  const lastColumn = Math.max(sheet.getLastColumn(), HEADERS.length);
  const currentHeaders = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  const isEmpty = currentHeaders.every(value => value === "");

  if (isEmpty) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }

  const normalizedHeaders = currentHeaders.map(normalizeHeader);
  HEADERS.forEach(header => {
    if (!normalizedHeaders.includes(header)) {
      sheet.getRange(1, sheet.getLastColumn() + 1).setValue(header);
    }
  });
}

function getRows(sheet, monthFilter) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(normalizeHeader);
  const transactions = [];
  const months = {};

  for (let index = 1; index < values.length; index++) {
    const row = values[index];
    if (row.every(value => value === "")) continue;

    const transaction = {};
    headers.forEach((header, columnIndex) => {
      transaction[header] = row[columnIndex];
    });

    if (!transaction.id) {
      transaction.id = Date.now() + index;
      setCellByHeader(sheet, headers, index + 1, "id", transaction.id);
    }

    transaction.amount = Number(transaction.amount) || 0;
    transaction.date = formatDate(transaction.date);
    const monthKey = getMonthKey(transaction.date);

    if (monthKey) {
      months[monthKey] = true;
    }

    if (!monthFilter || monthKey === monthFilter) {
      transactions.push({ ...transaction, rowNumber: index + 1 });
    }
  }

  return {
    headers,
    months: Object.keys(months).sort().reverse(),
    transactions
  };
}

function appendTransaction(sheet, item) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(normalizeHeader);
  const transaction = normalizeTransaction(item);
  const row = headers.map(header => transaction[header] || "");
  sheet.appendRow(row);
}

function updateTransaction(sheet, rows, payload) {
  const rowNumber = findRowNumber(rows.transactions, payload.key, payload.item);
  if (!rowNumber) throw new Error("Transaction not found");

  const transaction = normalizeTransaction(payload.item);
  rows.headers.forEach((header, index) => {
    if (HEADERS.includes(header)) {
      sheet.getRange(rowNumber, index + 1).setValue(transaction[header] || "");
    }
  });
}

function deleteTransaction(sheet, rows, payload) {
  const rowNumber = findRowNumber(rows.transactions, payload.key, payload.item);
  if (!rowNumber) throw new Error("Transaction not found");
  sheet.deleteRow(rowNumber);
}

function findRowNumber(transactions, key, item) {
  const keyString = String(key || "");
  const found = transactions.find(transaction => {
    return String(transaction.id) === keyString || makeFallbackKey(transaction) === keyString;
  });

  if (found) return found.rowNumber;

  if (!item) return null;
  const fallback = makeFallbackKey(item);
  const fallbackFound = transactions.find(transaction => makeFallbackKey(transaction) === fallback);
  return fallbackFound ? fallbackFound.rowNumber : null;
}

function normalizeTransaction(item) {
  return {
    id: item.id || Date.now(),
    payer: item.payer || "",
    category: item.category || "",
    description: item.description || "",
    amount: Number(item.amount) || 0,
    date: String(item.date || "").replace(/-/g, "/")
  };
}

function makeFallbackKey(item) {
  return [
    item.date,
    item.payer,
    item.category,
    item.description,
    Number(item.amount) || 0
  ].join("|");
}

function setCellByHeader(sheet, headers, rowNumber, header, value) {
  const columnIndex = headers.indexOf(header);
  if (columnIndex >= 0) {
    sheet.getRange(rowNumber, columnIndex + 1).setValue(value);
  }
}

function normalizeHeader(value) {
  return String(value).trim().toLowerCase();
}

function formatDate(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value)) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy/MM/dd");
  }

  return String(value || "").replace(/-/g, "/");
}

function getMonthKey(value) {
  const normalized = String(value || "").replace(/\//g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return "";

  const year = match[1];
  const month = ("0" + match[2]).slice(-2);
  return year + "-" + month;
}

function normalizeMonthParam(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : "";
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
