import AccountUI from "@/components/account-ui";
import { DatePicker } from "@/components/ui/date-picker";
import DhyanaEditorLogo from "@/components/branding/dhyana-editor-logo";
import Editor from "@/components/ui/editor/editor";

export default function Write({ params }: { params: { slug: string } }) {
	return (
		<div className="justify-between items-center bg-stone-200 text-stone-600 dark:bg-stone-600 dark:text-stone-200 font-serif h-lvh">
			<DhyanaEditorLogo />
			<DatePicker slug={params.slug} />
			<AccountUI />

			<Editor />
		</div>
	);
}
