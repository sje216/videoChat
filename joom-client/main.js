import * as mediasoupClient from "mediasoup-client";
import UIManager from "./ui/UIManager";
import SocketManager from "./core/SocketManager";
import ApiService from "./service/ApiService";
import MediasoupHandler from "./core/MediasoupHandler";

let audioProducer, videoProducer, screenProducer;
let users                   = [];
let selectedUser            = null;
let pendingProduceCallback  = null; // 서버 응답 대기용
let currentUserId           = null;
let roomId                  = null;
let userId                  = sessionStorage.getItem("myId");

const ui                  = new UIManager();
const springSocket        = new SocketManager("spring");
const sfuSocket           = new SocketManager("sfu");
const apiService          = new ApiService();
const mediasoupHandler    = new MediasoupHandler(sfuSocket);
const consumers           = new Map();
const consumingProducers  = new Set();

const remoteVideos  = document.getElementById("remoteVideos");
const shareBtn      = document.getElementById("shareScreen");
const joinBtn       = document.getElementById("joinBtn");
const roomInput     = document.getElementById("roomInput");
const userListDiv   = document.getElementById("userList");

async function startAndjoin() {
  // UI 전환
  document.getElementById("entrance").style.display = "none";
  document.getElementById("container").style.display = "flex";
  document.getElementById("controlSection").style.display = "flex";
  
  transportCount =0;
  // 기존 데이터 싹 비우기
  users = [];
  if(userListDiv) userListDiv.innerHTML   = "";
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
    const res = await apiService.getRoomAccess(roomId, userId);
    const {sfuUrl, ticket } = res;

    // 관리/채팅 소켓
    const springUrl = `ws://localhost:8080/ws?roomId=${roomId}&userId=${userId}`;
    await springSocket.connect(springUrl);
    console.log("springSocket 연결 성공!");
    springSocket.send("JOIN", {roomId: roomId, from: userId});
    // 미디어 소켓
    const finalsfuUrl = `${sfuUrl}?roomId=${roomId}&userId=${userId}&token=${ticket}`;
    await sfuSocket.connect(finalsfuUrl);
    console.log("springSocket 연결 성공 후 실행되는 로직!");
    sfuSocket.send("joinRoom", {roomId: roomId, userId: userId});
  }catch(err){
    console.error("입장실패 : ",err);
  }

  startHeartbeat();

}

// springSocket의 이벤트 리스너
  springSocket.on("JOIN", (msg) => {
    users = msg.currentUsers || [];
    window.userStatuses = msg.userStatuses || {};
    console.log("유저 상태들 !!!",window.userStatuses);
    // 비디오 박스 
    renderUsers();
    // 박스 배치 조절
    ui.updateVideoGridLayout();
    ui.addChatMessage(null, `${msg.from}님이 입장했습니다.`,"system");
    // 추가 - 기존/신규 유저들의 마이크 상태 아이콘 일괄 업데이트
  });

  springSocket.on("CHAT", (msg) => {
     // 만약 msg.from이 안 나온다면 msg.userId 등 전달받은 필드명을 확인하세요.
    const sender = msg.from || "익명";
    const text = msg.payload ? msg.payload.message : "메시지 오류";
    console.log(sender, text);
    ui.addChatMessage(currentUserId, `${sender} : ${text}`);
  });

 springSocket.on("WHISPER", (msg) => {
  const whisperText = msg.payload? msg.payload.message : "메시지 내용 없음";
  ui.addChatMessage(currentUserId, `[귓속말] ${msg.from}: ${whisperText}`, "whisper");
 });

 springSocket.on("STATUS", (msg) => {
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
              const video = remoteVideoContainer.querySelector("video");
            if (video) {
                video.style.display = enabled ? "block" : "none";
                remoteVideoContainer.style.backgroundColor = enabled ? "transparent" : "#1a1a1a";
            }
          }
      }
  });

  springSocket.on("LEAVE", (msg) => {
    console.log("LEAVE 메시지 받음 : ", msg);
    if (!users.includes(msg.from)) {
        return; 
    }
    users = msg.currentUsers || [];
    ui.removePeer(msg.from);
    ui.addChatMessage(null, `${msg.from}님이 퇴장했습니다.`,"system");
    renderUsers();
  });


  // sfuSocket의 이벤트 리스너
  sfuSocket.on("routerRtpCapabilities",async (msg) => {
    await mediasoupHandler.loadDevice(msg.data);
  });

  sfuSocket.on("existingProducers", (msg) => {
    msg.producers.forEach( p => consumeProducer(p.producerId));
  });

  sfuSocket.on("transportCreated", async (msg) => {
     await createTransport(msg.data);
  });

  sfuSocket.on("transportConnected", (msg) => console.log("transport connected"));

  sfuSocket.on("produced", (msg) => {
    console.log("produced: ", msg.producerId);
    // mediasoup-client에 서버에서 생성된 ID 전달
    if (pendingProduceCallback) {
    pendingProduceCallback({ id: msg.producerId });
    pendingProduceCallback = null;
    }
  });

  sfuSocket.on("newProducer", async (msg) => {
    console.log("newProducer ", msg.producerId);
    await consumeProducer(msg.producerId);
  });

  sfuSocket.on("consume", async (msg) => {
    console.log("consume : ", msg.data);
    await handleConsume(msg.data);
  });

  sfuSocket.on("currentProducers", (msg) => {
    console.log("currentProducers : ", msg.data);
    // 상태 충돌로 인해 일부 요청이 무시(비동기 충돌)
    (async () => {
      for(const producerId of msg.data){
          console.log("구독시작 : ", producerId);
          await consumeProducer(producerId);
      }
    })();
  });

  sfuSocket.on("producerClosed", (msg) => {
    console.log("producerClosed: ", msg.producerId);
    removeVideo(msg.producerId, currentUserId, true);
  });

// 2. 새로고침/창 닫기 대응
window.addEventListener('beforeunload', () => {
    // 새로고침 시에는 '재연결' 로직을 태우지 않고 그냥 닫기만 함
    // 어차피 새 페이지가 뜨면서 initSpringSocket()이 다시 실행될 것이기 때문
    if (springSocket) {
        springSocket.onclose = null; 
        springSocket.close();
    }
    // 추가: SFU 소켓도 깨끗하게 정리
    if (sfuSocket) {
        sfuSocket.onclose = null;
        sfuSocket.close();
    }
});

function startHeartbeat() {
  setInterval(() => {
      console.log("Heartbeat 시작");
        if (springSocket.socket && springSocket.socket.readyState === WebSocket.OPEN) {
            springSocket.send("HEARTBEAT", {
                roomId: roomId,
                userId: currentUserId
            });
        }
    }, 20000); // 20초마다 heartbeat 전송
}

let transportCount = 0;

async function createTransport(data) {
  transportCount++;

  if (transportCount === 1) {
    // 1. 송신용 트랜스포트
    mediasoupHandler.setupSendTransport(data, (callback) => {
      // 서버에서 'produced' 응답이 오면 callback을 호출하여 ID 전달
      pendingProduceCallback = callback;
    });

    try{
      console.log("카메라/마이크 권한 요청 중...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: true 
      });
      // 내 영상 ui에 추가
      ui._createLocalVideoBox(currentUserId, stream);
      window.localStream = stream;

      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];

      if(videoTrack){
        videoProducer = await mediasoupHandler.produceTrack(videoTrack, "video");
        console.log("✅ Simulcast Producer 생성 완료!");
      }

      if(audioTrack){
        audioProducer = await mediasoupHandler.produceTrack(audioTrack, "audio");
        console.log("오디오 송출 시작");
      }

      // 송출 성공 후 수신용 트랜스포트 생성 요청
      sfuSocket.send("createTransport");

      }catch(err){
        console.error("미디어 장치를 불러오지 못했습니다:", err);
        alert("카메라 혹은 마이크를 찾을 수 없거나 권한이 거부되었습니다.");
      }

  } else {
    // 2. 수신용 트랜스포트
    mediasoupHandler.setupRecvTransport(data);
  }
}

async function consumeProducer(producerId) {
  // 수신용 트랜스포트가 생성될 때까지 대기 (가장 중요한 안전 장치)

  if(consumingProducers.has(producerId)){
    console.log("already consuming: ",producerId);
    return;
  }
  
  if (!mediasoupHandler.recvTransport) {
    console.log("Waiting for recvTransport...");
    setTimeout(() => consumeProducer(producerId), 500);
    return;
  }
  consumingProducers.add(producerId);
  console.log("consumeProducer called : ",producerId);
  console.log("consumeProducer consumingProducers : ",consumingProducers);
  console.log("consumeProducer mediasoupHandler.device.rtpCapabilities : ",mediasoupHandler.device.rtpCapabilities);

  sfuSocket.send("consume", {
    producerId,
    transportId: mediasoupHandler.recvTransport.id, // transport.id가 아니라 recvTransport.id 입니다.
    rtpCapabilities: mediasoupHandler.device.rtpCapabilities
  });
}

async function handleConsume(data) {
  // recvTransport 를 통해 로컬 consumer 생성
  const consumer = await mediasoupHandler.consume(data);
  consumers.set(data.id, consumer); // producerId -> consumerId로 변경

  // 미디어 스트림 생성 및 트랙 연결
  const stream = new MediaStream([consumer.track]);

  // 오디오 트랙 추가
  if(data.kind === "audio"){
    const audio = document.createElement("audio");
    audio.srcObject = stream;
    audio.autoplay = true;
    console.log("🔊 오디오 트랙 수신: 소리만 재생합니다.");
    
  }else{
    console.log("서버에서 받은 전체 데이터:", data);
    const isScreen = data.appData && data.appData.type === "screen";
                   
    // 기존 박스 재사용 또는 신규 생성이 처리
    ui.updateVideoView(data.peerId, stream, isScreen);
    // 초기 상태 적용 (마이크 끔/ 카메라 끔 등)
  }

  // 서버에서 paused를 보냈다면 resume 필수
  sfuSocket.send("resumeConsumer", {
    data:{consumerId: consumer.id}
  });
  // 비디오가 멈춰있다면 서버에서 consumer.resume()을 호출했는지 확인
}

// 화면공유
shareBtn.onclick = async () => {
  const screenStream = await navigator.mediaDevices.getDisplayMedia({
    video: true
  });

  const screenTrack = screenStream.getVideoTracks()[0];

  screenProducer = await mediasoupHandler.sendTransport.produce({
    track: screenTrack,
    appData: {type: "screen"}
  });

  screenTrack.onended = () => {
    console.log("화면 공유 종료됨");
    if(screenProducer){
      const screenProducerId = screenProducer.id;
      sfuSocket.send("producerClosed", {producerId: screenProducerId});
      stopScreenShare();
      // 내 peerId와 isScreen=true를 전달하여 UI 삭제
      console.log("currentUserId :", currentUserId);
      removeVideo(screenProducerId, currentUserId, true);
    }
  };
};

function stopScreenShare() {
  if(!screenProducer) return;

  screenProducer.close();
  screenProducer = null;
}

function removeVideo(producerId, currentUserId, isScreen = false){
  
  // removeVideo 시작할 때 로그
  console.log("지우려는 박스 ID:", "container-" + producerId);
  consumingProducers.delete(producerId);
  const consumer = consumers.get(producerId);
  if(consumer){
    consumer.close();
    consumers.delete(producerId);
  }

  // 2. UI 매니저를 통해 실제 DOM 제거
    ui.removeVideoElement(currentUserId, isScreen);
} 

// send chat
async function sendChat(){
  const input = document.getElementById("chatInput");
  if(!input.value) return;

  const roomId = roomInput.value;
  try{
    await apiService.sendChat(roomId, userId, input.value);
    input.value = "";
    console.log("채팅 전송 성공!");
  }catch(err){
    console.error("채팅 전송 실패 : ",err);
  }

}

async function sendWhisper() {
  if(!selectedUser){
    alert('유저 선택해줘!');
    return;
  }
  const input = document.getElementById("chatInput");
  try{
    await apiService.sendWhisper(roomId, currentUserId, selectedUser, input.value);
    input.value = "";
    console.log("채팅 전송 성공!");
  }catch(err){
    console.error("채팅 전송 실패 : ",err);
  }
}

function renderUsers() {
  // ui 매니저에게 렌더링 위임
  // 인자 : 전체유저배열, 내 아이디, , 콜백함수
  ui.renderUsers(users, selectedUser, currentUserId, (clickedId) => {
    // 유저 클릭시 처리 로직
    selectedUser = clickedId;
    console.log("selected : ", clickedId);
    // 선택 상태를 UI에 반영하기 위해 렌더링
    renderUsers();
  })
}

function leaveRoom() {
  console.log("방 나가기");
  springSocket.send("LEAVE", {roomId: roomId, from: userId});
  if(springSocket.socket){
    springSocket.socket.onclose = null;
  }
  //springSocket.socket.close();
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
  const audioTrack = localStream.getAudioTracks()[0];
  if(!audioTrack) return;

  // track 상태 반전
  audioTrack.enabled = !audioTrack.enabled;
  const isMuted = !audioTrack.enabled;

  // UI update
  document.getElementById("muteBtn").innerText = isMuted ? "unmute" : "mute";
  console.log(isMuted ? "🔇 마이크 끔" : "🎙️ 마이크 켬");

  // spring server로 상태 전송
  springSocket.send("STATUS", {
    roomId: roomId,
    from: userId,
    payload: {
      type: "audio",
      enabled: audioTrack.enabled // true면 켜짐, false면 꺼짐
    }
  });
};

document.getElementById("cameraBtn").onclick = () => {
  const videoTrack = localStream.getVideoTracks()[0];
  if(!videoTrack) return;
  
  // track 상태 반전
  videoTrack.enabled = !videoTrack.enabled;
  const isOff = !videoTrack.enabled;

  // UI update
  document.getElementById("cameraBtn").innerText = isOff ? "camera on" : "camera off";
  console.log(isOff ? "🚫 카메라 끔" : "📷 카메라 켬");

  // 3. Spring 서버로 상태 전송
  springSocket.send("STATUS",{
    roomId: roomId,
    from: userId,
    payload: {
      type: "video",
      enabled: videoTrack.enabled
    }
  });
};