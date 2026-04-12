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

import java.util.Map;
import java.util.concurrent.*;

@Component
@RequiredArgsConstructor
@Slf4j
public class SignalingHandler extends TextWebSocketHandler {
    private final ObjectMapper objectMapper;
    private final RoomService roomService;
    private final WebSocketSessionStore sessionStore;
    // 삭제할 예약 작업을 관리 ScheduledFuture <- 작업 예약증
    private final Map<String, ScheduledFuture<?>> removeTasks = new ConcurrentHashMap<>();
    private final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);


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
                // 만약 이 사용자가 삭제 대기중이었다면 취소 (재연결 성공)
                if(removeTasks.containsKey(msg.getFrom())) {
                    // cancel(false): "아직 실행 전이라면 실행하지 마.
                    removeTasks.get(msg.getFrom()).cancel(false);
                    removeTasks.remove(msg.getFrom());
                    log.info("사용자 {} 재연결됨. 삭제 예약 취소.", msg.getFrom());
                }
                roomService.join(msg.getRoomId(), msg.getFrom(), sessionId);
                break;

            case "STATUS":
                roomService.handleStatus(msg);
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

        Boolean alreadyLeft = (Boolean) session.getAttributes().getOrDefault("ALREADY_LEFT", false);

        log.info("WebSocket disconnected: userId={}, sessionId={}", userId, session.getId());

        // 사용자가 직접 나가기를 누른 경우는 즉시 정리
        if (alreadyLeft) {
            roomService.leave(roomId, userId, sessionId);
            sessionStore.remove(sessionId);
            return; // 중복 실행 방지: 여기서 종료
        }
        
        // 순단 시 10초 대기후 삭제
        if(userId != null && roomId != null) {
            log.info("사용자 {} 연결 끊김 감지. 10초간 복구 대기 ... ", userId);
            ScheduledFuture<?> task = scheduler.schedule(()-> {
                log.info("사용자 {} 유예 시간 만료. 세션 정리 시작.", userId);
                roomService.leave(roomId, userId, sessionId);
                removeTasks.remove(userId);
            }, 10, TimeUnit.SECONDS);
            removeTasks.put(userId, task);
        }
        System.out.println("연결 끊김 감지 : "+ sessionId);
        sessionStore.remove(session.getId());
    }

}
