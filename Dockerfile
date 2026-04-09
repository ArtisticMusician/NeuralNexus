# Build stage
FROM node:22-slim AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

# Production stage
FROM node:22-slim

WORKDIR /app

# Runtime deps
RUN apt-get update && apt-get install -y \
    python3 \
    sqlite3 \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
# Copy dashboard assets if they exist (assuming dist includes compiled TS, but dashboard might be static)
# If dashboard source is in src/dashboard, the build script should handle it or we copy it manually.
# Based on file structure, dashboard is in /dashboard/src. Let's assume user built it or we serve static.
# For now, we copy the dist folder where tsc outputs.

# Create data directory
RUN mkdir -p /app/data

EXPOSE 3000
EXPOSE 3001

ENV PORT=3000
ENV HOST=0.0.0.0
ENV NODE_ENV=production

# Start both Server and Proxy
CMD ["sh", "-c", "node dist/src/server.js & node dist/src/openai-proxy.js"]
