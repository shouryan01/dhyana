import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";

import { CircleUser } from "lucide-react";
import DhyanaHeader from "@/components/dhyana-header";
import FadeInWrapper from "@/components/fade-in-wrapper";
import { Link } from "next-view-transitions";
import dynamic from "next/dynamic";

export default function Home() {
	const Editor = dynamic(() => import("@/components/ui/editor/editor"), {
		ssr: false,
	});

	return (
		<FadeInWrapper>
			<main className="flex flex-col justify-between items-center bg-stone-200 text-stone-600 dark:bg-stone-600 dark:text-stone-200 font-serif h-lvh">
				<DhyanaHeader />
				<div className="w-full max-w-7xl">
					<Editor />
				</div>
				<div className="fixed bottom-2 right-2">
					<SignedIn>
						<UserButton />
					</SignedIn>
					<SignedOut>
						<Link href="/sign-in" className="fixed bottom-2 right-2">
							<CircleUser className="h-6 w-6 hover:scale-125 duration-100" />
						</Link>
					</SignedOut>
				</div>
			</main>
		</FadeInWrapper>
	);
}
