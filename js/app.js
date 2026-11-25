"use strict";
/* Market Fiyat arayüzü. Eşleştirme mantığı js/match.js içinde (MF). */
const M={sok:{n:"Şok",at:"Şok'ta",c:"bg-yellow-400 text-yellow-950",bar:"#eab308"},migros:{n:"Migros",at:"Migros'ta",c:"bg-orange-700 text-white",bar:"#f97316"},a101:{n:"A101",at:"A101'de",c:"bg-cyan-700 text-white",bar:"#0891b2"},bim:{n:"BİM",at:"BİM'de",c:"bg-red-600 text-white",bar:"#dc2626"}},ORD=Object.keys(M);
const VIEWS=["home","compare","promos","browse","search","list","posters","camp","track","analysis","status"];
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
let O=[],OI={},G=[],GI={},CMP={same:[],size:[],staple:[]},CMP_READY=false,PROMO=[],WATER;
const FRESH=new Set(); // "Fiyat güncel mi?" paneli açık ürünler (kaydedilmez)
let done=load("done",{}),HIST={},S={sort:"rel",m:[],k:"",i:false,c:false,min:"",max:"",open:false},UOPEN=false,USIZE="";
// Arama süzgeçleri adres çubuğunda: #ara/süt?m=sok,bim&k=sut&i=1&c=1&min=10&max=50&s=pa (paylaşılabilir)
const SKEYS=["m","k","i","c","min","max","s"];
function filterQS(){const q=new URLSearchParams();if(S.m.length)q.set("m",S.m.join(","));if(S.k)q.set("k",S.k);if(S.i)q.set("i","1");if(S.c)q.set("c","1");
  if(S.min!=="")q.set("min",S.min);if(S.max!=="")q.set("max",S.max);if(S.sort!=="rel")q.set("s",S.sort);const x=q.toString();return x?"?"+x:""}
function readQS(qs){const q=new URLSearchParams(qs||"");S.m=(q.get("m")||"").split(",").filter(m=>M[m]);S.k=q.get("k")||"";S.i=q.get("i")==="1";S.c=q.get("c")==="1";
  const n=v=>{const x=parseFloat(String(v||"").replace(",","."));return isFinite(x)&&x>=0?String(x):""};S.min=n(q.get("min"));S.max=n(q.get("max"));S.sort=["rel","pa","unit","disc"].includes(q.get("s"))?q.get("s"):"rel"}
const nFilters=()=>S.m.length+(S.k?1:0)+(S.i?1:0)+(S.c?1:0)+(S.min!==""?1:0)+(S.max!==""?1:0);
let QTY=load("qty",{});
let NOTES=load("notes",[]); // listedeki serbest notlar: [{t:"ekmek",d:0}]
// Akıllı sepet: seçili plan (multi: her ürün en ucuz markete, single: tek market, limit: en fazla k market),
// kullanıcının ürün bazında seçtiği market (FIX) ve kayıtlı sepetler
let PLAN=load("plan",{mode:"multi",k:2,market:""}),FIX=load("fix",{}),SAVED=load("baskets",[]);
// Takip: favoriler [{key, price, at}], fiyat alarmları {key:[alarm]}, uygulama içi bildirimler [{ts,key,text,read}]
let FAV=load("fav",[]),ALARMS=load("alarms",{}),INBOX=load("inbox",[]),BUD=load("budget",{limit:0,spends:[]});
let cart=load("cart",[]),bmap=load("bmap",{}),reqs=load("req",{}),pending=null,only=null,updated="",UPD={},PUPD={},HAY="",VOCAB=null,CHECK={},CHECKS={},view="home";
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
const UNIT_Q=[["su","Su","droplet"],["süt","Süt","milk"],["yumurta","Yumurta","egg"],["ekmek","Ekmek","croissant"],["beyaz peynir","Beyaz peynir","square"],["kaşar","Kaşar","square"],["yoğurt","Yoğurt","cup-soda"],["tereyağı","Tereyağı","square"],["zeytin","Zeytin","circle"],
  ["ayçiçek yağı","Ayçiçek yağı","flask-conical"],["zeytinyağı","Zeytinyağı","flask-conical"],["toz şeker","Şeker","candy"],["un","Un","package"],["pirinç","Pirinç","wheat"],["bulgur","Bulgur","wheat"],["mercimek","Mercimek","bean"],["nohut","Nohut","bean"],["makarna","Makarna","utensils"],["salça","Salça","soup"],
  ["çay","Çay","coffee"],["kahve","Kahve","coffee"],["tavuk","Tavuk","drumstick"],["kıyma","Kıyma","beef"],["domates","Domates","apple"],["patates","Patates","apple"],["soğan","Soğan","apple"],["muz","Muz","banana"],["elma","Elma","apple"],
  ["maden suyu","Maden suyu","cup-soda"],["kola","Kola","cup-soda"],["meyve suyu","Meyve suyu","cup-soda"],["çikolata","Çikolata","cookie"],["bisküvi","Bisküvi","cookie"],["cips","Cips","cookie"],
  ["çamaşır deterjanı","Çamaşır deterjanı","shirt"],["yumuşatıcı","Yumuşatıcı","shirt"],["bulaşık deterjanı","Bulaşık deterjanı","utensils-crossed"],["bulaşık makinesi tableti","Bulaşık tableti","utensils-crossed"],["yüzey temizleyici","Yüzey temizleyici","spray-can"],["çamaşır suyu","Çamaşır suyu","spray-can"],
  ["tuvalet kağıdı","Tuvalet kağıdı","scroll"],["kağıt havlu","Kağıt havlu","scroll"],["peçete","Peçete","scroll"],["şampuan","Şampuan","sparkles"],["duş jeli","Duş jeli","sparkles"],["diş macunu","Diş macunu","sparkles"],["sıvı sabun","Sıvı sabun","sparkles"],["bebek bezi","Bebek bezi","baby"],["ıslak mendil","Islak mendil","baby"],["kedi maması","Kedi maması","paw-print"],["köpek maması","Köpek maması","paw-print"]];
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
function buildCompare(){CMP_PARTS.forEach(f=>f())}
// Üç parça ayrı ayrı (boşta, sırayla) çalıştırılabilsin diye bölündü: tek seferde telefonda ~1 sn kilitliyordu
const CMP_PARTS=[()=>{
  // 1) Aynı ürün, aynı boy
  CMP.same=G.map(g=>{const a=avail(g);if(a.length<2)return null;const b=best(g),w=worst(g),p=w>0?(w-b.price)/w:0;
    if(p>0.7)return null; // bu kadar fark büyük olasılıkla yanlış eşleşme
    return{title:g.name,image:g.image,key:g.key,rows:a.map(o=>({o,val:o.price})),win:b,diff:w-b.price,pct:p,n:a.length,unit:false}}).filter(Boolean);
},()=>{
  // 2) Aynı ürün, farklı boy: birim fiyatla
  CMP.size=MF.families(O).map(f=>{const by={};
    for(const o of f.offers){const u=MF.unitPrice(o);if(u&&(!by[o.market]||u.v<by[o.market].val))by[o.market]={o,val:u.v,u:u.u}}
    const rows=ORD.filter(m=>by[m]).map(m=>by[m]);if(rows.length<2)return null;
    if(new Set(rows.map(r=>GI[r.o.id])).size===1)return null; // zaten "aynı boy" listesinde
    if(new Set(rows.map(r=>r.o._p.size)).size===1)return null;
    const lo=rows.reduce((a,r)=>r.val<a.val?r:a),hi=rows.reduce((a,r)=>r.val>a.val?r:a);
    if(hi.val/lo.val>3)return null;
    return{title:lo.o.name.replace(/\s+\d[\d.,]*\s*(kg|gr|g|lt|l|ml)\b.*$/i,"")||lo.o.name,image:lo.o.image,key:GI[lo.o.id].key,rows,win:lo.o,diff:hi.val-lo.val,pct:(hi.val-lo.val)/hi.val,n:rows.length,unit:true}}).filter(Boolean);
},()=>{
  // 3) Temel ihtiyaçlar: marka fark etmeksizin en ucuz
  CMP.staple=MF.staples(O).map(s=>{const rows=ORD.filter(m=>s.best[m]).map(m=>({o:s.best[m].o,val:s.best[m].u.v,u:s.best[m].u.u}));
    const lo=rows.reduce((a,r)=>r.val<a.val?r:a),hi=rows.reduce((a,r)=>r.val>a.val?r:a);
    return{title:s.name,image:lo.o.image,key:GI[lo.o.id].key,rows,win:lo.o,diff:hi.val-lo.val,pct:(hi.val-lo.val)/hi.val,n:rows.length,unit:true,staple:true}});
}];
function buildCompareIdle(done){let i=0;const step=()=>{if(CMP_READY)return done();CMP_PARTS[i++]();if(i<CMP_PARTS.length)idle(step);else{CMP_READY=true;done()}};idle(step)}
// Eşleştirme güveni rozeti (MF.confidence): "orta" eşleşmede kullanıcı adları kontrol etmeye çağrılır
const CONF_L={yuksek:["Eşleşme kesin","bg-emerald-100 text-emerald-800"],iyi:["Eşleşme güçlü","bg-sky-100 text-sky-800"],orta:["Benzer ürün: adları kontrol et","bg-amber-100 text-amber-900"]};
function confChip(g){const c=MF.confidence(g);if(!c)return"";const[l,cls]=CONF_L[c.level];
  return`<span class="chipx ${cls}" title="${esc(c.why)}">${c.level==="orta"?'<i data-lucide="triangle-alert" class="w-3 h-3"></i>':""}${l}</span>`}
function cmpCard(it){
  const max=Math.max(...it.rows.map(r=>r.val)),g=GI[it.win.id],inC=g&&inCart(g);
  const head=it.diff<0.005?`<span class="text-stone-500">Fiyatlar aynı</span>`
    :it.unit?`<span class="${good} font-bold">${M[it.win.market].n}</span> birim fiyatta <b>${pct(it.pct)}</b> daha ucuz`
    :`<span class="${good} font-bold">${M[it.win.market].at}</span> <b>${tl(it.diff)}</b> daha ucuz (${pct(it.pct)})`;
  return`<article class="${card} p-4 min-w-0">
  <div class="flex gap-3 items-center">${img(it.image,"w-16 h-16 shrink-0")}
    <div class="min-w-0"><h3 class="font-bold leading-snug">${esc(it.title)}</h3><p class="text-sm mt-0.5">${head}</p>${!it.unit&&GI[it.win.id]&&(MF.confidence(GI[it.win.id])||{}).level==="orta"?`<p class="mt-1">${confChip(GI[it.win.id])}</p>`:""}</div></div>
  <div class="mt-3 space-y-1.5">${it.rows.map(r=>{const w=r.o===it.win&&it.diff>=0.005;
    return`<div data-show="${esc(GI[r.o.id].key)}" class="relative rounded-xl px-2.5 py-2 cursor-pointer ${w?"ring-1 ring-emerald-500/60":""}">
      <span class="bar" style="width:${Math.max(6,r.val/max*100)}%;background:${w?"#10b981":"#a8a29e"}"></span>
      <div class="relative flex items-center gap-2">${badge(r.o.market,1)}
        <span class="flex-1 min-w-0 text-xs text-stone-600 dark:text-stone-300 truncate">${it.unit?esc(r.o.name):(r.o._promo?promoChip(r.o):"")}</span>
        <span class="text-right leading-tight shrink-0"><span class="tabular font-bold ${w?good:""}">${it.unit?`${tl(r.val)}<span class="text-[11px] font-semibold">/${r.u}</span>`:tl(r.o.price)}</span>${it.unit?`<br><span class="text-[11px] text-stone-500 tabular">${tl(r.o.price)}</span>`:""}</span></div></div>`}).join("")}</div>
  <button data-add="${esc(it.key)}" class="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold ${inC?"bg-stone-100 dark:bg-stone-800":"bg-emerald-600 hover:bg-emerald-700 text-white"}"><i data-lucide="${inC?"check":"plus"}" class="w-4 h-4"></i>${inC?"Listede · çıkar":"Listeye ekle → "+M[it.win.market].n}</button></article>`}
function drawC(){ensureCMP();
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
    if(at[k]==null){at[k]=out.length;out.push({...it,id:"bim:"+k,images:[it.image],thumbs:[it.thumb||it.image],src:[it.id]})}
    else{const g=out[at[k]];g.images.push(it.image);g.thumbs.push(it.thumb||it.image);g.src.push(it.id)}});
  return out}
function groupSok(list){
  const key=it=>it.market!=="sok"?null:String(it.url||"").replace(/^https:\/\/www\.sokmarket\.com\.tr\//,"").replace(/-prm-.*$/,"").replace(/\d+/g,"#");
  const groups={},done=new Set(),out=[];
  list.forEach(it=>{const k=key(it);if(k)(groups[k]=groups[k]||[]).push(it)});
  list.forEach(it=>{const k=key(it);if(!k||groups[k].length<2){out.push(it);return}
    if(done.has(k))return;done.add(k);const g=groups[k],[title,label]=SOK_GROUPS[k]||[g[0].title,g[0].label];
    out.push({market:"sok",id:"sok:grup:"+k.replace(/#/g,"n"),title,label,group:"Kampanya",image:g[0].image,images:g.map(x=>x.image),
      thumb:"",collage:true,url:"https://www.sokmarket.com.tr/kampanyalar",ids:[...new Set(g.flatMap(x=>x.ids||[]))],parts:g.length,src:g.map(x=>x.id)})});
  return out}
// Birden çok görselli kampanyada kapak: ilk dört görselden kolaj
const coverImg=(it,cls)=>it.collage
  ?`<div class="grid grid-cols-2 gap-px bg-stone-200 w-full h-full">${it.images.slice(0,4).map(u=>`<img src="${esc(u)}" alt="" loading="lazy" class="w-full h-full object-cover" onerror="this.style.visibility='hidden'">`).join("")}</div>`
  :`<img src="${esc(it.thumb||it.image)}" alt="" ${EAGER>0&&EAGER--?'fetchpriority="high"':'loading="lazy"'} class="${cls}" onerror="this.closest('button').remove()">`;
const isCamp=it=>it&&Array.isArray(it.ids)&&it.ids.some(id=>OI[id]);
const campKey=it=>it.slug||it.id;
let EAGER=0; // ana sayfa rafındaki ilk görseller tembel yüklenmez (ilk ekranın en büyük görseli)
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
      <p class="mt-auto pt-1 text-[11px] text-stone-500 flex items-center justify-between gap-1"><span class="truncate">${esc([it.label,n].filter(Boolean).join(" · "))}</span><span class="font-extrabold ${mg?"text-orange-700":"text-yellow-700"} shrink-0">Gör ›</span></p></div></button>`}
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
// Bildirimden gelen adres tek bir afişin kimliğini taşır (gruplanmış BİM/Şok afişleri, Migros "migros:<slug>")
const findPoster=k=>POST.find(x=>campKey(x)===k||x.id===k||(x.src||[]).includes(k));
function drawCamp(){
  let it=POST.find(x=>campKey(x)===CAMP);
  if(!it&&O.length){const f=findPoster(CAMP);
    if(f&&isCamp(f)){CAMP=campKey(f);it=f;history.replaceState(null,"","#afis/"+encodeURIComponent(CAMP))}
    else if(f){const i=POST.indexOf(f);go("posters");openViewer(i,Math.max(0,(f.src||[]).indexOf(CAMP)));return}}
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
    out.push(`<div class="slide s-red"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Günün fırsatları</p><h2 class="slide-h">%${mx}'e varan indirim</h2><p>${num(deals.length)} üründe indirim. Hepsi tek yerde.</p></div><button data-go="deals" class="cta relative z-10">İndirimleri gör<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(deals.slice(0,12).filter((o,i)=>i%3===0))}</div></div>`)}
  // Bedava ürünlü kampanyalar önce (1 Alana 1 Bedava, 2 Al 1 Öde), sonra kazanca göre
  const multi=PROMO.filter(o=>o._promo.kind==="multi").sort((a,b)=>(b._promo.sub==="free")-(a._promo.sub==="free")||gain(b)-gain(a));
  const freeN=multi.filter(o=>o._promo.sub==="free").length,alana=multi.filter(o=>/bedava/i.test(o._promo.label)).length;
  if(multi.length)out.push(`<div class="slide s-violet"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Bedava ürünlü kampanyalar</p><h2 class="slide-h">${alana?"1 Alana 1 Bedava":"2 Al 1 Öde"} ve dahası</h2><p>${num(freeN)} üründe bedava ürün kazanırsın${alana?` · ${alana} tanesi “1 Alana 1 Bedava”`:""}. Tane fiyatını hesapladık.</p></div><button data-view="promos" data-plain="1" class="cta relative z-10">Bedavaları gör<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(multi)}</div></div>`);
  const water=!WARM?null:WATER!==undefined?WATER:(WATER=MF.unitCompare(st,"su"));
  if(water){const b=water.best;out.push(`<div class="slide s-blue"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Birim fiyat</p><h2 class="slide-h">Suyun litresi en ucuz nerede?</h2><p>${esc(b.o.name)} · ${M[b.o.market].at} <b>${tl(b.u.v)}/L</b></p></div><button data-uq="su" class="cta relative z-10">Boy boy karşılaştır<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(water.top.map(h=>h.o))}</div></div>`)}
  const wins={};CMP.staple.forEach(it=>{if(it.diff>=0.005)wins[it.win.market]=(wins[it.win.market]||0)+1});
  const top=Object.keys(wins).sort((a,b)=>wins[b]-wins[a])[0];
  if(top)out.push(`<div class="slide s-green"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">Temel ihtiyaçlar</p><h2 class="slide-h">${M[top].n} ${wins[top]} üründe en ucuz</h2><p>Süt, yağ, şeker, un… ${CMP.staple.length} temel üründe birim fiyat karşılaştırması.</p></div><button data-seg="staple" data-open="1" class="cta relative z-10">Kim ucuz?<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(CMP.staple.map(it=>it.win))}</div></div>`);
  const soon=O.filter(o=>o.na==="soon");
  if(soon.length){const d=soon.map(o=>o.when.start).sort((a,b)=>a-b)[0];
    out.push(`<div class="slide s-amber"><div class="relative z-10"><p class="text-xs font-extrabold uppercase tracking-wider opacity-90">BİM aktüel</p><h2 class="slide-h">Yakında: ${d.toLocaleDateString("tr-TR",{day:"numeric",month:"long"})}</h2><p>${num(soon.length)} ürün satışa çıkmadan fiyatlarını gör.</p></div><button data-bm="bim" data-open="1" class="cta relative z-10">BİM ürünleri<i data-lucide="arrow-right" class="w-4 h-4"></i></button><div class="imgs">${pics(soon)}</div></div>`)}
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
// Ana sayfa afiş rafı: fiyat verisini beklemeden afiş dosyaları gelince çizilir (ilk görünen büyük görsel)
function drawPostShelf(){
  EAGER=3;  // Rafta marketler sırayla karışık: BİM afişi, Migros kampanyası, Şok kampanyası…
  const live=sortedPosters(),by={};
  live.forEach(it=>(by[it.market]=by[it.market]||[]).push(it));
  // Her turda: bir BİM afişi, alt alta iki Migros kampanyası (dikey afişle aynı boyda), bir Şok kampanyası
  const cols=[],take={},per={migros:2,sok:2};
  for(let r=0;cols.length<12&&Object.keys(by).some(m=>(take[m]||0)<by[m].length);r++)
    Object.keys(by).forEach(m=>{const n=per[m]||1,k=take[m]||0,part=by[m].slice(k,k+n);if(part.length&&cols.length<12){cols.push(part);take[m]=k+n}});
  $("hPost").innerHTML=cols.map((c,j)=>per[c[0].market]
    ?`<div class="${c[0].market==="migros"?"w-64":"w-44"} shrink-0 flex flex-col gap-2.5" style="--i:${j}">${c.map(it=>campMini(it)).join("")}</div>`
    :posterCard(c[0],POST.indexOf(c[0]),"w-40 shrink-0")).join("")+POSTER_LINKS.map(l=>linkCard(l,"w-44 shrink-0")).join("");
  EAGER=0;
}
// Ana sayfanın karşılaştırmaya bağlı bölümleri (tanıtım alanı, fiyat farkı rafı, temel ihtiyaçlar):
// ad çözümlemesi bitince yalnızca bunlar yenilenir.
function drawHCmp(st){
  const sl=slides(st);$("banner").innerHTML=sl.join("")||`<div class="slide s-green"><h2 class="slide-h">Market Fiyat</h2></div>`;slideI=0;$("banner").scrollLeft=0;startSlides();
  $("hCmp").innerHTML=CMP.same.filter(it=>it.diff>=1).sort((a,b)=>b.pct-a.pct).slice(0,14).map((it,i)=>`<article data-show="${esc(it.key)}" class="pc w-60 shrink-0" style="--i:${i}">
    <div class="flex gap-2 items-center"><div class="ph w-16 shrink-0">${it.image?`<img src="${esc(it.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:""}</div><p class="text-[13px] font-bold leading-snug max-h-[3.4rem] overflow-hidden">${esc(it.title)}</p></div>
    <div class="mt-2 space-y-1">${it.rows.map(r=>`<div class="flex items-center justify-between">${badge(r.o.market,1)}<span class="tabular text-sm font-extrabold ${r.o===it.win?good:"text-stone-400 line-through"}">${tl(r.o.price)}</span></div>`).join("")}</div>
    <p class="mt-2 chipx bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"><i data-lucide="piggy-bank" class="w-3.5 h-3.5"></i>${tl(it.diff)} tasarruf</p></article>`).join("")||`<p class="text-sm text-stone-500">Ortak ürün bulunamadı.</p>`;
  const wins={};CMP.staple.forEach(it=>{if(it.diff>=0.005)wins[it.win.market]=(wins[it.win.market]||0)+1});
  $("hStaple").innerHTML=CMP.staple.length?`<button data-seg="staple" data-open="1" class="pc w-full p-4 lg:p-5 text-left flex-row items-center gap-4">
    <span class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 grid place-items-center shrink-0"><i data-lucide="shopping-basket" class="w-6 h-6"></i></span>
    <span class="flex-1 min-w-0"><span class="block font-display font-extrabold text-lg">Temel ihtiyaçlarda kim ucuz?</span>
    <span class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm">${ORD.filter(m=>wins[m]).sort((a,b)=>wins[b]-wins[a]).map(m=>`<span>${badge(m,1)} <b class="tabular">${wins[m]}</b> üründe</span>`).join("")}</span></span>
    <i data-lucide="chevron-right" class="w-5 h-5 text-stone-400"></i></button>`:"";
}
function drawH(){
  if(!O.length)return; // veri gelene kadar iskelet kartlar kalır
  const st=O.filter(usable);
  drawHCmp(st);
  $("cats").innerHTML=GROUPS.map(([k,l,ic,bg,fg])=>`<button data-grp="${k}" class="cat"><span class="ic" style="background:${bg};color:${fg}"><i data-lucide="${ic}" class="w-7 h-7"></i></span>${l}</button>`).join("");
  $("deals").innerHTML=st.filter(o=>disc(o)>0).sort((a,b)=>disc(b)-disc(a)).slice(0,20).map((o,i)=>pcard(o,{strip:1,i})).join("")||`<p class="text-sm text-stone-500">Şu an indirim görünmüyor.</p>`;
  drawPostShelf();drawHDrops();
  $("units").innerHTML=UNIT_Q.map(([q,l,ic])=>`<button data-uq="${esc(q)}" class="uchip"><i data-lucide="${ic}" class="w-4 h-4 text-emerald-600"></i>${l}</button>`).join("");
  $("stores").innerHTML=DATA_M.filter(m=>O.some(o=>o.market===m)).map(m=>{const n=st.filter(o=>o.market===m),d=n.filter(o=>disc(o)>0).length,s=CHECK[m],failed=s&&s.status!=="tamam"&&!s.partial,part=s&&s.partial;
    return`<button data-bm="${m}" data-open="1" class="store st-${m}"><span class="font-display font-extrabold text-lg lg:text-2xl">${M[m].n}</span>
      <span class="block text-xs lg:text-sm font-bold mt-1 tabular opacity-95">${num(n.length)} ürün</span><span class="block text-xs lg:text-sm font-extrabold tabular">${num(d)} indirim</span>
      <span class="block text-[10px] mt-1 opacity-90">${UPD[m]?"Veri: "+MFC.ago(MFC.toTs(UPD[m])):""}${failed?" · ⚠ son deneme başarısız":part?" · kısmen güncellendi":""}</span></button>`}).join("");
  $("hPromo").innerHTML=PROMO.filter(o=>o._promo.kind==="multi").sort((a,b)=>(b._promo.sub==="free")-(a._promo.sub==="free")||(/bedava/i.test(b._promo.label))-(/bedava/i.test(a._promo.label))||gain(b)-gain(a)).slice(0,16).map((o,i)=>pcard(o,{strip:1,i})).join("")||`<p class="text-sm text-stone-500">Kampanya verisi bir sonraki güncellemede gelir.</p>`;
  const r=uniq(cart).slice(-4).reverse();
  $("recent").innerHTML=r.length?`<div class="pc px-4 py-1 ${div}">`+r.map(g=>{const b=best(g);
    return`<div data-show="${esc(g.key)}" class="flex items-center gap-3 py-3">${img(g.image,"w-11 h-11 shrink-0")}<span class="flex-1 text-sm font-bold">${esc(g.name)}</span>${b?badge(b.market,1)+`<span class="price text-base tabular">${tl(b.price)}</span>`:chip("Tükendi","bg-stone-200 text-stone-600")}</div>`}).join("")+`</div>`
    :empty("shopping-cart","Listen boş","Ürünlerdeki yeşil + düğmesiyle ekle; en ucuz markete göre gruplanır.");
  $("upd").textContent=updated?"Güncel: "+new Date(updated).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"-"}

// ---------- Veri durumu (#veri): her market için tarama, indirim kontrolü ve son başarılı veri ayrı ayrı ----------
// Başarısız ya da kısmi tarama başarılı gibi gösterilmez; eski veri gizlenmez, yaşıyla birlikte yazılır.
const MODE_L={full:"Tam katalog taraması",deals:"İndirim kontrolü",aktuel:"Aktüel ve indirim taraması"};
function health(m){
  const s=CHECK[m];if(!s)return{k:"none",l:"Durum dosyası okunamadı",c:"bg-stone-200 text-stone-700"};
  const age=(Date.now()/1000-MFC.toTs(s.last_successful_data_at||s.data_updated||UPD[m]))/3600,
    modes=Object.values(s.last_attempt_by_mode||{}),bad=modes.filter(a=>a.status!=="tamam");
  if(!(age<MFC.STALE_HOURS))return{k:"old",l:"Veri eski",c:"bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200"};
  if(bad.length)return{k:"warn",l:"Son taramalardan biri tamamlanamadı",c:"bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"};
  if((s.quality_warnings||[]).length)return{k:"warn",l:"Kalite uyarısı var",c:"bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"};
  return{k:"ok",l:"Sağlıklı",c:"bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"}}
const when=t=>t?new Date(t).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})+" · "+MFC.ago(MFC.toTs(t)):"bilinmiyor";
function attemptRow(mode,a){
  const ok=a.status==="tamam",part=!ok&&a.partial!==false&&a.found>0;
  const tag=ok?chip("Tamamlandı","bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200"):chip(part?"Kısmi":"Başarısız","bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200");
  const cnt=mode==="full"||mode==="aktuel"?`${num(a.found)} / ${num(a.total)} ürün okundu`:`${num(a.found)} indirimli ürün okundu`;
  return`<div class="py-3"><div class="flex items-center gap-2 flex-wrap"><span class="font-bold text-sm">${MODE_L[mode]||esc(mode)}</span>${tag}</div>
    <p class="text-xs text-stone-600 dark:text-stone-300 mt-1 tabular">${when(a.checked_at)} · ${cnt}${a.seconds?` · ${Math.round(a.seconds/60)||1} dk`:""}</p>
    ${ok?"":`<p class="text-xs text-amber-800 dark:text-amber-300 mt-1">${esc(a.status)}. Önceki sağlam veri korunuyor; bu denemenin eksik sonucu tam veri gibi yayımlanmadı.</p>`}</div>`}
function drawV(){
  const el=$("status");
  if(!Object.keys(CHECK).length){el.innerHTML=`<h1 class="page-title">Veri durumu</h1><div class="skel h-40 rounded-2xl mt-4"></div>`;return}
  const cards=DATA_M.map(m=>{const s=CHECK[m]||{},h=health(m),rows=O.filter(o=>o.market===m),st=rows.filter(o=>o.in_stock&&!o.na),
      stale=rows.filter(o=>o.stale).length,dq=s.data_quality||{},bad=Object.values(dq).reduce((a,b)=>a+(+b||0),0),
      modes=Object.entries(s.last_attempt_by_mode||{}).sort(([a],[b])=>(a==="full")-(b==="full")),warn=[...(s.quality_warnings||[]),...(s.errors||[])],
      tr=Object.values(s.traffic||{})[0];
    return`<section class="pc !p-4 lg:!p-5"><div class="flex items-center gap-2 flex-wrap">${badge(m,1)}<span class="font-display font-extrabold text-lg">${M[m].n}</span><span class="ml-auto">${chip(h.l,h.c)}</span></div>
      <dl class="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 text-sm">
        <div><dt class="text-xs text-stone-600 dark:text-stone-300">Son başarılı veri</dt><dd class="font-bold tabular">${when(s.last_successful_data_at||UPD[m])}</dd></div>
        <div><dt class="text-xs text-stone-600 dark:text-stone-300">Sitede gösterilen</dt><dd class="font-bold tabular">${num(rows.length)} ürün · ${num(st.length)} stokta</dd></div>
        <div><dt class="text-xs text-stone-600 dark:text-stone-300">${MFC.STALE_HOURS} saatten eski fiyat</dt><dd class="font-bold tabular">${rows.length?"%"+Math.round(stale/rows.length*100):"-"} <span class="font-normal text-xs">(${num(stale)})</span></dd></div>
        <div><dt class="text-xs text-stone-600 dark:text-stone-300">Hatalı kayıt (ayıklandı)</dt><dd class="font-bold tabular">${num(bad)}</dd></div>
        <div><dt class="text-xs text-stone-600 dark:text-stone-300">Afişler son değişti</dt><dd class="font-bold tabular">${PUPD[m]?when(PUPD[m]):"-"}</dd></div>
        <div><dt class="text-xs text-stone-600 dark:text-stone-300">Son çalışmadaki istek</dt><dd class="font-bold tabular">${tr?`${num(tr.requests)} istek · ${tr.megabytes} MB`:"-"}</dd></div>
      </dl>
      <div class="${div} mt-2 border-t border-stone-200 dark:border-stone-700">${modes.map(([k,a])=>attemptRow(k,a)).join("")}</div>
      ${warn.length?`<ul class="mt-1 text-xs text-amber-800 dark:text-amber-300 list-disc pl-5">${warn.slice(0,6).map(w=>`<li>${esc(typeof w==="string"?w:JSON.stringify(w))}</li>`).join("")}</ul>`:""}
      ${(s.notes||[]).length?`<details class="mt-2 text-xs text-stone-600 dark:text-stone-300"><summary class="cursor-pointer font-bold">Son çalışmanın notları (${s.notes.length})</summary><ul class="list-disc pl-5 mt-1 space-y-0.5">${s.notes.map(n=>`<li>${esc(n)}</li>`).join("")}</ul></details>`:""}
    </section>`}).join("");
  el.innerHTML=`<h1 class="page-title">Veri durumu</h1>
    <p class="text-sm text-stone-600 dark:text-stone-300 mt-1 mb-4">Fiyatlar marketlerin herkese açık sitelerinden GitHub üzerinde düzenli okunur. Başarısız ya da yarım kalan bir tarama mevcut veriyi silmez; burada olduğu gibi gösterilir.</p>
    <div class="grid gap-3 lg:grid-cols-3 items-start">${cards}</div>
    <section class="pc !p-4 mt-3 text-sm"><div class="flex items-center gap-2">${badge("a101",1)}<span class="font-display font-extrabold text-lg">A101</span><span class="ml-auto">${chip("Veri yok","bg-stone-200 text-stone-700 dark:bg-stone-800 dark:text-stone-200")}</span></div>
      <p class="mt-2 text-stone-600 dark:text-stone-300">A101'in izin verilmiş bir veri kaynağı yok; sitesi otomatik erişime kapalı. Fiyat üretilmez, yalnızca resmi siteye bağlantı verilir.</p>
      <a class="inline-flex items-center gap-1 mt-2 font-bold text-emerald-700 dark:text-emerald-400" href="https://www.a101.com.tr/" target="_blank" rel="noopener">A101 sitesine git<i data-lucide="external-link" class="w-4 h-4"></i></a></section>`}

// ---------- Birim fiyat karşılaştırması ----------
function unitPanel(q){
  const r=MF.unitCompare(O.filter(o=>usable(o)&&(!S.m.length||S.m.includes(o.market))),q);if(!r)return"";
  const u=r.unit,b=r.best,max=Math.max(...r.sizes.map(s=>s.best.u.v));
  return`<section class="pc p-4 lg:p-5 col-span-full enter">
    <div class="flex items-center gap-2"><span class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 grid place-items-center"><i data-lucide="ruler" class="w-5 h-5"></i></span>
      <div><h2 class="font-display font-extrabold text-lg leading-tight">“${esc(q)}” birim fiyat karşılaştırması</h2><p class="text-xs text-stone-500">${num(r.count)} ürün · marka fark etmeksizin ${u==="adet"?"adet":"1 "+u} fiyatına göre${r.dropped?` · ilgisiz görünen ${r.dropped} ürün hariç`:""}</p></div></div>
    <button data-show="${esc((GI[b.o.id]||{}).key||b.o.id)}" class="uwin w-full text-left mt-3 flex items-center gap-3">
      <div class="w-16 h-16 rounded-2xl bg-white grid place-items-center shrink-0 relative z-10">${b.o.image?`<img src="${esc(b.o.image)}" alt="" class="w-14 h-14 object-contain">`:""}</div>
      <div class="min-w-0 relative z-10"><p class="text-[11px] font-extrabold uppercase tracking-wider text-emerald-100 flex items-center gap-1"><i data-lucide="trophy" class="w-3.5 h-3.5"></i>${u==="adet"?"Adedi":u==="kg"?"Kilosu":"Litresi"} en ucuz</p>
      <p class="font-bold leading-snug">${esc(b.o.name)}</p><p class="text-sm"><span class="font-display font-extrabold text-xl">${tl(b.u.v)}/${u}</span> · ${M[b.o.market].at} ${tl(b.o.price)}</p></div></button>
    <p class="mt-4 mb-2 text-sm font-extrabold">Boy boy en ucuzlar <span class="text-stone-400 font-bold">· dokun, o boydaki tüm markalar</span></p>
    <div class="space-y-1.5">${(UOPEN?r.sizes:r.sizes.slice(0,4)).map((s,i)=>{const h=s.best,w=h===b,key=q+"|"+s.label,open=USIZE===key;
      return`<div data-usize="${esc(key)}" class="urow cursor-pointer ${w?"ring-2 ring-emerald-500":""} ${open?"!rounded-b-none":""}">
        <span class="fill" style="width:${Math.max(8,h.u.v/max*100)}%;animation-delay:${i*50}ms;${w?"background:#a7f3d0":""}"></span>
        <div class="relative flex items-center gap-2"><span class="w-[5.4rem] shrink-0 font-display font-extrabold text-[13px] leading-tight">${esc(s.label)}</span>
          <span class="flex-1 min-w-0"><span class="block text-xs font-semibold truncate">${esc(h.o.name)}</span><span class="text-[11px] text-stone-500">${badge(h.o.market,1)} ${tl(h.o.price)}${s.count>1?` · ${s.count} seçenek`:""}</span></span>
          <span class="text-right shrink-0 tabular font-extrabold ${w?good:""}">${tl(h.u.v)}<span class="text-[11px] font-bold">/${u}</span></span>
          ${s.count>1?`<i data-lucide="${open?"chevron-up":"chevron-down"}" class="w-4 h-4 shrink-0 text-stone-500"></i>`:""}</div></div>${open?sizeBrands(s,u):""}`}).join("")}</div>
    ${r.sizes.length>4?`<button data-uopen class="mt-2 w-full py-2.5 rounded-xl bg-stone-100 dark:bg-stone-800 text-sm font-extrabold flex items-center justify-center gap-1 active:scale-[.98] transition">${UOPEN?"Daha az göster":`Tüm boyları göster (${r.sizes.length})`}<i data-lucide="${UOPEN?"chevron-up":"chevron-down"}" class="w-4 h-4"></i></button>`:""}
  </section>`}

// Bir boydaki tüm markalar ve marketler: birim fiyata göre, her satırda listeye ekleme
function sizeBrands(s,u){
  const seen=new Set(),rows=s.items.filter(h=>{const k=(GI[h.o.id]||{}).key||h.o.id;if(seen.has(k+h.o.market))return false;seen.add(k+h.o.market);return true});
  const SHOW=20,more=rows.length-SHOW;
  return`<div class="enter rounded-b-2xl bg-white ring-1 ring-stone-200 -mt-1.5 px-3 pb-1 ${div}">${rows.slice(0,SHOW).map((h,i)=>{const g=GI[h.o.id],key=g?g.key:h.o.id,inC=g&&inCart(g);
    return`<div class="flex items-center gap-2.5 py-2">${img(h.o.image,"w-11 h-11 shrink-0")}
      <div data-show="${esc(key)}" class="flex-1 min-w-0 cursor-pointer"><p class="text-[13px] font-bold leading-snug line-clamp-2">${i===0?`<span class="${good}">★ </span>`:""}${esc(h.o.name)}</p>
        <p class="text-[11px] text-stone-500 mt-0.5">${badge(h.o.market,1)} <span class="tabular">${tl(h.u.v)}/${u}</span>${disc(h.o)?` · <span class="text-red-600 font-bold">%${Math.round(disc(h.o)*100)} indirim</span>`:""}</p></div>
      <span class="price tabular text-[15px] shrink-0">${tl(h.o.price)}</span>
      ${g?`<button data-add="${esc(key)}" aria-label="${inC?"Listeden çıkar":"Listeye ekle"}" class="w-9 h-9 shrink-0 rounded-xl grid place-items-center ${inC?"bg-stone-200 text-stone-700":"bg-emerald-600 text-white"} active:scale-90 transition"><i data-lucide="${inC?"check":"plus"}" class="w-4 h-4"></i></button>`:""}</div>`}).join("")}
    ${more>0?`<p class="py-2 text-center text-xs text-stone-500">${more} ürün daha var; aramayı daraltabilirsin (ör. “${esc(s.label)}”).</p>`:""}</div>`}

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
// A101 ve Market Fiyatı (TÜBİTAK) için veri alınmaz; yalnızca bağlantı verilir. Ürün adı panoya kopyalanır,
// açılan sitenin arama kutusuna yapıştırılabilir.
function extLinks(g){
  const a=(href,l,sub)=>`<a href="${href}" target="_blank" rel="noopener" data-copyname="${esc(g.name)}" class="flex items-center gap-3 py-2.5"><span class="flex-1"><span class="block text-sm font-bold">${l}</span><span class="block text-[11px] text-stone-600">${sub}</span></span><i data-lucide="external-link" class="w-4 h-4 text-stone-500"></i></a>`;
  return`<section class="${card} px-4 py-1 mt-3 ${div}">${a("https://marketfiyati.org.tr/","Market Fiyatı'nda karşılaştır","TÜBİTAK sitesi; A101 ve diğer zincirler. Ürün adı panoya kopyalanır.")}${a("https://www.a101.com.tr/","A101'de bak","Bu uygulamada A101 fiyatı yok. Ürün adı panoya kopyalanır.")}</section>`}
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
      ${favBtns(g)}
      <div class="flex flex-wrap gap-1.5 mt-2">${av.length>1?`<span class="chipx bg-emerald-100 text-emerald-800">${av.length} markette var</span>`:""}${confChip(g)}${u?`<span class="chipx bg-stone-200 text-stone-700 tabular">${tl(u.v)}/${u.u}</span>`:""}</div>
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
          ${d&&ok&&HIST[o.market]&&HIST[o.market]!=="…"?(r=>r?`<p class="text-[11px] mt-1.5 ${r.observed==null?"text-stone-500":r.claimed-r.observed>=0.15?"text-amber-800":"text-stone-700"}">Market %${Math.round(r.claimed*100)} indirim diyor${r.observed==null?"; kayıtlı geçmiş bunu doğrulamaya yetmiyor.":` · kayıtlı geçmişte indirimden önce ${tl(r.prevPrice)} idi: gözlenen düşüş <b>%${Math.round(r.observed*100)}</b>`}</p>`:"")(MFI.realDiscount(HIST[o.market][o.id],o)):""}
          ${o._promo&&o._promo.kind!=="bim"&&ok?`<p class="text-xs mt-1.5 text-violet-700 dark:text-violet-300 font-semibold">${o._promo.kind==="multi"?promoChip(o)+" ":""}${promoLine(o)}</p>`:""}
          <p class="text-[13px] text-stone-600 dark:text-stone-300 mt-1 leading-snug">${esc(o.name)}${unitTxt(o)?` · <span class="tabular">${unitTxt(o)}</span>`:""}</p>
          <div class="flex items-center gap-2 mt-2 flex-wrap">${freshPill(o)}${o.url&&o.url.startsWith("https://")?`<a href="${esc(o.url)}" target="_blank" rel="noopener" class="chipx bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200">${M[o.market].n} sitesinde aç<i data-lucide="external-link" class="w-3 h-3"></i></a>`:""}</div>
          ${FRESH.has(o.id)?freshPanel(o)+`<p class="mt-1 text-[11px] text-stone-500">${checkLine(o)} · Depo sahibiyseniz: ${updBtn(o,"font-semibold underline")}</p>`:""}
          ${(h=>h&&(h.lastDisc||h.lastPromo)?`<p class="mt-1.5 text-[11px] text-stone-500">${[h.lastDisc?`Son indirim ${dshort(h.lastDisc.ts)}`:"",h.lastPromo?`son kampanya ${dshort(h.lastPromo.ts)}`:""].filter(Boolean).join(" · ")}</p>`:"")(HIST[o.market]&&HIST[o.market]!=="…"?MFC.histInfo(HIST[o.market][o.id],o):null)}
        </div>`}).join("")}</div>
      ${histCard(g)}
      ${similarCard(g)}
      ${sameSizeCard(g)}
      ${productInfo(g)}
      ${extLinks(g)}
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
  const gs=g=>g.s||(g.s=MFC.fold(g.offers.map(o=>o.brand?o.brand+" "+o.name:o.name).join(" ")).replace(/[^a-z0-9%]+/g," "));
  // Seçili marketlerdeki en ucuz teklif; süzgeçler (bölüm, indirim, kampanya, fiyat aralığı) bu teklife uygulanır
  const lo=S.min!==""?+S.min:null,hi=S.max!==""?+S.max:null;
  const bestIn=g=>avail(g).filter(o=>!S.m.length||S.m.includes(o.market)).reduce((a,o)=>!a||o.price<a.price?o:a,null);
  const pass=g=>{if(!nFilters())return true;const o=bestIn(g);if(!o)return false;
    return(!S.k||grpOf(o)===S.k)&&(!S.i||disc(o)>0)&&(!S.c||(o._promo&&o._promo.kind!=="bim"))&&(lo==null||o.price>=lo)&&(hi==null||o.price<=hi)};
  // Esnek eşleşme: eş anlamlı (tavuk/piliç), ses değişimi (göğüs/göğsü), birleşik yazım, yazım hatası
  if(!HAY){HAY=" "+G.map(gs).join(" ")+" ";VOCAB=new Map();for(const t of HAY.split(" "))if(t)VOCAB.set(t,(VOCAB.get(t)||0)+1)}
  const{plan,fixed}=MFC.queryPlan(w,VOCAB,HAY);
  let r=G.filter(g=>MFC.matchPlan(gs(g),plan)&&pass(g));
  const pick=g=>nFilters()?bestIn(g):best(g);
  const bp=g=>(pick(g)||{price:1e9}).price,up=g=>{const b=pick(g),u=b&&MF.unitPrice(b);return u?u.v:1e12};
  // Alaka: adda kelimenin nasıl geçtiği (MFC.searchScore) + bulunduğu market sayısı + satışta olması
  const rel=new Map(r.map(g=>[g,Math.max(...g.offers.map(o=>{const rw=MFC.resolvePlan(o.name,plan);
    return MFC.searchScore(o.name,o.cat,rw)-rw.filter((x,i)=>x!==w[i]).length*2}))+avail(g).length*0.6+(best(g)?1:0)]));
  // Baskın bölüm: en alakalı 40 sonucun çoğu hangi bölümdeyse (yumurta → kahvaltılık, pirinç → temel gıda)
  // o bölümdeki ürünler öne alınır; "Sürpriz Yumurta", "Pirinç Süzgeci" gibi başka bölümden adaşlar geriler.
  const top=[...r].sort((a,b)=>rel.get(b)-rel.get(a)).slice(0,40),cnt={};
  top.forEach(g=>{const k=grpOf(best(g)||g.offers[0]);if(k)cnt[k]=(cnt[k]||0)+1});
  const dom=Object.keys(cnt).sort((a,b)=>cnt[b]-cnt[a])[0];
  if(dom&&cnt[dom]>=top.length*0.3)r.forEach(g=>{if(grpOf(best(g)||g.offers[0])===dom)rel.set(g,rel.get(g)+6)});
  r.sort({rel:(a,b)=>rel.get(b)-rel.get(a),pa:(a,b)=>bp(a)-bp(b),unit:(a,b)=>up(a)-up(b),disc:(a,b)=>disc(pick(b)||{})-disc(pick(a)||{})}[S.sort]);
  const total=r.length;r=r.slice(0,60);
  const sorts=[["rel","Önerilen"],["pa","En ucuz"],["unit","Birim fiyat"],["disc","İndirim"]];
  const fixNote=fixed.length&&r.length?`<p class="col-span-full text-sm text-stone-600 -mb-1">“${esc(fixed.map(x=>x[0]).join(" "))}” bulunamadı; <b>${esc(fixed.map(x=>x[1]).join(", "))}</b> için sonuçlar gösteriliyor.</p>`:"";
  $("res").innerHTML=ban+fixNote+unitPanel(raw)+
    `<div class="col-span-full flex items-center gap-2 overflow-x-auto noscroll"><p class="text-sm font-bold shrink-0 mr-1">${num(total)} ürün</p>
      <button data-sfopen class="shrink-0 chipx !py-2 !px-3 ${nFilters()?"bg-emerald-700 text-white":"bg-white ring-1 ring-stone-300 text-stone-800"}"><i data-lucide="sliders-horizontal" class="w-4 h-4"></i>Süzgeç${nFilters()?` (${nFilters()})`:""}</button>
      ${sorts.map(([k,l])=>pill("data-ss",k,l,S.sort===k,"bg-emerald-600 text-white")).join("")}</div>`+filterPanel()+
    (r.length?`<div class="col-span-full grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 lg:gap-3 stagger">${r.map((g,i)=>pcard(pick(g)||g.offers[0],{i})).join("")}</div>`:empty("search-x","Sonuç bulunamadı",nFilters()?"Süzgeçleri gevşetmeyi dene.":"Başka bir kelime dene."))
    +(total>60?`<p class="col-span-full text-center text-sm text-stone-500">${num(total)} sonuçtan ilk 60'ı gösteriliyor. Aramayı daraltabilirsin.</p>`:"")}

function filterPanel(){
  if(!S.open)return"";
  const chip=(attr,on,label,cls)=>`<button ${attr} class="chipx !py-2 !px-3 ${on?(cls||"bg-emerald-700 text-white"):"bg-white ring-1 ring-stone-300 text-stone-800"}">${label}</button>`;
  return`<div class="col-span-full ${card} p-4 enter space-y-3">
    <div><p class="text-xs font-extrabold text-stone-700 mb-1.5">Market</p><div class="flex flex-wrap gap-2">${DATA_M.map(m=>chip(`data-sfm="${m}"`,S.m.includes(m),M[m].n,M[m].c)).join("")}</div></div>
    <label class="block text-xs font-extrabold text-stone-700">Bölüm<select data-sfk class="mt-1.5 w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 bg-white text-[15px] font-normal"><option value="">Tümü</option>${GROUPS.map(([k,l])=>`<option value="${k}" ${S.k===k?"selected":""}>${esc(l)}</option>`).join("")}</select></label>
    <div class="flex flex-wrap gap-2">${chip('data-sfi',S.i,"İndirimli")}${chip('data-sfc',S.c,"Kampanyalı")}</div>
    <div><p class="text-xs font-extrabold text-stone-700 mb-1.5">Fiyat aralığı (₺)</p><div class="flex items-center gap-2"><input data-sfmin inputmode="decimal" value="${esc(S.min)}" placeholder="en az" class="flex-1 min-w-0 rounded-xl ring-1 ring-stone-300 px-3 py-2.5 text-[15px]"><span>–</span><input data-sfmax inputmode="decimal" value="${esc(S.max)}" placeholder="en çok" class="flex-1 min-w-0 rounded-xl ring-1 ring-stone-300 px-3 py-2.5 text-[15px]"></div></div>
    <div class="flex gap-2">${nFilters()?`<button data-sfclear class="flex-1 rounded-xl ring-1 ring-stone-300 py-2.5 font-bold">Temizle</button>`:""}<button data-sfopen class="flex-1 rounded-xl bg-emerald-700 text-white py-2.5 font-extrabold">Sonuçları göster</button></div>
    <p class="text-[11px] text-stone-500">Süzgeçler adres çubuğuna yazılır; bağlantıyı paylaşınca aynı sonuçlar açılır.</p></div>`}

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

// Ürün sayfası: aynı boyda diğer markalar (pahalı ve ucuz hepsi, birim fiyata göre); bu ürün işaretli.
// Hiç yoksa benzer boylu (±%25) daha ucuz muadiller gösterilir.
// Diğer marketlerde benzerleri: grubun bulunmadığı her market için aynı tür, yakın boy, aynı bölümden
// en benzer iki ürün. Aynı ürün olmadıkları açıkça yazılır; birim fiyatla karşılaştırılır.
let SIX=null;
function similarCard(g){
  const b=best(g)||g.offers[0],u=b&&MF.unitPrice(b);if(!u)return"";
  if(!SIX)SIX=MF.typeIndex(O.filter(o=>usable(o)&&o.in_stock&&!o.na));
  const have=new Set(avail(g).map(o=>o.market)),res=MF.similarIn(SIX,b,{grp:grpOf}).filter(x=>!have.has(x.o.market)&&x.score>=0.15);
  const per={};for(const x of res){const og=GI[x.o.id];if(!og||og===g)continue;(per[x.o.market]=per[x.o.market]||[]);if(per[x.o.market].length<2)per[x.o.market].push({...x,g:og})}
  const ms=DATA_M.filter(m=>per[m]);if(!ms.length)return"";
  const tag=x=>x.u.v<u.v*0.995?`%${Math.round((1-x.u.v/u.v)*100)} ucuz`:x.u.v>u.v*1.005?`%${Math.round((x.u.v/u.v-1)*100)} pahalı`:"aynı";
  return`<div class="${card} p-4 mt-4 enter"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="shuffle" class="w-5 h-5 text-sky-600"></i>Diğer marketlerde benzerleri</h2>
    <p class="text-xs text-stone-500 mt-0.5">${ms.map(m=>M[m].n).join(", ")}'de bu ürünün aynısı bulunamadı. Aynı tür ve yakın boydaki ürünler; birim fiyatla karşılaştırıldı (${tl(u.v)}/${u.u}).</p>
    <div class="mt-2 ${div}">${ms.flatMap(m=>per[m]).map(x=>brandRow(x.o,x.g,x.u,tag(x))).join("")}</div></div>`}
function sameSizeCard(g){
  const b=best(g)||g.offers[0],u=b&&MF.unitPrice(b);
  const seen=new Set(),rows=[];
  if(u)for(const h of MF.sameSize(b,O.filter(o=>usable(o)&&o.in_stock))){const og=GI[h.o.id];if(!og||og===g||seen.has(og.key))continue;
    if(best(og)!==h.o)continue;seen.add(og.key);rows.push({o:h.o,g:og,u:h.u})}
  if(!rows.length){const alts=alternatives(g,3);if(!alts.length)return"";
    return`<div class="${card} p-4 mt-4 enter"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="arrow-down-wide-narrow" class="w-5 h-5 text-sky-600"></i>Daha ucuz muadiller</h2><p class="text-xs text-stone-500 mt-0.5">Aynı tür, benzer boy; birim fiyatı daha düşük.</p>
      <div class="mt-2 ${div}">${alts.map(a=>brandRow(a.o,a.g,MF.unitPrice(a.o),`%${Math.round(a.save*100)} ucuz`)).join("")}</div></div>`}
  const me={o:b,g,u,me:true},all=[...rows,me].sort((x,y)=>x.u.v-y.u.v),pos=all.indexOf(me),cheaper=pos,SHOW=10;
  const list=all.length>SHOW?[...all.slice(0,SHOW-1),...(pos>=SHOW-1?[me]:[])]:all;
  const sz=MF.sizeLabel(b._p.qty,b._p.size);
  return`<div class="${card} p-4 mt-4 enter"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="layers" class="w-5 h-5 text-sky-600"></i>Aynı boyda diğer markalar · ${esc(sz)}</h2>
    <p class="text-xs text-stone-500 mt-0.5">${num(rows.length)} seçenek daha var${cheaper?`; <b class="text-sky-700">${cheaper} tanesi daha ucuz</b>`:"; bu ürün birim fiyatta en ucuzu"}. Birim fiyata göre sıralı.</p>
    <div class="mt-2 ${div}">${list.map(x=>x.me?brandRow(x.o,x.g,x.u,"Bu ürün",true):brandRow(x.o,x.g,x.u,x.u.v<u.v-1e-9?`%${Math.round((1-x.u.v/u.v)*100)} ucuz`:x.u.v>u.v+1e-9?`%${Math.round((x.u.v/u.v-1)*100)} pahalı`:"aynı")).join("")}</div>
    ${all.length>list.length?`<p class="mt-1 text-[11px] text-stone-500">${all.length-list.length} seçenek daha; tümü için “${esc(sz)}” boyunu birim fiyat aramasında aç.</p>`:""}</div>`}
function brandRow(o,g,u,tag,me){const key=g?g.key:o.id,inC=g&&inCart(g),cheap=/ucuz/.test(tag);
  return`<div class="flex items-center gap-2.5 py-2 ${me?"bg-emerald-50 -mx-4 px-4":""}">${img(o.image,"w-11 h-11 shrink-0")}
    <div ${me?"":`data-show="${esc(key)}"`} class="flex-1 min-w-0 ${me?"":"cursor-pointer"}"><p class="text-[13px] font-bold leading-snug line-clamp-2">${esc(o.name)}</p>
      <p class="text-[11px] text-stone-500 mt-0.5">${badge(o.market,1)} <span class="tabular">${u?tl(u.v)+"/"+u.u:""}</span> · <span class="font-extrabold ${me?good:cheap?"text-sky-700":"text-stone-500"}">${esc(tag)}</span></p></div>
    <span class="price tabular text-[15px] shrink-0">${tl(o.price)}</span>
    ${me||!g?"":`<button data-add="${esc(key)}" aria-label="${inC?"Listeden çıkar":"Listeye ekle"}" class="w-9 h-9 shrink-0 rounded-xl grid place-items-center ${inC?"bg-stone-200 text-stone-700":"bg-emerald-600 text-white"} active:scale-90 transition"><i data-lucide="${inC?"check":"plus"}" class="w-4 h-4"></i></button>`}</div>`}

// ---------- Listem ----------
function drawL(){
  const items=uniq(cart);
  const open=NOTES.filter(n=>!n.d).length,units=totalUnits();["n","n2"].forEach(i=>{$(i).textContent=units+open;$(i).style.display=items.length||open?"grid":"none"});
  const noteBox=`<form data-noteform class="col-span-full flex gap-2"><input id="noteIn" maxlength="60" autocomplete="off" placeholder="Not ekle: ekmek, maydanoz…" class="flex-1 min-w-0 rounded-2xl px-4 py-3 bg-white ring-1 ring-stone-200 text-[15px] outline-none focus:ring-2 focus:ring-emerald-500"><button class="px-4 rounded-2xl bg-emerald-600 text-white font-bold active:scale-95 transition">Ekle</button></form>`;
  const notesHtml=NOTES.length?`<section class="${card} overflow-hidden enter"><div class="px-4 py-3 flex items-center justify-between bg-stone-700 text-white"><span class="font-display font-extrabold text-lg flex items-center gap-2"><i data-lucide="notebook-pen" class="w-5 h-5"></i>Notlar</span><span class="text-sm font-bold">${NOTES.filter(n=>n.d).length}/${NOTES.length} alındı</span></div>
    <div class="px-4 ${div}">${NOTES.map((n,i)=>`<div class="flex items-center gap-3 py-3 ${n.d?"opacity-50":""}"><button data-ndone="${i}" aria-label="Alındı" class="w-7 h-7 shrink-0 rounded-full grid place-items-center border-2 ${n.d?"bg-emerald-600 border-emerald-600 text-white":"border-stone-300"}">${n.d?'<i data-lucide="check" class="w-4 h-4"></i>':""}</button>
      <span class="flex-1 text-[15px] font-bold ${n.d?"line-through":""}">${esc(n.t)}</span><button data-nfind="${i}" class="text-xs font-bold text-emerald-700 flex items-center gap-1"><i data-lucide="search" class="w-3.5 h-3.5"></i>Fiyat bul</button><button data-ndel="${i}" aria-label="Sil" class="text-stone-400 p-1"><i data-lucide="x" class="w-4 h-4"></i></button></div>`).join("")}</div></section>`:"";
  if(!items.length){$("list").innerHTML=noteBox+notesHtml+`<div class="col-span-full">${empty("shopping-cart",NOTES.length?"Henüz ürün yok":"Listen boş","Ürünlerdeki yeşil + düğmesiyle ekle ya da yukarıya not yaz. Liste en ucuz markete göre gruplanır; mağazada aldıklarını işaretlersin.")}</div>`+savedPanel();return}
  let sum=0,max=0,h="",stops=0,got=0;const P=currentPlan(items),pick=P.pickOf;
  ORD.forEach(m=>{const it=items.filter(g=>(pick(g)||{}).market===m);if(!it.length)return;stops++;let t=0,dn=0;
    const rows=it.map(g=>{const b=pick(g),ok=!!done[g.key],q=qtyOf(g),lt=lineTotal(b,q),promoOn=lt<q*b.price-0.005;t+=lt;max+=worst(g)*q;if(ok){dn++;got++}
      const others=avail(g).filter(o=>o!==b);
      return`<div class="flex items-center gap-3 py-3 ${ok?"opacity-50":""} transition">
        <button data-done="${esc(g.key)}" aria-label="Alındı" class="w-7 h-7 shrink-0 rounded-full grid place-items-center border-2 ${ok?"bg-emerald-600 border-emerald-600 text-white":"border-stone-300"} transition active:scale-90">${ok?'<i data-lucide="check" class="w-4 h-4"></i>':""}</button>
        ${img(g.image,"w-12 h-12 shrink-0")}
        <div data-show="${esc(g.key)}" class="flex-1 min-w-0"><p class="text-sm font-bold leading-snug ${ok?"line-through":""}">${esc(b.name)}</p>
          ${b._promo&&b._promo.kind!=="bim"?`<p class="text-[11px] text-violet-700 dark:text-violet-300 mt-0.5">${promoLine(b)}</p>`:""}
          ${promoOn?`<p class="text-[11px] font-extrabold text-violet-700">✓ Kampanya uygulandı: ${tl(q*b.price-lt)} indirim</p>`:b._promo&&b._promo.kind==="multi"&&q<b._promo.need?`<p class="text-[11px] font-bold text-violet-700">${b._promo.need-q} tane daha eklersen kampanya geçerli</p>`:""}
          ${(worst(g)-b.price)*q>0.005?`<p class="text-[11px] ${good} font-bold">${tl((worst(g)-b.price)*q)} tasarruf</p>`:""}
          ${!ok&&others.length?`<div class="mt-1 flex flex-wrap gap-1">${others.map(o=>`<button data-fix="${esc(g.key)}" data-m="${o.market}" class="text-[11px] font-bold rounded-full px-2 py-0.5 ring-1 ring-stone-300 text-stone-700 bg-white">${M[o.market].n} ${tl(lineTotal(o,q))}</button>`).join("")}${FIX[g.key]?`<button data-fix="${esc(g.key)}" data-m="" class="text-[11px] font-bold rounded-full px-2 py-0.5 text-emerald-800 underline">Otomatik seç</button>`:""}</div>`:""}
          ${ok?"":(a=>a?`<div class="mt-1.5 rounded-xl bg-sky-50 ring-1 ring-sky-200 px-2.5 py-1.5 text-[11px] leading-snug"><span class="font-bold text-sky-800">Muadili %${Math.round(a.save*100)} ucuz:</span> <span data-show="${esc(a.g.key)}" class="underline">${esc(a.o.name)}</span> · ${M[a.o.market].n} ${tl(a.o.price)} <button data-swap="${esc(g.key)}" data-to="${esc(a.g.key)}" class="ml-1 font-extrabold text-sky-700">Değiştir ›</button></div>`:"")(alternatives(g,1)[0])}</div>
        <div class="flex flex-col items-end gap-1.5 shrink-0"><span class="price tabular text-base">${tl(lt)}</span>${q>1?`<span class="text-[11px] text-stone-500 tabular -mt-1">${q} × ${tl(b.price)}</span>`:""}${stepper(g,"sm")}</div></div>`}).join("");
    h+=`<section class="${card} overflow-hidden enter"><div class="px-4 py-3 flex items-center justify-between st-${m} text-white"><span class="font-display font-extrabold text-lg flex items-center gap-2"><span class="bg-black/20 rounded-full w-7 h-7 grid place-items-center text-sm">${stops}</span>${M[m].n}</span><span class="text-sm font-bold">${dn}/${it.length} alındı</span></div>
      <div class="px-4 ${div}">${rows}</div><div class="px-4 py-3 bg-stone-50 dark:bg-stone-800/50 flex justify-between font-bold"><span>Ara toplam</span><span class="price tabular">${tl(t)}</span></div></section>`;sum+=t});
  const out=items.filter(g=>!pick(g));
  if(out.length)h+=`<section class="${card} overflow-hidden"><div class="bg-stone-300 dark:bg-stone-700 px-4 py-3 font-extrabold">${out.some(g=>best(g))?"Bu planda alınamayanlar":"Şu an alınamayanlar"}</div><div class="px-4 ${div}">${out.map(g=>`<div class="flex items-center gap-3 py-3">${img(g.image,"w-10 h-10 shrink-0")}<span data-show="${esc(g.key)}" class="flex-1 text-sm">${esc(g.name)}</span><button data-add="${esc(g.key)}" class="text-stone-400 p-1"><i data-lucide="x" class="w-4 h-4"></i></button></div>`).join("")}</div></section>`;
  const pctDone=Math.round(got/items.length*100);
  $("list").innerHTML=`<div class="col-span-full rounded-[24px] p-5 text-white relative overflow-hidden" style="background:linear-gradient(135deg,#047857,#0d9488)">
    <p class="text-emerald-100 text-sm font-bold">Alışveriş listem · ${items.length} çeşit · ${units} adet · ${stops} market</p>
    <p class="font-display font-extrabold text-4xl tabular mt-1">${tl(sum)}</p>
    ${max-sum>0.005?`<p class="mt-1 text-sm font-bold"><span class="text-amber-300">${tl(max-sum)} kazancın</span> · market farkı ve kampanyalar sayesinde (kampanyasız, en pahalı markette ${tl(max)})</p>`:""}
    <div class="mt-4 h-2.5 rounded-full bg-white/20 overflow-hidden"><div class="h-full rounded-full bg-amber-300 transition-all duration-500" style="width:${pctDone}%"></div></div>
    <div class="mt-2 flex items-center justify-between text-xs font-bold"><span>${got}/${items.length} ürün alındı</span>${got?`<button data-undone class="underline">İşaretleri sıfırla</button>`:""}</div>
    <div class="relative z-10 mt-4 grid grid-cols-2 gap-2"><button data-share class="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white text-emerald-800 font-extrabold active:scale-95 transition"><i data-lucide="share-2" class="w-5 h-5"></i>Paylaş</button>
      <button data-pdf class="flex items-center justify-center gap-2 py-3 rounded-2xl bg-white/15 ring-1 ring-white/40 text-white font-extrabold active:scale-95 transition"><i data-lucide="file-down" class="w-5 h-5"></i>PDF aktar</button></div>
    <span class="absolute -right-10 -top-10 w-40 h-40 rounded-full bg-white/10"></span></div>`+planPanel(P,items.length)+noteBox+h+notesHtml+savedPanel()}

// ---------- Fiyat analizi ----------
// Tüm marketlerin fiyat geçmişi yüklenince her ürün için 7/30 günlük değişim, son değişim, 30 günün en
// düşüğü hesaplanır (MFI). Geçmişi olmayan ürün için değer üretilmez.
let INS=null,INS_P=null;
function loadAllHist(){DATA_M.forEach(m=>loadHist(m));return new Promise(r=>{const w=()=>DATA_M.every(m=>HIST[m]&&HIST[m]!=="…")?r():setTimeout(w,300);w()})}
function insights(){
  if(INS)return Promise.resolve(INS);
  // Tüm ürünlerin geçmiş istatistiği boşta, küçük parçalar halinde hesaplanır (ana iş parçacığını kilitlemez)
  return INS_P||(INS_P=loadAllHist().then(()=>new Promise(res=>{const now=Math.floor(Date.now()/1000),rows=[];let i=0;
    const step=dl=>{const end=performance.now()+((dl&&dl.timeRemaining&&dl.timeRemaining())||12);
      while(i<O.length&&performance.now()<end){const o=O[i++];if(!usable(o))continue;const h=HIST[o.market][o.id];if(!h)continue;const st=MFI.stats(h,o,now);if(st&&st.points>=2)rows.push({o,st})}
      if(i<O.length)idle(step);else{INS={rows,since:Math.min(...DATA_M.map(m=>HSINCE[m]||now)),now};res(INS)}};
    idle(step)})))}
// Dönem: takip 7 günü doldurduysa son 7 gün, dolmadıysa takip başlangıcından bugüne
const PK=()=>INS&&(INS.now-INS.since)>=7*86400?"d7":"dAll";
const PLABEL=()=>PK()==="d7"?"7 gün":`takip başından beri (${Math.max(1,Math.round((INS.now-INS.since)/86400))} gün)`;
function dropRow(x,period){const c=period==="last"?x.st.last:x.st[period],g=GI[x.o.id];
  return`<div data-show="${esc(g?g.key:x.o.id)}" class="flex items-center gap-3 py-2.5 cursor-pointer">${img(x.o.image,"w-11 h-11 shrink-0")}
    <div class="flex-1 min-w-0"><p class="text-[13px] font-bold leading-snug line-clamp-2">${esc(x.o.name)}</p><p class="text-[11px] text-stone-600 mt-0.5">${badge(x.o.market,1)} <span class="tabular">${tl(c.from)} → ${tl(c.to)}</span>${c.ts?` · ${dshort(c.ts)}`:""}</p></div>
    <span class="tabular font-extrabold text-sm shrink-0 ${c.pct<0?good:"text-red-700"}">${c.pct<0?"−":"+"}%${Math.abs(Math.round(c.pct*100))}</span></div>`}
function drawHDrops(){
  if(!INS){if(WARM)insights().then(()=>{if(view==="home"){drawHDrops();icons()}});return} // açılışta: ısınma bitince
  const k=PK(),d=INS.rows.filter(x=>x.st[k]&&x.st[k].pct<=-0.05).sort((a,b)=>a.st[k].pct-b.st[k].pct);
  $("hDrops").classList.toggle("hidden",!d.length);if(!d.length)return;
  $("hDropsSub").textContent=`${k==="d7"?"Son 7 günde":"Fiyat takibi başladığından beri"} ${num(d.length)} üründe fiyat en az %5 düştü (kayıtlı geçmişe göre).`;
  $("hDropsList").innerHTML=d.slice(0,14).map((x,i)=>{const g=GI[x.o.id];return`<article data-show="${esc(g?g.key:x.o.id)}" class="pc w-44 shrink-0" style="--i:${i}">
    <div class="ph">${x.o.image?`<img src="${esc(x.o.image)}" alt="" loading="lazy" onerror="this.style.visibility='hidden'">`:""}</div>
    <p class="text-[13px] font-bold leading-snug line-clamp-2 mt-1">${esc(x.o.name)}</p>
    <p class="mt-1 flex items-center gap-1.5">${badge(x.o.market,1)}<span class="text-xs text-stone-500 line-through tabular">${tl(x.st[k].from)}</span></p>
    <p class="flex items-baseline justify-between"><span class="price tabular text-lg">${tl(x.o.price)}</span><span class="text-xs font-extrabold ${good}">−%${Math.abs(Math.round(x.st[k].pct*100))}</span></p></article>`}).join("");icons()}
function drawA(){
  const el=$("analysis");
  if(!INS){el.innerHTML=`<h1 class="page-title">Fiyat analizi</h1><div class="skel h-40 rounded-2xl mt-4"></div>`;insights().then(()=>{if(view==="analysis")redraw()});return}
  const R=INS.rows,days=Math.max(1,Math.round((INS.now-INS.since)/86400));
  const k=PK(),drop7=R.filter(x=>x.st[k]&&x.st[k].pct<=-0.005).sort((a,b)=>a.st[k].pct-b.st[k].pct);
  const up7=R.filter(x=>x.st[k]&&x.st[k].pct>=0.005).sort((a,b)=>b.st[k].pct-a.st[k].pct);
  const has30=R.some(x=>x.st.d30);
  const lows=R.filter(x=>x.st.atLow30).sort((a,b)=>(a.st.price/a.st.high30)-(b.st.price/b.st.high30));
  const rd=O.filter(o=>usable(o)&&o.regular>o.price+0.005&&HIST[o.market][o.id]).map(o=>({o,r:MFI.realDiscount(HIST[o.market][o.id],o,INS.now)}));
  // Gerçek fırsat: kayıtlı geçmişte gözlenen düşüş en az %10
  const real=rd.filter(x=>x.r&&x.r.observed>=0.1).sort((a,b)=>b.r.observed-a.r.observed);
  const fake=rd.filter(x=>x.r&&x.r.observed!=null&&x.r.claimed-x.r.observed>=0.15).length;
  const ms=DATA_M.filter(m=>O.some(o=>o.market===m)),bi=MFI.basketIndex(MF.staples(O.filter(usable)),ms);
  const lo=Math.min(...ms.map(m=>bi.total[m]));
  const sec=(icon,title,sub,body)=>`<section class="${card} p-4 mt-3"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="${icon}" class="w-5 h-5 text-emerald-700"></i>${title}</h2>${sub?`<p class="text-xs text-stone-600 mt-0.5">${sub}</p>`:""}${body}</section>`;
  const list=(arr,period,n=12)=>arr.length?`<div class="mt-1 ${div}">${arr.slice(0,n).map(x=>dropRow(x,period)).join("")}</div>`:`<p class="text-sm text-stone-500 mt-2">Bu dönemde kayıtlı değişim yok.</p>`;
  el.innerHTML=`<h1 class="page-title">Fiyat analizi</h1>
  <p class="text-sm text-stone-600 mt-1">Market Fiyat'ın kendi kaydettiği fiyat değişimlerinden hesaplanır. Fiyat takibi ${dshort(INS.since)} tarihinde başladı (${days} gün); daha eski fiyatlar bilinmez ve tahmin edilmez.</p>
  <div class="grid grid-cols-3 gap-2 mt-3">${[[k==="d7"?"Düşen (7 gün)":"Düşen (takipte)",drop7.length,good],[k==="d7"?"Artan (7 gün)":"Artan (takipte)",up7.length,"text-red-700"],["Dip fiyatta",lows.length,"text-emerald-800"]].map(([l,v,c])=>`<div class="${card} p-3"><p class="text-[11px] font-bold text-stone-600 leading-tight">${l}</p><p class="font-display font-extrabold text-2xl tabular ${c}">${num(v)}</p></div>`).join("")}</div>
  ${sec("shopping-basket","Temel sepet endeksi",`Her markette bulunan ${bi.items.length} temel ürünün (marka fark etmeksizin en düşük birim fiyatla, standart miktarda) toplamı. Resmi enflasyon ya da TÜİK verisi değildir; yalnızca bu uygulamanın gördüğü online fiyatlardan hesaplanır.`,
    `<div class="mt-3 space-y-2">${ms.slice().sort((a,b)=>bi.total[a]-bi.total[b]).map(m=>`<div class="flex items-center gap-2"><span class="w-16 shrink-0">${badge(m)}</span><div class="flex-1 h-3 rounded-full bg-stone-100 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.round(lo/bi.total[m]*100)}%;background:${M[m].bar}"></div></div><span class="tabular font-extrabold w-24 text-right">${tl(bi.total[m])}</span></div>`).join("")}</div>
     <details class="mt-2 text-xs text-stone-600"><summary class="font-bold cursor-pointer text-emerald-800">Sepetteki ürünler</summary><p class="mt-1">${bi.items.map(esc).join(", ")}${bi.missing.length?`<br>Her markette bulunmadığı için dışarıda: ${bi.missing.map(esc).join(", ")}`:""}</p></details>`)}
  ${sec("trending-down","En çok düşenler · "+PLABEL(),k==="d7"?"Bugünkü fiyat ile 7 gün önceki kayıtlı fiyat.":"Takip 7 günü doldurunca 7 günlük karşılaştırmaya geçilir.",list(drop7,k))}
  ${sec("badge-percent","Gerçek fırsatlar",`Kayıtlı geçmişte, indirimden hemen önceki fiyata göre en az %10 düşenler.${fake?` ${num(fake)} üründe marketin ilan ettiği indirim, gözlenen düşüşten en az 15 puan fazla.`:""}`,
    real.length?`<div class="mt-1 ${div}">${real.slice(0,12).map(x=>{const g=GI[x.o.id];return`<div data-show="${esc(g?g.key:x.o.id)}" class="flex items-center gap-3 py-2.5 cursor-pointer">${img(x.o.image,"w-11 h-11 shrink-0")}<div class="flex-1 min-w-0"><p class="text-[13px] font-bold leading-snug line-clamp-2">${esc(x.o.name)}</p><p class="text-[11px] text-stone-600 mt-0.5">${badge(x.o.market,1)} önce ${tl(x.r.prevPrice)} · market %${Math.round(x.r.claimed*100)} diyor</p></div><span class="tabular font-extrabold text-sm ${good} shrink-0">−%${Math.round(x.r.observed*100)}</span></div>`}).join("")}</div>`:`<p class="text-sm text-stone-500 mt-2">Kayıtlı geçmişte doğrulanan %10+ düşüş yok.</p>`)}
  ${sec("trending-up","En çok artanlar · "+PLABEL(),"",list(up7,k))}
  ${sec("arrow-down-to-line","Son 30 günün en düşük fiyatında",has30?"":`Takip ${days} günlük; liste takip süresi içindeki en düşük fiyata göre.`,list(lows,"last"))}`;
}

// ---------- Takip: favoriler ve fiyat alarmları ----------
const isFav=g=>FAV.some(f=>f.key===g.key);
const alarmsOf=g=>ALARMS[g.key]||[];
function badgeBell(){const n=INBOX.filter(x=>!x.read).length;$("nb").textContent=n;$("nb").style.display=n?"grid":"none"}
// Bir ürünün son 30 gündeki kayıtlı en düşük fiyatı (tüm marketlerdeki geçmiş + şu anki fiyatlar)
function low30Of(g){const pts=[];g.offers.forEach(o=>{const h=HIST[o.market];if(h&&h!=="…"&&h[o.id])pts.push(...h[o.id])});
  avail(g).forEach(o=>pts.push([Math.floor(Date.now()/1000),o.price]));return MFA.low30(pts)}
// Veri ve geçmiş yüklenince alarmlar denetlenir; yeni durumlar bildirim kutusuna (ve izin verildiyse telefona) düşer.
function checkAlarms(){
  const keys=Object.keys(ALARMS).filter(k=>ALARMS[k]&&ALARMS[k].length&&GI[k]);if(!keys.length)return;
  const ms=new Set();keys.forEach(k=>GI[k].offers.forEach(o=>ms.add(o.market)));
  const need=[...ms].filter(m=>!HIST[m]||HIST[m]==="…");
  if(need.length){need.forEach(m=>loadHist(m));setTimeout(checkAlarms,1500);return}
  let fired=0;
  for(const k of keys){const g=GI[k],b=best(g);if(!b)continue;const l=low30Of(g);
    const ctx={price:b.price,market:b.market,promos:avail(g).filter(o=>o._promo&&o._promo.kind!=="bim").map(o=>`${M[o.market].n}: ${o.promo}`),low30:l.low,points30:l.n};
    for(const a of ALARMS[k]){const r=MFA.evaluate(a,ctx);if(!r.fire)continue;a.last=r.sig;fired++;
      const text=`${g.name} · ${MFA.describe(a)}. Şu an en ucuz ${M[b.market].at} ${tl(b.price)}.`+(a.type==="promo"?` ${ctx.promos.join(" · ")}`:"");
      INBOX.unshift({ts:Date.now(),key:k,text,read:false});
      try{if("Notification" in window&&Notification.permission==="granted"&&navigator.serviceWorker)navigator.serviceWorker.ready.then(r=>r.showNotification("Market Fiyat",{body:text,tag:k+a.type,icon:"icon.svg"}))}catch(e){}}}
  if(fired){INBOX=INBOX.slice(0,60);save("inbox",INBOX);save("alarms",ALARMS);note(`${fired} fiyat alarmı tetiklendi · zile dokun`)}
  badgeBell();if(view==="track")redraw()}
function favBtns(g){const f=isFav(g),n=alarmsOf(g).length;
  return`<div class="flex gap-2 mt-3"><button data-fav="${esc(g.key)}" class="chipx !py-2 !px-3 ${f?"bg-rose-600 text-white":"bg-white ring-1 ring-stone-300 text-stone-800"}"><i data-lucide="heart" class="w-4 h-4"></i>${f?"Favorilerde":"Favorilere ekle"}</button>
    <button data-alarmopen class="chipx !py-2 !px-3 bg-white ring-1 ring-stone-300 text-stone-800"><i data-lucide="bell-plus" class="w-4 h-4"></i>Fiyat alarmı${n?` (${n})`:""}</button></div>
  <form data-alarmform="${esc(g.key)}" class="hidden mt-2 ${card} p-3 space-y-2">
    <label class="block text-xs font-bold text-stone-700">Ne zaman haber verelim?
      <select name="type" class="mt-1 w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 bg-white text-[15px]">
        <option value="below">Fiyat şu tutarın altına inince</option><option value="drop">Fiyat belli bir oranda düşünce</option>
        <option value="low30">Son 30 günün en düşük fiyatına inince</option><option value="promo">Yeni kampanya gelince</option></select></label>
    <label class="block text-xs font-bold text-stone-700">Hedef (₺ ya da %)<input name="val" inputmode="decimal" placeholder="ör. 49,90 ya da 10" class="mt-1 w-full rounded-xl ring-1 ring-stone-300 px-3 py-2.5 text-[15px]"></label>
    <button class="w-full rounded-xl bg-emerald-700 text-white font-extrabold py-2.5">Alarmı kur</button>
    <p class="text-[11px] text-stone-500">Alarmlar bu telefonda saklanır ve uygulama her açıldığında yeni fiyatlarla denetlenir.</p></form>
  ${n?`<div class="mt-2 space-y-1">${alarmsOf(g).map((a,i)=>`<div class="flex items-center gap-2 text-[13px] bg-stone-100 rounded-xl px-3 py-2"><i data-lucide="bell" class="w-4 h-4 text-emerald-700"></i><span class="flex-1">${esc(MFA.describe(a))}</span><button data-alarmdel="${esc(g.key)}" data-i="${i}" class="text-stone-500 p-1" aria-label="Alarmı sil"><i data-lucide="x" class="w-4 h-4"></i></button></div>`).join("")}</div>`:""}`}
function drawT(){
  badgeBell();
  const row=(g,extra)=>{const b=best(g);return`<div class="flex items-center gap-3 py-3">${img(g.image,"w-11 h-11 shrink-0")}
    <div data-show="${esc(g.key)}" class="flex-1 min-w-0 cursor-pointer"><p class="text-sm font-bold leading-snug line-clamp-2">${esc(g.name)}</p>${extra||""}</div>
    <span class="price tabular text-base shrink-0">${b?tl(b.price):"—"}</span></div>`};
  const favs=FAV.map(f=>({f,g:GI[f.key]})).filter(x=>x.g);
  const alarms=Object.keys(ALARMS).filter(k=>GI[k]&&ALARMS[k].length);
  const perm="Notification" in window?Notification.permission:"unsupported";
  $("track").innerHTML=`<h1 class="page-title">Takip</h1><p class="text-sm text-stone-600 mt-1">Favorilerin, fiyat alarmların ve bildirimlerin. Hepsi yalnızca bu telefonda saklanır.</p>
  <div class="flex items-center gap-2 mt-3 overflow-x-auto noscroll" role="radiogroup" aria-label="Görünüm"><span class="text-sm font-bold shrink-0">Görünüm</span>${[["sistem","Telefona göre"],["acik","Açık"],["koyu","Koyu"]].map(([k,l])=>`<button data-theme="${k}" role="radio" aria-checked="${MFTheme.pref()===k}" class="chipx !py-2 !px-3 shrink-0 ${MFTheme.pref()===k?"bg-emerald-700 text-white":"bg-white ring-1 ring-stone-300 text-stone-800"}">${l}</button>`).join("")}</div>
  <section class="${card} p-4 mt-4"><div class="flex items-center justify-between"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="bell" class="w-5 h-5 text-emerald-700"></i>Bildirimler</h2>${INBOX.some(x=>!x.read)?`<button data-readall class="text-xs font-bold text-emerald-800 underline">Tümünü okundu say</button>`:""}</div>
    ${INBOX.length?`<div class="mt-1 ${div}">${INBOX.slice(0,30).map(x=>`<div data-show="${esc(x.key)}" class="py-2.5 cursor-pointer ${x.read?"opacity-70":""}"><p class="text-[13px] ${x.read?"":"font-bold"}">${esc(x.text)}</p><p class="text-[11px] text-stone-500">${new Date(x.ts).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"})}</p></div>`).join("")}</div>`:`<p class="text-sm text-stone-500 mt-1">Henüz bildirim yok. Bir ürünün sayfasından fiyat alarmı kurabilirsin.</p>`}
    ${perm==="default"?`<button data-notifperm class="mt-3 w-full rounded-xl ring-1 ring-emerald-700 text-emerald-800 font-bold py-2.5">Telefon bildirimlerine izin ver</button><p class="text-[11px] text-stone-500 mt-1">Bildirim, uygulama açıldığında yeni bir alarm tetiklenirse gelir. Uygulama kapalıyken fiyat denetlemek sunucu gerektirir; bu uygulama sunucusuz çalışır.</p>`:perm==="denied"?`<p class="text-[11px] text-stone-500 mt-2">Telefon bildirimleri tarayıcı ayarlarından kapalı; bildirimler yalnızca bu sayfada görünür.</p>`:""}</section>
  <section class="${card} p-4 mt-3"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="heart" class="w-5 h-5 text-rose-600"></i>Favoriler <span class="text-stone-500 font-bold">${favs.length}</span></h2>
    ${favs.length?`<div class="${div}">${favs.map(({f,g})=>{const b=best(g),d=b&&f.price?b.price-f.price:0;return row(g,`<p class="text-[11px] mt-0.5 ${d<-0.005?good+" font-bold":d>0.005?"text-red-700 font-bold":"text-stone-500"}">${b?(Math.abs(d)<0.005?"Eklediğinden beri değişmedi":`Eklediğinden beri ${d<0?"":"+"}${tl(d)}`):"Şu an satışta değil"} · ${b?M[b.market].n:""}</p>`)}).join("")}</div>`:`<p class="text-sm text-stone-500 mt-1">Ürün sayfasındaki kalp düğmesiyle ekle.</p>`}</section>
  <section class="${card} p-4 mt-3"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="bell-plus" class="w-5 h-5 text-emerald-700"></i>Fiyat alarmları <span class="text-stone-500 font-bold">${alarms.reduce((a,k)=>a+ALARMS[k].length,0)}</span></h2>
    ${alarms.length?`<div class="${div}">${alarms.map(k=>row(GI[k],ALARMS[k].map(a=>`<p class="text-[11px] text-stone-600 mt-0.5">• ${esc(MFA.describe(a))}</p>`).join(""))).join("")}</div>`:`<p class="text-sm text-stone-500 mt-1">Ürün sayfasındaki “Fiyat alarmı” düğmesiyle kur.</p>`}</section>`+notifyCard()+budgetCard();
}
// Telefon bildirimleri (ntfy): GitHub günde üç kez yeni afişleri, takip listesindeki fırsatları ve sabah
// özetini ntfy konusuna gönderir. Takip listesi (favoriler, alarmlar, alışveriş listesi) GitHub'da
// "Bildirim listesi" talebi olarak saklanır; bu düğme talebi hazırlar, kullanıcı gönderir.
const REPO="berfuzyonist/market-fiyat";
function watchList(){const out=new Map();
  const add=(k,src,target)=>{const g=GI[k];if(!g)return;const e=out.get(g.key)||{g,src:new Set(),target:null};e.src.add(src);
    if(target&&(!e.target||target<e.target))e.target=target;out.set(g.key,e)};
  FAV.forEach(f=>add(f.key,"favori"));uniq(cart).forEach(g=>add(g.key,"liste"));
  Object.keys(ALARMS).forEach(k=>(ALARMS[k]||[]).forEach(a=>add(k,"alarm",a.type==="below"?+a.target:null)));
  return[...out.values()]}
function watchIssueURL(){const w=watchList();
  const body=["<!-- Market Fiyat bildirim listesi. Değiştirmek için uygulamadan yeniden gönder; eski talebi kapatabilirsin. -->",
    ...w.map(e=>`${e.g.key} | ${e.g.name.replace(/\|/g,"/")}${e.target?` | hedef=${String(e.target).replace(".",",")}`:""}`)].join("\n");
  return`https://github.com/${REPO}/issues/new?title=${encodeURIComponent("Bildirim listesi "+new Date().toLocaleDateString("tr-TR"))}&body=${encodeURIComponent(body)}`}
function notifyCard(){const n=watchList().length,topic=load("ntfy","");
  return`<section class="${card} p-4 mt-3"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="smartphone" class="w-5 h-5 text-emerald-700"></i>Telefon bildirimleri</h2>
    <p class="text-sm text-stone-600 mt-1">Yeni afişler, takip ettiğin ürünlerdeki indirimler ve sabah özeti telefonuna bildirim olarak gelir (günde en çok üç kez: 09.07, 17.07, 21.07).</p>
    <ol class="mt-3 space-y-3 text-sm list-decimal pl-5">
      <li><a class="font-bold text-emerald-700 underline" href="https://play.google.com/store/apps/details?id=io.heckel.ntfy" target="_blank" rel="noopener">ntfy uygulamasını kur</a> (ücretsiz, hesap gerekmez).</li>
      <li>Sana verilen konu adını yaz ve ntfy'de abone ol:
        <form data-ntfy class="flex gap-2 mt-1.5"><input name="t" value="${esc(topic)}" placeholder="mf-..." autocapitalize="off" autocomplete="off" spellcheck="false" aria-label="ntfy konu adı" class="min-w-0 flex-1 rounded-xl ring-1 ring-stone-300 px-3 py-2 bg-white dark:bg-stone-900 font-mono text-[13px]"><button class="rounded-xl bg-emerald-700 text-white font-bold px-3 py-2">Kaydet</button></form>
        ${topic?`<a class="inline-flex items-center gap-1 mt-2 font-bold text-emerald-700" href="ntfy://ntfy.sh/${encodeURIComponent(topic)}">ntfy'de abone ol<i data-lucide="external-link" class="w-4 h-4"></i></a>
          <span class="block text-xs text-stone-500 mt-1">Açılmazsa ntfy'de + düğmesine dokunup konu adını yapıştır.</span>`:""}</li>
      <li>Takip listeni gönder: favoriler, fiyat alarmları ve alışveriş listen (${n} ürün). GitHub'da açılan sayfada “Submit new issue”a dokun.
        <a class="flex items-center justify-center gap-2 mt-2 rounded-xl ${n?"bg-emerald-700 text-white":"bg-stone-200 text-stone-500 pointer-events-none"} font-bold px-3 py-2.5" href="${n?watchIssueURL():"#"}" target="_blank" rel="noopener"><i data-lucide="send" class="w-4 h-4"></i>Takip listesini gönder</a>
        <span class="block text-xs text-stone-500 mt-1">Liste GitHub'da herkese açık bir talep olarak durur (yalnızca ürün adları). Listen değişince yeniden gönder; en yenisi kullanılır.</span></li>
    </ol></section>`}
// Bütçe: yalnız kullanıcının girdiği harcamalar sayılır; listenin tutarı tahmin olarak ayrı yazılır.
function budgetCard(){
  const s=MFG.summary(BUD,Date.now()),mon=new Date().toLocaleDateString("tr-TR",{month:"long",year:"numeric"}),
    est=uniq(cart).reduce((a,g)=>{const b=best(g);return a+(b?lineTotal(b,qtyOf(g)):0)},0),over=s.remaining!=null&&s.remaining<0,
    pct=s.ratio==null?0:Math.min(100,Math.round(s.ratio*100)),mk=Object.keys(M).filter(m=>m!=="a101");
  return`<section class="${card} p-4 mt-3"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="wallet" class="w-5 h-5 text-emerald-700"></i>Bütçe <span class="text-stone-500 font-bold text-sm">${esc(mon)}</span></h2>
    <form data-budlimit class="flex items-center gap-2 mt-2"><label class="text-sm text-stone-600 shrink-0" for="budL">Aylık bütçe</label>
      <input id="budL" name="v" inputmode="decimal" placeholder="ör. 8.000" value="${s.limit?(s.limit/100).toLocaleString("tr-TR"):""}" class="min-w-0 flex-1 rounded-xl ring-1 ring-stone-300 px-3 py-2 tabular bg-white dark:bg-stone-900">
      <button class="rounded-xl bg-emerald-700 text-white font-bold px-3 py-2">Kaydet</button></form>
    <div class="mt-3"><div class="flex items-baseline justify-between"><span class="text-sm">Harcanan</span><span class="price tabular text-xl ${over?"text-red-700":""}">${tl(s.spent/100)}</span></div>
      ${s.limit?`<div class="h-2.5 rounded-full bg-stone-200 dark:bg-stone-800 mt-1.5 overflow-hidden" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Bütçenin harcanan kısmı"><div class="h-full ${over?"bg-red-600":pct>=80?"bg-amber-500":"bg-emerald-600"}" style="width:${pct}%"></div></div>
      <p class="text-xs mt-1.5 ${over?"text-red-700 font-bold":"text-stone-600"}">${over?`Bütçe ${tl(-s.remaining/100)} aşıldı`:`Kalan ${tl(s.remaining/100)} · ay sonuna ${s.daysLeft} gün, günde ${tl(s.perDay/100)}`}</p>`:`<p class="text-xs text-stone-600 mt-1">Bütçe girersen kalan tutarı ve günlük payını gösteririm.</p>`}
      ${est>0?`<p class="text-xs text-stone-600 mt-1">Listendeki ürünlerin tahmini tutarı ${tl(est)}. Bu bir tahmindir, harcamaya eklenmez.</p>`:""}</div>
    <form data-budspend class="grid grid-cols-[1fr_auto] gap-2 mt-3"><input name="v" inputmode="decimal" required placeholder="Harcama tutarı (₺)" aria-label="Harcama tutarı" class="min-w-0 rounded-xl ring-1 ring-stone-300 px-3 py-2 tabular bg-white dark:bg-stone-900">
      <select name="m" aria-label="Market" class="rounded-xl ring-1 ring-stone-300 px-2 py-2 bg-white dark:bg-stone-900">${mk.map(m=>`<option value="${m}">${M[m].n}</option>`).join("")}<option value="a101">A101</option><option value="diger">Diğer</option></select>
      <input name="n" maxlength="60" placeholder="Not (isteğe bağlı)" aria-label="Not" class="min-w-0 rounded-xl ring-1 ring-stone-300 px-3 py-2 bg-white dark:bg-stone-900">
      <button class="rounded-xl bg-emerald-700 text-white font-bold px-3 py-2">Ekle</button></form>
    ${s.list.length?`<div class="${div} mt-2">${s.list.slice(0,20).map(x=>`<div class="flex items-center gap-2 py-2 text-sm"><span class="text-xs text-stone-600 tabular w-14 shrink-0">${new Date(x.t).toLocaleDateString("tr-TR",{day:"numeric",month:"short"})}</span>${M[x.market]?badge(x.market):`<span class="chipx bg-stone-200 text-stone-700">Diğer</span>`}<span class="flex-1 min-w-0 truncate text-stone-600">${esc(x.note||"")}</span><span class="tabular font-bold">${tl(x.cents/100)}</span><button data-buddel="${x.t}" class="icon-btn !w-8 !h-8 text-stone-500" aria-label="Harcamayı sil"><i data-lucide="x" class="w-4 h-4"></i></button></div>`).join("")}</div>`:""}
  </section>`}
document.addEventListener("submit",e=>{const f=e.target;
  if(f.matches("[data-ntfy]")){e.preventDefault();save("ntfy",f.t.value.trim());redraw();return}
  if(f.matches("[data-budlimit]")){e.preventDefault();const c=MFG.toCents(f.v.value);BUD.limit=f.v.value.trim()?c:0;save("budget",BUD);redraw();return}
  if(f.matches("[data-budspend]")){e.preventDefault();const c=MFG.toCents(f.v.value);if(!c){note("Geçerli bir tutar yaz (ör. 245,90).");return}
    let t=Date.now();while(BUD.spends.some(x=>x.t===t))t++;
    BUD.spends.push({t,cents:c,market:f.m.value,note:f.n.value.trim().slice(0,60)});
    const cut=Date.now()-400*864e5;BUD.spends=BUD.spends.filter(x=>x.t>cut); // en çok ~13 ay saklanır
    save("budget",BUD);redraw()}});

// ---------- Akıllı sepet ----------
function basketItems(list){return list.map(g=>{const q=qtyOf(g),av=avail(g);
  return{key:g.key,qty:q,fixed:FIX[g.key]&&av.some(o=>o.market===FIX[g.key])?FIX[g.key]:null,
    offers:av.map(o=>({market:o.market,cents:MFB.toCents(lineTotal(o,q)),stale:!!o.stale,money:!!o.money,o}))}})}
// Seçili plana göre her ürünün alınacağı teklif: {opt, chosen, pickOf(g)}
function currentPlan(list){
  const opt=MFB.optimize(basketItems(list),ORD);
  let chosen=opt.multi;
  if(PLAN.mode==="single")chosen=opt.single.find(x=>x.market===PLAN.market)||opt.single[0]||opt.multi;
  else if(PLAN.mode==="limit")chosen=(opt.multi.markets.length>PLAN.k&&opt.limited[PLAN.k])||opt.multi;
  return{opt,chosen,pickOf:g=>(chosen.pick[g.key]||{}).o||null}}
const tlc=c=>tl(c/100);
function planPanel(P,n){
  const {opt,chosen}=P,mode=PLAN.mode;
  // Plan kartı: tutar ve altında ayrı satırda market/eksik bilgisi. Eksik ürünlü planın tutarı eksik ürünleri
  // içermez; bu yüzden eksik sayısı uyarı renginde yazılır (tam sepetle karıştırılmasın).
  const btn=(attr,label,on,p,meta,w="flex-1 min-w-[7.5rem]")=>`<button ${attr} class="${w} rounded-2xl px-3 py-2.5 text-left ring-1 transition ${on?"bg-emerald-700 text-white ring-emerald-700":"bg-white ring-stone-200 text-stone-800"}"><span class="block text-[11px] font-bold leading-tight ${on?"text-emerald-100":"text-stone-600"}">${label}</span><span class="block font-display font-extrabold tabular text-[17px] mt-0.5">${tlc(p.total)}</span><span class="block text-[11px] font-bold leading-tight mt-0.5 ${on?"text-emerald-50":"text-stone-600"}">${meta}</span>${p.missing.length?`<span class="block text-[11px] font-extrabold mt-0.5 ${on?"text-amber-200":"text-amber-700"}">${p.missing.length} ürün yok · tutara dahil değil</span>`:""}</button>`;
  const lim=k=>opt.limited[k];
  const warn=[];
  if(chosen.stale)warn.push(`${chosen.stale} ürünün fiyatı 48 saatten uzun süredir doğrulanmadı.`);
  if(chosen.money)warn.push(`${chosen.money} üründe Migros Money kartlı fiyat kullanıldı.`);
  const basketPromo=uniq(cart).some(g=>{const o=P.pickOf(g);return o&&o._promo&&o._promo.kind==="basket"});
  if(basketPromo)warn.push("“X TL üzeri sepette” kampanyaları sepet şartına bağlı olduğu için toplama katılmadı.");
  return`<section class="col-span-full ${card} p-4 enter">
    <div class="flex items-center justify-between gap-2"><h2 class="font-display font-extrabold text-lg flex items-center gap-2"><i data-lucide="route" class="w-5 h-5 text-emerald-700"></i>Akıllı sepet</h2>
      ${opt.saving>0?`<span class="chipx bg-emerald-100 text-emerald-900">Tek markete göre ${tlc(opt.saving)} tasarruf</span>`:""}</div>
    <p class="text-xs text-stone-600 mt-0.5">Listendeki ${n} ürünü nereden alırsan toplam ne tutar? Bir plan seç; liste ona göre gruplanır.</p>
    <div class="mt-3 flex gap-2 overflow-x-auto noscroll -mx-1 px-1 pb-1">
      ${btn('data-plan="multi"',"Her ürün en ucuz markette",mode==="multi",opt.multi,`${opt.multi.markets.length} market: ${opt.multi.markets.map(m=>M[m].n).join(", ")}`)}
      ${opt.multi.markets.length>2&&lim(2)?btn('data-plan="limit:2"',"En fazla 2 markete git",mode==="limit"&&PLAN.k===2,lim(2),lim(2).markets.map(m=>M[m].n).join(" + ")):""}
    </div>
    <p class="mt-3 text-xs font-extrabold text-stone-700">Hepsini tek marketten alsan</p>
    <div class="mt-1.5 grid ${opt.single.length>=3?"grid-cols-3":opt.single.length===2?"grid-cols-2":"grid-cols-1"} gap-2">${opt.single.map(x=>btn(`data-plan="single:${x.market}"`,M[x.market].n,mode==="single"&&chosen.market===x.market,x,x.missing.length?"":"tamamı var","min-w-0 !px-2.5")).join("")}</div>
    ${warn.length?`<ul class="mt-3 space-y-1 text-[12px] text-amber-900 bg-amber-50 ring-1 ring-amber-200 rounded-xl px-3 py-2">${warn.map(w=>`<li class="flex gap-1.5"><i data-lucide="triangle-alert" class="w-3.5 h-3.5 shrink-0 mt-0.5"></i>${w}</li>`).join("")}</ul>`:""}
    <p class="mt-2 text-[11px] text-stone-500">Toplamlar marketlerin online fiyatlarıdır; “2 Al 1 Öde” gibi kampanyalar yalnızca adet şartı sağlanınca uygulanır. Ulaşım maliyeti dahil değildir.</p>
  </section>`}
function savedPanel(){
  return`<section class="col-span-full ${card} p-4"><div class="flex items-center justify-between"><h2 class="font-extrabold flex items-center gap-2"><i data-lucide="archive" class="w-5 h-5 text-stone-600"></i>Kayıtlı sepetler</h2>
    <button data-bsave class="chipx bg-emerald-700 text-white !py-2"><i data-lucide="save" class="w-3.5 h-3.5"></i>Bu sepeti kaydet</button></div>
    ${SAVED.length?`<div class="mt-2 ${div}">${SAVED.map((b,i)=>`<div class="flex items-center gap-2 py-2.5"><div class="flex-1 min-w-0"><p class="font-bold truncate">${esc(b.name)}</p><p class="text-[11px] text-stone-500">${b.cart.length} ürün · ${new Date(b.at).toLocaleDateString("tr-TR",{day:"numeric",month:"short"})}</p></div>
      <button data-bload="${i}" class="chipx bg-stone-200 text-stone-800 !py-2">Yükle</button><button data-bdel="${i}" aria-label="Sil" class="p-2 text-stone-500"><i data-lucide="trash-2" class="w-4 h-4"></i></button></div>`).join("")}</div>`
    :`<p class="text-xs text-stone-500 mt-1">Haftalık alışveriş gibi tekrar eden listeleri kaydedip tek dokunuşla geri yükleyebilirsin.</p>`}</section>`}

// Listeyi düz metin olarak paylaş: market market, adet ve fiyatla; notlar en sonda
function listText(){
  const items=uniq(cart),L=["Alışveriş listem"];let sum=0;const pick=currentPlan(items).pickOf;
  ORD.forEach(m=>{const it=items.filter(g=>(pick(g)||{}).market===m);if(!it.length)return;let t=0;L.push("",M[m].n.toLocaleUpperCase("tr"));
    it.forEach(g=>{const b=pick(g),q=qtyOf(g),lt=lineTotal(b,q);t+=lt;L.push(`${done[g.key]?"✓":"•"} ${b.name}${q>1?` ×${q}`:""} — ${tl(lt)}`)});
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
  const pick=currentPlan(items).pickOf;
  const secs=ORD.map(m=>{const it=items.filter(g=>(pick(g)||{}).market===m);if(!it.length)return"";let t=0;
    const rows=it.map(g=>{const b=pick(g),q=qtyOf(g),lt=lineTotal(b,q);t+=lt;n++;const pr=b._promo&&b._promo.kind!=="bim"?b._promo.label:"";
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
const DRAW={home:drawH,compare:drawC,promos:drawK,browse:drawB,search:drawS,list:drawL,posters:drawP,camp:drawCamp,track:drawT,analysis:drawA,status:drawV};
function icons(){lucide.createIcons()}
function redraw(){DRAW[view]();if(view!=="list")drawL();icons()}
const NB="flex flex-col items-center gap-0.5 py-2 rounded-2xl text-[11px] font-bold relative transition active:scale-90 ";
const NT="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-bold transition ";
// ---------- Adres (yenileme ve geri tuşu için) ----------
// #urun/<id>, #ara/<sorgu>, #kesfet, #kampanya, #karsilastir, #listem; ana sayfa: adres eki yok
const HV={home:"",compare:"karsilastir",promos:"kampanya",browse:"kesfet",search:"ara",list:"listem",posters:"afisler",track:"takip",analysis:"analiz",status:"veri"};
let routing=false;
function hashOf(){
  if(view==="search"){if(only)return"#urun/"+encodeURIComponent(only);const q=$("q").value.trim();return(q?"#ara/"+encodeURIComponent(q):"#ara")+filterQS()}
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
    else if(k==="ara"){only=null;const [qq,qs]=arg.split("?");readQS(qs);setQ(qq);go("search")}
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
document.addEventListener("change",e=>{const t=e.target;
  if(t.matches("[data-sfk]")){S.k=t.value;redraw();sync(true)}
  else if(t.matches("[data-sfmin],[data-sfmax]")){const v=parseFloat(String(t.value).replace(",","."));const x=isFinite(v)&&v>=0?String(v):"";if(t.matches("[data-sfmin]"))S.min=x;else S.max=x;redraw();sync(true)}});
document.addEventListener("submit",e=>{const f=e.target;if(!f.matches("[data-alarmform]"))return;e.preventDefault();
  const g=GI[f.dataset.alarmform];if(!g)return;const type=f.type.value,raw=String(f.val.value).trim(),v=raw.includes(",")?parseFloat(raw.replace(/\./g,"").replace(",",".")):parseFloat(raw);const b=best(g);
  const a={type,created:Date.now()};
  if(type==="below"){if(!(v>0)){note("Hedef fiyatı yaz (ör. 49,90).");return}a.target=Math.round(v*100)/100}
  if(type==="drop"){if(!(v>0&&v<100)){note("Düşüş oranını yaz (ör. 10).");return}if(!b){note("Ürün şu an satışta değil.");return}a.pct=Math.round(v);a.base=b.price}
  // kurulduğu andaki durum bildirilmez (ör. zaten kampanyadaysa): yalnızca sonraki değişimler
  if(b){const l=low30Of(g),r=MFA.evaluate(a,{price:b.price,promos:avail(g).filter(o=>o._promo&&o._promo.kind!=="bim").map(o=>`${M[o.market].n}: ${o.promo}`),low30:l.low,points30:l.n});if(r.sig)a.last=r.sig}
  (ALARMS[g.key]=ALARMS[g.key]||[]).push(a);save("alarms",ALARMS);
  note("Alarm kuruldu: "+MFA.describe(a)+(a.last&&a.type!=="promo"?" · Şu an zaten bu koşulda; sonraki düşüşte haber verilir.":a.last?" · Şu an kampanya var; yeni kampanyada haber verilir.":""));redraw()});
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
  else if(el=t("[data-fav]")){const g=GI[el.dataset.fav];if(g){if(isFav(g))FAV=FAV.filter(f=>f.key!==g.key);else{const b=best(g);FAV.unshift({key:g.key,price:b?b.price:0,at:Date.now()})}save("fav",FAV);redraw()}}
  else if(t("[data-alarmopen]")){const f=document.querySelector("[data-alarmform]");if(f)f.classList.toggle("hidden")}
  else if(el=t("[data-alarmdel]")){const k=el.dataset.alarmdel;(ALARMS[k]||[]).splice(+el.dataset.i,1);if(ALARMS[k]&&!ALARMS[k].length)delete ALARMS[k];save("alarms",ALARMS);redraw()}
  else if(t("[data-readall]")){INBOX.forEach(x=>x.read=true);save("inbox",INBOX);redraw()}
  else if(t("[data-notifperm]")){try{Notification.requestPermission().then(()=>redraw())}catch(e){}}
  else if(el=t("[data-plan]")){const [mode,arg]=el.dataset.plan.split(":");PLAN={mode,k:mode==="limit"?+arg:PLAN.k,market:mode==="single"?arg:""};save("plan",PLAN);redraw()}
  else if(el=t("[data-fix]")){const k=el.dataset.fix,m=el.dataset.m;if(m)FIX[k]=m;else delete FIX[k];save("fix",FIX);redraw()}
  else if(t("[data-bsave]")){const name=(prompt("Sepete bir ad ver:",`Sepet ${new Date().toLocaleDateString("tr-TR",{day:"numeric",month:"short"})}`)||"").trim().slice(0,40);
    if(name){SAVED.unshift({name,at:Date.now(),cart:[...cart],qty:{...QTY},notes:NOTES.map(n=>({t:n.t,d:0}))});SAVED=SAVED.slice(0,20);save("baskets",SAVED);note("Sepet kaydedildi: "+name);redraw()}}
  else if(el=t("[data-bload]")){const b=SAVED[+el.dataset.bload];if(b&&(!cart.length||confirm("Şu anki liste kayıtlı sepetle değiştirilsin mi?"))){cart=[...b.cart];QTY={...b.qty};NOTES=(b.notes||[]).map(n=>({...n}));done={};save("cart",cart);save("qty",QTY);save("notes",NOTES);save("done",done);
    const lost=cart.filter(k=>!GI[k]).length;note(`“${b.name}” yüklendi${lost?`; ${lost} ürün artık katalogda yok`:""}.`);redraw()}}
  else if(el=t("[data-bdel]")){const b=SAVED[+el.dataset.bdel];if(b&&confirm(`“${b.name}” silinsin mi?`)){SAVED.splice(+el.dataset.bdel,1);save("baskets",SAVED);redraw()}}
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
  else if(el=t("[data-ss]")){S.sort=el.dataset.ss;redraw();sync(true)}
  else if(t("[data-sfopen]")){S.open=!S.open;redraw()}
  else if(el=t("[data-sfm]")){const m=el.dataset.sfm;S.m=S.m.includes(m)?S.m.filter(x=>x!==m):[...S.m,m];redraw();sync(true)}
  else if(t("[data-sfi]")){S.i=!S.i;redraw();sync(true)}
  else if(t("[data-sfc]")){S.c=!S.c;redraw();sync(true)}
  else if(t("[data-sfclear]")){Object.assign(S,{m:[],k:"",i:false,c:false,min:"",max:""});redraw();sync(true)}
  else if(t("[data-uopen]")){UOPEN=!UOPEN;redraw()}
  else if(el=t("[data-usize]")){USIZE=USIZE===el.dataset.usize?"":el.dataset.usize;redraw()}
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
  else if(t("#reload"))location.reload();
  else if(el=t("[data-theme]")){MFTheme.set(el.dataset.theme);redraw()}
  else if(el=t("[data-copyname]")){try{navigator.clipboard.writeText(el.dataset.copyname)}catch(e){}}
  else if(el=t("[data-buddel]")){BUD.spends=BUD.spends.filter(x=>x.t!==+el.dataset.buddel);save("budget",BUD);redraw()}
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
// Karşılaştırma listeleri (tüm ürünlerin boy/birim çözümlemesini gerektirir) ilk ekran çizildikten sonra,
// tarayıcı boştayken hesaplanır; Karşılaştır sayfası açılırsa hemen hesaplanır.
function ensureCMP(){if(!CMP_READY){buildCompare();CMP_READY=true}}
const idle=f=>("requestIdleCallback" in window?requestIdleCallback(f,{timeout:2500}):setTimeout(f,300));
// Ad çözümlemesini (o._p, o._t) tarayıcı boşken küçük dilimlerle önceden yap: tek seferde yapınca telefonda
// saniyelerce ekran donuyordu. Bitince karşılaştırma listeleri ve su slaytı hesaplanıp ana sayfa yenilenir.
let WARM=false;
function warmUp(rows,done){let i=0;const step=dl=>{const end=performance.now()+((dl&&dl.timeRemaining&&dl.timeRemaining())||12);
  while(i<rows.length&&performance.now()<end){const o=rows[i++];o._p;o._t||(o._t=MFC.fold(o.name).replace(/[^a-z0-9]+/g," ").split(" "))}
  if(i<rows.length)idle(step);else{WARM=true;done()}};idle(step)}
function build(rows,groups){
  O=rows;OI={};ALT=new Map();O.forEach(o=>OI[o.id]=o);const now=Date.now();O.forEach(o=>{MFC.enrich(o,{checks:CHECKS,now});o.cat=categoryOf(o);o._promo=promoOf(o)});
  G=groups?MF.groupFrom(O,groups):MF.group(O);HAY="";VOCAB=null;SIX=null;
  G.forEach(g=>{g.offers.sort((a,b)=>ORD.indexOf(a.market)-ORD.indexOf(b.market));g.key=g.offers[0].id;g.name=g.offers[0].name;g.image=(g.offers.find(o=>o.image)||{}).image;
    g.offers.forEach(o=>GI[o.id]=g)}); // arama metni (g.s) ilk aramada hazırlanır
  // 48 saatten uzun süredir doğrulanmayan ürünün kampanyası güncel sayılmaz
  O.forEach(o=>{if(o.stale&&o._promo&&o._promo.kind!=="bim")o._promo=null});
  PROMO=O.filter(o=>o._promo&&usable(o));FAM=null;
  CMP={same:[],size:[],staple:[]};CMP_READY=false;WATER=undefined;
}
// Çevrimdışı: sw.js son açılan sürümü saklar; mağazada internet yoksa liste yine açılır
if("serviceWorker" in navigator&&location.protocol==="https:")navigator.serviceWorker.register("sw.js").catch(()=>{});
const offNote=()=>note("İnternet bağlantısı yok: son kaydedilen fiyatlar gösteriliyor"+(updated?" (veri: "+when(updated)+")":"")+". Listen bu telefonda kayıtlı.");
// Yeni sürüm / yeni veri: uygulama arka planda açık kaldıysa, geri dönüldüğünde (en çok 30 dakikada bir) küçük
// dosyalar kontrol edilir; değişiklik varsa yenileme önerilir. Kendiliğinden yenilenmez (liste düzenlenirken kaybolmasın).
const APPV=(document.querySelector('script[src*="js/app.js"]')?.getAttribute("src")||"").split("v=")[1]||"";
let lastChk=Date.now(),offered=false;
async function checkFresh(){
  if(offered||document.hidden||navigator.onLine===false||Date.now()-lastChk<30*6e4)return;lastChk=Date.now();
  try{
    const html=await fetch("index.html",{cache:"no-store"}).then(r=>r.ok?r.text():"");
    const v=(html.match(/js\/app\.js\?v=([0-9a-f]+)/)||[])[1];
    let why=v&&APPV&&v!==APPV?"Uygulamanın yeni sürümü hazır.":"";
    if(!why){const sts=await Promise.all(DATA_M.map(m=>fetch(`data/status-${m}.json`,{cache:"no-store"}).then(r=>r.ok?r.json():null).catch(()=>null)));
      if(sts.some((x,i)=>x&&CHECK[DATA_M[i]]&&MFC.toTs(x.data_updated)>MFC.toTs(CHECK[DATA_M[i]].data_updated)))why="Yeni fiyatlar geldi."}
    if(why){offered=true;$("note").innerHTML=`${why} <button id="reload" class="underline font-extrabold ml-1">Yenile</button>`;$("note").classList.remove("hidden");clearTimeout(noteT)}
  }catch(e){}}
document.addEventListener("visibilitychange",checkFresh);setInterval(checkFresh,5*6e4);
addEventListener("offline",offNote);if(navigator.onLine===false)setTimeout(offNote,1500);
route(); // açılışta adresteki sayfaya git (yenilemede aynı ürün açık kalır)
// Afiş dosyaları küçük: fiyat verisini beklemeden gelir gelmez rafa çizilir (ilk ekranın en büyük görseli).
const postersP=Promise.all(["bim","migros","sok"].map(m=>get(`data/posters-${m}.json`)));
postersP.then(ps=>ps.forEach((p,i)=>{if(p&&p.updated)PUPD[["bim","migros","sok"][i]]=p.updated})).catch(()=>{});
postersP.then(posters=>{if(O.length)return;POST=groupBim(groupSok(posters.flatMap(p=>(p&&Array.isArray(p.items)?p.items:[]).filter(it=>it&&/^https:\/\//.test(it.image||"")))));
  if(view==="home"){drawPostShelf();icons()}else if(view==="posters")redraw()}).catch(()=>{});
// Fiyat verisi: önce data/client (katalog önbellekte kalır, her açılışta yalnızca fiyat dosyaları iner;
// eşleştirme hazır gelir), olmazsa tam market dosyaları. Katalog ve fiyat sürümü uyuşmazsa tam dosyaya düşülür.
async function loadRows(statusP){
  const [idx,sts]=await Promise.all([get("data/client/index.json"),statusP]);
  const stOf=m=>sts&&sts[DATA_M.indexOf(m)];
  if(idx&&idx.markets){try{
    const ms=DATA_M.filter(m=>idx.markets[m]);
    const [cats,prs,grp]=await Promise.all([Promise.all(ms.map(m=>get(`data/client/${m}-catalog.json?h=${idx.markets[m].catalog}`))),
      Promise.all(ms.map(m=>get(`data/client/${m}-prices.json`))),get("data/client/groups.json")]);
    const per={};ms.forEach((m,i)=>{const r=MFC.rowsFromSplit(cats[i],prs[i]);if(!r)throw new Error("katalog sürümü");
      // fiyat dosyası market durumundaki son veri zamanından eskiyse (yayım sırası) o market tam dosyadan okunur
      const du=MFC.toTs((stOf(m)||{}).data_updated),pu=MFC.toTs(prs[i].updated);if(du&&pu&&pu<du)return;
      per[m]={rows:r,updated:prs[i].updated}});
    const lack=DATA_M.filter(m=>!per[m]);
    if(lack.length){const fs=await Promise.all(lack.map(m=>get(`data/${m}.json`)));lack.forEach((m,i)=>{per[m]={rows:MFC.rowsOf(fs[i]),updated:fs[i]&&fs[i].updated}})}
    const ok=grp&&Array.isArray(grp.groups)&&ms.every(m=>grp.catalogs&&grp.catalogs[m]===cats[ms.indexOf(m)].v);
    return{per,groups:ok&&!lack.length?grp.groups:null}}catch(e){}}
  const files=await Promise.all(DATA_M.map(m=>get(`data/${m}.json`))),per={};
  files.forEach((d,i)=>{per[DATA_M[i]]={rows:MFC.rowsOf(d),updated:d&&d.updated}});
  return{per,groups:null}}
const statusP=Promise.all(DATA_M.map(m=>get(`data/status-${m}.json`)));
Promise.all([loadRows(statusP),statusP,get("data/price-checks.json"),postersP]).then(([loaded,statuses,checks,posters])=>{
  POST=groupBim(groupSok(posters.flatMap(p=>(p&&Array.isArray(p.items)?p.items:[]).filter(it=>it&&/^https:\/\//.test(it.image||"")))));
  // Migros kampanya listelerindeki ürünler: katalogda yoksa eklenir, liste daha yeni okunduysa fiyatı günceller
  const campRows=MFC.rowsOf(posters[1]);
  statuses.forEach((s,i)=>{if(s)CHECK[DATA_M[i]]=s});
  CHECKS=(checks&&checks.checks)||{};
  const rows=[],miss=[];
  DATA_M.forEach(m=>{const x=loaded.per[m];if(x&&x.rows.length){rows.push(...x.rows);UPD[m]=x.updated}else miss.push(M[m].n)});
  if(!rows.length)throw new Error("veri yok");
  if(campRows.length){const at=new Map(rows.map((o,i)=>[o.id,i]));
    campRows.forEach(c=>{const i=at.get(c.id);if(i==null){at.set(c.id,rows.length);rows.push(c)}else if((c.seen||0)>(rows[i].seen||0)){const o=rows[i];Object.assign(o,{price:c.price,regular:c.regular,in_stock:c.in_stock,promo:c.promo,money:c.money,seen:c.seen});if(!o.cat)o.cat=c.cat}})}
  if(miss.length)note("Şu marketlerin verisi okunamadı: "+miss.join(", "));
  updated=Object.values(UPD).sort().pop();
  build(rows,loaded.groups);
  const byLabel={};O.forEach(o=>{if(o.market==="bim"&&o.promo)(byLabel[o.promo]=byLabel[o.promo]||[]).push(o.id)});
  POST.forEach(it=>{if(it.market==="bim")it.ids=byLabel[`${it.group} · ${it.label}`]||[]});
  redraw();
  badgeBell();setTimeout(checkAlarms,800);
  WARM=false;warmUp(O,()=>buildCompareIdle(()=>{if(view==="home"){drawHCmp(O.filter(usable));icons();drawHDrops()}}));
}).catch(e=>{note("Fiyat verisi yüklenemedi: "+e.message)});
