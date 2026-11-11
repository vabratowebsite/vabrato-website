"use client";

import { useEffect, useState } from "react";
import { inputCls, labelCls } from "@/components/ui";

// "Away until" in the browser's own time zone; the offset goes with it so the
// server stores the right instant.
export function AwayFields({ away }: { away: boolean }) {
  const [offset, setOffset] = useState("0");
  useEffect(() => setOffset(String(new Date().getTimezoneOffset())), []);
  return (
    <>
      <input type="hidden" name="away" value="true" />
      <input type="hidden" name="tzOffset" value={offset} />
      <label className={labelCls}>
        {away ? "Away until (optional, leave empty for no end)" : "Away until (optional)"}
        <input name="until" type="datetime-local" className={`${inputCls} mt-1 max-w-xs`} />
      </label>
    </>
  );
}
