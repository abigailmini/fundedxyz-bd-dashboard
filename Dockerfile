FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV PORT=8080 NODE_ENV=production
EXPOSE 8080
# seed is idempotent for admins; safe to skip if DB already provisioned
CMD ["node","server.js"]
