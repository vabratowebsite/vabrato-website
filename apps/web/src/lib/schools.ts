// School links on city pages: official district or school sites only, never
// ratings or rankings (review item 14, FH-1). Rating sites are dropped even if
// someone enters them in the content editor.

const RATING_HOSTS = ["greatschools.org", "niche.com", "schooldigger.com", "usnews.com", "publicschoolreview.com", "areavibes.com", "neighborhoodscout.com"];

export function officialSchoolLinks(links: { name: string; url: string }[]): { name: string; url: string }[] {
  return links.filter((l) => {
    try {
      const u = new URL(l.url);
      if (u.protocol !== "https:") return false;
      const host = u.hostname.toLowerCase();
      return !RATING_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
    } catch {
      return false;
    }
  });
}
