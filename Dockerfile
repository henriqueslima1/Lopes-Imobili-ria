# Railway: servidor Node do hub (site + login + CRM + Postgres)
FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json server/
RUN cd server && npm ci --omit=dev
COPY server server
COPY public_html public_html
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
