"use client";

import { SessionProvider } from "next-auth/react";

export default function LabProviders({
  children,
}: {
  children: React.ReactNode;
}) {
  return <SessionProvider>{children}</SessionProvider>;
}
