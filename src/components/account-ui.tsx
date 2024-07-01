"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import { CircleUser } from "lucide-react";
import { Link } from "next-view-transitions";

export default function AccountUI() {
	return (
		<div className="fixed bottom-0 right-2 z-10">
			<SignedIn>
				<UserButton />
			</SignedIn>
			<SignedOut>
				<Link href="/sign-in" className="fixed bottom-1.5 right-1.5">
					<CircleUser className="h-6 w-6 hover:scale-125 duration-150" />
				</Link>
			</SignedOut>
		</div>
	);
}
