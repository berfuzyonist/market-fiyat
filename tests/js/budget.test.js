const test = require("node:test"), assert = require("node:assert");
const G = require("../../js/budget.js");
test("toCents virgül ve binlik ayırıcı", () => {
  assert.strictEqual(G.toCents("1.250,50"), 125050); assert.strictEqual(G.toCents("87,9"), 8790);
  assert.strictEqual(G.toCents("12.5"), 1250); assert.strictEqual(G.toCents("-3"), 0); assert.strictEqual(G.toCents("abc"), 0);
});
test("yalnız bu ayın harcamaları sayılır; kalan ve günlük pay", () => {
  const now = new Date(2026, 10, 21, 12).getTime();
  const b = { limit: 1000000, spends: [
    { t: new Date(2026, 10, 2).getTime(), cents: 250000, market: "sok" },
    { t: new Date(2026, 10, 20).getTime(), cents: 150000, market: "migros" },
    { t: new Date(2026, 9, 30).getTime(), cents: 999900, market: "bim" } ] };
  const s = G.summary(b, now);
  assert.strictEqual(s.spent, 400000); assert.strictEqual(s.remaining, 600000); assert.strictEqual(s.list.length, 2);
  assert.strictEqual(s.daysLeft, 10); assert.strictEqual(s.perDay, 60000); assert.strictEqual(s.byMarket.sok, 250000);
});
test("bütçe yokken kalan hesaplanmaz; aşımda günlük pay 0", () => {
  const now = Date.now();
  assert.strictEqual(G.summary({ spends: [{ t: now, cents: 500 }] }, now).remaining, null);
  const s = G.summary({ limit: 100, spends: [{ t: now, cents: 500 }] }, now);
  assert.strictEqual(s.remaining, -400); assert.strictEqual(s.perDay, 0);
});
