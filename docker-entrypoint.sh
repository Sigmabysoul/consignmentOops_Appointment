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
  # No schema sync here. The database is shared with the consignment app, which owns the schema
  # through prisma migrations. Running `db push` from this app's (diverging) schema copy could
  # alter or drop consignment tables.
fi

echo "✅ [Appointment] Initialization complete. Launching server on port ${PORT:-3001}..."
exec "$@"
