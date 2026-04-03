package com.project.joom.Redis;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.joom.DTO.SignalMessage;
import com.project.joom.Repository.RoomRepository;
import com.project.joom.Repository.WebSocketSessionStore;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;

import java.util.Map;

@Configuration
@RequiredArgsConstructor
public class RedisSubscriber {

    private final ObjectMapper objectMapper;
    private final WebSocketSessionStore sessionStore;
    private final RoomRepository roomRepository;

    public void onMessage(String message, String channel){
        try {
            SignalMessage signalMessage = objectMapper.readValue(message, SignalMessage.class);
            // whisper
            if(signalMessage.getTarget() != null){
                // targetSessionId
                String targetSessionId = roomRepository.getSessionId(signalMessage.getRoomId(), signalMessage.getTarget());
                // 내 서버에 해당 session 있는지 확인 후 send
                WebSocketSession session = sessionStore.get(targetSessionId);
                if(session != null && session.isOpen()){
                    session.sendMessage(new TextMessage(message));
                }
            }else{
                // message
                Map<Object, Object> roomUsers =  roomRepository.getRoomUsers(signalMessage.getRoomId());
                roomUsers.values().forEach(sessionId -> {
                    WebSocketSession session = sessionStore.get((String) sessionId);
                    if(session != null && session.isOpen()){
                        try{
                            session.sendMessage(new TextMessage(message));
                        }catch (Exception e){
                            e.printStackTrace();
                        }
                    }
                });
            }

        }catch (Exception e){
            e.printStackTrace();
        }
    }
}
