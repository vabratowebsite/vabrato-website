import { ownerColor } from "./theme";

export function OwnerChip({ owner }: { owner: string }) {
  const c = ownerColor(owner);
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium"
      style={{ background: `${c}1F`, color: c }}
    >
      {owner}
    </span>
  );
}
