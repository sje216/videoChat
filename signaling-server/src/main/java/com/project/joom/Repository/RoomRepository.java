package com.project.joom.Repository;

import java.util.Map;

public interface RoomRepository {
    void addUser(String roomId, String userId, String sessionId);
    void removeUser(String roomId, String userId);
    Map<Object, Object> getRoomUsers(String roomId);
    String getSessionId(String roomId, String userId);
}
