package com.project.joom.Controller;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.joom.DTO.SignalMessage;
import com.project.joom.Repository.WebSocketSessionStore;
import com.project.joom.Service.RoomService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;

@Component
@RequiredArgsConstructor
@Slf4j
public class SignalingHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final RoomService roomService;
    private final WebSocketSessionStore sessionStore;

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        // 연결 즉시 메모리 스토어에 세션 저장
        sessionStore.add(session);
    }

    @Override
    public void handleTextMessage(WebSocketSession session, TextMessage message) throws Exception {
        String payload      = message.getPayload();
        SignalMessage msg   =  objectMapper.readValue(payload, SignalMessage.class);

        String sessionId    = session.getId();
        switch (msg.getType()) {
            case "JOIN":
                roomService.join(msg.getRoomId(), msg.getFrom(), sessionId);
                break;

            case "CHAT":
            case "WHISPER":
                roomService.relay(msg);
                break;

            case "LEAVE":
                session.getAttributes().put("ALREADY_LEFT", true);
                roomService.leave(msg.getRoomId(), msg.getFrom(), sessionId);
                break;
        }
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) throws Exception {
        // 연결 끊기면 스토어에서 제거
        String userId    = (String) session.getAttributes().get("userId");
        String roomId    = (String) session.getAttributes().get("roomId");
        String sessionId = session.getId();

        log.info("WebSocket disconnected: userId={}, sessionId={}", userId, session.getId());


        // 💡 2. 이미 LEAVE 메시지를 통해 나갔는지 확인합니다.
        Boolean alreadyLeft = (Boolean) session.getAttributes().getOrDefault("ALREADY_LEFT", false);
        if (alreadyLeft) {
            log.info("이미 LEAVE 메시지로 처리된 세션입니다. sessionId={}", sessionId);
            sessionStore.remove(sessionId);
            return; // 중복 실행 방지: 여기서 종료
        }
        System.out.println("연결 끊김 감지 : "+ sessionId);
        sessionStore.remove(session.getId());

        if(userId != null && roomId != null) {
            roomService.leave(roomId, userId, sessionId);
            System.out.println("연결 끊김 감지 : "+ sessionId);
        }
    }

}
