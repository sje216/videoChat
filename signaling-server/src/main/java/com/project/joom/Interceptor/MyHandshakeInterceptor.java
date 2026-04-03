package com.project.joom.Interceptor;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.http.server.ServletServerHttpRequest;
import org.springframework.web.socket.WebSocketHandler;
import org.springframework.web.socket.server.HandshakeInterceptor;

import java.util.Map;

public class MyHandshakeInterceptor implements HandshakeInterceptor {
    @Override
    public boolean beforeHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Map<String, Object> attributes) throws Exception {
        if(request instanceof ServletServerHttpRequest servletRequest){
            HttpServletRequest req = servletRequest.getServletRequest();
            // 클라이언트가 넘긴 파라미터 추출
            String userId = req.getParameter("userId");
            String roomId = req.getParameter("roomId");

            // WebSocketSession의 attributes에 저장
            if (userId != null) attributes.put("userId", userId);
            if (roomId != null) attributes.put("roomId", roomId);
        }
        return true; // true여야 연결이 진행
    }

    @Override
    public void afterHandshake(ServerHttpRequest request, ServerHttpResponse response, WebSocketHandler wsHandler, Exception exception) {

    }
}
