import test from "node:test";
import assert from "node:assert/strict";
import {
  parseQuoteCsv,
  quoteForAirport,
  QUOTE_CSV_TEMPLATE,
} from "../dist/fuel-quotes.js";

const header =
  "airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source";
const line = (overrides = {}) => {
  const row = {
    airport: "PVG",
    supplier: "Example supplier",
    price_usd_per_t: "950.25",
    valid_from: "2026-11-01",
    valid_until: "2026-11-30",
    delivery_basis: "into-plane",
    fees_included: "true",
    source: "Quotation November",
    ...overrides,
  };
  return Object.values(row)
    .map((value) =>
      /[",\r\n]/.test(String(value))
        ? `"${String(value).replaceAll('"', '""')}"`
        : value,
    )
    .join(",");
};
const csv = (...lines) => `${header}\n${lines.join("\n")}\n`;

test("BOM, CRLF, quoted commas and escaped double quotes retain quotation provenance", () => {
  const parsed = parseQuoteCsv(
    `\uFEFF${header}\r\n${line({ supplier: 'Supply, "Asia"', source: "Quote\napproved" })}\r\n`,
  );
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.quotes.length, 1);
  const quote = parsed.quotes[0];
  assert.equal(quote.supplier, 'Supply, "Asia"');
  assert.equal(quote.source, "Quote\napproved");
  assert.equal(quote.priceUsdPerT, 950.25);
  assert.equal(quote.status, "user-supplied");
  assert.equal(quote.currency, "USD");
  assert.equal(quote.unit, "t");
  assert.equal(quoteForAirport(parsed.quotes, "PVG", "2026-11-04"), quote);
});

test("malformed quoted CSV does not yield partial quotations", () => {
  for (const malformed of [
    csv(line(), 'PVG,"unterminated'),
    csv(
      'PVG,"supplier"trailing,950,2026-11-01,2026-11-30,into-plane,true,Quote',
    ),
    csv('PVG,bad"quote,950,2026-11-01,2026-11-30,into-plane,true,Quote'),
  ]) {
    const parsed = parseQuoteCsv(malformed);
    assert.equal(parsed.quotes.length, 0);
    assert.ok(parsed.errors.length);
  }
});

test("requires canonical explicit USD per tonne header and all applicable fees", () => {
  const unsupported = parseQuoteCsv(
    csv(line()).replace("price_usd_per_t", "price_jpy_per_l"),
  );
  assert.equal(unsupported.quotes.length, 0);
  assert.ok(unsupported.errors[0].includes("USD/t"));
  for (const values of [
    { fees_included: "" },
    { fees_included: "false" },
    { delivery_basis: "ex-hydrant" },
    { price_usd_per_t: "0" },
    { price_usd_per_t: "Infinity" },
    { price_usd_per_t: "-1" },
    { price_usd_per_t: "1e999" },
  ]) {
    const parsed = parseQuoteCsv(csv(line(values)));
    assert.equal(parsed.quotes.length, 0, JSON.stringify(values));
    assert.ok(parsed.errors.length);
  }
});

test("calendar dates include leap days and enforce ordered intervals", () => {
  for (const values of [
    { valid_from: "2026-02-29" },
    { valid_until: "2026-11-31" },
    { valid_from: "2026-12-01" },
    { valid_from: "2026-1-01" },
  ]) {
    assert.ok(
      parseQuoteCsv(csv(line(values))).errors.length,
      JSON.stringify(values),
    );
  }
  const leap = parseQuoteCsv(
    csv(line({ valid_from: "2028-02-29", valid_until: "2028-03-01" })),
  );
  assert.equal(leap.errors.length, 0);
  assert.equal(leap.quotes[0].applicability, "upcoming");
});

test("all overlapping supplier rows are rejected, including a shared boundary date", () => {
  const parsed = parseQuoteCsv(
    csv(
      line({ valid_until: "2026-11-10" }),
      line({
        supplier: "Second supplier",
        valid_from: "2026-11-10",
        valid_until: "2026-11-20",
      }),
      line({ airport: "ICN" }),
    ),
  );
  assert.equal(parsed.errors.length, 1);
  assert.deepEqual(
    parsed.quotes.map((q) => q.airport),
    ["ICN"],
  );
  assert.equal(quoteForAirport(parsed.quotes, "PVG", "2026-11-04"), null);
});

test("nonoverlapping historical and future rows are retained but not applied outside validity", () => {
  const parsed = parseQuoteCsv(
    csv(
      line({ valid_from: "2026-10-01", valid_until: "2026-10-31" }),
      line({ valid_from: "2026-11-01", valid_until: "2026-11-30" }),
      line({ valid_from: "2026-12-01", valid_until: "2026-12-31" }),
    ),
  );
  assert.deepEqual(parsed.errors, []);
  assert.deepEqual(
    parsed.quotes.map((q) => q.applicability),
    ["expired", "current", "upcoming"],
  );
  assert.equal(
    quoteForAirport(parsed.quotes, "PVG", "2026-10-31").validUntil,
    "2026-10-31",
  );
  assert.equal(quoteForAirport(parsed.quotes, "PVG", "2027-01-01"), null);
  assert.equal(quoteForAirport(parsed.quotes, "PVG", "2026-02-30"), null);
});

test("untrusted records cannot cause quote selection to choose an ambiguous or unsuitable value", () => {
  const quote = parseQuoteCsv(csv(line())).quotes[0];
  assert.equal(quoteForAirport([quote, { ...quote }], "PVG"), null);
  assert.equal(
    quoteForAirport([{ ...quote, feesIncluded: false }], "PVG"),
    null,
  );
  assert.equal(quoteForAirport([{ ...quote, currency: "JPY" }], "PVG"), null);
  assert.equal(
    quoteForAirport([{ ...quote, status: "verified" }], "PVG"),
    null,
  );
});

test("source URLs remain HTTP(S), credentials and spreadsheet formulas are rejected", () => {
  const good = parseQuoteCsv(
    csv(line({ source: "https://supplier.example/quote?id=3" })),
  ).quotes[0];
  assert.equal(good.sourceUrl, "https://supplier.example/quote?id=3");
  for (const source of [
    "javascript:alert(1)",
    "file:///quote.csv",
    "https://user:password@example.com/quote",
    '=HYPERLINK("https://x")',
    '@IMPORTXML("x")',
    "",
  ]) {
    assert.ok(parseQuoteCsv(csv(line({ source }))).errors.length, source);
  }
});

test("file, row and field bounds fail visibly; empty template invents no price", () => {
  assert.ok(parseQuoteCsv("a".repeat(256 * 1024 + 1)).errors.length);
  assert.ok(parseQuoteCsv(csv(...Array(501).fill(line()))).errors.length);
  assert.ok(
    parseQuoteCsv(csv(line({ supplier: "a".repeat(241) }))).errors.length,
  );
  assert.equal(parseQuoteCsv(QUOTE_CSV_TEMPLATE).quotes.length, 0);
  assert.ok(parseQuoteCsv("").errors.length);
});
