// Fiyat alarmları: kullanıcının cihazında tutulan alarmların veriyle karşılaştırılması.
// DOM kullanmaz; tarayıcıda window.MFA, Node'da (testler) require ile çalışır.
//
// alarm = {type, target?, pct?, base?, last?}
//   below : en ucuz fiyat hedef fiyatın (target, TL) altına ya da eşitine indi
//   drop  : en ucuz fiyat alarm kurulduğundaki fiyattan (base) en az pct% düştü
//   low30 : en ucuz fiyat son 30 günün kayıtlı en düşük fiyatına indi (yeterli geçmiş varsa)
//   promo : ürün için yeni bir kampanya göründü
// ctx = {price, market, promos:[metin], low30, points30}
// Aynı durum için tekrar bildirim üretilmez: alarm.last, son bildirimin imzasını tutar.
(function(root){
const cents=x=>Math.round(Number(x)*100);

function signature(alarm,ctx){
  if(!ctx||!(ctx.price>0))return null;
  const p=cents(ctx.price);
  switch(alarm.type){
    case "below": return p<=cents(alarm.target)?`below:${p}`:null;
    case "drop": return alarm.base>0&&p<=Math.round(cents(alarm.base)*(1-(alarm.pct||0)/100))?`drop:${p}`:null;
    case "low30": return ctx.low30>0&&ctx.points30>=2&&p<=cents(ctx.low30)?`low30:${p}`:null;
    case "promo": {const ps=[...new Set((ctx.promos||[]).filter(Boolean))].sort();return ps.length?`promo:${ps.join("|")}`:null}
    default: return null;
  }
}

function evaluate(alarm,ctx){
  const sig=signature(alarm,ctx);
  if(!sig)return{fire:false,sig:null};
  return{fire:sig!==alarm.last,sig};
}

const tl=x=>Number(x).toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2})+" ₺";
function describe(alarm){
  switch(alarm.type){
    case "below": return `Fiyat ${tl(alarm.target)} veya altına inince`;
    case "drop": return `Fiyat %${alarm.pct} düşünce (${tl(alarm.base)}'den)`;
    case "low30": return "Son 30 günün en düşük fiyatına inince";
    case "promo": return "Yeni kampanya gelince";
    default: return "";
  }
}

// Fiyat geçmişi noktalarından ([ts, fiyat, ...]) son 30 günün en düşük fiyatı
function low30(points,now){
  const from=(now||Date.now()/1000)-30*86400;
  const ps=(points||[]).filter(p=>Array.isArray(p)&&p[0]>=from&&p[1]>0).map(p=>+p[1]);
  return{low:ps.length?Math.min(...ps):null,n:ps.length};
}

const api={evaluate,signature,describe,low30};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MFA=api;
})(typeof window!=="undefined"?window:globalThis);
