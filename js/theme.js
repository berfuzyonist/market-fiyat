// Gece tasarımı her zaman koyu çalışır (premium koyu zemin). Eski tema tercihi okunur ama uygulanmaz.
// Tema: "sistem" (varsayılan), "acik" ya da "koyu". Sayfa çizilmeden önce <html>'e "dark" sınıfı eklenir
// (açılışta beyaz parlama olmasın). Seçim yalnızca bu telefonda saklanır.
(function () {
  var mq = window.matchMedia ? matchMedia("(prefers-color-scheme: dark)") : null;
  function pref() { try { return JSON.parse(localStorage.getItem("mf_theme")) || "sistem"; } catch (e) { return "sistem"; } }
  function apply() {
    var dark = true, r = document.documentElement;
    r.classList.toggle("dark", !!dark); r.style.colorScheme = dark ? "dark" : "light";
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute("content", "#07070b");
  }
  apply(); if (mq && mq.addEventListener) mq.addEventListener("change", apply);
  window.MFTheme = { pref: pref, set: function (v) { try { localStorage.setItem("mf_theme", JSON.stringify(v)); } catch (e) {} apply(); } };
})();
