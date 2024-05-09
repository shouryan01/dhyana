import Chat from "@/components/chat";
import DhyanaHeader from "@/components/dhyana-header";
import FadeInWrapper from "@/components/fade-in-wrapper";

export default function Home() {
	return (
		<FadeInWrapper>
			<main className="flex flex-col items-center justify-between bg-stone-200 text-stone-600 font-serif h-screen overflow-hidden">
				<DhyanaHeader />
				<Chat />
			</main>
		</FadeInWrapper>
	);
}
