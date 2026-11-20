import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSession, verifyPassword, isAllowedAppointmentUser } from "@/lib/auth";
import { checkRateLimit, getClientIp, peekRateLimit, resetRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const IP_USER_LIMIT = { windowMs: 5 * 60 * 1000, maxRequests: 5 };
const USER_LIMIT = { windowMs: 15 * 60 * 1000, maxRequests: 20 };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password || typeof username !== "string" || typeof password !== "string") {
      return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
    }

    const cleanUsername = username.trim().toLowerCase();
    const ipUserKey = `login:${getClientIp(req.headers)}:${cleanUsername}`;
    const userKey = `login-user:${cleanUsername}`;

    // Check limits before verifying the password, so a blocked caller cannot keep guessing.
    for (const [key, opts] of [[ipUserKey, IP_USER_LIMIT], [userKey, USER_LIMIT]] as const) {
      const peek = peekRateLimit(key, opts);
      if (!peek.success) {
        return NextResponse.json(
          { error: `Too many login attempts. Please try again in ${peek.retryAfterSeconds} seconds.` },
          { status: 429, headers: { "Retry-After": String(peek.retryAfterSeconds) } }
        );
      }
    }

    const user =
      (await db.user.findUnique({ where: { username: cleanUsername }, include: { permissions: true } })) ??
      (await db.user.findFirst({
        where: { username: { equals: cleanUsername, mode: "insensitive" } },
        include: { permissions: true },
      }));

    const isValid = Boolean(user && user.isActive && (await verifyPassword(password, user.passwordHash)));

    if (!user || !isValid) {
      checkRateLimit(ipUserKey, IP_USER_LIMIT);
      checkRateLimit(userKey, USER_LIMIT);
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    resetRateLimit(ipUserKey);
    resetRateLimit(userKey);

    if (!isAllowedAppointmentUser(user)) {
      return NextResponse.json(
        {
          error:
            "Access Denied: your account needs the 'Logistics app desks' permission on at least one platform (granted in the consignment app under Admin → Users).",
        },
        { status: 403 }
      );
    }

    await createSession(user.id);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        department: user.department,
        isLogisticsAuthorized: true,
        globalPermissions: user.globalPermissions,
        permissions: user.permissions.map((p) => ({ channel: p.channel, actions: p.actions })),
      },
    });
  } catch (error: unknown) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}
