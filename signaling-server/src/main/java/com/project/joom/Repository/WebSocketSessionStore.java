package com.project.joom.Repository;

import com.project.joom.Controller.SignalingHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// JVM에 실제 연결 객체를 담아두는 바구니
@Component
public class WebSocketSessionStore {
//    sessionId -> websocket session mapping
    private final Map<String, WebSocketSession> sessions = new ConcurrentHashMap<>();

    public void add(WebSocketSession session) {
        sessions.put(session.getId(), session);
    }

    public void remove(String sessionId) {
        sessions.remove(sessionId);
    }

    public WebSocketSession get(String sessionId) {
        return sessions.get(sessionId);
    }
}

