# 1단계: Node.js와 빌드 도구 포함
FROM node:18-slim AS builder
WORKDIR /app

# 2단계: mediasoup 빌드 전제 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 3단계: sfu-server의 의존성 설치 (경로 명시)
COPY sfu-server/package*.json ./sfu-server/
RUN cd sfu-server && npm install

# 4단계: sfu-server와 joom-client 폴더 전체를 각각 복사
COPY sfu-server ./sfu-server
COPY joom-client ./joom-client

EXPOSE 3000 10000-20000/udp 10000-20000/tcp

# 🔥 실행할 때 sfu-server 폴더 안의 진짜 파일명을 지정해서 실행!
# 파일명이 sfu-server.js 라면 아래처럼 입력 (되도록 영문 권장: sfu-server.js)
CMD [ "node", "sfu-server/server.js" ]