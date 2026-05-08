import Redis from "ioredis";
import express, { json, raw } from "express";
import { WebSocketServer } from "ws";
import {initMediasoup, createRouter, workerLoadGauge} from "./mediasoup.js";
import path from "path";
import { fileURLToPath } from "url";
import client from "prom-client";

// 현재 경로 찾기
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "../joom-client")));
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../joom-client", "index.html"));
});
const server = app.listen(3000, () => 
    console.log("SFU server listening on 3000")
);

const wss = new WebSocketServer({server});
const rooms = new Map();
// 모든 지표를 담을 레지스터 생성
const register = new client.Registry();
client.collectDefaultMetrics({ register }); // Node.js 기본 지표 수집 (Heap Memory, CPU, Event Loop Lag 등)
// custom 지표 정의 (SFU에 특화된 지표 예시)
const activeRoomsGauge = new client.Gauge({
    name: "joom_sfu_active_rooms",// 지표 이름 (그라파나에서 검색할 이름)
    help: "현재 활성화된 방의 수"
});
const activePeersGauge = new client.Gauge({
    name: "joom_sfu_active_peers",// 지표 이름 (그라파나에서 검색할 이름)
    help: "현재 활성화된 피어의 수"
});
const activeProducersGauge = new client.Gauge({
    name: "joom_sfu_active_producers",// 지표 이름 (그라파나에서 검색할 이름)
    help: "현재 활성화된 Producer의 수"
});
const activeConsumersGauge = new client.Gauge({
    name: "joom_sfu_active_consumers",// 지표 이름 (그라파나에서 검색할 이름)
    help: "현재 활성화된 Consumer의 수"
});
register.registerMetric(activeRoomsGauge);
register.registerMetric(activePeersGauge);
register.registerMetric(activeProducersGauge);
register.registerMetric(activeConsumersGauge);
register.registerMetric(workerLoadGauge);

// 10초 마다 현재 메모리에 있는 rooms, peers 수를 지표로 업데이트
setInterval(() => {
    activeRoomsGauge.set(rooms.size);
    let peerCnt = 0;
    let prodCnt = 0;
    let consCnt = 0;
    rooms.forEach(room => {
        peerCnt     += room.peers.size;
        room.peers.forEach(peer => {
            prodCnt += peer.producers.size;
            consCnt += peer.consumers.size;
        });
    });
    activePeersGauge.set(peerCnt);
    activeProducersGauge.set(prodCnt);
    activeConsumersGauge.set(consCnt);
}, 10000);

// Prometheus가 /metrics 엔드포인트로 수집하러 올 때 레지스터에 있는 모든 지표를 반환
app.get('/metrics', async (req, res) => {
    res.setHeader('Content-Type', register.contentType);
    res.send(await register.metrics());
});


// ioredis는 자동연결
const pub = new Redis(); // 발송
const sub = new Redis(); // 구독

// 삭제 대기
const pendingSfuRemovals = new Map();

console.log("Redis connected");

await initMediasoup();

sub.subscribe("room");
sub.on("message", (channel, message) => {
    const data = JSON.parse(message);
    const room = rooms.get(data.roomId);
    
    // 로그로 흐름 파악
    console.log(`[Redis Msg] type: ${data.type}, roomId: ${data.roomId}`);
    
    
    if (!room) return;

    room.peers.forEach((peer, peerId) => {
        if (!peer.ws || peer.ws.readyState !== 1) return;

        switch (data.type) {
            case "producerClosed":
                // 1. 해당 Producer를 구독 중인 Consumer 정리
                peer.consumers.forEach((consumer, consumerId) => {
                    if (consumer.producerId === data.producerId) {
                        consumer.close();
                        peer.consumers.delete(consumerId);
                    }
                });
                // 2. 클라이언트 브라우저에 알림 (나 자신 제외)
                if (peerId !== data.sender) {
                    peer.ws.send(JSON.stringify(data));
                }
                break;

            case "userLeft":
                if (peerId !== data.peerId) {
                    peer.ws.send(JSON.stringify({
                        type: "userLeft",
                        peerId: data.peerId
                    }));
                }
                break;

            case "whisper":
                if (peerId === data.target) {
                    peer.ws.send(JSON.stringify(data));
                }
                break;

            case "newProducer":
                if (peerId !== data.peerId) {
                    console.log(`[전달] ${data.producerId}를 유저 ${peerId}에게 알림`);
                    peer.ws.send(JSON.stringify(data));
                }else {
                    console.log(`[차단] 본인(${peerId})에게는 newProducer를 보내지 않습니다.`);
                }
                break;
        }
    });
});

// 서버 실행 시 환경변수 SFU_URL이 없으면 로컬 주소 사용(개발용)
const MY_SFU_URL  = process.env.SFU_URL || "ws://localhost:3000";

async function createRoom(roomId) {
    if(rooms.has(roomId)) {
        // 이미 방이 있다면 TTL만 갱신
        await pub.expire(`room:mapping:${roomId}`, 3600); // 방이 이미 존재하면 Redis 매핑 정보의 TTL을 갱신
        return rooms.get(roomId);
    }

    const router = await createRouter();
    const room = {
        router: router,
        peers: new Map()
    };
    // Redis에 "이 방은 나의 URL에 연결되어 있음"을 저장
    await pub.set(`room:mapping:${roomId}`, MY_SFU_URL, "EX", 3600); 
    rooms.set(roomId, room);
    return room;
}

function getProducer(room, producerId){
    let producer;

    room.peers.forEach(peer => {
        if(peer.producers.has(producerId)){
            producer = peer.producers.get(producerId);
        }
    });
    return producer;
}

function getAllProducers(room, excludeId){
    const producerIds = [];

    room.peers.forEach((peer, peerId) => {
        if(peerId !== excludeId){
            peer.producers.forEach((producer, id) => {
                producerIds.push(id);
            });
       } 
    });
    return producerIds;
}

async function handleMsg(ws, msg) {
    try{
        const data = JSON.parse(msg);
        const type = data.type;
        console.log("ws msg : ",type);
        
        switch(type){
            case "joinRoom": {
                console.log("joinRoom : ",data);
                const room = await createRoom(data.roomId);
                room.peers.set(ws.id, {
                    id: ws.id,
                    ws: ws,
                    transports: new Map(),
                    producers: new Map(),
                    consumers: new Map(),
                    rtpCapabilities: data.rtpCapabilities // 클라이언트의 caps
                });

                ws.send(JSON.stringify({
                    type: "routerRtpCapabilities",
                    data: room.router.rtpCapabilities
                }));
                console.log(`[SFU] 유저 ${ws.id}가 방 ${data.roomId}에 참여 완료`);
                const producers = [];

                room.peers.forEach(p => {
                    if(p.id !== ws.id){
                        p.producers.forEach(prod => {
                            producers.push({
                                producerId: prod.id,
                                peerId: p.id
                            });
                        });
                    }
                });

                ws.send(JSON.stringify({
                    type: "existingProducers",
                    producers
                }));

                break;
            }

            // 브라우저랑 연결될 webRTC 통로 생성
            case "createTransport": {
                const room = rooms.get(ws.roomId);
                if(!room){
                    console.log("room not found");
                    return;
                }
                const peer = room.peers.get(ws.id);

                // peerconnection 역할
                const transport = await room.router.createWebRtcTransport({
                    listenIps: [{ ip: "127.0.0.1", announcedIp: null}],
                    // listenIps: [{ ip: "0.0.0.0", announcedIp: null}],
                    enableUdp: true,
                    enableTcp: true,
                    preferUdp: true
                });

                peer.transports.set(transport.id, transport);

                ws.send(JSON.stringify({
                    type: "transportCreated",
                    data: {
                        id: transport.id,
                        iceParameters: transport.iceParameters,
                        iceCandidates: transport.iceCandidates,
                        dtlsParameters: transport.dtlsParameters
                    }
                }));
                break;
            }

            // DTLS 핸드쉐이크 완료 - 보안 연결 성립   
            case "connectTransport": {
                const room = rooms.get(ws.roomId);
                const peer = room.peers.get(ws.id);

                const transport = peer.transports.get(data.transportId);
                await transport.connect({ dtlsParameters: data.dtlsParameters });
                ws.send(JSON.stringify({ type: "transportConnected" }));
                break;
            }

            // 내가 보내는 트랙
            case "produce": {
                console.log("produce recieved: ",data.kind);
                const room = rooms.get(ws.roomId);
                const peer = room.peers.get(ws.id);
                
                const transport = peer.transports.get(data.transportId);

                const producer = await transport.produce({
                    kind: data.kind,
                    rtpParameters: data.rtpParameters,
                    appData: data.appData
                });

                peer.producers.set(producer.id, producer);

                ws.send(JSON.stringify({
                    type: "produced",
                    producerId: producer.id
                }));

                // 모든 클라이언트에게 새 producer 알림(성능개선)
                //const producerIds = getAllProducers(room, ws.id);
                await pub.publish("room", JSON.stringify({
                    type: "newProducer",
                    roomId: ws.roomId,
                    producerId: producer.id,
                    peerId: ws.id
                }));
                console.log("new producer: ",producer.id);
                break;
            }

            // 다른 사람 영상 받기
            case "consume": {
                console.log("consume request",data.producerId);
                const room   = rooms.get(ws.roomId);
                const peer   = room.peers.get(ws.id);
                const transport = peer.transports.get(data.transportId);
                const producer  = getProducer(room, data.producerId);

                if(!producer) return;
                
                if(!room.router.canConsume({
                    producerId: producer.id,
                    rtpCapabilities: data.rtpCapabilities,
                })) return;

                const consumer = await transport.consume({
                    producerId: producer.id,
                    rtpCapabilities: data.rtpCapabilities,
                    paused: true // 레이어 설정을 위해 잠시 멈춤 상태로 생성
                });

                // simulcast 대응 초기화질 레이어 설정 (spatialLayer:2(r2 고화질))
                if(consumer.type === 'simulcast'){
                    await consumer.setPreferredLayers({ spatialLayer:2, temporalLayer:2});
                }

                // 설정 완료 후 다시 시작
                await consumer.resume();

                peer.consumers.set(consumer.id, consumer);

                const producerOwner = [...room.peers.entries()]
                                      .find(([id, p]) => p.producers.has(data.producerId))?.[0];

                ws.send(JSON.stringify({
                    type: "consume",
                    data: {
                        id: consumer.id,
                        producerId: producer.id,
                        kind: consumer.kind,
                        rtpParameters: consumer.rtpParameters,
                        peerId: producerOwner,
                        appData: producer.appData // 👈 이 줄이 빠져있어서 클라이언트에서 isScreen이 false가 된 것입니다!
                    }
                }));
                break;
            }

            case "resumeConsumer": {
                const room = rooms.get(ws.roomId);
                const peer = room.peers.get(ws.id);
                const {consumerId} = data.data.consumerId; // 클라이언트가 보낸 아이디

                // 내가 가지고 있는 consumer 중 해당 아이디 찾기
                const consumer = peer.consumers.get(consumerId);

                if(consumer) {
                    console.log(`Resuming consumer : ${consumerId}`);
                    await consumer.resume();
                }
                break;
            }

            case "getProducers": {
                const room = rooms.get(ws.roomId);
                const producerIds = getAllProducers(room, ws.id);
                console.log(producerIds);
                ws.send(JSON.stringify({
                    type: "currentProducers",
                    data: producerIds
                }));
                break;
            }

            // 화면 공유 끊음
            case "producerClosed": {
                const room = rooms.get(ws.roomId);
                if(!room) return;

                const peer = room.peers.get(ws.id);
                if(!peer) return;

                const producer = peer.producers.get(data.producerId);
                if(!producer) return;

                console.log("producer closed: ",data.producerId);

                // producer 종료
                producer.close();
                peer.producers.delete(data.producerId);

                // 다른 클라이언트에게 알림
                await pub.publish("room", JSON.stringify({
                    type: "producerClosed",
                    roomId: ws.roomId,
                    producerId: data.producerId,
                    sender: ws.id
                }));
                break;
            }

            // ice restart
            case "restartIce": {
                const room = rooms.get(ws.roomId);
                if(!room) return;

                // 해당 유저의 transport 찾아서 새로운 iceParameters 생성 후 클라이언트에 전달
                let targetTransport;
                for(const peer of room.peers.values()){
                    targetTransport = peer.transports.get(data.transportId);
                    if(targetTransport) break;
                }   

                if(!targetTransport) return;
                const iceParameters = await targetTransport.restartIce();
                // 클라이언트에 새로운 iceParameters 전달
                ws.send(JSON.stringify({
                    type: "iceRestarted",
                    data: {
                        transportId: data.transportId,
                        iceParameters: iceParameters
                    }
                }));
                break;
            }

        }
    }catch(err){
        console.error("메시지 처리 중 에러 발생:", err);
    }
}

wss.on("connection", async (ws, req) => {
    const urlObj = new URL(req.url, `http://${req.headers.host}`);
    const userId = urlObj.searchParams.get("userId");
    const roomId = urlObj.searchParams.get("roomId");
    if (!userId || !roomId) {
        ws.close(4000, "Missing credentials");
        return;
    }

    let isAuthor = false;
    const msgQue = [];

    console.log("client connected");
    ws.on("message", async (msg) => {
        if(!isAuthor){
            msgQue.push(msg);
            return;
        }
        handleMsg(ws, msg);
    });

    (async() => {
        try {
            const ticketKey = `ticket:${userId}`;
            let storedRoomId = await pub.get(ticketKey);
            if(storedRoomId) storedRoomId = storedRoomId.replace(/^"|"$/g, '');

            if(!storedRoomId || storedRoomId !== roomId){
                console.log("[인증실패]", userId);
                ws.close(4001, "Unauthorized");
                return;
            }

            ws.id = userId;
            ws.roomId = roomId;
            if(pendingSfuRemovals.has(userId)){
                console.log(`[SFU] 유저 ${userId} 돌아옴. 예약 취소 및 세션 유지.`);
                //  예약 작업 취소
                clearTimeout(pendingSfuRemovals.get(userId));
                pendingSfuRemovals.delete(userId);
            }
            isAuthor = true;
            console.log("[인증성공]", userId);

            while(msgQue.length > 0){
                handleMsg(ws, msgQue.shift());
            }
        } catch (error) {
            ws.close();
        }
    })();
    

    ws.on("close", async () => {
        if(!ws.id || !ws.roomId) return;
        console.log(`[SFU] 유저 ${ws.id} 연결 끊김. 10초 대기 ...`);

        // 30초 대기 후 지우기 예약
        const timeoutId = setTimeout(async () => {
            const room = rooms.get(ws.roomId);
            if(!room) return;
    
            const peer = room.peers.get(ws.id);
            if(!peer) return;
    
            peer.consumers.forEach(c => c.close());
            peer.producers.forEach(p => p.close());
            peer.transports.forEach(t => t.close());
    
            room.peers.delete(ws.id);
            pendingSfuRemovals.delete(ws.id);

            console.log(`[SFU] 유저 ${ws.id} 자원 정리 완료.`);

            if(room.peers.size === 0){
                console.log(`[SFU] 방 ${ws.roomId}에 유저가 없어 라우터를 종료합니다.`);
                room.router.close();
                rooms.delete(ws.roomId);
                console.log(`[SFU] 빈 방 삭제: ${ws.roomId}`);
            }
        }, 10000);

        pendingSfuRemovals.set(ws.id, timeoutId);

        // 다른 사람에게 알림
        await pub.publish("room", JSON.stringify({
            type: "userLeft",
            roomId: ws.roomId,
            peerId: ws.id
        }));

        console.log("peer cleaned : ", ws.id);
    });

});

// 새로운 연결 차단 및 기존 자원 정리를 위한 종료 핸들러
const cleanUpBeforeExit = async () => {
    console.log("서버 종료 중... 모든 라우터와 연결된 리소스 정리");
    for(const [roomId, room] of rooms) {
        room.router.close();
    }
    await pub.quit();
    await sub.quit();
    process.exit(0);
};

// OS가 보내는 종료 신호(SIGTERM, SIGINT)를 가로채서 위 함수 실행
process.on('SIGTERM', cleanUpBeforeExit); // 배포 도구(PM2, Docker)가 종료를 요청할 때
process.on('SIGINT', cleanUpBeforeExit);  // 터미널에서 Ctrl+C를 눌렀을 때