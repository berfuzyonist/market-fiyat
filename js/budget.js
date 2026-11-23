// Aylık bütçe: kullanıcının girdiği gerçek harcamalar. Liste/sepet tutarı tahmindir, harcamaya sayılmaz.
// Tutarlar kuruş (tam sayı) olarak tutulur; yalnızca bu telefonda (localStorage) saklanır.
(function (root) {
  const toCents = v => { const n = typeof v === "number" ? v : parseFloat(String(v || "").replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0; };
  const monthKey = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); };
  // {limit (kuruş), spends:[{t, cents, market, note}]} → seçili ayın özeti
  function summary(b, now) {
    const k = monthKey(now), d = new Date(now), list = ((b && b.spends) || []).filter(s => monthKey(s.t) === k).sort((a, z) => z.t - a.t);
    const spent = list.reduce((a, s) => a + (s.cents | 0), 0), limit = (b && b.limit) | 0;
    const days = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate(), left = days - d.getDate() + 1;
    const byMarket = {}; list.forEach(s => { byMarket[s.market || "diger"] = (byMarket[s.market || "diger"] || 0) + s.cents; });
    return { month: k, list, spent, limit, remaining: limit ? limit - spent : null, ratio: limit ? spent / limit : null,
      perDay: limit && limit > spent ? Math.floor((limit - spent) / left) : 0, daysLeft: left, byMarket };
  }
  const api = { toCents, monthKey, summary };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else root.MFG = api;
})(this);
