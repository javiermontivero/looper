FROM mcr.microsoft.com/playwright:v1.64.0-noble AS regression
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY public ./public
COPY tests ./tests
COPY server.mjs playwright.config.mjs ./
CMD ["npm","test"]

FROM regression AS smoke
RUN npm test -- --project=chromium --grep "P01|P42" --no-deps

FROM node:22-alpine
WORKDIR /app
COPY --from=smoke --chown=node:node /app/package.json /app/server.mjs ./
COPY --from=smoke --chown=node:node /app/public ./public
USER node
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s CMD node -e "fetch('http://127.0.0.1:8080/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]
