"use strict";
/* Market Fiyat arayüzü. Eşleştirme mantığı js/match.js içinde (MF). */
const M={sok:{n:"Şok",at:"Şok'ta",c:"bg-yellow-400 text-yellow-950",bar:"#eab308"},migros:{n:"Migros",at:"Migros'ta",c:"bg-orange-500 text-white",bar:"#f97316"},a101:{n:"A101",at:"A101'de",c:"bg-cyan-600 text-white",bar:"#0891b2"},bim:{n:"BİM",at:"BİM'de",c:"bg-red-600 text-white",bar:"#dc2626"}},ORD=Object.keys(M);
const VIEWS=["home","compare","promos","browse","search","list","posters","camp"];
const $=id=>document.getElementById(id);
const tl=x=>x.toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2})+" ₺";
const num=x=>x.toLocaleString("tr-TR");
const pct=x=>"%"+Math.round(x*100);
const norm=s=>(s||"").toLocaleLowerCase("tr");
const fold=MF.fold;
const DATA_M=["sok","migros","bim"]; // A101 için yasal veri kaynağı yok; dosyası istenmez
const esc=s=>String(s??"").replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function load(k,d){try{const v=JSON.parse(localStorage.getItem("mf_"+k));return v??d}catch(e){return d}}
function save(k,v){try{localStorage.setItem("mf_"+k,JSON.stringify(v))}catch(e){}}

function categoryOf(o){
  const raw=String(o.cat||"").trim(), c=fold(raw);
  if(raw && !/^(aktuel|indirim)\b/.test(c))return raw;
  const n=fold(o.name);
  const rules=[
    ["Meyve & Sebze",/\b(elma|armut|muz|portakal|mandalina|limon|uzum|cilek|kiraz|visne|seftali|kayisi|erik|karpuz|kavun|domates|salatalik|biber|patlican|kabak|patates|sogan|sarimsak|havu[cç]|marul|maydanoz|roka|ispanak|brokoli|karnabahar|lahana|mantar|avokado)\b/],
    ["Et, Tavuk & Şarküteri",/\b(dana|kuzu|tavuk|hindi|sucuk|salam|sosis|pastirma|kiyma|kofte|biftek|antrikot|pirzola|balik|somon|karides|midye)\b/],
    ["Süt & Süt Ürünleri",/\b(sut|yogurt|ayran|kefir|peynir|kasar|tereyag|kaymak|krema|labne|mozzarella|lor)\b/],
    ["Kahvaltılık",/\b(zeytin|bal|recel|pekmez|tahin|helva|yumurta|fistik ezmesi)\b/],
    ["İçecek",/\b(maden suyu|soda|kola|cola|gazoz|fanta|sprite|ice tea|meyve suyu|limonata|enerji icecegi|kahve|nescafe|espresso|filtre kahve|cay|turk kahvesi|bitki cayi)\b/],
    ["Ekmek & Pastane",/\b(ekmek|lavas|yufka|bazlama|simit|pogaca|acma|kruvasan|pasta|pastane|unlu mamul)\b/],
    ["Dondurulmuş Ürünler",/\b(dondurulmus|dondurma|pizza|patates kroket|su boregi)\b/],
    ["Atıştırmalık & Şekerleme",/\b(cikolata|biskuvi|gofret|cips|kraker|jelibon|sekerleme|lokum|sakiz|kuruyemis|findik|fistik|ceviz|badem|cerez|kek|bar)\b/],
    ["Bakliyat & Temel Gıda",/\b(pirinc|bulgur|makarna|mercimek|nohut|fasulye|bakliyat|un|irmik|nisasta|salca|ketcap|mayonez|sos|baharat|tuz|seker|zeytinyagi|aycicek yagi|sivi yag|konserve|sirke)\b/],
    ["Temizlik",/\b(deterjan|camasir suyu|bulasik|yumusatici|yuzey temizleyici|camasir|wc temizleyici|kirec sokucu)\b/],
    ["Kağıt Ürünleri",/\b(tuvalet kagidi|kagit havlu|havlu kagit|pecete|mendil|rulo havlu)\b/],
    ["Kişisel Bakım & Kozmetik",/\b(sampuan|dus jeli|dis macunu|dis fircasi|deodorant|parfum|kolonya|krem|losyon|makyaj|ruj|maskara|kozmetik|sac boyasi|tras)\b/],
    ["Anne & Bebek",/\b(bebek|emzik|biberon|bebek bezi|mama sandalyesi|puset)\b/],
    ["Evcil Hayvan",/\b(kedi kumu|kedi mamasi|kopek mamasi|kopek tasmasi|kus yemi|akvaryum|evcil hayvan)\b/],
    ["Elektronik",/\b(telefon|televizyon|tv|notebook|laptop|bilgisayar|tablet|kulaklik|sarj|powerbank|hoparlor|mouse|klavye|yazici|monitor|kamera|akilli saat|elektrikli supurge|blender|kahve makinesi)\b/],
    ["Giyim & Aksesuar",/\b(corap|tisort|t shirt|pantolon|gomlek|kazak|hirk|mont|ceket|elbise|ayakkabi|terlik|canta|kemer|pijama|bornoz)\b/],
    ["Oyuncak & Hobi",/\b(oyuncak|lego|puzzle|kirtasiye|boya kalemi|oyun hamuru|masa oyunu|hobi|kitap)\b/],
    ["Bahçe & Yapı Market",/\b(matkap|tornavida|mengene|testere|civata|vida|boya|hortum|bahce|sulama|alet seti|tamir|yapi market)\b/],
    ["Ev & Mutfak",/\b(tencere|tava|tabak|bardak|kupa|termos|saklama kabi|kesme tahtasi|bicak|catal|kasik|masa ortusu|nevresim|yastik|yorgan|aski|duzenleyici|mobilya|lamba|ampul|dekorasyon)\b/]
  ];
  return rules.find(([,pattern])=>pattern.test(n))?.[0]||"Diğer";
}

// O: tek tek market ürünleri, G: aynı ürünün marketlerdeki teklifleri, CMP: karşılaştırma listeleri
let O=[],OI={},G=[],GI={},CMP={same:[],size:[],staple:[]},PROMO=[];
const FRESH=new Set(); // "Fiyat güncel mi?" paneli açık ürünler (kaydedilmez)
let done=load("done",{}),HIST={},S={sort:"rel"},UOPEN=false;
let QTY=load("qty",{});
let NOTES=load("notes",[]); // listedeki serbest notlar: [{t:"ekmek",d:0}]
let cart=load("cart",[]),bmap=load("bmap",{}),reqs=load("req",{}),pending=null,only=null,updated="",UPD={},CHECK={},CHECKS={},view="home";
const C={seg:"same",three:false,sort:"pct",page:0},K={kind:"free",m:"",sort:"gain",page:0},B={m:"",grp:"",cat:"",disc:false,sort:"disc",page:0};
// Ana kategori yuvarlakları: marketlerin farklı kategori adlarını tek grupta toplar
const GROUPS=[
  ["meyve","Meyve & Sebze","apple","#dcfce7","#15803d",/meyve|sebze/],
  ["et","Et & Tavuk","drumstick","#fee2e2","#b91c1c",/(^|\s)et\b|tavuk|sarkuteri|balik/],
  ["sut","Süt & Kahvaltı","milk","#e0f2fe","#0369a1",/sut|kahvalti/],
  ["temel","Temel Gıda","wheat","#fef3c7","#b45309",/temel gida|bakliyat|yemeklik/],
  ["icecek","İçecek","cup-soda","#ede9fe","#6d28d9",/icecek/],
  ["atistirmalik","Atıştırmalık","cookie","#ffedd5","#c2410c",/atistirmalik|sekerleme/],
  ["donuk","Dondurulmuş","snowflake","#cffafe","#0e7490",/dondur/],
  ["firin","Fırın & Pastane","croissant","#fef9c3","#a16207",/ekmek|firin|pastane/],
  ["temizlik","Temizlik & Kağıt","spray-can","#d1fae5","#047857",/temizlik|deterjan|kagit/],
  ["bakim","Kişisel Bakım","sparkles","#fce7f3","#be185d",/bakim|kozmetik/],
  ["bebek","Anne & Bebek","baby","#e0e7ff","#4338ca",/bebek/],
  ["evcil","Evcil Hayvan","paw-print","#f5f5f4","#57534e",/evcil/],
  ["ev","Ev & Yaşam","sofa","#f1f5f9","#334155",/^ev\b|yasam|mutfak|elektronik|giyim|oyuncak|bahce|kitap|cicek|otomotiv|hobi/],
];
const grpOf=o=>o._g!==undefined?o._g:(o._g=(GROUPS.find(g=>g[5].test(fold(o.cat)))||[""])[0]);
const UNIT_Q=[["su","Su","droplet"],["süt","Süt","milk"],["ayçiçek yağı","Ayçiçek yağı","flask-conical"],["yüzey temizleyici","Yüzey temizleyici","spray-can"],["çamaşır deterjanı","Çamaşır deterjanı","shirt"],["tuvalet kağıdı","Tuvalet kağıdı","scroll"],["pirinç","Pirinç","wheat"],["makarna","Makarna","utensils"],["yumurta","Yumurta","egg"],["un","Un","package"]];
const PER=20,PERC=12;

// ---------- Küçük parçalar ----------
const badge=(m,sm)=>`<span class="${M[m]?M[m].c:"bg-stone-400 text-white"} ${sm?"text-[11px] px-2 py-0.5":"text-xs px-2.5 py-1"} font-bold rounded-lg whitespace-nowrap">${M[m]?M[m].n:esc(m)}</span>`;
const chip=(t,c)=>`<span class="text-[11px] font-semibold px-2 py-0.5 rounded-md ${c}">${t}</span>`;
const card="bg-white dark:bg-stone-900 rounded-[20px] border border-stone-200 dark:border-stone-800";
const div="divide-y divide-stone-100 dark:divide-stone-800";
const good="text-emerald-700 dark:text-emerald-400";
const empty=(ic,a,b)=>`<div class="${card} p-8 text-center col-span-full"><i data-lucide="${ic}" class="w-10 h-10 mx-auto text-stone-300"></i><p class="mt-2 font-semibold">${a}</p><p class="text-sm text-stone-500">${b}</p></div>`;
const img=(src,cls)=>src&&src.startsWith("https://")?`<img src="${esc(src)}" alt="" loading="lazy" class="${cls} object-contain bg-white rounded-xl" onerror="this.style.visibility='hidden'">`:`<div class="${cls} rounded-xl bg-stone-200 dark:bg-stone-800"></div>`;
const pill=(attr,val,label,on,onCls)=>`<button ${attr}="${val}" class="shrink-0 px-3 py-2 rounded-xl text-sm font-bold ${on?(onCls||"bg-stone-900 text-white dark:bg-white dark:text-stone-900"):"bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"}">${label}</button>`;
function pager(id,page,pages){
  const b=(p,lb,left,off)=>`<button data-page="${p}" data-pg="${id}" ${off?"disabled":""} class="flex items-center gap-1 px-4 py-2.5 rounded-xl font-bold ${off?"opacity-30":"bg-white dark:bg-stone-900 ring-1 ring-stone-200 dark:ring-stone-800"}">${left?`<i data-lucide="chevron-left" class="w-4 h-4"></i>${lb}`:`${lb}<i data-lucide="chevron-right" class="w-4 h-4"></i>`}</button>`;
  return pages>1?b(page-1,"Önceki",1,page===0)+`<span class="text-sm font-semibold tabular">${page+1} / ${pages}</span>`+b(page+1,"Sonraki",0,page>=pages-1):""}

const usable=MFC.usable;
const avail=g=>g.offers.filter(usable);
const best=g=>avail(g).reduce((a,o)=>!a||o.price<a.price?o:a,null);
const worst=g=>Math.max(...avail(g).map(o=>o.price));
const inCart=g=>cart.some(k=>GI[k]===g);
const uniq=a=>[...new Set(a.map(k=>GI[k]).filter(Boolean))];
// Adet: listede kaç tane; çoklu alım kampanyası (2 Al 1 Öde vb.) adede göre uygulanır
const qtyOf=g=>Math.max(1,QTY[g.key]|0||1);
function lineTotal(o,q){const p=o._promo;
  if(p&&p.kind==="multi"&&p.need>1&&q>=p.need){const k=Math.floor(q/p.need);return k*p.need*p.eff+(q-k*p.need)*o.price}
  return q*o.price}
const totalUnits=()=>uniq(cart).reduce((a,g)=>a+qtyOf(g),0);
const stepper=(g,cls="")=>`<div class="stepper ${cls}"><button data-dec="${esc(g.key)}" aria-label="Bir azalt"><i data-lucide="${qtyOf(g)>1?"minus":"trash-2"}" class="w-4 h-4"></i></button><span class="tabular">${qtyOf(g)}</span><button data-inc="${esc(g.key)}" aria-label="Bir artır"><i data-lucide="plus" class="w-4 h-4"></i></button></div>`;
const disc=MFC.disc;
const unitTxt=o=>{const u=MF.unitPrice(o);return u?`${tl(u.v)}/${u.u}`:""};

// ---------- Kampanya çözümleme ----------
// promo metninden kampanya türü ve "tanesi kaça gelir" hesabı
const promoOf=MFC.promoOf;
const gain=o=>o._promo&&o.price>0?Math.max(0,1-o._promo.eff/o.price):0;
function promoLine(o){const p=o._promo;if(!p)return"";
  if(p.kind==="multi")return`${p.need} adet alınca tanesi <b>${tl(p.eff)}</b>`;
  if(p.kind==="basket"&&p.min)return`${p.min} TL üzeri sepette <b>${tl(p.eff)}</b>`;
  if(p.kind==="basket")return esc(p.label);
  return esc(p.label)}
const promoChip=o=>o._promo?chip(`<i data-lucide="gift" class="w-3 h-3 inline -mt-0.5"></i> ${esc(o._promo.kind==="basket"?o._promo.label:o._promo.label)}`,"bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"):"";

// ---------- Ürün kartı (şerit ve ızgaralarda) ----------
const priceUpdateLink=MFC.priceUpdateLink;
const stamp=v=>v?new Date(typeof v==="number"?v*1000:v).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
const dayTxt=d=>d?d.toLocaleDateString("tr-TR",{day:"numeric",month:"long"}):"";
// Satış dönemi / doğrulama durumu için kısa etiket
function stateChip(o){
  if(o.na==="soon")return chip(`Yakında · ${dayTxt(o.when.start)}`,"bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300");
  if(o.na==="ended")return chip(o.when&&o.when.end?`Süresi doldu · ${dayTxt(o.when.end)}`:"Satış dönemi geçti","bg-stone-200 text-stone-600");
  if(!o.in_stock)return chip("Tükendi","bg-stone-200 text-stone-600");
  return"";
}
const moneyChip=o=>o.money&&disc(o)?chip("Money ile","bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"):"";
// Ürünün en son ne zaman kaynaktan doğrulandığı ve kullanıcı kontrolü
function checkLine(o){
  const r=reqs[o.id],now=Date.now()/1000,waiting=r&&now-r<900&&!(o.checked&&MFC.toTs(o.checked.checked_at)>r);
  let t=`<span class="${o.stale?"text-amber-700 dark:text-amber-400 font-semibold":"text-stone-500"}">Doğrulama: ${MFC.ago(o.seen)||"bilinmiyor"}${o.stale?" · eski veri":""}</span>`;
  if(o.checked)t+=` <span class="text-emerald-700 dark:text-emerald-400">· siz kontrol ettirdiniz (${MFC.ago(MFC.toTs(o.checked.checked_at))})</span>`;
  if(o.checkFail)t+=` <span class="text-red-600 font-semibold">· son kontrol başarısız: ${esc(o.checkFail.message||"")}</span>`;
  if(waiting)t+=` <span class="text-blue-700 dark:text-blue-300 font-semibold">· talep gönderildi, sonuç birkaç dakika içinde</span>`;
  return t;
}
// Herkes için: kayıt yapmayan tazelik kontrolü
const freshBtn=(o,cls)=>`<button data-fresh="${esc(o.id)}" class="${cls}"><i data-lucide="badge-check" class="w-3.5 h-3.5 inline -mt-0.5"></i> Fiyat güncel mi?</button>`;
function freshPanel(o){
  const f=MFC.freshness(o,CHECK[o.market]),c={ok:"bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",likely:"bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200",old:"bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200",na:"bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200"}[f.level];
  const ic={ok:"circle-check",likely:"clock",old:"triangle-alert",na:"calendar-clock"}[f.level];
  return`<div class="mt-2 rounded-xl p-3 text-xs leading-snug ${c}"><p class="font-extrabold text-sm flex items-center gap-1.5"><i data-lucide="${ic}" class="w-4 h-4"></i>${f.title}: ${tl(o.price)}</p>
  <p class="mt-1">${esc(f.text)}</p>
  ${o.url&&o.url.startsWith("https://")?`<a href="${esc(o.url)}" target="_blank" rel="noopener" class="mt-2 inline-flex items-center gap-1 font-bold underline">${M[o.market].n} sayfasında canlı fiyatı gör <i data-lucide="external-link" class="w-3.5 h-3.5"></i></a>`:""}
  <p class="mt-2 opacity-70">Bu kontrol hiçbir şeyi kaydetmez ve hesap gerektirmez. Market siteleri başka sitelerden canlı sorguya izin vermediği için uygulama canlı fiyatı kendisi okuyamaz.</p></div>`}
const updBtn=(o,cls)=>{const u=priceUpdateLink(o);return u?`<a href="${esc(u)}" data-req="${esc(o.id)}" target="_blank" rel="noopener noreferrer" class="${cls}"><i data-lucide="refresh-cw" class="w-3.5 h-3.5 inline -mt-0.5"></i> Fiyatı Güncelle</a>`:""};
function pcard(o,opt={}){
  const g=GI[o.id],key=g?g.key:o.id,d=disc(o),p=o._promo,inC=g&&inCart(g),u=unitTxt(o),ok=usable(o);
  const multi=g&&avail(g).length>1;
  return`<article class="pc ${opt.strip?"w-[46vw] max-w-[180px] sm:w-44 shrink-0":""}" style="--i:${opt.i||0}">
  <div class="ph" data-show="${esc(key)}">${o.image&&o.image.startsWith("https://")?`<img src="${esc(o.image)}" alt="${esc(o.name)}" loading="lazy" onerror="this.style.visibility='hidden'">`:`<i data-lucide="package" class="w-10 h-10 text-stone-300"></i>`}
    ${d?`<span class="disc-tag">%${Math.round(d*100)}</span>`:""}<span class="mk-tag">${badge(o.market,1)}</span>
    ${p&&p.kind!=="bim"&&ok?`<span class="promo-tag">${esc(p.label)}</span>`:""}</div>
  <p class="text-[13px] font-bold leading-snug mt-2 h-[2.3rem] line-clamp-2" data-show="${esc(key)}">${esc(o.name)}</p>
  <p class="text-[11px] text-stone-500 tabular h-4">${u}${multi?` · <span class="text-emerald-700 font-bold">${avail(g).length} markette</span>`:""}</p>
  <div class="mt-1.5 pr-11 min-h-[2.6rem]">
    ${d?`<p class="text-xs text-stone-400 line-through tabular leading-none">${tl(o.regular)}</p>`:""}
    <p class="price tabular ${d?"text-red-600":""}">${tl(o.price)}</p>
    ${p&&p.kind==="basket"&&p.min&&p.eff<o.price&&ok?`<p class="text-[11px] font-extrabold text-violet-700 leading-tight mt-0.5">Kasada ${tl(p.eff)}</p>`:""}
    ${moneyChip(o)}${stateChip(o)?`<div class="mt-0.5">${stateChip(o)}</div>`:""}
  </div>
  ${opt.strip?"":`<button data-fresh="${esc(o.id)}" data-open="${esc(key)}" class="self-start mt-1 text-[11px] font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1"><i data-lucide="badge-check" class="w-3.5 h-3.5"></i>Güncel mi?</button>`}
  ${inC?stepper(g):`<button data-add="${esc(key)}" ${ok?"":"disabled"} aria-label="Listeye ekle" class="add ${ok?"":"opacity-30"}"><i data-lucide="plus" class="w-5 h-5"></i></button>`}
</article>`}
// ---------- Karşılaştırma verisi ----------
function buildCompare(){
  // 1) Aynı ürün, aynı boy
  CMP.same=G.map(g=>{const a=avail(g);if(a.length<2)return null;const b=best(g),w=worst(g),p=w>0?(w-b.price)/w:0;
    if(p>0.7)return null; // bu kadar fark büyük olasılıkla yanlış eşleşme
    return{title:g.name,image:g.image,key:g.key,rows:a.map(o=>({o,val:o.price})),win:b,diff:w-b.price,pct:p,n:a.length,unit:false}}).filter(Boolean);
  // 2) Aynı ürün, farklı boy: birim fiyatla
  CMP.size=MF.families(O).map(f=>{const by={};
    for(const o of f.offers){const u=MF.unitPrice(o);if(u&&(!by[o.market]||u.v<by[o.market].val))by[o.market]={o,val:u.v,u:u.u}}
    const rows=ORD.filter(m=>by[m]).map(m=>by[m]);if(rows.length<2)return null;
    if(new Set(rows.map(r=>GI[r.o.id])).size===1)return null; // zaten "aynı boy" listesinde
    if(new Set(rows.map(r=>r.o._p.size)).size===1)return null;
    const lo=rows.reduce((a,r)=>r.val<a.val?r:a),hi=rows.reduce((a,r)=>r.val>a.val?r:a);
    if(hi.val/lo.val>3)return null;
    return{title:lo.o.name.replace(/\s+\d[\d.,]*\s*(kg|gr|g|lt|l|ml)\b.*$/i,"")||lo.o.name,image:lo.o.image,key:GI[lo.o.id].key,rows,win:lo.o,diff:hi.val-lo.val,pct:(hi.val-lo.val)/hi.val,n:rows.length,unit:true}}).filter(Boolean);
  // 3) Temel ihtiyaçlar: marka fark etmeksizin en ucuz
  CMP.staple=MF.staples(O).map(s=>{const rows=ORD.filter(m=>s.best[m]).map(m=>({o:s.best[m].o,val:s.best[m].u.v,u:s.best[m].u.u}));
    const lo=rows.reduce((a,r)=>r.val<a.val?r:a),hi=rows.reduce((a,r)=>r.val>a.val?r:a);
    return{title:s.name,image:lo.o.image,key:GI[lo.o.id].key,rows,win:lo.o,diff:hi.val-lo.val,pct:(hi.val-lo.val)/hi.val,n:rows.length,unit:true,staple:true}});
}
function cmpCard(it){
  const max=Math.max(...it.rows.map(r=>r.val)),g=GI[it.win.id],inC=g&&inCart(g);
  const head=it.diff<0.005?`<span class="text-stone-500">Fiyatlar aynı</span>`
    :it.unit?`<span class="${good} font-bold">${M[it.win.market].n}</span> birim fiyatta <b>${pct(it.pct)}</b> daha ucuz`
    :`<span class="${good} font-bold">${M[it.win.market].at}</span> <b>${tl(it.diff)}</b> daha ucuz (${pct(it.pct)})`;
  return`<article class="${card} p-4 min-w-0">
  <div class="flex gap-3 items-center">${img(it.image,"w-16 h-16 shrink-0")}
    <div class="min-w-0"><h3 class="font-bold leading-snug">${esc(it.title)}</h3><p class="text-sm mt-0.5">${head}</p></div></div>
  <div class="mt-3 space-y-1.5">${it.rows.map(r=>{const w=r.o===it.win&&it.diff>=0.005;
    return`<div data-show="${esc(GI[r.o.id].key)}" class="relative rounded-xl px-2.5 py-2 cursor-pointer ${w?"ring-1 ring-emerald-500/60":""}">
      <span class="bar" style="width:${Math.max(6,r.val/max*100)}%;background:${w?"#10b981":"#a8a29e"}"></span>
      <div class="relative flex items-center gap-2">${badge(r.o.market,1)}
        <span class="flex-1 min-w-0 text-xs text-stone-600 dark:text-stone-300 truncate">${it.unit?esc(r.o.name):(r.o._promo?promoChip(r.o):"")}</span>
        <span class="text-right leading-tight shrink-0"><span class="tabular font-bold ${w?good:""}">${it.unit?`${tl(r.val)}<span class="text-[11px] font-semibold">/${r.u}</span>`:tl(r.o.price)}</span>${it.unit?`<br><span class="text-[11px] text-stone-500 tabular">${tl(r.o.price)}</span>`:""}</span></div></div>`}).join("")}</div>
  <button data-add="${esc(it.key)}" class="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${inC?"bg-stone-100 dark:bg-stone-800":"bg-emerald-600 hover:bg-emerald-700 text-white"}"><i data-lucide="${inC?"check":"plus"}" class="w-4 h-4"></i>${inC?"Listede · çıkar":"Listeye ekle → "+M[it.win.market].n}</button></article>`}
function drawC(){
  const segs=[["same","Aynı ürün"],["size","Farklı boy"],["staple","Temel ihtiyaçlar"]];
  $("cSeg").innerHTML=segs.map(([k,l])=>pill("data-seg",k,`${l} <span class="opacity-60 tabular">${CMP[k].length}</span>`,C.seg===k,"bg-emerald-600 text-white")).join("");
  $("cSort").value=C.sort;$("cThree").checked=C.three;
  let r=CMP[C.seg].filter(it=>!C.three||it.n>=3);
  r=r.slice().sort({pct:(a,b)=>b.pct-a.pct,diff:(a,b)=>b.diff-a.diff,name:(a,b)=>a.title.localeCompare(b.title,"tr")}[C.sort]);
  const pages=Math.max(1,Math.ceil(r.length/PERC));C.page=Math.min(C.page,pages-1);
  const help={same:"Aynı marka, aynı boy. Fiyatlar doğrudan karşılaştırılır.",size:"Aynı ürünün marketlerde farklı boyları satılıyor. Karşılaştırma kilo, litre ya da adet fiyatıyla yapılır.",staple:"Marka fark etmeksizin her markette birim fiyatı en düşük ürün."}[C.seg];
  $("cInfo").textContent=`${num(r.length)} ürün · ${help}`;
  $("cGrid").innerHTML=r.slice(C.page*PERC,(C.page+1)*PERC).map(cmpCard).join("")
    ||empty("scale",C.three?"Üç markette ortak ürün yok":"Ortak ürün bulunamadı",C.three?"BİM yalnızca haftalık aktüel ürünlerini yayımladığı için üç markette ortak ürün az. Filtreyi kaldırın.":"Veri güncellenince yeniden deneyin.");
  $("cPager").innerHTML=pager("C",C.page,pages)}

// ---------- Kampanyalar ----------
function drawK(){
  const kinds=[["free","Bedava ürünlü"],["nth","2. ürün indirimli"],["basket","Sepet fırsatı"],["bim","BİM aktüel"],["","Tümü"]];
  const is=(o,k)=>!k||o._promo.sub===k||o._promo.kind===k||(k==="nth"&&o._promo.kind==="other");
  const cnt=k=>PROMO.filter(o=>is(o,k)).length;
  if(K.kind&&!cnt(K.kind))K.kind=kinds.find(([k])=>k&&cnt(k))?.[0]||"";
  $("kKind").innerHTML=kinds.filter(([k])=>!k||cnt(k)).map(([k,l])=>pill("data-kind",k,`${l} <span class="opacity-60 tabular">${cnt(k)}</span>`,K.kind===k,"bg-violet-600 text-white")).join("");
  let r=PROMO.filter(o=>is(o,K.kind));
  const ms=ORD.filter(m=>r.some(o=>o.market===m));if(K.m&&!ms.includes(K.m))K.m="";
  $("kMk").innerHTML=ms.length>1?["",...ms].map(m=>pill("data-km",m,m?M[m].n:"Tüm marketler",K.m===m,m?M[m].c:"")).join(""):"";
  r=r.filter(o=>!K.m||o.market===K.m);$("kSort").value=K.sort;
  r.sort({gain:(a,b)=>gain(b)-gain(a)||a._promo.eff-b._promo.eff,pa:(a,b)=>a._promo.eff-b._promo.eff,name:(a,b)=>a.name.localeCompare(b.name,"tr")}[K.sort]);
  const pages=Math.max(1,Math.ceil(r.length/PER));K.page=Math.min(K.page,pages-1);
  $("kInfo").textContent=num(r.length)+" ürün"+(K.kind==="free"?" · 1 Alana 1 Bedava, 2 Al 1 Öde, 3 Al 2 Öde… Tane fiyatı kampanyalı hesaplanmıştır":K.kind==="basket"?" · Sepet tutarı belirtilen sınırı geçince geçerli fiyat":K.kind==="bim"?" · BİM'in yayımladığı haftalık ürünler":"");
  $("kGrid").innerHTML=r.slice(K.page*PER,(K.page+1)*PER).map((o,i)=>pcard(o,{i})).join("")||empty("gift","Kampanya bulunamadı","Kampanya verisi bir sonraki güncellemede gelir.");
  $("kPager").innerHTML=pager("K",K.page,pages)}

// ---------- Afişler: marketlerin herkese açık afiş ve kampanya görselleri ----------
let POST=[],PV={m:""},VIEW_I=-1;
// Afişini otomatik okuyamadığımız marketler için marketin kendi sayfasına bağlantı
const POSTER_LINKS=[
  {market:"migros",title:"Migroskop dijital dergi",text:"Migros'un haftalık indirim dergisi.",url:"https://www.money.com.tr/mc/kampanyalara-bak/migroskop-dijital/83"},
  {market:"a101",title:"A101 aktüel afişleri",text:"A101 sitesi otomatik erişime kapalı; afişleri kendi sitesinde görebilirsin.",url:"https://www.a101.com.tr/afisler"},
];
// Afişin geçerlilik dönemi: BİM afiş tarihi, Migros/Şok kampanya metnindeki tarih aralığı ("20-23 Kasım",
// "1 ve 30 Kasım 2026", "19 Kasım - 2 Aralık"). Aralığı biten afiş gösterilmez; BİM'in tek tarihli aktüel
// afişi 7 gün sonra eskimiş sayılır.
const POSTER_DAYS=7;
function posterState(it){
  if(it._w!==undefined)return it._w;
  let w=null;
  if(it.market==="bim"){w=MFC.bimWhen(it.label);
    if(w&&!w.end&&w.state!=="soon"){const t=new Date();t.setHours(0,0,0,0);w={...w,state:(t-w.start)/864e5>POSTER_DAYS?"expired":"active"}}}
  else if(it.label){const v=MFC.bimWhen(String(it.label).replace(/(\d)\s+ve\s+(\d)/,"$1-$2"));if(v&&v.end)w=v}
  return it._w=w}
const livePoster=it=>{const w=posterState(it);return!w||w.state!=="expired"&&w.state!=="old"};
// Ürün listesi olan afiş/kampanya: Migros listesi, Şok kampanya ürünleri, BİM afişinin tarihindeki aktüel ürünler
// Şok'ta aynı türden çok sayıda tek ürünlük kampanya var ("50 TL ve üzeri alışverişte 179 TL!" ×45,
// "1 Alana 1 Bedava" ×3): bunlar tek kampanya sayfasında toplanır, ürünler kaydırılarak görülür.
const SOK_GROUPS={"#-tl-ve-uzeri-alisveriste-#-#-tl":["Kasa Arkası İndirimleri","50 TL ve üzeri alışverişte kasada indirimli ürünler. Stoklarla sınırlıdır."],
  "#-alana-#-bedava":["1 Alana 1 Bedava","Aynı üründen 1 alana 1 bedava. Stoklarla sınırlıdır."]};
// BİM aynı tarih için 3-4 afiş sayfası yayımlıyor; hepsi aynı ürün listesine ait olduğundan tek kayıt olur.
function groupBim(list){
  const out=[],at={};
  list.forEach(it=>{if(it.market!=="bim"){out.push(it);return}const k=it.group+"|"+it.label;
    if(at[k]==null){at[k]=out.length;out.push({...it,id:"bim:"+k,images:[it.image],thumbs:[it.thumb||it.image]})}
    else{const g=out[at[k]];g.images.push(it.image);g.thumbs.push(it.thumb||it.image)}});
  return out}
function groupSok(list){
  const key=it=>it.market!=="sok"?null:String(it.url||"").replace(/^https:\/\/www\.sokmarket\.com\.tr\//,"").replace(/-prm-.*$/,"").replace(/\d+/g,"#");
  const groups={},done=new Set(),out=[];
  list.forEach(it=>{const k=key(it);if(k)(groups[k]=groups[k]||[]).push(it)});
  list.forEach(it=>{const k=key(it);if(!k||groups[k].length<2){out.push(it);return}
    if(done.has(k))return;done.add(k);const g=groups[k],[title,label]=SOK_GROUPS[k]||[g[0].title,g[0].label];
    out.push({market:"sok",id:"sok:grup:"+k.replace(/#/g,"n"),title,label,group:"Kampanya",image:g[0].image,images:g.map(x=>x.image),
      thumb:"",collage:true,url:"https://www.sokmarket.com.tr/kampanyalar",ids:[...new Set(g.flatMap(x=>x.ids||[]))],parts:g.length})});
  return out}
// Birden çok görselli kampanyada kapak: ilk dört görselden kolaj
const coverImg=(it,cls)=>it.collage
  ?`<div class="grid grid-cols-2 gap-px bg-stone-200 w-full h-full">${it.images.slice(0,4).map(u=>`<img src="${esc(u)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.style.visibility='hidden'">`).join("")}</div>`
  :`<img src="${esc(it.thumb||it.image)}" alt="${esc(it.title)}" loading="lazy" class="${cls}" onerror="this.closest('button').remove()">`;
const isCamp=it=>it&&Array.isArray(it.ids)&&it.ids.some(id=>OI[id]);
const campKey=it=>it.slug||it.id;
function posterCard(it,i,cls=""){
  const w=posterState(it),soon=w&&w.state==="soon",old=w&&(w.state==="old"||w.state==="expired"),wide=it.market==="migros";
  // Migros görselleri yatay (yaklaşık 4:1): ızgarada iki sütun, rafta geniş kart
  if(wide)cls=cls?cls.replace("w-40","w-72 self-start"):"col-span-2";
  return`<button ${isCamp(it)?`data-camp="${esc(campKey(it))}"`:`data-poster="${i}"`} class="pc !p-0 overflow-hidden text-left ${cls} ${old?"opacity-60":""}" style="--i:${i%12}">
    <div class="relative bg-white ${it.market==="bim"?"aspect-[3/4]":wide?"aspect-[38/10]":"aspect-[16/9]"} overflow-hidden">${coverImg(it,"w-full h-full object-cover transition duration-500 hover:scale-105")}
      <span class="absolute top-1.5 left-1.5">${badge(it.market,1)}</span>${it.market==="bim"&&it.images&&it.images.length>1?`<span class="absolute bottom-1.5 right-1.5 chipx bg-black/70 text-white">${it.images.length} sayfa</span>`:""}${soon?`<span class="absolute top-1.5 right-1.5 chipx bg-sky-600 text-white">Yakında</span>`:old?`<span class="absolute top-1.5 right-1.5 chipx bg-stone-700 text-white">Geçmiş</span>`:""}</div>
    <div class="p-2.5"><p class="text-[13px] font-extrabold leading-snug line-clamp-2">${esc(it.market==="bim"?(it.group+" · "+it.label):it.title)}</p>${(it.market!=="bim"&&it.label)||isCamp(it)?`<p class="text-[11px] text-stone-500 mt-0.5 line-clamp-1">${esc([it.market!=="bim"?it.label:"",isCamp(it)?num(campCount(it))+" ürün":""].filter(Boolean).join(" · "))}</p>`:""}</div></button>`}
// Ana sayfa rafı için yatay Migros kartı: iki tanesi alt alta bir dikey afiş boyunu doldurur
function campMini(it){
  const mg=it.market==="migros",n=isCamp(it)?num(campCount(it))+" ürün":mg?"Migros'ta aç":"";
  return`<button ${isCamp(it)?`data-camp="${esc(campKey(it))}"`:`data-poster="${POST.indexOf(it)}"`} class="pc !p-0 overflow-hidden text-left flex-1 !gap-0">
    <div class="relative bg-white ${mg?"aspect-[38/10]":"aspect-[2/1]"} overflow-hidden shrink-0">${mg?"":`<span class="absolute top-1.5 left-1.5">${badge(it.market,1)}</span>`}${coverImg(it,"w-full h-full object-cover")}</div>
    <div class="px-2.5 py-2 flex-1 flex flex-col"><p class="text-[12.5px] font-extrabold leading-snug ${mg?"line-clamp-2":"line-clamp-1"}">${esc(it.title)}</p>
      <p class="mt-auto pt-1 text-[11px] text-stone-500 flex items-center justify-between gap-1"><span class="truncate">${esc([it.label,n].filter(Boolean).join(" · "))}</span><span class="font-extrabold ${mg?"text-orange-600":"text-yellow-700"} shrink-0">Gör ›</span></p></div></button>`}
const linkCard=(l,cls="")=>`<a href="${esc(l.url)}" target="_blank" rel="noopener" class="pc ${cls} justify-between gap-2"><span>${badge(l.market,1)}</span><span class="font-extrabold text-sm leading-snug">${esc(l.title)}</span><span class="text-[11px] text-stone-500 leading-snug">${esc(l.text)}</span><span class="text-xs font-extrabold text-emerald-700 flex items-center gap-1">Sitesinde aç<i data-lucide="external-link" class="w-3.5 h-3.5"></i></span></a>`;
// Güncel olanlar önce: BİM'de tarihi yakın/gelmemiş afişler, sonra Şok kampanyaları, geçmiş BİM afişleri en sonda
function sortedPosters(){
  // Süresi dolanlar çıkar. Sıra: şu an geçerli olanlar önce, yakında başlayacaklar sonra; her grupta market
  // sırası BİM, Migros, Şok; ürün listesi olanlar önce; BİM'de en yeni tarih başta.
  const MO={bim:0,migros:1,sok:2};
  const key=it=>{const w=posterState(it);return[w&&w.state==="soon"?1:0,MO[it.market]??3,isCamp(it)?0:1,w&&w.start?(w.state==="soon"?+w.start:-w.start):0]};
  return POST.map((it,i)=>({it,i,k:key(it)})).filter(x=>livePoster(x.it))
    .sort((a,b)=>{for(let n=0;n<4;n++)if(a.k[n]!==b.k[n])return a.k[n]-b.k[n];return a.i-b.i}).map(x=>x.it)}
function drawP(){
  const list=sortedPosters(),ms=[...new Set(list.map(x=>x.market))];
  $("pMk").innerHTML=["",...ms].map(m=>pill("data-pm",m,m?M[m].n:"Tümü",PV.m===m,m?M[m].c:"")).join("");
  const r=list.filter(x=>!PV.m||x.market===PV.m);
  $("pGrid").innerHTML=r.map(it=>posterCard(it,POST.indexOf(it))).join("")+POSTER_LINKS.filter(l=>!PV.m||l.market===PV.m||!ms.includes(PV.m)).map(l=>linkCard(l)).join("");
  $("pInfo").textContent=r.length?`${num(r.length)} afiş · görsele dokun, büyüt`:"Afişler bir sonraki güncellemede gelir.";
}
let VIEW_K=0;
function openViewer(i,k=0){VIEW_I=i;const it=POST[i];if(!it)return;const pages=it.images&&it.images.length?it.images:[it.image];VIEW_K=Math.max(0,Math.min(k,pages.length-1));
  $("vImg").src=pages[VIEW_K];$("vImg").alt=it.title;$("vTitle").textContent=it.market==="bim"?`BİM ${it.group} · ${it.label}`:it.title;
  $("vSub").textContent=(pages.length>1?`Sayfa ${VIEW_K+1}/${pages.length} · `:"")+(it.market==="bim"?"Stoklarla sınırlıdır":it.label||"");$("vLink").href=it.url;$("viewer").classList.remove("hidden");document.body.style.overflow="hidden"}
function closeViewer(){$("viewer").classList.add("hidden");document.body.style.overflow="";VIEW_I=-1}
function stepViewer(d){const it=POST[VIEW_I],pages=(it&&it.images)||[];
  if(pages.length>1&&VIEW_K+d>=0&&VIEW_K+d<pages.length){openViewer(VIEW_I,VIEW_K+d);return}
  if(CAMP&&view==="camp")return; // kampanya sayfasında yalnızca o afişin sayfaları
  const list=sortedPosters(),k=list.indexOf(it);const n=list[(k+d+list.length)%list.length];if(n){const np=(n.images||[]).length;openViewer(POST.indexOf(n),d<0&&np?np-1:0)}}

// ---------- Migros kampanya sayfası: orijinal kapak + kampanyadaki ürünler ----------
let CAMP="",CV={sort:"",n:40};
const campCount=it=>it.market==="migros"?(it.count||it.ids.length):it.ids.filter(id=>OI[id]).length;
const campTitle=it=>it.market==="bim"?`BİM ${it.group} · ${it.label}`:it.title;
function drawCamp(){
  const it=POST.find(x=>campKey(x)===CAMP);
  if(!it||!O.length){$("campHead").innerHTML=O.length?empty("gift","Kampanya bulunamadı","Kampanya sona ermiş ya da marketin sayfasından kaldırılmış olabilir."):`<div class="sk-card skel !h-40"></div>`;$("campGrid").innerHTML="";$("campMore").innerHTML="";return}
  const mk=it.market,mg=mk==="migros",objs=it.ids.map(id=>OI[id]).filter(Boolean),r=objs.slice();
  if(CV.sort==="price")r.sort((a,b)=>(usable(b)-usable(a))||a.price-b.price);
  else if(CV.sort==="disc")r.sort((a,b)=>disc(b)-disc(a)||a.price-b.price);
  else if(CV.sort==="unit")r.sort((a,b)=>{const x=MF.unitPrice(a),y=MF.unitPrice(b);return(!x)-(!y)||(x&&y?x.v-y.v:0)});
  const total=campCount(it),more=mg&&it.count>it.ids.length,w=posterState(it);
  const desc=mg?it.desc:mk==="sok"?it.label:"Stoklarla sınırlıdır.";
  const when=mg?it.label:mk==="bim"?(w&&w.state==="soon"?"Yakında · ":"")+it.label:"";
  const src=mg?"Fiyatlar Migros'un kampanya listesinden günde iki kez okunur.":mk==="sok"?(it.parts?`Şok'un ${num(it.parts)} ayrı kampanyası bu sayfada toplandı. `:"")+"Ürünler Şok'un kampanya sayfasındaki listeden eşleştirildi.":"Ürünler BİM'in aynı tarihli aktüel listesinden eşleştirildi.";
  $("campHead").innerHTML=`<button onclick="history.length>1?history.back():go('posters')" class="flex items-center gap-1 text-sm font-bold text-stone-600 mb-3 active:scale-95 transition"><i data-lucide="chevron-left" class="w-5 h-5"></i>Geri</button>
  ${(()=>{const pages=it.images&&it.images.length>1?it.images:null,th=it.thumbs||pages;
    if(pages)return`<div class="flex gap-2 overflow-x-auto noscroll -mx-3 px-3 pb-1">${pages.map((u,k)=>`<button data-cimg="${k}" class="relative shrink-0 rounded-xl overflow-hidden ring-1 ring-stone-200 bg-white"><img src="${esc(th[k]||u)}" alt="" loading="lazy" class="${mk==="bim"?"h-44 w-auto":"h-24 w-auto"} object-contain"><span class="absolute bottom-1 right-1 chipx bg-black/60 text-white !text-[10px]">${k+1}</span></button>`).join("")}</div>`;
    return`<button data-cimg="0" class="relative block w-full rounded-[20px] overflow-hidden bg-white ring-1 ring-stone-200 shadow-sm"><img src="${esc(it.image)}" alt="${esc(campTitle(it))}" class="w-full ${mg?"h-auto":"max-h-48 object-cover object-top"} pop-in">${mg?"":`<span class="absolute bottom-2 right-2 chipx bg-black/70 text-white"><i data-lucide="maximize-2" class="w-3.5 h-3.5"></i>Afişin tamamı</span>`}</button>`})()}
  <div class="mt-3 flex flex-wrap items-center gap-1.5">${badge(mk,1)}${when?`<span class="chipx bg-orange-100 text-orange-800"><i data-lucide="calendar" class="w-3.5 h-3.5"></i>${esc(when)}</span>`:""}<span class="chipx bg-stone-200 text-stone-700">${num(total)} ürün</span>${it.images&&it.images.length>1?`<span class="chipx bg-stone-200 text-stone-700">${it.images.length} ${it.collage?"kampanya":"afiş sayfası"}</span>`:""}</div>
  <h1 class="font-display font-extrabold text-2xl leading-tight tracking-tight mt-2">${esc(campTitle(it))}</h1>
  ${desc?`<details class="mt-1.5 text-sm text-stone-600 leading-relaxed group"><summary class="list-none cursor-pointer"><span class="line-clamp-2 group-open:line-clamp-none">${esc(desc)}</span>${desc.length>110?`<span class="text-xs font-bold text-emerald-700 group-open:hidden">Kampanya koşulları ›</span>`:""}</summary></details>`:""}
  ${objs.length>3?`<div class="flex gap-2 overflow-x-auto noscroll mt-3">${[["","Önerilen"],["price","En ucuz"],["disc","En çok indirim"],["unit","Birim fiyat"]].map(([k,l])=>pill("data-csort",k,l,CV.sort===k)).join("")}</div>`:""}
  <p class="text-xs text-stone-500 mt-2">${more?`Sitede ${num(it.count)} ürün var; ilk ${num(it.ids.length)} ürün gösteriliyor. `:""}${src} <a href="${esc(it.url)}" target="_blank" rel="noopener" class="font-bold text-emerald-700 underline">${M[mk].n} sitesinde aç</a></p>`;
  $("campGrid").innerHTML=r.slice(0,CV.n).map((o,i)=>pcard(o,{i:i%12})).join("")||empty("package","Ürün bulunamadı","Bu kampanyanın ürünleri marketin sitesinde.");
  $("campMore").innerHTML=r.length>CV.n?`<button data-cmore class="px-5 py-2.5 rounded-xl font-bold bg-white ring-1 ring-stone-200">${num(r.length-CV.n)} ürün daha göster</button>`:"";
}
function openCamp(key){CAMP=key;CV={sort:"",n:40};closeViewer();go("camp")}

// ---------- Ana sayfa ----------
let slideT=null,slideI=0;
function slides(st){
  const deals=st.filter(o=>disc(o)>0).sort((a,b)=>disc(b)-disc(a));
  const pics=list=>list.filter(o=>o.image).slice(0,3).map(o=>`<img src="${esc(o.image)}" alt="" loading="lazy" onerror="this.remove()">`).join("");
  const out=[];
  if(deals.length){const mx=Math.round(disc(deals[0])*100);
    out.push(`<div class="slide s-red"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Günün fırsatları</p><h3>%${mx}'e varan indirim</h3><p>${num(deals.length)} üründe indirim. Hepsi tek yerde.</p></div><button data-go="deals" class="cta relative z-10">İndirimleri gör<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(deals.slice(0,12).filter((o,i)=>i%3===0))}</div></div>`)}
  // Bedava ürünlü kampanyalar önce (1 Alana 1 Bedava, 2 Al 1 Öde), sonra kazanca göre
  const multi=PROMO.filter(o=>o._promo.kind==="multi").sort((a,b)=>(b._promo.sub==="free")-(a._promo.sub==="free")||gain(b)-gain(a));
  const freeN=multi.filter(o=>o._promo.sub==="free").length,alana=multi.filter(o=>/bedava/i.test(o._promo.label)).length;
  if(multi.length)out.push(`<div class="slide s-violet"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Bedava ürünlü kampanyalar</p><h3>${alana?"1 Alana 1 Bedava":"2 Al 1 Öde"} ve dahası</h3><p>${num(freeN)} üründe bedava ürün kazanırsın${alana?` · ${alana} tanesi “1 Alana 1 Bedava”`:""}. Tane fiyatını hesapladık.</p></div><button data-view="promos" data-plain="1" class="cta relative z-10">Bedavaları gör<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(multi)}</div></div>`);
  const water=MF.unitCompare(st,"su");
  if(water){const b=water.best;out.push(`<div class="slide s-blue"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Birim fiyat</p><h3>Suyun litresi en ucuz nerede?</h3><p>${esc(b.o.name)} · ${M[b.o.market].at} <b>${tl(b.u.v)}/L</b></p></div><button data-uq="su" class="cta relative z-10">Boy boy karşılaştır<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(water.top.map(h=>h.o))}</div></div>`)}
  const wins={};CMP.staple.forEach(it=>{if(it.diff>=0.005)wins[it.win.market]=(wins[it.win.market]||0)+1});
  const top=Object.keys(wins).sort((a,b)=>wins[b]-wins[a])[0];
  if(top)out.push(`<div class="slide s-green"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Temel ihtiyaçlar</p><h3>${M[top].n} ${wins[top]} üründe en ucuz</h3><p>Süt, yağ, şeker, un… ${CMP.staple.length} temel üründe birim fiyat karşılaştırması.</p></div><button data-seg="staple" data-open="1" class="cta relative z-10">Kim ucuz?<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(CMP.staple.map(it=>it.win))}</div></div>`);
  const soon=O.filter(o=>o.na==="soon");
  if(soon.length){const d=soon.map(o=>o.when.start).sort((a,b)=>a-b)[0];
    out.push(`<div class="slide s-amber"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">BİM aktüel</p><h3>Yakında: ${d.toLocaleDateString("tr-TR",{day:"numeric",month:"long"})}</h3><p>${num(soon.length)} ürün satışa çıkmadan fiyatlarını gör.</p></div><button data-bm="bim" data-open="1" class="cta relative z-10">BİM ürünleri<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(soon)}</div></div>`)}
  return out;
}
function startSlides(){
  const el=$("banner"),n=el.children.length;clearInterval(slideT);
  $("dots").innerHTML=Array.from({length:n},(_,i)=>`<span class="dot ${i===slideI?"on":""}"></span>`).join("");
  el.onscroll=()=>{const i=Math.round(el.scrollLeft/el.clientWidth);if(i!==slideI){slideI=i;[...$("dots").children].forEach((d,k)=>d.classList.toggle("on",k===i))}};
  const pause=()=>{clearInterval(slideT);slideT=null};el.ontouchstart=pause;el.onmouseenter=pause;
  el.onmouseleave=()=>{if(!slideT)startSlides()};
  if(n>1&&!matchMedia("(prefers-reduced-motion: reduce)").matches)slideT=setInterval(()=>{if(view!=="home")return;el.scrollTo({left:((slideI+1)%n)*el.clientWidth,behavior:"smooth"})},5000);
}
function drawH(){
  if(!O.length)return; // veri gelene kadar iskelet kartlar kalır
  const st=O.filter(usable);
  const sl=slides(st);$("banner").innerHTML=sl.join("")||`<div class="slide s-green"><h3>Market Fiyat</h3></div>`;slideI=0;$("banner").scrollLeft=0;startSlides();
  $("cats").innerHTML=GROUPS.map(([k,l,ic,bg,fg])=>`<button data-grp="${k}" class="cat"><span class="ic" style="background:${bg};color:${fg}"><i data-lucide="${ic}" class="w-7 h-7"></i></span>${l}</button>`).join("");
  $("deals").innerHTML=st.filter(o=>disc(o)>0).sort((a,b)=>disc(b)-disc(a)).slice(0,20).map((o,i)=>pcard(o,{strip:1,i})).join("")||`<p class="text-sm text-stone-500">Şu an indirim görünmüyor.</p>`;
  // Rafta marketler sırayla karışık: BİM afişi, Migros kampanyası, Şok kampanyası…
  const live=sortedPosters(),by={};
  live.forEach(it=>(by[it.market]=by[it.market]||[]).push(it));
  // Her turda: bir BİM afişi, alt alta iki Migros kampanyası (dikey afişle aynı boyda), bir Şok kampanyası
  const cols=[],take={},per={migros:2,sok:2};
  for(let r=0;cols.length<12&&Object.keys(by).some(m=>(take[m]||0)<by[m].length);r++)
    Object.keys(by).forEach(m=>{const n=per[m]||1,k=take[m]||0,part=by[m].slice(k,k+n);if(part.length&&cols.length<12){cols.push(part);take[m]=k+n}});
  $("hPost").innerHTML=cols.map((c,j)=>per[c[0].market]
    ?`<div class="${c[0].market==="migros"?"w-64":"w-44"} shrink-0 flex flex-col gap-2.5" style="--i:${j}">${c.map(it=>campMini(it)).join("")}</div>`
    :posterCard(c[0],POST.indexOf(c[0]),"w-40 shrink-0")).join("")+POSTER_LINKS.map(l=>linkCard(l,"w-44 shrink-0")).join("");
  $("units").innerHTML=UNIT_Q.map(([q,l,ic])=>`<button data-uq="${esc(q)}" class="uchip"><i data-lucide="${ic}" class="w-4 h-4 text-emerald-600"></i>${l}</button>`).join("");
  $("stores").innerHTML=DATA_M.filter(m=>O.some(o=>o.market===m)).map(m=>{const n=st.filter(o=>o.market===m),d=n.filter(o=>disc(o)>0).length,s=CHECK[m],failed=s&&s.status!=="tamam"&&!s.partial,part=s&&s.partial;
    return`<button data-bm="${m}" data-open="1" class="store st-${m}"><span class="font-display font-extrabold text-lg lg:text-2xl">${M[m].n}</span>
      <span class="block text-xs lg:text-sm font-bold mt-1 tabular opacity-95">${num(n.length)} ürün</span><span class="block text-xs lg:text-sm font-extrabold tabular">${num(d)} indirim</span>
      <span class="block text-[10px] mt-1 opacity-90">${UPD[m]?"Veri: "+MFC.ago(MFC.toTs(UPD[m])):""}${failed?" · ⚠ son deneme başarısız":part?" · kısmen güncellendi":""}</span></button>`}).join("");
  $("hCmp").innerHTML=CMP.same.filter(it=>it.diff>=1).sort((a,b)=>b.pct-a.pct).slice(0,14).map((it,i)=>`<article data-show="${esc(it.key)}" class="pc w-60 shrink-0" style="--i:${i}">
    <div class="flex gap-2 items-center"><div class="ph w-16 shrink-0">${it.image?`<img src="${esc(it.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:""}</div><p class="text-[13px] font-bold leading-snug max-h-[3.4rem] overflow-hidden">${esc(it.title)}</p></div>
    <div class="mt-2 space-y-1">${it.rows.map(r=>`<div class="flex items-center justify-between">${badge(r.o.market,1)}<span class="tabular text-sm font-extrabold ${r.o===it.win?good:"text-stone-400 line-through"}">${tl(r.o.price)}</span></div>`).join("")}</div>
    <p class="mt-2 chipx bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><i data-lucide="piggy-bank" class="w-3.5 h-3.5"></i>${tl(it.diff)} tasarruf</p></article>`).join("")||`<p class="text-sm text-stone-500">Ortak ürün bulunamadı.</p>`;
  $("hPromo").innerHTML=PROMO.filter(o=>o._promo.kind==="multi").sort((a,b)=>(b._promo.sub==="free")-(a._promo.sub==="free")||(/bedava/i.test(b._promo.label))-(/bedava/i.test(a._promo.label))||gain(b)-gain(a)).slice(0,16).map((o,i)=>pcard(o,{strip:1,i})).join("")||`<p class="text-sm text-stone-500">Kampanya verisi bir sonraki güncellemede gelir.</p>`;
  const wins={};CMP.staple.forEach(it=>{if(it.diff>=0.005)wins[it.win.market]=(wins[it.win.market]||0)+1});
  $("hStaple").innerHTML=CMP.staple.length?`<button data-seg="staple" data-open="1" class="pc w-full p-4 lg:p-5 text-left flex-row items-center gap-4">
    <span class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 grid place-items-center shrink-0"><i data-lucide="shopping-basket" class="w-6 h-6"></i></span>
    <span class="flex-1 min-w-0"><span class="block font-display font-extrabold text-lg">Temel ihtiyaçlarda kim ucuz?</span>
    <span class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm">${ORD.filter(m=>wins[m]).sort((a,b)=>wins[b]-wins[a]).map(m=>`<span>${badge(m,1)} <b class="tabular">${wins[m]}</b> üründe</span>`).join("")}</span></span>
    <i data-lucide="chevron-right" class="w-5 h-5 text-stone-400"></i></button>`:"";
  const r=uniq(cart).slice(-4).reverse();
  $("recent").innerHTML=r.length?`<div class="pc px-4 py-1 ${div}">`+r.map(g=>{const b=best(g);
    return`<div data-show="${esc(g.key)}" class="flex items-center gap-3 py-3">${img(g.image,"w-11 h-11 shrink-0")}<span class="flex-1 text-sm font-bold">${esc(g.name)}</span>${b?badge(b.market,1)+`<span class="price text-base tabular">${tl(b.price)}</span>`:chip("Tükendi","bg-stone-200 text-stone-600")}</div>`}).join("")+`</div>`
    :empty("shopping-cart","Listen boş","Ürünlerdeki yeşil + düğmesiyle ekle; en ucuz markete göre gruplanır.");
  $("upd").textContent=updated?"Güncel: "+new Date(updated).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"-"}

// ---------- Birim fiyat karşılaştırması ----------
function unitPanel(q){
  const r=MF.unitCompare(O.filter(usable),q);if(!r)return"";
  const u=r.unit,b=r.best,max=Math.max(...r.sizes.map(s=>s.best.u.v));
  return`<section class="pc p-4 lg:p-5 col-span-full enter">
    <div class="flex items-center gap-2"><span class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center"><i data-lucide="ruler" class="w-5 h-5"></i></span>
      <div><h2 class="font-display font-extrabold text-lg leading-tight">“${esc(q)}” birim fiyat karşılaştırması</h2><p class="text-xs text-stone-500">${num(r.count)} ürün · marka fark etmeksizin ${u==="adet"?"adet":"1 "+u} fiyatına göre${r.dropped?` · ilgisiz görünen ${r.dropped} ürün hariç`:""}</p></div></div>
    <button data-show="${esc((GI[b.o.id]||{}).key||b.o.id)}" class="uwin w-full text-left mt-3 flex items-center gap-3">
      <div class="w-16 h-16 rounded-2xl bg-white grid place-items-center shrink-0 relative z-10">${b.o.image?`<img src="${esc(b.o.image)}" alt="" class="w-14 h-14 object-contain">`:""}</div>
      <div class="min-w-0 relative z-10"><p class="text-[11px] font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1"><i data-lucide="trophy" class="w-3.5 h-3.5"></i>${u==="adet"?"Adedi":u==="kg"?"Kilosu":"Litresi"} en ucuz</p>
      <p class="font-bold leading-snug">${esc(b.o.name)}</p><p class="text-sm"><span class="font-display font-extrabold text-xl">${tl(b.u.v)}/${u}</span> · ${M[b.o.market].at} ${tl(b.o.price)}</p></div></button>
    <p class="mt-4 mb-2 text-sm font-extrabold">Boy boy en ucuzlar <span class="text-stone-400 font-bold">· dokun, ürüne git</span></p>
    <div class="space-y-1.5">${(UOPEN?r.sizes:r.sizes.slice(0,4)).map((s,i)=>{const h=s.best,w=h===b;
      return`<div data-show="${esc((GI[h.o.id]||{}).key||h.o.id)}" class="urow ${w?"ring-2 ring-emerald-500":""}">
        <span class="fill" style="width:${Math.max(8,h.u.v/max*100)}%;animation-delay:${i*50}ms;${w?"background:#a7f3d0":""}"></span>
        <div class="relative flex items-center gap-2"><span class="w-[5.4rem] shrink-0 font-display font-extrabold text-[13px] leading-tight">${esc(s.label)}</span>
          <span class="flex-1 min-w-0"><span class="block text-xs font-semibold truncate">${esc(h.o.name)}</span><span class="text-[11px] text-stone-500">${badge(h.o.market,1)} ${tl(h.o.price)}${s.count>1?` · ${s.count} seçenek`:""}</span></span>
          <span class="text-right shrink-0 tabular font-extrabold ${w?good:""}">${tl(h.u.v)}<span class="text-[11px] font-bold">/${u}</span></span></div></div>`}).join("")}</div>
    ${r.sizes.length>4?`<button data-uopen class="mt-2 w-full py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-sm font-extrabold flex items-center justify-center gap-1 active:scale-[.98] transition">${UOPEN?"Daha az göster":`Tüm boyları göster (${r.sizes.length})`}<i data-lucide="${UOPEN?"chevron-up":"chevron-down"}" class="w-4 h-4"></i></button>`:""}
  </section>`}

// ---------- Ara ----------
function offerRow(o,isB){
  const out=!usable(o),d=disc(o)>0,u=unitTxt(o);
  return`<div class="py-2 ${isB?"bg-emerald-50 dark:bg-emerald-950/40 -mx-4 px-4":""}"><div class="flex items-center gap-2 ${out?"opacity-40":""}">
  ${badge(o.market)}${isB?`<span class="flex items-center gap-1 ${good} text-xs font-bold"><i data-lucide="trophy" class="w-3.5 h-3.5"></i>En ucuz</span>`:""}
  <span class="flex-1"></span>${stateChip(o)}${moneyChip(o)}${d?`<span class="text-xs text-stone-400 line-through tabular">${tl(o.regular)}</span>`:""}
  <span class="tabular font-bold text-right ${isB||d?good:""} ${out?"line-through":""}">${tl(o.price)}</span>
  ${o.url&&o.url.startsWith("https://")?`<a href="${esc(o.url)}" target="_blank" rel="noopener" aria-label="Markette aç" class="text-stone-400 p-1"><i data-lucide="external-link" class="w-4 h-4"></i></a>`:""}</div>
  ${o._promo||u?`<p class="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">${o._promo?`${o._promo.kind==="multi"?promoChip(o):""}<span class="text-violet-700 dark:text-violet-300">${promoLine(o)}</span>`:""}${u?`<span class="text-stone-500 tabular">${u}</span>`:""}</p>`:""}
  <div class="text-[11px] mt-1 flex items-center gap-2 flex-wrap"><span class="flex-1 min-w-0">${checkLine(o)}</span>${freshBtn(o,"shrink-0 px-2.5 py-1.5 rounded-lg font-bold text-blue-700 bg-blue-50 dark:bg-blue-950 dark:text-blue-300")}</div>
  ${FRESH.has(o.id)?freshPanel(o)+`<p class="mt-1 text-[11px] text-stone-500">Depo sahibiyseniz: ${updBtn(o,"font-semibold underline")} (GitHub hesabı gerekir, sonucu kaydeder)</p>`:""}</div>`}
// Tazelik rozeti: fiyatın marketin sitesinden ne zaman doğrulandığı (dokununca ayrıntı)
function freshPill(o){
  const f=MFC.freshness(o,CHECK[o.market]),c={ok:"bg-emerald-100 text-emerald-800",likely:"bg-sky-100 text-sky-800",old:"bg-amber-100 text-amber-900",na:"bg-stone-200 text-stone-700"}[f.level];
  const ic={ok:"circle-check",likely:"clock",old:"triangle-alert",na:"calendar-clock"}[f.level];
  return`<button data-fresh="${esc(o.id)}" class="chipx ${c} dark:bg-stone-800 dark:text-stone-200"><i data-lucide="${ic}" class="w-3.5 h-3.5"></i>${f.title}${o.seen&&f.level!=="na"?" · "+MFC.ago(o.seen):""}</button>`}
// Fiyat geçmişi: istenince market başına bir kez indirilir
const HSINCE={};
function loadHist(m){if(HIST[m])return;HIST[m]="…";get(`data/history-${m}.json`).then(d=>{HIST[m]=(d&&d.items)||{};HSINCE[m]=(d&&d.since)||null;if(view==="search"&&only)redraw()})}
// Ürün sayfası fiyat geçmişi: her market için basamaklı fiyat çizgisi, en düşük/en yüksek, son indirim,
// kampanya ve zam tarihleri; olay listesi. Veri: data/history-<market>.json (yalnızca değişimler saklanır).
const dshort=ts=>new Date(ts*1000).toLocaleDateString("tr-TR",{day:"numeric",month:"short"});
function evText(e){
  if(e.type==="disc")return e.first?`İndirimdeydi: %${e.pct} (${tl(e.from)} → ${tl(e.to)})`:`İndirim: %${e.pct} (${tl(e.from)} → ${tl(e.to)})`;
  if(e.type==="discEnd")return`İndirim bitti, fiyat ${tl(e.to)}`;
  if(e.type==="hike")return`Zam: etiket fiyatı ${tl(e.from)} → ${tl(e.to)} (+%${e.pct})`;
  if(e.type==="cut")return`Etiket fiyatı düştü: ${tl(e.from)} → ${tl(e.to)}`;
  if(e.type==="promo")return`Kampanya: ${e.text}`;
  return`Kampanya bitti: ${e.text}`}
function histCard(g){
  if(g.offers.some(o=>!HIST[o.market]||HIST[o.market]==="…"))return`<div class="${card} p-4 mt-4"><div class="skel h-40 rounded-xl"></div></div>`;
  const now=Math.floor(Date.now()/1000);
  const S=g.offers.map(o=>({o,h:MFC.histInfo(HIST[o.market][o.id],o)})).filter(x=>x.h);
  if(!S.length)return"";
  const since=Math.min(...S.map(x=>HSINCE[x.o.market]||x.h.points[0].ts));
  const head=`<h2 class="font-extrabold flex items-center gap-2"><i data-lucide="chart-line" class="w-5 h-5 text-emerald-600"></i>Fiyat geçmişi</h2>`;
  if(!S.some(x=>x.h.changes>0))return`<div class="${card} p-4 mt-4 enter">${head}<p class="mt-2 text-sm text-stone-600">Fiyat takibi ${dshort(since)} tarihinde başladı; o günden beri ${S.length>1?"bu marketlerde ":""}fiyat değişmedi.</p></div>`;
  // Grafik
  const W=340,H=150,L=46,R=8,T=10,B=24,all=S.flatMap(x=>x.h.points);
  const x0=Math.min(since,...all.map(p=>p.ts)),x1=Math.max(now,...all.map(p=>p.ts));
  let y0=Math.min(...all.map(p=>p.price)),y1=Math.max(...all.map(p=>p.price));const pad=(y1-y0)*0.12||y1*0.05;y0=Math.max(0,y0-pad);y1+=pad;
  const X=t=>L+(x1>x0?(t-x0)/(x1-x0):1)*(W-L-R),Y=v=>T+(1-(v-y0)/(y1-y0))*(H-T-B);
  const lines=S.map(({o,h})=>{const c=M[o.market].bar,pts=h.points;let d=`M${X(pts[0].ts).toFixed(1)} ${Y(pts[0].price).toFixed(1)}`;
    pts.slice(1).forEach(p=>{d+=` H${X(p.ts).toFixed(1)} V${Y(p.price).toFixed(1)}`});d+=` H${X(x1).toFixed(1)}`;
    return`<path d="${d}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round" class="draw"/>`+
      pts.map(p=>`<circle cx="${X(p.ts).toFixed(1)}" cy="${Y(p.price).toFixed(1)}" r="${p.regular>p.price+0.005?3.5:2.5}" fill="${p.regular>p.price+0.005?"#dc2626":c}" stroke="#fff" stroke-width="1"><title>${dshort(p.ts)} · ${tl(p.price)}${p.promo?" · "+esc(p.promo):""}</title></circle>`).join("")}).join("");
  const grid=[y0+(y1-y0)*0.08,(y0+y1)/2,y1-(y1-y0)*0.08].map(v=>`<line x1="${L}" x2="${W-R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="#e7e5e4" stroke-dasharray="3 3"/><text x="${L-4}" y="${(Y(v)+3).toFixed(1)}" text-anchor="end" font-size="9" fill="#78716c">${tl(v).replace(" ₺","")}</text>`).join("");
  const svg=`<svg viewBox="0 0 ${W} ${H}" class="w-full mt-2" role="img" aria-label="Fiyat grafiği">${grid}${lines}
    <text x="${L}" y="${H-6}" font-size="9" fill="#78716c">${dshort(x0)}</text><text x="${W-R}" y="${H-6}" font-size="9" fill="#78716c" text-anchor="end">Bugün</text></svg>`;
  const legend=S.length>1?`<div class="flex flex-wrap gap-3 mt-1 text-[11px] font-bold">${S.map(({o})=>`<span class="flex items-center gap-1"><span class="w-3 h-1 rounded" style="background:${M[o.market].bar}"></span>${M[o.market].n}</span>`).join("")}<span class="flex items-center gap-1"><span class="w-2 h-2 rounded-full bg-red-600"></span>İndirimli</span></div>`:`<p class="mt-1 text-[11px] text-stone-500"><span class="inline-block w-2 h-2 rounded-full bg-red-600"></span> indirimli fiyat</p>`;
  // Özet
  const rows=S.map(({o,h})=>{const f=[];
    if(h.atLow)f.push(`<span class="chipx bg-emerald-600 text-white">Kayıtlı en düşük fiyat</span>`);
    else if(h.changes&&o.price>h.low+0.005)f.push(`<span class="chipx bg-amber-100 text-amber-900">En düşüğün %${Math.round((o.price/h.low-1)*100)} üstünde</span>`);
    const facts=[h.changes?`En düşük <b>${tl(h.low)}</b> (${dshort(h.lowTs)}) · en yüksek <b>${tl(h.high)}</b>`:`${dshort(since)}'den beri fiyat sabit`,
      h.lastDisc?`Son indirim: <b>${dshort(h.lastDisc.ts)}</b> (%${h.lastDisc.pct})${h.lastDisc.first?" veya öncesi":""}`:"Kayıtlı indirim yok",
      h.lastPromo?`Son kampanya: <b>${esc(h.lastPromo.text)}</b> · ${dshort(h.lastPromo.ts)}${h.lastPromo.first?" veya öncesi":""}`:"",
      h.lastHike?`Son zam: ${dshort(h.lastHike.ts)} (+%${h.lastHike.pct})`:""].filter(Boolean);
    return`<div class="py-2.5"><div class="flex items-center gap-2 flex-wrap">${badge(o.market,1)}${f.join("")}</div><ul class="mt-1 text-[13px] text-stone-700 space-y-0.5">${facts.map(x=>`<li>${x}</li>`).join("")}</ul></div>`}).join("");
  const evs=S.flatMap(({o,h})=>h.events.map(e=>({...e,m:o.market}))).sort((a,b)=>b.ts-a.ts).slice(0,8);
  return`<div class="${card} p-4 mt-4 enter">${head}${svg}${legend}<div class="mt-2 ${div}">${rows}</div>
    ${evs.length?`<details class="mt-2"><summary class="text-sm font-bold text-emerald-700 cursor-pointer">Değişim geçmişi (${evs.length})</summary><ol class="mt-2 space-y-1.5">${evs.map(e=>`<li class="flex gap-2 text-[13px]"><span class="tabular text-stone-500 w-14 shrink-0">${dshort(e.ts)}</span>${S.length>1?badge(e.m,1):""}<span>${esc(evText(e))}</span></li>`).join("")}</ol></details>`:""}
    <p class="mt-2 text-[11px] text-stone-400">Her taramada fiyat, etiket fiyatı ve kampanya karşılaştırılır; değişiklik olunca kaydedilir. Takip ${dshort(since)} tarihinde başladı.</p></div>`}
function spark(o){
  const h=HIST[o.market];if(!h||h==="…")return"";const pts=h[o.id];if(!pts||pts.length<2)return"";
  const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),y0=Math.min(...ys),y1=Math.max(...ys);
  const X=t=>4+(x1>x0?(t-x0)/(x1-x0):1)*232,Y=v=>34-(y1>y0?(v-y0)/(y1-y0):.5)*28;
  const d=pts.map((p,i)=>(i?"L":"M")+X(p[0]).toFixed(1)+" "+Y(p[1]).toFixed(1)).join(" ");
  return`<div class="mt-2"><p class="text-[11px] font-bold text-stone-500">Fiyat geçmişi · en düşük ${tl(y0)} · en yüksek ${tl(y1)}</p>
  <svg viewBox="0 0 240 40" class="w-full h-10 mt-1"><path d="${d}" fill="none" stroke="#059669" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" class="draw"/>${pts.map(p=>`<circle cx="${X(p[0]).toFixed(1)}" cy="${Y(p[1]).toFixed(1)}" r="2.5" fill="#059669"/>`).join("")}</svg></div>`}
// ---------- Ürün bilgisi: uygulamadaki veriden otomatik metin (istek atmaz, kaydetmez) ----------
const TIPS={
  meyve:"Taze ürünlerde fiyat kilo ya da adet üzerinden olabilir; kasada tartıya göre değişebilir.",
  et:"Soğuk zincir ürünüdür; buzdolabında saklayın ve etiketteki son tüketim tarihine uyun.",
  sut:"Soğuk zincir ürünü olabilir; açıldıktan sonra buzdolabında saklayıp kısa sürede tüketin.",
  donuk:"Eve gelince hemen dondurucuya koyun; çözülen ürünü yeniden dondurmayın.",
  temizlik:"Çocukların ulaşamayacağı yerde saklayın; kullanım ve güvenlik uyarıları için etiketi okuyun.",
  bakim:"Kullanmadan önce etiketteki kullanım talimatını ve uyarıları okuyun.",
  bebek:"Yaş/evre ve kullanım bilgisini ambalajdan kontrol edin.",
  evcil:"Hayvanınızın yaşına ve boyutuna uygunluğunu ambalajdan kontrol edin.",
};
let FAM=null;
function famOf(o){if(!FAM){FAM={};MF.families(O).forEach(f=>f.offers.forEach(x=>FAM[x.id]=f))}return FAM[o.id]}
function productInfo(g){
  const b=best(g)||g.offers[0],p=b._p||{},av=avail(g),u=MF.unitPrice(b),grp=grpOf(b),G1=GROUPS.find(x=>x[0]===grp),out=[];
  // Marka: adın ilk kelimesi; "Dr. Oetker", "M Life" gibi kısa/noktalı öneklerde ilk iki kelime
  const ws=String(b.name).split(/\s+/),brand=ws[0]&&(ws[0].length<=2||/\.$/.test(ws[0]))&&ws[1]?ws[0]+" "+ws[1]:ws[0]||"";
  out.push(`<b>${esc(g.name)}</b>${G1?`, ${esc(G1[1])} kategorisinde`:""} bir üründür${brand?` (marka: ${esc(brand)})`:""}.${p.qty?` Paket miktarı ${p.qty.u==="ad"?p.qty.n+" adet":p.qty.u==="g"?(p.qty.n>=1000?(p.qty.n/1000).toLocaleString("tr-TR")+" kg":p.qty.n+" g"):(p.qty.n>=1000?(p.qty.n/1000).toLocaleString("tr-TR")+" L":p.qty.n+" ml")}.`:""}`);
  const ms=[...new Set(g.offers.map(o=>M[o.market].n))];
  out.push(ms.length>1?`${ms.join(", ")} marketlerinde satılıyor; şu an en ucuz ${M[b.market].at} <b>${tl(b.price)}</b>.${av.length>1&&worst(g)-b.price>0.005?` En pahalı seçenekle arasında ${tl(worst(g)-b.price)} (%${Math.round((worst(g)-b.price)/worst(g)*100)}) fark var.`:""}`
    :`Yalnızca ${M[b.market].at} bulunuyor; fiyatı <b>${tl(b.price)}</b>.`);
  if(u){let t=`Birim fiyatı ${tl(u.v)}/${u.u}.`;
    const f=famOf(b);if(f){const sizes={};f.offers.filter(usable).forEach(x=>{const v=MF.unitPrice(x);if(v&&(!sizes[x._p.qty.n]||v.v<sizes[x._p.qty.n].v.v))sizes[x._p.qty.n]={x,v}});
      const lo=Object.values(sizes).sort((a,b)=>a.v.v-b.v.v)[0];
      if(lo&&lo.x._p.qty.n!==p.qty.n&&lo.v.v<u.v*0.95)t+=` Aynı ürünün ${esc(lo.x.name.match(/\d[\d.,]*\s*(kg|gr|g|lt|l|ml|cl)\b/i)?.[0]||"başka")} boyu ${M[lo.x.market].at} ${tl(lo.v.v)}/${lo.v.u} ile birim fiyatta daha avantajlı.`}
    out.push(t)}
  const pr=b._promo;
  if(pr&&usable(b)){if(pr.kind==="multi")out.push(`Kampanya: “${esc(pr.label)}”. ${pr.need} adet alındığında tanesi ${tl(pr.eff)}'ye gelir.`);
    else if(pr.kind==="basket")out.push(`Sepet kampanyası: ${esc(pr.label)}.`);}
  if(b.money&&disc(b))out.push(`Migros'taki indirimli fiyat Money üyelerine geçerlidir; üyeliksiz fiyat ${tl(b.regular)}.`);
  if(b.market==="bim"&&b.when){const d=x=>x.toLocaleDateString("tr-TR",{day:"numeric",month:"long"});
    out.push(b.na==="soon"?`BİM'de ${d(b.when.start)} tarihinde satışa çıkacak aktüel üründür.`:b.when.end?`BİM indirim dönemi: ${d(b.when.start)} – ${d(b.when.end)}.`:`BİM aktüel ürünüdür (${d(b.when.start)}); stoklarla sınırlıdır.`)}
  const h=HIST[b.market],pts=h&&h!=="…"&&h[b.id];
  if(pts&&pts.length>=2){const hi=MFC.histInfo(pts,b);if(hi&&hi.changes)out.push(`Kayıtlı fiyat geçmişinde ${hi.changes} değişim var; en düşük ${tl(hi.low)}, en yüksek ${tl(hi.high)}.${hi.atLow?" Şu anki fiyat kayıtlı en düşük fiyat.":""}`)}
  out.push((TIPS[grp]?TIPS[grp]+" ":"")+"İçindekiler, alerjen ve son tüketim bilgisi için ambalaj etiketine bakın.");
  return`<div class="${card} p-4 mt-4 enter"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="info" class="w-5 h-5 text-emerald-600"></i>Ürün bilgisi</h2>
    <div class="mt-2 space-y-2 text-[14px] leading-relaxed text-stone-700">${out.map(x=>`<p>${x}</p>`).join("")}</div>
    <p class="mt-3 text-[11px] text-stone-400">Bu metin uygulamadaki fiyat verisinden otomatik hazırlanır; marketin resmi ürün açıklaması değildir.</p></div>`}
// Market sitesi ürün sayfası
function productPage(g){
  g.offers.forEach(o=>loadHist(o.market));
  const b=best(g),inC=inCart(g),av=avail(g),sv=b&&av.length>1?worst(g)-b.price:0,u=b?MF.unitPrice(b):null;
  const offers=g.offers.slice().sort((x,y)=>(usable(y)-usable(x))||x.price-y.price);
  return`<div class="col-span-full enter">
  <button onclick="history.length>1?history.back():go('home')" class="flex items-center gap-1 text-sm font-bold text-stone-600 dark:text-stone-300 mb-3 active:scale-95 transition"><i data-lucide="chevron-left" class="w-5 h-5"></i>Geri</button>
  <div class="grid lg:grid-cols-2 gap-4 lg:gap-8 items-start">
    <div class="${card} p-6 grid place-items-center aspect-square lg:aspect-[4/3] relative overflow-hidden">
      ${g.image?`<img src="${esc(g.image)}" alt="${esc(g.name)}" class="w-[78%] h-[78%] object-contain pop-in">`:`<i data-lucide="package" class="w-20 h-20 text-stone-300"></i>`}
      ${b&&disc(b)?`<span class="disc-tag !text-sm !px-2.5 !py-1">%${Math.round(disc(b)*100)} indirim</span>`:""}
    </div>
    <div>
      <h1 class="font-display font-extrabold text-2xl lg:text-3xl leading-tight tracking-tight">${esc(g.name)}</h1>
      <div class="flex flex-wrap gap-1.5 mt-2">${av.length>1?`<span class="chipx bg-emerald-100 text-emerald-800">${av.length} markette var</span>`:""}${u?`<span class="chipx bg-stone-200 text-stone-700 tabular">${tl(u.v)}/${u.u}</span>`:""}</div>
      ${b?`<div class="mt-4 rounded-[20px] p-4 text-white relative overflow-hidden" style="background:linear-gradient(135deg,#047857,#059669)">
        <p class="text-xs font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1"><i data-lucide="trophy" class="w-4 h-4"></i>En ucuz ${M[b.market].at}</p>
        <p class="font-display font-extrabold text-4xl tabular mt-1">${tl(b.price)}</p>
        ${sv>0.005?`<p class="text-sm font-bold mt-1">Diğer marketlere göre ${tl(sv)}'ye kadar ucuz</p>`:""}
        ${b._promo&&b._promo.kind!=="bim"?`<p class="text-sm mt-1 text-emerald-50">${promoLine(b)}</p>`:""}
        <span class="absolute -right-6 -bottom-10 w-32 h-32 rounded-full bg-white/10"></span></div>`:`<div class="mt-4 rounded-[20px] p-4 bg-stone-200 dark:bg-stone-800 font-bold">${g.offers.some(o=>o.na==="soon")?"Henüz satışta değil":"Şu an stokta yok"}</div>`}
      <h2 class="mt-5 mb-2 font-extrabold">Marketlerdeki fiyatlar</h2>
      <div class="space-y-2">${offers.map((o,i)=>{const w=o===b&&av.length>1,d=disc(o)>0,ok=usable(o);
        return`<div class="${card} p-3 border-l-[6px] ${w?"ring-2 ring-emerald-500":""} enter" style="border-left-color:${M[o.market].bar};animation-delay:${i*60}ms">
          <div class="flex items-center gap-2">${badge(o.market)}${w?`<span class="chipx bg-emerald-600 text-white"><i data-lucide="trophy" class="w-3 h-3"></i>En ucuz</span>`:""}${stateChip(o)}${moneyChip(o)}
            <span class="flex-1"></span>${d?`<span class="text-xs text-stone-400 line-through tabular">${tl(o.regular)}</span>`:""}<span class="price text-xl tabular ${ok?(d?"text-red-600":""):"text-stone-400 line-through"}">${tl(o.price)}</span></div>
          ${o._promo&&o._promo.kind!=="bim"&&ok?`<p class="text-xs mt-1.5 text-violet-700 dark:text-violet-300 font-semibold">${o._promo.kind==="multi"?promoChip(o)+" ":""}${promoLine(o)}</p>`:""}
          <p class="text-[13px] text-stone-600 dark:text-stone-300 mt-1 leading-snug">${esc(o.name)}${unitTxt(o)?` · <span class="tabular">${unitTxt(o)}</span>`:""}</p>
          <div class="flex items-center gap-2 mt-2 flex-wrap">${freshPill(o)}${o.url&&o.url.startsWith("https://")?`<a href="${esc(o.url)}" target="_blank" rel="noopener" class="chipx bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200">${M[o.market].n} sitesinde aç<i data-lucide="external-link" class="w-3 h-3"></i></a>`:""}</div>
          ${FRESH.has(o.id)?freshPanel(o)+`<p class="mt-1 text-[11px] text-stone-500">${checkLine(o)} · Depo sahibiyseniz: ${updBtn(o,"font-semibold underline")}</p>`:""}
          ${(h=>h&&(h.lastDisc||h.lastPromo)?`<p class="mt-1.5 text-[11px] text-stone-500">${[h.lastDisc?`Son indirim ${dshort(h.lastDisc.ts)}`:"",h.lastPromo?`son kampanya ${dshort(h.lastPromo.ts)}`:""].filter(Boolean).join(" · ")}</p>`:"")(HIST[o.market]&&HIST[o.market]!=="…"?MFC.histInfo(HIST[o.market][o.id],o):null)}
        </div>`}).join("")}</div>
      ${histCard(g)}
      ${(alts=>alts.length?`<div class="${card} p-4 mt-4 enter"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="arrow-down-wide-narrow" class="w-5 h-5 text-sky-600"></i>Daha ucuz muadiller</h2>
        <p class="text-xs text-stone-500 mt-0.5">Aynı tür, benzer boy; birim fiyatı daha düşük ürünler.</p>
        <div class="mt-2 ${div}">${alts.map(a=>{const v=MF.unitPrice(a.o);return`<div data-show="${esc(a.g.key)}" class="flex items-center gap-3 py-2.5 cursor-pointer">${img(a.o.image,"w-12 h-12 shrink-0")}<div class="flex-1 min-w-0"><p class="text-sm font-bold leading-snug line-clamp-2">${esc(a.o.name)}</p><p class="text-[11px] text-stone-500">${badge(a.o.market,1)} ${v?tl(v.v)+"/"+v.u:""}</p></div><div class="text-right shrink-0"><p class="price tabular text-base">${tl(a.o.price)}</p><p class="text-[11px] font-extrabold text-sky-700">%${Math.round(a.save*100)} ucuz</p></div></div>`}).join("")}</div></div>`:"")(alternatives(g,3))}
      ${productInfo(g)}
      ${pending?`<button data-map="${esc(g.key)}" class="mt-3 w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-bold bg-amber-500 text-white"><i data-lucide="link" class="w-5 h-5"></i>Bu barkodla eşleştir</button>`:""}
    </div>
  </div>
  <div class="buybar"><div class="max-w-6xl mx-auto flex items-center gap-3">
    <div class="min-w-0 flex-1 hidden sm:block"><p class="text-sm font-bold truncate">${esc(g.name)}</p></div>
    ${b?`<p class="leading-tight"><span class="block text-[11px] text-stone-500">${M[b.market].n}</span><span class="price text-xl tabular">${tl(b.price)}</span></p>`:""}
    ${inC?`<div class="flex-1 sm:flex-none flex items-center justify-end gap-2"><span class="text-xs font-bold text-stone-500 text-right leading-tight">Listede<br><span class="${good}">${tl(lineTotal(b||g.offers[0],qtyOf(g)))}</span></span>${stepper(g,"big")}</div>`:`<button data-add="${esc(g.key)}" ${b?"":"disabled"} class="flex-1 sm:flex-none sm:px-8 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-extrabold transition active:scale-95 ${inC?"bg-stone-200 dark:bg-stone-800 text-stone-800 dark:text-stone-100":b?"bg-emerald-600 text-white shadow-lg shadow-emerald-600/30":"bg-stone-200 text-stone-500"}">
      <i data-lucide="shopping-cart" class="w-5 h-5"></i>${b?"Listeye ekle":"Eklenemez"}</button>`}</div></div>
  </div>`}
function drawS(){
  const raw=$("q").value.trim(),w=MFC.searchWords(raw);
  if(only&&GI[only]){$("res").innerHTML=productPage(GI[only]);return}
  const ban=pending?`<div class="col-span-full rounded-2xl bg-amber-100 text-amber-900 p-4 text-sm"><p class="font-bold">Barkod ${esc(pending)} henüz tanınmıyor</p><p>Ürünü adıyla arayın, ürün sayfasında "Bu barkodla eşleştir"e dokunun. Ürün başına bir kez yeterli.</p><button data-cancel class="mt-2 font-bold underline">Vazgeç</button></div>`:"";
  if(!w.length){$("res").innerHTML=ban+(G.length?`<div class="col-span-full">${empty("search","Ne arıyorsun?","Ürün adı, marka ya da barkod yaz. Örneğin “su”, “süt”, “yüzey temizleyici”.")}<div class="flex flex-wrap gap-2 mt-3">${UNIT_Q.map(([q,l,ic])=>`<button data-uq="${esc(q)}" class="uchip"><i data-lucide="${ic}" class="w-4 h-4 text-emerald-600"></i>${l}</button>`).join("")}</div></div>`:"");return}
  let r=G.filter(g=>w.every(x=>g.s.includes(x)));
  const bp=g=>(best(g)||{price:1e9}).price,up=g=>{const b=best(g),u=b&&MF.unitPrice(b);return u?u.v:1e12};
  // Alaka: adda kelimenin nasıl geçtiği (MFC.searchScore) + bulunduğu market sayısı + satışta olması
  const rel=new Map(r.map(g=>[g,Math.max(...g.offers.map(o=>MFC.searchScore(o.name,o.cat,w)))+avail(g).length*0.6+(best(g)?1:0)]));
  // Baskın bölüm: en alakalı 40 sonucun çoğu hangi bölümdeyse (yumurta → kahvaltılık, pirinç → temel gıda)
  // o bölümdeki ürünler öne alınır; "Sürpriz Yumurta", "Pirinç Süzgeci" gibi başka bölümden adaşlar geriler.
  const top=[...r].sort((a,b)=>rel.get(b)-rel.get(a)).slice(0,40),cnt={};
  top.forEach(g=>{const k=grpOf(best(g)||g.offers[0]);if(k)cnt[k]=(cnt[k]||0)+1});
  const dom=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
  if(dom&&cnt[dom]>=top.length*0.3)r.forEach(g=>{if(grpOf(best(g)||g.offers[0])===dom)rel.set(g,rel.get(g)+6)});
  r.sort({rel:(a,b)=>rel.get(b)-rel.get(a),pa:(a,b)=>bp(a)-bp(b),unit:(a,b)=>up(a)-up(b),disc:(a,b)=>disc(best(b)||{})-disc(best(a)||{})}[S.sort]);
  const total=r.length;r=r.slice(0,60);
  const sorts=[["rel","Önerilen"],["pa","En ucuz"],["unit","Birim fiyat"],["disc","İndirim"]];
  $("res").innerHTML=ban+unitPanel(raw)+
    `<div class="col-span-full flex items-center gap-2 overflow-x-auto noscroll"><p class="text-sm font-bold shrink-0 mr-1">${num(total)} ürün</p>${sorts.map(([k,l])=>pill("data-ss",k,l,S.sort===k,"bg-emerald-600 text-white")).join("")}</div>`+
    (r.length?`<div class="col-span-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 lg:gap-3 stagger">${r.map((g,i)=>pcard(best(g)||g.offers[0],{i})).join("")}</div>`:empty("search-x","Sonuç bulunamadı","Başka bir kelime dene."))
    +(total>60?`<p class="col-span-full text-center text-sm text-stone-500">${num(total)} sonuçtan ilk 60'ı gösteriliyor. Aramayı daraltabilirsin.</p>`:"")}

// ---------- Keşfet ----------
function drawB(){
  const ms=ORD.filter(m=>O.some(o=>o.market===m));
  $("bMk").innerHTML=["",...ms].map(m=>pill("data-bm",m,m?M[m].n:"Tümü",B.m===m,m?M[m].c:"")).join("");
  $("bGrp").innerHTML=GROUPS.map(([k,l,ic,bg,fg])=>`<button data-grp="${k}" data-stay="1" class="cat ${B.grp===k?"on":""}"><span class="ic" style="background:${bg};color:${fg}"><i data-lucide="${ic}" class="w-7 h-7"></i></span>${l}</button>`).join("");
  $("bTitle").textContent=B.grp?GROUPS.find(g=>g[0]===B.grp)[1]:"Tüm ürünler";
  const cats=[...new Set(O.filter(o=>(!B.m||o.market===B.m)&&(!B.grp||grpOf(o)===B.grp)).map(o=>o.cat).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr"));
  if(B.cat&&!cats.includes(B.cat))B.cat="";
  $("bCat").innerHTML=`<option value="">Tüm kategoriler</option>`+cats.map(c=>`<option ${c===B.cat?"selected":""}>${esc(c)}</option>`).join("");
  $("bSort").value=B.sort;$("bDisc").checked=B.disc;
  const r=O.filter(o=>usable(o)&&(!B.m||o.market===B.m)&&(!B.grp||grpOf(o)===B.grp)&&(!B.cat||o.cat===B.cat)&&(!B.disc||disc(o)>0));
  r.sort({disc:(a,b)=>disc(b)-disc(a)||a.price-b.price,pa:(a,b)=>a.price-b.price,pd:(a,b)=>b.price-a.price,unit:(a,b)=>a.name.localeCompare(b.name,"tr")}[B.sort]);
  const pages=Math.max(1,Math.ceil(r.length/PER));B.page=Math.min(B.page,pages-1);
  $("bInfo").textContent=num(r.length)+" ürün";
  $("bGrid").innerHTML=r.slice(B.page*PER,(B.page+1)*PER).map((o,i)=>pcard(o,{i})).join("")||empty("package-search","Ürün bulunamadı","Filtreleri değiştirin.");
  $("bPager").innerHTML=pager("B",B.page,pages)}

// ---------- Daha ucuz muadil ----------
// Aynı tür (markadan sonraki ilk iki ayırt edici kelime aynı), aynı ölçü birimi, ±%25 boy ve birim fiyatta
// en az %5 ucuz ürünler. Marka değiştirmek kullanıcının kararı: yalnızca öneri, tek dokunuşla değiştirilir.
let ALT=new Map();
function alternatives(g,limit=3){
  if(ALT.has(g.key))return ALT.get(g.key).slice(0,limit);
  const b=best(g),p=b&&b._p,u=b&&MF.unitPrice(b),out=[];
  if(p&&u&&p.qty&&p.toks.length>=3){
    const need=p.toks.slice(1,3),own=u.v;
    for(const o of O){if(!usable(o)||!o.in_stock||GI[o.id]===g)continue;const q=o._p;if(!q||!q.qty||q.qty.u!==p.qty.u)continue;
      const r=q.qty.n/p.qty.n;if(r<0.8||r>1.25||!need.every(t=>q.toks.includes(t)))continue;
      const v=MF.unitPrice(o);if(!v||v.v>own*0.95)continue;
      const og=GI[o.id];if(!og||best(og)!==o)continue;out.push({o,g:og,save:1-v.v/own})}
    out.sort((a,b)=>b.save-a.save)}
  const seen=new Set(),uniqOut=out.filter(x=>!seen.has(x.g.key)&&seen.add(x.g.key));
  ALT.set(g.key,uniqOut);return uniqOut.slice(0,limit)}

// ---------- Listem ----------
function drawL(){
  const items=uniq(cart);
  const open=NOTES.filter(n=>!n.d).length,units=totalUnits();["n","n2"].forEach(i=>{$(i).textContent=units+open;$(i).style.display=items.length||open?"grid":"none"});
  const noteBox=`<form data-noteform class="col-span-full flex gap-2"><input id="noteIn" maxlength="60" autocomplete="off" placeholder="Not ekle: ekmek, maydanoz…" class="flex-1 min-w-0 rounded-2xl px-4 py-3 bg-white ring-1 ring-stone-200 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500"><button class="px-4 rounded-2xl bg-emerald-600 text-white font-bold active:scale-95 transition">Ekle</button></form>`;
  const notesHtml=NOTES.length?`<section class="${card} overflow-hidden enter"><div class="px-4 py-3 flex items-center justify-between bg-stone-700 text-white"><span class="font-display font-extrabold text-lg flex items-center gap-2"><i data-lucide="notebook-pen" class="w-5 h-5"></i>Notlar</span><span class="text-sm font-bold">${NOTES.filter(n=>n.d).length}/${NOTES.length} alındı</span></div>
    <div class="px-4 ${div}">${NOTES.map((n,i)=>`<div class="flex items-center gap-3 py-3 ${n.d?"opacity-50":""}"><button data-ndone="${i}" aria-label="Alındı" class="w-7 h-7 shrink-0 rounded-full grid place-items-center border-2 ${n.d?"bg-emerald-600 border-emerald-600 text-white":"border-stone-300"}">${n.d?'<i data-lucide="check" class="w-4 h-4"></i>':""}</button>
      <span class="flex-1 text-[15px] font-bold ${n.d?"line-through":""}">${esc(n.t)}</span><button data-nfind="${i}" class="text-xs font-bold text-emerald-700 flex items-center gap-1"><i data-lucide="search" class="w-3.5 h-3.5"></i>Fiyat bul</button><button data-ndel="${i}" aria-label="Sil" class="text-stone-400 p-1"><i data-lucide="x" class="w-4 h-4"></i></button></div>`).join("")}</div></section>`:"";
  if(!items.length){$("list").innerHTML=noteBox+notesHtml+`<div class="col-span-full">${empty("shopping-cart",NOTES.length?"Henüz ürün yok":"Listen boş","Ürünlerdeki yeşil + düğmesiyle ekle ya da yukarıya not yaz. Liste en ucuz markete göre gruplanır; mağazada aldıklarını işaretlersin.")}</div>`;return}
  let sum=0,max=0,h="",stops=0,got=0;
  ORD.forEach(m=>{const it=items.filter(g=>(best(g)||{}).market===m);if(!it.length)return;stops++;let t=0,dn=0;
    const rows=it.map(g=>{const b=best(g),ok=!!done[g.key],q=qtyOf(g),lt=lineTotal(b,q),promoOn=lt<q*b.price-0.005;t+=lt;max+=worst(g)*q;if(ok){dn++;got++}
      return`<div class="flex items-center gap-3 py-3 ${ok?"opacity-50":""} transition">
        <button data-done="${esc(g.key)}" aria-label="Alındı" class="w-7 h-7 shrink-0 rounded-full grid place-items-center border-2 ${ok?"bg-emerald-600 border-emerald-600 text-white":"border-stone-300"} transition active:scale-90">${ok?'<i data-lucide="check" class="w-4 h-4"></i>':""}</button>
        ${img(g.image,"w-12 h-12 shrink-0")}
        <div data-show="${esc(g.key)}" class="flex-1 min-w-0"><p class="text-sm font-bold leading-snug ${ok?"line-through":""}">${esc(b.name)}</p>
          ${b._promo&&b._promo.kind!=="bim"?`<p class="text-[11px] text-violet-700 dark:text-violet-300 mt-0.5">${promoLine(b)}</p>`:""}
          ${promoOn?`<p class="text-[11px] font-extrabold text-violet-700">✓ Kampanya uygulandı: ${tl(q*b.price-lt)} indirim</p>`:b._promo&&b._promo.kind==="multi"&&q<b._promo.need?`<p class="text-[11px] font-bold text-violet-700">${b._promo.need-q} tane daha eklersen kampanya geçerli</p>`:""}
          ${(worst(g)-b.price)*q>0.005?`<p class="text-[11px] ${good} font-bold">${tl((worst(g)-b.price)*q)} tasarruf</p>`:""}
          ${ok?"":(a=>a?`<div class="mt-1.5 rounded-xl bg-sky-50 ring-1 ring-sky-200 px-2.5 py-1.5 text-[11px] leading-snug"><span class="font-bold text-sky-800">Muadili %${Math.round(a.save*100)} ucuz:</span> <span data-show="${esc(a.g.key)}" class="underline">${esc(a.o.name)}</span> · ${M[a.o.market].n} ${tl(a.o.price)} <button data-swap="${esc(g.key)}" data-to="${esc(a.g.key)}" class="ml-1 font-extrabold text-sky-700">Değiştir ›</button></div>`:"")(alternatives(g,1)[0])}</div>
        <div class="flex flex-col items-end gap-1.5 shrink-0"><span class="price tabular text-base">${tl(lt)}</span>${q>1?`<span class="text-[11px] text-stone-500 tabular -mt-1">${q} × ${tl(b.price)}</span>`:""}${stepper(g,"sm")}</div></div>`}).join("");
    h+=`<section class="${card} overflow-hidden enter"><div class="px-4 py-3 flex items-center justify-between st-${m} text-white"><span class="font-display font-extrabold text-lg flex items-center gap-2"><span class="bg-black/20 rounded-full w-7 h-7 grid place-items-center text-sm">${stops}</span>${M[m].n}</span><span class="text-sm font-bold">${dn}/${it.length} alındı</span></div>
      <div class="px-4 ${div}">${rows}</div><div class="px-4 py-3 bg-stone-50 dark:bg-stone-800/50 flex justify-between font-bold"><span>Ara toplam</span><span class="price tabular">${tl(t)}</span></div></section>`;sum+=t});
  const out=items.filter(g=>!best(g));
  if(out.length)h+=`<section class="${card} overflow-hidden"><div class="bg-stone-300 dark:bg-stone-700 px-4 py-3 font-extrabold">Şu an alınamayanlar</div><div class="px-4 ${div}">${out.map(g=>`<div class="flex items-center gap-3 py-3">${img(g.image,"w-10 h-10 shrink-0")}<span data-show="${esc(g.key)}" class="flex-1 text-sm">${esc(g.name)}</span><button data-add="${esc(g.key)}" class="text-stone-400 p-1"><i data-lucide="x" class="w-4 h-4"></i></button></div>`).join("")}</div></section>`;
  const pctDone=Math.round(got/items.length*100);
  $("list").innerHTML=`<div class="col-span-full rounded-[24px] p-5 text-white relative overflow-hidden" style="background:linear-gradient(135deg,#047857,#0d9488)">
    <p class="text-emerald-100 text-sm font-bold">Alışveriş listem · ${items.length} çeşit · ${units} adet · ${stops} market</p>
    <p class="font-display font-extrabold text-4xl tabular mt-1">${tl(sum)}</p>
    ${max-sum>0.005?`<p class="mt-1 text-sm font-bold"><span class="text-amber-300">${tl(max-sum)} kazancın</span> · market farkı ve kampanyalar sayesinde (kampanyasız, en pahalı markette ${tl(max)})</p>`:""}
    <div class="mt-4 h-2.5 rounded-full bg-white/20 overflow-hidden"><div class="h-full rounded-full bg-amber-300 transition-all duration-500" style="width:${pctDone}%"></div></div>
    <div class="mt-2 flex items-center justify-between text-xs font-bold"><span>${got}/${items.length} ürün alındı</span>${got?`<button data-undone class="underline">İşaretleri sıfırla</button>`:""}</div>
    <div class="relative z-10 mt-4 grid grid-cols-2 gap-2"><button data-share class="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-emerald-800 font-extrabold active:scale-95 transition"><i data-lucide="share-2" class="w-5 h-5"></i>Paylaş</button>
      <button data-pdf class="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/15 ring-1 ring-white/40 text-white font-extrabold active:scale-95 transition"><i data-lucide="file-down" class="w-5 h-5"></i>PDF aktar</button></div>
    <span class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10"></span></div>`+noteBox+h+notesHtml}

// Listeyi düz metin olarak paylaş: market market, adet ve fiyatla; notlar en sonda
function listText(){
  const items=uniq(cart),L=["Alışveriş listem"];let sum=0;
  ORD.forEach(m=>{const it=items.filter(g=>(best(g)||{}).market===m);if(!it.length)return;let t=0;L.push("",M[m].n.toLocaleUpperCase("tr"));
    it.forEach(g=>{const b=best(g),q=qtyOf(g),lt=lineTotal(b,q);t+=lt;L.push(`${done[g.key]?"✓":"•"} ${b.name}${q>1?` ×${q}`:""} — ${tl(lt)}`)});
    L.push(`Ara toplam: ${tl(t)}`);sum+=t});
  if(NOTES.length){L.push("","NOTLAR");NOTES.forEach(n=>L.push(`${n.d?"✓":"•"} ${n.t}`))}
  if(sum)L.push("",`Toplam: ${tl(sum)}`);
  L.push("","Fiyatlar marketlerin online fiyatıdır; mağazada farklı olabilir.",location.origin+location.pathname);
  return L.join("\n")}
// Listeyi PDF olarak aktar: görselli, market market tablo; tarayıcının yazdırma ekranından
// "PDF olarak kaydet" ile dosya olur (Android Chrome'da Yazdır → PDF olarak kaydet).
async function exportPdf(){
  const items=uniq(cart);if(!items.length&&!NOTES.length){note("Listen boş.");return}
  const d=new Date().toLocaleDateString("tr-TR",{day:"numeric",month:"long",year:"numeric",weekday:"long"});let sum=0,n=0;
  const secs=ORD.map(m=>{const it=items.filter(g=>(best(g)||{}).market===m);if(!it.length)return"";let t=0;
    const rows=it.map(g=>{const b=best(g),q=qtyOf(g),lt=lineTotal(b,q);t+=lt;n++;const pr=b._promo&&b._promo.kind!=="bim"?b._promo.label:"";
      return`<tr><td class="pc-box">${done[g.key]?"✓":""}</td><td class="pc-img">${b.image&&b.image.startsWith("https://")?`<img src="${esc(b.image)}" alt="">`:""}</td>
        <td><b>${esc(b.name)}</b>${pr?`<br><span class="pc-promo">${esc(pr)}</span>`:""}</td><td class="pc-num">${q}</td><td class="pc-num">${tl(b.price)}</td><td class="pc-num"><b>${tl(lt)}</b></td></tr>`}).join("");
    sum+=t;return`<h2 style="border-color:${M[m].bar}"><span style="background:${M[m].bar}">${M[m].n}</span> ${it.length} ürün · ${tl(t)}</h2>
      <table><thead><tr><th></th><th></th><th>Ürün</th><th>Adet</th><th>Birim</th><th>Tutar</th></tr></thead><tbody>${rows}</tbody></table>`}).join("");
  const notes=NOTES.length?`<h2 style="border-color:#57534e"><span style="background:#57534e">Notlar</span></h2><ul class="pc-notes">${NOTES.map(x=>`<li><span class="pc-box">${x.d?"✓":""}</span>${esc(x.t)}</li>`).join("")}</ul>`:"";
  $("printArea").innerHTML=`<header><div><h1>Alışveriş listem</h1><p>${d} · ${n} ürün${NOTES.length?` · ${NOTES.length} not`:""}</p></div><div class="pc-total">${tl(sum)}</div></header>${secs}${notes}
    <footer>Fiyatlar marketlerin online fiyatlarıdır (${esc(new Date().toLocaleString("tr-TR"))}); mağazada farklı olabilir. ${esc(location.origin+location.pathname)}</footer>`;
  // Görseller yüklenmeden yazdırılırsa PDF'te boş kutu kalır: en çok 6 sn bekle
  await Promise.all([...$("printArea").querySelectorAll("img")].map(i=>i.complete?0:new Promise(r=>{i.onload=i.onerror=r;setTimeout(r,6000)})));
  document.body.classList.add("printing");note("Yazdır ekranında hedef olarak “PDF olarak kaydet”i seç.");
  setTimeout(()=>{print()},100)}
addEventListener("afterprint",()=>document.body.classList.remove("printing"));
async function shareList(){
  const text=listText();
  try{if(navigator.share){await navigator.share({title:"Alışveriş listem",text});return}}catch(e){if(e&&e.name==="AbortError")return}
  try{await navigator.clipboard.writeText(text);note("Liste panoya kopyalandı; WhatsApp'a yapıştırabilirsin.")}
  catch(e){open("https://wa.me/?text="+encodeURIComponent(text),"_blank")}}

// ---------- Gezinme ----------
const DRAW={home:drawH,compare:drawC,promos:drawK,browse:drawB,search:drawS,list:drawL,posters:drawP,camp:drawCamp};
function icons(){lucide.createIcons()}
function redraw(){DRAW[view]();if(view!=="list")drawL();icons()}
const NB="flex flex-col items-center gap-0.5 py-2 rounded-2xl text-[11px] font-bold relative transition active:scale-90 ";
const NT="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold transition ";
// ---------- Adres (yenileme ve geri tuşu için) ----------
// #urun/<id>, #ara/<sorgu>, #kesfet, #kampanya, #karsilastir, #listem; ana sayfa: adres eki yok
const HV={home:"",compare:"karsilastir",promos:"kampanya",browse:"kesfet",search:"ara",list:"listem",posters:"afisler"};
let routing=false;
function hashOf(){
  if(view==="search"){if(only)return"#urun/"+encodeURIComponent(only);const q=$("q").value.trim();return q?"#ara/"+encodeURIComponent(q):"#ara"}
  if(view==="camp")return"#afis/"+encodeURIComponent(CAMP);
  return HV[view]?"#"+HV[view]:"";
}
function sync(replace){
  if(routing)return;const h=hashOf();if(h===location.hash)return;
  const url=h||location.pathname+location.search;
  replace?history.replaceState(null,"",url):history.pushState(null,"",url);
}
function route(){
  const h=decodeURIComponent(location.hash.slice(1)),[k,...rest]=h.split("/"),arg=rest.join("/");
  routing=true;
  try{
    if(k==="urun"&&arg){only=arg;pending=null;setQ("");go("search")}
    else if(k==="ara"){only=null;setQ(arg);go("search")}
    else if(k==="afis"&&arg){if(CAMP!==arg){CAMP=arg;CV={sort:"",n:40}}go("camp")}
    else{const v=Object.keys(HV).find(x=>HV[x]===k&&x!=="search")||"home";go(v)}
  }finally{routing=false}
}
addEventListener("popstate",route);
function go(v,keep){
  view=v;VIEWS.forEach(id=>$(id).classList.toggle("hidden",id!==v));
  document.querySelectorAll("nav [data-view]").forEach(b=>{if(b.dataset.plain)return;const on=b.dataset.view===v;
    b.className=b.dataset.top?NT+(on?"bg-emerald-600 text-white shadow":"text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"):NB+(on?"bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400":"text-stone-500")});
  const el=$(v);el.classList.remove("enter");void el.offsetWidth;el.classList.add("enter");
  redraw();if(!keep)scrollTo(0,0);sync()}
const QS=[$("q"),$("qd")];const setQ=v=>QS.forEach(i=>i.value=v);
let noteT;function note(m){$("note").textContent=m;$("note").classList.remove("hidden");clearTimeout(noteT);noteT=setTimeout(()=>$("note").classList.add("hidden"),7000)}
function show(key){only=key;setQ("");go("search")}

// ---------- Barkod ----------
function onCode(b){const k=bmap[b];if(k&&GI[k]){only=k;pending=null}else{only=null;pending=b}setQ("");go("search")}
async function scan(){
  if(!("BarcodeDetector" in window)){go("search");note("Bu tarayıcı kamerayla barkod okumayı desteklemiyor. Barkod numarasını arama kutusuna yazıp Enter'a basın.");return}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}})}catch(e){note("Kamera açılamadı. Tarayıcıda kamera iznini kontrol edin.");return}
  const v=$("cam");v.srcObject=stream;await v.play();$("scanner").classList.remove("hidden");
  const det=new BarcodeDetector({formats:["ean_13","ean_8","upc_a"]});let on=true;
  const stop=()=>{on=false;stream.getTracks().forEach(t=>t.stop());$("scanner").classList.add("hidden")};
  $("scanX").onclick=stop;
  while(on){try{const r=await det.detect(v);if(r.length){stop();onCode(r[0].rawValue);return}}catch(e){}await new Promise(r=>setTimeout(r,250))}}

// ---------- Animasyonlar ----------
const calm=()=>matchMedia("(prefers-reduced-motion: reduce)").matches;
function bumpCount(){["n","n2"].forEach(i=>{const b=$(i);b.classList.remove("bump");void b.offsetWidth;b.classList.add("bump")})}
// Listeye eklenen ürünün resmi sepet simgesine uçar
function fly(btn){
  const card=btn.closest("article,.pc"),src=card&&card.querySelector("img");
  const target=[$("navList"),$("cartBtn")].find(x=>x&&x.offsetParent);
  const bump=bumpCount;
  if(!src||!target||calm()){setTimeout(bump,30);return}
  const a=src.getBoundingClientRect(),b=target.getBoundingClientRect(),c=src.cloneNode();c.className="fly";
  Object.assign(c.style,{left:a.left+"px",top:a.top+"px",width:a.width+"px",height:a.height+"px"});document.body.appendChild(c);
  const dx=b.left+b.width/2-(a.left+a.width/2),dy=b.top+b.height/2-(a.top+a.height/2);
  c.animate([{transform:"translate(0,0) scale(1)",opacity:1},{transform:`translate(${dx*.5}px,${dy*.5-80}px) scale(.6)`,opacity:1,offset:.5},{transform:`translate(${dx}px,${dy}px) scale(.12)`,opacity:.3}],{duration:650,easing:"cubic-bezier(.5,0,.75,0)"}).onfinish=()=>{c.remove();bump()};
}
// Bölümler ekrana girdikçe yumuşakça belirir
const seen=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add("in");seen.unobserve(e.target)}}),{rootMargin:"0px 0px -8% 0px"});
document.querySelectorAll("[data-reveal]").forEach(x=>seen.observe(x));
// Veri gelene kadar iskelet kartlar
$("deals").innerHTML=Array.from({length:6},()=>`<div class="sk-card skel"></div>`).join("");
["hCmp","hPromo"].forEach(id=>$(id).innerHTML=Array.from({length:4},()=>`<div class="sk-card skel"></div>`).join(""));

// Afiş görüntüleyici: klavye ve kaydırma
addEventListener("keydown",e=>{if(VIEW_I<0)return;if(e.key==="Escape")closeViewer();else if(e.key==="ArrowRight")stepViewer(1);else if(e.key==="ArrowLeft")stepViewer(-1)});
{let sx=null;$("vBox").addEventListener("touchstart",e=>{sx=e.touches[0].clientX},{passive:true});
 $("vBox").addEventListener("touchend",e=>{if(sx==null)return;const dx=e.changedTouches[0].clientX-sx;sx=null;if(Math.abs(dx)>60)stepViewer(dx<0?1:-1)})}
addEventListener("popstate",()=>{if(VIEW_I>=0)closeViewer()});

// ---------- Olaylar ----------
document.addEventListener("submit",e=>{if(!e.target.matches("[data-noteform]"))return;e.preventDefault();
  const v=($("noteIn").value||"").trim().slice(0,60);if(!v)return;NOTES.push({t:v,d:0});save("notes",NOTES);redraw();setTimeout(()=>{const i=$("noteIn");if(i)i.focus()},50)});
document.addEventListener("click",e=>{const t=s=>e.target.closest(s);let el;
  if(el=t("[data-add]")){const g=GI[el.dataset.add];if(g){const adding=!inCart(g);
    if(adding)fly(el);else delete QTY[g.key];cart=adding?[...cart,g.key]:cart.filter(x=>GI[x]!==g);save("cart",cart);save("qty",QTY);redraw();
    if(adding){const nb=document.querySelector(`[data-add="${CSS.escape(g.key)}"].add`);if(nb)nb.classList.add("pop")}}}
  else if(el=t("[data-inc]")){const g=GI[el.dataset.inc];if(g){QTY[g.key]=qtyOf(g)+1;save("qty",QTY);if(!inCart(g)){cart=[...cart,g.key];save("cart",cart)}if(navigator.vibrate)navigator.vibrate(10);redraw();bumpCount()}}
  else if(el=t("[data-dec]")){const g=GI[el.dataset.dec];if(g){const q=qtyOf(g);if(q>1)QTY[g.key]=q-1;else{delete QTY[g.key];cart=cart.filter(x=>GI[x]!==g);save("cart",cart)}save("qty",QTY);redraw()}}
  else if(el=t("[data-camp]")){openCamp(el.dataset.camp)}
  else if(t("[data-share]")){shareList()}
  else if(t("[data-pdf]")){exportPdf()}
  else if(el=t("[data-swap]")){const from=GI[el.dataset.swap],to=GI[el.dataset.to];if(from&&to){const q=qtyOf(from);cart=cart.map(k=>GI[k]===from?to.key:k);delete QTY[from.key];if(q>1)QTY[to.key]=q;delete done[from.key];save("cart",cart);save("qty",QTY);save("done",done);note("Değiştirildi: "+best(to).name);redraw()}}
  else if(el=t("[data-ndone]")){const n=NOTES[+el.dataset.ndone];if(n){n.d=n.d?0:1;save("notes",NOTES);if(navigator.vibrate)navigator.vibrate(15);redraw()}}
  else if(el=t("[data-ndel]")){NOTES.splice(+el.dataset.ndel,1);save("notes",NOTES);redraw()}
  else if(el=t("[data-nfind]")){const n=NOTES[+el.dataset.nfind];if(n){only=null;setQ(n.t);go("search")}}
  else if(el=t("[data-poster]")){openViewer(+el.dataset.poster)}
  else if(el=t("[data-csort]")){CV.sort=el.dataset.csort;redraw()}
  else if(t("[data-cmore]")){CV.n+=40;redraw()}
  else if(el=t("[data-cimg]")){const it=POST.find(x=>campKey(x)===CAMP);if(it)openViewer(POST.indexOf(it),+el.dataset.cimg||0)}
  else if(el=t("[data-pm]")){PV.m=el.dataset.pm;redraw()}
  else if(t("[data-vx]")){closeViewer()}
  else if(t("[data-vprev]")){stepViewer(-1)}
  else if(t("[data-vnext]")){stepViewer(1)}
  else if(el=t("[data-done]")){const k=el.dataset.done;done[k]?delete done[k]:done[k]=1;save("done",done);if(navigator.vibrate)navigator.vibrate(15);redraw()}
  else if(t("[data-undone]")){done={};NOTES.forEach(n=>n.d=0);save("done",done);save("notes",NOTES);redraw()}
  else if(el=t("[data-ss]")){S.sort=el.dataset.ss;redraw()}
  else if(t("[data-uopen]")){UOPEN=!UOPEN;redraw()}
  else if(el=t("[data-grp]")){const k=el.dataset.grp;B.grp=el.dataset.stay&&B.grp===k?"":k;B.cat="";B.page=0;if(!el.dataset.stay){Object.assign(B,{m:"",disc:false,sort:"disc"});go("browse")}else redraw()}
  else if(el=t("[data-uq]")){only=null;pending=null;setQ(el.dataset.uq);go("search")}
  else if(el=t("[data-map]")){bmap[pending]=el.dataset.map;save("bmap",bmap);only=el.dataset.map;pending=null;redraw();note("Barkod eşleştirildi. Bir dahaki okutmada ürün doğrudan açılır.")}
  else if(t("[data-cancel]")){pending=null;redraw()}
  else if(el=t("[data-fresh]")){const id=el.dataset.fresh;
    if(el.dataset.open){FRESH.add(id);show(el.dataset.open)}else{FRESH.has(id)?FRESH.delete(id):FRESH.add(id);redraw()}}
  else if(el=t("a[data-req]")){reqs[el.dataset.req]=Math.floor(Date.now()/1000);save("req",reqs);
    note("GitHub talep sayfası açıldı. Orada “Create” düğmesine basın: GitHub Actions yalnızca bu ürünü marketin sitesinden kontrol eder ve sonucu talebe yazar (genellikle 1-2 dakika). Sonra bu sayfayı yenileyin.")}
  else if(t("a")){}
  else if(el=t("[data-page]")){({C,K,B})[el.dataset.pg].page=+el.dataset.page;redraw();scrollTo(0,0)}
  else if(el=t("[data-show]"))show(el.dataset.show);
  else if(el=t("[data-seg]")){C.seg=el.dataset.seg;C.page=0;if(el.dataset.open)go("compare");else redraw()}
  else if(el=t("[data-kind]")){K.kind=el.dataset.kind;K.page=0;redraw()}
  else if(el=t("[data-km]")){K.m=el.dataset.km;K.page=0;redraw()}
  else if(el=t("[data-go]")){Object.assign(B,{m:"",grp:"",cat:"",disc:true,sort:"disc",page:0});go("browse")}
  else if(el=t("[data-bm]")){B.m=el.dataset.bm;B.page=0;if(el.dataset.open){Object.assign(B,{grp:"",cat:"",disc:false,sort:"disc"});go("browse")}else redraw()}
  else if(el=t("[data-view]")){if(el.dataset.view==="search"){only=null}go(el.dataset.view);if(el.dataset.focus)(innerWidth>=768?$("qd"):$("q")).focus()}});
let qT;QS.forEach(inp=>{
  inp.oninput=()=>{setQ(inp.value);only=null;pending=null;clearTimeout(qT);
    qT=setTimeout(()=>{if(view!=="search"){go("search",1)}else{drawS();icons();sync(true)}},150)};
  inp.onchange=()=>{const v=inp.value.trim();if(/^\d{8,14}$/.test(v))onCode(v)};
  inp.onkeydown=e=>{if(e.key==="Enter")inp.blur()};
});
$("scan").onclick=scan;
const bind=(id,obj,key,prop)=>$(id).onchange=e=>{obj[key]=e.target[prop||"value"];obj.page=0;redraw()};
bind("bCat",B,"cat");bind("bSort",B,"sort");bind("bDisc",B,"disc","checked");
bind("cSort",C,"sort");bind("cThree",C,"three","checked");bind("kSort",K,"sort");

// ---------- Veri ----------
// Her market kendi dosyasından; dosyası okunamayan market gösterilmez (eski ortak dosyaya düşülmez).
const get=u=>fetch(u,{cache:"no-cache"}).then(r=>r.ok?r.json():null).catch(()=>null);
function build(rows){
  O=rows;OI={};ALT=new Map();O.forEach(o=>OI[o.id]=o);const now=Date.now();O.forEach(o=>{MFC.enrich(o,{checks:CHECKS,now});o.cat=categoryOf(o);o._promo=promoOf(o)});
  G=MF.group(O);
  G.forEach(g=>{g.offers.sort((a,b)=>ORD.indexOf(a.market)-ORD.indexOf(b.market));g.key=g.offers[0].id;g.name=g.offers[0].name;g.image=(g.offers.find(o=>o.image)||{}).image;
    g.s=MFC.fold(g.offers.map(o=>o.name).join(" ")).replace(/[^a-z0-9%]+/g," ");g.offers.forEach(o=>GI[o.id]=g)});
  // 48 saatten uzun süredir doğrulanmayan ürünün kampanyası güncel sayılmaz
  O.forEach(o=>{if(o.stale&&o._promo&&o._promo.kind!=="bim")o._promo=null});
  PROMO=O.filter(o=>o._promo&&usable(o));FAM=null;
  buildCompare();
}
// Çevrimdışı: sw.js son açılan sürümü saklar; mağazada internet yoksa liste yine açılır
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
const offNote=()=>note("İnternet bağlantısı yok: son kaydedilen fiyatlar gösteriliyor. Listen bu telefonda kayıtlı.");
addEventListener("offline",offNote);if(navigator.onLine===false)setTimeout(offNote,1500);
route(); // açılışta adresteki sayfaya git (yenilemede aynı ürün açık kalır)
Promise.all([Promise.all(DATA_M.map(m=>get(`data/${m}.json`))),Promise.all(DATA_M.map(m=>get(`data/status-${m}.json`))),get("data/price-checks.json"),Promise.all(["bim","migros","sok"].map(m=>get(`data/posters-${m}.json`)))]).then(([files,statuses,checks,posters])=>{
  POST=groupBim(groupSok(posters.flatMap(p=>(p&&Array.isArray(p.items)?p.items:[]).filter(it=>it&&/^https:\/\//.test(it.image||"")))));
  // Migros kampanya listelerindeki ürünler: katalogda yoksa eklenir, liste daha yeni okunduysa fiyatı günceller
  const campRows=MFC.rowsOf(posters[1]);
  statuses.forEach((s,i)=>{if(s)CHECK[DATA_M[i]]=s});
  CHECKS=(checks&&checks.checks)||{};
  const rows=[],miss=[];
  files.forEach((d,i)=>{const r=MFC.rowsOf(d);if(r.length){rows.push(...r);UPD[DATA_M[i]]=d.updated}else miss.push(M[DATA_M[i]].n)});
  if(!rows.length)throw new Error("veri yok");
  if(campRows.length){const at=new Map(rows.map((o,i)=>[o.id,i]));
    campRows.forEach(c=>{const i=at.get(c.id);if(i==null){at.set(c.id,rows.length);rows.push(c)}else if((c.seen||0)>(rows[i].seen||0)){const o=rows[i];Object.assign(o,{price:c.price,regular:c.regular,in_stock:c.in_stock,promo:c.promo,money:c.money,seen:c.seen});if(!o.cat)o.cat=c.cat}})}
  if(miss.length)note("Şu marketlerin verisi okunamadı: "+miss.join(", "));
  updated=Object.values(UPD).sort().pop();
  build(rows);
  const byLabel={};O.forEach(o=>{if(o.market==="bim"&&o.promo)(byLabel[o.promo]=byLabel[o.promo]||[]).push(o.id)});
  POST.forEach(it=>{if(it.market==="bim")it.ids=byLabel[`${it.group} · ${it.label}`]||[]});
  redraw();
}).catch(e=>{note("Fiyat verisi yüklenemedi: "+e.message)});
