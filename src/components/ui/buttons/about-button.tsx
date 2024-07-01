import { Link } from "next-view-transitions";
import { Button } from "../button";

export function AboutButton() {
	return (
		<Link href="/about">
			<Button variant="ghost" className="fixed top-7 right-7">
				about
			</Button>
		</Link>
	);
}
