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
