FROM node:18

WORKDIR /app

# Install build tools needed to compile SQLite
RUN apt-get update && apt-get install -y python3 make g++

COPY package*.json ./
# Force sqlite3 to rebuild from source during install
RUN npm install --build-from-source sqlite3

COPY . .

EXPOSE 3000
CMD ["node", "server.js"]