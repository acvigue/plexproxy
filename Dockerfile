FROM node:current-alpine
WORKDIR /app
RUN apk add g++ make python3
RUN npm config set python "$(which python3)"
COPY . .
RUN npm install --production
EXPOSE 8080
RUN chown -R 1000:1000 /app
RUN chmod 775 /app
USER 1000:1000
CMD ["node", "index.js"]
