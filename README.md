
# 🎥 WebRTC 기반 대규모 화상채팅 서비스
> **Mediasoup(SFU)과 Spring Boot를 결합한 저지연 미디어 스트리밍 서비스**

본 프로젝트는 WebRTC의 Mesh 구조가 가진 클라이언트 부하 문제를 해결하기 위해 **SFU(Selective Forwarding Unit) 아키텍처**를 채택하고, 안정적인 비즈니스 로직 처리를 위해 **Spring Boot 시그널링 서버**를 구축한 모노레포 프로젝트입니다.

WebRTC와 SFU 아키텍처를 기반으로  
**실시간 화상채팅 + 메시지 기능**을 제공하는 개인 프로젝트입니다.

단순 기능 구현을 넘어  
**확장성, 장애 대응, 네트워크 지연 최소화**를 목표로 설계했습니다.

---

## 🔗 Demo
- URL: https://joom-signaling.duckdns.org/

---

## 📌 Project Overview

### 서비스 설명
- 다수의 사용자가 **실시간 화상채팅과 메시지를 동시에** 주고받을 수 있는 서비스
- WebRTC SFU 구조를 적용해 **낮은 지연 시간과 비용 효율성** 확보
- 시그널링 서버와 미디어 서버를 분리하여 **확장성과 안정성**을 고려한 설계

### 개발 목표
- WebRTC 기반 실시간 통신 구조 이해
- 대규모 트래픽을 고려한 서버 분산 설계
- CI/CD를 통한 실서비스 수준의 배포 경험

---

## 🧩 Features

### 화상채팅
- 1:1 / 다자간 화상채팅
- WebRTC 기반 실시간 미디어 전송
- SFU(mediasoup) 방식 적용

### 메시지
- WebRTC DataChannel 기반 메시지 송수신
- 전체 메시지
- 귓속말(특정 사용자에게만 전송)

### 네트워크 대응
- STUN 서버를 통한 NAT Traversal
- STUN 실패 시 TURN 서버 fallback
- UDP 기반 전송으로 실시간성 보장

---

## 🏗️ Architecture

### 전체 시스템 구조
```text
[ Browser ]
     │
     │ WebSocket (Signaling)
     ▼
[ Application Load Balancer ]
     ▼
[ Signaling Server (Node.js) ]
     │
     ├─ Redis (Room ↔ SFU Mapping, 상태 공유)
     │
     ▼
[ SFU Server (mediasoup) ]
     │
     └─ WebRTC Media (UDP)
```
---
## 🛠 Tech Stack

### Frontend

- WebRTC API

- WebSocket

- JavaScript

Backend

- Node.js

- WebSocket

- mediasoup (SFU)

State & Messaging

- Redis

 Room ↔ SFU 매핑

 SFU 상태 공유

---
## ☁️ Infrastructure
### AWS 구성

 EC2

- Signaling Server

- SFU Server

- STUN / TURN Server(coturn)

Application Load Balancer (ALB)

- 시그널링 서버 트래픽 분산

Redis

- 다수 시그널링 서버 간 상태 공유

### 서버 분산 전략

시그널링 서버

- ALB 기반 수평 확장

- Stateless 설계

SFU 서버

- 방 단위 고정 할당

- 신규 방부터 새 인스턴스로 분산

TURN 서버
- 최후의 수단으로만 사용 (비용 고려)

---
## 🔄 WebRTC Flow
### 1️⃣ 시그널링 단계

1. 클라이언트가 WebSocket으로 시그널링 서버 연결

2. 방 생성 / 참여

3. SDP Offer / Answer 교환

4. ICE Candidate 교환

### 2️⃣ 미디어 연결 단계

1. 시그널링 서버가 Redis에서 방에 할당된 SFU 조회

2. 클라이언트가 해당 SFU와 WebRTC 연결

3. 미디어 스트림은 브라우저 ↔ SFU 간 직접 전송
---
## 🔄 CI / CD (DevOps)
### CI (GitHub Actions)

- GitHub Push / PR 발생 시 자동 실행

- 코드 Lint

- 테스트 수행

- Docker 이미지 빌드

### CD

- EC2 기반 배포

- 시그널링 서버 Rolling 업데이트

- 기존 WebSocket 연결 유지

- SFU 서버는 신규 방부터 새 인스턴스 적용
---
## ⚠️ Failure Scenarios
### 상황과	                        영향

시그널링 서버 장애	  ->         기존 화상채팅 유지

Redis 장애	       ->         신규 방 생성 불가

SFU 서버 장애         ->      	해당 방 화상채팅 종료

WebRTC 미디어는 브라우저 ↔ SFU 간 직접 연결되므로
시그널링 서버 장애 시에도 기존 통화는 유지됩니다.
---
## 📈 Scaling Strategy

- 시그널링 서버: ALB 기반 수평 확장

- SFU 서버: 방 단위 분산 및 신규 방 우선 할당

- 대규모 환경에서는 시그널링 서버를 EKS로 이전 가능
---
## 🧪 What I Learned

- WebRTC 시그널링과 미디어 경로 분리 설계

- SFU 기반 화상채팅의 부하 분산 전략

- Redis를 활용한 분산 환경 상태 관리

- WebSocket 기반 실시간 서비스 운영

- CI/CD를 통한 무중단 배포 경험
---
## 📌 Future Improvements

- 사용자 인증 / 인가 (JWT)

- EKS 기반 시그널링 서버 운영

- SFU 자동 스케일링

- 모니터링 시스템 도입 (Prometheus / Grafana)
---
### 🙋‍♂️ Author

- Name: 신지은

- GitHub: (링크)
