/**
 * Stammdaten aus den Artikelpässen (Händlerbereich: Datenblatt, Preisliste, CSV).
 * Nur Angaben, die in einem Pass stehen – fehlt ein Pass, gibt es hier keinen Eintrag.
 */
export type ProductSpec = {
  artNr?: string;
  /** EAN/GTIN der Einzeldose bzw. -flasche */
  gtin?: string;
  bezeichnung: string;
  gebinde: string;
  tray: string;
  palette: string;
  /** Dosen bzw. Flaschen je Palette */
  units: number;
  mhd: string;
  lagerung: string;
  vegan?: boolean;
};

const CAN = {
  gebinde: "Dose 250 ml (slim, 50 × 133 mm) · 273 g",
  tray: "24 × 250 ml · 328 × 210 × 134 mm · 6,65 kg",
  units: 2880,
};
const ENERGY_PAL = "120 Trays (12 je Lage × 10 Lagen) · 2.880 Dosen · 1200 × 800 × 1515 mm · 743 kg";
const COFFEE_PAL = "120 Trays (10 je Lage × 12 Lagen) · 2.880 Dosen · 1200 × 800 × 1515 mm · 743 kg";

const energy = (artNr: string, gtin: string, monate: number): ProductSpec => ({
  ...CAN,
  artNr,
  gtin,
  bezeichnung: "Energydrink mit Vitaminen",
  palette: ENERGY_PAL,
  mhd: `${monate} Monate ab Produktion · garantierte Restlaufzeit 4 Monate`,
  lagerung: "Zimmertemperatur, trocken und vor Wärme geschützt",
  vegan: true,
});

const coffee = (artNr: string, gtin: string, sorte: string): ProductSpec => ({
  ...CAN,
  artNr,
  gtin,
  bezeichnung: `Eiskaffee ${sorte} mit Milch und Kaffeeextrakt`,
  palette: COFFEE_PAL,
  mhd: "12 Monate ab Produktion · garantierte Restlaufzeit 4 Monate",
  lagerung: "Zimmertemperatur; nach dem Öffnen gekühlt, innerhalb von 24 Stunden verbrauchen",
});

const water = (gtin: string, art: string): ProductSpec => ({
  gtin,
  bezeichnung: `Natürliches Mineralwasser, ${art}`,
  gebinde: "PET-Flasche 500 ml (60 × 60 × 225 mm) · 515 g",
  tray: "12 × 500 ml · 260 × 180 × 225 mm · 6,24 kg",
  palette: "126 Trays (18 je Lage × 7 Lagen) · 1.512 Flaschen · 1200 × 800 × 1600 mm · 737 kg",
  units: 1512,
  mhd: "12 Monate ab Produktion",
  lagerung: "Trocken, kühl, vor Sonnenlicht geschützt; nicht durchfrieren lassen",
});

export const PRODUCT_SPECS: Record<string, ProductSpec> = {
  classic: energy("D31031", "4260544050282", 24),
  tropical: energy("D31035", "4260544050329", 24),
  "kiwi-lemon": energy("D31034", "4260544050312", 24),
  watermelon: energy("D31032", "4260544050299", 24),
  "white-peach": energy("D31045", "4260544051524", 18),
  "ice-bonbon": energy("D31039", "4260544051463", 18),
  lime: energy("D31044", "4260544051494", 18),
  "blueberry-coconut": energy("D31043", "4260544051432", 18),
  "ice-coffee-latte": coffee("D31101", "4260544052279", "Latte"),
  "ice-coffee-cappuccino": coffee("D31100", "4260544052255", "Cappuccino"),
  // Caramel und Vanille tragen im Pass beide D31102 – so übernommen, bis der Hersteller es klärt
  "ice-coffee-caramel": coffee("D31102", "4260544052316", "Caramel"),
  "ice-coffee-espresso": coffee("D31103", "4260544052330", "Espresso"),
  "ice-coffee-vanille": coffee("D31102", "4260544052293", "Vanille"),
  "wasser-still": water("4260544051968", "ohne Kohlensäure"),
  "wasser-medium": water("4260544051982", "mit Kohlensäure versetzt, medium"),
  "wasser-classic": water("4260544052002", "mit Kohlensäure versetzt"),
};
