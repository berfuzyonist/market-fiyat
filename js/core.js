// Veri okuma, kampanya/indirim kuralları ve fiyat kontrolü yardımcıları.
// DOM kullanmaz; tarayıcıda window.MFC, Node'da (testler) require ile çalışır.
(function(root){
const FOLD={"ç":"c","ğ":"g","ı":"i","ö":"o","ş":"s","ü":"u","â":"a","î":"i","û":"u"};
const fold=s=>String(s||"").toLocaleLowerCase("tr").replace(/[çğıöşüâîû]/g,c=>FOLD[c]);
const REPO="berfuzyonist/market-fiyat";
const MARKETS={migros:"Migros",sok:"Şok",bim:"BİM"};
const MONEY="Money kartlı fiyat";
const STALE_HOURS=48;   // bu süreden eski doğrulanmış indirim "güncel indirim" sayılmaz
const BIM_ACTIVE_DAYS=21;

// Ürün satırı: ad çözümlemesi (_p: marka, boy, kelimeler) ilk kullanıldığında yapılır. Açılışta 22 bin
// ürünün hepsini çözümlemek telefonda saniyeler alıyordu; çoğu ekran yalnızca bir kısmına bakar.
const parseName=n=>(root.MF||require("./match.js")).parse(n);
const ROW={get _p(){const v=parseName(this.name);Object.defineProperty(this,"_p",{value:v,writable:true,configurable:true});return v},
  set _p(v){Object.defineProperty(this,"_p",{value:v,writable:true,configurable:true})}};
const row=o=>Object.assign(Object.create(ROW),o);

const toTs=v=>{if(typeof v==="number")return v;const t=Date.parse(v||"");return isNaN(t)?null:Math.floor(t/1000)};

// Market veri dosyasındaki dizi satırlarını nesneye çevirir; geçersiz fiyatlı satırı atar,
// normal fiyatı güncel fiyattan düşük satırda indirim üretmez.
function rowsOf(d){
  if(!d||!Array.isArray(d.products))return[];
  const fields=Array.isArray(d.fields)?d.fields:["id","name","price","regular","in_stock","image","url","cat","promo","seen"];
  const at=Object.fromEntries(fields.map((f,i)=>[f,i])),upd=toTs(d.updated),out=[];
  for(const r of d.products){
    const x=Array.isArray(r)?r:null;if(!x)continue;
    const id=String(x[at.id]||""),m=id.split(":")[0];if(!id||!m)continue;
    const p=(d.prefix||{})[m]||{},cs=(d.cats||{})[m]||[];
    const price=Number(x[at.price]);let regular=Number(x[at.regular]);
    if(!isFinite(price)||price<=0||!String(x[at.name]||"").trim())continue;
    if(!isFinite(regular)||regular<price)regular=price;
    const seen=at.seen!=null&&Number.isInteger(x[at.seen])?x[at.seen]:upd;
    const raw=String(x[at.promo]||""),money=raw.includes(MONEY);
    const promo=raw.split(" · ").filter(s=>s&&s!==MONEY).join(" · ");
    out.push(row({id,market:m,name:String(x[at.name]),price,regular,in_stock:!!x[at.in_stock],
      image:x[at.image]?(p.image||"")+x[at.image]:"",url:x[at.url]?(p.url||"")+x[at.url]:"",
      cat:typeof x[at.cat]==="number"?cs[x[at.cat]]||"":"",promo,money,seen}));
  }
  return out;
}

// Bölünmüş veri (data/client): katalog (id, ad, görsel, adres, kategori; seyrek değişir, önbellekte
// tutulur) + fiyat dosyası (aynı sırada fiyat, etiket fiyatı, stok, kampanya, doğrulama zamanı; her
// yayımda değişir). İki dosya aynı katalog sürümüne ait değilse null döner (çağıran tam dosyaya düşer).
function rowsFromSplit(cat,pr){
  if(!cat||!pr||!Array.isArray(cat.products)||!Array.isArray(pr.products))return null;
  if(!cat.v||cat.v!==pr.catalog||cat.products.length!==pr.products.length)return null;
  const P=pr.products,base=pr.base||0,out=[];
  const rows=cat.products.map((c,i)=>{const q=P[i];
    // fiyat dosyası: [fiyat, etiket fiyatı (0 = fiyatla aynı), stok, kampanya, doğrulama - base (sn)]
    return[c[0],c[1],q[0],q[1]||q[0],q[2],c[2],c[3],c[4],q[3],q[4]==null?null:base+q[4]]});
  return rowsOf({updated:pr.updated,prefix:cat.prefix,cats:cat.cats,
    fields:["id","name","price","regular","in_stock","image","url","cat","promo","seen"],products:rows});
}

// promo metninden kampanya türü ve "tanesi kaça gelir" hesabı
function promoOf(o){
  const t=(o.promo||"").trim();if(!t)return null;const f=fold(t);let m;
  // sub: "free" = bedava ürünlü (X Al Y Öde, X Alana Y Bedava), "nth" = 2. ürün indirimli
  if(m=f.match(/(\d+)\s*al\s*(\d+)\s*ode/))return{kind:"multi",sub:"free",label:`${m[1]} Al ${m[2]} Öde`,need:+m[1],eff:o.price*m[2]/m[1]};
  if(m=f.match(/(\d+)\s*alana\s*(\d+)\s*bedava/)){const n=+m[1]+ +m[2];return{kind:"multi",sub:"free",label:`${m[1]} Alana ${m[2]} Bedava`,need:n,eff:o.price*m[1]/n}}
  if(m=f.match(/(\d+)\.\s*si\s*%\s*(\d+)/))return{kind:"multi",sub:"nth",label:`${m[1]}. ürün %${m[2]} indirimli`,need:+m[1],eff:o.price*(m[1]-m[2]/100)/m[1]};
  if(m=f.match(/(\d+)\s*tl ve uzeri alisveriste\s*(\d+(?:[.,]\d+)?)\s*tl/)){const p=parseFloat(m[2].replace(",","."));return{kind:"basket",label:`${m[1]} TL üzeri sepette`,need:1,eff:p,min:+m[1]}}
  if(m=f.match(/sepette\s*%?\s*(\d{1,2})\s*(?:indirimli|indirim)?/))return{kind:"basket",label:t,need:1,eff:o.price,percent:+m[1]};
  if(/^(aktuel|indirim)/.test(f))return{kind:"bim",label:t,need:1,eff:o.price};
  return{kind:"other",label:t,need:1,eff:o.price};
}

// BİM aktüel/indirim etiketinden satış dönemi: "Aktüel · 24 Kasım Salı", "İndirim · 03-30 Kasım"
const AY=["ocak","subat","mart","nisan","mayis","haziran","temmuz","agustos","eylul","ekim","kasim","aralik"];
function nearDate(day,mon,today){
  let best=null;for(const y of [today.getFullYear()-1,today.getFullYear(),today.getFullYear()+1]){
    const d=new Date(y,mon,day);if(!best||Math.abs(d-today)<Math.abs(best-today))best=d}
  return best;
}
function bimWhen(label,now){
  const today=new Date(now||Date.now());today.setHours(0,0,0,0);
  const f=fold(label);let m;
  const mon=w=>AY.indexOf(w);
  if(m=f.match(/(\d{1,2})\s*([a-z]+)?\s*-\s*(\d{1,2})\s+([a-z]+)/)){
    const m2=mon(m[4]),m1=m[2]&&mon(m[2])>=0?mon(m[2]):m2;if(m2<0)return null;
    let s=nearDate(+m[1],m1,today),e=nearDate(+m[3],m2,today);if(e<s)s=new Date(s.getFullYear()-1,m1,+m[1]);
    const state=today<s?"soon":today>e?"expired":"active";
    return{state,start:s,end:e};
  }
  if(m=f.match(/(\d{1,2})\s+([a-z]+)/)){
    const mi=mon(m[2]);if(mi<0)return null;const s=nearDate(+m[1],mi,today);
    const age=(today-s)/864e5;
    return{state:today<s?"soon":age>BIM_ACTIVE_DAYS?"old":"active",start:s,end:null};
  }
  return null;
}

// Ürün satırına market dışı kuralları uygular: BİM satış dönemi, eski doğrulama, kullanıcı kontrolü.
function enrich(o,opt){
  const now=(opt&&opt.now)||Date.now(),checks=(opt&&opt.checks)||{};
  const c=checks[o.id],cts=c?toTs(c.checked_at):null;
  if(c&&cts&&(!o.seen||cts>o.seen)){
    if((c.status==="updated"||c.status==="unchanged")&&c.new_price>0){
      o.price=c.new_price;o.regular=Math.max(c.new_regular||c.new_price,c.new_price);
      if(typeof c.in_stock==="boolean")o.in_stock=c.in_stock;o.seen=cts;o.checked=c;
    }else if(c.status==="failed")o.checkFail=c;
  }else if(c&&(c.status==="updated"||c.status==="unchanged"))o.checked=c;
  o.when=null;o.na="";
  if(o.market==="bim"&&o.promo){const w=bimWhen(o.promo,now);o.when=w;
    if(w&&w.state==="soon")o.na="soon";else if(w&&(w.state==="expired"||w.state==="old"))o.na="ended"}
  o.stale=!!(o.seen&&now/1000-o.seen>STALE_HOURS*3600);
  return o;
}
const usable=o=>o.in_stock&&!o.na;
// İndirim yalnızca normal fiyat güncel ve geçerliyken gösterilir.
const disc=o=>usable(o)&&!o.stale&&o.regular>o.price&&o.price>0?1-o.price/o.regular:0;

function ago(ts,now){
  if(!ts)return"";const s=Math.max(0,Math.floor((now||Date.now())/1000)-ts);
  if(s<90)return"az önce";if(s<3600)return Math.round(s/60)+" dk önce";if(s<86400)return Math.round(s/3600)+" sa önce";
  return Math.round(s/86400)+" gün önce";
}

// "Fiyatı Güncelle" bağlantısı: ürün bilgisi gizli işaret olarak talep gövdesine yazılır.
function priceUpdateLink(o){
  if(!o||!MARKETS[o.market]||typeof o.id!=="string"||!o.id.startsWith(o.market+":")||!String(o.name||"").trim())return"";
  const marker={market:o.market,id:o.id,name:o.name};
  const title=`[FİYAT GÜNCELLE] ${MARKETS[o.market]} · ${o.name}`.slice(0,240);
  const body="Bu talep Market Fiyat uygulamasından oluşturuldu. Göndermek için aşağıdaki **Create** düğmesine basın.\n\n"+
    "GitHub Actions yalnızca bu ürünü marketin herkese açık sayfasından kontrol eder (tüm katalog taranmaz) ve sonucu bu talebe yorum olarak yazar. "+
    "Doğrulanamayan fiyat yayımlanmaz; mevcut fiyat korunur.\n\n"+
    "<!-- market-fiyat-price-update\n"+JSON.stringify(marker)+"\n-->\n";
  return`https://github.com/${REPO}/issues/new?`+new URLSearchParams({title,body}).toString();
}

// "Fiyat güncel mi?": hesap gerektirmez, hiçbir şey kaydetmez. Market siteleri tarayıcıdan
// okunmaya izin vermediği (CORS) için canlı sorgu yapılamaz; karar, fiyatın marketin sitesinden
// en son ne zaman doğrulandığına ve marketin son tarama sonucuna göre verilir.
const FRESH_HOURS=6,LIKELY_HOURS=30;
function freshness(o,status,now){
  now=now||Date.now();
  const age=o.seen?(now/1000-o.seen)/3600:null,when=ago(o.seen,now);
  const failed=status&&status.status&&status.status!=="tamam"&&!status.partial;
  const failTxt=failed?" Marketin son otomatik taraması başarısız oldu; yeni fiyat alınamadı, son doğrulanan fiyat gösteriliyor.":"";
  if(o.na==="soon")return{level:"na",title:"Henüz satışta değil",text:"Bu BİM aktüel ürünü ileri tarihte satışa çıkacak. Fiyat BİM'in duyurduğu fiyattır."};
  if(o.na==="ended")return{level:"old",title:"Satış dönemi geçmiş",text:"Bu BİM kampanyasının süresi dolmuş veya ürün tükenmiş olabilir. Mağazada fiyat farklı olabilir."};
  if(age==null)return{level:"old",title:"Doğrulama zamanı bilinmiyor",text:"Bu fiyatın ne zaman alındığı kayıtlı değil. Marketin sayfasından kontrol edin."+failTxt};
  if(age<=FRESH_HOURS)return{level:"ok",title:"Güncel",text:`Fiyat ${when} marketin sitesinden doğrulandı.`+failTxt};
  if(age<=LIKELY_HOURS)return{level:"likely",title:"Büyük olasılıkla güncel",text:`Fiyat en son ${when} doğrulandı. Market gün içinde fiyat değiştirmiş olabilir.`+failTxt};
  return{level:"old",title:"Eski olabilir",text:`Fiyat en son ${when} doğrulandı. Güncel olmayabilir; marketin sayfasından kontrol edin.`+failTxt};
}

// ---------- Arama alakası ----------
// Arama Türkçe karaktersiz eşleşir ("sut" → "süt"). Sıralama: kelimenin ürün adında tek başına geçmesi
// ("Domates"), çekim eki ("Yağı") > türetme ("Yumurtalı", "Sütlü") > kelime içinde geçme; adda başa yakınlık,
// kategoride geçme ve kısa ad öne çıkar; sorguda olmayan işlenmiş ürün kelimeleri ("Püresi", "Patlağı") geriye düşer.
const INFL=new Set(["i","u","si","su","in","un","ler","lar","leri","lari","e","a","de","da"]);
const DERIV=/^(li|lu|lik|luk|siz|suz|ci|cu|cik|cuk|cigi|lugu|ligi)$/;
const PROCESSED=new Set(["puresi","salcasi","sosu","soslu","suyu","cipsi","aromali","kurusu","konservesi","receli","ezmesi",
  "patlagi","patlakli","krakeri","gofret","gofreti","keki","bar","bari","unu","nisastasi","tozu","kremasi","kremali","dolgulu","kaplamali","tatli","tatlisi",
  // ürünün kendisi değil, ilgili eşya ya da başka ürün: "Pirinç Süzgeci", "Su Kovası", "Peynir Mayası"
  "suzgec","suzgeci","kova","kovasi","paspas","maske","maskesi","mayasi","cesnisi","cesnili","harci","ozlu","surpriz","surprise","joy","oyuncakli","kafalar","boregi","emici"]);
const searchWords=q=>fold(q).replace(/[^a-z0-9%]+/g," ").split(" ").filter(Boolean);
function searchScore(name,cat,words){
  const f=fold(name).replace(/[^a-z0-9%]+/g," "),toks=f.split(" ").filter(Boolean);
  if(!words.length||!words.every(w=>f.includes(w)))return-1;
  let score=0;const fc=fold(cat||"");
  for(const w of words){let best=0,at=99;
    toks.forEach((t,i)=>{let v=0;
      if(t===w)v=10;else if(t.startsWith(w)){const rest=t.slice(w.length);v=INFL.has(rest)?8:DERIV.test(rest)?2:1}else if(t.includes(w))v=0.5;
      if(v>best||(v===best&&v&&i<at)){best=v;at=i}});
    score+=best+(best>=8?Math.max(0,3-at):0)+(fc.includes(w)?4:0)}
  const words2=toks.filter(t=>!/^\d|^%/.test(t)&&!/^(g|gr|kg|ml|l|lt|cl|adet)$/.test(t));
  for(const t of words2)if(PROCESSED.has(t)&&!words.includes(t))score-=4;
  // Türkçe ad öbeğinde asıl ürün sondaki addır: "Kahverengi Yumurta" ✓, "Pirinç Süzgeci" ✗
  const head=words2[words2.length-1]||"";
  if(words.some(w=>head===w||(head.startsWith(w)&&INFL.has(head.slice(w.length)))))score+=3;
  return score-words2.length*0.4;
}

// ---------- Fiyat geçmişi analizi ----------
// points: [[ts, fiyat, etiket fiyatı, kaynak, kampanya], ...] (history-<market>.json). Ürünün şu anki durumu
// son noktadan farklıysa sona eklenir. Dönen: seri, en düşük/en yüksek, olaylar (indirim başladı/bitti,
// kampanya geldi/bitti, etiket fiyatı arttı/düştü) ve her türün son tarihi.
const cleanPromo=t=>String(t||"").split(" · ").filter(x=>x&&x!==MONEY).join(" · ");
function histInfo(points,o,now){
  const P=(Array.isArray(points)?points:[]).filter(p=>Array.isArray(p)&&p.length>=3&&p[1]>0).map(p=>({ts:p[0],price:+p[1],regular:Math.max(+p[2],+p[1]),promo:cleanPromo(p[4])}))
    .sort((a,b)=>a.ts-b.ts);
  if(o&&o.price>0){const cur={ts:o.seen||Math.floor((now||Date.now())/1000),price:o.price,regular:Math.max(o.regular||o.price,o.price),promo:cleanPromo(o.promo)};
    const last=P[P.length-1];
    if(!last||Math.abs(last.price-cur.price)>=0.005||Math.abs(last.regular-cur.regular)>=0.005||last.promo!==cur.promo){if(!last||cur.ts>last.ts)P.push(cur)}}
  if(!P.length)return null;
  const isD=p=>p.regular>p.price+0.005,ev=[];
  for(let i=0;i<P.length;i++){const c=P[i],p=P[i-1];
    if(!p){if(isD(c))ev.push({ts:c.ts,type:"disc",pct:Math.round((1-c.price/c.regular)*100),from:c.regular,to:c.price,first:true});
      if(c.promo)ev.push({ts:c.ts,type:"promo",text:c.promo,first:true});continue}
    if(isD(c)&&(!isD(p)||Math.abs(c.price-p.price)>=0.005))ev.push({ts:c.ts,type:"disc",pct:Math.round((1-c.price/c.regular)*100),from:c.regular,to:c.price});
    else if(!isD(c)&&isD(p))ev.push({ts:c.ts,type:"discEnd",to:c.price});
    if(Math.abs(c.regular-p.regular)>=0.005)ev.push({ts:c.ts,type:c.regular>p.regular?"hike":"cut",from:p.regular,to:c.regular,pct:Math.round((c.regular/p.regular-1)*100)});
    if(c.promo&&c.promo!==p.promo)ev.push({ts:c.ts,type:"promo",text:c.promo});
    else if(!c.promo&&p.promo)ev.push({ts:c.ts,type:"promoEnd",text:p.promo})}
  const prices=P.map(p=>p.price),lo=Math.min(...prices),hi=Math.max(...prices),cur=P[P.length-1];
  const lastOf=t=>{for(let i=ev.length-1;i>=0;i--)if(ev[i].type===t)return ev[i];return null};
  return{points:P,low:lo,high:hi,lowTs:P.find(p=>p.price===lo).ts,highTs:P.find(p=>p.price===hi).ts,changes:P.length-1,
    atLow:P.length>1&&cur.price<=lo+0.005&&hi>lo+0.005,events:ev,lastDisc:lastOf("disc"),lastPromo:lastOf("promo"),lastHike:lastOf("hike")};
}

const api={rowsFromSplit,histInfo,searchWords,searchScore,fold,toTs,rowsOf,promoOf,bimWhen,enrich,usable,disc,ago,priceUpdateLink,freshness,MONEY,STALE_HOURS};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MFC=api;
})(typeof window!=="undefined"?window:globalThis);
