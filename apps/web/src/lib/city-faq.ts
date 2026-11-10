// Templated city FAQ for pages without a hand-written guide FAQ. No counts,
// prices or other market statistics (those stay behind `public_stats`,
// MLS-10), no school ratings and nothing about who lives there (FH-1).

export function cityFaq(city: { name: string; county: string }): { q: string; a: string }[] {
  return [
    {
      q: `How do I find open houses in ${city.name}?`,
      a: `Upcoming public open houses in ${city.name} are listed on this page and on our open houses page. You can also request a private tour from any listing.`,
    },
    {
      q: `Can Vabrato help me sell a home in ${city.name}?`,
      a: `Yes. Vabrato's brokers work across ${city.county} County. Request a free home valuation and a broker will contact you.`,
    },
    {
      q: `Where can I find school information for ${city.name}?`,
      a: "Check the school district's official website for boundaries and enrollment. Ask us for the district that serves a specific address.",
    },
    {
      q: `Which county is ${city.name} in?`,
      a: `${city.name} is in ${city.county} County, California.`,
    },
  ];
}
