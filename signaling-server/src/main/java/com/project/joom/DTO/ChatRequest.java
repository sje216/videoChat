package com.project.joom.DTO;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ChatRequest {
    private String roomId;
    private String userId;
    private String message;
    private String type; // CHAT NOTICE
    private String target;
}
