import { Pill } from "@vabrato/ui/web";
import { FREQUENCIES, type Frequency } from "../saved";

export function SearchFormFrequency({ frequency }: { frequency: Frequency }) {
  const label = FREQUENCIES.find((f) => f.value === frequency)?.label ?? "No alerts";
  return (
    <Pill tone={frequency === "off" ? "neutral" : "navy"} dot={frequency !== "off"}>
      {label}
    </Pill>
  );
}
