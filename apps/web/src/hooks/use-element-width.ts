import { useEffect, useRef, useState } from "react";

export function useElementWidth<T extends HTMLElement>() {
	const ref = useRef<T>(null);
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const element = ref.current;
		if (!element) return;
		const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
		observer.observe(element);
		return () => observer.disconnect();
	}, []);
	return [ref, width] as const;
}
