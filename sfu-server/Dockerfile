# 1단계: Node.js와 빌드 도구가 포함된 베이스 이미지 사용
FROM node:18-slim AS builder
WORKDIR /app
# 2단계: mediasoup 빌드에 필요한 전제 패키지 설치 (pip3 필수!)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 3단계: 의존성 파일 복사 및 설치
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000 10000-20000/udp
CMD [ "node", "server.js" ]