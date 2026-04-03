package com.project.joom.Util;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.SignatureAlgorithm;
import io.jsonwebtoken.security.Keys;
import jakarta.annotation.PostConstruct;
import org.springframework.stereotype.Component;
import java.security.Key;
import java.util.Date;

@Component
public class JwtUtil {
    // 1. 실제 서비스에선 application.yml 등에서 가져오세요.
    private String secretString = "your-very-long-and-secure-secret-key-at-least-32-chars";
    private static Key key;
    private static final long EXPIRATION_TIME = 1000 * 60 * 60; // 1시간

    @PostConstruct
    public void init() {
        // 문자열 키를 HMAC-SHA 알고리즘에 적합한 key객체로 변환
        this.key = Keys.hmacShaKeyFor(secretString.getBytes());
    }

    public static String createToken(String userId) {
        Claims claims = Jwts.claims().setSubject(userId);

        return Jwts.builder()
                .setClaims(claims)
                .setIssuedAt(new Date())
                .setExpiration(new Date(System.currentTimeMillis() + EXPIRATION_TIME)) // 1hour
                .signWith(key, SignatureAlgorithm.HS256)
                .compact();
    }

    // token 검증
    public boolean validateToken(String token) {
        try {
            Jwts.parserBuilder().setSigningKey(key).build().parseClaimsJws(token);
            return true;
        }catch (JwtException | IllegalArgumentException e){ // 토큰 변조나 만료되었을시
            return false;
        }
    }

    
    // token에서 userID 추출
    public String getUserId(String token){
        return Jwts.parserBuilder().setSigningKey(key).build()
                .parseClaimsJws(token).getBody().getSubject();
    }
}
