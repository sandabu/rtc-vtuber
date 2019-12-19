# Getting Started

1. Put a vrm file in /resource
2. Change vrm path at index.js

```
loader.load(
  './resource/three-vrm-girl.vrm',
  ...
```

3. Copy weight files from [here](https://github.com/justadudewhohacks/face-api.js/tree/master/weights)
4. Create SkyWay API key. Visit [here](https://webrtc.ecl.ntt.com/)

5. Change API key at index.js

```
const API_KEY = '__YOUR_API_KEY__'
```

3. npm install and run serve

```
$ npm i
$ python -m http.server 8000 # or any built-in server
```

Access http://localhost:8000
