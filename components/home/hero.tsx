import type { Product } from "@/lib/types";
import { HeroMarquee, HeroSlider, type HeroSlide } from "./hero-slider";

/** Sortenfarben (Glow, Ringe) – wie auf exstase.com */
const COLORS: Record<string, string> = {
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
};

/** Startbild: wechselt automatisch durch die Sorten (Energy und Ice Coffee, freigestellte Dosen) */
export function Hero({ products }: { products: Product[] }) {
  const slides: HeroSlide[] = Object.keys(COLORS).flatMap((handle) => {
    const p = products.find((x) => x.handle === handle);
    return p ? [{ handle, title: p.title, subtitle: p.subtitle?.split("·")[0].trim(), image: `/dosen-foto/frei/${handle}.webp`, color: COLORS[handle] }] : [];
  });
  return (
    <>
      <HeroSlider slides={slides} />
      <HeroMarquee />
    </>
  );
}
