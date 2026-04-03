package com.project.joom.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.joom.DTO.SignalMessage;
import com.project.joom.Repository.RoomRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class RoomService {

    private final RoomRepository roomRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    // 방입장 처리
    public void join(String roomId, String userId, String sessionId){
        roomRepository.addUser(roomId, userId, sessionId);

        List<String> currentUsers = roomRepository.getRoomUsers(roomId).keySet()
                .stream().map(Object::toString).toList();

        SignalMessage msg =  SignalMessage.builder()
                .type("JOIN")
                .roomId(roomId)
                .from(userId)
                .payload(Map.of("message", userId + "님이 입장하셨습니다."))
                .currentUsers(currentUsers)
                .build();

        publishMsg(roomId, msg);
    }

    public void relay(SignalMessage msg) {
        // 귓속말이나 특정 타겟이 있는 경우를 포함해 Redis 채널로 발행
        // redisSubscriber가 이를 수신해 실제 세션에 전달
        publishMsg(msg.getRoomId(), msg);
    }

    public void leave(String roomId, String userId, String sessionId){
        roomRepository.removeUser(roomId, sessionId);

        List<String> currentUsers = roomRepository.getRoomUsers(roomId).keySet()
                .stream().map(Object::toString).toList();

        SignalMessage msg = SignalMessage.builder()
                .type("LEAVE")
                .roomId(roomId)
                .from(userId)
                .payload(Map.of("message", userId + "님이 퇴장하셨습니다."))
                .currentUsers(currentUsers)
                .build();

        publishMsg(roomId, msg);
    }

    private void publishMsg(String roomId, SignalMessage msg) {
        try {
            String jsonMsg = objectMapper.writeValueAsString(msg);
            // channel: signal:room:{roomId}
            redisTemplate.convertAndSend("signal:room:" + roomId, jsonMsg);
        }catch (JsonProcessingException e){
            e.printStackTrace();
        }
    }


}
