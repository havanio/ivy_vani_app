import { neon } from "@neondatabase/serverless";

const ALLOWED_ORIGIN = "*";

function json(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS"
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

function normalizeMonthParam(value) {
  const normalized = String(value || "").trim();
  return /^\d{4}-\d{2}$/.test(normalized) ? normalized : "";
}

function parseBody(text) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function normalizeItem(item = {}) {
  const description = String(item.description || "").trim();
  const amount = Number(item.amount) || 0;
  const payer = String(item.payer || "").trim();
  const category = String(item.category || "").trim();
  const date = String(item.date || "").trim().replace(/\//g, "-");

  return {
    id: String(item.id || "").trim(),
    payer,
    category,
    description,
    amount,
    date
  };
}

function validateItem(item) {
  if (!item.payer) return "payer is required";
  if (!item.category) return "category is required";
  if (!item.description) return "description is required";
  if (!Number.isFinite(item.amount) || item.amount <= 0) return "amount must be greater than 0";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(item.date)) return "date must be YYYY-MM-DD";
  return "";
}

function monthBounds(monthKey) {
  const [yearText, monthText] = monthKey.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const next = new Date(Date.UTC(year, month, 1));

  return {
    start: start.toISOString().slice(0, 10),
    end: next.toISOString().slice(0, 10)
  };
}

async function listTransactions(sql, monthFilter) {
  const transactions = monthFilter
    ? await sql`
      SELECT
        id,
        payer,
        category,
        description,
        amount,
        to_char(date, 'YYYY-MM-DD') AS date
      FROM transactions
      WHERE date >= ${monthBounds(monthFilter).start}::date
        AND date < ${monthBounds(monthFilter).end}::date
      ORDER BY date DESC, created_at DESC
    `
    : await sql`
      SELECT
        id,
        payer,
        category,
        description,
        amount,
        to_char(date, 'YYYY-MM-DD') AS date
      FROM transactions
      ORDER BY date DESC, created_at DESC
    `;

  const monthsRows = await sql`
    SELECT DISTINCT to_char(date, 'YYYY-MM') AS month
    FROM transactions
    ORDER BY month DESC
  `;

  return {
    features: {
      mutations: true
    },
    months: monthsRows.map(row => row.month).filter(Boolean),
    transactions
  };
}

async function createTransaction(sql, body) {
  const item = normalizeItem(body.item || body);
  const validationError = validateItem(item);
  if (validationError) {
    return json(400, { error: validationError });
  }

  const id = crypto.randomUUID();
  const rows = await sql`
    INSERT INTO transactions (id, payer, category, description, amount, date)
    VALUES (${id}, ${item.payer}, ${item.category}, ${item.description}, ${item.amount}, ${item.date}::date)
    RETURNING
      id,
      payer,
      category,
      description,
      amount,
      to_char(date, 'YYYY-MM-DD') AS date
  `;

  return json(200, { ok: true, transaction: rows[0] });
}

async function updateTransaction(sql, body) {
  const item = normalizeItem(body.item || body);
  const validationError = validateItem(item);
  if (validationError) {
    return json(400, { error: validationError });
  }

  const id = String(body.key || item.id || "").trim();
  if (!id) {
    return json(400, { error: "key is required" });
  }

  const rows = await sql`
    UPDATE transactions
    SET
      payer = ${item.payer},
      category = ${item.category},
      description = ${item.description},
      amount = ${item.amount},
      date = ${item.date}::date,
      updated_at = now()
    WHERE id = ${id}
    RETURNING
      id,
      payer,
      category,
      description,
      amount,
      to_char(date, 'YYYY-MM-DD') AS date
  `;

  if (!rows.length) {
    return json(404, { error: "Transaction not found" });
  }

  return json(200, { ok: true, transaction: rows[0] });
}

async function deleteTransaction(sql, body) {
  const id = String(body.key || body.id || body.item?.id || "").trim();
  if (!id) {
    return json(400, { error: "key is required" });
  }

  const rows = await sql`
    DELETE FROM transactions
    WHERE id = ${id}
    RETURNING id
  `;

  if (!rows.length) {
    return json(404, { error: "Transaction not found" });
  }

  return json(200, { ok: true });
}

export default async function handler(req) {
  if (req.method === "OPTIONS") {
    return json(204, {});
  }

  try {
    const sql = getSql();
    const url = new URL(req.url);
    const body = req.method === "GET" || req.method === "HEAD" ? {} : parseBody(await req.text());
    const action = String(body.action || "").trim().toLowerCase();

    if (req.method === "GET") {
      const monthFilter = normalizeMonthParam(url.searchParams.get("month"));
      const payload = await listTransactions(sql, monthFilter);
      return json(200, payload);
    }

    if (req.method === "POST" && !action) {
      return createTransaction(sql, body);
    }

    if (req.method === "PATCH" || action === "update") {
      return updateTransaction(sql, body);
    }

    if (req.method === "DELETE" || action === "delete") {
      return deleteTransaction(sql, body);
    }

    if (req.method === "POST" && action === "update") {
      return updateTransaction(sql, body);
    }

    if (req.method === "POST" && action === "delete") {
      return deleteTransaction(sql, body);
    }

    return json(405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    return json(500, { error: error.message || "Internal server error" });
  }
}
