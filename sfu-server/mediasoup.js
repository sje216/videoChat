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
                clockRate: 90000
            }
        ]
    });

    console.log("mediasoup router ready");

}

export function getRouter(){
    return router;
}