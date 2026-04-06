package com.project.joom.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.joom.DTO.SignalMessage;
import com.project.joom.Repository.RoomRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
@Slf4j
public class RoomService {

    private final RoomRepository roomRepository;
    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    // 방입장 처리
    public void join(String roomId, String userId, String sessionId){
        if(roomRepository.isUserInRoom(roomId, userId)){
            log.warn("중복 유저 감지: {}. 기존 정보를 업데이트하거나 먼저 지웁니다.", userId);
            forceLeave(roomId, userId);
        }
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
        if(roomId == null || userId == null) return;
        try{
            log.info("[LEAVE 시작] 방: {}, 유저: {}", roomId, userId);
            roomRepository.removeUser(roomId, userId);

            // 유저 리스트 안전하게 가져오기
            Map<Object, Object> users = roomRepository.getRoomUsers(roomId);
            List<String> currentUsers = (users!=null)?
                    users.keySet().stream().map(Object::toString).toList() : List.of();
            log.info("[LEAVE 완료] 현재 방({}) 남은 인원: {}명", roomId, currentUsers.size());

            SignalMessage msg = SignalMessage.builder()
                    .type("LEAVE")
                    .roomId(roomId)
                    .from(userId)
                    .payload(Map.of("message", userId + "님이 퇴장하셨습니다."))
                    .currentUsers(currentUsers)
                    .build();

            publishMsg(roomId, msg);
        }catch (Exception e){
            log.error("퇴장 처리 중 예외 발생: {}", e.getMessage());
        }
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

    /**
     * 세션 ID 없이 userId만으로 강제 퇴장 처리 (중복 방어용)
     */
    private void forceLeave(String roomId, String userId) {
        String key = "room:" + roomId + ":users";
        roomRepository.removeUser(roomId, userId);
    }


    public void handleStatus(SignalMessage msg) {
        String roomId = msg.getRoomId();
        String userId = msg.getFrom();

        SignalMessage.StatusPayload payload = objectMapper.convertValue(msg.getPayload(), SignalMessage.StatusPayload.class);

        // key : room:123:status, Field : userA_audio, Value : false
        String redisKey = "room:" + roomId + ":status";
        redisTemplate.opsForHash().put(redisKey, userId + "_" + payload.getType(), String.valueOf(payload.isEnabled()));
        
        // 다른 사용자에게 알림
        publishMsg(roomId, msg);
    }
}
