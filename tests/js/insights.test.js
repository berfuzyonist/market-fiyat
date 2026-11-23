const test=require("node:test"),assert=require("node:assert");
const I=require("../../js/insights.js");
const D=86400,now=100*D;
test("7/30 günlük değişim: başlangıçtan önceki fiyat bilinmiyorsa null",()=>{
  const pts=[[now-20*D,100,100],[now-3*D,80,100]];
  const s=I.stats(pts,{price:80,regular:100,seen:now},now);
  assert.equal(s.d7.from,100);assert.ok(Math.abs(s.d7.pct+0.2)<1e-9);
  assert.equal(s.d30,null);            // 30 gün önceki fiyat kayıtlı değil: uydurulmaz
  assert.equal(s.last.to,80);assert.equal(s.atLow30,true);
});
test("gerçek indirim: market %50 dese de gözlenen düşüş ayrı hesaplanır",()=>{
  const pts=[[now-10*D,95,95],[now-D,90,180]];
  const r=I.realDiscount(pts,{price:90,regular:180,seen:now},now);
  assert.equal(Math.round(r.claimed*100),50);assert.equal(Math.round(r.observed*1000),53);
  assert.equal(I.realDiscount([],{price:90,regular:180,seen:now},now).observed,null);
  assert.equal(I.realDiscount(pts,{price:90,regular:90},now),null);
});
test("30 günün en düşüğü: tek kayıtla dip sayılmaz",()=>{
  assert.equal(I.stats([],{price:10,regular:10,seen:now},now).atLow30,false);
});
test("sepet endeksi yalnızca tüm marketlerde olan temel ürünlerle",()=>{
  const st=[{name:"Süt",qty:1,best:{a:{u:{v:30}},b:{u:{v:35}}}},{name:"Çay",qty:1,best:{a:{u:{v:100}}}}];
  const r=I.basketIndex(st,["a","b"]);assert.deepEqual(r.items,["Süt"]);assert.deepEqual(r.missing,["Çay"]);assert.equal(r.total.b,35);
});
