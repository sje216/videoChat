export default class UIManager{
    constructor() {
        this.remoteVideos = document.getElementById("remoteVideos");
        this.mainScreen   = document.getElementById("mainScreen");
        this.userListDiv  = document.getElementById("userList");

        if (!this.mainScreen) console.warn("⚠️ 'mainScreen' 엘리먼트를 찾을 수 없습니다.");
    }

    /**
     * 비디오 뷰 업데이트 (신규 생성 또는 기존 박스 재사용)
     */
    updateVideoView(peerId, stream, isScreen = false){
        const containerId   = isScreen ? "mainScreen" : `container-${peerId}`;
        let videoBox        = document.getElementById(containerId);
        // 화면공유
        if(isScreen){
            console.log(`[신규] 유저 ${peerId}의 비디오 박스를 생성합니다.`);
            this._createScreenBox(peerId, stream);
            console.log("containerId : ",containerId);
        }else if(videoBox){
            // 일반 비디오 재사용
            console.log(`[복구] 유저 ${peerId}의 기존 박스를 재사용합니다.`);
            const existing = videoBox.querySelector("video");
            if (existing) existing.srcObject = stream;
        }else{
            // [신규 모드] 박스가 없다면 새로 생성 (기존 로직 유지)
            this._createVideoBox(peerId, stream);
        }

        // 추가된 부분: 박스가 생성/업데이트 된 후 자동으로 상태 적용
        videoBox = document.getElementById(containerId);
        if(videoBox && !isScreen){
            this.applyInitialStatus(peerId, videoBox);
        }

        // 레이아웃 갱신 호출
        this.updateVideoGridLayout();
    }

    /**
     * 유저 리스트 렌더링
     */
    renderUsers(users, selectedUser, currentUserId, onUserSelect) {
        this.userListDiv.innerHTML = "";

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

            // CSS 클래스 추가 (선택된 경우 강조)
            if (selectedUser === id) div.classList.add("selected-user");

            div.innerText       = isMe ? `👤 ${id} (나)` : `👤 ${id}`;
            div.style.cursor    = isMe ? "default" : "pointer";
            

            div.onclick         = () => {
            if(isMe) return;
            onUserSelect(id);
            };

            this.userListDiv.appendChild(div);
        });
    }

    /**
     *  유저의 초기 마이크/카메라 상태를 UI에 적용
     */
    applyInitialStatus(peerId, container) {
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

    /**
     * 채팅 
     */
    addChatMessage(sender, msg, type="normal"){
        const chatBox   = document.getElementById("chatBox");
        const div       = document.createElement("div");

        div.style.marginBottom  = "5px";
        div.style.fontSize      = "14px";
        console.log("chat type: ",type);

        if(type === "system"){
            div.style.color     = "#888";
            div.style.fontStyle = "italic";
            div.innerText       = msg;

        }else if(type ==="whisper"){
            div.style.color         = "#c678dd";
            div.style.fontWeight    = "bold";
            div.innerText           = msg;

        }else{
            const separatorIdx      = msg.indexOf(" :");
            if(separatorIdx !== -1){
                const senderId = msg.substring(0, separatorIdx);
                const content  = msg.substring(separatorIdx + 2).trim();
                if(senderId === sender){
                    console.log(sender, senderId);
                    div.innerHTML = `<span style="color:#98c379; font-weight:bold;">나:</span> ${content}`;
                }else{
                    console.log(sender, senderId);
                    div.innerHTML = `<span style="font-weight:bold;">${senderId}:</span> ${content}`;
                }
            }
        }
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // 내부 헬퍼: 일반 비디오 박스 생성
    _createVideoBox(peerId, stream) {
        // 비디오 감쌀 박스 생성
        const videoBox      = document.createElement("div");
        videoBox.id         = "container-" + peerId;
        videoBox.className  = "remote-video-box";
        videoBox.setAttribute("data-peer-id", peerId);
        // video 생성
        const video       = document.createElement("video");
        video.srcObject   = stream;
        video.autoplay    = true;
        video.playsInline = true;
        video.style.objectFit = "cover";
        // 비디오 재생 보장 (일부 브라우저 정책 대응)
        video.onloadedmetadata = () => {
        video.play().catch(e => console.error("video play 실패 : ", e));
        };
        // 마이크 상태 아이콘 추가
        const micIcon           = document.createElement("div");
        micIcon.className       = "status-icon-mic"; 
        micIcon.innerText       = "🎙️"; // 기본값은 켜짐 상태
        micIcon.style.position  = "absolute";
        micIcon.style.top       = "10px";
        micIcon.style.right     = "10px";
        micIcon.style.zIndex    = "10";
        // 이름표 생성
        const nameTag           = document.createElement("div");
        nameTag.className       = "video-name-tag";
        // Spring 서버에서 보낸 peerId를 이름으로 표시 (닉네임 데이터가 있다면 그것을 사용)
        nameTag.innerText       = peerId || "참가자";
        // 조립: 박스 안에 비디오와 이름표 넣기
        videoBox.appendChild(video);
        videoBox.appendChild(nameTag);
        videoBox.appendChild(micIcon);
        // 그리드에 박스 추가
        this.remoteVideos.appendChild(videoBox);
        return videoBox;
    }

    // 내부 헬퍼: 화면 공유 박스 생성
    _createScreenBox(peerId, stream) {
        this.mainScreen.style.setProperty('display', 'block', 'important'); // CSS의 !important를 뚫고 보여줌
        this.mainScreen.innerHTML   = ""; // 제목 하나 넣어줌
        // 화면 공유용 컨테이너
        const videoBox              = document.createElement("div");
        videoBox.className          = "main-video-wrapper";
        videoBox.setAttribute("data-peer-id", peerId); // 퇴장 시 지우기 위함
        
        // 비디오에 직접 스타일을 주어 잘림 방지
        const video           = document.createElement("video");
        video.srcObject       = stream;
        video.autoplay        = true;
        video.playsInline     = true;
        video.style.objectFit = "contain";
        
        videoBox.appendChild(video);
        this.mainScreen.appendChild(videoBox);
        console.log("📺 화면 공유를 메인 섹션에 띄웁니다.");
        return videoBox;
    }

    // main.js - 유저 목록이 갱신될 때 실행되는 함수 예시
    updateVideoGridLayout(userCount) {
        //const userCount = users.length + 1; // 상대방 수 + 나

        //  안전장치: 메인 스크린 안에 자식이 없으면 숨기기
        if (this.mainScreen.children.length === 0) {
            this.mainScreen.style.setProperty('display', 'none', 'important');
        }

        // 인원수에 따라 클래스 부여
        if (userCount <= 2) {
            // 1~2명일 때는 한 줄에 한 명씩 크게 나오게 설정
            this.remoteVideos.style.gridTemplateColumns = "repeat(auto-fit, minmax(450px, 1fr))";
        } else if (userCount <= 4) {
            // 3~4명일 때는 2x2 바둑판 모양 유도
            this.remoteVideos.style.gridTemplateColumns = "repeat(2, 1fr)";
        } else {
            // 5명 이상일 때는 기본 minmax 설정
            this.remoteVideos.style.gridTemplateColumns = "repeat(auto-fit, minmax(300px, 1fr))";
        }
    }

    // 특정 비디오 제거 (화면 공유 종료 대응)
    removeVideoElement(peerId, isScreen = false){
        console.log("화면공유 제거 isScreen :", isScreen);
        if(isScreen){
            this.mainScreen.style.setProperty('display', 'none', '!important');
            this.mainScreen.innerHTML = "";
            console.log("화면 공유 종료: 메인 섹션을 숨깁니다.");
        }else{
            // const videoBox = document.getElementById("container-" + peerId);
            // if(videoBox){
            //     const video = document.querySelector("video");
            //     if(video) video.srcObject = null;
            //     videoBox.remove();
            //     console.log(`✅ [${peerId}]의 일반 영상 박스가 제거되었습니다.`);
            // }

        }
        // 영상이 사라졌으니 하단 그리드 레이아웃 재정렬
        this.updateVideoGridLayout();
    }

    // 유저 퇴장시 처리되는 함수
    removePeer(peerId){
        console.log(`유저 퇴장 처리 (peerId : ${peerId} )`);

        const containers = document.querySelectorAll(`[data-peer-id="${peerId}"]`);
        
        containers.forEach(c => {
            if(c.parentElement && c.parentElement.id === "mainScreen"){
            this.mainScreen.style.display   = "none";
            this.mainScreen.innerHTML       = "";
            console.log("화면 메인 섹션 숨김 완료");
            }
            // 비디오 스트림 연결 해제
            const video     = c.querySelector("video");
            if(video){
            video.srcObject = null;
            }
            // 박스 전체 삭제
            c.remove();
            console.log(`✅ [${peerId}] 유저의 영상 박스가 제거되었습니다.`);
        });
    }
}
