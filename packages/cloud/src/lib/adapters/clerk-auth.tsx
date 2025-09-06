// Server-side auth adapter
import { auth, currentUser } from "@clerk/nextjs/server";
import type {
  AuthAdapter,
  Organization,
  User,
} from "@elmo/shared/lib/adapters/types";

export class ClerkAuthAdapter implements AuthAdapter {
  async getCurrentUser(): Promise<User | null> {
    const user = await currentUser();
    if (!user) return null;

    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || "",
      name: user.fullName || user.firstName || "User",
      imageUrl: user.imageUrl,
    };
  }

  async getOrganization(): Promise<Organization | null> {
    // For now, return null. Can be extended later for org support
    return null;
  }

  async requireAuth(): Promise<User> {
    const user = await this.getCurrentUser();
    if (!user) {
      throw new Error("Authentication required");
    }
    return user;
  }

  async requireAuthInRoute(): Promise<User> {
    const { userId } = await auth();
    if (!userId) {
      throw new Error("Authentication required");
    }

    const user = await currentUser();
    if (!user) {
      throw new Error("User not found");
    }

    return {
      id: user.id,
      email: user.emailAddresses[0]?.emailAddress || "",
      name: user.fullName || user.firstName || "User",
      imageUrl: user.imageUrl,
    };
  }

  async signOut(): Promise<void> {
    // Clerk handles sign out through their components
    // This would typically redirect to sign out
    throw new Error("Use Clerk UserButton for sign out");
  }
}
