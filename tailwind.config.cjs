// Tailwind derleme ayarı: index.html ve js/*.js içindeki sınıflar taranır (sınıflar kodda hep tam
// yazılır; "bg-"+renk gibi parçalı sınıf kullanılmaz). Çıktı: css/tw.css (npm run build).
module.exports = {
  content: ["./index.html", "./js/**/*.js"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", '"SF Pro Text"', "Roboto", "system-ui", "sans-serif"],
        display: ["Inter", "-apple-system", "BlinkMacSystemFont", '"SF Pro Display"', "Roboto", "system-ui", "sans-serif"],
      },
    },
  },
};
