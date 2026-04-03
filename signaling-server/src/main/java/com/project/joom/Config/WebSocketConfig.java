package com.project.joom.Config;

import com.project.joom.Controller.SignalingHandler;
import com.project.joom.Interceptor.MyHandshakeInterceptor;
import org.springframework.context.annotation.Configuration; // 👈 확인!
import org.springframework.web.socket.config.annotation.EnableWebSocket; // 👈 확인!
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration   // 💡 Spring에게 이게 설정파일이라고 알려줌
@EnableWebSocket  // 💡 웹소켓 기능을 활성화함
public class WebSocketConfig implements WebSocketConfigurer {

    private final SignalingHandler signalingHandler;

    public WebSocketConfig(SignalingHandler signalingHandler) {
        this.signalingHandler = signalingHandler;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        // 💡 모든 도메인에서 접속 가능하도록 AllowedOrigins("*") 필수!
        registry.addHandler(signalingHandler, "/ws")
                .addInterceptors(new MyHandshakeInterceptor()).setAllowedOrigins("*");
    }
}