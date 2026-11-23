// data/client (bölünmüş istemci verisi) kaynağıyla birebir aynı ürünleri vermeli; hazır eşleştirme
// istemcide yeniden eşleştirmeyle aynı grupları kurmalı.
const test=require("node:test"),assert=require("node:assert");
const fs=require("fs"),path=require("path");
const MF=require("../../js/match.js"),C=require("../../js/core.js");
const D=path.join(__dirname,"../../data"),load=p=>JSON.parse(fs.readFileSync(path.join(D,p),"utf8"));
const plain=o=>({id:o.id,market:o.market,name:o.name,price:o.price,regular:o.regular,in_stock:o.in_stock,image:o.image,url:o.url,cat:o.cat,promo:o.promo,money:o.money,seen:o.seen});

test("bölünmüş veri (katalog + fiyat) kaynak dosyayla aynı ürünleri verir",()=>{
  const idx=load("client/index.json");
  for(const m of Object.keys(idx.markets)){
    // yayım sürerken kaynak daha yeni olabilir: bu durumu uygulama zaten algılayıp tam dosyaya düşer
    if(idx.markets[m].updated!==load(`${m}.json`).updated)continue;
    const split=C.rowsFromSplit(load(`client/${m}-catalog.json`),load(`client/${m}-prices.json`));
    assert.ok(split,`${m}: katalog/fiyat sürümü uyuşmuyor`);
    const src=C.rowsOf(load(`${m}.json`)).sort((a,b)=>a.id<b.id?-1:1);
    assert.equal(split.length,src.length,m);
    split.forEach((o,i)=>assert.deepEqual(plain(o),plain(src[i]),`${m} ${o.id}`));
  }
});

test("sürüm uyuşmazlığında null döner (istemci tam dosyaya düşer)",()=>{
  assert.equal(C.rowsFromSplit({v:"a",products:[["sok:1","X",null,null,null]]},{catalog:"b",products:[[1,0,1,"",0]]}),null);
});

test("hazır eşleştirme ile istemcide eşleştirme aynı grupları kurar",()=>{
  const rows=["migros","sok","bim"].flatMap(m=>C.rowsOf(load(`${m}.json`)));
  const key=G=>G.filter(g=>g.offers.length>1).map(g=>g.offers.map(o=>o.id).sort().join(",")).sort();
  const g1=MF.group(rows.map(o=>Object.assign(Object.create(Object.getPrototypeOf(o)),o)));
  const idx=load("client/index.json");
  if(["migros","sok","bim"].some(m=>idx.markets[m]&&idx.markets[m].updated!==load(`${m}.json`).updated))return;
  const g2=MF.groupFrom(rows,load("client/groups.json").groups);
  assert.deepEqual(key(g2),key(g1));
  assert.equal(g2.length,g1.length);
  assert.ok(g2[0].p!==undefined); // grup p alanı tembel çözümlenir
});

test("ad çözümlemesi tembel: _p ilk erişimde hesaplanır, atanabilir",()=>{
  const [o]=C.rowsOf({fields:["id","name","price","regular","in_stock","image","url","cat","promo","seen"],products:[["sok:1","Pınar Süt 1 L",10,10,1,"","",null,"",1]]});
  assert.ok(!Object.prototype.hasOwnProperty.call(o,"_p"));
  assert.equal(o._p.qty.n,1000);
  o._p={x:1};assert.deepEqual(o._p,{x:1});
});
