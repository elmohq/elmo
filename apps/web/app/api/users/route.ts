import { constants } from "node:http2";
import { getAppConfig } from "@/lib/adapters";

export async function GET() {
  const { adapters } = getAppConfig();

  try {
    const user = await adapters.auth.getCurrentUser();

    if (!user) {
      return Response.json(
        { error: "Unauthorized" },
        { status: constants.HTTP_STATUS_UNAUTHORIZED }
      );
    }

    return Response.json({ user }, { status: constants.HTTP_STATUS_OK });
  } catch (_error) {
    return Response.json(
      { error: "Internal server error" },
      { status: constants.HTTP_STATUS_INTERNAL_SERVER_ERROR }
    );
  }
}
