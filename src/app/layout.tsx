import "./globals.css";

import { Analytics } from "@vercel/analytics/react";
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
			<html lang="en" className="hidescroll bg-stone-200">
				<body className={inter.className}>
					{children}
					<Analytics />
					<SpeedInsights />
				</body>
			</html>
		</ViewTransitions>
	);
}
