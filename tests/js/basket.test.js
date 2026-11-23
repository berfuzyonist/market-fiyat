const test=require("node:test"),assert=require("node:assert");
const B=require("../../js/basket.js");
const o=(market,tl,extra={})=>({market,cents:B.toCents(tl),...extra});
const items=[
  {key:"sut",offers:[o("sok",30),o("migros",35),o("bim",28)]},
  {key:"yag",offers:[o("sok",200),o("migros",180)]},
  {key:"cay",offers:[o("migros",150)]},
];
test("çoklu market: her ürün en ucuz markete",()=>{
  const r=B.optimize(items,["sok","migros","bim"]);
  assert.equal(r.multi.total,28_00+180_00+150_00);
  assert.deepEqual(r.multi.markets.sort(),["bim","migros"]);
  assert.equal(r.multi.missing.length,0);
});
test("tek market: eksiksiz olan önce, sonra ucuz olan",()=>{
  const r=B.optimize(items,["sok","migros","bim"]);
  assert.equal(r.single[0].market,"migros");assert.equal(r.single[0].total,35_00+180_00+150_00);
  assert.deepEqual(r.single.find(s=>s.market==="sok").missing,["cay"]);
  assert.equal(r.saving,(35_00+180_00+150_00)-(28_00+180_00+150_00));
});
test("sınırlı market: en fazla k market içinde en ucuz",()=>{
  const r=B.optimize(items,["sok","migros","bim"]);
  assert.deepEqual(r.limited[1].allowed,["migros"]);
  assert.deepEqual(r.limited[2].allowed.sort(),["bim","migros"]);
  assert.equal(r.limited[2].total,r.multi.total);
});
test("kullanıcının seçtiği market korunur; kuruş hassasiyeti",()=>{
  const r=B.plan([{key:"a",fixed:"sok",offers:[o("sok",0.1),o("migros",0.05)]},{key:"b",offers:[o("sok",0.2)]}],null);
  assert.equal(r.pick.a.market,"sok");assert.equal(r.total,30); // 0.1+0.2 = 30 kuruş, 0.30000000000000004 değil
});
test("eski veri ve Money fiyatı sayılır; eşit fiyatta güncel olan seçilir",()=>{
  const r=B.plan([{key:"a",offers:[o("sok",10,{stale:true}),o("migros",10,{money:true})]}],null);
  assert.equal(r.pick.a.market,"migros");assert.equal(r.money,1);assert.equal(r.stale,0);
});
