package com.project.joom.Repository;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.util.HashMap;
import java.util.Map;

@Repository
@RequiredArgsConstructor
public class RedisRoomRepository implements RoomRepository {

    private final RedisTemplate<String, Object> redisTemplate;
    // 방 키 구조: room:{roomId}:users -> {userId: sessionId}
    private String getRoomKey(String roomId){
        return "room:" +roomId + ":users";
    }

    @Override
    public void addUser(String roomId, String userId, String sessionId) {
        redisTemplate.opsForHash().put(getRoomKey(roomId), userId, sessionId);
    }

    @Override
    public void removeUser(String roomId, String userId) {
        redisTemplate.opsForHash().delete(getRoomKey(roomId), userId);
    }

    @Override
    public Map<Object, Object> getRoomUsers(String roomId) {
        return redisTemplate.opsForHash().entries(getRoomKey(roomId));
    }

    @Override
    public String getSessionId(String roomId, String userId) {
        return (String) redisTemplate.opsForHash().get(getRoomKey(roomId), userId);
    }

    @Override
    public boolean isUserInRoom(String roomId, String userId) {
        return redisTemplate.opsForHash().hasKey(getRoomKey(roomId), userId);
    }

}
