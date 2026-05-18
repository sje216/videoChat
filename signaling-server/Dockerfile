FROM eclipse-temurin:17-jdk-alpine
# 빌드시 생성되는 jar파일 위치 지정
ARG JAR_FILE=build/libs/*.jar
# jar파일을 컨테이너 내부로 복사
COPY ${JAR_FILE} app.jar
# 컨테이너가 실행될 때 jar파일을 실행하도록 설정
ENTRYPOINT ["java", "-jar", "-Dspring.profiles.active=prod", "/app.jar"]