import Image from "next/image";
import { type AiLabelPosition, AiMediaLabel } from "./ai-media";
import { LogoMark } from "./logo";
import type { Product } from "@/lib/types";

type Props = {
  product: Product;
  index?: number;
  sizes?: string;
  /** Bild sofort laden und im <head> vorladen (für das größte Bild im ersten Bildschirm, LCP) */
  preload?: boolean;
  className?: string;
  /** KI-Kennzeichnung am Bild zeigen (nur bei KI-Bildern): Position oder „compact“ (nur „KI“, für kleine Vorschaubilder) */
  aiLabel?: AiLabelPosition | "compact";
};

export function ProductImage({
  product,
  index = 0,
  sizes = "(min-width: 1024px) 25vw, 50vw",
  preload,
  className = "",
  aiLabel,
}: Props) {
  const image = product.images[index];
  if (image) {
    const img = (
      <Image
        alt={image.alt}
        className={`object-cover ${className}`}
        fill
        preload={preload}
        quality={90}
        sizes={sizes}
        src={image.src}
      />
    );
    if (!aiLabel) return img;
    return (
      <>
        {img}
        {aiLabel === "compact" ? <AiMediaLabel className="bottom-1! left-1!" compact position="bottom-left" src={image.src} type={image.type} /> : <AiMediaLabel position={aiLabel} src={image.src} type={image.type} />}
      </>
    );
  }
  return (
    <div
      aria-label={product.title}
      className={`absolute inset-0 flex items-center justify-center bg-gradient-to-br from-ink via-ink to-lilac/40 ${className}`}
      role="img"
    >
      <LogoMark className="w-2/5 max-w-60 text-lilac" />
    </div>
  );
}
