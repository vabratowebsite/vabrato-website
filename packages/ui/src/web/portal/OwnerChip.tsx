import { Pill, type PillTone } from "./Pill";

// Task-owner chip for the agent console (replaces the legacy OwnerChip, which
// tinted text with each owner's colour and failed contrast). Owners map onto
// the AA-checked Pill tones; unknown owners are outlined.

const OWNER_TONES: Record<string, PillTone> = {
  Mark: "navy",
  Viv: "gold",
  "Lead Agent": "neutral",
  LA: "neutral",
  VA: "neutral",
  TC: "green",
  Seller: "gold",
  Escrow: "outline",
  "Local Help": "outline",
  "Rachee/Ced": "outline",
};

export function ownerTone(owner: string): PillTone {
  return OWNER_TONES[owner] ?? "outline";
}

export function OwnerChip({ owner }: { owner: string }) {
  return (
    <Pill tone={ownerTone(owner)} className="whitespace-nowrap px-2.5 py-0.5">
      {owner}
    </Pill>
  );
}
