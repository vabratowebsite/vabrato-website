import { NotFoundBody } from "@/components/NotFoundBody";

// notFound() inside vabrato.com routes (unknown listing, city, agent, post).
export const metadata = { title: "Page not found | Vabrato", robots: { index: false, follow: false } };

export default function SiteNotFound() {
  return <NotFoundBody />;
}
