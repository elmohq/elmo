import { NextRequest, NextResponse } from "next/server";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";

export async function POST(request: NextRequest) {
	try {
		const { products } = await request.json();

		if (!products || !Array.isArray(products) || products.length === 0) {
			return NextResponse.json(
				{ error: "Products array is required" },
				{ status: 400 }
			);
		}

		const productList = products.join(', ');
		const prompt = `What are groups of personas or purposes/uses of the products for a company that sells the following types of products would sell to:
${productList}

Be concise and output to a comma separated list contained within <out> xml tags and <group> tags. List up to 3 groups with up to 5 items in each group. Don't include a name for the group in the group.

Example format:
<group><out>fitness enthusiasts,athletes,bodybuilders,gym goers,personal trainers</out></group>
<group><out>busy professionals,parents,students,seniors,health conscious individuals</out></group>
<group><out>weight loss seekers,muscle builders,recovery focused,endurance athletes,wellness enthusiasts</out></group>`;

		const { text } = await generateText({
			model: anthropic("claude-3-5-sonnet-20241022"),
			prompt,
			maxTokens: 800,
		});

		// Extract groups
		const groupMatches = text.match(/<group><out>([\s\S]*?)<\/out><\/group>/g);
		const personaGroups = groupMatches 
			? groupMatches.map(groupMatch => {
					const contentMatch = groupMatch.match(/<group><out>([\s\S]*?)<\/out><\/group>/);
					return contentMatch 
						? contentMatch[1].split(',').map(p => p.trim()).filter(p => p.length > 0)
						: [];
				}).filter(group => group.length > 0)
			: [];

		console.log("GET-PERSONAS OUTPUT:", { personaGroups });

		return NextResponse.json({ personaGroups });
	} catch (error) {
		console.error("Error getting personas:", error);
		return NextResponse.json(
			{ error: "Failed to get personas" },
			{ status: 500 }
		);
	}
} 