// Aynı ürünü marketler arasında eşleştirir. Tarayıcıda ve Node'da (test için) çalışır.
(function(root){
const FOLD={"ç":"c","ğ":"g","ı":"i","ö":"o","ş":"s","ü":"u","â":"a","î":"i","û":"u"};
const fold=s=>String(s||"").toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g,c=>FOLD[c]);
const UNIT={kg:["g",1000],gr:["g",1],g:["g",1],lt:["ml",1000],l:["ml",1000],ml:["ml",1],cl:["ml",10]};
const STOP=new Set(["ve","ile","icin","adet","paket","pk","the","de","da","cesit","cesitleri","yeni"]);
// Ürünü ayırt etmeyen, bir markette yazılıp diğerinde yazılmayan tür kelimeleri
const GENERIC=new Set(("kola gazoz icecek icecegi kek kraker biskuvi gofret cikolata cikolatali mama mamasi aromali cesnili cesnisi tatli "+
 "sivi jel deterjan deterjani sampuan sabun sabunu deodorant deo sprey krem kremi cay cayi kahve kahvesi "+
 "makarna noodle cips sakiz seker sekeri sut sutu yogurt yogurdu peynir peyniri kokulu kokusu kagidi kagit havlu havlusu mendil mendili "+
 "temizleyici temizleyicisi yumusatici yumusaticisi suyu su soguk gazli gazsiz icin original orijinal klasik sade dogal "+
 "poset bardak demlik dokme tablet kapsul sos sosu cerez drink bar ek besin gida urun urunu macunu fircasi bezi pedi bicagi").split(" "));
const U="(kg|gr|g|lt|l|ml|cl)";
const amount=(n,u)=>Math.round(parseFloat(n)*UNIT[u][1]);
const stem=t=>/\d/.test(t)||t.length<5?t:t.replace(/(lari|leri|si|su|i|u)$/,"");
// Ürün adını çözümler: marka (ilk kelime), boyut imzası, miktar ve kelimeler
function parse(name){
  const sizes=[],meas=[];let count=0;
  // "1.650 Ml" binlik ayraçtır (1650 ml); "1.5 L" ondalıktır
  let s=fold(name).replace(/(\d)\.(\d{3})\s*(ml|gr|g)\b/g,"$1$2 $3").replace(/(\d)[,](\d)/g,"$1.$2").replace(/[’'`]/g,"");
  s=s.replace(new RegExp("(\\d+)\\s*[x×*]\\s*(\\d+(?:\\.\\d+)?)\\s*"+U+"\\b","g"),(m,k,n,u)=>{const a=amount(n,u);sizes.push(k+"x"+a+UNIT[u][0]);meas.push([k*a,UNIT[u][0]]);return" "});
  s=s.replace(new RegExp("(\\d+(?:\\.\\d+)?)\\s*"+U+"\\b","g"),(m,n,u)=>{const a=amount(n,u);sizes.push(a+UNIT[u][0]);meas.push([a,UNIT[u][0]]);return" "});
  s=s.replace(/(\d+)\s*(li|lu|adet|ad|tablet|yikama|yaprak|rulo)\b/g,(m,n)=>{sizes.push(n+"ad");count=+n;return" "});
  const words=s.replace(/[^a-z0-9%.]+/g," ").trim().split(" ").filter(w=>w&&!STOP.has(w));
  if(!words.length)return null;
  const toks=[...new Set(words.map(stem))],brand=toks[0];
  const core=toks.filter((t,i)=>i===0||!(GENERIC.has(t)||GENERIC.has(words[i])));
  const coreSet=[...new Set(words.filter((w,i)=>i===0||!GENERIC.has(w)).map(stem))].sort();
  // Birim fiyat için miktar: tek bir gram/ml ölçüsü varsa o, yoksa adet
  const kinds=[...new Set(meas.map(m=>m[1]))];let qty=null;
  if(kinds.length===1){const v=[...new Set(meas.map(m=>m[0]))];
    // "17.5 g 10'lu" gibi adlarda toplam miktar belirsiz: birim fiyat hesaplama
    if(v.length===1&&!(count>1&&v[0]<50))qty={n:v[0],u:kinds[0]}}
  else if(!meas.length&&count>1)qty={n:count,u:"ad"};
  return{brand,size:[...new Set(sizes)].sort().join("+"),toks,key:toks.slice().sort().join(" "),core:coreSet.join(" "),qty};
}
/* rows: {id,market,name,...}. Dönen gruplar: {offers:[...],p}. Aynı marketten iki ürün aynı gruba girmez.
   1) boyut + tüm kelimeler aynı   2) boyut + ayırt edici kelimeler aynı (belirsizlik yoksa) */
function group(rows){
  const groups=[],exact=new Map();
  for(const o of rows){
    const p=parse(o.name);o._p=p;let g=null;
    if(p&&p.size){const k=p.size+"|"+p.key;g=exact.get(k);
      if(g&&g.offers.some(x=>x.market===o.market))g=null;
      if(!g){g={offers:[],p};groups.push(g);if(!exact.has(k))exact.set(k,g)}}
    else{g={offers:[],p};groups.push(g)}
    g.offers.push(o);
  }
  const loose=new Map();
  for(const g of groups){if(!g.p||!g.p.size||g.p.core.split(" ").length<2)continue;
    const k=g.p.size+"|"+g.p.core;(loose.get(k)||loose.set(k,[]).get(k)).push(g)}
  for(const list of loose.values()){
    if(list.length<2)continue;
    const seen={};let clash=false;
    list.forEach(g=>g.offers.forEach(o=>{if(seen[o.market])clash=true;seen[o.market]=1}));
    if(clash)continue; // aynı markette iki aday: hangisi olduğu belli değil, eşleştirme
    const a=list[0];for(const b of list.slice(1)){a.offers.push(...b.offers);b.dead=true}
  }
  return groups.filter(g=>!g.dead);
}
// Birim fiyat: ₺/kg, ₺/L ya da ₺/adet
function unitPrice(o){const q=o._p&&o._p.qty;if(!q||!q.n)return null;
  return q.u==="ad"?{v:o.price/q.n,u:"adet"}:{v:o.price/q.n*1000,u:q.u==="g"?"kg":"L",kind:q.u}}
/* Aynı ürünün farklı boyları: marka + ayırt edici kelimeler aynı, boyut farklı olabilir.
   Dönen: {key, offers:[...]} — en az iki marketten birim fiyatı hesaplanabilen teklif içerenler */
function families(rows){
  const fam=new Map();
  for(const o of rows){const p=o._p;if(!p||!p.qty||!o.in_stock||o.na||p.core.split(" ").length<2)continue;
    const k=p.qty.u+"|"+p.core;(fam.get(k)||fam.set(k,[]).get(k)).push(o)}
  const out=[];
  for(const [key,offers] of fam){if(new Set(offers.map(o=>o.market)).size>1)out.push({key,offers})}
  return out;
}
// Temel ihtiyaçlar: marka fark etmeksizin her markette birim fiyatı en düşük ürün
const STAPLES=[
 {n:"Süt (1 L)",re:/\bsut[u]?\b/,not:/cikolata|kakao|cilek|muz|laktoz|protein|bebek|devam|kahve|badem|yulaf|hindistan|sutlu|toz|keci|kondanse|aroma|bal|milkshake|tatli|recel|soya|pirinc|findik|puding|krema|misir|gofret|biskuvi|kek|\bbar\b/,u:"ml",min:1000,max:1000},
 {n:"Yumurta",re:/yumurta/,not:/cikolata|surpriz|oyuncak|makarna|boya|eriste|sekerleme|bildircin|kalip|sampuan|kasig|aparat|dilimleyici|haslama|sepet/,u:"ad",min:10,max:30},
 {n:"Ayçiçek yağı (4-5 L)",re:/aycicek/,not:/cekirde|sabun|krem/,u:"ml",min:4000,max:5000},
 {n:"Zeytinyağı (1 L)",re:/zeytinyag/,not:/sabun|sampuan|krem|losyon|ton|sardalya|dus/,u:"ml",min:1000,max:1000},
 {n:"Toz şeker",re:/toz seker/,not:/esmer|pudra|vanil|stevia|tatlandirici/,u:"g",min:1000,max:5000},
 {n:"Un",re:/(^| )un( |$)/,not:/misir|pirinc|galeta|kek|nohut|badem|hindistan|kurabiye|helva|siyez|glutensiz|karabugday|cavdar|yulaf/,u:"g",min:1000,max:5000},
 {n:"Siyah çay (1 kg)",re:/\bcay[i]?\b/,not:/bardak|poset|demlik|yesil|bitki|ice|soguk|earl|bergamot|adacayi|ihlamur|kupa|tabak|kasik|seker|makine|suzgec|tepsi|seti/,u:"g",min:1000,max:1000},
 {n:"Makarna (500 g)",re:/makarna|spagetti|burgu|penne|fiyonk/,not:/noodle|sos|glutensiz|tam bugday|bebek|yumurtali|lazanya|eriste|manti|protein|sebzeli|kepekli|suzgec|kasig|salata/,u:"g",min:500,max:500},
 {n:"Baldo pirinç (1 kg)",re:/baldo/,not:/patlak|cips/,u:"g",min:1000,max:1000},
 {n:"Kırmızı mercimek (1 kg)",re:/kirmizi mercimek/,not:/corba|makarna|cips/,u:"g",min:1000,max:1000},
 {n:"Tereyağı",re:/tereyag/,not:/tereyagli|aroma|margarin|biskuvi|kurabiye|kruvasan|patlamis|cips|kek|simit|bicag|kab/,u:"g",min:250,max:1000},
 {n:"Beyaz peynir (tam yağlı)",re:/tam yagli.*beyaz peynir|beyaz peynir.*tam yagli/,not:/keci|koyun|light|laktozsuz|suzme|krem/,u:"g",min:500,max:1000},
 {n:"Kaşar peyniri",re:/kasar/,not:/eski|dilim|rende|tost|fume|cips|kraker|sandvic|light|keci|pizza|borek|pide|sosis|kofte/,u:"g",min:400,max:1000},
 {n:"Yoğurt (tam yağlı)",re:/tam yagli.*yogurt|yogurt.*tam yagli/,not:/suzme|meyve|light|keci|manda|protein|bebek/,u:"g",min:1500,max:3000},
 {n:"Domates salçası",re:/domates salca/,not:/biber/,u:"g",min:650,max:850},
 {n:"Su (5 L)",re:/\bsu\b/,not:/maden|mineral|cicek|gul|sut|camasir|bidon|sebil|pompa|tabanca|aroma|vitamin|elektrolit|oyuncak|sise|matara/,u:"ml",min:5000,max:5000},
 {n:"Tuvalet kağıdı",re:/tuvalet kagid/,not:/islak|askisi|standi|firca/,u:"ad",min:8,max:48},
 {n:"Kağıt havlu",re:/kagit havlu|havlu kagit/,not:/aski|stand|dispenser/,u:"ad",min:6,max:16},
];
function staples(rows){
  return STAPLES.map(r=>{const best={};
    for(const o of rows){const p=o._p;if(!p||!p.qty||!o.in_stock||o.na||p.qty.u!==r.u||p.qty.n<r.min||p.qty.n>r.max)continue;
      const f=o._f||(o._f=fold(o.name));if(!r.re.test(f)||r.not.test(f))continue;
      const u=unitPrice(o);if(!best[o.market]||u.v<best[o.market].u.v)best[o.market]={o,u}}
    return{name:r.n,best}}).filter(x=>Object.keys(x.best).length>1);
}
/* Birim fiyat karşılaştırması: "su", "yüzey temizleyici" gibi bir ürün grubunda marka fark etmeksizin
   boy boy (0,5 L, 1 L, 1,5 L…) en ucuz teklifler ve genel en ucuz ₺/L (₺/kg, ₺/adet).
   Kelime eşleşmesi: 4 harften kısa kelime tam eşleşmeli ("su" → "sucuk" değil), uzun kelime başlangıçla
   ("temizleyici" → "temizleyicisi"). Farklı birim türleri karışmaz; en çok ürün olan tür seçilir. */
function sizeLabel(q,size){
  const one=(n,u)=>u==="ad"?n+" adet":u==="g"?(n>=1000?(n/1000).toLocaleString("tr-TR")+" kg":n+" g"):(n>=1000?(n/1000).toLocaleString("tr-TR")+" L":n+" ml");
  const m=/(\d+)x(\d+)(g|ml)/.exec(size||"");
  return m?`${m[1]} × ${one(+m[2],m[3])}`:one(q.n,q.u);
}
// Ürünün kendisi değil, onunla ilgili eşya olduğunu gösteren kelimeler (sorguda yoksa elenir)
const ACCESSORY=new Set("sise sisesi torba torbasi kova kovasi matara kap kabi sebil pompa pompasi isitici figurlu oyuncak aparat aparati dispenser aski askisi stand standi firca fircasi kapak kapagi tabanca tabancasi hazne hazneli".split(" "));
function unitCompare(rows,query){
  const words=fold(query).replace(/[^a-z0-9 ]+/g," ").split(" ").filter(Boolean);
  if(!words.length)return null;
  const hits=[];
  for(const o of rows){const p=o._p;if(!p||!p.qty)continue;
    const toks=(o._t||(o._t=fold(o.name).replace(/[^a-z0-9]+/g," ").split(" ")));
    if(!words.every(w=>toks.some(t=>w.length<4?t===w:t.startsWith(w))))continue;
    if(toks.some(t=>ACCESSORY.has(t)&&!words.includes(t)))continue;
    const u=unitPrice(o);if(u&&u.v>0&&isFinite(u.v))hits.push({o,u,q:p.qty,size:p.size})}
  if(hits.length<2)return null;
  const by={};hits.forEach(h=>{(by[h.q.u]=by[h.q.u]||[]).push(h)});
  const kind=Object.keys(by).sort((a,b)=>by[b].length-by[a].length)[0];
  // Aykırı değerler (su şişesi, figürlü sıcak su torbası, ıslak tuvalet kağıdı gibi başka ürünler):
  // birim fiyatı grubun ortancasının 4 katından fazla ya da 4'te birinden az olanlar dışarıda kalır.
  const vs=by[kind].map(h=>h.u.v).sort((a,b)=>a-b),med=vs[Math.floor(vs.length/2)];
  const list=by[kind].filter(h=>h.u.v<=med*4&&h.u.v>=med/4),dropped=by[kind].length-list.length;
  if(list.length<2)return null;
  const sizes=new Map();
  for(const h of list){const label=sizeLabel(h.q,h.size),k=label;
    if(!sizes.has(k))sizes.set(k,{label,n:h.q.n,items:[]});sizes.get(k).items.push(h)}
  const out=[...sizes.values()].map(s=>{s.items.sort((a,b)=>a.u.v-b.u.v);
    const per={};s.items.forEach(h=>{if(!per[h.o.market])per[h.o.market]=h});
    return{label:s.label,n:s.n,count:s.items.length,best:s.items[0],markets:Object.values(per)}}).sort((a,b)=>a.n-b.n||a.label.localeCompare(b.label));
  list.sort((a,b)=>a.u.v-b.u.v);
  return{unit:list[0].u.u,count:list.length,dropped,best:list[0],top:list.slice(0,5),sizes:out};
}
const api={fold,parse,group,families,unitPrice,staples,unitCompare};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MF=api;
})(typeof window!=="undefined"?window:globalThis);
