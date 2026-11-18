# HEX DECK — serveur dédié auto-hébergé (sert aussi le site du jeu)
#   docker build -t hexdeck .
#   docker run -p 3001:3001 hexdeck        → http://<ip>:3001
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY shared/package.json shared/
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build -w client
ENV PORT=3001 NODE_ENV=production
EXPOSE 3001
CMD ["npm", "start"]
