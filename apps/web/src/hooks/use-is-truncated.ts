import { useEffect, useRef, useState } from "react";

/**
 * Whether an element's text is clipped by its own width, so a tooltip can offer
 * the rest only when there is a rest to offer. Re-measured as the element
 * resizes, since a column that widens stops hiding anything.
 */
export function useIsTruncated<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [truncated, setTruncated] = useState(false);

	useEffect(() => {
		const element = ref.current;
		if (!element) return;

		const measure = () => setTruncated(element.scrollWidth > element.clientWidth);
		measure();

		const observer = new ResizeObserver(measure);
		observer.observe(element);
		return () => observer.disconnect();
	}, []);

	return { ref, truncated };
}
