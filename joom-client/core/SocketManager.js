export default class SocketManager {
    constructor(name = "Socket") { // 어떤 소켓인지 구별하기 위해
        this.name       = name; 
        this.socket     = null; 
        this.callbacks  = new Map(); // message 타입별 콜백 저장소
        // 재연결 관련 상태
        this.reconnectAttempts = 0;
        this.maxReconnectDelay = 30000; // 최대 30초
        this.url               = null;
    }

    /**
     * 특정 메시지 타입에 대한 콜백 등록
     * @param {string} type - 메시지 타입 join chat etc
     * @param {function} callback - 실행할 함수
     */
    on(type, callback) {
        this.callbacks.set(type, callback);
    }

    /*
     * springSocket 연결
    */
    connect(url){
        this.url = url;
        // 중복 연결 방지
        if(this.socket){
            this.socket.onclose = null;
            this.socket.close();
        }

        return new Promise((resolve, reject) => {
            this.socket        = new WebSocket(url);

            this.socket.onopen = () => {
                console.log(`✅ [${this.name}](채팅/신호) 연결 성공!`);
                this.reconnectAttempts = 0; // 연결 성공 시 초기화
                resolve();
            };

            this.socket.onmessage = (e) => this._handleMessage(e);

            this.socket.onerror = (err) => {
                console.error(`❌ [${this.name}] 연결 에러: ${err}`);
                reject();
            };

            this.socket.onclose = (e) => {
            // 사용자가 직접 나간게 아니라면 재시도 지수백오프 형식
                if(e.code !== 1000 && this.name === "spring"){
                    this._attemptReconnect();
                }
                console.log(`ℹ️ [${this.name}] 연결 종료:" ${e.code}, ${e.reason}`);
            };
        });
    }

    /**
     * 재연결 로직 (지수 백오프)
     */
    _attemptReconnect() {
        const delay = Math.min(Math.pow(2, this.reconnectAttempts) * 1000, this.maxReconnectDelay);
        console.warn(`${delay / 1000}초후 시그널링 연결이 끊겼습니다. 재연결을 시도합니다.(시도 횟수: ${this.reconnectAttempts + 1})`);
        setTimeout(() => {
            this.reconnectAttempts++;
            if(this.url) this.initSpringSocket(this.url);
        }, delay);
    }

    /**
     * 
     * 메시지 통합 핸들러
     */
    _handleMessage(e) {
        try {
            if (e.data === "pong") {
                console.log("🏓 Heartbeat received: pong");
                return; 
            }
            const msg       = JSON.parse(e.data);
            const type      = msg.type || (msg.method);
            const callback  = this.callbacks.get(type);
            console.log("socket msgType : ",msg);
            console.log("socket callback : ",callback);
            if(callback) callback(msg);
        } catch (error) {
            console.error("❌ Message parsing error:", error);
        }
    }

    /**
     * socket 서버로 메시지 전송
     */
    send(type, payload) {
        if(this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({type, ...payload}));
        }else{
            console.error(`${this.name} socket is not open`);
        }
    }

}