import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { VRM, VRMSchema } from '@pixiv/three-vrm'
import * as faceapi from 'face-api.js'
import Peer from 'skyway-js';

(async () => {
  const width = 1024
  const height = 768
  const scene = new THREE.Scene()
  const loader = new GLTFLoader()
  const camera = new THREE.PerspectiveCamera(30.0, width / height, 0.1, 20.0)
  const renderer = new THREE.WebGLRenderer()
  const light = new THREE.DirectionalLight(0xffffff, 1)
  const $video = document.getElementById('webcam-video')
  const $landmarkCanvas = document.getElementById('landmarks')
  const API_KEY = '__YOUR_API_KEY__'
  const isJoined = false
  let blinking = false
  let smiling = false
  let vrm
  let lipDist
  let headYawAngle
  let prevHeadYawAngle

  // three.js settings
  renderer.setClearColor(0xeeeeee)
  renderer.setSize(width, height)
  camera.position.set(0.0, 1.35, 0.8)
  light.position.set(0, 100, 30)
  scene.add(light)
  const $body = document.querySelector('body')
  const $avatarCanvas = renderer.domElement
  $avatarCanvas.id = 'avatar-canvas'
  $body.insertBefore($avatarCanvas, $body.firstChild)
  const gridHelper = new THREE.GridHelper(10, 10)
  scene.add(gridHelper)
  const axesHelper = new THREE.AxesHelper(5)
  scene.add(axesHelper)

  // face detecting
  $video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true })
  $video.play().then(async () => {
    // Load learned models
    await faceapi.nets.tinyFaceDetector.load('/weights')
    await faceapi.loadFaceLandmarkModel('/weights')
    await faceapi.loadFaceExpressionModel('/weights')
    const loop = async () => {
      if (!faceapi.nets.tinyFaceDetector.params) {
        return setTimeout(() => loop())
      }
      // Exampleを参考に設定
      const option = new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
      const result = await faceapi.detectSingleFace($video, option).withFaceLandmarks().withFaceExpressions()
      if (result) {
        // デバッグをしつつ決めた値をスレッショルドとする(表情筋が硬い場合は下げようね！)
        if (result.expressions.happy > 0.7) {
          smiling = true
        }
        // 頭部回転角度を鼻のベクトルに近似する
        // 68landmarksの定義から鼻のベクトルを求める
        const upperNose = result.landmarks.positions[27]
        const lowerNose = result.landmarks.positions[30]
        let noseVec = lowerNose.sub(upperNose)
        noseVec = new THREE.Vector2(noseVec.x, noseVec.y)
        // angle関数はx+方向を基準に角度を求めるため、π/2引いておき、逆回転のマイナスをかける
        headYawAngle = -(noseVec.angle() - (Math.PI / 2))
        // リップシンク
        // 68landmarksの定義から、口の垂直距離を測る
        const upperLip = result.landmarks.positions[51]
        const lowerLip = result.landmarks.positions[57]
        lipDist = lowerLip.y - upperLip.y
        // デバッグ用にcanvasに表示する
        const dims = faceapi.matchDimensions($landmarkCanvas, $video, true)
        const resizedResult = faceapi.resizeResults(result, dims)
        faceapi.draw.drawFaceLandmarks($landmarkCanvas, resizedResult)
      }
      setTimeout(() => loop())
    }
    loop()
  })

  // VRM Settings
  loader.load(
    './resource/three-vrm-girl.vrm',
    async (gltf) => {
      vrm = await VRM.from(gltf)
      scene.add(vrm.scene)
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Hips).rotation.y = Math.PI
    },
    (progress) => console.log('Loading model...', 100.0 * (progress.loaded / progress.total), '%'),
    (error) => console.error(error)
  )

  setInterval(() => {
    if (Math.random() < 0.15) {
      blinking = true
    }
  }, 1000)
  const clock = new THREE.Clock()
  const render = () => {
    if (vrm) {
      const deltaTime = clock.getDelta()
      let s = Math.sin(Math.PI * clock.elapsedTime)
      if (smiling) {
        s *= 2
        vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.A, 0)
        vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Joy, s)
        if (Math.abs(s) < 0.1) {
          smiling = false
          vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Joy, 0)
        }
      } else if (blinking) {
        s *= 5
        vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Blink, s)
        if (Math.abs(s) < 0.1) {
          blinking = false
          vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Blink, 0)
        }
      }
      // vrm.blendShapeProxy.setValue( 'a', 0.5 + 0.5 * s );
      if (lipDist && !smiling) {
        // 初期距離(30)を引いて、口を最大限に開けた時を最大値とした時を参考に割合を決める
        let lipRatio = (lipDist - 30) / 25
        if (lipRatio < 0) {
          lipRatio = 0
        } else if (lipRatio > 1) {
          lipRatio = 1
        }
        vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.A, lipRatio)
      }
      if (headYawAngle) {
        if (Math.abs(prevHeadYawAngle - headYawAngle) > 0.02) {
          // 変化を増幅させる
          const y = headYawAngle * 2.5
          if (Math.abs(y) < Math.PI / 2) {
            vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.y = y
          }
        }
        prevHeadYawAngle = headYawAngle
      }
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.LeftUpperArm).rotation.z = Math.PI / 3
      vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.RightUpperArm).rotation.z = -Math.PI / 3

      // update vrm
      vrm.update(deltaTime)
    }
    renderer.render(scene, camera)
    requestAnimationFrame(render)
  }
  render()
  // For Debug
  // document.addEventListener('keydown', e => {
  //   if (vrm) {
  //     switch (e.key) {
  //       case 'a':
  //         vrm.blendShapeProxy.setValue('a', 1.0)
  //         break
  //       case 's':
  //         vrm.blendShapeProxy.setValue('a', 0)
  //         break
  //       case 'w':
  //         vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Joy, 1.0)
  //         break
  //       case 'e':
  //         vrm.blendShapeProxy.setValue(VRMSchema.BlendShapePresetName.Joy, 0)
  //         break
  //       case 'x':
  //         vrm.humanoid.getBoneNode(VRMSchema.HumanoidBoneName.Head).rotation.y -= 0.1
  //         break
  //     }
  //   }
  // })

  // SkyWay(WebRTC)
  const peer = new Peer({
    key: API_KEY
  })
  peer.on('open', pid => {
    console.log(`PeerId: ${pid}`)
    document.getElementById('js-room-join-button').addEventListener('click', async () => {
      const roomName = document.getElementById('js-room-name-input').value.trim()
      if (isJoined) {
        return
      }
      if (roomName === '') {
        return console.warn('Input room name')
      }
      if (!vrm) {
        return console.warn("A VRM hasn't been loaded yet")
      }
      const $avatarCanvas = document.querySelector('#avatar-canvas')
      const stream = $avatarCanvas.captureStream(30)
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const audioTrack = audioStream.getAudioTracks()[0]
      stream.addTrack(audioTrack)
      const room = peer.joinRoom(roomName, {
        mode: 'sfu',
        stream
      })
      room.on('open', () => {
        console.log(`join: ${room.name}`)
        // your code
      })
    })
  })
})()
