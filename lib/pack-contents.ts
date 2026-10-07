/** Dosen bzw. Flaschen je Tray (Energy, Coffee, Tea: 24 Dosen; Wasser: 12 Flaschen) */
export const trayCans = (handle: string) => (handle.startsWith("wasser") ? 12 : 24);

/** Sortenfarben (Kacheln, Glow) */
export const SORT_COLORS: Record<string, string> = {
  classic: "#a8e652",
  tropical: "#1fb6ff",
  "kiwi-lemon": "#ffd400",
  watermelon: "#ff2d95",
  "white-peach": "#ffb4a2",
  "ice-bonbon": "#7fd4ff",
  lime: "#c6f03c",
  "blueberry-coconut": "#8c6cff",
  zero: "#e9f5dc",
  "ice-coffee-latte": "#e3c9a3",
  "ice-coffee-cappuccino": "#c69c6d",
  "xtea-peach": "#ffa36c",
  "xtea-lemon": "#ffe14d",
  "xtea-watermelon": "#ff5c8a",
  "wasser-still": "#ff6fb5",
  "wasser-medium": "#4caf50",
  "wasser-classic": "#42a5f5",
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

  "wasser-still": "Aqua x Still",
  "wasser-medium": "Aqua x Medium",
  "wasser-classic": "Aqua x Classic",
};
