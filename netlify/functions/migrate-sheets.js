import { neon } from "@neondatabase/serverless";

const SOURCE_URL = "https://script.google.com/macros/s/AKfycbxwgbYI51EUJDgjw8-f1oP6K7h_0zIHaPRPFmpV7GI6S88QrDO8rS25uasnSgoJOPPo/exec";
const MIGRATION_HEADER = "x-migration-token";

function json(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, X-Migration-Token",
      "Access-Control-Allow-Methods": "GET,POST,OPTIONS"
    }
  });
}

function getSql() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  return neon(connectionString);
}

function normalizeDate(value) {
  const text = String(value || "").trim();
  const match = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (!match) return "";

  const year = match[1];
  const month = String(match[2]).padStart(2, "0");
  const day = String(match[3]).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function normalizeItem(item = {}) {
  const amount = Number(item.amount) || 0;
  return {
    payer: String(item.payer || "").trim(),
    category: String(item.category || "").trim(),
    description: String(item.description || "").trim(),
    amount,
    date: normalizeDate(item.date)
  };
}

function makeKey(item) {
  return [
    item.date,
    item.payer,
    item.category,
    item.description,
    Number(item.amount) || 0
  ].join("|");
}

function getToken(req, url) {
  const headerToken = req.headers.get(MIGRATION_HEADER) || "";
  const queryToken = url.searchParams.get("token") || "";
  return String(headerToken || queryToken || "").trim();
}

async function fetchSourceTransactions() {
  const response = await fetch(`${SOURCE_URL}?t=${Date.now()}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Source API HTTP ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data) ? data : data.transactions || [];
}

async function getExistingKeys(sql) {
  const rows = await sql`
    SELECT
      payer,
      category,
      description,
      amount,
      to_char(date, 'YYYY-MM-DD') AS date
    FROM transactions
  `;

  return new Set(rows.map(row => makeKey(normalizeItem(row))));
}

async function insertTransactions(sql, items) {
  let inserted = 0;

  for (const item of items) {
    await sql`
      INSERT INTO transactions (id, payer, category, description, amount, date)
      VALUES (
        ${crypto.randomUUID()},
        ${item.payer},
        ${item.category},
        ${item.description},
        ${item.amount},
        ${item.date}::date
      )
    `;
    inserted += 1;
  }

  return inserted;
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return json(204, {});
  }

  try {
    const url = new URL(req.url);
    const token = getToken(req, url);
    const expectedToken = String(process.env.MIGRATION_TOKEN || "").trim();

    if (!expectedToken) {
      return json(500, { error: "MIGRATION_TOKEN is not set" });
    }

    if (token !== expectedToken) {
      return json(401, { error: "Unauthorized" });
    }

    const sql = getSql();
    const dryRun = url.searchParams.get("dryRun") !== "0" && url.searchParams.get("dryRun") !== "false";
    const sourceItems = await fetchSourceTransactions();
    const normalizedSource = sourceItems
      .map(normalizeItem)
      .filter(item => item.payer && item.category && item.description && item.amount > 0 && item.date);

    const existingKeys = await getExistingKeys(sql);
    const toInsert = normalizedSource.filter(item => !existingKeys.has(makeKey(item)));

    if (dryRun) {
      return json(200, {
        dryRun: true,
        sourceCount: normalizedSource.length,
        existingCount: existingKeys.size,
        insertCount: toInsert.length
      });
    }

    const inserted = await insertTransactions(sql, toInsert);
    return json(200, {
      dryRun: false,
      sourceCount: normalizedSource.length,
      existingCount: existingKeys.size,
      inserted
    });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || "Internal server error" });
  }
}
