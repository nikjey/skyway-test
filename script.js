// Your SkyWay credentials - replace these placeholders with your actual credentials
const appId = "e250003d-771a-4df4-b6f8-23a28a9c2206";
const secretKey = "MJYDIby+Sabohqi0gCRPJfX+nzVJB3Jk9Z/crnHCvWE=";

const {
  nowInSec,
  SkyWayAuthToken,
  SkyWayContext,
  SkyWayRoom,
  SkyWayStreamFactory,
  uuidV4,
} = skyway_room;

// Generate a SkyWay token
const token = new SkyWayAuthToken({
  jti: uuidV4(),
  iat: nowInSec(),
  exp: nowInSec() + 60 * 60 * 24, // Token expires after 24 hours
  scope: {
    app: {
      id: appId,
      turn: true,
      actions: ["read"],
      channels: [
        {
          id: "*",
          name: "*",
          actions: ["write"],
          members: [
            {
              id: "*",
              name: "*",
              actions: ["write"],
              publication: {
                actions: ["write"],
              },
              subscription: {
                actions: ["write"],
              },
            },
          ],
          sfuBots: [
            {
              actions: ["write"],
              forwardings: [
                {
                  actions: ["write"],
                },
              ],
            },
          ],
        },
      ],
    },
  },
}).encode(secretKey);

(async () => {
  // UI element references
  const localAudio = document.getElementById("local-audio");
  const localVideo = document.getElementById("local-video");
  const roomNameInput = document.getElementById("room-name");
  const joinButton = document.getElementById("join-button");
  const localMuteButton = document.getElementById("local-mute-buton");
  const leaveButton = document.getElementById("leave-button");
  const myId = document.getElementById("my-id");
  const remoteId = document.getElementById("remote-id");
  const remoteVideo = document.getElementById("remote-video");
  const remoteAudio = document.getElementById("remote-audio");
  const buttonArea = document.querySelector("#button-area");

  try {
    // Attempt to get local audio and video streams
    const { audio, video } =
      await SkyWayStreamFactory.createMicrophoneAudioAndCameraStream();
    audio.attach(localAudio);
    video.attach(localVideo);
  } catch (error) {
    console.error("Error accessing media devices:", error);
    alert(
      "Could not access the camera or microphone. Please check device connections and permissions."
    );
    return; // Exit if we can't get the media streams
  }

  // Create SkyWay context with the generated token
  const context = await SkyWayContext.Create(token);

  joinButton.onclick = async () => {
    if (roomNameInput.value === "") return;

    // Create or join a SkyWay room
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: "sfu",
      name: roomNameInput.value,
    });

    let me = await room.join();
    myId.textContent = me.id;

    // Publish local streams to the room
    const localAudioPublication = await me.publish(audio);
    const localVideoPublication = await me.publish(video, {
      encodings: [
        { maxBitrate: 80000, id: "low" },
        { maxBitrate: 500000, id: "middle" },
        { maxBitrate: 5000000, id: "high" },
      ],
    });

    // Subscribe to remote streams
    const subscribeAndAttach = async (publication) => {
      if (publication.publisher.id === me.id) return; // Skip own publications

      remoteId.textContent = publication.publisher.id; // Display remote ID

      const { stream } = await me.subscribe(publication.id);
      if (stream.track.kind === "video") {
        stream.attach(remoteVideo);
      } else if (stream.track.kind === "audio") {
        stream.attach(remoteAudio);
      }
    };

    room.publications.forEach(subscribeAndAttach);
    room.onStreamPublished.add((e) => subscribeAndAttach(e.publication));

    // Mute/unmute local streams
    localMuteButton.onclick = async () => {
      if (localAudioPublication.enabled && localVideoPublication.enabled) {
        await localAudioPublication.disable();
        await localVideoPublication.disable();
        localMuteButton.textContent = "映像・音声 ON";
      } else {
        await localAudioPublication.enable();
        await localVideoPublication.enable();
        localMuteButton.textContent = "映像・音声OFF";
      }
    };

    // Leave the room and clean up
    leaveButton.onclick = async () => {
      await me.leave();
      await room.close();
      closeRoomUI();
    };

    const closeRoomUI = () => {
      // Reset the UI
      buttonArea.innerHTML = "";
      remoteId.textContent = "";
      myId.textContent = "";
      localMuteButton.disabled = true;
      leaveButton.disabled = true;
      joinButton.disabled = false; // Enable the join button again for new sessions
    };

    // Disable the join button once joined to prevent multiple sessions
    joinButton.disabled = true;
    leaveButton.disabled = false; // Enable the leave button
    localMuteButton.disabled = false; // Enable the mute button once joined

    // Setup to handle remote streams published after joining
    room.onStreamPublished.add((event) => {
      subscribeAndAttach(event.publication);
    });

    // Handle the event when a member leaves the room
    room.onMemberLeft.add(() => {
      // You may want to add additional logic here for handling when other members leave
    });
  };
})();
