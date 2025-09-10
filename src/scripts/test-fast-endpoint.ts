/**
 * Test script for the fast chart data endpoint
 */

import { db } from "@/lib/db/db";
import { prompts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

async function testFastEndpoint() {
	console.log("🧪 Testing Fast Chart Data Endpoint...\n");

	try {
		// Use the brand ID from your logs
		const brandId = "2aabb918-bd81-4e60-953d-b43a85a9dbca";
		
		// Get a sample prompt
		const samplePrompts = await db
			.select()
			.from(prompts)
			.where(eq(prompts.brandId, brandId))
			.limit(1);

		if (samplePrompts.length === 0) {
			console.log("❌ No prompts found for brand");
			return;
		}

		const testPrompt = samplePrompts[0];
		console.log(`📊 Testing with prompt: "${testPrompt.value.substring(0, 50)}..."`);
		console.log(`🔍 Prompt ID: ${testPrompt.id}`);

		// Test the fast endpoint
		const testUrl = `http://localhost:3000/api/brands/${brandId}/prompts/${testPrompt.id}/chart-data-fast?lookback=1w&webSearchEnabled=true`;
		console.log(`🚀 Testing URL: ${testUrl}`);

		const startTime = Date.now();
		const response = await fetch(testUrl);
		const endTime = Date.now();

		console.log(`⏱️ Response time: ${endTime - startTime}ms`);
		console.log(`📈 Status: ${response.status}`);

		if (response.ok) {
			const data = await response.json();
			console.log(`✅ Success!`);
			console.log(`📊 Chart data points: ${data.chartData?.length || 0}`);
			console.log(`🏃 Total runs: ${data.totalRuns || 0}`);
			console.log(`👁️ Has visibility data: ${data.hasVisibilityData || false}`);
			console.log(`🏢 Brand: ${data.brand?.name || 'Unknown'}`);
			console.log(`🏪 Competitors: ${data.competitors?.length || 0}`);
		} else {
			const errorText = await response.text();
			console.log(`❌ Error: ${response.status}`);
			console.log(`📝 Error details: ${errorText}`);
		}

		console.log("\n🎉 Test completed!");

	} catch (error) {
		console.error("❌ Test failed:", error);
	}
}

// Run the test if this file is executed directly
if (require.main === module) {
	testFastEndpoint()
		.then(() => process.exit(0))
		.catch((error) => {
			console.error("Test execution failed:", error);
			process.exit(1);
		});
}

export { testFastEndpoint };
