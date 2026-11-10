# Railway: servidor Node que entrega o hub (public_html)
FROM node:22-alpine
WORKDIR /app
COPY server server
COPY public_html public_html
ENV NODE_ENV=production
EXPOSE 8080
USER node
CMD ["node", "server/index.js"]
