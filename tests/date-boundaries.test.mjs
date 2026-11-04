import test from "node:test";
import assert from "node:assert/strict";
import * as fuelQuotes from "../dist/fuel-quotes.js";

const { parseQuoteCsv, quoteForAirport } = fuelQuotes;
const header =
  "airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source";
const csv = (from, until) =>
  `${header}\nPVG,TEST supplier,950,${from},${until},into-plane,true,TEST date-boundary fixture\n`;

function mockLocalClock(t, instant, timeZone = "Asia/Shanghai") {
  const RealDate = Date;
  let now = RealDate.parse(instant);
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
  });
  const part = (date, type) =>
    Number(formatter.formatToParts(date).find((entry) => entry.type === type).value);
  class Clock extends RealDate {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
    getFullYear() { return part(this, "year"); }
    getMonth() { return part(this, "month") - 1; }
    getDate() { return part(this, "day"); }
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "Date");
  Object.defineProperty(globalThis, "Date", { ...descriptor, value: Clock });
  t.after(() => Object.defineProperty(globalThis, "Date", descriptor));
  return (instant) => { now = RealDate.parse(instant); };
}

for (const [timeZone, instant, expected] of [
  ["Asia/Shanghai", "2026-11-04T16:05:00Z", "2026-11-05"],
  ["America/Los_Angeles", "2026-11-05T02:05:00Z", "2026-11-04"],
]) {
  test(`local date uses ${timeZone} calendar when UTC disagrees`, (t) => {
    mockLocalClock(t, instant, timeZone);
    assert.notEqual(new Date().toISOString().slice(0, 10), expected);
    const parsed = parseQuoteCsv(csv(expected, expected));
    assert.deepEqual(parsed.errors, []);
    assert.equal(parsed.quotes[0].applicability, "current");
    assert.equal(quoteForAirport(parsed.quotes, "PVG")?.priceUsdPerT, 950);
    assert.equal(typeof fuelQuotes.localDate, "function");
    assert.equal(fuelQuotes.localDate(), expected);
  });
}

test("omitted comparison dates are evaluated afresh across local midnight", (t) => {
  const advance = mockLocalClock(t, "2026-11-04T15:59:59Z");
  const text = csv("2026-11-04", "2026-11-04");
  const before = parseQuoteCsv(text);
  assert.equal(before.quotes[0].applicability, "current");
  assert.ok(quoteForAirport(before.quotes, "PVG"));
  advance("2026-11-04T16:00:00Z");
  const after = parseQuoteCsv(text);
  assert.equal(after.quotes[0].applicability, "expired");
  assert.equal(quoteForAirport(before.quotes, "PVG"), null);
});

test("default quote lookup excludes a quote expired at local midnight", (t) => {
  const advance = mockLocalClock(t, "2026-11-04T15:59:59Z");
  const { quotes } = parseQuoteCsv(csv("2026-11-04", "2026-11-04"));
  assert.ok(quoteForAirport(quotes, "PVG"));
  advance("2026-11-04T16:00:00Z");
  assert.equal(quoteForAirport(quotes, "PVG"), null);
});

test("explicit future plan date is independent of current day and defaults", (t) => {
  const advance = mockLocalClock(t, "2026-11-04T15:59:59Z");
  const parsed = parseQuoteCsv(csv("2026-12-01", "2026-12-31"), { today: "2026-12-15" });
  assert.equal(parsed.quotes[0].applicability, "current");
  advance("2026-11-04T16:00:00Z");
  assert.equal(quoteForAirport(parsed.quotes, "PVG"), null);
  assert.equal(quoteForAirport(parsed.quotes, "PVG", "2026-12-15")?.priceUsdPerT, 950);
});

for (const [from, until, before, after] of [
  ["2026-11-04", "2026-11-05", "2026-11-03", "2026-11-06"],
  ["2026-12-31", "2027-01-01", "2026-12-30", "2027-01-02"],
  ["2028-02-29", "2028-03-01", "2028-02-28", "2028-03-02"],
]) {
  test(`quote validity includes both ends of ${from} through ${until}`, () => {
    const parsed = parseQuoteCsv(csv(from, until), { today: from });
    assert.deepEqual(parsed.errors, []);
    assert.ok(quoteForAirport(parsed.quotes, "PVG", from));
    assert.ok(quoteForAirport(parsed.quotes, "PVG", until));
    assert.equal(quoteForAirport(parsed.quotes, "PVG", before), null);
    assert.equal(quoteForAirport(parsed.quotes, "PVG", after), null);
  });
}

test("invalid leap dates and empty plan dates cannot make a quote applicable", () => {
  for (const date of ["2026-02-29", "2100-02-29", "2026-04-31", "", "2026-2-04"]) {
    assert.ok(parseQuoteCsv(csv("2026-01-01", "2101-01-01"), { today: date }).errors.length, date);
    assert.equal(quoteForAirport([], "PVG", date), null);
  }
  assert.ok(parseQuoteCsv(csv("2100-02-29", "2100-03-01"), { today: "2100-02-28" }).errors.length);
});

test("template defaults advance across midnight and explicit future dates remain exact", (t) => {
  const advance = mockLocalClock(t, "2026-12-31T15:59:59Z");
  assert.equal(typeof fuelQuotes.makeQuoteCsvTemplate, "function");
  const from = (text) => {
    const lines = text.trim().split(/\r?\n/);
    return lines[1].split(",")[lines[0].split(",").indexOf("valid_from")];
  };
  assert.equal(from(fuelQuotes.makeQuoteCsvTemplate()), "2026-12-31");
  advance("2026-12-31T16:00:00Z");
  assert.equal(from(fuelQuotes.makeQuoteCsvTemplate()), "2027-01-01");
  assert.equal(from(fuelQuotes.makeQuoteCsvTemplate("2027-02-10")), "2027-02-10");
  assert.equal(parseQuoteCsv(fuelQuotes.makeQuoteCsvTemplate("2027-02-10")).quotes.length, 0);
});
