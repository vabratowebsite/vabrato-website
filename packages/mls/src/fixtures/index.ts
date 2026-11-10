import type { Media, Member, Office, OpenHouse, Property } from "../resources";

// ENTIRELY FICTIONAL fixtures in RESO Data Dictionary field names (SPEC
// <mls_data>, GEN-3). Streets, agents, offices, phone numbers (555-01xx),
// e-mail addresses (example.test) and listing keys are invented. Cities are the
// real service-area cities so city pages can be tested. Coordinates are
// rough city-level points with a deterministic jitter, not real parcels.
// Nothing here came from an MLS feed. Never replace these with real records.

export const FIXTURE_NOW = new Date("2026-11-01T08:00:00Z");
export const FIXTURE_OFFICE_ID = "VABRA";
export const MOCK_MEDIA_ORIGIN = "https://mock.mls.invalid";

export interface FixtureSet {
  properties: Property[];
  media: Media[];
  openHouses: OpenHouse[];
  members: Member[];
  offices: Office[];
}

const OFFICES: Office[] = [
  office("OF-VABRA", FIXTURE_OFFICE_ID, "Vabrato Real Estate Services (fixture)", "650-555-0100"),
  office("OF-EXRG", "EXRG", "Example Realty Group", "650-555-0110"),
  office("OF-SMPL", "SMPL", "Sample Homes Co", "408-555-0120"),
];

const AGENTS = {
  avery: { key: "MB-0001", id: "AEX01", name: ["Avery", "Example"], office: OFFICES[0]! },
  jordan: { key: "MB-0002", id: "JSA02", name: ["Jordan", "Sample"], office: OFFICES[0]! },
  riley: { key: "MB-0003", id: "RPL03", name: ["Riley", "Placeholder"], office: OFFICES[0]! },
  casey: { key: "MB-0004", id: "CDE04", name: ["Casey", "Demo"], office: OFFICES[1]! },
  morgan: { key: "MB-0005", id: "MTE05", name: ["Morgan", "Testcase"], office: OFFICES[2]! },
} as const;
type AgentId = keyof typeof AGENTS;

const MEMBERS: Member[] = [
  member("avery", "Active"),
  member("jordan", "Active"),
  member("riley", "Inactive"),
  member("casey", "Active"),
  member("morgan", "Active"),
];

const CITY: Record<string, { county: string; zip: string; lat: number; lng: number }> = {
  "San Carlos": { county: "San Mateo", zip: "94070", lat: 37.507, lng: -122.26 },
  "Redwood City": { county: "San Mateo", zip: "94061", lat: 37.485, lng: -122.236 },
  "San Mateo": { county: "San Mateo", zip: "94401", lat: 37.563, lng: -122.325 },
  Belmont: { county: "San Mateo", zip: "94002", lat: 37.52, lng: -122.276 },
  "Menlo Park": { county: "San Mateo", zip: "94025", lat: 37.453, lng: -122.182 },
  "Daly City": { county: "San Mateo", zip: "94015", lat: 37.687, lng: -122.47 },
  "Foster City": { county: "San Mateo", zip: "94404", lat: 37.559, lng: -122.271 },
  Burlingame: { county: "San Mateo", zip: "94010", lat: 37.584, lng: -122.366 },
  "Half Moon Bay": { county: "San Mateo", zip: "94019", lat: 37.464, lng: -122.428 },
  "Palo Alto": { county: "Santa Clara", zip: "94301", lat: 37.442, lng: -122.143 },
  Sunnyvale: { county: "Santa Clara", zip: "94086", lat: 37.369, lng: -122.036 },
  "San Jose": { county: "Santa Clara", zip: "95112", lat: 37.338, lng: -121.886 },
  Cupertino: { county: "Santa Clara", zip: "95014", lat: 37.323, lng: -122.032 },
  "Los Gatos": { county: "Santa Clara", zip: "95030", lat: 37.227, lng: -121.975 },
  "Mountain View": { county: "Santa Clara", zip: "94041", lat: 37.386, lng: -122.084 },
  Milpitas: { county: "Santa Clara", zip: "95035", lat: 37.428, lng: -121.907 },
  Saratoga: { county: "Santa Clara", zip: "95070", lat: 37.264, lng: -122.023 },
  // Outside the service area (must be filtered out).
  Oakland: { county: "Alameda", zip: "94610", lat: 37.804, lng: -122.271 },
};

const STREETS = ["Example Way", "Sample Ct", "Placeholder Ave", "Testing Ln", "Fixture St", "Demo Dr", "Mockup Pl", "Stub Rd"];

/** Why each fixture exists. Eligibility tests assert on these. */
export const CASES = {
  "FX-001": "Active, our office",
  "FX-002": "Active, other office (MLS-2 attribution)",
  "FX-003": "ActiveUnderContract, other office",
  "FX-004": "Pending, our office",
  "FX-005": "Closed 60 days ago, our office (VOW; public only with public_sold)",
  "FX-006": "Closed 45 days ago, other office (VOW only)",
  "FX-007": "Closed 4 years ago (outside a 3-year sold window, inside 5)",
  "FX-008": "Withdrawn (off-market)",
  "FX-009": "Expired (off-market)",
  "FX-010": "Canceled (off-market)",
  "FX-011": "Active but InternetEntireListingDisplayYN=false (seller opt-out)",
  "FX-012": "Active, InternetAddressDisplayYN=false (address hidden)",
  "FX-013": "Active, AVM and consumer comments not allowed",
  "FX-014": "Active, Alameda County (outside service area)",
  "FX-015": "Active, from another MLS (MLS-8, rejected)",
  "FX-016": "Active, IDXParticipationYN=false",
  "FX-017": "Hold (off-market)",
  "FX-018": "ComingSoon (not displayed until MLSListings confirms)",
  "FX-019": "Active, extra (paging)",
  "FX-020": "Active, extra (paging)",
  "FX-021": "Active, extra (paging)",
  "FX-022": "Active, extra (paging)",
  "FX-023": "Active, extra (paging)",
  "FX-024": "Active, extra (paging)",
} as const;
export type FixtureKey = keyof typeof CASES;

export const ELIGIBLE_KEYS: FixtureKey[] = [
  "FX-001",
  "FX-002",
  "FX-003",
  "FX-004",
  "FX-005",
  "FX-006",
  "FX-012",
  "FX-013",
  "FX-019",
  "FX-020",
  "FX-021",
  "FX-022",
  "FX-023",
  "FX-024",
];

interface Spec {
  status: string;
  city: string;
  agent: AgentId;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  closedDaysAgo?: number;
  extra?: Partial<Property>;
}

const SPECS: Record<FixtureKey, Spec> = {
  "FX-001": { status: "Active", city: "San Carlos", agent: "avery", price: 2_195_000, beds: 4, baths: 3, sqft: 2150 },
  "FX-002": { status: "Active", city: "Redwood City", agent: "casey", price: 1_649_000, beds: 3, baths: 2, sqft: 1580 },
  "FX-003": { status: "ActiveUnderContract", city: "Palo Alto", agent: "morgan", price: 3_480_000, beds: 4, baths: 3, sqft: 2400 },
  "FX-004": { status: "Pending", city: "San Mateo", agent: "jordan", price: 1_895_000, beds: 3, baths: 2, sqft: 1720 },
  "FX-005": { status: "Closed", city: "San Carlos", agent: "avery", price: 2_350_000, beds: 4, baths: 3, sqft: 2280, closedDaysAgo: 60 },
  "FX-006": { status: "Closed", city: "Sunnyvale", agent: "morgan", price: 1_998_000, beds: 3, baths: 2, sqft: 1650, closedDaysAgo: 45 },
  "FX-007": { status: "Closed", city: "Belmont", agent: "jordan", price: 1_725_000, beds: 3, baths: 2, sqft: 1500, closedDaysAgo: 4 * 365 },
  "FX-008": { status: "Withdrawn", city: "Belmont", agent: "casey", price: 1_590_000, beds: 3, baths: 2, sqft: 1490 },
  "FX-009": { status: "Expired", city: "Menlo Park", agent: "morgan", price: 2_890_000, beds: 4, baths: 3, sqft: 2310 },
  "FX-010": { status: "Canceled", city: "San Jose", agent: "casey", price: 1_249_000, beds: 3, baths: 2, sqft: 1380 },
  "FX-011": {
    status: "Active",
    city: "Cupertino",
    agent: "morgan",
    price: 2_650_000,
    beds: 4,
    baths: 3,
    sqft: 2050,
    extra: { InternetEntireListingDisplayYN: false },
  },
  "FX-012": {
    status: "Active",
    city: "Los Gatos",
    agent: "casey",
    price: 2_975_000,
    beds: 4,
    baths: 4,
    sqft: 2900,
    extra: { InternetAddressDisplayYN: false },
  },
  "FX-013": {
    status: "Active",
    city: "Mountain View",
    agent: "jordan",
    price: 1_799_000,
    beds: 3,
    baths: 2,
    sqft: 1610,
    extra: { InternetAutomatedValuationDisplayYN: false, InternetConsumerCommentYN: false },
  },
  "FX-014": { status: "Active", city: "Oakland", agent: "casey", price: 1_150_000, beds: 3, baths: 2, sqft: 1450 },
  "FX-015": {
    status: "Active",
    city: "San Carlos",
    agent: "casey",
    price: 1_995_000,
    beds: 3,
    baths: 2,
    sqft: 1700,
    extra: { OriginatingSystemName: "Other Example MLS" },
  },
  "FX-016": {
    status: "Active",
    city: "Palo Alto",
    agent: "morgan",
    price: 4_200_000,
    beds: 5,
    baths: 4,
    sqft: 3300,
    extra: { IDXParticipationYN: false },
  },
  "FX-017": { status: "Hold", city: "Redwood City", agent: "casey", price: 1_450_000, beds: 2, baths: 2, sqft: 1200 },
  "FX-018": { status: "ComingSoon", city: "San Carlos", agent: "jordan", price: 2_050_000, beds: 3, baths: 3, sqft: 1950 },
  "FX-019": { status: "Active", city: "Daly City", agent: "casey", price: 1_098_000, beds: 3, baths: 1, sqft: 1220 },
  "FX-020": { status: "Active", city: "Foster City", agent: "jordan", price: 1_675_000, beds: 3, baths: 2, sqft: 1690 },
  "FX-021": { status: "Active", city: "Burlingame", agent: "morgan", price: 2_499_000, beds: 4, baths: 2, sqft: 1880 },
  "FX-022": { status: "Active", city: "Milpitas", agent: "casey", price: 1_388_000, beds: 3, baths: 2, sqft: 1540 },
  "FX-023": { status: "Active", city: "Saratoga", agent: "morgan", price: 3_950_000, beds: 5, baths: 4, sqft: 3600 },
  "FX-024": { status: "Active", city: "Half Moon Bay", agent: "avery", price: 1_725_000, beds: 3, baths: 2, sqft: 1760 },
};

function iso(daysBefore: number, minutes = 0): string {
  return new Date(FIXTURE_NOW.getTime() - daysBefore * 86_400_000 + minutes * 60_000).toISOString();
}

function property(key: FixtureKey, index: number): Property {
  const s = SPECS[key];
  const c = CITY[s.city]!;
  const a = AGENTS[s.agent];
  const number = 100 + index * 7;
  const street = STREETS[index % STREETS.length]!;
  const jitter = ((index * 37) % 50) / 10_000;
  const listedDaysAgo = (s.closedDaysAgo ?? 0) + 20 + index;
  const closed = s.status === "Closed";
  const [streetName, streetSuffix] = street.split(" ");
  return {
    ListingKey: key,
    ListingId: `ML8${String(index).padStart(6, "0")}`,
    OriginatingSystemName: "MLSListings",
    // Staggered by a minute each so ModificationTimestamp ordering is stable.
    ModificationTimestamp: iso(1, index),
    StandardStatus: s.status,
    PropertyType: "Residential",
    PropertySubType: index % 5 === 0 ? "Condominium" : "Single Family Residence",
    ListPrice: s.price,
    OriginalListPrice: s.price + 50_000,
    ClosePrice: closed ? s.price + 25_000 : null,
    CloseDate: closed ? iso(s.closedDaysAgo!).slice(0, 10) : null,
    PurchaseContractDate: closed ? iso(s.closedDaysAgo! + 21).slice(0, 10) : null,
    BuyerAgentFullName: closed ? "Quinn Fictional" : null,
    BuyerOfficeName: closed ? "Sample Homes Co" : null,
    ListingContractDate: iso(listedDaysAgo).slice(0, 10),
    OnMarketDate: iso(listedDaysAgo - 2).slice(0, 10),
    DaysOnMarket: closed ? 18 : listedDaysAgo - 2,
    CumulativeDaysOnMarket: closed ? 18 : listedDaysAgo - 2,
    UnparsedAddress: `${number} ${street}, ${s.city}, CA ${c.zip}`,
    StreetNumber: String(number),
    StreetName: streetName,
    StreetSuffix: streetSuffix,
    City: s.city,
    StateOrProvince: "CA",
    PostalCode: c.zip,
    CountyOrParish: c.county,
    Latitude: Number((c.lat + jitter).toFixed(5)),
    Longitude: Number((c.lng - jitter).toFixed(5)),
    BedroomsTotal: s.beds,
    BathroomsTotalInteger: s.baths,
    BathroomsFull: s.baths,
    BathroomsHalf: 0,
    LivingArea: s.sqft,
    LotSizeSquareFeet: s.sqft * 3,
    YearBuilt: 1950 + (index % 60),
    GarageSpaces: 2,
    PublicRemarks: `Fictional fixture listing ${key}. Bright rooms, updated kitchen and a sunny yard. Not a real property.`,
    PhotosCount: 3,
    ListAgentKey: a.key,
    ListAgentMlsId: a.id,
    ListAgentFullName: `${a.name[0]} ${a.name[1]}`,
    ListOfficeKey: a.office.OfficeKey,
    ListOfficeMlsId: a.office.OfficeMlsId,
    ListOfficeName: a.office.OfficeName,
    ListOfficePhone: a.office.OfficePhone,
    InternetEntireListingDisplayYN: true,
    InternetAddressDisplayYN: true,
    InternetAutomatedValuationDisplayYN: true,
    InternetConsumerCommentYN: true,
    IDXParticipationYN: true,
    // FULL-only fields (agent console).
    PrivateRemarks: `Fictional agent-only note for ${key}.`,
    ShowingInstructions: "Fictional: call the listing agent.",
    ShowingContactName: `${a.name[0]} ${a.name[1]}`,
    ShowingContactPhone: `650-555-01${String(50 + index).padStart(2, "0")}`,
    LockBoxType: "Fictional SentriLock",
    ListAgentDirectPhone: `650-555-01${String(10 + index).padStart(2, "0")}`,
    ListAgentEmail: `${a.name[0].toLowerCase()}@example.test`,
    OwnerName: "Fictional Owner Trust",
    Directions: "Fictional directions.",
    // Not on any allowlist: must never be stored.
    X_FixtureInternalNote: "Dropped by every projection.",
    ...s.extra,
  };
}

function media(p: Property, index: number): Media[] {
  const out: Media[] = [1, 2, 3].map((order) => ({
    MediaKey: `${p.ListingKey}-P${order}`,
    ResourceRecordKey: p.ListingKey,
    ResourceName: "Property",
    MediaCategory: "Photo",
    MediaType: "image/svg+xml",
    MediaURL: `${MOCK_MEDIA_ORIGIN}/media/${p.ListingKey}-P${order}.svg`,
    Order: order,
    ShortDescription: `Fixture photo ${order}`,
    ImageWidth: 1200,
    ImageHeight: 800,
    Permission: ["Public"],
    ModificationTimestamp: iso(1, index),
  }));
  if (p.ListingKey === "FX-001") {
    out.push(
      {
        MediaKey: "FX-001-PRIVATE",
        ResourceRecordKey: "FX-001",
        ResourceName: "Property",
        MediaCategory: "Photo",
        MediaURL: `${MOCK_MEDIA_ORIGIN}/media/FX-001-PRIVATE.svg`,
        Order: 9,
        Permission: ["Private"],
        ModificationTimestamp: iso(1, index),
      },
      {
        MediaKey: "FX-001-DOC",
        ResourceRecordKey: "FX-001",
        ResourceName: "Property",
        MediaCategory: "Document",
        MediaURL: `${MOCK_MEDIA_ORIGIN}/media/FX-001-DOC.svg`,
        Order: 10,
        Permission: ["Public"],
        ModificationTimestamp: iso(1, index),
      },
    );
  }
  return out;
}

function openHouses(): OpenHouse[] {
  const oh = (key: string, listing: string, daysAhead: number, type = "Public", status = "Active"): OpenHouse => {
    const start = new Date(FIXTURE_NOW.getTime() + daysAhead * 86_400_000 + 3 * 3_600_000);
    return {
      OpenHouseKey: key,
      ListingKey: listing,
      OpenHouseDate: start.toISOString().slice(0, 10),
      OpenHouseStartTime: start.toISOString(),
      OpenHouseEndTime: new Date(start.getTime() + 2 * 3_600_000).toISOString(),
      OpenHouseRemarks: "Fictional open house.",
      OpenHouseType: type,
      OpenHouseStatus: status,
      ModificationTimestamp: iso(1),
    };
  };
  return [
    oh("OH-001", "FX-001", 5),
    oh("OH-002", "FX-002", 6),
    oh("OH-003", "FX-002", 3, "Broker"),
    oh("OH-004", "FX-004", 4, "Public", "Canceled"),
    oh("OH-005", "FX-012", 5),
    oh("OH-006", "FX-008", 5),
  ];
}

function office(key: string, mlsId: string, name: string, phone: string): Office {
  return {
    OfficeKey: key,
    OfficeMlsId: mlsId,
    OfficeName: name,
    OfficePhone: phone,
    OfficeAddress1: "100 Fixture St",
    OfficeCity: "San Carlos",
    OfficeStateOrProvince: "CA",
    OfficePostalCode: "94070",
    OfficeStatus: "Active",
    ModificationTimestamp: iso(30),
  };
}

function member(id: AgentId, status: string): Member {
  const a = AGENTS[id];
  return {
    MemberKey: a.key,
    MemberMlsId: a.id,
    MemberFirstName: a.name[0],
    MemberLastName: a.name[1],
    MemberFullName: `${a.name[0]} ${a.name[1]}`,
    MemberStatus: status,
    MemberEmail: `${a.name[0].toLowerCase()}@example.test`,
    MemberDirectPhone: `650-555-01${a.key.slice(-2)}`,
    MemberStateLicense: `0000${a.key.slice(-4)}`,
    OfficeKey: a.office.OfficeKey,
    OfficeMlsId: a.office.OfficeMlsId,
    OfficeName: a.office.OfficeName,
    ModificationTimestamp: iso(10),
  };
}

/** A fresh, deep-copied fixture set (tests may mutate it). */
export function buildFixtures(): FixtureSet {
  const keys = Object.keys(SPECS) as FixtureKey[];
  const properties = keys.map((k, i) => property(k, i + 1));
  return structuredClone({
    properties,
    media: properties.flatMap((p, i) => media(p, i + 1)),
    openHouses: openHouses(),
    members: MEMBERS,
    offices: OFFICES,
  });
}
