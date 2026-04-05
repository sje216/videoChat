import mediasoup from "mediasoup";

let worker;
let router;

export async function initMediasoup(){

    worker = await mediasoup.createWorker({
        rtcMinPort : 40000,
        rtcMaxPort : 49999
    });

    worker.on("died", () => {
        console.error("mediasoup died");
        process.exit(1);
    });

    router = await worker.createRouter({
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

    console.log("mediasoup router ready");

}

export function getRouter(){
    return router;
}