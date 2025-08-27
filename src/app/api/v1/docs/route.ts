import { NextResponse } from "next/server";

export async function GET() {
	// Return HTML page with Swagger UI
	const html = `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>API Documentation</title>
	<link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui.css" />
	<style>
		body {
			margin: 0;
			padding: 20px;
			font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
		}
		.header {
			margin-bottom: 20px;
			padding: 20px;
			background: #f8f9fa;
			border-radius: 8px;
			border: 1px solid #e9ecef;
		}
		.header h1 {
			margin: 0 0 10px 0;
			color: #333;
		}
		.header p {
			margin: 0;
			color: #666;
		}
		.swagger-ui .topbar { display: none; }
		.swagger-ui .info { margin: 0 0 20px 0; }
	</style>
</head>
<body>
	<div class="header">
		<h1>API Documentation</h1>
		<p>REST API for administrative operations.</p>
	</div>
	<div id="swagger-ui"></div>

	<script src="https://unpkg.com/swagger-ui-dist@5.9.0/swagger-ui-bundle.js"></script>
	<script>
		SwaggerUIBundle({
			url: '/api/v1/openapi.json',
			dom_id: '#swagger-ui',
			presets: [
				SwaggerUIBundle.presets.apis,
				SwaggerUIBundle.presets.standalone
			],
			layout: "BaseLayout",
			docExpansion: 'list',
			defaultModelExpandDepth: 2,
			defaultModelsExpandDepth: 1,
			displayOperationId: false,
			displayRequestDuration: true,
			filter: false,
			showExtensions: false,
			showCommonExtensions: false,
			tryItOutEnabled: true
		});
	</script>
</body>
</html>`;

	return new NextResponse(html, {
		headers: {
			"Content-Type": "text/html"
		}
	});
}
