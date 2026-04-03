package com.project.joom.Repository;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;

import java.util.concurrent.TimeUnit;

@Repository
@RequiredArgsConstructor
public class TicketRepository {

    private final RedisTemplate<String, Object>  redisTemplate;
    private static final long TICKET_EXPIRATION = 60;

    public void saveTicket(String roomId, String userId){
        String key = "ticket:" + userId;
        // 60초 이후 자동삭제 티켓
        redisTemplate.opsForValue().set(key, roomId, TICKET_EXPIRATION, TimeUnit.SECONDS);
    }
}
