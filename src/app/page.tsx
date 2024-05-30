import { BadgeInfo } from "lucide-react";
import { Button } from "@/components/ui/button";
import DhyanaHeader from "@/components/dhyana-header";
import Editor from "@/components/ui/editor/editor";
import FadeInWrapper from "@/components/fade-in-wrapper";

export default function Home() {
	return (
		<FadeInWrapper>
			<main className="flex flex-col justify-between items-center bg-stone-200 text-stone-600 font-serif h-lvh">
				<DhyanaHeader />
				<Editor />
			</main>
		</FadeInWrapper>
	);
}
