# syntax=docker/dockerfile:1
FROM node:20-alpine

WORKDIR /app

# Install deps first for better cache
COPY --chown=node:node frontend/ai_girls/package*.json ./
RUN npm ci

# Copy rest of app
COPY --chown=node:node frontend/ai_girls .

USER node

EXPOSE 3000

ENV HOST=0.0.0.0

# Default dev command; overridden in docker-compose if needed
CMD ["npm", "run", "dev"]

