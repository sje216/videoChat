FROM node:18-bullseye
WORKDIR /app
RUN apt-get update && apt-get install -y python3 build-essential
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000 10000-20000/udp
CMD [ "node", "server.js" ]