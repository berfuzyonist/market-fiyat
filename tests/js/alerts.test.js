const test=require("node:test"),assert=require("node:assert");
const A=require("../../js/alerts.js");
test("hedef fiyat: altına inince bir kez, fiyat değişince yeniden",()=>{
  const a={type:"below",target:50};
  assert.equal(A.evaluate(a,{price:55}).fire,false);
  const r=A.evaluate(a,{price:49.9});assert.equal(r.fire,true);a.last=r.sig;
  assert.equal(A.evaluate(a,{price:49.9}).fire,false);
  assert.equal(A.evaluate(a,{price:45}).fire,true);
});
test("yüzde düşüş, kuruş hassasiyeti",()=>{
  assert.equal(A.evaluate({type:"drop",pct:10,base:100},{price:90}).fire,true);
  assert.equal(A.evaluate({type:"drop",pct:10,base:100},{price:90.01}).fire,false);
});
test("30 günün en düşüğü: yeterli geçmiş yoksa bildirim yok",()=>{
  assert.equal(A.evaluate({type:"low30"},{price:10,low30:10,points30:1}).fire,false);
  assert.equal(A.evaluate({type:"low30"},{price:10,low30:10,points30:3}).fire,true);
  const now=1000*86400,l=A.low30([[now-40*86400,5],[now-10*86400,12],[now-86400,11]],now);
  assert.deepEqual(l,{low:11,n:2});
});
test("yeni kampanya: aynı kampanya tekrar bildirilmez",()=>{
  const a={type:"promo"};const r=A.evaluate(a,{price:10,promos:["2 Al 1 Öde"]});assert.equal(r.fire,true);a.last=r.sig;
  assert.equal(A.evaluate(a,{price:9,promos:["2 Al 1 Öde"]}).fire,false);
  assert.equal(A.evaluate(a,{price:9,promos:[]}).fire,false);
});
