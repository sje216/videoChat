export default class ApiService{
    constructor(baseUrl = "http://localhost:8080") {
        this.baseUrl = baseUrl;
    }

    // 공통 요청 헬퍼 (중복 코드 방지)
    async _request(endpoint, method = "GET", body = null) {
        const options = {
            method,
            headers: {
                "Content-Type": "application/json",
            },
        };
        if(body) options.body = JSON.stringify(body);
        const res = await fetch(`${this.baseUrl}${endpoint}`, options);
        if(!res.ok) {
            const errorData = await res.json();
            throw new Error(errorData.message || "API 요청 실패");
        }
        // 응답 본문이 비어있는지 확인 (204 No Content 또는 Content-Length가 0인 경우 처리)
        const contentType = res.headers.get("Content-Type");
        if (res.status === 204 || !contentType || !contentType.includes("application/json")) {
        return null; 
        }
        return res.json();
    }

    // 방 입장 권한 확인 및 SFU 티켓 발급
    async getRoomAccess(roomId, userId) {
        return this._request(`/api/rooms/${roomId}/access`, "POST", { userId });
    }

    // 채팅 메시지 전송
    async sendChat(roomId, userId, message) {
        return this._request(`/api/chat/send`, "POST", { 
            type: "CHAT",
            roomId: roomId,
            userId: userId,
            message: message
         });
    }   

    // 귓속말 메시지 전송
    async sendWhisper(roomId, currentUserId, selectedUser, message) {
        return this._request(`/api/chat/send`, "POST", { 
            type: "WHISPER",
            roomId: roomId,
            userId: currentUserId,
            target: selectedUser,
            message: message
         });
    }

}