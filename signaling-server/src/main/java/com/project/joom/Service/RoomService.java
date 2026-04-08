package com.project.joom.Service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.joom.DTO.SignalMessage;
import com.project.joom.Repository.RoomRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;

import java.util.HashMap;
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

        // redis에서 이 방의 모든 유저 상태(마이크/카메라) 가져오기
        // Key: room:123:status -> { "userA": {audio:false, video:true},"userB": {...} }
        String statusKey = "room:" + roomId + ":status";
        Map<Object, Object> allStatuses =  redisTemplate.opsForHash().entries(statusKey);

        SignalMessage msg =  SignalMessage.builder()
                .type("JOIN")
                .roomId(roomId)
                .from(userId)
                .payload(Map.of("message", userId + "님이 입장하셨습니다."))
                .userStatuses(allStatuses)
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
        String redisKey = "room:" + roomId + ":status";

        // client 가 보낸 payload 추출 (audio:true etc)
        SignalMessage.StatusPayload payload = objectMapper.convertValue(msg.getPayload(), SignalMessage.StatusPayload.class);

        // redis에 이 유저의 기존 전체 상태 가져오기

        try {
            Object existingStatus = redisTemplate.opsForHash().get(redisKey, userId);
            Map<String, Object> statusMap = new HashMap<>();

            if (existingStatus != null) {
                // 기존 데이터가 있다면 JSON 문자열을 Map으로 변환
                statusMap = objectMapper.readValue(existingStatus.toString(), Map.class);
            } else {
                // 처음 저장하는 유저라면 기본값 설정
                statusMap.put("audio", true);
                statusMap.put("video", true);
            }

            // 현재 들어온 상태값 업데이트 (audio 혹은 video)
            statusMap.put(payload.getType(), payload.isEnabled());
            // 다시 JSON 문자열로 바꿔서 Redis에 저장
            // Key: room:123:status -> { "userA": {audio:false, video:true},
            redisTemplate.opsForHash().put(redisKey, userId, objectMapper.writeValueAsString(statusMap));

        } catch (Exception e) {
            throw new RuntimeException(e);
        }

        // 다른 사용자에게 알림
        publishMsg(roomId, msg);
    }
}
