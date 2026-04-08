package com.project.joom.DTO;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;
import java.util.Map;

@Data
@AllArgsConstructor
@NoArgsConstructor
@Builder
public class SignalMessage {
    private String type; // join,leave,chat, whisper
    private String roomId;
    private String from; // sender
    private String target; // reciever
    private List<String> currentUsers; // 유저리스트
    private Object payload; // real data(message)
    // 추가: 방에 있는 유저들의 상태 맵 (userId : StatusPayload 형태)
    private Map<Object, Object> userStatuses;

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    @Builder
    public static class StatusPayload {
        private String type; //audio or video
        private boolean enabled; // true(on) or false(off)
    }
}
