# 1단계: Node.js와 빌드 도구가 포함된 베이스 이미지 사용
FROM node:18-slim AS builder
WORKDIR /app

# 2단계: mediasoup 빌드에 필요한 전제 패키지 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# 3단계: 의존성 파일 복사 및 설치 (현재 폴더인 sfu-server 기준)
COPY sfu-server/package*.json ./sfu-server/
RUN cd sfu-server && npm install

# 4단계: 소스코드 및 클라이언트 파일 전체 복사
COPY sfu-server ./sfu-server
COPY joom-client ./joom-client

EXPOSE 3000 10000-20000/udp 10000-20000/tcp

# 실행 명령어 (sfu-server.js가 루트에 바로 복사되므로 파일명만 지정)
CMD [ "node", "sfu-server/server.js" ]