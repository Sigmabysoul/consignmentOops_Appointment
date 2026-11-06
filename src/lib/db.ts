import { PrismaClient } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";

// Automatically load environment variables if DATABASE_URL is not yet defined in the runtime process
if (!process.env.DATABASE_URL && typeof process.loadEnvFile === "function") {
  const envFiles = [
    path.resolve(process.cwd(), ".env.local"),
    path.resolve(process.cwd(), ".env"),
    path.resolve(process.cwd(), "prisma/.env"),
    path.resolve(process.cwd(), "../consignment/.env.local"),
    path.resolve(process.cwd(), "../consignment/.env"),
  ];

  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      try {
        process.loadEnvFile(file);
        if (process.env.DATABASE_URL) break;
      } catch {
        // Continue checking other candidates
      }
    }
  }
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export default db;
