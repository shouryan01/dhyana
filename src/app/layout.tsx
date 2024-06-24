import "./globals.css";

import { Analytics } from "@vercel/analytics/react";
import { ClerkProvider } from "@clerk/nextjs";
import { Inter } from "next/font/google";
import type { Metadata } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ViewTransitions } from "next-view-transitions";

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
