import { formatPrice } from "@/lib/format";

export function Price({
  price,
  compareAtPrice,
  from,
  className = "",
}: {
  price: number;
  compareAtPrice?: number;
  from?: boolean;
  className?: string;
}) {
  const onSale = compareAtPrice !== undefined && compareAtPrice > price;
  return (
    <span className={`inline-flex items-baseline gap-2 ${className}`}>
      <span className={onSale ? "text-accent" : ""}>
        {from ? "ab " : ""}
        {formatPrice(price)}
      </span>
      {onSale ? (
        <s className="text-muted text-[0.85em]">{formatPrice(compareAtPrice)}</s>
      ) : null}
    </span>
  );
}
