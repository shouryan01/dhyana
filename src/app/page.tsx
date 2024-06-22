import DhyanaHeader from "@/components/dhyana-header";
import FadeInWrapper from "@/components/fade-in-wrapper";
import { CircleUser } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

export default function Home() {
	const Editor = dynamic(() => import("@/components/ui/editor/editor"), {
		ssr: false,
	});

	return (
		<FadeInWrapper>
			<main className="flex flex-col justify-between items-center bg-stone-200 text-stone-600 dark:bg-stone-600 dark:text-stone-200 font-serif h-lvh">
				<DhyanaHeader />
				<Editor />
				<Link href="/account" className="fixed bottom-3 right-3 ">
					<CircleUser className="h-7 w-7" />
				</Link>
			</main>
		</FadeInWrapper>
	);
}
