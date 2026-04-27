import mediasoup from "mediasoup";
import os from "os";
import client from "prom-client";

const workers           = [];
const workerLoadGauge   = new client.Gauge({
    name: "joom_sfu_worker_load",
    help: "워커별 활성 라우터 수",
    labelNames: ["worker_pid"] // PID별로 구분해 그래프 그리기 위함
});

//  값 업데이트 로직 : 주기적으로 워커별 활성 라우터 수를 Gauge에 반영
function updateMetrics() {
    workers.forEach((workerEntry, index) => {
        workerLoadGauge.set(
            { worker_pid : `worker-${index}` },
            workerEntry.activeRouterCount
        );
    }); 
}

setInterval(updateMetrics, 5000); // 5초마다 업데이트

// mediasoup 워커를 초기화하는 함수
//  CPU 코어 수에 따라 워커를 생성
export async function initMediasoup(){
    const numWorkers = os.cpus().length; // CPU 코어 수 확인
    console.log(`[SFU] ${numWorkers}개의 워커를 생성합니다.`);

    for (let i = 0; i < numWorkers; i++) {
        const worker = await mediasoup.createWorker({
            rtcMinPort : 40000,
            rtcMaxPort : 49999,
            logLevel: "warn",
        });

        worker.on("died", () => {
            console.error("mediasoup died");
            process.exit(1);
        });

        // 워커 객체와 함께 현재 할당된 라우터 수 관리할 커스텀 속성 추가
        workers.push({
            mediasoupWorker: worker,
            activeRouterCount: 0
        });
    }
    
}

/**
 * 최소 연결(Least Connections) 방식으로 워커를 순환해 라우터를 생성
 */
export async function createRouter(){
    // activeRouterCount가 가장 적은 워커를 선택
    const sortedWorkers = [...workers].sort((a, b) => a.activeRouterCount - b.activeRouterCount);
    // 가장 적은 라우터를 가진 워커 선택
    const bestWorker = sortedWorkers[0];
    if(!bestWorker) {
        throw new Error("No available mediasoup workers");
    }
    console.log(`[SFU] 최적 워커 선택 (PID: ${bestWorker.mediasoupWorker.pid}, 현재 라우터 수: ${bestWorker.activeRouterCount})`);
    const router = await bestWorker.mediasoupWorker.createRouter({
        mediaCodecs: [
            {
                kind: "audio",
                mimeType: "audio/opus",
                clockRate: 48000,
                channels: 2
            },
            {
                kind: "video",
                mimeType: "video/VP8",
                clockRate: 90000,
                // 아래 파라미터들이 추가되어야 Simulcast가 안정적으로 동작합니다.
                parameters: {
                    "x-google-start-bitrate": 1000
                }
            },
            {
                kind: "video",
                mimeType: "video/H264",
                clockRate: 90000,
                // 아래 파라미터들이 추가되어야 Simulcast가 안정적으로 동작합니다.
                parameters: {
                    "packetization-mode": 1,
                    "profile-level-id": "42e01f",
                    "level-asymmetry-allowed": 1,
                    "x-google-start-bitrate": 1000
                }
            }
        ]
    });
    // 생성된 라우터를 할당된 워커의 activeRouterCount에 반영
    bestWorker.activeRouterCount++;
    // Prometheus Gauge 업데이트
    workerLoadGauge.set({ worker_pid: bestWorker.mediasoupWorker.pid }, bestWorker.activeRouterCount);

    // 라우터가 닫힐때 카운트 감소
    router.on("close", () => {
        bestWorker.activeRouterCount = Math.max(0, bestWorker.activeRouterCount - 1); // 음수 방지
        // Prometheus Gauge 업데이트
        workerLoadGauge.set({ worker_pid: bestWorker.mediasoupWorker.pid }, bestWorker.activeRouterCount);
        console.log(`[SFU] 라우터 종료 (PID: ${bestWorker.mediasoupWorker.pid}, 현재 라우터 수: ${bestWorker.activeRouterCount})`);
    }); 

    return router;
}

// prometheus에서 워커별 라우터 수를 모니터링할 수 있도록 Gauge 객체를 export
export { workerLoadGauge };
