// Home placeholder until S4 PR 3 builds the full home page (mockup 01).
export default function HomePage() {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-2xl flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="font-display text-display-sm uppercase tracking-wide text-navy">Vabrato</h1>
      <p className="text-muted">The new vabrato.com is under construction.</p>
      <div aria-hidden="true" className="h-0.5 w-12 bg-gold" />
    </div>
  );
}
