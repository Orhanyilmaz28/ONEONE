"use client";

import Image, { type ImageProps } from "next/image";
import type { ReactNode } from "react";
import { AI_MEDIA_LABEL, type AiMediaType, aiMediaType } from "@/lib/ai-media";
import { useShopData } from "@/lib/shop-data";

/**
 * Kleine, ruhige Kennzeichnung für KI-Medien – im gleichen Stil wie die weißen Info-Pillen im Shop.
 * „original“ → nichts. Die Kennzeichnung steht nie im Alt-Text, sondern sichtbar am Medium.
 */

export type AiLabelPosition = "bottom-left" | "bottom-center" | "top-left" | "top-right" | "below";

const POSITION: Record<Exclude<AiLabelPosition, "below">, string> = {
  "bottom-left": "bottom-3 left-3",
  "bottom-center": "bottom-4 left-1/2 -translate-x-1/2",
  "top-left": "top-3 left-3",
  "top-right": "top-3 right-3",
};

export function AiMediaLabel({
  src,
  type: explicit,
  position = "bottom-left",
  compact = false,
  className = "",
}: {
  /** Adresse des Mediums – damit greift die Auswahl aus dem Dashboard („KI-Kennzeichnung“) */
  src?: string;
  /** Angabe am Medium (z. B. aus den Produktdaten); ohne Angabe: Auswahl im Dashboard bzw. zentrale Liste */
  type?: AiMediaType;
  position?: AiLabelPosition;
  /** Nur „KI“ – für sehr kleine Vorschaubilder */
  compact?: boolean;
  className?: string;
}) {
  const { aiMedia } = useShopData();
  const type = aiMediaType(src, explicit, aiMedia);
  if (type === "original") return null;
  const text = AI_MEDIA_LABEL[type];
  if (position === "below") {
    return (
      <p className={`mt-2 flex items-center gap-1.5 text-[12px] text-muted leading-none ${className}`} data-ai-media={type}>
        <Spark />
        {text}
      </p>
    );
  }
  return (
    <span
      className={`pointer-events-none absolute z-10 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 whitespace-nowrap rounded-full bg-card/90 font-medium text-ink/85 leading-none shadow-[0_1px_6px_rgba(20,20,20,0.12)] backdrop-blur-sm ${compact ? "px-1.5 py-1 text-[10px]" : "px-2.5 py-1.5 text-[11px] sm:text-[11.5px]"} ${POSITION[position]} ${className}`}
      data-ai-media={type}
      title={compact ? text : undefined}
    >
      {compact ? (
        <>
          <span aria-hidden>KI</span>
          <span className="sr-only">{text}</span>
        </>
      ) : (
        <>
          <Spark />
          <span className="truncate">{text}</span>
        </>
      )}
    </span>
  );
}

/** Kleiner Funke als ruhiges Symbol für „KI“ */
function Spark() {
  return (
    <svg aria-hidden className="size-3 shrink-0" fill="currentColor" viewBox="0 0 16 16">
      <path d="M8 1.5c.3 2.9 1.6 4.2 4.5 4.5-2.9.3-4.2 1.6-4.5 4.5-.3-2.9-1.6-4.2-4.5-4.5 2.9-.3 4.2-1.6 4.5-4.5Z" />
      <path d="M12.5 10c.15 1.3.7 1.85 2 2-1.3.15-1.85.7-2 2-.15-1.3-.7-1.85-2-2 1.3-.15 1.85-.7 2-2Z" opacity=".7" />
    </svg>
  );
}

type AiImageProps = Omit<ImageProps, "alt"> & {
  alt: string;
  /** Ohne Angabe: Eintrag in der zentralen Liste (lib/ai-media.ts), sonst „original“ */
  type?: AiMediaType;
  labelPosition?: AiLabelPosition;
  /** Klassen für den Rahmen (bei `fill` muss er die Größe vorgeben, z. B. "relative aspect-[4/5]") */
  wrapperClassName?: string;
};

/**
 * Next/Image mit KI-Kennzeichnung. Beispiel:
 * <AiImage alt="EXSTASE Energy Lifestyle" fill sizes="50vw" src="/bilder/lifestyle.webp" type="ai-generated" wrapperClassName="relative aspect-[4/5]" />
 */
export function AiImage({ type, labelPosition = "bottom-left", wrapperClassName = "relative", alt, ...props }: AiImageProps) {
  const src = typeof props.src === "string" ? props.src : undefined;
  if (labelPosition === "below") {
    return (
      <figure className="m-0">
        <div className={wrapperClassName}>
          <Image alt={alt} {...props} />
        </div>
        <AiMediaLabel position="below" src={src} type={type} />
      </figure>
    );
  }
  return (
    <div className={wrapperClassName}>
      <Image alt={alt} {...props} />
      <AiMediaLabel position={labelPosition} src={src} type={type} />
    </div>
  );
}

type AiVideoProps = React.VideoHTMLAttributes<HTMLVideoElement> & {
  src: string;
  type?: AiMediaType;
  /** Standard oben links – unten liegen bei Videos Play, Lautstärke und Vollbild */
  labelPosition?: AiLabelPosition;
  wrapperClassName?: string;
  /** Zusätzliche <source>-Elemente (z. B. WebM); ohne Angabe wird nur `src` als MP4 genutzt */
  sources?: ReactNode;
};

/**
 * Video mit KI-Kennzeichnung – sichtbar ab dem ersten Bild (auch auf dem Vorschaubild), ohne die Steuerung zu verdecken. Beispiel:
 * <AiVideo controls muted playsInline poster="/video/werbung-poster.webp" src="/video/werbung.mp4" type="ai-generated" />
 */
export function AiVideo({ src, type, labelPosition = "top-left", wrapperClassName = "relative", sources, ...video }: AiVideoProps) {
  return (
    <div className={wrapperClassName}>
      <video {...video}>{sources ?? <source src={src} type="video/mp4" />}</video>
      <AiMediaLabel position={labelPosition === "below" ? "top-left" : labelPosition} src={src} type={type} />
    </div>
  );
}
