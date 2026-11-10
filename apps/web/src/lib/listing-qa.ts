import { formatPrice, listingTitle, type AddressParts } from "./format";
import { openHouseLong } from "./listing-view";
import { monthlyHoa } from "./payment";

// "Questions buyers ask about this home": built from a fixed template and the
// listing's own IDX fields only. No AI, no ratings, nothing about who lives
// nearby (FH-1). Schools are not answered here: the city page links official
// district sites (review item 14).

export interface QaItem {
  q: string;
  a: string;
}

export function listingQa(
  l: AddressParts & {
    list_price: number | null;
    list_office_name: string | null;
    is_own_listing: boolean;
    data: Record<string, unknown>;
    open_houses: { start_time: string | null; end_time: string | null }[];
  },
): QaItem[] {
  const title = listingTitle(l);
  const items: QaItem[] = [];

  if (l.list_price) {
    const yearly = Math.round((l.list_price * 0.011) / 100) * 100;
    items.push({
      q: `How much are property taxes on ${title}?`,
      a: `At about 1.1% of a ${formatPrice(l.list_price)} purchase price, expect roughly ${formatPrice(yearly)} a year, plus any local assessments. Ask us for the exact tax bill.`,
    });
  }

  const hoa = monthlyHoa(l.data.AssociationFee, l.data.AssociationFeeFrequency);
  items.push({
    q: "Is there an HOA?",
    a: hoa > 0 ? `Yes. The listing shows HOA dues of about ${formatPrice(hoa)} a month.` : "No HOA dues are listed for this home.",
  });

  const upcoming = l.open_houses.filter((o) => o.start_time);
  items.push({
    q: "When can I see it?",
    a: upcoming.length
      ? `Open house${upcoming.length > 1 ? "s" : ""}: ${upcoming.map((o) => openHouseLong(o.start_time!, o.end_time)).join("; ")}. You can also request a private tour.`
      : "No open houses are scheduled right now. Request a private tour and an agent will set up a time.",
  });

  items.push({
    q: "Who is the listing broker?",
    a: l.is_own_listing
      ? "This home is listed by Vabrato Real Estate Services."
      : `This home is listed by ${l.list_office_name ?? "another brokerage"}. Vabrato agents can show it and represent you as a buyer.`,
  });

  return items;
}
