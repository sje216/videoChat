package com.project.joom.Config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

import java.util.concurrent.Executor;

@Configuration
@EnableAsync
public class AsyncConfig {
    @Bean(name = "signalingExecutor")
    public Executor signalingExecutor() {
        ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
        executor.setCorePoolSize(10); // 기본 스레드 수
        executor.setMaxPoolSize(50); // 최대 스레드 수
        executor.setQueueCapacity(100); // 대기 큐
        executor.setThreadNamePrefix("joomAsync-");

        // micrometer가 스레드 풀 상태 자동 추적
        executor.setTaskDecorator(runnable -> {
            // 커스텀 데코레이터가 필요 없다면 빈 등록 시점에
            // 하단처럼 MeterRegistry에 수동 등록도 가능
            return runnable;
        });
        executor.initialize();
        return executor;
    }
}
