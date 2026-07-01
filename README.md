🎥 WebRTC 기반 실시간 화상채팅 서비스

Spring Boot + WebRTC + mediasoup(SFU) 기반의 실시간 화상채팅 서비스입니다.

단순히 화상채팅 기능을 구현하는 것을 넘어, 다수의 사용자가 동시에 접속하는 환경에서도 안정적으로 서비스를 운영할 수 있는 아키텍처를 목표로 개발했습니다.

Spring Boot : 시그널링 및 비즈니스 로직
mediasoup(SFU) : 미디어 스트림 처리
Redis : 분산 상태 관리 및 Room ↔ SFU 매핑
Nginx : Reverse Proxy 및 Blue-Green 배포
GitHub Actions : CI/CD 자동화
🚀 Demo
https://joom-signaling.duckdns.org/
📌 프로젝트 목표
WebRTC 기반 실시간 통신 구조 이해
SFU 아키텍처를 활용한 저지연 미디어 전송
Stateful / Stateless 서버 분리
Redis 기반 분산 상태 관리
서비스 연속성(Resilience) 확보
운영 환경을 고려한 CI/CD 구축
✨ 주요 기능
사용자 기능
1:1 화상채팅
그룹 화상채팅
실시간 채팅
귓속말
화면 공유
마이크 / 카메라 ON/OFF
운영 기능
Session Resume
ICE Restart
Heartbeat 기반 상태 관리
Worker 기반 부하 분산
Blue-Green 배포
🏗 시스템 아키텍처
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
 Spring Boot                 Spring Boot
 Signaling                  Signaling
      │
      │ Redis
      │
Room ↔ SFU Mapping
      │
 ┌────┴─────────┐
 │              │
SFU-1        SFU-2
mediasoup    mediasoup
 │              │
Multi Worker  Multi Worker
🛠 Tech Stack
Backend
Java 17
Spring Boot
Spring WebSocket
Realtime
WebRTC
mediasoup
Node.js
Infra
Redis
Docker
Nginx
GitHub Actions
AWS EC2
coturn
⚙ 핵심 설계
Signaling Server

Spring Boot 기반으로 구현했습니다.

역할

사용자 인증
방 생성
채팅
사용자 상태 관리
SFU 선택

특징

Stateless
수평 확장 가능
Redis 기반 상태 공유
SFU Server

mediasoup 기반으로 구현했습니다.

역할

SDP Offer / Answer
ICE 교환
RTP Packet 중계
Producer / Consumer 관리

특징

Stateful
Room 단위 고정
미디어 처리 전담
Redis

Redis는 캐시가 아닌 분산 상태 저장소로 사용했습니다.

저장 데이터

User State
Room ↔ SFU Mapping
Server Metadata

실제 WebRTC 객체는 Redis에 저장하지 않고 메모리에서 관리했습니다.

STUN / TURN

WebRTC 연결 시 ICE 과정을 통해 NAT 환경을 탐색합니다.

STUN : Public IP 확인 및 P2P 연결 지원
TURN : 직접 연결이 실패한 경우 미디어 중계

TURN 사용을 최소화하여 비용과 지연을 줄였습니다.

Nginx

무료 환경에서는 AWS ALB 대신 Nginx를 사용했습니다.

Reverse Proxy
HTTPS
WebSocket Upgrade
Blue-Green 배포

Reload만으로 기존 WebSocket 연결을 유지하면서 신규 요청만 새로운 서버로 전달하도록 구성했습니다.

🔄 WebRTC 연결 흐름
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
🚀 확장 전략
Signaling
Stateless
Redis 상태 공유
수평 확장
SFU
Stateful
Room 단위 고정

새로운 방만 새로운 SFU에 할당하여 기존 연결이 끊어지지 않도록 설계했습니다.

⚙ SFU 최적화
Multi Worker

CPU Core 수만큼 Worker 생성

Least Connections

Router 수가 가장 적은 Worker 선택

Monitoring

Prometheus Gauge를 이용하여 Worker별 Router 수를 모니터링했습니다.

🔒 서비스 연속성 (Resilience)
Session Resume

일시적인 네트워크 장애 발생 시 기존 세션 복구

Heartbeat + Redis TTL

비정상 종료 사용자 자동 제거

ICE Restart

Transport 장애 발생 시 새로고침 없이 연결 복구

🚀 CI / CD

GitHub Actions 기반 자동 배포

CI
Build
Test
Docker Build
Docker Hub Push
CD
Signaling

Blue-Green 배포

SFU

Canary 방식

기존 연결은 유지하고 새로운 방부터 신규 서버에 배정했습니다.

🛠 주요 트러블슈팅
Race Condition

Producer 이벤트가 먼저 도착하여 consume() 실패

→ Transport 준비 후 재시도하도록 개선

사용자 상태 동기화

신규 사용자가 기존 참여자의 상태를 알 수 없던 문제

→ 입장 시 상태 Snapshot 전달

Resource Cleanup

Producer와 Media 객체가 메모리에 남던 문제

→ 연결 종료 시 모든 리소스 정리

📚 What I Learned
WebRTC 및 SFU 아키텍처 이해
Stateful / Stateless 설계
Redis 기반 분산 상태 관리
Worker 기반 부하 분산
서비스 연속성(Resilience) 설계
CI/CD 및 무중단 배포 경험
실시간 서비스 트러블슈팅 경험
🚀 Future Improvements
JWT 기반 인증/인가
Kubernetes(EKS) 기반 Signaling Auto Scaling
SFU Auto Scaling
Prometheus + Grafana 대시보드
Kafka 기반 이벤트 처리
