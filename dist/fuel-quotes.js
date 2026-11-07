/**
 * User-supplied, normalized into-plane quotation CSVs.
 * Prices are accepted only in USD/metric tonne, with all applicable fees included.
 * Parsing a file does not independently verify its commercial terms or provenance.
 */
const AIRPORTS = new Set(
  "PEK PKX PVG SHA CAN SZX HKG TPE ICN GMP PUS HND NRT KIX NGO FUK CTS".split(
    " ",
  ),
);
const HEADERS = [
  "airport",
  "supplier",
  "price_usd_per_t",
  "valid_from",
  "valid_until",
  "delivery_basis",
  "fees_included",
  "source",
];
const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 500;

/** Browser-local calendar date; evaluated when called, including after midnight. */
export function localDate(now = new Date()) {
  return [now.getFullYear(), now.getMonth() + 1, now.getDate()]
    .map((value, index) => String(value).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

// Deliberately contains no invented airport prices. Replace the empty fields with
// a supplier's normalized quotation. Exporters must quote CSV fields and prefix
// formula-like text with an apostrophe before opening exported data in a spreadsheet.
export function makeQuoteCsvTemplate(date = localDate()) {
  const from = validDate(date) ? date : "";
  return `${HEADERS.join(",")}\nPVG,,,${from},,into-plane,true,\n`;
}
export const QUOTE_CSV_TEMPLATE = makeQuoteCsvTemplate("");

function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || year > 9999 || month < 1 || month > 12 || day < 1)
    return false;
  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= maxDay;
}

function plainField(value, maxLength = 240) {
  return (
    value.length > 0 &&
    value.length <= maxLength &&
    !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value) &&
    !/^[=+@-]/.test(value)
  );
}

function sourceUrl(value) {
  // A document label such as "CNAF: November quotation" is plain text. Only
  // explicit links are interpreted as URLs; script / local-resource schemes
  // remain prohibited even when they omit //. Plain labels never become hrefs.
  const scheme = value.match(/^([A-Za-z][A-Za-z0-9+.-]*):/);
  if (!scheme) return { valid: true, url: null };
  const protocol = scheme[1].toLowerCase();
  if (!["http", "https"].includes(protocol)) {
    const forbidden =
      /^(?:javascript|vbscript|data|file|blob|mailto|ftp|chrome|about)$/i.test(
        protocol,
      ) || /^[A-Za-z][A-Za-z0-9+.-]*:\/\//.test(value);
    return { valid: !forbidden, url: null };
  }
  try {
    const url = new URL(value);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      !url.hostname ||
      url.username ||
      url.password
    ) {
      return { valid: false, url: null };
    }
    return { valid: true, url: url.href };
  } catch {
    return { valid: false, url: null };
  }
}

function csvRows(text) {
  const rows = [];
  let cells = [],
    value = "",
    quoted = false,
    closedQuote = false,
    line = 1,
    rowLine = 1;
  const finishCell = () => {
    cells.push(value);
    value = "";
    closedQuote = false;
  };
  const finishRow = () => {
    finishCell();
    if (cells.some((cell) => cell.trim() !== ""))
      rows.push({ cells, line: rowLine });
    cells = [];
    if (rows.length > MAX_ROWS + 1)
      throw new Error(`报价文件最多允许 ${MAX_ROWS} 条记录。`);
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closedQuote = true;
        }
      } else {
        value += c;
        if (c === "\n") line++;
      }
      continue;
    }
    if (c === ",") {
      finishCell();
      continue;
    }
    if (c === "\n" || c === "\r") {
      finishRow();
      if (c === "\r" && text[i + 1] === "\n") i++;
      line++;
      rowLine = line;
      continue;
    }
    if (closedQuote) {
      // Permit whitespace after a closing quote, but no hidden trailing text.
      if (c === " " || c === "\t") continue;
      throw new Error(`第 ${line} 行：引号结束后出现非分隔内容。`);
    }
    if (c === '"') {
      if (value.length !== 0)
        throw new Error(`第 ${line} 行：字段内的双引号必须转义。`);
      quoted = true;
    } else value += c;
  }
  if (quoted) throw new Error(`第 ${rowLine} 行：CSV 引号没有闭合。`);
  if (cells.length || value.length || closedQuote) finishRow();
  return rows;
}

/**
 * Parse a bounded CSV file. Invalid rows are excluded and described in errors.
 * All overlapping rows for an airport are excluded to avoid choosing a supplier
 * or contract silently. Historical / future nonoverlapping records are retained.
 */
export function parseQuoteCsv(text, { today = localDate() } = {}) {
  const errors = [];
  if (!validDate(today))
    return { quotes: [], errors: ["比较日期须为有效的 YYYY-MM-DD 日期。"] };
  if (typeof text !== "string")
    return { quotes: [], errors: ["请提供 UTF-8 CSV 文本。"] };
  if (new TextEncoder().encode(text).byteLength > MAX_BYTES)
    return { quotes: [], errors: ["报价文件不可超过 256 KiB。"] };
  let rows;
  try {
    rows = csvRows(text.replace(/^\uFEFF/, ""));
  } catch (error) {
    return { quotes: [], errors: [error.message] };
  }
  if (!rows.length) return { quotes: [], errors: ["报价文件为空。"] };
  const header = rows.shift().cells.map((cell) => cell.trim());
  if (
    header.length !== HEADERS.length ||
    new Set(header).size !== HEADERS.length ||
    HEADERS.some((name) => !header.includes(name))
  ) {
    return {
      quotes: [],
      errors: [
        `CSV 表头须且仅含：${HEADERS.join(",")}。仅接受已统一的 USD/t 报价。`,
      ],
    };
  }
  if (!rows.length) return { quotes: [], errors: ["报价文件未包含记录。"] };
  const candidates = [];
  for (const { cells, line } of rows) {
    const problem = (message) => errors.push(`第 ${line} 行：${message}`);
    if (cells.length !== header.length) {
      problem("字段数量与表头不符。");
      continue;
    }
    const row = Object.fromEntries(
      header.map((key, index) => [key, cells[index].trim()]),
    );
    if (!AIRPORTS.has(row.airport)) {
      problem("机场须为支持的东亚机场大写 IATA 三字码。");
      continue;
    }
    if (!plainField(row.supplier)) {
      problem("供应商不可为空、过长或以公式字符开头。");
      continue;
    }
    if (
      !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(row.price_usd_per_t) ||
      !Number.isFinite(Number(row.price_usd_per_t)) ||
      Number(row.price_usd_per_t) <= 0
    ) {
      problem("price_usd_per_t 须为大于零的有限 USD/t 数字。");
      continue;
    }
    if (
      !validDate(row.valid_from) ||
      !validDate(row.valid_until) ||
      row.valid_from > row.valid_until
    ) {
      problem("有效期须为真实的 YYYY-MM-DD 日期，且开始日期不晚于结束日期。");
      continue;
    }
    if (row.delivery_basis !== "into-plane") {
      problem("仅接受交付到机的 into-plane 报价。");
      continue;
    }
    if (row.fees_included !== "true") {
      problem(
        "请确认价格包含适用税费及加注费用，并将 fees_included 设为 true。",
      );
      continue;
    }
    const source = sourceUrl(row.source);
    if (!plainField(row.source, 1000) || !source.valid) {
      problem("来源须为非空文档名称或无登录凭据的 HTTP(S) 链接，不可为公式。");
      continue;
    }
    const price = Number(row.price_usd_per_t);
    candidates.push({
      ...row,
      price_usd_per_t: price,
      fees_included: true,
      priceUsdPerT: price,
      validFrom: row.valid_from,
      validUntil: row.valid_until,
      deliveryBasis: "into-plane",
      feesIncluded: true,
      sourceUrl: source.url,
      status: "user-supplied",
      currency: "USD",
      unit: "t",
      applicability:
        today < row.valid_from
          ? "upcoming"
          : today > row.valid_until
            ? "expired"
            : "current",
      rowNumber: line,
    });
  }
  const ambiguous = new Set();
  let overlapCount = 0;
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const a = candidates[i],
        b = candidates[j];
      if (
        a.airport === b.airport &&
        a.validFrom <= b.validUntil &&
        b.validFrom <= a.validUntil
      ) {
        ambiguous.add(i);
        ambiguous.add(j);
        overlapCount++;
        if (overlapCount <= 50)
          errors.push(
            `${a.airport} 第 ${a.rowNumber}、${b.rowNumber} 行有效期重叠，请先选定适用合同；这两行未导入。`,
          );
      }
    }
  }
  if (overlapCount > 50)
    errors.push(
      `另有 ${overlapCount - 50} 组有效期重叠；所有冲突记录均未导入。`,
    );
  return {
    quotes: candidates.filter((_, index) => !ambiguous.has(index)),
    errors,
  };
}

/** Return a unique applicable user-supplied quote; ambiguity or missing data is null. */
export function quoteForAirport(quotes, iata, date = localDate()) {
  if (!Array.isArray(quotes) || !AIRPORTS.has(iata) || !validDate(date))
    return null;
  const applicable = quotes.filter(
    (quote) =>
      quote &&
      quote.airport === iata &&
      quote.status === "user-supplied" &&
      quote.currency === "USD" &&
      quote.unit === "t" &&
      quote.deliveryBasis === "into-plane" &&
      quote.feesIncluded === true &&
      Number.isFinite(quote.priceUsdPerT) &&
      quote.priceUsdPerT > 0 &&
      validDate(quote.validFrom) &&
      validDate(quote.validUntil) &&
      quote.validFrom <= date &&
      date <= quote.validUntil,
  );
  return applicable.length === 1 ? applicable[0] : null;
}
