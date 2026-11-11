import { describe, expect, it } from "vitest";
import { agentPhotoUrl } from "../agent-photo";

const id = "c1000000-0000-4000-8000-0000000008c1";

describe("agentPhotoUrl", () => {
  it("builds the public bucket URL", () => {
    expect(agentPhotoUrl("https://abc.supabase.co/", `${id}/photo-1.jpg`)).toBe(`https://abc.supabase.co/storage/v1/object/public/agent-photos/${id}/photo-1.jpg`);
  });
  it("returns null for missing or odd paths", () => {
    expect(agentPhotoUrl("https://abc.supabase.co", null)).toBeNull();
    expect(agentPhotoUrl(undefined, `${id}/a.jpg`)).toBeNull();
    expect(agentPhotoUrl("https://abc.supabase.co", "../secret/a.jpg")).toBeNull();
    expect(agentPhotoUrl("https://abc.supabase.co", `${id}/a b.jpg`)).toBeNull();
  });
});
