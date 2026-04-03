import * as mediasoupClient from "mediasoup-client";
console.log("mediasoup client loaded");

let springSocket  = null; // 채팅, 입장/퇴장, 유저리스트
let sfuSocket     = null; // 오직 mediasoup
let device, sendTransport, recvTransport;
let audioProducer, videoProducer, screenProducer;
let users = [];
let selectedUser = null;
let pendingProduceCallback = null; // 서버 응답 대기용
let currentUserId = null;
let roomId = null;

const consumers = new Map();
const consumingProducers = new Set();

const localVideo = document.getElementById("localVideo");
const remoteVideos = document.getElementById("remoteVideos");
const shareBtn = document.getElementById("shareScreen");
const joinBtn = document.getElementById("joinBtn");
const roomInput = document.getElementById("roomInput");
const videoArea = document.getElementById("videoArea");

async function startAndjoin() {
  // UI 전환
  document.getElementById("entrance").style.display = "none";
  document.getElementById("container").style.display = "flex";
  document.getElementById("controlSection").style.display = "flex";
  
  transportCount =0;
  users = [];
  renderUsers();
  roomId = roomInput.value;
  if(!roomId) return alert("방 이름을 입력해주세요.");
  const userId = "user_" + Math.floor(Math.random() * 1000);
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

    //videoArea.style.display = "block";
  }catch(err){
    console.error("입장실패 : ",err);
  }
}

function initSpringSocket(roomId, userId){
  springSocket = new WebSocket(`ws://localhost:8080/ws?roomId=${roomId}&userId=${userId}`);

  springSocket.onopen = () => {
    console.log("✅ SpringSocket(채팅/신호) 연결 성공!");

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
        renderUsers();
        addChatMessage(`${msg.from}님이 입장했습니다.`,"system");
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
      case "LEAVE":
        users = users.filter(id => id !== msg.from);
        renderUsers();
        removePeer(msg.from);
        addChatMessage(`${msg.from}님이 퇴장했습니다.`,"system");
        break;
    }
  }

  springSocket.onclose = (e) => {
    console.log("ℹ️ SpringSocket 연결 종료:", e.code, e.reason);
  };
}

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
      localVideo.srcObject = stream;
      window.localSteam = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if(videoTrack){
        videoProducer = await sendTransport.produce({
          track: videoTrack,
          appData: {type: "video"},
          encodings: [
            { maxBitrate: 100000, scaleResolutionDownBy: 4 }, // 저화질
            { maxBitrate: 300000, scaleResolutionDownBy: 2 }, // 중간화질
            { maxBitrate: 900000, scaleResolutionDownBy: 1 }  // 고화질
          ],
          codecOptions: { videoGoogleStartBitrate: 1000 }
                });
        console.log("비디오 송출 시작");
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
  const consumer = await recvTransport.consume({
    id: data.id,
    producerId: data.producerId,
    kind: data.kind,
    rtpParameters: data.rtpParameters
  });
  consumers.set(data.producerId, consumer);

  const stream = new MediaStream();
  stream.addTrack(consumer.track);

  console.log("creting video for producer : ",data.producerId);
  const video       = document.createElement("video");
  video.srcObject   = stream;
  video.autoplay    = true;
  video.playsInline = true;

  video.id = "video-" + data.producerId;
  videoBox.className = "remote-video-box";
  video.setAttribute("data-peer-id", data.peerId);
  //  화면 공유시 스타일 차별화
  if(data.appData && data.appData.type ==="screen"){
    const mainScreen = document.getElementById("mainScreen");
    mainScreen.style.display = "block";
    mainScreen.innerHTML = ""; // 제목 하나 넣어줌
    mainScreen.appendChild(video);
    console.log("📺 화면 공유를 메인 섹션에 띄웁니다.");
  }else{
    remoteVideos.appendChild(video);
  }

  // 서버에서 paused를 보냈다면 resume 필수
  sfuSocket.send(JSON.stringify({
    type: "resumeConsumer",
    data:{consumerId: consumer.id}
  }));
  // 비디오가 멈춰있다면 서버에서 consumer.resume()을 호출했는지 확인하세요.
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
  
  consumingProducers.delete(producerId);
  const consumer = consumers.get(producerId);
  if(consumer){
    consumer.close();
    consumers.delete(producerId);
  }

  const video = document.getElementById("video-"+ producerId);
  if(video && video.parentElement.id === "mainScreen"){
    document.getElementById("mainScreen").style.display = "none";
  }
  if(video) video.remove();
} 

function removePeer(peerId){
  const videos = document.querySelectorAll(`video[data-peer-id="${peerId}"]`);
  
  videos.forEach(v => {
    v.srcObject = null;
    v.remove();
  });
}

// send chat
async function sendChat(){
  const input = document.getElementById("chatInput");
  if(!input.value) return;

  const roomId = roomInput.value;
  const userId = currentUserId;

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
  const userListDiv = document.getElementById("userList");
  userListDiv.innerHTML = "";

  if (!users || !Array.isArray(users)) {
    console.warn("유저 목록이 비어있거나 올바르지 않습니다.");
    return;
  }

  users.forEach(id => {
    const div = document.createElement("div");
    // 내 아이디면 별도 표시
    const isMe = (id === currentUserId);
    div.innerText = isMe ? `👤 ${id} (나)` : `👤 ${id}`;
    // CSS 클래스 추가 (선택된 경우 강조)
    div.style.padding = "8px";
    div.style.margin = "4px 0";
    div.style.borderRadius = "6px";
    div.style.cursor = isMe ? "default" : "pointer";
    div.style.backgroundColor = "#333";
    
    //if(selectedUser == id) div.classList.add("selected-user");
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

function leaveRoom() {
  const userId = currentUserId;
  springSocket.send(JSON.stringify({
    type:"LEAVE",
    roomId: roomId,
    from: userId
  }));

  springSocket.close();

  location.href = "/lobby";
}

// 소켓이 열려있을때만 나간다는 신호 
// window.addEventListener('beforeunload', () => {
//   if(springSocket && springSocket.readyState === WebSocket.OPEN){
//     springSocket.send(JSON.stringify({
//       type: "LEAVE",
//       roomId: roomId,
//       from: currentUserId
//     }));
//     console.log("leave send : ",roomId,currentUserId);
//   }
// });

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

let isMuted = false;
let isCameraOff = false;

document.getElementById("muteBtn").onclick = () => {
  if(!audioProducer) return;

  if(!isMuted){
    audioProducer.pause();
    isMuted = true;
    console.log("muted");
    document.getElementById("muteBtn").innerText = "unmute";
  }else{
    audioProducer.resume();
    isMuted = false;
    console.log("unmuted");
    document.getElementById("muteBtn").innerText = "mute";
  }
  
  sfuSocket.send(JSON.stringify({
    type: "mute",
    muted: isMuted
  }));
};

document.getElementById("cameraBtn").onclick = () => {
  if(!videoProducer) return;
  
  if(!isCameraOff){
    videoProducer.pause();
    isCameraOff = true;
    document.getElementById("cameraBtn").innerText = "camera on";
    console.log("camera off");
  }else{
    videoProducer.resume();
    isCameraOff = false;
    document.getElementById("cameraBtn").innerText = "camera off";
    console.log("camera on");
  }

  sfuSocket.send(JSON.stringify({
    type: "camera",
    off: isCameraOff
  }));
};