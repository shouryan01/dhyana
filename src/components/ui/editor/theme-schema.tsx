import {
	BlockNoteSchema,
	defaultBlockSpecs,
	defaultInlineContentSpecs,
} from "@blocknote/core";
import {
	type Theme,
	darkDefaultTheme,
	lightDefaultTheme,
} from "@blocknote/mantine";
import { Emotion, Person } from "./tag";

const lightTheme = {
	colors: {
		editor: {
			text: "#57534e",
			background: "#e7e5e4",
		},
		menu: {
			text: "#57534e",
			background: "#e7e5e4",
		},
		tooltip: {
			text: "#57534e",
			background: "#e7e5e4",
		},
		hovered: {
			text: "#57534e",
			background: "#d6d3d1",
		},
		selected: {
			text: "#57534e",
			background: "#d6d3d1",
		},
		disabled: {
			text: "#57534e",
			background: "#a8a29e",
		},
		shadow: "#d6d3d1",
		border: "#d6d3d1",
		sideMenu: "#bababa",
		highlights: lightDefaultTheme.colors?.highlights,
	},
	borderRadius: 4,
	fontFamily: "serif",
} satisfies Theme;

const darkTheme = {
	...lightTheme,
	colors: {
		...lightTheme.colors,
		editor: {
			text: "#e7e5e4",
			background: "#57534e",
		},
		menu: {
			text: "#e7e5e4",
			background: "#57534e",
		},
		tooltip: {
			text: "#e7e5e4",
			background: "#57534e",
		},
		hovered: {
			text: "#e7e5e4",
			background: "#44403c",
		},
		selected: {
			text: "#e7e5e4",
			background: "#44403c",
		},
		disabled: {
			text: "#e7e5e4",
			background: "#292524",
		},
		shadow: "#44403c",
		border: "#44403c",
		highlights: darkDefaultTheme.colors?.highlights,
	},
} satisfies Theme;

export const dhyanaTheme = {
	light: lightTheme,
	dark: darkTheme,
};

export const schema = BlockNoteSchema.create({
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		emotion: Emotion,
		person: Person,
	},
	blockSpecs: {
		...defaultBlockSpecs,
	},
});

// stone-600 #57534e
// stone-500 #78716c
// stone-400 #a8a29e
// stone-300 #d6d3d1
// stone-200 #e7e5e4
