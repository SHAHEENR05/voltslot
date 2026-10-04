# ---------- Stage 1: build the jar ----------
FROM maven:3.9-eclipse-temurin-17 AS build
WORKDIR /build
COPY pom.xml .
RUN mvn -q -DskipTests dependency:go-offline || true
COPY src ./src
RUN mvn -q -DskipTests package

# ---------- Stage 2: slim runtime ----------
FROM eclipse-temurin:17-jre
WORKDIR /app
COPY --from=build /build/target/*.jar /app/app.jar
ENV PORT=8080 \
    JAVA_OPTS="-Xmx300m -Xss512k -XX:+UseSerialGC -XX:MaxMetaspaceSize=128m -XX:TieredStopAtLevel=1"
EXPOSE 8080
# Memory flags keep the app inside Render's free 512 MB instance.
# sh -c so that $PORT and $JAVA_OPTS are expanded at container start (hosts such as Render/Railway inject PORT)
ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -Dserver.port=${PORT} -jar /app/app.jar"]
