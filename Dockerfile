FROM node:current-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --production
COPY . .
EXPOSE 8080
RUN chown -R 501:20 /app
RUN chmod 775 /app
USER 501:20
CMD ["node", "index.js"]