"use client";

import * as React from "react";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import { format, parse } from "date-fns";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export function DatePicker({ slug }: { slug: string }) {
	const [date, setDate] = React.useState<Date>(new Date());
	const router = useRouter();

	const handleDateSelect = (newDate: Date | undefined) => {
		setDate(newDate);
		if (newDate) {
			const formattedDate = format(newDate, "yyyy-MM-dd");
			router.push(`/write/${formattedDate}`);
		}
	};

	useEffect(() => {
		const parsedDate = parse(slug, "yyyy-MM-dd", new Date());
		setDate(parsedDate);
	}, [router.query]);

	const disableFutureDates = (date: Date) => {
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		return date > today;
	};

	return (
		<Popover>
			<PopoverTrigger asChild className="fixed top-0 right-0">
				<Button variant="ghost">
					<CalendarDays className="h-5 w-5" />
				</Button>
			</PopoverTrigger>
			<PopoverContent className="w-auto p-0">
				<Calendar
					mode="single"
					selected={date}
					onSelect={handleDateSelect}
					disabled={disableFutureDates}
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
