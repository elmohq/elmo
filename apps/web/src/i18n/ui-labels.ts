import type { TagsInputLabels } from "@workspace/ui/components/tags-input";
import * as m from "@/paraglide/messages.js";

export function getTagsInputLabels(): TagsInputLabels {
	return {
		remove: (value) => m.tags_remove({ value }),
		maximumReached: m.tags_maximum_reached(),
		typeOrPaste: m.tags_type_or_paste(),
		add: m.tags_add(),
	};
}
