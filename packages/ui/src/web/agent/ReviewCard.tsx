import { StarIcon } from "../icons";

export interface ReviewCardProps {
  quote: string;
  reviewer: string;
  /** "Seller" / "Buyer" */
  role?: string;
  /** "Google" / "Zillow" */
  source?: string;
  rating?: number;
}

/** Client review card (mockup 09 "What clients say"). */
export function ReviewCard({ quote, reviewer, role, source, rating = 5 }: ReviewCardProps) {
  return (
    <figure className="flex h-full flex-col border border-line bg-white p-6">
      <div className="flex text-gold" role="img" aria-label={`${rating} out of 5 stars`}>
        {Array.from({ length: Math.round(rating) }).map((_, i) => (
          <StarIcon key={i} size={14} />
        ))}
      </div>
      <blockquote className="mt-3 flex-1 font-subhead text-body-sm italic text-ink">
        “{quote}”
      </blockquote>
      <figcaption className="mt-4 font-body text-label uppercase tracking-label text-muted">
        {[reviewer, role, source].filter(Boolean).join(" · ")}
      </figcaption>
    </figure>
  );
}
