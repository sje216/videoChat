# 🎥 WebRTC 기반 실시간 화상채팅 서비스

> **Spring Boot + WebRTC + mediasoup(SFU)** 기반의 실시간 화상채팅 서비스입니다.

단순히 화상채팅 기능을 구현하는 것을 넘어, **다수의 사용자가 동시에 접속하는 환경에서도 안정적으로 서비스를 운영할 수 있는 아키텍처**를 목표로 설계했습니다.

- **Spring Boot** : 시그널링(Signaling) 및 비즈니스 로직 처리
- **mediasoup(SFU)** : 저지연 미디어 스트림 전달
- **Redis** : 분산 상태 관리 및 Room ↔ SFU 매핑
- **Nginx** : Reverse Proxy 및 Blue-Green 배포
- **GitHub Actions** : CI/CD 자동화

---

# 🚀 Demo

> https://joom-signaling.duckdns.org/

---

# 📌 프로젝트 목표

- WebRTC 기반 실시간 통신 구조 이해
- SFU 아키텍처를 활용한 저지연 미디어 전송
- Stateful / Stateless 서버 분리 설계
- Redis 기반 분산 상태 관리
- 장애 상황에서도 서비스 연속성 확보
- 운영 환경을 고려한 CI/CD 구축

---

# ✨ 주요 기능

## 👤 사용자 기능

- 1:1 화상채팅
- 그룹 화상채팅
- 실시간 채팅
- 귓속말
- 화면 공유(Screen Share)
- 마이크 / 카메라 ON·OFF

## ⚙ 운영 기능

- Session Resume
- ICE Restart
- Heartbeat 기반 사용자 상태 관리
- Worker 기반 부하 분산
- Blue-Green 무중단 배포

---

# 🏗 시스템 아키텍처

```text
                   Client
                      │
            STUN / TURN (ICE)
                      │
             HTTPS / WebSocket
                      │
                   Nginx
                      │
        ┌─────────────┴─────────────┐
        │                           │
 Spring Boot                  Spring Boot
 Signaling Server         Signaling Server
        │
        │ Redis (State / Pub/Sub)
        │
   Room ↔ SFU Mapping
        │
   ┌────┴─────────┐
   │              │
SFU Server     SFU Server
(mediasoup)    (mediasoup)
   │              │
Multi Worker   Multi Worker
```

---

# 🛠 Tech Stack

| Category | Technology |
|-----------|------------|
| Backend | Java 17, Spring Boot, Spring WebSocket |
| Realtime | WebRTC, mediasoup, Node.js |
| Cache | Redis |
| Infrastructure | AWS EC2, Docker, Nginx |
| DevOps | GitHub Actions, Docker Hub |
| Network | coturn(STUN/TURN) |
| Monitoring | Prometheus |

---

# ⚙ 핵심 설계

## 📌 Signaling Server

Spring Boot 기반으로 구현했으며, **비즈니스 로직과 WebRTC Signaling을 담당**합니다.

### 역할

- 사용자 인증
- 방 생성 및 관리
- 채팅
- 사용자 상태 관리
- SFU 서버 선택

### 특징

- Stateless 구조
- Redis 기반 상태 공유
- 수평 확장 가능

---

## 📌 SFU Server

mediasoup 기반으로 구현했으며 **미디어 스트림만 처리**합니다.

### 역할

- SDP Offer / Answer
- ICE Candidate 처리
- RTP Packet 중계
- Producer / Consumer 관리

### 특징

- Stateful 구조
- Room 단위 고정
- 장시간 연결 유지

---

## 📌 Redis

Redis를 **캐시가 아닌 분산 상태 저장소**로 활용했습니다.

### 저장 데이터

- User State
- Room ↔ SFU Mapping
- Server Metadata

실제 WebRTC 객체(Transport, Producer)는 메모리에서 관리하고, Redis에는 상태 및 라우팅 정보만 저장했습니다.

---

## 📌 STUN / TURN

WebRTC는 ICE 과정을 통해 최적의 연결 경로를 탐색합니다.

| 서버 | 역할 |
|------|------|
| STUN | Public IP 확인 및 P2P 연결 지원 |
| TURN | 직접 연결이 실패한 경우 미디어 중계 |

TURN 사용을 최소화하여 비용과 네트워크 지연을 줄였습니다.

---

## 📌 Nginx

무료 환경에서는 AWS ALB 대신 Nginx를 Reverse Proxy로 사용했습니다.

### 역할

- HTTPS(TLS)
- Reverse Proxy
- WebSocket Upgrade
- Blue-Green 배포

Reload만으로 기존 WebSocket 연결은 유지하면서 신규 요청만 새로운 서버로 전달하도록 구성했습니다.

---

# 🔄 WebRTC 연결 흐름

```text
Client
   │
   ▼
WebSocket 연결

   │
   ▼
SDP Offer / Answer

   │
   ▼
ICE Candidate 교환

   │
   ▼
Redis에서 Room 조회

   │
   ▼
SFU 선택

   │
   ▼
WebRTC 연결

   │
   ▼
Media Streaming
```

---

# 🚀 확장 전략

## Signaling Server

- Stateless 구조
- Redis 기반 상태 공유
- 자유로운 수평 확장

## SFU Server

- Stateful 구조
- Room 단위 고정
- 신규 Room만 새로운 SFU에 할당

이를 통해 기존 WebRTC 연결을 유지하면서 서버를 확장할 수 있도록 설계했습니다.

---

# ⚙ SFU 최적화

## Multi Worker

Node.js의 Single Thread 한계를 극복하기 위해 CPU Core 수만큼 Worker를 생성했습니다.

### 효과

- CPU 활용률 향상
- 병렬 처리
- 대규모 Room 지원

---

## Least Connections

Worker별 활성 Router 수를 기준으로 가장 여유로운 Worker를 선택하도록 구현했습니다.

### 효과

- 부하 분산
- 특정 Worker 과부하 방지

---

## Monitoring

Prometheus를 활용하여 Worker별 Router 수와 부하 상태를 모니터링했습니다.

---

# 🔒 서비스 연속성 (Resilience)

## Session Resume

일시적인 네트워크 장애 발생 시 기존 WebRTC 세션을 복구하도록 구현했습니다.

---

## Heartbeat + Redis TTL

비정상 종료된 사용자를 자동으로 제거하여 Ghost User 문제를 해결했습니다.

---

## ICE Restart

Transport 장애 발생 시 새로고침 없이 ICE를 재협상하여 연결을 복구했습니다.

---

# 🚀 CI / CD

GitHub Actions 기반 자동 배포 환경을 구축했습니다.

## CI

- Checkout
- Build
- Test
- Docker Image Build
- Docker Hub Push

## CD

### Signaling Server

- Blue-Green 배포
- Health Check
- Nginx Reload
- 무중단 배포

### SFU Server

- Canary 방식
- 기존 연결 유지
- 신규 Room만 신규 SFU로 라우팅

---

# 🛠 주요 트러블슈팅

## Race Condition

### 문제

Producer 이벤트가 먼저 도착하여 `consume()` 호출이 실패했습니다.

### 해결

Transport 준비 여부를 확인한 후 재시도하도록 개선했습니다.

---

## 사용자 상태 동기화

### 문제

중간 입장한 사용자가 기존 참여자의 상태를 알 수 없었습니다.

### 해결

입장 시 사용자 상태 Snapshot을 전달하도록 개선했습니다.

---

## Resource Cleanup

### 문제

재접속 시 Producer와 Media 객체가 메모리에 남았습니다.

### 해결

고유 ID 기반으로 리소스를 관리하고 연결 종료 시 모두 정리했습니다.

---

# 📚 What I Learned

- WebRTC 및 SFU 아키텍처 설계
- Stateful / Stateless 서버 분리
- Redis 기반 분산 상태 관리
- Worker 기반 부하 분산 전략
- 서비스 연속성(Resilience) 설계
- 운영 환경을 고려한 CI/CD 구축
- 실시간 서비스 트러블슈팅 경험

---

# 🚀 Future Improvements

- JWT 기반 인증 / 인가
- Kubernetes(EKS) 기반 Signaling Auto Scaling
- SFU Auto Scaling
- Prometheus + Grafana 모니터링 대시보드
- Kafka 기반 이벤트 처리

---

# 👩‍💻 Author

**신지은**

- GitHub : https://github.com/sje216/videoChat
