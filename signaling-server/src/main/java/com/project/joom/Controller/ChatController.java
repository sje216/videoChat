package com.project.joom.Controller;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.project.joom.DTO.ChatRequest;
import com.project.joom.DTO.SignalMessage;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/chat")
@RequiredArgsConstructor
public class ChatController {

    private final RedisTemplate<String, Object> redisTemplate;
    private final ObjectMapper objectMapper;

    @PostMapping("/send")
    public ResponseEntity<?> sendMessage(@RequestBody ChatRequest request) {
        // redis topic name ex> chat:1
        String topic = "signal:room:" + request.getRoomId();

        SignalMessage signalMsg = new SignalMessage();
        signalMsg.setType(request.getType());
        signalMsg.setRoomId(request.getRoomId());
        signalMsg.setFrom(request.getUserId());
        signalMsg.setTarget(request.getTarget());
        signalMsg.setPayload(Map.of("message", request.getMessage()));

        String jsonMsg = null;
        try {
            jsonMsg = objectMapper.writeValueAsString(signalMsg);
        } catch (JsonProcessingException e) {
            throw new RuntimeException(e);
        }
        // redis 로 메시지 발행
        redisTemplate.convertAndSend(topic, jsonMsg);
        return ResponseEntity.ok().build();
    }
}
