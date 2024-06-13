import DhyanaHeader from "@/components/dhyana-header";
import FadeInWrapper from "@/components/fade-in-wrapper";
import dynamic from "next/dynamic";

export default function Home() {
	const Editor = dynamic(() => import("@/components/ui/editor/editor"), {
		ssr: false,
	});

	return (
		<FadeInWrapper>
			<main className="flex flex-col justify-between items-center bg-stone-200 text-stone-600 dark:bg-stone-600 dark:text-stone-200 font-serif h-lvh">
				<DhyanaHeader />
				<Editor />
			</main>
		</FadeInWrapper>
	);
}
