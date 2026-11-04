import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Ping PostgreSQL to verify DB connectivity
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      app: "appointment",
      database: "connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        app: "appointment",
        database: "disconnected",
        error: error.message || "Database connection error",
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
