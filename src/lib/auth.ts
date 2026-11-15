import { cookies, headers } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { db } from "./db";
import { SessionUser } from "./types";
import { getJwtSecretKey } from "./jwt-secret";

const COOKIE_NAME = "appointment_session";
const FALLBACK_COOKIE_NAME = "consignment_session";

// Resolved lazily so a missing production secret fails requests instead of the build.
const getSecret = () => getJwtSecretKey();

/**
 * Determine if a user qualifies as Admin or Iqbal (Logistics Manager).
 * Strictly denies all other employees.
 */
export function isAllowedAppointmentUser(user: {
  role: string;
  username: string;
  name?: string | null;
  department?: string | null;
  permissions?: Array<{ allowedFields?: string[] }>;
}): boolean {
  if (user.role === "BOX_PACKER") return false;
  if (user.role === "ADMIN") return true;

  // Logistics / Dispatch department (exact match, set by an admin in the consignment app).
  const dept = (user.department || "").toLowerCase().trim();
  if (dept === "dispatch" || dept === "logistics") return true;

  // Explicitly named accounts. Exact usernames only: display names and substrings are not
  // trusted, because anyone who can edit a user's name could otherwise grant access.
  const uname = user.username.toLowerCase().trim();
  return getAllowedUsernames().has(uname);
}

function getAllowedUsernames(): Set<string> {
  const raw = process.env.APPOINTMENT_ALLOWED_USERNAMES ?? "iqbal,dispatch";
  return new Set(raw.split(",").map((u) => u.trim().toLowerCase()).filter(Boolean));
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function resolveCookieSecure(): Promise<boolean> {
  if (process.env.COOKIE_SECURE === "true") return true;
  if (process.env.COOKIE_SECURE === "false") return false;
  try {
    const headersList = await headers();
    const proto = headersList.get("x-forwarded-proto");
    if (proto) return proto.toLowerCase() === "https";
    const host = headersList.get("host");
    if (host && (host.includes("localhost") || host.match(/^(\d{1,3}\.){3}\d{1,3}/))) {
      return false;
    }
  } catch {
    // headers() might not be available outside request context
  }
  if (process.env.NODE_ENV === "production") return true;
  return false;
}

export async function createSession(userId: string): Promise<string> {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(getSecret());

  try {
    const isSecure = await resolveCookieSecure();
    const cookieStore = await cookies();
    cookieStore.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: isSecure,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30, // 30 days
    });
  } catch {
    // Outside request context (e.g. unit tests or background scripts)
  }

  return token;
}

export async function destroySession(): Promise<void> {
  try {
    const cookieStore = await cookies();
    cookieStore.delete(COOKIE_NAME);
    cookieStore.delete(FALLBACK_COOKIE_NAME);
  } catch {
    // Outside request context
  }
}

export async function verifySessionToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    const userId = payload.sub as string;
    if (!userId) return null;

    const user = await db.user.findUnique({
      where: { id: userId, isActive: true },
      include: {
        permissions: true,
      },
    });

    if (!user) return null;

    const isAuthorized = isAllowedAppointmentUser(user);

    return {
      id: user.id,
      username: user.username,
      name: user.name,
      role: user.role as any,
      department: user.department,
      isLogisticsAuthorized: isAuthorized,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(req?: any): Promise<SessionUser | null> {
  try {
    let token: string | undefined;

    // Check request object if passed
    if (req) {
      if (req.cookies && typeof req.cookies.get === "function") {
        token = req.cookies.get(COOKIE_NAME)?.value || req.cookies.get(FALLBACK_COOKIE_NAME)?.value;
      }
      if (!token && req.headers && typeof req.headers.get === "function") {
        const cookieHeader = req.headers.get("cookie");
        if (cookieHeader) {
          const match =
            cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`)) ||
            cookieHeader.match(new RegExp(`${FALLBACK_COOKIE_NAME}=([^;]+)`));
          if (match) token = match[1];
        }
        if (!token) {
          const authHeader = req.headers.get("authorization");
          if (authHeader && authHeader.startsWith("Bearer ")) {
            token = authHeader.substring(7);
          }
        }
      }
      if (token) {
        return verifySessionToken(token);
      }
    }

    // App router cookies()
    const cookieStore = await cookies();
    token = cookieStore.get(COOKIE_NAME)?.value || cookieStore.get(FALLBACK_COOKIE_NAME)?.value;
    if (!token) return null;

    return verifySessionToken(token);
  } catch {
    return null;
  }
}
