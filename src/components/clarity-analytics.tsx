'use client';

import { useEffect } from 'react';

export default function ClarityAnalytics() {
	useEffect(() => {
		// Import and initialize Microsoft Clarity
		import('@microsoft/clarity').then((clarity) => {
			clarity.default.init('sh0kibwp8u');
		});
	}, []);

	return null; // This component doesn't render anything
}
