"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "@/components/providers/ThemeProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ReactNode, useState, useEffect } from "react";
import { registerServiceWorker } from "@/utils/registerServiceWorker";
import { RedactionProvider } from "@/components/ide/LogRedactor";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());

  // Register the service worker once on first client-side mount.
  // This must run here (inside a "use client" component) rather than in the
  // Server Component layout.tsx.
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            <RedactionProvider>
              {children}
            </RedactionProvider>
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
