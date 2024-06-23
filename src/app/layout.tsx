import "./globals.css";

import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { ViewTransitions } from "next-view-transitions";
import { Inter } from "next/font/google";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: "dhyana",
	description: "meditation and self-reflection AI journal",
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<ViewTransitions>
			<ClerkProvider>
				<html
					lang="en"
					className="hidescroll bg-stone-200 dark:bg-stone-600 font-serif"
				>
					<body className={inter.className}>
						{children}
						<Analytics />
						<SpeedInsights />
					</body>
				</html>
			</ClerkProvider>
		</ViewTransitions>
	);
}
