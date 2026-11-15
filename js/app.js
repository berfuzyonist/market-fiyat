"use strict";
/* Market Fiyat arayüzü. Eşleştirme mantığı js/match.js içinde (MF). */
const M={sok:{n:"Şok",at:"Şok'ta",c:"bg-yellow-400 text-yellow-950",bar:"#eab308"},migros:{n:"Migros",at:"Migros'ta",c:"bg-orange-500 text-white",bar:"#f97316"},a101:{n:"A101",at:"A101'de",c:"bg-cyan-600 text-white",bar:"#0891b2"},bim:{n:"BİM",at:"BİM'de",c:"bg-red-600 text-white",bar:"#dc2626"}},ORD=Object.keys(M);
const VIEWS=["home","compare","promos","browse","search","list"];
const $=id=>document.getElementById(id);
const tl=x=>x.toLocaleString("tr-TR",{minimumFractionDigits:2,maximumFractionDigits:2})+" ₺";
const num=x=>x.toLocaleString("tr-TR");
const pct=x=>"%"+Math.round(x*100);
const norm=s=>(s||"").toLocaleLowerCase("tr");
const fold=MF.fold;
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
let O=[],G=[],GI={},CMP={same:[],size:[],staple:[]},PROMO=[];
let cart=load("cart",[]),bmap=load("bmap",{}),pending=null,only=null,updated="",UPD={},CHECK={},view="home";
const C={seg:"same",three:false,sort:"pct",page:0},K={kind:"multi",m:"",sort:"gain",page:0},B={m:"",cat:"",disc:false,sort:"disc",page:0};
const PER=20,PERC=12;

// ---------- Küçük parçalar ----------
const badge=(m,sm)=>`<span class="${M[m]?M[m].c:"bg-stone-400 text-white"} ${sm?"text-[11px] px-2 py-0.5":"text-xs px-2.5 py-1"} font-bold rounded-lg whitespace-nowrap">${M[m]?M[m].n:esc(m)}</span>`;
const chip=(t,c)=>`<span class="text-[11px] font-semibold px-2 py-0.5 rounded-md ${c}">${t}</span>`;
const card="bg-white dark:bg-stone-900 rounded-2xl ring-1 ring-stone-200 dark:ring-stone-800 shadow-sm";
const div="divide-y divide-stone-100 dark:divide-stone-800";
const good="text-emerald-700 dark:text-emerald-400";
const empty=(ic,a,b)=>`<div class="${card} p-8 text-center col-span-full"><i data-lucide="${ic}" class="w-10 h-10 mx-auto text-stone-300"></i><p class="mt-2 font-semibold">${a}</p><p class="text-sm text-stone-500">${b}</p></div>`;
const img=(src,cls)=>src&&src.startsWith("https://")?`<img src="${esc(src)}" alt="" loading="lazy" class="${cls} object-contain bg-white rounded-xl" onerror="this.style.visibility='hidden'">`:`<div class="${cls} rounded-xl bg-stone-200 dark:bg-stone-800"></div>`;
const pill=(attr,val,label,on,onCls)=>`<button ${attr}="${val}" class="shrink-0 px-3 py-2 rounded-xl text-sm font-bold ${on?(onCls||"bg-stone-900 text-white dark:bg-white dark:text-stone-900"):"bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300"}">${label}</button>`;
function pager(id,page,pages){
  const b=(p,lb,left,off)=>`<button data-page="${p}" data-pg="${id}" ${off?"disabled":""} class="flex items-center gap-1 px-4 py-2.5 rounded-xl font-bold ${off?"opacity-30":"bg-white dark:bg-stone-900 ring-1 ring-stone-200 dark:ring-stone-800"}">${left?`<i data-lucide="chevron-left" class="w-4 h-4"></i>${lb}`:`${lb}<i data-lucide="chevron-right" class="w-4 h-4"></i>`}</button>`;
  return pages>1?b(page-1,"Önceki",1,page===0)+`<span class="text-sm font-semibold tabular">${page+1} / ${pages}</span>`+b(page+1,"Sonraki",0,page>=pages-1):""}

const avail=g=>g.offers.filter(o=>o.in_stock);
const best=g=>avail(g).reduce((a,o)=>!a||o.price<a.price?o:a,null);
const worst=g=>Math.max(...avail(g).map(o=>o.price));
const inCart=g=>cart.some(k=>GI[k]===g);
const uniq=a=>[...new Set(a.map(k=>GI[k]).filter(Boolean))];
const disc=o=>o.regular>o.price?1-o.price/o.regular:0;
const unitTxt=o=>{const u=MF.unitPrice(o);return u?`${tl(u.v)}/${u.u}`:""};

// ---------- Kampanya çözümleme ----------
// promo metninden kampanya türü ve "tanesi kaça gelir" hesabı
function promoOf(o){
  const t=(o.promo||"").trim();if(!t)return null;const f=fold(t);let m;
  if(m=f.match(/(\d+)\s*al\s*(\d+)\s*ode/))return{kind:"multi",label:t,need:+m[1],eff:o.price*m[2]/m[1]};
  if(m=f.match(/(\d+)\s*alana\s*(\d+)\s*bedava/)){const n=+m[1]+ +m[2];return{kind:"multi",label:`${m[1]} Alana ${m[2]} Bedava`,need:n,eff:o.price*m[1]/n}}
  if(m=f.match(/(\d+)\.\s*si\s*%\s*(\d+)/))return{kind:"multi",label:t,need:+m[1],eff:o.price*(m[1]-m[2]/100)/m[1]};
  if(m=f.match(/(\d+)\s*tl ve uzeri alisveriste\s*(\d+(?:[.,]\d+)?)\s*tl/)){const p=parseFloat(m[2].replace(",","."));return{kind:"basket",label:`${m[1]} TL üzeri sepette`,need:1,eff:p,min:+m[1]}}
  if(/^(aktuel|indirim)/.test(f))return{kind:"bim",label:t,need:1,eff:o.price};
  return{kind:"other",label:t,need:1,eff:o.price};
}
const gain=o=>o._promo&&o.price>0?Math.max(0,1-o._promo.eff/o.price):0;
function promoLine(o){const p=o._promo;if(!p)return"";
  if(p.kind==="multi")return`${p.need} adet alınca tanesi <b>${tl(p.eff)}</b>`;
  if(p.kind==="basket")return`${p.min} TL üzeri sepette <b>${tl(p.eff)}</b>`;
  return esc(p.label)}
const promoChip=o=>o._promo?chip(`<i data-lucide="gift" class="w-3 h-3 inline -mt-0.5"></i> ${esc(o._promo.kind==="basket"?o._promo.label:o._promo.label)}`,"bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300"):"";

// ---------- Ürün kartı (şerit ve ızgaralarda) ----------
function pcard(o,opt={}){
  const g=GI[o.id],key=g?g.key:o.id,d=disc(o),p=o._promo,inC=g&&inCart(g);
  const flag=p&&p.kind!=="bim"?`<span class="absolute top-0 left-0 bg-violet-600 text-white text-[11px] font-extrabold px-2 py-1 rounded-lg">${esc(p.label)}</span>`:"";
  return`<article class="${card} p-3 flex flex-col ${opt.strip?"w-40 lg:w-48 shrink-0 snap-start":""}">
  <div class="relative cursor-pointer" data-show="${esc(key)}">${img(o.image,"w-full h-28")}${d?`<span class="absolute top-0 right-0 bg-red-600 text-white text-xs font-extrabold px-2 py-1 rounded-lg">-${pct(d)}</span>`:""}${flag}</div>
  <p class="text-sm font-semibold leading-snug mt-2 h-10 overflow-hidden">${esc(o.name)}</p>
  <div class="mt-1 flex items-center gap-1 flex-wrap">${badge(o.market,1)}${g&&avail(g).length>1?chip(avail(g).length+" markette","bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"):""}</div>
  ${d?`<p class="text-xs text-stone-400 line-through tabular mt-2">${tl(o.regular)}</p>`:`<p class="mt-2"></p>`}
  <p class="font-extrabold tabular ${d?good:""}">${tl(o.price)}</p>
  ${p?`<p class="text-xs text-violet-700 dark:text-violet-300 mt-1 leading-snug">${promoLine(o)}</p>`:""}
  ${opt.strip?"":`<button data-add="${esc(key)}" class="mt-auto pt-2"><span class="w-full flex items-center justify-center gap-1 py-2 rounded-lg text-sm font-bold ${inC?"bg-stone-100 dark:bg-stone-800":"bg-emerald-600 text-white"}"><i data-lucide="${inC?"check":"plus"}" class="w-4 h-4"></i>${inC?"Listede":"Ekle"}</span></button>`}</article>`}

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
  const kinds=[["multi","Çoklu alım"],["basket","Sepet fırsatı"],["bim","BİM aktüel"],["","Tümü"]];
  const cnt=k=>PROMO.filter(o=>!k||o._promo.kind===k||(k==="multi"&&o._promo.kind==="other")).length;
  $("kKind").innerHTML=kinds.filter(([k])=>!k||cnt(k)).map(([k,l])=>pill("data-kind",k,`${l} <span class="opacity-60 tabular">${cnt(k)}</span>`,K.kind===k,"bg-violet-600 text-white")).join("");
  let r=PROMO.filter(o=>!K.kind||o._promo.kind===K.kind||(K.kind==="multi"&&o._promo.kind==="other"));
  const ms=ORD.filter(m=>r.some(o=>o.market===m));if(K.m&&!ms.includes(K.m))K.m="";
  $("kMk").innerHTML=ms.length>1?["",...ms].map(m=>pill("data-km",m,m?M[m].n:"Tüm marketler",K.m===m,m?M[m].c:"")).join(""):"";
  r=r.filter(o=>!K.m||o.market===K.m);$("kSort").value=K.sort;
  r.sort({gain:(a,b)=>gain(b)-gain(a)||a._promo.eff-b._promo.eff,pa:(a,b)=>a._promo.eff-b._promo.eff,name:(a,b)=>a.name.localeCompare(b.name,"tr")}[K.sort]);
  const pages=Math.max(1,Math.ceil(r.length/PER));K.page=Math.min(K.page,pages-1);
  $("kInfo").textContent=num(r.length)+" ürün"+(K.kind==="basket"?" · Sepet tutarı belirtilen sınırı geçince geçerli fiyat":K.kind==="bim"?" · BİM'in yayımladığı haftalık ürünler":"");
  $("kGrid").innerHTML=r.slice(K.page*PER,(K.page+1)*PER).map(o=>pcard(o)).join("")||empty("gift","Kampanya bulunamadı","Kampanya verisi bir sonraki güncellemede gelir.");
  $("kPager").innerHTML=pager("K",K.page,pages)}

// ---------- Ana sayfa ----------
function drawH(){
  const st=O.filter(o=>o.in_stock),nd=st.filter(o=>o.price<o.regular).length,np=PROMO.filter(o=>o._promo.kind!=="bim").length,nc=CMP.same.length+CMP.size.length;
  $("heroStat").textContent=`${num(st.length)} ürün · ${ORD.filter(m=>O.some(o=>o.market===m)).map(m=>M[m].n).join(", ")}`;
  const tile=(attr,ic,col,n,l)=>`<button ${attr} class="${card} p-3 lg:p-5 text-left"><i data-lucide="${ic}" class="w-5 h-5 ${col}"></i><p class="text-xl lg:text-3xl font-extrabold tabular mt-1">${num(n)}</p><p class="text-xs lg:text-sm text-stone-500 leading-tight">${l}</p></button>`;
  $("tiles").innerHTML=tile('data-view="compare" data-plain="1"',"scale","text-emerald-600",nc,"ortak ürün")+tile('data-view="promos" data-plain="1"',"gift","text-violet-600",np,"kampanya")+tile('data-go="deals"',"badge-percent","text-red-600",nd,"indirim");
  $("hCmp").innerHTML=CMP.same.filter(it=>it.diff>=1).sort((a,b)=>b.pct-a.pct).slice(0,14).map(it=>`<article data-show="${esc(it.key)}" class="${card} p-3 w-56 shrink-0 snap-start cursor-pointer">
    <div class="flex gap-2 items-center">${img(it.image,"w-14 h-14 shrink-0")}<p class="text-sm font-semibold leading-snug max-h-[3.75rem] overflow-hidden">${esc(it.title)}</p></div>
    <div class="mt-2 space-y-1">${it.rows.map(r=>`<div class="flex items-center justify-between">${badge(r.o.market,1)}<span class="tabular text-sm font-bold ${r.o===it.win?good:"text-stone-500"}">${tl(r.o.price)}</span></div>`).join("")}</div>
    <p class="mt-2 text-xs font-bold ${good}">${tl(it.diff)} fark (${pct(it.pct)})</p></article>`).join("")||`<p class="text-sm text-stone-500">Ortak ürün bulunamadı.</p>`;
  $("hPromo").innerHTML=PROMO.filter(o=>o._promo.kind==="multi"||o._promo.kind==="basket").sort((a,b)=>gain(b)-gain(a)).slice(0,16).map(o=>pcard(o,{strip:1})).join("")||`<p class="text-sm text-stone-500">Kampanya verisi bir sonraki güncellemede gelir.</p>`;
  $("deals").innerHTML=st.filter(o=>o.price<o.regular).sort((a,b)=>disc(b)-disc(a)).slice(0,20).map(o=>pcard(o,{strip:1})).join("")||`<p class="text-sm text-stone-500">Şu an indirim görünmüyor.</p>`;
  // Temel ihtiyaçlar özeti
  const wins={};CMP.staple.forEach(it=>{if(it.diff>=0.005)wins[it.win.market]=(wins[it.win.market]||0)+1});
  $("hStaple").innerHTML=CMP.staple.length?`<button data-seg="staple" data-open="1" class="${card} w-full p-4 lg:p-5 text-left flex items-center gap-4">
    <span class="w-12 h-12 rounded-2xl bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 grid place-items-center shrink-0"><i data-lucide="shopping-basket" class="w-6 h-6"></i></span>
    <span class="flex-1 min-w-0"><span class="block font-extrabold">Temel ihtiyaçlarda kim ucuz?</span>
    <span class="flex flex-wrap gap-x-3 gap-y-1 mt-1 text-sm">${ORD.filter(m=>wins[m]).sort((a,b)=>wins[b]-wins[a]).map(m=>`<span>${badge(m,1)} <b class="tabular">${wins[m]}</b> üründe</span>`).join("")}</span>
    <span class="block text-xs text-stone-500 mt-1">Süt, yağ, şeker, un gibi ${CMP.staple.length} temel üründe birim fiyat karşılaştırması</span></span>
    <i data-lucide="chevron-right" class="w-5 h-5 text-stone-400"></i></button>`:"";
  $("stores").innerHTML=ORD.filter(m=>O.some(o=>o.market===m)).map(m=>{const n=st.filter(o=>o.market===m),d=n.filter(o=>o.price<o.regular).length,k=n.filter(o=>o._promo&&o._promo.kind!=="bim").length,s=CHECK[m],failed=s&&(s.status!=="tamam"||s.complete===false);
    const stamp=v=>v?new Date(v).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
    return`<button data-bm="${m}" data-open="1" class="${card} p-4 text-left"><span class="${M[m].c} text-sm font-extrabold px-3 py-1 rounded-lg">${M[m].n}</span><p class="mt-3 font-bold tabular">${num(n.length)} ürün</p><p class="text-sm text-red-600 font-semibold tabular">${num(d)} indirimli${k?` · <span class="text-violet-600">${num(k)} kampanya</span>`:""}</p>${UPD[m]?`<p class="text-xs text-stone-500 mt-1">Veri: ${stamp(UPD[m])}</p>`:""}${s&&s.updated?`<p class="text-xs mt-1 ${failed?"text-red-600 font-semibold":"text-stone-500"}">Kontrol: ${stamp(s.updated)}${failed?" · güncelleme sorunu":""}</p>`:""}</button>`}).join("");
  const r=uniq(cart).slice(-3).reverse();
  $("recent").innerHTML=r.length?`<div class="${card} px-4 ${div}">`+r.map(g=>{const b=best(g);
    return`<div data-show="${esc(g.key)}" class="flex items-center gap-3 py-3 cursor-pointer">${img(g.image,"w-10 h-10 shrink-0")}<span class="flex-1 text-sm font-semibold">${esc(g.name)}</span>${b?badge(b.market,1)+`<span class="tabular font-bold">${tl(b.price)}</span>`:chip("Tükendi","bg-stone-200 text-stone-600")}</div>`}).join("")+`</div>`
    :empty("history","Henüz ürün eklemediniz","Listeye eklediğiniz son ürünler burada görünür.");
  $("upd").textContent=updated?new Date(updated).toLocaleString("tr-TR",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"-"}

// ---------- Ara ----------
function offerRow(o,isB){
  const out=!o.in_stock,d=o.price<o.regular,u=unitTxt(o);
  return`<div class="py-2 ${isB?"bg-emerald-50 dark:bg-emerald-950/40 -mx-4 px-4":""} ${out?"opacity-40":""}"><div class="flex items-center gap-2">
  ${badge(o.market)}${isB?`<span class="flex items-center gap-1 ${good} text-xs font-bold"><i data-lucide="trophy" class="w-3.5 h-3.5"></i>En ucuz</span>`:""}
  <span class="flex-1"></span>${out?chip("Tükendi","bg-stone-200 text-stone-600"):""}${d?`<span class="text-xs text-stone-400 line-through tabular">${tl(o.regular)}</span>`:""}
  <span class="tabular font-bold text-right ${isB||d?good:""} ${out?"line-through":""}">${tl(o.price)}</span>
  ${o.url&&o.url.startsWith("https://")?`<a href="${esc(o.url)}" target="_blank" rel="noopener" aria-label="Markette aç" class="text-stone-400 p-1"><i data-lucide="external-link" class="w-4 h-4"></i></a>`:""}</div>
  ${o._promo||u?`<p class="text-xs mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">${o._promo?`${o._promo.kind==="multi"?promoChip(o):""}<span class="text-violet-700 dark:text-violet-300">${promoLine(o)}</span>`:""}${u?`<span class="text-stone-500 tabular">${u}</span>`:""}</p>`:""}</div>`}
function drawS(){
  const w=norm($("q").value.trim()).split(/\s+/).filter(Boolean);
  let r=only&&GI[only]?[GI[only]]:(w.length||pending?G.filter(g=>w.every(x=>g.s.includes(x))):[]);
  if(!only&&w.length)r.sort((a,b)=>avail(b).length-avail(a).length);
  const total=r.length;r=r.slice(0,30);
  const ban=pending?`<div class="rounded-2xl bg-amber-100 text-amber-900 p-4 text-sm"><p class="font-bold">Barkod ${esc(pending)} henüz tanınmıyor</p><p>Ürünü adıyla arayın, sonra "Bu barkodla eşleştir"e dokunun. Bunu ürün başına bir kez yapmanız yeterli.</p><button data-cancel class="mt-2 font-bold underline">Vazgeç</button></div>`:"";
  $("res").innerHTML=ban+(r.map(g=>{const b=best(g),inC=inCart(g),multi=avail(g).length>1,sv=b&&multi?worst(g)-b.price:0;
    return`<article class="${card} p-4">
    <div class="flex gap-3 items-center">${img(g.image,"w-20 h-20 shrink-0")}
      <div class="min-w-0"><h2 class="font-bold leading-snug">${esc(g.name)}</h2>
      ${sv>0?`<p class="text-xs font-semibold ${good} mt-1">${tl(sv)}'ye kadar tasarruf</p>`:""}</div></div>
    <div class="mt-3 ${div}">${g.offers.map(o=>offerRow(o,multi&&o===b)).join("")}</div>
    ${pending?`<button data-map="${esc(g.key)}" class="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold bg-amber-500 text-white"><i data-lucide="link" class="w-5 h-5"></i>Bu barkodla eşleştir</button>`:""}
    <button data-add="${esc(g.key)}" ${b||inC?"":"disabled"} class="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition active:scale-[.98] ${inC||!b?"bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-200":"bg-emerald-600 hover:bg-emerald-700 text-white"}">
      <i data-lucide="${inC?"check":"plus"}" class="w-5 h-5"></i>${inC?"Listede · çıkar":b?"Listeye ekle → "+M[b.market].n:"Stokta yok"}</button></article>`}).join("")
    ||(!G.length?"":w.length?empty("search-x","Sonuç bulunamadı","Başka bir kelime deneyin."):pending?"":empty("search","Ürün arayın","Ürün adı, marka ya da barkod numarası yazın.")))
    +(total>30?`<p class="text-center text-sm text-stone-500">${num(total)} sonuçtan ilk 30'u gösteriliyor. Aramayı daraltın.</p>`:"")}

// ---------- Keşfet ----------
function drawB(){
  const ms=ORD.filter(m=>O.some(o=>o.market===m));
  $("bMk").innerHTML=["",...ms].map(m=>pill("data-bm",m,m?M[m].n:"Tümü",B.m===m,m?M[m].c:"")).join("");
  const cats=[...new Set(O.filter(o=>!B.m||o.market===B.m).map(o=>o.cat).filter(Boolean))].sort((a,b)=>a.localeCompare(b,"tr"));
  if(B.cat&&!cats.includes(B.cat))B.cat="";
  $("bCat").innerHTML=`<option value="">Tüm kategoriler</option>`+cats.map(c=>`<option ${c===B.cat?"selected":""}>${esc(c)}</option>`).join("");
  $("bSort").value=B.sort;$("bDisc").checked=B.disc;
  const r=O.filter(o=>o.in_stock&&(!B.m||o.market===B.m)&&(!B.cat||o.cat===B.cat)&&(!B.disc||o.price<o.regular));
  r.sort({disc:(a,b)=>disc(b)-disc(a)||a.price-b.price,pa:(a,b)=>a.price-b.price,pd:(a,b)=>b.price-a.price,unit:(a,b)=>a.name.localeCompare(b.name,"tr")}[B.sort]);
  const pages=Math.max(1,Math.ceil(r.length/PER));B.page=Math.min(B.page,pages-1);
  $("bInfo").textContent=num(r.length)+" ürün";
  $("bGrid").innerHTML=r.slice(B.page*PER,(B.page+1)*PER).map(o=>pcard(o)).join("")||empty("package-search","Ürün bulunamadı","Filtreleri değiştirin.");
  $("bPager").innerHTML=pager("B",B.page,pages)}

// ---------- Listem ----------
function drawL(){
  const items=uniq(cart);
  ["n","n2"].forEach(i=>{$(i).textContent=items.length;$(i).style.display=items.length?"grid":"none"});
  if(!items.length){$("list").innerHTML=empty("shopping-cart","Listeniz boş","Ürün arayıp ekleyin, en ucuz markete göre gruplanır.");return}
  const line=(g,o)=>`<div class="py-3"><div class="flex items-center gap-3">${img(g.image,"w-10 h-10 shrink-0")}<span data-show="${esc(g.key)}" class="flex-1 text-sm cursor-pointer">${esc(o?o.name:g.name)}</span><span class="tabular font-semibold">${o?tl(o.price):"-"}</span><button data-add="${esc(g.key)}" aria-label="Çıkar" class="text-stone-400 hover:text-red-600 p-1"><i data-lucide="x" class="w-4 h-4"></i></button></div>${o&&o._promo?`<p class="text-xs mt-1 ml-[3.25rem] text-violet-700 dark:text-violet-300">${o._promo.kind==="multi"?promoChip(o)+" ":""}${promoLine(o)}</p>`:""}</div>`;
  let sum=0,max=0,h="",stops=0;
  ORD.forEach(m=>{const it=items.filter(g=>(best(g)||{}).market===m);if(!it.length)return;stops++;let t=0;
    h+=`<section class="${card} overflow-hidden"><div class="${M[m].c} px-4 py-3 flex items-center justify-between"><span class="font-extrabold flex items-center gap-2"><span class="bg-black/15 rounded-full w-6 h-6 grid place-items-center text-xs">${stops}</span>${M[m].n}</span><span class="text-sm font-semibold opacity-90">${it.length} ürün</span></div><div class="px-4 ${div}">`+
    it.map(g=>{const b=best(g);t+=b.price;max+=worst(g);return line(g,b)}).join("")+
    `</div><div class="px-4 py-3 bg-stone-50 dark:bg-stone-800/50 flex justify-between font-bold"><span>Ara toplam</span><span class="tabular">${tl(t)}</span></div></section>`;sum+=t});
  const out=items.filter(g=>!best(g));
  if(out.length)h+=`<section class="${card} overflow-hidden"><div class="bg-stone-300 dark:bg-stone-700 px-4 py-3 font-extrabold">Stokta yok</div><div class="px-4 ${div}">${out.map(g=>line(g,null)).join("")}</div></section>`;
  $("list").innerHTML=`<div class="${card} shadow-lg p-5"><p class="text-stone-500 text-sm">Toplam · ${stops} market</p><p class="text-3xl font-extrabold tabular">${tl(sum)}</p>${max-sum>0.005?`<p class="mt-2 inline-flex items-center gap-1 bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 rounded-lg px-2.5 py-1 text-sm font-semibold"><i data-lucide="piggy-bank" class="w-4 h-4"></i>${tl(max-sum)} tasarruf</p>`:""}</div>`+h}

// ---------- Gezinme ----------
const DRAW={home:drawH,compare:drawC,promos:drawK,browse:drawB,search:drawS,list:drawL};
function icons(){lucide.createIcons()}
function redraw(){DRAW[view]();if(view!=="list")drawL();icons()}
const NB="flex flex-col items-center gap-0.5 py-2 rounded-xl text-[11px] font-semibold relative ";
const NT="flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold transition ";
function go(v,keep){
  view=v;VIEWS.forEach(id=>$(id).classList.toggle("hidden",id!==v));
  document.querySelectorAll("nav [data-view]").forEach(b=>{if(b.dataset.plain)return;const on=b.dataset.view===v;
    b.className=b.dataset.top?NT+(on?"bg-emerald-600 text-white shadow":"text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"):NB+(on?"bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-400":"text-stone-500")});
  $("hero").classList.toggle("hidden",v!=="home");
  const el=$(v);el.classList.remove("enter");void el.offsetWidth;el.classList.add("enter");
  redraw();if(!keep)scrollTo(0,0)}
let noteT;function note(m){$("note").textContent=m;$("note").classList.remove("hidden");clearTimeout(noteT);noteT=setTimeout(()=>$("note").classList.add("hidden"),7000)}
function show(key){only=key;$("q").value="";go("search")}

// ---------- Barkod ----------
function onCode(b){const k=bmap[b];if(k&&GI[k]){only=k;pending=null}else{only=null;pending=b}$("q").value="";go("search")}
async function scan(){
  if(!("BarcodeDetector" in window)){go("search");note("Bu tarayıcı kamerayla barkod okumayı desteklemiyor. Barkod numarasını arama kutusuna yazıp Enter'a basın.");return}
  let stream;try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:"environment"}})}catch(e){note("Kamera açılamadı. Tarayıcıda kamera iznini kontrol edin.");return}
  const v=$("cam");v.srcObject=stream;await v.play();$("scanner").classList.remove("hidden");
  const det=new BarcodeDetector({formats:["ean_13","ean_8","upc_a"]});let on=true;
  const stop=()=>{on=false;stream.getTracks().forEach(t=>t.stop());$("scanner").classList.add("hidden")};
  $("scanX").onclick=stop;
  while(on){try{const r=await det.detect(v);if(r.length){stop();onCode(r[0].rawValue);return}}catch(e){}await new Promise(r=>setTimeout(r,250))}}

// ---------- Olaylar ----------
document.addEventListener("click",e=>{const t=s=>e.target.closest(s);let el;
  if(el=t("[data-add]")){const g=GI[el.dataset.add];if(g){cart=inCart(g)?cart.filter(x=>GI[x]!==g):[...cart,g.key];save("cart",cart);redraw()}}
  else if(el=t("[data-map]")){bmap[pending]=el.dataset.map;save("bmap",bmap);only=el.dataset.map;pending=null;redraw();note("Barkod eşleştirildi. Bir dahaki okutmada ürün doğrudan açılır.")}
  else if(t("[data-cancel]")){pending=null;redraw()}
  else if(t("a")){}
  else if(el=t("[data-page]")){({C,K,B})[el.dataset.pg].page=+el.dataset.page;redraw();scrollTo(0,0)}
  else if(el=t("[data-show]"))show(el.dataset.show);
  else if(el=t("[data-seg]")){C.seg=el.dataset.seg;C.page=0;if(el.dataset.open)go("compare");else redraw()}
  else if(el=t("[data-kind]")){K.kind=el.dataset.kind;K.page=0;redraw()}
  else if(el=t("[data-km]")){K.m=el.dataset.km;K.page=0;redraw()}
  else if(el=t("[data-go]")){Object.assign(B,{m:"",cat:"",disc:true,sort:"disc",page:0});go("browse")}
  else if(el=t("[data-bm]")){B.m=el.dataset.bm;B.page=0;if(el.dataset.open){Object.assign(B,{cat:"",disc:false,sort:"disc"});go("browse")}else redraw()}
  else if(el=t("[data-view]")){if(el.dataset.view==="search"){only=null}go(el.dataset.view);if(el.dataset.focus)$("q").focus()}});
$("q").oninput=()=>{only=null;drawS();icons()};
$("q").onchange=()=>{const v=$("q").value.trim();if(/^\d{8,14}$/.test(v))onCode(v)};
$("scan").onclick=scan;
const bind=(id,obj,key,prop)=>$(id).onchange=e=>{obj[key]=e.target[prop||"value"];obj.page=0;redraw()};
bind("bCat",B,"cat");bind("bSort",B,"sort");bind("bDisc",B,"disc","checked");
bind("cSort",C,"sort");bind("cThree",C,"three","checked");bind("kSort",K,"sort");

// ---------- Veri ----------
// Her market kendi dosyasından; o market için dosya henüz yoksa eski ortak dosyadan
const get=u=>fetch(u,{cache:"no-cache"}).then(r=>r.ok?r.json():null).catch(()=>null);
const rowsOf=(d,onlyM)=>(d&&d.products||[]).map(r=>{
  if(!Array.isArray(r))return r;const m=r[0].split(":")[0],p=(d.prefix||{})[m]||{},cs=(d.cats||{})[m]||[];
  return{id:r[0],market:m,name:r[1],price:r[2],regular:r[3],in_stock:!!r[4],image:r[5]?(p.image||"")+r[5]:"",url:r[6]?(p.url||"")+r[6]:"",cat:typeof r[7]==="number"?cs[r[7]]||"":"",promo:r[8]||""}}).filter(o=>!onlyM||o.market===onlyM);
function build(rows){
  O=rows;O.forEach(o=>{o.cat=categoryOf(o);o._promo=promoOf(o)});
  G=MF.group(O);
  G.forEach(g=>{g.offers.sort((a,b)=>ORD.indexOf(a.market)-ORD.indexOf(b.market));g.key=g.offers[0].id;g.name=g.offers[0].name;g.image=(g.offers.find(o=>o.image)||{}).image;
    g.s=norm(g.offers.map(o=>o.name).join(" "));g.offers.forEach(o=>GI[o.id]=g)});
  PROMO=O.filter(o=>o._promo&&o.in_stock);
  buildCompare();
}
go("home");
Promise.all([Promise.all(ORD.map(m=>get(`data/${m}.json`))),Promise.all(ORD.map(m=>get(`data/status-${m}.json`)))]).then(async([files,statuses])=>{
  statuses.forEach((s,i)=>{if(s)CHECK[ORD[i]]=s});
  let rows=[];const miss=[];
  files.forEach((d,i)=>{if(d){rows.push(...rowsOf(d));UPD[ORD[i]]=d.updated}else miss.push(ORD[i])});
  if(miss.length){const old=await get("data/products.json");miss.forEach(m=>{const r=rowsOf(old,m);if(r.length){rows.push(...r);UPD[m]=old.updated}})}
  if(!rows.length)throw new Error("veri yok");
  updated=Object.values(UPD).sort().pop();
  build(rows);redraw();
}).catch(e=>{note("Fiyat verisi yüklenemedi: "+e.message)});
