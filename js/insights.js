// Fiyat analizi: kayıtlı fiyat geçmişinden değişimler, dip fiyatlar ve gerçek indirim.
// DOM kullanmaz; tarayıcıda window.MFI, Node'da (testler) require ile çalışır.
// Kural: geçmiş yoksa değer üretilmez (null döner); eksik tarih doldurulmaz.
(function(root){
const DAY=86400;

// points: [[ts, fiyat, etiket, kaynak, kampanya], ...]; cur: {price, regular, seen}
function series(points,cur,now){
  const P=(points||[]).filter(p=>Array.isArray(p)&&p[1]>0).map(p=>({ts:+p[0],price:+p[1],regular:Math.max(+p[2]||0,+p[1])})).sort((a,b)=>a.ts-b.ts);
  if(cur&&cur.price>0){const last=P[P.length-1],ts=cur.seen||Math.floor((now||Date.now()/1000));
    if(!last||Math.abs(last.price-cur.price)>=0.005||Math.abs(last.regular-Math.max(cur.regular||0,cur.price))>=0.005){if(!last||ts>=last.ts)P.push({ts,price:cur.price,regular:Math.max(cur.regular||0,cur.price)})}}
  return P;
}
// t anındaki fiyat: t'den önceki son kayıt; t kaydın başlangıcından önceyse bilinmez (null)
function priceAt(P,t){let v=null;for(const p of P){if(p.ts<=t)v=p.price;else break}return v}

// Ürün için özet: 7/30 günlük değişim, son değişim, 30 günün en düşüğü, gerçek indirim
function stats(points,cur,now){
  now=now||Math.floor(Date.now()/1000);
  const P=series(points,cur,now);if(!P.length)return null;
  const price=P[P.length-1].price;
  const ch=d=>{const old=priceAt(P,now-d*DAY);return old==null||old<=0?null:{from:old,to:price,pct:(price-old)/old}};
  let last=null;for(let i=P.length-1;i>0;i--){if(Math.abs(P[i].price-P[i-1].price)>=0.005){last={ts:P[i].ts,from:P[i-1].price,to:P[i].price,pct:(P[i].price-P[i-1].price)/P[i-1].price};break}}
  const w30=P.filter(p=>p.ts>=now-30*DAY),hasBefore=P.some(p=>p.ts<now-30*DAY);
  // 30 günün en düşüğü: pencere içi kayıtlar + pencere başındaki geçerli fiyat
  const base=priceAt(P,now-30*DAY),vals=w30.map(p=>p.price).concat(base!=null?[base]:[]);
  const low30=vals.length?Math.min(...vals):null,high30=vals.length?Math.max(...vals):null;
  const atLow30=P.length>=2&&low30!=null&&high30>low30+0.005&&price<=low30+0.005;
  // dAll: kaydın başından bugüne (takip süresi kısayken 7/30 günlük değişim hesaplanamaz)
  const dAll=P.length>1&&P[0].price>0?{from:P[0].price,to:price,pct:(price-P[0].price)/P[0].price,ts:P[0].ts}:null;
  return{price,points:P.length,d7:ch(7),d30:ch(30),dAll,last,low30,high30,atLow30,coverage30:hasBefore};
}

// Gerçek indirim: marketin ilan ettiği indirim (etiket → fiyat) ile kayıtlı geçmişte gözlenen düşüş.
// Gözlenen: indirimden hemen önceki kayıtlı fiyat. Geçmiş yetersizse observed=null.
function realDiscount(points,cur,now){
  if(!cur||!(cur.regular>cur.price+0.005))return null;
  const claimed=(cur.regular-cur.price)/cur.regular;
  const P=series(points,cur,now);let prev=null;
  for(let i=P.length-1;i>0;i--){if(Math.abs(P[i].price-cur.price)<0.005&&Math.abs(P[i-1].price-cur.price)>=0.005){prev=P[i-1];break}}
  if(!prev)return{claimed,observed:null};
  return{claimed,observed:(prev.price-cur.price)/prev.price,prevPrice:prev.price,prevTs:prev.ts,since:P.find(p=>p.ts>prev.ts).ts};
}

// Temel sepet endeksi: her temel ürün için marketin en düşük birim fiyatı × standart miktar.
// Yalnızca tüm marketlerde bulunan temel ürünler toplanır (aynı sepet); eksikler ayrıca bildirilir.
function basketIndex(staples,markets){
  const common=staples.filter(s=>markets.every(m=>s.best[m]));
  const total={};markets.forEach(m=>total[m]=common.reduce((a,s)=>a+s.best[m].u.v*(s.qty||1),0));
  return{items:common.map(s=>s.name),missing:staples.filter(s=>!common.includes(s)).map(s=>s.name),total};
}

const api={series,priceAt,stats,realDiscount,basketIndex};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MFI=api;
})(typeof window!=="undefined"?window:globalThis);
