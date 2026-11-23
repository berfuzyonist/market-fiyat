// Akıllı sepet: listedeki ürünleri hangi marketten almanın en ucuz olduğunu hesaplar.
// DOM kullanmaz; tarayıcıda window.MFB, Node'da (testler) require ile çalışır.
//
// Girdi: items = [{key, qty, offers:[{market, cents, unitCents, stale, money, note}]}]
//   cents: o üründen qty adet almanın kuruş cinsinden tutarı (adet şartı sağlanan kampanya dahil;
//          sepet tutarı şartlı "kasa arkası" kampanyaları dahil değildir — şart doğrulanamaz)
//   fixed: kullanıcının bu ürün için seçtiği market (varsa yalnız o market kullanılır)
// Tüm tutarlar tam sayı kuruştur; kayan nokta hatası birikmez.
(function(root){

function cheapest(item,allowed){
  let b=null;
  for(const o of item.offers){
    if(item.fixed&&o.market!==item.fixed)continue;
    if(allowed&&!allowed.has(o.market))continue;
    if(!b||o.cents<b.cents||(o.cents===b.cents&&!o.stale&&b.stale))b=o;
  }
  return b;
}

// Verilen market kümesiyle sepet: her ürün kümedeki en ucuz markete; kümede olmayanlar "missing"
function plan(items,allowed){
  const pick={},missing=[];let total=0,stale=0,money=0;const used=new Set(),per={};
  for(const it of items){const o=cheapest(it,allowed);
    if(!o){missing.push(it.key);continue}
    pick[it.key]=o;total+=o.cents;used.add(o.market);per[o.market]=(per[o.market]||0)+o.cents;
    if(o.stale)stale++;if(o.money)money++;}
  return{markets:[...used],pick,missing,total,stale,money,per};
}

const subsets=(arr,k)=>{const out=[];const rec=(i,cur)=>{if(cur.length&&cur.length<=k)out.push(cur.slice());
  if(cur.length===k)return;for(let j=i;j<arr.length;j++){cur.push(arr[j]);rec(j+1,cur);cur.pop()}};rec(0,[]);return out};
// Kıyas: önce eksik ürün sayısı, sonra toplam, sonra market sayısı
const better=(a,b)=>!b||a.missing.length<b.missing.length||(a.missing.length===b.missing.length&&(a.total<b.total||(a.total===b.total&&a.markets.length<b.markets.length)));

function optimize(items,markets){
  const all=markets.filter(m=>items.some(it=>it.offers.some(o=>o.market===m)));
  const multi=plan(items,null);
  const single=all.map(m=>({market:m,...plan(items,new Set([m]))}))
    .sort((a,b)=>a.missing.length-b.missing.length||a.total-b.total);
  const limited={};
  for(let k=1;k<=Math.min(3,all.length);k++){let b=null;
    for(const S of subsets(all,k)){const p=plan(items,new Set(S));p.allowed=S;if(better(p,b))b=p}
    limited[k]=b;}
  // Tasarruf kıyası: tamamı tek marketten alınabiliyorsa en ucuz tek market; yoksa kıyas yapılmaz
  const fullSingle=single.find(s=>!s.missing.length)||null;
  const saving=fullSingle&&!multi.missing.length?fullSingle.total-multi.total:null;
  return{multi,single,limited,fullSingle,saving};
}

const toCents=x=>Math.round(Number(x)*100);
const api={optimize,plan,toCents};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MFB=api;
})(typeof window!=="undefined"?window:globalThis);
