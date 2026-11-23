// Site varlıklarını derler (GitHub Actions ya da yerelde: npm ci && npm run build).
// 1) Tailwind → css/tw.css (tarayıcıda çalışan Tailwind betiği yerine hazır CSS)
// 2) Lucide → js/icons.js: yalnızca kodda adı geçen ikonlar (tüm kütüphane yerine)
// 3) index.html'deki ?v= sürüm etiketleri dosya içeriğinin özetiyle güncellenir
// Çıktılar depoya eklenir; tests.yml derlemenin güncel olduğunu denetler.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const read = (p) => readFileSync(p, "utf8");

// 1) Tailwind
execFileSync(process.execPath, [require.resolve("tailwindcss/lib/cli.js"), "-c", "tailwind.config.cjs",
  "-i", "css/tw.src.css", "-o", "css/tw.css", "--minify"], { stdio: ["ignore", "ignore", "inherit"] });

// 2) İkonlar: kaynaklarda tırnak içinde geçen ve Lucide'de karşılığı olan bütün adlar (dinamik
// ikon adları da kodda düz metin olarak yazıldığı için yakalanır)
const { icons } = require("lucide");
const pascal = (s) => s.replace(/(\w)(\w*)(_|-|\s*)/g, (g0, a, b) => a.toUpperCase() + b.toLowerCase());
const sources = ["index.html", ...readdirSync("js").filter((f) => f.endsWith(".js") && f !== "icons.js").map((f) => "js/" + f)];
const names = new Set();
for (const f of sources) for (const m of read(f).matchAll(/["'`=]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["'`]/g)) if (icons[pascal(m[1])]) names.add(m[1]);
const esc = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const inner = (node) => node[2].map(([tag, attrs]) => `<${tag}${Object.entries(attrs).map(([k, v]) => ` ${k}="${esc(v)}"`).join("")}/>`).join("");
const table = Object.fromEntries([...names].sort().map((n) => [n, inner(icons[pascal(n)])]));
writeFileSync("js/icons.js", `// Otomatik üretildi (scripts/build_assets.mjs): Lucide ${require("lucide/package.json").version}, ${names.size} ikon.
// <i data-lucide="ad" class="..."> öğelerini Lucide ile aynı biçimde SVG'ye çevirir.
(()=>{const I=${JSON.stringify(table)};
const A='xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
const e=s=>String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;");
function createIcons(){for(const el of document.querySelectorAll("i[data-lucide]")){const n=el.getAttribute("data-lucide"),body=I[n];
  if(body==null){console.warn("ikon yok:",n);continue}
  let at="";for(const a of el.attributes)if(a.name!=="class"&&a.name!=="data-lucide")at+=\` \${a.name}="\${e(a.value)}"\`;
  const cls=("lucide lucide-"+n+" "+(el.getAttribute("class")||"")).trim();
  el.outerHTML=\`<svg \${A} data-lucide="\${n}" class="\${e(cls)}" aria-hidden="true"\${at}>\${body}</svg>\`}}
window.lucide={createIcons};})();
`);

// 3) Sürüm etiketleri
const hash = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 10);
let html = read("index.html");
html = html.replace(/(href|src)="((?:css|js)\/[\w.-]+\.(?:css|js))(?:\?v=[\w]+)?"/g, (m, attr, path) => `${attr}="${path}?v=${hash(path)}"`);
writeFileSync("index.html", html);
console.log(`tw.css ${readFileSync("css/tw.css").length} B · icons.js ${names.size} ikon, ${readFileSync("js/icons.js").length} B`);
