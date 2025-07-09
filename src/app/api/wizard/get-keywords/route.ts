import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
	try {
		const { domain } = await request.json();

		if (!domain) {
			return NextResponse.json(
				{ error: "Domain is required" },
				{ status: 400 }
			);
		}

		// Check if DataForSEO credentials are available
		if (!process.env.DATAFORSEO_LOGIN || !process.env.DATAFORSEO_PASSWORD) {
			console.warn("DataForSEO credentials not configured, returning mock data");
			// Return mock data for now
			const mockKeywords = [
				{ keyword: "best shoes", search_volume: 12000, difficulty: 65 },
				{ keyword: "running shoes", search_volume: 8500, difficulty: 72 },
				{ keyword: "casual footwear", search_volume: 3200, difficulty: 45 },
				{ keyword: "athletic shoes", search_volume: 5400, difficulty: 58 },
				{ keyword: "comfortable shoes", search_volume: 4100, difficulty: 52 },
			];

			console.log("GET-KEYWORDS OUTPUT (MOCK):", { keywords: mockKeywords });

			return NextResponse.json({ keywords: mockKeywords });
		}

		// Initialize DataForSEO client
		const DataForSeoApi = require('dataforseo-client');
		const dfsApi = new DataForSeoApi(process.env.DATAFORSEO_LOGIN, process.env.DATAFORSEO_PASSWORD);

		// Clean domain (remove protocol and www)
		const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/^www\./, '');

		// Get keywords for the domain
		const response = await dfsApi.keywords_data.google_ads.keywords_for_site.post([{
			target: cleanDomain,
			location_name: "United States",
			language_name: "English",
			date_from: "2024-01-01",
			include_serp_info: true,
			limit: 50,
			filters: [
				["search_volume", ">", 100],
				["competition", "<", 0.8]
			],
			order_by: ["search_volume,desc"]
		}]);

		if (response && response.tasks && response.tasks[0] && response.tasks[0].result) {
			const keywords = response.tasks[0].result.map((item: any) => ({
				keyword: item.keyword,
				search_volume: item.search_volume || 0,
				difficulty: Math.round((item.competition || 0) * 100)
			}));

			console.log("GET-KEYWORDS OUTPUT (API):", { keywords });

			return NextResponse.json({ keywords });
		}

		console.log("GET-KEYWORDS OUTPUT (EMPTY):", { keywords: [] });

		return NextResponse.json({ keywords: [] });
	} catch (error) {
		console.error("Error getting keywords:", error);
		return NextResponse.json(
			{ error: "Failed to get keywords" },
			{ status: 500 }
		);
	}
} 