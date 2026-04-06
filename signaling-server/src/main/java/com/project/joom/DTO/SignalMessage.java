package com.project.joom.DTO;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

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

    @Data
    @AllArgsConstructor
    @NoArgsConstructor
    public static class StatusPayload {
        private String type; //audio or video
        private boolean enabled; // true(on) or false(off)
    }
}
