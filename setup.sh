#!/bin/bash

set -e

echo "🚀 Starting Internal Wallet Service Setup..."

if [ -f .env ]; then
    set -a
    source .env
    set +a
fi

# 1. Install dependencies
echo "📦 Installing Node.js dependencies..."
npm install

# 2. Setup the Database Schema
echo "🏗️ Initializing Database Tables..."
if [ -n "$DIRECT_URL" ]; then
    CLEAN_DIRECT_URL="${DIRECT_URL%%\?*}"
    psql "$CLEAN_DIRECT_URL" -f db_init.sql
elif [ -z "$DATABASE_URL" ]; then
    psql "postgresql://localhost:5432/postgres" -f db_init.sql
else
    CLEAN_DATABASE_URL="${DATABASE_URL%%\?*}"
    psql "$CLEAN_DATABASE_URL" -f db_init.sql
fi

# 3. Seed the initial data
echo "🌱 Seeding the database with initial assets and test users..."
if [ -n "$DIRECT_URL" ]; then
    CLEAN_DIRECT_URL="${DIRECT_URL%%\?*}"
    psql "$CLEAN_DIRECT_URL" -f seed.sql
elif [ -z "$DATABASE_URL" ]; then
    # Fallback to local default if no env variable is provided
    psql "postgresql://localhost:5432/postgres" -f seed.sql
else
    CLEAN_DATABASE_URL="${DATABASE_URL%%\?*}"
    psql "$CLEAN_DATABASE_URL" -f seed.sql
fi

echo "✅ Setup complete! You can now start the server using 'npm run dev'."
