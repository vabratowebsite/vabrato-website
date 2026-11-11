// School links on city pages: official district or school sites only, never
// ratings or rankings (review item 14, FH-1). The console editor refuses rating
// sites, and the website drops any that get through.

const RATING_HOSTS = ["greatschools.org", "niche.com", "schooldigger.com", "usnews.com", "publicschoolreview.com", "areavibes.com", "neighborhoodscout.com"];

/** An https link that isn't a ratings or rankings site. */
export function isOfficialSchoolLink(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return !RATING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export function officialSchoolLinks(links: { name: string; url: string }[]): { name: string; url: string }[] {
  return links.filter((l) => isOfficialSchoolLink(l.url));
}
