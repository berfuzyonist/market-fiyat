// node --test tests/js  — js/core.js için testler (DOM gerekmez)
const test=require("node:test");
const assert=require("node:assert/strict");
const C=require("../../js/core.js");

const NOW=Date.parse("2026-11-21T09:00:00+03:00");
const fields=["id","name","price","regular","in_stock","image","url","cat","promo","seen"];
const file=rows=>({updated:"2026-11-21T05:00:00+00:00",fields,prefix:{sok:{image:"https://i/",url:"https://www.sokmarket.com.tr/"}},cats:{sok:["İçecek"]},products:rows});

test("satırlar nesneye çevrilir, önek ve kategori uygulanır",()=>{
  const [o]=C.rowsOf(file([["sok:1","Su 1 L",5,6,1,"a.jpg","su-p-1",0,"",1795200000]]));
  assert.equal(o.market,"sok");assert.equal(o.image,"https://i/a.jpg");assert.equal(o.url,"https://www.sokmarket.com.tr/su-p-1");
  assert.equal(o.cat,"İçecek");assert.equal(o.seen,1795200000);
});
test("eksik/bozuk veri: geçersiz fiyat atılır, normal fiyat düşükse indirim yok, seen yoksa dosya zamanı",()=>{
  const r=C.rowsOf(file([["sok:1","A",0,1,1,"","",0,""],["sok:2","",5,5,1,"","",0,""],["sok:3","B","x",1,1,"","",0,""],["sok:4","C",10,8,1,"","",0,""]]));
  assert.deepEqual(r.map(o=>o.id),["sok:4"]);assert.equal(r[0].regular,10);
  assert.equal(r[0].seen,Date.parse("2026-11-21T05:00:00Z")/1000);
  assert.deepEqual(C.rowsOf(null),[]);assert.deepEqual(C.rowsOf({}),[]);
});
test("eski 9 sütunlu dosyalar okunur",()=>{
  const d=file([["sok:1","A",3,4,1,"","",0,"2 Al 1 Öde"]]);d.fields=fields.slice(0,9);
  const [o]=C.rowsOf(d);assert.equal(o.promo,"2 Al 1 Öde");assert.ok(o.seen>0);
});
test("Money işareti kampanya metninden ayrılır",()=>{
  const [o]=C.rowsOf(file([["migros:1","Pirinç",129.95,199.95,1,"","",0,"2 Al 1 Öde · Money kartlı fiyat",null]]));
  assert.equal(o.money,true);assert.equal(o.promo,"2 Al 1 Öde");
});
test("indirim hesabı",()=>{
  const o=C.enrich({id:"sok:1",market:"sok",price:75,regular:100,in_stock:true,seen:NOW/1000-60},{now:NOW});
  assert.equal(C.disc(o),0.25);
  assert.equal(C.disc(C.enrich({id:"sok:2",market:"sok",price:100,regular:100,in_stock:true,seen:NOW/1000},{now:NOW})),0);
  assert.equal(C.disc(C.enrich({id:"sok:3",market:"sok",price:75,regular:100,in_stock:false,seen:NOW/1000},{now:NOW})),0,"stokta yoksa indirim listesine girmez");
});
test("48 saatten eski doğrulamada indirim gösterilmez",()=>{
  const o=C.enrich({id:"sok:1",market:"sok",price:75,regular:100,in_stock:true,seen:NOW/1000-49*3600},{now:NOW});
  assert.equal(o.stale,true);assert.equal(C.disc(o),0);
});
test("BİM satış dönemi: yakında / aktif / süresi dolmuş / eski",()=>{
  assert.equal(C.bimWhen("Aktüel · 24 Kasım Salı",NOW).state,"soon");
  assert.equal(C.bimWhen("Aktüel · 20 Kasım Cuma",NOW).state,"active");
  assert.equal(C.bimWhen("İndirim · 03-30 Kasım",NOW).state,"active");
  assert.equal(C.bimWhen("İndirim · 14-20 Kasım",NOW).state,"expired");
  assert.equal(C.bimWhen("Aktüel · 20 Ekim Salı",NOW).state,"old");
  assert.equal(C.bimWhen("İndirim · 28 Kasım - 4 Aralık",NOW).state,"soon");
  assert.equal(C.bimWhen("Aktüel · 2 Ocak Cuma",Date.parse("2026-12-30T12:00:00+03:00")).state,"soon","yıl dönümü");
  assert.equal(C.bimWhen("etiket yok",NOW),null);
  const o=C.enrich({id:"bim:x",market:"bim",price:10,regular:10,in_stock:true,promo:"Aktüel · 24 Kasım Salı",seen:NOW/1000},{now:NOW});
  assert.equal(o.na,"soon");assert.equal(C.usable(o),false);
  const e=C.enrich({id:"bim:y",market:"bim",price:10,regular:12,in_stock:true,promo:"İndirim · 14-20 Kasım",seen:NOW/1000},{now:NOW});
  assert.equal(e.na,"ended");assert.equal(C.disc(e),0,"süresi geçmiş kampanya indirimde gösterilmez");
});
test("kampanya türleri",()=>{
  const p=t=>C.promoOf({promo:t,price:10});
  assert.equal(p("2 Al 1 Öde").eff,5);
  assert.equal(p("1 ALANA 1 BEDAVA").need,2);
  assert.equal(p("2.si %50").eff,7.5);
  assert.equal(p("200 TL ve üzeri alışverişte 8,90 TL").kind,"basket");
  assert.equal(p(""),null);
});
test("kullanıcı kontrolü daha yeniyse fiyat üzerine yazılır, eskiyse yazılmaz, başarısızsa işaretlenir",()=>{
  const seen=NOW/1000-3600;
  const base=()=>({id:"sok:1",market:"sok",price:10,regular:10,in_stock:true,seen});
  const newer={status:"updated",checked_at:new Date(NOW-60e3).toISOString(),new_price:12,new_regular:12,in_stock:true};
  let o=C.enrich(base(),{now:NOW,checks:{"sok:1":newer}});assert.equal(o.price,12);assert.ok(o.checked);
  const older={...newer,checked_at:new Date(NOW-7200e3).toISOString()};
  o=C.enrich(base(),{now:NOW,checks:{"sok:1":older}});assert.equal(o.price,10);
  o=C.enrich(base(),{now:NOW,checks:{"sok:1":{status:"failed",checked_at:newer.checked_at,message:"403"}}});
  assert.equal(o.price,10);assert.equal(o.checkFail.message,"403");
});
test("Fiyatı Güncelle bağlantısı: doğru kodlama ve gizli işaret",()=>{
  const u=new URL(C.priceUpdateLink({market:"sok",id:"sok:10",name:"Çay & Şeker \"Özel\" <1 kg>"}));
  assert.equal(u.origin+u.pathname,"https://github.com/berfuzyonist/market-fiyat/issues/new");
  const title=u.searchParams.get("title"),body=u.searchParams.get("body");
  assert.ok(title.startsWith("[FİYAT GÜNCELLE] Şok · Çay & Şeker"));
  const marker=JSON.parse(body.match(/market-fiyat-price-update\n(\{.*\})\n-->/)[1]);
  assert.deepEqual(marker,{market:"sok",id:"sok:10",name:"Çay & Şeker \"Özel\" <1 kg>"});
});
test("eksik veya hatalı ürünle talep bağlantısı üretilmez",()=>{
  for(const o of [null,{},{market:"a101",id:"a101:1",name:"x"},{market:"sok",id:"migros:1",name:"x"},{market:"sok",id:"sok:1",name:"  "}])
    assert.equal(C.priceUpdateLink(o),"");
});
test("göreli zaman",()=>{
  assert.equal(C.ago(NOW/1000-30,NOW),"az önce");assert.equal(C.ago(NOW/1000-7200,NOW),"2 sa önce");assert.equal(C.ago(null,NOW),"");
});
test("Fiyat güncel mi: doğrulama yaşına ve tarama durumuna göre karar, hiçbir şey yazmaz",()=>{
  const o=h=>C.enrich({id:"sok:1",market:"sok",price:10,regular:10,in_stock:true,seen:NOW/1000-h*3600},{now:NOW});
  assert.equal(C.freshness(o(1),{status:"tamam"},NOW).level,"ok");
  assert.match(C.freshness(o(1),{status:"tamam"},NOW).text,/1 sa önce/);
  assert.equal(C.freshness(o(12),{status:"tamam"},NOW).level,"likely");
  assert.equal(C.freshness(o(40),{status:"tamam"},NOW).level,"old");
  assert.match(C.freshness(o(1),{status:"durduruldu: 403"},NOW).text,/başarısız/);
  assert.equal(C.freshness({...o(1),seen:null},null,NOW).level,"old");
  const soon=C.enrich({id:"bim:x",market:"bim",price:10,regular:10,in_stock:true,promo:"Aktüel · 24 Kasım Salı",seen:NOW/1000},{now:NOW});
  assert.equal(C.freshness(soon,null,NOW).level,"na");
  const before=JSON.stringify(o(1));C.freshness(o(1),null,NOW);assert.equal(JSON.stringify(o(1)),before);
});
test("birim fiyat karşılaştırması: boy boy en ucuz, ilgisiz ürün ve aykırı fiyat dışarıda",()=>{
  const MF=require("../../js/match.js");
  const mk=(id,market,name,price)=>({id,market,name,price,regular:price,in_stock:true});
  const rows=[mk("sok:1","sok","Saka Su 5 L",50),mk("migros:2","migros","Erikli Su 0.5 L",10),mk("sok:3","sok","Kardelen Su 0.5 lt",7),
    mk("migros:4","migros","Erikli Su 6 x 1,5 L",180),mk("migros:5","migros","Sıcak Su Torbası 2 L",400),mk("migros:6","migros","Sucuk 500 g",300),
    mk("migros:7","migros","Bee Home Su Şişesi 1.650 Ml",220)];
  MF.group(rows);
  assert.deepEqual(MF.parse("Su Şişesi 1.650 Ml").qty,{n:1650,u:"ml"});
  const r=MF.unitCompare(rows,"su");
  assert.equal(r.unit,"L");assert.equal(r.best.o.id,"sok:1");assert.equal(r.best.u.v,10);
  assert.deepEqual(r.sizes.map(s=>s.label),["500 ml","5 L","6 × 1,5 L"]);
  assert.equal(r.sizes[0].best.o.id,"sok:3");
  // Boya dokununca o boydaki tüm markalar: birim fiyata göre sıralı
  assert.deepEqual(r.sizes[0].items.map(h=>h.o.id),["sok:3","migros:2"]);
  // Temel ürün sorgusunda dışlama listesi: "süt" boylarında kakaolu süt yok
  const milk=[mk("sok:10","sok","Pınar Süt 1 L",60),mk("migros:11","migros","Sek Süt 1 L",55),mk("migros:12","migros","Danone Kakaolu Süt 1 L",70)];
  MF.group(milk);
  assert.deepEqual(MF.unitCompare(milk,"süt").sizes[0].items.map(h=>h.o.id),["migros:11","sok:10"]);
  assert.equal(MF.unitCompare(rows,"çikolata"),null);
});
test("esnek eşleştirme: yazım farkları birleşir, farklı çeşitler birleşmez",()=>{
  const MF=require("../../js/match.js");
  const mk=(id,name,price)=>({id,market:id.split(":")[0],name,price,regular:price,in_stock:true});
  const pairs=[
    ["sok:1","Nescafe Gold 50 g Ekonomik Paket",200,"migros:1","Nescafe Gold 50 G",210,true],
    ["sok:2","Pepsi 1.5 L",50,"migros:2","Pepsi Kola 1,5 L",52,true],
    ["sok:3","Ülker O'lala Tiramisu 45 g",20,"migros:3","Ülker Olala Tiramisu Dolgulu Kek 45 G",21,true],
    ["sok:4","Head&Shoulders Şampuan Mentol 330 ml",150,"migros:4","Head & Shoulders Mentol Şampuan 330 Ml",155,true],
    ["sok:5","Hero Baby Organik Elma Şeftali 120 Gr",85,"migros:5","Hero Baby Organik Erik Püreli Kavanoz Mama 120 G",85,false],
    ["sok:6","Axe Black Deodorant 150 ml",300,"migros:6","Axe Black Vanilla Erkek Sprey Deodorant 150 Ml",230,false],
    ["sok:7","Anadolu Mutfağı Basmati Pirinç 1 kg",90,"migros:7","Anadolu Lezzetleri Gönen Baldo Pirinç 1 Kg",95,false],
    ["sok:8","Sensodyne Beyazlatıcı Diş Macunu 75 ml",240,"migros:8","Sensodyne Promine Onarım Beyazlatıcı Diş Macunu 75 Ml",440,false],
  ];
  for(const [a,an,ap,b,bn,bp,want] of pairs){
    const rows=[mk(a,an,ap),mk(b,bn,bp)];const G=MF.group(rows);
    assert.equal(G.length===1,want,`${an} <> ${bn}`);
  }
  // Karşılıklı en iyi aday: iki Migros adayından ayırt edici kelimesi tutan seçilir
  const rows=[mk("sok:9","Pepsi 1.5 L",50),mk("migros:9","Pepsi Kola 1,5 L",52),mk("migros:10","Pepsi Zero Sugar Kola 1,5 L",52)];
  const G=MF.group(rows);const g=G.find(x=>x.offers.some(o=>o.id==="sok:9"));
  assert.deepEqual(g.offers.map(o=>o.id).sort(),["migros:9","sok:9"]);
});
test("bedava ürünlü kampanyalar ayrı türde",()=>{
  const p=t=>C.promoOf({promo:t,price:100});
  assert.equal(p("1 ALANA 1 BEDAVA").sub,"free");assert.equal(p("1 ALANA 1 BEDAVA").eff,50);
  assert.equal(p("2 Al 1 Öde").sub,"free");assert.equal(p("3 Al 2 Öde").eff.toFixed(2),"66.67");
  assert.equal(p("2.si %50").sub,"nth");assert.equal(p("2.si %50").label,"2. ürün %50 indirimli");
});

test("arama: Türkçe karaktersiz eşleşir, asıl ürün türevlerinden önce gelir",()=>{
  const rank=(q,names)=>names.map(([n,c])=>({n,s:C.searchScore(n,c||"",C.searchWords(q))})).filter(x=>x.s>=0).sort((a,b)=>b.s-a.s).map(x=>x.n);
  assert.deepEqual(rank("domates",[["Tat Domates Püresi 200 g"],["Domates Salkım Kg","Meyve, Sebze"],["Kelebek Makarna"]]),["Domates Salkım Kg","Tat Domates Püresi 200 g"]);
  assert.equal(rank("yumurta",[["Filiz Yumurtalı Uzun Erişte 350 g"],["Keskinoğlu 10'lu Yumurta L"]])[0],"Keskinoğlu 10'lu Yumurta L");
  assert.equal(rank("pirinc",[["Ülker Piko Pirinç Patlağı 18 g"],["Anadolu Mutfağı Yerli Pilavlık Pirinç 2.5 kg"]])[0],"Anadolu Mutfağı Yerli Pilavlık Pirinç 2.5 kg");
  assert.equal(rank("süt",[["Biscolata Stix Sütlü 40 G"],["Pınar Süt %1 Yağlı 1 L","Süt, Kahvaltılık"]])[0],"Pınar Süt %1 Yağlı 1 L");
  assert.equal(rank("aycicek yagi",[["Evin Ayçiçek Yağı Pet 5 L"]]).length,1);
  assert.equal(C.searchScore("Çay",""," ".split(" ").filter(Boolean)),-1);
});

test("fiyat geçmişi: indirim, kampanya ve zam olayları, en düşük fiyat",()=>{
  const pts=[[100,20,20,"önceki",""],[200,15,20,"deals",""],[300,20,20,"full","2 Al 1 Öde"],[400,22,22,"full",""]];
  const h=C.histInfo(pts,{price:18,regular:22,promo:"Money kartlı fiyat",seen:500});
  assert.deepEqual(h.events.map(e=>e.type),["disc","discEnd","promo","hike","promoEnd","disc"]);
  assert.equal(h.lastDisc.ts,500);assert.equal(h.lastDisc.pct,18);assert.equal(h.lastPromo.text,"2 Al 1 Öde");assert.equal(h.lastHike.pct,10);
  assert.equal(h.low,15);assert.equal(h.high,22);assert.equal(h.points.length,5);assert.equal(h.atLow,false);
  assert.equal(C.histInfo([],{price:9,regular:9,seen:1}).changes,0);
  assert.equal(C.histInfo([[1,10,10,"",""],[2,8,8,"",""]],{price:8,regular:8,seen:3}).atLow,true);
});

test("aynı boyda diğer markalar: tür ve boy aynı, aromalı/kakaolu çeşit ve farklı boy dışarıda",()=>{
  const MF=require("../../js/match.js");
  const mk=(id,name,price)=>({id,market:id.split(":")[0],name,price,regular:price,in_stock:true});
  const rows=[mk("sok:1","Pınar Süt 1 L",60),mk("migros:2","Sek Süt 1 L",55),mk("migros:3","Mis Uht Süt Yağsız 1 L",36),
    mk("migros:4","Danone Kakaolu Süt 1 L",70),mk("migros:5","Sek Süt 500 ml",35),mk("sok:6","Pınar Yoğurt 1 kg",90)];
  MF.group(rows);
  assert.deepEqual(MF.sameSize(rows[0],rows).map(h=>h.o.id),["migros:3","migros:2"]);
  assert.equal(MF.sizeLabel(rows[0]._p.qty,rows[0]._p.size),"1 L");
});

test("eşleştirme güveni: birebir, çekirdek, esnek ve fiyat farkı", () => {
  const MF=require("../../js/match.js");const mk=(id,market,name,price)=>({id,market,name,price});
  const C=offers=>MF.confidence({offers});
  assert.strictEqual(C([mk(1,"sok","Ülker Çikolatalı Gofret 36 G",10)]),null);
  assert.strictEqual(C([mk(1,"sok","Ülker Çikolatalı Gofret 36 G",10),mk(2,"migros","Ülker Çikolatalı Gofret 36 g",11)]).level,"yuksek");
  assert.strictEqual(C([mk(1,"sok","Ülker Çikolatalı Gofret 36 G",10),mk(2,"migros","Ülker Çikolatalı Gofret 36 g",19)]).level,"iyi");
  const f=C([mk(1,"sok","Pınar Süt 1 L",30),mk(2,"migros","Pınar Tam Yağlı Süt 1 L",32)]);
  assert.ok(["iyi","orta"].includes(f.level)); assert.ok(f.why.length>0);
});

test("ek alanlar (marka, tartılı satış) bölünmüş veriden okunur; tartılı üründe birim fiyat kg başına", () => {
  const MF=require("../../js/match.js");
  const cat={v:"x",prefix:{},cats:{migros:["Meyve"]},fields:["id","name","image","url","cat","brand","sold"],
    products:[["migros:1","Muz Yerli Kg","","",0,"Migros","kg"],["migros:2","Su 1 L","","",0,null,null]]};
  const pr={catalog:"x",updated:"2026-01-01T00:00:00Z",base:0,products:[[69.9,0,1,"",5],[5,0,1,"",5]]};
  const [a,b]=C.rowsFromSplit(cat,pr);
  assert.equal(a.brand,"Migros"); assert.equal(a.sold,"kg"); assert.equal(b.brand,""); assert.equal(b.sold,"");
  assert.deepEqual(MF.unitPrice(a),{v:69.9,u:"kg",kind:"g"});
  assert.equal(MF.unitPrice(b).u,"L");
  // eski biçim (ek alansız) dosya da okunur
  const [c]=C.rowsOf({fields:["id","name","price","regular","in_stock","image","url","cat","promo","seen"],products:[["sok:1","Pınar Süt 1 L",10,10,1,"","",null,"",1]]});
  assert.equal(c.brand,""); assert.equal(c.sold,"");
});

test("esnek arama: eş anlamlı, ses değişimi, birleşik yazım, yazım hatası", () => {
  const C=require("../../js/core.js");
  const plan=w=>C.queryPlan(w,new Map([["yogurt",50],["yurt",1],["peynir",80],["tavugu",3]])," yogurt peynir tavugu yurt ");
  assert.ok(C.matchPlan("gedik pilic gogus 400 g",plan(["tavuk","gogus"]).plan));
  assert.ok(C.matchPlan("yayla tavuk gogsu fume kg",plan(["tavuk","gogus"]).plan));
  assert.ok(C.matchPlan("komili naturel sizma zeytin yagi 1 l",plan(["zeytinyagi"]).plan));
  const y=plan(["yourt"]);assert.deepEqual(y.fixed[0],["yourt","yogurt"]);assert.ok(C.matchPlan("pinar yogurt 1 kg",y.plan));
  assert.ok(!C.matchPlan("pinar sut 1 l",plan(["peynir"]).plan));
  assert.deepEqual(plan(["sut"]).fixed,[]); // kısa kelime düzeltilmez
});

test("benzer ürünler: aynı tür ve yakın boy, başka market; farklı çeşit ve tür elenir", () => {
  const MF=require("../../js/match.js");
  const rows=[["sok:1","sok","Anadolu Mutfağı Nohut 1 kg",60],["migros:1","migros","Migros Nohut 1000 G",63],
    ["migros:2","migros","Migros Kırmızı Mercimek 1 Kg",70],["bim:1","bim","Saban Nohut 5 kg",250],
    ["sok:2","sok","Pınar Süt 1 L",40],["migros:3","migros","Sek Laktozsuz Süt 1 L",45],["migros:4","migros","Sek Süt 1 L",44]]
    .map(([id,market,name,price])=>({id,market,name,price,in_stock:1}));
  MF.group(rows);const ix=MF.typeIndex(rows);
  const n=MF.similarIn(ix,rows[0]).map(x=>x.o.id);
  assert.deepEqual(n,["migros:1"]);                       // mercimek başka tür, 5 kg boy çok farklı
  const s=MF.similarIn(ix,rows[4]).map(x=>x.o.id);
  assert.deepEqual(s,["migros:4","migros:3"]);            // laktozsuz çeşit geride
});

test("bölüm: ad yanlış rafı düzeltir; yumurta aramasında sürpriz/oyuncak yumurta boy karşılaştırmasına girmez", () => {
  const MF=require("../../js/match.js");
  assert.equal(MF.deptOf("Kinder Surprise Yumurta 20 g","Kahvaltılık"),"atistirmalik");     // BİM rafı yanlış
  assert.equal(MF.deptOf("Anadolu Çiftliği M Yumurta 30'lu (53-63 g)","Et & Tavuk & Şarküteri"),"sut"); // Şok rafı
  assert.equal(MF.deptOf("Sonic Joy Süpriz Yumurta 17.5 g","Atıştırmalık"),"atistirmalik");
  assert.equal(MF.deptOf("Lisanslı Klasik Jumbo Sürpriz Yumurta","Kitap, Kırtasiye, Oyuncak"),"ev"); // oyuncak rafı kalır
  assert.equal(MF.deptOf("Filiz Yumurtalı Erişte 350 G","Temel Gıda"),"temel");
  assert.equal(MF.deptOf("Knorr Kremalı Tavuk Çorbası 65 G","Hazır Yemek, Meze"),"temel");
  // niyet: gıda baskın değilse bile gıda yeterliyse evcil düşer; tek bölüm yarıyı geçerse yalnız o
  assert.deepEqual([...MF.intentDepts(["evcil","evcil","evcil","et","et","temel"])],["et"]);
  assert.deepEqual([...MF.intentDepts(["evcil","evcil","evcil","et","temel","donuk"])].sort(),["donuk","et","temel"]);
  assert.deepEqual([...MF.intentDepts(["sut","sut","sut","atistirmalik","ev"])],["sut"]);
  assert.equal(MF.intentDepts(["temizlik","bakim","ev"]),null);
  const mk=(id,name,price,cat)=>({id,market:id.split(":")[0],name,price,regular:price,in_stock:1,cat});
  const rows=[mk("migros:1","Keskinoğlu M Orta Boy Yumurta 10'lu (53-62 G)",90,"Süt, Kahvaltılık"),
    mk("sok:1","Anadolu Çiftliği L Yumurta 15'li (63-72 g)",140,"Et & Tavuk & Şarküteri"),
    mk("migros:2","Güres M Orta Boy Yumurta 30'lu (53-63 G)",260,"Süt, Kahvaltılık"),
    mk("migros:3","Hello Kitty Kalp Yumurta 2 x 5 G",94.95,"Atıştırmalık"),
    mk("sok:2","Sonic Joy Süpriz Yumurta 17.5 g",29.95,"Atıştırmalık"),
    mk("sok:3","Kinder Joy Sürpriz Yumurta 3'lü 60 g",120,"Atıştırmalık")];
  MF.group(rows);
  const r=MF.unitCompare(rows,"yumurta"),ids=r.sizes.flatMap(s=>s.items.map(h=>h.o.id)).sort();
  assert.deepEqual(ids,["migros:1","migros:2","sok:1"]);
});

test("birim karşılaştırma: tadı/türevi olan ürün o ürün sayılmaz", () => {
  const MF=require("../../js/match.js");
  const mk=(id,name,price,cat)=>({id,market:id.split(":")[0],name,price,regular:price,in_stock:1,cat});
  const rows=[mk("sok:1","Dudomi Tavuk Çeşnili Noodle 70 g",15,"Yemeklik Malzemeler"),mk("sok:2","Knorr Kremalı Tavuk Çorbası 65 g",20,"Yemeklik Malzemeler"),
    mk("migros:1","Banvit Bütün Tavuk 1500 G",180,"Et, Tavuk, Balık"),mk("migros:2","Şenpiliç Tavuk Baget 1000 G",150,"Et, Tavuk, Balık")];
  MF.group(rows);
  assert.deepEqual(MF.unitCompare(rows,"tavuk").sizes.flatMap(s=>s.items.map(h=>h.o.id)).sort(),["migros:1","migros:2"]);
});

test("market bağlantısından ürün: Migros -p-<onaltılık> → SKU", () => {
  const p=C.productFromURL("https://www.migros.com.tr/grocery-mp/bahs-cookie-dream-protein-bar-45-g-p-6e0035");
  assert.deepEqual(p,{market:"migros",id:"migros:07209013",name:"Bahs Cookie Dream Protein Bar 45 G"});
  assert.equal(C.productFromURL("https://www.migros.com.tr/pinar-sut-1-l-p-1b2d4e").id,"migros:01781070");
  assert.equal(C.productFromURL("https://example.com/x-p-12"),null);
  const link=C.addProductLink(p);assert.match(link,/issues\/new\?title=%5B%C3%9CR%C3%9CN\+EKLE%5D/);
  assert.match(decodeURIComponent(link.replace(/\+/g," ")),/"add":true/);
});
