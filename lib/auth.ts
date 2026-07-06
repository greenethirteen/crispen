// NextAuth config: Google sign-in, stateless JWT sessions (no database —
// the credit ledger on the volume is keyed by the verified email).

import type { AuthOptions } from "next-auth";
import { getServerSession } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import { normalizeEmail } from "./credits";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
  ],
  session: { strategy: "jwt" },
};

/** Verified, normalized email of the signed-in user, or null. */
export async function sessionEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  return normalizeEmail(session?.user?.email);
}
