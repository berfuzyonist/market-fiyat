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
    out.push({id,market:m,name:String(x[at.name]),price,regular,in_stock:!!x[at.in_stock],
      image:x[at.image]?(p.image||"")+x[at.image]:"",url:x[at.url]?(p.url||"")+x[at.url]:"",
      cat:typeof x[at.cat]==="number"?cs[x[at.cat]]||"":"",promo,money,seen});
  }
  return out;
}

// promo metninden kampanya türü ve "tanesi kaça gelir" hesabı
function promoOf(o){
  const t=(o.promo||"").trim();if(!t)return null;const f=fold(t);let m;
  if(m=f.match(/(\d+)\s*al\s*(\d+)\s*ode/))return{kind:"multi",label:t,need:+m[1],eff:o.price*m[2]/m[1]};
  if(m=f.match(/(\d+)\s*alana\s*(\d+)\s*bedava/)){const n=+m[1]+ +m[2];return{kind:"multi",label:`${m[1]} Alana ${m[2]} Bedava`,need:n,eff:o.price*m[1]/n}}
  if(m=f.match(/(\d+)\.\s*si\s*%\s*(\d+)/))return{kind:"multi",label:t,need:+m[1],eff:o.price*(m[1]-m[2]/100)/m[1]};
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

const api={fold,toTs,rowsOf,promoOf,bimWhen,enrich,usable,disc,ago,priceUpdateLink,freshness,MONEY,STALE_HOURS};
if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.MFC=api;
})(typeof window!=="undefined"?window:globalThis);
