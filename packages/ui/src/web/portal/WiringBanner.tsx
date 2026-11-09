/**
 * Wiring-fraud warning shown on every money screen (CLAUDE.md hard rule).
 * By design it takes no bank or wiring fields: the only instruction is to
 * call escrow at a known number.
 */
export function WiringBanner({ salePrice }: { salePrice?: string }) {
  return (
    <div
      role="note"
      aria-label="Wiring safety"
      className="border border-red/40 bg-red-50 px-4 py-3 font-body text-body-sm text-red"
    >
      <strong className="font-bold">Wiring safety.</strong>{" "}
      {salePrice && <>Sale price {salePrice}. </>}
      Vabrato and escrow will never email you wiring instructions. Always call your escrow officer
      at a number you already know to verify wiring before moving money.
    </div>
  );
}
