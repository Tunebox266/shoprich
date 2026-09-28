import { prisma } from "./prisma";
import { NextRequest } from "next/server";
import { auth } from "./auth";
import { logger } from "./logger";
import crypto from "crypto";

// Role hierarchy for permission checks
const ROLE_HIERARCHY = {
    SUPERADMIN: 3,
    OWNER: 2,
    STAFF: 1
} as const;

type Role = keyof typeof ROLE_HIERARCHY;

function hashApiKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
}

export function validateApiKeyFormat(key: string): boolean {
    // API keys must be at least 32 characters
    return key && key.length >= 32;
}

/**
 * Validate API key from request header
 */
export async function validateApiKey(request: NextRequest) {
    const apiKey = request.headers.get("x-api-key");

    if (!apiKey) {
        return null;
    }

    // New keys are stored hashed (sha256). First try to find by hash, then
    // fall back to plaintext for old (legacy) keys that haven't been migrated —
    // so old keys keep working until the user generates a new one.
    const hashed = hashApiKey(apiKey);

    try {
        const user = await prisma.user.findFirst({
            where: { OR: [{ apiKey: hashed }, { apiKey }] },
            select: { id: true, email: true, name: true, role: true, plan: true, planExpiresAt: true }
        });

        return user;
    } catch {
        // Fallback: if plan/planExpiresAt columns don't exist in DB yet (haven't been `db push`),
        // don't fail auth completely — just assume FREE for now.
        try {
            const user = await prisma.user.findFirst({
                where: { OR: [{ apiKey: hashed }, { apiKey }] },
                select: { id: true, email: true, name: true, role: true }
            });
            return user ? { ...user, plan: "FREE", planExpiresAt: null } : null;
        } catch (e2) {
            logger.error("Auth", "API key validation error:", e2);
            return null;
        }
    }
}

/**
 * Get authenticated user from either session or API key
 */
export async function getAuthenticatedUser(request?: NextRequest) {
    // First try API key if request is provided
    if (request) {
        const apiKeyUser = await validateApiKey(request);
        if (apiKeyUser) {
            return { ...apiKeyUser, authMethod: "apiKey" as const };
        }
    }

    // Fall back to session auth
    const session = await auth();
    if (session?.user?.id) {
        // Fetch full user data including role
        let user: any = null;
        try {
            user = await prisma.user.findUnique({
                where: { id: session.user.id },
                select: { id: true, email: true, name: true, role: true, plan: true, planExpiresAt: true }
            });
        } catch {
            // Fallback if plan column doesn't exist in DB yet (haven't been `db push`)
            try {
                const base = await prisma.user.findUnique({
                    where: { id: session.user.id },
                    select: { id: true, email: true, name: true, role: true }
                });
                user = base ? { ...base, plan: "FREE", planExpiresAt: null } : null;
            } catch (e) {
                logger.error("Auth", "Session user fetch error:", e);
                user = null;
            }
        }

        if (user) {
            return { ...user, authMethod: "session" as const };
        }
    }

    return null;
}

/**
 * Check if user has required role level
 */
export function hasRole(userRole: string, requiredRole: Role): boolean {
    const userLevel = ROLE_HIERARCHY[userRole as Role] || 0;
    const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
    return userLevel >= requiredLevel;
}

/**
 * Check if user is admin (SUPERADMIN or has admin privileges)
 */
export function isAdmin(userRole: string): boolean {
    return hasRole(userRole, "SUPERADMIN") || hasRole(userRole, "OWNER");
}

/**
 * Check if user can access a specific session
 */
export async function canAccessSession(userId: string, userRole: string, sessionId: string): Promise<boolean> {
    if (isAdmin(userRole)) return true;

    const session = await prisma.session.findUnique({
        where: { sessionId },
        select: { userId: true, sharedWith: true }
    });

    if (!session) return false;
    if (session.userId === userId) return true;

    // Check if shared with this user
    return session.sharedWith?.some(access => access.userId === userId) || false;
}

/**
 * Get all sessions accessible to a user (owned + shared)
 */
export async function getAccessibleSessions(userId: string, userRole: string) {
    if (isAdmin(userRole)) {
        // Admins can see all sessions
        return prisma.session.findMany({
            select: {
                id: true,
                sessionId: true,
                name: true,
                status: true,
                userId: true,
                createdAt: true,
                updatedAt: true
            }
        });
    }

    // Regular users: owned + shared
    return prisma.session.findMany({
        where: {
            OR: [
                { userId },
                { sharedWith: { some: { userId } } }
            ]
        },
        select: {
            id: true,
            sessionId: true,
            name: true,
            status: true,
            userId: true,
            createdAt: true,
            updatedAt: true
        }
    });
}
