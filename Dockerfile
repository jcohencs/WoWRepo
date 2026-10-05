FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=dev
COPY . .
RUN npm run build
ENV NODE_ENV=production PORT=8787 CACHE_DIR=/data
VOLUME /data
EXPOSE 8787
CMD ["npm", "start"]
