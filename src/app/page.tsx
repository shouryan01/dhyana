import Chat from "@/components/chat";
import DhyanaHeader from "@/components/dhyana-header";
import FadeInWrapper from "@/components/fade-in-wrapper";

export default function Home() {
	return (
		<FadeInWrapper>
			<main className="flex flex-col justify-between items-center bg-stone-200 text-stone-600 font-serif h-screen overflow-hidden">
				<DhyanaHeader />
				<Chat />

				{/* <Link href="/about">
					<Button variant="ghost" className="fixed right-0">
						About
						<BadgeInfo className="w-5 h-5 ml-1" />
					</Button>
				</Link> */}
				{/* <div className="justify-between h-screen">
					<DhyanaHeader />
					<Chat />
				</div> */}
			</main>
		</FadeInWrapper>
	);
}
