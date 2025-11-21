// This file provides a static manifest object (kept as JS for editor convenience).
// The real manifest used by browsers is `manifest.json` in the same folder.
// Keep this file in sync with manifest.json if you edit manifest fields here.
const manifest = {
  name: "تطبيق القرآن الكريم",
  short_name: "القرآن",
  lang: "ar",
  start_url: "/index.html",
  scope: "/",
  display: "standalone",
  orientation: "portrait",
  background_color: "#ffffff",
  theme_color: "#4CAF50",
  description: "قارئ للقرآن الكريم يعمل دون اتصال مع أدوات تنقل مريحة ودعم التثبيت كتطبيق ويب.",
  categories: ["books", "education", "religion"],
  icons: [
    { src: "quran2.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
    { src: "quran1.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
  ],
  shortcuts: [
    {
      name: "الانتقال للصفحة الأخيرة",
      short_name: "آخر صفحة",
      description: "يفتح التطبيق عند آخر صفحة قرأتها",
      url: "/index.html?last=1",
      icons: [{ src: "quran2.png", sizes: "192x192" }]
    }
  ],
  prefer_related_applications: false
};


export default manifest;
