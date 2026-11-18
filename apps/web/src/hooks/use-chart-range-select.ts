import { useState } from "react";
import { type DateBucket, draggedRange } from "@/lib/chart-buckets";

interface ChartPointerState {
	activeLabel?: string | number;
}

/**
 * Dragging across a chart's points picks out the days between them. `buckets` are
 * the chart's points in order, keyed on the x-axis by their last day. The returned
 * handlers go on the chart, and `selection` is the stretch to shade mid-drag.
 */
export function useChartRangeSelect(buckets: DateBucket[], onSelect: ((range: DateBucket) => void) | undefined) {
	const [drag, setDrag] = useState<{ anchor: string; current: string } | null>(null);
	if (!onSelect) return { handlers: {}, selection: null };

	const labelOf = (state: ChartPointerState | undefined) =>
		state?.activeLabel === undefined ? null : String(state.activeLabel);

	return {
		handlers: {
			onMouseDown: (state: ChartPointerState) => {
				const label = labelOf(state);
				if (label) setDrag({ anchor: label, current: label });
			},
			onMouseMove: (state: ChartPointerState) => {
				const label = labelOf(state);
				if (drag && label && label !== drag.current) setDrag({ ...drag, current: label });
			},
			onMouseUp: () => {
				if (!drag) return;
				setDrag(null);
				const range = draggedRange(buckets, drag.anchor, drag.current);
				if (range) onSelect(range);
			},
			onMouseLeave: () => setDrag(null),
		},
		selection: drag && drag.anchor !== drag.current ? { x1: drag.anchor, x2: drag.current } : null,
	};
}
