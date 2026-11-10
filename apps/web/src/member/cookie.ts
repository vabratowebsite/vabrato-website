// Signed-in hint from the Supabase auth cookie (chunked cookies end in .0).
// Used to skip member work for signed-out visitors; never a security check.
export const hasAuthCookie = (cookie: string) => /(?:^|;\s*)sb-[^=;]+-auth-token(?:\.0)?=/.test(cookie);
