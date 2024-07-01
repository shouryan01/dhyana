import { Link } from "next-view-transitions";
import Image from "next/image";

export default function DhyanaEditorLogo() {
	return (
		<Link
			className="flex items-center about hover:bg-stone-300 rounded-md pr-2"
			href="/"
		>
			<Image src="/logo.png" alt="dhyana logo" width="40" height="40" />
			dhyāna
		</Link>
	);
}
