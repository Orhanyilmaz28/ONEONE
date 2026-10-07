/** Inhalt der Mixpakete: Sorte (Produkt-Handle) und Anzahl Trays (je 24 Dosen) – es werden nur komplette Trays verkauft */
export const TRAY_SIZE = 24;
export const PACK_CONTENTS: Record<string, [handle: string, trays: number][]> = {
  "mix-fruchtig": [["classic", 1], ["tropical", 1], ["kiwi-lemon", 1], ["watermelon", 1]],
  "mix-sweet-cool": [["white-peach", 1], ["ice-bonbon", 1], ["blueberry-coconut", 1], ["watermelon", 1]],
  "mix-sauer-frisch": [["lime", 1], ["kiwi-lemon", 1], ["classic", 1], ["zero", 1]],
  "mix-kick-chill": [["classic", 1], ["tropical", 1], ["ice-coffee-latte", 1], ["ice-coffee-cappuccino", 1]],
  "mix-ice-coffee": [["ice-coffee-latte", 1], ["ice-coffee-cappuccino", 1]],
  "mix-xtea": [["xtea-peach", 1], ["xtea-lemon", 1], ["xtea-watermelon", 1]],
  "mix-alle-trays": [["classic", 1], ["tropical", 1], ["kiwi-lemon", 1], ["watermelon", 1], ["white-peach", 1], ["ice-bonbon", 1], ["lime", 1], ["blueberry-coconut", 1], ["zero", 1]],
};
export const SORT_NAMES: Record<string, string> = {
  classic: "Classic",
  tropical: "Tropical",
  "kiwi-lemon": "Kiwi & Lemon",
  watermelon: "Watermelon",
  "white-peach": "White Peach",
  "ice-bonbon": "Ice Bonbon",
  lime: "Lime",
  "blueberry-coconut": "Blueberry Coconut",
  zero: "Zero",
  "ice-coffee-latte": "Ice Coffee Latte",
  "ice-coffee-cappuccino": "Ice Coffee Cappuccino",
  "xtea-peach": "X-Tea Peach",
  "xtea-lemon": "X-Tea Lemon",
  "xtea-watermelon": "X-Tea Watermelon",
};
