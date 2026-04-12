import * as mediasoupClient from "mediasoup-client";

let springSocket  = null; // 채팅, 입장/퇴장, 유저리스트
let sfuSocket     = null; // 오직 mediasoup
let device, sendTransport, recvTransport;
let audioProducer, videoProducer, screenProducer;
let users = [];
let selectedUser = null;
let pendingProduceCallback = null; // 서버 응답 대기용
let currentUserId = null;
let roomId = null;
let userId = sessionStorage.getItem("myId");
let reconnectAttempts = 0;

const consumers = new Map();
const consumingProducers = new Set();

// const localVideo = document.getElementById("localVideo");
const remoteVideos = document.getElementById("remoteVideos");
const shareBtn = document.getElementById("shareScreen");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const userListDiv = document.getElementById("userList");

async function startAndjoin() {
  // UI 전환
  document.getElementById("entrance").style.display = "none";
  document.getElementById("container").style.display = "flex";
  document.getElementById("controlSection").style.display = "flex";
  
  transportCount =0;
  // 기존 데이터 싹 비우기
  users = [];
  if(userListDiv) userListDiv.innerHTML = "";
  if(remoteVideos) remoteVideos.innerHTML = "";
  renderUsers();
  roomId = roomInput.value;
  if(!roomId) return alert("방 이름을 입력해주세요.");
  if(!userId){
    userId = "user_" + Math.floor(Math.random() * 1000);
    sessionStorage.setItem("myId", userId);
  }
  currentUserId = userId;

  try{
    const res = await fetch(`http://localhost:8080/api/rooms/${roomId}/access`, {
      method: "POST",
      headers: {"Content-type" : "application/json"},
      body: JSON.stringify({userId})
    });
    const {sfuUrl, ticket } = await res.json();

    // 관리/채팅 소켓
    initSpringSocket(roomId, userId);
    // 미디어 소켓
    initSfuSocket(sfuUrl, roomId, userId, ticket);

  }catch(err){
    console.error("입장실패 : ",err);
  }
}

function initSpringSocket(roomId, userId){
  springSocket = new WebSocket(`ws://localhost:8080/ws?roomId=${roomId}&userId=${userId}`);

  springSocket.onopen = () => {
    console.log("✅ SpringSocket(채팅/신호) 연결 성공!");
    reconnectAttempts = 0; // 연결 성공 시 초기화
    springSocket.send(JSON.stringify({
      type:"JOIN",
      roomId: roomId,
      from: userId
    }));
  };

  springSocket.onerror = (err) => {
    console.error("❌ SpringSocket 연결 에러:", err);
  };

  springSocket.onmessage = (e) => {
    const msg = JSON.parse(e.data);

    console.log("springsocket msgType : ",msg);
    switch (msg.type) {
      case "JOIN":
        users = msg.currentUsers || [];
        window.userStatuses = msg.userStatuses || {};
        console.log("유저 상태들 !!!",window.userStatuses);
        // 비디오 박스 
        renderUsers();
        // 박스 배치 조절
        updateVideoGridLayout();
        addChatMessage(`${msg.from}님이 입장했습니다.`,"system");
        // 추가 - 기존/신규 유저들의 마이크 상태 아이콘 일괄 업데이트
        break;

      case "CHAT":
        // 만약 msg.from이 안 나온다면 msg.userId 등 전달받은 필드명을 확인하세요.
        const sender = msg.from || "익명";
        const text = msg.payload ? msg.payload.message : "메시지 오류";
        console.log(sender, text);
        addChatMessage(`${sender} : ${text}`);
        break;

      case "WHISPER":
        const whisperText = msg.payload? msg.payload.message : "메시지 내용 없음";
        addChatMessage(`[귓속말] ${msg.from}: ${msg.payload.message}`, "whisper");
        break;
        
      case "STATUS":
        const { from, payload } = msg; // data는 Spring에서 받은 JSON
        const { type, enabled } = payload;

        // 1. 해당 유저의 비디오 박스 요소를 찾음
        const remoteVideoContainer = document.querySelector(`[data-peer-id="${from}"]`);
        
        if (remoteVideoContainer) {
            if (type === "audio") {
                // 마이크 아이콘 업데이트
                const micIcon = remoteVideoContainer.querySelector(".status-icon-mic");
                micIcon.innerText = enabled ? "🎙️" : "🔇";
                micIcon.classList.toggle("muted", !enabled);
            } else if (type === "video") {
                // 카메라 아이콘 또는 비디오 오버레이 업데이트
                const videoOffOverlay = remoteVideoContainer.querySelector(".video-off-overlay");
                videoOffOverlay.style.display = enabled ? "none" : "flex";
            }
        }
        break;

      case "LEAVE":
        users = msg.currentUsers || [];
        renderUsers();
        removePeer(msg.from);
        addChatMessage(`${msg.from}님이 퇴장했습니다.`,"system");
        break;
    }
  }

  springSocket.onclose = (e) => {
    // 사용자가 직접 나간게 아니라면 재시도 지수백오프 형식
    if(e.code !== 1000){
      const delay = Math.min(Math.pow(2, reconnectAttempts) * 1000, 30000);
      console.warn("시그널링 연결이 끊겼습니다. 재연결을 시도합니다.");
      setTimeout(() => {
        reconnectAttempts++;
        initSpringSocket(roomId, userId);
      }, delay);
    }
    console.log("ℹ️ SpringSocket 연결 종료:", e.code, e.reason);
  };
}

// 2. 새로고침/창 닫기 대응
window.addEventListener('beforeunload', () => {
    // 새로고침 시에는 '재연결' 로직을 태우지 않고 그냥 닫기만 함
    // 어차피 새 페이지가 뜨면서 initSpringSocket()이 다시 실행될 것이기 때문
    if (springSocket) {
        springSocket.onclose = null; 
        springSocket.close();
    }
});

function initSfuSocket(sfuUrl, roomId, userId, ticket){
  sfuSocket = new WebSocket(`${sfuUrl}?roomId=${roomId}&userId=${userId}&token=${ticket}`);
  sfuSocket.onopen = () => {
    console.log("SFU 소켓 연결 성공!");
    sfuSocket.send(JSON.stringify({
      type: "joinRoom",
      data: { // 👈 서버가 data.data를 원한다면 이렇게 감싸야 함
        roomId: roomId,
        userId: userId
      }
    }));
  };

  sfuSocket.onmessage = async (e) => {
    const msg = JSON.parse(e.data);
    
    switch (msg.type) {
      case "routerRtpCapabilities":
        await loadDevice(msg.data);
        break;

      case "existingProducers":
        msg.producers.forEach( p => consumeProducer(p.producerId));
        break;

      case "transportCreated":
        await createTransport(msg.data);
        break;

      case "transportConnected":
        console.log("transport connected");
        break;

      case "produced":
        console.log("produced: ", msg.producerId);
        // mediasoup-client에 서버에서 생성된 ID 전달
        if (pendingProduceCallback) {
          pendingProduceCallback({ id: msg.producerId });
          pendingProduceCallback = null;
        }
        break;

      case "newProducer":
        console.log("newProducer ", msg.producerId);
        await consumeProducer(msg.producerId);
        break;

      case "consume": // 서버에서 보내는 타입이 'consume'일 경우
        console.log("consume : ", msg.data);
        await handleConsume(msg.data);
        break;

      case "currentProducers": 
        console.log("currentProducers : ", msg.data);
        // 상태 충돌로 인해 일부 요청이 무시(비동기 충돌)
        (async () => {
          for(const producerId of msg.data){
            console.log("구독시작 : ", producerId);
            await consumeProducer(producerId);
          }
        })();
        break;

      case "producerClosed":
        console.log("producerClosed: ", msg.producerId);
        removeVideo(msg.producerId);
        break;

    }
  };
}

async function loadDevice(routerRtpCapabilities) {
  device = new mediasoupClient.Device();
  await device.load({ routerRtpCapabilities });
  // 송신용 트랜스포트 생성 요청
  sfuSocket.send(JSON.stringify({ type: "createTransport" }));
}

let transportCount = 0;

async function createTransport(data) {
  transportCount++;

  if (transportCount === 1) {
    // 1. 송신용 트랜스포트
    sendTransport = device.createSendTransport(data);

    sendTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      sfuSocket.send(JSON.stringify({
        type: "connectTransport",
        transportId: sendTransport.id,
        dtlsParameters
      }));
      callback();
    });

    sendTransport.on("produce", ({ kind, rtpParameters, appData }, callback, errback) => {
      pendingProduceCallback = callback; // 서버 응답 'produced'를 기다림
      sfuSocket.send(JSON.stringify({
        type: "produce",
        transportId: sendTransport.id,
        kind,
        rtpParameters,
        appData
      }));
    });

    try{
      console.log("카메라/마이크 권한 요청 중...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true 
      });
      // 내 영상 박스 생성
      const localBox =document.createElement("div");
      localBox.id = "container-local";
      localBox.className = "remote-video-box local-member";
      localBox.setAttribute("data-peer-id", userId); // 내 ID도 부여

      // 마이크 추가
      const micIcon = document.createElement("div");
      micIcon.className = "status-icon-mic";
      micIcon.id = "local-mic-icon"; // 내 마이크 아이콘은 ID로 접근하기 쉽게 설정
      micIcon.innerText = "🎙️";
      micIcon.style.position = "absolute";
      micIcon.style.top = "10px";
      micIcon.style.right = "10px";
      micIcon.style.zIndex = "10";

      // 이름표 추가
      const nameTag = document.createElement("div");
      nameTag.className = "video-name-tag";
      nameTag.innerText = "나";

      localBox.appendChild(micIcon);
      localBox.appendChild(nameTag);

      const localVideo = document.createElement("video");
      localVideo.srcObject = stream;
      localVideo.autoplay = true;
      localVideo.playsInline = true;
      localVideo.muted = true; // 내소리는 나한테 안 들리게

      localBox.appendChild(localVideo);

      // 그리드 영역에 내 영상 꽂기
      remoteVideos.appendChild(localBox);

      window.localSteam = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if(videoTrack){
        videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: {type: "video"},
          encodings: [
            { rid: 'r0', maxBitrate: 100000, scaleResolutionDownBy: 4 }, // 저화질 (1/4 해상도)
            { rid: 'r1', maxBitrate: 300000, scaleResolutionDownBy: 2 }, // 중화질 (1/2 해상도)
            { rid: 'r2', maxBitrate: 900000, scaleResolutionDownBy: 1 }, // 고화질 (원본 해상도)
          ],
          codecOptions: { videoGoogleStartBitrate: 1000 }
                });
        console.log("✅ Simulcast Producer 생성 완료!");
      }

      if(audioTrack){
        audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: {type: "audio"}
        });
        console.log("오디오 송출 시작");
      }

      // 송출 성공 후 수신용 트랜스포트 생성 요청
      sfuSocket.send(JSON.stringify({ type: "createTransport" }));

      }catch(err){
        console.error("미디어 장치를 불러오지 못했습니다:", err);
        alert("카메라 혹은 마이크를 찾을 수 없거나 권한이 거부되었습니다.");
      }

  } else {
    // 2. 수신용 트랜스포트
    recvTransport = device.createRecvTransport(data);
    recvTransport.on("connect", ({ dtlsParameters }, callback, errback) => {
      sfuSocket.send(JSON.stringify({
        type: "connectTransport",
        transportId: recvTransport.id,
        dtlsParameters
      }));
      callback();
    });
    console.log("recvTransport ready");
    sfuSocket.send(JSON.stringify({
      type:"getProducers"
    }));
  }
}

async function consumeProducer(producerId) {
  // 수신용 트랜스포트가 생성될 때까지 대기 (가장 중요한 안전 장치)

  if(consumingProducers.has(producerId)){
    console.log("already consuming: ",producerId);
    return;
  }

  
  if (!recvTransport) {
    console.log("Waiting for recvTransport...");
    setTimeout(() => consumeProducer(producerId), 500);
    return;
  }
  consumingProducers.add(producerId);
  console.log("consumeProducer called : ",producerId);
  console.log("consumeProducer consumingProducers : ",consumingProducers);
  console.log("consumeProducer called recTransport : ",recvTransport);
  console.log("consumeProducer called recTransportId : ",recvTransport.id);

  sfuSocket.send(JSON.stringify({
    type: "consume",
    producerId,
    transportId: recvTransport.id, // transport.id가 아니라 recvTransport.id 입니다.
    rtpCapabilities: device.rtpCapabilities
  }));
}

async function handleConsume(data) {
  // recvTransport 를 통해 로컬 consumer 생성
  const consumer = await recvTransport.consume({
    id: data.id,
    producerId: data.producerId,
    kind: data.kind,
    rtpParameters: data.rtpParameters // 서버가 보내준 simulcast도 포함
  });
  consumers.set(data.id, consumer); // producerId -> consumerId로 변경

  // 미디어 스트림 생성 및 트랙 연결
  const stream = new MediaStream([consumer.track]);

  // 오디오 트랙 추가
  if(data.kind === "audio"){
    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    console.log("🔊 오디오 트랙 수신: 소리만 재생합니다.");

    //resume 요청 후 함수 종료
    return sfuSocket.send(JSON.stringify({
      type:"resumeConsumer",
      data: { consumerId: consumer.id }
    }));
  }

  console.log("creting video for producer : ",data.producerId);
  const video       = document.createElement("video");
  video.srcObject   = stream;
  video.autoplay    = true;
  video.playsInline = true;

  // 비디오 재생 보장 (일부 브라우저 정책 대응)
  video.onloadedmetadata = () => {
    video.play().catch(e => console.error("video play 실패 : ", e));
  };

  video.id = "video-" + data.producerId;
  // video.className = "remote-video-box";
  // video.setAttribute("data-peer-id", data.peerId);
  
  //  화면 공유시 스타일 차별화
  if(data.appData && data.appData.type ==="screen"){
    const mainScreen = document.getElementById("mainScreen");
    if(mainScreen){
      mainScreen.style.setProperty('display', 'block', 'important'); // CSS의 !important를 뚫고 보여줌
      mainScreen.innerHTML = ""; // 제목 하나 넣어줌
      // 화면 공유용 컨테이너
      const videoBox = document.createElement("div");
      videoBox.className = "main-video-wrapper";
      // videoBox.style.width = "100%";
      // videoBox.style.height = "100%";
      
      // 비디오에 직접 스타일을 주어 잘림 방지
      video.style.objectFit = "contain";
      videoBox.appendChild(video);
      mainScreen.appendChild(videoBox);
      console.log("📺 화면 공유를 메인 섹션에 띄웁니다.");

      // 화면 공유가 생겼으므로 하단 그리드 레이아웃 재조정
      updateVideoGridLayout();
    }
  }else{

    // 중복 생성 방지: 이미 해당 유저의 박스가 있다면 제거 후 재생성
    const existingBox = document.getElementById("container-" + data.producerId);
    if (existingBox) existingBox.remove();

    // 비디오 감쌀 박스 생성
    const videoBox = document.createElement("div");
    videoBox.id = "container-" + data.producerId;
    videoBox.className = "remote-video-box";
    videoBox.setAttribute("data-peer-id", data.peerId);

    // 마이크 상태 아이콘 추가
    const micIcon = document.createElement("div");
    micIcon.className = "status-icon-mic"; 
    micIcon.innerText = "🎙️"; // 기본값은 켜짐 상태
    micIcon.style.position = "absolute";
    micIcon.style.top = "10px";
    micIcon.style.right = "10px";
    micIcon.style.zIndex = "10";

    // 이름표 생성
    const nameTag = document.createElement("div");
    nameTag.className = "video-name-tag";
    // Spring 서버에서 보낸 peerId를 이름으로 표시 (닉네임 데이터가 있다면 그것을 사용)
    nameTag.innerText = data.peerId || "참가자";

    // 조립: 박스 안에 비디오와 이름표 넣기
    video.style.objectFit = "cover";
    videoBox.appendChild(video);
    videoBox.appendChild(nameTag);
    videoBox.appendChild(micIcon);
    // 그리드에 박스 추가
    remoteVideos.appendChild(videoBox);

    // 추가 - 박스가 생성되자마자 저장된 상태를 확인하고 적용
    applyInitialStatus(data.peerId, videoBox);

    // 레이아웃 갱신 호출
    if(typeof updateVideoGridLayout === "function"){
      updateVideoGridLayout();
    }
  }

  // 서버에서 paused를 보냈다면 resume 필수
  sfuSocket.send(JSON.stringify({
    type: "resumeConsumer",
    data:{consumerId: consumer.id}
  }));
  // 비디오가 멈춰있다면 서버에서 consumer.resume()을 호출했는지 확인하세요.
}

// main.js - 유저 목록이 갱신될 때 실행되는 함수 예시
function updateVideoGridLayout() {
    const videoGrid = document.getElementById("remoteVideos");
    const mainScreen = document.getElementById("mainScreen");
    const userCount = users.length + 1; // 상대방 수 + 나

    //  안전장치: 메인 스크린 안에 자식이 없으면 숨기기
    if (mainScreen.children.length === 0) {
        mainScreen.style.setProperty('display', 'none', 'important');
    }

    // 인원수에 따라 클래스 부여
    if (userCount <= 2) {
        // 1~2명일 때는 한 줄에 한 명씩 크게 나오게 설정
        videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(450px, 1fr))";
    } else if (userCount <= 4) {
        // 3~4명일 때는 2x2 바둑판 모양 유도
        videoGrid.style.gridTemplateColumns = "repeat(2, 1fr)";
    } else {
        // 5명 이상일 때는 기본 minmax 설정
        videoGrid.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
    }
}

// 화면공유
shareBtn.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  const screenTrack = screenStream.getVideoTracks()[0];

  screenProducer = await sendTransport.produce({
    track: screenTrack,
    appData: {type: "screen"}
  });

  screenTrack.onended = () => {
    console.log("화면 공유 종료됨");
    if(screenProducer){
      const screenProducerId = screenProducer.id;
      sfuSocket.send(JSON.stringify({
        type: "producerClosed",
        producerId: screenProducerId
      }));

      stopScreenShare();
      removeVideo(screenProducerId);
    }
  };
};

function stopScreenShare() {
  if(!screenProducer) return;

  screenProducer.close();
  screenProducer = null;
}

function removeVideo(producerId){
  
  // removeVideo 시작할 때 로그
  console.log("지우려는 박스 ID:", "container-" + producerId);
  consumingProducers.delete(producerId);
  const consumer = consumers.get(producerId);
  if(consumer){
    consumer.close();
    consumers.delete(producerId);
  }

  // container 찾음
  const videoContainer = document.getElementById("container-" + producerId);
  if(videoContainer){
    if(videoContainer.parentElement && videoContainer.parentElement.id === "mainScreen"){
      const mainScreen = document.getElementById("mainScreen");
      mainScreen.style.display = "none"; // 화면 공유 박스 숨기기
      mainScreen.innerText = ""; // 내부 잔여물 삭제
      console.log("📺 화면 공유 종료: 메인 섹션을 숨깁니다.");
    }
    videoContainer.remove(); // 박스 자체를 삭제
  }
  // 영상이 사라졌으니 하단 그리드 레이아웃 재정렬
  if (typeof updateVideoGridLayout === "function") {
    updateVideoGridLayout();
  }
} 

function removePeer(peerId){
  console.log(`유저 퇴장 처리 (peerId : ${peerId} )`);

  const containers = document.querySelectorAll(`[data-peer-id="${peerId}"]`);
  
  containers.forEach(c => {
    if(c.parentElement && c.parentElement.id === "mainScreen"){
      const mainScreen = document.getElementById("mainScreen");
      mainScreen.style.display = "none";
      mainScreen.innerHTML = "";
      console.log("화면 메인 섹션 숨김 완료");
    }
    // 비디오 스트림 연결 해제
    const video = c.querySelector("video");
    if(video){
      video.srcObject = null;
    }
    // 박스 전체 삭제
    c.remove();
    console.log(`✅ [${peerId}] 유저의 영상 박스가 제거되었습니다.`);
  });
}

// send chat
async function sendChat(){
  const input = document.getElementById("chatInput");
  if(!input.value) return;

  const roomId = roomInput.value;

  try{
    
    await fetch(`http://localhost:8080/api/chat/send`, {
      method: "POST",
      headers: {"Content-type" : "application/json"},
      body: JSON.stringify({
        type: "CHAT",
        roomId: roomId,
        userId: userId,
        message: input.value
      })
    });

    input.value = "";
    console.log("채팅 전송 성공!");
  }catch(err){
    console.error("채팅 전송 실패 : ",err);
  }

}

function addChatMessage(msg, type="normal"){
  const chatBox = document.getElementById("chatBox");
  const div = document.createElement("div");

  div.style.marginBottom = "5px";
  div.style.fontSize = "14px";

  console.log("chat type: ",type);
  if(type === "system"){
    div.style.color = "#888";
    div.style.fontStyle = "italic";
    div.innerText = msg;
  }else if(type ==="whisper"){
    div.style.color = "#888";
    div.style.fontWeight = "bold";
    div.innerText = msg;
  }else{
    if(msg.startsWith(`${currentUserId} :`)){
      console.log("msg : ",msg);
      const content = msg.replace(`${currentUserId} :`,'').trim();
      console.log("msg content: ",content);
      div.innerHTML = `<span style="color:#98c379; font-weight:bold;">나:</span> ${content}`;
    }else{
      div.innerText = msg;
    }
  }
  chatBox.appendChild(div);
  chatBox.scrollTop = chatBox.scrollHeight;
}

async function sendWhisper() {

  if(!selectedUser){
    alert('유저 선택해줘!');
    return;
  }

  const input = document.getElementById("chatInput");
  try{
    
    await fetch(`http://localhost:8080/api/chat/send`, {
      method: "POST",
      headers: {"Content-type" : "application/json"},
      body: JSON.stringify({
        type: "WHISPER",
        roomId: roomId,
        userId: currentUserId,
        target: selectedUser,
        message: input.value
      })
    });

    input.value = "";
    console.log("채팅 전송 성공!");
  }catch(err){
    console.error("채팅 전송 실패 : ",err);
  }

}

function renderUsers() {
  userListDiv.innerHTML = "";

  if (!users || !Array.isArray(users)) {
    console.warn("유저 목록이 비어있거나 올바르지 않습니다.");
    return;
  }

  const uniqueUsers = [...new Set(users)];
  uniqueUsers.forEach(id => {
    const div = document.createElement("div");
    // 내 아이디면 별도 표시
    const isMe = (id === currentUserId);
    div.className = "user-item";
    div.innerText = isMe ? `👤 ${id} (나)` : `👤 ${id}`;
    // CSS 클래스 추가 (선택된 경우 강조)
    div.style.padding = "8px";
    div.style.margin = "4px 0";
    div.style.borderRadius = "6px";
    div.style.cursor = isMe ? "default" : "pointer";
    div.style.backgroundColor = "#333";
    
    if (selectedUser === id) {
      div.style.backgroundColor = "#c678dd"; // 귓속말 강조 색상 (보라)
      div.style.color = "white";
      div.style.fontWeight = "bold";
    }

    div.onclick = () => {
      if(isMe) return;
      selectedUser = id;
      console.log("selected : ", id);
      renderUsers();
    };

    userListDiv.appendChild(div);
  });
}

function applyInitialStatus(peerId, container) {
  // join 시점 window.userStatuses 저장해둔 데이터 가져옴
  if(!window.userStatuses || !window.userStatuses[peerId]) return;
  try {
    const status = JSON.parse(window.userStatuses[peerId]);
    // mic 아이콘 업데이트
    const micIcon = container.querySelector(".status-icon-mic");
    if(micIcon) {
      micIcon.innerText = status.audio ? "🎙️" : "🔇";
      micIcon.style.color = status.audio ? "white" : "coral";
    }

    // camera 리소스 최적화
    if(status.video === false){
      const video = container.querySelector("video");
        if (video) {
            video.style.display = "none";
            container.style.backgroundColor = "#1a1a1a";
        }
    }
  } catch (e) {
    console.error("초기 상태 적용 실패 :", e);
  }
}

function leaveRoom() {
  springSocket.send(JSON.stringify({
    type:"LEAVE",
    roomId: roomId,
    from: userId
  }));

  springSocket.close();

  location.href = "/lobby";
}

joinBtn.onclick = startAndjoin;
document.getElementById("sendBtn").onclick = () => {
  sendChat();
};

document.getElementById("whisperBtn").onclick = () => {
  sendWhisper();
};

document.getElementById("leaveBtn").onclick = () =>{
  leaveRoom();
}

document.getElementById("muteBtn").onclick = () => {
  const audioTrack = localSteam.getAudioTracks()[0];
  if(!audioTrack) return;

  // track 상태 반전
  audioTrack.enabled = !audioTrack.enabled;
  const isMuted = !audioTrack.enabled;

  // UI update
  document.getElementById("muteBtn").innerText = isMuted ? "unmute" : "mute";
  console.log(isMuted ? "🔇 마이크 끔" : "🎙️ 마이크 켬");

  // spring server로 상태 전송
  springSocket.send(JSON.stringify({
    type: "STATUS",
    roomId: roomId,
    from: userId,
    payload: {
      type: "audio",
      enabled: audioTrack.enabled // true면 켜짐, false면 꺼짐
    }
  }));
};

document.getElementById("cameraBtn").onclick = () => {
  const videoTrack = localSteam.getVideoTracks()[0];
  if(!videoTrack) return;
  
  // track 상태 반전
  videoTrack.enabled = !videoTrack.enabled;
  const isOff = !videoTrack.enabled;

  // UI update
  document.getElementById("cameraBtn").innerText = isOff ? "camera on" : "camera off";
  console.log(isOff ? "🚫 카메라 끔" : "📷 카메라 켬");

  // 3. Spring 서버로 상태 전송
  springSocket.send(JSON.stringify({
    type: "STATUS",
    roomId: roomId,
    from: userId,
    payload: {
      type: "video",
      enabled: videoTrack.enabled
    }
  }));
};