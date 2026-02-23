# Multi-stage build for optimal image size
FROM node:20-alpine AS builder

WORKDIR /usr/src/app

COPY . .

RUN npm ci

# Build TypeScript
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /usr/src/app

# Copy only necessary files from builder
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/package*.json ./
COPY --from=builder /usr/src/app/tsconfig*.json ./

# Create logs directory
RUN mkdir -p logs

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3000/health', (r) => {if (r.statusCode !== 200) throw new Error(r.statusCode)})"

# Start the application with tsconfig-paths to resolve path aliases
ENV TS_NODE_PROJECT=tsconfig.production.json
CMD ["node", "-r", "tsconfig-paths/register", "dist/server.js"]
