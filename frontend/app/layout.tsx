import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AssessmentWorkspaceSheet } from "@/components/transactions/AssessmentWorkspaceSheet";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MuleGraph — Fraud Investigation Console",
  description:
    "MuleGraph is a demo UPI fraud-network investigation console: accounts as nodes, transactions as directed edges, for tracing fan-out and convergence mule-account patterns.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <TooltipProvider delayDuration={200}>
          {children}
          <AssessmentWorkspaceSheet />
          <Toaster position="bottom-right" />
        </TooltipProvider>
      </body>
    </html>
  );
}
