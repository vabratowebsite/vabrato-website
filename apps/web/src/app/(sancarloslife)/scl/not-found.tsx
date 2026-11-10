import { NotFoundBody } from "@/components/NotFoundBody";

// notFound() inside homes.sancarloslife.com pages (a listing outside San
// Carlos or no longer on the market), rendered inside the SCL layout.
export const metadata = { title: "Page not found | San Carlos homes | Vabrato", robots: { index: false, follow: false } };

export default function SclNotFound() {
  return <NotFoundBody site="sancarloslife" />;
}
