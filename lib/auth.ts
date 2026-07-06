// Firebase Authentication, verified server-side without any secrets:
// the client sends its Firebase ID token as a Bearer header, and we check
// the RS256 signature against Google's published JWKS plus the issuer and
// audience for our project. No firebase-admin, no service account.

import { createRemoteJWKSet, jwtVerify } from "jose";
import type { NextRequest } from "next/server";
import { normalizeEmail } from "./credits";

const PROJECT_ID = "crispen-pro";

const JWKS = createRemoteJWKSet(
  new URL(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  ),
);

/**
 * Verified, normalized email from the request's Firebase ID token,
 * or null if absent/invalid.
 */
export async function bearerEmail(req: NextRequest): Promise<string | null> {
  if (!PROJECT_ID) return null;
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return null;
  const token = header.slice(7);
  try {
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `https://securetoken.google.com/${PROJECT_ID}`,
      audience: PROJECT_ID,
    });
    if (payload.email_verified !== true) return null;
    return normalizeEmail(payload.email);
  } catch {
    return null;
  }
}
