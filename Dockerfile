# Multi-stage build for ApplyPilot

# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY apps/web/package*.json ./apps/web/
COPY packages/*/package*.json ./packages/*/

RUN npm ci

# Copy source code
COPY . .

# Build all packages
RUN npm run build

# Stage 2: Production API
FROM node:20-alpine AS api

WORKDIR /app

# Copy built API
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package*.json ./
COPY --from=builder /app/node_modules ./node_modules

# Install production dependencies only
RUN npm ci --only=production

EXPOSE 8080

CMD ["node", "dist/index.js"]

# Stage 3: Production Web
FROM nginx:alpine AS web

# Copy built web app
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
