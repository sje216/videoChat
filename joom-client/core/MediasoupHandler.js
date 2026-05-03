import * as mediasoupClient from "mediasoup-client";

export default class MediasoupHandler {
    constructor(sfuSocket, ui) {
        this.sfuSocket     = sfuSocket;
        this.ui            = ui; // UI 업데이트를 위한 참조
        this.device        = null;
        this.sendTransport = null;
        this.recvTransport = null;
        this.transportCount = 0;
    }

    // 장치 로드 및 첫번째 트랜스포트 생성 요청
    async loadDevice(routerRtpCapabilities) {
      this.device = new mediasoupClient.Device();
      await this.device.load({ routerRtpCapabilities });
      // 송신용 트랜스포트 생성 요청
      this.sfuSocket.send("createTransport");
    }

    // 실제 미디어를 송출하는 공용 메서드
    async produceTrack(track, type) {
      if(!this.sendTransport) throw new Error("송신용 트랜스포트가 준비되지 않았습니다.");
      const options = {
        track: track,
        appData: { type: type } // "video" 또는 "audio" 구분을 위한 appData
      };
      if(type === "video") {
        options.encodings = [
          { rid: 'r0', maxBitrate: 100000, scaleResolutionDownBy: 4 },
          { rid: 'r1', maxBitrate: 300000, scaleResolutionDownBy: 2 },
          { rid: 'r2', maxBitrate: 900000, scaleResolutionDownBy: 1 },
        ];
        options.codecOptions = {
          videoGoogleStartBitrate: 1000
        };
      }
      return await this.sendTransport.produce(options);
    }

    // 송신용 트랜스포트 설정 (produce 요청 처리)
    setupSendTransport(data, onProduceCallback) {
        this.sendTransport = this.device.createSendTransport(data);
        this.sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
          this.sfuSocket.send("connectTransport", {
            transportId: this.sendTransport.id,
            dtlsParameters
          });
          callback();
        });

        this.sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
          onProduceCallback(callback); // 서버 응답 'produced'를 기다림
          this.sfuSocket.send("produce", {
            type: "produce",
            transportId: this.sendTransport.id,
            kind,
            rtpParameters,
            appData
          });
        });

    }

    // 수신용 트랜스포트 설정 (connect 요청 처리)
    setupRecvTransport(data) {
        this.recvTransport = this.device.createRecvTransport(data);
        this.recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
          this.sfuSocket.send("connectTransport", {
            transportId: this.recvTransport.id,
            dtlsParameters
          });
          callback();
        });
        console.log("recvTransport ready");
        this.sfuSocket.send("getProducers");
    }
    
    /**
     * 미디어 스트림 수신 (Consume)
     */
    async consume(data) {
      if(!this.recvTransport) throw new Error("수신용 트랜스포트가 준비되지 않았습니다.");
      // recvTransport 를 통해 로컬 consumer 생성
      return await this.recvTransport.consume({
        id: data.id,
        producerId: data.producerId,
        kind: data.kind,
        rtpParameters: data.rtpParameters // 서버가 보내준 simulcast도 포함
      });
    }

    /**
     * 트랜스포트 연결 상태 모니터링 및 ice restart 로직
     * @param {mediasoupClient.Transport} transport
     * @param {string} type "send" 또는 "recv"
     * @param {string} roomId 방 ID (재연결 시 필요)
     */
    setupTransportMonitoring(transport, type, roomId) {
      transport.on("connectionstatechange", async (state) => {
        console.log(`${type} transport connection state:`, state);
        if(state === "failed") {
          console.warn(`${type} transport 연결 실패, 재시도 중...`);

          try {
            // SFU 서버에 신규 ice 파라미터 요청
            this.sfuSocket.send("restartIce", {
              transportId: transport.id,
              type: type, 
              roomId: roomId
            });
            console.log(`[${type}] 서버에 ICE Restart 요청 완료`);
          }
          catch (error) {
            console.error(`[${type}] ICE Restart 실패:`, error);
          }

        }
      });
    }


}