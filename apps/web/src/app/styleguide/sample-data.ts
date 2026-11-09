// Fictional sample data for /styleguide. No real clients, listings or MLS data.
import type {
  FaqItem,
  ListingCardProps,
  NavItem,
  SocialLink,
  Testimonial,
  TimelineItem,
} from "@vabrato/ui/web";

export const nav: NavItem[] = [
  { label: "Properties", href: "/properties" },
  { label: "Sell", href: "/sell" },
  { label: "Buy", href: "/buy" },
  { label: "Neighborhoods", href: "/neighborhoods" },
  { label: "About Vabrato", href: "/about" },
  { label: "Insights", href: "/insights" },
  { label: "Contact", href: "/contact" },
];

export const social: SocialLink[] = [
  { network: "facebook", href: "https://www.facebook.com/" },
  { network: "instagram", href: "https://www.instagram.com/" },
  { network: "youtube", href: "https://www.youtube.com/" },
  { network: "linkedin", href: "https://www.linkedin.com/" },
];

export const listings: ListingCardProps[] = [
  {
    address: "210 Laurel St 4A",
    cityLine: "Palo Alto, CA 94301",
    price: "$3,850,000",
    typeLine: "Condo · 3 bd · 3 ba",
    listingNo: "ML00000101",
    href: "#",
    badges: ["new"],
    saved: false,
  },
  {
    address: "1450 Hillview Ct",
    cityLine: "Belmont, CA 94002",
    price: "$2,195,000",
    typeLine: "House · 3 bd · 2 ba",
    listingNo: "ML00000103",
    href: "#",
    badges: ["open", "price-drop"],
    badgeText: { open: "Open Sat" },
    saved: true,
    tint: "steel",
  },
  {
    address: "48 Sample Ave",
    cityLine: "Redwood City, CA 94061",
    price: "$1,749,000",
    typeLine: "Townhouse · 2 bd · 2.5 ba",
    listingNo: "ML00000117",
    href: "#",
    badges: ["contingent"],
    saved: false,
    tint: "mauve",
    attribution: { idx: true, listingBroker: "Sample Brokerage Inc." },
  },
];

export const soldListings: ListingCardProps[] = [
  {
    address: "100 Sample Oak Rd",
    cityLine: "Woodside, CA 94062",
    price: "$6,250,000",
    typeLine: "Sold",
    listingNo: "ML00000XXX",
    href: "#",
    badges: ["sold"],
  },
  {
    address: "12 Canyon View Ln",
    cityLine: "Los Altos Hills, CA 94022",
    price: "$4,150,000",
    typeLine: "Sold · buyer side",
    listingNo: "ML00000XXX",
    href: "#",
    badges: ["list-sold"],
    tint: "mauve",
  },
];

export const testimonials: Testimonial[] = [
  {
    quote:
      "Very knowledgeable, professional and full-service real estate agents. Renovation, repair, market analysis, staging and presentation all in one place.",
    author: "Sample Client A · Seller",
    source: "Sample Google review",
    rating: 5,
  },
  {
    quote: "They walked us through every contingency date and never let a deadline slip.",
    author: "Sample Client B · Buyer",
    source: "Sample Zillow review",
    rating: 5,
  },
  {
    quote: "The pre-sale project paid for itself. Clear advice, honest numbers.",
    author: "Sample Client C · Seller",
    source: "Sample Google review",
    rating: 5,
  },
];

export const faqs: FaqItem[] = [
  {
    question: "How long does it take to sell a home in San Carlos right now?",
    answer:
      "Sample answer: timing depends on price, condition and season. Ask us for a current estimate.",
  },
  {
    question: "Should I renovate before I sell, or sell as-is?",
    answer:
      "Sample answer: targeted repairs often pay off; full remodels rarely do. We'll walk the home with you.",
  },
  {
    question: "How do contingency removal dates work in California?",
    answer:
      "Sample answer: each contingency has a deadline counted from ratification. Your timeline lists every date.",
  },
];

export const timeline: TimelineItem[] = [
  { title: "Contract ratified", date: "Oct 14", state: "done" },
  { title: "Inspection contingency removed", date: "Oct 21", state: "done" },
  {
    title: "Appraisal contingency removal",
    date: "Oct 31",
    detail: "Buyer's lender appraisal scheduled Oct 29",
    state: "next",
  },
  { title: "Loan contingency removal", date: "Nov 4", state: "upcoming" },
  { title: "Close of escrow", date: "Nov 10", state: "upcoming" },
];
