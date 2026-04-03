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
}
