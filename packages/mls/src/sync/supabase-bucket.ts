import { createClient } from "@supabase/supabase-js";
import { PHOTO_BUCKET, type PhotoBucket } from "./photos";

// Supabase Storage for MLS_PHOTO_MODE=copy. Service role key: Render env only.

export function createSupabaseBucket(url: string, serviceRoleKey: string): PhotoBucket {
  const storage = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } }).storage.from(
    PHOTO_BUCKET,
  );
  const fail = (what: string, error: { message: string } | null) => {
    if (error) throw new Error(`Photo storage ${what} failed: ${error.message}`);
  };
  return {
    async put(path, bytes, contentType) {
      const { error } = await storage.upload(path, bytes, { contentType, upsert: true, cacheControl: "86400" });
      fail("upload", error);
    },
    async remove(paths) {
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await storage.remove(paths.slice(i, i + 100));
        fail("delete", error);
      }
    },
    async removeAll() {
      let removed = 0;
      for (;;) {
        const { data: folders, error } = await storage.list("listing", { limit: 100 });
        fail("list", error);
        if (!folders?.length) return removed;
        for (const folder of folders) {
          const { data: files, error: e2 } = await storage.list(`listing/${folder.name}`, { limit: 1000 });
          fail("list", e2);
          const paths = (files ?? []).map((f) => `listing/${folder.name}/${f.name}`);
          if (paths.length) await this.remove(paths);
          removed += paths.length;
        }
      }
    },
  };
}
