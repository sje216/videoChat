package com.project.joom.Repository;

import java.util.Map;

public interface RoomRepository {
    void addUser(String roomId, String userId, String sessionId);
    void removeUser(String roomId, String userId);
    Map<Object, Object> getRoomUsers(String roomId);
    String getSessionId(String roomId, String userId);
    /**
     * 특정 방에 유저가 이미 존재하는지 확인
     */
    boolean isUserInRoom(String roomId, String userId);
}
