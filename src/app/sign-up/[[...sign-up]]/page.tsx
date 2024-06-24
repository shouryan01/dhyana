import { Button } from "@/components/ui/button";
import { SignUp } from "@clerk/nextjs";
import { Link } from "next-view-transitions";

export default function SignUpPage() {
	return (
		<div className="flex flex-col justify-center items-center min-h-screen bg-stone-200 font-serif">
			<Link href="/">
				<Button variant="ghost" className="fixed top-7 left-7">
					back
				</Button>
			</Link>
			<SignUp />
		</div>
	);
}
