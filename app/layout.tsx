import type { ReactNode } from "react";
import "./globals.css";

// Shared document shell for the public welcome, authentication and account pages.
export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en-PK"><body>{children}</body></html>;
}

