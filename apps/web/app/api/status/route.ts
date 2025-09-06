import { NextResponse } from "next/server";
import { getAppConfig } from "@/lib/adapters";

export async function GET() {
  const { adapters, features } = getAppConfig();

  try {
    // In OSS version, this doesn't require auth but we can still get user info
    const user = await adapters.auth.getCurrentUser();

    const status = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
      environment: process.env.NODE_ENV || "development",
      features: {
        auth: features.auth,
        billing: features.billing,
        organizations: features.organizations,
      },
      user: user
        ? {
            id: user.id,
            name: user.name,
          }
        : null,
    };

    return NextResponse.json(status);
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
