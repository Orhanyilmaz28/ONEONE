/** Inhalt der Mixpakete: Sorte (Produkt-Handle) und Anzahl Dosen – ergibt immer die komplette Packungsgröße */
export const PACK_CONTENTS: Record<string, [handle: string, count: number][]> = {
  mixpaket: [["classic", 3], ["tropical", 3], ["kiwi-lemon", 3], ["watermelon", 3]],
  "mix-fruchtig": [["classic", 6], ["tropical", 6], ["kiwi-lemon", 6], ["watermelon", 6]],
  "mix-sweet-cool": [["white-peach", 6], ["ice-bonbon", 6], ["blueberry-coconut", 6], ["watermelon", 6]],
  "mix-sauer-frisch": [["lime", 6], ["kiwi-lemon", 6], ["classic", 6], ["zero", 6]],
  "mix-alle-sorten": [["classic", 3], ["tropical", 3], ["kiwi-lemon", 3], ["watermelon", 3], ["white-peach", 3], ["ice-bonbon", 3], ["lime", 2], ["blueberry-coconut", 2], ["zero", 2]],
  "mix-kick-chill": [["classic", 6], ["tropical", 6], ["ice-coffee-latte", 6], ["ice-coffee-cappuccino", 6]],
  "mix-ice-coffee": [["ice-coffee-latte", 12], ["ice-coffee-cappuccino", 12]],
  "mix-xtea": [["xtea-peach", 8], ["xtea-lemon", 8], ["xtea-watermelon", 8]],
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
