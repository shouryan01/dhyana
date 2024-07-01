"use client";

import * as React from "react";

import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { CalendarDays } from "lucide-react";

export function DatePicker() {
	const [date, setDate] = React.useState<Date>(new Date());

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
					onSelect={setDate}
					initialFocus
				/>
			</PopoverContent>
		</Popover>
	);
}
