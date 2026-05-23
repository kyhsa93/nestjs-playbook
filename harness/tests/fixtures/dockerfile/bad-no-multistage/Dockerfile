FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY src ./src
COPY tsconfig.json tsconfig.build.json ./
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start:prod"]
