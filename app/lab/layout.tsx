import type { Metadata } from "next";
import LabProviders from "./providers";

export const metadata: Metadata = {
  title: "Crispen Lab",
  robots: { index: false, follow: false },
};

export default function LabLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <LabProviders>{children}</LabProviders>;
}
