import type { AiMediaType } from "./ai-media";

/** `type` = KI-Kennzeichnung; ohne Angabe ist es ein Original (siehe lib/ai-media.ts) */
export type ProductImage = { src: string; alt: string; type?: AiMediaType };

export type ProductOption = { name: string; values: string[] };

export type Variant = {
  id: string;
  title: string;
  /** Preis in Cent */
  price: number;
  /** Streichpreis in Cent */
  compareAtPrice?: number;
  available: boolean;
  options: Record<string, string>;
  /** Anzahl Dosen/Flaschen in dieser Packung – für das Einwegpfand (0,25 € je Stück) und „pro Dose“-Preise */
  cans?: number;
};

export type Product = {
  handle: string;
  title: string;
  /** Kurzer Teaser für Karten */
  subtitle?: string;
  /** Beschreibung als einfaches HTML (aus Shopify übernommen) */
  descriptionHtml: string;
  vendor?: string;
  productType?: string;
  tags: string[];
  collections: string[];
  images: ProductImage[];
  options: ProductOption[];
  variants: Variant[];
  featured?: boolean;
  createdAt: string;
  /** Aus dem Textil-Shop übernommen, im Getränke-Shop nicht genutzt (Dashboard-Formular kennt sie noch) */
  absorbency?: 1 | 2 | 3;
  capacity?: string;
  /** Kurze Stichpunkte für Karten und Produktseite */
  highlights?: string[];
  /** Produktvideos (Hochformat), werden in Galerie, Karten und Produktseite gezeigt */
  videos?: { src: string; poster: string; title?: string; type?: AiMediaType }[];
  /** Anzahl Teile im Paket (1 = Einzelteil) */
  packSize?: number;
  /** Mixpaket: Sorten (Produkt-Handle) und Anzahl Trays – es werden nur ganze Trays verkauft */
  contents?: [handle: string, trays: number][];
  /** Palette: kein Direktkauf, nur „Anfragen“ (später Händler-Registrierung) */
  onRequest?: boolean;
  /** Zutaten, Allergene & Nährwerte (Pflichtangabe beim Fernabsatz von Lebensmitteln, LMIV) – im Dashboard pflegbar */
  material?: string;
};

export type Collection = {
  handle: string;
  title: string;
  description?: string;
  image?: string;
};

export type Catalog = {
  brand: {
    name: string;
    tagline: string;
    announcement?: string;
    /** Pfad zum Logo, z. B. /imported/logo.png */
    logo?: string;
    description?: string;
  };
  collections: Collection[];
  products: Product[];
};

export type CartLine = {
  variantId: string;
  handle: string;
  quantity: number;
};

export type ImportedPage = { title: string; html: string };
