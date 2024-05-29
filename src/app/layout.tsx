import "./globals.css";

import { Inter } from "next/font/google";
import type { Metadata } from "next";
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
			<html lang="en">
				<body className={inter.className}>{children}</body>
			</html>
		</ViewTransitions>
	);
}
