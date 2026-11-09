#!/bin/sh
set -e

echo "🚀 [Appointment] Starting Appointment Management application..."

# Verify database connection URL
if [ -z "$DATABASE_URL" ]; then
  echo "❌ [Appointment] CRITICAL ERROR: DATABASE_URL environment variable is not defined!"
  exit 1
fi

# Mask credentials for logging
MASKED_URL=$(echo "$DATABASE_URL" | sed -E 's/(:\/\/[^:]+:)[^@]+(@)/\1****\2/')
echo "📡 [Appointment] Connecting to Shared Consignment Database: $MASKED_URL"

# Generate prisma client if needed
if [ -f "./prisma/schema.prisma" ]; then
  echo "🔧 [Appointment] Verifying Prisma Client..."
  npx prisma generate --schema=./prisma/schema.prisma || true
  echo "📦 [Appointment] Synchronizing Database Schema..."
  npx prisma db push --skip-generate || true
fi

echo "✅ [Appointment] Initialization complete. Launching server on port ${PORT:-3001}..."
exec "$@"
