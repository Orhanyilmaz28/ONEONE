/**
 * Sorten mit Tray-Foto (public/dosen-foto/tray-foto/<handle>.webp, freigestellt). Classic ist das echte Foto, die übrigen
 * entstehen daraus mit scripts/make-tray-fotos.mjs. Ohne Foto (Wasser) zeigt die Produktseite die Einzeldosen.
 */
export const TRAY_PHOTOS = new Set<string>([
  "classic",
  "tropical",
  "kiwi-lemon",
  "watermelon",
  "white-peach",
  "ice-bonbon",
  "lime",
  "blueberry-coconut",
  "dragonfruit-lychee",
  "cactus",
  "ice-coffee-latte",
  "ice-coffee-cappuccino",
  "ice-coffee-caramel",
  "ice-coffee-espresso",
  "ice-coffee-vanille",
  "xtea-peach",
  "xtea-lemon",
  "xtea-watermelon",
]);
