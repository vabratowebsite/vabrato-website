// Vabrato business details (SPEC <organization>). Shown in the footer of every
// vabrato.com page and in Organization JSON-LD.

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://vabrato.com").replace(/\/+$/, "");

export const ORG = {
  name: "Vabrato Real Estate Services",
  corporateDre: "02142060",
  designatedBroker: { name: "Mark Martinho", dre: "01372898" },
  address: {
    street: "935 Chestnut St",
    city: "San Carlos",
    region: "CA",
    postalCode: "94070",
  },
  // PLACEHOLDER (content checklist): the office phone. 555-01xx numbers are
  // reserved for fiction, so nothing real is implied until it's replaced.
  phones: [{ label: "Office", number: "(650) 555-0100", placeholder: true }],
} as const;

export const ORG_ADDRESS_LINE = `${ORG.address.street}, ${ORG.address.city}, ${ORG.address.region} ${ORG.address.postalCode}`;

/** Broker disclosure required in every vabrato.com footer (review item 2). */
export const BROKER_DISCLOSURE = `${ORG.name} · DRE #${ORG.corporateDre} · ${ORG.designatedBroker.name}, Designated Broker, DRE #${ORG.designatedBroker.dre}`;
