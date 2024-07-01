import AccountUI from "@/components/account-ui";
import DhyanaHeader from "@/components/branding/dhyana-landing-title";
import FadeInWrapper from "@/components/fade-in-wrapper";
import { AboutButton } from "@/components/ui/buttons/about-button";
import { formatDate } from "@/lib/utils";
import { Link } from "next-view-transitions";
import dynamic from "next/dynamic";

export default function Home() {
	const Editor = dynamic(() => import("@/components/ui/editor/editor"), {
		ssr: false,
	});

	const date = new Date();
	const today = formatDate(date);

	return (
		<FadeInWrapper>
			<main className="justify-between items-center bg-stone-200 text-stone-600 dark:bg-stone-600 dark:text-stone-200 font-serif h-lvh">
				<AboutButton />
				<AccountUI />
				<DhyanaHeader />
				<div>
					<Link href={`/write/${today}`}>write</Link>
				</div>
			</main>
		</FadeInWrapper>
	);
}
