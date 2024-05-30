import { BlockNoteSchema, defaultInlineContentSpecs } from "@blocknote/core";
import {
	type DefaultReactSuggestionItem,
	createReactInlineContentSpec,
} from "@blocknote/react";

export const Emotion = createReactInlineContentSpec(
	{
		type: "emotion",
		propSchema: {
			emotion: {
				default: "Unknown",
			},
		},
		content: "none",
	},
	{
		render: (props) => (
			// pink-200
			<span style={{ backgroundColor: "#fbcfe8" }}>
				#{props.inlineContent.props.emotion}
			</span>
		),
	},
);
export const getEmotionMenuItems = (
	editor: typeof schema.BlockNoteEditor,
): DefaultReactSuggestionItem[] => {
	const emotions = [
		"happy",
		"sad",
		"afraid",
		"angry",
		"disgust",
		"embarrassed",
		"anxious",
		"jealous",
		"ennui",
	];

	return emotions.map((emotion) => ({
		title: emotion,
		onItemClick: () => {
			editor.insertInlineContent([
				{
					type: "emotion",
					props: {
						emotion,
					},
				},
				" ", // add a space after the mention
			]);
		},
	}));
};

export const Person = createReactInlineContentSpec(
	{
		type: "person",
		propSchema: {
			person: {
				default: "Unknown",
			},
		},
		content: "none",
	},
	{
		render: (props) => (
			// yellow-200
			<span style={{ backgroundColor: "#fef08a" }}>
				@{props.inlineContent.props.person}
			</span>
		),
	},
);
export const getPersonMenuItems = (
	editor: typeof schema.BlockNoteEditor,
): DefaultReactSuggestionItem[] => {
	const people = ["Alice", "Bob", "Charlie"];

	return people.map((person) => ({
		title: person,
		onItemClick: () => {
			editor.insertInlineContent([
				{
					type: "person",
					props: {
						person,
					},
				},
				" ", // add a space after the mention
			]);
		},
	}));
};

export const schema = BlockNoteSchema.create({
	inlineContentSpecs: {
		...defaultInlineContentSpecs,
		emotion: Emotion,
		person: Person,
	},
});
