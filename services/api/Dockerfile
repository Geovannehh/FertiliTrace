FROM node:22-slim
WORKDIR /app/services/api
RUN apt-get update && apt-get install -y --no-install-recommends openssl && apt-get clean
COPY services/api/package*.json ./
RUN npm ci
COPY services/api ./
COPY domain /app/domain
RUN npx prisma generate && npm run build
EXPOSE 8000
CMD ["sh", "-c", "npx prisma db push && npm start"]
